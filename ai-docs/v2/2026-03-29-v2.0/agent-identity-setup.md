# Agent Identity Setup Guide

**Date:** 2026-03-29
**Purpose:** Step-by-step instructions to give your executive agent its own email, Slack presence, and Notion identity.

---

## Prerequisites

- The executive agent is running (PM2 or dev mode)
- You have a personal Google account
- You have a Slack workspace (or can create one)
- Notion workspace already configured (from V1.2)

---

## Step 1: Choose Your Agent's Name and Email

Pick a name and create a dedicated Gmail account for the agent. This becomes the agent's identity across all services.

**Naming suggestions:**
- `exec.agent.jackjin@gmail.com`
- `jack.agent.exec@gmail.com`
- `{agent-name}.agent@gmail.com` (if you want to give it a character name)

**Create the Gmail account:**
1. Go to https://accounts.google.com/signup
2. Use the agent's name as first/last name (e.g., "Exec Agent" or your chosen name)
3. Use the email address you chose above
4. Set a strong password and save it in your password manager
5. **Skip phone verification if possible** — use your own phone only if required
6. **Skip 2FA for now** — we'll use OAuth tokens, not password login

> **Note:** You'll need to sign into this account once from a browser to complete setup. After that, the agent uses API tokens only — no browser needed.

---

## Step 2: Set Up Google Cloud Project + Gmail API

This is the one-time OAuth setup that gives the agent programmatic access to its Gmail.

### 2a. Create a Google Cloud Project

1. Go to https://console.cloud.google.com/
2. Sign in with **the agent's Gmail account** (not your personal one)
3. Click "Select a project" → "New Project"
4. Name it something like `executive-agent` or `agent-identity`
5. Click "Create"

### 2b. Enable Gmail API

1. In the Cloud Console, go to **APIs & Services → Library**
2. Search for "Gmail API"
3. Click "Gmail API" → click **"Enable"**

### 2c. Configure OAuth Consent Screen

1. Go to **APIs & Services → OAuth consent screen**
2. Select **"External"** user type → click "Create"
3. Fill in:
   - App name: `Executive Agent`
   - User support email: the agent's Gmail
   - Developer contact email: your personal email
4. Click "Save and Continue"
5. **Scopes:** Click "Add or Remove Scopes" and add:
   - `https://www.googleapis.com/auth/gmail.readonly` (read inbox)
   - `https://www.googleapis.com/auth/gmail.send` (send emails)
   - `https://www.googleapis.com/auth/gmail.modify` (label/archive)
6. Click "Save and Continue"
7. **Test users:** Add the agent's Gmail address as a test user
8. Click "Save and Continue" → "Back to Dashboard"

### 2d. Create OAuth2 Credentials

1. Go to **APIs & Services → Credentials**
2. Click **"+ Create Credentials" → "OAuth client ID"**
3. Application type: **"Desktop app"**
4. Name: `agent-cli`
5. Click "Create"
6. **Download the JSON** — you'll need `client_id` and `client_secret` from it

### 2e. Get the Refresh Token (One-Time Auth Flow)

Run this script from your terminal to complete the OAuth flow and get a long-lived refresh token:

```bash
# Install the Google auth library (temporary, just for this setup)
npm install googleapis

# Run the auth flow
node -e "
const { google } = require('googleapis');
const http = require('http');
const url = require('url');

const CLIENT_ID = 'YOUR_CLIENT_ID_HERE';
const CLIENT_SECRET = 'YOUR_CLIENT_SECRET_HERE';
const REDIRECT_URI = 'http://localhost:3333';

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent',
  scope: [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/gmail.modify',
  ],
});

console.log('Open this URL in your browser:');
console.log(authUrl);

const server = http.createServer(async (req, res) => {
  const query = url.parse(req.url, true).query;
  if (query.code) {
    const { tokens } = await oauth2Client.getToken(query.code);
    console.log('\n=== SAVE THESE VALUES ===');
    console.log('GMAIL_REFRESH_TOKEN=' + tokens.refresh_token);
    console.log('========================\n');
    res.end('Done! You can close this tab.');
    server.close();
  }
}).listen(3333, () => {
  console.log('Waiting for OAuth callback on http://localhost:3333 ...');
});
"
```

**What happens:**
1. A URL prints in the terminal — open it in your browser
2. Sign in with the **agent's Gmail account**
3. Click "Continue" through the consent screens
4. The browser redirects to localhost and prints the refresh token
5. Copy the `GMAIL_REFRESH_TOKEN` value

---

## Step 3: Set Up Slack Bot

### 3a. Create a Slack App

1. Go to https://api.slack.com/apps
2. Click **"Create New App" → "From scratch"**
3. App name: your agent's name (e.g., "Exec Agent")
4. Workspace: select your workspace
5. Click "Create App"

