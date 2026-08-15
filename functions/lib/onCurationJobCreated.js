"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onCurationJobCreated = void 0;
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
db.settings({ ignoreUndefinedProperties: true });
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
 * Recursively removes any undefined properties from an object,
 * replacing them with null or omitting them, to prevent Firestore serialization errors.
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
            if (val !== undefined && val !== null) {
                clean[key] = sanitizeUndefinedProperties(val);
            }
        }
        return clean;
    }
    return obj;
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
exports.onCurationJobCreated = (0, firestore_1.onDocumentCreated)({
    document: "curationJobs/{jobId}",
    secrets: ["GEMINI_API_KEY"],
    timeoutSeconds: 540,
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
            const isMultiSeedJob = (inputPayload?.artists || "").split('::').filter(Boolean).length > 1;
            const hasFiltersJob = inputPayload?.filters && Object.keys(inputPayload.filters).length > 0;
            const isSandboxMode = inputPayload?.isSandboxMode === true || isMultiSeedJob || hasFiltersJob;
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
                let finalGraph = inputPayload.baseGraph;
                if (!inputPayload.isSmartBypass) {
                    console.log("[Curation Backend] [Step 1: Graph Generation Started] Executing live Gemini AI graph synthesis...");
                    // Run backend curation synthesis
                    finalGraph = await (0, curatorService_1.generateGraphDataBackend)(inputPayload.artists, inputPayload.filters, inputPayload.cachedSubgraphsContext, inputPayload.baseGraph, inputPayload.disambiguationHints);
                }
                else {
                    console.log("[Curation Backend] [Step 1: Graph Generation Bypassed] Smart Bypass active. Using baseGraph directly.");
                }
                // Structural Integrity Guard: Verify that we received a valid, rich graph from the model
                const artistNodesCount = finalGraph.nodes?.filter((n) => n.type === 'artist' || !n.type).length || 0;
                const minimumRequiredArtists = 2; // Seed artist + at least 1 recommendation
                if (!finalGraph.nodes || finalGraph.nodes.length === 0 || artistNodesCount < minimumRequiredArtists) {
                    throw new Error(`Generated graph failed structural integrity check. Artist nodes count: ${artistNodesCount} (minimum required: ${minimumRequiredArtists}). Curation aborted.`);
                }
                // Parse seed artists list
                const artistList = inputPayload.artists
                    .split('::')
                    .map((a) => a.trim())
                    .filter(Boolean);
                // Gather all artist and label nodes in the final graph (seeds, recommendations, and labels)
                // Gather all artist and label nodes in the final graph (seeds, recommendations, and labels)
                const recommendedEntities = finalGraph.nodes
                    .filter((n) => n.type === 'artist' || n.type === 'label' || !n.type)
                    .map((n) => ({
                    id: n.id,
                    name: n.label || n.id,
                    type: n.type || 'artist'
                }));
                console.log(`[Curation Backend] [Step 2: Hydration Loop Started] Hydrating details for ${recommendedEntities.length} entities in the graph:`, recommendedEntities.map((e) => `${e.name} (${e.type})`));
                const detailsCacheEntries = [];
                // Fetch details in concurrency chunks of 5 to reduce 20-minute run times to under 3 minutes
                const batchSize = 5;
                for (let i = 0; i < recommendedEntities.length; i += batchSize) {
                    const chunk = recommendedEntities.slice(i, i + batchSize);
                    console.log(`[Curation Backend] Hydrating batch ${Math.floor(i / batchSize) + 1} of ${Math.ceil(recommendedEntities.length / batchSize)} (${chunk.length} entities)...`);
                    const chunkResults = await Promise.all(chunk.map(async (entityObj, idx) => {
                        const artistName = entityObj.name;
                        const artistNormId = (0, curatorService_1.normalizeArtistId)(artistName);
                        const isLabel = entityObj.type === 'label';
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
                                        if (cachedDetails && cachedDetails.summary && cachedDetails.summary.length > 50) {
                                            details = cachedDetails;
                                            console.log(`[Curation Backend] Direct cache hit for details of: ${artistNormId}`);
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
                        // Cache the original image URL just in case the scrape fails during a stub replacement
                        const originalImageUrl = details?.imageUrl || "";
                        // If the entity name is an ID slug (e.g., 'turnstile-usa') because it came from a redirect or seed insertion,
                        // and we have a valid display name in the cache, use the real name for scraping to ensure iTunes/Gemini matches.
                        let searchArtistName = artistName;
                        if (details && details.details && details.details.artist && details.details.artist !== artistName) {
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
                            details.summary.includes("Mock Bio")) {
                            // Stub node (e.g. from frontend library import or test seed) -> Full Hydration
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
                                details = await (0, curatorService_1.fetchNodeDetailsBackend)(tempNode, finalGraph, inputPayload.artists);
                            }
                            catch (firstErr) {
                                if (isTransientError(firstErr)) {
                                    console.warn(`[Curation Backend] Transient error for ${artistNormId}. Retrying in 2s...`, firstErr.message);
                                    await new Promise(resolve => setTimeout(resolve, 2000));
                                    try {
                                        details = await (0, curatorService_1.fetchNodeDetailsBackend)(tempNode, finalGraph, inputPayload.artists);
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
                        }
                        if (details) {
                            // 3. Scrape YouTube and validate video ID (only for artists; labels do not have music videos)
                            if (!isLabel && requiresVideoScraping) {
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
                            if (!details.details) {
                                details.details = { genre: "", origin: "", founded: "", notableArtists: [] };
                            }
                            // 4. Scrape dedicated Image URL
                            if (requiresImageScraping) {
                                const fetchedImageUrl = await (0, curatorService_1.scrapeImageUrlBackend)(searchArtistName, tempNode.type, details.details.genre || "", details.summary || "");
                                details.imageUrl = fetchedImageUrl || originalImageUrl || "";
                            }
                            details.details.artist = details.details.artist || searchArtistName;
                            if (!details.synthesisRationale) {
                                details.synthesisRationale = `[Single-Seed Analysis]\n- Acoustic & Sonics: Resolved core musical properties and stylistic lineage.\n- Scene Context: Mapped direct influences, record label history, and geographic background.\n- Overlap Insights: Unified structural connections and surrounding chronological relationships.`;
                            }
                            console.log(`[Curation Backend] Hydration successful for: ${artistNormId}`);
                        }
                        return [artistName, details];
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
                    // Add a 3-second cooldown between batches to prevent Google Search Tool quota exhaustion
                    if (i + batchSize < recommendedEntities.length) {
                        console.log(`[Curation Backend] Batch complete. Cooling down for 3 seconds before next batch...`);
                        await new Promise(resolve => setTimeout(resolve, 3000));
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
                // Write-back cache entries for the seed entities (deep cache: isDeep: true)
                const idRewriteMap = new Map();
                for (const seed of artistList) {
                    const seedNorm = (0, curatorService_1.normalizeArtistId)(seed);
                    const seedNode = (finalGraph.nodes || []).find((n) => isEntitySeedMatch(seedNorm, n.id) || isEntitySeedMatch(seedNorm, n.label || ''));
                    const isSeedLabel = seedNode?.type === 'label';
                    const collName = isSeedLabel ? "labels" : "artists";
                    const idFieldKey = isSeedLabel ? "labelId" : "artistId";
                    const seedDetailsEntry = detailsCacheEntries.find(entry => isEntitySeedMatch(seedNorm, entry[0]));
                    let seedDetails = seedDetailsEntry ? seedDetailsEntry[1] : null;
                    // Ultimate Fallback: If AI fails to hydrate the root seed completely, inject a safe stub
                    // so the job doesn't crash the Integrity Lock.
                    if (!seedDetails && !isSeedLabel) {
                        console.warn(`[Integrity Lock Warning] AI failed all hydration attempts for root seed: ${seedNorm}. Injecting fallback stub.`);
                        seedDetails = {
                            summary: "Artist biography temporarily unavailable.",
                            details: {
                                artist: seedNode?.label || seedNorm,
                                genre: "",
                                origin: "",
                                founded: "",
                                notableArtists: []
                            },
                            members: [],
                            links: [],
                            discography: [],
                            tourInfo: "",
                            recommendationReason: "Fallback stub injected due to transient metadata service failure.",
                            _isStub: true
                        };
                        if (seedDetailsEntry) {
                            seedDetailsEntry[1] = seedDetails;
                        }
                        else {
                            detailsCacheEntries.push([seedNorm, seedDetails]);
                        }
                    }
                    // Find connected country nodes in finalGraph
                    const connectedCountries = (finalGraph.links || [])
                        .filter((l) => {
                        const sId = typeof l.source === 'string' ? l.source : l.source.id;
                        const tId = typeof l.target === 'string' ? l.target : l.target.id;
                        return isEntitySeedMatch(seedNorm, sId) || isEntitySeedMatch(seedNorm, tId);
                    })
                        .map((l) => {
                        const sId = typeof l.source === 'string' ? l.source : l.source.id;
                        const tId = typeof l.target === 'string' ? l.target : l.target.id;
                        const otherId = isEntitySeedMatch(seedNorm, sId) ? tId : sId;
                        return (finalGraph.nodes || []).find((n) => isEntitySeedMatch(otherId, n.id));
                    })
                        .filter((n) => n && n.type === 'country')
                        .map((n) => n.label || n.id);
                    let countryNorm = "";
                    if (seedDetails?.details?.origin) {
                        countryNorm = (0, curatorService_1.extractCountrySlug)(seedDetails.details.origin);
                    }
                    if (!countryNorm && connectedCountries.length > 0) {
                        countryNorm = (0, curatorService_1.extractCountrySlug)(connectedCountries[0]);
                    }
                    if (!countryNorm)
                        countryNorm = "global";
                    const disambiguatedCanonicalId = seedNorm.endsWith(`-${countryNorm}`) ? seedNorm : `${seedNorm}-${countryNorm}`;
                    const compositeCanonicalId = (0, curatorService_1.buildCompositeCacheKey)(disambiguatedCanonicalId, inputPayload.filters || undefined);
                    idRewriteMap.set(seedNorm, compositeCanonicalId);
                    if (seedDetailsEntry)
                        seedDetailsEntry[0] = compositeCanonicalId;
                    if (!isSeedLabel && !finalGraph.synthesisRationale && seedDetails?.synthesisRationale) {
                        finalGraph.synthesisRationale = seedDetails.synthesisRationale;
                    }
                    // ─── INTEGRITY LOCK § Phase A: Staging Write ─────────────────────────
                    // Before touching any data, check if the document already has a verified
                    // gold-standard record. If so, skip the staging write entirely to protect
                    // existing production data from being clobbered by a re-triggered job.
                    const existingDocSnap = await db.collection(collName).doc(compositeCanonicalId).get();
                    const existingDocData = existingDocSnap.exists ? existingDocSnap.data() : null;
                    const isAlreadyVerified = existingDocData?.dataIntegrityStatus === 'verified' && existingDocData?.isDeep === true;
                    if (isSandboxMode) {
                        console.log(`[Sandbox Mode] Bypassing Phase A global staging write for bespoke topology.`);
                    }
                    else if (isAlreadyVerified) {
                        console.log(`[Integrity Lock] Skipping staging write for ${compositeCanonicalId} — already verified gold-standard record. Re-using existing data.`);
                    }
                    else {
                        // Write in_progress staging placeholder so clients treat this doc as a cache miss
                        // while hydration is running. integrityLockedAt enables the 15-minute stale-lock
                        // fallback in the client's isCacheDocumentVerified() helper.
                        await db.collection(collName).doc(compositeCanonicalId).set({
                            cacheKey: compositeCanonicalId,
                            [idFieldKey]: seedNorm,
                            seedArtists: seed,
                            cacheVersion: 4,
                            cachedAt: firestore_2.FieldValue.serverTimestamp(),
                            isDeep: false,
                            dataIntegrityStatus: 'in_progress',
                            integrityLockedAt: new Date().toISOString(),
                        }, { merge: true });
                        console.log(`[Integrity Lock] Wrote in_progress staging placeholder for seed (${collName}): ${compositeCanonicalId}`);
                    }
                    // ─── INTEGRITY LOCK § Phase B: Fatal Seed Validation ─────────────────
                    // For primary seeds, schema validation is FATAL. A missing or corrupt
                    // detailsCache means the dataset cannot be sealed as verified. The outer
                    // catch block will mark the job as 'failed' and update the staging doc.
                    // REGRESSION PREVENTION: Do NOT revert this to a non-fatal warning-only
                    // check. Previously, validation failures were swallowed and corrupt seed
                    // docs were written to Firestore as gold-standard, polluting global reads.
                    if (!isSeedLabel) {
                        try {
                            validateArtistDetailsSchema(seedNorm, seedDetails);
                        }
                        catch (validationErr) {
                            // Mark the staging doc as failed so clients skip it
                            await db.collection(collName).doc(compositeCanonicalId).update({
                                dataIntegrityStatus: 'failed',
                                errorMessage: `Fatal seed validation: ${validationErr.message}`,
                                updatedAt: firestore_2.FieldValue.serverTimestamp(),
                            }).catch(() => { }); // Best-effort; the job throw below is what matters
                            throw new Error(`[Integrity Lock] Fatal seed schema validation failed for "${seedNorm}": ${validationErr.message}`);
                        }
                    }
                    else if (!seedDetails) {
                        console.warn(`[Curation Backend] Seed label missing detailsCache for "${seedNorm}" — proceeding to write bare pointer only.`);
                    }
                    // ─── INTEGRITY LOCK § Phase C: Atomic Verified Final Write ───────────
                    // ALL hydration data has been assembled and validated. Replace the staging
                    // doc in a single atomic set() that simultaneously writes the complete
                    // payload and seals dataIntegrityStatus: 'verified'. No partial state
                    // ever reaches 'verified'. The integrityLockedAt field is intentionally
                    // absent from this write — it only exists on in_progress staging docs.
                    if (isSandboxMode) {
                        console.log(`[Sandbox Mode] Bypassing Phase C global verified write and bare pointer for bespoke topology.`);
                    }
                    else {
                        // Fetch existing document to safely merge detailsCache if seedDetails is missing
                        const existingDoc = await db.collection(collName).doc(compositeCanonicalId).get();
                        const existingData = existingDoc.exists ? existingDoc.data() : null;
                        const finalDetailsCache = seedDetails
                            ? (isSeedLabel ? sanitizeLabelProfile(seedDetails) : sanitizeUndefinedProperties(seedDetails))
                            : (existingData?.detailsCache || null);
                        // Extract the canonical subgraph for this specific seed to prevent multi-seed ghost data
                        const extractedGraph = isSeedLabel ? null : (0, curatorService_1.extractArtistSubGraph)(seedNorm, finalGraph, artistList);
                        await db.collection(collName).doc(compositeCanonicalId).set({
                            cacheKey: compositeCanonicalId,
                            [idFieldKey]: seedNorm,
                            seedArtists: seed,
                            graphData: extractedGraph ? JSON.stringify(extractedGraph) : null,
                            detailsCache: finalDetailsCache,
                            filters: inputPayload.filters || null,
                            cacheVersion: 4,
                            cachedAt: firestore_2.FieldValue.serverTimestamp(),
                            isDeep: true,
                            isPrimarySeed: true,
                            hasUniqueSpiderweb: !isSeedLabel,
                            dataIntegrityStatus: seedDetails?._isStub ? 'degraded' : 'verified', // ← COMPLETION SEAL
                        });
                        console.log(`[Integrity Lock] ✅ Atomic verified write complete for seed (${collName}): ${compositeCanonicalId}`);
                        // Create/Heal Bare Root Alias Pointer
                        const bareArtistIdRef = db.collection(collName).doc(seedNorm);
                        const bareSnap = await bareArtistIdRef.get();
                        const bareData = bareSnap.exists ? bareSnap.data() : null;
                        if (!bareSnap.exists || (bareData && !bareData.redirectTo && bareSnap.id !== compositeCanonicalId)) {
                            await bareArtistIdRef.set({
                                cacheKey: seedNorm,
                                [idFieldKey]: seedNorm,
                                seedArtists: seed,
                                cacheVersion: 4,
                                cachedAt: firestore_2.FieldValue.serverTimestamp(),
                                redirectTo: compositeCanonicalId
                            });
                            console.log(`[Curation Backend] Created Bare Alias Pointer in ${collName}: ${seedNorm} -> ${compositeCanonicalId}`);
                        }
                    }
                }
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
                    const recDetailsEntry = detailsCacheEntries.find(entry => isEntitySeedMatch(recNorm, entry[0]));
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
                    // Find connected country nodes in finalGraph
                    const connectedCountries = (finalGraph.links || [])
                        .filter((l) => {
                        const sId = typeof l.source === 'string' ? l.source : l.source.id;
                        const tId = typeof l.target === 'string' ? l.target : l.target.id;
                        return isEntitySeedMatch(recNorm, sId) || isEntitySeedMatch(recNorm, tId);
                    })
                        .map((l) => {
                        const sId = typeof l.source === 'string' ? l.source : l.source.id;
                        const tId = typeof l.target === 'string' ? l.target : l.target.id;
                        const otherId = isEntitySeedMatch(recNorm, sId) ? tId : sId;
                        return (finalGraph.nodes || []).find((n) => isEntitySeedMatch(otherId, n.id));
                    })
                        .filter((n) => n && n.type === 'country')
                        .map((n) => n.label || n.id);
                    let countryNorm = "";
                    if (recDetails?.details?.origin) {
                        countryNorm = (0, curatorService_1.extractCountrySlug)(recDetails.details.origin);
                    }
                    if (!countryNorm && connectedCountries.length > 0) {
                        countryNorm = (0, curatorService_1.extractCountrySlug)(connectedCountries[0]);
                    }
                    if (!countryNorm)
                        countryNorm = "global";
                    const disambiguatedCanonicalId = recNorm.endsWith(`-${countryNorm}`) ? recNorm : `${recNorm}-${countryNorm}`;
                    const compositeCanonicalId = (0, curatorService_1.buildCompositeCacheKey)(disambiguatedCanonicalId, inputPayload.filters || undefined);
                    idRewriteMap.set(recNorm, compositeCanonicalId);
                    if (recDetailsEntry)
                        recDetailsEntry[0] = compositeCanonicalId;
                    if (isSandboxMode) {
                        console.log(`[Sandbox Mode] Bypassing global cache writes for recommendation (${collName}): ${compositeCanonicalId}`);
                    }
                    else {
                        const recDocRef = db.collection(collName).doc(compositeCanonicalId);
                        const recSnap = await recDocRef.get();
                        if (!recSnap.exists) {
                            await recDocRef.set({
                                cacheKey: compositeCanonicalId,
                                [idFieldKey]: recNorm,
                                seedArtists: recArtist,
                                graphData: null,
                                detailsCache: isLabel ? sanitizeLabelProfile(recDetails) : sanitizeUndefinedProperties(recDetails), // Save as structured object!
                                filters: null, // Note: active filters are not strictly carried for proactive rec entries unless we explicitly want to
                                cacheVersion: 4,
                                cachedAt: firestore_2.FieldValue.serverTimestamp(),
                                isDeep: true, // Marked Deep!
                                isPrimarySeed: false,
                                hasUniqueSpiderweb: false,
                            });
                            console.log(`[Curation Backend] Proactively created DEEP entry for recommendation (${collName}): ${compositeCanonicalId}`);
                        }
                        else {
                            const updatePayload = {
                                detailsCache: isLabel ? sanitizeLabelProfile(recDetails) : sanitizeUndefinedProperties(recDetails),
                                cachedAt: firestore_2.FieldValue.serverTimestamp(),
                                cacheVersion: 4,
                                [idFieldKey]: recNorm,
                                cacheKey: compositeCanonicalId,
                                isDeep: true
                            };
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
//# sourceMappingURL=onCurationJobCreated.js.map