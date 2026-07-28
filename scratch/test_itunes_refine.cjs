async function testItunes(term) {
  try {
    const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=album&limit=5`);
    const data = await res.json();
    console.log(`\nSearch Term: "${term}"`);
    if (data.results && data.results.length > 0) {
      for(let i=0; i<Math.min(3, data.results.length); i++) {
        console.log(` ${i+1}. Artist: ${data.results[i].artistName} | Album: ${data.results[i].collectionName} | Genre: ${data.results[i].primaryGenreName}`);
      }
    } else {
      console.log(" No results found.");
    }
  } catch(e) { console.error(e); }
}

async function run() {
  await testItunes("Spaced");
  await testItunes("Spaced hardcore");
  await testItunes("Spaced punk");
  await testItunes("Spaced band");
  
  await testItunes("Gel");
  await testItunes("Gel hardcore");
  await testItunes("Gel punk");
  
  await testItunes("Zulu");
  await testItunes("Zulu hardcore");
  await testItunes("Zulu band");
}
run();
