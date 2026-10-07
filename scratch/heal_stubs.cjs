const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const serviceAccount = require("../firebase-service-account.json");

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function healStubs() {
  const batch = db.batch();

  // 1. Heal Buggin
  const bugginRef = db.collection('artists').doc('buggin');
  batch.set(bugginRef, {
    _isStub: true,
    redirectTo: 'buggin-us',
    cachedAt: FieldValue.serverTimestamp()
  }, { merge: true });
  console.log("[Heal] Minted stub for: buggin -> buggin-us");

  // 2. Heal Scowl
  const scowlRef = db.collection('artists').doc('scowl');
  batch.set(scowlRef, {
    _isStub: true,
    redirectTo: 'scowl-us',
    cachedAt: FieldValue.serverTimestamp()
  }, { merge: true });
  console.log("[Heal] Minted stub for: scowl -> scowl-us");

  // 3. Heal Ghost (Remove bloated payloads)
  const ghostRef = db.collection('artists').doc('ghost');
  batch.update(ghostRef, {
    graphData: FieldValue.delete(),
    synthesisRationale: FieldValue.delete()
  });
  console.log("[Heal] Stripped heavy payload from stub: ghost");

  try {
    await batch.commit();
    console.log("✅ Healing complete.");
  } catch (err) {
    console.error("❌ Error committing batch:", err);
  }
}

healStubs().catch(console.error);
