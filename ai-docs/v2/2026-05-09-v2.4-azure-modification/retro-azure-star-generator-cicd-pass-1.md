# Retrospective — Azure STAR Generator CICD Pass #1

**Date:** 2026-05-09
**Goal slug:** `2026-05-09-azure-star-generator-cicd-pass-1`
**Goal bundle:** `workspace/completed/2026-05-09-azure-star-generator-cicd-pass-1/`
**Companion docs:** [`plan.md`](./plan.md), [`prompt-log.md`](./prompt-log.md)

## TL;DR

Set out to teach the continuous agent how to wire GitHub Actions CICD for Azure Functions, then execute the first real CICD goal end-to-end on Jack's `azure-star-generator` repo. Over ~3 hours we shipped a working OIDC-based deploy to `https://azure-star-generator-node-v1.azurewebsites.net` and surfaced two real defects in the v0.1.0 skill, both addressed in v0.2.0 of the skill on the same day. The session was a high-fidelity test of the agent's "build-then-execute-then-learn" loop.

**Concrete outcomes:**
- ✅ Worker shipped 4 deliverables (ci.yml, deploy.yml, docs/cicd-setup.md, README badges) in 3.5 minutes
- ✅ End-to-end deploy verified: GitHub Actions OIDC → Azure AD → ARM → Function App, with SHA `fbf3fda6...` matching local HEAD on Azure deployment history
- ⚠️ First deploy attempt hit `AADSTS700213` due to a JWT-subject vs federated-credential-subject mismatch (skill template defect)
- ⚠️ Worker left `<APP_NAME_HERE>` placeholder in deploy.yml (incomplete pre-flight discovery; not blocked by Phase 5 verifiers)
- ✅ Skill rewritten to v0.2.0 incorporating both lessons; future projects should bootstrap in <5 min via `setup-cicd.sh` + push

## Session arc (chronologically)

| Time (ET) | Phase | What happened |
|---|---|---|
| ~11:18 | Resume | User returned after a 2-week break. Asked for status recap on prior `azure-star-generator` work (UI refresh on commit `98bf9ea`, Patches A+B in `c08b9b7`) |
| ~11:30 | Scoping | User asked for: (1) write Azure Functions deploy worker skill, (2) goal bundle for first CICD pass on `azure-star-generator`, (3) plan in claude → review → /clear → execute |
| ~12:15 | Plan written | `plan.md` (~1117 lines) committed; covers SKILL.md content verbatim, 6 prompt-builder.ts edits, PROMPT.md verbatim, exec sequence, monitoring, post-completion checks, rollback |
| ~12:35 | Execution | Per-plan: wrote SKILL.md v0.1.0, applied 6 edits to prompt-builder.ts, typecheck/build clean, wrote PROMPT.md, promoted to ondeck, started PM2, armed two background monitors |
| 17:45:48Z | Worker spawn | Goal selected; `[V2 Prompt] Loaded azure-function-deploy skill` confirmed in ledger |
| 17:49:17Z | Worker complete | 3.5 min total. Single Conventional commit `c1cf6b4` on `main` of `azure-star-generator`. 6/8 verifiers passed (advisory failures: `files_exist`, `node_test`). Phase 5b ran in single-goal mode (Patch B). |
| ~12:55 | Critical inspection | User asked "did it deploy?" Answer: no — local commit only, not pushed. Worker did exactly what its constitution mandated. |
| ~13:00 | Manual Azure setup | User said "let's make this a learning experience, one step at a time." Walked through steps 3 (App Reg + SP), 4 (federated credential), 5a (role assignment), 5b (GitHub secrets) with why/what/how before each `az`/`gh` command. App Reg renamed mid-flow from project-scoped to shared (`continuous-agent-github-cicd`). |
| ~13:35 | Step 6 | `<APP_NAME_HERE>` substituted to `azure-star-generator-node-v1`, fresh commit `fbf3fda` (no amend per CLAUDE.md), no push |
| ~13:42 | First push | User pushed both commits to `origin/main` |
| 18:42:59Z | Workflows triggered | CI ran 16s → ✅. Deploy ran 41s → ❌. AADSTS700213 on `azure/login@v2`. |
| ~13:48 | Diagnosis | Root cause: `environment: production` in deploy job → JWT subject `:environment:production`; fed cred subject `:ref:refs/heads/main`. Mismatch. |
| ~13:50 | Recovery | Added second fed cred (subject `:environment:production`). Re-ran failed deploy job only. |
| 18:49:58Z | Deploy success | Azure deployment history: SHA `fbf3fda6...` at `Production` slot, deployer `GITHUB_ZIP_DEPLOY_FUNCTIONS_V1`. End-to-end verified. |
| ~14:10 | Skill v0.2.0 | Rewrote SKILL.md with shared App Reg pattern, dropped `environment: production` from default template, added `scripts/setup-cicd.sh` deliverable, beefed up Function App name discovery, $GITHUB_WORKSPACE-relative zip path, updated Common pitfalls, added Changelog. 532 lines (up from ~280). |

