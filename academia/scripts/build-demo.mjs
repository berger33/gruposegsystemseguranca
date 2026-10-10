// Gera a versão estática de demonstração em docs/academia-demo/ (publicada pelo GitHub Pages).
// Usa os mesmos arquivos da interface e as mesmas regras do servidor. Uso: npm run build:demo
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const academia = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(academia, '..');
const out = path.join(repoRoot, 'docs', 'academia-demo');

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'src'), { recursive: true });
fs.mkdirSync(path.join(out, 'vendor'), { recursive: true });

// Interface: caminhos relativos (o site fica em um subcaminho do GitHub Pages).
let html = fs.readFileSync(path.join(academia, 'public', 'index.html'), 'utf8');
html = html.replace(/href="\/styles\.css\?v=\d+"/, 'href="styles.css?v=21"');
html = html.replace(/src="\/vendor\/qrcode\.js\?v=\d+"/, 'src="vendor/qrcode.js?v=16"');
const appTag = /\s*<script src="\/app\.js\?v=\d+"><\/script>/;
if (!appTag.test(html)) throw new Error('index.html: tag de app.js não encontrada');
html = html.replace(appTag, '\n  <script type="module" src="src/demo-shim.js"></script>');
fs.writeFileSync(path.join(out, 'index.html'), html);
fs.copyFileSync(path.join(academia, 'public', 'styles.css'), path.join(out, 'styles.css'));
fs.copyFileSync(path.join(academia, 'public', 'app.js'), path.join(out, 'app.js'));
fs.copyFileSync(path.join(academia, 'public', 'vendor', 'qrcode.js'), path.join(out, 'vendor', 'qrcode.js'));
fs.copyFileSync(path.join(academia, 'public', 'vendor', 'seg-system-logo.jpg'), path.join(out, 'vendor', 'seg-system-logo.jpg'));
fs.copyFileSync(path.join(academia, 'public', 'vendor', 'seg-system-logo-circle.svg'), path.join(out, 'vendor', 'seg-system-logo-circle.svg'));
fs.copyFileSync(path.join(academia, 'public', 'vendor', 'THIRD-PARTY-NOTICES.txt'), path.join(out, 'vendor', 'THIRD-PARTY-NOTICES.txt'));

// Lógica compartilhada com o servidor (somente módulos sem dependências do Node).
// Publicados com extensão .js: alguns servidores de páginas estáticas entregam .mjs com tipo errado
// e o navegador recusa o módulo. Os imports internos são reescritos para .js.
for (const file of ['content.mjs', 'sectors.mjs', 'access.mjs', 'acessos-api.mjs', 'gamification.mjs', 'demo-users.mjs', 'certificates.mjs', 'demo-shim.mjs']) {
  const source = fs.readFileSync(path.join(academia, 'src', file), 'utf8').replace(/(['"])(\.\/[\w-]+)\.mjs\1/g, '$1$2.js$1');
  fs.writeFileSync(path.join(out, 'src', file.replace(/\.mjs$/, '.js')), source);
}

fs.writeFileSync(path.join(out, '.nojekyll'), '');
console.log(`Demonstração gerada em ${path.relative(repoRoot, out)}`);
