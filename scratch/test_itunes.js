async function testItunes(artistName, zceneGenre) {
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(artistName)}&entity=musicArtist&limit=20`;
  const res = await fetch(url);
  const data = await res.json();
  const exact = data.results.filter(r => r.artistName.toLowerCase() === artistName.toLowerCase());
  console.log(`\nTesting ${artistName}`);
  if (exact.length === 0) {
    console.log("No exact match.");
    return;
  }
  const zceneGenreLower = (zceneGenre || "").toLowerCase();
  const strict = exact.filter(r => {
    const itunesGenre = (r.primaryGenreName || "").toLowerCase();
    console.log(`Found iTunes Genre: ${itunesGenre}`);
    return zceneGenreLower.includes(itunesGenre) || itunesGenre.includes(zceneGenreLower);
  });
  console.log(`Strict Matches: ${strict.length}`);
}

testItunes("Spaced", "Hardcore Punk").then(() => testItunes("Restraining Order", "Hardcore Punk"));
