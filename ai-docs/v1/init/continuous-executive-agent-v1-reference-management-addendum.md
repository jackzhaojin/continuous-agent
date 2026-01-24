# Continuous Executive Agent V1 — Reference Management Addendum

**Last Updated:** 2026-01-24  
**Status:** Design Extension to Main Specification  
**Applies To:** `continuous-executive-agent-v1-spec.md`, `continuous-executive-agent-v1-unified-addendum.md`

---

## Executive Summary

This addendum defines how the agent acquires, maintains, and uses external knowledge sources (documentation, example projects, tool repositories). The system uses a **three-mode approach** that balances access to current information against maintenance burden:

- **Mode A: Pinned Clone** — Read-only reference, minimal upkeep (default)
- **Mode B: Pinned Clone + Patches** — Small local fixes without fork overhead
- **Mode C: Fork** — Active dependency requiring ongoing maintenance (rare)

**Core principle:** Don't fork everything. Forking creates maintenance debt. Default to pinned clones; upgrade only when evidence justifies it.

**Single source of truth:** All reference metadata lives in `reference-registry.yaml`. No other manifests. Folders without registry entries are orphans.

---

## Part 1: The Problem

The agent needs external knowledge to build things effectively:

| Knowledge Type | Examples | Challenge |
|----------------|----------|-----------|
| Framework docs | Next.js, EDS, Azure | Large, changes frequently |
| Tool references | aem-cli, gh CLI | Version-specific behavior |
| Example projects | Starter templates, harnesses | May need local adaptation |
| Pattern libraries | Known-good implementations | Must stay searchable |

### Why Not Just Use Live Sources?

| Approach | Problem |
|----------|---------|
| Always fetch from GitHub | Network dependency, can change mid-task |
| Use Context7/web search only | Good for discovery, not for execution |
| Fork everything | Maintenance burden scales badly |
| Manual snapshots | Human bottleneck, drift |

### The Solution

A tiered system where the agent:
1. **Defaults to lightweight** (pinned clones)
2. **Adapts at runtime** (wrappers) when possible
3. **Patches only when necessary** (overlay approach)
4. **Forks only for true dependencies** (actively maintained)

---

## Part 2: Three-Mode Reference System

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     REFERENCE MANAGEMENT MODES                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   MODE A: Pinned Clone              MODE B: Clone + Patches             │
│   (70-80% of references)            (15-25% of references)              │
│   ┌─────────────────────┐           ┌─────────────────────┐             │
│   │ sources/nextjs-docs │           │ sources/aem-cli     │             │
│   │ ├── .git/           │           │ ├── .git/           │             │
│   │ └── docs/           │           │ └── (pristine)      │             │
│   │                     │           │                     │             │
│   │ • Read-only         │           │ patches/aem-cli/    │             │
│   │ • Pin to commit SHA │           │ ├── 001-fix.patch   │             │
│   │ • Refresh periodic  │           │ └── series          │             │
│   │ • No GitHub fork    │           │                     │             │
│   └─────────────────────┘           │ • Source stays clean│             │
│                                     │ • Patches reapplied │             │
│                                     │ • Easy to refresh   │             │
│                                     └─────────────────────┘             │
│                                                                         │
│   MODE C: Fork                                                          │
│   (< 5% of references)                                                  │
│   ┌─────────────────────┐                                               │
│   │ forks/my-template   │                                               │
│   │ ├── .git/           │  ← origin: your fork                          │
│   │ │                   │  ← upstream: original repo                    │
│   │ └── (your changes)  │                                               │
│   │                     │                                               │
│   │ • Full maintenance  │                                               │
│   │ • Merge upstream    │                                               │
│   │ • Can contribute PR │                                               │
│   │ • Multi-project use │                                               │
│   └─────────────────────┘                                               │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Mode Comparison

| Aspect | Mode A: Pinned Clone | Mode B: Clone + Patches | Mode C: Fork |
|--------|---------------------|------------------------|--------------|
| **Use case** | Read/search reference | Small local fixes | Active dependency |
| **GitHub fork?** | No | No | Yes |
| **Local changes?** | None | Patch files (overlay) | Commits |
| **Maintenance** | Minimal | Low | Higher |
| **Upstream tracking** | Fetch + compare | Fetch + reapply patches | Merge/rebase |
| **Default for** | 70-80% of refs | 15-25% of refs | < 5% of refs |

