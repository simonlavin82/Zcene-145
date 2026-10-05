const fs = require('fs');
const file = '/Users/simonlavin/Desktop/Zcene/Google AI Studio Code/145-zcene/App.tsx';
let content = fs.readFileSync(file, 'utf8');

const phase5Start = content.indexOf('// 5. Apply Cache Hit for Single Qualified Hits (Local Routing)');
const phase5End = content.indexOf('// Fall through to API Live Generation');

if (phase5Start !== -1 && phase5End !== -1) {
  const phase5Code = content.substring(phase5Start, phase5End);
  
  // Remove Phase 5 from its current location
  content = content.substring(0, phase5Start) + content.substring(phase5End);
  
  // Insert it before Phase 4
  const phase4Start = content.indexOf('// 4. Database Minting (Step Zero)');
  if (phase4Start !== -1) {
    content = content.substring(0, phase4Start) + phase5Code + '\n      ' + content.substring(phase4Start);
    fs.writeFileSync(file, content);
    console.log("Successfully moved Phase 5 before Phase 4");
  } else {
    console.log("Could not find Phase 4 block");
  }
} else {
  console.log("Could not find Phase 5 block");
}