### 3b. Add Bot Permissions

1. In the app settings, go to **OAuth & Permissions**
2. Under "Bot Token Scopes", add:
   - `chat:write` — send messages
   - `channels:read` — list channels
   - `im:write` — send DMs
   - `chat:write.customize` — custom bot name/icon per message (optional)
3. Scroll up and click **"Install to Workspace"**
4. Click "Allow"
5. Copy the **"Bot User OAuth Token"** (starts with `xoxb-`)

### 3c. Create a Channel or Get DM Channel ID

**Option A: Dedicated channel**
1. Create a channel like `#agent-updates` in your Slack workspace
2. Invite the bot to the channel: `/invite @ExecAgent`
3. Get the channel ID: right-click the channel name → "View channel details" → copy the Channel ID at the bottom

**Option B: Direct messages**
1. Open a DM with the bot
2. Get the DM channel ID from the URL (it's the `D...` or `C...` string after `/messages/`)

---

## Step 4: Configure Environment Variables

Add these to your `.env.executive` file:

```bash
# Agent Identity — Master Switch
IDENTITY_ENABLED=true

# Gmail Configuration
GMAIL_ENABLED=true
AGENT_EMAIL=exec.agent.jackjin@gmail.com      # Your agent's Gmail
GMAIL_CLIENT_ID=123456789-abc.apps.googleusercontent.com
GMAIL_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxx
GMAIL_REFRESH_TOKEN=1//0xxxxxxxxxxxxxxxxx

# Slack Configuration
SLACK_ENABLED=true
SLACK_BOT_TOKEN=xoxb-xxxxxxxxxxxx-xxxxxxxxxxxx-xxxxxxxxxxxxxxxxxxxxxxxx
SLACK_CHANNEL_ID=C0123456789                   # Channel or DM ID
SLACK_MAX_MESSAGES_PER_HOUR=10                 # Throttle limit

# Inbox Checking
INBOX_CHECK_INTERVAL=1                         # Check every N loop iterations
```

After editing, rebuild and restart:

```bash
npm run build
pm2 restart executive-loop
```

---

## Step 5: Set Up Notion Guest Presence

Your Notion integration is already configured from V1.2. To give the agent a named presence:

1. Go to your Notion workspace settings → **Members**
2. Click **"Invite"** → enter the agent's Gmail address
3. Set role to **"Guest"** with access to:
   - Agent Milestones database
   - Monthly summaries page
   - Any other pages you want the agent to update
4. The agent's Notion updates will now show the agent's name instead of "Integration"

> **Note:** The existing `NOTION_API_KEY` in `.env.executive` continues to work. The guest invitation is purely for attribution — Notion shows "Exec Agent commented" instead of anonymous API writes.

---

## Step 6: Verify Everything Works

### Test Gmail

```bash
# The agent will check inbox on next loop iteration.
# Send a test email TO the agent's address:
#   Subject: "Test"
#   Body: "Hello agent"
# Watch PM2 logs:
pm2 logs executive-loop --lines 50
# Look for: [IDENTITY] Gmail check: 1 unread email(s)
```

### Test Slack

```bash
# The agent sends Slack messages when goals complete or block.
# Create a test goal and watch for the Slack notification.
# Or check logs for: [IDENTITY] Slack message sent
```

### Kill Switches

If anything goes wrong, you can disable individual channels without stopping the agent:

```bash
# In .env.executive:
IDENTITY_ENABLED=false    # Disables ALL identity features
GMAIL_ENABLED=false       # Disables only Gmail
SLACK_ENABLED=false       # Disables only Slack
```

---

## Security Notes

- **Refresh tokens don't expire** unless revoked — no re-auth needed
- **Bot tokens are workspace-scoped** — they can't access other workspaces
- All identity credentials live in `.env.executive` (Tier 1) — they **never** reach worker agents
- The agent can only read/send from **its own** email address
- Slack messages are throttled to 10/hour by default
- All identity actions are logged to the executive ledger

---

## What the Agent Does with Identity

Once configured, the executive loop automatically:

1. **Phase 0.5 (Inbox Check):** Reads unread emails, parses intent (priority changes, new goals, approvals), processes them like needs-you.md responses
2. **On goal blocked:** Sends you a Slack DM and/or email with the blocker details
3. **On goal completed:** Posts a summary to `#agent-updates`
4. **Weekly:** Sends a summary email of what was accomplished

You can email the agent instructions like:
- "Reprioritize the dashboard goal to P1"
- "Skip the EDS site builder goal"
- "Here's the API key you asked for: sk_xxx"

The agent parses these on its next loop iteration and acts accordingly.