---

## Part 3: Directory Structure

```
workspace/references/
├── sources/                      # Mode A & B: Pinned clones
│   ├── nextjs-docs/              # Mode A (no patches)
│   │   ├── .git/
│   │   └── docs/
│   ├── aem-cli/                  # Mode B (has patches)
│   │   ├── .git/
│   │   └── bin/
│   └── vercel-ai-sdk/
│
├── patches/                      # Mode B: Overlay patches
│   ├── aem-cli/
│   │   ├── 001-arm-path-fix.patch
│   │   ├── 002-macos-shebang.patch
│   │   └── series                # Application order
│   └── vercel-ai-sdk/
│       └── 001-timeout-fix.patch
│
├── forks/                        # Mode C: Active dependencies
│   └── my-eds-template/
│       ├── .git/                 # origin=fork, upstream=original
│       └── ...
│
├── wrappers/                     # Runtime adaptation (preferred over patches)
│   ├── run-aem.sh
│   └── dev-setup.sh
│
└── reference-registry.yaml       # ← SINGLE SOURCE OF TRUTH
```

### Key Principle: Source Stays Pristine (Mode B)

In Mode B, the `sources/<repo>/` folder contains unmodified upstream code. Patches are stored separately and applied at runtime or after refresh. This makes upstream updates clean:

```bash
# Refresh workflow (agent autonomous)
cd sources/aem-cli
git fetch origin
git checkout <new-commit>        # Clean upstream
# Reapply patches
for patch in ../../patches/aem-cli/*.patch; do
  git apply "$patch"
done
```

---

## Part 4: Single Source of Truth

### Why One Registry?

Multiple manifest files will drift. The agent will eventually make decisions based on stale data.

| ❌ Don't | ✅ Do |
|----------|-------|
| `manifest.yaml` per folder | Single `reference-registry.yaml` |
| `patch-manifest.yaml` | Patches listed in registry |
| Separate metadata files | Everything in one place |

### Registry Schema

```yaml
# reference-registry.yaml — THE canonical source
version: "1.0"
last_verified: "2026-01-24T12:00:00Z"

references:
  # ─────────────────────────────────────────────────────────────
  # MODE A: Pinned Clone (read-only reference)
  # ─────────────────────────────────────────────────────────────
  - id: nextjs-docs
    mode: A
    
    # Location
    source_path: sources/nextjs-docs
    
    # Provenance
    upstream: https://github.com/vercel/next.js
    pinned_commit: a1b2c3d4e5f6
    sparse_checkout:
      - "docs/"
      - "examples/basic/"
    license: MIT
    
    # Lifecycle
    acquired_at: "2026-01-20T10:00:00Z"
    last_refresh: "2026-01-24T10:00:00Z"
    refresh_policy: weekly
    
    # Purpose
    purpose: "Next.js documentation for build tasks"
    skills_using:
      - nextjs.build.basic
      - nextjs.routing.app_router
    
    # Mode A has no patches or fork info
    patches: []
    wrappers: []

  # ─────────────────────────────────────────────────────────────
  # MODE B: Pinned Clone + Patches
  # ─────────────────────────────────────────────────────────────
  - id: aem-cli
    mode: B
    
    # Location
    source_path: sources/aem-cli
    
    # Provenance
    upstream: https://github.com/adobe/aem-cli
    pinned_commit: x1y2z3
    license: Apache-2.0
    
    # Lifecycle
    acquired_at: "2026-01-15T14:00:00Z"
    last_refresh: "2026-01-24T08:00:00Z"
    refresh_policy: weekly
    
    # Purpose
    purpose: "EDS CLI tooling"
    skills_using:
      - eds.scaffold.basic
      - eds.preview
    
    # Patches (what makes this Mode B)
    patches:
      - file: patches/aem-cli/001-arm-path-fix.patch
        reason: "Hardcoded x86_64 binary path doesn't work on ARM Mac"
        created_at: "2026-01-16T09:00:00Z"
        applied_to_commit: x1y2z3
        upstream_issue: "https://github.com/adobe/aem-cli/issues/123"
        status: open  # open | merged | wontfix
        
      - file: patches/aem-cli/002-macos-shebang.patch
        reason: "#!/bin/bash fails on systems where bash isn't at that path"
        created_at: "2026-01-16T09:15:00Z"
        applied_to_commit: x1y2z3
        upstream_issue: null
        status: open
    
    # Wrappers (runtime adaptation)
    wrappers:
      - file: wrappers/run-aem.sh
        purpose: "ARM/Intel binary path detection"

  # ─────────────────────────────────────────────────────────────
  # MODE C: Fork (active dependency)
  # ─────────────────────────────────────────────────────────────
  - id: my-eds-template
    mode: C
    
    # Location
    source_path: forks/my-eds-template
    
    # Fork details
    upstream: https://github.com/someone/eds-starter
    fork_url: https://github.com/jackzhaojin/my-eds-template
    local_branch: main
    upstream_branch: main
    license: MIT
    
    # Lifecycle
    acquired_at: "2026-01-10T00:00:00Z"
    last_upstream_merge: "2026-01-20T00:00:00Z"
    refresh_policy: monthly
    
    # Purpose
    purpose: "Base template for all EDS projects — custom blocks, CI, conventions"
    skills_using:
      - deliver.eds.site
    
    # Why forked (justification)
    fork_reason: |
      - Custom block library maintained across multiple projects
      - CI configuration specific to our deployment
      - Conventions that won't be accepted upstream
    
    # Divergence tracking
    divergence:
      commits_ahead: 12
      commits_behind: 3
      last_checked: "2026-01-24T10:00:00Z"
```

