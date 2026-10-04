# Prompt master — continuidade Arena

Você vai concluir o projeto berger33/gruposegsystemseguranca no GitHub antes de uma nova instalação na máquina do operador.

Leia os arquivos já publicados em docs/auditoria-2026-10-04/: README.md, AUDITORIA.md, 02-PLANO-ARENA.md e 03-ACEITE.md. Se ainda não estiverem no main, obtenha-os da branch docs/auditoria-arena-2026-10-04. Preserve a identificação de que a auditoria usou a base 540faf6c5124fd243fc3e287527ff4f6983ce8f1; não procure anexos ou arquivos na máquina do operador. Consulte main atual e suas instruções: não use cópia local antiga nem estados históricos como verdade atual.

Execute agora F00 (reconciliação dos 222 requisitos) e, em seguida, F01 (login e navegação central por papel). Não pare apenas em plano. Se F01 já estiver comprovadamente resolvida no main, registre evidência e execute a primeira fatia ainda pendente da sequência. Mantenha uma fatia de implementação por PR; não agrupe EXT e IA na mesma mudança. A sequência posterior está no plano, para continuidade entre sessões.

Achados de partida: /admin retornou 404; /admin/marcelo anônimo não ofereceu login; login funcional em /admin/clientes usa rótulo TI para administrador. Build passou. Windows executou 511/514 unitários, com três falhas de symlink EPERM; não esconder essas falhas. PG17 aplicou 001–156 com replay e checksums, scheduler 3600/TI concluiu e deduplicou após reinício. EXT-08..17 e AI-01..10 ainda não podem ser tratados como homologados. Existem muitos PRs alternativos: compare antes de integrar.

Preserve credenciais individuais, autorização no servidor, isolamento de clientes, auditoria/transações, idempotência e guard PLAT-01. Não altere migrações aplicadas; consulte o próximo número livre. Use PostgreSQL descartável e dados fictícios. Não acesse banco real do operador, não solicite senhas e não inclua configuração local nos commits. SMTP real e hospedagem definitiva fora do escopo. Projetos de vídeo/biometria/emergência não devem ser apresentados como integrações reais quando só há simulação/metadados.

Cada fatia deve ter comportamento UI→API→dados funcionando, erros e permissões testados, documentação honesta e provas sanitizadas. IA requer inferência real validada e acesso filtrado antes da recuperação; fallback não é LLM funcionando. Não marque pronto pelo fato de existir schema ou rota.

Ao terminar: informe o que mudou, PR/commit, testes/resultados, limitações e próximo requisito. Atualize docs/CONTINUACAO-ARENA.md e entregue um prompt completo para a próxima sessão. Não declare o sistema inteiro concluído enquanto houver requisitos pendentes; diferencie pronto para demonstração de pronto para uso operacional.
