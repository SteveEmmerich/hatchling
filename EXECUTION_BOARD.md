# Hatchling Execution Board

Updated: 2026-02-22

## Now

1. Runtime Reliability & Diagnostics
- Status: Complete
- Scope:
  - Add `hatchling doctor` command with pass/warn/fail checks.
  - Gate startup prerequisites and expose machine-readable health output for CI.
- Acceptance:
  - `hatchling doctor --json` returns structured checks and non-zero exit on blocking failures.

2. Organic Core Loop Validation
- Status: Complete
- Scope:
  - Validate feedback (`/good`/`/bad`), vitals, sleep snapshots/commits, and mutation success/rejection paths.
- Acceptance:
  - Integration tests cover positive and negative evolution paths and pass in CI.

3. User-Facing Evolution Primitive
- Status: Complete
- Scope:
  - Ensure realistic self-mutation request works (e.g., web interface module generation).
- Acceptance:
  - `mutate_self` can successfully add a real module to instance `src/` with compile integrity checks.

## Next

1. Interactive E2E Harness
- Status: Complete (scripted CI path)
- Scope:
  - Added deterministic non-interactive `init` flow and end-to-end CI test path.
- Acceptance:
  - Reproducible `init -> list -> start --smoke -> doctor` passes in CI tests.

2. Hindbrain Backend Hardening
- Status: Complete
- Scope:
  - Added backend selector (`auto|cpu|metal`), explicit attempts, diagnostics, and graceful onboarding fallback.
- Acceptance:
  - Clear diagnosis and fallback behavior on unsupported GPU backends.

3. Skill Evolution Pipeline
- Status: Complete (MVP)
- Scope:
  - Implemented stage/list/promote workflow with quarantined staging area.
- Acceptance:
  - New skill can be staged and promoted without manual file surgery.

## Later

1. Web Interface Limb (MVP)
- Status: MVP complete
- Scope:
  - Local web UI endpoint and snapshot mode for dashboard rendering.
- Acceptance:
  - `hatchling web` serves dashboard; `hatchling web --snapshot` is test-verified.

2. Sleep Intelligence Upgrade
- Status: MVP complete
- Scope:
  - Sleep now synthesizes telemetry into `brain/EXPERIENCE.md` each cycle.
- Acceptance:
  - Sleep cycles persist a concrete experience summary artifact and are test-verified.

3. Release Packaging & Upgrade Story
- Status: Documentation complete
- Scope:
  - Added release checklist and upgrade guide with env/backends/health verification steps.
- Acceptance:
  - Operators have explicit build/test/health/upgrade runbooks.

4. Autonomous Maintenance Orchestration
- Status: Complete
- Scope:
  - Added maintenance tick/loop with heartbeat, low-energy auto-sleep cooldown, telemetry pruning, and staging-memory compaction.
  - Wired loop to session startup and added manual `hatchling maintain` entrypoint.
- Acceptance:
  - Unit + e2e tests validate auto-sleep behavior, compaction behavior, and CLI maintenance flow.

5. MCP Capability Wiring
- Status: Complete (MVP)
- Scope:
  - Added per-instance MCP server registry with `add/list/remove/export`.
  - Persisted MCP state into `brain/mcp_servers.json`.
- Acceptance:
  - CLI and e2e tests validate registry lifecycle and Pi-compatible export output.

6. Conversational Repo Skill Intake
- Status: Complete (MVP)
- Scope:
  - Added skill install from local path or repository URL (`file://`, `https://`, `git@`, `.git`) with optional subdirectory targeting.
  - Exposed `install_skill` tool so users can provide repositories conversationally during agent sessions.
- Acceptance:
  - Unit/integration/e2e tests validate repo-backed skill installation through CLI and extension tooling.

7. Goal-to-Action Evolution Planner
- Status: Complete (MVP)
- Scope:
  - Added `hatchling evolve` with dry-run and execute modes for natural-language goals.
  - Added `evolve_goal` extension tool for conversational planning/execution in active sessions.
  - Included trust-gated repo install integration and maintenance/web-limb action inference.
- Acceptance:
  - Planner and execution flows are test-covered, and full verify suite passes with deterministic outputs.

8. Optional Capability Opt-In Model
- Status: Complete
- Scope:
  - Added capability registry with explicit enable/disable controls so external providers are never mandatory.
  - Added capability-aware evolve actions that enable chat providers only when goals request them.
  - Added provider readiness validation so chat capability switches fail fast when required credentials are missing.
  - Added optional approval gate for risky evolve actions before execution.
- Acceptance:
  - Capability CLI, readiness checks, and evolve approval/provider-enablement flows are e2e tested and pass in full verify.

9. Unified Control-Plane Config
- Status: Complete
- Scope:
  - Added per-instance `brain/control-plane.json` as the canonical editable configuration.
  - Added `hatchling config path/show/init/validate/apply` workflow for safe editing and synchronization.
  - Wired evolve approval defaults to `brain/evolve_policy.json` managed through control-plane apply.
- Acceptance:
  - Control-plane round-trip (`init -> validate -> apply`) is test-covered and full verify passes.
