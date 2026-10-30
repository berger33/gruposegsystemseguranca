# E22 — suíte unitária hermética diante do navegador empacotado (2026-10-30)

**Frase de efeito:** o `test:unit` deixa de depender do ambiente de quem o executa.
Navegador disponível → roda; plataforma sem binário → **skip marcado**; gate que
exige navegador ou lançamento que falha de fato → **falha explícita**. Nunca mais
"vermelho de ambiente" passando por regressão.

## 1. Causa raiz

`tests/ux-pro-09e-pu4.test.mjs` (fatia PU4, evidência de contraste textual) abre o
Chromium empacotado por `@sparticuz/chromium` **dentro do `test:unit`**. O pacote,
no momento do import, só monta o ambiente AL2023 quando encontra um marcador de
runtime — `AWS_EXECUTION_ENV`, `AWS_LAMBDA_JS_RUNTIME`, `CODEBUILD_BUILD_IMAGE` ou
`VERCEL`. Sem esse marcador:

1. `setupLambdaEnvironment()` não é chamada → `LD_LIBRARY_PATH` não aponta para
   `/tmp/al2023/lib`;
2. `executablePath()` não infla `al2023.tar.br` → `libnspr4.so`, `libnss3.so` e
   `libnssutil3.so` não existem no host mínimo (Debian/Ubuntu sem `libnss3`);
3. o spawn morre com
   `/tmp/chromium: error while loading shared libraries: libnspr4.so: cannot open shared object file`.

Resultado: `npm test` vermelho por ambiente, com a mesma cara de regressão de
código. O único jeito de ficar verde era lembrar de rodar
`AWS_EXECUTION_ENV=AWS_Lambda_nodejs22.x npm test` — conhecimento tribal, não
garantia do repositório.

Medição de partida (`main` = `32e9b6d`, esta sandbox, Debian 12 sem `libnss3`):

| Comando | Antes |
| --- | --- |
| `env -u AWS_EXECUTION_ENV npm test` | **1226** testes, **1224 passam, 2 falham**, 0 skip — exatamente as duas asserções de navegador do PU4 |
| `AWS_EXECUTION_ENV=AWS_Lambda_nodejs22.x node --test tests/ux-pro-09e-pu4.test.mjs` | 5/5 (a variável libera as bibliotecas AL2023) |

## 2. Política adotada: `run` / `skip-marcado` / `fail-explícito` (`fail-explicit` no código)

Implementada em `tests/helpers/browser-runtime.mjs`, sem exceção silenciosa:

| Estado | Quando | Efeito |
| --- | --- | --- |
| `run` | plataforma com binário suportado (Linux x64 com o pacote; Windows com Chrome instalado) | lança o navegador e a asserção vale de verdade |
| `skip-marcado` | plataforma sem binário suportado — `win32` **sem** `C:\Program Files\Google\Chrome\Application\chrome.exe`, ou `darwin`/outros | `t.skip()` com o motivo escrito; nada é aprovado |
| `fail-explícito` (`fail-explicit`) | `UX_PU4_REQUIRE_BROWSER=1` (gate) **ou** qualquer falha real de lançamento | `BrowserPolicyError` com código da causa, causa provável e o comando que resolve |

Duas decisões que sustentam a hermetização:

1. **Injeção antes do import.** O helper define `AWS_EXECUTION_ENV=AWS_Lambda_nodejs22.x`
   (marcador `AL2023_RUNTIME_MARKER`) e só então faz `await import('@sparticuz/chromium')`,
   porque o pacote decide no import se chama `setupLambdaEnvironment()`. Import
   estático tornaria a injeção inútil — a guarda proíbe esse import.
   No runtime real a variável já existe e **nunca é sobrescrita**.
2. **Extração serializada.** O `inflate` do pacote checa `existsSync('/tmp/chromium')`
   e só depois escreve. Como o `node --test` roda arquivos em processos separados,
   dois arquivos com navegador escreveriam o mesmo binário e um deles falharia com
   `spawn ETXTBSY` (reproduzido nesta sessão antes do lock). O helper usa um lock de
   diretório em `os.tmpdir()` com prazo de 120 s (lock órfão não trava ninguém),
   garante `al2023.tar.br` mesmo quando `/tmp/chromium` já existe de uma execução
   antiga sem bibliotecas, e re-tenta o lançamento até 3 vezes em `ETXTBSY`.

## 3. O gate novo no CI

`.github/workflows/ci.yml`, logo depois do `npm test`:

```yaml
- name: PU4 hermetic browser gate (skip is a failure here)
  run: npm run test:ux-pro-09e-pu4:browser
```

`test:ux-pro-09e-pu4:browser` = `UX_PU4_REQUIRE_BROWSER=1 node --test tests/ux-pro-09e-pu4.test.mjs`.
No gate, `skip-marcado` escala para falha. O `test:unit` **não** carrega essa
variável: ele continua sendo suíte unitária, não gate de navegador — e a guarda
verifica isso.

## 4. Provas RED → GREEN (medidas nesta sandbox, 30/10)

