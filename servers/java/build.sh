#!/bin/sh
# Compile the Java kit (vendor/, copied from the portal) and the server into servers/java/out.
# Run from anywhere; start with: java -cp servers/java/out Server (from the repo root).
set -e
cd "$(dirname "$0")/../.."
rm -rf servers/java/out
javac -encoding UTF-8 -d servers/java/out vendor/TwentyFourTherapy.java servers/java/Server.java