## What went well

### Infrastructure (the agent code)

**1. Patches A+B from yesterday's `c08b9b7` held up cleanly.** Phase 5b ran in single-goal mode (Patch B) for the first time in production. Journey-satisfiability gate (Patch A) correctly did NOT fire on the CLI-shaped journey ("`gh workflow list`...") — confirms the regex `/browser|click|playwright|chromium|.../` was tuned correctly to avoid false positives. Evidence: `/Users/jackjin/dev/continuous-agent/ledgers/executive-2026-05-09.log` line `2026-05-09T17:49:17.624Z [Phase 5b] Running whole-goal integration validator for "Azure STAR Generator — GitHub Actions CICD Pass #1" (single-goal mode)`.

**2. The 6 prompt-builder.ts edits worked first try.** Auto-load wiring fired exactly once for this goal. `[V2 Prompt] Loaded azure-function-deploy skill (Azure Functions project detected)` event in executive ledger at `17:45:48.259Z`. `WORKER_SKILL_LOADED` telemetry in `ledgers/work-ledger.jsonl` confirms `azure-function-deploy` was tracked alongside `web-testing`, `backend-testing`, `jack-git-commit` for this contract. Edit pattern (mirroring `web-testing`) was clean enough to add a new skill in 6 small additions with no refactoring.

**3. `setupExistingProjectSkills` (commit `fb73ec2`) synced the new skill to the target's `.claude/` for `existing` mode.** Worker had access to the full SKILL.md body via the Skill tool. No manual sync needed.

**4. Worker run was fast and well-behaved.** 3.5 min for a `complexity: low` single-shot. All 4 deliverables produced. No retries, no token errors, no orphaned state.

**5. Hard prohibitions in PROMPT.md held.** Worker did NOT push, run `az`, run `gh secret set`, create a feature branch, or add new dependencies. The trust contract worked. The Azure-side and secrets-side stayed in human hands by design.

**6. Worker self-corrected one skill template bug at write time.** Skill template said `zip -r ../../release.zip` (assuming 2-deep Functions dir). `azure-star-generator` is 3-deep at `code/Functions/azure-star-generator-node-v1/`. Worker wrote `../../../release.zip` — adapted to actual nesting depth. Adaptive behavior beyond literal template-following.

**7. Conventional Commits format on both worker and human commits.** `c1cf6b4 ci(github-actions): ...` and `fbf3fda ci(deploy): ...` — verifier #5 in the skill's verification protocol was met.

### Execution / human collaboration

**8. End-to-end deploy ultimately succeeded.** Azure deployment history shows `Status: 4 (success)`, SHA `fbf3fda6da6bee671c3ce6212c6bc787474d7f38` (matches local HEAD), Deployer `GITHUB_ZIP_DEPLOY_FUNCTIONS_V1` — confirms the OIDC + GitHub Actions path, NOT the legacy `ms-azuretools-vscode` manual deploy.

**9. The "human owns Azure setup" model proved its value.** When AADSTS700213 hit, Jack understood the trust model deeply enough to debug the JWT subject claim with assistant guidance. A fully automated setup would have hit the same error and required identical debugging — but with less learning. The pedagogical framing the user requested ("one step at a time, why/what/how before executing") was the right call.

**10. The skill was rewritten to v0.2.0 in the same session.** Failures distilled into structure, with the changelog explicitly citing today's incident. Future projects will not hit AADSTS700213 from this skill template.

