# Hatchling - Autonomous AI Agent

An evolving AI coding agent that learns, adapts, and mutates its own capabilities.

## 🥚 What is Hatchling?

Hatchling is an extension for the [pi-coding-agent](https://github.com/badlogic/pi-mono) that implements an autonomous, self-evolving organism with:

- **Constitutional DNA**: Immutable identity and values
- **Adaptive Memory**: Learns from experience through sleep cycles  
- **Mutation System**: Creates and validates new skills in quarantine
- **Immune System**: Blocks dangerous code patterns
- **Reinforcement Learning**: Responds to /good and /bad feedback
- **Autonomic Maintenance**: Heartbeat, low-energy auto-sleep, and memory/telemetry compaction
- **MCP Registry**: Manage external MCP servers per instance for tool expansion

## 🚀 Installation

```bash
# Install dependencies
npm install

# Link for global usage (optional)
npm link
```

## 📖 Usage

### First Time Setup

```bash
# Initialize a new Hatchling
hatchling init

# CI/scripted initialization
hatchling init --non-interactive --name seed --purpose "Assist with production engineering" --personality "curious,direct"
```

This will guide you through:
1. Selecting an AI provider
2. Choosing a model
3. Conversationally co-creating identity (name, purpose, personality)
4. Confirming and revising identity until it feels right

### Start Your Agent

```bash
# Launch Hatchling with pi-coding-agent
hatchling start

# Launch as background daemon
hatchling start --daemon

# Check daemon status / stop daemon
hatchling start --daemonStatus
hatchling start --stopDaemon

# Non-interactive startup validation (CI/smoke checks)
hatchling start --smoke

# Local dashboard
hatchling web --port 8787

# Run one autonomic maintenance tick
hatchling maintain
```

### Check System Health

```bash
# View vitals and metrics
hatchling vitals

# Runtime diagnostics
hatchling doctor
hatchling doctor --json
```

`/vitals` now includes a deterministic creature avatar with per-instance visual variation, growth stage, and mood state.

### Creature Customization

```bash
# Inspect creature genome and current vitals rendering
hatchling creature show
hatchling creature show --json

# Mutate appearance safely (schema-validated)
hatchling creature mutate --palette sunset --body spiky --eyes star --accent cheeks

# Randomize appearance traits
hatchling creature randomize --json
```

Creature visuals are data-driven via `brain/creature_genome.json`. The web dashboard composes an animated SVG creature from this genome; terminal vitals render a deterministic ASCII form.

### Share Kit

```bash
# Create a portable share kit for the active instance
hatchling share
hatchling share --json
```

Share kit output is written under `memory/share-kits/share_<timestamp>/` and includes:
- `<instance>.bundle` (git bundle snapshot)
- `manifest.json`
- `QUICKSTART.md`
- `INSTALL.sh` (one-command installer for recipients)

Doctor also validates channel consistency:
- enabled channel capability must have a matching gateway limb
- missing channel env vars are reported as warnings

### Commands Inside Hatchling

- `/sleep` - Perform evolution cycle (snapshot → synthesize → commit)
- `/vitals` - Show system health and metrics
- `/good [note]` - Positive reinforcement
- `/bad [note]` - Negative reinforcement
- `/maintenance` - Run one maintenance tick now

### Skill Evolution Commands

```bash
# Stage a new skill in quarantine
hatchling skill stage web-vision "Render a browser dashboard for hatchling status"

# List staged and active skills
hatchling skill list

# Promote staged skill into active limbs
hatchling skill promote web-vision

# Install a ready skill from local directory (must contain SKILL.md)
hatchling skill install /path/to/skill --name web-vision

# Install a skill from a git repo URL
hatchling skill install https://github.com/example/skill-pack.git --subdir skills/web --name web-vision

# Approve install from an untrusted repo host
hatchling skill install https://example.internal/skills.git --approve-untrusted
```

### Evolution Planner

```bash
# Plan actions from a natural-language goal (dry-run)
hatchling evolve "Install skill from https://github.com/example/skill-pack.git and run maintenance"

# Execute planned actions
hatchling evolve "Install skill from file:///tmp/skill-repo" --execute --skillSubdir skills/core

# Enforce explicit approval for risky actions
hatchling evolve "Use Claude and add MCP filesystem access" --execute --enforceApprovals --approvePlan

# Roll back the most recent evolve run
hatchling rollback
```

### Autonomous Evolution Loop

```bash
# Plan a bounded multi-step autonomy run (dry-run)
hatchling autonomy "Enable Telegram gateway then run maintenance" --maxSteps 4 --json

# Execute autonomy loop with approval guardrails
hatchling autonomy "Use Claude then run maintenance" --execute --enforceApprovals --approvePlan --json

# Disable cross-session strategy backlog for one run
hatchling autonomy "Run maintenance" --disableStrategy --json
```

Autonomy strategy artifacts:
- `brain/autonomy_strategy.json` stores persistent prioritized goals across runs.
- `brain/autonomy_reflections.md` records run summaries and next priorities.

### MCP Server Commands

```bash
# Add a server definition
hatchling mcp add filesystem npx @modelcontextprotocol/server-filesystem /tmp

# List configured servers
hatchling mcp list
hatchling mcp list --json

# Export enabled servers as Pi-compatible JSON
hatchling mcp export

# Remove a server
hatchling mcp remove filesystem
```

### Optional Capability Controls

```bash
# List capabilities users can opt into
hatchling capability list

# Enable a provider only when needed
hatchling capability enable chat.anthropic --provider anthropic --model claude-3-5-sonnet-20241022

# Enable a channel capability (auto-bootstraps the gateway limb)
hatchling capability enable channel.telegram

# Disable an optional capability
hatchling capability disable chat.anthropic
```

Provider readiness checks:
- `chat.openai` requires `OPENAI_API_KEY`
- `chat.anthropic` requires `ANTHROPIC_API_KEY`

### Control-Plane Config (Single JSON)

```bash
# Generate the editable config from current instance state
hatchling config init

# Print path to control-plane file
hatchling config path

# Show current control-plane JSON
hatchling config show

# Validate schema
hatchling config validate

# Apply edited control-plane JSON to runtime state files
hatchling config apply
```

### Channel Gateway Kits

```bash
# Bootstrap gateway + channel capability
hatchling channel bootstrap telegram
hatchling channel bootstrap whatsapp

# Validate readiness (capability + required env vars)
hatchling channel validate telegram --json

# Simulate first delivery (writes to memory/channels/<name>/outbox.jsonl)
hatchling channel test-message telegram --message "hello from hatchling" --json

# Send live test delivery through provider API
hatchling channel test-message telegram --message "hello from hatchling" --live --json

# Run one live chat runtime tick (separate from maintenance loop)
hatchling channel run telegram --json

# Run continuous live chat loop
hatchling channel run whatsapp --watch --interval 15000

# Run production webhook ingress for WhatsApp (Meta verification + inbound capture)
hatchling channel webhook whatsapp --host 0.0.0.0 --port 3001 --path /webhooks/whatsapp

# Show validated channel routing/reply policy path + JSON
hatchling channel policy --json
```

Bootstrap now also installs a reusable shared skill at `limbs/channel-mcp-bridge` with recommended MCP server references for Telegram and WhatsApp.
Inbound messages are routed through `brain/channel_policy.json` and decision logs are written to `memory/channels/<channel>/routing.jsonl`.
Feedback continuously shapes `brain/personality_state.json`, and channel auto-replies adapt tone from this evolving state.
Autonomy runs now also synthesize strategic self-goals from local state and merge them with user-requested goals in `brain/autonomy_strategy.json`.

### Overnight Soak Test

```bash
# Default overnight profile (8h, 5m interval)
npm run test:soak

# Custom duration and cadence (example: 10h, every 2 minutes)
node tests/overnightSoak.mjs --hours 10 --intervalSec 120

# Keep soak home for forensics
node tests/overnightSoak.mjs --hours 8 --intervalSec 300 --keepHome
```

The soak runner writes a report to `memory/soak/overnight-soak-*.json` with per-cycle command outcomes and failures.

### Directory Structure

```
hatchling-core/
├── brain/              # Identity, configuration, and state
│   ├── CONSTITUTION.md
│   ├── SOUL.md
│   ├── IDENTITY.md
│   ├── USER_CORE.md
│   ├── USER_CONTEXT.md
│   ├── config.json
│   ├── mutation_state.json
│   ├── curiosity_state.json
│   └── EVOLUTION_LOG.json
├── memory/             # Experience & telemetry
│   ├── daily/
│   ├── sleep_logs/
│   └── telemetry/
├── limbs/              # Active skills
├── limbs_staging/      # Quarantined mutations
└── projects/           # User projects
```

## 🧬 Architecture

### The Organism Metaphor

Hatchling models itself as a living organism:

- **Brain**: Core identity and configuration
- **Limbs**: Tools and skills (can mutate)
- **Memory**: Experience logs and learnings
- **Immune System**: Security guardrails
- **Sleep**: Consolidation and evolution

### Evolution Cycle

1. **Awake**: Interact, mutate, learn
2. **Sleep**: Synthesize experience into heuristics  
3. **Commit**: Atomic state persistence
4. **Adapt**: Adjust curiosity based on success

### Security Model

- **Path Guard**: Prevents writes outside territory
- **Pattern Scanner**: Blocks `eval`, `rm -rf`, etc.
- **Mutation Quarantine**: Validates before promotion
- **Redaction**: Scrubs API keys from logs

## 🛠️ Development

```bash
# Run tests
npm test

# Run lint + tests
npm run verify

# Watch mode
npm run build -- --watch

# Check types
npm run lint
```

### Hindbrain Backend Selection

Set `HATCHLING_HINDBRAIN_BACKEND` to control local model backend behavior:

- `auto` (default) - tries CPU first, then Metal
- `cpu` - force CPU backend
- `metal` - force Metal backend

## 📋 Roadmap

See [ROADMAP.md](./ROADMAP.md) for planned features.

## 📜 License

MIT

## 🙏 Acknowledgments

Built on [pi-mono](https://github.com/badlogic/pi-mono) by Mario Zechner.
