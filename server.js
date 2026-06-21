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
app.use(
  '/api/gemini',
  (req, res, next) => {
    // Cleanse request headers to prevent Google's gateway from seeing
    // Firebase Hosting credentials (authorization) or client session cookies (cookie).
    delete req.headers['authorization'];
    delete req.headers['Authorization'];
    delete req.headers['cookie'];
    delete req.headers['Cookie'];
    next();
  },
  createProxyMiddleware({
    target: 'https://generativelanguage.googleapis.com',
    changeOrigin: true,
    pathRewrite: {
      '^/api/gemini': '', // Remove the /api/gemini prefix when forwarding
    },
    on: {
      proxyReq: (proxyReq, req, res) => {
        // Inject the API key securely on the backend
        if (GEMINI_API_KEY) {
          proxyReq.setHeader('x-goog-api-key', GEMINI_API_KEY);
        }
      },
    },
  })
);

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
    
    USE GOOGLE SEARCH to find:
    1. The most accurate bio and cultural significance. Use scannability techniques:
       - Chunking: Break information into smaller, digestible units.
       - Text Segmentation: Use short paragraphs and meaningful phrases.
       - Formatting: Use bolding for key terms and bullet points where appropriate to create white space.
       - Semantic Splitting: Group related content together by meaning.
    2. The canonical Wikipedia Special:FilePath image URL. imageUrl MUST be a Wikipedia Special:FilePath URL (https://en.wikipedia.org/wiki/Special:FilePath/...). Do not use image URLs from official artist sites or any third-party host.
    3. Confirmed top 3 studio albums.
    4. A verified, active YouTube video for the artist. You MUST run a dedicated search query like "[Artist Name] official music video site:youtube.com" or "[Artist Name] live performance site:youtube.com" to find a real, active video URL. Extract the 11-character video ID (e.g. from watch?v=XXXXXXXXXXX) only from verified Search results. If you cannot find a verified active video ID, or if the search results do not show the full URL, you MUST return null. Never guess or hallucinate a video ID.
    
    Your task is to generate a JSON object. You MUST follow this structure precisely:
    {
      "summary": "A scannable bio (approx. 100 words) using Markdown: short paragraphs, bolding for key terms, and bullet points for lists. Focus on style and significance.",
      "imageUrl": "https://en.wikipedia.org/wiki/Special:FilePath/...",
      "members": ["Name (Role)", ...],
      "details": {
        "genre": "string",
        "origin": "City, Country",
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
async function triggerReSynthesis(artistId, originalData) {
  if (!GEMINI_API_KEY) {
    console.error(`[Re-Synthesis] Failed: GEMINI_API_KEY is not defined.`);
    return;
  }
  
  // Parse detailsCache
  let details = null;
  if (originalData && originalData.detailsCache) {
    try {
      details = JSON.parse(originalData.detailsCache);
    } catch (e) {
      console.warn(`[Re-Synthesis] Failed to parse detailsCache:`, e.message);
    }
  }

  const artistName = details?.details?.artist || originalData.seedArtists || artistId;
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
      responseMimeType: "application/json",
      responseSchema: NODE_DETAILS_SCHEMA_SERVER,
      maxOutputTokens: 4000,
    }
  };

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

    const synthesizedDetails = JSON.parse(candidateText.trim());
    
    // Check if new youtubeVideoId is playable
    let isPlayable = false;
    if (synthesizedDetails.youtubeVideoId) {
      isPlayable = await checkVideoPlayability(synthesizedDetails.youtubeVideoId);
    }
    
    // Construct database payload inside detailsCache JSON string
    const updatedDetails = {
      ...details,
      ...synthesizedDetails,
      youtubeVideoId: isPlayable ? synthesizedDetails.youtubeVideoId : null,
    };

    const finalPayload = {
      ...originalData, // preserve original properties
      detailsCache: JSON.stringify(updatedDetails),
      cachedAt: admin.firestore.FieldValue.serverTimestamp(),
      cacheVersion: 2 // Match standard cacheVersion
    };

    // Update Firestore using Admin SDK
    await db.collection('artists').doc(artistId).set(finalPayload, { merge: true });
    console.log(`[Re-Synthesis] Successfully healed profile for artist: ${artistId}`);

  } catch (error) {
    console.error(`[Re-Synthesis] Failed for artist ${artistId}:`, error);
  }
}

// REST route to retrieve artist cache from proxy with playability check
app.get('/api/artist/:id', async (req, res) => {
  const artistId = req.params.id;
  try {
    const docRef = db.collection('artists').doc(artistId);
    const docSnap = await docRef.get();
    
    if (!docSnap.exists) {
      return res.status(404).json({ error: 'Artist not found' });
    }
    
    const data = docSnap.data();
    
    // Resolve redirect if present (up to 3 redirects)
    if (data && typeof data.redirectTo === 'string' && data.redirectTo.trim().length > 0) {
      const canonicalId = data.redirectTo.trim();
      console.log(`[Proxy] Redirecting artist read: ${artistId} -> ${canonicalId}`);
      let currentId = canonicalId;
      let depth = 0;
      let currentSnap = docSnap;
      while (depth < 3) {
        const canonicalRef = db.collection('artists').doc(currentId);
        const nextSnap = await canonicalRef.get();
        if (!nextSnap.exists) break;
        currentSnap = nextSnap;
        const nextData = nextSnap.data();
        if (nextData && typeof nextData.redirectTo === 'string' && nextData.redirectTo.trim().length > 0) {
          currentId = nextData.redirectTo.trim();
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
        console.warn(`[Proxy] Failed to parse detailsCache JSON for ${artistId}:`, e.message);
      }
    }

    const videoId = details?.youtubeVideoId || data.youtubeVideoId;
    if (videoId) {
      const playable = await checkVideoPlayability(videoId);
      if (!playable) {
        console.warn(`[Edge Proxy] Unplayable YouTube Video ID: "${videoId}" for artist "${artistId}". Pruning and triggering re-synthesis...`);
        // Prune the video ID on-the-fly from the payload returned to the client
        if (details) {
          details.youtubeVideoId = null;
          data.detailsCache = JSON.stringify(details);
        }
        if (data.youtubeVideoId) {
          data.youtubeVideoId = null;
        }
        
        // Trigger async re-synthesis task (non-blocking)
        triggerReSynthesis(artistId, data).catch(err => {
          console.error(`[Edge Proxy] Background re-synthesis trigger failed:`, err);
        });
      }
    }
    
    return res.json(data);
  } catch (error) {
    console.error(`[Proxy] Error retrieving artist ${artistId}:`, error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

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

// Serve the static files from the React/Vite build output
app.use(express.static(path.join(__dirname, 'dist')));

// Fallback for SPA (React Router)
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Zcene Server listening on port ${PORT}`);
});