## What didn't work (with root causes)

### **Defect 1 — `environment: production` in skill template caused AADSTS700213**

**Symptom:** First deploy attempt failed at `Login to Azure (OIDC)` with:
```
AADSTS700213: No matching federated identity record found for presented assertion
subject 'repo:jackzhaojin/azure-star-generator:environment:production'.
```

**What I expected:** `subject = repo:jackzhaojin/azure-star-generator:ref:refs/heads/main` (matching the fed cred we created in step 4 of manual setup).

**What actually happened:** GitHub mints the JWT subject from workflow context. When a job declares `environment: <name>`, the subject becomes `:environment:<name>` instead of `:ref:refs/heads/<branch>`. Skill template v0.1.0 included `environment: production` on the deploy job (copied from the `azure-da-mcp` reference workflow without realizing the implication). Skill's `docs/cicd-setup.md` walked through creating a fed cred with `:ref:refs/heads/main` subject. Two halves didn't agree.

**Root cause:** v0.1.0 of the skill was authored without understanding the subject-claim rule. I treated `environment:` as a passive job annotation.

**Fix path taken:** Added a second fed cred with subject `repo:jackzhaojin/azure-star-generator:environment:production` to the shared App Reg. Re-ran failed deploy job; 40s later, success. Then redesigned skill to drop `environment:` from the default template and document env-gating as an explicit advanced opt-in (with the matching fed cred subject documented).

### **Defect 2 — Skill assumed per-project App Registrations**

**Symptom:** v0.1.0 named the App Reg `github-actions-azure-star-generator` (project-scoped). Doesn't fit Jack's stated preference for one shared App Reg across many projects, scaling sub-linearly per onboarded project.

**What I expected:** This would be the natural pattern for a personal/learning ecosystem.

**What actually happened:** I authored v0.1.0 thinking each project as standalone. Mid-session Jack said "let's have all these share the same one, so I can create many apps and use one single ad" — we renamed mid-flow to `continuous-agent-github-cicd`. Skill content was now stale immediately.

**Root cause:** I didn't think about scaling across N projects when designing the skill. Single-project mental model.

**Fix path taken:** v0.2.0 leans into the shared App Reg pattern as a first-class concept. Setup script does find-or-create on `continuous-agent-github-cicd`. Future onboarding = +1 fed cred + 1 role assignment + 3 GitHub secrets (same values across projects).

### **Defect 3 — Worker couldn't discover the Function App name**

**Symptom:** Worker wrote `AZURE_FUNCTIONAPP_NAME: '<APP_NAME_HERE>'` into deploy.yml; flagged a TODO in cicd-setup.md.

**What I expected:** Pre-flight discovery checks should have searched all reasonable sources.

**What actually happened:** v0.1.0's pre-flight only checked README, host.json, and `local.settings*.json`. README mentions "Azure Functions" but not the resource name. host.json has no resource hint. local.settings.json had empty values from a prior dev environment. Worker didn't search IaC files (`*.bicep`, `azure.yaml`), didn't grep for `azurewebsites.net` substring, didn't try `azd` patterns. The actual Function App name (`azure-star-generator-node-v1`) was discoverable via `az functionapp list --query '[?resourceGroup==\`Jack-2025-Story-RG\`]'`, but workers don't have `az` in their toolkit by design.

**Root cause:** Pre-flight checklist was incomplete and didn't anticipate the "name is in IaC, not in repo files" common case.

**Fix path taken:** v0.2.0 has a 5-pass discovery checklist (README scan, IaC files, settings, azd patterns, fallback). Even with that, some repos (like this one — manual deploy long ago, no IaC) will still fall back to the placeholder. The placeholder is now a clear TODO with the setup script knowing to prompt for it.

### **Defect 4 — Skill template's zip path was depth-dependent**

**Symptom:** Skill template v0.1.0 had `zip -r ../../release.zip .` — hardcoded 2-deep relative path. Worker self-corrected to `../../../release.zip` for `azure-star-generator`'s 3-deep Functions dir, but that's brittle.

**Root cause:** Template was hand-written for one project's depth without parameterization.

