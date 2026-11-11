const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../functions/src/processCurationJob.ts');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Remove the Canonical ID Rewrite block from the bottom
const canonicalBlockRegex = /\s*\/\/\s*Apply Canonical ID Rewrite and Strict Deduplication to Graph Topology[\s\S]*?(?=\s*\/\/ Apply Temporal Filters \/ Grounding Extensions|\n\s*return\s+finalGraph)/;
const match = content.match(canonicalBlockRegex);
if (!match) {
    console.error("Could not find Canonical ID Rewrite block");
    process.exit(1);
}
const canonicalBlock = match[0];
content = content.replace(canonicalBlockRegex, '');

// 2. Remove the old idRewriteMap declaration and seedNorms
const idRewriteDeclRegex = /const idRewriteMap = new Map<string, string>\(\);\s*\/\/\s*Proactively cache each recommended entity.*?\n\s*const seedNorms = artistList\.map\(\(a: string\) => normalizeArtistId\(a\)\);/g;
content = content.replace(idRewriteDeclRegex, '// Proactively cache each recommended entity');

// 3. Remove the redundant idRewriteMap.set in the recommendation loop
const redundantSetRegex = /const disambiguatedCanonicalId = recDetailsEntry \? \(recDetailsEntry as any\)\[0\] : recNorm;\s*\n\s*const compositeCanonicalId = buildCompositeCacheKey\(disambiguatedCanonicalId, inputPayload\.filters \|\| undefined\);\s*\n\s*idRewriteMap\.set\(recNorm, compositeCanonicalId\);\s*\n\s*if \(recDetailsEntry\) \(recDetailsEntry as any\)\[0\] = compositeCanonicalId;/g;
const replacementSet = `const disambiguatedCanonicalId = recDetailsEntry ? (recDetailsEntry as any)[0] : recNorm;
          const compositeCanonicalId = buildCompositeCacheKey(disambiguatedCanonicalId, inputPayload.filters || undefined);`;
content = content.replace(redundantSetRegex, replacementSet);

// 4. Create the Pre-computation and insertion block
const precomputeBlock = `
      // --- PRE-COMPUTE ID REWRITE MAP BEFORE GRAPH EXTRACTION ---
      const idRewriteMap = new Map<string, string>();
      const seedNorms = artistList.map((a: string) => normalizeArtistId(a));
      
      for (const entityObj of recommendedEntities) {
        const recNorm = normalizeArtistId(entityObj.name);
        const matchingSeedNorm = seedNorms.find((s: string) => isEntitySeedMatch(s, recNorm));
        const recDetailsEntry = detailsCacheEntries.find((entry: any) => isEntitySeedMatch(recNorm, entry[0]));
        
        const disambiguatedCanonicalId = recDetailsEntry ? (recDetailsEntry as any)[0] : recNorm;
        const compositeCanonicalId = buildCompositeCacheKey(disambiguatedCanonicalId, inputPayload.filters || undefined);
        idRewriteMap.set(recNorm, compositeCanonicalId);
        
        if (matchingSeedNorm) {
           idRewriteMap.set(matchingSeedNorm, compositeCanonicalId);
        }
        if (recDetailsEntry) {
           (recDetailsEntry as any)[0] = compositeCanonicalId; // update entry in-place for later logic
        }
      }
      
      // Also ensure primary seeds are correctly mapped
      for (const seed of artistList) {
        const seedNorm = normalizeArtistId(seed);
        const canonicalSeedId = resolvedSeedNormMap.get(seedNorm) ?? seedNorm;
        const compositeCanonicalId = buildCompositeCacheKey(canonicalSeedId, inputPayload.filters || undefined);
        if (!idRewriteMap.has(seedNorm)) {
          idRewriteMap.set(seedNorm, compositeCanonicalId);
        }
        if (canonicalSeedId !== seedNorm && !idRewriteMap.has(canonicalSeedId)) {
          idRewriteMap.set(canonicalSeedId, compositeCanonicalId);
        }
      }

      ${canonicalBlock.trim()}
`;

// Insert the block right before Step 5
const step5Regex = /(\s*\/\/\s*── Step 5: Root Breakdown Write-Back)/;
content = content.replace(step5Regex, precomputeBlock + '$1');

// 5. Fix extractArtistSubGraph in Step 5
const step5ExtractRegex = /(const rawExtracted = extractArtistSubGraph\()canonicalSeedId(, finalGraph, artistList\);)/g;
content = content.replace(step5ExtractRegex, 'const finalExtractId = idRewriteMap.get(canonicalSeedId) ?? idRewriteMap.get(seedNorm) ?? canonicalSeedId;\n              $1finalExtractId$2');

// 6. Fix extractArtistSubGraph in Fix D (Proactive Cache block)
// There are two of these!
const fixDExtractRegex = /(const rawExtracted = extractArtistSubGraph\()canonicalSeedForExtract(, finalGraph, artistList\);)/g;
content = content.replace(fixDExtractRegex, 'const finalExtractId = idRewriteMap.get(canonicalSeedForExtract) ?? canonicalSeedForExtract;\n                 $1finalExtractId$2');

fs.writeFileSync(filePath, content, 'utf8');
console.log("Refactoring complete.");
