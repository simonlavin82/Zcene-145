const https = require('https');

function fetchItunes(query) {
    return new Promise((resolve, reject) => {
        const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=musicArtist&limit=5`;
        https.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(JSON.parse(data)));
        }).on('error', reject);
    });
}

async function run() {
    console.log("=== Query: Darko ===");
    const res1 = await fetchItunes("Darko");
    console.log(JSON.stringify(res1.results.map(r => ({ artistName: r.artistName, primaryGenreName: r.primaryGenreName })), null, 2));

    console.log("\n=== Query: Darko US ===");
    const res2 = await fetchItunes("Darko US");
    console.log(JSON.stringify(res2.results.map(r => ({ artistName: r.artistName, primaryGenreName: r.primaryGenreName })), null, 2));
}

run();
