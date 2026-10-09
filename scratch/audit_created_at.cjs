const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const serviceAccount = require("../firebase-service-account.json");

initializeApp({
    credential: cert(serviceAccount)
});

const db = getFirestore();

async function auditCreatedAt() {
    let missingArtists = 0;
    let missingLabels = 0;

    const artistsSnap = await db.collection("artists").get();
    artistsSnap.forEach(doc => {
        const data = doc.data();
        if (data._isStub) return; // Skip bare stubs
        if (!data.createdAt) {
            missingArtists++;
            // console.log(`Missing in artist: ${doc.id}`);
        }
    });

    const labelsSnap = await db.collection("labels").get();
    labelsSnap.forEach(doc => {
        const data = doc.data();
        if (data._isStub) return;
        if (!data.createdAt) {
            missingLabels++;
        }
    });

    console.log(`Audit Complete:`);
    console.log(`- Artists lacking createdAt: ${missingArtists}`);
    console.log(`- Labels lacking createdAt: ${missingLabels}`);
}

auditCreatedAt().catch(console.error);
