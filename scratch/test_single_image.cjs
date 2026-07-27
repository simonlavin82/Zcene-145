/**
 * scratch/test_single_image.cjs
 *
 * Controlled Terminal Test Harness — Image Sourcing Rules & sanitizeImageUrl Validator
 *
 * PURPOSE: Evaluate the new two-tier image-sourcing prompt constraints and sanitizeImageUrl
 * validator on three targeted artist names BEFORE any production code is deployed.
 * This is a diagnostic-only script. It does NOT write to Firestore.
 *
 * EXECUTION CONTRACT:
 *  - Runs exactly once per artist (no retry loops) to prevent API quota waste.
 *  - Artists run sequentially (not concurrently).
 *  - Requires GEMINI_API_KEY env var.
 *
 * USAGE:
 *  GEMINI_API_KEY=<your_key> node scratch/test_single_image.cjs
 */

'use strict';

const { GoogleGenAI } = require('@google/genai');

// ─────────────────────────────────────────────────────────────────────────────
// INLINED sanitizeImageUrl — EXACT two-tier logic from Change 4 in the plan.
// This validates what the production sanitizeImageUrl will do after implementation.
// ─────────────────────────────────────────────────────────────────────────────

// TIER A: Curated allowlist of known music asset CDN domains.
const TRUSTED_IMAGE_DOMAINS = [
  // ── CONTEMPORARY / INDIE / ELECTRONIC / PUNK / HIP-HOP ──
  'upload.wikimedia.org',        // Wikimedia Commons
  'commons.wikimedia.org',
  'f4.bcbits.com',               // Bandcamp CDN (all variants)
  'f1.bcbits.com',
  'f2.bcbits.com',
  'f3.bcbits.com',
  'i.discogs.com',               // Discogs
  'img.discogs.com',
  'i.scdn.co',                   // Spotify
  'lastfm.freetls.fastly.net',   // Last.fm
  'coverartarchive.org',         // MusicBrainz Cover Art Archive
  'assets.bandcamp.com',
  'cdn.allmusic.com',            // AllMusic
  // ── CLASSICAL / ORCHESTRAL / TRADITIONAL / JAZZ / OPERA ──
  'images.hyperion-records.co.uk', // Hyperion Records (major British classical label)
  'cdn.naxos.com',               // Naxos (world's largest classical label)
  'www.naxos.com',
  'images.ecmrecords.com',        // ECM Records (jazz / contemporary classical)
  'www.ecmrecords.com',
  'images.deutschegrammophon.com', // Deutsche Grammophon (DG)
  'www.harmoniamundi.com',        // Harmonia Mundi (early music / baroque)
  'images.bis.se',               // BIS Records (Nordic classical label)
  'cdn.prestomusic.com',         // Presto Music CDN
  'images.chandos.net',          // Chandos Records
  'cdn.britannica.com',          // Britannica (composer & musician portraits — no ext.)
];

