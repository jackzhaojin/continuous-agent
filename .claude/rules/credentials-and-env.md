---
paths:
  - "src/deterministic/credential-tiers.ts"
  - ".env*"
  - "ecosystem.config.cjs"
---

# Credential System Details

## Three-Tier Separation

| Tier | File | Purpose | Consumers |
|------|------|---------|-----------|
| **1 - Executive** | `.env.executive` | Loop config, Notion reporting, identity, breakdown settings | Executive loop only |
| **2 - Worker** | `.env.worker` | Claude SDK auth (OAuth token), model selection | Worker agents (via `ai-sandbox/.env`) |
| **3 - Application** | `.env.app` | DB, cache, storage, payment, email keys | Built apps (platform-agnostic) |

**Key rules:**
- Physical file separation prevents accidental tier mixing
- Tier 1 keys (e.g., `NOTION_API_KEY`) NEVER reach workers
- Tier 3 uses `APP_` prefix convention -- stripped when injecting (e.g., `APP_DATABASE_URL` -> `DATABASE_URL`)
- Tier 3 is platform-agnostic: format helpers convert to dotenv, JSON, shell, docker-compose, YAML
- Falls back to legacy `.env` if tiered files don't exist

**Auth:** OAuth token (`CLAUDE_CODE_OAUTH_TOKEN`) via Claude Pro/Max subscription. No Anthropic API key.

## Tier 3 Format Helpers (`credential-tiers.ts`)

- `getAppCredentialPairs(path)` -- reads `.env.app`, strips `APP_` prefix
- `formatAppEnv(pairs, format)` -- converts to: `dotenv`, `json`, `shell`, `docker-compose`, `yaml`
- `checkWorkerEnvForLeaks(path)` -- validates no Tier 1 keys in worker env
- `checkAppEnvForLeaks(path)` -- validates no Tier 1/2 keys in app env
- `resolveEnvFile(root, tier)` -- resolves tiered file with fallback

## PM2 Configuration (`ecosystem.config.cjs`)

- `NODE_ENV=development` so worker `npm install` gets devDependencies
- `cwd` and `AGENT_OUTPUTS_PATH` are hardcoded absolute paths
- Script path: `dist/core/executive-loop.js`
