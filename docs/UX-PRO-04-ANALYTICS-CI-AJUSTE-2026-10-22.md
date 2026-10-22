# UX-PRO-04 Analytics — ajuste de confiabilidade do gate L08

**Data:** 2026-10-22 (America/Sao_Paulo)  
**PR relacionada:** #291  
**Base:** `66799ec434350445b0d68bad42960d1a01489efd`

## Motivo

A fatia `/admin/analytics` não alterou o portal do cliente nem o servidor compartilhado. Os checks da PR falharam inicialmente por causas externas/transitórias (endpoint `npm audit` respondeu 400; inicialização de servidor Next excedeu o limite em gates independentes). Após rerun, baseline, L06 e backup/restore passaram. O único gate restante, L08, completou 50 de 51 verificações e falhou no smoke Chromium porque o servidor de desenvolvimento não emitiu `listening on` em 90 segundos, registrando somente a configuração Next.

## Ajuste restrito

Aumentar o prazo de espera do servidor isolado do smoke L08 de 90 para 180 segundos. Nenhuma asserção funcional foi removida, nenhum teste foi pulado e os contratos do sistema não mudaram. O Chromium ainda precisa abrir `/cliente/entrar` e encontrar o título e os campos de e-mail e senha.

## Validação e limites

- Reexecutar o gate L08 no CI Linux após o ajuste.
- Executar `node --check` e `git diff --check` localmente.
- Gate L08 local no Windows não é evidência compatível: a migração falhou antes do smoke porque o cluster local usa WIN1252 e não consegue aplicar um caractere UTF-8 da migração.
- O ajuste não substitui revisão concluída da PR #291; sem review registrada e checks verdes, não fazer merge nem avançar.
