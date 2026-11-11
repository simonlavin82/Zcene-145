const { scrapeImageUrlBackend } = require('./functions/lib/services/curatorService.js');
async function test() {
  console.log("Testing Spaced...");
  let img1 = await scrapeImageUrlBackend("Spaced", "artist", "Hardcore Punk", "Spaced is a hardcore band from Buffalo");
  console.log("Result Spaced:", img1);

  console.log("Testing Restraining Order...");
  let img2 = await scrapeImageUrlBackend("Restraining Order", "artist", "Hardcore Punk", "Restraining Order is a hardcore band");
  console.log("Result Restraining Order:", img2);
  
  console.log("Testing Flatspot Records...");
  let img3 = await scrapeImageUrlBackend("Flatspot Records", "label", "Hardcore Punk", "Flatspot Records is a label");
  console.log("Result Flatspot Records:", img3);
}
test().catch(console.error);
