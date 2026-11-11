const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

const serviceAccount = require("../firebase-service-account.json");

initializeApp({
    credential: cert(serviceAccount)
});

const db = getFirestore();

async function healStubs() {
    const stubsToMint = {
        "drain": "drain-us",
        "gel": "gel-us",
        "scowl": "scowl-us",
        "spy": "spy-us"
    };

    const batch = db.batch();

    for (const [bare, canonical] of Object.entries(stubsToMint)) {
        const ref = db.collection("artists").doc(bare);
        batch.set(ref, {
            _isStub: true,
            redirectTo: canonical,
            cachedAt: FieldValue.serverTimestamp()
        }, { merge: true });
        console.log(`Prepared stub: ${bare} -> ${canonical}`);
    }

    try {
        await batch.commit();
        console.log("Successfully minted legacy stubs.");
    } catch (e) {
        console.error("Failed to mint stubs:", e);
    }
}

healStubs();