---

## Part 5: Decision Tree — Which Mode?

```yaml
# strategies/reference-intake-policy.yaml

decision_tree:
  # Step 1: Do we need it at all?
  - question: "Do I need to READ or SEARCH this repository?"
    no: "Don't acquire. Use web search for one-off lookups."
    yes: "Continue to Step 2"
    
  # Step 2: What kind of access?
  - question: "Do I need to make LOCAL CHANGES to make it work?"
    options:
      - answer: "No changes needed"
        action: "Mode A: Pinned clone in sources/"
        
      - answer: "Only environment/wrapper changes (paths, shell, config)"
        action: "Mode A + wrapper script. Keep source pristine."
        
      - answer: "Code changes needed, but small (1-2 patches)"
        action: "Mode B: Pinned clone + patches/"
        
      - answer: "Code changes needed, 3+ patches or ongoing"
        action: "Evaluate for Mode C (see Step 3)"
        
  # Step 3: Fork evaluation
  - question: "Should this be a fork (Mode C)?"
    fork_if_any_true:
      - "Will use in multiple projects as a base"
      - "Need CI/build changes specific to our stack"
      - "Expect ongoing feature development on top"
      - "Want to contribute improvements upstream"
      - "Patches exceed 3 or require frequent updates"
    otherwise: "Stay Mode B with patches"

# Defaults
defaults:
  new_reference: A  # Always start minimal
  auto_upgrade_threshold: "3+ patches"
  prefer_wrappers_over_patches: true
```

### Visual Decision Flow

```
                    Need external repo?
                           │
                           ▼
                    ┌──────────────┐
                    │ Just reading │──Yes──▶ Mode A: Pinned Clone
                    │   /search?   │
                    └──────────────┘
                           │ No (need changes)
                           ▼
                    ┌──────────────┐
                    │   Can fix    │──Yes──▶ Mode A + Wrapper
                    │  at runtime? │         (keep source clean)
                    └──────────────┘
                           │ No (need source changes)
                           ▼
                    ┌──────────────┐
                    │  < 3 small   │──Yes──▶ Mode B: Clone + Patches
                    │   patches?   │
                    └──────────────┘
                           │ No (significant changes)
                           ▼
                    ┌──────────────┐
                    │ Multi-project│
                    │  dependency  │──Yes──▶ Mode C: Fork
                    │  or ongoing? │
                    └──────────────┘
                           │ No
                           ▼
                    Reconsider: Maybe don't need it?
                    Or: Accept Mode B maintenance
```

---

