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
bun install

# Link for global usage (optional)
bun link
```

## 📖 Usage

### First Time Setup

```bash
# Initialize a new Hatchling
hatchling init
```

This will guide you through:
1. Selecting an AI provider (Anthropic, OpenAI, Ollama, Google)
2. Choosing a model
3. Naming your agent
4. Interactive self-discovery conversation (coming soon: pi-tui integration)

### Start Your Agent

```bash
# Launch Hatchling with pi-coding-agent
hatchling start
```

### Check System Health

```bash
# View vitals and metrics
hatchling vitals
```

### Commands Inside Hatchling

- `/sleep` - Perform evolution cycle (snapshot → synthesize → commit)
- `/mutate <name> <description>` - Create new skill in staging
- `/amputate` - Rollback last mutation  
- `/vitals` - Show system health and metrics
- `/good [note]` - Positive reinforcement
- `/bad [note]` - Negative reinforcement  
- `/debug` - Toggle debug mode

### Directory Structure

```
hatchling-core/
├── .self/              # Agent identity (DNA)
│   ├── CONSTITUTION.md (immutable)
│   ├── SOUL.md (immutable)  
│   ├── IDENTITY.md (immutable)
│   ├── STYLE.md (immutable)
│   ├── USER_CORE.md (immutable)
│   ├── USER_CONTEXT.md (adaptive)
│   └── EXPERIENCE.md (evolving)
├── brain/              # Configuration & state
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
bun test

# Watch mode
bun test --watch

# Check types
tsc --noEmit
```

## 📋 Roadmap

See [ROADMAP.md](./ROADMAP.md) for planned features.

## 📜 License

MIT

## 🙏 Acknowledgments

Built on [pi-mono](https://github.com/badlogic/pi-mono) by Mario Zechner.
