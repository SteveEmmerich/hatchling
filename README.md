# Hatchling - Autonomous AI Agent

An evolving AI coding agent that learns, adapts, and mutates its own capabilities.

## 🥚 What is Hatchling?

Hatchling is an extension for the [pi-coding-agent](https://github.com/badlogic/pi-mono) that implements an autonomous, self-evolving organism with:

- **Constitutional DNA**: Immutable identity and values
- **Adaptive Memory**: Learns from experience through sleep cycles  
- **Mutation System**: Creates and validates new skills in quarantine
- **Immune System**: Blocks dangerous code patterns
- **Reinforcement Learning**: Responds to /good and /bad feedback
- **Ghost Pulse**: Proactive background daemon for autonomous tasks

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
3. Naming your agent
4. Interactive self-discovery via the local Hindbrain

### Start Your Agent

```bash
# Launch Hatchling with pi-coding-agent
hatchling start

# Non-interactive startup validation (CI/smoke checks)
hatchling start --smoke

# Local dashboard
hatchling web --port 8787
```

### Check System Health

```bash
# View vitals and metrics
hatchling vitals

# Runtime diagnostics
hatchling doctor
hatchling doctor --json
```

### Commands Inside Hatchling

- `/sleep` - Perform evolution cycle (snapshot → synthesize → commit)
- `/vitals` - Show system health and metrics
- `/good [note]` - Positive reinforcement
- `/bad [note]` - Negative reinforcement

### Skill Evolution Commands

```bash
# Stage a new skill in quarantine
hatchling skill stage web-vision "Render a browser dashboard for hatchling status"

# List staged and active skills
hatchling skill list

# Promote staged skill into active limbs
hatchling skill promote web-vision
```

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

# Watch mode
npm run build -- --watch

# Check types
npm run build
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
