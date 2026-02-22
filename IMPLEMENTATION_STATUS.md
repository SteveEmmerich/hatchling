# Hatchling Implementation Status

Last updated: 2026-02-22

## Verified Current State

- Build: `npm run build` passes.
- Tests: `npm test` passes (Node test harness).
- Runtime target: Node.js (Bun runtime APIs removed from `src/`).
- Extension API: aligned with `@mariozechner/pi-coding-agent@0.52.12`.
- Discovery mode: Hindbrain-first onboarding is the active path.
- Instance model: single active manager at `src/system/instance.ts` using `~/.hatchlings/<name>/`.
- Identity source of truth: `brain/*.md`.
- Manual E2E:
  - `hatchling init` completes with degraded local discovery prompts when Hindbrain model init fails.
  - `hatchling start` resolves active instance path and launches the pi subprocess.

## What Is Implemented

- CLI lifecycle commands in `src/cli.ts`:
  - `init`, `start`, `use`, `list`, `delete`
- Onboarding + identity generation:
  - `src/system/discovery.ts`
  - `src/system/hindbrain-discovery.ts`
  - `src/system/onboard.ts`
  - `src/system/dna-generator.ts`
- Extension runtime + registered tools/commands:
  - `src/extension.ts`
  - Commands: `vitals`, `sleep`, `good`, `bad`
  - Tools: `mutate_self`, `sync_germline`, `generate_backup`
- Safety and territory controls:
  - `src/system/pathGuard.ts`
  - `src/system/scanner.ts`
- Evolution and lineage operations:
  - `src/organism/evolution.ts`

## What Still Needs Work

1. End-to-end onboarding/start validation against real interactive sessions
- Run and verify full human flow:
  - `hatchling init`
  - `hatchling start`
  - in-session command/tool behavior

2. Hindbrain behavioral validation under real model runtime
- Validate discovery quality and extraction consistency with real conversations.
- Resolve local `node-llama-cpp` backend initialization in environments where Metal context creation fails.

3. Documentation depth
- Add explicit operator runbook (expected env, recovery steps, troubleshooting).
- Add release checklist and versioning notes.

## Completion Criteria for First Stable Release

- `npm run build` green.
- `npm test` green.
- Manual E2E flow validated (`init` -> `start` -> command/tool loop).
- No placeholder/incomplete paths in active `src/` flow.
- README and status docs match observed behavior.
