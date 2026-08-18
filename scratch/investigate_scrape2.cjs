const { scrapeImageUrlBackend } = require('../functions/lib/services/curatorService.js');
async function test() {
  const url = await scrapeImageUrlBackend("Korn United States", "artist", "Nu Metal", "Korn is an American band");
  console.log("Korn United States URL:", url);
}
test().catch(console.error);
