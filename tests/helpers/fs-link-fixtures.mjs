import { symlink, mkdir } from 'node:fs/promises';
import path from 'node:path';

// E10: no Windows, criar symlink de arquivo/diretório exige modo desenvolvedor
// ou privilégio elevado (EPERM). Junctions de diretório não exigem, e um
// diretório com nome de objeto continua sendo uma entrada insegura para o
// inventário (!isFile()). Assim as asserções de segurança permanecem iguais
// nas duas plataformas, sem pular nem enfraquecer nenhum teste.
export async function linkDirectoryOutside(target, linkPath) {
  await symlink(target, linkPath, process.platform === 'win32' ? 'junction' : 'dir');
}

export async function createUnsafeObjectEntry({ objectsDir, canaryPath, key }) {
  const entry = path.join(objectsDir, key);
  if (process.platform === 'win32') {
    await mkdir(entry);
    return 'directory';
  }
  await symlink(canaryPath, entry, 'file');
  return 'symlink';
}
