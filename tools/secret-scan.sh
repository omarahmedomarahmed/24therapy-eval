#!/usr/bin/env bash
# Fails if a staged file holds a 24Therapy key, a webhook/widget secret, a provider secret or a portal password.
set -uo pipefail; cd "$(dirname "$0")/.."
PAT='24t_sk_(test|live)_[A-Za-z0-9_-]{20,}|whsec_[A-Za-z0-9_-]{10,}|wgt_[A-Za-z0-9_-]{10,}|plk_[A-Za-z0-9_-]{10,}|Eval-[0-9a-f]{12}-24T|-----BEGIN [A-Z ]*PRIVATE KEY'
[ -f .env ] && while IFS='=' read -r k v; do v=${v//\'/}; [ ${#v} -ge 8 ] && [[ $k =~ (KEY|SECRET|PASSWORD|CERTIFICATE|APP_ID|APPLICATION_ID) ]] && PAT="$PAT|$(printf '%s' "$v" | sed 's/[][\.*^$+?(){}|/]/\\&/g')"; done < .env
hits=$(git diff --cached --name-only -z | xargs -0 -r grep -IlE "$PAT" 2>/dev/null)
if command -v gitleaks >/dev/null; then gitleaks protect --staged --no-banner || hits="$hits gitleaks"; fi
if [ -n "$hits" ]; then echo "SECRET SCAN FAILED: $hits"; exit 1; fi; echo "secret scan: clean"
