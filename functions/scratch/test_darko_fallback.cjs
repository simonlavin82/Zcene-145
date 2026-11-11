const { scrapeImageUrlBackend } = require('../lib/services/curatorService.js');

async function run() {
    console.log("Testing Darko fallback...");
    const url = await scrapeImageUrlBackend(
        "Darko",
        "artist",
        "Progressive Deathcore",
        "Darko (frequently known as Darko US) is an American progressive deathcore project formed in 2020.",
        "Salt Lake City, USA"
    );
    console.log("Result URL:", url);
}

run().catch(console.error);
