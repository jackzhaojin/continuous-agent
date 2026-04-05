# Default Monitor Instructions — Continuous Agent

Monitoring configuration for the continuous-agent executive loop system.

## System Overview

- **Process**: `executive-loop` managed by PM2
- **Entry point**: `dist/core/executive-loop.js`
- **Config**: `ecosystem.config.cjs`
- **Working directory**: `continuous-agent/` (agent infrastructure)
- **Output directory**: `ai-sandbox/` (sibling directory, all worker output)

## Key Locations

| What | Path | Format |
|------|------|--------|
| PM2 combined log | `ledgers/pm2-combined.log` | Timestamped text |
| PM2 error log | `ledgers/pm2-error.log` | Timestamped text |
| PM2 stdout log | `ledgers/pm2-out.log` | Timestamped text |
| Daily executive log | `ledgers/executive-YYYY-MM-DD.log` | Timestamped text |
| Work ledger | `ledgers/work-ledger.jsonl` | Append-only JSONL |
| Active goals | `workspace/in-progress/P{0-4}/` | Goal bundles |
| Queued goals | `workspace/ondeck/` | Goal bundles |
| Draft goals | `workspace/drafts/` | Goal bundles |
| Completed goals | `workspace/completed/` | Goal bundles |
| Blocked goals | `workspace/needs-you.md` | Markdown |
| Work queue | `workspace/queue.md` | Markdown |
| Constitution | `workspace/constitution.md` | Markdown (NEVER modify) |
| Worker output | `../ai-sandbox/` | Project directories |

## Monitoring Cadence

- **Check interval**: 60 seconds
- **Full report**: every 10 iterations (or on demand)
- **Delta reports**: between full reports, only report changes

## Health Indicators

### Healthy System
- PM2 status: `online`
- Low restart count relative to uptime
- Memory well under 1G
- Executive log shows phase cycling (0.5 → 1 → 2 → ... → 8)
- Work ledger shows mix of completions
- `needs-you.md` is empty or has only old entries

### Warning Signs
- PM2 restarts climbing quickly (crash loop)
- Same goal failing 3+ times consecutively
- No new log output for 15+ minutes (stall)
- Worker spawned but no ai-sandbox changes appear
- Memory approaching 1G limit
- Auth errors in logs (token expiration)

### Critical Issues
- PM2 status: `stopped` or `erroring`
- Goal blocked after 10+ failures (written to `needs-you.md`)
- Disk space issues
- Build failures (`npm run build` or `npm run typecheck`)
- Worker writing to wrong directory (scope violation)

## Intervention Thresholds

| Condition | Threshold | Action |
|-----------|-----------|--------|
| PM2 process down | Immediate | Report to user, do not restart |
| Crash loop (rapid restarts) | 5+ restarts in 5 min | Report, suggest `pm2 stop` |
| Goal failure streak | 3+ consecutive | Report, check Phase 7 diagnosis |
| Goal blocked | 10+ failures | Check `needs-you.md`, report |
| No progress | 15+ min no output | Warn user |
| Memory high | > 800MB | Warn user |
| Auth error in logs | Any occurrence | Report immediately |

## What NOT to Do

- Do not modify `workspace/constitution.md`
- Do not truncate or edit ledger files (append-only)
- Do not push commits to either repository
- Do not restart PM2 without user approval
- Do not modify goal bundles without user approval

## Log Format

```
[MONITOR] YYYY-MM-DD HH:mm:ss
  PM2: <status> | uptime: <dur> | restarts: <n> | mem: <MB>
  Active: <goal list with priorities>
  Completed (24h): <count>
  Failed (24h): <count>
  Sandbox: <recent activity>
  Blocked: <count>
  Queue: <count>
  Issues: <none | details>
```
