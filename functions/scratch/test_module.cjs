const { scrapeImageUrlBackend } = require('../lib/services/curatorService.js');

async function run() {
    const url = await scrapeImageUrlBackend("Forus", "artist", "Melodic Hardcore / Skate Punk", "Forus pushed the boundaries of modern skatepunk by injecting blistering French hardcore with dizzying progressive riffing.", "France");
    console.log("Result URL:", url);
}

run();
