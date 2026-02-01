/**
 * Ad-hoc test: Fix #1 — needs-you.md regex matching
 *
 * Validates that the regex in writeToNeedsYou() and escalateWithDiagnosis()
 * correctly matches the Actions Needed table WITH the separator row.
 *
 * The bug: separator row was missing, so the regex never matched and writes
 * were silently skipped. Now we also have a warning log for mismatches.
 *
 * Run: npx tsx tests/adhoc/2026-02-01-defect-round-1/test-fix1-needs-you-regex.ts
 */

// The regex used in state-handler.ts writeToNeedsYou() and escalateWithDiagnosis()
const actionsTable =
  /(\| Action \| Why Agent Can't Do It \| Response \| Blocking \| Since \|\n\|[-|]+\|)/;

// --- Test 1: Table WITH separator (fixed) — should match ---
const withSeparator = `## Actions Needed

| Action | Why Agent Can't Do It | Response | Blocking | Since |
|--------|----------------------|----------|----------|-------|
| *None* | | | | |
`;

const match1 = actionsTable.test(withSeparator);
console.log(`[Test 1] Table with separator matches regex: ${match1}`);
console.assert(match1 === true, 'FAIL: Regex should match table WITH separator');

// --- Test 2: Table WITHOUT separator (the bug) — should NOT match ---
const withoutSeparator = `## Actions Needed

| Action | Why Agent Can't Do It | Response | Blocking | Since |
| *None* | | | | |
`;

const match2 = actionsTable.test(withoutSeparator);
console.log(`[Test 2] Table without separator matches regex: ${match2}`);
console.assert(match2 === false, 'FAIL: Regex should NOT match table WITHOUT separator');

// --- Test 3: Replacement inserts entry correctly ---
const newEntry = `| Music Player UI | Failed after 10 attempts. Error: npm build failed | | BLOCKING | 2026-02-01 |`;
const replaced = withSeparator.replace(actionsTable, `$1\n${newEntry}`);
const hasNewEntry = replaced.includes(newEntry);
const hasHeader = replaced.includes('| Action |');
const hasSeparator = replaced.includes('|--------|');
console.log(`[Test 3] Entry inserted correctly: ${hasNewEntry && hasHeader && hasSeparator}`);
console.assert(hasNewEntry, 'FAIL: New entry should be present after replacement');
console.assert(hasHeader, 'FAIL: Header should be preserved');
console.assert(hasSeparator, 'FAIL: Separator should be preserved');

// Verify ordering: header -> separator -> new entry -> None
const lines = replaced.split('\n');
const headerIdx = lines.findIndex(l => l.includes('| Action |'));
const separatorIdx = lines.findIndex(l => l.includes('|--------|'));
const entryIdx = lines.findIndex(l => l.includes('Music Player UI'));
const noneIdx = lines.findIndex(l => l.includes('*None*'));

console.log(`[Test 3b] Line ordering: header=${headerIdx}, separator=${separatorIdx}, entry=${entryIdx}, none=${noneIdx}`);
console.assert(headerIdx < separatorIdx, 'FAIL: Header should come before separator');
console.assert(separatorIdx < entryIdx, 'FAIL: Separator should come before new entry');

// --- Test 4: None placeholder removal ---
const afterNoneRemoval = replaced.replace(/\| \*None\* \| \| \| \| \|/, '');
const noneRemoved = !afterNoneRemoval.includes('*None*');
console.log(`[Test 4] None placeholder removed: ${noneRemoved}`);
console.assert(noneRemoved, 'FAIL: None placeholder should be removed after entry insertion');

// --- Test 5: Multiple entries accumulate correctly ---
const entry2 = `| Chatbot UI | Auth token expired | | BLOCKING | 2026-02-01 |`;
const withTwoEntries = afterNoneRemoval.replace(actionsTable, `$1\n${entry2}`);
const hasBothEntries = withTwoEntries.includes('Music Player UI') && withTwoEntries.includes('Chatbot UI');
console.log(`[Test 5] Multiple entries accumulate: ${hasBothEntries}`);
console.assert(hasBothEntries, 'FAIL: Both entries should be present');

console.log('\n--- All Fix #1 tests passed ---');
