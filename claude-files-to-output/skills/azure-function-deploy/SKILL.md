---
name: azure-function-deploy
description: >
  GitHub Actions CICD for Azure Functions (Node.js). Builds, packages, and deploys
  via Azure/functions-action@v1 with OIDC auth. Reuses a shared continuous-agent
  App Registration so each new project just adds its own federated credential +
  role assignment. Use when the goal involves wiring CI/CD for an Azure Functions
  project, adding a deploy workflow, or setting up GitHub Actions for an existing
  Azure Functions app.
user-invocable: false
metadata:
  category: skill
version: "0.2.0"
tools_required: []
---

# Azure Function Deploy — Worker Skill

You are wiring GitHub Actions CICD for an Azure Functions (Node.js) project. This skill gives you the canonical workflow shape, the **shared-identity** OIDC auth model, the path-filter discipline, and the parameterized setup script you must produce so the user can wire Azure-side trust in one command.

## When this skill applies

This skill auto-loads when the goal title or body matches `azure[\s-]?function | func {start|deploy|run|init} | functions-action | az functionapp | .funcignore | host.json`.

Use it when:
- The goal asks for GitHub Actions CICD, deploy workflows, or CI for an Azure Functions Node.js project
- An Azure Functions project (presence of `host.json` and `.funcignore`) needs build + deploy automation
- The user references `azure-da-mcp` or `azure-star-generator` as CICD templates

DO NOT use this skill for:
- Provisioning Azure resources (creating Function Apps, Storage Accounts, Resource Groups). The worker never runs `az functionapp create`.
- Configuring Azure AD App Registrations or federated credentials. That is user-only — but you produce the script the user runs.
- Writing test code. Use `web-testing` or `backend-testing` for tests.

## The shared App Registration pattern (read this first)

Jack's continuous-agent ecosystem uses **one shared Azure AD App Registration** named **`continuous-agent-github-cicd`** for all GitHub Actions deploys across all his projects. Each new project does NOT create a new App Registration. Instead:

```
continuous-agent-github-cicd  (one App Reg in Jack's tenant)
├── federated credential: github-azure-star-generator-main
│     subject: repo:jackzhaojin/azure-star-generator:ref:refs/heads/main
├── federated credential: github-<next-project>-main
│     subject: repo:jackzhaojin/<next-project>:ref:refs/heads/main
└── role assignments:
      - Contributor on /sites/azure-star-generator-node-v1
      - Contributor on /sites/<next-function-app>
      - ...
```

So onboarding a new project = adding ONE fed cred entry + ONE role assignment + setting THREE GitHub secrets on the new repo (which all reference the same shared appId/tenant/subscription). The setup script you generate handles all of this idempotently.

**Why this pattern**: one identity to audit, no secret rotation across N repos, AAD's 20-fed-cred-per-app limit is plenty of headroom, and revoking a single project's access = deleting just its fed cred + role assignment (not the whole App Reg).

If `continuous-agent-github-cicd` does not exist yet (first project ever using this skill), the setup script creates it. Otherwise the script reuses it.

## Pre-flight checklist (the worker MUST run these BEFORE writing any workflow YAML)

1. **Locate the Functions root.** Look for the directory containing both `host.json` and `package.json`. May be at repo root or nested. Use `find . -name host.json -not -path '*/node_modules/*' | head -5`. Pick the deepest unique path.

2. **Read `host.json`** to confirm Functions v4 model (`"version": "2.0"`).

3. **Read `package.json`** in the Functions dir. Note `engines.node` (default to `20.x` if absent), all `scripts`, all `dependencies`. DO NOT plan to add new runtime deps. DO NOT plan to bump `engines.node`.

4. **Read `.funcignore` and repo `.gitignore`** to understand exclusions.

5. **Check for existing `.github/workflows/`.** If present, do NOT clobber. Read the existing files; if they cover CI/CD, document and write to `workspace/needs-you.md`. If they cover only one piece, ADD the missing one without overwriting.

