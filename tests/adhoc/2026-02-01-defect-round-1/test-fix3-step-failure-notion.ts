/**
 * Ad-hoc test: Fix #3 — Step failure Notion reporting
 *
 * Structural test: Verifies that updateStepState()'s failure path
 * calls reportMilestone('Failed', ...) after writing STEP_ATTEMPT_FAILED.
 *
 * Run: npx tsx tests/adhoc/2026-02-01-defect-round-1/test-fix3-step-failure-notion.ts
 */

import { readFile } from 'fs/promises';
import path from 'path';

async function runTests() {
  const filePath = path.join(process.cwd(), 'src/deterministic/state-handler.ts');
  const content = await readFile(filePath, 'utf-8');

  // Find the updateStepState function
  const funcStart = content.indexOf('export async function updateStepState(');
  const funcEnd = content.indexOf('\nexport ', funcStart + 1);
  const funcBody = content.slice(funcStart, funcEnd > 0 ? funcEnd : undefined);

  // --- Test 1: STEP_ATTEMPT_FAILED event is logged ---
  const hasFailedEvent = funcBody.includes("event: 'STEP_ATTEMPT_FAILED'");
  console.log(`[Test 1] Has STEP_ATTEMPT_FAILED event: ${hasFailedEvent}`);
  console.assert(hasFailedEvent, 'FAIL: updateStepState should log STEP_ATTEMPT_FAILED');

  // --- Test 2: reportMilestone('Failed', ...) is called in the failure branch ---
  // The failure branch starts with `} else {` after the success branch
  const elseBranch = funcBody.slice(funcBody.indexOf('} else {'));
  const hasReportFailed = elseBranch.includes("reportMilestone('Failed'");
  console.log(`[Test 2] Has reportMilestone('Failed') in failure branch: ${hasReportFailed}`);
  console.assert(hasReportFailed, "FAIL: Failure branch should call reportMilestone('Failed', ...)");

  // --- Test 3: reportMilestone includes step details ---
  const hasStepTitle = elseBranch.includes('stepTitle:');
  const hasStepNumber = elseBranch.includes('stepNumber:');
  const hasErrorSummary = elseBranch.includes('errorSummary:');
  console.log(`[Test 3] Milestone includes step details: title=${hasStepTitle}, number=${hasStepNumber}, error=${hasErrorSummary}`);
  console.assert(hasStepTitle, 'FAIL: reportMilestone should include stepTitle');
  console.assert(hasStepNumber, 'FAIL: reportMilestone should include stepNumber');
  console.assert(hasErrorSummary, 'FAIL: reportMilestone should include errorSummary');

  // --- Test 4: reportMilestone is called AFTER the JSONL append ---
  const jsonlAppendIdx = elseBranch.indexOf('appendFile(ledgerPath');
  const reportMilestoneIdx = elseBranch.indexOf("reportMilestone('Failed'");
  console.log(`[Test 4] Order: JSONL append at ${jsonlAppendIdx}, reportMilestone at ${reportMilestoneIdx}`);
  console.assert(
    jsonlAppendIdx > 0 && reportMilestoneIdx > 0 && jsonlAppendIdx < reportMilestoneIdx,
    'FAIL: reportMilestone should come AFTER JSONL append'
  );

  // --- Test 5: The success branch has STEP_COMPLETED and 'Step Completed' milestone ---
  const successBranch = funcBody.slice(0, funcBody.indexOf('} else {'));
  const hasCompletedEvent = successBranch.includes("event: 'STEP_COMPLETED'");
  const hasCompletedMilestone = successBranch.includes("'Step Completed'");
  console.log(`[Test 5] Success branch: STEP_COMPLETED=${hasCompletedEvent}, Step Completed milestone=${hasCompletedMilestone}`);
  console.assert(hasCompletedEvent, 'FAIL: Success branch should have STEP_COMPLETED');
  console.assert(hasCompletedMilestone, 'FAIL: Success branch should have Step Completed milestone');

  console.log('\n--- All Fix #3 tests passed ---');
}

runTests().catch(err => {
  console.error('Test runner failed:', err);
  process.exit(1);
});
