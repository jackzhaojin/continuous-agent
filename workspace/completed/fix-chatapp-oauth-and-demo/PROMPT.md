---
title: Fix Chat App to Use OAuth Token and Record Playwright Demo Video
slug: fix-chatapp-oauth-and-demo
status: complete
priority: P2
complexity: high
created: "2026-03-28"
tags:
  - bugfix
  - oauth
  - playwright
  - demo-video
  - chat-app
max_turns: 500
output_path: /Users/jackjin/dev/ai-sandbox/projects/nextjs/2026-01-29/1769671611924
branch: null
---

## Problem

The Conversational Chat App (`ai-sandbox/projects/nextjs/2026-01-29/1769671611924/chat-app/`) uses the **Anthropic SDK** (`@anthropic-ai/sdk`) which requires an `ANTHROPIC_API_KEY` we don't have. We only use **Claude Pro/Max subscription OAuth** (`CLAUDE_CODE_OAUTH_TOKEN`). The app currently fails with a 500 error when sending a message.

This needs to be fixed so the chat app works with our OAuth-based setup. Then record a Playwright demo video showcasing the working app end-to-end.

**Root cause:** `lib/anthropic/client.ts` imports `Anthropic from '@anthropic-ai/sdk'` and expects `ANTHROPIC_API_KEY`. This needs to be replaced with an approach compatible with our OAuth token (either swap to the Claude Agent SDK, or use the Anthropic SDK with OAuth token auth if supported).

**What success looks like:**
- Chat app sends messages and receives Claude responses using `CLAUDE_CODE_OAUTH_TOKEN` (no API key)
- App builds and runs without errors
- Playwright demo video recorded showing: landing page, registration, login, sending a message, receiving a Claude response
- Video saved to the project directory

## Project Context

### Language/Stack

- **Language**: TypeScript
- **Framework**: Next.js 15, Prisma (SQLite), Auth.js v5
- **Build system**: npm
- **Key dependency to fix**: `@anthropic-ai/sdk` → needs OAuth-compatible approach

### Existing Project?

- [x] **Existing project** - Enhancing/modifying

Current state:
```
- Landing page: works
- Registration/Login: works (SQLite + Auth.js)
- Chat UI: works (renders messages, sidebar, conversation list)
- Claude integration: BROKEN — 500 error on /api/chat due to missing ANTHROPIC_API_KEY
- The app has its own Playwright e2e test setup already
```

## References & Inputs

### Key Files to Modify

- `lib/anthropic/client.ts` — Current Anthropic SDK client (needs OAuth fix)
- `app/api/chat/route.ts` — API route that calls Claude
- `.env` — Needs `CLAUDE_CODE_OAUTH_TOKEN` instead of `ANTHROPIC_API_KEY`

### Playwright Demo Video Skill

Use the `playwright-demo-video` skill at `ai-sandbox/.claude/skills/playwright-demo-video/SKILL.md` to record the demo video.

## Definition of Done

**Build**:
- [ ] `npm run build` passes with zero errors
- [ ] No TypeScript compiler warnings

**Functionality**:
- [ ] Chat messages are sent and Claude responds successfully
- [ ] Uses `CLAUDE_CODE_OAUTH_TOKEN` from environment (NOT `ANTHROPIC_API_KEY`)
- [ ] Registration, login, and conversation flows all work end-to-end
- [ ] Error handling shows user-friendly messages

**Demo Video**:
- [ ] Playwright demo video recorded showing full user journey
- [ ] Video covers: landing page → register → chat → receive Claude response
- [ ] Video saved in the project directory

**Code Quality**:
- [ ] Git committed with clean status
- [ ] `.env.example` updated to reflect OAuth token usage

## Approach

1. **Research**: Check if `@anthropic-ai/sdk` supports OAuth token auth, or if we need to switch to `@anthropic-ai/claude-agent-sdk` for the chat backend
2. **Fix the client**: Update `lib/anthropic/client.ts` and the API route to use OAuth
3. **Update env**: Switch from `ANTHROPIC_API_KEY` to `CLAUDE_CODE_OAUTH_TOKEN` in `.env` and `.env.example`
4. **Test manually**: Verify the chat flow works end-to-end
5. **Record demo**: Use the Playwright demo video skill to capture the full user journey

## Constraints

### Important

- **OAuth only** — We do NOT have an Anthropic API key and have no budget for one
- **Do not break existing features** — Auth, SQLite DB, conversation history must continue working
- The `CLAUDE_CODE_OAUTH_TOKEN` is available in `.env.app` at the ai-sandbox root (`APP_CLAUDE_CODE_OAUTH_TOKEN`)

## Open Questions

- Can `@anthropic-ai/sdk` accept an OAuth token directly, or do we need to use the Agent SDK's `query()` as a backend proxy?
- If Agent SDK is needed, how to handle streaming responses in the Next.js API route?

## Agent Notes

<!-- Accumulated by agent during execution -->
