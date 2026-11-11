const path = require('path');
const fs = require('fs');

// Load environment variables manually from root .env to ensure GEMINI_API_KEY is available
const envPath = path.resolve(__dirname, '../../.env');
if (fs.existsSync(envPath)) {
    const envConfig = fs.readFileSync(envPath, 'utf8');
    envConfig.split('\n').forEach(line => {
        const match = line.match(/^([^#]+?)=(.+)$/);
        if (match) {
            process.env[match[1].trim()] = match[2].trim();
        }
    });
}

// Import the compiled logic
const { scrapeImageUrlBackend } = require('../lib/services/curatorService.js');

async function test() {
    console.log('Testing scrapeImageUrlBackend for "Big Boy" with genre "Hardcore Punk"');
    console.log('------------------------------------------------------------------');
    
    // We expect iTunes to find the Reggaeton artist, but fail the strict genre match.
    // It should then fallback to Gemini (if API key is present) or return null (if not/hallucinated).
    const result = await scrapeImageUrlBackend('Big Boy', 'artist', 'Hardcore Punk', 'Big Boy is a driving force in the modern Bay Area hardcore scene...');
    
    console.log('------------------------------------------------------------------');
    console.log('Final Returned Image URL:', result);
    console.log('------------------------------------------------------------------');
}

test().catch(console.error);
