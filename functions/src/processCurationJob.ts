import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import { translateError } from "./services/errorTranslationLayer";
import {
  generateRootsBreakdownBackend,
  normalizeArtistId,
  fetchNodeDetailsBackend,
  scrapeVideoIdBackend,
  checkVideoPlayability,
  scrapeImageUrlBackend,
  buildCompositeCacheKey,
  extractArtistSubGraph,
  validateSeedOriginBackend
} from "./services/curatorService";

// Initialize Firebase Admin SDK if not already done
if (getApps().length === 0) {
  initializeApp();
}

const db = getFirestore();
try {
  db.settings({ ignoreUndefinedProperties: true });
} catch (e) {
  // Ignore if already set by another function module
}

/**
 * Sanity Check: Validate that detailsCache is a structured object matching the schema,
 * and specifically reject raw strings or arrays of entries to prevent database pollution.
 */
function validateArtistDetailsSchema(artistId: string, details: any): void {
  if (!details) {
    throw new Error(`[Schema Sanity Check] detailsCache is null or undefined for artist: ${artistId}`);
  }
  if (typeof details === "string") {
    throw new Error(`[Schema Sanity Check] detailsCache is serialized as a raw string for artist: ${artistId}`);
  }
  if (Array.isArray(details)) {
    throw new Error(`[Schema Sanity Check] detailsCache is an array instead of a structured object for artist: ${artistId}`);
  }

  // Verify biography/summary
  const bio = details.summary || details.bio;
  if (!bio || typeof bio !== 'string' || bio.trim().length < 5) {
    throw new Error(`[Schema Sanity Check] detailsCache is missing summary for artist: ${artistId}`);
  }

  // Verify details object
  if (!details.details || typeof details.details !== 'object') {
    throw new Error(`[Schema Sanity Check] detailsCache.details is missing or invalid for artist: ${artistId}`);
  }
  const { genre, origin, founded } = details.details;
  if (genre === undefined || genre === null || typeof genre !== 'string') {
    throw new Error(`[Schema Sanity Check] detailsCache.details is missing genre for artist: ${artistId}`);
  }
  if (origin === undefined || origin === null || typeof origin !== 'string') {
    throw new Error(`[Schema Sanity Check] detailsCache.details is missing origin for artist: ${artistId}`);
  }
  if (founded === undefined || founded === null || typeof founded !== 'string') {
    throw new Error(`[Schema Sanity Check] detailsCache.details is missing founded year for artist: ${artistId}`);
  }

  // Verify discography
  if (!details.discography || !Array.isArray(details.discography)) {
    throw new Error(`[Schema Sanity Check] detailsCache.discography is missing or not an array for artist: ${artistId}`);
  }
}

/**
 * Recursively removes any undefined properties from an object to prevent
 * Firestore serialization errors. Note: null values are intentionally preserved —
 * Firestore's Node.js SDK accepts null as a valid stored value, and stripping it
 * would cause fields like imageUrl to be entirely absent from the document.
 */
function sanitizeUndefinedProperties(obj: any): any {
  if (obj === null || obj === undefined) return null;
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeUndefinedProperties(item));
  }
  if (typeof obj === 'object') {
    const clean: any = {};
    for (const key of Object.keys(obj)) {
      const val = obj[key];
      if (val !== undefined) {  // Only strip undefined — null is a valid Firestore value
        clean[key] = sanitizeUndefinedProperties(val);
      }
    }
    return clean;
  }
  return obj;
}

/**
 * Belt-and-suspenders write boundary normalizer.
 * Guarantees that imageUrl is always written as a string (even "") to Firestore,
 * regardless of what upstream LLM parsing or sanitization returned.
 * Applied immediately before every sanitizeUndefinedProperties call at write time.
 */
function normalizeDetailsForWrite(details: any): any {
  if (!details || typeof details !== 'object' || Array.isArray(details)) return details;
  return {
    ...details,
    imageUrl: (typeof details.imageUrl === 'string') ? details.imageUrl : ""
  };
}

/**
 * Strips artist-centric fields from a label profile before caching in Firestore.
 */
function sanitizeLabelProfile(details: any): any {
  if (!details) return null;
  let parsed = typeof details === 'string' ? JSON.parse(details) : details;
  if (!parsed || typeof parsed !== 'object') return null;
  const cleanDetails = {
    genre: parsed.details?.genre || null,
    origin: parsed.details?.origin || null,
    founded: parsed.details?.founded || null,
    notableArtists: parsed.details?.notableArtists || [],
  };
  return {
    summary: parsed.summary || parsed.bio || parsed.description || "",
    imageUrl: parsed.imageUrl || parsed.image || null,
    details: cleanDetails,
    discography: Array.isArray(parsed.discography) ? parsed.discography : [],
    links: Array.isArray(parsed.links) ? parsed.links : [],
  };
}

/**
 * Robust matching helper to reconcile disambiguated seed strings (e.g., "buggin-united-states")
 * with canonical AI node IDs or names (e.g., "buggin"). Supports prefix/suffix stripping.
 */
function isEntitySeedMatch(seedNorm: string, candidateNorm: string): boolean {
  if (!seedNorm || !candidateNorm) return false;
  const s = normalizeArtistId(seedNorm);
  const c = normalizeArtistId(candidateNorm);
  if (s === c) return true;
  if (s.startsWith(`${c}-`) || c.startsWith(`${s}-`)) return true;
  if (s.includes(`-${c}-`) || s.endsWith(`-${c}`) || c.includes(`-${s}-`) || c.endsWith(`-${s}`)) return true;
  return false;
}

const KNOWN_COUNTRY_SLUGS = [
  '-united-states', '-united-kingdom', '-global', '-australia', '-canada', '-germany', '-france',
  '-japan', '-sweden', '-italy', '-spain', '-brazil', '-mexico', '-netherlands', '-belgium',
  '-norway', '-finland', '-denmark', '-ireland', '-new-zealand', '-poland', '-austria',
  '-switzerland', '-uk', '-usa', '-us', '-gb', '-au', '-ca', '-de', '-fr', '-jp', '-se', '-it', '-es',
  '-br', '-mx', '-nl', '-be', '-no', '-fi', '-dk', '-ie', '-nz', '-pl', '-at', '-ch'
];

function stripCountrySlug(name: string): string {
  let cleanName = name.trim();
  for (const suffix of KNOWN_COUNTRY_SLUGS) {
    if (cleanName.toLowerCase().endsWith(suffix)) {
      cleanName = cleanName.substring(0, cleanName.length - suffix.length);
      break;
    }
  }
  return cleanName;
}

/**
 * Stateful Project UX Upgrade: Update the user's project document status
 * to reflect in-progress background curation and write back completed graphData.
 */
async function updateProjectStatus(userId: string, projectId: string, updates: any) {
  try {
    const projectRef = db.collection("users").doc(userId).collection("projects").doc(projectId);
    const sanitizedUpdates = sanitizeUndefinedProperties(updates);
    await projectRef.update({
      ...sanitizedUpdates,
      updatedAt: FieldValue.serverTimestamp()
    });
    console.log(`[Curation Backend] Project ${projectId} status updated successfully:`, sanitizedUpdates);
  } catch (err: any) {
    console.error(`[Curation Backend] Failed to update project ${projectId} status:`, err.message);
  }
}

