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

// Now replace the node rendering SVG paths with text icons
let modifiedContent = fs.readFileSync(file, 'utf8');

// Replace g.append("path").attr("class", "node-shape");
// with g.append("text").attr("class", "node-icon material-symbols-outlined")...
const targetAppendStr = `                    const g = enter.append("g").attr("class", "node");
                    g.append("path").attr("class", "node-shape");
                    g.append("text")
                        .attr("text-anchor", "middle")
                        .attr("fill", "#e4e4e7")
                        .style("pointer-events", "none")
                        .style("text-shadow", "0 0 5px #000, 0 0 5px #000")
                        .attr("class", "font-medium");`;

const replacementAppendStr = `                    const g = enter.append("g").attr("class", "node");
                    g.append("text")
                        .attr("class", "node-icon material-symbols-outlined")
                        .attr("text-anchor", "middle")
                        .attr("dominant-baseline", "central")
                        .style("font-variation-settings", "'FILL' 1")
                        .style("pointer-events", "none")
                        .style("user-select", "none");
                    g.append("text")
                        .attr("class", "font-medium")
                        .attr("text-anchor", "middle")
                        .attr("fill", "#e4e4e7")
                        .style("pointer-events", "none")
                        .style("text-shadow", "0 0 5px #000, 0 0 5px #000");`;

modifiedContent = modifiedContent.replace(targetAppendStr, replacementAppendStr);

// Replace the node-shape attr updates with node-icon text/style/fill
const targetUpdateStrStart = `        node.select(".node-shape")
            .attr("d", (d: any) => {`;

const startUpdateIdx = modifiedContent.indexOf(targetUpdateStrStart);
const endUpdateIdx = modifiedContent.indexOf(`        node.select("text")
            .attr("y", 25)`);

if (startUpdateIdx !== -1 && endUpdateIdx !== -1) {
    const replacementUpdateStr = `        node.select(".node-icon")
            .text((d: any) => {
                const isSeed = seedIds.includes(d.id) || d.isSeed;
                if (d.type === 'artist') return isSeed ? 'album' : 'equalizer';
                if (d.type === 'genre') return 'library_music';
                if (d.type === 'label') return 'label';
                if (d.type === 'country') return 'location_on';
                if (d.type === 'founded') return 'event';
                return 'circle';
            })
            .style("font-size", (d: any) => {
                const isSeed = seedIds.includes(d.id) || d.isSeed;
                if (d.type === 'artist') return isSeed ? '32px' : '26px';
                if (d.type === 'genre') return '20px';
                if (d.type === 'country') return '26px';
                if (d.type === 'label' || d.type === 'founded') return '24px';
                return '20px';
            })
            .attr("fill", (d: any) => {
                const isSeed = seedIds.includes(d.id) || d.isSeed;
                if (d.type === 'artist') {
                    return isSeed ? nodeTypeColorMap.seed : nodeTypeColorMap.ai;
                }
                if (!d.type) return zceneFallbackColor;
                return nodeTypeColorMap[d.type] || colorScale(d.type);
            });\n\n`;

    modifiedContent = modifiedContent.slice(0, startUpdateIdx) + replacementUpdateStr + modifiedContent.slice(endUpdateIdx);
}

// Also replace `node.select("text")` with `node.select(".font-medium")` since there are now two text elements
modifiedContent = modifiedContent.replace(`        node.select("text")
            .attr("y", 25)`, `        node.select(".font-medium")
            .attr("y", 25)`);

fs.writeFileSync(file, modifiedContent);
console.log('Modifications applied');