6. **Discover the GitHub repo identity.** Run `git remote get-url origin`. Extract `<owner>/<repo>` (strip `.git`, `https://github.com/`, `git@github.com:` prefixes). If no remote, leave `<OWNER>/<REPO>` placeholder and document.

7. **Discover the Azure Function App name. Try ALL of these in order before falling back to placeholder:**
   - `grep -rli 'azurewebsites\.net' README.md docs/ 2>/dev/null` — README often mentions the deploy target
   - `grep -rE '\.azurewebsites\.net|functionapp publish' --include="*.md" --include="*.json" --include="*.bicep" --include="*.yaml" --include="*.yml" .`
   - `find . -name "*.bicep" -o -name "azure.yaml" -o -name "main.parameters*" 2>/dev/null` — IaC files often name the Function App
   - `find . -name "local.settings*.json" -exec grep -l '' {} \;` — sometimes contains hints
   - `grep -E '"name"\s*:\s*"[^"]*"' azure.yaml azure.json 2>/dev/null` — azd-style projects
   - As LAST resort: leave `<APP_NAME_HERE>` placeholder in deploy.yml AND tag it as a TODO in `docs/cicd-setup.md`

8. **Determine target branch.** Default `main`. Read `git symbolic-ref --short HEAD` if uncertain.

## Authentication: OIDC with shared App Reg (only mode this skill writes)

Three GitHub secrets are referenced by the workflow. All three are **identifiers, not credentials** — same values across all of Jack's projects since they all reuse the shared App Reg.

| Secret | Value | Source |
|---|---|---|
| `AZUREAPPSERVICE_CLIENTID` | shared App Reg's appId | `az ad app list --display-name continuous-agent-github-cicd --query '[0].appId' -o tsv` |
| `AZUREAPPSERVICE_TENANTID` | tenant ID | `az account show --query tenantId -o tsv` |
| `AZUREAPPSERVICE_SUBSCRIPTIONID` | subscription ID | `az account show --query id -o tsv` |

The setup script (Deliverable 4) reads these at run time so the user never copy-pastes UUIDs.

### CRITICAL: federated credential subject must match the JWT GitHub presents

**This is the bug that wasted a deploy run on 2026-05-09.** The subject GitHub puts in the OIDC JWT depends on the workflow context:

| Workflow context | JWT subject |
|---|---|
| Push to branch, no `environment:` declared on job | `repo:OWNER/REPO:ref:refs/heads/<branch>` |
| Job declares `environment: <name>` | `repo:OWNER/REPO:environment:<name>` ← **overrides the branch one** |
| Pull request workflows | `repo:OWNER/REPO:pull_request` |
| Tag push | `repo:OWNER/REPO:ref:refs/tags/<tag>` |

If your `deploy.yml` declares `environment: production`, the fed cred subject MUST be `repo:OWNER/REPO:environment:production`. Documenting `:ref:refs/heads/main` while the YAML uses an environment will cause `AADSTS700213: No matching federated identity record found` on every deploy.

**Default workflow template in this skill DOES NOT use `environment:`** — keeps the subject pattern the simpler one (`:ref:refs/heads/main`) and keeps fed cred setup identical across projects. If a specific project later adds env-gating for manual approvals, that's an explicit opt-in and the setup script must add the matching env-subject fed cred.

## Workflow templates

Two YAML files at `<repo-root>/.github/workflows/`. CI runs on PRs and pushes (no secrets). Deploy runs on push to main with a `paths:` filter (uses OIDC).

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
  FUNCTIONS_DIR: '<FUNCTIONS_DIR>'
  NODE_VERSION: '<NODE_VERSION>'   # default 20.x

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

### `.github/workflows/deploy.yml` (default — no `environment:`)

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
  AZURE_FUNCTIONAPP_NAME: '<APP_NAME_HERE>'
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
          # Zip relative to repo root so artifact size is minimal and predictable.
          # Use $GITHUB_WORKSPACE to avoid relative-path arithmetic that depends on
          # how deeply nested AZURE_FUNCTIONAPP_PACKAGE_PATH happens to be.
          zip -r "$GITHUB_WORKSPACE/release.zip" . -x "*.git*"

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