export const processCurationJob = onDocumentCreated({
  document: "curationJobs/{jobId}",
  secrets: ["GEMINI_API_KEY"],
  timeoutSeconds: 540, // Firebase Functions v2 SDK enforces a hard 540s cap for Firestore event triggers
  memory: "1GiB",
}, async (event) => {
  const snapshot = event.data;
  if (!snapshot) {
    console.log("No data associated with the event");
    return;
  }
  
  const jobId = event.params.jobId;
  const jobData = snapshot.data();
  console.log(`[Curation Backend] Processing job ${jobId} with status: ${jobData.status}`);

  if (jobData.status !== "pending") {
    console.log(`Job ${jobId} is not in pending state. Skipping.`);
    return;
  }

  // Update status to processing
  const jobDocRef = db.collection("curationJobs").doc(jobId);
  await jobDocRef.update({
    status: "processing",
    updatedAt: FieldValue.serverTimestamp()
  });

  const { jobType, inputPayload } = jobData;
  if (inputPayload?.projectId && jobData.userId) {
    await updateProjectStatus(jobData.userId, inputPayload.projectId, { status: "curating" });
  }

  try {
    console.log(`[Curation Backend] Executing ${jobType} for user ${jobData.userId} with payload:`, inputPayload);

    let result: any = null;

    const collectedTokens: Record<string, { prompt: number, candidates: number, total: number }> = {};
    const usageCollector = {
      push: (model: string, usage: any) => {
        if (!collectedTokens[model]) collectedTokens[model] = { prompt: 0, candidates: 0, total: 0 };
        collectedTokens[model].prompt += usage.promptTokenCount;
        collectedTokens[model].candidates += usage.candidatesTokenCount;
        collectedTokens[model].total += usage.totalTokenCount;
      }
    };

    if (jobType === "graph_generation") {
      // Determine if we should run in mock mode
      const isEmulator = false; // TEMPORARILY DISABLED: process.env.FUNCTIONS_EMULATOR === "true";
      const isMissingApiKey = !process.env.GEMINI_API_KEY;
      const forceMocks = inputPayload?.useMocks === true;

      if (isEmulator || isMissingApiKey || forceMocks) {
        console.log(`[Curation Backend] [Step 1: Graph Generation Started] Mock conditions met. Running simulated mock.`);
        
        // Keep the 5-second simulated delay for verification of loading screens
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        const mockDetails = [
          [
            "Skeleton Node",
            {
              summary: "Skeleton Node is a simulated music project created to verify the background orchestrator pipeline.",
              details: { artist: "Skeleton Node", genre: "Synth-wave", origin: "San Jose, USA", founded: "2026", notableArtists: [] },
              members: ["Antigravity (Synthesizer)"],
              links: [],
              discography: [{ albumName: "Beta Launch", releaseYear: "2026" }],
              recommendationReason: "Used to test the Cloud Function pipeline.",
              youtubeVideoId: "dQw4w9WgXcQ"
            }
          ]
        ];

        result = {
          graphData: {
            nodes: [
              { id: "Skeleton Node", type: "artist", group: 1 }
            ],
            links: [],

          },
          detailsCache: JSON.stringify(mockDetails)
        };
      } else {
        const artistList = inputPayload.artists
          .split('::')
          .map((a: string) => a.trim())
          .filter(Boolean);


        console.log(`[Curation Backend] [Phase 1: Global Cache Routing] Checking seeds: ${artistList.join(', ')}`);

        // ── Fix A: Canonical Slug Resolution Map ──────────────────────────────────
        // Performs the same slug-dedup query that executeCurationPipeline runs in Column 2,
        // building a single authoritative map of raw seed norm → canonical Firestore doc ID.
        // All subsequent seed document writes (synthesisRationale, Phase 1 lookup, subgraph
        // extraction) MUST use this map as their sole source of truth.
        // Aligns with architecture_truth.md Law §6 (Canonical Alias Resolution).
        const resolvedSeedNormMap = new Map<string, string>();
        for (const seed of artistList) {
          const seedNorm = normalizeArtistId(seed);
          let canonicalId = seedNorm; // default: raw norm (no country suffix found)
          try {
            const dedupQuery = await db.collection('artists')
              .where('artistId', '>=', seedNorm)
              .where('artistId', '<=', `${seedNorm}\uf8ff`)
              .limit(5)
              .get();
            if (!dedupQuery.empty) {
              for (const snap of dedupQuery.docs) {
                const snapData = snap.data();
                // Prefer the doc with graphData (most complete). If none has graphData,
                // still adopt the canonical slug ID to keep naming consistent.
                if (snap.id !== seedNorm && snapData.artistId && snapData.artistId.startsWith(seedNorm)) {
                  canonicalId = snap.id; // e.g. "buggin-us"
                  if (snapData.graphData) break; // prefer fully-populated doc
                }
              }
            }
          } catch (dedupErr) {
            console.warn(`[Curation Backend] [Fix A] Seed slug dedup failed for "${seedNorm}", proceeding with raw norm.`, dedupErr);
          }
          resolvedSeedNormMap.set(seedNorm, canonicalId);
          console.log(`[Curation Backend] [Fix A] Seed slug resolved: "${seedNorm}" → "${canonicalId}"`);
        }
        // ─────────────────────────────────────────────────────────────────────────

        const resolvedSeedArray: any[] = [];
        
        for (const seed of artistList) {
           const seedNorm = normalizeArtistId(seed);
           // Fix C: Use the canonical slug from resolvedSeedNormMap, not the raw seedNorm.
           // Without this, Phase 1 reads artists/buggin (2 fields) instead of
           // artists/buggin-us (14 fields), evaluating as a cache miss every time.
           // Aligns with architecture_truth.md Law §1 (Column 3 must not re-synthesize hydrated data).
           const canonicalSeedId = resolvedSeedNormMap.get(seedNorm) ?? seedNorm;
           let cachedDetails: any = null;
           
           try {
             // We check artists collection primarily for seeds (Fix C: use canonical slug doc)
             const cacheDoc = await db.collection("artists").doc(canonicalSeedId).get();
             if (cacheDoc.exists) {
                const cacheData = cacheDoc.data();
                if (cacheData && cacheData.detailsCache) {
                   cachedDetails = typeof cacheData.detailsCache === 'string' ? JSON.parse(cacheData.detailsCache) : cacheData.detailsCache;
                   if (Array.isArray(cachedDetails) && cachedDetails.length > 0) {
                      const match = cachedDetails.find((item: any) => normalizeArtistId(item[0]) === seedNorm);
                      if (match && match[1]) {
                        cachedDetails = match[1];
                      } else {
                        cachedDetails = Array.isArray(cachedDetails[0]) ? cachedDetails[0][1] : cachedDetails[0];
                      }
                   }
                }
             }
           } catch (e) {
              console.warn(`Failed cache lookup for ${seedNorm}`, e);
           }
           
           if (cachedDetails && cachedDetails.summary && cachedDetails.summary.length > 50 && cachedDetails.details?.genre && cachedDetails.imageUrl) {
              console.log(`[Phase 1] Cache Hit for seed: ${seed}`);
              resolvedSeedArray.push({
                 id: seedNorm,
                 name: seed,
                 origin: cachedDetails.details.origin || "",
                 genre: cachedDetails.details.genre || "",
                 isCacheHit: true
              });
           } else {
              console.log(`[Phase 1] Cache Miss for seed: ${seed}. Routing to Phase 2 (Flash-Lite).`);
              
              // Phase 2: Origin Validation (Flash-Lite)
              const validationResult = await validateSeedOriginBackend(seed, usageCollector);
              if (validationResult.isValid) {
                 resolvedSeedArray.push({
                    id: normalizeArtistId(validationResult.id),
                    name: validationResult.id,
                    origin: validationResult.origin,
                    genre: validationResult.genre,
                    isCacheHit: false
                 });
              } else {
                 throw new Error(`Validation failed for seed: ${seed}. It is not recognized as a valid musical entity.`);
              }
           }
        }
        
        console.log(`[Phase 3: The Aggregator Gate] Resolved Seed Array:`, resolvedSeedArray);
        
        let finalGraph = inputPayload.baseGraph;

        // Structural Integrity Guard: Verify that we received a valid, rich graph from the model
        const artistNodesCount = finalGraph.nodes?.filter((n: any) => n.type === 'artist' || !n.type).length || 0;
        const minimumRequiredArtists = 2; // Seed artist + at least 1 recommendation
        if (!finalGraph.nodes || finalGraph.nodes.length === 0 || artistNodesCount < minimumRequiredArtists) {
          throw new Error(`Generated graph failed structural integrity check. Artist nodes count: ${artistNodesCount} (minimum required: ${minimumRequiredArtists}). Curation aborted.`);
        }


        // Parse seed artists list (already done above)

        // Strip regional slugs from the seed artists string to prevent prompt hallucination
        const cleanSeedArtistsContext = artistList
          .map((a: string) => stripCountrySlug(a))
          .join('::');

        // [Pre-Hydration ID Standardization Removed]
        // executeCurationPipeline already correctly assigns canonical slugged IDs (e.g. 'buggin-us')
        // to both the node AND its links. Muting it here prevents disconnected spiderwebs.

        // 1. ISOLATE INTERACTIVE NODES: Explicitly filter out Structural Hubs (genre, founded, country)
        // Structural hubs bypass the hydration loop entirely.
        const recommendedEntities = finalGraph.nodes.filter((n: any) => 
          n.type === 'artist' || n.type === 'label'
        ).map((n: any) => ({
          id: n.id,
          name: n.label || n.id,
          type: n.type,
          origin: n.origin || null
        }));

        // CRITICAL FIX: Ensure all seed artists are explicitly placed into the hydration queue.
        // The architectural design dictates that seeds must go through the gap-filling phase just like deep cuts,
        // even if the LLM omitted them or modified their IDs in the graph output.
        for (const seed of artistList) {
          const seedNorm = normalizeArtistId(seed);
          const exists = recommendedEntities.some((e: any) => isEntitySeedMatch(seedNorm, e.id) || isEntitySeedMatch(seedNorm, e.name));
          if (!exists) {
            recommendedEntities.unshift({
              id: seed,
              name: seed,
              type: 'artist',
              origin: null
            });
            console.log(`[Curation Backend] Explicitly pushing missing seed artist into gap-filling queue: ${seed}`);
          }
        }

        console.log(`[Curation Backend] [Step 2: Hydration Loop Started] Hydrating details for ${recommendedEntities.length} entities in the graph:`, recommendedEntities.map((e: any) => `${e.name} (${e.type})`));

        const detailsCacheEntries: [string, any][] = [];

        // Fetch details in concurrency chunks of 3 to respect the 15 RPM Gemini limit
        // (1 text + 1 image req per node = ~6 requests per batch)
        const batchSize = 3;
        for (let i = 0; i < recommendedEntities.length; i += batchSize) {
          const chunk = recommendedEntities.slice(i, i + batchSize);
          console.log(`[Curation Backend] Hydrating batch ${Math.floor(i / batchSize) + 1} of ${Math.ceil(recommendedEntities.length / batchSize)} (${chunk.length} entities)...`);
          const batchStartTime = Date.now();
          const chunkResults = await Promise.all(
            chunk.map(async (entityObj: any, idx: number) => {
              const rawName = entityObj.name;
              let artistNormId = entityObj.id; // Bug 1 & 2 Fix: Preserve the pre-slugged ID
              
              const isLabel = entityObj.type === 'label';

              // ── Slug Deduplication Guard ───────────────────────────────────────────
              // Before using artistNormId (which may be derived from a new slug), query
              // Firestore by the base artistId field to detect if a canonical variation
              // already exists (e.g., sick-of-it-all-usa already in DB when we are about
              // to create sick-of-it-all). If a canonical doc is found, adopt its ID.
              if (!isLabel) {
                try {
                  const baseNormId = normalizeArtistId(rawName); // without country suffix
                  const existingQuery = await db.collection("artists")
                    .where("artistId", ">=", baseNormId)
                    .where("artistId", "<=", `${baseNormId}\uf8ff`)
                    .limit(5)
                    .get();
                  if (!existingQuery.empty) {
                    // Pick the most-complete canonical doc (has graphData preferred)
                    let bestDocId = artistNormId;
                    for (const snap of existingQuery.docs) {
                      const snapData = snap.data();
                      // Fix: Skip redirect pointer documents (created by Fix E remediation).
                      // A doc with redirectTo set is an alias stub, NOT a canonical record.
                      // Without this guard, artists/buggin (redirectTo: "buggin-us") is
                      // mistakenly adopted as the canonical ID, starving the hydration loop
                      // of the real detailsCache in artists/buggin-us. (Law §6)
                      if (snapData.redirectTo) continue;
                      if (snap.id !== artistNormId && snapData.artistId && snapData.artistId.startsWith(baseNormId)) {
                        // Prefer docs that already have graphData (fully curated)
                        if (snapData.graphData || snap.id === artistNormId) {
                          bestDocId = snap.id;
                          break;
                        }
                        bestDocId = snap.id;
                      }
                    }
                    if (bestDocId !== artistNormId) {
                      console.log(`[Curation Backend] Slug Dedup: Adopting existing canonical ID "${bestDocId}" instead of minting "${artistNormId}"`);
                      artistNormId = bestDocId;
                    }
                  }
                } catch (dedupErr) {
                  console.warn(`[Curation Backend] Slug dedup query failed for "${rawName}", proceeding with derived ID:`, dedupErr);
                }
              }

              // 1. Check local Firestore Cache first
              let details: any = null;
              try {
                const collName = isLabel ? "labels" : "artists";
                const cacheDoc = await db.collection(collName).doc(artistNormId).get();
                if (cacheDoc.exists) {
                  const cacheData = cacheDoc.data();
                  if (cacheData && cacheData.detailsCache) {
                    let cachedDetails = cacheData.detailsCache;
                    if (typeof cachedDetails === 'string') {
                      try {
                        cachedDetails = JSON.parse(cachedDetails);
                      } catch (e) {}
                    }
                    
                    if (cachedDetails) {
                      // Un-nest array wrapper layer if legacy format [ [ "name", { ... } ] ]
                      if (Array.isArray(cachedDetails) && cachedDetails.length > 0) {
                        const match = cachedDetails.find((item: any) => normalizeArtistId(item[0]) === artistNormId);
                        if (match && match[1]) {
                          cachedDetails = match[1];
                        } else {
                          cachedDetails = Array.isArray(cachedDetails[0]) ? cachedDetails[0][1] : cachedDetails[0];
                        }
                      }
                      
                      // Universal Cache Validation: A cached document is only a valid hit if it is
                      // truly complete — it must have a meaningful summary AND a genre AND an imageUrl.
                      // Any entity missing imageUrl or genre is considered a stale stub and must be
                      // re-routed through full Gemini hydration and iTunes scraping. This rule applies
                      // equally to seeds and deep cuts — no special-case flags needed.
                      const isCacheComplete = (
                        cachedDetails &&
                        cachedDetails.summary &&
                        cachedDetails.summary.length > 50 &&
                        cachedDetails.details?.genre &&
                        (isLabel || cachedDetails.imageUrl)
                      );
                      if (isCacheComplete) {
                        details = cachedDetails;
                        console.log(`[Curation Backend] Direct cache hit (complete) for details of: ${artistNormId}`);
                      } else if (cachedDetails) {
                        console.log(`[Curation Backend] Cache doc found but incomplete (missing imageUrl or genre) for: ${artistNormId}. Routing to full hydration.`);
                      }
                    }
                  }
                }
              } catch (cacheErr) {
                console.warn(`[Curation Backend] Direct cache lookup failed for details of: ${artistNormId}`, cacheErr);
              }

              // 2. Fetch from Gemini if cache miss or partial hydration needed
              let requiresTextHydration = false;
              let requiresImageScraping = false;
              let requiresVideoScraping = false;

              // Extract clean human-readable name for APIs by stripping known country slugs

              // Extract clean human-readable name for APIs by stripping known country slugs
              let searchArtistName = stripCountrySlug(rawName);

              if (details && details.details && details.details.artist && details.details.artist !== rawName) {
                searchArtistName = details.details.artist;
              }

              if (!details) {
                requiresTextHydration = true;
                requiresImageScraping = true;
                requiresVideoScraping = true;
              } else if (
                details.summary === "Imported from Apple Music library." || 
                details.summary.length <= 50 || 
                !details.details?.genre ||
                details.summary.includes("Mock Bio") ||
                (!details.imageUrl && !isLabel)
              ) {
                // Stub node (e.g. from frontend library import or test seed) or missing image -> Full Hydration
                requiresTextHydration = true;
                requiresImageScraping = true;
                requiresVideoScraping = true;
              } else {
                // Complete canonical cache hit -> STRICT BYPASS
                // We do not mutate or re-scrape existing global records.
                // However, we MUST check if it's missing assets due to a past failure.
                let isReadOnly = true;
                if (!details.imageUrl && !isLabel) {
                   requiresImageScraping = true;
                   isReadOnly = false;
                }
                if (!details.youtubeVideoId && !isLabel) {
                   requiresVideoScraping = true;
                   isReadOnly = false;
                }
                if (isReadOnly) {
                   details._isReadOnly = true;
                }
              }

              const tempNode = { id: searchArtistName, type: entityObj.type as any, group: 1 };

              // Stagger concurrent requests by 1000ms to prevent API burst rate limiting (iTunes & Gemini)
              if (idx > 0 && (requiresTextHydration || requiresImageScraping || requiresVideoScraping)) {
                await new Promise(resolve => setTimeout(resolve, idx * 1000));
              }

              if (requiresTextHydration) {

                console.log(`[Curation Backend] Cache miss (or missing text). Hydrating details for ${isLabel ? 'label' : 'artist'}: ${searchArtistName}...`);

                // Change 2 — Per-node transient retry with 2-second backoff.
                // Now also retries on JSON parse failures or schema validation errors (AI hallucination glitches).
                const isTransientError = (err: any): boolean => {
                  const msg = (err?.message || String(err)).toLowerCase();
                  return /429|503|resource.?exhausted|service.?unavailable|too many requests|timeout|fetch failed|network|socket|parse|invalid data|json/i.test(msg);
                };

                try {
                  details = await fetchNodeDetailsBackend(tempNode, finalGraph, cleanSeedArtistsContext, null, usageCollector);
                } catch (firstErr: any) {
                  if (isTransientError(firstErr)) {
                    console.warn(`[Curation Backend] Transient error for ${artistNormId}. Retrying in 8s...`, firstErr.message);
                    await new Promise(resolve => setTimeout(resolve, 8000));
                    try {
                      details = await fetchNodeDetailsBackend(tempNode, finalGraph, cleanSeedArtistsContext, null, usageCollector);
                      console.log(`[Curation Backend] Retry succeeded for: ${artistNormId}`);
                    } catch (retryErr: any) {
                      console.error(`[Curation Backend] Retry also failed for: ${artistNormId}. Safely skipping cache write.`, retryErr.message);
                      return null;
                    }
                  } else {
                    console.error(`[Curation Backend] Hydration failed (non-transient) for: ${artistNormId}. Safely skipping cache write.`, firstErr.message);
                    return null;
                  }
                }
                
                // Realign searchArtistName if the LLM provided a cleaner, verified name
                if (details && details.details && details.details.artist) {
                  searchArtistName = details.details.artist;
                }
              }

              if (details) {
                // 3. Scrape YouTube and validate video ID (only for artists; labels do not have music videos)
                if (!isLabel && requiresVideoScraping) {
                  try {
                    if (details.youtubeVideoId) {
                      const playable = await checkVideoPlayability(details.youtubeVideoId);
                      if (!playable) {
                        details.youtubeVideoId = null;
                      }
                    }
                    if (!details.youtubeVideoId && details.youtubeSearchQuery) {
                      const scrapedId = await scrapeVideoIdBackend(searchArtistName, artistNormId);
                      if (scrapedId) {
                        const playable = await checkVideoPlayability(scrapedId);
                        if (playable) {
                          details.youtubeVideoId = scrapedId;
                        }
                      }
                    }
                  } catch (e) {
                    console.warn(`[Media Sync] Soft warning: Media player validation failed for ${searchArtistName}. Bypassing sync check.`, e);
                    details.youtubeVideoId = null;
                  }
                }

                if (!details.details) {
                  details.details = { genre: "", origin: "", founded: "", notableArtists: [] };
                }

                // 4. Scrape dedicated Image URL (Artists Only)
                if (requiresImageScraping && searchArtistName && !isLabel) {
                  try {
                    let attemptName = searchArtistName;
                    const scrapedImg = await scrapeImageUrlBackend(
                      attemptName, 
                      'artist',
                      details.details.genre || "",
                      details.summary || ""
                    );
                    if (scrapedImg) {
                      details.imageUrl = scrapedImg;
                    } else {
                      // ⚠️ STRICT FAIL-FAST RULE: No deterministic fallback images.
                      console.warn(`[Image Scraper] No image found for ${searchArtistName}.`);
                      details.imageUrl = 'not-found';
                    }
                  } catch (e) {
                    // ⚠️ STRICT FAIL-FAST RULE: Catch API timeouts instantly.
                    console.warn(`[Image Scraper] Timeout/Error for ${searchArtistName}. Enforcing fail-fast rule.`);
                    details.imageUrl = 'not-found';
                  }
                }

                details.details.artist = details.details.artist || searchArtistName;
                // Note: synthesisRationale is NOT stamped here. The real Root Breakdown is
                // generated after all hydration completes (Step 4) and written back to the
                // seed artist doc explicitly. Pre-stamping a stub would pollute the artist
                // doc and corrupt the Roots Breakdown displayed on cache hits.

                console.log(`[Curation Backend] Hydration successful for: ${artistNormId}`);
              }
              if (!details) return null;
              return [artistNormId, details] as [string, any];
            })
          );

          console.log(`[Curation Backend] [Step 3: Firestore Caching] Hydration complete. Writing ${chunkResults.length} entities to Firestore cache...`);

          for (const res of chunkResults) {
            if (res) {
              const existingIndex = detailsCacheEntries.findIndex((entry: any) => isEntitySeedMatch(normalizeArtistId(res[0]), entry[0]));
              if (existingIndex !== -1) {
                detailsCacheEntries[existingIndex] = res;
              } else {
                detailsCacheEntries.push(res);
              }
            }
          }

          // ── Dynamic Rate-Limit Cooldown ──────────────────────────────────────────────
          // The Gemini 15 RPM quota requires a minimum 25-second window between batches
          // of 3 entities (~6 calls). If the batch itself consumed ≥25s (e.g. because
          // one entity needed full googleSearch grounding), the rate-limit window has
          // already elapsed and no additional sleep is needed. We recover this dead time
          // by sleeping only the remaining delta — or zero if the batch ran long.
          if (i + batchSize < recommendedEntities.length) {
            const batchElapsedMs = Date.now() - batchStartTime;
            const RATE_LIMIT_WINDOW_MS = 25000;
            const remainingCooldownMs = Math.max(0, RATE_LIMIT_WINDOW_MS - batchElapsedMs);
            if (remainingCooldownMs > 0) {
              console.log(`[Curation Backend] Batch complete (${Math.round(batchElapsedMs / 1000)}s active). Cooling down for ${Math.round(remainingCooldownMs / 1000)}s to respect rate limits...`);
              await new Promise(resolve => setTimeout(resolve, remainingCooldownMs));
            } else {
              console.log(`[Curation Backend] Batch complete (${Math.round(batchElapsedMs / 1000)}s active). Rate-limit window already elapsed — skipping cooldown.`);
            }
          }
        }

        // Change 3 — Hydration Completeness Audit Log.
        // Identifies any nodes that failed hydration (null result) and logs a warning.
        // This provides operational visibility for monitoring the zero-miss hydration mandate.
        const failedHydrationIds = recommendedEntities
          .filter((e: any) => !detailsCacheEntries.some(entry => isEntitySeedMatch(normalizeArtistId(e.name), entry[0])))
          .map((e: any) => e.name);

        console.log(`[Curation Backend] Hydration complete. Success: ${detailsCacheEntries.length}/${recommendedEntities.length} entities.`);
        if (failedHydrationIds.length > 0) {
          console.warn(`[Curation Backend] ⚠️ HYDRATION INCOMPLETE — ${failedHydrationIds.length} node(s) failed and will not be pre-cached: ${failedHydrationIds.join(', ')}`);
        } else {
          console.log(`[Curation Backend] ✅ All ${recommendedEntities.length} entities hydrated successfully — zero-miss compliance confirmed.`);
        }

        // ─── QUALITY BASELINE: Surgical Graph Pruning ────────────────────────────
        // Any non-seed entity that completely failed text hydration (LLM could not
        // generate a bio/genre after all retries) is excised from the graph topology
        // right here, before the Roots Breakdown or any write-back. This prevents
        // hollow nodes from appearing in the Spiderweb or polluting the database.
        // Seeds are NOT pruned here — a missing seed causes a fatal throw below.
        const hydratedNorms = new Set<string>(
          detailsCacheEntries.map(entry => normalizeArtistId(entry[0]))
        );
        const seedNormSet = new Set<string>(artistList.map((a: string) => normalizeArtistId(a)));

        if (finalGraph.nodes) {
          const prunedIds = new Set<string>();
          finalGraph.nodes = finalGraph.nodes.filter((node: any) => {
            const nodeNorm = normalizeArtistId(node.id);
            const typeLower = (node.type || 'artist').toLowerCase();
            const isStructural = !['artist', 'label'].includes(typeLower);
            const isSeedNode = Array.from(seedNormSet).some((s: string) => isEntitySeedMatch(s, nodeNorm));
            const isHydrated = Array.from(hydratedNorms).some((h: string) => isEntitySeedMatch(nodeNorm, h));
            if (!isHydrated && !isSeedNode && !isStructural) {
              console.warn(`[Quality Baseline] Surgically pruning unhydratable node from graph topology: ${node.id}`);
              prunedIds.add(node.id);
              return false;
            }
            return true;
          });

          if (prunedIds.size > 0 && finalGraph.links) {
            finalGraph.links = finalGraph.links.filter((link: any) => {
              const srcId = typeof link.source === 'string' ? link.source : (link.source as any)?.id;
              const tgtId = typeof link.target === 'string' ? link.target : (link.target as any)?.id;
              return !prunedIds.has(srcId) && !prunedIds.has(tgtId);
            });
            console.log(`[Quality Baseline] Pruned ${prunedIds.size} hollow node(s) and their connections from the graph.`);
          }
        }

        // [Stage 2 LLM Pass] Mint a full, deep-cut-aware Roots Breakdown
        // [Stage 2 LLM Pass] Mint a full, deep-cut-aware Roots Breakdown unconditionally.
        // Per the Unified Canvas Architecture (Phase 4), once gap-filling is complete the system
        // ALWAYS mints a rich narrative — for single-seed, multi-seed, and filtered jobs alike.
        // isSandboxMode governs write-back isolation only; it must not suppress content generation.
        console.log(`[Curation Backend] Batch hydration complete. Executing Final 3.1 Pro Synthesis...`);

    const idRewriteMap = new Map<string, string>();
    const seedNorms = artistList.map((a: string) => normalizeArtistId(a));
    let rootBreakdownStr = "";
    try {
      // 3.1 Pro: Root Breakdown Narrative
      rootBreakdownStr = await generateRootsBreakdownBackend(inputPayload.artists, detailsCacheEntries, usageCollector);
      finalGraph.synthesisRationale = rootBreakdownStr;

      // --- PRE-COMPUTE ID REWRITE MAP BEFORE GRAPH EXTRACTION ---
      
      for (const entityObj of recommendedEntities) {
        const recNorm = normalizeArtistId(entityObj.name);
        const matchingSeedNorm = seedNorms.find((s: string) => isEntitySeedMatch(s, recNorm));
        const recDetailsEntry = detailsCacheEntries.find((entry: any) => isEntitySeedMatch(recNorm, entry[0]));
        
        const disambiguatedCanonicalId = recDetailsEntry ? (recDetailsEntry as any)[0] : recNorm;
        const compositeCanonicalId = buildCompositeCacheKey(disambiguatedCanonicalId, inputPayload.filters || undefined);
        idRewriteMap.set(recNorm, compositeCanonicalId);
        
        if (matchingSeedNorm) {
           idRewriteMap.set(matchingSeedNorm, compositeCanonicalId);
        }
        if (recDetailsEntry) {
           (recDetailsEntry as any)[0] = compositeCanonicalId; // update entry in-place for later logic
        }
      }
      
      // Also ensure primary seeds are correctly mapped
      for (const seed of artistList) {
        const seedNorm = normalizeArtistId(seed);
        const canonicalSeedId = resolvedSeedNormMap.get(seedNorm) ?? seedNorm;
        const compositeCanonicalId = buildCompositeCacheKey(canonicalSeedId, inputPayload.filters || undefined);
        if (!idRewriteMap.has(seedNorm)) {
          idRewriteMap.set(seedNorm, compositeCanonicalId);
        }
        if (canonicalSeedId !== seedNorm && !idRewriteMap.has(canonicalSeedId)) {
          idRewriteMap.set(canonicalSeedId, compositeCanonicalId);
        }
      }

      // ── Apply Canonical ID Rewrite and Strict Deduplication to Graph Topology BEFORE Extraction ──
      if (finalGraph.nodes) {
        const uniqueNodesMap = new Map<string, any>();
        finalGraph.nodes.forEach((node: any) => {
          const normId = normalizeArtistId(node.id);
          if (idRewriteMap.has(normId)) {
            node.id = idRewriteMap.get(normId);
          }
          if (!uniqueNodesMap.has(node.id)) {
            uniqueNodesMap.set(node.id, node);
          }
        });
        finalGraph.nodes = Array.from(uniqueNodesMap.values());
      }
      
      if (finalGraph.links) {
        const uniqueLinksMap = new Map<string, any>();
        finalGraph.links.forEach((link: any) => {
          const sId = typeof link.source === 'string' ? link.source : (link.source as any).id;
          const tId = typeof link.target === 'string' ? link.target : (link.target as any).id;
          const normS = normalizeArtistId(sId);
          const normT = normalizeArtistId(tId);
          
          let finalS = sId;
          let finalT = tId;
          
          if (idRewriteMap.has(normS)) finalS = idRewriteMap.get(normS);
          if (idRewriteMap.has(normT)) finalT = idRewriteMap.get(normT);
          
          if (typeof link.source === 'string') link.source = finalS;
          else (link.source as any).id = finalS;
          
          if (typeof link.target === 'string') link.target = finalT;
          else (link.target as any).id = finalT;
          
          if (finalS !== finalT) {
            const linkKey = [finalS, finalT].sort().join('--');
            if (!uniqueLinksMap.has(linkKey)) {
              uniqueLinksMap.set(linkKey, link);
            }
          }
        });
        finalGraph.links = Array.from(uniqueLinksMap.values());
      }

      // ── Step 5: Root Breakdown Write-Back to Seed Artist Docs (Atomic Self-Heal) ────────────────
      // Per the Unified Canvas Architecture (Column 3, Step 5), Single-Seed jobs persist
      // the Root Breakdown to the seed artist's Firestore doc so that future cache hits
      // serve the full 3.1 Pro narrative without re-generating it.
      // This step uses an atomic transaction to detect and heal legacy split-brain orphans.
      for (const seedName of artistList) {
        const seedNorm = normalizeArtistId(seedName);
        const canonicalSeedId = resolvedSeedNormMap.get(seedNorm) ?? seedNorm;
        const canonicalDocRef = db.collection('artists').doc(canonicalSeedId);
        const rawSeedDocRef = db.collection('artists').doc(seedNorm);

        try {
          await db.runTransaction(async (transaction) => {
            const canonicalSnap = await transaction.get(canonicalDocRef);
            const canonicalData = canonicalSnap.exists ? canonicalSnap.data() : null;
            
            let rawData: any = null;
            if (canonicalSeedId !== seedNorm) {
              const rawSnap = await transaction.get(rawSeedDocRef);
              if (rawSnap.exists) {
                rawData = rawSnap.data();
              }
            }

            const canonicalUpdate: any = {
              'detailsCache.synthesisRationale': FieldValue.delete(),
              cachedAt: FieldValue.serverTimestamp()
            };

            let finalRationale = rootBreakdownStr;

            // Topology Hydration Check for Stubs
            const hasGraph = canonicalData?.graphData && (
              (typeof canonicalData.graphData === 'string' && canonicalData.graphData.length > 10) || 
              (typeof canonicalData.graphData === 'object' && canonicalData.graphData.nodes)
            );

            if (!hasGraph) {
              const finalExtractId = idRewriteMap.get(canonicalSeedId) ?? idRewriteMap.get(seedNorm) ?? canonicalSeedId;
              const rawExtracted = extractArtistSubGraph(finalExtractId, finalGraph, artistList);
              if (rawExtracted) {
                const safeExtractedGraph = JSON.parse(JSON.stringify(rawExtracted));
                if (safeExtractedGraph.nodes && safeExtractedGraph.nodes.length > 0) {
                  if (safeExtractedGraph.links) {
                    for (const link of safeExtractedGraph.links) {
                      link.source = typeof link.source === 'object' && link.source !== null ? link.source.id : link.source;
                      link.target = typeof link.target === 'object' && link.target !== null ? link.target.id : link.target;
                    }
                  }
                  canonicalUpdate.graphData = JSON.stringify(safeExtractedGraph);
                  console.log(`[Self-Heal] Hydrating graphData for empty stub: ${canonicalSeedId}`);
                }
              }
            }

            // Merge Orphan Data & Redirect
            if (canonicalSeedId !== seedNorm && rawData) {
              if (!finalRationale && rawData.synthesisRationale) {
                finalRationale = rawData.synthesisRationale;
                console.log(`[Self-Heal] Adopting orphaned synthesisRationale for ${canonicalSeedId} in transaction`);
              }
              if (!rawData.redirectTo) {
                transaction.set(rawSeedDocRef, { redirectTo: canonicalSeedId }, { merge: true });
                console.log(`[Self-Heal] Queued redirectTo for orphaned stub ${seedNorm} -> ${canonicalSeedId}`);
              }
            }

            if (finalRationale) {
              canonicalUpdate.synthesisRationale = finalRationale;
              if (canonicalUpdate.graphData) {
                const parsedGraph = JSON.parse(canonicalUpdate.graphData);
                parsedGraph.synthesisRationale = finalRationale;
                canonicalUpdate.graphData = JSON.stringify(parsedGraph);
              }
            }

            transaction.set(canonicalDocRef, canonicalUpdate, { merge: true });
          });
          
          console.log(`[Curation Backend] ✅ Atomic write-back & self-heal completed for canonical seed doc: ${canonicalSeedId}`);
        } catch (e: any) {
          console.warn(`[Curation Backend] Root Breakdown / Atomic Heal failed for artist doc: ${canonicalSeedId}`, e.message);
        }
      }

      // 3.1 Pro: Final Node Positioning could be executed here if a service existed.
      // We will skip explicit repositioning mutation of finalGraph to avoid breaking schema,
      // but the narrative synthesis is now locked to 3.1 Pro.
    } catch (e) {
      console.error(`[Curation Backend] 3.1 Pro Post-Processing failed:`, e);
    }

        // Proactively cache each recommended entity (artist or label) as a deep cache entry as well!
        for (const entityObj of recommendedEntities) {
          const recArtist = entityObj.name;
          const recNorm = normalizeArtistId(recArtist);
          const isLabel = entityObj.type === 'label';

          const matchingSeedNorm = seedNorms.find((s: string) => isEntitySeedMatch(s, recNorm));
          if (matchingSeedNorm) {
            // Do NOT continue here. Let the seed fall through so it can be evaluated for partial hydration or missing assets during a cache upgrade.
          }
          
          const recDetailsEntry = detailsCacheEntries.find((entry: any) => isEntitySeedMatch(recNorm, entry[0]));
          const recDetails = recDetailsEntry ? (recDetailsEntry as any)[1] : null;

          if (isLabel && !recDetails) {
            console.warn(`[Curation Backend] Label cache write skipped for "${recNorm}" — missing detailsCache.`);
            continue;
          }

          // Change 1 — Symmetric artist null-guard.
          // Prevents writing a null detailsCache to Firestore when hydration failed for this artist.
          // Without this guard, a null details entry silently writes a null Firestore document,
          // causing the frontend to display "DEEP CUT SYNTHESIS REQUIRED" instead of pre-hydrated content.
          if (!isLabel && !recDetails) {
            console.warn(`[Curation Backend] Artist cache write skipped for "${recNorm}" — missing detailsCache (hydration failed or was skipped during batch).`);
            continue;
          }

          const collName = isLabel ? "labels" : "artists";
          const idFieldKey = isLabel ? "labelId" : "artistId";

          // Run Sanity Check — non-fatal: log and skip this recommendation's cache write rather than aborting the entire job
          try {
            if (!isLabel && recDetails) {
              validateArtistDetailsSchema(recNorm, recDetails);
            }
          } catch (validationErr: any) {
            console.warn(`[Curation Backend] Recommendation cache write skipped for "${recNorm}" — schema validation failed: ${validationErr.message}`);
            continue;
          }

          const disambiguatedCanonicalId = recDetailsEntry ? (recDetailsEntry as any)[0] : recNorm;
          const compositeCanonicalId = buildCompositeCacheKey(disambiguatedCanonicalId, inputPayload.filters || undefined);

          const recDocRef = db.collection(collName).doc(compositeCanonicalId);
          
          // Bug 2: The Overwrite Violation - skip proactive cache update for perfect hits
          if (recDetails && recDetails._isReadOnly && !matchingSeedNorm) {
            console.log(`[Curation Backend] Skipping proactive cache update for perfect hit (${collName}): ${compositeCanonicalId}`);
            continue;
          }

          const recSnap = await recDocRef.get();

            if (!recSnap.exists) {
              const finalRecDetails = isLabel ? sanitizeLabelProfile(recDetails) : sanitizeUndefinedProperties(normalizeDetailsForWrite(recDetails));
              
              if (recDetailsEntry) {
                (recDetailsEntry as any)[1] = finalRecDetails;
              }

              let safeExtractedGraph = null;
              if (matchingSeedNorm && !isLabel) {
                 // Fix D-1: Pass the canonical slug ID (e.g. "buggin-us") instead of the raw
                 // matchingSeedNorm (e.g. "buggin"). finalGraph nodes carry slugged IDs assigned
                 // by executeCurationPipeline; extractArtistSubGraph uses strict equality, so
                 // "buggin" will never match a node whose id is "buggin-us". (Law §6)
                 const canonicalSeedForExtract = resolvedSeedNormMap.get(matchingSeedNorm) ?? matchingSeedNorm;
                 const finalExtractId = idRewriteMap.get(canonicalSeedForExtract) ?? canonicalSeedForExtract;
                 const rawExtracted = extractArtistSubGraph(finalExtractId, finalGraph, artistList);
                 if (rawExtracted) {
                    safeExtractedGraph = JSON.parse(JSON.stringify(rawExtracted));
                    // Fix D-1 Guard: An empty subgraph { nodes: [], links: [] } is truthy but
                    // produces graphData that the frontend topology guard rejects as a stub.
                    // Coerce to null so no graphData is written — Law §1 (never write null data).
                    if (!safeExtractedGraph.nodes || safeExtractedGraph.nodes.length === 0) {
                       console.warn(`[Curation Backend] [Fix D] extractArtistSubGraph returned empty topology for "${canonicalSeedForExtract}". Nulling graphData write to prevent stub corruption.`);
                       safeExtractedGraph = null;
                    } else {
                       if (safeExtractedGraph.links) {
                          for (const link of safeExtractedGraph.links) {
                             link.source = typeof link.source === 'object' && link.source !== null ? link.source.id : link.source;
                             link.target = typeof link.target === 'object' && link.target !== null ? link.target.id : link.target;
                          }
                       }
                       if (finalGraph.synthesisRationale) {
                          safeExtractedGraph.synthesisRationale = finalGraph.synthesisRationale;
                       }
                    }
                 }
              }

              await recDocRef.set({
                cacheKey: compositeCanonicalId,
                [idFieldKey]: recNorm,
                seedArtists: recArtist,
                graphData: safeExtractedGraph ? JSON.stringify(safeExtractedGraph) : null,
                detailsCache: finalRecDetails, // Save as structured object!
                filters: matchingSeedNorm && !isLabel ? inputPayload.filters || null : null,
                synthesisRationale: matchingSeedNorm && finalGraph.synthesisRationale ? finalGraph.synthesisRationale : null,
                cacheVersion: 4,
                cachedAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp(),

                isDeep: true, // Marked Deep!
                isPrimarySeed: !!matchingSeedNorm,
                hasUniqueSpiderweb: matchingSeedNorm ? !isLabel : false,
                dataIntegrityStatus: matchingSeedNorm ? (recDetails?._isStub ? 'degraded' : 'verified') : undefined,
              });
              console.log(`[Curation Backend] Proactively created DEEP entry for recommendation (${collName}): ${compositeCanonicalId}`);
            } else {
              const finalRecDetails = isLabel ? sanitizeLabelProfile(recDetails) : sanitizeUndefinedProperties(normalizeDetailsForWrite(recDetails));
              
              if (recDetailsEntry) {
                (recDetailsEntry as any)[1] = finalRecDetails;
              }

              const updatePayload: any = {
                detailsCache: finalRecDetails,
                cachedAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp(),
                cacheVersion: 4,
                [idFieldKey]: recNorm,
                cacheKey: compositeCanonicalId,
                isDeep: true
              };

              if (matchingSeedNorm) {
                 let safeExtractedGraph = null;
                 if (!isLabel) {
                    // Fix D-2: Same canonical slug resolution and empty-topology guard as Fix D-1,
                    // applied to the update (recSnap.exists) path. Both call sites must be
                    // consistent — one unguarded site is enough to corrupt the cache. (Law §1, §8)
                    const canonicalSeedForExtract = resolvedSeedNormMap.get(matchingSeedNorm) ?? matchingSeedNorm;
                    const finalExtractId = idRewriteMap.get(canonicalSeedForExtract) ?? canonicalSeedForExtract;
                    const rawExtracted = extractArtistSubGraph(finalExtractId, finalGraph, artistList);
                    if (rawExtracted) {
                       safeExtractedGraph = JSON.parse(JSON.stringify(rawExtracted));
                       if (!safeExtractedGraph.nodes || safeExtractedGraph.nodes.length === 0) {
                          console.warn(`[Curation Backend] [Fix D] extractArtistSubGraph returned empty topology for "${canonicalSeedForExtract}". Nulling graphData write.`);
                          safeExtractedGraph = null;
                       } else {
                          if (safeExtractedGraph.links) {
                             for (const link of safeExtractedGraph.links) {
                                link.source = typeof link.source === 'object' && link.source !== null ? link.source.id : link.source;
                                link.target = typeof link.target === 'object' && link.target !== null ? link.target.id : link.target;
                             }
                          }
                          if (finalGraph.synthesisRationale) {
                             safeExtractedGraph.synthesisRationale = finalGraph.synthesisRationale;
                          }
                       }
                    }
                 }
                updatePayload.isPrimarySeed = true;
                updatePayload.dataIntegrityStatus = recDetails?._isStub ? 'degraded' : 'verified';
                updatePayload.hasUniqueSpiderweb = !isLabel;
                if (!isLabel) {
                  if (safeExtractedGraph) {
                    updatePayload.graphData = JSON.stringify(safeExtractedGraph);
                  }
                  updatePayload.filters = inputPayload.filters || null;
                  if (finalGraph.synthesisRationale) {
                    updatePayload.synthesisRationale = finalGraph.synthesisRationale;
                  }
                }
              }

              await recDocRef.update(sanitizeUndefinedProperties(updatePayload));
              console.log(`[Curation Backend] Proactively updated detailsCache for recommendation (${collName}): ${compositeCanonicalId}`);
            }

            }

        // Topology already rewritten and deduplicated in the pre-computation block before Step 5.

        result = {
          graphData: finalGraph,
          detailsCache: JSON.stringify(detailsCacheEntries)
        };
      }
    } else {
      throw new Error(`Unsupported jobType: ${jobType}`);
    }

    // Complete job with 24-hour TTL expiration policy
    await jobDocRef.update({
      status: "completed",
      result,
      updatedAt: FieldValue.serverTimestamp(),
      completedAt: FieldValue.serverTimestamp(),
      expireAt: Timestamp.fromMillis(Date.now() + 24 * 60 * 60 * 1000)
    });
    console.log(`[Curation Backend] Successfully completed job ${jobId} (set TTL expireAt +24h)`);

    if (inputPayload?.projectId && jobData.userId && result?.graphData) {
      const graphObj = typeof result.graphData === 'string' ? JSON.parse(result.graphData) : result.graphData;
      const artistEntityIds = graphObj.nodes
        ? graphObj.nodes.filter((n: any) => n.type === 'artist' || !n.type).map((n: any) => normalizeArtistId(n.id))
        : [];
      const labelEntityIds = graphObj.nodes
        ? graphObj.nodes.filter((n: any) => n.type === 'label').map((n: any) => normalizeArtistId(n.id))
        : [];

      // Phase 2B — Canonical Seed Pinning: build a seed-first ordered activeNodes array
      // from the completed graph topology. The worker previously never wrote activeNodes,
      // leaving the project doc with a stale frontend-written array (seed could be at any
      // index). This write makes the worker the authoritative source of truth for ordering.
      const seedNormList = (inputPayload.artists || '')
        .split('::')
        .map((a: string) => normalizeArtistId(a.trim()))
        .filter(Boolean);

      const isSeedNode = (nodeId: string): boolean => {
        const normId = normalizeArtistId(nodeId);
        return seedNormList.some(
          (s: string) => normId === s || normId.startsWith(s + '-') || s.startsWith(normId + '-')
        );
      };

      const hoistedActiveNodes: string[] = [];
      // 1. Seeds first — in the order they appear in the graph topology
      if (graphObj.nodes) {
        graphObj.nodes.forEach((n: any) => {
          if (isSeedNode(n.id)) hoistedActiveNodes.push(n.id);
        });
        // 2. All remaining non-seed nodes
        graphObj.nodes.forEach((n: any) => {
          if (!isSeedNode(n.id) && !hoistedActiveNodes.includes(n.id)) {
            hoistedActiveNodes.push(n.id);
          }
        });
      }
      console.log(`[Curation Backend] [Phase 2B] Hoisted activeNodes: seed at [0]="${hoistedActiveNodes[0]}", total=${hoistedActiveNodes.length}`);

      let extractedSeedImageUrl = null;
      try {
        if (result.detailsCache) {
           const parsedCache = typeof result.detailsCache === 'string' ? JSON.parse(result.detailsCache) : result.detailsCache;
           const primarySeedId = hoistedActiveNodes[0];
           if (primarySeedId && Array.isArray(parsedCache)) {
             const match = parsedCache.find((item: any) => {
                const key = normalizeArtistId(item[0]);
                return key === primarySeedId || key.startsWith(primarySeedId + '-') || primarySeedId.startsWith(key + '-');
             });
             if (match && match[1]) {
                extractedSeedImageUrl = match[1].imageUrl || match[1].details?.imageUrl || null;
             }
           }
        }
      } catch (e) {
        console.warn(`[Curation Backend] Failed to extract seedImageUrl:`, e);
      }

      const mergedApiUsage: Record<string, { prompt: number, candidates: number, total: number }> = {
        ...(inputPayload?.foregroundApiUsage || {})
      };
      
      for (const [model, usage] of Object.entries(collectedTokens)) {
        if (!mergedApiUsage[model]) mergedApiUsage[model] = { prompt: 0, candidates: 0, total: 0 };
        mergedApiUsage[model].prompt += usage.prompt;
        mergedApiUsage[model].candidates += usage.candidates;
        mergedApiUsage[model].total += usage.total;
      }

      await updateProjectStatus(jobData.userId, inputPayload.projectId, {
        status: "completed",
        graphData: JSON.stringify(result.graphData),
        artistIds: artistEntityIds,
        labelIds: labelEntityIds,
        activeJobId: null,
        detailsCache: result.detailsCache,
        activeNodes: hoistedActiveNodes,  // Phase 2B: canonical seed-first ordering
        apiUsage: mergedApiUsage,
        ...(inputPayload?.generationType ? { generationType: inputPayload.generationType } : {}),
        ...(extractedSeedImageUrl ? { seedImageUrl: extractedSeedImageUrl } : {})
      });
    }


  } catch (error: any) {
    console.error(`[Curation Backend] Failed processing job ${jobId}:`, error);
    
    // Unified error messaging using the shared errorTranslationLayer
    const translatedError = translateError(error);
    
    await jobDocRef.update({
      status: "failed",
      errorMessage: translatedError.userFriendlyMessage,
      errorDetails: {
        rawMessage: error.message || String(error),
        statusCode: error.status || null,
        stack: error.stack || null
      },
      updatedAt: FieldValue.serverTimestamp(),
      completedAt: FieldValue.serverTimestamp(),
      expireAt: Timestamp.fromMillis(Date.now() + 24 * 60 * 60 * 1000)
    });

    if (jobData?.inputPayload?.projectId && jobData?.userId) {
      await updateProjectStatus(jobData.userId, jobData.inputPayload.projectId, {
        status: "failed",
        errorMessage: translatedError.userFriendlyMessage,
        activeJobId: null
      });
    }
  }
});
