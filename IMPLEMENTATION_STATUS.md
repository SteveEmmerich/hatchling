# Hatchling Implementation Status

Last updated: 2026-02-22

## Verified Current State

- Build: `npm run build` passes.
- Tests: `npm test` passes (Node test harness, 50/50).
- Runtime target: Node.js (Bun runtime APIs removed from `src/`).
- Extension API: aligned with `@mariozechner/pi-coding-agent@0.52.12`.
- Discovery mode: Hindbrain-first onboarding is the active path.
- Instance model: single active manager at `src/system/instance.ts` using `~/.hatchlings/<name>/`.
- Identity source of truth: `brain/*.md`.
- Control-plane model: single editable `brain/control-plane.json` with `init/show/validate/apply`.
- Optional capability model: providers and channels are opt-in; channel enablement now bootstraps gateway limbs.
- Reusable channel skill: channel bootstrap now installs `limbs/channel-mcp-bridge` with MCP guidance.
- Evolution safety: `hatchling evolve` supports approval policy and rollback via `hatchling rollback`.
- Autonomous loop: `hatchling autonomy` supports bounded multi-step planning/execution with approval gates and run logging.
- Cross-session autonomy strategy: persistent prioritized goal backlog + run reflections in `brain/autonomy_strategy.json` and `brain/autonomy_reflections.md`.
- Channel transport: `channel test-message` supports simulated or live provider API mode (`--live`).
- Channel runtime loop: `channel run <telegram|whatsapp>` provides a dedicated live chat loop separate from maintenance.
- Daemon mode: `start --daemon`, `start --daemonStatus`, and `start --stopDaemon` manage background runtime per instance.
- Share kit: `hatchling share` creates portable bundle + manifest + quickstart artifacts.
- Creature TUI flair: vitals include deterministic per-instance creature avatar, growth stage, and mood rendering.
- Creature genome system: `brain/creature_genome.json` drives deterministic variation with safe mutation commands and animated web SVG composition.
- Manual E2E:
  - `hatchling init` completes with degraded local discovery prompts when Hindbrain model init fails.
  - `hatchling start` resolves active instance path and launches the pi subprocess.

## What Is Implemented

- CLI lifecycle commands in `src/cli.ts`:
  - `init`, `start`, `use`, `list`, `delete`
- Operational commands:
  - `doctor`, `maintain`, `web`, `mcp`, `capability`, `channel`, `config`, `evolve`, `autonomy`, `rollback`
  - `share`
- Onboarding + identity generation:
  - `src/system/discovery.ts`
  - `src/system/hindbrain-discovery.ts`
  - `src/system/onboard.ts`
  - `src/system/dna-generator.ts`
- Extension runtime + registered tools/commands:
  - `src/extension.ts`
  - Commands: `vitals`, `sleep`, `good`, `bad`
  - Tools: `mutate_self`, `sync_germline`, `generate_backup`, `evolve_goal`, `autonomy_loop`
- Safety and territory controls:
  - `src/system/pathGuard.ts`
  - `src/system/scanner.ts`
- Evolution and lineage operations:
  - `src/organism/evolution.ts`
  - `src/system/evolve.ts`
  - `src/system/evolve-journal.ts`

## Current Gaps (Product Goal vs Current Build)

1. Conversational runtime UX depth
- Identity onboarding is now conversational-first with narrative inference plus iterative revision.
- In-session social behavior polish still needs deeper personality adaptation over time.

2. Real transport adapters
- Telegram/WhatsApp bootstrap, validation, and dedicated runtime loops are implemented.
- Telegram live polling and ingestion are implemented; WhatsApp ingestion currently uses webhook-file queue input.
- Still needed: production webhook ingress service and richer conversation routing/response policies.

3. Autonomous long-horizon planning
- Bounded autonomy loop is implemented with approval guards and run logs.
- Cross-session reprioritization and reflection heuristics are now implemented for persistent pending goals.
- Still needed: richer self-generated strategic goal creation beyond user-provided objective decomposition.

## Completion Criteria for First Stable Release

- `npm run build` green.
- `npm test` green.
- Manual E2E flow validated (`init` -> `start` -> command/tool loop).
- No placeholder/incomplete paths in active `src/` flow.
- README and status docs match observed behavior.
