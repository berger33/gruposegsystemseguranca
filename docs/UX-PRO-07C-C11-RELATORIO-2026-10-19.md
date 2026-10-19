# UX-PRO-07C — C11: relatório de conclusão

**Data:** 19/10/2026
**Base:** `main` / `origin/main` em `1a058f2503a560f3e9bf6eb0c65c5820a77dfe8b`
**Rota:** `/admin/fornecedores`
**Família:** UX-PRO-07C, jornada de fornecedores
**Escopo deliberado:** C11 original (abas do workspace de fornecedores). Os resíduos E2–E9 de `/admin/financeiro` são outra frente e não foram alterados.

## Antes e depois

| Antes | Depois |
|---|---|
| Cinco botões tinham `role="tab"`, mas todos apontavam visualmente/semanticamente para a primeira etapa; não havia painéis relacionados nem operação por teclado. | Cinco abas têm seleção real, IDs associados a painéis `tabpanel`, estado `aria-selected`, `aria-controls`, `aria-labelledby`, foco móvel e suporte a setas, Home e End. |
| Formulário, cotações, detalhe, validade/alertas, referências documentais e pedidos internos apareciam juntos em uma página longa. | Os conteúdos existentes estão organizados em cinco etapas; somente a ativa fica visível. Os painéis continuam montados, preservando campos controlados ao alternar. |
| Selecionar uma cotação não oferecia navegação por etapa coerente. | Selecionar uma cotação abre o detalhe; uma criação só abre o detalhe depois de confirmação canônica pelo servidor. |

As cinco etapas são **Cotações**, **Detalhe canônico**, **Validade e alertas**, **Referências documentais** e **Pedidos internos**. Os estados vazios das duas etapas dependentes deixam claro que é necessário selecionar uma cotação; nenhuma validade, documento ou dado foi inferido.

## Comportamento preservado

- Mantidas autenticação, `AdminGate`, papéis aceitos, APIs, métodos, payloads, cabeçalhos, chaves idempotentes, operações, auditoria e autoridade do servidor.
- Nenhuma rota, migração, coluna, integração, regra de permissão ou estilo compartilhado foi alterado.
- Navegar entre abas não dispara leitura nem escrita. Formulários permanecem montados, para conservar os rascunhos durante a alternância.
- A seleção de registros continua lendo o detalhe canônico; falhas de autorização continuam removendo dados protegidos e falhas de escrita preservam os contratos existentes.

## Evidências e validação

**Validação automatizada em navegador:** `npm run test:ux-supplier:pg` concluiu com PostgreSQL temporário, servidor HTTP real e Chrome instalado localmente: **20 aprovados, 0 falhos, 0 ignorados**. As 180 migrações foram aplicadas ao banco descartável e ele foi removido ao final. O caso C11 exercitou as cinco abas, associações ARIA, setas, Home/End, painel único visível, retenção de campo e zero chamadas de rede ao alternar.

O gate também mediu 320, 390, 768 e 1440 px, tema claro/escuro, foco por teclado, overflow e alvos de toque. O resumo e as capturas automatizadas estão em [`ux-pro-07c-c11-evidencias`](ux-pro-07c-c11-evidencias/); a captura específica do C11 é [`fornecedores-c11-tabs-390-teclado.png`](ux-pro-07c-c11-evidencias/fornecedores-c11-tabs-390-teclado.png). Massa sintética do teste.

**Inspeção estática:** não foram alterados API, autorização, banco, estilos compartilhados ou inventário de rotas. `node scripts/qa-wave0-static.mjs` passou (5/5); `node scripts/ux-pro-00-inventory.mjs --check` passou com 100 rotas e inventário/matriz reconciliados; teste focal sem banco passou com 48 aprovados e 17 casos de navegador ignorados por ausência de DB (o gate PostgreSQL executou esses casos depois); typecheck passou. `git diff --check` é executado antes do commit.

O gate herdado `npm run test:ext04-suppliers:pg` também passou: **28 aprovados, 0 falhos, 0 ignorados**. Foi necessário fixar encoding UTF-8 no cluster temporário do gate; sem isso, o Windows criava `WIN1252` e a migração falhava antes dos testes. A mesma correção de ambiente está no gate UX focal. Nenhum banco persistente foi usado.

**Validação manual/aceite humano:** não realizada nem inferida. As imagens foram produzidas pelo Chromium automatizado; não comprovam experiência manual em dispositivos físicos nem aceite de usuário.

## Limitações e pendências

- Não é auditoria WCAG completa; leitores de tela reais e combinações navegador/tecnologia assistiva não foram testados manualmente.
- Não houve validação com dados reais, sessão de fornecedor externo, homologação operacional ou produção.
- Mudanças em `/admin/financeiro` ficam fora desta PR; a divergência de nome C11 não deve fundir as duas frentes.
- A UX continua condicionada aos contratos e dados já existentes do EXT-04.

## Estado de revisão

O código foi preparado em branch baseada na `main` indicada acima. O merge depende da revisão e dos checks obrigatórios da PR; esta evidência local não representa revisão humana nem checks remotos.
