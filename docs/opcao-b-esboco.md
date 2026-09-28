# Opção B — Fase 3 (operação em campo): esboço para decisão do dono
Não implementado ainda. Decisões pendentes antes de qualquer migração ou código:

## Identidades de equipe (auth_identities.kind = 'staff' já criado)
- Cadastro apenas por administradores autorizados (não autocadastro).
- Postos: definição de funções por posto (ex: vigilante, supervisor, gerente de operações).
- Alocação por cliente: vínculo entre staff e client_account (tipo 'assignment', não 'grant').

## Escalas
- 12x36, 6x1, diarista — regras por posto ainda não definidas.
- Quem define a escala: administrador (Marcelo) ou supervisor?

## Registro de ronda / evidência
- Responsável (staff_id) + evidência (foto/geolocalização + timestamp).
- Ponto por posto ou por pessoa?

## Geolocalização
- Finalidade (confirmação de ronda, controle de jornada, resposta a incidente).
- Retenção (quanto tempo? 12 meses? alinhado com auditoria?).
- Acesso (quem pode consultar? admin, supervisor, equipe de campo?).

## Passagem de plantão
- Registro de entrega/recebimento entre turnos (quem assume, status do posto, pendências).

## Dados de demonstração / testes
- Nenhum colaborador real cadastrado até homologação.
- Ambiente de teste usará identificadores `.test.invalid` quando necessário.
