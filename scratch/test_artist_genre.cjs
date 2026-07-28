async function testItunes(artist) {
  try {
    const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(artist)}&entity=musicArtist&limit=10`);
    const data = await res.json();
    const validArtists = data.results?.filter(r => r.artistName.toLowerCase() === artist.toLowerCase());
    for (const validArtist of validArtists) {
       console.log(`Artist ID: ${validArtist.artistId} | iTunes Genre: ${validArtist.primaryGenreName}`);
    }
  } catch(e) {}
}
testItunes("Gel");
