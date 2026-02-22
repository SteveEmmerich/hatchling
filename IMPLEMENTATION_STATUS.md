# Hatchling Implementation Status

Last updated: 2026-02-22

## Verified Current State

- Build: `npm run build` passes.
- Tests: `npm test` passes (Node test harness, 34/34).
- Runtime target: Node.js (Bun runtime APIs removed from `src/`).
- Extension API: aligned with `@mariozechner/pi-coding-agent@0.52.12`.
- Discovery mode: Hindbrain-first onboarding is the active path.
- Instance model: single active manager at `src/system/instance.ts` using `~/.hatchlings/<name>/`.
- Identity source of truth: `brain/*.md`.
- Control-plane model: single editable `brain/control-plane.json` with `init/show/validate/apply`.
- Optional capability model: providers and channels are opt-in; channel enablement now bootstraps gateway limbs.
- Evolution safety: `hatchling evolve` supports approval policy and rollback via `hatchling rollback`.
- Manual E2E:
  - `hatchling init` completes with degraded local discovery prompts when Hindbrain model init fails.
  - `hatchling start` resolves active instance path and launches the pi subprocess.

## What Is Implemented

- CLI lifecycle commands in `src/cli.ts`:
  - `init`, `start`, `use`, `list`, `delete`
- Operational commands:
  - `doctor`, `maintain`, `web`, `mcp`, `capability`, `channel`, `config`, `evolve`, `rollback`
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
  - `src/system/evolve.ts`
  - `src/system/evolve-journal.ts`

## Current Gaps (Product Goal vs Current Build)

1. Conversational runtime UX depth
- Interactive in-session experience still needs more natural multi-turn identity co-creation and social behavior polish.

2. Real transport adapters
- Telegram/WhatsApp flows are scaffolded and validated with simulated delivery logs.
- Production network adapter execution paths are not yet implemented in this repo.

3. Autonomous long-horizon planning
- Goal-to-action planning works for bounded actions.
- Autonomous multi-step self-directed planning/execution loops still need explicit guardrails and productization.

## Completion Criteria for First Stable Release

- `npm run build` green.
- `npm test` green.
- Manual E2E flow validated (`init` -> `start` -> command/tool loop).
- No placeholder/incomplete paths in active `src/` flow.
- README and status docs match observed behavior.
