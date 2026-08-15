const admin = require('firebase-admin');

// Ensure we connect to the emulator
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';

admin.initializeApp({
    projectId: 'zcene-production' // Match the frontend's emulator project ID
});

const db = admin.firestore();

async function run() {
    console.log('Seeding Flow 3 (Seed Hit with Missing Relationships) data for "turnstile"');

    // 1. Create the redirect document
    await db.collection('artists').doc('turnstile').set({
        cacheKey: 'turnstile',
        redirectTo: 'turnstile-usa',
        cacheVersion: 4,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log('Created redirect document: turnstile -> turnstile-usa');

    // 2. Create the seed document with details but NO graphData
    await db.collection('artists').doc('turnstile-usa').set({
        cacheKey: 'turnstile-usa',
        artistId: 'turnstile',
        seedArtists: 'turnstile',
        cacheVersion: 4,
        detailsCache: JSON.stringify({
            summary: "Flow 3 Mock Bio for Turnstile. This artist exists in cache but lacks graph data.",
            imageUrl: "https://example.com/turnstile.jpg",
            details: {
                artist: "Turnstile",
                genre: "HARDCORE PUNK",
                origin: "Baltimore, MD, USA",
                founded: "2010"
            }
        }),
        // NOTE: Deliberately omitting graphData
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log('Created seed document: turnstile-usa (Missing graphData)');

    console.log('Seed complete. You can now run a fresh Flow 3 test.');
}

run().catch(console.error);
