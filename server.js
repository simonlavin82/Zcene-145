import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import path from 'path';
import { fileURLToPath } from 'url';
import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

// Initialize Firebase Admin SDK
let db;
try {
  admin.initializeApp();
  db = getFirestore();
  console.log("Firebase Admin initialized successfully.");
} catch (error) {
  console.error("Firebase Admin initialization error (check local credentials):", error);
  // Fallback mock database for local development without credentials
  db = {
    collection: () => ({
      doc: () => ({
        get: async () => ({ exists: false, data: () => null }),
        set: async () => {}
      })
    })
  };
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8080;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
  console.warn("WARNING: GEMINI_API_KEY is not set in the environment. The API proxy will likely fail.");
}

// Proxy all requests starting with /api/gemini/ to the Google GenAI API
app.all('/api/gemini/*wildcard', async (req, res) => {
  const headers = { ...req.headers };
  // Cleanse credentials
  delete headers['authorization'];
  delete headers['Authorization'];
  delete headers['cookie'];
  delete headers['Cookie'];
  delete headers['host'];
  delete headers['connection'];
  delete headers['content-length'];

  if (GEMINI_API_KEY) {
    headers['x-goog-api-key'] = GEMINI_API_KEY;
  }

  const targetPath = req.originalUrl.replace(/^\/api\/gemini/, '');
  const targetUrl = `https://generativelanguage.googleapis.com${targetPath}`;

  console.log(`[Gemini Proxy] Forwarding ${req.method} ${req.originalUrl} -> ${targetUrl}`);

  try {
    const fetchOptions = {
      method: req.method,
      headers: headers
    };

    if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
      fetchOptions.body = req;
      fetchOptions.duplex = 'half';
    }

    const response = await fetch(targetUrl, fetchOptions);
    console.log(`[Gemini Proxy Response] Status: ${response.status} from Google for: ${targetPath}`);

    res.status(response.status);
    response.headers.forEach((value, key) => {
      if (key.toLowerCase() !== 'transfer-encoding') {
        res.setHeader(key, value);
      }
    });

    if (response.body) {
      const reader = response.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
    }
    res.end();
  } catch (error) {
    console.error(`[Gemini Proxy Error] Failed to forward request to ${targetUrl}:`, error);
    if (!res.headersSent) {
      res.status(500).json({ error: error.message });
    }
  }
});

// Proxy Firebase Authentication handlers to bypass cross-origin/unauthorized domain restrictions
app.use(
  '/__/auth',
  createProxyMiddleware({
    target: 'https://zcene-production.firebaseapp.com',
    changeOrigin: true,
  })
);

// --- YOUTUBE PLAYABILITY PROXY & RE-SYNTHESIS ENGINE ---

