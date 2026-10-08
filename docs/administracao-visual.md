# Aparência do site

`/admin/aparencia` é a única entrada de menu para comparar e aplicar os dez layouts do site público. A galeria mostra a prévia em desktop e celular; aplicar exige a permissão `site.visual.write`, confirmação explícita e motivo, e grava a alteração na configuração e na auditoria do PostgreSQL. A página atualiza a prévia do site após a resposta confirmada do servidor.

O painel interno continua separado: TI → **Aparência do site** reutiliza a mesma galeria. Nenhuma seleção altera as telas internas de RH, TI ou administração. A identidade, o logo e o conteúdo do site são preservados.

O submenu antigo **Editor visual** foi retirado. `/admin/visual` permanece apenas como rota compatível e redireciona para `/admin/aparencia`; o editor avançado duplicado não é mais renderizado. Os endpoints EXT-12 permanecem no servidor por compatibilidade e governança, mas não são uma segunda entrada da galeria.

A migration 177 prepara o registro de autoria/motivo e as permissões de leitura e escrita para os perfis administrativos ativos, sem restaurar concessões revogadas. A API continua exigindo sessão individual, permissão concedida e mesma origem. Se a tela indicar que não consegue consultar ou aplicar, confira a conexão PostgreSQL, as migrations aplicadas e as permissões da identidade; não altere o banco manualmente para contornar o controle.

Na demonstração local, o site e o banco usam dados sintéticos. A seleção fica persistida somente nesse banco de demonstração e não publica conteúdo em hospedagem externa.
