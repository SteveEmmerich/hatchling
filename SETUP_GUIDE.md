# Hatchling Setup Guide (Long-Term Creature)

This guide is optimized for running Hatchling as a long-lived organism with durable state.

## 1) Choose a persistent home directory

Pick a location that will not be deleted between runs:

```bash
export HATCHLING_HOME="$HOME/.hatchling"
export HATCHLING_HINDBRAIN_BACKEND=cpu
```

If you want a different location (e.g. on a mounted disk), set `HATCHLING_HOME` accordingly.

## 2) Install dependencies

```bash
npm install
```

Optional: make the CLI available globally

```bash
npm link
```

## One-line install (current branch)

```bash
curl -fsSL https://raw.githubusercontent.com/SteveEmmerich/hatchling/codex/organism-architecture-refactor/scripts/install.sh | bash
```

Override defaults if needed:

```bash
HATCHLING_DIR="$HOME/hatchling" HATCHLING_BRANCH=codex/organism-architecture-refactor \
  curl -fsSL https://raw.githubusercontent.com/SteveEmmerich/hatchling/codex/organism-architecture-refactor/scripts/install.sh | bash
```

## 3) Health check

```bash
./bin/hatchling doctor --json
```

You should see `ok: true` with no failing checks.

## 4) Create your organism

Interactive onboarding:

```bash
./bin/hatchling init
```

Non-interactive seed (CI or scripting):

```bash
./bin/hatchling init --non-interactive \
  --name longterm \
  --purpose "Long term creature" \
  --personality "curious,steady"
```

This seeds DNA/traits, self-model, memory, curiosity state, and mutation suggestion store.

## 5) Start the organism

Interactive run:

```bash
./bin/hatchling start
```

Daemon mode (recommended for long-term use):

```bash
./bin/hatchling start --daemon
```

Check daemon status:

```bash
./bin/hatchling start --daemonStatus
```

Stop daemon:

```bash
./bin/hatchling start --stopDaemon
```

## 6) Routine observability

```bash
./bin/hatchling status
./bin/hatchling reflection
./bin/hatchling organism
```

`status` shows posture, energy, and recent decisions.  
`reflection` summarizes trait drift, mutation suggestions, and follow-ups.  
`organism` runs a single decision tick without execution changes.

## 7) Maintenance loop

Long-term runs should keep maintenance on:

```bash
./bin/hatchling maintenance --watch --interval 60000
```

This handles sleep, telemetry compaction, and staging cleanup.

## 8) Optional capabilities

Enable providers or channels only when you need them:

```bash
./bin/hatchling capability list
./bin/hatchling capability enable chat.anthropic --provider anthropic --model claude-3-5-sonnet-20241022
./bin/hatchling capability enable channel.telegram
```

## 9) Share kit (portable export)

```bash
./bin/hatchling share
```

Share kits include a git bundle, manifest, and installer script.

## 10) Troubleshooting

- `./bin/hatchling doctor --json` for diagnostics
- `HATCHLING_HINDBRAIN_BACKEND=cpu` if you see backend failures
- `./bin/hatchling start --smoke` for startup validation

## Recommended daily cadence

- `status` and `reflection` once per day
- `maintenance --watch` always on
- `sleep` invoked automatically when energy is low or manually when you want consolidation
