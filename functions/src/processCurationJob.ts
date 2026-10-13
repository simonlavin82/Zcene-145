import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import { translateError } from "./services/errorTranslationLayer";
import {
  generateRootsBreakdownBackend,
  reconcileNarrativeEdges,
  normalizeArtistId,
  fetchNodeDetailsBackend,
  scrapeVideoIdBackend,
  checkVideoPlayability,
  scrapeImageUrlBackend,
  extractArtistSubGraph,
  validateSeedOriginBackend,
  extractCountrySlug,
  generateSemanticLinkWeights
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
  const s = stripCountrySlug(normalizeArtistId(seedNorm));
  const c = stripCountrySlug(normalizeArtistId(candidateNorm));
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
  '-br', '-mx', '-nl', '-be', '-no', '-fi', '-dk', '-ie', '-nz', '-pl', '-at', '-ch',
  '-scotland', '-wales', '-northern-ireland', '-england'
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
        const seedNamesMap: Record<string, string> = inputPayload.seedNames || {};
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
                // RULE 10 INVARIANT: Skip ALL stubs and redirects
                if (snapData.redirectTo || snapData._isStub || snapData.isAmbiguous) continue;
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
           
           const cleanSeedDisplayName = seedNamesMap[canonicalSeedId] || 
                                        seedNamesMap[seedNorm] || 
                                        seedNamesMap[seed.toLowerCase()] || 
                                        seedNamesMap[stripCountrySlug(seedNorm)] || 
                                        stripCountrySlug(seed);

           if (cachedDetails && cachedDetails.summary && cachedDetails.summary.length > 50 && cachedDetails.details?.genre && cachedDetails.imageUrl) {
              console.log(`[Phase 1] Cache Hit for seed: ${seed}`);
              resolvedSeedArray.push({
                 id: seedNorm,
                 name: cleanSeedDisplayName,
                 origin: cachedDetails.details.origin || "",
                 genre: cachedDetails.details.genre || "",
                 isCacheHit: true
              });
           } else {
              console.log(`[Phase 1] Cache Miss for seed: ${seed}. Routing to Phase 2 (Flash-Lite).`);
              
              // Phase 2: Origin Validation (Flash-Lite) - Pass clean display name to prevent geographic suffix ingestion
              const queryForValidation = cleanSeedDisplayName || stripCountrySlug(seed);
              const validationResult = await validateSeedOriginBackend(queryForValidation);
              if (validationResult.apiUsage) {
                usageCollector.push(validationResult.apiUsage.model, validationResult.apiUsage);
              }
              if (validationResult.isValid) {
                 const validatedCleanName = cleanSeedDisplayName || validationResult.id;
                 resolvedSeedArray.push({
                    id: normalizeArtistId(validationResult.id),
                    name: validatedCleanName,
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
          .map((a: string) => {
            const norm = normalizeArtistId(a);
            const canonical = resolvedSeedNormMap.get(norm) ?? norm;
            return seedNamesMap[canonical] || seedNamesMap[norm] || stripCountrySlug(a);
          })
          .join('::');

        // [Pre-Hydration ID Standardization Removed]
        // executeCurationPipeline already correctly assigns canonical slugged IDs (e.g. 'buggin-us')
        // to both the node AND its links. Muting it here prevents disconnected spiderwebs.

        // 1. ISOLATE INTERACTIVE NODES: Explicitly filter out Structural Hubs (genre, founded, country)
        // Structural hubs bypass the hydration loop entirely.
        const recommendedEntities = finalGraph.nodes.filter((n: any) => 
          n.type === 'artist' || n.type === 'label'
        ).map((n: any) => {
          const norm = normalizeArtistId(n.id);
          const canonical = resolvedSeedNormMap.get(norm) ?? norm;
          const cleanName = seedNamesMap[canonical] || seedNamesMap[norm] || seedNamesMap[n.id] || n.label || n.id;
          return {
            id: n.id,
            name: cleanName,
            type: n.type,
            origin: n.origin || null
          };
        });

        // CRITICAL FIX: Ensure all seed artists are explicitly placed into the hydration queue.
        // The architectural design dictates that seeds must go through the gap-filling phase just like deep cuts,
        // even if the LLM omitted them or modified their IDs in the graph output.
        for (const seed of artistList) {
          const seedNorm = normalizeArtistId(seed);
          const canonicalSeedId = resolvedSeedNormMap.get(seedNorm) ?? seedNorm;
          const cleanName = seedNamesMap[canonicalSeedId] || seedNamesMap[seedNorm] || stripCountrySlug(seed);
          const exists = recommendedEntities.some((e: any) => isEntitySeedMatch(seedNorm, e.id) || isEntitySeedMatch(seedNorm, e.name));
          if (!exists) {
            recommendedEntities.unshift({
              id: canonicalSeedId,
              name: cleanName,
              type: 'artist',
              origin: null
            });
            console.log(`[Curation Backend] Explicitly pushing missing seed artist into gap-filling queue: ${seed} (${cleanName})`);
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
              // V11.5 Guardrail: Strip any filter tags the AI may have hallucinated onto the node ID.
              // This must happen at the point of entry — BEFORE any cache lookups or hydration —
              // so that a poisoned ID like "spaced-us-after:2018" is sanitized to "spaced-us"
              // before it can propagate into detailsCacheEntries or Firestore.
              artistNormId = artistNormId.replace(/-(after|before|genre|inc_genres|exc_origins|inc_origins):[^-\s]+/gi, '');
              entityObj.id = artistNormId; // Keep entityObj.id in sync so hydration result at line 700 is clean
              
              const isLabel = entityObj.type === 'label';

              // ── Slug Deduplication Guard ───────────────────────────────────────────
              // Before using artistNormId (which may be derived from a new slug), query
              // Firestore by the base artistId field to detect if a canonical variation
              // already exists (e.g., sick-of-it-all-usa already in DB when we are about
              // to create sick-of-it-all). If a canonical doc is found, adopt its ID.
              if (!isLabel) {
                try {
                  const baseNormId = stripCountrySlug(normalizeArtistId(rawName)); // without country suffix
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
                      // Fix: Skip redirect pointer documents (created by Fix E remediation) and evolved stubs.
                      // A doc with redirectTo or _isStub set is a routing stub, NOT a canonical record.
                      if (snapData.redirectTo || snapData._isStub || snapData.isAmbiguous) continue;
                      
                      // Explicitly reject existing documents that end with known hallucinated regional slugs
                      if (snap.id.endsWith('-scotland') || snap.id.endsWith('-wales') || snap.id.endsWith('-northern-ireland') || snap.id.endsWith('-england')) {
                        continue;
                      }

                      // V11.6: Reject poisoned canonical docs (pre-V11.5 orphans) that contain filter tags
                      if (/-(after|before|genre|inc_genres|exc_origins|inc_origins):[^-\s]+/i.test(snap.id)) {
                        continue;
                      }

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
                
                // V11.6: Re-sanitize after slug dedup in case the dedup loop adopted a poisoned historical ID
                artistNormId = artistNormId.replace(/-(after|before|genre|inc_genres|exc_origins|inc_origins):[^-\s]+/gi, '');
                entityObj.id = artistNormId;
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

              // Extract clean human-readable name for APIs by prioritizing seedNamesMap, then stripping known country slugs
              let searchArtistName = seedNamesMap[artistNormId] || 
                                     seedNamesMap[normalizeArtistId(rawName)] || 
                                     stripCountrySlug(rawName);

              if (details && details.details && details.details.artist && details.details.artist !== rawName) {
                searchArtistName = seedNamesMap[artistNormId] || details.details.artist;
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
                      details.summary || "",
                      details.details.origin,
                      details.discography || []
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

                const finalCleanArtistName = seedNamesMap[artistNormId] || 
                                             seedNamesMap[normalizeArtistId(rawName)] || 
                                             details.details.artist || 
                                             searchArtistName;
                details.details.artist = finalCleanArtistName;
                // Note: synthesisRationale is NOT stamped here. The real Root Breakdown is
                // generated after all hydration completes (Step 4) and written back to the
                // seed artist doc explicitly. Pre-stamping a stub would pollute the artist
                // doc and corrupt the Roots Breakdown displayed on cache hits.

                console.log(`[Curation Backend] Hydration successful for: ${artistNormId}`);
              }
              if (!details) return null;
              // Sync strictly to the topology node ID, ignoring any internal deduplication mutation.
              return [entityObj.id, details] as [string, any];
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
    const isComplexGeneration = artistList.length > 1 || (inputPayload.filters && Object.keys(inputPayload.filters).length > 0);
    let rootBreakdownStr = "";
    try {
      // Step 3 (V10): Native JSON Generation (Root Breakdown + 1-Sentence Hooks)
      const rootBreakdownPayload = await generateRootsBreakdownBackend(inputPayload.artists, detailsCacheEntries, usageCollector, inputPayload.filters);
      
      if (rootBreakdownPayload) {
        rootBreakdownStr = rootBreakdownPayload.editorialMarkdown;
        finalGraph.synthesisRationale = rootBreakdownStr;

        // Apply native 1-sentence hooks for tooltips (Rule 26)
        if (rootBreakdownPayload.artistSnippets && Array.isArray(rootBreakdownPayload.artistSnippets)) {
          console.log(`[Curation Backend] Step 3: Natively extracted ${rootBreakdownPayload.artistSnippets.length} epicenter hooks.`);
          finalGraph.nodes.forEach((n: any) => {
            const snippetObj = rootBreakdownPayload.artistSnippets.find((s: any) => 
              normalizeArtistId(s.id) === normalizeArtistId(n.id) ||
              s.id.toLowerCase() === n.id.toLowerCase()
            );
            if (snippetObj && snippetObj.snippet) {
              n.narrativeSnippet = snippetObj.snippet;
            }
          });
        }
      }

      // Step 4: Topology Parity (Rule 23): reconcile narrative citations against graph edges.
      // Runs BEFORE the ID Rewrite so node IDs in the narrative still match pre-rewrite graph IDs.
      if (rootBreakdownStr && finalGraph.nodes && finalGraph.links && process.env.GEMINI_API_KEY) {
        try {
          console.log(`[Curation Backend] Step 4: Auditing narrative for missing graph edges...`);
          const existingLinkIds = finalGraph.links.map((l: any) => ({
            source: typeof l.source === 'string' ? l.source : (l.source as any).id,
            target: typeof l.target === 'string' ? l.target : (l.target as any).id,
          }));
          const nodePayload = finalGraph.nodes.map((n: any) => ({ id: n.id, type: n.type }));
          
          const reconciledEdges = await reconcileNarrativeEdges(
            process.env.GEMINI_API_KEY, 
            rootBreakdownStr, 
            nodePayload, 
            existingLinkIds, 
            usageCollector
          );

          if (reconciledEdges.length > 0) {
            console.log(`[Curation Backend] Step 4: Injecting ${reconciledEdges.length} narrative-cited missing edge(s):`, reconciledEdges.map(e => `${e.source} → ${e.target}`));
            reconciledEdges.forEach(edge => {
              finalGraph.links.push({
                source: edge.source,
                target: edge.target,
                value: 1,
                weight: edge.weight,
                context: edge.context,
              });
            });
          } else {
            console.log(`[Curation Backend] Step 4: No missing narrative edges found. Graph topology is already consistent.`);
          }

        } catch (reconcileErr) {
          console.warn(`[Curation Backend] Step 4: Narrative parsing failed (non-fatal):`, reconcileErr);
        }
      }

      
      for (const entityObj of recommendedEntities) {
        const recNorm = normalizeArtistId(entityObj.name);
        const matchingSeedNorm = seedNorms.find((s: string) => isEntitySeedMatch(s, recNorm));
        const recDetailsEntry = detailsCacheEntries.find((entry: any) => isEntitySeedMatch(recNorm, entry[0]));
        
        let disambiguatedCanonicalId = recDetailsEntry ? (recDetailsEntry as any)[0] : recNorm;
        
        if (recDetailsEntry && entityObj.type !== 'label' && !matchingSeedNorm) {
            const originStr = (recDetailsEntry as any)[1]?.details?.origin;
            const originSlug = extractCountrySlug(originStr);
            if (originSlug && originSlug !== 'global') {
                disambiguatedCanonicalId = `${recNorm}-${originSlug}`;
            }
        }
        
        const finalCanonicalId = disambiguatedCanonicalId;
        idRewriteMap.set(recNorm, finalCanonicalId);
        
        if (matchingSeedNorm) {
           idRewriteMap.set(matchingSeedNorm, finalCanonicalId);
        }
        if (recDetailsEntry) {
           (recDetailsEntry as any)[0] = finalCanonicalId; // update entry in-place for later logic
        }
      }
      
      // Also ensure primary seeds are correctly mapped
      for (const seed of artistList) {
        const seedNorm = normalizeArtistId(seed);
        const canonicalSeedId = resolvedSeedNormMap.get(seedNorm) ?? seedNorm;
        const finalCanonicalId = canonicalSeedId;
        if (!idRewriteMap.has(seedNorm)) {
          idRewriteMap.set(seedNorm, finalCanonicalId);
        }
        if (canonicalSeedId !== seedNorm && !idRewriteMap.has(canonicalSeedId)) {
          idRewriteMap.set(canonicalSeedId, finalCanonicalId);
        }
      }

      // ── Apply Canonical ID Rewrite and Strict Deduplication to Graph Topology BEFORE Extraction ──
      const ISO_TO_COUNTRY_MAP: Record<string, string> = {
        'us': 'United States', 'gb': 'United Kingdom', 'au': 'Australia',
        'ca': 'Canada', 'de': 'Germany', 'fr': 'France', 'jp': 'Japan',
        'se': 'Sweden', 'it': 'Italy', 'es': 'Spain', 'br': 'Brazil',
        'mx': 'Mexico', 'nl': 'Netherlands', 'be': 'Belgium', 'no': 'Norway',
        'fi': 'Finland', 'dk': 'Denmark', 'ie': 'Ireland', 'nz': 'New Zealand',
        'pl': 'Poland', 'at': 'Austria', 'ch': 'Switzerland'
      };

      if (finalGraph.nodes) {
        const uniqueNodesMap = new Map<string, any>();
        finalGraph.nodes.forEach((node: any) => {
          const normId = normalizeArtistId(node.id);
          const baseNormId = stripCountrySlug(normId);

          if (idRewriteMap.has(normId)) {
            node.id = idRewriteMap.get(normId);
          } else if (idRewriteMap.has(baseNormId)) {
            node.id = idRewriteMap.get(baseNormId);
          }

          // Force overwrite the node's origin to match the canonical database truth
          const detailsEntry = detailsCacheEntries.find((entry: any) => entry[0] === node.id);
          if (detailsEntry && detailsEntry[1]?.details?.origin) {
            node.origin = detailsEntry[1].details.origin;
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
          const baseNormS = stripCountrySlug(normS);
          const baseNormT = stripCountrySlug(normT);
          
          let finalS = sId;
          let finalT = tId;
          
          if (idRewriteMap.has(normS)) finalS = idRewriteMap.get(normS);
          else if (idRewriteMap.has(baseNormS)) finalS = idRewriteMap.get(baseNormS);

          if (idRewriteMap.has(normT)) finalT = idRewriteMap.get(normT);
          else if (idRewriteMap.has(baseNormT)) finalT = idRewriteMap.get(baseNormT);
          
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

      // --- Topological Reconciliation Loop: Fix geographic hallucinated links ---
      if (finalGraph.nodes && finalGraph.links) {
        // Map to quickly check if a node is a country node
        const countryNodeMap = new Map<string, any>();
        finalGraph.nodes.forEach((n: any) => {
          if (n.type === 'country') {
            countryNodeMap.set(n.id, n);
          }
        });

        finalGraph.nodes.forEach((node: any) => {
          if (node.type === 'artist' || node.type === 'label') {
            if (node.origin) {
              const canonSlug = extractCountrySlug(node.origin);
              if (canonSlug !== 'global') {
                const canonCountryName = ISO_TO_COUNTRY_MAP[canonSlug] || canonSlug;
                const canonCountryId = normalizeArtistId(canonCountryName);

                // Reroute links targeting ANY country node from this artist to point to canonCountryId
                let reroutedAny = false;
                finalGraph.links.forEach((link: any) => {
                  const sId = typeof link.source === 'string' ? link.source : (link.source as any).id;
                  const tId = typeof link.target === 'string' ? link.target : (link.target as any).id;
                  
                  if (sId === node.id && countryNodeMap.has(tId) && tId !== canonCountryId) {
                    // Update link target
                    if (typeof link.target === 'string') {
                      link.target = canonCountryId;
                    } else {
                      (link.target as any).id = canonCountryId;
                    }
                    reroutedAny = true;
                    console.log(`[Curation Backend] Topological Reconciliation: Rerouted link from "${sId}" to target "${canonCountryId}" (was "${tId}")`);
                  }
                });

                // Instantiate the missing canonical country node if needed
                if (reroutedAny && !countryNodeMap.has(canonCountryId)) {
                  const newCountryNode = {
                    id: canonCountryId,
                    type: "country",
                    label: canonCountryName,
                    group: node.group || 1
                  };
                  finalGraph.nodes.push(newCountryNode);
                  countryNodeMap.set(canonCountryId, newCountryNode); // mark as added
                  console.log(`[Curation Backend] Topological Reconciliation: Injected missing canonical country node "${canonCountryId}" for artist "${node.id}"`);
                }
              }
            }
          }
        });
      }

      // --- Degree-0 Cleanup Phase ---
      if (finalGraph.nodes && finalGraph.links) {
        // Build a set of ALL valid node IDs currently in the graph
        const validNodeIds = new Set<string>(finalGraph.nodes.map((n: any) => n.id));

        const connectedNodeIds = new Set<string>();
        finalGraph.links.forEach((link: any) => {
          const sId = typeof link.source === 'string' ? link.source : (link.source as any).id;
          const tId = typeof link.target === 'string' ? link.target : (link.target as any).id;
          if (validNodeIds.has(sId) && validNodeIds.has(tId)) {
            connectedNodeIds.add(sId);
            connectedNodeIds.add(tId);
          }
        });

        // Ensure all resolved seed IDs are protected from pruning
        const protectedSeedIds = new Set<string>();
        for (const seedNorm of seedNorms) {
          protectedSeedIds.add(seedNorm);
          if (resolvedSeedNormMap.has(seedNorm)) {
            protectedSeedIds.add(resolvedSeedNormMap.get(seedNorm)!);
          }
        }

        // Filter out nodes that have 0 degrees, are not protected seeds, or are orphaned country nodes
        const originalNodeCount = finalGraph.nodes.length;
        finalGraph.nodes = finalGraph.nodes.filter((node: any) => {
          // Force prune any country node that isn't a canonical target for an active artist
          if (node.type === 'country') {
            let isRequired = false;
            for (const n of finalGraph.nodes) {
              if (n.type === 'artist' || n.type === 'label') {
                if (n.origin) {
                  const canonSlug = extractCountrySlug(n.origin);
                  if (canonSlug !== 'global') {
                    const canonCountryName = ISO_TO_COUNTRY_MAP[canonSlug] || canonSlug;
                    if (normalizeArtistId(canonCountryName) === node.id) {
                      isRequired = true;
                      break;
                    }
                  }
                }
              }
            }
            if (!isRequired) {
              return false; // Drop non-canonical or unverified country node
            }
          }

          return connectedNodeIds.has(node.id) || protectedSeedIds.has(node.id);
        });

        const prunedCount = originalNodeCount - finalGraph.nodes.length;
        if (prunedCount > 0) {
          console.log(`[Curation Backend] Degree-0 Cleanup Phase: Pruned ${prunedCount} orphaned ghost node(s).`);
        }

        // Clean up any phantom links that referenced pruned nodes
        const finalValidNodes = new Set<string>(finalGraph.nodes.map((n: any) => n.id));
        const originalLinkCount = finalGraph.links.length;
        finalGraph.links = finalGraph.links.filter((link: any) => {
          const sId = typeof link.source === 'string' ? link.source : (link.source as any).id;
          const tId = typeof link.target === 'string' ? link.target : (link.target as any).id;
          return finalValidNodes.has(sId) && finalValidNodes.has(tId);
        });
        
        const prunedLinkCount = originalLinkCount - finalGraph.links.length;
        if (prunedLinkCount > 0) {
          console.log(`[Curation Backend] Degree-0 Cleanup Phase: Pruned ${prunedLinkCount} phantom edge(s).`);
        }
      }

      // ── Step 5: Root Breakdown Write-Back to Seed Artist Docs (Atomic Self-Heal) ────────────────
      // Per the Unified Canvas Architecture (Column 3, Step 5), Single-Seed jobs persist
      // the Root Breakdown to the seed artist's Firestore doc so that future cache hits
      // serve the full 3.1 Pro narrative without re-generating it.
      // This step uses an atomic transaction to detect and heal legacy split-brain orphans.
      if (!isComplexGeneration) {
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
              updatedAt: FieldValue.serverTimestamp()
            };

            // Fail-safe: If LLM skipped the primary seed in hydration topology, ensure it inherits Tier 1 global asset schema
            if (!canonicalSnap.exists) {
              canonicalUpdate.createdAt = FieldValue.serverTimestamp();
              canonicalUpdate.cacheVersion = 4;
              canonicalUpdate.cacheKey = canonicalSeedId;
              canonicalUpdate.artistId = seedNorm;
              canonicalUpdate.isDeep = true;
              canonicalUpdate.detailsCache = { _isStub: true }; // Minimum required to prevent frontend crashes
            }

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
            if (canonicalSeedId !== seedNorm) {
              if (rawData) {
                if (!finalRationale && rawData.synthesisRationale) {
                  finalRationale = rawData.synthesisRationale;
                  console.log(`[Self-Heal] Adopting orphaned synthesisRationale for ${canonicalSeedId} in transaction`);
                }
                if (!rawData.redirectTo && (!rawData._isStub || !rawData.isAmbiguous)) {
                  transaction.set(rawSeedDocRef, { redirectTo: canonicalSeedId }, { merge: true });
                  console.log(`[Self-Heal] Queued redirectTo for orphaned stub ${seedNorm} -> ${canonicalSeedId}`);
                }
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
      }

      // 3.1 Pro: Final Node Positioning (Semantic Link Weights)
      if (finalGraph.links && finalGraph.links.length > 0 && process.env.GEMINI_API_KEY) {
        console.log(`[Curation Backend] Executing Final Node Positioning using Flash for ${finalGraph.links.length} links...`);
        const weightedLinks = await generateSemanticLinkWeights(
          process.env.GEMINI_API_KEY,
          detailsCacheEntries,
          finalGraph.links.map((l: any) => ({
            source: typeof l.source === 'string' ? l.source : l.source.id,
            target: typeof l.target === 'string' ? l.target : l.target.id
          })),
          {
            push: (model: string, usage: any) => {
              if (!collectedTokens[model]) collectedTokens[model] = { prompt: 0, candidates: 0, total: 0 };
              collectedTokens[model].prompt += usage.promptTokenCount || 0;
              collectedTokens[model].candidates += usage.candidatesTokenCount || 0;
              collectedTokens[model].total += usage.totalTokenCount || 0;
            }
          }
        );

        if (weightedLinks && weightedLinks.length > 0) {
          const weightMap = new Map<string, number>();
          weightedLinks.forEach((wl: any) => {
            const linkKey = [wl.source, wl.target].sort().join('--');
            weightMap.set(linkKey, wl.weight);
          });
          finalGraph.links.forEach((link: any) => {
            const sId = typeof link.source === 'string' ? link.source : (link.source as any).id;
            const tId = typeof link.target === 'string' ? link.target : (link.target as any).id;
            const linkKey = [sId, tId].sort().join('--');
            if (weightMap.has(linkKey)) {
              link.weight = weightMap.get(linkKey);
            } else {
              // Ensure all links have at least a neutral weight
              link.weight = 0.5;
            }
          });
          console.log(`[Curation Backend] Applied semantic weights to ${weightMap.size} links.`);
        } else {
          // Graceful Fallback: Apply default neutral weight to ensure physics engine continuity
          finalGraph.links.forEach((link: any) => {
            link.weight = 0.5;
          });
          console.warn(`[Curation Backend] AI weight generation failed or returned empty. Applied default weight (0.5) to all links.`);
        }
      }
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
          let recDetails = recDetailsEntry ? (recDetailsEntry as any)[1] : null;

          if (isLabel && !recDetails) {
            console.warn(`[Curation Backend] Label cache write skipped for "${recNorm}" — missing detailsCache.`);
            continue;
          }

          // Change 1 — Symmetric artist null-guard + JIT Stub Fallback (Rule 17)
          // Prevents writing a null detailsCache to Firestore when hydration failed for this artist.
          // If the failed artist is a primary seed, we inject a pre-hydrated stub from inputPayload
          // to prevent the frontend from falling into a "DATA UNAVAILABLE" state.
          if (!isLabel && !recDetails) {
            if (matchingSeedNorm && inputPayload?.seedStubs && inputPayload.seedStubs[recNorm]) {
              recDetails = inputPayload.seedStubs[recNorm];
              console.log(`[Curation Backend] Injecting pre-hydrated JIT stub for failed seed artist: ${recNorm}`);
            } else {
              console.warn(`[Curation Backend] Artist cache write skipped for "${recNorm}" — missing detailsCache (hydration failed or was skipped during batch).`);
              continue;
            }
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

          const rawCanonicalId = recDetailsEntry ? (recDetailsEntry as any)[0] : recNorm;
          
          // Guardrail: Strip any surviving filter tags hallucinated by the AI
          const cleanCanonicalId = rawCanonicalId.replace(/-(after|before|genre):[^-\s]+/g, '');
          
          // Ensure the doc path ALWAYS writes strictly to the global, canonical ID
          const recDocRef = db.collection(collName).doc(cleanCanonicalId);
          const recSnap = await recDocRef.get();
          
          // Bug 2: The Overwrite Violation - skip proactive cache update for perfect hits
          if (recDetails && recDetails._isReadOnly && !matchingSeedNorm) {
            console.log(`[Curation Backend] Skipping proactive cache update for perfect hit (${collName}): ${cleanCanonicalId}`);
            if (recSnap.exists && !recSnap.data()?.createdAt && recSnap.createTime) {
              await recDocRef.update({ createdAt: recSnap.createTime });
              console.log(`[Curation Backend] Backfilled missing createdAt for read-only doc: ${cleanCanonicalId}`);
            }
            continue;
          }

            if (!recSnap.exists) {
              const finalRecDetails = isLabel ? sanitizeLabelProfile(recDetails) : sanitizeUndefinedProperties(normalizeDetailsForWrite(recDetails));
              
              if (recDetailsEntry) {
                (recDetailsEntry as any)[1] = finalRecDetails;
              }

              let safeExtractedGraph = null;
              if (matchingSeedNorm && !isLabel && !isComplexGeneration) {
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
                cacheKey: cleanCanonicalId,
                [idFieldKey]: recNorm,
                seedArtists: recArtist,
                graphData: (safeExtractedGraph && !isComplexGeneration) ? JSON.stringify(safeExtractedGraph) : null,
                detailsCache: finalRecDetails, // Save as structured object!
                filters: (matchingSeedNorm && !isLabel && !isComplexGeneration) ? inputPayload.filters || null : null,
                synthesisRationale: (matchingSeedNorm && finalGraph.synthesisRationale && !isComplexGeneration) ? finalGraph.synthesisRationale : null,
                cacheVersion: 4,
                createdAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp(),

                isDeep: true, // Marked Deep!
                isPrimarySeed: !!matchingSeedNorm,
                hasUniqueSpiderweb: (matchingSeedNorm && !isLabel && !isComplexGeneration) ? true : false,
                dataIntegrityStatus: matchingSeedNorm ? (recDetails?._isStub ? 'degraded' : 'verified') : undefined,
              });
              console.log(`[Curation Backend] Proactively created DEEP entry for recommendation (${collName}): ${cleanCanonicalId}`);
            } else {
              const finalRecDetails = isLabel ? sanitizeLabelProfile(recDetails) : sanitizeUndefinedProperties(normalizeDetailsForWrite(recDetails));
              
              if (recDetailsEntry) {
                (recDetailsEntry as any)[1] = finalRecDetails;
              }

              const updatePayload: any = {
                detailsCache: finalRecDetails,
                updatedAt: FieldValue.serverTimestamp(),
                cacheVersion: 4,
                [idFieldKey]: recNorm,
                cacheKey: cleanCanonicalId,
                isDeep: true
              };

              if (matchingSeedNorm) {
                 let safeExtractedGraph = null;
                 if (!isLabel && !isComplexGeneration) {
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
                if (!isComplexGeneration) {
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
              }

              await recDocRef.update(sanitizeUndefinedProperties(updatePayload));
              console.log(`[Curation Backend] Proactively updated detailsCache for recommendation (${collName}): ${cleanCanonicalId}`);            }

            }

        // Topology already rewritten and deduplicated in the pre-computation block before Step 5.
        // Final Node Label Lock: Guarantee that seed nodes in the graph carry the clean display name
        if (finalGraph && finalGraph.nodes && Array.isArray(finalGraph.nodes)) {
          finalGraph.nodes.forEach((node: any) => {
            if (node.type === 'artist' || !node.type) {
              const nodeNorm = normalizeArtistId(node.id);
              const canonical = resolvedSeedNormMap.get(nodeNorm) ?? nodeNorm;
              const cleanName = seedNamesMap[canonical] || seedNamesMap[nodeNorm] || seedNamesMap[node.id];
              if (cleanName) {
                node.label = cleanName;
              }
            }
          });
        }

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

      const mergedApiUsage: Record<string, { prompt: number, candidates: number, total: number }> = {};
      if (inputPayload?.foregroundApiUsage && Object.keys(inputPayload.foregroundApiUsage).length > 0) {
        for (const [model, usage] of Object.entries(inputPayload.foregroundApiUsage)) {
          const safeUsage = usage as any;
          mergedApiUsage[model] = {
            prompt: safeUsage.prompt || 0,
            candidates: safeUsage.candidates || 0,
            total: safeUsage.total || 0,
          };
        }
      } else {
        console.warn(`[Curation Backend] CRITICAL WARNING: inputPayload.foregroundApiUsage is empty or missing! Tokens dropped from Phase 1. Payload:`, inputPayload?.foregroundApiUsage);
      }
      
      for (const [model, usage] of Object.entries(collectedTokens)) {
        if (!mergedApiUsage[model]) {
          mergedApiUsage[model] = { prompt: 0, candidates: 0, total: 0 };
        }
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
