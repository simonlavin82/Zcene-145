// Configure Firestore SDK to connect to the Local Emulator
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";

const admin = require('firebase-admin');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

// Initialize Admin SDK pointing to the emulator project
admin.initializeApp({
  projectId: 'zcene-production'
});

const db = getFirestore();

async function triggerJob() {
  const jobId = `job-emu-${Date.now()}`;
  const docRef = db.collection('curationJobs').doc(jobId);

  console.log(`[Test Trigger] Creating curation job document: curationJobs/${jobId}`);

  // Create job document
  await docRef.set({
    jobId: jobId,
    userId: 'user-emu-789',
    status: 'pending',
    jobType: 'graph_generation',
    inputPayload: {
      artists: 'Turnstile::Scowl',
      filters: {}
    },
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  });

  console.log(`[Test Trigger] Job created. Watching document for state updates...`);

  // Watch job document for transitions
  const unsubscribe = docRef.onSnapshot(snap => {
    const data = snap.data();
    if (!data) return;

    console.log(`\n--- [Document Update Received] ---`);
    console.log(`Status:  ${data.status}`);
    console.log(`Updated: ${data.updatedAt ? data.updatedAt.toDate().toISOString() : 'pending'}`);
    
    if (data.status === 'completed') {
      console.log(`✅ Job Completed successfully!`);
      console.log(`Result:`, JSON.stringify(data.result, null, 2));
      unsubscribe();
      process.exit(0);
    } else if (data.status === 'failed') {
      console.log(`❌ Job Failed!`);
      console.log(`Error Message:`, data.errorMessage);
      console.log(`Error Details:`, JSON.stringify(data.errorDetails, null, 2));
      unsubscribe();
      process.exit(1);
    }
  });

  // Timeout safeguard
  setTimeout(() => {
    console.log('\n[Test Trigger] Timeout reached. Unsubscribing.');
    unsubscribe();
    process.exit(1);
  }, 15000);
}

triggerJob().catch(err => {
  console.error("Failed to run emulator trigger test:", err);
  process.exit(1);
});
