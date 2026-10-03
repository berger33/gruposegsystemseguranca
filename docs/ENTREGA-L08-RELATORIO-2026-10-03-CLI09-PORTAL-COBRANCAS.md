# Relatório L08 — CLI-09: cobranças no portal do cliente

- **Data:** 2026-10-03
- **Lote:** L08 / CLI-09 (fatia de leitura privada)
- **Branch:** `arena/01a10038-gruposegsystemseguranca`
- **Base:** `e7b18cd52a68286d08b79ee4a642443cc5426b7a`
- **Migração:** nenhuma; as tabelas canônicas existentes da migração 076 foram reutilizadas. Próxima livre: 141.

## Implementação

- A rota `/api/client/charges-v2` agora aceita exclusivamente sessão de cliente e origem válida, resolve os `client_access_grants` ativos no servidor e retorna apenas cobranças com integração financeira ativa da própria conta.
- Sessões administrativas não são aceitas nessa leitura; a rota administrativa legada continua separada para criação/gestão.
- Nova tela `/cliente/app/cobrancas`, com estado de carregamento, erro e retry, valores, vencimento, status e links para documento fiscal/comprovante já publicados pelo provedor.
- Navegação canônica do portal inclui Cobranças.

## Limites reais

A tela não cria cobrança, não efetua pagamento e não transforma orçamento em obrigação. Documento fiscal/comprovante só é exibido quando já estiver publicado pela integração financeira. CLI-10..15 seguem pendentes de promoção ao portal.

## Validação

Executar `node scripts/qa-wave0-static.mjs`, `npm run typecheck` e `npm run build`; sem matrizes L03..L08 em cascata ou homologação Windows.
