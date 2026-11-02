#!/usr/bin/env node
/**
 * E15 — gerador do catálogo canônico de rotas de `server.mjs`.
 *
 * Lê `server.mjs` como TEXTO (sem executá-lo) e materializa a tabela das três
 * resoluções de caminho que hoje vivem em lugares distintos do arquivo:
 *
 *   1. `API_PATH_MATCH` — a borda: decide se o caminho é API ou página Next;
 *   2. `routeApi`       — o despacho: decide qual handler trata o caminho;
 *   3. `legacyHrPermission` / `authorizeLegacyHrRequest` — a borda legada de RH.
 *
 * O ponto do catálogo não é listar handlers: é provar, de forma repetível, que
 * a borda e o despacho concordam. Onde não concordam, o número aparece em
 * `divergencias` — e é número medido, não opinião.
 *
 * O que este gerador NÃO faz: trocar o despacho por busca em tabela, decidir
 * método HTTP, executar rota, tocar `server.mjs`. Trocar o despacho é outra
 * fatia e exige autorização do dono.
 *
 * Uso:
 *   node scripts/e15-route-catalog.mjs           # regenera o JSON e imprime o resumo
 *   node scripts/e15-route-catalog.mjs --check   # não escreve; exit 1 se o JSON versionado estiver desatualizado
 *   node scripts/e15-route-catalog.mjs --relatorio # imprime o bloco do relatório datado
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  construirCatalogo,
  catalogoParaJson,
  lerServidor,
} from '../src/server/route-catalog.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const CATALOGO = 'docs/E15-ROTAS-CATALOGO-2026-11-02.json';

const argumentos = new Set(process.argv.slice(2));
const conferir = argumentos.has('--check');
const relatorio = argumentos.has('--relatorio');

const source = lerServidor(root);
const catalogo = construirCatalogo(source);
const json = catalogoParaJson(catalogo);

if (relatorio) {
  const { resumo, divergencias } = catalogo;
  const linhas = [
    '### E15 — catálogo canônico de rotas (medido)',
    '',
    `- \`server.mjs\`: **${catalogo.linhasServer}** linhas; sha256 \`${catalogo.sha256.slice(0, 16)}…\``,
    `- borda \`${catalogo.borda.funcao}\` (linhas ${catalogo.borda.linhas.join('–')}): **${resumo.borda.regras}** regras `
      + `(${resumo.borda.exatos} exatas, ${resumo.borda.prefixos} prefixos, ${resumo.borda.regexes} regexes)`,
    `- despacho \`${catalogo.despacho.funcao}\` (linhas ${catalogo.despacho.linhas.join('–')}): **${resumo.despacho.regras}** regras `
      + `(${resumo.despacho.handlers} de handler, ${resumo.despacho.preAutorizacao} de pré-autorização) em **${resumo.despacho.modulos}** módulos`,
    `- divergências: **${resumo.inalcancaveis}** inalcançáveis, **${resumo.sombreadas}** sombreadas `
      + `(**${divergencias.sombreadas.filter((d) => d.intencional).length}** declaradas intencionais no código), `
      + `**${resumo.bordaSemDespacho}** na borda sem despacho, **${resumo.avisos}** formas não reconhecidas`,
  ];
  console.log(linhas.join('\n'));
  process.exit(0);
}

if (conferir) {
  const versionado = await readFile(path.join(root, CATALOGO), 'utf8').catch(() => null);
  if (versionado === null) {
    console.error(`FALHOU: ${CATALOGO} não existe. Rode sem --check para gerar.`);
    process.exit(1);
  }
  if (versionado !== json) {
    console.error(`FALHOU: ${CATALOGO} está desatualizado em relação a server.mjs.`);
    console.error('Rode `node scripts/e15-route-catalog.mjs` e revise o diff antes de commitar.');
    process.exit(1);
  }
  console.log(`OK: ${CATALOGO} confere com server.mjs (${catalogo.resumo.despacho.regras} regras de despacho).`);
  process.exit(0);
}

await writeFile(path.join(root, CATALOGO), json, 'utf8');
const { resumo } = catalogo;
console.log(JSON.stringify({
  catalogo: CATALOGO,
  schema: catalogo.schema,
  linhasServer: catalogo.linhasServer,
  borda: resumo.borda.regras,
  despacho: resumo.despacho.regras,
  handlers: resumo.despacho.handlers,
  preAutorizacao: resumo.despacho.preAutorizacao,
  modulos: resumo.despacho.modulos,
  inalcancaveis: resumo.inalcancaveis,
  sombreadas: resumo.sombreadas,
  sombreadasIntencionais: catalogo.divergencias.sombreadas.filter((d) => d.intencional).length,
  bordaSemDespacho: resumo.bordaSemDespacho,
  avisos: resumo.avisos,
}, null, 2));
