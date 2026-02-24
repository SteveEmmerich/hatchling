# Hatchling Release Checklist (v1)

## Build and Test
- [ ] `npm run build` passes
- [ ] `npm test` passes
- [ ] `hatchling doctor --json` returns `ok: true` in target environment

## Core User Flows
- [ ] `hatchling init` succeeds (interactive)
- [ ] `hatchling init --non-interactive ...` succeeds (CI/scripted)
- [ ] `hatchling list` shows correct metadata
- [ ] `hatchling start --smoke` passes
- [ ] `hatchling start` launches pi with active instance context

## Organic Evolution Flows
- [ ] `/good` and `/bad` update curiosity state
- [ ] `/sleep` creates snapshot and updates `brain/EXPERIENCE.md`
- [ ] `mutate_self` supports safe positive mutation and rejects out-of-territory writes
- [ ] `sync_germline` resolves and merges default germline branch
- [ ] `hatchling skill stage/list/promote` flow passes

## Web Interface
- [ ] `hatchling web --snapshot` renders valid dashboard HTML
- [ ] `hatchling web --port <port>` serves dashboard locally

## Packaging and Distribution
- [ ] `package.json` version updated
- [ ] CHANGELOG updated with notable changes
- [ ] install/usage docs up to date
- [ ] backup/restore behavior validated (`generate_backup`)

## Pilot Launch Readiness
- [ ] `hatchling pilot checklist --json` passes for active pilot instance
- [ ] `hatchling pilot snapshot --json` artifact generated and archived
- [ ] overnight soak report reviewed (`memory/soak/overnight-soak-*.json`)

## Environment Compatibility
- [ ] Node >= 20 confirmed
- [ ] `HATCHLING_HOME` behavior documented and tested
- [ ] Hindbrain backend config (`HATCHLING_HINDBRAIN_BACKEND`) documented and tested
