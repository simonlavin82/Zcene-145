async function getOgImage(url) {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    if (!res.ok) return null;
    const html = await res.text();
    const match = html.match(/<meta property="og:image" content="([^"]+)"/i);
    return match ? match[1] : null;
  } catch(e) { return null; }
}

async function run() {
  console.log("Spotify Scowl:", await getOgImage("https://open.spotify.com/artist/41QWv1jOqH0YwX9Btb9L3Y"));
  console.log("Bandcamp Spaced:", await getOgImage("https://spaced.bandcamp.com/"));
  console.log("Last.fm Gel:", await getOgImage("https://www.last.fm/music/Gel"));
}
run();
