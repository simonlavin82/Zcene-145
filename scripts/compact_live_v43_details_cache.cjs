const path = require("path");
const { initializeApp, cert, getApps } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { compactDetailsCacheToCanonical } = require("../functions/lib/shared/multiSceneUtils");

const serviceAccount = require(path.resolve(__dirname, "../firebase-service-account.json"));
if (!getApps().length) {
  initializeApp({ credential: cert(serviceAccount) });
}
const db = getFirestore();

const USER_ID = "9FBuWDALnNfUAjxV0pRe3RnKwJy1";
const PROJECT_IDS = [
  "Zw6eIbpePvWeYmopgWhS", // 2-scene source project
  "i1c1KFgYdXr6flXT7lLQ"  // 3-scene forked project
];

async function run() {
  console.log("=== COMPACTING LIVE V43 DETAILS CACHE IN FIRESTORE ===");
  for (const pid of PROJECT_IDS) {
    const docRef = db.doc(`users/${USER_ID}/projects/${pid}`);
    const snap = await docRef.get();
    if (!snap.exists) {
      console.warn(`Project ${pid} not found!`);
      continue;
    }
    const data = snap.data();
    let rawCache = data.detailsCache;
    let nodes = [];
    if (data.graphData) {
      try {
        const parsedG = typeof data.graphData === "string" ? JSON.parse(data.graphData) : data.graphData;
        nodes = parsedG.nodes || [];
      } catch (e) {}
    }

    let beforeCount = 0;
    if (typeof rawCache === "string") {
      try {
        const p = JSON.parse(rawCache);
        beforeCount = Array.isArray(p) ? p.length : Object.keys(p).length;
      } catch (e) {}
    } else if (Array.isArray(rawCache)) {
      beforeCount = rawCache.length;
    } else if (rawCache && typeof rawCache === "object") {
      beforeCount = Object.keys(rawCache).length;
    }

    const compacted = compactDetailsCacheToCanonical(rawCache, nodes);
    const afterCount = compacted.length;

    console.log(`\nProject: ${pid} ("${data.name}")`);
    console.log(`- Before entries: ${beforeCount}`);
    console.log(`- After compacted entries: ${afterCount}`);
    console.log(`- Sample canonical keys:`, compacted.slice(0, 5).map(e => e[0]));

    await docRef.update({
      detailsCache: JSON.stringify(compacted),
      updatedAt: FieldValue.serverTimestamp()
    });
    console.log(`✓ Updated project ${pid} with compacted detailsCache!`);
  }
  console.log("\n=== COMPACTION COMPLETED SUCCESSFULLY ===");
}

run().catch((err) => {
  console.error("Compaction failed:", err);
  process.exit(1);
});

