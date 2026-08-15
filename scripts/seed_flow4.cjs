const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';

initializeApp({
  projectId: "zcene-production" // Matches emulator default
});
const db = getFirestore();

async function seedFlow4() {
  const artistId = 'turnstile-usa';
  console.log(`[Seed Script] Injecting fully hydrated cache hit for: ${artistId}`);

  const detailsCache = {
    summary: "Turnstile is an American hardcore punk band from Baltimore, Maryland, formed in 2010. They are known for blending hardcore punk with alternative metal, pop, and R&B elements.",
    imageUrl: "https://f4.bcbits.com/img/0023602148_10.jpg",
    members: ["Brendan Yates (Vocals)", "Franz Lyons (Bass)", "Daniel Fang (Drums)", "Pat McCrory (Guitar)", "Meg Mills (Guitar)"],
    details: {
      genre: "Hardcore Punk",
      origin: "Baltimore, USA",
      founded: "2010",
      notableArtists: [],
      artist: "Turnstile"
    },
    links: [
      { site: "Wikipedia", url: "https://en.wikipedia.org/wiki/Turnstile_(band)" }
    ],
    discography: [
      { albumName: "Nonstop Feeling", releaseYear: "2015" },
      { albumName: "Time & Space", releaseYear: "2018" },
      { albumName: "Glow On", releaseYear: "2021" }
    ],
    recommendationReason: "Turnstile has redefined modern hardcore by expanding its sonic palette and mainstream accessibility.",
    youtubeVideoId: "dQw4w9WgXcQ",
    youtubeSearchQuery: "Turnstile hardcore punk official music video"
  };

  const payload = {
    artistId: artistId,
    cacheKey: artistId,
    seedArtists: "Turnstile",
    detailsCache: JSON.stringify(detailsCache),
    cachedAt: FieldValue.serverTimestamp(),
    cacheVersion: 2
  };

  try {
    await db.collection('artists').doc(artistId).set(payload, { merge: true });
    
    // Set alias redirect for "turnstile"
    await db.collection('artists').doc('turnstile').set({
      artistId: 'turnstile',
      cacheKey: 'turnstile',
      seedArtists: 'Turnstile',
      redirectTo: artistId,
      cachedAt: FieldValue.serverTimestamp(),
      cacheVersion: 2
    }, { merge: true });

    console.log(`[Seed Script] Successfully injected cache hit for ${artistId} and redirect for "turnstile".`);
    console.log(`[Seed Script] Militarie Gun will remain unseeded to test the cache miss fallback flow.`);
    process.exit(0);
  } catch (error) {
    console.error("[Seed Script] Error injecting cache hit:", error);
    process.exit(1);
  }
}

seedFlow4();
