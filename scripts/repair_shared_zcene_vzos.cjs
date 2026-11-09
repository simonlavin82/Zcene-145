const path = require("path");
const { initializeApp, cert, getApps } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

const serviceAccount = require(path.resolve(__dirname, "../firebase-service-account.json"));
if (!getApps().length) {
  initializeApp({ credential: cert(serviceAccount) });
}
const db = getFirestore();

const USER_ID = "9FBuWDALnNfUAjxV0pRe3RnKwJy1";
const SOURCE_PROJECT_ID = "i1c1KFgYdXr6flXT7lLQ";
const SHARED_DOC_ID = "VZos2giGBfivNVfjc0Fm";

async function run() {
  console.log(`=== REPAIRING SHARED ZCENE ${SHARED_DOC_ID} FROM ${SOURCE_PROJECT_ID} ===`);

  const projRef = db.doc(`users/${USER_ID}/projects/${SOURCE_PROJECT_ID}`);
  const projSnap = await projRef.get();
  if (!projSnap.exists) {
    throw new Error(`Source project ${SOURCE_PROJECT_ID} not found!`);
  }
  const projData = projSnap.data();
  console.log(`Loaded source project: ${projData.name || 'Untitled'}`);
  console.log(`Source scenes length: ${typeof projData.scenes === 'string' ? JSON.parse(projData.scenes).length : (projData.scenes || []).length}`);
  console.log(`Source has canvasLayout: ${Boolean(projData.canvasLayout)}`);

  const shareRef = db.doc(`sharedZcenes/${SHARED_DOC_ID}`);
  const shareSnap = await shareRef.get();
  console.log(`Target share exists: ${shareSnap.exists}`);

  // Build the clean shared payload from source project
  // Preserve scenes, crossSceneLinks, overarchingRationale, canvasLayout, and graphData coordinates
  let cleanGraphData = projData.graphData;
  if (cleanGraphData) {
    try {
      const g = typeof cleanGraphData === 'string' ? JSON.parse(cleanGraphData) : cleanGraphData;
      g.nodes = (g.nodes || []).map((n) => {
        const { vx, vy, index, ...rest } = n;
        return rest;
      });
      g.links = (g.links || []).map((l) => ({
        ...l,
        source: typeof l.source === 'object' ? l.source.id : l.source,
        target: typeof l.target === 'object' ? l.target.id : l.target,
      }));
      cleanGraphData = JSON.stringify(g);
    } catch (e) {
      console.warn("graphData parse error:", e);
    }
  }

  const updatePayload = {
    name: projData.name || "Sense Field + Reason To Believe + Jimmy Eat World",
    seedArtists: projData.seedArtists,
    seedArtistIds: projData.seedArtistIds || [],
    seedImageUrls: projData.seedImageUrls || [],
    ...(projData.seedImageUrl ? { seedImageUrl: projData.seedImageUrl } : {}),
    scenes: projData.scenes,
    activeSceneId: projData.activeSceneId || "scene-1",
    overarchingRationale: projData.overarchingRationale || "",
    crossSceneLinks: projData.crossSceneLinks || "[]",
    sceneCount: projData.sceneCount || 3,
    canvasLayout: projData.canvasLayout || "[]",
    graphData: cleanGraphData,
    detailsCache: projData.detailsCache,
    activeNodes: projData.activeNodes || [],
    pinnedNodes: projData.pinnedNodes || [],
    status: "completed",
    schemaVersion: 43,
    supportsLabelDeepCuts: true,
    updatedAt: FieldValue.serverTimestamp(),
    expireAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
  };

  await shareRef.set(updatePayload, { merge: true });
  console.log(`SUCCESS: Updated sharedZcenes/${SHARED_DOC_ID} with 3-scene layout, preserved coordinates, and canvasLayout.`);
}

run().catch((err) => {
  console.error("Repair failed:", err);
  process.exit(1);
});

