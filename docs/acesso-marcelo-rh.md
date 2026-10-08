# Acesso do Marcelo ao RH

Marcelo pode abrir **Funcionários e RH** pelo menu Pessoas. O acesso no servidor permite consultar e manter rotinas operacionais, acompanhar admissões, jornada e solicitações, e revisar/aprovar ou rejeitar ajustes de ponto com autoria e auditoria.

A concessão organizacional adicionada na migração 180 é somente `employees.read` e `employees.write`. Ela permite o cadastro e a jornada comuns, mas não concede `employees.compensation.*` nem `employees.health.*`. Valores de remuneração continuam ocultos e os fluxos de folha, dados ocupacionais/médicos e mensagens/relatos confidenciais permanecem restritos aos perfis e permissões existentes.

## Ativação

Atualize o código local e aplique `npm run db:migrate` ao banco local de demonstração/uso pretendido, seguindo o runbook vigente. O migrador agora confere as migrações 001–180. Reinicie a aplicação após a atualização. A migração concede leitura e escrita no escopo da organização a perfis Marcelo ativos e a novos perfis com esse papel; não restaura concessões revogadas pelo administrador. O mecanismo de RBAC decide cada chamada no servidor; o item do menu e o gate visual não substituem a permissão da API.

As concessões iniciais automáticas são identificáveis pelo motivo `Acesso operacional de RH do papel Marcelo`. Se o papel Marcelo for removido, somente essas concessões automáticas ativas são revogadas. Uma concessão explicitamente criada por uma pessoa administradora continua sujeita ao fluxo normal de revisão de acesso.

## Limites

O acesso permite decisões operacionais como aprovação de ajustes de ponto. Os dados devem ser usados conforme a finalidade e a política de privacidade da empresa. Para liberar folha ou saúde ocupacional ao Marcelo, a pessoa administradora deve conceder as permissões específicas pelo diretório de acessos e revisar se essa alçada é apropriada; a migração não concede esses acessos automaticamente.
