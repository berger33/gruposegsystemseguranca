// L01 / SEC-02, SEC-04 — guarda estática contra bypass por Promise não aguardada.
//
// A validação de sessão administrativa passou a consultar o banco, portanto é
// assíncrona. Uma chamada sem `await` devolve uma Promise, que é SEMPRE truthy:
// `const s = requireSession(req); if (!s) return 401;` deixaria de barrar
// qualquer requisição. Foi exatamente esse o risco da conversão feita no L01.
//
// Este teste falha o build se alguém reintroduzir o padrão, em qualquer módulo.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Toda função cujo retorno representa (ou deriva de) uma sessão autenticada.
const SESSION_FUNCTIONS = [
  'readSession',
  'readAdminSession',
  'requireSession',
  'requireAdminSession',
  'requireClientSession',
  'readClientSession',
  'getSession',
  'checkAuth',
  'ensureAuth',
];

async function serverFiles() {
  const dir = path.join(root, 'src/server');
  const entries = await readdir(dir);
  const files = entries.filter(f => f.endsWith('.mjs')).map(f => path.join(dir, f));
  files.push(path.join(root, 'server.mjs'));
  return files;
}

/** Remove comentários e strings para não gerar falso positivo em texto livre. */
function stripNoise(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
    .replace(/`(?:\\.|[^`\\])*`/g, '``')
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
    .replace(/"(?:\\.|[^"\\])*"/g, '""');
}

test('toda chamada a função de sessão é aguardada (sem bypass por Promise truthy)', async () => {
  const offenders = [];
  for (const file of await serverFiles()) {
    const source = stripNoise(await readFile(file, 'utf8'));
    const lines = source.split('\n');
    for (const name of SESSION_FUNCTIONS) {
      // Ocorrências como chamada, não como declaração, propriedade de objeto
      // literal (`requireSession: readSession`) nem import/export.
      const pattern = new RegExp(`(^|[^\\w.$])${name}\\s*\\(`, 'g');
      lines.forEach((line, index) => {
        let match;
        pattern.lastIndex = 0;
        while ((match = pattern.exec(line)) !== null) {
          const before = line.slice(0, match.index + match[1].length);
          if (/\b(async\s+)?function\s+$/.test(before)) continue; // declaração
          if (/\b(const|let|var)\s+$/.test(before)) continue;      // `const x = ...`? tratado abaixo
          if (/await\s+$/.test(before)) continue;                  // já aguardada
          offenders.push(`${path.relative(root, file)}:${index + 1}: ${line.trim().slice(0, 120)}`);
        }
      });
    }
  }
  assert.deepEqual(offenders, [],
    `Chamada de sessão sem await concede acesso (Promise é truthy):\n${offenders.join('\n')}`);
});

test('todo wrapper que devolve sessão é declarado async', async () => {
  const offenders = [];
  const wrapperNames = ['requireAdminSession', 'requireClientSession', 'getSession', 'checkAuth', 'ensureAuth', 'requireSession'];
  for (const file of await serverFiles()) {
    const source = stripNoise(await readFile(file, 'utf8'));
    for (const name of wrapperNames) {
      // declaração por `function nome(` sem async
      const declRe = new RegExp(`(^|[^\\w])function\\s+${name}\\s*\\(`, 'gm');
      let m;
      while ((m = declRe.exec(source)) !== null) {
        const before = source.slice(Math.max(0, m.index - 12), m.index + m[1].length);
        if (!/async\s*$/.test(before)) {
          offenders.push(`${path.relative(root, file)}: function ${name} não é async`);
        }
      }
      // declaração por arrow `const nome = (` sem async
      const arrowRe = new RegExp(`(const|let)\\s+${name}\\s*=\\s*(?!async)\\(`, 'g');
      if (arrowRe.test(source)) {
        offenders.push(`${path.relative(root, file)}: arrow ${name} não é async`);
      }
    }
  }
  assert.deepEqual(offenders, [], `Wrapper de sessão síncrono:\n${offenders.join('\n')}`);
});

test('readSession do server.mjs valida no servidor, não apenas a assinatura', async () => {
  const source = await readFile(path.join(root, 'server.mjs'), 'utf8');
  assert.match(source, /async function readSession\(req\)/,
    'readSession precisa ser assíncrona para consultar o estado da sessão');
  assert.match(source, /staffSessionStore\.validate\(/,
    'readSession precisa consultar auth_staff_sessions, não confiar só no cookie assinado');
  // Falha de banco não pode conceder sessão.
  const body = source.slice(source.indexOf('async function readSession(req)'));
  const fn = body.slice(0, body.indexOf('\n}\n') + 1);
  assert.match(fn, /catch[\s\S]*return null/, 'erro ao validar sessão deve negar (fail-closed)');
});

test('o fallback de papel para admin foi removido do login de staff', async () => {
  const source = await readFile(path.join(root, 'server.mjs'), 'utf8');
  assert.doesNotMatch(source, /rec\.role\s*\|\|\s*["']admin["']/,
    'identidade sem perfil de staff não pode virar admin');
  assert.match(source, /evaluateStaffLogin\(/,
    'o login de staff deve usar a decisão centralizada e fail-closed');
});
