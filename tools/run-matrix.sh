#!/usr/bin/env bash
# Run every cell of the given platforms (default column first, then the others).
cd "$(dirname "$0")/.."; set -a; . ./.env; set +a; export PATH=/opt/dotnet:$PATH
for slug in "$@"; do
  for pr in $(python3 -c "import json;print(' '.join(next(p for p in json.load(open('base/platforms.json')) if p['slug']=='$slug')['providers']))"); do
    [ "${SKIP_DONE:-1}" = 1 ] && [ -f evals/$slug/$pr/steps.json ] && grep -q '"verdict": "pass"' evals/$slug/$pr/steps.json && continue
    timeout 600 node tools/run-cell.mjs "$slug" "$pr" 2>&1 | grep VERDICT
  done
done
