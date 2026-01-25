import { selectWork, getAllWorkItems } from '../../../dist/work-selector.js';

async function test() {
  console.log('=== Testing work-selector parser fixes ===\n');

  const allItems = await getAllWorkItems();
  console.log(`✓ Total work items parsed: ${allItems.length}`);
  console.log(`  Expected: 4 (Build Next.js, Notion Integration, Self-Enhance, POC)\n`);

  if (allItems.length !== 4) {
    console.error(`❌ FAIL: Expected 4 items, got ${allItems.length}`);
    process.exit(1);
  }

  allItems.forEach((item, i) => {
    console.log(`${i + 1}. ${item.title}`);
    console.log(`   Priority: ${item.priority}`);
    console.log(`   Status: ${item.status}`);
    console.log();
  });

  // Test status parsing
  const statusTests = [
    { title: 'Build Next.js Transactional App', expected: 'complete' },
    { title: 'Notion Integration POC', expected: 'pending' },
    { title: 'Self-Enhance Human Interface', expected: 'pending' },
    { title: 'POC New Capabilities', expected: 'pending' }
  ];

  let passed = 0;
  let failed = 0;

  statusTests.forEach(test => {
    const item = allItems.find(i => i.title === test.title);
    if (!item) {
      console.error(`❌ FAIL: Item "${test.title}" not found`);
      failed++;
      return;
    }

    if (item.status === test.expected) {
      console.log(`✓ ${test.title}: status="${item.status}" (correct)`);
      passed++;
    } else {
      console.error(`❌ ${test.title}: status="${item.status}", expected "${test.expected}"`);
      failed++;
    }
  });

  console.log(`\n=== Test Results ===`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);

  const selected = await selectWork();
  if (selected) {
    console.log(`\n✓ Selected work item: ${selected.title} (${selected.priority}, ${selected.status})`);
    if (selected.status === 'complete' || selected.status === 'blocked') {
      console.error(`❌ FAIL: Should not select ${selected.status} tasks`);
      process.exit(1);
    }
  } else {
    console.error(`\n❌ FAIL: No work selected (should select "Notion Integration POC")`);
    process.exit(1);
  }

  if (failed > 0) {
    process.exit(1);
  }

  console.log('\n✓ All tests passed!');
}

test().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
