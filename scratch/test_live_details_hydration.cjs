// Test live details hydration, YouTube scraper, and oEmbed playability checking
process.env.GEMINI_API_KEY = "AQ.Ab8RN6KOEj8m7gmoCaWjw7CB9Ke8pq4wLpVjbVOpBnW80FGBvg";

const {
  fetchNodeDetailsBackend,
  scrapeVideoIdBackend,
  checkVideoPlayability
} = require('../functions/lib/services/curatorService.js');

async function testHydration() {
  console.log("[Test Hydration] 1. Testing fetchNodeDetailsBackend for artist 'Turnstile'...");
  
  const testNode = { id: "Turnstile", type: "artist", group: 1 };
  const mockGraph = {
    nodes: [testNode],
    links: []
  };

  const details = await fetchNodeDetailsBackend(testNode, mockGraph, "Turnstile");
  
  console.log("[Test Hydration] Details Response Received:");
  console.log(`- Artist name: ${details.details?.artist}`);
  console.log(`- Genre: ${details.details?.genre}`);
  console.log(`- Origin: ${details.details?.origin}`);
  console.log(`- Founded: ${details.details?.founded}`);
  console.log(`- Summary: ${details.summary.substring(0, 150)}...`);
  console.log(`- Grounding links:`, details.groundingLinks);
  console.log(`- youtubeVideoId parsed: ${details.youtubeVideoId}`);
  console.log(`- youtubeSearchQuery parsed: ${details.youtubeSearchQuery}`);

  console.log("\n[Test Hydration] 2. Testing scrapeVideoIdBackend for 'Scowl'...");
  const scrapedVideoId = await scrapeVideoIdBackend("Scowl", "scowl");
  console.log(`- Scraper returned video ID: ${scrapedVideoId}`);

  console.log("\n[Test Hydration] 3. Testing playability check for known valid ID...");
  const validPlayable = await checkVideoPlayability("dQw4w9WgXcQ");
  console.log(`- dQw4w9WgXcQ (Never Gonna Give You Up) playable: ${validPlayable} (Expected: true)`);

  console.log("\n[Test Hydration] 4. Testing playability check for known invalid ID...");
  const invalidPlayable = await checkVideoPlayability("invalid_id_9");
  console.log(`- invalid_id_9 playable: ${invalidPlayable} (Expected: false)`);

  if (!details.summary || !details.details?.genre || !details.details?.origin) {
    console.error("❌ Test Failed: Hydrated details are missing required metadata fields!");
    process.exit(1);
  }

  if (validPlayable !== true || invalidPlayable !== false) {
    console.error("❌ Test Failed: Playability checks did not yield expected results!");
    process.exit(1);
  }

  console.log("\n✅ [Test Hydration] Success: Details hydration, scraper, and playability checks verified!");
  process.exit(0);
}

testHydration().catch(err => {
  console.error("❌ Test crashed:", err);
  process.exit(1);
});
