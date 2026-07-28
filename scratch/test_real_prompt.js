import fs from 'fs';
import { GoogleGenAI } from '@google/genai';

const fileContent = fs.readFileSync('functions/src/services/curatorService.ts', 'utf8');
const match = fileContent.match(/export const FETCH_NODE_DETAILS_PROMPT_TEMPLATE = `([\s\S]*?)`;/);
if (!match) throw new Error("Could not find prompt template");
const FETCH_NODE_DETAILS_PROMPT_TEMPLATE = match[1];

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
  console.log(' LIVE HYDRATION PIPELINE TEST — USING REAL EXTRACTED PROMPT');
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
      .replace(/{{currentDate}}/g, 'July 28, 2026')
      .replace(/{{#if originHint}}[\s\S]*?{{\/if}}/g, '');

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
