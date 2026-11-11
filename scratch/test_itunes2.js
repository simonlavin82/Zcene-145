async function testItunes(artistName) {
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(artistName)}&entity=musicArtist&limit=20`;
  const res = await fetch(url);
  const data = await res.json();
  const exact = data.results.filter(r => r.artistName.toLowerCase() === artistName.toLowerCase());
  const strict = exact.filter(r => {
    const itunesGenre = (r.primaryGenreName || "").toLowerCase();
    return "hardcore punk".includes(itunesGenre) || itunesGenre.includes("hardcore punk");
  });
  if (strict.length > 0) {
     const id = strict[0].artistId;
     const albumUrl = `https://itunes.apple.com/lookup?id=${id}&entity=album&limit=1`;
     const albumRes = await fetch(albumUrl);
     const albumData = await albumRes.json();
     const album = albumData.results?.find(r => r.wrapperType === 'collection');
     console.log(artistName, "Image:", album?.artworkUrl100);
  } else {
     console.log(artistName, "No strict match");
  }
}
testItunes("Spaced");
