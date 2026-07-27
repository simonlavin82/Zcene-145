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
            if (val !== undefined) {
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
            const isEmulator = process.env.FUNCTIONS_EMULATOR === "true";
            const isMissingApiKey = !process.env.GEMINI_API_KEY;
            const forceMocks = inputPayload?.useMocks === true;
            if (isEmulator || isMissingApiKey || forceMocks) {
                console.log(`[Curation Backend] Mock conditions met. Emulator: ${isEmulator}, No Key: ${isMissingApiKey}, Force Mocks: ${forceMocks}. Running simulated mock.`);
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
                        synthesisRationale: "Skeleton rationale. Real-time background curation running on backend."
                    },
                    detailsCache: JSON.stringify(mockDetails)
                };
            }
            else {
                console.log("[Curation Backend] Executing live Gemini AI graph synthesis...");
                // Run backend curation synthesis
                const finalGraph = await (0, curatorService_1.generateGraphDataBackend)(inputPayload.artists, inputPayload.filters, inputPayload.cachedSubgraphsContext, inputPayload.baseGraph, inputPayload.disambiguationHints);
                // Structural Integrity Guard: Verify that we received a valid, rich graph from the model
                const artistNodesCount = finalGraph.nodes?.filter(n => n.type === 'artist' || !n.type).length || 0;
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
                console.log(`[Curation Backend] Hydrating details for ${recommendedEntities.length} entities in the graph:`, recommendedEntities.map((e) => `${e.name} (${e.type})`));
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
                        // 2. Fetch from Gemini if cache miss
                        if (!details) {
                            if (idx > 0) {
                                // Stagger concurrent requests by 150ms to prevent rate limiting
                                await new Promise(resolve => setTimeout(resolve, idx * 150));
                            }
                            console.log(`[Curation Backend] Cache miss. Hydrating details for ${isLabel ? 'label' : 'artist'}: ${artistName}...`);
                            const tempNode = { id: artistName, type: entityObj.type, group: 1 };
                            // Change 2 — Per-node transient retry with 2-second backoff.
                            // Only retries on transient API errors (429, 503, Resource Exhausted, Service Unavailable).
                            // Does NOT retry on JSON parse failures or schema validation errors (deterministic failures).
                            const isTransientError = (err) => {
                                const msg = (err?.message || String(err)).toLowerCase();
                                return /429|503|resource.?exhausted|service.?unavailable|too many requests/i.test(msg);
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
                                        console.error(`[Curation Backend] Retry also failed for: ${artistNormId}. Skipping.`, retryErr.message);
                                        return null;
                                    }
                                }
                                else {
                                    console.error(`[Curation Backend] Hydration failed (non-transient) for: ${artistNormId}. Skipping.`, firstErr.message);
                                    return null;
                                }
                            }
                            if (details) {
                                // 3. Scrape YouTube and validate video ID (only for artists; labels do not have music videos)
                                if (!isLabel) {
                                    if (details.youtubeVideoId) {
                                        const playable = await (0, curatorService_1.checkVideoPlayability)(details.youtubeVideoId);
                                        if (!playable) {
                                            details.youtubeVideoId = null;
                                        }
                                    }
                                    if (!details.youtubeVideoId && details.youtubeSearchQuery) {
                                        const scrapedId = await (0, curatorService_1.scrapeVideoIdBackend)(artistName, artistNormId);
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
                                details.details.artist = details.details.artist || artistName;
                                if (!details.synthesisRationale) {
                                    details.synthesisRationale = `[Single-Seed Analysis]\n- Acoustic & Sonics: Resolved core musical properties and stylistic lineage.\n- Scene Context: Mapped direct influences, record label history, and geographic background.\n- Overlap Insights: Unified structural connections and surrounding chronological relationships.`;
                                }
                                console.log(`[Curation Backend] Hydration successful for: ${artistNormId}`);
                            }
                        }
                        return [artistName, details];
                    }));
                    for (const res of chunkResults) {
                        if (res) {
                            detailsCacheEntries.push(res);
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
                // Write-back cache entries for the seed entities (deep cache: isDeep: true)
                for (const seed of artistList) {
                    const seedNorm = (0, curatorService_1.normalizeArtistId)(seed);
                    const seedNode = (finalGraph.nodes || []).find((n) => isEntitySeedMatch(seedNorm, n.id) || isEntitySeedMatch(seedNorm, n.label || ''));
                    const isSeedLabel = seedNode?.type === 'label';
                    const collName = isSeedLabel ? "labels" : "artists";
                    const idFieldKey = isSeedLabel ? "labelId" : "artistId";
                    const seedDetailsEntry = detailsCacheEntries.find(entry => isEntitySeedMatch(seedNorm, entry[0]));
                    const seedDetails = seedDetailsEntry ? seedDetailsEntry[1] : null;
                    // Run Sanity Check — non-fatal: log and skip this seed's cache write rather than aborting the entire job
                    try {
                        if (!isSeedLabel) {
                            validateArtistDetailsSchema(seedNorm, seedDetails);
                        }
                        else if (!seedDetails) {
                            console.warn(`[Curation Backend] Seed label cache write skipped for "${seedNorm}" — missing detailsCache.`);
                            continue;
                        }
                    }
                    catch (validationErr) {
                        console.warn(`[Curation Backend] Seed cache write skipped for "${seedNorm}" — schema validation failed: ${validationErr.message}`);
                        continue;
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
                    if (connectedCountries.length > 0) {
                        countryNorm = (0, curatorService_1.extractCountrySlug)(connectedCountries[0]);
                    }
                    else if (seedDetails?.details?.origin) {
                        countryNorm = (0, curatorService_1.extractCountrySlug)(seedDetails.details.origin);
                    }
                    if (!countryNorm)
                        countryNorm = "global";
                    const disambiguatedCanonicalId = seedNorm.endsWith(`-${countryNorm}`) ? seedNorm : `${seedNorm}-${countryNorm}`;
                    const compositeCanonicalId = (0, curatorService_1.buildCompositeCacheKey)(disambiguatedCanonicalId, inputPayload.filters || undefined);
                    await db.collection(collName).doc(compositeCanonicalId).set({
                        cacheKey: compositeCanonicalId,
                        [idFieldKey]: seedNorm,
                        seedArtists: seed,
                        graphData: isSeedLabel ? null : JSON.stringify(finalGraph),
                        detailsCache: isSeedLabel ? sanitizeLabelProfile(seedDetails) : sanitizeUndefinedProperties(seedDetails), // Save as structured object!
                        filters: inputPayload.filters || null,
                        cacheVersion: 2,
                        cachedAt: firestore_2.FieldValue.serverTimestamp(),
                        hitCount: 0,
                        isDeep: true, // Marked Deep!
                        isPrimarySeed: true,
                        hasUniqueSpiderweb: !isSeedLabel,
                        synthesisRationale: finalGraph.synthesisRationale || null
                    });
                    console.log(`[Curation Backend] Wrote DEEP global cache for seed (${collName}): ${compositeCanonicalId}`);
                    // Create/Heal Bare Root Alias Pointer
                    const bareArtistIdRef = db.collection(collName).doc(seedNorm);
                    const bareSnap = await bareArtistIdRef.get();
                    const bareData = bareSnap.exists ? bareSnap.data() : null;
                    if (!bareSnap.exists || (bareData && !bareData.redirectTo && bareSnap.id !== compositeCanonicalId)) {
                        await bareArtistIdRef.set({
                            cacheKey: seedNorm,
                            [idFieldKey]: seedNorm,
                            seedArtists: seed,
                            graphData: isSeedLabel ? null : JSON.stringify({ nodes: [], links: [] }),
                            filters: {},
                            cacheVersion: 2,
                            cachedAt: firestore_2.FieldValue.serverTimestamp(),
                            hitCount: 0,
                            redirectTo: compositeCanonicalId
                        });
                        console.log(`[Curation Backend] Created Bare Alias Pointer in ${collName}: ${seedNorm} -> ${compositeCanonicalId}`);
                    }
                }
                // Proactively cache each recommended entity (artist or label) as a deep cache entry as well!
                const seedNorms = artistList.map((a) => (0, curatorService_1.normalizeArtistId)(a));
                for (const entityObj of recommendedEntities) {
                    const recArtist = entityObj.name;
                    const recNorm = (0, curatorService_1.normalizeArtistId)(recArtist);
                    const isLabel = entityObj.type === 'label';
                    if (seedNorms.some((s) => isEntitySeedMatch(s, recNorm)))
                        continue; // Already seeds
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
                    if (connectedCountries.length > 0) {
                        countryNorm = (0, curatorService_1.extractCountrySlug)(connectedCountries[0]);
                    }
                    else if (recDetails?.details?.origin) {
                        countryNorm = (0, curatorService_1.extractCountrySlug)(recDetails.details.origin);
                    }
                    if (!countryNorm)
                        countryNorm = "global";
                    const disambiguatedCanonicalId = recNorm.endsWith(`-${countryNorm}`) ? recNorm : `${recNorm}-${countryNorm}`;
                    const compositeCanonicalId = (0, curatorService_1.buildCompositeCacheKey)(disambiguatedCanonicalId, inputPayload.filters || undefined);
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
                            cacheVersion: 2,
                            cachedAt: firestore_2.FieldValue.serverTimestamp(),
                            hitCount: 0,
                            isDeep: true, // Marked Deep!
                            isPrimarySeed: false,
                            hasUniqueSpiderweb: false,
                            synthesisRationale: null
                        });
                        console.log(`[Curation Backend] Proactively created DEEP entry for recommendation (${collName}): ${compositeCanonicalId}`);
                    }
                    else {
                        const updatePayload = {
                            detailsCache: isLabel ? sanitizeLabelProfile(recDetails) : sanitizeUndefinedProperties(recDetails),
                            cachedAt: firestore_2.FieldValue.serverTimestamp(),
                            cacheVersion: 2,
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
                        detailsCache: isLabel ? sanitizeLabelProfile(recDetails) : sanitizeUndefinedProperties(recDetails),
                        cacheVersion: 2,
                        cachedAt: firestore_2.FieldValue.serverTimestamp(),
                        redirectTo: compositeCanonicalId
                    };
                    if (!bareSnap.exists) {
                        barePayload.graphData = isLabel ? null : JSON.stringify({ nodes: [], links: [] });
                        barePayload.filters = {};
                        barePayload.hitCount = 0;
                        await bareArtistIdRef.set(sanitizeUndefinedProperties(barePayload));
                        console.log(`[Curation Backend] Created Bare Alias Pointer & detailsCache in ${collName}: ${recNorm} -> ${compositeCanonicalId}`);
                    }
                    else {
                        await bareArtistIdRef.update(sanitizeUndefinedProperties(barePayload)).catch(() => { });
                        console.log(`[Curation Backend] Updated Bare Alias Pointer & detailsCache in ${collName}: ${recNorm} -> ${compositeCanonicalId}`);
                    }
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
            const allEntityIds = graphObj.nodes
                ? graphObj.nodes.filter((n) => n.type === 'artist' || n.type === 'label' || !n.type).map((n) => (0, curatorService_1.normalizeArtistId)(n.id))
                : [];
            await updateProjectStatus(jobData.userId, inputPayload.projectId, {
                status: "completed",
                graphData: JSON.stringify(result.graphData),
                artistIds: artistEntityIds,
                labelIds: labelEntityIds,
                activeNodes: allEntityIds, // Native bulk queue population (both artists and labels)!
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