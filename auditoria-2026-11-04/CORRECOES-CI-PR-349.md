# Correções do CI da PR 349 — 05/11/2026

## Inventário TI

Regenerado o inventário UX-PRO-03 TI após a entrega acumulada. O `--check` desatualizado era a única falha da suíte unitária local; após a correção, 1603 testes passaram (antes da nova regressão de fontes).

## Chromium sem fontes no sandbox

As anotações de falha dos checks remotos permitiram recuperar o diagnóstico apesar de os downloads do armazenamento de logs falharem neste ambiente. Em 27 das 32 falhas da rodada `fb3628b`, apareceu o fatal `SkFontMgr_FontConfigInterface.cpp:163`. Algumas outras falhas indicavam fechamento do mesmo navegador; ainda não estavam individualmente comprovadas como a mesma causa.

O supervisor altera TMPDIR/TMP/TEMP para seu diretório exclusivo. O pacote Chromium extrai fontes nesse diretório, mas seu `fonts.conf` distribuído contém caminhos absolutos para `/tmp/fonts`. Resíduos de execuções anteriores em `/tmp/fonts` mascaravam o defeito localmente. Em runner limpo o renderizador não encontra fontes e aborta.

Reprodução controlada, sem alterar dependências ou dados reais:

- Renomear temporariamente `/tmp/fonts`, com restauração garantida por `trap`.
- Antes da correção: `npm run test:ux-adm:pg` saiu 1 com o mesmo fatal do CI.
- Depois da correção, ainda sem fontes globais: 12/12 testes passaram, saída 0, `QA_PG_TEMP_CLEANED: true` e supervisor `complete`.
- Regressões do supervisor após a mudança: 63/63 passaram.

Correção: criar configuração fontconfig no sandbox, com caminhos XML escapados para fontes e cache exclusivos, e passá-la ao worker por FONTCONFIG_PATH. A extração continua a cargo do pacote. O supervisor remove configuração, fontes e cache junto com o sandbox, inclusive em cancelamentos e falhas. Teste verifica substituição de FONTCONFIG_PATH herdado, caminhos exclusivos e remoção efetiva.

Nenhum check desativado, timeout relaxado, browser omitido ou política de permissão alterada. O wrapper de observabilidade preserva o código de saída original e publica uma anotação redigida consolidada, sem depender do download dos logs.

Aguardar o resultado integral do CI remoto antes de efetivar o merge. Este documento não atesta deploy, produção, UAT ou aceite humano.
