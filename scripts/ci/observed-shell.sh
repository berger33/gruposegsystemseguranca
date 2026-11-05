#!/usr/bin/env bash
# Preserve the original step exit code; mirror a redacted failure tail into
# check annotations when the log storage endpoint cannot be downloaded.
log=$(mktemp)
bash --noprofile --norc -eo pipefail "$1" 2>&1 | tee "$log"
code=${PIPESTATUS[0]}
if [ "$code" -ne 0 ]; then
  node --input-type=module - "$log" <<'JS'
import fs from 'node:fs';
const lines = fs.readFileSync(process.argv[2], 'utf8').split('\n');
const excerpts = [];
for (let i = 0; i < lines.length; i++) if (/^not ok|^#?\s*(?:Error:|error:|QA_PG_FAILED|QA_PG_SUPERVISOR: (?!complete))/.test(lines[i])) excerpts.push(...lines.slice(i, i + 40));
let text = [...excerpts.slice(0, 400), ...lines.slice(-60)].join('\n');
text = text.replace(/https?:\/\/\S+|postgres(?:ql)?:\/\/\S+/gi, '[url redacted]')
  .replace(/((?:password|secret|token|cookie|authorization)\s*[:=]\s*)\S+/gi, '$1[redacted]');
console.log('::error::' + text.slice(0, 50000).replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A'));
JS
fi
rm -f "$log"
exit "$code"
