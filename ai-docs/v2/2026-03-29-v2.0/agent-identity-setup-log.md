# Agent Identity Setup — Execution Log

**Date:** 2026-03-29
**Performed by:** Claude (via Playwright browser automation)
**Account:** ${AGENT_EMAIL} (${AGENT_DISPLAY_NAME})

---

## What Was Done

### Step 1: Gmail Account (Pre-existing)

Account `${AGENT_EMAIL}` was already created by Jack before this session.

### Step 2: Google Cloud Project + Gmail API

All performed via Playwright MCP against `console.cloud.google.com`, signed in as `${AGENT_EMAIL}`.

#### 2a. Google Account First-Time Setup

- Navigated to `console.cloud.google.com` → redirected to Google sign-in
- Signed in with `${AGENT_EMAIL}`
- Skipped passkey enrollment ("Not now")
- Skipped home address ("Skip")
- Skipped profile picture ("Skip")

#### 2b. Google Cloud Console Onboarding

- Landed on Cloud Console welcome page ("Welcome, ${AGENT_DISPLAY_NAME}")
- Dismissed free trial $300 credit banner
- Agreed to Google Cloud Platform Terms of Service (checkbox + "Agree and continue")

#### 2c. Created Google Cloud Project

- Clicked "Select a project" → "New project"
- **Project name:** `${GCP_PROJECT_ID}`
- **Project ID:** `${GCP_PROJECT_ID}` (auto-generated, matches name)
- **Project number:** `${GCP_PROJECT_NUMBER}`
- Parent resource: No organization
- Clicked "Create" → confirmed via notification → "Select Project"

#### 2d. Enabled Gmail API

- Navigated directly to: `console.cloud.google.com/apis/library/gmail.googleapis.com?project=${GCP_PROJECT_ID}`
- Dismissed navigation tooltip overlay ("Got it")
- Clicked "Enable"
- Waited for enablement to complete
- Confirmed status: **Enabled** (redirected to API metrics page)

#### 2e. Configured OAuth Consent Screen

The new Google Auth Platform wizard (4-step flow) was used instead of the legacy OAuth consent screen:

1. **App Information:**
   - App name: `Executive Agent`
   - User support email: `${AGENT_EMAIL}` (selected from dropdown)
2. **Audience:**
   - Selected: **External** (Internal was disabled — not a Workspace org)
3. **Contact Information:**
   - Developer contact email: `${AGENT_EMAIL}`
4. **Finish:**
   - Agreed to Google API Services: User Data Policy (checkbox)
   - Clicked "Continue" then "Create"
   - Confirmation: "OAuth configuration created!"

#### 2f. Created OAuth2 Client Credentials

- From the OAuth overview page, clicked "Create OAuth client"
- **Application type:** Desktop app
- **Name:** `agent-cli`
- Clicked "Create"
- **Credentials obtained:**
  - Client ID: `${GCP_PROJECT_NUMBER}-****.apps.googleusercontent.com`
  - Client Secret: `GOCSPX-****`
- JSON download was triggered (available in browser downloads)

#### 2g. Added Test User

Since the app is in **Testing** publishing status, only test users can complete the OAuth flow:

- Navigated to Audience page
- Clicked "Add users"
- Added: `${AGENT_EMAIL}`
- Saved (1/100 user cap)

### Step 3: Environment Configuration

Updated `.env.executive`:
```bash
# Agent identity
AGENT_EMAIL=${AGENT_EMAIL}
# Gmail OAuth Configuration
IDENTITY_ENABLED=true
GMAIL_ENABLED=true
GMAIL_CLIENT_ID=${GCP_PROJECT_NUMBER}-****.apps.googleusercontent.com
GMAIL_CLIENT_SECRET=GOCSPX-****
GMAIL_REFRESH_TOKEN=                  # ← STILL NEEDS TO BE OBTAINED
```

