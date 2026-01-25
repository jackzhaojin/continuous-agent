---
name: Reference Refresh
description: |
  Periodically refresh external references to keep them up-to-date. Use for weekly scheduled refresh of Mode A/B references, before starting work that depends on a reference, when encountering API/documentation drift, after major upstream releases, or when reference is marked stale (>30 days behind).
---

# Reference Refresh

Keep external references up-to-date.

## Refresh Schedule

| Mode | Schedule | Notes |
|------|----------|-------|
| A | Weekly | Automated check |
| B | Weekly | Must verify patches apply |
| C | Manual | You own the code |

## Mode A Refresh

```bash
cd references/sources/<reference-id>
git fetch origin
git log HEAD..origin/main --oneline  # Check for updates
git pull origin main                  # Apply updates
```

Update registry: `last_refreshed`, `upstream_commit`

## Mode B Refresh

1. Stash/export current patches
2. Refresh source (Mode A workflow)
3. Re-apply patches: `git apply ../patches/<ref>/*.patch`
4. If patches fail, manually resolve and regenerate
5. Update registry

## Mode C Refresh (Cherry-pick)

```bash
cd references/forks/<reference-id>
git remote add upstream <original-url>  # If not already
git fetch upstream
git cherry-pick <commit-hash>           # Selective updates only
```

## Staleness Detection

Reference is stale when:
- Mode A/B: upstream >30 days ahead
- Last refresh >60 days ago
- Explicit `stale: true` in registry

## Handling Failures

| Failure | Resolution |
|---------|------------|
| Patch conflicts | Manually update and regenerate patches |
| Breaking changes | Assess impact, escalate if critical |
| Network failures | Retry with backoff, mark `refresh_pending` |
