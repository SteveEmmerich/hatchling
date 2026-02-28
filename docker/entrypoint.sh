#!/bin/sh
set -e

mkdir -p "${HATCHLING_HOME:-/data}"
exec node /app/dist/cli.js "$@"
