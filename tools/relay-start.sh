#!/usr/bin/env bash
# Start the public relay for the mobile platforms (Qamar: Java, Bahr: Python, Rawda: .NET) in a
# Vercel Sandbox. Keys come from the environment of this command, never from git.
set -euo pipefail; cd "$(dirname "$0")/.."
export PATH=$HOME/.dotnet:$PATH
start() { # slug n port server-cmd...
  local slug=$1 n=$2 port=$3; shift 3
  local key="P${n}_API_KEY"; local vt=$((4000 + n))
  (cd base/video && VIDEO_TOKEN_PORT=$vt nohup node server.mjs > /tmp/vt-$slug.log 2>&1 &)
  TWENTYFOUR_KEY=${!key} nohup node vendor/24t.mjs listen --forward-to http://localhost:$port/24t/webhooks > /tmp/listen-$slug.log 2>&1 &
  for i in $(seq 1 30); do grep -q whsec_ /tmp/listen-$slug.log && break; sleep 1; done
  local secret; secret=$(grep -o 'whsec_[A-Za-z0-9_-]*' /tmp/listen-$slug.log | head -1)
  PLATFORM=$slug PORT=$port VIDEO_PROVIDER=${VIDEO_PROVIDER:-agora} VIDEO_TOKEN_PORT=$vt TWENTYFOUR_API_KEY=${!key} \
    TWENTYFOUR_WEBHOOK_SECRET=$secret TWENTYFOUR_WIDGET_ORIGIN=https://$slug.example.com BIND_HOST=0.0.0.0 SESSION_SECRET=$(head -c16 /dev/urandom | od -An -tx1 | tr -d ' \n') \
    nohup "$@" > /tmp/server-$slug.log 2>&1 &
}
start qamar 5 3050 java -cp servers/java/out Server
start bahr 6 3060 python3 servers/python/server.py
start rawda 7 3070 dotnet run --no-build --project servers/dotnet
sleep 8; for p in 3050 3060 3070; do curl -s -o /dev/null -w "$p %{http_code}\n" localhost:$p/config; done
