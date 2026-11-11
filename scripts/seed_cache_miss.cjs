const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';

initializeApp({
  projectId: "zcene-production" // Matches emulator default
});
const db = getFirestore();

async function seedCacheMiss() {
  const artistId = 'spaced-usa';
  const aliasId = 'spaced';
  console.log(`[Seed Script] Injecting cache MISS condition for: ${artistId}`);

  try {
    // We inject a record that is missing its imageUrl (to test strict bypass fallback)
    const detailsCache = {
      summary: "Spaced is a hardcore punk band from Buffalo, NY, known for their high-energy performances and infectious, bouncy riffs. Formed in 2021, they quickly gained traction in the underground scene with their demo and subsequent releases.",
      imageUrl: "", // Purposefully blank to test the image scraping bypass fix
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
      graphData: JSON.stringify({
        nodes: [{ id: artistId, label: "Spaced", type: "artist", group: 1 }, { id: "peer1", label: "Peer 1", type: "artist", group: 2 }],
        links: [{ source: artistId, target: "peer1", context: "is musically related to" }],
        synthesisRationale: "[Single-Seed Analysis]\n- Acoustic & Sonics: Heavy hitting riffs.\n- Scene Context: Buffalo NY punk scene.\n- Overlap Insights: Close ties to peers."
      }),
      isPrimarySeed: true,
      hasUniqueSpiderweb: true,
      cachedAt: FieldValue.serverTimestamp(),
      cacheVersion: 2
    };

    await db.collection('artists').doc(artistId).set(payload, { merge: true });
    
    // Also set the alias redirect for "spaced"
    await db.collection('artists').doc(aliasId).set({
      artistId: aliasId,
      cacheKey: aliasId,
      seedArtists: 'Spaced',
      redirectTo: artistId,
      cachedAt: FieldValue.serverTimestamp(),
      cacheVersion: 2
    }, { merge: true });

    console.log(`[Seed Script] Successfully injected cache MISS (blank image) for ${artistId}.`);
    process.exit(0);
  } catch (error) {
    console.error("[Seed Script] Error injecting cache miss:", error);
    process.exit(1);
  }
}

seedCacheMiss();
