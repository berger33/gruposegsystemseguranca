-- Setup de testes funcionais: administradores confirmados pelo proprietário.
-- Senhas geradas com hash scrypt (node:crypto) e devem ser rotacionadas antes da homologação.
-- Não usar para produção sem troca de credenciais e auditoria completa.
INSERT INTO auth_identities (id, kind, email, display_name, status, created_at) VALUES ('706acbf8-cb18-4baa-8a0d-d72c35b6517b', 'staff', 'william.berger@dev.com.br', 'William Berger', 'active', NOW()) ON CONFLICT (id) DO NOTHING;
INSERT INTO auth_credentials (identity_id, password_hash, password_set_at) VALUES ('706acbf8-cb18-4baa-8a0d-d72c35b6517b', 's1$16384$8$1$64$CtFf0-UM6dXOVImcYIXuFw$FyRZ5A4P88KEWIM5MmtNvULZ9gq3UR6BfctWJMGlqVDYZB-Xy15urpBy_g1zFl0gJoJLRRsO8-0agwBQAUO-qQ', NOW()) ON CONFLICT (identity_id) DO NOTHING;
INSERT INTO auth_staff_profiles (identity_id, role, assigned_by, created_at) VALUES ('706acbf8-cb18-4baa-8a0d-d72c35b6517b', 'ti', 'invitation', NOW()) ON CONFLICT (identity_id) DO NOTHING;

INSERT INTO auth_identities (id, kind, email, display_name, status, created_at) VALUES ('596545f5-fdaa-41db-948f-b7f8853415d7', 'staff', 'berger.melo.william@gmail.com', 'Andreia', 'active', NOW()) ON CONFLICT (id) DO NOTHING;
INSERT INTO auth_credentials (identity_id, password_hash, password_set_at) VALUES ('596545f5-fdaa-41db-948f-b7f8853415d7', 's1$16384$8$1$64$INUV04rDYg18Q_p27CmNQw$V8wOGaNZdl4ZtW3R_-HZu1nD2iKQO_ZUz9cGdGQhCtPfLtduzInNXcq0R2wBROkH-3rZT5kWqLw10Mr6jT388A', NOW()) ON CONFLICT (identity_id) DO NOTHING;
INSERT INTO auth_staff_profiles (identity_id, role, assigned_by, created_at) VALUES ('596545f5-fdaa-41db-948f-b7f8853415d7', 'rh', 'invitation', NOW()) ON CONFLICT (identity_id) DO NOTHING;

INSERT INTO auth_identities (id, kind, email, display_name, status, created_at) VALUES ('dfd7465b-c03e-44ba-ad45-10acec2e865e', 'staff', 'will.melo.berger@gmail.com', 'Marcelo Pereira', 'active', NOW()) ON CONFLICT (id) DO NOTHING;
INSERT INTO auth_credentials (identity_id, password_hash, password_set_at) VALUES ('dfd7465b-c03e-44ba-ad45-10acec2e865e', 's1$16384$8$1$64$JYM_DUP5AE02n0hl7l4Npw$ZbFC8A_M-ZDvvLfDEX513YI5B15Y8AnK4wqj408pSPIz2eNOIYvIyHYkQT5Ksjklt9XVcOa2sS6a9Ra3ekXEZg', NOW()) ON CONFLICT (identity_id) DO NOTHING;
INSERT INTO auth_staff_profiles (identity_id, role, assigned_by, created_at) VALUES ('dfd7465b-c03e-44ba-ad45-10acec2e865e', 'admin', 'invitation', NOW()) ON CONFLICT (identity_id) DO NOTHING;
