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

// Interface: caminhos relativos (o site fica em um subcaminho do GitHub Pages).
let html = fs.readFileSync(path.join(academia, 'public', 'index.html'), 'utf8');
html = html.replace(/href="\/styles\.css\?v=\d+"/, 'href="styles.css"');
const appTag = /\s*<script src="\/app\.js\?v=\d+"><\/script>/;
if (!appTag.test(html)) throw new Error('index.html: tag de app.js não encontrada');
html = html.replace(appTag, '\n  <script type="module" src="src/demo-shim.mjs"></script>');
fs.writeFileSync(path.join(out, 'index.html'), html);
fs.copyFileSync(path.join(academia, 'public', 'styles.css'), path.join(out, 'styles.css'));
fs.copyFileSync(path.join(academia, 'public', 'app.js'), path.join(out, 'app.js'));

// Lógica compartilhada com o servidor (somente módulos sem dependências do Node).
for (const file of ['content.mjs', 'sectors.mjs', 'gamification.mjs', 'demo-users.mjs', 'demo-shim.mjs']) {
  fs.copyFileSync(path.join(academia, 'src', file), path.join(out, 'src', file));
}

fs.writeFileSync(path.join(out, '.nojekyll'), '');
console.log(`Demonstração gerada em ${path.relative(repoRoot, out)}`);
