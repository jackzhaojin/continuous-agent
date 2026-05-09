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
