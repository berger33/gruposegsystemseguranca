// Contrato explícito dos gates: primeiro foco não prova percurso; nomes de
// arquivo/estado também não. Só uma sequência não vazia de alvos medidos conta.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export function hasKeyboardTraversal(entry) {
  return Array.isArray(entry?.percursoTeclado)
    && entry.percursoTeclado.length > 0
    && entry.percursoTeclado.every(target => typeof target === 'string' && target.trim().length > 0);
}

/**
 * Acrescenta só a medição de teclado à captura correspondente. Preserva as
 * outras entradas/metadados do resumo, inclusive os registros históricos.
 * Os gates chamam somente após afirmar alcance por Tab e foco visível.
 * Sem diretório de evidência, o gate não escreve nenhum arquivo.
 */
export async function recordKeyboardCapture(directory, measurement) {
  if (!directory) return;
  if (!hasKeyboardTraversal(measurement) || measurement.firstFocus !== true) {
    throw new Error('keyboard_evidence_requires_measured_traversal_and_visible_focus');
  }
  const file = path.join(directory, 'resumo.json');
  let summary;
  try {
    summary = JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    summary = { stage: measurement.stage, generatedBy: 'gate PostgreSQL/Chromium; medição explícita de teclado', entries: [] };
  }
  if (!Array.isArray(summary.entries)) throw new Error('keyboard_evidence_entries_invalid');
  const entry = summary.entries.find(item => item.route === measurement.route
    && path.basename(item.screenshot || item.file || '') === measurement.file);
  if (entry) {
    if (entry.viewport !== measurement.viewport) throw new Error('keyboard_evidence_viewport_mismatch');
    entry.firstFocus = measurement.firstFocus;
    entry.percursoTeclado = measurement.percursoTeclado;
  } else {
    summary.entries.push(measurement);
  }
  await mkdir(directory, { recursive: true });
  await writeFile(file, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
}
