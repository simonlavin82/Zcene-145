"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.processCurationJob = void 0;
const firestore_1 = require("firebase-functions/v2/firestore");
const app_1 = require("firebase-admin/app");
const firestore_2 = require("firebase-admin/firestore");
const errorTranslationLayer_1 = require("./services/errorTranslationLayer");
const curatorService_1 = require("./services/curatorService");
// Initialize Firebase Admin SDK if not already done
if ((0, app_1.getApps)().length === 0) {
    (0, app_1.initializeApp)();
}
const db = (0, firestore_2.getFirestore)();
try {
    db.settings({ ignoreUndefinedProperties: true });
}
catch (e) {
    // Ignore if already set by another function module
}
/**
 * Sanity Check: Validate that detailsCache is a structured object matching the schema,
 * and specifically reject raw strings or arrays of entries to prevent database pollution.
 */
function validateArtistDetailsSchema(artistId, details) {
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
function sanitizeUndefinedProperties(obj) {
    if (obj === null || obj === undefined)
        return null;
    if (Array.isArray(obj)) {
        return obj.map(item => sanitizeUndefinedProperties(item));
    }
    if (typeof obj === 'object') {
        const clean = {};
        for (const key of Object.keys(obj)) {
            const val = obj[key];
            if (val !== undefined) { // Only strip undefined — null is a valid Firestore value
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
function normalizeDetailsForWrite(details) {
    if (!details || typeof details !== 'object' || Array.isArray(details))
        return details;
    return {
        ...details,
        imageUrl: (typeof details.imageUrl === 'string') ? details.imageUrl : ""
    };
}
/**
 * Strips artist-centric fields from a label profile before caching in Firestore.
 */
function sanitizeLabelProfile(details) {
    if (!details)
        return null;
    let parsed = typeof details === 'string' ? JSON.parse(details) : details;
    if (!parsed || typeof parsed !== 'object')
        return null;
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
function isEntitySeedMatch(seedNorm, candidateNorm) {
    if (!seedNorm || !candidateNorm)
        return false;
    const s = (0, curatorService_1.normalizeArtistId)(seedNorm);
    const c = (0, curatorService_1.normalizeArtistId)(candidateNorm);
    if (s === c)
        return true;
    if (s.startsWith(`${c}-`) || c.startsWith(`${s}-`))
        return true;
    if (s.includes(`-${c}-`) || s.endsWith(`-${c}`) || c.includes(`-${s}-`) || c.endsWith(`-${s}`))
        return true;
    return false;
}
const KNOWN_COUNTRY_SLUGS = [
    '-united-states', '-united-kingdom', '-global', '-australia', '-canada', '-germany', '-france',
    '-japan', '-sweden', '-italy', '-spain', '-brazil', '-mexico', '-netherlands', '-belgium',
    '-norway', '-finland', '-denmark', '-ireland', '-new-zealand', '-poland', '-austria',
    '-switzerland', '-uk', '-usa', '-us'
];
function stripCountrySlug(name) {
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
async function updateProjectStatus(userId, projectId, updates) {
    try {
        const projectRef = db.collection("users").doc(userId).collection("projects").doc(projectId);
        const sanitizedUpdates = sanitizeUndefinedProperties(updates);
        await projectRef.update({
            ...sanitizedUpdates,
            updatedAt: firestore_2.FieldValue.serverTimestamp()
        });
        console.log(`[Curation Backend] Project ${projectId} status updated successfully:`, sanitizedUpdates);
    }
    catch (err) {
        console.error(`[Curation Backend] Failed to update project ${projectId} status:`, err.message);
    }
}
exports.processCurationJob = (0, firestore_1.onDocumentCreated)({
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
        updatedAt: firestore_2.FieldValue.serverTimestamp()
    });
    const { jobType, inputPayload } = jobData;
    if (inputPayload?.projectId && jobData.userId) {
        await updateProjectStatus(jobData.userId, inputPayload.projectId, { status: "curating" });
    }
    try {
        console.log(`[Curation Backend] Executing ${jobType} for user ${jobData.userId} with payload:`, inputPayload);
        let result = null;
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
            }
            else {
                // Parse seed artists list and immediately enforce the global slugging convention.
                // disambiguationHints (collected by the Validate Origin modal) carries the user-confirmed
                // country for each seed. We apply the slug here — before Phase 1 cache routing — so that
                // every downstream reference (cache lookups, seed node standardisation, Firestore writes,
                // alias pointers, Root Breakdown write-back) uses the canonical <artist>-<country> ID.
                // This prevents namespace collisions between artists sharing the same name from different countries.
                const rawArtistList = inputPayload.artists
                    .split('::')
                    .map((a) => a.trim())
                    .filter(Boolean);
                const disambiguationHints = inputPayload.disambiguationHints || {};
                const artistList = rawArtistList.map((seed) => {
                    const seedNorm = (0, curatorService_1.normalizeArtistId)(seed);
                    // Find the matching hint by comparing bare normalised names (hint keys are bare, e.g. 'spaced')
                    const hintEntry = Object.entries(disambiguationHints).find(([k]) => (0, curatorService_1.normalizeArtistId)(k) === seedNorm);
                    if (hintEntry) {
                        const originSlug = (0, curatorService_1.extractCountrySlug)(hintEntry[1]);
                        if (originSlug && originSlug !== 'global' && !seedNorm.endsWith(`-${originSlug}`)) {
                            const slugged = `${seedNorm}-${originSlug}`;
                            console.log(`[Curation Backend] [Slug Enforcement] Rewrote seed ID: '${seedNorm}' → '${slugged}' (origin: ${hintEntry[1]})`);
                            return slugged;
                        }
                    }
                    return seedNorm; // Already slugged, or no disambiguation hint available
                });
                console.log(`[Curation Backend] [Phase 1: Global Cache Routing] Checking seeds: ${artistList.join(', ')}`);
                const resolvedSeedArray = [];
                for (const seed of artistList) {
                    const seedNorm = (0, curatorService_1.normalizeArtistId)(seed);
                    let cachedDetails = null;
                    try {
                        // We check artists collection primarily for seeds
                        const cacheDoc = await db.collection("artists").doc(seedNorm).get();
                        if (cacheDoc.exists) {
                            const cacheData = cacheDoc.data();
                            if (cacheData && cacheData.detailsCache) {
                                cachedDetails = typeof cacheData.detailsCache === 'string' ? JSON.parse(cacheData.detailsCache) : cacheData.detailsCache;
                                if (Array.isArray(cachedDetails) && cachedDetails.length > 0) {
                                    const match = cachedDetails.find((item) => (0, curatorService_1.normalizeArtistId)(item[0]) === seedNorm);
                                    if (match && match[1]) {
                                        cachedDetails = match[1];
                                    }
                                    else {
                                        cachedDetails = Array.isArray(cachedDetails[0]) ? cachedDetails[0][1] : cachedDetails[0];
                                    }
                                }
                            }
                        }
                    }
                    catch (e) {
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
                    }
                    else {
                        console.log(`[Phase 1] Cache Miss for seed: ${seed}. Routing to Phase 2 (Flash-Lite).`);
                        // Phase 2: Origin Validation (Flash-Lite)
                        const validationResult = await (0, curatorService_1.validateSeedOriginBackend)(seed);
                        if (validationResult.isValid) {
                            resolvedSeedArray.push({
                                id: (0, curatorService_1.normalizeArtistId)(validationResult.id),
                                name: validationResult.id,
                                origin: validationResult.origin,
                                genre: validationResult.genre,
                                isCacheHit: false
                            });
                        }
                        else {
                            throw new Error(`Validation failed for seed: ${seed}. It is not recognized as a valid musical entity.`);
                        }
                    }
                }
                console.log(`[Phase 3: The Aggregator Gate] Resolved Seed Array:`, resolvedSeedArray);
                let finalGraph = inputPayload.baseGraph;
                // Structural Integrity Guard: Verify that we received a valid, rich graph from the model
                const artistNodesCount = finalGraph.nodes?.filter((n) => n.type === 'artist' || !n.type).length || 0;
                const minimumRequiredArtists = 2; // Seed artist + at least 1 recommendation
                if (!finalGraph.nodes || finalGraph.nodes.length === 0 || artistNodesCount < minimumRequiredArtists) {
                    throw new Error(`Generated graph failed structural integrity check. Artist nodes count: ${artistNodesCount} (minimum required: ${minimumRequiredArtists}). Curation aborted.`);
                }
                // Parse seed artists list (already done above)
                // Strip regional slugs from the seed artists string to prevent prompt hallucination
                const cleanSeedArtistsContext = artistList
                    .map((a) => stripCountrySlug(a))
                    .join('::');
                // Pre-Hydration ID Standardization for Seed Artists
                // Force graph variants (e.g. "Korn") to match the exact UI request (e.g. "korn-usa") 
                // before hydration begins to guarantee symmetry with deep cuts.
                if (finalGraph.nodes) {
                    for (const seed of artistList) {
                        const seedNorm = (0, curatorService_1.normalizeArtistId)(seed);
                        const seedNode = finalGraph.nodes.find((n) => isEntitySeedMatch(seedNorm, n.id) || isEntitySeedMatch(seedNorm, n.label || ''));
                        if (seedNode && (0, curatorService_1.normalizeArtistId)(seedNode.id) !== seedNorm) {
                            console.log(`[Curation Backend] Standardizing seed node ID from ${seedNode.id} to ${seedNorm}`);
                            seedNode.id = seedNorm; // E.g., 'Korn' -> 'korn-usa'
                            seedNode.label = stripCountrySlug(seed); // Use bare display name so recNorm stays un-slugged (e.g. 'spaced', not 'spaced-usa')
                        }
                    }
                }
                // 1. ISOLATE INTERACTIVE NODES: Explicitly filter out Structural Hubs (genre, founded, country)
                // Structural hubs bypass the hydration loop entirely.
                const recommendedEntities = finalGraph.nodes.filter((n) => n.type === 'artist' || n.type === 'label').map((n) => ({
                    id: n.id,
                    name: n.label || n.id,
                    type: n.type,
                    origin: n.origin || null
                }));
                // CRITICAL FIX: Ensure all seed artists are explicitly placed into the hydration queue.
                // The architectural design dictates that seeds must go through the gap-filling phase just like deep cuts,
                // even if the LLM omitted them or modified their IDs in the graph output.
                for (const seed of artistList) {
                    const seedNorm = (0, curatorService_1.normalizeArtistId)(seed);
                    const exists = recommendedEntities.some((e) => isEntitySeedMatch(seedNorm, e.id) || isEntitySeedMatch(seedNorm, e.name));
                    if (!exists) {
                        // Pass the origin string from disambiguationHints so the Pre-Hydration Canonicalization
                        // guard in the hydration loop has a second source of truth (defensive belt-and-suspenders).
                        const hintEntry = Object.entries(disambiguationHints).find(([k]) => (0, curatorService_1.normalizeArtistId)(k) === seedNorm);
                        recommendedEntities.unshift({
                            id: seed,
                            name: stripCountrySlug(seed), // Bare display name (e.g. 'spaced') — mirrors the standardization label above
                            type: 'artist',
                            origin: hintEntry ? hintEntry[1] : null
                        });
                        console.log(`[Curation Backend] Explicitly pushing missing seed artist into gap-filling queue: ${seed}`);
                    }
                }
                console.log(`[Curation Backend] [Step 2: Hydration Loop Started] Hydrating details for ${recommendedEntities.length} entities in the graph:`, recommendedEntities.map((e) => `${e.name} (${e.type})`));
                const detailsCacheEntries = [];
                // Fetch details in concurrency chunks of 3 to respect the 15 RPM Gemini limit
                // (1 text + 1 image req per node = ~6 requests per batch)
                const batchSize = 3;
                for (let i = 0; i < recommendedEntities.length; i += batchSize) {
                    const chunk = recommendedEntities.slice(i, i + batchSize);
                    console.log(`[Curation Backend] Hydrating batch ${Math.floor(i / batchSize) + 1} of ${Math.ceil(recommendedEntities.length / batchSize)} (${chunk.length} entities)...`);
                    const batchStartTime = Date.now();
                    const chunkResults = await Promise.all(chunk.map(async (entityObj, idx) => {
                        const rawName = entityObj.name;
                        let artistNormId = (0, curatorService_1.normalizeArtistId)(rawName);
                        // Pre-Hydration Canonicalization: Stitch the origin slug before cache lookup
                        if (entityObj.origin) {
                            const originSlug = (0, curatorService_1.extractCountrySlug)(entityObj.origin);
                            if (!artistNormId.endsWith(`-${originSlug}`)) {
                                artistNormId = `${artistNormId}-${originSlug}`;
                            }
                        }
                        const isLabel = entityObj.type === 'label';
                        // ── Slug Deduplication Guard ───────────────────────────────────────────
                        // Before using artistNormId (which may be derived from a new slug), query
                        // Firestore by the base artistId field to detect if a canonical variation
                        // already exists (e.g., sick-of-it-all-usa already in DB when we are about
                        // to create sick-of-it-all). If a canonical doc is found, adopt its ID.
                        if (!isLabel) {
                            try {
                                const baseNormId = (0, curatorService_1.normalizeArtistId)(rawName); // without country suffix
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
                            }
                            catch (dedupErr) {
                                console.warn(`[Curation Backend] Slug dedup query failed for "${rawName}", proceeding with derived ID:`, dedupErr);
                            }
                        }
                        // 1. Check local Firestore Cache first
                        let details = null;
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
                                        }
                                        catch (e) { }
                                    }
                                    if (cachedDetails) {
                                        // Un-nest array wrapper layer if legacy format [ [ "name", { ... } ] ]
                                        if (Array.isArray(cachedDetails) && cachedDetails.length > 0) {
                                            const match = cachedDetails.find((item) => (0, curatorService_1.normalizeArtistId)(item[0]) === artistNormId);
                                            if (match && match[1]) {
                                                cachedDetails = match[1];
                                            }
                                            else {
                                                cachedDetails = Array.isArray(cachedDetails[0]) ? cachedDetails[0][1] : cachedDetails[0];
                                            }
                                        }
                                        // Universal Cache Validation: A cached document is only a valid hit if it is
                                        // truly complete — it must have a meaningful summary AND a genre AND an imageUrl.
                                        // Any entity missing imageUrl or genre is considered a stale stub and must be
                                        // re-routed through full Gemini hydration and iTunes scraping. This rule applies
                                        // equally to seeds and deep cuts — no special-case flags needed.
                                        const isCacheComplete = (cachedDetails &&
                                            cachedDetails.summary &&
                                            cachedDetails.summary.length > 50 &&
                                            cachedDetails.details?.genre &&
                                            cachedDetails.imageUrl // Must have a non-empty image URL
                                        );
                                        if (isCacheComplete) {
                                            details = cachedDetails;
                                            console.log(`[Curation Backend] Direct cache hit (complete) for details of: ${artistNormId}`);
                                        }
                                        else if (cachedDetails) {
                                            console.log(`[Curation Backend] Cache doc found but incomplete (missing imageUrl or genre) for: ${artistNormId}. Routing to full hydration.`);
                                        }
                                    }
                                }
                            }
                        }
                        catch (cacheErr) {
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
                        }
                        else if (details.summary === "Imported from Apple Music library." ||
                            details.summary.length <= 50 ||
                            !details.details?.genre ||
                            details.summary.includes("Mock Bio") ||
                            !details.imageUrl) {
                            // Stub node (e.g. from frontend library import or test seed) or missing image -> Full Hydration
                            requiresTextHydration = true;
                            requiresImageScraping = true;
                            requiresVideoScraping = true;
                        }
                        else {
                            // Complete canonical cache hit -> STRICT BYPASS
                            // We do not mutate or re-scrape existing global records.
                            // However, we MUST check if it's missing assets due to a past failure.
                            if (!details.imageUrl) {
                                requiresImageScraping = true;
                            }
                            if (!details.youtubeVideoId && !isLabel) {
                                requiresVideoScraping = true;
                            }
                        }
                        const tempNode = { id: searchArtistName, type: entityObj.type, group: 1 };
                        // Stagger concurrent requests by 1000ms to prevent API burst rate limiting (iTunes & Gemini)
                        if (idx > 0 && (requiresTextHydration || requiresImageScraping || requiresVideoScraping)) {
                            await new Promise(resolve => setTimeout(resolve, idx * 1000));
                        }
                        if (requiresTextHydration) {
                            console.log(`[Curation Backend] Cache miss (or missing text). Hydrating details for ${isLabel ? 'label' : 'artist'}: ${searchArtistName}...`);
                            // Change 2 — Per-node transient retry with 2-second backoff.
                            // Now also retries on JSON parse failures or schema validation errors (AI hallucination glitches).
                            const isTransientError = (err) => {
                                const msg = (err?.message || String(err)).toLowerCase();
                                return /429|503|resource.?exhausted|service.?unavailable|too many requests|timeout|fetch failed|network|socket|parse|invalid data|json/i.test(msg);
                            };
                            try {
                                details = await (0, curatorService_1.fetchNodeDetailsBackend)(tempNode, finalGraph, cleanSeedArtistsContext);
                            }
                            catch (firstErr) {
                                if (isTransientError(firstErr)) {
                                    console.warn(`[Curation Backend] Transient error for ${artistNormId}. Retrying in 8s...`, firstErr.message);
                                    await new Promise(resolve => setTimeout(resolve, 8000));
                                    try {
                                        details = await (0, curatorService_1.fetchNodeDetailsBackend)(tempNode, finalGraph, cleanSeedArtistsContext);
                                        console.log(`[Curation Backend] Retry succeeded for: ${artistNormId}`);
                                    }
                                    catch (retryErr) {
                                        console.error(`[Curation Backend] Retry also failed for: ${artistNormId}. Safely skipping cache write.`, retryErr.message);
                                        return null;
                                    }
                                }
                                else {
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
                                        const playable = await (0, curatorService_1.checkVideoPlayability)(details.youtubeVideoId);
                                        if (!playable) {
                                            details.youtubeVideoId = null;
                                        }
                                    }
                                    if (!details.youtubeVideoId && details.youtubeSearchQuery) {
                                        const scrapedId = await (0, curatorService_1.scrapeVideoIdBackend)(searchArtistName, artistNormId);
                                        if (scrapedId) {
                                            const playable = await (0, curatorService_1.checkVideoPlayability)(scrapedId);
                                            if (playable) {
                                                details.youtubeVideoId = scrapedId;
                                            }
                                        }
                                    }
                                }
                                catch (e) {
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
                                    const scrapedImg = await (0, curatorService_1.scrapeImageUrlBackend)(attemptName, 'artist', details.details.genre || "", details.summary || "");
                                    if (scrapedImg) {
                                        details.imageUrl = scrapedImg;
                                    }
                                    else {
                                        // ⚠️ STRICT FAIL-FAST RULE: No deterministic fallback images.
                                        console.warn(`[Image Scraper] No image found for ${searchArtistName}.`);
                                        details.imageUrl = null;
                                    }
                                }
                                catch (e) {
                                    // ⚠️ STRICT FAIL-FAST RULE: Catch API timeouts instantly.
                                    console.warn(`[Image Scraper] Timeout/Error for ${searchArtistName}. Enforcing fail-fast rule.`);
                                    details.imageUrl = null;
                                }
                            }
                            details.details.artist = details.details.artist || searchArtistName;
                            // Note: synthesisRationale is NOT stamped here. The real Root Breakdown is
                            // generated after all hydration completes (Step 4) and written back to the
                            // seed artist doc explicitly. Pre-stamping a stub would pollute the artist
                            // doc and corrupt the Roots Breakdown displayed on cache hits.
                            console.log(`[Curation Backend] Hydration successful for: ${artistNormId}`);
                        }
                        if (!details)
                            return null;
                        return [artistNormId, details];
                    }));
                    console.log(`[Curation Backend] [Step 3: Firestore Caching] Hydration complete. Writing ${chunkResults.length} entities to Firestore cache...`);
                    for (const res of chunkResults) {
                        if (res) {
                            const existingIndex = detailsCacheEntries.findIndex((entry) => isEntitySeedMatch((0, curatorService_1.normalizeArtistId)(res[0]), entry[0]));
                            if (existingIndex !== -1) {
                                detailsCacheEntries[existingIndex] = res;
                            }
                            else {
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
                        }
                        else {
                            console.log(`[Curation Backend] Batch complete (${Math.round(batchElapsedMs / 1000)}s active). Rate-limit window already elapsed — skipping cooldown.`);
                        }
                    }
                }
                // Change 3 — Hydration Completeness Audit Log.
                // Identifies any nodes that failed hydration (null result) and logs a warning.
                // This provides operational visibility for monitoring the zero-miss hydration mandate.
                const failedHydrationIds = recommendedEntities
                    .filter((e) => !detailsCacheEntries.some(entry => isEntitySeedMatch((0, curatorService_1.normalizeArtistId)(e.name), entry[0])))
                    .map((e) => e.name);
                console.log(`[Curation Backend] Hydration complete. Success: ${detailsCacheEntries.length}/${recommendedEntities.length} entities.`);
                if (failedHydrationIds.length > 0) {
                    console.warn(`[Curation Backend] ⚠️ HYDRATION INCOMPLETE — ${failedHydrationIds.length} node(s) failed and will not be pre-cached: ${failedHydrationIds.join(', ')}`);
                }
                else {
                    console.log(`[Curation Backend] ✅ All ${recommendedEntities.length} entities hydrated successfully — zero-miss compliance confirmed.`);
                }
                // ─── QUALITY BASELINE: Surgical Graph Pruning ────────────────────────────
                // Any non-seed entity that completely failed text hydration (LLM could not
                // generate a bio/genre after all retries) is excised from the graph topology
                // right here, before the Roots Breakdown or any write-back. This prevents
                // hollow nodes from appearing in the Spiderweb or polluting the database.
                // Seeds are NOT pruned here — a missing seed causes a fatal throw below.
                const hydratedNorms = new Set(detailsCacheEntries.map(entry => (0, curatorService_1.normalizeArtistId)(entry[0])));
                const seedNormSet = new Set(artistList.map((a) => (0, curatorService_1.normalizeArtistId)(a)));
                if (finalGraph.nodes) {
                    const prunedIds = new Set();
                    finalGraph.nodes = finalGraph.nodes.filter((node) => {
                        const nodeNorm = (0, curatorService_1.normalizeArtistId)(node.id);
                        const typeLower = (node.type || 'artist').toLowerCase();
                        const isStructural = !['artist', 'label'].includes(typeLower);
                        const isSeedNode = Array.from(seedNormSet).some((s) => isEntitySeedMatch(s, nodeNorm));
                        const isHydrated = Array.from(hydratedNorms).some((h) => isEntitySeedMatch(nodeNorm, h));
                        if (!isHydrated && !isSeedNode && !isStructural) {
                            console.warn(`[Quality Baseline] Surgically pruning unhydratable node from graph topology: ${node.id}`);
                            prunedIds.add(node.id);
                            return false;
                        }
                        return true;
                    });
                    if (prunedIds.size > 0 && finalGraph.links) {
                        finalGraph.links = finalGraph.links.filter((link) => {
                            const srcId = typeof link.source === 'string' ? link.source : link.source?.id;
                            const tgtId = typeof link.target === 'string' ? link.target : link.target?.id;
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
                let rootBreakdownStr = "";
                try {
                    // 3.1 Pro: Root Breakdown Narrative
                    rootBreakdownStr = await (0, curatorService_1.generateRootsBreakdownBackend)(inputPayload.artists, detailsCacheEntries);
                    finalGraph.synthesisRationale = rootBreakdownStr;
                    // ── Step 5: Root Breakdown Write-Back to Seed Artist Docs ────────────────
                    // Per the Unified Canvas Architecture (Column 3, Step 5), Single-Seed jobs persist
                    // the Root Breakdown to the seed artist's Firestore doc so that future cache hits
                    // serve the full 3.1 Pro narrative without re-generating it. This write-back
                    // overwrites any absent or stub value left from the earlier hydration pass.
                    if (rootBreakdownStr) {
                        for (const seedName of artistList) {
                            const seedNorm = (0, curatorService_1.normalizeArtistId)(seedName);
                            const seedDocRef = db.collection('artists').doc(seedNorm);
                            await seedDocRef.update({
                                'detailsCache.synthesisRationale': rootBreakdownStr,
                                synthesisRationale: rootBreakdownStr,
                                cachedAt: firestore_2.FieldValue.serverTimestamp()
                            }).catch((e) => {
                                // Non-fatal: the project graphData is the canonical ground truth.
                                console.warn(`[Curation Backend] Root Breakdown write-back skipped for artist doc: ${seedNorm}`, e.message);
                            });
                            console.log(`[Curation Backend] ✅ Root Breakdown written to seed artist doc: ${seedNorm}`);
                        }
                    }
                    // 3.1 Pro: Final Node Positioning could be executed here if a service existed.
                    // We will skip explicit repositioning mutation of finalGraph to avoid breaking schema,
                    // but the narrative synthesis is now locked to 3.1 Pro.
                }
                catch (e) {
                    console.error(`[Curation Backend] 3.1 Pro Post-Processing failed:`, e);
                }
                const idRewriteMap = new Map();
                // Proactively cache each recommended entity (artist or label) as a deep cache entry as well!
                const seedNorms = artistList.map((a) => (0, curatorService_1.normalizeArtistId)(a));
                for (const entityObj of recommendedEntities) {
                    const recArtist = entityObj.name;
                    const recNorm = (0, curatorService_1.normalizeArtistId)(recArtist);
                    const isLabel = entityObj.type === 'label';
                    const matchingSeedNorm = seedNorms.find((s) => isEntitySeedMatch(s, recNorm));
                    if (matchingSeedNorm) {
                        // ALIAS this duplicate reference to the canonical seed ID so it gets merged!
                        if (!idRewriteMap.has(recNorm) && idRewriteMap.has(matchingSeedNorm)) {
                            idRewriteMap.set(recNorm, idRewriteMap.get(matchingSeedNorm));
                        }
                        // Do NOT continue here. Let the seed fall through so it can be evaluated for partial hydration or missing assets during a cache upgrade.
                    }
                    const recDetailsEntry = detailsCacheEntries.find((entry) => isEntitySeedMatch(recNorm, entry[0]));
                    const recDetails = recDetailsEntry ? recDetailsEntry[1] : null;
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
                    }
                    catch (validationErr) {
                        console.warn(`[Curation Backend] Recommendation cache write skipped for "${recNorm}" — schema validation failed: ${validationErr.message}`);
                        continue;
                    }
                    // Use the pre-canonicalized ID from the hydration phase, or fallback to the rec norm
                    const disambiguatedCanonicalId = recDetailsEntry ? recDetailsEntry[0] : recNorm;
                    const compositeCanonicalId = (0, curatorService_1.buildCompositeCacheKey)(disambiguatedCanonicalId, inputPayload.filters || undefined);
                    idRewriteMap.set(recNorm, compositeCanonicalId);
                    if (recDetailsEntry)
                        recDetailsEntry[0] = compositeCanonicalId;
                    const recDocRef = db.collection(collName).doc(compositeCanonicalId);
                    const recSnap = await recDocRef.get();
                    if (!recSnap.exists) {
                        const finalRecDetails = isLabel ? sanitizeLabelProfile(recDetails) : sanitizeUndefinedProperties(normalizeDetailsForWrite(recDetails));
                        if (recDetailsEntry) {
                            recDetailsEntry[1] = finalRecDetails;
                        }
                        const extractedGraph = matchingSeedNorm && !isLabel ? (0, curatorService_1.extractArtistSubGraph)(matchingSeedNorm, finalGraph, artistList) : null;
                        await recDocRef.set({
                            cacheKey: compositeCanonicalId,
                            [idFieldKey]: recNorm,
                            seedArtists: recArtist,
                            graphData: extractedGraph ? JSON.stringify(extractedGraph) : null,
                            detailsCache: finalRecDetails, // Save as structured object!
                            filters: matchingSeedNorm && !isLabel ? inputPayload.filters || null : null,
                            cacheVersion: 4,
                            cachedAt: firestore_2.FieldValue.serverTimestamp(),
                            isDeep: true, // Marked Deep!
                            isPrimarySeed: !!matchingSeedNorm,
                            hasUniqueSpiderweb: matchingSeedNorm ? !isLabel : false,
                            dataIntegrityStatus: matchingSeedNorm ? (recDetails?._isStub ? 'degraded' : 'verified') : undefined,
                        });
                        console.log(`[Curation Backend] Proactively created DEEP entry for recommendation (${collName}): ${compositeCanonicalId}`);
                    }
                    else {
                        const finalRecDetails = isLabel ? sanitizeLabelProfile(recDetails) : sanitizeUndefinedProperties(normalizeDetailsForWrite(recDetails));
                        if (recDetailsEntry) {
                            recDetailsEntry[1] = finalRecDetails;
                        }
                        const updatePayload = {
                            detailsCache: finalRecDetails,
                            cachedAt: firestore_2.FieldValue.serverTimestamp(),
                            cacheVersion: 4,
                            [idFieldKey]: recNorm,
                            cacheKey: compositeCanonicalId,
                            isDeep: true
                        };
                        if (matchingSeedNorm) {
                            const extractedGraph = !isLabel ? (0, curatorService_1.extractArtistSubGraph)(matchingSeedNorm, finalGraph, artistList) : null;
                            updatePayload.isPrimarySeed = true;
                            updatePayload.dataIntegrityStatus = recDetails?._isStub ? 'degraded' : 'verified';
                            updatePayload.hasUniqueSpiderweb = !isLabel;
                            if (!isLabel) {
                                updatePayload.graphData = extractedGraph ? JSON.stringify(extractedGraph) : null;
                                updatePayload.filters = inputPayload.filters || null;
                            }
                        }
                        await recDocRef.update(sanitizeUndefinedProperties(updatePayload));
                        console.log(`[Curation Backend] Proactively updated detailsCache for recommendation (${collName}): ${compositeCanonicalId}`);
                    }
                    // Create/Heal Bare Root Alias Pointer and replicate detailsCache for immediate short-ID resolution
                    const bareArtistIdRef = db.collection(collName).doc(recNorm);
                    const bareSnap = await bareArtistIdRef.get();
                    const barePayload = {
                        cacheKey: recNorm,
                        [idFieldKey]: recNorm,
                        seedArtists: recArtist,
                        cacheVersion: 4,
                        cachedAt: firestore_2.FieldValue.serverTimestamp(),
                        redirectTo: compositeCanonicalId
                    };
                    if (!bareSnap.exists) {
                        await bareArtistIdRef.set(sanitizeUndefinedProperties(barePayload));
                        console.log(`[Curation Backend] Created Bare Alias Pointer Stub in ${collName}: ${recNorm} -> ${compositeCanonicalId}`);
                    }
                    else {
                        await bareArtistIdRef.update(sanitizeUndefinedProperties(barePayload)).catch(() => { });
                        console.log(`[Curation Backend] Updated Bare Alias Pointer Stub in ${collName}: ${recNorm} -> ${compositeCanonicalId}`);
                    }
                }
                // Apply Canonical ID Rewrite and Strict Deduplication to Graph Topology
                if (finalGraph.nodes) {
                    const uniqueNodesMap = new Map();
                    finalGraph.nodes.forEach((node) => {
                        const normId = (0, curatorService_1.normalizeArtistId)(node.id);
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
                    const uniqueLinksMap = new Map();
                    finalGraph.links.forEach((link) => {
                        const sId = typeof link.source === 'string' ? link.source : link.source.id;
                        const tId = typeof link.target === 'string' ? link.target : link.target.id;
                        const normS = (0, curatorService_1.normalizeArtistId)(sId);
                        const normT = (0, curatorService_1.normalizeArtistId)(tId);
                        let finalS = sId;
                        let finalT = tId;
                        if (idRewriteMap.has(normS))
                            finalS = idRewriteMap.get(normS);
                        if (idRewriteMap.has(normT))
                            finalT = idRewriteMap.get(normT);
                        if (typeof link.source === 'string')
                            link.source = finalS;
                        else
                            link.source.id = finalS;
                        if (typeof link.target === 'string')
                            link.target = finalT;
                        else
                            link.target.id = finalT;
                        if (finalS !== finalT) {
                            const linkKey = [finalS, finalT].sort().join('--');
                            if (!uniqueLinksMap.has(linkKey)) {
                                uniqueLinksMap.set(linkKey, link);
                            }
                        }
                    });
                    finalGraph.links = Array.from(uniqueLinksMap.values());
                }
                result = {
                    graphData: finalGraph,
                    detailsCache: JSON.stringify(detailsCacheEntries)
                };
            }
        }
        else {
            throw new Error(`Unsupported jobType: ${jobType}`);
        }
        // Complete job with 24-hour TTL expiration policy
        await jobDocRef.update({
            status: "completed",
            result,
            updatedAt: firestore_2.FieldValue.serverTimestamp(),
            completedAt: firestore_2.FieldValue.serverTimestamp(),
            expireAt: firestore_2.Timestamp.fromMillis(Date.now() + 24 * 60 * 60 * 1000)
        });
        console.log(`[Curation Backend] Successfully completed job ${jobId} (set TTL expireAt +24h)`);
        if (inputPayload?.projectId && jobData.userId && result?.graphData) {
            const graphObj = typeof result.graphData === 'string' ? JSON.parse(result.graphData) : result.graphData;
            const artistEntityIds = graphObj.nodes
                ? graphObj.nodes.filter((n) => n.type === 'artist' || !n.type).map((n) => (0, curatorService_1.normalizeArtistId)(n.id))
                : [];
            const labelEntityIds = graphObj.nodes
                ? graphObj.nodes.filter((n) => n.type === 'label').map((n) => (0, curatorService_1.normalizeArtistId)(n.id))
                : [];
            await updateProjectStatus(jobData.userId, inputPayload.projectId, {
                status: "completed",
                graphData: JSON.stringify(result.graphData),
                artistIds: artistEntityIds,
                labelIds: labelEntityIds,
                activeJobId: null,
                detailsCache: result.detailsCache
            });
        }
    }
    catch (error) {
        console.error(`[Curation Backend] Failed processing job ${jobId}:`, error);
        // Unified error messaging using the shared errorTranslationLayer
        const translatedError = (0, errorTranslationLayer_1.translateError)(error);
        await jobDocRef.update({
            status: "failed",
            errorMessage: translatedError.userFriendlyMessage,
            errorDetails: {
                rawMessage: error.message || String(error),
                statusCode: error.status || null,
                stack: error.stack || null
            },
            updatedAt: firestore_2.FieldValue.serverTimestamp(),
            completedAt: firestore_2.FieldValue.serverTimestamp(),
            expireAt: firestore_2.Timestamp.fromMillis(Date.now() + 24 * 60 * 60 * 1000)
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
//# sourceMappingURL=processCurationJob.js.map