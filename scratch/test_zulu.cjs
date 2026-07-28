async function testItunes(term) {
  try {
    const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=album&limit=5`);
    const data = await res.json();
    console.log(`\nSearch Term: "${term}"`);
    if (data.results && data.results.length > 0) {
      for(let i=0; i<Math.min(3, data.results.length); i++) {
        console.log(` ${i+1}. Artist: ${data.results[i].artistName} | Album: ${data.results[i].collectionName} | Genre: ${data.results[i].primaryGenreName}`);
      }
    }
  } catch(e) {}
}

async function run() {
  await testItunes("Zulu punk");
  await testItunes("Zulu metal");
  await testItunes("Zulu metalcore");
}
run();