**Fix path taken:** v0.2.0 uses `zip -r "$GITHUB_WORKSPACE/release.zip" .` — depth-independent. GitHub Actions sets `GITHUB_WORKSPACE` to the repo root regardless of nesting.

### **Defect 5 — Phase 5 verifiers passed despite the placeholder**

**Symptom:** `<APP_NAME_HERE>` was still in deploy.yml line 12 when worker declared done. Verifiers passed 6/8 (advisory failures: `files_exist`, `node_test`). Goal moved to `workspace/completed/`. The placeholder was caught only when I (the assistant) inspected the diff manually post-completion.

**Root cause:** Verifiers don't grep for placeholders. Journey-satisfiability gate is browser-keyword-based; CLI journeys bypass it. The skill's verification protocol mentions a placeholder grep but it's the worker's responsibility, not a runtime check by Phase 5.

**Fix path taken:** Not implemented in this session. Captured as **H1** below.

### **Defect 6 — Phase 5b didn't catch the impending AADSTS error**

**Symptom:** Phase 5b ran in single-goal mode and passed. The goal's `definition_of_done_journey` predicted "deploy job fails with a clear auth/secrets error... NOT a YAML error" — so a first-attempt fail was actually expected behavior. But Phase 5b can't model "expected to fail in a specific way until you do extra setup" — it just checks artifact presence and journey satisfiability.

**Root cause:** Phase 5b is currently structural validation, not behavioral. There's no mechanism to validate "the system is in a state from which the user can complete the journey" for journeys that include "first run will fail at step X."

**Fix path taken:** Not implemented. Captured as **H2** below.

### **Defect 7 — No skill staging before first production use**

**Symptom:** v0.1.0 was authored, validated against the same project (`azure-star-generator`), and then deployed to production for that project — all in one session. No rotation through a separate validation case before lessons surfaced.

**Root cause:** v2 of the agent system has no "skill staging" concept. Skills go from "drafted" to "live and used by the next worker."

**Fix path taken:** Not implemented. Captured as **H3** below.

## Must-fix items

### Harness / Executive code (H)

**H1. Add a placeholder-grep verifier to Phase 5.**
When `<.*HERE.*>`, `<OWNER>`, `<REPO>`, `<FUNCTIONS_DIR>`, `<NODE_VERSION>` patterns appear in non-doc files (excluding paths like `docs/cicd-setup.md` clearly marked as TBD), Phase 5 should fail with a blocking verifier. Caught today's `<APP_NAME_HERE>` issue post-completion when I inspected the diff manually. **Owner:** continuous-agent maintainer. **Effort:** small (~30 lines in a new verifier file). **Priority:** medium.

**H2. (Optional) Behavioral CICD verifier.**
For CICD goals specifically, Phase 5b could (with explicit goal opt-in via frontmatter `behavioral_validation: gh_workflow_run`) trigger `gh workflow run` and assert the run reaches a known success/expected-fail state. Heavy lift; lower priority. Risk: requires `gh` auth in the worker's runtime, broader credential surface. **Owner:** TBD. **Effort:** large. **Priority:** low.

**H3. Skill staging / "first-run flag."**
When a skill is loaded for the first time in production (no prior `WORKER_SKILL_LOADED` events for that skill+version combo), executive should log a banner like `[FIRST-RUN] Skill azure-function-deploy@0.1.0 has no prior production runs — expect possible learnings`. Or richer: a "skill staging" mode where v0.x.0 skills only auto-load for a designated test goal. **Owner:** TBD. **Effort:** medium. **Priority:** low.

### Input / skills / prompts (I)

**I1. ✅ DONE in this session — skill v0.2.0.** Drop `environment: production` from default deploy.yml; document env-gating as advanced opt-in with matching fed cred subject. (Implemented; 532-line SKILL.md.)

**I2. ✅ DONE in this session — skill v0.2.0.** Switch to shared App Registration model (`continuous-agent-github-cicd`). New section "The shared App Registration pattern" front-and-center.

**I3. ✅ DONE in this session — skill v0.2.0.** Replace markdown setup walkthrough with idempotent `scripts/setup-cicd.sh`. Now a 4th deliverable. Worker pre-fills 4 UPPERCASE values from pre-flight.