| Comando | Antes | Depois |
| --- | --- | --- |
| `env -u AWS_EXECUTION_ENV node --test tests/ux-pro-09e-pu4.test.mjs` | **3/5** (2 falhas `libnspr4.so`) | **5/5, 0 fail, 0 skip** |
| `env -u AWS_EXECUTION_ENV node --test tests/ux-pro-09e-pu4-hermeticidade.test.mjs` | arquivo não existia (RED por ausência) | **8/8, 0 skip** |
| `npm run test:ux-pro-09e-pu4:browser` | script não existia | **5/5** |
| `env -u AWS_EXECUTION_ENV npm test` | **1226**: 1224 passam, 2 falham | **1234/1234**, 0 fail, 0 skip |
| `AWS_EXECUTION_ENV=AWS_Lambda_nodejs22.x npm test` | 1226 (2 falhas na mesma máquina sem libs) | **1234/1234**, 0 fail, 0 skip |

A prova mais importante é a subprocesso da guarda (`E22: em processo limpo, sem
AWS_EXECUTION_ENV, o navegador roda`): ela apaga `AWS_EXECUTION_ENV` e
`LD_LIBRARY_PATH` do ambiente, abre o navegador pelo helper e avalia `6 * 7` dentro
da página, exigindo `run` + `42`. Não é checagem de string: é o navegador real
funcionando com o ambiente limpo.

## 5. O que foi preservado

- **As 5 asserções do PU4**, sem afrouxamento: estágio `09E` com
  `fullTextContrastSamples: true` (e só ele), `measureTextContrast` isolada,
  `not-measured` explícito, `unmeasuredVisibleTextCount`, `textContrast` aditivo;
  as sete amostras de texto (`Período do relatório`, `texto isolado`, `Rodapé de
  privacidade`, `Campo adicional`, `Ajuda contextual`, `Erro do formulário`,
  `Fundo complexo`), `sampleCount = 7`, `indeterminateCount = 1`, fundo em
  gradiente com `ratio: null`; e a integridade das **112 capturas** (SHA-256,
  bytes, largura, altura, igualdade com o manifesto).
- **A regra do Windows:** Chrome instalado em
  `C:\Program Files\Google\Chrome\Application\chrome.exe` continua sendo o caminho
  preferido em `win32`; a normalização de separadores de caminho
  (`path.resolve(root, path.dirname(entry.screenshot))`) e a declaração de
  `process.platform` na captura seguem intocadas.
- **Os gates de navegador existentes** (`qa:ux-pro-04-*`, `test:*:pg`, workflow
  *UX portais*) não foram alterados: continuam recebendo `AWS_EXECUTION_ENV` pelos
  próprios runners.
- Nada de credencial, token ou dado real: só Chromium, páginas sintéticas e
  asserções.

## 6. Limites declarados

1. **Skip condicional e marcado:** em `win32` sem Chrome instalado, em `darwin` e
   em outras plataformas a suíte **pula** as duas asserções de navegador, com o
   motivo no relatório (`# skipped 2`). É skip visível, não verde: o gate
   `test:ux-pro-09e-pu4:browser` transforma o mesmo caso em falha.
2. **Sem Windows real:** a regra do Windows é verificada por contrato (código e
   normalização de caminho), não executada. Nenhum Windows de verdade rodou esta
   fatia.
3. **F02/Windows continua fora de escopo** e não foi tocado.
4. **`ETXTBSY` residual:** o lock elimina a corrida entre processos desta suíte,
   mas um `/tmp/chromium` corrompido por processo de fora ainda pode exigir
   limpeza manual — a mensagem de erro diz exatamente quais diretórios apagar.
5. **Produção permanece NO-GO.** Esta fatia mexe em teste, helper, gate e
   documentação; não altera runtime de produção, banco, migrações ou provedores.
6. **0/222 com aceite humano.** Nenhum requisito do inventário 222 muda de estado
   por causa desta fatia, e `aceite_humano` continua `nao_registrado`.

## 7. Arquivos da fatia

| Arquivo | Papel |
| --- | --- |
| `tests/helpers/browser-runtime.mjs` | runtime hermético: injeção AL2023 pré-import, lock de extração, política de três estados |
| `tests/ux-pro-09e-pu4.test.mjs` | passa a lançar pelo helper; 5 asserções preservadas |
| `tests/ux-pro-09e-pu4-hermeticidade.test.mjs` | guarda de 8 asserções contra a reincidência |
| `package.json` | `test:ux-pro-09e-pu4:browser` (gate) e guarda no `test:unit` |
| `.github/workflows/ci.yml` | execução do gate no CI |
| `docs/E22-HERMETICIDADE-SUITE-UNITARIA-2026-10-30.md` | este documento |

> Nota de origem: esta fatia foi reconstruída e re-verificada nesta sessão a partir
> do defeito registrado em `docs/AUDITORIA-FATIAS-PENDENTES-2026-10-28.md` (§E22) e
> das medições acima. Todos os números do §4 foram executados neste repositório, não
> copiados de relatório anterior.
