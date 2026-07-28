// No dotenv needed
const { GoogleGenAI } = require('@google/genai');
const fs = require('fs');

async function scrapeImageUrlBackend(artistName, type, genre, summary) {
  const apiKey = 'AQ.Ab8RN6Kr_t7aKgc1YX8QqeoOcrBftopz1FXWPfh26q0mmftdEw';
  if (!apiKey) return null;

  const ai = new GoogleGenAI({ apiKey });
  const currentModel = "gemini-2.5-flash";

  const prompt = `Find a high-quality, direct HTTPS image URL representing the music ${type}: "${artistName}".
  
Context:
Genre: ${genre}
Bio: ${summary}

USE GOOGLE SEARCH to find a verified artist photo, album cover, or official logo. 

GENRE-CONTEXTUAL IMAGE SOURCING HIERARCHY (STRICTLY ENFORCED):
▸ FOR CONTEMPORARY / INDIE / ELECTRONIC / PUNK / METAL / HIP-HOP / R&B:
  Priority 1 — Official Bandcamp artist page: band photo, header banner, or release artwork.
  Priority 2 — Discogs artist page: press photo or release cover.
  Priority 3 — AllMusic or Pitchfork artist entry: artist portrait or release art.
  Priority 4 — Wikimedia Commons: if a verified artist photo exists there.

CRITICAL OUTPUT REQUIREMENTS:
1. Provide the direct HTTPS image URL in your response.
2. If you cannot find ANY verified image from the priority sources above, state that no verified image was found.`;

  try {
    const response = await ai.models.generateContent({
      model: currentModel,
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }]
      }
    });

    const text = response.text?.trim() || '';
    if (text.toLowerCase().includes('null') && !text.includes('http')) return null;
    
    const urlMatch = text.match(/https:\/\/[^\s"'<>()\[\]]+/i);
    if (urlMatch) {
      const extractedUrl = urlMatch[0];
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        const imgRes = await fetch(extractedUrl, { 
          method: 'HEAD', 
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
          },
          signal: controller.signal 
        });
        clearTimeout(timeoutId);
        
        if (imgRes.ok) {
          return extractedUrl;
        } else {
          console.warn(`[scrapeImageUrlBackend] Extracted URL returned ${imgRes.status}: ${extractedUrl}`);
          return null;
        }
      } catch (fetchErr) {
        console.warn(`[scrapeImageUrlBackend] URL validation failed for ${extractedUrl}:`, fetchErr.message);
        return null;
      }
    }
    return null;
  } catch (err) {
    console.error(`[scrapeImageUrlBackend] Scrape failed for ${artistName}:`, err);
    return null;
  }
}

async function runTest() {
  const artists = [
    {
      name: 'Drug Church',
      type: 'artist',
      genre: 'Post-Hardcore, Alternative Rock',
      summary: 'Drug Church is an American post-hardcore band formed in Albany, New York, in 2011. Known for their aggressive yet melodic sound.'
    },
    {
      name: 'Spaced',
      type: 'artist',
      genre: 'Hardcore Punk',
      summary: 'Spaced is an American hardcore punk band from Buffalo, New York. They bring a highly energetic, fast-paced edge to modern punk.'
    },
    {
      name: 'Scowl',
      type: 'artist',
      genre: 'Hardcore Punk, Alternative Rock',
      summary: 'Scowl is an American hardcore punk band from Santa Cruz, California. They fuse aggressive hardcore with infectious alternative rock melodies.'
    }
  ];

  console.log('\n================================================================');
  console.log(' TWO-STEP IMAGE EXTRACTION & HEAD VALIDATION TEST');
  console.log('================================================================\n');

  for (const artist of artists) {
    console.log(`\nTesting ${artist.name}...`);
    const url = await scrapeImageUrlBackend(artist.name, artist.type, artist.genre, artist.summary);
    if (url) {
      console.log(`✅ SUCCESS [200 OK]: ${url}`);
    } else {
      console.log(`❌ FAILED: No valid image found or HEAD validation failed.`);
    }
  }
  console.log('\n================================================================\n');
}

runTest();