**I4. ✅ DONE in this session — skill v0.2.0.** Robust pre-flight Function App name discovery (5-pass: README, IaC, settings, azd, etc.).

**I5. ✅ DONE in this session — skill v0.2.0.** Use `$GITHUB_WORKSPACE/release.zip` instead of relative path arithmetic.

**I6. Future: when authoring a new cloud-auth-related skill, validate the OIDC subject pattern against actual GitHub workflow context BEFORE declaring v1.0.** A skill self-test, possibly a doc check ("if SKILL.md mentions `environment:` in workflow YAML AND mentions `:ref:` in fed cred subject, fail"). **Owner:** skill-builder agent or self-enhance. **Effort:** small. **Priority:** medium.

**I7. Promote a generalized "first-run-will-fail-at-auth" pattern to executive prompts.**
When goals involve cloud auth, the skill should explicitly guide the user that the first deployment run will likely fail with auth-something — that means the workflow shape is correct and only auth wiring is missing. Today's `azure-star-generator` PROMPT.md (`definition_of_done_journey`) already had this; generalize for any cloud-deploy goal. **Owner:** skill maintainer. **Effort:** small. **Priority:** medium.

**I8. Future: model "expected-fail then fix-forward" goals.**
Some goals legitimately ship deliverables that will fail on first run (waiting for human-only setup). The system needs a way to model this as a passable state vs an actual deploy that should succeed end-to-end. Today the journey predicted a failure but we then iterated past it; the skill's `definition_of_done_journey` could distinguish "expected first-run failure → human setup → repeat first run → success" from "must succeed first try." **Owner:** harness/skill maintainer. **Effort:** medium. **Priority:** low.

## Raw data references

### Executive ledger (this run)
- **Path:** `/Users/jackjin/dev/continuous-agent/ledgers/executive-2026-05-09.log`
- **Worker spawn:** `2026-05-09T17:45:48.218Z` — contract `contract-1778348747654`
- **Skill load event:** `17:45:48.259Z` — `[V2 Prompt] Loaded azure-function-deploy skill (Azure Functions project detected)`
- **Worker complete:** `17:49:17.581Z`
- **Phase 5 verifier results:** 6 passed, 2 failed (advisory: `files_exist`, `node_test`)
- **Phase 5b:** ran in `single-goal mode` (Patch B from `c08b9b7`)

### Work ledger
- **Path:** `/Users/jackjin/dev/continuous-agent/ledgers/work-ledger.jsonl`
- **WORKER_SKILL_LOADED events for this run:** `azure-function-deploy`, `web-testing`, `backend-testing`, `jack-git-commit`

### Goal bundle
- **Path:** `/Users/jackjin/dev/continuous-agent/workspace/completed/2026-05-09-azure-star-generator-cicd-pass-1/`
- Files: `PROMPT.md`, `CONTRACTS.jsonl`

### Target repo: `azure-star-generator`
- **Path:** `/Users/jackjin/dev/azure-star-generator`
- **Worker commit:** `c1cf6b4 ci(github-actions): add GitHub Actions CICD for Azure Functions` (446 insertions, 0 deletions; 4 files)
- **Manual fix-up commit:** `fbf3fda ci(deploy): set Function App name to azure-star-generator-node-v1` (4 insertions, 10 deletions; 2 files)
- **HEAD after push:** `fbf3fda` on `origin/main`

### GitHub Actions runs
- **CI run `25608912435`:** push, completed success in 16s
- **Deploy run `25608912433` attempt 1:** push, completed failure in 41s (AADSTS700213 on `Login to Azure (OIDC)`)
- **Deploy run `25608912433` attempt 2:** rerun-failed-jobs, completed success in 43s

