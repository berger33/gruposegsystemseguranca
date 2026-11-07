#!/usr/bin/env node
/**
 * Fatia 06B — mapa reproduzível de equivalência de cobertura da CI.
 *
 * O que este script FAZ: lê `package.json` (scripts), `.github/workflows/*.yml`
 * (comandos realmente executados), `scripts/*.mjs` (runners) e `tests/*.mjs`
 * (arquivos de teste) e responde, com fonte legível por máquina:
 *
 *   passo de workflow → comando → script npm → runner → arquivo de teste
 *
 * e, para cada arquivo, quantos casos estão DECLARADOS (`test(`) e qual piso
 * TAP o runner audita (`MINIMUM_CASES`).
 *
 * O que este script NÃO FAZ: não executa jornada, não mede tempo, não promove
 * requisito, não registra aceite humano e não transforma "arquivo referenciado"
 * em "cenário aprovado". Contagem de declarações não é contagem de aprovações:
 * quem prova execução é o TAP de cada gate.
 *
 * Regras que o mapa impõe (falham com exit 1):
 *   1. comando de workflow que aponta para script npm, runner ou arquivo de
 *      teste inexistente (comando pendurado);
 *   2. indireção que o parser não consegue resolver (`npm run "$X"` sem laço
 *      `for X in …` correspondente) — falha fechada em vez de presumir órfão;
 *   3. script de gate (`test:*`/`qa:*`/`reaudit:*`) cujos alvos não são
 *      alcançados por nenhum workflow — "gate órfão" —, salvo allowlist
 *      declarada com motivo;
 *   4. arquivo de teste de topo de `tests/` inalcançável, mesma exceção;
 *   5. entrada de allowlist obsoleta (o alvo passou a ser alcançado);
 *   6. `--check`: divergência entre o mapa versionado e o código atual.
 *
 * Deliberadamente FORA da falha: scripts locais de operação (`dev`, `start`,
 * `db:*`, `demo:local:*`, `package:*`, `build:preview`) — não são gates de CI e
 * classificá-los como órfãos seria confundir ausência literal com orfandade.
 * Também fora: script de gate cujos alvos JÁ são alcançados por outro caminho
 * (alias de conveniência), que aparece como `alias` no relatório.
 *
 * Uso:
 *   node scripts/qa-ci-coverage-map.mjs           # regenera CSV + relatório
 *   node scripts/qa-ci-coverage-map.mjs --check   # não escreve; exit 1 se divergir ou houver órfão
 *   node scripts/qa-ci-coverage-map.mjs --json    # resumo legível por máquina no stdout
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALLOWLIST } from './ci/coverage-allowlist.mjs';

export { ALLOWLIST };

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const CSV_FILE = 'docs/CI-MAPA-COBERTURA-2026-11-07.csv';
export const REPORT_FILE = 'docs/CI-EQUIVALENCIA-COBERTURA-2026-11-07.md';

/**
 * A allowlist (alvos sem execução automática, com motivo) vive em
 * `scripts/ci/coverage-allowlist.mjs` — ver o cabeçalho daquele arquivo para o
 * motivo de não ficar aqui.
 */