## Part 6: Agent Autonomy

### What Agent Can Do Autonomously

| Action | Mode | Autonomous? | Notes |
|--------|------|-------------|-------|
| Clone new repo to sources/ | A | ✅ Yes | Read-only, no commitment |
| Pin to specific commit | A, B | ✅ Yes | Reproducibility |
| Sparse checkout setup | A, B | ✅ Yes | Reduce disk usage |
| Create wrapper script | All | ✅ Yes | Non-invasive adaptation |
| Fetch from upstream | All | ✅ Yes | Information gathering |
| Create patch file | B | ✅ Yes | Isolated, reversible |
| Apply patches after refresh | B | ✅ Yes | Deterministic |
| Upgrade Mode A → B | — | ✅ Yes | First patch triggers |
| Upgrade Mode B → C | — | ✅ Yes | When threshold met |
| Create GitHub fork | C | ✅ Yes | Agent decided it's needed |
| Clone fork locally | C | ✅ Yes | After fork created |
| Commit to fork | C | ✅ Yes | Local development |
| Push to fork | C | ✅ Yes | Your fork, not upstream |
| Merge upstream into fork | C | ✅ Yes | Maintenance |
| Register in reference-registry | All | ✅ Yes | Required for all refs |
| Run integrity verifier | All | ✅ Yes | Continuous validation |

### What Requires Human Approval

| Action | Why | Queue Location |
|--------|-----|----------------|
| **Delete any reference** | Irreversible knowledge loss | needs-you.md |
| **Archive/deprecate reference** | Policy decision | needs-you.md |
| **Create PR to upstream** | External visibility | needs-you.md |
| **Accept PR from upstream** | Bringing external changes in | needs-you.md |

---

## Part 7: Workflows

### 7.1 Acquire New Reference (Mode A)

```
TRIGGER: Agent needs documentation/examples not currently available

1. Check if already in registry
   └── If exists: use existing, skip acquisition

2. Determine minimum needed
   ├── Full repo or sparse checkout?
   ├── Which directories/files?
   └── Document in registry entry

3. Clone with sparse checkout (if applicable)
   $ git clone --filter=blob:none --sparse <upstream>
   $ git sparse-checkout set <paths>

4. Pin to current commit
   $ git rev-parse HEAD  # Record this

5. Register in reference-registry.yaml
   ├── Set mode: A
   ├── Record provenance (upstream, commit, license)
   ├── Document purpose and skills_using
   └── Set refresh_policy

6. Run reference_integrity verifier
   └── Confirm folder ↔ registry match

7. Log to capability-ledger.jsonl
   {"event": "REFERENCE_ACQUIRED", "id": "...", "mode": "A", ...}
```

### 7.2 Create Patch (Upgrade A → B)

```
TRIGGER: Source needs modification to work in our environment

1. Verify wrapper can't solve it
   └── Prefer runtime adaptation over source changes

2. Make change in sources/<repo>/
   $ cd sources/aem-cli
   $ # make minimal fix

3. Create patch file
   $ git diff > ../../patches/aem-cli/001-description.patch
   
4. Restore pristine source
   $ git checkout .

5. Update registry
   ├── Change mode: A → B
   ├── Add patch entry with:
   │   ├── file path
   │   ├── reason (why needed)
   │   ├── applied_to_commit
   │   └── upstream_issue (if filed)
   └── Save

6. Create/update series file
   $ echo "001-description.patch" >> patches/aem-cli/series

7. Apply patch (verify it works)
   $ cd sources/aem-cli
   $ git apply ../../patches/aem-cli/001-description.patch

8. Run reference_integrity verifier

9. Log to capability-ledger.jsonl
   {"event": "PATCH_CREATED", "reference_id": "aem-cli", ...}
   {"event": "MODE_UPGRADED", "from": "A", "to": "B", ...}
```

### 7.3 Refresh Reference

