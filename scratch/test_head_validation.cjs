const urls = [
  "https://f4.bcbits.com/img/0034443916_10.jpg", // Bandcamp
  "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a7/React-icon.svg/512px-React-icon.svg.png", // Wikimedia
  "https://i.scdn.co/image/ab6761610000e5eba03696716c9ee605006047fd" // Spotify
];

async function testUrls() {
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        method: 'HEAD',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
        }
      });
      console.log(`URL: ${url}`);
      console.log(`Status: ${res.status}`);
      console.log(`Content-Type: ${res.headers.get('content-type')}\n`);
    } catch (e) {
      console.error(`Error fetching ${url}:`, e);
    }
  }
}
testUrls();
