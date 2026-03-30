---
paths:
  - "src/identity/**"
---

# Identity System (v2.0)

Agent communication presence via Gmail and Discord. All opt-in, disabled by default.

## Gmail (`gmail-client.ts`)

- OAuth2 refresh token flow with cached access tokens (60s buffer)
- Fetches unread emails, parses intents: `priority_change`, `new_goal`, `approval`, `question_answer`, `skip`, `needs_clarification`
- Sends clarification replies for ambiguous emails
- Email labeling and archiving after processing

## Discord (`discord-client.ts`)

- Webhook-based posting (no bot required)
- Throttle: configurable max messages/hour (default 10, sliding window)
- Notification types: completion (green embed), blocked (red embed), daily summary

## Inbox Checker (`inbox-checker.ts`)

Phase 0.5 hook in executive loop. Runs before Phase 1.
- Configurable check interval (`INBOX_CHECK_INTERVAL`, default every iteration)
- Queues actionable intents for Phase 2 processing
- Sends clarification replies for low-confidence intents

## Configuration

All in `.env.executive`:

```
IDENTITY_ENABLED=false              # Master kill switch
GMAIL_ENABLED=false
DISCORD_ENABLED=false
AGENT_EMAIL=                        # Gmail address
GMAIL_REFRESH_TOKEN=
GMAIL_CLIENT_ID=
GMAIL_CLIENT_SECRET=
DISCORD_WEBHOOK_URL=
DISCORD_MAX_MESSAGES_PER_HOUR=10
INBOX_CHECK_INTERVAL=1
```

## Setup Guide

See `ai-docs/v2/2026-03-29-v2.0/agent-identity-setup.md` for full walkthrough.
