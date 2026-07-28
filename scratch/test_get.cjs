async function testGet() {
  const url = "https://f4.bcbits.com/img/0034293026_10.jpg";
  const imgRes = await fetch(url, { 
    method: 'GET', 
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
    }
  });
  console.log(`GET Status: ${imgRes.status}`);
  console.log(`GET Content-Type: ${imgRes.headers.get('content-type')}`);
}
testGet();
