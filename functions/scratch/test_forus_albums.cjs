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

function fetchAlbums(artistId) {
    return new Promise((resolve, reject) => {
        const url = `https://itunes.apple.com/lookup?id=${artistId}&entity=album&limit=5`;
        https.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(JSON.parse(data)));
        }).on('error', reject);
    });
}

async function run() {
    const res = await fetchItunes("Forus");
    for (const artist of res.results) {
        if (artist.artistName.toLowerCase().replace(/[^a-z0-9]/g, '') === 'forus') {
            console.log("Artist:", artist.artistName, "Genre:", artist.primaryGenreName, "ID:", artist.artistId);
            const albums = await fetchAlbums(artist.artistId);
            for (const album of albums.results) {
                if (album.wrapperType === 'collection') {
                    console.log("  Album:", album.collectionName);
                }
            }
        }
    }
}

run();
