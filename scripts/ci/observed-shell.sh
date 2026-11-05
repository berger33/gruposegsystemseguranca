#!/usr/bin/env bash
# Preserve the original step exit code; mirror a redacted failure tail into
# check annotations when the log storage endpoint cannot be downloaded.
log=$(mktemp)
bash --noprofile --norc -eo pipefail "$1" 2>&1 | tee "$log"
code=${PIPESTATUS[0]}
if [ "$code" -ne 0 ]; then
  node --input-type=module - "$log" <<'JS'
import fs from 'node:fs';
let text = fs.readFileSync(process.argv[2], 'utf8').split('\n').slice(-90).join('\n');
text = text.replace(/https?:\/\/\S+|postgres(?:ql)?:\/\/\S+/gi, '[url redacted]')
  .replace(/((?:password|secret|token|cookie|authorization)\s*[:=]\s*)\S+/gi, '$1[redacted]');
for (const line of text.split('\n')) console.log('::error::' + line.replaceAll('%', '%25').replaceAll('\r', '%0D'));
JS
fi
rm -f "$log"
exit "$code"
