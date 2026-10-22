# UX-PRO-05 — rejeição de documentos com retorno ao funcionário (escopo antes)

**Data:** 22/10/2026  
**Base:** `main` `5c369da3eb0f7881757a6a54b3743b5532a4393b` (merge #292).  
**Superfícies montadas:** `/admin/funcionarios` → `Documentos` (papel RH/admin autorizado) e `/funcionario` → `Docs` (sessão do funcionário autenticado).  
**Objetivo:** completar o ciclo já suportado pelo backend: RH rejeita um documento privado informando motivo e o dono do envio consegue ler esse motivo no portal.

## Reavaliação do estado atual

- A tela de RH lista documentos privados e oferece “Aprovar” e “Baixar”. O endpoint existente `PATCH /api/admin/hr/l03/documents` já aceita `status: rejected`, exige motivo com pelo menos cinco caracteres, exige `employees.write`, limita a atualização ao escopo autorizado e registra evento de revisão/auditoria.
- A aba `Docs` do funcionário lista os documentos que ele enviou e os documentos publicados para ele, com estado e download. As consultas existentes restringem envios ao funcionário da sessão e não selecionam `rejection_reason`; portanto o funcionário não recebe o motivo que RH já gravou.
- A mudança não inclui outras abas ou etapas de UX-PRO-05 já entregues, nem reimplementa #292.

## Escopo desta PR

1. Na tabela de RH, permitir rejeitar documento com motivo obrigatório (mínimo cinco caracteres), usando o endpoint e contrato já existentes. Manter aprovar, baixar e demais ações.
2. Nas duas leituras existentes do portal (`GET /api/employee/home` e `GET /api/employee/documents`), incluir de forma aditiva `rejection_reason` para registros já autorizados pelo filtro do funcionário. Não criar endpoint, método, migração ou coluna.
3. Na aba de documentos do funcionário, exibir o motivo somente quando o estado for rejeitado e existir motivo. Não expor motivo a outro funcionário nem a papel sem a permissão vigente.

## Riscos e controles

- **Privacidade:** motivo pode conter contexto de RH. Manter filtro por identidade autenticada em ambas as consultas; testar funcionário A/B e verificar que apenas o dono recebe o motivo.
- **Autorização:** não adicionar grant nem confiar em papel enviado pelo cliente. RH continua sujeito a `employees.write`; o portal recebe somente os registros que a API já entrega.
- **Auditoria/dados:** reaproveitar a mutação existente, que já grava estado, motivo, autor, horário e evento. Nenhuma escrita direta pelo portal.
- **Contrato:** campo de leitura opcional e aditivo; campos/rotas/métodos atuais permanecem intactos.
- **Dados sintéticos:** usar fixture criada pelo gate de PostgreSQL; sem arquivo ou dado pessoal real. Remover temporários gerados pelos gates.
- **Módulos/arquivos compartilhados:** mudança restrita ao componente de Documentos RH, `EmployeePortal`, consultas de leitura do mesmo módulo API, testes e este relatório. Não editar CSS compartilhado sem evidência medida.

## Validação planejada

- Primeiro adicionar teste focal e executá-lo contra esta base para comprovar a lacuna.
- Executar os gates de navegador/PostgreSQL `npm run test:ux-hr:pg` e `npm run test:ux-portal:pg`, incluindo rejeição e isolamento A/B.
- Executar `npm test`, `npm run typecheck`, `npm run build`, `node scripts/qa-wave0-static.mjs`, `node scripts/ux-pro-00-inventory.mjs --check` e `git diff --check`.
- Guardar hashes de `next-env.d.ts` e `tsconfig.json` e confirmar que permanecem inalterados.
- Inspecionar DOM/CSS e capturas automatizadas em 320/390/768/1440 px, temas claro/escuro e teclado. Declarar separadamente inspeção estática, validação automatizada e validação manual; não inferir aceite humano.

## Critério de parada

Se o gate de identidade/isolamento, auditoria ou qualquer check obrigatório falhar ou ficar pendente, não abrir PR nem avançar para outra fatia. Corrigir ou relatar o bloqueio preservando esta branch.
