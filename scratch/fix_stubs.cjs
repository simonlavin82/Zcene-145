const fs = require('fs');
const file = '/Users/simonlavin/Desktop/Zcene/Google AI Studio Code/145-zcene/functions/src/executeCurationPipeline.ts';
let lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);

// Chunk 1: Lines 169-174
const dedupCatchIdx = lines.findIndex(l => l.includes('} catch (dedupErr) {'));
if (dedupCatchIdx !== -1) {
    const endIdx = lines.findIndex((l, i) => i > dedupCatchIdx && l.includes('let hasGraphData = false;'));
    if (endIdx !== -1) {
        lines.splice(dedupCatchIdx, endIdx - dedupCatchIdx, 
`      } catch (dedupErr) {
        console.warn(\`[Pipeline Diamond] Seed slug dedup query failed for "\${seedNorm}", proceeding with derived ID:\`, dedupErr);
      }

      // [Pre-Flight Alias Resolution]
      const originalQuery = payload.originalQueries && payload.originalQueries[resolvedSeedNorm];
      if (originalQuery) {
          const bareNormId = normalizeArtistId(originalQuery);
          if (bareNormId !== resolvedSeedNorm) {
              await db.collection("artists").doc(bareNormId).set({
                  _isStub: true,
                  redirectTo: resolvedSeedNorm,
                  cachedAt: FieldValue.serverTimestamp()
              }, { merge: true });
              console.log(\`[Pipeline Diamond] -> Synchronously minted bare stub forwarder (Frontend Resolved): \${bareNormId} -> \${resolvedSeedNorm}\`);
          }
      }
`);
        console.log('Chunk 1 applied');
    }
}

// Chunk 2: Lines 244-273 (adjusted for Chunk 1 length changes)
const valResultIdx = lines.findIndex(l => l.includes('let validationResult: any = null;'));
if (valResultIdx !== -1) {
    const endValIdx = lines.findIndex((l, i) => i > valResultIdx && l.includes('resolvedSeedArray.push({'));
    if (endValIdx !== -1) {
        lines.splice(valResultIdx, endValIdx - valResultIdx, 
`         let validationResult: any = null;
         let resolvedByBackend = false;
         if (payload.disambiguationHints && payload.disambiguationHints[normalizeArtistId(seed)]) {
            const hintGenre = payload.disambiguationGenres && payload.disambiguationGenres[normalizeArtistId(seed)] ? payload.disambiguationGenres[normalizeArtistId(seed)] : "Unknown";
            const rawId = payload.originalQueries && payload.originalQueries[normalizeArtistId(seed)] ? payload.originalQueries[normalizeArtistId(seed)] : seed;
            validationResult = { isValid: true, id: rawId, origin: payload.disambiguationHints[normalizeArtistId(seed)], genre: hintGenre };
         } else {
            const valResult = await validateSeedOriginBackend(seed);
            validationResult = valResult;
            resolvedByBackend = true;
            if (valResult.apiUsage) {
               usageCollector.push(valResult.apiUsage.model, valResult.apiUsage);
            }
         }
         if (validationResult.isValid) {
            const bareNormId = normalizeArtistId(validationResult.id);
            let normId = bareNormId;
            if (validationResult.origin) {
               const originSlug = extractCountrySlug(validationResult.origin);
               if (originSlug && originSlug !== 'global' && !normId.endsWith(\`-\${originSlug}\`)) {
                  normId = \`\${normId}-\${originSlug}\`;
               }
            }
            
            if (normId !== bareNormId && resolvedByBackend) {
               await db.collection("artists").doc(bareNormId).set({
                  _isStub: true,
                  redirectTo: normId,
                  cachedAt: FieldValue.serverTimestamp()
               }, { merge: true });
               console.log(\`[Pipeline Diamond] -> Synchronously minted bare stub forwarder (Backend Resolved): \${bareNormId} -> \${normId}\`);
            }

`);
        console.log('Chunk 2 applied');
    }
}

fs.writeFileSync(file, lines.join('\n'));
console.log('File written');