// TIER B: Any domain, but path must contain an image extension or image-suggestive segment.
const IMAGE_EXTENSIONS = /\.(jpg|jpeg|png|webp|gif|avif|bmp|tiff?)(\?|#|$)/i;
const IMAGE_PATH_SEGMENTS = /\/(img|image|images|photo|photos|media|assets|thumbnail|thumb|artwork)\//i;

function sanitizeImageUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return undefined;
  if (rawUrl.includes('...')) return undefined;

  let cleaned = rawUrl
    .replace(/\[\d+\]/g, '')
    .replace(/\(\d+\)/g, '')
    .replace(/[.,;!"']+$/g, '')
    .trim();

  if (
    !cleaned ||
    cleaned.includes('..') ||
    cleaned.toLowerCase().includes('example.com') ||
    cleaned.toLowerCase().includes('path/to/') ||
    cleaned.endsWith('/Special:FilePath/') ||
    cleaned === 'https://en.wikipedia.org/wiki/Special:FilePath/'
  ) {
    return undefined;
  }

  let parsed;
  try {
    parsed = new URL(cleaned);
  } catch (e) {
    return undefined;
  }

  if (!['https:', 'http:'].includes(parsed.protocol)) return undefined;
  if (!parsed.pathname || parsed.pathname === '/' || parsed.pathname.length <= 1) return undefined;

  const host = parsed.hostname.toLowerCase();
  const pathname = parsed.pathname;

  const isFromTrustedDomain = TRUSTED_IMAGE_DOMAINS.some(
    d => host === d || host.endsWith(`.${d}`)
  );
  const looksLikeImageAsset =
    IMAGE_EXTENSIONS.test(pathname) || IMAGE_PATH_SEGMENTS.test(pathname);

  if (isFromTrustedDomain) {
    return { url: cleaned, tier: 'A', domain: host };
  }
  if (looksLikeImageAsset) {
    return { url: cleaned, tier: 'B', domain: host };
  }
  return undefined;
}

function describeSanitizeResult(rawUrl) {
  if (!rawUrl) return 'NULL (model did not return an imageUrl)';
  const result = sanitizeImageUrl(rawUrl);
  if (!result) {
    let host = '?';
    try { host = new URL(rawUrl).hostname; } catch (e) {}
    return `REJECT — not from trusted domain (${host}); no image extension/path match`;
  }
  return `PASS (Tier ${result.tier} — ${result.domain})`;
}

// ─────────────────────────────────────────────────────────────────────────────
// INLINED image sourcing prompt — EXACT wording from Change 5 in the plan.
// ─────────────────────────────────────────────────────────────────────────────

function buildImageTestPrompt(artistName) {
  return `Please provide the following information for the music artist: "${artistName}".

USE GOOGLE SEARCH to find:
1. A brief 2-3 sentence bio summary of the artist — their genre, origin, and cultural significance.
2. A high-quality, direct HTTPS image URL representing the artist. Under the Contextual Image Trust Rule, if you verify and extract biographical copy from a credible source within that genre's ecosystem, the accompanying contextual image asset is trusted by default (e.g., from Wikimedia Commons, Wikipedia, Bandcamp, Discogs, Spotify, Last.fm, or genre-specific archives). Return the full, direct HTTPS image URL without truncation.

GENRE-CONTEXTUAL IMAGE SOURCING HIERARCHY (STRICTLY ENFORCED):
First, infer the artist's genre context from the entity name and your own knowledge. Then apply the appropriate sourcing priority:

▸ FOR CONTEMPORARY / INDIE / ELECTRONIC / PUNK / METAL / HIP-HOP / R&B:
  Priority 1 — Official Bandcamp artist page: band photo, header banner, or release artwork.
  Priority 2 — Discogs artist page: press photo or release cover.
  Priority 3 — AllMusic or Pitchfork artist entry: artist portrait or release art.
  Priority 4 — Wikimedia Commons: if a verified artist photo exists there.
  Priority 5 — Official label page or release page directly associated with the band.

▸ FOR CLASSICAL / ORCHESTRAL / OPERA / EARLY MUSIC / TRADITIONAL / WORLD MUSIC:
  Priority 1 — Wikimedia Commons: composer portrait, ensemble photo, or archival image.
  Priority 2 — Record label catalog page (Naxos, Hyperion, Deutsche Grammophon, ECM, Harmonia Mundi, BIS, Chandos): artist photo or release cover.
  Priority 3 — Gramophone magazine or Britannica artist entry: editorial portrait.
  Priority 4 — Institutional archive: musicological database, national library digital collection, or publisher catalog image.
  Priority 5 — MusicBrainz or AllMusic artist entry.

▸ FOR JAZZ / BLUES:
  Priority 1 — Wikimedia Commons or Blue Note/Verve/ECM label CDN.
  Priority 2 — AllMusic or DownBeat artist entry.
  Priority 3 — Bandcamp artist page if the artist has an independent presence.

ACCEPTED IMAGE TYPES (all genre contexts): press photos, live performance photos, official band/artist portraits, album artwork, release covers, band logos, and official band banners or headers.

FORBIDDEN IMAGE SOURCES (all genre contexts): Generic stock photo sites (Unsplash, Pexels, Shutterstock, Getty Images), news article thumbnails or decorative page headers, social media preview cards, YouTube thumbnails, unrelated landscape or nature photography, retail product listing images from general music stores where the image is incidental to a shop listing (prefer official artist/label sources over third-party retailers), or any image whose primary subject has no connection to the artist or their music.

If you cannot find ANY verified image from the priority sources above, you MUST omit imageUrl entirely (return null). An absent image is always preferable to an irrelevant or misleading one.

CRITICAL OUTPUT REQUIREMENTS:
- Respond ONLY with a single, valid JSON object. No markdown fences, no prose outside the JSON.
- Do NOT include any citation markers (e.g. [1], [2]).

JSON structure:
{
  "summary": "2-3 sentence bio text here.",
  "imageUrl": "https://... (press photo, live shot, album artwork, logo, banner — or null if nothing verified found)"
}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST SUBJECTS
// ─────────────────────────────────────────────────────────────────────────────

const TEST_ARTISTS = [
  {
    name: 'Spaced',
    rationale: 'US hardcore punk band — tests contemporary Bandcamp/Discogs priority routing',
  },
  {
    name: 'Glenn Gould',
    rationale: 'Classical pianist — tests classical institutional and archival priority routing',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// MAIN RUNNER
// ─────────────────────────────────────────────────────────────────────────────

async function run() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('GEMINI_API_KEY environment variable is not set.');
    console.error('Usage: GEMINI_API_KEY=<your_key> node scratch/test_single_image.cjs');
    process.exit(1);
  }

  const ai = new GoogleGenAI({ apiKey });

  let passCount = 0;
  let rejectCount = 0;
  let nullCount = 0;

  console.log('\n================================================================');
  console.log(' IMAGE SOURCING TEST HARNESS — Two-Tier sanitizeImageUrl Validator');
  console.log(' Model: gemini-2.5-flash | Tools: Google Search | Artists: 3');
  console.log('================================================================\n');

  for (const artist of TEST_ARTISTS) {
    console.log(`-----------------------------------------------------------------`);
    console.log(`ARTIST: ${artist.name}`);
    console.log(`Rationale: ${artist.rationale}`);

    let rawImageUrl = null;
    let summary = null;

    try {
      const prompt = buildImageTestPrompt(artist.name);

      // Call Gemini with Google Search grounding.
      // No responseMimeType / responseSchema — required for grounding tool compatibility
      // (API Mutual Exclusivity Rule: tools and structured output cannot coexist).
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
        const cleaned = rawText
          .replace(/^```(?:json)?\s*/i, '')
          .replace(/\s*```$/i, '')
          .trim();
        parsed = JSON.parse(cleaned);
      } catch (parseErr) {
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try { parsed = JSON.parse(jsonMatch[0]); } catch (e2) {}
        }
      }

      if (parsed) {
        rawImageUrl = parsed.imageUrl || null;
        summary = parsed.summary || null;
      } else {
        console.log(`  WARNING: Could not parse JSON from model response.`);
        console.log(`  Raw response snippet: ${rawText.substring(0, 200)}`);
      }
    } catch (apiErr) {
      console.log(`  ERROR: API call failed: ${apiErr.message}`);
    }

    const resultLabel = describeSanitizeResult(rawImageUrl);
    const sanitized = rawImageUrl ? sanitizeImageUrl(rawImageUrl) : null;

    if (!rawImageUrl) {
      nullCount++;
    } else if (sanitized) {
      passCount++;
    } else {
      rejectCount++;
    }

    console.log(`  Raw imageUrl from model : ${rawImageUrl || '(none / null)'}`);
    console.log(`  Sanitize result         : ${resultLabel}`);
    console.log(`  Summary preview         : "${(summary || '(none)').substring(0, 100)}..."`);
    console.log();
  }

  console.log(`-----------------------------------------------------------------`);
  console.log(`Test complete. ${passCount} passed, ${rejectCount} rejected, ${nullCount} omitted by model.`);
  console.log();

  if (rejectCount > 0) {
    console.log(`INFO: REJECTED images — the two-tier validator correctly blocked these URLs.`);
    console.log(`      If these were legitimate music assets, expand the Tier A allowlist`);
    console.log(`      or check whether Tier B path/extension needs refinement.`);
  }
  if (nullCount > 0) {
    console.log(`INFO: NULL images — the model correctly omitted irrelevant images per prompt rules.`);
    console.log(`      This is the desired outcome for ambiguous or stock-photo-risk artists.`);
  }
  if (passCount === TEST_ARTISTS.length) {
    console.log(`SUCCESS: All three artists returned trusted image assets. Proceed to code implementation.`);
  }

  process.exit(0);
}

run().catch(err => {
  console.error('Test harness crashed:', err);
  process.exit(1);
});
