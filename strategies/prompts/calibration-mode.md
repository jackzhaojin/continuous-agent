# Calibration Mode Prompt

You are in **calibration mode** - building a reference project for skill verification.

## Calibration Project
- **Project Type**: {{project_type}}
- **Target Skills**: {{target_skills}}
- **Location**: {{calibration_location}}

## Purpose

Calibration projects serve as:
1. **Ground truth** for verifier testing
2. **Baseline** for skill assessment
3. **Reference** for future implementations

## Calibration Requirements

### Project Must Be:
- Fully functional (builds, runs, tests pass)
- Well-documented
- Representative of real-world usage
- Clean and minimal (no unnecessary code)

### Project Must Have:
- Complete README.md with run instructions
- All required configuration files
- Working build script
- Passing tests (if applicable)
- Clean git history

## Calibration Workflow

### Phase 1: Scaffold
1. Create project in calibration location
2. Use standard tooling (create-next-app, npm init, etc.)
3. Verify initial setup works

### Phase 2: Implement
1. Add minimal required functionality
2. Follow standard patterns
3. Keep code clean and documented

### Phase 3: Verify
1. Run all relevant verifiers
2. ALL verifiers must PASS
3. Document any edge cases

### Phase 4: Seal
1. Commit final state
2. Tag version
3. Register in calibration manifest
4. Do NOT modify after sealing

## Calibration Project Types

### nextjs-basic
Skills tested: nextjs.build.basic, node.npm.install, node.npm.run_script
Requirements:
- Next.js 14+ with App Router
- At least 2 pages
- Working build
- Basic styling

### eds-basic
Skills tested: eds.setup.local, eds.pages.create
Requirements:
- EDS boilerplate setup
- Local development working
- At least one custom block

### node-api
Skills tested: node.npm.install, node.npm.run_script, node.npm.test
Requirements:
- Express or similar API
- At least 2 endpoints
- Working tests

## Expected Output

After calibration:

```
CALIBRATION COMPLETE
====================
Project: {{project_type}}
Location: {{calibration_location}}

Verifier Results:
- git_status_clean: PASS
- node_install: PASS
- node_build: PASS
- node_test: PASS
- docs_checklist: PASS

Skills Calibrated:
- [skill_id]: confidence now 80%
- [skill_id]: maturity now Demonstrated

Manifest Updated: Yes
Git Tag: calibration-{{project_type}}-v1
```

## Calibration vs Practice

| Aspect | Calibration | Practice |
|--------|-------------|----------|
| Purpose | Create reference | Build skill |
| Permanence | Permanent | Can be discarded |
| Quality | Production-grade | Good enough |
| Verification | Must 100% pass | Learning from fails OK |

## Anti-Patterns

DO NOT:
- Shortcut quality for speed
- Leave incomplete projects
- Modify sealed calibration projects
- Use calibration location for experiments
- Forget to register in manifest
