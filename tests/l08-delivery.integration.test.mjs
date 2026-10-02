import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import packagedChromium from "@sparticuz/chromium";
import { spawn } from "node:child_process";
import { createServer } from "node:net";

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
  const probe = createServer();
  await new Promise((resolve, reject) => { probe.once("error", reject); probe.listen(0, "127.0.0.1", resolve); });
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const child = spawn(process.execPath, ["server.mjs", "--dev"], {
    cwd: root,
    env: { ...process.env, PORT: String(port), BIND_HOST: "127.0.0.1", NODE_ENV: "development", NEXT_DIST_DIR: ".next/l08-browser-smoke", NEXT_TELEMETRY_DISABLED: "1", SITE_VISUAL_SELECTION_ENABLED: "false" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const logs = [];
  child.stdout.on("data", chunk => logs.push(String(chunk)));
  child.stderr.on("data", chunk => logs.push(String(chunk)));
  try {
    const deadline = Date.now() + 90_000;
    while (!logs.join("").includes("listening on")) {
      if (child.exitCode !== null) throw new Error(`browser smoke server exited: ${logs.join("")}`);
      if (Date.now() > deadline) throw new Error(`browser smoke server timeout: ${logs.join("")}`);
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    const browser = await chromium.launch({ executablePath: await packagedChromium.executablePath(), headless: true, args: packagedChromium.args.filter(arg => arg !== "--disable-web-security") });
    try {
      const page = await browser.newPage();
      await page.goto(`http://127.0.0.1:${port}/cliente/entrar`, { waitUntil: "domcontentloaded" });
      await assert.doesNotReject(() => page.getByRole("heading", { name: /Entrar na área do cliente/i }).waitFor());
      assert.equal(await page.locator("input[type=email]").count(), 1);
      assert.equal(await page.locator("input[type=password]").count(), 1);
    } finally { await browser.close(); }
  } finally {
    if (child.exitCode === null) child.kill("SIGTERM");
    await new Promise(resolve => {
      if (child.exitCode !== null) return resolve();
      child.once("exit", resolve);
      setTimeout(resolve, 5000).unref();
    });
  }
});
