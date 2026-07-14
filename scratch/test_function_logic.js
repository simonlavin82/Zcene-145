const admin = require('firebase-admin');
const firestoreV2 = require('firebase-functions/v2/firestore');

// Initialize list of updates captured from mock Firestore
const docUpdates = [];
let jobData = {
  status: 'pending',
  jobType: 'graph_generation',
  userId: 'user-456',
  inputPayload: {
    artists: 'Turnstile::Scowl',
    filters: {}
  }
};

// 1. Mock Firestore Admin SDK
const mockDocRef = {
  update: async (payload) => {
    console.log("[Mock Firestore] Update Call Received:", JSON.stringify(payload, null, 2));
    docUpdates.push(payload);
    jobData = { ...jobData, ...payload };
  }
};

const mockCollection = {
  doc: (id) => {
    console.log(`[Mock Firestore] doc() called with ID: ${id}`);
    return mockDocRef;
  }
};

const mockDb = {
  collection: (name) => {
    console.log(`[Mock Firestore] collection() called with Name: ${name}`);
    return mockCollection;
  }
};

admin.firestore = () => mockDb;
admin.apps = [{ name: '[DEFAULT]' }]; // prevent initializeApp from running again/failing

// 2. Mock Firebase Functions trigger wrapper
let triggerHandler = null;
firestoreV2.onDocumentCreated = (documentPath, handler) => {
  console.log(`[Mock Functions] Registered trigger on path: ${documentPath}`);
  triggerHandler = handler;
  return () => {};
};

// 3. Import the compiled function (which executes trigger registration)
console.log("\n[Test Runner] Importing compiled Cloud Function...");
require('../functions/lib/onCurationJobCreated');

// 4. Run verification tests
async function runTest() {
  if (!triggerHandler) {
    console.error("Error: triggerHandler was not registered successfully.");
    process.exit(1);
  }

  console.log("\n--- TEST CASE 1: SUCCESSFUL SKELETON RUN ---");
  docUpdates.length = 0;
  
  // Construct mock event snapshot
  const mockEvent = {
    params: { jobId: 'job-123' },
    data: {
      data: () => jobData
    }
  };

  console.log("[Test Runner] Triggering onCurationJobCreated event...");
  await triggerHandler(mockEvent);

  console.log("\n[Test Runner] Verifying status transitions:");
  console.log("Captured updates count:", docUpdates.length);
  
  const statuses = docUpdates.map(u => u.status);
  console.log("Status transitions:", statuses.join(" -> "));

  if (statuses[0] === 'processing' && statuses[1] === 'completed') {
    console.log("✅ Success: Status transitioned correctly from pending -> processing -> completed!");
  } else {
    console.log("❌ Failure: Incorrect status transitions:", statuses);
  }

  const finalUpdate = docUpdates[docUpdates.length - 1];
  if (finalUpdate && finalUpdate.result && finalUpdate.result.graphData) {
    console.log("✅ Success: Result contains graphData!");
    console.log("Result node sample ID:", finalUpdate.result.graphData.nodes[0].id);
  } else {
    console.log("❌ Failure: Result does not contain correct graphData.", finalUpdate);
  }

  console.log("\n--- TEST CASE 2: ERROR TRANSLATION RUN ---");
  docUpdates.length = 0;
  
  // Set job type to unsupported to trigger an error
  jobData = {
    status: 'pending',
    jobType: 'unsupported_type',
    userId: 'user-456',
    inputPayload: {}
  };

  console.log("[Test Runner] Triggering onCurationJobCreated with unsupported jobType...");
  await triggerHandler(mockEvent);

  console.log("\n[Test Runner] Verifying error transitions:");
  const errStatuses = docUpdates.map(u => u.status);
  console.log("Status transitions:", errStatuses.join(" -> "));

  if (errStatuses[0] === 'processing' && errStatuses[1] === 'failed') {
    console.log("✅ Success: Status transitioned correctly to failed on error!");
  } else {
    console.log("❌ Failure: Status did not transition to failed.", errStatuses);
  }

  const errorUpdate = docUpdates[docUpdates.length - 1];
  if (errorUpdate && errorUpdate.errorMessage) {
    console.log("✅ Success: Error message mapped brand-aligned message!");
    console.log("User-facing error message:", errorUpdate.errorMessage);
    console.log("Technical raw message:", errorUpdate.errorDetails.rawMessage);
  } else {
    console.log("❌ Failure: Error message was not populated.");
  }
}

runTest().catch(err => {
  console.error("Test execution failed:", err);
});
