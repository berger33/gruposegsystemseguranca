import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const academiaDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoDir = path.resolve(academiaDir, '..');
const logoPath = path.join(academiaDir, 'public/vendor/seg-system-logo.svg');
const svg = fs.readFileSync(logoPath, 'utf8');
const styles = fs.readFileSync(path.join(academiaDir, 'public/styles.css'), 'utf8');

test('logo mantém a referência original intacta e só recorta o contorno externo', () => {
  const image = svg.match(/href="data:image\/jpeg;base64,([^"]+)"/);
  assert.ok(image, 'SVG deve incorporar a imagem oficial original');
  const original = fs.readFileSync(path.join(repoDir, 'public/brand/grupo-seg-system-original.jpg'));
  assert.deepEqual(Buffer.from(image[1], 'base64'), original);
  assert.match(svg, /<clipPath id="emblem" clipPathUnits="userSpaceOnUse">/);
  assert.match(svg, /M72 77H276V263Q276 269 270 272L174 307L78 272Q72 269 72 263Z/);
  assert.doesNotMatch(svg, /<text\b|<tspan\b/, 'textos e elementos internos não devem ser redesenhados');
  assert.equal(
    fs.readFileSync(path.join(repoDir, 'docs/academia-demo/vendor/seg-system-logo.svg'), 'utf8'),
    svg,
    'a demonstração estática deve usar o mesmo logo validado',
  );
});

test('logo não é cortado por círculo e preserva os tamanhos aprovados', () => {
  assert.match(styles, /\.brand-logo\s*\{[^}]*width:\s*63px;\s*height:\s*63px;/s);
  assert.match(styles, /\.hero-brand \.brand-logo\s*\{[^}]*width:\s*72px;\s*height:\s*72px;/s);
  assert.match(styles, /\.login-head \.brand-logo\s*\{[^}]*width:\s*87px;\s*height:\s*87px;/s);
  assert.match(styles, /\.brand-logo\s*\{[^}]*filter:\s*none;/s);
  assert.match(styles, /\.validation-logo\s*\{[^}]*border-radius:\s*0;/s);
});
