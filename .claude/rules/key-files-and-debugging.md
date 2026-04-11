---
paths:
  - "src/**"
  - "ledgers/**"
---

# Key Files & Debugging

## Key Files Quick Reference

| What | Where |
|------|-------|
| Executive loop | `src/core/executive-loop.ts` |
| Vendor registry | `src/core/vendor/vendor-registry.ts` |
| Vendor types | `src/core/vendor/types.ts` |
| Worker spawner | `src/agentic/execution/worker-spawner.ts` |
| Work selector | `src/agentic/work-selection/work-selector.ts` |
| Goal scanner | `src/agentic/work-selection/goal-scanner.ts` |
| Goal breakdown | `src/agentic/work-selection/goal-breakdown.ts` |
| Prompt builder | `src/agentic/intelligence/prompt-builder.ts` (skill-based composition) |
| Vendor adapter | `src/agentic/intelligence/vendor-adapter.ts` (tool name mappings) |
| Strategy selector | `src/agentic/intelligence/strategy-selector.ts` |
| State handler | `src/deterministic/state-handler.ts` |
| STEPS.json handler | `src/deterministic/steps-json-handler.ts` |
| Credential tiers | `src/deterministic/credential-tiers.ts` |
| Skill/playbook loaders | `src/deterministic/skill-loader.ts`, `playbook-loader.ts` |
| Pattern resolver | `src/deterministic/execution-pattern-resolver.ts` |
| Notion reporter | `src/deterministic/notion-reporter.ts` |
| Identity (Gmail) | `src/identity/gmail-client.ts` |
| Identity (Discord) | `src/identity/discord-client.ts` |
| Constitution | `workspace/constitution.md` (**NEVER auto-modify**) |
| Workspace docs | `workspace-instructions/` (git-tracked template, frontmatter reference) |
| Worker skills source | `claude-files-to-output/skills/` (synced to ai-sandbox per spawn) |
| CLAUDE.md template | `claude-files-to-output/templates/ai-sandbox-claude-md.md` |
| Capability registries | `capabilities/*.yml` |
| Harness CLI entry | `src/harnesses/cli.ts` (`npm run harness --`) |
| Harness core types | `src/harnesses/core/types.ts` |
| Harness agent runner | `src/harnesses/core/harness-agent-runner.ts` (vendor-agnostic LLM chokepoint) |
| Harness registry | `src/harnesses/core/harness-registry.ts` |
| Harness executor | `src/agentic/execution/harness-executor.ts` (executive-loop bridge) |
| Harness reference doc | `HARNESS.md` (root) |

## Debugging Commands

```bash
tail -f ledgers/executive-$(date +%Y-%m-%d).log   # Live executive log
pm2 logs executive-loop                             # PM2 logs
cat workspace/needs-you.md                          # Blocked goals
tail -20 ledgers/work-ledger.jsonl                  # Recent events
grep "Goal Name" ledgers/work-ledger.jsonl | jq -r '.contract_id'  # Trace to worker log
```

## Common Issues

- **Worker fails immediately** → Check `.env.worker` auth tokens
- **Build fails** → `npm run typecheck` for details
- **No work selected** → Check `workspace/in-progress/P{0-4}/` for bundles with `status: pending`
- **Steps lost on restart** → Verify STEPS.json exists in the bundle
- **Self-enhance/skill-build steps repeat** → Title prefix must be preserved for regex matching in `updateStepStatus`
- **PM2 running stale code** → Verify `ecosystem.config.cjs` script path is `dist/core/executive-loop.js`
