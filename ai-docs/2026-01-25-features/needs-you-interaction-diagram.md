# needs-you.md Interaction Flow

## Quick Reference Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                    HUMAN-AGENT INTERACTION LOOP                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ 1. AGENT BLOCKS TASK (After 10 Retries)                      │  │
│  ├──────────────────────────────────────────────────────────────┤  │
│  │                                                               │  │
│  │  executive-loop.ts:updateState()                             │  │
│  │     if (retry.attempts >= 10) {                              │  │
│  │       writeToNeedsYou(item, retry)  ───────┐                │  │
│  │     }                                       │                │  │
│  │                                             ▼                │  │
│  │                                  workspace/needs-you.md      │  │
│  │                                  ┌─────────────────────┐    │  │
│  │                                  │ ## Actions Needed   │    │  │
│  │                                  │                     │    │  │
│  │                                  │ | Action | ... |   │    │  │
│  │                                  │ | Fix DB  | ... |   │    │  │
│  │                                  └─────────────────────┘    │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ 2. HUMAN RESPONDS (Asynchronously)                           │  │
│  ├──────────────────────────────────────────────────────────────┤  │
│  │                                                               │  │
│  │  Human edits needs-you.md directly:                          │  │
│  │                                                               │  │
│  │  | Action | Why | Response | Blocking | Since |              │  │
│  │  |--------|-----|----------|----------|-------|              │  │
│  │  | Fix DB | ... | [APPROVED] Use connection pool | ... |    │  │
│  │                   ▲                                          │  │
│  │                   └─── Human adds response here              │  │
│  │                                                               │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ 3. AGENT DETECTS (Next Loop - Phase 2)                       │  │
│  ├──────────────────────────────────────────────────────────────┤  │
│  │                                                               │  │
│  │  executive-loop.ts:runIteration()                            │  │
│  │    ├─► processHumanInputs()  ◄──── reads needs-you.md      │  │
│  │    │      │                                                  │  │
│  │    │      ├─► parseNeedsYouResponses()                      │  │
│  │    │      │      └─► Extracts: "Fix DB" with [APPROVED]    │  │
│  │    │      │                                                  │  │
│  │    │      ├─► unblockTaskInGoals("Fix DB")                 │  │
│  │    │      │      └─► goals.md: Blocked → Pending           │  │
│  │    │      │                                                  │  │
│  │    │      ├─► logHumanInteraction()                        │  │
│  │    │      │      └─► work-ledger.jsonl ← HUMAN_INPUT       │  │
│  │    │      │                                                  │  │
│  │    │      └─► moveToResolved()                             │  │
│  │    │             └─► needs-you.md: Move to Resolved        │  │
│  │    │                                                         │  │
│  │    └─► retryTracker.delete("Fix DB")  ◄──── Fresh attempts │  │
│  │                                                               │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ 4. AGENT RESUMES WORK                                         │  │
│  ├──────────────────────────────────────────────────────────────┤  │
│  │                                                               │  │
│  │  selectWork()                                                │  │
│  │    └─► Finds "Fix DB" (now Pending, not Blocked)            │  │
│  │                                                               │  │
│  │  executeWork()                                               │  │
│  │    └─► Fresh context with human response details            │  │
│  │    └─► 10 new retry attempts available                      │  │
│  │                                                               │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

## File State Changes

```
BEFORE Human Response:
├─ workspace/needs-you.md
│  ├─ ## Actions Needed
│  │  └─ | Fix DB connection | Failed 10x | [EMPTY] | BLOCKING | ...
│  └─ ## Resolved
│     └─ | *None* |
│
└─ workspace/goals.md
   └─ ### Fix DB connection
      └─ Status: Blocked

AFTER Human Response + Detection:
├─ workspace/needs-you.md
│  ├─ ## Actions Needed
│  │  └─ | *None* |
│  └─ ## Resolved
│     └─ | Fix DB connection | [APPROVED] Use pool | 2026-01-25 |
│
├─ workspace/goals.md
│  └─ ### Fix DB connection
│     └─ Status: Pending
│
└─ ledgers/work-ledger.jsonl
   └─ {"event":"HUMAN_INPUT_RECEIVED","action":"Fix DB connection",...}
```

## Response Tags Reference

| Tag | Purpose | Behavior |
|-----|---------|----------|
| `[APPROVED]` | Grant permission | ✅ Unblock + Resolve |
| `[DECISION]` | Provide choice | ✅ Unblock + Resolve |
| `[INFO]` | Give information | ✅ Unblock + Resolve |
| `[SKIP]` | Cancel task | ❌ Just Resolve (stays Blocked) |
| Any text | Generic response | ✅ Unblock + Resolve |

## Key Points

1. **No Manual Triggering**: Agent automatically detects responses every loop (default 30s)
2. **Idempotent**: Safe to leave responses in file; processed only once
3. **Fresh Attempts**: Unblocked tasks get full 10 retries reset
4. **Traceability**: All interactions logged to work-ledger.jsonl
5. **Constitution Compliant**: Implements Article I, Section 8 requirement

## Example Interaction

```markdown
# 1. Agent writes after 10 failures
| Get API token | 401 Unauthorized | | BLOCKING | 2026-01-25 |

# 2. Human responds (same day or later)
| Get API token | 401 Unauthorized | [INFO] Token: sk_xyz | BLOCKING | 2026-01-25 |

# 3. Agent processes on next loop iteration
[2026-01-25T14:32:15.000Z] Checking for human inputs...
[2026-01-25T14:32:15.123Z] Processing human response: Get API token
[2026-01-25T14:32:15.124Z]   Type: INFO
[2026-01-25T14:32:15.125Z]   Response: [INFO] Token: sk_xyz
[2026-01-25T14:32:15.150Z]   Action: Unblocked task in goals.md
[2026-01-25T14:32:15.151Z]   Reset retry counter for: "Get API token"
[2026-01-25T14:32:15.200Z] Selecting work...
[2026-01-25T14:32:15.201Z] Selected work: [P1] Get API token

# 4. needs-you.md updated
## Actions Needed
| *None* | | | | |

## Resolved
| Get API token | [INFO] Token: sk_xyz | 2026-01-25 |
```

---

**Last Updated**: 2026-01-25
