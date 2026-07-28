async function testItunes(artist, genre) {
  try {
    const term = `${artist} ${genre}`;
    const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=album&limit=10`);
    const data = await res.json();
    
    const validResult = data.results?.find(r => r.artistName.toLowerCase() === artist.toLowerCase());
    if (validResult) {
       console.log(`[PASS] ${artist} + ${genre} -> Found exact match: ${validResult.collectionName}`);
    } else {
       console.log(`[FAIL] ${artist} + ${genre} -> No exact artist match found in top 10`);
    }
  } catch(e) {}
}
async function run() {
  await testItunes("Spaced", "Hardcore Punk");
  await testItunes("Gel", "Hardcore Punk");
  await testItunes("Zulu", "Hardcore Punk");
  await testItunes("End It", "Hardcore Punk");
  await testItunes("Buggin", "Hardcore Punk");
  await testItunes("Turnstile", "Hardcore Punk");
  await testItunes("Scowl", "Hardcore Punk");
}
run();
