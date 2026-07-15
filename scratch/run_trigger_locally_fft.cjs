const { getApps, initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
process.env.GOOGLE_APPLICATION_CREDENTIALS = 'firebase-service-account.json';
process.env.GEMINI_API_KEY = 'AQ.Ab8RN6Kr_t7aKgc1YX8QqeoOcrBftopz1FXWPfh26q0mmftdEw';

if (getApps().length === 0) {
  initializeApp();
}

const db = getFirestore();

// Initialize firebase-functions-test in live mode with service account credentials
const fft = require('../functions/node_modules/firebase-functions-test')({
  projectId: 'zcene-production'
}, 'firebase-service-account.json');

const trigger = require('../functions/lib/onCurationJobCreated');
const wrapped = fft.wrap(trigger.onCurationJobCreated);

async function runTest() {
  const jobId = `job-test-${Date.now()}`;
  console.log(`[Test FFT Trigger] Creating job document: curationJobs/${jobId}`);
  
  const docRef = db.collection('curationJobs').doc(jobId);
  
  await docRef.set({
    jobId: jobId,
    userId: 'user-local-test',
    status: 'pending',
    jobType: 'graph_generation',
    inputPayload: {
      artists: 'Skeleton Node',
      filters: {},
      useMocks: true // Mock mode!
    }
  });

  const snapshot = await docRef.get();

  console.log(`[Test FFT Trigger] Invoking wrapped trigger...`);
  // For v2 onDocumentCreated trigger, we pass the snapshot as the event's data:
  // fft.wrap allows us to call the wrapped v2 Firestore trigger by passing the snapshot!
  await wrapped({
    data: snapshot,
    params: { jobId: jobId }
  });
  
  console.log(`[Test FFT Trigger] Trigger execution completed. Verifying database...`);
  const artistDoc = await db.collection('artists').doc('skeleton-node').get();
  if (!artistDoc.exists) {
    throw new Error("Target artist document 'skeleton-node' was not created in Firestore.");
  }
  
  const artistData = artistDoc.data();
  console.log(`\n--- [Verify Artist Document] ---`);
  console.log(`cacheKey:      ${artistData.cacheKey}`);
  console.log(`artistId:      ${artistData.artistId}`);
  console.log(`isDeep:        ${artistData.isDeep}`);
  console.log(`detailsCache:  `, JSON.stringify(artistData.detailsCache, null, 2));
  
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