**Notes:**
- `permissions: id-token: write` is REQUIRED on the deploy job for OIDC.
- The `paths:` filter excludes README-only commits from triggering deploys.
- `$GITHUB_WORKSPACE/release.zip` avoids the `../../release.zip` vs `../../../release.zip` arithmetic that depends on Functions-dir nesting depth.
- The deploy job has NO `environment:` declaration — keeps the JWT subject pattern simple (`:ref:refs/heads/main`).

### Advanced: opting into environment-gated deploys

If the user wants manual approval gates before prod deploy, add this to the `deploy` job:

```yaml
deploy:
  ...
  environment:
    name: production
```

**This changes the JWT subject** from `:ref:refs/heads/main` to `:environment:production`. The user MUST then add a SECOND federated credential to the shared App Reg with subject `repo:OWNER/REPO:environment:production` (in addition to or instead of the main-branch one). The setup script supports an `--with-environment <name>` flag for this.

## README badges

Add these immediately under the project title in `README.md`:

```markdown
[![CI](https://github.com/<OWNER>/<REPO>/actions/workflows/ci.yml/badge.svg)](https://github.com/<OWNER>/<REPO>/actions/workflows/ci.yml)
[![Deploy](https://github.com/<OWNER>/<REPO>/actions/workflows/deploy.yml/badge.svg)](https://github.com/<OWNER>/<REPO>/actions/workflows/deploy.yml)
```

`<OWNER>/<REPO>` from `git remote get-url origin`.

## `scripts/setup-cicd.sh` — the user-runnable bootstrap

Write this idempotent bash script. The user runs it ONCE per new project. Second run is a no-op. It does ALL Azure-side and GitHub-secrets-side wiring.

