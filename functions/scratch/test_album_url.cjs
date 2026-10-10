const https = require('https');
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
fetchAlbums(1592996877).then(res => console.log(JSON.stringify(res, null, 2)));
