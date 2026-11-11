const https = require('https');

function fetchItunes(query) {
    return new Promise((resolve, reject) => {
        const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=musicArtist&limit=10`;
        https.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(JSON.parse(data)));
        }).on('error', reject);
    });
}

async function run() {
    const res = await fetchItunes("Forus");
    console.log(JSON.stringify(res.results.map(r => ({ artistName: r.artistName, primaryGenreName: r.primaryGenreName })), null, 2));
}

run();
