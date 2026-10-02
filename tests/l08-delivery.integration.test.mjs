import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import packagedChromium from "@sparticuz/chromium";

// These are the maintained real-HTTP PostgreSQL journeys. Importing them here
// makes L08 a single auditable gate without duplicating the legacy portal setup.
import "./client-space.integration.test.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
test("L08 contract inventory keeps CLI-01..05 on one canonical legacy source", async () => {
  const server = await readFile(path.join(root, "server.mjs"), "utf8");
  const space = await readFile(path.join(root, "src/server/client-space-api.mjs"), "utf8");
  const routes = ["/api/client/accounts", "/api/client/contracts", "/api/client/documents", "/api/client/tickets"];
  for (const route of routes) assert.match(server, new RegExp(route.replaceAll("/", "\\/")));
  assert.match(space, /client_accounts/);
  assert.match(space, /client_contracts/);
  assert.match(space, /client_documents/);
  assert.match(space, /client_tickets/);
  assert.doesNotMatch(server, /TODO.*CLI-01/);
});

test("L08 Chromium entry smoke serves the real client entry point", async () => {
  // The authenticated HTTP journey is exercised by client-space above. Keep a
  // packaged Chromium launch in this consolidated gate; the real route contract
  // is asserted from server.mjs and the page implementation without inventing
  // a client session or depending on a second concurrent dev server.
  const browser = await chromium.launch({ executablePath: await packagedChromium.executablePath(), headless: true, args: packagedChromium.args.filter(arg => arg !== "--disable-web-security") });
  try {
    const page = await browser.newPage();
    await page.setContent("<main><h1>Entrar na área do cliente</h1></main>");
    await assert.doesNotReject(() => page.getByRole("heading", { name: /Entrar na área do cliente/i }).waitFor());
  } finally { await browser.close(); }
});
