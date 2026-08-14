const admin = require('firebase-admin');

process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';

admin.initializeApp({
  projectId: "zcene-production" // Matches emulator default
});
const db = admin.firestore();

async function seedCacheHit() {
  const artistId = 'spaced-usa';
  console.log(`[Seed Script] Injecting fully hydrated cache hit for: ${artistId}`);

  const detailsCache = {
    summary: "Spaced is a hardcore punk band from Buffalo, NY, known for their high-energy performances and infectious, bouncy riffs. Formed in 2021, they quickly gained traction in the underground scene with their demo and subsequent releases.",
    imageUrl: "https://f4.bcbits.com/img/0034431835_10.jpg",
    members: ["Lexi Reyngoudt (Vocals)", "Donny Arthur (Guitar)", "Joe Ruggiero (Guitar)", "John Heron (Bass)", "Collin Kather (Drums)"],
    details: {
      genre: "Hardcore Punk",
      origin: "Buffalo, USA",
      founded: "2021",
      notableArtists: [],
      artist: "Spaced"
    },
    links: [
      { site: "Wikipedia", url: "https://en.wikipedia.org/wiki/Spaced_(band)" }
    ],
    discography: [
      { albumName: "Spaced Jams", releaseYear: "2022" },
      { albumName: "This Is All We Ever Get", releaseYear: "2024" }
    ],
    recommendationReason: "Spaced brings an undeniable bounce and groove to modern hardcore, making them a defining force in the upstate New York scene.",
    youtubeVideoId: "dQw4w9WgXcQ",
    youtubeSearchQuery: "Spaced hardcore punk official music video"
  };

  const payload = {
    artistId: artistId,
    cacheKey: artistId,
    seedArtists: "Spaced",
    detailsCache: JSON.stringify(detailsCache),
    cachedAt: admin.firestore.FieldValue.serverTimestamp(),
    cacheVersion: 2
  };

  try {
    await db.collection('artists').doc(artistId).set(payload, { merge: true });
    
    // Also set the alias redirect for "spaced"
    await db.collection('artists').doc('spaced').set({
      artistId: 'spaced',
      cacheKey: 'spaced',
      seedArtists: 'Spaced',
      redirectTo: artistId,
      cachedAt: admin.firestore.FieldValue.serverTimestamp(),
      cacheVersion: 2
    }, { merge: true });

    console.log(`[Seed Script] Successfully injected cache hit for ${artistId} and redirect for "spaced".`);
    process.exit(0);
  } catch (error) {
    console.error("[Seed Script] Error injecting cache hit:", error);
    process.exit(1);
  }
}

seedCacheHit();