```bash
#!/usr/bin/env bash
# scripts/setup-cicd.sh — wire Azure AD + GitHub secrets for this repo's deploy workflow.
#
# Idempotent: re-running this is safe. Existing fed creds and role assignments are detected
# and skipped. Existing GitHub secrets are overwritten with current values.
#
# Prerequisites:
#   - `az login` (you, with Contributor on the target subscription and ability to create AAD apps)
#   - `gh auth login` (you, with admin access to the GitHub repo)
#
# Customization: this script is parameterized for THIS repo + Function App. To bootstrap
# a different Azure Functions project, copy this script into that repo and update the
# four UPPERCASE variables below.

set -euo pipefail

# ============================================================================
# Project-specific values — UPDATE these for a new project
# ============================================================================
GITHUB_REPO="<OWNER>/<REPO>"
FUNCTION_APP_NAME="<APP_NAME_HERE>"
FUNCTION_APP_RG="<RESOURCE_GROUP>"
TARGET_BRANCH="main"

# Optional: opt into environment-gated deploys. If set, an additional fed cred is created
# with subject :environment:<name> AND the deploy.yml must declare `environment: <name>`.
# Leave empty for the default (branch-ref subject only).
ENVIRONMENT_NAME=""

# ============================================================================
# Shared identity — DO NOT change unless intentionally migrating away from the
# continuous-agent shared App Registration model.
# ============================================================================
SHARED_APP_DISPLAY_NAME="continuous-agent-github-cicd"

echo "▸ Looking for shared App Registration: $SHARED_APP_DISPLAY_NAME"
APP_ID="$(az ad app list --display-name "$SHARED_APP_DISPLAY_NAME" --query '[0].appId' -o tsv 2>/dev/null || true)"

if [[ -z "${APP_ID:-}" ]]; then
  echo "  Not found. Creating it..."
  APP_ID="$(az ad app create --display-name "$SHARED_APP_DISPLAY_NAME" --query appId -o tsv)"
  az ad sp create --id "$APP_ID" >/dev/null
  echo "  ✓ Created App Registration: $APP_ID"
else
  echo "  ✓ Reusing existing App Registration: $APP_ID"
fi

TENANT_ID="$(az account show --query tenantId -o tsv)"
SUBSCRIPTION_ID="$(az account show --query id -o tsv)"

# ----------------------------------------------------------------------------
# Federated credentials
# ----------------------------------------------------------------------------
add_fed_cred() {
  local name="$1" subject="$2" description="$3"
  local existing
  existing="$(az ad app federated-credential list --id "$APP_ID" --query "[?name=='$name'] | [0].name" -o tsv 2>/dev/null || true)"
  if [[ -n "$existing" ]]; then
    echo "  ✓ Fed cred already exists: $name"
    return
  fi
  az ad app federated-credential create --id "$APP_ID" --parameters "{
    \"name\": \"$name\",
    \"issuer\": \"https://token.actions.githubusercontent.com\",
    \"subject\": \"$subject\",
    \"audiences\": [\"api://AzureADTokenExchange\"],
    \"description\": \"$description\"
  }" >/dev/null
  echo "  ✓ Created fed cred: $name (subject=$subject)"
}

REPO_SLUG="$(echo "$GITHUB_REPO" | tr '/' '-')"
echo "▸ Adding federated credential(s) for $GITHUB_REPO"
add_fed_cred \
  "github-${REPO_SLUG}-${TARGET_BRANCH}" \
  "repo:${GITHUB_REPO}:ref:refs/heads/${TARGET_BRANCH}" \
  "GitHub Actions deploy from ${GITHUB_REPO} ${TARGET_BRANCH} branch"

if [[ -n "$ENVIRONMENT_NAME" ]]; then
  add_fed_cred \
    "github-${REPO_SLUG}-env-${ENVIRONMENT_NAME}" \
    "repo:${GITHUB_REPO}:environment:${ENVIRONMENT_NAME}" \
    "GitHub Actions deploy via ${ENVIRONMENT_NAME} environment for ${GITHUB_REPO}"
fi

# ----------------------------------------------------------------------------
# Role assignment on the Function App
# ----------------------------------------------------------------------------
echo "▸ Granting Contributor on Function App ${FUNCTION_APP_NAME}"
SCOPE="/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${FUNCTION_APP_RG}/providers/Microsoft.Web/sites/${FUNCTION_APP_NAME}"
EXISTING_ROLE="$(az role assignment list --assignee "$APP_ID" --scope "$SCOPE" --query "[?roleDefinitionName=='Contributor'] | [0].id" -o tsv 2>/dev/null || true)"
if [[ -n "$EXISTING_ROLE" ]]; then
  echo "  ✓ Role assignment already exists"
else
  az role assignment create --assignee "$APP_ID" --role Contributor --scope "$SCOPE" >/dev/null
  echo "  ✓ Created Contributor role assignment"
fi

# ----------------------------------------------------------------------------
# GitHub repo secrets
# ----------------------------------------------------------------------------
echo "▸ Setting GitHub Actions secrets on $GITHUB_REPO"
gh -R "$GITHUB_REPO" secret set AZUREAPPSERVICE_CLIENTID --body "$APP_ID"
gh -R "$GITHUB_REPO" secret set AZUREAPPSERVICE_TENANTID --body "$TENANT_ID"
gh -R "$GITHUB_REPO" secret set AZUREAPPSERVICE_SUBSCRIPTIONID --body "$SUBSCRIPTION_ID"
echo "  ✓ Three secrets set/updated"

echo ""
echo "✓ CICD bootstrap complete for $GITHUB_REPO → $FUNCTION_APP_NAME"
echo ""
echo "Next: push to ${TARGET_BRANCH} or run \`gh workflow run deploy.yml\` to trigger a deploy."
```

The worker:
1. Writes this script with the four UPPERCASE values pre-filled from pre-flight discovery
2. Marks it executable: `chmod +x scripts/setup-cicd.sh`
3. References it from `docs/cicd-setup.md`

## `docs/cicd-setup.md` — short user-facing walkthrough

Now that the script does the heavy lifting, this doc is just a checklist. Structure:

