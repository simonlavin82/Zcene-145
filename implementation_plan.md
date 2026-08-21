# Clean Slate Architecture: End-to-End Curation Pipeline

We are completely replacing the legacy `processCurationJob` (Firestore-triggered background function) and its brittle `setDoc` -> `onSnapshot` frontend polling system with a **direct, clean HTTPS Callable Cloud Function** (`executeCurationPipeline`).

This bypasses all legacy proxy hacks (no more Vite routing issues, no CORS headaches, no silent serialization crashes) by enabling the frontend to securely trigger the backend execution directly, passing the payload, and awaiting the resolved `GraphData` in a single promise.

## User Review Required

> [!WARNING]
> This plan will deprecate `processCurationJob` and replace it with a Gen2 Firebase Callable Function. The frontend trigger `generateGraphDataViaCloudJob` will be rewritten to use the Firebase SDK's `httpsCallable`, eliminating the need to write to the `curationJobs` collection. Please confirm this architectural shift aligns with your vision.

## Proposed Changes

### Backend - Cloud Functions
#### [NEW] `functions/src/executeCurationPipeline.ts`
We will create a clean-room modular function utilizing Gemini 3.5 Flash-Lite and Gemini 3.1 Pro via the `@google/genai` SDK directly in the backend. 
- **Step 1: Cache Lookup:** Perform `O(1)` query against the global `artists` cache.
- **Step 2: Origin Validation (Flash-Lite):** Any cache miss hits Flash-Lite for origin validation and resolving the seed array.
- **Step 3: Topology Generation (3.1 Pro):** Multi-seed requests or cache misses are passed to 3.1 Pro to mint the unified spiderweb topology.
- **Step 4: Deep Cuts & Positioning (3.1 Pro):** Iterate missing deep cuts, perform structural positioning, and synthesize the Roots Breakdown.
- **Step 5: Logging:** Inject explicit `console.log("[Pipeline Diamond] -> ...")` trace statements at every flowchart decision point.

#### [MODIFY] `functions/src/index.ts`
- Export the new `executeCurationPipeline` function.

### Frontend - React Client
#### [MODIFY] `App.tsx` (and relevant services)
- Deprecate `generateGraphDataViaCloudJob`'s `setDoc` approach.
- Implement `const curate = httpsCallable(functions, 'executeCurationPipeline');`
- The frontend will await this promise directly, receiving the complete GraphData and DetailsCache in a single synchronized response.
- Fallback UI handling for the single promise loading state.

## Verification Plan

### Manual Verification
1. We will deploy the new `executeCurationPipeline` function locally using the emulator or directly to production.
2. We will trigger a Single-Seed curation from the UI and trace the backend terminal output, ensuring it correctly hits the "Cache Lookup -> Hit -> Merge" diamond.
3. We will trigger a Multi-Seed curation from the UI and trace the backend terminal output, ensuring it follows the 3.1 Pro bespoke topology and Roots Breakdown diamond.
