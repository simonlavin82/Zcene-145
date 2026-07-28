'use strict';

const { GoogleGenAI } = require('@google/genai');

const FETCH_NODE_DETAILS_PROMPT_TEMPLATE = `Please provide detailed information for the music entity: "{{nodeIdentifier}}" (type: {{nodeType}}).
    
    Context:
    - Seed artists: {{seedArtists}}.
    - Connected nodes: {{contextNodes}}.
    - Date: {{currentDate}}.
    
    USE GOOGLE SEARCH to find:
    1. The most accurate bio and cultural significance.
    2. A high-quality, direct HTTPS image URL representing the artist or label.
    
    GENRE-CONTEXTUAL IMAGE SOURCING HIERARCHY (STRICTLY ENFORCED):
    First, infer the artist's genre context from the entity name, seed artists, connected nodes, and your own knowledge. Then apply the appropriate sourcing priority:

    ▸ FOR CONTEMPORARY / INDIE / ELECTRONIC / PUNK / METAL / HIP-HOP / R&B:
      Priority 1 — Official Bandcamp artist page: band photo, header banner, or release artwork.
      Priority 2 — Discogs artist page: press photo or release cover.
      Priority 3 — AllMusic or Pitchfork artist entry: artist portrait or release art.
      Priority 4 — Wikimedia Commons: if a verified artist photo exists there.
      Priority 5 — Official label page or release page directly associated with the band.

    ACCEPTED IMAGE TYPES (all genre contexts): press photos, live performance photos, official band/artist portraits, album artwork, release covers, band logos, and official band banners or headers.

    FORBIDDEN IMAGE SOURCES (all genre contexts): Generic stock photo sites...
    If you cannot find ANY verified image from the priority sources above, you MUST omit imageUrl entirely (return null).
    3. Confirmed top 3 studio albums.
    4. A verified, active YouTube video for the artist. 
    
    CRITICAL OUTPUT REQUIREMENTS (STRICTLY ENFORCED):
    1. You MUST respond with a single, valid JSON object matching the schema below.
    
    Your task is to generate a JSON object matching this structure precisely:
    {
      "summary": "A scannable bio (approx. 100 words)...",
      "imageUrl": "https://... (press photo, live shot, album artwork, logo, banner — or null if nothing verified found)",
      "members": ["Name (Role)"],
      "details": {
        "genre": "...",
        "origin": "...",
        "founded": "YYYY",
        "notableArtists": []
      },
      "links": [],
      "discography": [],
      "recommendationReason": "...",
      "youtubeVideoId": "dQw4w9WgXcQ",
      "youtubeSearchQuery": "..."
    }`;

const TRUSTED_IMAGE_DOMAINS = [
  'upload.wikimedia.org',
  'commons.wikimedia.org',
  'f4.bcbits.com', 'f1.bcbits.com', 'f2.bcbits.com', 'f3.bcbits.com',
  'i.discogs.com', 'img.discogs.com',
  'i.scdn.co',
  'lastfm.freetls.fastly.net',
  'coverartarchive.org',
  'assets.bandcamp.com',
  'cdn.allmusic.com',
];

const IMAGE_EXTENSIONS = /\.(jpg|jpeg|png|webp|gif|avif|bmp|tiff?)(\?|#|$)/i;
const IMAGE_PATH_SEGMENTS = /\/(img|image|images|photo|photos|media|assets|thumbnail|thumb|artwork)\//i;

const sanitizeString = (str) => {
  if (typeof str !== 'string') return "";
  return str.replace(/\[\d+\]/g, '').replace(/\(\d+\)/g, '').trim();
};

const sanitizeImageUrl = (rawUrl, sanitizeStrFn) => {
  if (!rawUrl || typeof rawUrl !== 'string') return undefined;
  if (rawUrl.includes('...')) return undefined;

  let cleaned = sanitizeStrFn ? sanitizeStrFn(rawUrl) : rawUrl;
  cleaned = cleaned.replace(/\[\d+\]/g, '').replace(/\(\d+\)/g, '').replace(/[.,;!"']+$/g, '').trim();

  if (!cleaned || cleaned.includes('..') || cleaned.toLowerCase().includes('example.com') || cleaned.toLowerCase().includes('path/to/') || cleaned.endsWith('/Special:FilePath/') || cleaned === 'https://en.wikipedia.org/wiki/Special:FilePath/') {
    return undefined;
  }

  try {
    const parsed = new URL(cleaned);
    if (!['https:', 'http:'].includes(parsed.protocol)) return undefined;
    if (!parsed.pathname || parsed.pathname === '/' || parsed.pathname.length <= 1) return undefined;

    const host = parsed.hostname.toLowerCase();
    const pathname = parsed.pathname;

    const isFromTrustedDomain = TRUSTED_IMAGE_DOMAINS.some(d => host === d || host.endsWith(`.${d}`));
    const looksLikeImageAsset = IMAGE_EXTENSIONS.test(pathname) || IMAGE_PATH_SEGMENTS.test(pathname);

    if (isFromTrustedDomain || looksLikeImageAsset) {
      return cleaned;
    }
    return undefined;
  } catch (e) {
    return undefined;
  }
};

const TEST_NODES = [
  { id: 'scowl', label: 'Scowl', type: 'artist' },
  { id: 'end-it', label: 'End It', type: 'artist' },
  { id: 'gel', label: 'Gel', type: 'artist' }
];

async function runTest() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('GEMINI_API_KEY environment variable is not set.');
    process.exit(1);
  }

  const ai = new GoogleGenAI({ apiKey });
  
  console.log('\n================================================================');
  console.log(' LIVE HYDRATION PIPELINE TEST — Display Names & Relaxed Schema');
  console.log('================================================================\n');

  for (const node of TEST_NODES) {
    console.log(`\n-----------------------------------------------------------------`);
    console.log(`Testing Node: ID="${node.id}" | Display Name="${node.label}"`);
    
    const nodeIdentifier = node.label || node.id;
    
    let prompt = FETCH_NODE_DETAILS_PROMPT_TEMPLATE
      .replace('{{nodeIdentifier}}', nodeIdentifier)
      .replace('{{nodeType}}', node.type)
      .replace('{{seedArtists}}', 'Spaced')
      .replace('{{contextNodes}}', 'Scowl, Turnstile')
      .replace(/{{currentDate}}/g, 'July 28, 2026');

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} }],
        },
      });

      const rawText = (response.text || '').trim();
      let parsed = null;
      try {
        const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
        parsed = JSON.parse(cleaned);
      } catch (parseErr) {
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try { parsed = JSON.parse(jsonMatch[0]); } catch (e2) {}
        }
      }

      if (parsed) {
        console.log(`[Success] Parsed JSON from Gemini for ${nodeIdentifier}.`);
        const rawImageUrl = parsed.imageUrl;
        const sanitized = sanitizeImageUrl(rawImageUrl, sanitizeString);
        
        console.log(`Raw Image URL: ${rawImageUrl || 'null'}`);
        console.log(`Sanitized Final URL: ${sanitized || 'undefined'}`);
        if (sanitized) {
          console.log(`Result: ✅ PASS`);
        } else {
          console.log(`Result: ❌ REJECTED / MISSING`);
        }
      } else {
        console.error(`[Error] Failed to parse JSON for ${nodeIdentifier}. Raw response length: ${rawText.length}`);
      }
    } catch (err) {
      console.error(`[Error] API call failed for ${nodeIdentifier}:`, err.message);
    }
  }
}

runTest();
