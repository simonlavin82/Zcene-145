async function testItunes(artist) {
  try {
    const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(artist)}&entity=musicArtist&limit=50`);
    const data = await res.json();
    
    // Exact match filter (case insensitive)
    const validArtists = data.results?.filter(r => r.artistName.toLowerCase() === artist.toLowerCase());
    console.log(`Found ${validArtists.length} exact matches for ${artist}:`);
    for (const validArtist of validArtists) {
       console.log(`  Artist ID: ${validArtist.artistId}`);
       // Lookup their albums!
       const albumRes = await fetch(`https://itunes.apple.com/lookup?id=${validArtist.artistId}&entity=album&limit=1`);
       const albumData = await albumRes.json();
       const album = albumData.results?.find(r => r.wrapperType === 'collection');
       if (album) {
         console.log(`       Album: ${album.collectionName} | Genre: ${album.primaryGenreName}`);
       }
    }
  } catch(e) {}
}
testItunes("Zulu");
testItunes("Gel");
