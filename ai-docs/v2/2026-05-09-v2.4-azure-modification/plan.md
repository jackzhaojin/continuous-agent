# v2.4 — Azure Functions Deploy Skill + Executive Wiring + First CICD Goal

**Date:** 2026-05-09
**Branch:** `main` (continuous-agent)
**Target repo:** `/Users/jackjin/dev/azure-star-generator`
**Plan file alias:** `/Users/jackjin/.claude/plans/validated-prancing-lerdorf.md`

---

## Read this first

This document is the load-bearing artifact for executing the Azure CICD work after a context clear. It contains:

1. Full historical context (so you understand why we're doing this)
2. The exact SKILL.md content (verbatim — write it as-is)
3. The exact prompt-builder.ts edits (six small additions, each shown with surrounding context)
4. The exact PROMPT.md content (verbatim — write it as-is)
5. The exact command sequence to execute, build, verify, and run
6. The exact monitor scripts to arm during the run
7. Roll-back guidance

Companion file: `conversation-log.md` (in this same directory) captures the full session arc that led to this plan.

---

## 1. Context — the long version

### 1.1 The agent system

The continuous-agent at `/Users/jackjin/dev/continuous-agent` is an autonomous LLM-driven worker orchestrator running 24/7 via PM2 (`ecosystem.config.cjs`, process name `executive-loop`). It picks goals from `workspace/{ondeck,in-progress/P{0..4}}/`, spawns workers via the Claude Agent SDK, validates results, commits state, sleeps, repeats.

Three-layer architecture:
- `src/agentic/` — LLM-driven decisions (work selection, prompt composition, breakdown, diagnosis)
- `src/deterministic/` — mechanical ops (verifiers, file I/O, state updates)
- `src/core/` — loop orchestration

Worker skills live at `claude-files-to-output/skills/<name>/SKILL.md`. They're synced into the worker's `.claude/skills/` per spawn (commit `fb73ec2` extends this sync to `build_target: existing` projects too).

Executive skills live at `.claude/skills/<name>/SKILL.md`. Read by the executive loop's prompt-builder.

### 1.2 What happened in the previous run (2026-04-26 → 04-27)

The user manually checked out their old `azure-star-generator` Azure Functions project into `/Users/jackjin/dev/azure-star-generator`. We tested `build_target: existing` for the first time on that repo — a small UI-only refresh: loading state, error UI, copy-to-clipboard button, plus a Playwright spec to verify the journey end-to-end.

**First attempt failed catastrophically.** Worker built an Azure Table Storage layer the project never asked for. We caught and reverted. Root cause: Phase 3b's prereq-injection heuristic ("web + data backend detected") fired against the goal body's `DO NOT database` keywords, and the worker wasn't running with the `worker-base` skill loaded because the skill-sync didn't fire for `existing` mode.

**Patch fb73ec2** added `setupExistingProjectSkills(projectPath)` to `worker-spawner.ts` so `claude-files-to-output/{skills,agents,templates}` get synced into the target_dir's `.claude/` for `existing` mode. Also adds `/.claude/` to the project's `.gitignore` so the synced tree is invisible.

**Second attempt** with tightened PROMPT.md (`complexity: low`, hard prohibitions, trip-wire on DB-related words) shipped the 3 UI deliverables (commit `98bf9ea` on `azure-star-generator main`) but **skipped the entire Steps A-F testing protocol** — no `playwright.config.js`, no `tests/e2e/`, no `@playwright/test`, no `test:e2e` script, no OpenAI stub. Phase 5 verifier marked it complete anyway because:
- 6/8 verifiers passed (75% ≥ 50% threshold)
- 2 failures (`node_test`, `files_exist`) were classified as advisory
- `result.success === true` (worker reported success)
- Goal moved to `workspace/completed/2026-04-26-azure-star-generator-refresh-1/`

### 1.3 Patches A + B (commit `c08b9b7`)

After this false-success, we added:

**Patch A** — `src/deterministic/validation-handler.ts` and new helper `src/deterministic/journey-satisfiability.ts`. When `definition_of_done_journey` is set on a non-intermediate step AND the journey describes browser interaction (regex matches `browser|click|playwright|chromium|...`), the validator scans the project for Playwright config / `tests/e2e/` / `test:e2e` script. If none found → hard-fail (`isValid = false`, `journey_satisfiable` added to blocking failures). The hoist position is **before** the `overallStatus === 'PASS'` early-return so the gate fires even when generic verifiers happen to pass.

**Patch B** — `src/agentic/execution/integration-validator-runner.ts` + `src/core/executive-loop.ts`. Phase 5b now runs for both step-execution and whole-goal mode. `runIntegrationValidator` accepts `step?: WorkStep | undefined` and a `projectPath?` parameter. When step is undefined (single-goal mode, no STEPS.json), it runs the journey satisfiability check as a deterministic cheap-check and fails the goal with a defect record if unsatisfied. `isValid` was changed from `const` to `let` in executive-loop.ts so Phase 5b can flip it on whole-goal fail.

These patches are committed and the `dist/` is built. PM2 has been stopped since the patches went in — restart picks them up.

### 1.4 Where things sit RIGHT NOW (start of 2026-05-09 session)

```
continuous-agent:
  HEAD = c08b9b7 (Patches A+B for journey satisfiability)
  working tree: clean
  PM2: stopped

azure-star-generator (target):
  HEAD = 98bf9ea (UI deliverables 1-3 from prior run)
  no .github/ dir (clean slate for CICD)
  no playwright.config.* (the skipped Steps A-F)
  status: -s clean
```

The user resumed today after 2 weeks. They're explicitly choosing NOT to redo the previous run — partial UI work stays. New scope: bring CICD to `azure-star-generator` via GitHub Actions, using two reference projects as templates.

### 1.5 Reference projects studied

| Project | Workflow file | Pattern | Reusable |
|---|---|---|---|
| `azure-da-mcp` | `.github/workflows/main_jack-mcp-azure-ai-function.yml` | Two-job split: build (npm install + zip) → deploy (OIDC `azure/login@v2` + `Azure/functions-action@v1`). Uses 3 OIDC secrets named `AZUREAPPSERVICE_{CLIENTID,TENANTID,SUBSCRIPTIONID}_<hash>`. Auto-generated when "Deploy to Azure" runs from VS Code or Azure portal. | **Primary template** for Deliverable 3. |
| `azure-da-mcp` | `.github/workflows/deploy-content-authoring-eval.yml` | Tag-triggered (`v*`), `paths:` filter, Docker → GHCR. | Reference for `paths:` filter and `workflow_dispatch`. |
| `shadow-pivot-nextjs` | `.github/workflows/main_shadow-pivot-nextjsv2.yml` | Docker → GHCR → Azure Web App restart via `az webapp restart`. OIDC via 3 user-named secrets. | OIDC pattern reference (not directly reusable for Functions). |

The full content of `azure-da-mcp/main_jack-mcp-azure-ai-function.yml` is documented in `conversation-log.md` Section 4. It's the canonical template.

### 1.6 User's confirmed scope decisions for this work

From the user's plan-mode message (verbatim cleanup of voice-style input):
- Worker skill is a separate concern from the goal — write the skill first.
- Likes that the Azure Functions skill is separate (not bundled into web-testing).
- Likes the prompt-builder regex auto-load — "the executive should understand what the worker is capable of."
- Goal is `complexity: low`, single worker session.
- Worker commits **direct to main** of the target repo. No feature branch, no PR. "We don't need to make it more complicated. I believe the executive agent and worker agent are capable of this."
- Continuous-agent and worker-branch both stay on `main`. No comparison flow.
- Use plan mode so context can be cleared after planning, then execute fresh.

---

## 2. Three deliverables — at-a-glance

| # | What | Where | Type | Roughly |
|---|---|---|---|---|
| 1 | Worker skill | `claude-files-to-output/skills/azure-function-deploy/SKILL.md` | Create | ~280 lines |
| 2 | Executive auto-load | `src/agentic/intelligence/prompt-builder.ts` | Modify (6 edits) | ~25 lines added |
| 3 | Goal bundle | `workspace/drafts/2026-05-09-azure-star-generator-cicd-pass-1/PROMPT.md` | Create | ~210 lines |

---

## 3. Deliverable 1 — Worker skill `azure-function-deploy`

**File path:** `/Users/jackjin/dev/continuous-agent/claude-files-to-output/skills/azure-function-deploy/SKILL.md`

**Action:** Write this entire file verbatim. Create the parent directory first if it doesn't exist.

```bash
mkdir -p /Users/jackjin/dev/continuous-agent/claude-files-to-output/skills/azure-function-deploy
```

### 3.1 Full SKILL.md content

```markdown
---
name: azure-function-deploy
description: >
  GitHub Actions CICD for Azure Functions (Node.js). Builds, packages, and deploys
  via Azure/functions-action@v1 with OIDC auth. Use when the goal involves wiring
  CI/CD for an Azure Functions project, adding a deploy workflow, or setting up
  GitHub Actions for an existing Azure Functions app.
user-invocable: false
metadata:
  category: skill
version: "0.1.0"
tools_required: []
---

# Azure Function Deploy — Worker Skill

You are wiring GitHub Actions CICD for an Azure Functions (Node.js) project. This skill gives you the canonical workflow shape, the auth model, the path-filter discipline, and the user-side setup walkthrough you must produce as documentation.

## When this skill applies

This skill auto-loads when the goal title or body matches `azure[\s-]?function | func {start|deploy|run|init} | functions-action | az functionapp | .funcignore | host.json`.

Use it when:
- The goal asks for GitHub Actions CICD, deploy workflows, or CI for an Azure Functions Node.js project
- An Azure Functions project (presence of `host.json` and `.funcignore`) needs build + deploy automation
- The user references the `azure-da-mcp` repo as a CICD template

DO NOT use this skill for:
- Provisioning Azure resources (creating Function Apps, Storage Accounts, Resource Groups). The worker never runs `az functionapp create`.
- Configuring Azure AD App Registrations or federated credentials. That is user-only.
- Writing test code. Use `web-testing` or `backend-testing` for tests.

## Pre-flight checklist (the worker MUST run these BEFORE writing any workflow YAML)

1. **Locate the Functions root.** Look for the directory containing both `host.json` and `package.json`. It may be at the repo root or nested (e.g. `code/Functions/<app-name>/`). Use `find . -name host.json -not -path '*/node_modules/*' | head -5` to enumerate. Pick the deepest unique path.
2. **Read `host.json`** to confirm the project version (`"version": "2.0"` for v4 programming model).
3. **Read `package.json`** in the Functions dir. Note the Node `engines` field (default to `20.x` if absent), all `scripts`, all `dependencies`. Do NOT plan to add new runtime dependencies. Do NOT plan to bump `engines.node`.
4. **Read `.funcignore`** to understand what the Functions runtime excludes from deploy.
5. **Read repo `.gitignore`** to avoid duplicating ignores.
6. **Check for existing `.github/workflows/`.** If present, do NOT clobber. Read the existing files; if they already cover CI/CD, document and write to `workspace/needs-you.md`. If they cover only one piece, ADD the missing one without overwriting.
7. **Read the repo's `git remote get-url origin`** to discover `<owner>/<repo>` for the README badge URL. If no remote, leave `<OWNER>/<REPO>` placeholder and document.
8. **Try to discover the Function App name.** Search README, host.json, any `local.settings*.json` for an Azure resource name like `<app-name>.azurewebsites.net` or `func azure functionapp publish <name>`. If found, use it. If not, leave a clearly-marked `<APP_NAME_HERE>` placeholder in deploy.yml AND in cicd-setup.md's troubleshooting section.

## Authentication mode — decision tree

Three real options for GitHub Actions to authenticate to Azure. Recommend **OIDC** by default; document the others in `cicd-setup.md` as alternatives.

### OIDC (recommended) — federated identity, no rotating secrets

GitHub Actions presents a JWT to Azure AD; Azure validates the JWT against a registered federated credential and issues a token. No long-lived secrets stored in GitHub.

**GitHub secrets needed (3):** `AZUREAPPSERVICE_CLIENTID`, `AZUREAPPSERVICE_TENANTID`, `AZUREAPPSERVICE_SUBSCRIPTIONID`. (When using the Azure Portal "Get publish profile → Set up GitHub Actions" wizard, these are auto-named with a hash suffix like `AZUREAPPSERVICE_CLIENTID_19A7A8F3...` — either naming works as long as the workflow's `${{ secrets.X }}` matches what was created.)

**Azure-side setup user must do (documented in cicd-setup.md):**
1. Create an Azure AD App Registration.
2. Add a federated credential to that App Registration with these settings:
   - Issuer: `https://token.actions.githubusercontent.com`
   - Subject: `repo:<owner>/<repo>:ref:refs/heads/main`
   - Audience: `api://AzureADTokenExchange`
3. Grant the App Registration the `Contributor` role on the Function App's resource group (or just the Function App itself, scoped tighter).
4. Add the three GitHub secrets to the repo.

This is the pattern used by `azure-da-mcp/main_jack-mcp-azure-ai-function.yml` and is the mode the worker writes by default.

### Publish profile — simpler but rotation hassle

Azure portal generates a long XML document with embedded credentials. Stored as one GitHub secret `AZURE_FUNCTIONAPP_PUBLISH_PROFILE`.

**Tradeoff:** No Azure AD setup needed. But the publish profile rotates when the Function App's deployment credentials are reset, and the secret is a single high-trust string. Document this as an alternative path; do NOT make it the default.

### Service principal with secret — legacy, not recommended

`az ad sp create-for-rbac --sdk-auth` produces a JSON blob stored as `AZURE_CREDENTIALS`. This is the old pattern. Note as deprecated in cicd-setup.md; do NOT generate the workflow this way.

## Workflow templates

Write TWO workflow files. The CI workflow runs on PRs and pushes to main and does NOT use Azure secrets. The deploy workflow runs on push to main with a `paths:` filter and DOES use the OIDC secrets.

Both files live at `<repo-root>/.github/workflows/`.

### `.github/workflows/ci.yml`

```yaml
name: CI — Build & Test

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]
    paths:
      - '<FUNCTIONS_DIR>/**'
      - '.github/workflows/ci.yml'

env:
  FUNCTIONS_DIR: '<FUNCTIONS_DIR>'   # e.g. code/Functions/azure-star-generator-node-v1
  NODE_VERSION: '<NODE_VERSION>'      # from package.json engines.node, default 20.x

jobs:
  build:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node ${{ env.NODE_VERSION }}
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: npm
          cache-dependency-path: ${{ env.FUNCTIONS_DIR }}/package-lock.json

      - name: Install dependencies
        working-directory: ${{ env.FUNCTIONS_DIR }}
        run: npm ci

      - name: Build (if present)
        working-directory: ${{ env.FUNCTIONS_DIR }}
        run: npm run build --if-present

      - name: Lint (if present)
        working-directory: ${{ env.FUNCTIONS_DIR }}
        run: npm run lint --if-present

      - name: Test (if present)
        working-directory: ${{ env.FUNCTIONS_DIR }}
        run: npm test --if-present
```

**Notes on ci.yml:**
- `--if-present` makes lint/test/build optional — if the script doesn't exist, npm exits 0 silently.
- `cache-dependency-path` is critical when Functions dir is nested — points to the actual lockfile.
- No Azure secrets touched. Safe to run on PRs from forks.

### `.github/workflows/deploy.yml`

```yaml
name: Deploy to Azure Function App

on:
  push:
    branches: [main]
    paths:
      - '<FUNCTIONS_DIR>/**'
      - '.github/workflows/deploy.yml'
  workflow_dispatch:

env:
  AZURE_FUNCTIONAPP_NAME: '<APP_NAME_HERE>'    # the Azure Function App resource name
  AZURE_FUNCTIONAPP_PACKAGE_PATH: '<FUNCTIONS_DIR>'
  NODE_VERSION: '<NODE_VERSION>'

jobs:
  build:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node ${{ env.NODE_VERSION }}
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: npm
          cache-dependency-path: ${{ env.AZURE_FUNCTIONAPP_PACKAGE_PATH }}/package-lock.json

      - name: Install dependencies & build
        working-directory: ${{ env.AZURE_FUNCTIONAPP_PACKAGE_PATH }}
        run: |
          npm ci
          npm run build --if-present

      - name: Zip release artifact
        run: |
          cd ${{ env.AZURE_FUNCTIONAPP_PACKAGE_PATH }}
          zip -r ../../release.zip . -x "*.git*"

      - name: Upload artifact
        uses: actions/upload-artifact@v4
        with:
          name: function-app
          path: release.zip
          retention-days: 1

  deploy:
    runs-on: ubuntu-latest
    needs: build
    permissions:
      id-token: write
      contents: read
    environment:
      name: production
    steps:
      - name: Download artifact
        uses: actions/download-artifact@v4
        with:
          name: function-app

      - name: Unzip artifact
        run: |
          mkdir release
          unzip -q release.zip -d release
          rm release.zip

      - name: Login to Azure (OIDC)
        uses: azure/login@v2
        with:
          client-id: ${{ secrets.AZUREAPPSERVICE_CLIENTID }}
          tenant-id: ${{ secrets.AZUREAPPSERVICE_TENANTID }}
          subscription-id: ${{ secrets.AZUREAPPSERVICE_SUBSCRIPTIONID }}

      - name: Deploy to Azure Functions
        uses: Azure/functions-action@v1
        with:
          app-name: ${{ env.AZURE_FUNCTIONAPP_NAME }}
          slot-name: Production
          package: release
```

**Notes on deploy.yml:**
- `permissions: id-token: write` is REQUIRED for OIDC. Without it, `azure/login@v2` fails with a JWT-issuance error.
- `paths:` filter scopes deploys to actual function-code changes — README-only commits don't redeploy.
- Zip from inside the Functions dir, not the repo root. Otherwise the `host.json`/`package.json` end up nested incorrectly inside the zip and `Azure/functions-action@v1` fails to recognize the package.
- `environment: production` enables GitHub's environment protection rules (manual approval, etc.) — optional but cheap to keep.
- The `<APP_NAME_HERE>` placeholder is a deliberate signal. If we found the real app name in pre-flight, substitute it; otherwise the user fills it in before first deploy and we document it in cicd-setup.md.

## README badges

Add these to the top of `README.md`, immediately under the project title:

```markdown
[![CI](https://github.com/<OWNER>/<REPO>/actions/workflows/ci.yml/badge.svg)](https://github.com/<OWNER>/<REPO>/actions/workflows/ci.yml)
[![Deploy](https://github.com/<OWNER>/<REPO>/actions/workflows/deploy.yml/badge.svg)](https://github.com/<OWNER>/<REPO>/actions/workflows/deploy.yml)
```

`<OWNER>/<REPO>` comes from `git remote get-url origin`. Strip `.git`, `https://github.com/`, `git@github.com:` prefixes.

## `docs/cicd-setup.md` — user-facing walkthrough

The worker MUST write this file. It's the bridge between "workflows exist in the repo" and "deploy actually works in Azure." Without it, the deploy workflow will fail with a cryptic auth error and the user won't know what to fix.

Structure:

```markdown
# CICD Setup — Azure Functions Deploy via GitHub Actions

This repo has two GitHub Actions workflows:
- `.github/workflows/ci.yml` — runs on every PR and push to main. Builds and runs tests. Already works out of the box.
- `.github/workflows/deploy.yml` — runs on push to main when Function code changes. Deploys to Azure. **Requires one-time setup before it will succeed.**

This document is the one-time setup checklist for `deploy.yml`.

## Prerequisites
- An Azure subscription where the Function App `<APP_NAME_HERE>` already exists
- Owner-level access to the GitHub repo (to add secrets) and Contributor-level access to the Azure subscription (to create App Registrations)
- The `gh` CLI installed locally (optional but easier than the GitHub web UI)

## Step 1 — Create an Azure AD App Registration
... (CLI commands using `az ad app create`, `az ad sp create`)

## Step 2 — Add a federated credential
... (Azure portal walkthrough OR `az ad app federated-credential create` command)

The federated credential MUST have:
- Issuer: `https://token.actions.githubusercontent.com`
- Subject: `repo:<OWNER>/<REPO>:ref:refs/heads/main`
- Audience: `api://AzureADTokenExchange`

## Step 3 — Grant the App Registration access to the Function App
... (`az role assignment create` with role `Contributor` and scope = the Function App's resource ID)

## Step 4 — Add three GitHub secrets
Use the GitHub UI (Settings → Secrets and variables → Actions) or:
```sh
gh secret set AZUREAPPSERVICE_CLIENTID --body "<client-id>"
gh secret set AZUREAPPSERVICE_TENANTID --body "<tenant-id>"
gh secret set AZUREAPPSERVICE_SUBSCRIPTIONID --body "<subscription-id>"
```

## Step 5 — Trigger the first deploy
- Either push a change under `<FUNCTIONS_DIR>/`
- Or manually: `gh workflow run deploy.yml`

## Step 6 — Verify
- `gh run watch` to watch the run live
- Azure Portal → Function App → Deployment Center should show the new deploy
- Hit the function endpoint and confirm fresh code is serving

## Troubleshooting

### `Error: AADSTS70021: No matching federated identity record found`
The federated credential's Subject doesn't match the workflow's repo+branch. Verify:
- Subject is exactly `repo:<OWNER>/<REPO>:ref:refs/heads/main` (case-sensitive)
- The workflow ran on the `main` branch

### `Error: Resource not found` from functions-action
The `app-name` in `deploy.yml` doesn't match an actual Function App in the linked subscription, or the App Registration doesn't have access to that resource group.

### `Package size too large`
The zip is bigger than ~100MB. Check `.funcignore` is being honored; consider excluding `node_modules` if your build pulls them at deploy time (it doesn't here — `npm ci` runs in build job and `node_modules` ends up in the zip intentionally).

### Auth errors persist
Try `az login` locally with the same App Registration's credentials and run `az functionapp deployment list-publishing-profiles --name <APP_NAME>` to confirm role assignment is correct.

## Alternative auth modes (not recommended)
- **Publish profile** — single secret `AZURE_FUNCTIONAPP_PUBLISH_PROFILE`. Replace the OIDC `azure/login@v2` step with `Azure/functions-action@v1`'s `publish-profile` input. Rotates when deployment credentials reset.
- **Service principal with secret** — legacy. Don't.
```

## Common pitfalls — do NOT trip on these

1. **Zipping from the wrong directory.** Always `cd <functions-dir>` before `zip`. Zipping from repo root produces a nested archive that `Azure/functions-action@v1` can't unpack correctly.
2. **Missing `permissions: id-token: write`** on the deploy job. Without it, OIDC fails with a confusing JWT error.
3. **`paths:` filter omitted on deploy.yml.** Means every README-only commit triggers a deploy. Slow, costly, noisy.
4. **`actions/setup-node@v4` without `cache-dependency-path`** when Functions dir is nested. The cache misses on every run.
5. **Adding `--no-verify` or `--force` anywhere in the workflow.** Don't. If a hook fails, fix the underlying issue.
6. **Using `*` or `${{ ... }}` interpolation inside `paths:`.** `paths:` is a glob, not a template — interpolation silently doesn't work.
7. **Forgetting `--if-present` on optional npm scripts.** `npm test` exits non-zero with default error message if no `test` script exists, which fails the CI job.
8. **Using `actions/upload-artifact@v3`** — deprecated, breaks the Azure Functions deploy flow. Always v4.
9. **Setting `engines` in the workflow without bumping `package.json`.** The two must agree, or `npm ci` will fail with a version mismatch.

## Verification protocol — the worker does this before declaring done

1. **YAML lint.** Run `actionlint .github/workflows/*.yml` if available, otherwise `yamllint`, otherwise visual inspect against the template above. Both files MUST parse cleanly.
2. **Frontmatter check.** Both YAML files must start with `name:` (not `Name:` — case matters) and have `on:` and `jobs:` blocks.
3. **Path-filter sanity.** Confirm `paths:` matches the actual Functions dir path (run `ls <FUNCTIONS_DIR>/host.json` to verify the path string).
4. **Placeholder grep.** Run `grep -n '<.*HERE.*>\|<OWNER>\|<REPO>\|<FUNCTIONS_DIR>\|<NODE_VERSION>' .github/workflows/*.yml docs/cicd-setup.md README.md`. Any results are unfilled placeholders. The worker MUST either fill them in or move them to clearly-flagged TBD lines in cicd-setup.md.
5. **Commit hygiene.** Use Conventional Commits. Recommended split:
   - `ci(github-actions): add CI workflow for Azure Functions build`
   - `ci(github-actions): add deploy workflow with OIDC auth`
   - `docs(cicd): add Azure Functions setup walkthrough`
   - `docs(readme): add CI and Deploy badges`
   Or fewer, larger commits — the worker's call.
6. **Final `git status -s` MUST be empty.**
7. **The worker does NOT push.** No `git push` ever. The user pushes after manual review.

## Out of scope — do NOT do these

- Provision Azure resources (`az functionapp create`, `az group create`, etc.)
- Configure Azure AD App Registrations or federated credentials (user-only)
- Add GitHub secrets (`gh secret set ...`)
- Push to remote (`git push`)
- Modify any code under `<FUNCTIONS_DIR>/src/**`
- Add new runtime dependencies in `<FUNCTIONS_DIR>/package.json`
- Bump `engines.node` in `<FUNCTIONS_DIR>/package.json`
- Run `az login` or `gh auth login`
- Create a `local.settings.json` with real secrets (only `local.settings.json.example` is OK if needed)

## Reference workflows

The worker should read these once for shape comparison, then write fresh based on this skill's templates:

- `/Users/jackjin/dev/azure-da-mcp/.github/workflows/main_jack-mcp-azure-ai-function.yml` — canonical Azure Functions Node.js OIDC deploy
- `/Users/jackjin/dev/shadow-pivot-nextjs/.github/workflows/main_shadow-pivot-nextjsv2.yml` — Docker → Azure Web App restart (different but useful OIDC reference)
- `/Users/jackjin/dev/azure-da-mcp/.github/workflows/deploy-content-authoring-eval.yml` — `paths:` filter + `workflow_dispatch` reference

## End — verification checklist

Before declaring this skill applied successfully, every box below must be true:

- [ ] `<repo-root>/.github/workflows/ci.yml` exists and parses as valid YAML
- [ ] `<repo-root>/.github/workflows/deploy.yml` exists and parses as valid YAML
- [ ] `<repo-root>/docs/cicd-setup.md` exists with all six sections + troubleshooting
- [ ] `<repo-root>/README.md` has CI + Deploy badges at the top, with real `<owner>/<repo>` filled in
- [ ] No `<.*HERE.*>` or `<OWNER>` placeholders remain in YAML files (only in docs as documented TBD)
- [ ] No new dependencies added to `<FUNCTIONS_DIR>/package.json`
- [ ] No code under `<FUNCTIONS_DIR>/src/**` modified
- [ ] All work committed, working tree clean
- [ ] No `git push` performed
- [ ] No `az` or `gh secret` commands run
```

### 3.2 Why these particular sections in this skill

- **Pre-flight checklist** — the worker has historically been weak at "look before you leap." Forcing explicit reads of `host.json`, `package.json`, `git remote` before writing prevents the worker from inventing a Node version or repo URL.
- **Auth mode decision tree** — there are 3 real ways to auth Azure deploys, and the wrong one (service principal w/secret) is the easiest to find in old tutorials. The skill explicitly steers OIDC.
- **Two-workflow split (ci.yml + deploy.yml)** — separates "always-runs, no secrets" from "main-only, secrets-required." Both reference projects use this split.
- **`docs/cicd-setup.md` is required** — without it, the deploy workflow fails opaquely. The skill makes the doc a deliverable, not a bonus.
- **Common pitfalls** — each item is taken from real failures observed in the two reference repos. The zip-from-wrong-dir and `id-token: write` issues are particularly common.
- **Verification protocol with placeholder grep** — the worker has historically left `<APP_NAME_HERE>` in workflows and called it done. The grep step makes that impossible.

---

## 4. Deliverable 2 — Executive auto-load wiring

**File path:** `/Users/jackjin/dev/continuous-agent/src/agentic/intelligence/prompt-builder.ts`

**Action:** Apply six small edits, all mirroring how `web-testing` is wired. After all edits: `npm run typecheck` then `npm run build`.

### 4.1 Reference points

The existing `web-testing` skill is wired at:
- Line ~54 — `WEB_KEYWORDS` regex constant
- Line ~249 — `isWebProject = WEB_KEYWORDS.test(itemText)`
- Lines ~257-259 — skill selection: `webTestingSkill = ... skillResult.skills.find(s => s.name === 'web-testing')`
- Line ~271 — log line: `[V2 Prompt] Loaded web-testing skill (web project detected)`
- Lines ~410-413 — Claude path body injection: `if (webTestingSkill) { sections.push(renderSkillBody(...).trim()); }`
- Lines ~428-431 — required-skills tracking: `const webTestingDir = ... ; if (webTestingDir) requiredSkillNames.push(webTestingDir);`

Mirror exactly this pattern for `azure-function-deploy`.

### 4.2 The six edits — verbatim, with surrounding context

#### Edit 1 — Add regex constant

**Locate** (around line 54):
```typescript
export const WEB_KEYWORDS = /next\.?js|react|vue|angular|\bhtml\b|\bcss\b|website|web.?app|frontend|\bui\b|component|page|form|dashboard/i;
```

**After this line, add:**
```typescript

// Auto-load `azure-function-deploy` skill when the goal mentions Azure Functions
// or GitHub Actions for an Azure Functions project. Mirrors the WEB_KEYWORDS
// pattern. See ai-docs/v2/2026-05-09-v2.4-azure-modification/plan.md.
export const AZURE_FUNCTIONS_KEYWORDS = /azure[\s-]?function|\bfunc\s+(start|deploy|run|init)\b|functions-action|az\s+functionapp|\.funcignore|host\.json/i;
```

#### Edit 2 — Detect Azure Functions project

**Locate** (around line 249):
```typescript
const isWebProject = WEB_KEYWORDS.test(itemText);
```

**After this line, add:**
```typescript
const isAzureFunctionsProject = AZURE_FUNCTIONS_KEYWORDS.test(itemText);
```

#### Edit 3 — Find the skill in the loaded library

**Locate** (around lines 260-262, immediately after the `backendTestingSkill` assignment):
```typescript
  const backendTestingSkill = isBackendOnlyItem || isBackendOnlyStep
    ? skillResult.skills.find(s => s.name === 'backend-testing')
    : null;
```

**After this block, add:**
```typescript
  const azureFunctionDeploySkill = isAzureFunctionsProject
    ? skillResult.skills.find(s => s.name === 'azure-function-deploy')
    : null;
```

#### Edit 4 — Log the load

**Locate** (around line 271):
```typescript
  if (webTestingSkill) logAgentic(`[V2 Prompt] Loaded web-testing skill (web project detected)`);
```

**After this line, add:**
```typescript
  if (azureFunctionDeploySkill) logAgentic(`[V2 Prompt] Loaded azure-function-deploy skill (Azure Functions project detected)`);
```

#### Edit 5 — Inject body into Claude prompt

**Locate** (around lines 414-417, inside the `if (isClaude)` block):
```typescript
    if (backendTestingSkill) {
      const renderedBackend = renderSkillBody(backendTestingSkill.body, skillVars);
      sections.push(renderedBackend.trim());
    }
```

**After this block, add:**
```typescript
    if (azureFunctionDeploySkill) {
      const renderedAzure = renderSkillBody(azureFunctionDeploySkill.body, skillVars);
      sections.push(renderedAzure.trim());
    }
```

#### Edit 6 — Track in required skills

**Locate** (around lines 428-431):
```typescript
  const webTestingDir = webTestingSkill ? skillDirectoryName(webTestingSkill) : null;
  const backendTestingDir = backendTestingSkill ? skillDirectoryName(backendTestingSkill) : null;
  if (webTestingDir) requiredSkillNames.push(webTestingDir);
  if (backendTestingDir) requiredSkillNames.push(backendTestingDir);
```

**After this block, add:**
```typescript
  const azureFunctionDeployDir = azureFunctionDeploySkill ? skillDirectoryName(azureFunctionDeploySkill) : null;
  if (azureFunctionDeployDir) requiredSkillNames.push(azureFunctionDeployDir);
```

### 4.3 What the edits enable

After edits and `npm run build`:
- Any goal whose title or description mentions `azure function`, `func start`, `functions-action`, `az functionapp`, `.funcignore`, or `host.json` will trigger auto-load.
- The skill body gets rendered into the worker's prompt for Claude vendor (full-body injection).
- Kimi/Codex workers don't get full-body injection but DO get the skill on disk via `setupExistingProjectSkills` (commit `fb73ec2`) — they can `ReadFile` it.
- `WORKER_SKILL_LOADED` ledger event auto-emits with `skill_name: azure-function-deploy` (existing telemetry at lines ~467-476 iterates `requiredSkillNames`).
- The verifier sees `required_skills: ['azure-function-deploy']` in the contract manifest.

### 4.4 No code changes needed elsewhere

- `skill-loader.ts` auto-discovers `SKILL.md` files in `claude-files-to-output/skills/` — no registration.
- `worker-spawner.ts:setupExistingProjectSkills` already syncs the entire `claude-files-to-output/skills/` tree.
- `capabilities/*.yml` files are about agent capabilities, not skill registration. Untouched.
- Track records are runtime-injected; the SKILL.md frontmatter intentionally omits the block.

---

## 5. Deliverable 3 — Goal bundle

**Bundle directory path:** `/Users/jackjin/dev/continuous-agent/workspace/drafts/2026-05-09-azure-star-generator-cicd-pass-1/`

**Action:** Create the dir, write the PROMPT.md verbatim. Promote to `ondeck/` via `mv` only after the executive's `npm run build` is clean and PM2 is ready to start.

```bash
mkdir -p /Users/jackjin/dev/continuous-agent/workspace/drafts/2026-05-09-azure-star-generator-cicd-pass-1
```

### 5.1 Full PROMPT.md content

```markdown
---
title: "Azure STAR Generator — GitHub Actions CICD Pass #1"
slug: "2026-05-09-azure-star-generator-cicd-pass-1"
priority: P2
status: pending
complexity: low
created: "2026-05-09"
tags: [azure-functions, cicd, github-actions, existing-project, no-database]
execution_pattern: plan-then-execute
max_turns: 250
worker_vendor: claude
build_target: existing
target_dir: /Users/jackjin/dev/azure-star-generator
target_branch:
output_path:
branch:
source_project:
data_requirements: "none — CICD configuration only, no persistence layer"
definition_of_done_journey: "On main of azure-star-generator: run `gh workflow list` → see ci.yml and deploy.yml registered. Run `gh workflow run ci.yml` → workflow run succeeds (build job exits 0). Run `gh workflow run deploy.yml` → workflow run starts; build job succeeds; deploy job fails with a clear auth/secrets error message (NOT a YAML parse error, NOT a missing-Node error, NOT a missing-package error) — this proves the workflow shape is correct and the only thing missing is Azure-side OIDC wiring. README has CI + Deploy badges at the top. `docs/cicd-setup.md` exists with the step-by-step Azure AD federated credential walkthrough."
---

# READ THIS FIRST — Hard Constraints

You are wiring CICD for an existing personal Azure Functions project at `/Users/jackjin/dev/azure-star-generator`. Commit directly to `main` (no feature branch, no PR). The user will push manually after review.

The previous run on this same target (`2026-04-26-azure-star-generator-refresh-1`, see `workspace/completed/`) shipped UI deliverables but skipped the testing protocol. That's a separate concern and stays as-is. THIS goal is purely about adding GitHub Actions CICD on top.

## What this goal will NOT do

- Provision Azure resources (no `az functionapp create`, no `az group create`)
- Configure Azure AD App Registration or federated credentials (user-only)
- Add GitHub secrets to the repo (user-only)
- Modify any Azure Functions code under `code/Functions/azure-star-generator-node-v1/src/**`
- Bump Node version in package.json
- Add new runtime dependencies in `code/Functions/azure-star-generator-node-v1/package.json`
- Add tests, Playwright, or any test runner — that's deferred to a later goal

## Hard prohibitions — violating any of these means your step will be rejected

1. **DO NOT** create or modify any feature branch. Commit on `main` only.
2. **DO NOT** push (`git push`) — the user pushes after review.
3. **DO NOT** run `az login`, `az functionapp ...`, or any `az` command. The deploy workflow handles Azure auth via `azure/login@v2`; you don't need it locally.
4. **DO NOT** run `gh auth login` (assume already authed). You MAY run read-only `gh` queries like `gh repo view`, `gh workflow list`, `gh run list` only AFTER workflows are committed (and even then, only if the user has pushed; otherwise these will return empty/error and that's fine).
5. **DO NOT** install `@azure/identity`, `@azure/storage-blob`, `@azure/data-tables`, `@playwright/test`, or any new package in `code/Functions/azure-star-generator-node-v1/package.json`. CICD doesn't need them.
6. **DO NOT** clobber any existing `.github/workflows/` files. Verify none exist before writing (`ls .github/workflows/ 2>/dev/null`).
7. **DO NOT** add GitHub secrets via `gh secret set` or any command. Document them in `docs/cicd-setup.md` instead.
8. **DO NOT** trigger `gh workflow run deploy.yml` at all. The workflow is documented for the user; the user runs it after configuring Azure side.
9. **DO NOT** create or modify `.env`, `.env.example`, or any `local.settings.json` — secrets stay out of the repo.
10. **DO NOT** modify `LICENSE`, `host.json`, or any file under `code/Functions/azure-star-generator-node-v1/src/`.
11. **DO NOT** run `npm install` in any directory. The CI workflow runs `npm ci`; you don't need to install anything locally.

If you find yourself wanting to do any of the above, **stop and write to `workspace/needs-you.md` (in the continuous-agent repo) instead.**

# What to Build

Three deliverables, all small, all in the target repo `/Users/jackjin/dev/azure-star-generator/`:

## Deliverable 1 — `.github/workflows/ci.yml`

PR + push CI workflow. No deploy steps. No secrets used. Targets the nested Functions dir at `code/Functions/azure-star-generator-node-v1/`.

Use the template in the `azure-function-deploy` skill (auto-loaded for this goal). Substitute:
- `<FUNCTIONS_DIR>` → `code/Functions/azure-star-generator-node-v1`
- `<NODE_VERSION>` → read from the project's `package.json` `engines.node`. If absent, default to `20.x`.

Triggers: `pull_request` against main, AND `push` to main with `paths:` filter scoped to the Functions dir + this workflow file.

Steps: checkout → setup-node@v4 → npm ci → npm run build --if-present → npm run lint --if-present → npm test --if-present.

## Deliverable 2 — `.github/workflows/deploy.yml`

Push-to-main deploy workflow. Two-job split (build → deploy). OIDC auth.

Use the template in the `azure-function-deploy` skill. Substitute:
- `<FUNCTIONS_DIR>` → `code/Functions/azure-star-generator-node-v1`
- `<NODE_VERSION>` → same as ci.yml
- `<APP_NAME_HERE>` → try to discover from README, host.json, or any local.settings*.json. The README mentions Azure Functions but may not name the resource. If you cannot find the actual Function App name, leave `<APP_NAME_HERE>` as-is in the YAML AND add a TODO note in `docs/cicd-setup.md` Step 1 calling out: "Replace `<APP_NAME_HERE>` in `.github/workflows/deploy.yml` with the actual Azure Function App name (e.g., `azure-star-generator-prod`)."

Triggers: `push` to main with `paths:` filter, plus `workflow_dispatch` for manual triggering.

OIDC secrets: `AZUREAPPSERVICE_CLIENTID`, `AZUREAPPSERVICE_TENANTID`, `AZUREAPPSERVICE_SUBSCRIPTIONID`. Reference them as `${{ secrets.X }}`. Do NOT prefix with the auto-generated hash suffix that Azure portal sometimes uses; the user can rename if needed.

Use `permissions: id-token: write` on the deploy job (REQUIRED for OIDC).

## Deliverable 3 — `docs/cicd-setup.md`

User-facing setup walkthrough. Six sections per the skill's template:
1. Create Azure AD App Registration
2. Add federated credential (subject `repo:<OWNER>/<REPO>:ref:refs/heads/main`)
3. Grant Contributor role on the Function App's resource group
4. Add three GitHub secrets
5. Trigger first deploy
6. Verify in Azure portal

Plus a troubleshooting section covering: AADSTS70021 (federated credential mismatch), Resource not found (wrong app name or missing role), package size, and persistent auth errors.

`<OWNER>/<REPO>` is read from `git remote get-url origin` and substituted in the federated credential subject example.

## Deliverable 4 — README.md badges

Add CI + Deploy badges at the top of `README.md`, immediately under the project title. Read `git remote get-url origin` to get `<OWNER>/<REPO>`; if origin is missing or local-only, leave `<OWNER>/<REPO>` placeholder and document it in cicd-setup.md.

# Pre-flight (the worker MUST do these before writing any YAML)

1. `git -C /Users/jackjin/dev/azure-star-generator status -s` — confirm clean tree.
2. `git -C /Users/jackjin/dev/azure-star-generator log -1 --oneline` — confirm HEAD is `98bf9ea` (or later).
3. `ls /Users/jackjin/dev/azure-star-generator/.github/workflows 2>/dev/null` — confirm empty/missing.
4. `cat /Users/jackjin/dev/azure-star-generator/code/Functions/azure-star-generator-node-v1/package.json` — note `engines.node` and existing scripts.
5. `cat /Users/jackjin/dev/azure-star-generator/code/Functions/azure-star-generator-node-v1/host.json` — confirm Functions v4 model.
6. `git -C /Users/jackjin/dev/azure-star-generator remote get-url origin` — capture for badge URLs and federated credential example.
7. `grep -ri 'azurewebsites\.net\|functionapp publish' /Users/jackjin/dev/azure-star-generator/README.md /Users/jackjin/dev/azure-star-generator/code/Functions/azure-star-generator-node-v1/local.settings*.json 2>/dev/null` — search for actual Function App name.

# Local Verification Protocol

After writing all files and committing, the worker runs:

1. `git -C /Users/jackjin/dev/azure-star-generator status -s` — must be empty.
2. `git -C /Users/jackjin/dev/azure-star-generator log --oneline -5` — confirm Conventional Commits format on new commits.
3. `grep -rn '<.*HERE.*>\|<OWNER>\|<REPO>\|<FUNCTIONS_DIR>\|<NODE_VERSION>' /Users/jackjin/dev/azure-star-generator/.github /Users/jackjin/dev/azure-star-generator/docs /Users/jackjin/dev/azure-star-generator/README.md` — should ONLY return matches inside `docs/cicd-setup.md` flagged TBD lines (or zero matches if everything was filled in). NO matches in `.github/workflows/*.yml`.
4. (If `actionlint` is installed) `actionlint /Users/jackjin/dev/azure-star-generator/.github/workflows/*.yml` — must pass.
5. (Optional, if user has pushed already) `gh -R <OWNER>/<REPO> workflow list` — should show CI and Deploy workflows registered. If push hasn't happened, skip this and document.

The worker DOES NOT run `gh workflow run`. The user does that after pushing and configuring Azure.

# Definition of Done

The validator will check each. All must pass.

1. **`.github/workflows/ci.yml` exists.** Triggers on `pull_request` and `push` to main. Runs `actions/checkout@v4` + `actions/setup-node@v4` + `npm ci` + `npm run build --if-present` + `npm run lint --if-present` + `npm test --if-present` in `code/Functions/azure-star-generator-node-v1/`. No deploy steps. Valid YAML.
2. **`.github/workflows/deploy.yml` exists.** Triggers on `push` to main with `paths:` filter scoped to `code/Functions/**` and the workflow file. Plus `workflow_dispatch` for manual triggering. Two jobs: build + deploy. Deploy job has `permissions: id-token: write`. Uses `azure/login@v2` with three OIDC secrets + `Azure/functions-action@v1`. App name is filled in OR is `<APP_NAME_HERE>` placeholder with a TODO call-out in cicd-setup.md.
3. **`docs/cicd-setup.md` exists.** Six numbered sections + troubleshooting. Documents Azure AD App Registration + federated credential subject (using actual `<OWNER>/<REPO>` from git remote) + GitHub secrets list + first-deploy walkthrough + Azure portal verification + four troubleshooting entries (AADSTS70021, Resource not found, Package size, persistent auth).
4. **README.md has CI + Deploy badges** at the very top, under the title. Badges link to actual `<OWNER>/<REPO>` from `git remote get-url origin`.
5. **No `code/Functions/azure-star-generator-node-v1/src/**` files modified.** Verify with `git diff HEAD~3..HEAD --name-only | grep src/`.
6. **`code/Functions/azure-star-generator-node-v1/package.json` `dependencies` block is byte-identical** to its pre-task state. Only allowed change: zero changes to that file. (devDependencies block also untouched — no Playwright in this goal.)
7. **No `.env`, `.env.example`, `local.settings.json`, or `local.settings-template.json` modified or created.**
8. **All work committed using Conventional Commits.** Direct to `main`. No feature branch. No `git push` performed.
9. **`git status -s` is empty** after the final commit.
10. **No `az` commands run, no `gh secret` commands run, no `gh auth login` run, no `git push` run.** Verify by reading the worker session log.
11. **No `<.*HERE.*>` placeholders remain in `.github/workflows/*.yml`.** (Placeholders only allowed in `docs/cicd-setup.md` clearly flagged as TBD.)
12. **Final summary includes a "Capability gaps observed" section** noting anything that was harder than it should have been (skill template ambiguity, missing prompt section, weird existing-project quirks, etc.) — this is partly diagnostic for the agent itself.

# Out of Scope — explicit list (do not do these in this pass)

- Adding tests, test runners, or `@playwright/test` (deferred — not part of CICD pass #1)
- ESLint / Prettier / `.editorconfig` / `.nvmrc` (deferred to later pass)
- Pre-commit hooks
- Dependabot config
- CodeQL / security scanning workflows
- Branch protection rule documentation (lives in repo settings, not in code)
- Anything Azure cloud-side
- The previous goal's loose ends (Steps A-F testing protocol stays unfinished — separate goal)

# Reporting

Final summary MUST include a "Capability gaps observed" section. Be specific. Examples of what to surface:
- "The skill's deploy.yml template assumes one Function App per repo — multi-app repos would need adaptation."
- "No automated way to verify YAML lint without `actionlint` installed; visual review only."
- "Skill doesn't cover the publish-profile auth path with worked examples — only OIDC has full template."
- "Worker had no way to discover the Function App name in this repo — README and host.json don't carry it."

# References

- `azure-function-deploy` skill — auto-loaded for this goal. Read it first; it has the full workflow templates.
- `/Users/jackjin/dev/azure-da-mcp/.github/workflows/main_jack-mcp-azure-ai-function.yml` — canonical template
- The previous goal: `workspace/completed/2026-04-26-azure-star-generator-refresh-1/PROMPT.md` — read for context on what's already shipped and the constraints style
```

### 5.2 Notes on the goal frontmatter

- `complexity: low` — Patches A+B respect this. `needsBreakdown()` returns false → no STEPS.json → single worker session.
- `definition_of_done_journey` is intentionally CLI-shaped (`gh workflow list`, `gh workflow run`). The journey-satisfiability gate (`journeyDescribesBrowserInteraction`) does NOT match this — confirmed by Phase 1 exploration. The journey gate will not block.
- `data_requirements: "none ..."` — kills any future Phase 3b prereq injection if breakdown ever fired (defensive).
- `tags: [..., no-database]` — same defensive layer as last time.
- `target_branch:` left blank — worker commits on the current branch of the target (which is `main`).
- `output_path:` left blank — set by the worker on first execution to `target_dir`.
- `worker_vendor: claude` — default. The skill's full body is injected for Claude path.
- `max_turns: 250` — slightly more than the UI goal (which used 200) because we're writing 4 deliverables instead of 3 + reading more docs.

---

## 6. Execution sequence — exact commands

Run these in order from `/Users/jackjin/dev/continuous-agent/`. Don't skip the typecheck or build steps.

```bash
# Phase 1 — Write skill
mkdir -p claude-files-to-output/skills/azure-function-deploy
# Write SKILL.md per Section 3.1 above (use Write tool, exact content)

# Phase 2 — Wire executive (apply six edits to prompt-builder.ts per Section 4.2)
# Use Edit tool for each. After all six edits applied:
npm run typecheck
# If typecheck clean:
npm run build

# Phase 3 — Goal bundle
mkdir -p workspace/drafts/2026-05-09-azure-star-generator-cicd-pass-1
# Write PROMPT.md per Section 5.1 above (use Write tool, exact content)

# Phase 4 — Sanity check
git status -s
# Expected output:
#   ?? claude-files-to-output/skills/azure-function-deploy/
#   M src/agentic/intelligence/prompt-builder.ts
#   ?? workspace/drafts/2026-05-09-azure-star-generator-cicd-pass-1/
#   (dist/ also has changes from build but is gitignored)

git diff src/agentic/intelligence/prompt-builder.ts | head -80
# Expected: six small additions, no deletions

# Phase 5 — Promote bundle and start PM2
mv workspace/drafts/2026-05-09-azure-star-generator-cicd-pass-1 workspace/ondeck/
ls workspace/ondeck/
# Expected: 2026-05-09-azure-star-generator-cicd-pass-1

pm2 start ecosystem.config.cjs
pm2 list
# Expected: executive-loop online

# Phase 6 — Arm monitors (see Section 7)

# Phase 7 — Watch the run, intervene if needed (see Section 8)
```

---

## 7. Monitor scripts — copy-paste ready

Two persistent monitors. The first watches the executive log for orchestrator-level events (skips raw worker JSON dumps to avoid notification flood). The second watches the target repo for git activity and forbidden patterns.

### 7.1 Executive orchestrator monitor

```bash
# Use the Monitor tool with persistent: true, timeout_ms: 3600000
tail -F /Users/jackjin/dev/continuous-agent/ledgers/executive-2026-05-09.log 2>/dev/null | \
  grep -E --line-buffered "Selected GOAL|Selected STEP|Spawning worker|Worker completed|Worker failed|Worker exited|Worker timeout|PHASE 5: Validate|PHASE 5b|PHASE 6: Update|PHASE 7|PHASE 8|Pass ratio|Advisory failures|Verifier results|Breakdown\] Skipping|Breakdown\] Inserted|integration.gate|completed successfully|GOAL_COMPLETED|GOAL_FAILED|FAILED|Error:|ERROR|429|401|403|token expired|orphan|stuck|crash|needs-you\.md updated|Wrote STEPS\\.json|\\[Worker\\] BUILD_TARGET|V2 Prompt\\] Loaded azure-function-deploy|Journey gate"
```

This filter explicitly catches:
- `[V2 Prompt] Loaded azure-function-deploy skill (Azure Functions project detected)` — proves Edit 1+2+3+4 from Section 4.2 fired
- `[Worker] BUILD_TARGET: synced .claude/ ...` — proves the existing-mode skill sync fired
- Phase 5b events for whole-goal mode (Patch B from commit `c08b9b7`)
- Journey gate fires (Patch A) — should NOT fire on this goal since journey is CLI-shaped
- Worker lifecycle, errors, breakdown decisions, retries

### 7.2 Target repo activity + violation monitor

```bash
# Use the Monitor tool with persistent: true, timeout_ms: 3600000
cd /Users/jackjin/dev/azure-star-generator || exit 1
prev_head=""
prev_changed=""
prev_violations=""
while true; do
  head=$(git log -1 --format='%h %s' 2>/dev/null || echo "")
  changed=$(git status --porcelain 2>/dev/null | awk '{print $NF}' | sort | tr '\n' ',')

  if [ -n "$head" ] && [ "$head" != "$prev_head" ] && [ -n "$prev_head" ]; then
    echo "[GIT] new HEAD: $head"
  fi
  if [ "$changed" != "$prev_changed" ]; then
    echo "[GIT] working tree: $changed"
  fi

  violations=""
  # forbidden directories
  if [ -d src/db ] || [ -d src/storage ] || [ -d src/dao/storage ]; then
    violations="$violations forbidden_db_or_storage_dir"
  fi
  # forbidden new dependencies
  if grep -lE '"@azure/data-tables"|"@azure/cosmos"|"@azure/storage-blob"|"@azure/identity"|"@playwright/test"|"mongodb"|"pg"|"mysql"|"sqlite"|"supabase"' code/Functions/azure-star-generator-node-v1/package.json 2>/dev/null > /dev/null; then
    violations="$violations forbidden_dep_in_package_json"
  fi
  # local.settings.json with real secrets
  if [ -f code/Functions/azure-star-generator-node-v1/local.settings.json ]; then
    violations="$violations local_settings_json_committed"
  fi
  # any branch other than main
  cur_branch=$(git symbolic-ref --short HEAD 2>/dev/null)
  if [ "$cur_branch" != "main" ] && [ -n "$cur_branch" ]; then
    violations="$violations branch_not_main:$cur_branch"
  fi

  if [ -n "$violations" ] && [ "$violations" != "$prev_violations" ]; then
    echo "[VIOLATION]$violations"
  fi

  prev_head="$head"
  prev_changed="$changed"
  prev_violations="$violations"
  sleep 30
done
```

This monitor emits:
- `[GIT] new HEAD: <hash> <subject>` on any new commit
- `[GIT] working tree: <comma-separated paths>` on any working-tree change
- `[VIOLATION]` if any forbidden pattern appears

### 7.3 What to do on each event

| Event | Action |
|---|---|
| `[V2 Prompt] Loaded azure-function-deploy skill ...` | Skill load confirmed. Acknowledge silently. |
| `[Worker] BUILD_TARGET: synced .claude/` | Skill sync confirmed. Acknowledge silently. |
| `[GIT] working tree: ...,.github/workflows/ci.yml,...` | Worker is writing CI workflow. Expected and good. |
| `[GIT] new HEAD: <hash> ci(github-actions): ...` | Conventional Commits ✓. Acknowledge. |
| `[VIOLATION] forbidden_dep_in_package_json` | Worker added a forbidden dep. **Stop PM2 immediately**, revert. |
| `[VIOLATION] branch_not_main:<x>` | Worker created a feature branch. **Stop PM2 immediately**, investigate. |
| `[VIOLATION] local_settings_json_committed` | Worker committed real secrets. **Stop PM2 immediately**, revert that commit. |
| `Phase 5b FAIL` | Whole-goal validation rejected the work. Read the defect record, decide retry vs investigate. |
| `Worker failed` / `Worker timeout` | Read `pm2 logs executive-loop --lines 100` for context. |
| `GOAL_COMPLETED` for our slug | Run the post-completion verification (Section 8). |

---

## 8. Post-completion verification

After the goal moves to `workspace/completed/`, verify the outcome before declaring victory:

```bash
cd /Users/jackjin/dev/azure-star-generator

# 1. Files exist
ls -la .github/workflows/ci.yml .github/workflows/deploy.yml docs/cicd-setup.md
grep -E '\!\[CI\]\|\!\[Deploy\]' README.md | head -5

# 2. No forbidden modifications
git diff 98bf9ea..HEAD -- 'code/Functions/azure-star-generator-node-v1/src/**'  # should be EMPTY
git diff 98bf9ea..HEAD -- 'code/Functions/azure-star-generator-node-v1/package.json' | head  # should be empty

# 3. No placeholder leakage in YAMLs
grep -n '<.*HERE.*>\|<OWNER>\|<REPO>\|<FUNCTIONS_DIR>\|<NODE_VERSION>' .github/workflows/*.yml
# expected: empty (or only inside YAML comments documenting the placeholder)

# 4. YAML lint (if installed)
which actionlint && actionlint .github/workflows/*.yml
which yamllint && yamllint .github/workflows/*.yml

# 5. Conventional Commits format on new commits
git log 98bf9ea..HEAD --oneline
# expected: each starts with type(scope): subject (e.g. ci(github-actions): ...)

# 6. Working tree clean
git status -s
# expected: empty

# 7. No unauthorized push
git log origin/main..HEAD --oneline 2>/dev/null
# expected: shows local commits (proving worker did NOT push)

# 8. Bundle moved to completed/
ls /Users/jackjin/dev/continuous-agent/workspace/completed/2026-05-09-azure-star-generator-cicd-pass-1/PROMPT.md
```

If all 8 checks pass, the run is genuinely successful. The user can then push manually and start configuring Azure side per `docs/cicd-setup.md`.

---

## 9. Critical files reference table

| File | Action in this work | Notes |
|---|---|---|
| `/Users/jackjin/dev/continuous-agent/claude-files-to-output/skills/azure-function-deploy/SKILL.md` | **Create** | New worker skill, ~280 lines |
| `/Users/jackjin/dev/continuous-agent/src/agentic/intelligence/prompt-builder.ts` | **Modify** | Six small edits per Section 4.2 |
| `/Users/jackjin/dev/continuous-agent/dist/**` | **Rebuild** | `npm run build` |
| `/Users/jackjin/dev/continuous-agent/workspace/drafts/2026-05-09-azure-star-generator-cicd-pass-1/PROMPT.md` | **Create** | New goal bundle |
| `/Users/jackjin/dev/azure-star-generator/.github/workflows/ci.yml` | (Worker creates) | Worker outputs |
| `/Users/jackjin/dev/azure-star-generator/.github/workflows/deploy.yml` | (Worker creates) | Worker outputs |
| `/Users/jackjin/dev/azure-star-generator/docs/cicd-setup.md` | (Worker creates) | Worker outputs |
| `/Users/jackjin/dev/azure-star-generator/README.md` | (Worker modifies) | Adds badges only |

---

## 10. Existing utilities to reuse — DO NOT reinvent

| Utility | Path | Why |
|---|---|---|
| `loadSkillLibrary` | `src/deterministic/skill-loader.ts` | Auto-discovers new SKILL.md — no manual registration needed |
| `renderSkillBody` | `src/agentic/intelligence/prompt-builder.ts` | Renders skill body with `{{PROJECT_PATH}}` substitution |
| `skillDirectoryName` | `src/agentic/intelligence/prompt-builder.ts` | Derives the dirname for `requiredSkillNames` tracking |
| `emitWorkLedgerEvent` | `src/agentic/intelligence/prompt-builder.ts` (called near lines 467-476) | Auto-emits `WORKER_SKILL_LOADED` for every skill in `requiredSkillNames` |
| `setupExistingProjectSkills` | `src/agentic/execution/worker-spawner.ts` (commit `fb73ec2`, ~line 430) | Already syncs `claude-files-to-output/{skills,agents,templates}/` into target_dir's `.claude/` for `existing` mode |
| `checkJourneySatisfiability` | `src/deterministic/journey-satisfiability.ts` (commit `c08b9b7`) | Browser-journey gate. Won't fire on our CLI-shaped journey but exists as defense-in-depth |

No new utilities required. The infrastructure is fully in place; this work is content + wiring.

---

## 11. Roll-back plan

If the run goes sideways:

| Symptom | Diagnosis | Action |
|---|---|---|
| Skill content has bugs after first worker spawn | Worker followed the skill literally and produced bad YAML | Edit `claude-files-to-output/skills/azure-function-deploy/SKILL.md`, `npm run build`, `git revert` worker's commits in azure-star-generator, re-run |
| `npm run typecheck` fails after prompt-builder edits | TS error in one of the six edits | Read the error, fix the offending edit, re-typecheck |
| `npm run build` fails | Same as above OR tsc has a deeper issue | Same as above |
| Worker writes wrong YAML (e.g., wrong action version, missing `permissions`) | Skill template wasn't followed | Worker's commit lands; user does `git revert <hash>` in azure-star-generator after reviewing; we update skill if recurring |
| Worker tries `git push` | Hard prohibition violated | Monitor 7.2 catches if it's to a non-main branch; for direct-to-main pushes the prohibition is in PROMPT.md and `worker-base` skill — worker should self-block. If it doesn't, stop PM2 and investigate worker-base |
| Worker tries `az login` or `gh secret set` | Hard prohibition violated | These would show in the worker session log. Stop PM2, investigate why the prompt didn't deter |
| Phase 5 false-pass | Verifier accepted incomplete work | Patches A+B should catch journey-shaped failures. CLI-journey doesn't trip Patch A. The `git_status_clean` blocking verifier catches uncommitted changes. The `node_install` verifier may FAIL (no node_modules in target — that's fine, advisory) |
| Phase 5b LLM-call cost spike | LLM evidence review for whole-goal mode | Phase 5b for single-goal mode runs the deterministic check first; LLM call only fires on failure (and only if STEPS.json exists, which single-goal won't have). Cost is bounded |

For any unrecoverable issue, the rollback is mechanical:

```bash
# Stop PM2
pm2 stop executive-loop

# Stop monitors
# (use TaskStop on each monitor's task_id)

# In azure-star-generator:
cd /Users/jackjin/dev/azure-star-generator
git log --oneline -10  # find last good HEAD
git reset --hard 98bf9ea  # roll back to pre-run state if needed
# (note: only do `git reset --hard` if all worker commits are clearly bad; otherwise prefer `git revert <hash>` per commit)

# In continuous-agent:
# Move bundle back if you want to retry:
mv workspace/in-progress/P2/2026-05-09-azure-star-generator-cicd-pass-1 workspace/drafts/
# Or move to completed/ to abandon and skip:
# (manual file move)

# Reset PROMPT.md status if moving back to drafts:
# Use Edit tool to set status: pending and clear output_path
```

---

## 12. Open questions — none

The user has signed off on:

- Direct-to-main, no PR, no feature branch
- `complexity: low`, single-shot worker session
- Full CICD scope (CI workflow + deploy workflow + setup docs in one goal)
- Skill is a separate concern, written first (this is Deliverable 1)
- Plan mode → review → /clear → execute (this document is the bridge)

---

## 13. Acceptance criteria — when this work is "done"

1. `claude-files-to-output/skills/azure-function-deploy/SKILL.md` exists, content matches Section 3.1, parses as valid YAML frontmatter + markdown body.
2. `src/agentic/intelligence/prompt-builder.ts` has all six edits applied. `npm run typecheck` exits 0. `npm run build` exits 0. `dist/agentic/intelligence/prompt-builder.js` contains `AZURE_FUNCTIONS_KEYWORDS` and `azure-function-deploy`.
3. `workspace/drafts/2026-05-09-azure-star-generator-cicd-pass-1/PROMPT.md` exists, content matches Section 5.1.
4. Bundle promoted to `workspace/ondeck/`. PM2 started. Two monitors armed.
5. Worker run completes. Goal moves to `workspace/completed/`.
6. Post-completion verification (Section 8) — all 8 checks pass.
7. The user (manually) verifies the workflow YAMLs read sensibly and matches what they expected.

If 1-6 pass but 7 fails (workflow doesn't match expectations), iterate the skill content, rebuild, and consider a follow-up goal.

---

## End of plan.

Companion document: `conversation-log.md` (this same directory) contains the full session arc and the user's verbatim instructions where relevant.

The execution path after `/clear` is: open this file, read top-to-bottom, then run Section 6 commands in order. All artifacts are durable on disk.
