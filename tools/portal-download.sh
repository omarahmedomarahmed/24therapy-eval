#!/usr/bin/env bash
# Download kit zips from the partner portal with plain HTTP (no browser): the sign-in form is a
# server action that also works as a normal form post when Origin is set.
# usage: PORTAL_EMAIL=... PORTAL_PASSWORD=... tools/portal-download.sh kits/relay server-node server-java ...
set -euo pipefail; dir=$1; shift; mkdir -p "$dir"; J=$(mktemp); B=https://www.24therapy.app
A=$(curl -sS -c "$J" $B/portal/sign-in | grep -o 'name="\$ACTION_ID_[0-9a-f]*"' | head -1 | sed 's/name="//;s/"//')
curl -sS -b "$J" -c "$J" -o /dev/null -H "Origin: $B" -H "Referer: $B/portal/sign-in" -F "$A=" -F "email=$PORTAL_EMAIL" -F "password=$PORTAL_PASSWORD" $B/portal/sign-in
for k in "$@"; do curl -sSf -b "$J" -o "$dir/24therapy-$k.zip" "$B/portal/kits/download/$k" && echo "downloaded $k"; done
rm -f "$J"
