const { scrapeImageUrlBackend } = require('../functions/lib/services/curatorService.js');
async function test() {
  const url = await scrapeImageUrlBackend("korn", "artist", "Nu Metal", "Korn is an American band");
  console.log("Korn URL:", url);
}
test().catch(console.error);
