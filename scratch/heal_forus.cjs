const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const serviceAccount = require("../firebase-service-account.json");

initializeApp({
    credential: cert(serviceAccount)
});

const db = getFirestore();

async function healForus() {
    const batch = db.batch();
    const ref = db.collection("artists").doc("forus");
    
    batch.set(ref, {
        _isStub: true,
        redirectTo: "forus-fr",
        cachedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    
    console.log(`Prepared stub: forus -> forus-fr`);
    
    try {
        await batch.commit();
        console.log("Successfully minted legacy stub for forus.");
    } catch (e) {
        console.error("Failed to mint stub:", e);
    }
}

healForus();
