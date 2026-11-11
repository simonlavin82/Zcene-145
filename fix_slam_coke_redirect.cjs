/**
 * One-time data fix script:
 * Creates a redirect document at artists/slam-coke-at pointing to artists/slam-coke-jp
 * so that the Words of Concrete project's graph (which uses slam-coke-at node id)
 * resolves instantly to the correct cached profile without triggering a synthesis modal.
 * 
 * Run with: node functions/fix_slam_coke_redirect.cjs
 */
const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const serviceAccount = require('./firebase-service-account.json');

if (!getApps().length) {
  initializeApp({
    credential: cert(serviceAccount),
    projectId: 'zcene-production'
  });
}

const db = getFirestore();

async function run() {
  console.log("=== Slam Coke Redirect Fix ===\n");
  
  // Verify slam-coke-jp exists
  const sourceDoc = await db.collection('artists').doc('slam-coke-jp').get();
  if (!sourceDoc.exists) {
    console.error("ERROR: artists/slam-coke-jp does not exist. Cannot create redirect.");
    process.exit(1);
  }
  console.log("✅ Confirmed: artists/slam-coke-jp exists");
  
  // Check if slam-coke-at already exists
  const targetDoc = await db.collection('artists').doc('slam-coke-at').get();
  if (targetDoc.exists) {
    const data = targetDoc.data();
    console.log("⚠️  artists/slam-coke-at already exists:");
    console.log("   - redirectTo:", data.redirectTo);
    console.log("   - hasDetailsCache:", !!data.detailsCache);
    if (data.redirectTo === 'slam-coke-jp') {
      console.log("✅ Redirect already correctly set. Nothing to do.");
      return;
    }
    console.log("   - Updating redirect...");
  } else {
    console.log("   artists/slam-coke-at does not exist. Creating redirect document...");
  }
  
  // Create/update the redirect document
  await db.collection('artists').doc('slam-coke-at').set({
    artistId: 'slam-coke',
    cacheKey: 'slam-coke-at',
    redirectTo: 'slam-coke-jp',
    cacheVersion: 4,
    cachedAt: FieldValue.serverTimestamp(),
    _isRedirect: true
  });
  
  console.log("✅ Created redirect: artists/slam-coke-at → artists/slam-coke-jp");
  
  // Also create artists/slam-coke redirect if it doesn't exist
  const bareDoc = await db.collection('artists').doc('slam-coke').get();
  if (!bareDoc.exists) {
    await db.collection('artists').doc('slam-coke').set({
      artistId: 'slam-coke',
      cacheKey: 'slam-coke',
      redirectTo: 'slam-coke-jp',
      cacheVersion: 4,
      cachedAt: FieldValue.serverTimestamp(),
      _isRedirect: true
    });
    console.log("✅ Created redirect: artists/slam-coke → artists/slam-coke-jp");
  } else {
    console.log("   artists/slam-coke already exists, skipping.");
  }
  
  console.log("\n✅ Done! The Words of Concrete project will now correctly resolve Slam Coke from cache.");
}

run().catch(err => {
  console.error("ERROR:", err);
  process.exit(1);
});
