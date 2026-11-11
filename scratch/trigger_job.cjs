const admin = require("firebase-admin");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";

admin.initializeApp({
  projectId: "zcene-production"
});

const db = getFirestore();

async function triggerJob() {
  console.log("Triggering job...");
  const jobRef = await db.collection("curationJobs").add({
    userId: "test_user",
    status: "pending", // Let's set it to pending to trigger the function
    createdAt: FieldValue.serverTimestamp(),
    inputPayload: {
      artists: "Snapcase",
      projectId: "test_project",
      filters: {}
    }
  });
  console.log("Job created with ID:", jobRef.id);
  
  // Wait a few seconds to see if the emulator logs anything to firestore
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  const doc = await jobRef.get();
  console.log("Job status:", doc.data().status);
  if (doc.data().error) {
    console.log("Job error:", doc.data().error);
  }
}

triggerJob().catch(console.error);
