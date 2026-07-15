const { getApps, initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
process.env.GOOGLE_APPLICATION_CREDENTIALS = 'firebase-service-account.json';
process.env.GEMINI_API_KEY = 'AQ.Ab8RN6Kr_t7aKgc1YX8QqeoOcrBftopz1FXWPfh26q0mmftdEw';

if (getApps().length === 0) {
  initializeApp();
}

const db = getFirestore();

// Import the trigger handler
const trigger = require('../functions/lib/onCurationJobCreated');

async function runTest() {
  const jobId = `job-test-${Date.now()}`;
  console.log(`[Test Local Trigger] Creating job document: curationJobs/${jobId}`);
  
  const docRef = db.collection('curationJobs').doc(jobId);
  
  await docRef.set({
    jobId: jobId,
    userId: 'user-local-test',
    status: 'pending',
    jobType: 'graph_generation',
    inputPayload: {
      artists: 'Blindside',
      filters: {},
      useMocks: false // Run live to trigger write-back!
    }
  });

  const snapshot = await docRef.get();

  console.log(`[Test Local Trigger] Invoking raw handler trigger.onCurationJobCreated.run()...`);
  
  // Call the raw handler directly
  await trigger.onCurationJobCreated.run({
    data: snapshot,
    params: { jobId: jobId }
  });
  
  console.log(`[Test Local Trigger] Trigger execution completed. Verifying database...`);
  const artistDoc = await db.collection('artists').doc('blindside').get();
  if (!artistDoc.exists) {
    throw new Error("Target artist document 'blindside' was not created in Firestore.");
  }
  
  const artistData = artistDoc.data();
  console.log(`\n--- [Verify Artist Document] ---`);
  console.log(`cacheKey:      ${artistData.cacheKey}`);
  console.log(`artistId:      ${artistData.artistId}`);
  console.log(`isDeep:        ${artistData.isDeep}`);
  console.log(`detailsCache:  `, JSON.stringify(artistData.detailsCache, null, 2).substring(0, 1000));
  
  const typeOfDetails = typeof artistData.detailsCache;
  console.log(`detailsCache Type: ${typeOfDetails}`);
  
  if (typeOfDetails === 'string') {
    console.error("❌ FAILED: detailsCache is a string!");
    process.exit(1);
  } else if (typeOfDetails === 'object') {
    console.log("✅ SUCCESS: detailsCache is a structured object!");
    process.exit(0);
  } else {
    console.error(`❌ FAILED: Unknown detailsCache type: ${typeOfDetails}`);
    process.exit(1);
  }
}

runTest().catch(err => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
