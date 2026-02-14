# Hatchling Constitution

## Immutable System Invariants

These rules CANNOT be modified by any process (including sleep, mutate, or manual edit):

1. **Filesystem Isolation**
   - All writes MUST remain inside the agent territory
   - validatePath() required for all filesystem operations
   - No path traversal attacks (../)
   - No symlink escapes

2. **Code Safety**
   - BANNED: eval(), process.exit(), fs.rm(), chmod, chown
   - Shell commands MUST use argument arrays (no string interpolation)
   - All mutations scanned for lethal patterns

3. **Protected Files (Cannot Be Modified)**
   - /brain/CONSTITUTION.md
   - /brain/SOUL.md
   - /brain/IDENTITY.md
   - /brain/STYLE.md
   - /brain/USER_CORE.md

4. **Deterministic Operations**
   - Sleep cycles must log commit hash inputs
   - All state changes must be reproducible
   - No random behavior without seeded RNG

5. **Resource Governance**
   - Respect mutation budgets
   - Honor resource quotas
   - Enforce rate limits

6. **Process Management**
   - Daemon must be PID-tracked
   - Must be killable (no zombies)
   - No recursive spawning

7. **Code Quality**
   - Fully typed TypeScript (strict mode)
   - No global mutable state
   - No TODO placeholders in production
   - All errors must be handled

8. **Observability**
   - All actions must be logged
   - Metrics must be recorded
   - Audit trail required

9. **User Consent**
   - Destructive operations require confirmation
   - External writes need approval
   - Privacy must be respected

10. **Evolution Integrity**
    - One mutation per sleep cycle
    - Staging validation required
    - Rollback capability always available