```
TRIGGER: Periodic (weekly) or manual request

FOR EACH reference in registry:

1. Fetch upstream
   $ git fetch origin

2. Compare pinned vs upstream
   $ git rev-list --count <pinned>..<upstream/main>
   
3. Evaluate changes
   ├── If 0 commits: nothing to do
   ├── If minor commits: auto-refresh (Mode A, B)
   ├── If major version change: log for review, continue with old pin
   └── If breaking changes detected: queue in needs-you.md

4. FOR Mode A (pinned clone):
   $ git checkout <new-commit>
   # Update registry: pinned_commit, last_refresh

5. FOR Mode B (clone + patches):
   $ git checkout <new-commit>  # Clean upstream first
   $ for patch in patches/<id>/*.patch; do
       git apply "$patch" || echo "CONFLICT: $patch"
     done
   # If conflict: keep old pin, log failure, queue investigation
   # If success: update registry

6. FOR Mode C (fork):
   $ git fetch upstream
   $ git merge upstream/main  # or rebase
   # Resolve conflicts if any
   # Update registry: last_upstream_merge, divergence

7. Run reference_integrity verifier

8. Log refresh result
   {"event": "REFERENCE_REFRESHED", "id": "...", "old_commit": "...", ...}
```

### 7.4 Upgrade to Fork (B → C)

```
TRIGGER: 
  - 3+ patches accumulated, OR
  - Multi-project dependency identified, OR
  - Need CI/build customization, OR
  - Want to contribute upstream

1. Create GitHub fork
   $ gh repo fork <upstream> --clone=false

2. Clone fork locally
   $ git clone <fork-url> forks/<id>
   $ cd forks/<id>
   $ git remote add upstream <original-url>

3. Apply existing patches as commits
   $ for patch in ../../patches/<id>/*.patch; do
       git apply "$patch"
       git commit -m "Local: $(basename $patch .patch)"
     done

4. Update registry
   ├── Change mode: B → C
   ├── Add fork_url
   ├── Add fork_reason
   ├── Keep patches list (for history)
   └── Set local_branch, upstream_branch

5. Archive patches (keep for reference)
   $ mv patches/<id> patches/_archived/<id>

6. Remove from sources/ (now in forks/)
   $ rm -rf sources/<id>

7. Run reference_integrity verifier

8. Log upgrade
   {"event": "MODE_UPGRADED", "from": "B", "to": "C", ...}
   {"event": "FORK_CREATED", "fork_url": "...", ...}
```

---

## Part 8: Integrity Verifier

### Purpose

Ensure registry and filesystem never disagree. Run after every reference operation and periodically.

### Verifier Definition

```yaml
# verifiers/definitions/reference-integrity.yaml
verifier_id: reference_integrity
version: "1.0"
description: "Registry ↔ filesystem consistency check"

checks:
  - name: no_orphan_sources
    description: "Every folder in sources/ must have registry entry"
    script: |
      orphans=""
      for dir in workspace/references/sources/*/; do
        [ -d "$dir" ] || continue
        id=$(basename "$dir")
        if ! grep -q "id: $id" workspace/references/reference-registry.yaml; then
          orphans="$orphans $id"
        fi
      done
      [ -z "$orphans" ] && echo "PASS" || echo "FAIL: orphans:$orphans"
    success_criteria:
      - output_contains: "PASS"

  - name: no_orphan_patches
    description: "Every folder in patches/ must have Mode B registry entry"
    script: |
      orphans=""
      for dir in workspace/references/patches/*/; do
        [ -d "$dir" ] || continue
        id=$(basename "$dir")
        # Must exist AND be Mode B
        if ! grep -A5 "id: $id" workspace/references/reference-registry.yaml | grep -q "mode: B"; then
          orphans="$orphans $id"
        fi
      done
      [ -z "$orphans" ] && echo "PASS" || echo "FAIL: orphans:$orphans"
    success_criteria:
      - output_contains: "PASS"

  - name: no_orphan_forks
    description: "Every folder in forks/ must have Mode C registry entry"
    script: |
      orphans=""
      for dir in workspace/references/forks/*/; do
        [ -d "$dir" ] || continue
        id=$(basename "$dir")
        if ! grep -A5 "id: $id" workspace/references/reference-registry.yaml | grep -q "mode: C"; then
          orphans="$orphans $id"
        fi
      done
      [ -z "$orphans" ] && echo "PASS" || echo "FAIL: orphans:$orphans"
    success_criteria:
      - output_contains: "PASS"

  - name: no_missing_folders
    description: "Every registry entry must have corresponding folder"
    script: |
      missing=""
      # Parse registry, check each source_path exists
      # (Implementation depends on YAML parser available)
    success_criteria:
      - output_contains: "PASS"

  - name: patches_match_registry
    description: "Patch files listed in registry must exist"
    script: |
      missing=""
      # For each patch entry, verify file exists
    success_criteria:
      - output_contains: "PASS"

run_triggers:
  - after_any_reference_operation
  - periodic_daily
  - on_agent_startup
```

