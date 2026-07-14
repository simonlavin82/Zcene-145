const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');
process.env.GOOGLE_APPLICATION_CREDENTIALS = 'firebase-service-account.json';

admin.initializeApp();
const db = getFirestore();

// Copy EXACT validation logic from App.tsx
const validateRootsBreakdown = (rationale, isSingleArtist = false) => {
  if (!rationale) return false;
  const lower = rationale.toLowerCase();
  if (isSingleArtist) {
    return lower.includes('acoustic') && lower.includes('scene');
  }
  return lower.includes('acoustic') && lower.includes('scene') && lower.includes('overlap');
};

const parseDetailsCacheSafely = (field) => {
  if (!field) return null;
  try {
    let parsed = typeof field === 'string' ? JSON.parse(field) : field;
    if (Array.isArray(parsed) && parsed.length > 0) {
      parsed = Array.isArray(parsed[0]) ? parsed[0][1] : parsed[0];
    }
    if (typeof parsed === 'string') {
      parsed = JSON.parse(parsed);
    }
    return parsed;
  } catch (e) {
    return null;
  }
};

const normalizeArtistId = (id) => {
  return id
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
};

const validateCacheEntry = (data, isSingleArtist = false) => {
  if (!data) return { isFullyQualified: false, reason: "no data" };
  if (!data.graphData) return { isFullyQualified: false, reason: "no graphData" };

  try {
    const graph = typeof data.graphData === 'string' ? JSON.parse(data.graphData) : data.graphData;
    if (!graph || !graph.nodes || !Array.isArray(graph.nodes) || graph.nodes.length === 0) {
      return { isFullyQualified: false, reason: "empty nodes" };
    }

    const artistNodes = graph.nodes.filter((n) => n.type === 'artist' || !n.type);
    const needsPeerBands = artistNodes.length < 2;

    let hasGenericContext = false;
    if (graph.links && Array.isArray(graph.links)) {
      const genericStrings = ["is connected to", "is musically related to"];
      hasGenericContext = graph.links.some((l) => 
        l.context && genericStrings.includes(l.context.toLowerCase().trim())
      );
    }
    if (hasGenericContext) {
      return { isFullyQualified: false, reason: "generic context" };
    }

    const rationale = data.synthesisRationale || graph.synthesisRationale;
    const rootsValid = validateRootsBreakdown(rationale, isSingleArtist);
    if (!rootsValid) {
      return { isFullyQualified: false, reason: `roots breakdown invalid (rationale: ${rationale})` };
    }

    if (!data.detailsCache) {
      return { isFullyQualified: false, reason: "no detailsCache" };
    }
    const details = parseDetailsCacheSafely(data.detailsCache);
    if (!details) {
      return { isFullyQualified: false, reason: "parse detailsCache failed" };
    }
    const bio = details.summary || details.bio || details.description || details.text || "";
    if (typeof bio !== 'string' || bio.trim().length <= 5 || bio.toLowerCase().includes("sandbox mock")) {
      return { isFullyQualified: false, reason: `bio too short or mock: "${bio}"` };
    }

    const genre = details.details?.genre || details.genre;
    const origin = details.details?.origin || details.origin;
    if (!genre || typeof genre !== 'string' || genre.trim().length === 0 || genre.toLowerCase().trim() === "unknown") {
      return { isFullyQualified: false, reason: `invalid genre: ${genre}` };
    }
    if (!origin || typeof origin !== 'string' || origin.trim().length === 0 || origin.toLowerCase().trim() === "unknown") {
      return { isFullyQualified: false, reason: `invalid origin: ${origin}` };
    }

    return {
      isFullyQualified: !needsPeerBands,
      needsPeerBands,
      reason: needsPeerBands ? "needsPeerBands" : "fully qualified"
    };
  } catch (e) {
    return { isFullyQualified: false, reason: "exception: " + e.message };
  }
};

async function test() {
  const normId = 'blindside';
  console.log(`Loading doc artists/${normId}...`);
  const snap = await db.collection('artists').doc(normId).get();
  if (!snap.exists) {
    console.log("Doc does not exist!");
    return;
  }
  const data = snap.data();
  console.log("Validation result (isSingleArtist=true):", validateCacheEntry(data, true));
  console.log("Validation result (isSingleArtist=false):", validateCacheEntry(data, false));
}

test().catch(console.error);
