const fs = require('fs');
const file = '/Users/simonlavin/Desktop/Zcene/Google AI Studio Code/145-zcene/components/ExampleMusicGraph.tsx';
let content = fs.readFileSync(file, 'utf8');
const lines = content.split('\n');

const startIdx = lines.findIndex(l => l.includes('// Automated Discovery Flow Animation'));
let endIdx = -1;
for (let i = startIdx + 1; i < lines.length; i++) {
    if (lines[i].includes('}, []);') && lines[i-1].includes('runDiscoveryFlow();')) {
        endIdx = i;
        break;
    }
}

if (startIdx !== -1 && endIdx !== -1) {
    lines.splice(startIdx, endIdx - startIdx + 1);
    fs.writeFileSync(file, lines.join('\n'));
    console.log('Removed Discovery Flow Animation');
} else {
    console.log('Could not find bounds', startIdx, endIdx);
}
