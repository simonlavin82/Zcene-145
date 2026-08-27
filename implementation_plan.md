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
1. We will# Architectural Confession & Rollback Plan

## Phase 1: Architectural Confession & Cleanup
I made a critical error by violating the established 3-Column Architecture. I attempted to patch foundational data (node slugging and the initial `updatedAt` timestamps) inside the Background Worker (Column 3: `processCurationJob.ts`). Column 3 is strictly meant to hydrate existing nodes created by Column 2. Anchoring data like timestamps and country-coded slugs MUST happen synchronously in Column 2 (HTTP Fast-Track) before the background hydration even begins.

I have already searched for and deleted the outdated `EngineDocumentation.md` file which contradicted this architecture.

## Phase 2: Source of Truth Overhaul
I will overhaul `EnginePage.tsx` to perfectly reflect the 3-Column Pipeline:
- **Column 1: React UI**: Submits the seed, handles the Front Gate Cache Guard, performs Fast Track Local Hydration, and listens for Background Hydration.
- **Column 2: HTTP Fast-Track (`executeCurationPipeline.ts`)**: Performs Pre-Flight Origin Slugging (appending the `<kebab-case>-<country-code>`), handles Gemini Topology Generation, and saves the Baseline Topology Payload (including `updatedAt: serverTimestamp()`).
- **Column 3: Background Worker (`processCurationJob.ts`)**: Listens for jobs, hydrates missing info (bio, image), saves to cache, and marks the job complete.

I will also create a new `architecture_truth.md` file containing this exact logic to serve as a permanent system prompt anchor.

## Phase 3: Rollback & Fix Plan

### 1. Revert Broken Column 3 Logic (`processCurationJob.ts`)
I will remove the flawed self-referential alias logic and the slugging manipulation that I mistakenly placed in `processCurationJob.ts`. Column 3 will revert to purely hydrating the canonical ID that it receives from Column 2.

### 2. Correct Column 2 Logic (`executeCurationPipeline.ts` & `artistCacheService.ts`)
- **Origin Slugging**: In `executeCurationPipeline.ts`, I will ensure that the initial seed artist and all nodes in the topology are correctly slugged with their country code (e.g., `harvey-danger-us`) during the "Pre-Flight Origin Validation" and graph generation phase. I will ensure that `extractCountrySlug` correctly extracts and appends the ISO-2 suffix to the canonical IDs before the baseline topology is saved.
- **Timestamps**: In `artistCacheService.ts` and `executeCurationPipeline.ts`, when the baseline topology and cache stubs are created, I will explicitly inject `updatedAt: serverTimestamp()` so the documents have their timestamps anchored immediately in Column 2.

### 3. Sync React UI (`Dashboard.tsx` & `App.tsx`)
The React UI will seamlessly sync with this repaired flow. Because Column 2 will lay down the baseline topology and initial timestamps, Column 1 can instantly paint the unhydrated topology. The 'Mapping...' loader will only drop, and the toast will only show, when the Background Hydration Listener (Column 1) detects that Column 3 has marked the project status as 'completed' and the node is fully qualified in the cache.

## User Review Required
Please review this Implementation Plan and the overhauled `EnginePage.tsx` (which I will update next). Once you approve, I will execute the code changes.he Lookup -> Hit -> Merge" diamond.
3. We will trigger a Multi-Seed curation from the UI and trace the backend terminal output, ensuring it follows the 3.1 Pro bespoke topology and Roots Breakdown diamond.
