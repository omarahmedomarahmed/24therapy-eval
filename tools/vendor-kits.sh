#!/usr/bin/env bash
# Copy the kit files downloaded from the partner portal (kits/, git-ignored) into each
# platform's vendor/ folder (git-ignored). The kits are under the 24Therapy Kit Licence and
# NDA: they are never committed to this public repository.
set -euo pipefail; cd "$(dirname "$0")/.."; X=kits/x
for f in kits/*/*.zip; do n=$(basename "$f" .zip); [ -d "$X/$n" ] || unzip -q -o "$f" -d "$X/$n"; done
mkdir -p vendor && cp "$X/24therapy-browser/kits/browser/dist/24therapy-browser.iife.js" vendor/24therapy-browser-0.6.1.iife.js
cp "$X/24therapy-server-node/kits/server/node/dist/twentyfour.js" vendor/twentyfour.js
cp "$X/24therapy-server-python/kits/server/python/twentyfour.py" vendor/twentyfour.py
cp "$X/24therapy-server-php/kits/server/php/TwentyFourTherapy.php" vendor/TwentyFourTherapy.php
cp "$X/24therapy-server-dotnet/kits/server/dotnet/TwentyFourTherapy.cs" "$X/24therapy-server-dotnet/kits/server/dotnet/TwentyFourTherapy.AspNetCore.cs" vendor/
cp "$X/24therapy-server-java/kits/server/java/TwentyFourTherapy.java" vendor/TwentyFourTherapy.java
cp "$X/24therapy-cli/kits/cli/24t.mjs" vendor/24t.mjs
echo "kits copied to vendor/"
