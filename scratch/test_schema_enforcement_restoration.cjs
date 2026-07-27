const fs = require('fs');
const path = require('path');

// Read and eval or require TypeScript compiled or source using ts-node/register if needed, or test the JS logic directly
console.log("=========================================================");
console.log("   ZCENE SCHEMA ENFORCEMENT RESTORATION TEST");
console.log("=========================================================\n");

// Recreate the exact enforcement logic as updated in artistCacheService.ts and server.js
const enforceArtistCacheSchema = (payload) => {
  if (!payload) return;
  if (payload.redirectTo) return;

  const isDeep = payload.isDeep === true;

  if (isDeep || 'detailsCache' in payload) {
    try {
      const detailsCacheRaw = payload.detailsCache;
      if (!detailsCacheRaw) {
        return;
      }

      let parsed = typeof detailsCacheRaw === 'string' ? JSON.parse(detailsCacheRaw) : detailsCacheRaw;
      
      if (!parsed) {
        throw new Error("[Schema Enforcement] Parsed detailsCache is null or empty.");
      }
      
      // Check for biography or summary
      const bio = parsed.summary || parsed.bio || parsed.description || parsed.text;
      if (!bio || typeof bio !== 'string' || bio.trim().length < 2) {
        throw new Error("[Schema Enforcement] detailsCache is missing biography/summary text.");
      }
      
      // Check details object
      if (!parsed.details || typeof parsed.details !== 'object') {
        throw new Error("[Schema Enforcement] detailsCache is missing or has invalid details object.");
      }
      const { genre, origin, founded, notableArtists } = parsed.details;
      if (genre === undefined || genre === null || typeof genre !== 'string') {
        throw new Error("[Schema Enforcement] detailsCache.details is missing genre.");
      }
      if (origin === undefined || origin === null || typeof origin !== 'string') {
        throw new Error("[Schema Enforcement] detailsCache.details is missing origin.");
      }
      if (founded === undefined || founded === null || typeof founded !== 'string') {
        throw new Error("[Schema Enforcement] detailsCache.details is missing founded year.");
      }
      if (notableArtists && !Array.isArray(notableArtists)) {
        throw new Error("[Schema Enforcement] detailsCache.details has invalid notableArtists array.");
      }

      // Check for discography array
      if (parsed.discography && !Array.isArray(parsed.discography)) {
        throw new Error("[Schema Enforcement] detailsCache has invalid discography array.");
      }
      if (Array.isArray(parsed.discography)) {
        for (let i = 0; i < parsed.discography.length; i++) {
          const item = parsed.discography[i];
          if (!item || typeof item !== 'object' || !item.albumName || !item.releaseYear) {
            throw new Error(`[Schema Enforcement] discography item at index ${i} is missing albumName or releaseYear.`);
          }
        }
      }

      // Check recommendationReason (allow empty string for primary seeds)
      if (parsed.recommendationReason === undefined || parsed.recommendationReason === null || typeof parsed.recommendationReason !== 'string') {
        throw new Error("[Schema Enforcement] detailsCache is missing recommendationReason.");
      }

      // Check youtubeSearchQuery (allow empty string)
      if (parsed.youtubeSearchQuery === undefined || parsed.youtubeSearchQuery === null || typeof parsed.youtubeSearchQuery !== 'string') {
        throw new Error("[Schema Enforcement] detailsCache is missing youtubeSearchQuery.");
      }
    } catch (err) {
      console.error("[Schema Enforcement] Client Validation failed for payload:", JSON.stringify(payload, null, 2));
      throw err;
    }
  }
};

let passed = 0;
let failed = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`✔ [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`❌ [FAIL] ${name}: ${err.message}`);
    failed++;
  }
}

// 1. Test graph recommendation entity (isDeep: true, detailsCache: undefined)
runTest("Recommendation Entity without detailsCache (isDeep: true)", () => {
  const payload = {
    cacheKey: "turnstile",
    artistId: "turnstile",
    seedArtists: "Turnstile",
    graphData: JSON.stringify({ nodes: [], links: [] }),
    isDeep: true,
    isPrimarySeed: false,
    hasUniqueSpiderweb: false
  };
  enforceArtistCacheSchema(payload);
});

// 2. Test primary seed entity with empty string recommendationReason and youtubeSearchQuery
runTest("Primary Seed with empty string recommendationReason and youtubeSearchQuery", () => {
  const payload = {
    cacheKey: "drain",
    artistId: "drain",
    seedArtists: "Drain",
    isDeep: true,
    isPrimarySeed: true,
    detailsCache: {
      summary: "Drain is an American hardcore punk band from Santa Cruz, California.",
      details: {
        artist: "Drain",
        genre: "Hardcore Punk",
        origin: "Santa Cruz, California",
        founded: "2014",
        notableArtists: ["Turnstile", "Sunami"]
      },
      discography: [
        { albumName: "California Cursed", releaseYear: "2020" },
        { albumName: "Living Proof", releaseYear: "2023" }
      ],
      recommendationReason: "", // Empty string for primary seed
      youtubeSearchQuery: ""
    }
  };
  enforceArtistCacheSchema(payload);
});

// 3. Test stringified detailsCache with empty strings
runTest("Stringified detailsCache with empty string recommendationReason", () => {
  const payload = {
    cacheKey: "spaced",
    artistId: "spaced",
    isDeep: true,
    detailsCache: JSON.stringify({
      summary: "Spaced is a hardcore punk band from Buffalo, New York.",
      details: {
        artist: "Spaced",
        genre: "Hardcore",
        origin: "Buffalo, NY",
        founded: "2020",
        notableArtists: []
      },
      discography: [{ albumName: "Spaced Jams", releaseYear: "2022" }],
      recommendationReason: "",
      youtubeSearchQuery: ""
    })
  };
  enforceArtistCacheSchema(payload);
});

console.log("\n=========================================================");
console.log(`Test Summary: ${passed} Passed, ${failed} Failed`);
console.log("=========================================================");

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
