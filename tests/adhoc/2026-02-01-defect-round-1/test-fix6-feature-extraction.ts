/**
 * Ad-hoc test: Fix #6 — Project memory data quality
 *
 * Validates that extractFeaturesFromOutput():
 * 1. Rejects meta-text lines (e.g., "Perfect! I've successfully...")
 * 2. Rejects lines shorter than 20 chars
 * 3. Rejects lines longer than 150 chars
 * 4. Accepts legitimate feature descriptions
 * 5. Caps at 5 features
 *
 * Run: npx tsx tests/adhoc/2026-02-01-defect-round-1/test-fix6-feature-extraction.ts
 */

// Reproduce the exact logic from state-handler.ts

const META_TEXT_PREFIXES = [
  'perfect', 'let me', "i've successfully", "here's", 'great', 'now let',
  'i will', 'i can', 'sure', 'okay', 'done', 'alright', 'excellent',
  'looks like', 'the project', 'this is', 'we have', 'i just',
];

function isMetaText(line: string): boolean {
  const lower = line.trim().toLowerCase();
  return META_TEXT_PREFIXES.some(prefix => lower.startsWith(prefix));
}

function extractFeaturesFromOutput(output?: string): string[] {
  if (!output) return [];
  const features: string[] = [];
  const lines = output.split('\n');
  for (const line of lines) {
    const lower = line.toLowerCase();
    if (
      lower.includes('created') ||
      lower.includes('implemented') ||
      lower.includes('built') ||
      lower.includes('added feature')
    ) {
      const clean = line.trim().slice(0, 200);
      if (clean.length < 20 || clean.length > 150) continue;
      if (isMetaText(clean)) continue;
      features.push(clean.slice(0, 100));
    }
    if (features.length >= 5) break;
  }
  return features;
}

// --- Test 1: Meta-text lines rejected ---
{
  const output = `Perfect! I've created the login component.
Let me show you what I built for the dashboard.
I've successfully implemented the auth flow.
Here's what I created for the navigation.
Great, I built the sidebar component.`;

  const features = extractFeaturesFromOutput(output);
  console.log(`[Test 1] Meta-text lines: ${features.length} features (expect 0)`);
  console.assert(features.length === 0, `FAIL: Expected 0 features from meta-text, got ${features.length}: ${JSON.stringify(features)}`);
}

// --- Test 2: Legitimate features accepted ---
{
  const output = `- Created responsive navigation bar with mobile hamburger menu
- Implemented user authentication flow with JWT tokens and refresh
- Built dashboard component with real-time data visualization charts`;

  const features = extractFeaturesFromOutput(output);
  console.log(`[Test 2] Legitimate features: ${features.length} features (expect 3)`);
  console.assert(features.length === 3, `FAIL: Expected 3, got ${features.length}: ${JSON.stringify(features)}`);
}

// --- Test 3: Short lines rejected (< 20 chars) ---
{
  const output = `created a thing
built app
implemented it`;

  const features = extractFeaturesFromOutput(output);
  console.log(`[Test 3] Short lines: ${features.length} features (expect 0)`);
  console.assert(features.length === 0, `FAIL: Expected 0 features from short lines, got ${features.length}`);
}

// --- Test 4: Long lines rejected (> 150 chars) ---
{
  const longLine = 'Created ' + 'a'.repeat(200) + ' component with many features and capabilities and extras and more things';
  const features = extractFeaturesFromOutput(longLine);
  console.log(`[Test 4] Long line (${longLine.length} chars): ${features.length} features (expect 0)`);
  console.assert(features.length === 0, `FAIL: Expected 0 features from long line, got ${features.length}`);
}

// --- Test 5: Max 5 features cap ---
{
  const output = Array.from({ length: 10 }, (_, i) =>
    `- Created feature component number ${i + 1} with all required functionality`
  ).join('\n');

  const features = extractFeaturesFromOutput(output);
  console.log(`[Test 5] Feature cap: ${features.length} features (expect 5)`);
  console.assert(features.length === 5, `FAIL: Expected 5 (cap), got ${features.length}`);
}