### On Failure

```yaml
integrity_failure_response:
  orphan_folder:
    action: "Queue cleanup decision in needs-you.md"
    severity: warning
    block_operations: false
    
  missing_folder:
    action: "Attempt recovery (re-clone if upstream known)"
    severity: error
    block_operations: true
    fallback: "Queue in needs-you.md if recovery fails"
    
  patch_file_missing:
    action: "Downgrade to Mode A, log patch loss"
    severity: error
    block_operations: false
```

---

## Part 9: Wrappers — Preferred Over Patches

### When to Use Wrappers

Wrappers adapt at **runtime** without modifying source. Prefer them for:

- Path differences (ARM vs Intel, macOS vs Linux)
- Environment variable setup
- Version selection
- Default argument injection

### Example Wrapper

```bash
#!/usr/bin/env bash
# wrappers/run-aem.sh
# Runtime adaptation for aem-cli

set -euo pipefail

# Detect architecture
case "$(uname -m)" in
  arm64|aarch64)
    export AEM_BINARY_PATH="/opt/homebrew/bin"
    ;;
  x86_64)
    export AEM_BINARY_PATH="/usr/local/bin"
    ;;
  *)
    echo "Unknown architecture: $(uname -m)" >&2
    exit 1
    ;;
esac

# Detect OS
case "$(uname -s)" in
  Darwin)
    export AEM_CONFIG_PATH="$HOME/Library/Application Support/aem"
    ;;
  Linux)
    export AEM_CONFIG_PATH="$HOME/.config/aem"
    ;;
esac

# Ensure path exists
mkdir -p "$AEM_CONFIG_PATH"

# Add to PATH
export PATH="$AEM_BINARY_PATH:$PATH"

# Execute actual tool
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "$SCRIPT_DIR/../sources/aem-cli/bin/aem" "$@"
```

### Registering Wrappers

```yaml
# In reference-registry.yaml
- id: aem-cli
  mode: A  # Can stay Mode A if wrapper handles everything!
  wrappers:
    - file: wrappers/run-aem.sh
      purpose: "Architecture and OS detection"
      replaces_patches: true  # Indicates we avoided Mode B
```

---

## Part 10: Integration with Skills Framework

### Context Rules

```yaml
# strategies/context-rules.yaml
task_context:
  - task_type: nextjs.build.*
    include_refs:
      - reference_id: nextjs-docs
        paths:
          - docs/app/building-your-application/
          - docs/app/api-reference/
        max_tokens: 5000
        
  - task_type: eds.*
    include_refs:
      - reference_id: aem-cli
        paths:
          - README.md
          - docs/
        max_tokens: 3000
      - reference_id: my-eds-template
        paths:
          - blocks/
          - README.md
        max_tokens: 4000
```

### Skill Dependencies

```yaml
# In skills/technical-skills.yml
- id: eds.scaffold.basic
  prerequisites:
    - tool: aem-cli
      reference_id: aem-cli  # Links to reference-registry
      min_version: "1.0.0"
    - reference: my-eds-template
      reference_id: my-eds-template
      required_for: "Block library"
```

---

## Part 11: Ledger Events

