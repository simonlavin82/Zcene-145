const fs = require('fs');
const file = '/Users/simonlavin/Desktop/Zcene/Google AI Studio Code/145-zcene/App.tsx';
let content = fs.readFileSync(file, 'utf8');

const blockStartString = '      // Fall through to API Live Generation\n      let resolvedArtistSeeds';
const blockEndString = '        return;\n      }';

const blockStart = content.indexOf(blockStartString);
if (blockStart === -1) {
  console.log("Could not find start of hasDisambiguated block");
  process.exit(1);
}

const blockEnd = content.indexOf(blockEndString, blockStart) + blockEndString.length;
if (blockEnd <= blockStartString.length) {
  console.log("Could not find end of hasDisambiguated block");
  process.exit(1);
}

const disambiguationBlock = content.substring(blockStart, blockEnd);

// Remove the block from its current location
content = content.substring(0, blockStart) + content.substring(blockEnd);

// Find the target insertion point (immediately after Phase 3)
const phase5StartString = '      // 5. Apply Cache Hit for Single Qualified Hits (Local Routing)';
const phase5Start = content.indexOf(phase5StartString);

if (phase5Start === -1) {
  console.log("Could not find Phase 5 start string");
  process.exit(1);
}

// Ensure there is a newline separator
const insertionBlock = '      // --- DISAMBIGUATION RE-ROUTE BLOCK (HOISTED) ---\n' + disambiguationBlock.replace('      // Fall through to API Live Generation\n', '') + '\n\n';

content = content.substring(0, phase5Start) + insertionBlock + content.substring(phase5Start);

fs.writeFileSync(file, content);
console.log("Successfully hoisted the disambiguation block.");
