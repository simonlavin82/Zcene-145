// Native fetch in Node 24

async function checkItunes(artistName) {
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(artistName)}&entity=musicArtist&limit=5`;
  const res = await fetch(url);
  const data = await res.json();
  
  console.log(`\n=== Results for ${artistName} ===`);
  const exactMatches = data.results?.filter((r) => (r.artistName || "").toLowerCase() === artistName.toLowerCase()) || [];
  
  console.log(`Found ${exactMatches.length} exact matches.`);
  exactMatches.forEach(r => {
    console.log(`- ID: ${r.artistId}`);
    console.log(`- Artist Name: ${r.artistName}`);
    console.log(`- Primary Genre: ${r.primaryGenreName}`);
  });
}

async function run() {
  await checkItunes('Wu-Tang Clan');
  await checkItunes('Jay Z');
  await checkItunes('Jay-Z');
}

run();
