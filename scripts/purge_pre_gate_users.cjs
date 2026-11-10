const path = require("path");
const { initializeApp, cert, getApps } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore } = require("firebase-admin/firestore");

const serviceAccount = require(path.resolve(__dirname, "../firebase-service-account.json"));
if (!getApps().length) {
  initializeApp({ credential: cert(serviceAccount) });
}

const auth = getAuth();
const db = getFirestore();

const UNAUTHORIZED_UIDS = [
  "NxnmMuUR2xNUKqoTnTMd2u7RiyV2", // renatocosta.ua@gmail.com
  "09eSHN1MgebQrExGJf8AbIAJUmZ2", // inkenmaria@icloud.com
  "pZU8ggh2WUbSmsfh0xtJloXxXuF2", // liltatoo854@gmail.com
  "pRB46EE704SUkw13qI941CGOqZD2", // liamnugent75@gmail.com
  "fty4GC4Qiya6KH7uje3ANyzjJAo2", // 25g0123@aghs.gakusen.ac.jp
];

const RENATO_UID = "NxnmMuUR2xNUKqoTnTMd2u7RiyV2";

async function purgePreGateUsers() {
  console.log("=== PHASE 1: PURGE PRE-GATE USERS ===");

  // 1. Delete Firestore user document for Renato
  const renatoRef = db.collection("users").doc(RENATO_UID);
  const renatoSnap = await renatoRef.get();
  if (renatoSnap.exists) {
    console.log(`Deleting Firestore doc at users/${RENATO_UID}...`);
    await renatoRef.delete();
    console.log(`Successfully deleted Firestore doc users/${RENATO_UID}`);
  } else {
    console.log(`Firestore doc users/${RENATO_UID} does not exist.`);
  }

  // 2. Delete all 5 unauthorized Firebase Auth accounts
  for (const uid of UNAUTHORIZED_UIDS) {
    try {
      console.log(`Deleting Firebase Auth user ${uid}...`);
      await auth.deleteUser(uid);
      console.log(`Successfully deleted Firebase Auth user ${uid}`);
    } catch (err) {
      if (err.code === "auth/user-not-found") {
        console.log(`User ${uid} not found in Firebase Auth (already deleted).`);
      } else {
        console.error(`Error deleting Firebase Auth user ${uid}:`, err.message);
      }
    }
  }

  // 3. Verification
  console.log("\n=== VERIFICATION ===");
  const authUsers = await auth.listUsers(100);
  console.log(`Remaining Firebase Auth Users (${authUsers.users.length}):`);
  authUsers.users.forEach(u => {
    console.log(` - UID: ${u.uid} | Email: ${u.email} | Created: ${u.metadata.creationTime}`);
  });

  const firestoreUsers = await db.collection("users").get();
  console.log(`Remaining Firestore 'users' documents (${firestoreUsers.size}):`);
  firestoreUsers.forEach(d => {
    const data = d.data();
    console.log(` - Doc UID: ${d.id} | Email: ${data.email || 'N/A'}`);
  });
}

purgePreGateUsers().catch(err => {
  console.error("Fatal error during purge:", err);
  process.exit(1);
});