### Azure resources (subscription `2c32157c-2436-4385-9d32-728314e3375a`)
| Resource | RG | Type | Role in this work |
|---|---|---|---|
| `azure-star-generator-node-v1` | `Jack-2025-Story-RG` | Function App (Microsoft.Web/sites) | The deploy target; runtime v4.1048.200.26180; Windows; default host `azure-star-generator-node-v1.azurewebsites.net`; 3 HTTP triggers (DisplayStoryUIHtml, GenerateStarStories, ProcessCsvData) |
| `ASP-Jack2025StoryRG-91b9` | `Jack-2025-Story-RG` | App Service Plan (Y1 consumption) | Hosts the Function App |
| `jack2025storyrgbfb2` | `Jack-2025-Story-RG` | Storage Account | Function App's `AzureWebJobsStorage` backend |
| `azure-star-generator-node-v1` (Application Insights) | `Jack-2025-Story-RG` | Insights component | Telemetry sink |
| `story-generation-v1` | `Jack-2025-Story-RG` | Azure OpenAI | The model the Function App's code calls; separate from deploy concern |

### Azure deployment history (proof of fresh code)
- **Sha:** `fbf3fda6da6bee671c3ce6212c6bc787474d7f38` (matches local HEAD `fbf3fda`)
- **Deployer:** `GITHUB_ZIP_DEPLOY_FUNCTIONS_V1` (confirms OIDC path, not the prior `ms-azuretools-vscode` manual VS Code deploys from 2025-04-14)
- **Start:** `2026-05-09T18:49:58.6843117Z`
- **End:** `2026-05-09T18:50:00.084163Z` (1.4s on Azure side)

### Azure AD identity (the new shared App Registration)
- **Display name:** `continuous-agent-github-cicd`
- **appId / client_id:** `056b05c9-931c-47e1-ae20-6a8abfd16983`
- **AAD object ID:** `eb020cca-ecaa-4051-896c-67e22f9a5f5e`
- **Tenant:** `243728cf-fcde-4eac-aac5-a1a310054cb0` (Default Directory under jackzhaojingmail.onmicrosoft.com)
- **Service Principal object ID:** `29875106-4245-4572-a5f5-c7198ef545a0`

### Federated credentials on the App Registration
| Name | Subject | Created |
|---|---|---|
| `github-azure-star-generator-main` | `repo:jackzhaojin/azure-star-generator:ref:refs/heads/main` | 18:30:13Z (proactive) |
| `github-azure-star-generator-env-production` | `repo:jackzhaojin/azure-star-generator:environment:production` | 18:48:??Z (added after AADSTS700213) |

### Role assignments
- `Contributor` on `/subscriptions/2c32157c.../resourceGroups/Jack-2025-Story-RG/providers/Microsoft.Web/sites/azure-star-generator-node-v1` for principal `056b05c9...`

### GitHub repo secrets (`jackzhaojin/azure-star-generator`)
| Name | Value source | Set time |
|---|---|---|
| `AZUREAPPSERVICE_CLIENTID` | `056b05c9-931c-47e1-ae20-6a8abfd16983` | 2026-05-09T18:34:30Z |
| `AZUREAPPSERVICE_TENANTID` | `243728cf-fcde-4eac-aac5-a1a310054cb0` | 2026-05-09T18:34:31Z |
| `AZUREAPPSERVICE_SUBSCRIPTIONID` | `2c32157c-2436-4385-9d32-728314e3375a` | 2026-05-09T18:34:31Z |

### Skill files
- **Pre-session (v0.1.0):** `claude-files-to-output/skills/azure-function-deploy/SKILL.md` — created in this session at ~12:35 ET, ~280 lines
- **Post-session (v0.2.0):** same path, 532 lines, working-tree change pending commit

### Continuous-agent code
- **Pending working-tree change:** `claude-files-to-output/skills/azure-function-deploy/SKILL.md` (+304 / -146)
- **Already committed in earlier sessions:**
  - `c08b9b7 feat(validation): implement journey satisfiability check for whole-goal validation` (Patches A+B)
  - `fb73ec2 feat(worker-spawner): sync .claude/ directory for existing projects to enable Skill tool usage`
  - `64dd7b8 feat(goal): add complexity field to WorkItem and enhance breakdown logic`
- **Built dist:** `2.1.4+44a3d90.20260509T134355ET.dirty` (2026-05-09T17:43:55.230Z)

## Lessons distilled

### Technical

1. **OIDC JWT subject is determined by workflow CONTEXT, not the workflow file alone.** Adding `environment:`, `pull_request`, `workflow_call`, `release`, etc. silently mutates the subject. Federated credentials must match the actual subject GitHub mints, not what you "expect" looking at the YAML. Skill v0.2.0 documents the four most common patterns explicitly.

