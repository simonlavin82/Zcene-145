const { scrapeImageUrlBackend } = require('../functions/lib/services/curatorService.js');
async function test() {
  const url = await scrapeImageUrlBackend("korn", "artist", "Nu Metal", "Korn is an American band");
  console.log("Korn URL:", url);
  const url2 = await scrapeImageUrlBackend("deftones", "artist", "Alternative Metal", "Deftones is an American band");
  console.log("Deftones URL:", url2);
}
test().catch(console.error);