```markdown
# CICD Setup — Azure Functions Deploy via GitHub Actions

This repo has two GitHub Actions workflows:
- `.github/workflows/ci.yml` — runs on every PR and push to main. Builds. Already works.
- `.github/workflows/deploy.yml` — runs on push to main when Function code changes. Deploys to Azure. **Requires one-time setup.**

## One-time setup (5 minutes)

### Prerequisites
- `az login` with Contributor on subscription `<SUBSCRIPTION_ID>` (where the Function App lives)
- `gh auth login` with admin on the GitHub repo
- The Function App `<APP_NAME>` must already exist

### Run the bootstrap script
```sh
./scripts/setup-cicd.sh
```

This script (idempotent — safe to re-run):
1. Finds or creates the shared App Registration `continuous-agent-github-cicd`
2. Adds a federated credential trusting this repo's main-branch workflow runs
3. Grants the App Registration Contributor on this Function App
4. Sets three GitHub Actions secrets

When it finishes, push a commit to `main` (or run `gh workflow run deploy.yml`) and the deploy will succeed.

## Verifying the deploy
- `gh run watch` — watch the run live
- Azure Portal → Function App → Deployment Center should show a recent `GITHUB_ZIP_DEPLOY_FUNCTIONS_V1` deployment
- Hit a function endpoint to confirm fresh code is serving

## Troubleshooting

### `AADSTS700213: No matching federated identity record found`
The fed cred's subject doesn't match what GitHub presented. Most common cause: deploy.yml declares `environment: <name>` but the fed cred uses a branch-ref subject. Either remove `environment:` from deploy.yml OR set `ENVIRONMENT_NAME` in `setup-cicd.sh` and re-run it (adds the matching env-subject fed cred).

### `AuthorizationFailed` from functions-action
Role assignment hasn't propagated yet (1–5 min after creation). Wait, then re-run failed jobs.

### `Resource not found` from functions-action
`AZURE_FUNCTIONAPP_NAME` in `deploy.yml` doesn't match an actual Function App in the linked subscription, or the App Reg doesn't have access to that resource group.

### Persistent auth errors
Verify the values:
```sh
az ad app list --display-name continuous-agent-github-cicd --query '[0].appId' -o tsv
gh secret list -R <OWNER>/<REPO>
```
The first should match the value of `AZUREAPPSERVICE_CLIENTID` (you can't read secrets back, but `gh secret set` is safe to re-run from `setup-cicd.sh`).
```

## Common pitfalls — do NOT trip on these

1. **JWT subject vs fed cred subject mismatch.** This is the #1 cause of OIDC deploy failures. Default to no `environment:` in deploy.yml; if you add one, the fed cred subject MUST be the env subject. (Lesson learned 2026-05-09 on `azure-star-generator`.)
2. **Per-project App Registrations.** Don't create a new App Reg per project — reuse `continuous-agent-github-cicd`. The setup script handles "find or create."
3. **Zipping from the wrong directory.** Always zip from inside the Functions dir. Use `$GITHUB_WORKSPACE/release.zip` to avoid relative-path arithmetic.
4. **Missing `permissions: id-token: write`** on the deploy job. Without it, OIDC fails with a confusing JWT error before even talking to Azure.
5. **`paths:` filter omitted on deploy.yml.** Means every README-only commit triggers a deploy.
6. **`actions/setup-node@v4` without `cache-dependency-path`** when Functions dir is nested. Cache misses on every run.
7. **`actions/upload-artifact@v3`** — deprecated, breaks Functions deploy. Always v4.
8. **`--no-verify` or `--force` anywhere.** Don't.
9. **Setting `engines` in workflow without bumping `package.json`.** They must agree.
10. **Bumping Node version.** Don't. The CI/deploy workflow honors `package.json` `engines.node`.

## Verification protocol — before declaring done