const FETCH_NODE_DETAILS_PROMPT_TEMPLATE = `Please provide detailed information for the music entity: "{{nodeIdentifier}}" (type: {{nodeType}}).
    
    Context:
    - Seed artists: {{seedArtists}}.
    - Connected nodes: {{contextNodes}}.
    - Date: {{currentDate}}.
    {{#if originHint}}
    - Origin Hint: {{originHint}}.
    {{/if}}
    
    USE GOOGLE SEARCH to find:
    1. The most accurate bio and cultural significance. Use scannability techniques:
       - Chunking: Break information into smaller, digestible units.
       - Text Segmentation: Use short paragraphs and meaningful phrases.
       - Formatting: Use bolding for key terms and bullet points where appropriate to create white space.
       - Semantic Splitting: Group related content together by meaning.
    2. The canonical Wikipedia Special:FilePath image URL. imageUrl MUST be a Wikipedia Special:FilePath URL (https://en.wikipedia.org/wiki/Special:FilePath/...). Do not use image URLs from official artist sites or any third-party host.
    3. Confirmed top 3 studio albums.
    4. A verified, active YouTube video for the artist. You MUST run a dedicated search query like "[Artist Name] official music video site:youtube.com" or "[Artist Name] live performance site:youtube.com" to find a real, active video URL. Extract the 11-character video ID (e.g. from watch?v=XXXXXXXXXXX) only from verified Search results. If you cannot find a verified active video ID, or if the search results do not show the full URL, you MUST return null. Never guess or hallucinate a video ID.
    
    CRITICAL OUTPUT REQUIREMENTS (STRICTLY ENFORCED):
    1. You MUST respond with a single, valid JSON object matching the schema below. Do NOT write any conversational text or prose outside the JSON.
    2. Do NOT include markdown code fences (do NOT wrap the response in \`\`\`json ... \`\`\`). Output raw JSON directly.
    3. Do NOT include any inline search citations, footnote markers (such as [1], [2], [3], etc.), or source references anywhere in the text or JSON fields. Ensure all string values are plain text or markdown bold/bullets only, with absolutely no citation brackets.
    
    Your task is to generate a JSON object matching this structure precisely:
    {
      "summary": "A scannable bio (approx. 100 words) using Markdown: short paragraphs, bolding for key terms, and bullet points for lists. Focus on style and significance.",
      "imageUrl": "https://en.wikipedia.org/wiki/Special:FilePath/...",
      "members": ["Name (Role)", ...],
      "details": {
        "genre": "The primary music genre(s) as a plain string (e.g. 'Hardcore Punk', 'Post-Hardcore', 'Metalcore'). NEVER return the literal string 'Unknown', 'N/A', or leave this empty — if grounding is inconclusive, infer the genre from the bio summary text and the connected scene context provided.",
        "origin": "City, Country format (e.g. 'Baltimore, USA'). NEVER return the literal string 'Unknown', 'N/A', or leave this empty — if grounding is inconclusive, infer the origin from the bio summary text or the band's known regional scene.",
        "founded": "YYYY",
        "notableArtists": ["Artist Name", ...]
      },
      "links": [
        {"site": "Wikipedia", "url": "https://en.wikipedia.org/wiki/..."}
      ],
      "discography": [{"albumName": "Name", "releaseYear": "YYYY"}],
      "recommendationReason": "Curator insight about their role in this scene.",
      "youtubeVideoId": "dQw4w9WgXcQ",
      "youtubeSearchQuery": "Turnstile hardcore punk official music video"
    }

    YOUTUBE VIDEO SELECTION RULES (CRITICAL):
    - Use Google Search to find the best official YouTube video for this artist.
    - Priority: (1) Most iconic/popular official music video from their official YouTube channel, (2) high-profile full professional live set on an official or reputable label channel.
    - ABSOLUTELY FORBIDDEN: lyric videos, fan-cam bootlegs, low-resolution uploads, non-musical interview clips, or unofficial re-uploads.
    - The youtubeVideoId value must be ONLY the 11-character YouTube video ID (e.g. "dQw4w9WgXcQ"), NOT a full URL.
    - Set youtubeVideoId to null if no high-quality, officially-sourced video can be confirmed via search.
    - youtubeSearchQuery MUST always be populated as a non-null fallback. Format: "[Artist Name] [genre] [live OR official video]". This is MANDATORY.
    - QUERY MODIFICATION: Append semantic terms such as "full set", "live performance", or "official music video" to your search queries before resolving an asset hash.
    - NEGATIVE SHORTS CONSTRAINT: DO NOT parse or return video hashes derived from search queries matching vertical formats or the '/shorts/' route structure. Prioritize landscape video IDs with durations longer than 2 minutes.
    - ENTITY VALIDATION: Ensure the chosen video belongs strictly to verified artist channels, high-fidelity archive channels (e.g., Hate5six, KEXP, Audiotree), or standard label uploads (e.g., Relapse Records, Epitaph Records).
    - ZERO HALLUCINATION (MANDATORY): You must only return a youtubeVideoId if you can extract the exact 11-character ID from a YouTube watch URL (e.g., youtube.com/watch?v=...) present in your Google Search results. If you do not see the exact URL or video ID in the search results, set youtubeVideoId to null. NEVER guess or hallucinate a video ID under any circumstances.
    - AMBIGUITY RESOLUTION: For bands with common or ambiguous names (such as "Cave In"), make sure your search query includes qualifiers (e.g. "Cave In band" or "Cave In post-hardcore") to avoid generic results.

    WIKIPEDIA ORDERING RULE (MANDATORY):
    If a Wikipedia link is found, it MUST be the very first item (index 0) in the links array.

    OFFICIAL WEBSITE RULE:
    Do NOT include an "Official Website" entry in your links array. The client application handles Official Website routing independently and safely.

    BANDCAMP RULE:
    Do NOT include a "Bandcamp" entry in your links array. The client application handles Bandcamp routing independently.

    WIKIPEDIA / OTHER INFO LINKS:
    Include grounded Wikipedia or other reference links if confirmed by Google Search results. Wikipedia MUST be index 0.

    CURATOR TONE & VARIETY (CRITICAL):
    - BREVITY: Max 25 words. Use exactly ONE snappy, high-impact sentence.
    - NO LINGUISTIC RUTS: Avoid getting stuck on single recurring metaphors like "bridge," "waypoint," "nexus," or "link." 
    - UNIQUE HOOKS: Each insight must feel like a bespoke entry. Do not use a fixed list of "cool" words.
    - GENRE-SPECIFIC DICTION: Use the artist's own sub-culture vocabulary (e.g., "grit," "hi-fi," "analog-warmth").
    - DYNAMIC SENTENCE STRUCTURE: Avoid repetitive structural patterns like "Between X and Y..." or "Representing the...".
    - PERSONA: Sophisticated music historian (Pitchfork/Resident Advisor style). Focus on cultural positioning.

    The entire response must be ONLY the raw JSON object.`;

