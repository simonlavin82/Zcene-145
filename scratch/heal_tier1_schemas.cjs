const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const serviceAccount = require("../firebase-service-account.json");

initializeApp({
    credential: cert(serviceAccount)
});

const db = getFirestore();

async function healTier1Schemas() {
    let healedArtists = 0;
    let healedLabels = 0;

    const artistsSnap = await db.collection("artists").get();
    const batch = db.batch();
    let batchCount = 0;

    async function commitBatchIfNeeded() {
        if (batchCount >= 400) {
            await batch.commit();
            batchCount = 0;
        }
    }

    for (const doc of artistsSnap.docs) {
        const data = doc.data();
        if (data._isStub) continue; // Skip bare stubs

        if (!data.createdAt) {
            const updatePayload = {
                createdAt: doc.createTime, // Use internal createTime
                cacheVersion: data.cacheVersion || 4,
                cacheKey: data.cacheKey || doc.id,
                artistId: data.artistId || doc.id,
                isDeep: data.isDeep !== undefined ? data.isDeep : true
            };
            if (!data.detailsCache) {
                updatePayload.detailsCache = { _isStub: true };
            }
            batch.update(doc.ref, updatePayload);
            batchCount++;
            healedArtists++;
            await commitBatchIfNeeded();
        }
    }

    const labelsSnap = await db.collection("labels").get();
    for (const doc of labelsSnap.docs) {
        const data = doc.data();
        if (data._isStub) continue;

        if (!data.createdAt) {
            const updatePayload = {
                createdAt: doc.createTime,
                cacheVersion: data.cacheVersion || 4,
                cacheKey: data.cacheKey || doc.id,
                labelId: data.labelId || doc.id,
                isDeep: data.isDeep !== undefined ? data.isDeep : true
            };
            if (!data.detailsCache) {
                updatePayload.detailsCache = { _isStub: true };
            }
            batch.update(doc.ref, updatePayload);
            batchCount++;
            healedLabels++;
            await commitBatchIfNeeded();
        }
    }

    if (batchCount > 0) {
        await batch.commit();
    }

    console.log(`Heal Complete:`);
    console.log(`- Artists healed: ${healedArtists}`);
    console.log(`- Labels healed: ${healedLabels}`);
}

healTier1Schemas().catch(console.error);
