// Gate focal UX-11: contrato de apresentação sem tocar o servidor canônico.
// O cenário HTTP/PostgreSQL/Chromium é orquestrado pelo script QA; este arquivo
// mantém as invariantes que podem ser executadas sem dados do operador.
import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
const page=await readFile(new URL('../src/app/admin/continuidade/ContinuityWorkspace.tsx',import.meta.url),'utf8');
test('workspace usa transporte discriminado e preserva estados',()=>{assert.match(page,/continuityRequest/);assert.match(page,/phase==='loading'/);assert.match(page,/phase==='failed'/);assert.match(page,/variant="empty"/);assert.match(page,/variant=\{x.kind==='denied'\?'denied':'error'\}/);assert.match(page,/Idempotency-Key/);assert.doesNotMatch(page,/style=/);});
test('ações canônicas não mudam URLs nem métodos',()=>{for(const path of ['/api/ext/continuity/plans','/transition','/exercises','/client-visibility'])assert.match(page,new RegExp(path.replaceAll('/','\\/')));assert.match(page,/method:'POST'/);});
