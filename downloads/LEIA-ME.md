# ATENÇÃO — pacotes OBSOLETOS (não usar como instalação)

**Reconciliação:** 28/10/2026 · `main` `5f45fc0` (PR #300) · fonte de estado: [`../docs/STATUS-VIGENTE.md`](../docs/STATUS-VIGENTE.md).

Os arquivos `*.zip` deste diretório são **fotografias históricas** de prévias visuais (layouts 01–10) e de pacotes de QA/homologação. Os três pacotes executáveis (`seg-system-beta.zip`, `seg-system-qa-local.zip`, `seg-system-homologacao-local.zip`) foram gerados quando o repositório tinha cerca de **96 migrações**; o código fonte vigente contém **182 migrações** (001–182), **101 rotas** e dependências diferentes (`next` 16.4.2, `nodemailer` 10.2.1).

Consequências práticas:

- **Não** use estes ZIPs como instalação, demonstração persistente, homologação ou produção.
- **Não** os distribua por link externo: não receberam as correções de segurança, RBAC, MFA, portal do cliente, financeiro, EXT e UX posteriores.
- Eles **não** são backup operacional e não contêm dados reais.
- Para executar o sistema atual, use o código-fonte desta branch: `npm ci`, PostgreSQL 17, `npm run db:migrate` (001–181) e `npm start`. Para os pacotes de QA/homologação, regenere-os com `scripts/build-qa-download.py` / `scripts/build-homologacao-download.py` e publique-os como artefato de release versionado, fora do índice do Git.

O teste `tests/package-artifacts.test.mjs` exige que este aviso acompanhe a contagem vigente de migrações **e de rotas**. Ao criar a migração **182** ou uma rota nova, atualize os dois números e **regenere ou remova** os ZIPs.
