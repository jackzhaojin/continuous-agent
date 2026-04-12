---
name: ui-validate
description: Uses a reusable Playwright test spec to validate the generated study environment UI end-to-end
---

# UI Validate

Run end-to-end validation of the generated study application using a reusable Playwright test spec.

## Inputs

- `{{TARGET_DIR}}` — Directory containing the React project to validate.
- `{{DEV_SERVER_URL}}` — URL where the dev server is running (e.g., `http://localhost:5173`).

## Process

1. **Copy test files from harness to target project.**
   ```bash
   mkdir -p {{TARGET_DIR}}/tests/e2e/test-results/screenshots
   cp {{HARNESS_ROOT}}/tests/e2e/playwright-validate.spec.js {{TARGET_DIR}}/tests/e2e/
   cp {{HARNESS_ROOT}}/tests/e2e/playwright.config.js {{TARGET_DIR}}/tests/e2e/
   ```

2. **Ensure Playwright is available.**
   ```bash
   cd {{TARGET_DIR}} && npx playwright --version 2>/dev/null || (npm install -D @playwright/test && npx playwright install chromium)
   ```

3. **Start the dev server if needed.**
   - Check if `{{DEV_SERVER_URL}}` is responding: `curl -s -o /dev/null -w "%{http_code}" {{DEV_SERVER_URL}}`
   - If not responding (non-200), start the dev server in the background:
     ```bash
     cd {{TARGET_DIR}} && npm run dev &
     DEV_PID=$!
     ```
   - Wait for the server to be ready (poll with curl, up to 15 seconds).

4. **Run the Playwright test spec.**
   ```bash
   cd {{TARGET_DIR}} && BASE_URL={{DEV_SERVER_URL}} npx playwright test --config tests/e2e/playwright.config.js 2>&1
   ```

5. **Collect results and screenshots.**
   - Copy screenshots to the evidence directory:
     ```bash
     mkdir -p {{TARGET_DIR}}/ai-docs/phases/VALIDATE/screenshots
     cp {{TARGET_DIR}}/tests/e2e/test-results/screenshots/*.png {{TARGET_DIR}}/ai-docs/phases/VALIDATE/screenshots/ 2>/dev/null || true
     ```

6. **Write the validation report.**
   - Parse the Playwright output for pass/fail per test.
   - Write a structured report (format below) to `{{TARGET_DIR}}/ai-docs/phases/VALIDATE/report.md`.

7. **Clean up.**
   - Kill the dev server if it was started by this skill: `kill $DEV_PID 2>/dev/null || true`

## Output

Write a validation report to `{{TARGET_DIR}}/ai-docs/phases/VALIDATE/report.md`:

```markdown
# UI Validation Report

**Validated:** [ISO 8601 timestamp]
**Target:** {{TARGET_DIR}}
**Dev Server:** {{DEV_SERVER_URL}}

## Summary

- **Total Checks:** 8
- **Passed:** [count]
- **Failed:** [count]
- **Overall:** PASS | FAIL

## Results

### Check 1: Home Page Renders with Topic Cards
- **Status:** PASS | FAIL
- **Details:** [description of what was found]
- **Screenshot:** screenshots/home.png

### Check 2: Navigation Between All Pages
- **Status:** PASS | FAIL
- **Details:** [description]

[... repeat for all 8 checks ...]

## Console Errors

[List any console errors found, or "No console errors detected."]

## Recommendations

[If any checks failed, provide specific recommendations for fixing the issues.]
```

## Guidelines

- Do not modify the application source code during validation. This skill only reads and tests.
- If the dev server fails to start, report that as a blocking failure and skip browser checks.
- Screenshots are captured automatically by the test spec for every page.
- Create the output directories if they do not exist.
- If a check is ambiguous (e.g., topic list is empty because no data is loaded), mark it as a conditional pass with a note.
- Kill any dev server processes that were started by this skill when validation is complete.
- The validation report must always be written, even if all checks fail.
