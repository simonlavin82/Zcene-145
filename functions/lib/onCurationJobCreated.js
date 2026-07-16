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
    if (!genre || typeof genre !== 'string' || genre.trim().length === 0) {
        throw new Error(`[Schema Sanity Check] detailsCache.details is missing genre for artist: ${artistId}`);
    }
    if (!origin || typeof origin !== 'string' || origin.trim().length === 0) {
        throw new Error(`[Schema Sanity Check] detailsCache.details is missing origin for artist: ${artistId}`);
    }
    if (!founded || typeof founded !== 'string' || founded.trim().length === 0) {
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
    secrets: ["GEMINI_API_KEY"]
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
                const finalGraph = await (0, curatorService_1.generateGraphDataBackend)(inputPayload.artists, inputPayload.filters, inputPayload.cachedSubgraphsContext, inputPayload.baseGraph);
                // Parse seed artists list
                const artistList = inputPayload.artists
                    .split('::')
                    .map((a) => a.trim())
                    .filter(Boolean);
                // Gather all artist nodes in the final graph (both seeds and recommendations)
                const recommendedArtists = finalGraph.nodes
                    .filter(n => n.type === 'artist')
                    .map(n => n.id);
                console.log(`[Curation Backend] Hydrating details for ${recommendedArtists.length} artists in the graph:`, recommendedArtists);
                const detailsCacheEntries = [];
                // Fetch details for each artist sequentially with 200ms delay to prevent rate limiting
                for (let i = 0; i < recommendedArtists.length; i++) {
                    const artistName = recommendedArtists[i];
                    const artistNormId = (0, curatorService_1.normalizeArtistId)(artistName);
                    // 1. Check local Firestore Cache first
                    let details = null;
                    try {
                        const cacheDoc = await db.collection("artists").doc(artistNormId).get();
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
                        try {
                            if (i > 0) {
                                // 200ms rate-limit backoff delay between sequential calls
                                await new Promise(resolve => setTimeout(resolve, 200));
                            }
                            console.log(`[Curation Backend] Cache miss. Hydrating details for: ${artistName} (${i + 1}/${recommendedArtists.length})...`);
                            const tempNode = { id: artistName, type: 'artist', group: 1 };
                            details = await (0, curatorService_1.fetchNodeDetailsBackend)(tempNode, finalGraph, inputPayload.artists);
                            // 3. Scrape YouTube and validate video ID
                            if (details.youtubeVideoId) {
                                const playable = await (0, curatorService_1.checkVideoPlayability)(details.youtubeVideoId);
                                if (!playable) {
                                    details.youtubeVideoId = null;
                                }
                            }
                            else if (details.youtubeSearchQuery) {
                                const scrapedId = await (0, curatorService_1.scrapeVideoIdBackend)(artistName, artistNormId);
                                if (scrapedId) {
                                    const playable = await (0, curatorService_1.checkVideoPlayability)(scrapedId);
                                    if (playable) {
                                        details.youtubeVideoId = scrapedId;
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
                        catch (hydrErr) {
                            console.error(`[Curation Backend] Hydration failed for: ${artistNormId}. Using sentinel fallback.`, hydrErr);
                            details = {
                                summary: `Failed to curate details for ${artistName}.`,
                                details: { artist: artistName, genre: "", origin: "", founded: "", notableArtists: [] },
                                members: [],
                                links: [],
                                discography: [],
                                recommendationReason: "",
                            };
                        }
                    }
                    detailsCacheEntries.push([artistName, details]);
                }
                // Write-back cache entries for the seed artists (deep cache: isDeep: true)
                for (const seed of artistList) {
                    const seedNorm = (0, curatorService_1.normalizeArtistId)(seed);
                    const seedDetailsEntry = detailsCacheEntries.find(entry => (0, curatorService_1.normalizeArtistId)(entry[0]) === seedNorm);
                    const seedDetails = seedDetailsEntry ? seedDetailsEntry[1] : null;
                    // Run Sanity Check
                    validateArtistDetailsSchema(seedNorm, seedDetails);
                    await db.collection("artists").doc(seedNorm).set({
                        cacheKey: seedNorm,
                        artistId: seedNorm,
                        seedArtists: seed,
                        graphData: JSON.stringify(finalGraph),
                        detailsCache: sanitizeUndefinedProperties(seedDetails), // Save as structured object!
                        filters: inputPayload.filters || null,
                        cacheVersion: 2,
                        cachedAt: firestore_2.FieldValue.serverTimestamp(),
                        hitCount: 0,
                        isDeep: true, // Marked Deep!
                        synthesisRationale: finalGraph.synthesisRationale || null
                    });
                    console.log(`[Curation Backend] Wrote DEEP global cache for seed: ${seedNorm}`);
                }
                // Proactively cache each recommended artist as a deep cache entry as well!
                const seedNorms = new Set(artistList.map((a) => (0, curatorService_1.normalizeArtistId)(a)));
                for (const recArtist of recommendedArtists) {
                    if (seedNorms.has((0, curatorService_1.normalizeArtistId)(recArtist)))
                        continue; // Already seeds
                    const recNorm = (0, curatorService_1.normalizeArtistId)(recArtist);
                    const recDetailsEntry = detailsCacheEntries.find(entry => (0, curatorService_1.normalizeArtistId)(entry[0]) === recNorm);
                    const recDetails = recDetailsEntry ? recDetailsEntry[1] : null;
                    // Run Sanity Check
                    validateArtistDetailsSchema(recNorm, recDetails);
                    await db.collection("artists").doc(recNorm).set({
                        cacheKey: recNorm,
                        artistId: recNorm,
                        seedArtists: recArtist,
                        graphData: JSON.stringify(finalGraph),
                        detailsCache: sanitizeUndefinedProperties(recDetails), // Save as structured object!
                        filters: null,
                        cacheVersion: 2,
                        cachedAt: firestore_2.FieldValue.serverTimestamp(),
                        hitCount: 0,
                        isDeep: true, // Marked Deep!
                        synthesisRationale: null
                    });
                    console.log(`[Curation Backend] Proactively cached DEEP entry for recommendation: ${recNorm}`);
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
        // Complete job
        await jobDocRef.update({
            status: "completed",
            result,
            updatedAt: firestore_2.FieldValue.serverTimestamp(),
            completedAt: firestore_2.FieldValue.serverTimestamp()
        });
        console.log(`[Curation Backend] Successfully completed job ${jobId}`);
        if (inputPayload?.projectId && jobData.userId && result?.graphData) {
            const graphObj = typeof result.graphData === 'string' ? JSON.parse(result.graphData) : result.graphData;
            const artistIds = graphObj.nodes
                ? graphObj.nodes.filter((n) => n.type === 'artist').map((n) => (0, curatorService_1.normalizeArtistId)(n.id))
                : [];
            await updateProjectStatus(jobData.userId, inputPayload.projectId, {
                status: "completed",
                graphData: JSON.stringify(result.graphData),
                artistIds: artistIds,
                activeJobId: null
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
            completedAt: firestore_2.FieldValue.serverTimestamp()
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