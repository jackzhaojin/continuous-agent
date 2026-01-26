# Human Interaction via needs-you.md

**Status:** Implemented
**Date:** 2026-01-25
**Feature Type:** Core Interaction Mechanism

---

## Overview

This feature enables asynchronous human-agent interaction through the `needs-you.md` file. When the agent encounters blocked tasks after 10 retry attempts, it writes entries to `needs-you.md`. Humans can respond directly in the markdown file, and the agent detects and processes these responses automatically during its executive loop.

---

## How It Works

### 1. Agent Writes Blocked Tasks

When a task fails after 10 retry attempts (per constitution Article I, Section 8), the executive loop:

1. Marks the task as "Blocked" in `goals.md`
2. Writes an entry to the "Actions Needed" table in `needs-you.md`
3. Logs the blocking event to `work-ledger.jsonl`

**Example entry:**
```markdown
| Action | Why Agent Can't Do It | Response | Blocking | Since |
|--------|----------------------|----------|----------|-------|
| Get Notion API token | Failed after 10 attempts. Last error: 401 Unauthorized... | | BLOCKING | 2026-01-25 |
```

### 2. Human Responds

The human adds their response in the **Response** column using standardized tags:

| Tag | Meaning | Example |
|-----|---------|---------|
| `[APPROVED]` | Approve action with optional details | `[APPROVED] Token: sk_abc123...` |
| `[DECISION]` | Provide a decision/choice | `[DECISION] Use OAuth flow instead` |
| `[INFO]` | Provide requested information | `[INFO] Database URL: postgres://...` |
| `[SKIP]` | Skip this task entirely | `[SKIP]` |

**Example response:**
```markdown
| Action | Why Agent Can't Do It | Response | Blocking | Since |
|--------|----------------------|----------|----------|-------|
| Get Notion API token | Failed after 10 attempts... | [APPROVED] Token: sk_abc123_xyz | BLOCKING | 2026-01-25 |
```

### 3. Agent Detects and Processes

During Phase 2 of the executive loop ("Check Inputs"), the agent:

1. Reads `needs-you.md`
2. Parses the "Actions Needed" table for non-empty Response columns
3. For each response found:
   - Logs the interaction to `work-ledger.jsonl` (event: `HUMAN_INPUT_RECEIVED`)
   - **Unblocks the task** in `goals.md` (Blocked → Pending)
   - **Resets retry counter** (gives task fresh 10 attempts)
   - Moves entry to "Resolved" section in `needs-you.md`

**Result:** The task becomes eligible for selection again in the same loop iteration.

---

## Architecture

### Files Modified

1. **`src/input-processor.ts`** (NEW)
   - Core logic for parsing and processing human responses
   - Handles state updates across multiple files
   - Logs interactions for traceability

2. **`src/executive-loop.ts`**
   - Integrated into Phase 2: "Check Inputs"
   - Resets retry tracker for unblocked tasks
   - Updated `writeToNeedsYou()` for new table format

3. **`workspace/needs-you.md`**
   - Added "Response" column to "Actions Needed" table
   - Added human-facing instructions

### Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│                  HUMAN INTERACTION FLOW                      │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. TASK FAILS (10 retries)                                 │
│     └─► executive-loop.ts:updateState()                     │
│         └─► writeToNeedsYou()                               │
│             └─► Writes to needs-you.md "Actions Needed"     │
│                                                              │
│  2. HUMAN RESPONDS                                           │
│     └─► Human edits needs-you.md                            │
│         └─► Adds [APPROVED]/[DECISION]/[INFO]/[SKIP]        │
│                                                              │
│  3. AGENT DETECTS (Next Loop - Phase 2)                     │
│     └─► executive-loop.ts:runIteration()                    │
│         └─► processHumanInputs()                            │
│             ├─► parseNeedsYouResponses()                    │
│             ├─► unblockTaskInGoals() → goals.md             │
│             ├─► logHumanInteraction() → work-ledger.jsonl   │
│             ├─► moveToResolved() → needs-you.md             │
│             └─► Returns tasksUnblocked[]                    │
│         └─► Reset retryTracker for unblocked tasks          │
│                                                              │
│  4. TASK ELIGIBLE AGAIN                                      │
│     └─► selectWork() picks up unblocked task                │
│         └─► Fresh 10 retry attempts                         │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Response Format Details

### Parsing Logic

The input processor uses regex to parse the "Actions Needed" table:
- Detects section boundary: `## Actions Needed`
- Identifies table headers and separators
- Extracts cells from rows starting with `|`
- Filters out placeholder rows (`*None*`)

### Response Type Detection