const NODE_DETAILS_SCHEMA_SERVER = {
  type: "OBJECT",
  properties: {
    summary: {
      type: "STRING",
      description: "A scannable bio (approx. 100 words) using Markdown: short paragraphs, bolding for key terms, and bullet points for lists. Focus on style and significance."
    },
    imageUrl: {
      type: "STRING",
      description: "MUST be a Wikipedia Special:FilePath URL (https://en.wikipedia.org/wiki/Special:FilePath/...). Do not use image URLs from official artist sites or third-party hosts — only Wikipedia FilePath URLs are trusted by the image pipeline."
    },
    members: {
      type: "ARRAY",
      items: { type: "STRING" },
      description: "List of members and their roles."
    },
    details: {
      type: "OBJECT",
      properties: {
        genre: { type: "STRING" },
        origin: { type: "STRING" },
        founded: { type: "STRING" },
        notableArtists: {
          type: "ARRAY",
          items: { type: "STRING" }
        }
      },
      required: ["genre", "origin", "founded", "notableArtists"]
    },
    links: {
      type: "ARRAY",
      description: "Wikipedia link MUST be index 0 if found. Do NOT include Official Website or Bandcamp entries — those are handled by the client. Only include grounded reference links.",
      items: {
        type: "OBJECT",
        properties: {
          site: { type: "STRING" },
          url: {
            type: "STRING",
            nullable: true,
            description: "The verified, active URL. MUST be null if the URL cannot be confirmed. Do NOT guess or fabricate."
          }
        },
        required: ["site"]
      }
    },
    discography: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          albumName: { type: "STRING" },
          releaseYear: { type: "STRING" }
        },
        required: ["albumName", "releaseYear"]
      }
    },
    recommendationReason: {
      type: "STRING",
      description: "Curator insight."
    },
    youtubeVideoId: {
      type: "STRING",
      nullable: true,
      description: "The YouTube video ID (11-character string) for the best available official video. Priority order: (1) most iconic/popular official music video, (2) high-profile professional full live set on an official channel. MUST NOT be a lyric video, fan-cam bootleg, low-quality upload, non-musical interview clip, or YouTube Shorts (do not return vertical formats or '/shorts/' routes; prioritize landscape videos longer than 2 minutes). Ensure the video belongs strictly to verified artist channels, high-fidelity archives (e.g. Hate5six, KEXP, Audiotree), or standard label uploads. Return null if no high-quality official video can be confirmed."
    },
    youtubeSearchQuery: {
      type: "STRING",
      description: "A guaranteed-non-null YouTube search query string to use as a fallback when youtubeVideoId cannot be confirmed. Format: '[Artist Name] [genre] [live OR official video]'. Example: 'Turnstile hardcore punk official music video'. Always populate this field. Append semantic terms such as 'full set', 'live performance', or 'official music video' before resolving."
    }
  },
  required: ["summary", "details", "discography", "recommendationReason", "youtubeSearchQuery"]
};

/**
 * Produces a stable, Firestore-safe document ID for a single artist name.
 */
function normalizeArtistId(name) {
  if (!name) return "";
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’]/g, "") // Strip straight and curly apostrophes
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 256);
}

/**
 * Enforces schema validation for artist documents written to Firestore.
 * Ensures detailsCache is valid, non-empty, and contains biography/summary and discography to prevent data rot.
 */
