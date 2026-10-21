import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const css = await readFile(path.join(root, "src/components/Layout09.module.css"), "utf8");

function rule(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]+)\\}`));
  assert.ok(match, `regra ${selector} deve existir`);
  return match[1];
}

function property(block, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = block.match(new RegExp(`(?:^|;)\\s*${escaped}\\s*:\\s*([^;]+)`));
  return match?.[1]?.trim() ?? null;
}

function hex(value, tokens) {
  const token = value.match(/^var\(--([\w-]+)\)$/)?.[1];
  const result = token ? tokens[token] : value;
  assert.match(result ?? "", /^#[\da-f]{3,8}$/i, `cor deve resolver a partir de token/código hexadecimal: ${value}`);
  if (result.length === 4) return `#${[...result.slice(1)].map((digit) => digit + digit).join("")}`;
  return result;
}

function luminance(value) {
  const rgb = hex(value, {}).slice(1).match(/../g).map((part) => parseInt(part, 16) / 255);
  const channels = rgb.map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(foreground, background) {
  const a = luminance(foreground);
  const b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

test("PU6: rótulos e números pendentes da progressão mantêm contraste legível", () => {
  const site = rule(".site");
  const tokens = Object.fromEntries([...site.matchAll(/--([\w-]+)\s*:\s*(#[\da-f]{3,8})\s*;/gi)].map((match) => [match[1], match[2]]));
  const background = hex(tokens.white ?? "#ffffff", tokens);
  const pending = hex(property(rule(".progressStep"), "color"), tokens);
  const ratio = contrast(pending, background);

  assert.ok(ratio >= 4.5, `texto pendente precisa de pelo menos 4,5:1; medido ${ratio.toFixed(2)}:1`);
});

test("PU6: etapas ativas preservam o acento e a diferenciação visual existentes", () => {
  const site = rule(".site");
  const tokens = Object.fromEntries([...site.matchAll(/--([\w-]+)\s*:\s*(#[\da-f]{3,8})\s*;/gi)].map((match) => [match[1], match[2]]));
  const background = hex(tokens.white ?? "#ffffff", tokens);
  const active = hex(property(rule(".progressActive"), "color"), tokens);
  const pending = hex(property(rule(".progressStep"), "color"), tokens);

  assert.notEqual(active.toLowerCase(), pending.toLowerCase(), "etapa ativa continua visualmente distinta da pendente");
  assert.ok(contrast(active, background) >= 4.5, "o texto ativo continua legível no fundo branco da prévia");
  assert.match(rule(".progressActive > span"), /background\s*:\s*var\(--blue\)/, "círculo ativo mantém o acento azul existente");
});
