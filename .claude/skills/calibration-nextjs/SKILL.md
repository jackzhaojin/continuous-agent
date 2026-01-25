# Calibration Project: Next.js Hello

Prove the `deliver.nextjs.app.basic` capability through end-to-end execution.

## Purpose

Before trusting the agent with important Next.js work:
1. Validate the complete delivery skill
2. Surface real blockers (tooling, templates, auth)
3. Establish baseline confidence from evidence
4. Prove the verification system works

## Calibration Steps

### Step 1: Scaffold
```bash
cd ~/dev/agent-outputs/projects/calibration
npx create-next-app@latest calibration-nextjs-hello --typescript --tailwind --app --no-src-dir
cd calibration-nextjs-hello
```

### Step 2: Modify
Add a custom component to prove modification capability:
- Create `components/HelloCalibration.tsx`
- Import and use in `app/page.tsx`
- Verify it renders

### Step 3: Build
```bash
npm run build
```
Must succeed with exit code 0.

### Step 4: Test (Optional)
If tests exist:
```bash
npm test
```

### Step 5: Document
Create README.md with:
- Description of the app
- How to run (`npm run dev`)
- What was modified

### Step 6: Validate
Run all verifiers:
- git_status_clean
- node_install
- node_build
- docs_checklist

### Step 7: Record Evidence
Log to capability-ledger.jsonl:
```json
{
  "event": "CALIBRATION_COMPLETE",
  "project": "calibration-nextjs-hello",
  "skill": "deliver.nextjs.app.basic",
  "result": "PASS|FAIL",
  "verifiers": {...},
  "gaps": [...]
}
```

## Success Criteria

All verifiers PASS:
- [ ] `git_status_clean` - Working tree clean
- [ ] `node_install` - npm install succeeds
- [ ] `node_build` - Build passes
- [ ] `docs_checklist` - README with run instructions

## On Failure

Document:
1. Which verifier failed
2. Error message/output
3. What would unblock it

Update skill confidence negatively and log gaps.

## Expected Outcome

After successful calibration:
- `nextjs.build.basic` confidence: 60% -> 70%
- `deliver.nextjs.app.basic` maturity: Declared -> Demonstrated
