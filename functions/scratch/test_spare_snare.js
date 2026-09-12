const { scrapeImageUrlBackend } = require('../lib/services/curatorService.js');

async function testSpareSnare() {
    console.log('Testing scrapeImageUrlBackend for "Spare Snare" with genre "Lo-Fi Indie Rock"');
    
    // Test parameters
    // artistName, type, genre, summary
    const result = await scrapeImageUrlBackend('Spare Snare', 'artist', 'Lo-Fi Indie Rock', '');
    
    console.log('--- Result ---');
    if (result) {
        console.log('Success! Found Image URL:', result);
    } else {
        console.log('Failure! Function returned null.');
    }
}

testSpareSnare();