function enforceArtistCacheSchemaServer(payload) {
  if (!payload) return;
  if (payload.redirectTo) return;

  const isDeep = payload.isDeep === true;

  if (isDeep || payload.detailsCache) {
    try {
      const detailsCacheRaw = payload.detailsCache;
      if (!detailsCacheRaw) {
        return;
      }

      let parsed = typeof detailsCacheRaw === 'string' ? JSON.parse(detailsCacheRaw) : detailsCacheRaw;
      
      if (!parsed) {
        throw new Error("[Schema Enforcement] Parsed detailsCache is null or empty.");
      }
      
      // Check for biography or summary
      const bio = parsed.summary || parsed.bio || parsed.description || parsed.text;
      if (!bio || typeof bio !== 'string' || bio.trim().length < 2) {
        throw new Error("[Schema Enforcement] detailsCache is missing biography/summary text.");
      }
      
      // Check details object
      if (!parsed.details || typeof parsed.details !== 'object') {
        throw new Error("[Schema Enforcement] detailsCache is missing or has invalid details object.");
      }
      const { genre, origin, founded, notableArtists } = parsed.details;
      if (genre === undefined || genre === null || typeof genre !== 'string') {
        throw new Error("[Schema Enforcement] detailsCache.details is missing genre.");
      }
      if (origin === undefined || origin === null || typeof origin !== 'string') {
        throw new Error("[Schema Enforcement] detailsCache.details is missing origin.");
      }
      if (founded === undefined || founded === null || typeof founded !== 'string') {
        throw new Error("[Schema Enforcement] detailsCache.details is missing founded year.");
      }
      if (notableArtists && !Array.isArray(notableArtists)) {
        throw new Error("[Schema Enforcement] detailsCache.details has invalid notableArtists array.");
      }

      // Check for discography array
      if (parsed.discography && !Array.isArray(parsed.discography)) {
        throw new Error("[Schema Enforcement] detailsCache has invalid discography array.");
      }
      if (Array.isArray(parsed.discography)) {
        for (let i = 0; i < parsed.discography.length; i++) {
          const item = parsed.discography[i];
          if (!item || typeof item !== 'object' || !item.albumName || !item.releaseYear) {
            throw new Error(`[Schema Enforcement] discography item at index ${i} is missing albumName or releaseYear.`);
          }
        }
      }

      // Check recommendationReason (allow empty string for primary seeds)
      if (parsed.recommendationReason === undefined || parsed.recommendationReason === null || typeof parsed.recommendationReason !== 'string') {
        throw new Error("[Schema Enforcement] detailsCache is missing recommendationReason.");
      }

      // Check youtubeSearchQuery (allow empty string)
      if (parsed.youtubeSearchQuery === undefined || parsed.youtubeSearchQuery === null || typeof parsed.youtubeSearchQuery !== 'string') {
        throw new Error("[Schema Enforcement] detailsCache is missing youtubeSearchQuery.");
      }
    } catch (err) {
      console.error("[Schema Enforcement] Server Validation failed for payload:", JSON.stringify(payload, null, 2));
      throw err;
    }
  }
}

// Playability memory cache (videoId -> { playable: boolean, expiresAt: number })
const playabilityCache = new Map();

/**
 * Checks YouTube video playability via oEmbed API.
 * Caches results for 24 hours.
 */
async function checkVideoPlayability(videoId) {
  if (!videoId || videoId.length !== 11) return false;
  
  const cached = playabilityCache.get(videoId);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.playable;
  }

  try {
    const url = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, { method: 'HEAD', signal: controller.signal });
    clearTimeout(id);
    const playable = res.status === 200; // oEmbed returns 200 OK for valid playable embeds
    
    // Cache validation state for 24 hours
    playabilityCache.set(videoId, {
      playable,
      expiresAt: Date.now() + 24 * 60 * 60 * 1000
    });
    
    console.log(`[Playability Cache] Set status for ${videoId}: ${playable ? 'PLAYABLE' : 'UNPLAYABLE'}`);
    return playable;
  } catch (err) {
    console.error(`[Playability] Check failed for ${videoId}:`, err);
    // On network failure or timeout, return true to avoid false-positive pruning
    return true;
  }
}

/**
 * Asynchronously heals a document by re-synthesizing details via Gemini
 * and updating the Firestore record with the new dataset.
 */
