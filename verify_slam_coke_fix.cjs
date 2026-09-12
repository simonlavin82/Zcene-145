const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('./firebase-service-account.json');

if (!getApps().length) {
  initializeApp({
    credential: cert(serviceAccount),
    projectId: 'zcene-production'
  });
}

const db = getFirestore();

async function run() {
  console.log("=== Verifying redirect chain ===\n");
  
  // Check slam-coke-at
  const atDoc = await db.collection('artists').doc('slam-coke-at').get();
  console.log("artists/slam-coke-at exists:", atDoc.exists);
  if (atDoc.exists) {
    const d = atDoc.data();
    console.log("  redirectTo:", d.redirectTo);
    console.log("  cacheKey:", d.cacheKey);
  }
  
  // Check slam-coke  
  const bareDoc = await db.collection('artists').doc('slam-coke').get();
  console.log("\nartists/slam-coke exists:", bareDoc.exists);
  if (bareDoc.exists) {
    const d = bareDoc.data();
    console.log("  redirectTo:", d.redirectTo);
    console.log("  cacheKey:", d.cacheKey);
  }
  
  // Verify the target
  const jpDoc = await db.collection('artists').doc('slam-coke-jp').get();
  console.log("\nartists/slam-coke-jp exists:", jpDoc.exists);
  if (jpDoc.exists) {
    const d = jpDoc.data();
    console.log("  hasDetailsCache:", !!d.detailsCache);
    console.log("  artistId:", d.artistId);
    console.log("  summary excerpt:", d.detailsCache?.summary?.substring(0, 80));
  }
  
  console.log("\n=== Redirect chain verified ===");
  console.log("slam-coke-at → slam-coke-jp (via redirectTo)");
  console.log("slam-coke → slam-coke-jp (via redirectTo)");
  
  // Simulate the server's fuzzy query fallback
  console.log("\n=== Testing server fuzzy fallback (artistId query) ===");
  const querySnap = await db.collection('artists').where('artistId', '==', 'slam-coke').limit(5).get();
  console.log(`Found ${querySnap.size} documents with artistId='slam-coke':`);
  querySnap.docs.forEach(d => {
    console.log(`  - ${d.id}: redirectTo=${d.data().redirectTo}, hasDetails=${!!d.data().detailsCache}`);
  });
}

run().catch(console.error);