2. **Identifiers vs credentials.** GitHub "secrets" `AZUREAPPSERVICE_CLIENTID`, `TENANTID`, `SUBSCRIPTIONID` are public/semi-public identifiers, not credentials. Many teams put them as `vars`. Default to `secrets` for free workflow-log auto-redaction; the actual trust anchor is the federated credential.

3. **Azure has two parallel permission systems.** AAD authentication (the App Reg + fed cred) and Azure RBAC (role assignment on a scope) are independent. You need both for a successful deploy. Forgetting one yields different error messages: AADSTS70021/700213 (wrong fed cred) vs AuthorizationFailed (missing role assignment).

4. **`Azure/functions-action@v1` deploys zip-from-artifact.** The zip contents must have `host.json` at the root of what's unzipped. `cd <functions-dir> && zip $GITHUB_WORKSPACE/release.zip .` is the depth-independent recipe.

5. **`gh run watch --exit-status`'s exit code can be misleading.** I read exit 0 as "success" and reported success prematurely. The actual run was failure. Lesson: always pair watch-exit with `gh run view` or `gh run list` to verify actual status.

### Process

6. **The "human owns Azure setup" model is a feature, not friction.** Letting Jack debug AADSTS700213 step-by-step taught him the OIDC trust model in a way that a fully-automated setup couldn't. The pedagogy was the point. For an autonomous system, the script becomes the bootstrap; for a learning user, the script becomes the artifact they read after manual exploration.

7. **A skill's first production run is its real validation.** v0.1.0 looked correct in plan and on paper; only contact with reality found the env-subject defect and the per-project App Reg defect. The skill's changelog is now anchored in real incidents — that's the only kind of skill changelog that's load-bearing.

8. **Verifiers as currently designed catch artifact PRESENCE, not artifact CORRECTNESS.** 6/8 verifiers passed despite a `<APP_NAME_HERE>` placeholder in production-bound YAML. The verifier suite needs a placeholder-grep check (H1).

9. **Documenting in changelog form keeps lessons.** The skill's v0.2.0 → v0.1.0 changelog explicitly cites today's date and incident. Future maintainers reading the skill will not just see "what" but "why," anchored in a real failure with a real timestamp.

## What's next (carry-forward)

| Item | Where it lives | Status |
|---|---|---|
| Commit `claude-files-to-output/skills/azure-function-deploy/SKILL.md` (v0.2.0) | continuous-agent working tree | Pending — assistant won't commit unprompted per CLAUDE.md |
| Optional: drop `environment: production` from `azure-star-generator/deploy.yml` (cosmetic; both fed creds exist) | `/Users/jackjin/dev/azure-star-generator` | Pending — Jack's call |
| Optional: rewrite `azure-star-generator/docs/cicd-setup.md` to match v0.2.0 skill structure (refer to script, etc.) | `/Users/jackjin/dev/azure-star-generator` | Pending — Jack's call |
| H1 (placeholder-grep verifier) | continuous-agent code | Backlog (medium) |
| H2 (behavioral CICD verifier) | continuous-agent code | Backlog (low) |
| H3 (skill staging / first-run flag) | continuous-agent code | Backlog (low) |
| I6 (skill self-test for OIDC subject consistency) | skill-builder | Backlog (medium) |
| I7 (generalize "first-run-will-fail-at-auth" pattern) | skill maintainer | Backlog (medium) |
| I8 (model expected-fail then fix-forward goals) | harness | Backlog (low) |
| Next CICD goal validating v0.2.0 of the skill on a fresh project | future goal bundle | Open — wait for next Azure Functions project |

## Closing

This was a textbook example of the continuous-agent's intended learning loop: write a skill from research, run it in production, surface defects from contact with reality, distill lessons into the next version of the skill — all on the same day. The agent system did its job (fast, correct, contained). The human did the parts the system shouldn't do (real-money Azure trust setup, with full understanding). The skill graduated from v0.1.0 to v0.2.0 with a changelog anchored in two specific incidents and timestamps.

The deploy works. The skill is better. The next project should bootstrap in <5 min.

— Co-authored by Jack Jin and Claude Opus 4.7 (1M context), 2026-05-09.