Updated `.env.executive.example` with placeholder fields for:
- `AGENT_EMAIL`, `AGENT_EMAIL_PASSWORD`
- `IDENTITY_ENABLED`, `GMAIL_ENABLED`
- `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`

---

## What Still Needs to Be Done

### COMPLETED: Get Refresh Token

Gmail refresh token obtained via OAuth flow script (`scripts/gmail-oauth-flow.mjs`).
Token saved to `local-only/tokens/gmail-refresh-token.txt` and `.env.executive`.

### COMPLETED: Discord Bot Setup (replaced Slack)

Discord was chosen over Slack since the owner doesn't use Slack.

**Code changes:**
- `src/identity/slack-client.ts` → deleted
- `src/identity/discord-client.ts` → created (same public API: `sendCompletionNotification`, `sendBlockedNotification`, `sendDailySummary`)
- `src/identity/identity-types.ts` → Slack types replaced with Discord types (`DiscordMessage`, `DiscordEmbed`, `DiscordEmbedField`)
- `src/identity/gmail-client.ts` → config loader updated (Discord env vars)
- `src/core/executive-loop.ts` → imports swapped from slack-client to discord-client
- `src/deterministic/dashboard-writer.ts` → `last_slack_sent` → `last_discord_sent`
- Added `agentDisplayName` to `IdentityConfig` (read from `AGENT_DISPLAY_NAME` env var)

**Discord setup (via Playwright browser automation):**
1. Created Discord account with `${AGENT_EMAIL}` (email/password — Discord doesn't support Google SSO)
2. Verified email via Gmail
3. Created Discord application named `${AGENT_DISPLAY_NAME}` at discord.com/developers
4. Created bot, enabled MESSAGE CONTENT INTENT
5. Generated OAuth2 invite URL with permissions: Send Messages, Embed Links, Read Message History (integer: 83968)
6. Bot invited to shared Discord server
7. Agent user account friended the owner's main Discord account
8. Bot token saved to `local-only/tokens/discord-bot-token.txt`

**E2E test results:**
- Bot channel message to `#ai-talk`: PASS
- Bot DM to owner: PASS
- Test file: `tests/e2e/executive-accounts/discord-test.mjs`

**Env vars (in `.env.executive`):**
- `DISCORD_ENABLED=true`
- `DISCORD_BOT_TOKEN` — bot token (in `.env.executive`, not committed)
- `DISCORD_CHANNEL_ID` — `#ai-talk` channel
- `DISCORD_DM_USER_ID` — owner's Discord user ID
- `DISCORD_MAX_MESSAGES_PER_HOUR=10`

### TODO: Rename OAuth App

The Google Cloud OAuth app is currently named "Executive Agent" — should be renamed to `${AGENT_DISPLAY_NAME}`.
Location: Google Auth Platform → Branding → App name

### TODO: Notion Guest Presence

Not started. Requires:
- Inviting `${AGENT_EMAIL}` as a Notion workspace guest
- Granting access to Agent Milestones database and summaries pages

---

## Key Details for Reference

| Item | Value |
|------|-------|
| Agent email | `${AGENT_EMAIL}` |
| Agent display name | `${AGENT_DISPLAY_NAME}` |
| GCP project name | `${GCP_PROJECT_ID}` |
| GCP project ID | `${GCP_PROJECT_ID}` |
| GCP project number | `${GCP_PROJECT_NUMBER}` |
| OAuth app name | Executive Agent (TODO: rename to display name) |
| OAuth client name | agent-cli |
| OAuth client ID | `${GCP_PROJECT_NUMBER}-****.apps.googleusercontent.com` |
| OAuth client secret | In `.env.executive` (not committed) |
| OAuth client type | Desktop app |
| Publishing status | Testing |
| Test users | `${AGENT_EMAIL}` |
| User type | External |
| Discord app name | `${AGENT_DISPLAY_NAME}` |
| Discord bot permissions | Send Messages, Embed Links, Read Message History (83968) |
| Discord server | Shared server with owner |
| Discord channel | `#ai-talk` |
