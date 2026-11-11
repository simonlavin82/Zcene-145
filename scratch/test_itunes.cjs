const { scrapeImageUrlBackend } = require('../functions/lib/services/curatorService.js');

async function test() {
  const result = await scrapeImageUrlBackend("Wu-Tang Clan", "artist", "Hardcore Hip-Hop", "summary");
  console.log("Wu-Tang Clan Result:", result);
}
test();
