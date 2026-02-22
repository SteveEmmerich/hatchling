# Hatchling Upgrade Guide

## 1. Backup First
Create a backup from your active instance before upgrading:

```bash
hatchling start --smoke
# inside session: call generate_backup tool (or run your backup workflow)
```

## 2. Upgrade Package
From `hatchling-core`:

```bash
npm install
npm run build
npm test
```

## 3. Verify Runtime Health

```bash
hatchling doctor --json
```

If `home_write` is a warning, set a writable home:

```bash
export HATCHLING_HOME=/path/to/writable/home
```

## 4. Verify Active Instance

```bash
hatchling list
hatchling start --smoke
```

## 5. Optional: Backend Selection
If hindbrain model initialization is unstable, force CPU backend:

```bash
export HATCHLING_HINDBRAIN_BACKEND=cpu
```

Valid values: `auto`, `cpu`, `metal`.

## 6. Post-Upgrade Sanity Checks
- Run one feedback cycle: `/good` then `/bad`
- Run one sleep cycle: `/sleep`
- Validate skill pipeline:
  - `hatchling skill stage ...`
  - `hatchling skill promote ...`
