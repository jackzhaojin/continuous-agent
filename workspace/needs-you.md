# Needs Human Input

This document tracks items requiring human attention, decisions, or actions.

---

## Decisions Needed

*Items where the agent needs human judgment or direction.*

| Item | Context | Options | Urgency | Since |
|------|---------|---------|---------|-------|
| *None* | | | | |

---

## Actions Needed

*Tasks that require human execution (authentication, approvals, etc.).*

**How to respond:** Add your response in the "Response" column using these formats:
- `[APPROVED] optional details` - Approve with optional context
- `[DECISION] your choice` - Provide a decision
- `[INFO] the information` - Provide requested information
- `[SKIP]` - Skip this task entirely

**Example:** If the agent needs an API key, respond with: `[INFO] API_KEY=sk_test_abc123xyz`

**Note:** After you respond, the agent will automatically detect your response in the next loop iteration (typically within 30 seconds), unblock the task, and retry with fresh context.

| Action | Why Agent Can't Do It | Response | Blocking | Since |
| *None* | | | | |

---

## Missing Information

*Questions or data gaps the agent cannot resolve independently.*

| Question | Context | Needed For | Since |
|----------|---------|------------|-------|
| *None* | | | |

---

## Resolved

*Recently resolved items for reference.*

| Item | Resolution | Resolved Date |
|------|------------|---------------|
| -------- | ---------- | 2026-02-01 |
| -------- | ---------- | 2026-02-01 |
| [SELF-ENHANCE] Self-Enhance Human Interface | Merged to main | 2026-01-26 |

---

## Notes

- **Urgency Levels:** BLOCKING (stops all work), HIGH (important), NORMAL, LOW
- **Log References:** When available, check the referenced log file for full error context
- **Auto-Processing:** Responses are detected automatically within ~30 seconds
- **Task Unblocking:** Non-SKIP responses reset retry counter and give task 10 fresh attempts
- **History:** Resolved items remain visible for reference (last ~10 items shown)
