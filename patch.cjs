const fs = require('fs');
const content = fs.readFileSync('App.tsx', 'utf8');

// The block to move
const blockToMoveRegex = /\/\/\s*Determine quota requirements[\s\S]*?\/\/\s*3\.\s*Financial Confirmation \(Token Quota\)[\s\S]*?sessionTokenApprovedRef\.current = true;\n\s*\}/;

const match = content.match(blockToMoveRegex);
if (!match) {
  console.error('Could not find Financial Confirmation block');
  process.exit(1);
}

const blockToMove = match[0];
let newContent = content.replace(blockToMove + '\n', '');

// Find Phase 2: Visual Confirmation
const visualConfirmationRegex = /\/\/\s*2\.\s*Visual Confirmation \(ConsolidatedValidationModal\)/;
newContent = newContent.replace(visualConfirmationRegex, blockToMove + '\n\n      // 3. Visual Confirmation (ConsolidatedValidationModal)');

fs.writeFileSync('App.tsx', newContent);
console.log('Successfully swapped Phase 2 and Phase 3');
