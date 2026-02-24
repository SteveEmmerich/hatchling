# Hatchling Pilot Guide

## Goal
Run a small external pilot with high confidence, fast diagnosis, and easy rollback.

## Recommended Pilot Size
- 5-10 technical users
- 3-7 days

## Operator Runbook
1. Verify build and tests:
   - `npm run verify --silent`
2. Validate environment for each pilot machine:
   - `hatchling doctor --json`
3. Confirm pilot readiness checks:
   - `hatchling pilot checklist --json`
4. Export a baseline health artifact before pilot:
   - `hatchling pilot snapshot --json`
5. Keep daemon running for active instance:
   - `hatchling start --daemon`

## During Pilot
- Export a daily snapshot:
  - `hatchling pilot snapshot --json`
- If needed, enforce strict pass/fail in automation:
  - `hatchling pilot snapshot --strict --json`
- Review latest routing/autonomy behavior in exported snapshot JSON.

## Incident Response
1. Capture snapshot:
   - `hatchling pilot snapshot --json`
2. Run doctor:
   - `hatchling doctor --json`
3. Check daemon state:
   - `hatchling start --daemonStatus`
4. Stop daemon only if required:
   - `hatchling start --stopDaemon`

## Exit Criteria for Broad Rollout
- No blocking failures in pilot checklist for all pilot instances.
- Stable overnight soak report (`memory/soak/overnight-soak-*.json`) with zero failures.
- No unresolved high-severity issues from pilot feedback.
