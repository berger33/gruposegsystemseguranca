import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [page, navigation, api, dispatcher] = await Promise.all([
  read("src/app/cliente/app/contatos/page.tsx"),
  read("src/app/cliente/app/ClientAppNavigation.tsx"),
  read("src/server/client-space-api.mjs"),
  read("server.mjs"),
]);

test("CLI-02 portal contacts: navigation exposes the client-only workspace", () => {
  assert.match(navigation, /\/cliente\/app\/contatos.*Contatos e acessos/);
  assert.match(page, /aria-labelledby="contacts-title"/);
  assert.match(page, /Nome do contato/);
  assert.match(page, /E-mail do contato/);
});

test("CLI-02 portal contacts: reads only the active account and has explicit loading/error states", () => {
  assert.match(page, /\/api\/client\/contacts\?account=/);
  assert.match(page, /Carregando contatos autorizados/);
  assert.match(page, /Tentar novamente/);
  assert.match(page, /Nenhum contato foi vinculado/);
  assert.match(page, /latestRequest/);
});

test("CLI-02 portal contacts: delegates through the client endpoint without implying access", () => {
  assert.match(page, /\/api\/client\/contacts\/delegate/);
  assert.match(page, /Nenhuma identidade, sessão ou autorização de acesso foi criada/);
  assert.match(page, /Ele fica pendente/);
  assert.doesNotMatch(page, /\/api\/hr\/cli-client-contacts|\/api\/hr\/cli-contact-delegate/);
});

test("CLI-02 client contact APIs are dispatched separately from staff handlers", () => {
  assert.match(dispatcher, /\/api\/client\/contacts.*handleClientContacts/);
  assert.match(dispatcher, /\/api\/client\/contacts\/delegate.*handleClientContactDelegate/);
  assert.match(api, /async function handleClientContacts/);
  assert.match(api, /async function handleClientContactDelegate/);
  assert.match(api, /status = 'ativo'/);
  assert.match(api, /can_delegate = true/);
  assert.match(api, /'pendente_convite',false/);
});

test("CLI-02 contact UI exposes only own contacts and direct delegations", () => {
  assert.match(api, /id = ANY\(\$3::uuid\[\]\) OR delegated_by_contact_id = ANY\(\$3::uuid\[\]\)/);
  assert.match(api, /action: "contact_list"/);
  assert.match(api, /action: "contact_delegate"/);
  assert.match(page, /roleLabel\[contact.role\]/);
  assert.match(page, /scope\.can_delegate/);
});