/** Prefixos de script que são operação local, nunca gate de CI. */
const LOCAL_PREFIXES = ['dev', 'start', 'db:', 'demo:local:', 'package:', 'build:preview'];
/** Script que, por convenção do repositório, existe para provar algo. */
const GATE_SCRIPT = /^(?:test|qa|reaudit)(?::|$)/;
const NPM_SUBCOMMANDS = new Set(['ci', 'audit', 'install', 'i', 'exec', 'ls', 'run', 'run-script', '--version']);
const DECLARED_TEST = /^\s*test(?:\.(?:skip|todo|only|fixme))?\s*\(/gm;
const TEST_FILE_REF = /tests\/[A-Za-z0-9._/-]+\.mjs/g;

export const isLocalScript = (name) => LOCAL_PREFIXES.some((prefix) => name === prefix || name.startsWith(prefix));

/** Casos DECLARADOS no arquivo (declaração `test(`, não execução aprovada). */
export function declaredCases(source) {
  return [...source.matchAll(DECLARED_TEST)].length;
}

/**
 * Extrai comandos de um passo de workflow (shell). Cobre o que os 60 workflows
 * usam: `npm run x`, `npm test`, `node --test <arquivos>`, `node scripts/x.mjs`
 * e o laço `for gate in …; do npm run "$gate"; done` que a fatia 05AI adotou.
 */
export function extractCommands(text) {
  const commands = [];
  const flat = text.replace(/\\\r?\n/g, ' ');
  let rest = flat;
  const loops = [...flat.matchAll(/for\s+([A-Za-z_]\w*)\s+in\s+([\s\S]*?);?\s*do\b([\s\S]*?)\bdone\b/g)];
  for (const [whole, variable, list, body] of loops) {
    const call = new RegExp(`npm\\s+run\\s+["']?\\$\\{?${variable}\\}?["']?`);
    if (call.test(body)) {
      const values = list.split(/\s+/).filter((value) => value && !value.startsWith('#'));
      for (const value of values) commands.push({ kind: 'npm', target: value, via: `loop:${variable}` });
    }
    rest = rest.replace(whole, ' ');
  }
  for (const rawLine of rest.split(/\n|&&|\|\||;/)) {
    const line = rawLine.replace(/(^|\s)#.*$/, '').trim();
    if (!line) continue;
    if (/npm\s+run\s+["']?\$/.test(line)) {
      commands.push({ kind: 'unresolved', target: line, via: 'indirecao' });
    }
    for (const match of line.matchAll(/\bnpm\s+(?:run\s+)?["']?([A-Za-z0-9:_@./-]+)["']?/g)) {
      const name = match[1];
      if (NPM_SUBCOMMANDS.has(name) || name.startsWith('-')) continue;
      commands.push({ kind: 'npm', target: name, via: 'direct' });
    }
    const testCall = line.match(/\bnode\s+--test\b(.*)$/);
    if (testCall) {
      const files = testCall[1]
        .split(/\s+/)
        .filter((token) => token && !token.startsWith('-') && token.endsWith('.mjs'));
      commands.push({ kind: 'node-test', target: files.join(' ') || '(sem arquivo nomeado)', files, via: 'direct' });
    } else {
      // `node tests/x.mjs` sem `--test` também executa o arquivo com o runner do
      // Node (é a forma usada por `test:rag`); ignorar isso marcaria a jornada
      // como órfã só porque a bandeira não apareceu na linha.
      const direct = line.match(/\bnode\s+(?:--?[A-Za-z0-9=:._/-]+\s+)*(tests\/[A-Za-z0-9._/-]+\.mjs)/);
      if (direct) commands.push({ kind: 'node-test', target: direct[1], files: [direct[1]], via: 'direct' });
    }
    for (const match of line.matchAll(/\bnode\s+(?:--?[A-Za-z0-9=:._/-]+\s+)*(scripts\/[A-Za-z0-9._/-]+\.mjs)/g)) {
      commands.push({ kind: 'runner', target: match[1], via: 'direct' });
    }
  }
  return commands;
}

/**
 * Parser de YAML suficiente para os workflows deste repositório: jobs de
 * primeiro nível e itens de `steps:` com `name:` e `run:` (bloco `|`/`>` ou
 * linha única). Chaves desconhecidas são ignoradas — o alvo do mapa é o
 * comando executado, não o workflow inteiro.
 */
export function parseWorkflow(source, file = '(memory)') {
  const lines = source.split('\n');
  const jobs = [];
  let inJobs = false;
  let job = null;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^jobs:\s*$/.test(line)) { inJobs = true; continue; }
    if (!inJobs) continue;
    if (/^\S/.test(line)) { inJobs = false; continue; }
    const jobKey = line.match(/^ {2}([A-Za-z0-9_][\w-]*):\s*$/);
    if (jobKey) {
      job = { name: jobKey[1], steps: [] };
      jobs.push(job);
      continue;
    }
    if (!job || !/^\s+steps:\s*$/.test(line)) continue;

    // Recorte do bloco `steps:`: até a primeira linha não vazia com indentação
    // menor que a do primeiro item. Comentários entre passos fazem parte do
    // recorte (não encerram nada) — foi o que o primeiro parser errava.
    let first = index + 1;
    while (first < lines.length && (lines[first].trim() === '' || /^\s*#/.test(lines[first]))) first += 1;
    if (first >= lines.length || !/^\s*- /.test(lines[first])) continue;
    const stepIndent = lines[first].match(/^\s*/)[0].length;
    let last = first;
    while (last < lines.length) {
      const candidate = lines[last];
      if (candidate.trim() !== '' && !/^\s*#/.test(candidate) && candidate.match(/^\s*/)[0].length < stepIndent) break;
      last += 1;
    }
    const block = lines.slice(first, last);
    const items = [];
    for (const entry of block) {
      if (new RegExp(`^ {${stepIndent}}- `).test(entry)) items.push([entry]);
      else if (items.length) items[items.length - 1].push(entry);
    }
    for (const item of items) {
      const body = item.map((entry, position) => (position === 0
        ? entry.slice(stepIndent + 2)
        : entry.slice(Math.min(stepIndent + 2, entry.match(/^\s*/)[0].length))));
      const step = { name: '', commands: [] };
      const nameLine = body.find((entry) => /^\s*name:\s*\S/.test(entry));
      if (nameLine) step.name = nameLine.replace(/^\s*name:\s*/, '').trim().replace(/^['"]|['"]$/g, '');
      const runAt = body.findIndex((entry) => /^\s*run:\s*/.test(entry));
      if (runAt >= 0) {
        let payload = body[runAt].replace(/^\s*run:\s*/, '');
        const runIndent = body[runAt].match(/^\s*/)[0].length;
        if (/^[|>][+-]?$/.test(payload.trim())) {
          const blockLines = [];
          for (let next = runAt + 1; next < body.length; next += 1) {
            if (body[next].trim() !== '' && body[next].match(/^\s*/)[0].length <= runIndent) break;
            blockLines.push(body[next]);
          }
          const indents = blockLines.filter((entry) => entry.trim()).map((entry) => entry.match(/^\s*/)[0].length);
          const cut = indents.length ? Math.min(...indents) : 0;
          payload = blockLines.map((entry) => entry.slice(cut)).join('\n');
        } else {
          payload = payload.trim().replace(/^['"]|['"]$/g, '');
        }
        step.commands = extractCommands(payload);
      }
      if (step.commands.length || step.name) job.steps.push(step);
    }
    index = last - 1;
  }
  return { file, jobs };
}

/** Metadados de runner: arquivos de teste citados e piso TAP auditado. */
export function runnerInfo(source) {
  // Comentário não executa nada: citar `tests/x.mjs` numa explicação não pode
  // virar "este runner roda essa jornada" (falso positivo medido na fatia).
  // Blocos `/* */` e linhas iniciadas por `//` são removidos antes da leitura;
  // caminhos montados por template string continuam fora do alcance — declarado
  // nos limites do relatório.
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .filter((line) => !/^\s*\/\//.test(line))
    .join('\n');
  const tests = [...new Set([...code.matchAll(TEST_FILE_REF)].map((match) => match[0]))];
  // Dois formatos de piso no repositório: `MINIMUM_CASES = n` (auditor TAP das
  // rotas públicas) e `minimum: n` / `minimum: cond ? a : b` (gates auditados na
  // 06B). Piso condicional é reportado pelo MENOR valor: o mapa não escolhe
  // caminho por conta própria.
  const floors = [...code.matchAll(/MINIMUM_CASES\s*=\s*(\d+)/g)].map((match) => Number(match[1]));
  for (const match of code.matchAll(/minimum:\s*([^,)\n]{1,120})/g)) {
    for (const value of match[1].matchAll(/\b(\d+)\b/g)) floors.push(Number(value[1]));
  }
  const floor = floors.length ? Math.min(...floors) : null;
  return { tests, floor };
}

/**
 * Constrói o mapa. `root` é injetável para que o teste focal rode contra um
 * repositório descartável em vez de depender da árvore real.
 */
export async function buildCoverageMap({ root = ROOT, allowlist = ALLOWLIST } = {}) {
  const read = (relative) => readFile(path.join(root, relative), 'utf8');
  const exists = (relative) => existsSync(path.join(root, relative));
  const pkg = JSON.parse(await read('package.json'));
  const scripts = pkg.scripts || {};
  const workflowFiles = (await readdir(path.join(root, '.github', 'workflows')))
    .filter((name) => /\.ya?ml$/.test(name))
    .sort();
  const testFiles = (await readdir(path.join(root, 'tests')))
    .filter((name) => name.endsWith('.mjs'))
    .sort()
    .map((name) => `tests/${name}`);
  const scriptFiles = (await readdir(path.join(root, 'scripts')))
    .filter((name) => name.endsWith('.mjs'))
    .sort()
    .map((name) => `scripts/${name}`);

  const reachable = { npm: new Set(), runners: new Set(), tests: new Set() };
  const dangling = [];
  const danglingKeys = new Set();
  const addDangling = (origin, kind, target) => {
    const key = `${origin}|${kind}|${target}`;
    if (danglingKeys.has(key)) return;
    danglingKeys.add(key);
    dangling.push({ origin, kind, target });
  };
  const unresolved = [];
  const rows = [];
  const testCaseCache = new Map();
  const runnerCache = new Map();

  async function testMeta(relative) {
    if (!testCaseCache.has(relative)) {
      if (!exists(relative)) { testCaseCache.set(relative, null); return null; }
      testCaseCache.set(relative, declaredCases(await read(relative)));
    }
    return testCaseCache.get(relative);
  }
  async function runnerMeta(relative) {
    if (!runnerCache.has(relative)) {
      if (!exists(relative)) { runnerCache.set(relative, null); return null; }
      runnerCache.set(relative, runnerInfo(await read(relative)));
    }
    return runnerCache.get(relative);
  }

  async function visitRunner(relative, origin) {
    const meta = await runnerMeta(relative);
    if (!meta) { addDangling(origin, 'runner', relative); return null; }
    reachable.runners.add(relative);
    for (const test of meta.tests) {
      if (await testMeta(test) === null) addDangling(relative, 'teste', test);
      else reachable.tests.add(test);
    }
    return meta;
  }

  async function visitScript(name, origin) {
    if (!Object.hasOwn(scripts, name)) { addDangling(origin, 'script', name); return null; }
    if (reachable.npm.has(name)) return null;
    reachable.npm.add(name);
    for (const command of extractCommands(scripts[name])) {
      if (command.kind === 'npm') await visitScript(command.target, `package.json#${name}`);
      else if (command.kind === 'runner') await visitRunner(command.target, `package.json#${name}`);
      else if (command.kind === 'node-test') {
        for (const test of command.files) {
          if (await testMeta(test) === null) addDangling(`package.json#${name}`, 'teste', test);
          else reachable.tests.add(test);
        }
      } else if (command.kind === 'unresolved') {
        unresolved.push({ origin: `package.json#${name}`, command: command.target });
      }
    }
    return null;
  }

  const executed = [];
  for (const file of workflowFiles) {
    const workflow = parseWorkflow(await read(`.github/workflows/${file}`), file);
    // Workflow sem `jobs:` legível é falha fechada: o mapa não pode "não achar"
    // comandos e ainda assim declarar cobertura.
    if (!workflow.jobs.length) unresolved.push({ origin: `.github/workflows/${file}`, command: '(nenhum job reconhecido)' });
    for (const job of workflow.jobs) {
      for (const [stepIndex, step] of job.steps.entries()) {
        for (const command of step.commands) {
          const row = {
            workflow: file,
            job: job.name,
            step: step.name || `passo ${stepIndex + 1}`,
            kind: command.kind,
            target: command.target,
            via: command.via,
            files: [],
            cases: 0,
            floor: null,
          };
          if (command.kind === 'npm') {
            await visitScript(command.target, `.github/workflows/${file}`);
            const body = scripts[command.target];
            if (body) {
              for (const inner of extractCommands(body)) {
                if (inner.kind === 'node-test') row.files.push(...inner.files);
                if (inner.kind === 'runner') {
                  const meta = await runnerMeta(inner.target);
                  if (meta) { row.files.push(...meta.tests); if (meta.floor) row.floor = Math.max(row.floor ?? 0, meta.floor); }
                }
              }
            }
          } else if (command.kind === 'node-test') {
            for (const test of command.files) {
              if (await testMeta(test) === null) addDangling(`.github/workflows/${file}`, 'teste', test);
              else reachable.tests.add(test);
            }
            row.files.push(...command.files);
          } else if (command.kind === 'runner') {
            const meta = await visitRunner(command.target, `.github/workflows/${file}`);
            if (meta) { row.files.push(...meta.tests); row.floor = meta.floor; }
          } else if (command.kind === 'unresolved') {
            unresolved.push({ origin: `.github/workflows/${file} › ${step.name || 'passo'}`, command: command.target });
          }
          row.files = [...new Set(row.files)];
          for (const file2 of row.files) row.cases += (await testMeta(file2)) ?? 0;
          executed.push(row);
          rows.push(row);
        }
      }
    }
  }

  // Órfãos declarados como gate: um script `test:*`/`qa:*` só é aceito se ao
  // menos um de seus alvos for alcançado por workflow (alias) ou se estiver
  // na allowlist com motivo.
  const gateScripts = Object.keys(scripts).filter((name) => GATE_SCRIPT.test(name) && !isLocalScript(name));
  const allowed = new Map(allowlist.map((entry) => [entry.alvo, entry]));
  // Um gate quebrado é defeito mesmo sem workflow: valida os alvos de TODO
  // script de gate declarado, alcançado ou não (dedupe evita repetir linha).
  for (const name of gateScripts) {
    for (const command of extractCommands(scripts[name] ?? '')) {
      if (command.kind === 'node-test') {
        for (const test of command.files) if (!exists(test)) addDangling(`package.json#${name}`, 'teste', test);
      } else if (command.kind === 'runner') {
        const meta = await runnerMeta(command.target);
        if (!meta) addDangling(`package.json#${name}`, 'runner', command.target);
        else for (const test of meta.tests) if (!exists(test)) addDangling(command.target, 'teste', test);
      } else if (command.kind === 'npm' && !Object.hasOwn(scripts, command.target)) {
        addDangling(`package.json#${name}`, 'script', command.target);
      }
    }
  }

  const orphanScripts = [];
  const aliasScripts = [];
  const staleAllowlist = [];
  for (const name of gateScripts) {
    if (reachable.npm.has(name)) continue;
    const targets = { tests: new Set(), runners: new Set() };
    const seen = new Set([name]);
    let queue = [name];
    while (queue.length) {
      const current = queue.pop();
      for (const command of extractCommands(scripts[current] ?? '')) {
        if (command.kind === 'npm' && !seen.has(command.target) && Object.hasOwn(scripts, command.target)) {
          seen.add(command.target);
          queue.push(command.target);
        }
        if (command.kind === 'node-test') command.files.forEach((test) => targets.tests.add(test));
        if (command.kind === 'runner') targets.runners.add(command.target);
      }
    }
    // Um alvo de teste na allowlist conta como coberto: o script que o invoca
    // continua sendo alias de conveniência, e a ausência fica declarada (com
    // motivo) em vez de contada duas vezes como órfã.
    const covered = [...targets.tests].every((test) => reachable.tests.has(test) || allowed.has(test))
      && [...targets.runners].every((runner) => reachable.runners.has(runner) || allowed.has(runner));
    if (covered && (targets.tests.size || targets.runners.size)) { aliasScripts.push(name); continue; }
    if (allowed.has(name)) continue;
    orphanScripts.push({ name, tests: [...targets.tests], runners: [...targets.runners] });
  }
  for (const entry of allowlist) {
    // Entrada obsoleta = o alvo passou a ser alcançado por algum workflow (ou
    // virou script local). A allowlist precisa encolher quando a dívida é paga.
    const coveredNow = (entry.tipo === 'script' && reachable.npm.has(entry.alvo))
      || (entry.tipo === 'teste' && reachable.tests.has(entry.alvo))
      || (entry.tipo === 'runner' && reachable.runners.has(entry.alvo));
    if (coveredNow) staleAllowlist.push(entry.alvo);
  }

  const orphanTests = testFiles.filter((file) => !reachable.tests.has(file) && !allowed.has(file));
  // Runner só é órfão se for DECLARADO como gate por algum script `test:*`/`qa:*`
  // e nenhum workflow o executar. `scripts/qa-*.mjs` sem essa declaração é
  // biblioteca usada por import (guardas, bundles sintéticos, providers locais)
  // ou utilitário de operação — entra em `foraDoMapa`, não em falha.
  const declaredGateScripts = Object.keys(scripts)
    .filter((name) => GATE_SCRIPT.test(name) && !isLocalScript(name));
  const declaredRunners = new Set();
  const declaredNpm = new Set();
  const queue = [...declaredGateScripts];
  const seenGate = new Set();
  while (queue.length) {
    const current = queue.pop();
    if (seenGate.has(current)) continue;
    seenGate.add(current);
    declaredNpm.add(current);
    for (const command of extractCommands(scripts[current] ?? '')) {
      if (command.kind === 'npm' && Object.hasOwn(scripts, command.target)) queue.push(command.target);
      if (command.kind === 'runner') declaredRunners.add(command.target);
    }
  }
  const orphanRunners = [...declaredRunners]
    .filter((runner) => !reachable.runners.has(runner) && !allowed.has(runner))
    .sort();
  const referencedSources = await Promise.all([...reachable.tests, ...reachable.runners]
    .map(async (relative) => (exists(relative) ? read(relative) : '')));
  const referencedText = referencedSources.join('\n');
  const foraDoMapa = scriptFiles.filter((file) => !reachable.runners.has(file)
    && !referencedText.includes(path.basename(file))
    && ![...declaredRunners].includes(file)
    && !allowed.has(file));

  const counts = {
    workflows: workflowFiles.length,
    jobs: executed.length ? new Set(executed.map((row) => `${row.workflow}#${row.job}`)).size : 0,
    steps: new Set(executed.map((row) => `${row.workflow}#${row.job}#${row.step}`)).size,
    commands: executed.length,
    npmScripts: Object.keys(scripts).length,
    gateScripts: gateScripts.length,
    runners: scriptFiles.length,
    tests: testFiles.length,
    reachableScripts: reachable.npm.size,
    reachableRunners: reachable.runners.size,
    reachableTests: reachable.tests.size,
    declaredCases: testFiles.reduce((total, file) => total + (testCaseCache.get(file) ?? 0), 0),
    filesScanned: (await readdir(path.join(root, '.github', 'workflows'))).length,
  };

  const failures = {
    dangling,
    unresolved,
    orphanScripts,
    orphanTests,
    orphanRunners,
    staleAllowlist,
  };
  return { rows, counts, failures, aliasScripts, reachable, allowlist, foraDoMapa, declaredGateScripts: [...declaredNpm] };
}

const csvCell = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;

export function renderCsv(map) {
  const header = ['workflow', 'job', 'passo', 'tipo', 'alvo', 'via', 'arquivos', 'casos_declarados', 'piso_tap'];
  const lines = [header.map(csvCell).join(',')];
  for (const row of map.rows) {
    lines.push([
      row.workflow, row.job, row.step, row.kind, row.target, row.via,
      row.files.join(' '), row.cases, row.floor ?? '',
    ].map(csvCell).join(','));
  }
  return `${lines.join('\n')}\n`;
}

export function renderReport(map) {
  const { counts, failures } = map;
  const byWorkflow = new Map();
  for (const row of map.rows) {
    const entry = byWorkflow.get(row.workflow) ?? { commands: 0, gates: 0, tests: new Set() };
    entry.commands += 1;
    if (row.kind === 'npm' || row.kind === 'runner') entry.gates += 1;
    row.files.forEach((file) => entry.tests.add(file));
    byWorkflow.set(row.workflow, entry);
  }
  const lines = [];
  lines.push('# Equivalência de cobertura da CI — mapa reproduzível (fatia 06B)');
  lines.push('');
  lines.push('**Gerado por:** `node scripts/qa-ci-coverage-map.mjs` · **Data da reconciliação:** 07/11/2026 · **Não é aceite humano, não é UAT e não substitui o TAP de nenhum gate.**');
  lines.push('');
  lines.push('## Como ler');
  lines.push('');
  lines.push('Cada linha do CSV é um comando realmente executado por um passo de workflow: `tipo` diz se é `npm` (script do `package.json`), `node-test` (arquivos nomeados direto no passo) ou `runner` (`node scripts/*.mjs`). A coluna `arquivos` lista os testes alcançados por aquele comando, `casos_declarados` soma as declarações `test(` desses arquivos e `piso_tap` mostra o piso que o runner audita (`MINIMUM_CASES` ou `minimum: …`), quando existe — piso condicional aparece pelo menor valor, porque o mapa não escolhe caminho por conta própria.');
  lines.push('');
  lines.push('`casos_declarados` é limite superior do que o arquivo declara, **não** prova de execução: um filtro de nome executado por um runner reduz o que roda, e quem mede isso é o TAP auditado na fatia 06A.');
  lines.push('');
  lines.push('## Contagens');
  lines.push('');
  lines.push('| Medida | Valor |');
  lines.push('|---|---:|');
  lines.push(`| Workflows lidos | ${counts.workflows} |`);
  lines.push(`| Jobs com comando | ${counts.jobs} |`);
  lines.push(`| Passos com comando | ${counts.steps} |`);
  lines.push(`| Comandos mapeados | ${counts.commands} |`);
  lines.push(`| Scripts npm no manifest | ${counts.npmScripts} |`);
  lines.push(`| Scripts de gate (\`test:*\`/\`qa:*\`/\`reaudit:*\`) | ${counts.gateScripts} |`);
  lines.push(`| Scripts npm alcançados | ${counts.reachableScripts} |`);
  lines.push(`| Runners alcançados | ${counts.reachableRunners} de ${counts.runners} arquivos `.trimEnd() + ' |');
  lines.push(`| Arquivos de teste alcançados | ${counts.reachableTests} de ${counts.tests} |`);
  lines.push(`| Casos declarados nos arquivos de teste | ${counts.declaredCases} |`);
  lines.push('');
  lines.push('## Por workflow');
  lines.push('');
  lines.push('| Workflow | Comandos | Gates/runners | Arquivos de teste |');
  lines.push('|---|---:|---:|---:|');
  for (const [file, entry] of [...byWorkflow.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    lines.push(`| \`${file}\` | ${entry.commands} | ${entry.gates} | ${entry.tests.size} |`);
  }
  lines.push('');
  lines.push('## Pendências que reprovam o mapa');
  lines.push('');
  const pending = [];
  for (const item of failures.dangling) pending.push(`comando pendurado (${item.kind} inexistente) em ${item.origin}: \`${item.target}\``);
  for (const item of failures.unresolved) pending.push(`indireção não resolvida em ${item.origin}: \`${item.command}\``);
  for (const item of failures.orphanScripts) pending.push(`gate órfão sem workflow: \`${item.name}\``);
  for (const item of failures.orphanTests) pending.push(`arquivo de teste inalcançável: \`${item}\``);
  for (const item of failures.orphanRunners) pending.push(`runner inalcançável: \`${item}\``);
  for (const item of failures.staleAllowlist) pending.push(`allowlist obsoleta (já alcançado): \`${item}\``);
  if (pending.length === 0) lines.push('Nenhuma. Todo gate declarado tem caminho de execução e todo arquivo de teste é alcançado ou está na allowlist com motivo.');
  else for (const entry of pending) lines.push(`- ${entry}`);
  lines.push('');
  lines.push('## Allowlist declarada (sem execução automática)');
  lines.push('');
  lines.push('| Alvo | Tipo | Motivo |');
  lines.push('|---|---|---|');
  for (const entry of map.allowlist) lines.push(`| \`${entry.alvo}\` | ${entry.tipo} | ${entry.motivo} |`);
  lines.push('');
  lines.push('## Alias de conveniência (alvos já alcançados por outro caminho)');
  lines.push('');
  if (map.aliasScripts.length === 0) lines.push('Nenhum.');
  else lines.push(map.aliasScripts.map((name) => `\`${name}\``).join(' · '));
  lines.push('');
  lines.push('## Scripts fora do mapa (nem executados por workflow, nem citados por caminho alcançado)');
  lines.push('');
  lines.push('Não reprovam por si: são utilitários de captura, paleta, inventário ou demonstração local, normalmente acionados à mão. Ficam listados para que a ausência seja **visível** em vez de silenciosa.');
  lines.push('');
  if (!map.foraDoMapa || map.foraDoMapa.length === 0) lines.push('Nenhum.');
  else for (const file of map.foraDoMapa) lines.push(`- \`${file}\``);
  lines.push('');
  lines.push('## Limites deste mapa');
  lines.push('');
  lines.push('- Não executa nada: comando presente no workflow não é comando aprovado, e a execução remota do GitHub Actions não foi observada nesta fatia.');
  lines.push('- Filtros por nome (`--test-name-pattern`) e guardas de ambiente reduzem o que roda dentro de um arquivo; o mapa não tenta adivinhar a seleção — o piso TAP do runner é que a audita.');
  lines.push('- Caminhos montados dinamicamente por template string em um runner não aparecem como referência literal e, por isso, não entram na contagem de arquivos daquele runner.');
  lines.push('- Workflows acionados só por `workflow_dispatch` contam como caminho de execução automática apenas quando o próprio workflow o declara; o mapa lê o arquivo, não o histórico de execuções.');
  lines.push('- Nada aqui cobre Windows, UAT, aceite humano, WCAG integral ou operação real.');
  return `${lines.join('\n')}\n`;
}

async function main() {
  const map = await buildCoverageMap();
  const csv = renderCsv(map);
  const report = renderReport(map);
  const failures = Object.entries(map.failures).filter(([, list]) => list.length > 0);

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ counts: map.counts, failures: map.failures, alias: map.aliasScripts }, null, 2));
  }
  if (process.argv.includes('--check')) {
    const problems = [];
    for (const [file, expected] of [[CSV_FILE, csv], [REPORT_FILE, report]]) {
      const actual = existsSync(path.join(ROOT, file)) ? await readFile(path.join(ROOT, file), 'utf8') : null;
      if (actual === null) problems.push(`${file}: ausente`);
      else if (actual !== expected) problems.push(`${file}: desatualizado`);
    }
    for (const [name, list] of failures) for (const item of list) problems.push(`${name}: ${JSON.stringify(item)}`);
    if (problems.length) {
      console.error(`FALHOU: mapa de cobertura da CI com ${problems.length} pendência(s).`);
      for (const problem of problems) console.error(`  - ${problem}`);
      process.exitCode = 1;
      return;
    }
    console.log(`OK: ${CSV_FILE} e ${REPORT_FILE} conferem; ${map.counts.commands} comandos, ${map.counts.reachableTests}/${map.counts.tests} arquivos de teste alcançados.`);
    return;
  }

  await writeFile(path.join(ROOT, CSV_FILE), csv, 'utf8');
  await writeFile(path.join(ROOT, REPORT_FILE), report, 'utf8');
  console.log(`Mapa gravado: ${CSV_FILE} (${map.rows.length} linhas) e ${REPORT_FILE}.`);
  console.log(`Workflows ${map.counts.workflows}; comandos ${map.counts.commands}; gates ${map.counts.gateScripts}; testes ${map.counts.reachableTests}/${map.counts.tests}.`);
  if (failures.length) {
    for (const [name, list] of failures) {
      console.error(`PENDÊNCIA ${name}: ${list.length}`);
      for (const item of list) console.error(`  - ${typeof item === 'string' ? item : JSON.stringify(item)}`);
    }
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
