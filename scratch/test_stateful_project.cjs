const { getApps, initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
process.env.GOOGLE_APPLICATION_CREDENTIALS = 'firebase-service-account.json';
process.env.GEMINI_API_KEY = 'AQ.Ab8RN6Kr_t7aKgc1YX8QqeoOcrBftopz1FXWPfh26q0mmftdEw';

if (getApps().length === 0) {
  initializeApp();
}

const db = getFirestore();

// Import trigger handler
const trigger = require('../functions/lib/onCurationJobCreated');

async function runTest() {
  const userId = 'user-local-test';
  const projectId = `proj-test-${Date.now()}`;
  const jobId = `job-test-${Date.now()}`;
  
  console.log(`[Test Stateful Project] Initializing project: users/${userId}/projects/${projectId}`);
  const projectDocRef = db.collection('users').doc(userId).collection('projects').doc(projectId);
  
  // Set initial project document (like the client would do)
  await projectDocRef.set({
    name: 'Test Project Curation',
    seedArtists: 'Skeleton Node',
    status: 'curating',
    activeJobId: jobId,
    createdAt: new Date(),
    updatedAt: new Date()
  });

  console.log(`[Test Stateful Project] Creating job document: curationJobs/${jobId}`);
  const jobDocRef = db.collection('curationJobs').doc(jobId);
  await jobDocRef.set({
    jobId: jobId,
    userId: userId,
    status: 'pending',
    jobType: 'graph_generation',
    inputPayload: {
      artists: 'Skeleton Node',
      filters: {},
      useMocks: true, // Run in mock mode to verify status write-backs
      projectId: projectId
    }
  });

  const snapshot = await jobDocRef.get();

  console.log(`[Test Stateful Project] Invoking Cloud Function handler run()...`);
  await trigger.onCurationJobCreated.run({
    data: snapshot,
    params: { jobId: jobId }
  });

  console.log(`[Test Stateful Project] Trigger finished. Reading project document...`);
  const projectSnap = await projectDocRef.get();
  if (!projectSnap.exists) {
    throw new Error("Project document was deleted!");
  }

  const projectData = projectSnap.data();
  console.log(`\n--- [Verify Project Document State] ---`);
  console.log(`id:          ${projectId}`);
  console.log(`status:      ${projectData.status}`);
  console.log(`activeJobId: ${projectData.activeJobId}`);
  console.log(`seedArtists: ${projectData.seedArtists}`);
  console.log(`artistIds:   `, JSON.stringify(projectData.artistIds));
  console.log(`graphData:   `, projectData.graphData ? projectData.graphData.substring(0, 200) + '...' : 'null');

  // Verify status is completed
  if (projectData.status !== 'completed') {
    console.error("❌ FAILED: status is not completed!");
    process.exit(1);
  }

  // Verify graphData exists
  if (!projectData.graphData) {
    console.error("❌ FAILED: graphData is missing!");
    process.exit(1);
  }

  // Verify artistIds was populated
  if (!Array.isArray(projectData.artistIds) || projectData.artistIds.length === 0) {
    console.error("❌ FAILED: artistIds is missing or empty!");
    process.exit(1);
  }

  console.log("\n✅ SUCCESS: Stateful project status propagation verified successfully!");
  process.exit(0);
}

runTest().catch(err => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