1. **YAML lint.** `actionlint .github/workflows/*.yml` if installed; otherwise `python3 -c "import yaml; yaml.safe_load(open(F))"` for each.
2. **Frontmatter check.** Both YAMLs start with `name:`, have `on:` and `jobs:` blocks.
3. **Path-filter sanity.** `paths:` matches the actual Functions dir path.
4. **Placeholder grep.** `grep -n '<.*HERE.*>\|<OWNER>\|<REPO>\|<FUNCTIONS_DIR>\|<NODE_VERSION>' .github/workflows/*.yml` — should return zero matches in YAML files (placeholders only allowed in `docs/cicd-setup.md` and `scripts/setup-cicd.sh` clearly marked).
5. **Script executable.** `test -x scripts/setup-cicd.sh && echo OK`.
6. **Commit hygiene.** Conventional Commits. Recommended split:
   - `ci(github-actions): add CI workflow for Azure Functions build`
   - `ci(github-actions): add deploy workflow with OIDC auth`
   - `chore(scripts): add CICD bootstrap script`
   - `docs(cicd): add CICD setup walkthrough`
   - `docs(readme): add CI and Deploy badges`
7. **Final `git status -s` MUST be empty.**
8. **The worker does NOT push.** No `git push` ever.

## Out of scope — do NOT do these

- Provision Azure resources (`az functionapp create`, `az group create`, etc.)
- Run `az login` / `az ad app create` / `az role assignment create` / `gh secret set` / `gh auth login` directly. The user runs these via `setup-cicd.sh`.
- Modify code under `<FUNCTIONS_DIR>/src/**`
- Add new runtime deps in `<FUNCTIONS_DIR>/package.json`
- Bump `engines.node` in `<FUNCTIONS_DIR>/package.json`
- Push to remote (`git push`)
- Create a `local.settings.json` with real secrets (only `local.settings.json.example` is OK if needed)

## Reference workflows

- `/Users/jackjin/dev/azure-da-mcp/.github/workflows/main_jack-mcp-azure-ai-function.yml` — canonical Azure Functions Node.js OIDC deploy
- `/Users/jackjin/dev/azure-star-generator/.github/workflows/deploy.yml` — also OIDC-based, served as the validation case for v0.2.0 of this skill

## Changelog

### 0.2.0 (2026-05-09) — first real-deploy lessons
- **Removed `environment: production`** from default deploy.yml template. (v0.1.0 had it, which silently changed the JWT subject from `:ref:refs/heads/main` to `:environment:production` — caused AADSTS700213 on first deploy of `azure-star-generator`.)
- **Added shared App Registration pattern** (`continuous-agent-github-cicd`) — one App Reg across all of Jack's projects.
- **Added `scripts/setup-cicd.sh`** as a 4th deliverable. Idempotent. Replaces ~10 manual `az`/`gh` commands the user previously copy-pasted.
- **Improved Function App name pre-flight** — searches IaC files, README, settings files exhaustively before falling back to `<APP_NAME_HERE>` placeholder.
- **`$GITHUB_WORKSPACE/release.zip`** in the zip step instead of `../../release.zip` — no relative-path arithmetic. (v0.1.0 had `../../release.zip` which was wrong for `azure-star-generator`'s 3-deep Functions dir; the worker auto-corrected to `../../../` but that's fragile.)
- **Documented today's two deploy-time gotchas** in Common pitfalls section.

### 0.1.0 (2026-05-09 morning) — initial release
- Three deliverables: ci.yml, deploy.yml, docs/cicd-setup.md, README badges.
- OIDC-only auth model.
- Validated against `azure-star-generator` Function App. Two issues found in production (above), addressed in 0.2.0.

## End — verification checklist

Before declaring this skill applied successfully:

- [ ] `<repo-root>/.github/workflows/ci.yml` exists, parses as YAML, no placeholders
- [ ] `<repo-root>/.github/workflows/deploy.yml` exists, parses as YAML, no `<.*HERE.*>` placeholders, no `environment:` (unless explicitly opted in by goal)
- [ ] `<repo-root>/scripts/setup-cicd.sh` exists, is executable, has the four UPPERCASE values pre-filled
- [ ] `<repo-root>/docs/cicd-setup.md` exists (short — mostly references the script)
- [ ] `<repo-root>/README.md` has CI + Deploy badges with real `<owner>/<repo>` filled in
- [ ] No new dependencies added to Functions `package.json`
- [ ] No code under `<FUNCTIONS_DIR>/src/**` modified
- [ ] All work committed, working tree clean
- [ ] No `git push` performed
- [ ] No `az` or `gh secret` commands run by the worker (they go in the script for the user to run)
