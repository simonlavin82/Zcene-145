const fs = require('fs');
const file = '/Users/simonlavin/Desktop/Zcene/Google AI Studio Code/145-zcene/App.tsx';
let content = fs.readFileSync(file, 'utf8');

// 1. Replace quota requirements with routing decision logic
content = content.replace(
  /const requiresLiveSynthesis = isLiveSynthesis \|\| isLiveSynthesisTemp;\s*const hasMisses = cacheCandidatesPerSeed\.some\(s => !s\.isKnownCacheHit\);\s*let tokenType = 'generation';\s*if \(requiresLiveSynthesis\) tokenType = 'live_synthesis';\s*else if \(needsCacheUpgrade\) tokenType = 'cache_upgrade';\s*const requiresQuota = requiresLiveSynthesis \|\| hasMisses \|\| needsCacheUpgrade;/,
  `const routingDecision = deriveRoutingDecision(verdicts, isLiveSynthesis);
      const requiresLiveSynthesis = isLiveSynthesis || isLiveSynthesisTemp;
      const hasMisses = routingDecision === 'MISS';
      const needsCacheUpgrade = routingDecision === 'PARTIAL';
      
      let tokenType = 'generation';
      if (requiresLiveSynthesis) tokenType = 'live_synthesis';
      else if (needsCacheUpgrade) tokenType = 'cache_upgrade';
      
      const requiresQuota = requiresLiveSynthesis || hasMisses || needsCacheUpgrade;`
);

// 2. Replace the old "Apply Cache Hit for Single Qualified Hits" block
const cacheHitStart = content.indexOf('// 5. Apply Cache Hit for Single Qualified Hits');
const fallThroughStart = content.indexOf('// Fall through to API Live Generation');

if (cacheHitStart !== -1 && fallThroughStart !== -1) {
  content = content.substring(0, cacheHitStart) +
    `// 5. Apply Cache Hit for Single Qualified Hits (Local Routing)
      if (routingDecision === 'TOPOLOGY_HIT' && artistList.length === 1 && singleCacheDocData) {
          if (singleCacheResolvedSearchId && singleCacheResolvedSearchId !== artistList[0]) {
              setSeedArtists(singleCacheResolvedSearchId);
              artistList.splice(0, artistList.length, singleCacheResolvedSearchId);
          }
          await applyLocalTopologyHit(artistList[0], singleCacheDocData, artistList, artists);
          return;
      }
      
      ` + content.substring(fallThroughStart);
} else {
  console.error("Could not find blocks to replace for Phase 5.");
}

fs.writeFileSync(file, content);
console.log("Successfully patched App.tsx");