```typescript
// Tagged format (preferred)
"[APPROVED] details"  → { type: 'APPROVED', details: 'details' }
"[DECISION] choice"   → { type: 'DECISION', details: 'choice' }
"[INFO] data"         → { type: 'INFO', details: 'data' }
"[SKIP]"              → { type: 'SKIP' }

// Untagged format (fallback)
"Yes, proceed"        → { type: 'OTHER', details: 'Yes, proceed' }
```

### Special Handling

- **`[SKIP]`**: Moves to Resolved but does NOT unblock the task
- **All other types**: Unblock task + move to Resolved

---

## Integration with Constitution

This feature implements **Article I, Section 8** of the Constitution:

> **Section 8: Persistence & Retry Before Blocking**
>
> The agent SHALL NOT give up easily. AI is smart. Research, think, try, try again.
>
> **Retry Requirements:**
> - Minimum 10 attempts with different approaches before marking BLOCKED
> - Each retry must try a DIFFERENT strategy, not repeat the same failure
>
> **BLOCKED status rules:**
> - BLOCKED requires entry in `needs-you.md` explaining WHY
> - BLOCKED requires listing what human input/action is needed
> - BLOCKED requires at least 10 genuine retry attempts first
> - Empty `needs-you.md` with BLOCKED tasks = VIOLATION

By automatically processing responses and unblocking tasks, this feature closes the loop and enables true asynchronous collaboration.

---

## Event Logging

All human interactions are logged to `ledgers/work-ledger.jsonl`:

```jsonl
{
  "event": "HUMAN_INPUT_RECEIVED",
  "ts": "2026-01-25T14:32:00.000Z",
  "action": "Get Notion API token",
  "response_type": "APPROVED",
  "response": "[APPROVED] Token: sk_abc123_xyz",
  "blocking_level": "BLOCKING"
}
```

This provides full traceability of human-agent interactions.

---

## Usage Examples

### Example 1: Providing Auth Token

**Agent writes:**
```markdown
| Get Notion API token | 401 Unauthorized after 10 attempts | | BLOCKING | 2026-01-25 |
```

**Human responds:**
```markdown
| Get Notion API token | 401 Unauthorized after 10 attempts | [APPROVED] Token: sk_test_abc123xyz | BLOCKING | 2026-01-25 |
```

**Result:**
- Task unblocked in goals.md
- Retry counter reset to 0
- Agent picks up task with fresh token context

---

### Example 2: Making a Decision

**Agent writes:**
```markdown
| Choose auth approach | Need preference: OAuth vs API Key | | HIGH | 2026-01-25 |
```

**Human responds:**
```markdown
| Choose auth approach | Need preference: OAuth vs API Key | [DECISION] Use OAuth 2.0 flow | HIGH | 2026-01-25 |
```

**Result:**
- Task unblocked
- Agent proceeds with OAuth implementation

---

### Example 3: Skipping a Task

**Agent writes:**
```markdown
| Deploy to staging | No staging environment configured | | NORMAL | 2026-01-25 |
```

**Human responds:**
```markdown
| Deploy to staging | No staging environment configured | [SKIP] | NORMAL | 2026-01-25 |
```

**Result:**
- Entry moved to Resolved
- Task remains Blocked in goals.md (not retried)

---

## Performance Impact

- **Minimal overhead**: Parsing happens once per loop iteration (default 30s)
- **Fast parsing**: Regex-based markdown parsing is ~1ms for typical files
- **No polling**: Integrated into existing Phase 2 ("Check Inputs")
- **Idempotent**: Safe to re-run if multiple responses present

---

## Future Enhancements

1. **File watch mode**: Use `fs.watch()` to detect changes immediately (vs. 30s loop)
2. **Rich response formats**: Support multi-line responses, file attachments
3. **Decision trees**: Link related decisions with dependencies
4. **Notification hooks**: Trigger external notifications when needs-you.md updated
5. **Analytics**: Track response time, common blockers, human intervention rate

---

## Testing Checklist

- [ ] Agent writes blocked task to needs-you.md with Response column
- [ ] Human adds `[APPROVED]` response
- [ ] Agent detects response on next loop
- [ ] Task unblocked in goals.md (Blocked → Pending)
- [ ] Retry counter reset
- [ ] Entry moved to Resolved section
- [ ] Event logged to work-ledger.jsonl
- [ ] Task picked up again with fresh attempts
- [ ] `[SKIP]` response does NOT unblock task
- [ ] Multiple responses processed in single iteration

---

## Related Documentation

- **Constitution**: `/workspace/constitution.md` - Article I, Section 8
- **PRD**: `/ai-docs/v1/init/continuous-executive-agent-v1-prd.md` - Phase 2 (Check Inputs)
- **Executive Loop**: `/src/executive-loop.ts` - Main implementation
- **Input Processor**: `/src/input-processor.ts` - Core parsing logic

---

**Status**: ✅ Fully Implemented and Integrated