async function triggerReSynthesis(artistId, originalData, collectionName = 'artists') {
  if (!GEMINI_API_KEY) {
    console.error(`[Re-Synthesis] Failed: GEMINI_API_KEY is not defined.`);
    return;
  }
  
  // Parse detailsCache
  let details = null;
  if (originalData && originalData.detailsCache) {
    try {
      let parsed = typeof originalData.detailsCache === 'string' ? JSON.parse(originalData.detailsCache) : originalData.detailsCache;
      if (Array.isArray(parsed) && parsed.length > 0) {
        parsed = Array.isArray(parsed[0]) ? parsed[0][1] : parsed[0];
      }
      if (typeof parsed === 'string') {
        try {
          parsed = JSON.parse(parsed);
        } catch (e) {
          console.warn(`[Re-Synthesis] Failed to parse double-stringified detailsCache:`, e.message);
        }
      }
      details = parsed;
    } catch (e) {
      console.warn(`[Re-Synthesis] Failed to parse detailsCache:`, e.message);
    }
  }

  const artistName = details?.details?.artist || originalData.seedArtists || artistId;
  const canonicalId = originalData.cacheKey || originalData.artistId || normalizeArtistId(artistName);
  const isAlias = canonicalId !== artistId;
  const genre = details?.details?.genre || '';
  const seedArtists = artistName;
  const contextNodes = '';
  const currentDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  const prompt = FETCH_NODE_DETAILS_PROMPT_TEMPLATE
    .replace('{{nodeIdentifier}}', artistName)
    .replace('{{nodeType}}', 'artist')
    .replace('{{seedArtists}}', seedArtists)
    .replace('{{contextNodes}}', contextNodes)
    .replace(/{{currentDate}}/g, currentDate)
    .replace(/{{#if originHint}}[\s\S]*?{{\/if}}/g, ''); // strip origin hint

  const requestBody = {
    contents: [
      {
        role: "user",
        parts: [
          {
            text: prompt
          }
        ]
      }
    ],
    tools: [
      {
        googleSearch: {}
      }
    ],
    generationConfig: {
      maxOutputTokens: 4000,
    }
  };

  const isLocal = !GEMINI_API_KEY || (process.env.NODE_ENV === 'development' && process.env.VITE_USE_MOCKS !== 'false');
  if (isLocal) {
    console.log(`[Re-Synthesis] Sandbox Mode: Simulating mock details healing for ${artistId}`);
    
    const isGaye = artistName.toLowerCase().includes('gaye');
    const cleanArtistName = isGaye ? 'Marvin Gaye' : artistName;
    const cleanCanonicalId = isGaye ? 'marvin-gaye' : canonicalId;
    const cleanIsAlias = cleanCanonicalId !== artistId;

    const updatedDetails = {
      summary: `${cleanArtistName} is a legendary music artist known for pioneering contributions.`,
      imageUrl: `https://en.wikipedia.org/wiki/Special:FilePath/${encodeURIComponent(cleanArtistName)}.jpg`,
      members: [],
      details: {
        artist: cleanArtistName,
        genre: "Soul / R&B",
        origin: "United States",
        founded: "1959",
        notableArtists: []
      },
      discography: [],
      recommendationReason: "Mock curator insight.",
      youtubeSearchQuery: `Mock youtube search query for ${cleanArtistName}`,
      youtubeVideoId: "hFi7XZw1OYk", // Marvin Gaye - What's Going On
    };

    const finalPayload = {
      ...originalData,
      artistId: cleanCanonicalId,
      cacheKey: cleanCanonicalId,
      seedArtists: cleanArtistName,
      detailsCache: updatedDetails,
      cachedAt: admin.firestore.FieldValue.serverTimestamp(),
      cacheVersion: 2
    };

    try {
      enforceArtistCacheSchemaServer(finalPayload);
      await db.collection(collectionName).doc(cleanCanonicalId).set(finalPayload, { merge: true });
      console.log(`[Re-Synthesis] Mock healed profile for canonical entity (${collectionName}): ${cleanCanonicalId}`);

      if (cleanIsAlias) {
        await db.collection(collectionName).doc(artistId).set({
          cacheKey: artistId,
          artistId: artistId,
          seedArtists: originalData.seedArtists || artistId,
          graphData: JSON.stringify({ nodes: [], links: [] }),
          filters: {},
          cacheVersion: 2,
          cachedAt: admin.firestore.FieldValue.serverTimestamp(),
          hitCount: 0,
          redirectTo: cleanCanonicalId
        });
        console.log(`[Re-Synthesis] Mock Created Alias Redirect: ${artistId} -> ${cleanCanonicalId}`);
      }
    } catch (dbErr) {
      console.error(`[Re-Synthesis] Mock database set failed for document: ${cleanCanonicalId}. Error:`, dbErr.message);
      console.error(`[Re-Synthesis] Contaminated Payload Dump:`, JSON.stringify(finalPayload, null, 2));
    }
    return;
  }

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini API returned status ${response.status}: ${errText}`);
    }

    const resJson = await response.json();
    const candidateText = resJson.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!candidateText) {
      throw new Error("No text candidate returned from Gemini");
    }

    let cleanText = candidateText.trim();
    if (cleanText.startsWith('```')) {
      cleanText = cleanText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }
    const synthesizedDetails = JSON.parse(cleanText.trim());
    
    const sanitizeString = (str) => {
      if (typeof str !== 'string') return "";
      return str.replace(/\[\d+\]/g, '').replace(/\(\d+\)/g, '').trim();
    };

    if (synthesizedDetails) {
      if (synthesizedDetails.summary) {
        synthesizedDetails.summary = sanitizeString(synthesizedDetails.summary);
      }
      if (synthesizedDetails.recommendationReason) {
        synthesizedDetails.recommendationReason = sanitizeString(synthesizedDetails.recommendationReason);
      }
      if (synthesizedDetails.details) {
        const det = synthesizedDetails.details;
        if (det.genre) det.genre = sanitizeString(det.genre);
        if (det.origin) det.origin = sanitizeString(det.origin);
        if (det.founded) det.founded = sanitizeString(det.founded);
        if (det.notableArtists) {
          det.notableArtists = det.notableArtists.map(sanitizeString);
        }
      }
      if (synthesizedDetails.discography) {
        synthesizedDetails.discography = synthesizedDetails.discography.map(album => ({
          albumName: sanitizeString(album?.albumName),
          releaseYear: sanitizeString(album?.releaseYear)
        }));
      }
      if (synthesizedDetails.members) {
        synthesizedDetails.members = synthesizedDetails.members.map(sanitizeString);
      }
      if (synthesizedDetails.youtubeSearchQuery) {
        synthesizedDetails.youtubeSearchQuery = sanitizeString(synthesizedDetails.youtubeSearchQuery);
      }
    }
    
    // Check if new youtubeVideoId is playable
    let isPlayable = false;
    if (synthesizedDetails.youtubeVideoId) {
      isPlayable = await checkVideoPlayability(synthesizedDetails.youtubeVideoId);
    }
    
    // Construct database payload inside detailsCache object
    const updatedDetails = {
      ...details,
      ...synthesizedDetails,
      youtubeVideoId: isPlayable ? synthesizedDetails.youtubeVideoId : null,
    };

    const finalPayload = {
      ...originalData, // preserve original properties
      artistId: canonicalId,
      cacheKey: canonicalId,
      seedArtists: artistName,
      detailsCache: updatedDetails,
      cachedAt: admin.firestore.FieldValue.serverTimestamp(),
      cacheVersion: 2 // Match standard cacheVersion
    };

    // Update Firestore at canonicalId using Admin SDK
    try {
      enforceArtistCacheSchemaServer(finalPayload);
      await db.collection(collectionName).doc(canonicalId).set(finalPayload, { merge: true });
      console.log(`[Re-Synthesis] Successfully healed profile for canonical entity (${collectionName}): ${canonicalId}`);

      if (isAlias) {
        // Write alias redirect doc
        await db.collection(collectionName).doc(artistId).set({
          cacheKey: artistId,
          artistId: artistId,
          seedArtists: originalData.seedArtists || artistId,
          graphData: JSON.stringify({ nodes: [], links: [] }),
          filters: {},
          cacheVersion: 2,
          cachedAt: admin.firestore.FieldValue.serverTimestamp(),
          hitCount: 0,
          redirectTo: canonicalId
        });
        console.log(`[Re-Synthesis] Created Alias Redirect: ${artistId} -> ${canonicalId}`);
      }
    } catch (dbErr) {
      console.error(`[Re-Synthesis] Firestore set() failed for document: ${canonicalId}. Error:`, dbErr.message);
      console.error(`[Re-Synthesis] Contaminated Payload Dump:`, JSON.stringify(finalPayload, null, 2));
      throw dbErr;
    }

  } catch (error) {
    console.error(`[Re-Synthesis] Failed for artist ${artistId}:`, error);
  }
}

// Shared helper to retrieve entity cache from proxy with playability check
async function handleEntityGet(req, res, collectionName = 'artists') {
  const entityId = req.params.id;
  try {
    const docRef = db.collection(collectionName).doc(entityId);
    const docSnap = await docRef.get();
    
    if (!docSnap.exists) {
      return res.status(404).json({ error: `${collectionName === 'labels' ? 'Label' : 'Artist'} not found` });
    }
    
    const data = docSnap.data();
    
    // Resolve redirect if present (up to 3 redirects)
    if (data && typeof data.redirectTo === 'string' && data.redirectTo.trim().length > 0) {
      let canonicalId = data.redirectTo.trim();
      const match = canonicalId.match(/^([a-z0-9\-]+-(?:united-states|united-kingdom|canada|australia|germany|france|sweden|norway|italy|spain|brazil|mexico|japan|south-korea))-.+$/i);
      if (match) {
        console.log(`[Proxy Redirect Suffix Cleaner] Normalized redirect: ${canonicalId} -> ${match[1]}`);
        canonicalId = match[1];
      }
      console.log(`[Proxy] Redirecting read (${collectionName}): ${entityId} -> ${canonicalId}`);
      let currentId = canonicalId;
      let depth = 0;
      let currentSnap = docSnap;
      while (depth < 3) {
        const canonicalRef = db.collection(collectionName).doc(currentId);
        const nextSnap = await canonicalRef.get();
        if (!nextSnap.exists) break;
        currentSnap = nextSnap;
        const nextData = nextSnap.data();
        if (nextData && typeof nextData.redirectTo === 'string' && nextData.redirectTo.trim().length > 0) {
          let nextRedirectId = nextData.redirectTo.trim();
          const innerMatch = nextRedirectId.match(/^([a-z0-9\-]+-(?:united-states|united-kingdom|canada|australia|germany|france|sweden|norway|italy|spain|brazil|mexico|japan|south-korea))-.+$/i);
          if (innerMatch) {
            nextRedirectId = innerMatch[1];
          }
          currentId = nextRedirectId;
          depth++;
        } else {
          break;
        }
      }
      return res.json(currentSnap.data());
    }

    // Evaluate youtube video ID playability
    let details = null;
    if (data && typeof data.detailsCache === 'string' && data.detailsCache.trim().length > 0) {
      try {
        details = JSON.parse(data.detailsCache);
      } catch (e) {
        console.warn(`[Proxy] Failed to parse detailsCache JSON for ${entityId}:`, e.message);
      }
    }

    const videoId = details?.youtubeVideoId || data.youtubeVideoId;
    if (videoId) {
      const playable = await checkVideoPlayability(videoId);
      if (!playable) {
        console.warn(`[Edge Proxy] Unplayable YouTube Video ID: "${videoId}" for entity "${entityId}" (${collectionName}). Pruning and triggering re-synthesis...`);
        // Prune the video ID on-the-fly from the payload returned to the client
        if (details) {
          details.youtubeVideoId = null;
          data.detailsCache = JSON.stringify(details);
        }
        if (data.youtubeVideoId) {
          data.youtubeVideoId = null;
        }
        
        // Trigger async re-synthesis task (non-blocking)
        triggerReSynthesis(entityId, data, collectionName).catch(err => {
          console.error(`[Edge Proxy] Background re-synthesis trigger failed:`, err);
        });
      }
    }
    
    return res.json(data);
  } catch (error) {
    console.error(`[Proxy] Error retrieving entity ${entityId} from ${collectionName}:`, error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

app.get('/api/artist/:id', (req, res) => handleEntityGet(req, res, 'artists'));
app.get('/api/label/:id', (req, res) => handleEntityGet(req, res, 'labels'));

// REST route to check video playability for client JIT verification
app.get('/api/artist/validate-video/:videoId', async (req, res) => {
  const videoId = req.params.videoId;
  if (!videoId || videoId.length !== 11) {
    return res.json({ playable: false });
  }
  try {
    const playable = await checkVideoPlayability(videoId);
    return res.json({ playable });
  } catch (err) {
    console.error(`[Proxy] Error validating video ${videoId}:`, err);
    return res.json({ playable: false });
  }
});

app.get('/api/label/validate-video/:videoId', async (req, res) => {
  const videoId = req.params.videoId;
  if (!videoId || videoId.length !== 11) {
    return res.json({ playable: false });
  }
  try {
    const playable = await checkVideoPlayability(videoId);
    return res.json({ playable });
  } catch (err) {
    console.error(`[Proxy] Error validating video ${videoId}:`, err);
    return res.json({ playable: false });
  }
});

// Dedicated backend validation endpoint to execute an isolated web crawl task for video asset IDs.
app.post('/api/artist/scrape-video-id', express.json(), async (req, res) => {
  const { artistName, artistId } = req.body;
  if (!artistName || !artistId) {
    return res.status(400).json({ error: 'artistName and artistId are required' });
  }

  if (!GEMINI_API_KEY) {
    console.error(`[Scraper API] GEMINI_API_KEY is not defined.`);
    return res.json({ youtubeVideoId: null });
  }

  console.log(`[Scraper API] Running isolated search for artist: "${artistName}" (${artistId})`);

  const prompt = `Perform a Google Search for: '${artistName} official music video youtube'. 
Look at the very first organic YouTube result on the page. 
What is the exact 11-character YouTube video ID (the string after v=) for that top video?
Return your answer in this strict JSON format:
{
  "youtubeVideoId": "11-character-id"
}
If you cannot find a clear YouTube video ID for this artist, return null for the value.`;

  const requestBody = {
    contents: [
      {
        role: "user",
        parts: [{ text: prompt }]
      }
    ],
    tools: [
      {
        googleSearch: {}
      }
    ],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          youtubeVideoId: {
            type: "STRING",
            nullable: true,
            description: "The 11-character YouTube video ID parsed from the search results, or null if none is found."
          }
        },
        required: ["youtubeVideoId"]
      },
      maxOutputTokens: 200,
    }
  };

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[Scraper API] Gemini API returned status ${response.status}: ${errText}`);
      return res.json({ youtubeVideoId: null });
    }

    const resJson = await response.json();
    const candidateText = resJson.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!candidateText) {
      console.error("[Scraper API] No text candidate returned from Gemini");
      return res.json({ youtubeVideoId: null });
    }

    const scraped = JSON.parse(candidateText.trim());
    const videoId = scraped.youtubeVideoId;

    // Resolve redirect if present (up to 3 redirects)
    let targetId = artistId;
    let docRef = db.collection('artists').doc(targetId);
    let docSnap = await docRef.get();
    let docData = null;

    if (docSnap.exists) {
      docData = docSnap.data();
      if (docData && typeof docData.redirectTo === 'string' && docData.redirectTo.trim().length > 0) {
        let currentId = docData.redirectTo.trim();
        let depth = 0;
        while (depth < 3) {
          const canonicalRef = db.collection('artists').doc(currentId);
          const nextSnap = await canonicalRef.get();
          if (!nextSnap.exists) break;
          targetId = currentId;
          docRef = canonicalRef;
          docSnap = nextSnap;
          docData = nextSnap.data();
          if (docData && typeof docData.redirectTo === 'string' && docData.redirectTo.trim().length > 0) {
            currentId = docData.redirectTo.trim();
            depth++;
          } else {
            break;
          }
        }
      }
    }

    if (videoId && videoId.length === 11) {
      console.log(`[Scraper API] Found video ID "${videoId}" for artist "${artistName}". Updating Firestore...`);

      if (docSnap.exists) {
        let details = {};
        if (docData && docData.detailsCache) {
          try {
            let parsed = typeof docData.detailsCache === 'string' ? JSON.parse(docData.detailsCache) : docData.detailsCache;
            if (Array.isArray(parsed) && parsed.length > 0) {
              parsed = Array.isArray(parsed[0]) ? parsed[0][1] : parsed[0];
            }
            if (typeof parsed === 'string') {
              try {
                parsed = JSON.parse(parsed);
              } catch (e) {
                console.warn(`[Scraper API] Failed to parse double-stringified detailsCache:`, e.message);
              }
            }
            details = parsed || {};
          } catch (e) {
            console.warn(`[Scraper API] Failed to parse detailsCache:`, e.message);
          }
        }
        details.youtubeVideoId = videoId;
        
        const updatePayload = {
          ...docData,
          youtubeVideoId: videoId,
          detailsCache: details,
          cachedAt: admin.firestore.FieldValue.serverTimestamp()
        };
        enforceArtistCacheSchemaServer(updatePayload);
        await docRef.set(updatePayload, { merge: true });
        console.log(`[Scraper API] Successfully updated Firestore doc "${targetId}" with video ID "${videoId}"`);
      } else {
        console.log(`[Scraper API] Document does not exist for "${targetId}". Skipping skeleton creation.`);
      }

      return res.json({ youtubeVideoId: videoId });
    } else {
      console.log(`[Scraper API] No video ID found for artist "${artistName}".`);
      
      if (docSnap.exists) {
        let details = {};
        if (docData && docData.detailsCache) {
          try {
            let parsed = typeof docData.detailsCache === 'string' ? JSON.parse(docData.detailsCache) : docData.detailsCache;
            if (Array.isArray(parsed) && parsed.length > 0) {
              parsed = Array.isArray(parsed[0]) ? parsed[0][1] : parsed[0];
            }
            if (typeof parsed === 'string') {
              try {
                parsed = JSON.parse(parsed);
              } catch (e) {
                console.warn(`[Scraper API] Failed to parse double-stringified detailsCache:`, e.message);
              }
            }
            details = parsed || {};
          } catch (e) {
            console.warn(`[Scraper API] Failed to parse detailsCache:`, e.message);
          }
        }
        details.youtubeVideoId = null;
        
        const updatePayload = {
          ...docData,
          youtubeVideoId: null,
          detailsCache: details,
          cachedAt: admin.firestore.FieldValue.serverTimestamp()
        };
        enforceArtistCacheSchemaServer(updatePayload);
        await docRef.set(updatePayload, { merge: true });
        console.log(`[Scraper API] Updated Firestore doc "${targetId}" with youtubeVideoId = null`);
      }

      return res.json({ youtubeVideoId: null });
    }

  } catch (error) {
    console.error(`[Scraper API] Error scraping video ID for ${artistName}:`, error);
    return res.json({ youtubeVideoId: null });
  }
});


// Serve the static files from the React/Vite build output
app.use(express.static(path.join(__dirname, 'dist')));

// Fallback for SPA (React Router)
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Zcene Server listening on port ${PORT}`);
});
