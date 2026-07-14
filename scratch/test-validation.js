import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

const validateRootsBreakdown = (rationale) => {
  if (!rationale) return false;
  const lower = rationale.toLowerCase();
  const hasAcoustic = lower.includes('acoustic');
  const hasScene = lower.includes('scene');
  const hasOverlap = lower.includes('overlap');
  console.log("validateRootsBreakdown checks:", { hasAcoustic, hasScene, hasOverlap });
  return hasAcoustic && hasScene && hasOverlap;
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

const validateCacheEntry = (data) => {
  if (!data) {
    return { isFullyQualified: false, needsPeerBands: false, needsFutureFields: false, reason: "no data" };
  }

  if (!data.graphData) {
    return { isFullyQualified: false, needsPeerBands: false, needsFutureFields: false, reason: "no graphData" };
  }

  try {
    const graph = typeof data.graphData === 'string' ? JSON.parse(data.graphData) : data.graphData;
    if (!graph || !graph.nodes || !Array.isArray(graph.nodes) || graph.nodes.length === 0) {
      return { isFullyQualified: false, needsPeerBands: false, needsFutureFields: false, reason: "empty graph nodes" };
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
      return { isFullyQualified: false, needsPeerBands, needsFutureFields: true, reason: "generic context" };
    }

    const rationale = data.synthesisRationale || graph.synthesisRationale;
    if (!validateRootsBreakdown(rationale)) {
      return { isFullyQualified: false, needsPeerBands, needsFutureFields: true, reason: "roots breakdown invalid" };
    }

    if (!data.detailsCache) {
      return { isFullyQualified: false, needsPeerBands, needsFutureFields: true, reason: "no detailsCache" };
    }
    const details = parseDetailsCacheSafely(data.detailsCache);
    if (!details) {
      return { isFullyQualified: false, needsPeerBands, needsFutureFields: true, reason: "parse detailsCache failed" };
    }
    const bio = details.summary || details.bio || details.description || details.text || "";
    if (typeof bio !== 'string' || bio.trim().length <= 5 || bio.toLowerCase().includes("sandbox mock")) {
      return { isFullyQualified: false, needsPeerBands, needsFutureFields: true, reason: "bio too short or mock" };
    }

    const genre = details.details?.genre || details.genre;
    const origin = details.details?.origin || details.origin;
    if (!genre || typeof genre !== 'string' || genre.trim().length === 0 || genre.toLowerCase().trim() === "unknown") {
      return { isFullyQualified: false, needsPeerBands, needsFutureFields: true, reason: "invalid genre" };
    }
    if (!origin || typeof origin !== 'string' || origin.trim().length === 0 || origin.toLowerCase().trim() === "unknown") {
      return { isFullyQualified: false, needsPeerBands, needsFutureFields: true, reason: "invalid origin" };
    }

    return {
      isFullyQualified: !needsPeerBands,
      needsPeerBands,
      needsFutureFields: false,
      reason: needsPeerBands ? "needsPeerBands" : "fully qualified"
    };
  } catch (e) {
    return { isFullyQualified: false, needsPeerBands: false, needsFutureFields: false, reason: "exception: " + e.message };
  }
};

async function main() {
  const docRef = doc(db, 'artists', 'madball-united-states');
  const snap = await getDoc(docRef);
  if (snap.exists()) {
    const data = snap.data();
    console.log("Validation result:", validateCacheEntry(data));
  } else {
    console.log("Doc does not exist.");
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
