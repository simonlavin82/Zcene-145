const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require("./firebase-service-account.json");

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function runAudit() {
  try {
    const sharedSnap = await db.collection("sharedZcenes").get();
    sharedSnap.forEach(doc => {
      const data = doc.data();
      console.log(`\n===========================================`);
      console.log(`[SHARED_ZCENE] ID: ${doc.id}`);
      console.log(`[SHARED_ZCENE] Owner: ${data.authorId}`);
      console.log(`[SHARED_ZCENE] seedArtists: ${data.seedArtists}`);
      console.log(`[SHARED_ZCENE] artistIds:`, data.artistIds);
    });
    
    // Also, query the artist cache for "spaced" and "spaced-usa" again but getting all fields
    const spacedusa = await db.collection("artists").doc("spaced-usa").get();
    if(spacedusa.exists) console.log("spaced-usa exists, isDeep:", spacedusa.data().isDeep);
    
    const spaced = await db.collection("artists").doc("spaced").get();
    if(spaced.exists) console.log("spaced exists, redirectTo:", spaced.data().redirectTo);
    
  } catch (error) {
    console.error("Audit failed:", error);
  } finally {
    process.exit(0);
  }
}

runAudit();
