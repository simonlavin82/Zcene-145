import { onDocumentCreated } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { translateError } from "./services/errorTranslationLayer";
import {
  generateGraphDataBackend,
  normalizeArtistId,
  extractArtistSubGraph
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
        
        result = {
          graphData: {
            nodes: [
              { id: "Skeleton Node", type: "artist", group: 1 }
            ],
            links: [],
            synthesisRationale: "Skeleton rationale. Real-time background curation running on backend."
          }
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

        // Write-back sub-graphs to the global /artists cache collection
        for (const seed of artistList) {
          const seedNorm = normalizeArtistId(seed);
          const { nodes: subNodes, links: subLinks } = extractArtistSubGraph(seed, finalGraph, artistList);
          
          await db.collection("artists").doc(seedNorm).set({
            cacheKey: seedNorm,
            artistId: seedNorm,
            seedArtists: seed,
            graphData: JSON.stringify({ nodes: subNodes, links: subLinks }),
            filters: inputPayload.filters || null,
            cacheVersion: 2,
            cachedAt: FieldValue.serverTimestamp(),
            hitCount: 0,
            isDeep: false,
            synthesisRationale: finalGraph.synthesisRationale || null
          });
          
          console.log(`[Curation Backend] Wrote global cache for seed: ${seedNorm}`);
        }

        result = { graphData: finalGraph };
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
