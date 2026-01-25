# Calibration Project: EDS Hello

Prove the `deliver.eds.site` capability through end-to-end execution.

## Purpose

Before trusting the agent with EDS site work:
1. Validate EDS tooling is available
2. Surface blockers (aem-cli, GitHub auth)
3. Establish baseline confidence
4. Document any required fixes

## Prerequisites

### Check aem-cli
```bash
which aem || echo "aem-cli not found"
aem --version
```

If not found, this is a blocker. Document in needs-you.md.

### Check GitHub CLI
```bash
gh auth status
```

If not authenticated, document as blocker.

## Calibration Steps

### Step 1: Scaffold
```bash
cd ~/dev/agent-outputs/projects/calibration
mkdir calibration-eds-hello
cd calibration-eds-hello
```

Create minimal EDS structure:
- `head.html`
- `scripts/scripts.js`
- `styles/styles.css`
- Block structure (if templates available)

### Step 2: Add Content
Create simple test page:
- `index.html` or `index.md`
- One block demonstration

### Step 3: Preview (if aem available)
```bash
aem up
```

Or validate structure manually.

### Step 4: Document
Create README.md with:
- What this is
- How to run locally
- Structure explanation

### Step 5: Validate
Run applicable verifiers:
- git_status_clean
- files_exist (EDS required files)
- docs_checklist

### Step 6: Record Evidence
Log to capability-ledger.jsonl:
```json
{
  "event": "CALIBRATION_COMPLETE",
  "project": "calibration-eds-hello",
  "skill": "deliver.eds.site",
  "result": "PASS|FAIL|PARTIAL",
  "blockers": [...]
}
```

## Success Criteria

- [ ] EDS structure created correctly
- [ ] At least one page renders (or structure valid)
- [ ] README with instructions
- [ ] All files committed

## Known Blockers

### aem-cli Not Installed
- Resolution: Human installs aem-cli
- Add to needs-you.md

### GitHub Auth Missing
- Resolution: Human runs `gh auth login`
- Add to needs-you.md

### Template Not Available
- Resolution: Use minimal hand-built structure
- Document in calibration record

## Expected Outcome

After successful calibration:
- `eds.scaffold.basic` confidence adjusted
- `deliver.eds.site` maturity: Declared -> Demonstrated
- Known blockers documented for future reference
