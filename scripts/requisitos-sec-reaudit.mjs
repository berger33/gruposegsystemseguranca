#!/usr/bin/env node
// Reauditoria técnica da família SEC (15 IDs da matriz de 222).
//
// Diferente de `requisitos-222-inventory.mjs` (que conta MENÇÕES literais de
// ID), este gerador exige ÂNCORAS DE PROVA: um padrão de asserção executável
// dentro de um arquivo de teste/gate conhecido, mais o gate que o executa.
// Ele NÃO fabrica aceite humano: `aceite_humano` permanece `nao_registrado`
// para todos os IDs. O que ele produz é um mapa verificável de "qual código
// prova o quê" e, principalmente, ONDE a prova ainda falta.
//
// Uso: node scripts/requisitos-sec-reaudit.mjs [--check]
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const CHECK = process.argv.includes('--check');
const read = f => readFile(path.join(root, f), 'utf8');
const sha = s => createHash('sha256').update(s).digest('hex');

// Cada âncora: { arquivo, padrao (regex sobre o conteúdo), oQueProva }.
// `gate` é o comando/arquivo que executa a asserção de verdade.
const REQUISITOS = [
  {
    id: 'SEC-01', requisito: 'Inventariar rotas, APIs, tabelas, jobs, permissões e documentação',
    ancora: [
      { arquivo: 'scripts/ux-pro-00-inventory.mjs', padrao: /process\.argv\.includes\('--check'\)/, prova: 'inventário de rotas com modo de verificação' },
      { arquivo: 'scripts/requisitos-222-inventory.mjs', padrao: /porClasseEvidencia/, prova: 'inventário de 222 requisitos com classe de evidência' },
    ],
    gate: 'scripts/qa-wave0-static.mjs',
  },
  {
    id: 'SEC-02', requisito: 'Corrigir verificações de escopo para negar por padrão em qualquer erro',
    ancora: [
      { arquivo: 'tests/staff-auth.integration.test.mjs', padrao: /endpoints administrativos negam sem sessão/, prova: 'amostra ampla de endpoints nega sem sessão' },
      { arquivo: 'tests/client-space-fail-closed.test.mjs', padrao: /test\(/, prova: 'fail-closed de escopo do espaço do cliente' },
    ],
    gate: 'scripts/qa-staff-auth-postgres.mjs',
  },
  {
    id: 'SEC-03', requisito: 'Associar documentos a conta/unidade/contrato/classificação e autorização uniforme',
    ancora: [
      { arquivo: 'tests/cli-v2.integration.test.mjs', padrao: /legacy client scope and audit on PG/, prova: 'escopo legado de cliente auditado em PostgreSQL' },
      { arquivo: 'tests/cli13-portal-access-modes.test.mjs', padrao: /vínculo conta\/documento é verificado no servidor/, prova: 'vínculo conta/documento verificado no servidor' },
    ],
    gate: 'scripts/qa-cli-v2-postgres.mjs',
  },
  {
    id: 'SEC-04', requisito: 'Login individual de staff, papéis, convites e revogação',
    ancora: [
      { arquivo: 'tests/staff-auth.integration.test.mjs', padrao: /staff válido recebe sessão com o papel do banco/, prova: 'papel vem do banco, não do cookie' },
      { arquivo: 'tests/staff-auth.integration.test.mjs', padrao: /suspender a identidade invalida IMEDIATAMENTE/, prova: 'revogação imediata de sessão emitida' },
      { arquivo: 'tests/admin-entry.integration.test.mjs', padrao: /login por papel: marcelo, rh e supervisor/, prova: 'navegação por papel em browser real' },
    ],
    gate: 'scripts/qa-staff-auth-postgres.mjs',
  },
  {
    id: 'SEC-05', requisito: 'Substituir tokens compartilhados por autenticação individual com migração controlada',
    ancora: [
      { arquivo: 'tests/staff-auth.integration.test.mjs', padrao: /token compartilhado é recusado por padrão/, prova: 'token compartilhado recusado mesmo configurado' },
      { arquivo: 'tests/staff-auth.integration.test.mjs', padrao: /cookie forjado\/adulterado não concede sessão/, prova: 'cookie forjado não concede sessão' },
    ],
    gate: 'scripts/qa-staff-auth-postgres.mjs',
  },
  {
    id: 'SEC-06', requisito: 'MFA padrão por biblioteca mantida, desafio no login, recuperação e rate limit',
    ancora: [
      { arquivo: 'tests/staff-auth.integration.test.mjs', padrao: /com MFA ativo, a senha sozinha NÃO emite sessão/, prova: 'senha isolada não emite sessão com MFA' },
      { arquivo: 'tests/staff-auth.integration.test.mjs', padrao: /TOTP correto emite sessão; o MESMO código não vale duas vezes/, prova: 'TOTP não reutilizável' },
      { arquivo: 'tests/staff-auth.integration.test.mjs', padrao: /desafio MFA expira e limita tentativas/, prova: 'expiração e limite de tentativas' },
    ],
    gate: 'scripts/qa-staff-auth-postgres.mjs',
  },
  {
    id: 'SEC-07', requisito: 'Corrigir troca de e-mail e handlers HTTP',
    ancora: [
      { arquivo: 'tests/staff-auth.integration.test.mjs', padrao: /identidade pending_email não autentica/, prova: 'identidade com e-mail pendente não autentica' },
      { arquivo: 'tests/client-auth-core.test.mjs', padrao: /test\(/, prova: 'núcleo de autenticação do cliente' },
    ],
    gate: 'scripts/qa-staff-auth-postgres.mjs',
  },
  {
    id: 'SEC-08', requisito: 'Migrações rastreadas e executáveis',
    ancora: [
      { arquivo: 'tests/site-appearance.focal.test.mjs', padrao: /db\/migrations/, prova: 'guarda lê o ledger real de migrações do disco' },
      { arquivo: 'scripts/qa-wave0-static.mjs', padrao: /migrações ausentes|migracoes ausentes/, prova: 'varredura estática de migrações ausentes' },
    ],
    gate: 'scripts/qa-wave0-static.mjs',
  },
  {
    id: 'SEC-09', requisito: 'Reparar suíte e testar APIs reais',
    ancora: [
      { arquivo: 'scripts/qa-wave0-static.mjs', padrao: /verificações estáticas/, prova: 'bateria estática de imports e migrações' },
      { arquivo: 'tests/cli-v2.integration.test.mjs', padrao: /HTTP CLI v2/, prova: 'teste de API real em HTTP + PostgreSQL' },
    ],
    gate: 'scripts/qa-wave0-static.mjs',
  },
  {
    id: 'SEC-10', requisito: 'Consolidar orçamento/simulador e catálogo',
    ancora: [
      { arquivo: 'tests/ux-public-routes.integration.test.mjs', padrao: /test\('browser E6 grupo 2: \/orcamento/, prova: 'jornada pública de orçamento em browser real' },
      { arquivo: 'scripts/ux-pro-00-inventory.mjs', padrao: /const MATRIX_CSV =/, prova: 'matriz de cobertura das rotas públicas' },
    ],
    gate: 'scripts/qa-ux-public-routes-postgres.mjs',
  },
  {
    id: 'SEC-11', requisito: 'Separar prévias e recursos reais',
    ancora: [
      { arquivo: 'tests/ux-public-routes.integration.test.mjs', padrao: /SitePreviewNotice|site-preview-notice/, prova: 'aviso de prévia separado de recurso real' },
      { arquivo: 'tests/ux-pro-10b-previas-medicoes.test.mjs', padrao: /const BASELINE_UNDER_45 =/, prova: 'baseline de prévias sem aprovação implícita' },
    ],
    gate: 'scripts/qa-ux-public-routes-postgres.mjs',
  },
  {
    id: 'SEC-12', requisito: 'Privacidade e declarações de aprovação verificáveis',
    ancora: [
      { arquivo: 'tests/cli13-portal-access-modes.test.mjs', padrao: /aprovação cria convite canônico/, prova: 'aprovação cria convite com decisão/histórico/auditoria' },
      { arquivo: 'tests/client-manual-approval-guards.test.mjs', padrao: /test\(/, prova: 'guardas de aprovação manual do cliente' },
    ],
    gate: 'scripts/qa-cli-v2-postgres.mjs',
  },
  {
    id: 'SEC-13', requisito: 'Segurança de sessão, CSRF, origem e erros',
    ancora: [
      { arquivo: 'tests/staff-auth.integration.test.mjs', padrao: /mutação sem Origin correto é recusada \(CSRF\)/, prova: 'CSRF: mutação sem Origin é recusada' },
      { arquivo: 'tests/admin-entry.integration.test.mjs', padrao: /next externo\/domínio alheio é recusado/, prova: 'redirecionamento externo recusado' },
      { arquivo: 'tests/client-security-routes-fail-closed.test.mjs', padrao: /test\(/, prova: 'rotas de segurança do cliente fail-closed' },
    ],
    gate: 'scripts/qa-staff-auth-postgres.mjs',
  },
  {
    id: 'SEC-14', requisito: 'Auditoria durável e operacional',
    ancora: [
      { arquivo: 'tests/cli-v2.integration.test.mjs', padrao: /persisted in operational audit_log/, prova: 'criação de documento persiste em audit_log' },
      { arquivo: 'tests/cli-v2.integration.test.mjs', padrao: /injected operational audit failure rolls back/, prova: 'falha de auditoria reverte a transação' },
      { arquivo: 'tests/cli13-portal-access-modes.test.mjs', padrao: /falha da auditoria devolve 503/, prova: 'falha de auditoria devolve 503 e reverte pedido' },
    ],
    gate: 'scripts/qa-cli-v2-postgres.mjs',
  },
  {
    id: 'SEC-15', requisito: 'Proteção de abuso e identidade',
    ancora: [
      { arquivo: 'tests/staff-auth.integration.test.mjs', padrao: /rate limiting: excesso de tentativas de login devolve 429/, prova: 'rate limiting com 429 e Retry-After' },
      { arquivo: 'tests/staff-auth.integration.test.mjs', padrao: /desafio MFA inválido\/inexistente é recusado/, prova: 'desafio MFA inválido recusado' },
      { arquivo: 'tests/cli14-account-security.test.mjs', padrao: /all sensitive writes are transaction-scoped/, prova: 'escritas sensíveis são transacionais' },
    ],
    gate: 'scripts/qa-staff-auth-postgres.mjs',
  },
];

const matriz = JSON.parse(await read('docs/REQUISITOS-222-INVENTARIO-2026-10-27.json'));
const execucao = JSON.parse(await read('docs/REQUISITOS-SEC-EVIDENCIA-EXECUCAO-2026-10-28.json'));
const porId = new Map(matriz.requisitos.map(r => [r.id, r]));

const linhas = [];
for (const req of REQUISITOS) {
  const base = porId.get(req.id);
  if (!base) throw new Error(`ID ausente da matriz de 222: ${req.id}`);
  const evidencias = [];
  for (const ancora of req.ancora) {
    let conteudo;
    try { conteudo = await read(ancora.arquivo); } catch { conteudo = ''; }
    const linhasDoArquivo = conteudo.split('\n');
    const idx = linhasDoArquivo.findIndex(l => ancora.padrao.test(l));
    evidencias.push({
      arquivo: ancora.arquivo,
      padrao: String(ancora.padrao),
      prova: ancora.prova,
      encontrado: idx >= 0,
      linha: idx >= 0 ? idx + 1 : null,
      trecho: idx >= 0 ? linhasDoArquivo[idx].trim().slice(0, 160) : null,
    });
  }
  const encontradas = evidencias.filter(e => e.encontrado);
  // O gate precisa existir no disco; a EXECUÇÃO é registrada separadamente.
  let gateExiste = false;
  try { await read(req.gate); gateExiste = true; } catch { /* ausente */ }
  const classe = encontradas.length === 0 ? 'sem_evidencia_tecnica'
    : encontradas.length < req.ancora.length ? 'evidencia_parcial'
      : 'evidencia_tecnica_mapeada';
  linhas.push({
    id: req.id, requisito: req.requisito,
    estado_declarado_0410: base.estado_declarado_0410,
    estado_confirmado_0410: base.estado_confirmado_0410,
    classe_evidencia_atual: base.classe_evidencia_atual,
    classe_reauditoria: classe,
    gate: req.gate, gate_existe: gateExiste,
    total_ancoras: req.ancora.length,
    ancora_encontradas: encontradas.length,
    evidencias,
    aceite_humano: 'nao_registrado',
    reauditoria_integral: 'nao_executada',
    limite: 'evidência técnica != aceite humano; jornada completa por papel ainda não validada',
  });
}

const resumo = {
  familia: 'SEC', total: linhas.length,
  porClasse: linhas.reduce((acc, r) => { acc[r.classe_reauditoria] = (acc[r.classe_reauditoria] || 0) + 1; return acc; }, {}),
  ancoras: linhas.reduce((n, r) => n + r.total_ancoras, 0),
  ancorasEncontradas: linhas.reduce((n, r) => n + r.ancora_encontradas, 0),
  gates: [...new Set(linhas.map(r => r.gate))],
  aceiteHumano: 0,
  reauditoriaIntegral: 0,
};

const saida = {
  stage: 'requisitos-sec-reaudit', data: '2026-10-28',
  metodo: 'âncoras de asserção executável em testes/gates + existência do gate; NÃO conta menção literal de ID',
  fonteEstado: 'docs/REQUISITOS-222-INVENTARIO-2026-10-27.json',
  resumo, requisitos: linhas,
  limite: 'mapa de evidência TÉCNICA; nenhum aceite humano, UAT, Windows ou leitor de tela foi executado',
};

const json = JSON.stringify(saida, null, 2) + '\n';
const csv = [
  'id,estado_0410,classe_evidencia_atual,classe_reauditoria,ancoras,encontradas,gate,gate_existe,aceite_humano',
  ...linhas.map(r => [r.id, r.estado_confirmado_0410, r.classe_evidencia_atual, r.classe_reauditoria,
    r.total_ancoras, r.ancora_encontradas, r.gate, r.gate_existe, r.aceite_humano].join(',')),
].join('\n') + '\n';

const md = `# Reauditoria técnica da família SEC (15 IDs)

**Data:** 2026-10-28 · **Método:** âncoras de asserção executável em testes/gates, **não** contagem de menção literal de ID. **Aceite humano: 0/15. Reauditoria integral: 0/15.**

## Resumo

| Classe de reauditoria | IDs |
| --- | ---: |
${Object.entries(resumo.porClasse).map(([k, v]) => `| ${k} | ${v} |`).join('\n')}

**Âncoras:** ${resumo.ancorasEncontradas}/${resumo.ancoras} encontradas no código. **Gates:** ${resumo.gates.join(', ')}.

## Execução real dos gates

${execucao.aprovados}/${execucao.total} execuções saíram com \`exit 0\` em 28/10. Duas usaram PostgreSQL 17 descartável, duas PostgreSQL 17 + Chromium; wave0 é estático (sem banco).

| Gate | Ambiente | Resultado | Duração | Resumo |
| --- | --- | ---: | ---: | --- |
${execucao.gates.map(g => `| \`${g.gate}\` | ${g.database} | exit ${g.exit} | ${g.duracaoMs} ms | ${g.resumo.replace(/\|/g, '\\|')} |`).join('\n')}

## Mapa por requisito

| ID | Requisito | Estado 04/10 | Classe atual | Classe reauditada | Âncoras | Gate |
| --- | --- | --- | --- | --- | ---: | --- |
${linhas.map(r => `| ${r.id} | ${r.requisito} | ${r.estado_confirmado_0410} | ${r.classe_evidencia_atual} | **${r.classe_reauditoria}** | ${r.ancora_encontradas}/${r.total_ancoras} | \`${r.gate}\` |`).join('\n')}

## Evidências encontradas

${linhas.map(r => `### ${r.id} — ${r.requisito}\n${r.evidencias.map(e => e.encontrado
    ? `- ✅ \`${e.arquivo}:${e.linha}\` — ${e.prova}\n  \`${e.trecho}\``
    : `- ❌ **AUSENTE:** \`${e.arquivo}\` — ${e.prova} (padrão \`${e.padrao}\`)`).join('\n')}\n`).join('\n')}

## O que isto NÃO é

- **Não é aceite humano.** Nenhum dos 15 IDs foi validado por pessoa, UAT, Windows real ou leitor de tela.
- **Não é reauditoria integral.** O mapa liga cada requisito a asserções existentes; não percorre a jornada completa por papel, autorização, API, banco e dado de ponta a ponta.
- **Não é aprovação de produção.** Produção segue **NO-GO**.
- Uma âncora ausente é uma **lacuna real de evidência**, não um requisito implementado sem teste.

Artefatos: \`docs/REQUISITOS-SEC-REAUDITORIA-2026-10-28.{json,csv}\`. Gerador: \`scripts/requisitos-sec-reaudit.mjs --check\`.
`;

const arquivos = {
  'docs/REQUISITOS-SEC-REAUDITORIA-2026-10-28.json': json,
  'docs/REQUISITOS-SEC-REAUDITORIA-2026-10-28.csv': csv,
  'docs/REQUISITOS-SEC-REAUDITORIA-2026-10-28.md': md,
};

if (CHECK) {
  let divergencias = 0;
  for (const [arquivo, conteudo] of Object.entries(arquivos)) {
    let atual;
    try { atual = await read(arquivo); } catch { atual = null; }
    if (atual !== conteudo) {
      console.error(`SEC_REAUDIT_MISMATCH: ${arquivo} — rode "node scripts/requisitos-sec-reaudit.mjs" e versione o resultado.`);
      divergencias += 1;
    }
  }
  if (divergencias) process.exit(1);
  console.log(`SEC_REAUDIT_CHECK_OK: ${Object.keys(arquivos).length} artefatos conferem; ${resumo.ancorasEncontradas}/${resumo.ancoras} âncoras.`);
} else {
  for (const [arquivo, conteudo] of Object.entries(arquivos)) {
    await writeFile(path.join(root, arquivo), conteudo);
    console.log(`SEC_REAUDIT_WRITTEN: ${arquivo}`);
  }
  console.log(`SEC_REAUDIT_RESUMO: ${JSON.stringify(resumo.porClasse)} | âncoras ${resumo.ancorasEncontradas}/${resumo.ancoras}`);
  for (const r of linhas.filter(x => x.ancora_encontradas < x.total_ancoras)) {
    console.log(`  LACUNA ${r.id}: ${r.ancora_encontradas}/${r.total_ancoras}`);
  }
}