```jsonl
{"event": "REFERENCE_ACQUIRED", "ts": "2026-01-24T10:00:00Z", "id": "nextjs-docs", "mode": "A", "upstream": "https://github.com/vercel/next.js", "pinned_commit": "abc123", "sparse_checkout": ["docs/"]}

{"event": "REFERENCE_REFRESHED", "ts": "2026-01-24T12:00:00Z", "id": "nextjs-docs", "old_commit": "abc123", "new_commit": "def456", "commits_pulled": 15}

{"event": "PATCH_CREATED", "ts": "2026-01-24T14:00:00Z", "reference_id": "aem-cli", "patch_file": "patches/aem-cli/001-arm-fix.patch", "reason": "ARM binary path", "task_id": "task-2026-01-24-003"}

{"event": "MODE_UPGRADED", "ts": "2026-01-24T14:00:00Z", "reference_id": "aem-cli", "from_mode": "A", "to_mode": "B", "reason": "First patch created"}

{"event": "FORK_CREATED", "ts": "2026-01-25T10:00:00Z", "reference_id": "my-template", "fork_url": "https://github.com/jackzhaojin/my-template", "reason": "Multi-project dependency"}

{"event": "INTEGRITY_CHECK", "ts": "2026-01-25T12:00:00Z", "result": "PASS", "checks_run": 5, "orphans": 0, "missing": 0}

{"event": "INTEGRITY_CHECK", "ts": "2026-01-26T12:00:00Z", "result": "FAIL", "checks_run": 5, "orphans": ["old-experiment"], "missing": 0, "action": "Queued cleanup in needs-you.md"}
```

---

## Part 12: Maintenance Schedule

```yaml
# Agent periodic tasks
reference_maintenance:
  daily:
    - Run reference_integrity verifier
    - Log any drift detected
    
  weekly:
    - Fetch upstream for all references
    - Compare pinned vs upstream HEAD
    - If > 50 commits behind: log in progress.md
    - If major version change: queue review in needs-you.md
    - Refresh Mode A references (auto)
    - Attempt patch reapply for Mode B (auto, queue conflicts)
    
  monthly:
    - Review Mode C forks for upstream merge
    - Check for references unused > 60 days
    - Suggest archival for unused references
```

---

## Part 13: Design Principles

1. **Single source of truth** — `reference-registry.yaml` is canonical; no other manifests
2. **Default minimal** — Start with Mode A; upgrade only when evidence requires
3. **Prefer wrappers over patches** — Runtime adaptation keeps source clean
4. **Patches are overlay, not modification** — Source folder stays pristine in Mode B
5. **Fork is commitment** — Only fork what you'll actively maintain
6. **No orphans** — Every folder must have registry entry; verifier enforces
7. **Reproducibility** — Pin to commits, not branches; record all provenance
8. **Full autonomy for acquisition** — Agent can clone, patch, fork without approval
9. **Deletion requires approval** — Irreversible knowledge loss needs human decision
10. **Evidence in ledger** — All reference operations logged for analysis

---

## Appendix A: Quick Reference

### Mode Selection Cheat Sheet

| Situation | Mode | Why |
|-----------|------|-----|
| "Just need to read the docs" | A | Minimal overhead |
| "Works but paths are wrong" | A + wrapper | Runtime fix, source clean |
| "One small code fix needed" | B | Patch overlay |
| "Multiple fixes, reapply on refresh" | B | Patches manageable |
| "Building all my projects on this" | C | True dependency |
| "Want to contribute upstream" | C | Need PR capability |

### Agent Commands

```bash
# Acquire new reference (agent autonomous)
agent acquire-ref --upstream <url> --sparse <paths> --purpose "..."

# Refresh all references
agent refresh-refs

# Check integrity
agent verify-refs

# Create patch
agent create-patch --ref <id> --reason "..."

# Upgrade to fork
agent upgrade-to-fork --ref <id> --reason "..."
```

### Approval Queue Items

```markdown
# needs-you.md

## Reference Management

### Delete Request: old-experiment
- **Reference ID:** old-experiment
- **Last used:** 2026-01-01 (24 days ago)
- **Reason:** Orphan detected by integrity verifier
- **Action needed:** Approve deletion or provide new purpose
- **Command if approved:** `agent delete-ref --id old-experiment`

### Breaking Change Detected: nextjs-docs
- **Reference ID:** nextjs-docs
- **Current pin:** abc123 (Next.js 15.0)
- **Upstream HEAD:** xyz789 (Next.js 16.0)
- **Change type:** Major version
- **Action needed:** Review breaking changes, approve refresh
- **Changelog:** https://github.com/vercel/next.js/releases/tag/v16.0.0
```

---

**End of Reference Management Addendum**
