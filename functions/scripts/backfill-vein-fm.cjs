const path = require("path");
const fs = require("fs");
const { initializeApp, cert, getApps } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { upsertBareRouterStub } = require("../lib/services/routerStubService");
const { isFullyQualifiedEntityProfile } = require("../lib/services/cacheQualification");

const serviceAccountPath = path.resolve(__dirname, "../../firebase-service-account.json");
if (!fs.existsSync(serviceAccountPath)) {
  throw new Error(`Service account file not found at: ${serviceAccountPath}`);
}

const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf-8"));

if (!getApps().length) {
  initializeApp({
    credential: cert(serviceAccount),
    projectId: "zcene-production",
  });
}

const db = getFirestore();

const TARGET_USER_ID = "K3QqtNRg48X7I3C0Zu2PVPzRBSH3";
const TARGET_PROJECT_ID = "I08wvBH905SICoSGKSjY";

async function backfillVeinFm() {
  console.log("=== ONE-OFF ADMIN BACKFILL: VEIN.FM (vein-fm-us) ===");
  console.log(`Source project: users/${TARGET_USER_ID}/projects/${TARGET_PROJECT_ID}`);

  const projectDoc = await db.doc(`users/${TARGET_USER_ID}/projects/${TARGET_PROJECT_ID}`).get();
  if (!projectDoc.exists) {
    throw new Error(`Project document not found: users/${TARGET_USER_ID}/projects/${TARGET_PROJECT_ID}`);
  }

  const projData = projectDoc.data();
  if (!projData || !projData.detailsCache) {
    throw new Error("Project does not contain detailsCache field");
  }

  let detailsCacheObj = projData.detailsCache;
  if (typeof detailsCacheObj === "string") {
    detailsCacheObj = JSON.parse(detailsCacheObj);
  }

  let veinProfile = null;
  if (Array.isArray(detailsCacheObj)) {
    const entry = detailsCacheObj.find((item) => item[0] === "vein-fm-us" || item[0] === "vein-fm");
    if (entry) {
      veinProfile = entry[1];
    }
  } else if (detailsCacheObj && typeof detailsCacheObj === "object") {
    veinProfile = detailsCacheObj["vein-fm-us"] || detailsCacheObj["vein-fm"];
  }

  if (!veinProfile) {
    throw new Error("Could not find vein-fm-us in project detailsCache!");
  }

  console.log(`Found Vein.fm profile in project detailsCache:`);
  console.log(`- Artist: ${veinProfile.details?.artist}`);
  console.log(`- Origin: ${veinProfile.details?.origin}`);
  console.log(`- Genre: ${veinProfile.details?.genre}`);
  console.log(`- Image URL: ${veinProfile.imageUrl}`);
  console.log(`- iTunes ID: ${veinProfile.itunesArtistId}`);
  console.log(`- Discography count: ${veinProfile.discography?.length || 0}`);

  const isComplete = isFullyQualifiedEntityProfile(veinProfile, false, "us");
  console.log(`V33 Cache Qualification Check: ${isComplete ? "PASSED" : "FAILED"}`);

  // 1. Write global artists/vein-fm-us
  const canonDocRef = db.collection("artists").doc("vein-fm-us");
  const canonSnap = await canonDocRef.get();

  const artistPayload = {
    cacheKey: "vein-fm-us",
    artistId: "vein-fm",
    seedArtists: veinProfile.details?.artist || "Vein.fm",
    graphData: null,
    detailsCache: veinProfile,
    filters: null,
    synthesisRationale: null,
    cacheVersion: 4,
    createdAt: canonSnap.exists && canonSnap.data()?.createdAt ? canonSnap.data().createdAt : FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    isDeep: true,
    isPrimarySeed: false,
    hasUniqueSpiderweb: false,
    dataIntegrityStatus: "verified",
  };

  await canonDocRef.set(artistPayload, { merge: true });
  console.log(`✅ Successfully written global artist document: artists/vein-fm-us`);

  // 2. Write bare router stub artists/vein-fm
  await upsertBareRouterStub(db, "vein-fm", "vein-fm-us", {
    name: veinProfile.details?.artist || "Vein.fm",
    origin: veinProfile.details?.origin || "Boston, Massachusetts, USA",
    genre: veinProfile.details?.genre || "Hardcore Punk / Metalcore",
    summary: veinProfile.summary,
  });
  console.log(`✅ Successfully written bare router stub forwarder: artists/vein-fm -> vein-fm-us`);

  // 3. Verification read-back
  const verifyCanon = await db.collection("artists").doc("vein-fm-us").get();
  const verifyStub = await db.collection("artists").doc("vein-fm").get();

  console.log("\n=== VERIFICATION READ-BACK ===");
  console.log(`artists/vein-fm-us exists: ${verifyCanon.exists}`);
  if (verifyCanon.exists) {
    const cData = verifyCanon.data();
    console.log(`  cacheKey: ${cData?.cacheKey}`);
    console.log(`  artistId: ${cData?.artistId}`);
    console.log(`  seedArtists: ${cData?.seedArtists}`);
    console.log(`  has detailsCache: ${Boolean(cData?.detailsCache)}`);
  }

  console.log(`artists/vein-fm exists: ${verifyStub.exists}`);
  if (verifyStub.exists) {
    const sData = verifyStub.data();
    console.log(`  _isStub: ${sData?._isStub}`);
    console.log(`  redirectTo: ${sData?.redirectTo}`);
    console.log(`  candidates count: ${sData?.candidates?.length || 0}`);
  }

  console.log("\nBackfill complete!");
}

backfillVeinFm().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});

