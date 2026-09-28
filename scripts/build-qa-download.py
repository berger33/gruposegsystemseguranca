#!/usr/bin/env python3
"""Pacote QA local permitido: código-fonte, sem estado/segredos/artefatos antigos.
Uso: python3 scripts/build-qa-download.py. Não publica release/produção.
"""
from pathlib import Path
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED
import hashlib

ROOT = Path(__file__).resolve().parent.parent
ARCHIVE = ROOT / 'downloads' / 'seg-system-qa-local.zip'
TOP = 'seg-system-qa-local'
DIRS = ('src', 'public', 'db', 'scripts', 'tests', 'docs')
FILES = ('package.json', 'package-lock.json', 'server.mjs', 'next.config.ts',
         'next-env.d.ts', 'tsconfig.json', 'README.md', 'LEIA-ME-QA.md',
         'INICIAR-QA.sh', 'INICIAR-QA.bat')
FORBIDDEN = {'.env', '.data', '.git', '.next', 'node_modules', 'out', 'dist',
             'downloads', '__pycache__', 'build', 'coverage', '.cache'}
ALLOWED_SUFFIXES = {'.js', '.mjs', '.cjs', '.json', '.md', '.ts', '.tsx', '.mts', '.sql',
                    '.sh', '.py', '.css', '.svg', '.png', '.jpg', '.jpeg',
                    '.webp', '.ico', '.txt', '.html', '.woff', '.woff2', '.gif',
                    '.xml', '.webmanifest', '.yml', '.yaml'}

paths = [ROOT / f for f in FILES]
for folder in DIRS:
    paths += list((ROOT / folder).rglob('*'))
paths = sorted(p for p in paths if p.is_file())
for p in paths:
    rel = p.relative_to(ROOT)
    if p.is_symlink() or any(part in FORBIDDEN or part.startswith('.env') for part in rel.parts):
        raise SystemExit(f'Unsafe package entry: {rel}')
    if p.suffix.lower() not in ALLOWED_SUFFIXES and p.name not in FILES:
        raise SystemExit(f'Unexpected package extension: {rel}')
    if p.stat().st_size > 12_000_000:
        raise SystemExit(f'Unexpected large source file: {rel}')
for name in FILES:
    if not (ROOT / name).is_file():
        raise SystemExit(f'Missing required launcher source: {name}')
ARCHIVE.parent.mkdir(exist_ok=True)
# Hora fixa para builds reproduzíveis; nenhum segredo/arquivo oculto é incluído.
with ZipFile(ARCHIVE, 'w', compression=ZIP_DEFLATED, compresslevel=6) as z:
    for p in paths:
        rel = p.relative_to(ROOT).as_posix()
        info = ZipInfo(f'{TOP}/{rel}', (2026, 9, 28, 12, 0, 0))
        info.compress_type = ZIP_DEFLATED
        info.external_attr = (0o755 if p.name == 'INICIAR-QA.sh' else 0o644) << 16
        z.writestr(info, p.read_bytes(), compress_type=ZIP_DEFLATED, compresslevel=6)
    bad = z.testzip()
    if bad:
        raise SystemExit(f'Corrupted entry: {bad}')
sha = hashlib.sha256(ARCHIVE.read_bytes()).hexdigest()
(ARCHIVE.parent / (ARCHIVE.name + '.sha256')).write_text(f'{sha}  {ARCHIVE.name}\n')
print(f'QA_PACKAGE_READY: {ARCHIVE.relative_to(ROOT)} {ARCHIVE.stat().st_size} bytes, '
      f'{len(paths)} files; SHA256 {sha}')
