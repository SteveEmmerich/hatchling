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
- Self-generated autonomy strategy goals: runtime now synthesizes strategic objectives from local state (channels, MCP, personality signals, backlog hygiene) and merges them into the strategy queue.
- Channel transport: `channel test-message` supports simulated or live provider API mode (`--live`).
- Channel runtime loop: `channel run <telegram|whatsapp>` provides a dedicated live chat loop separate from maintenance.
- WhatsApp webhook ingress: `channel webhook whatsapp` provides Meta verification + inbound payload capture into runtime queue.
- Channel routing policy layer: inbound channel messages are evaluated via `brain/channel_policy.json` with per-channel rules, quiet-hours suppression, and templated replies (`channel policy` command + routing decision logs).
- Conversation quality layer: channel replies can be provider-rewritten (OpenAI/Anthropic when configured) and are socially shaped using persisted user interaction memory in `brain/social_memory.json`.
- Social relationship memory now tracks trust/stage progression and recent history carryover for recurring channel users.
- Multi-turn dialog planning state is persisted per user (`brain/dialog_state.json`) and used to generate follow-up clarifying prompts for ambiguous requests.
- Preference modeling now captures user verbosity/pace hints and applies them during reply shaping.
- Daemon mode: `start --daemon`, `start --daemonStatus`, and `start --stopDaemon` manage background runtime per instance.
- Share kit: `hatchling share` creates portable bundle + manifest + quickstart artifacts.
- Creature TUI flair: vitals include deterministic per-instance creature avatar, growth stage, and mood rendering.
- Creature genome system: `brain/creature_genome.json` drives deterministic variation with safe mutation commands and animated web SVG composition.
- Personality adaptation system: `brain/personality_state.json` persists feedback-driven behavioral signals and adaptive traits; channel auto-replies are tone-shaped by this state.
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
- Feedback-driven personality adaptation over time is implemented with persisted signals + adaptive traits.
- Social memory persistence for recurring users is implemented with trust/stage progression, preference hints, and response-tone influence.
- Still needed: richer relationship-arc behaviors over longer horizons.

2. Real transport adapters
- Telegram/WhatsApp bootstrap, validation, and dedicated runtime loops are implemented.
- Telegram live polling and ingestion are implemented.
- WhatsApp production webhook ingress now captures and verifies inbound events and feeds the runtime queue.
- Rule-based channel routing/response policy is implemented and configurable per instance.
- Model-driven response rewrite layer is implemented for configured providers (with safe fallback when unavailable).
- Dialog planning now tracks multi-turn context and clarifying follow-up prompts.
- Still needed: broader task-level multi-turn planning depth for complex long-running conversations.

3. Autonomous long-horizon planning
- Bounded autonomy loop is implemented with approval guards and run logs.
- Cross-session reprioritization and reflection heuristics are now implemented for persistent pending goals.
- Self-generated strategic objectives are now synthesized and prioritized alongside user goals.
- Still needed: richer model-based planning depth for truly open-ended long-horizon exploration.

## Completion Criteria for First Stable Release

- `npm run build` green.
- `npm test` green.
- Manual E2E flow validated (`init` -> `start` -> command/tool loop).
- No placeholder/incomplete paths in active `src/` flow.
- README and status docs match observed behavior.
