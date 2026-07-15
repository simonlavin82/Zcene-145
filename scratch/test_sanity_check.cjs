// Local unit test for the validateArtistDetailsSchema sanity check logic
const { normalizeArtistId } = require('../functions/lib/services/curatorService');

function validateArtistDetailsSchema(artistId, details) {
  if (!details) {
    throw new Error(`[Schema Sanity Check] detailsCache is null or undefined for artist: ${artistId}`);
  }
  if (typeof details === "string") {
    throw new Error(`[Schema Sanity Check] detailsCache is serialized as a raw string for artist: ${artistId}`);
  }
  if (Array.isArray(details)) {
    throw new Error(`[Schema Sanity Check] detailsCache is an array instead of a structured object for artist: ${artistId}`);
  }

  // Verify biography/summary
  const bio = details.summary || details.bio;
  if (!bio || typeof bio !== 'string' || bio.trim().length < 5) {
    throw new Error(`[Schema Sanity Check] detailsCache is missing summary for artist: ${artistId}`);
  }

  // Verify details object
  if (!details.details || typeof details.details !== 'object') {
    throw new Error(`[Schema Sanity Check] detailsCache.details is missing or invalid for artist: ${artistId}`);
  }
  const { genre, origin, founded } = details.details;
  if (!genre || typeof genre !== 'string' || genre.trim().length === 0) {
    throw new Error(`[Schema Sanity Check] detailsCache.details is missing genre for artist: ${artistId}`);
  }
  if (!origin || typeof origin !== 'string' || origin.trim().length === 0) {
    throw new Error(`[Schema Sanity Check] detailsCache.details is missing origin for artist: ${artistId}`);
  }
  if (!founded || typeof founded !== 'string' || founded.trim().length === 0) {
    throw new Error(`[Schema Sanity Check] detailsCache.details is missing founded year for artist: ${artistId}`);
  }

  // Verify discography
  if (!details.discography || !Array.isArray(details.discography)) {
    throw new Error(`[Schema Sanity Check] detailsCache.discography is missing or not an array for artist: ${artistId}`);
  }
}

// Test cases
const validObj = {
  summary: "This is a valid summary for testing.",
  details: {
    artist: "Test Artist",
    genre: "Rock",
    origin: "Sweden",
    founded: "2000",
    notableArtists: []
  },
  discography: [{ albumName: "Album 1", releaseYear: "2001" }],
  recommendationReason: "Recommended for testing",
  youtubeSearchQuery: "Test Artist live"
};

const stringPayload = JSON.stringify(validObj);

const arrayPayload = [
  ["test-artist", validObj]
];

console.log("Running sanity check unit tests...");

// Test 1: Valid Object
try {
  validateArtistDetailsSchema("test-artist", validObj);
  console.log("✅ Test 1 Passed: Valid structured object succeeded.");
} catch (e) {
  console.error("❌ Test 1 Failed:", e.message);
  process.exit(1);
}

// Test 2: String Payload
try {
  validateArtistDetailsSchema("test-artist", stringPayload);
  console.error("❌ Test 2 Failed: String payload did not throw an error.");
  process.exit(1);
} catch (e) {
  if (e.message.includes("serialized as a raw string")) {
    console.log("✅ Test 2 Passed: String payload correctly rejected.");
  } else {
    console.error("❌ Test 2 Failed with unexpected error:", e.message);
    process.exit(1);
  }
}

// Test 3: Array Payload
try {
  validateArtistDetailsSchema("test-artist", arrayPayload);
  console.error("❌ Test 3 Failed: Array payload did not throw an error.");
  process.exit(1);
} catch (e) {
  if (e.message.includes("is an array instead of a structured object")) {
    console.log("✅ Test 3 Passed: Array payload correctly rejected.");
  } else {
    console.error("❌ Test 3 Failed with unexpected error:", e.message);
    process.exit(1);
  }
}

console.log("\nAll sanity check unit tests completed successfully!");
process.exit(0);
