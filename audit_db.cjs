const { initializeApp, cert } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require("./firebase-service-account.json");

initializeApp({ credential: cert(serviceAccount) });
const auth = getAuth();
const db = getFirestore();

async function runAudit() {
  try {
    const listUsersResult = await auth.listUsers(10);
    listUsersResult.users.forEach((userRecord) => {
      console.log('user', userRecord.email, userRecord.uid);
    });

    // Let's also find all projects in user subcollections
    const users = listUsersResult.users.map(u => u.uid);
    for (const uid of users) {
       const userProjectsSnap = await db.collection("users").doc(uid).collection("projects").get();
       console.log(`\n[USER ${uid}] Found ${userProjectsSnap.size} projects.`);
       userProjectsSnap.forEach(doc => {
          const data = doc.data();
          const isSpaced = data.seedArtists === "Spaced" || data.name === "Spaced" || (data.artistIds && data.artistIds.includes("spaced"));
          if (isSpaced) {
             console.log(`\n===========================================`);
             console.log(`[USER_PROJECT] ID: ${doc.id}`);
             console.log(`[USER_PROJECT] seedArtists: ${data.seedArtists}`);
             console.log(`[USER_PROJECT] artistIds:`, data.artistIds);
             console.log(`[USER_PROJECT] cacheKey:`, data.cacheKey);
             console.log(`[USER_PROJECT] permissions/shared:`, { isShared: data.isShared, sharedWith: data.sharedWith });
          }
       });
    }

  } catch (error) {
    console.error("Audit failed:", error);
  } finally {
    process.exit(0);
  }
}

runAudit();
