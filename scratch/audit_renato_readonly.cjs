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

async function runAudit() {
  console.log("=== STEP 1: INSPECT LIVE FIREBASE AUTH FOR renatocosta.ua@gmail.com ===");
  let renatoAuthUser = null;
  try {
    renatoAuthUser = await auth.getUserByEmail("renatocosta.ua@gmail.com");
    console.log("Found Renato in Firebase Auth:");
    console.log(JSON.stringify({
      uid: renatoAuthUser.uid,
      email: renatoAuthUser.email,
      emailVerified: renatoAuthUser.emailVerified,
      displayName: renatoAuthUser.displayName,
      photoURL: renatoAuthUser.photoURL,
      disabled: renatoAuthUser.disabled,
      metadata: {
        creationTime: renatoAuthUser.metadata.creationTime,
        lastSignInTime: renatoAuthUser.metadata.lastSignInTime,
        lastRefreshTime: renatoAuthUser.metadata.lastRefreshTime,
      },
      providerData: renatoAuthUser.providerData.map(p => ({
        providerId: p.providerId,
        uid: p.uid,
        displayName: p.displayName,
        email: p.email,
        photoURL: p.photoURL,
      })),
      customClaims: renatoAuthUser.customClaims,
      tokensValidAfterTime: renatoAuthUser.tokensValidAfterTime,
    }, null, 2));
  } catch (err) {
    console.error("Error fetching Renato from Auth:", err.message);
  }

  console.log("\n=== STEP 2: LIST ALL FIREBASE AUTH USERS ===");
  try {
    const listResult = await auth.listUsers(100);
    console.log(`Total Auth Users: ${listResult.users.length}`);
    listResult.users.forEach((u, i) => {
      console.log(`[User ${i + 1}] UID: ${u.uid} | Email: ${u.email} | Created: ${u.metadata.creationTime} | LastSignIn: ${u.metadata.lastSignInTime} | Providers: ${u.providerData.map(p => p.providerId).join(", ")}`);
    });
  } catch (err) {
    console.error("Error listing auth users:", err.message);
  }

  console.log("\n=== STEP 3: INSPECT FIRESTORE users/{uid} FOR renatocosta.ua@gmail.com ===");
  if (renatoAuthUser) {
    const userDocRef = db.collection("users").doc(renatoAuthUser.uid);
    const userSnap = await userDocRef.get();
    if (userSnap.exists) {
      console.log(`Found Firestore doc users/${renatoAuthUser.uid}:`);
      console.log(JSON.stringify(userSnap.data(), null, 2));
    } else {
      console.log(`No Firestore doc found at users/${renatoAuthUser.uid}`);
    }

    console.log("\n--- Checking Subcollections on users/{uid} ---");
    const subcollections = await userDocRef.listCollections();
    console.log(`Subcollections found for ${renatoAuthUser.uid}:`, subcollections.map(c => c.id));
    for (const subCol of subcollections) {
      const docsSnap = await subCol.get();
      console.log(`  Subcollection '${subCol.id}': ${docsSnap.size} docs`);
      docsSnap.forEach(d => {
        console.log(`    Doc [${d.id}]:`, JSON.stringify(d.data(), null, 2));
      });
    }
  }

  console.log("\n=== STEP 4: INSPECT ALL FIRESTORE users COLLECTION DOCS ===");
  try {
    const usersSnap = await db.collection("users").get();
    console.log(`Total Firestore 'users' documents: ${usersSnap.size}`);
    for (const d of usersSnap.docs) {
      const data = d.data();
      console.log(`- Doc UID: ${d.id} | Email: ${data.email || 'N/A'} | Balance: ${data.tokenBalance} | Created: ${data.createdAt ? (data.createdAt.toDate ? data.createdAt.toDate().toISOString() : data.createdAt) : 'N/A'} | Updated: ${data.updatedAt ? (data.updatedAt.toDate ? data.updatedAt.toDate().toISOString() : data.updatedAt) : 'N/A'}`);
    }
  } catch (err) {
    console.error("Error reading users collection:", err.message);
  }

  console.log("\n=== STEP 5: CHECK RECENT GLOBAL TOKEN TRANSACTIONS OR PROJECTS BY renatocosta ===");
  if (renatoAuthUser) {
    try {
      const projSnap = await db.collectionGroup("projects").where("userId", "==", renatoAuthUser.uid).get();
      console.log(`CollectionGroup 'projects' where userId == renatoUid: ${projSnap.size}`);
    } catch (e) {
      console.log("CollectionGroup projects query error:", e.message);
    }
    try {
      const txSnap = await db.collectionGroup("tokenTransactions").where("userId", "==", renatoAuthUser.uid).get();
      console.log(`CollectionGroup 'tokenTransactions' where userId == renatoUid: ${txSnap.size}`);
    } catch (e) {
      console.log("CollectionGroup tokenTransactions query error:", e.message);
    }
  }

  console.log("\n=== AUDIT SCRIPT FINISHED ===");
}

runAudit().catch(err => {
  console.error("Fatal error running audit script:", err);
  process.exit(1);
});

