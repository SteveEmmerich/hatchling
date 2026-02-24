# Hatchling Pilot Quickstart

## 1) Install and verify
```bash
npm install
npm run verify --silent
```

## 2) Initialize a hatchling
```bash
node dist/cli.js init --non-interactive \
  --name my-hatchling \
  --purpose "Learn, help, and evolve safely" \
  --personality "curious,direct,steady"
```

## 3) Start runtime
```bash
node dist/cli.js start --daemon
node dist/cli.js start --daemonStatus
```

## 4) Validate pilot readiness
```bash
node dist/cli.js pilot checklist --json
node dist/cli.js pilot snapshot --json
```

## 5) Basic usage checks
```bash
node dist/cli.js maintain
node dist/cli.js creature show --json
node dist/cli.js autonomy "review backlog then run maintenance" --maxSteps 2 --json
node dist/cli.js web --snapshot --json
```

## 6) Optional channel setup
```bash
node dist/cli.js channel bootstrap telegram
node dist/cli.js channel validate telegram --json
node dist/cli.js channel policy --json
```

## 7) Incident snapshot
```bash
node dist/cli.js pilot snapshot --strict --json
node dist/cli.js doctor --json
```
