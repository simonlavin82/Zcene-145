"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.onCurationJobCreated = void 0;
const firestore_1 = require("firebase-functions/v2/firestore");
const admin = __importStar(require("firebase-admin"));
const firestore_2 = require("firebase-admin/firestore");
const errorTranslationLayer_1 = require("./services/errorTranslationLayer");
const curatorService_1 = require("./services/curatorService");
// Initialize Firebase Admin SDK if not already done
if (admin.apps.length === 0) {
    admin.initializeApp();
}
const db = admin.firestore();
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
    try {
        const { jobType, inputPayload } = jobData;
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
                            if (cacheData && cacheData.isDeep && cacheData.detailsCache) {
                                // Parse out the details for this specific artist from the cache
                                const parsedCache = JSON.parse(cacheData.detailsCache);
                                const match = parsedCache.find((item) => (0, curatorService_1.normalizeArtistId)(item[0]) === artistNormId);
                                if (match && match[1] && match[1].summary && match[1].summary.length > 50) {
                                    details = match[1];
                                    console.log(`[Curation Backend] Direct cache hit for details of: ${artistNormId}`);
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
                    const { nodes: subNodes, links: subLinks } = (0, curatorService_1.extractArtistSubGraph)(seed, finalGraph, artistList);
                    await db.collection("artists").doc(seedNorm).set({
                        cacheKey: seedNorm,
                        artistId: seedNorm,
                        seedArtists: seed,
                        graphData: JSON.stringify({ nodes: subNodes, links: subLinks }),
                        detailsCache: JSON.stringify(detailsCacheEntries),
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
                    const { nodes: subNodes, links: subLinks } = (0, curatorService_1.extractArtistSubGraph)(recArtist, finalGraph, artistList);
                    await db.collection("artists").doc(recNorm).set({
                        cacheKey: recNorm,
                        artistId: recNorm,
                        seedArtists: recArtist,
                        graphData: JSON.stringify({ nodes: subNodes, links: subLinks }),
                        detailsCache: JSON.stringify(detailsCacheEntries),
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
    }
});
//# sourceMappingURL=onCurationJobCreated.js.map