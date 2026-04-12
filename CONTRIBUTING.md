# Contributing to continuous-agent

Thanks for your interest. This document covers the conventions that keep
the codebase coherent across contributors (human and agent).

## Code style

### TypeScript

- **ES modules only.** `"type": "module"` in `package.json`, `target: ES2022`,
  strict mode.
- **`.js` extension in imports.** Relative imports must end with `.js` even
  for `.ts` files (`import { foo } from './bar.js'`) — this is required by
  TSC's `moduleResolution: Node` setting under ESM.
- **No CommonJS.** No `require()`, no `module.exports`.
- **Runtime: Node 20+.**
- **Run `npm run typecheck`** (or `tsc --noEmit`) before committing. The
  develop worktree uses `typecheck`, NOT `npm run build`, because `build`
  signals PM2 on the main worktree.

### Comments

- Default to **no comments**. Only add one when the WHY is non-obvious:
  a constraint, invariant, workaround for a specific bug, or surprising
  behavior a reader wouldn't guess from the code.
- Don't explain WHAT the code does — identifiers already do that.
- Don't reference the current task or PR — that belongs in commit messages.

### Tests

- There is no Jest/Mocha test runner. Ad-hoc tests live in `tests/adhoc/`
  and run via `npx tsx tests/adhoc/<file>.ts`.
- E2E vendor tests: `tests/e2e/vendor-workers/<vendor>-e2e.ts`.
- Harness smoke tests: small scripts under `/tmp/*.mjs` invoked manually
  during development (see `/Users/*/.../p*-smoke.mjs` examples in the
  git history).

## Writing a new harness

A "harness" is a multi-agent plan-then-build pipeline that lives under
`src/harnesses/<name>/`. To add one:

1. Create `src/harnesses/<name>/` with:
   - `index.ts` — class implementing `HarnessOrchestrator`
   - `orchestrator.ts` — the run loop that drives `runHarnessAgent()`
   - `state-store.ts`, `prompt-loader.ts`, `model-defaults.ts` — supporting
     modules
   - `prompts/` — prompt template files, copied verbatim from whatever
     source the harness was ported from
2. Register the harness in `src/harnesses/core/harness-registry.ts`:
   ```ts
   import { MyHarness } from '../my-harness/index.js';
   REGISTRY.set('my-harness', new MyHarness());
   ```
3. Run `npx tsx src/harnesses/cli.ts --list` and verify it appears.
4. Run a standalone smoke test against a tiny fixture:
   ```
   npx tsx src/harnesses/cli.ts --name my-harness --prompt fixtures/hello/PROMPT.md --vendor claude
   ```

### Vendor parity

Harnesses MUST invoke LLM agents via
`src/harnesses/core/harness-agent-runner.ts:runHarnessAgent()`. Do NOT
import `@anthropic-ai/claude-agent-sdk` directly from inside
`src/harnesses/*` — that would break Codex and Kimi vendor support.

If your harness uses skill/agent spawning (like the study harness's
coordinator), you are responsible for making those work across vendors.
Claude supports native Task/Skill tools via `settingSources`; non-Claude
vendors need a `__spawn__`-style emulation protocol, which is not yet
shipped (see `src/harnesses/study/orchestrator.ts` header for details).

## Pull requests

- Branch from `main`. The `develop` worktree is for long-running local
  experiments and is not a shared integration branch.
- One logical change per commit. Use the `jack-git-commit` skill or a
  hand-written Conventional Commit (`type(scope): summary`).
- Never `git push --force` without explicit review approval.
- Never `--no-verify` (unless an orchestrator explicitly does so for
  metadata-only commits under `ai-docs/`).

## Licensing

By contributing, you agree that your contributions will be licensed under
the Apache License, Version 2.0. See `LICENSE` and `NOTICE`.
