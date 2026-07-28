async function testItunes(artist) {
  try {
    const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(artist)}&entity=musicArtist&limit=1`);
    const data = await res.json();
    console.log(`Artist: ${artist}`);
    if (data.results && data.results.length > 0) {
      console.log(`Found: ${data.results[0].artistName}`);
      console.log(`Link: ${data.results[0].artistLinkUrl}`);
      // iTunes musicArtist doesn't usually return artist images in the basic search. Let's try album search.
    } else {
      console.log("No artist found");
    }
    
    // Album search to get artwork
    const albumRes = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(artist)}&entity=album&limit=1`);
    const albumData = await albumRes.json();
    if (albumData.results && albumData.results.length > 0) {
      // Get the 100x100 artwork and replace with 600x600
      let artwork = albumData.results[0].artworkUrl100;
      artwork = artwork.replace('100x100bb', '600x600bb');
      console.log(`Album Artwork: ${artwork}`);
    } else {
      console.log("No album found");
    }
  } catch(e) { console.error(e); }
}

async function run() {
  await testItunes("Spaced");
  console.log("---");
  await testItunes("Scowl");
  console.log("---");
  await testItunes("Turnstile");
}
run();
