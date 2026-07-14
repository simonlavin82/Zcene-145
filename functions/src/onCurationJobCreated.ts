import { onDocumentCreated } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { translateError } from "./services/errorTranslationLayer";
import {
  generateGraphDataBackend,
  normalizeArtistId,
  extractArtistSubGraph,
  fetchNodeDetailsBackend,
  scrapeVideoIdBackend,
  checkVideoPlayability
} from "./services/curatorService";

// Initialize Firebase Admin SDK if not already done
if (admin.apps.length === 0) {
  admin.initializeApp();
}

const db = admin.firestore();

export const onCurationJobCreated = onDocumentCreated({
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
    updatedAt: FieldValue.serverTimestamp()
  });

  try {
    const { jobType, inputPayload } = jobData;
    console.log(`[Curation Backend] Executing ${jobType} for user ${jobData.userId} with payload:`, inputPayload);

    let result: any = null;

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
      } else {
        console.log("[Curation Backend] Executing live Gemini AI graph synthesis...");
        
        // Run backend curation synthesis
        const finalGraph = await generateGraphDataBackend(
          inputPayload.artists,
          inputPayload.filters,
          inputPayload.cachedSubgraphsContext,
          inputPayload.baseGraph
        );

        // Parse seed artists list
        const artistList = inputPayload.artists
          .split('::')
          .map((a: string) => a.trim())
          .filter(Boolean);

        // Gather all artist nodes in the final graph (both seeds and recommendations)
        const recommendedArtists = finalGraph.nodes
          .filter(n => n.type === 'artist')
          .map(n => n.id);

        console.log(`[Curation Backend] Hydrating details for ${recommendedArtists.length} artists in the graph:`, recommendedArtists);

        const detailsCacheEntries: [string, any][] = [];

        // Fetch details for each artist sequentially with 200ms delay to prevent rate limiting
        for (let i = 0; i < recommendedArtists.length; i++) {
          const artistName = recommendedArtists[i];
          const artistNormId = normalizeArtistId(artistName);

          // 1. Check local Firestore Cache first
          let details: any = null;
          try {
            const cacheDoc = await db.collection("artists").doc(artistNormId).get();
            if (cacheDoc.exists) {
              const cacheData = cacheDoc.data();
              if (cacheData && cacheData.isDeep && cacheData.detailsCache) {
                // Parse out the details for this specific artist from the cache
                const parsedCache = JSON.parse(cacheData.detailsCache);
                const match = parsedCache.find((item: any) => normalizeArtistId(item[0]) === artistNormId);
                if (match && match[1] && match[1].summary && match[1].summary.length > 50) {
                  details = match[1];
                  console.log(`[Curation Backend] Direct cache hit for details of: ${artistNormId}`);
                }
              }
            }
          } catch (cacheErr) {
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
              const tempNode = { id: artistName, type: 'artist' as const, group: 1 };
              details = await fetchNodeDetailsBackend(tempNode, finalGraph, inputPayload.artists);

              // 3. Scrape YouTube and validate video ID
              if (details.youtubeVideoId) {
                const playable = await checkVideoPlayability(details.youtubeVideoId);
                if (!playable) {
                  details.youtubeVideoId = null;
                }
              } else if (details.youtubeSearchQuery) {
                const scrapedId = await scrapeVideoIdBackend(artistName, artistNormId);
                if (scrapedId) {
                  const playable = await checkVideoPlayability(scrapedId);
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
            } catch (hydrErr) {
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
          const seedNorm = normalizeArtistId(seed);
          const { nodes: subNodes, links: subLinks } = extractArtistSubGraph(seed, finalGraph, artistList);
          
          await db.collection("artists").doc(seedNorm).set({
            cacheKey: seedNorm,
            artistId: seedNorm,
            seedArtists: seed,
            graphData: JSON.stringify({ nodes: subNodes, links: subLinks }),
            detailsCache: JSON.stringify(detailsCacheEntries),
            filters: inputPayload.filters || null,
            cacheVersion: 2,
            cachedAt: FieldValue.serverTimestamp(),
            hitCount: 0,
            isDeep: true, // Marked Deep!
            synthesisRationale: finalGraph.synthesisRationale || null
          });
          
          console.log(`[Curation Backend] Wrote DEEP global cache for seed: ${seedNorm}`);
        }

        // Proactively cache each recommended artist as a deep cache entry as well!
        const seedNorms = new Set(artistList.map((a: string) => normalizeArtistId(a)));
        for (const recArtist of recommendedArtists) {
          if (seedNorms.has(normalizeArtistId(recArtist))) continue; // Already seeds
          
          const recNorm = normalizeArtistId(recArtist);
          const { nodes: subNodes, links: subLinks } = extractArtistSubGraph(recArtist, finalGraph, artistList);
          
          await db.collection("artists").doc(recNorm).set({
            cacheKey: recNorm,
            artistId: recNorm,
            seedArtists: recArtist,
            graphData: JSON.stringify({ nodes: subNodes, links: subLinks }),
            detailsCache: JSON.stringify(detailsCacheEntries),
            filters: null,
            cacheVersion: 2,
            cachedAt: FieldValue.serverTimestamp(),
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
    } else {
      throw new Error(`Unsupported jobType: ${jobType}`);
    }

    // Complete job
    await jobDocRef.update({
      status: "completed",
      result,
      updatedAt: FieldValue.serverTimestamp(),
      completedAt: FieldValue.serverTimestamp()
    });
    console.log(`[Curation Backend] Successfully completed job ${jobId}`);

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
      completedAt: FieldValue.serverTimestamp()
    });
  }
});
