async function testItunes(artist) {
  try {
    const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(artist)}&entity=musicArtist&limit=50`);
    const data = await res.json();
    
    // Exact match filter (case insensitive)
    const validArtist = data.results?.find(r => r.artistName.toLowerCase() === artist.toLowerCase());
    
    if (validArtist) {
       console.log(`[PASS] ${artist} -> Found Artist ID: ${validArtist.artistId}`);
       // Lookup their albums!
       const albumRes = await fetch(`https://itunes.apple.com/lookup?id=${validArtist.artistId}&entity=album&limit=1`);
       const albumData = await albumRes.json();
       const album = albumData.results?.find(r => r.wrapperType === 'collection');
       if (album) {
         console.log(`       Album: ${album.collectionName} | Image: ${album.artworkUrl100}`);
       } else {
         console.log(`       No albums found for this artist ID.`);
       }
    } else {
       console.log(`[FAIL] ${artist} -> No exact artist match found in top 50`);
    }
  } catch(e) {}
}
async function run() {
  await testItunes("Spaced");
  await testItunes("Gel");
  await testItunes("Zulu");
  await testItunes("End It");
  await testItunes("Buggin");
  await testItunes("Turnstile");
  await testItunes("Scowl");
}
run();