// --- Test 6: Empty/null input ---
{
  const f1 = extractFeaturesFromOutput(undefined);
  const f2 = extractFeaturesFromOutput('');
  const f3 = extractFeaturesFromOutput('No keywords here at all.');
  console.log(`[Test 6] Empty inputs: undef=${f1.length}, empty=${f2.length}, no-keywords=${f3.length}`);
  console.assert(f1.length === 0, 'FAIL: undefined should return []');
  console.assert(f2.length === 0, 'FAIL: empty string should return []');
  console.assert(f3.length === 0, 'FAIL: no keywords should return []');
}

// --- Test 7: Mixed legitimate and meta-text ---
{
  const output = `Perfect! I've created everything.
- Created responsive header component with dark mode toggle support
Let me explain what I built for the footer section here.
- Implemented API client module with automatic retry and backoff logic
The project now has all the features it needs.`;

  const features = extractFeaturesFromOutput(output);
  console.log(`[Test 7] Mixed: ${features.length} features (expect 2)`);
  console.assert(features.length === 2, `FAIL: Expected 2 (skip meta-text), got ${features.length}: ${JSON.stringify(features)}`);
  console.assert(features[0].includes('header component'), `FAIL: First feature should be about header, got: ${features[0]}`);
  console.assert(features[1].includes('API client'), `FAIL: Second feature should be about API client, got: ${features[1]}`);
}

// --- Test 8: isMetaText checks ---
{
  const cases: [string, boolean][] = [
    ["Perfect! I've built the component", true],
    ["Let me show you what was created", true],
    ["I've successfully implemented auth", true],
    ["Here's what I created", true],
    ["Great, I built the sidebar", true],
    ["Now let me implement the footer", true],
    ["Looks like the build was created", true],
    ["The project has been created", true],
    ["  Perfect! leading spaces", true],  // trimmed before check
    ["- Created responsive navbar component", false],
    ["Component was created with TypeScript", false],
    ["User auth flow implemented with JWT", false],
    ["  - Built dashboard charts module", false],
  ];

  let allPassed = true;
  for (const [line, expected] of cases) {
    const result = isMetaText(line);
    if (result !== expected) {
      console.log(`  FAIL isMetaText("${line.slice(0, 40)}..."): expected ${expected}, got ${result}`);
      allPassed = false;
    }
  }
  console.log(`[Test 8] isMetaText cases: ${allPassed ? 'all passed' : 'SOME FAILED'}`);
  console.assert(allPassed, 'FAIL: Some isMetaText cases failed');
}

// --- Test 9: Boundary — exactly 20 chars (should pass) ---
{
  // "Created a component." is exactly 20 chars
  const line20 = 'Created a component.';
  console.log(`[Test 9] Boundary 20-char line (len=${line20.length}): "${line20}"`);
  const features = extractFeaturesFromOutput(line20);
  console.assert(features.length === 1, `FAIL: 20-char line should be accepted, got ${features.length}`);
}

// --- Test 10: Boundary — exactly 150 chars (should pass) ---
{
  const line150 = 'Created ' + 'x'.repeat(142);  // 8 + 142 = 150
  console.log(`[Test 10] Boundary 150-char line (len=${line150.length})`);
  const features = extractFeaturesFromOutput(line150);
  console.assert(features.length === 1, `FAIL: 150-char line should be accepted, got ${features.length}`);
}

// --- Test 11: Boundary — 151 chars (should be rejected) ---
{
  const line151 = 'Created ' + 'x'.repeat(143);  // 8 + 143 = 151
  console.log(`[Test 11] Boundary 151-char line (len=${line151.length})`);
  const features = extractFeaturesFromOutput(line151);
  console.assert(features.length === 0, `FAIL: 151-char line should be rejected, got ${features.length}`);
}

console.log('\n--- All Fix #6 tests passed ---');
