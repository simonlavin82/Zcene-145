const validateAlbumArtist = (targetArtist, retrievedAlbumArtist) => {
  try {
    const target = (targetArtist || "").toLowerCase().trim();
    const retrieved = (retrievedAlbumArtist || "").toLowerCase().trim();
    
    if (!target || !retrieved) return false;
    
    // Strict exact match or inclusion
    if (retrieved === target || retrieved.includes(target) || target.includes(retrieved)) {
        return true;
    }
    return false;
  } catch (err) {
    console.error("Caught synchronous exception in album artist match:", err.message);
    return false;
  }
};

const testCases = [
  { target: "Drug Church", retrieved: "Drug Church", expected: true, desc: "Exact match (Pass)" },
  { target: "Drug Church", retrieved: "Drug Church & Friends", expected: true, desc: "Inclusion match (Pass)" },
  { target: "One Step Closer", retrieved: "Some Other Band", expected: false, desc: "Mismatched Artist (Fail)" },
  { target: "One Step Closer", retrieved: "Various Artists", expected: false, desc: "Compilation Track (Fail)" },
  { target: "blink-182", retrieved: "Blink-182", expected: true, desc: "Casing variation (Pass)" },
  { target: "Gel", retrieved: undefined, expected: false, desc: "Missing artist metadata (Fail)" },
  { target: undefined, retrieved: "Gel", expected: false, desc: "Missing target metadata (Fail)" },
  { target: "Zulu", retrieved: "  Zulu  ", expected: true, desc: "Whitespace variation (Pass)" }
];

console.log("Running Strict Artist-Name Validation Tests...");
let passed = 0;
for (const tc of testCases) {
  const result = validateAlbumArtist(tc.target, tc.retrieved);
  const success = result === tc.expected;
  if (success) passed++;
  console.log(`[${success ? 'PASS' : 'FAIL'}] ${tc.desc}`);
  if (!success) {
    console.log(`   -> Target: ${tc.target}, Retrieved: ${tc.retrieved}`);
    console.log(`   -> Expected: ${tc.expected}, Got: ${result}`);
  }
}
console.log(`\nTest Results: ${passed} / ${testCases.length} Passed`);
