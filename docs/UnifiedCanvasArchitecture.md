# Unified Canvas & Gap-Filling Architecture

## Overview
The Unified Canvas & Gap-Filling Architecture represents a fundamental shift in how Zcene handles multi-seed and filtered graph generation. It moves away from fragile, modular on-the-fly stitching of independent global subgraphs—a pattern that previously led to sparse, disconnected topologies—towards a holistic, project-scoped canvas generation strategy. 

This model guarantees structural integrity, eliminates floating nodes, prevents global cache pollution from hallucinated multi-seed artifacts, and optimizes token expenditure through smart caching sweeps.

---

## The 4-Phase Model

### Phase 1: Foundation & Validation
**Objective:** Lock down the explicit identity of seed entities before any structural generation occurs.
- **Process:** The system rigorously validates the incoming seed artists against the global cache or via real-time LLM origin validation. 
- **Invariants:** 
  - Every validated seed must output an explicit, collision-resistant signature, formatted as `[Artist Name + Country]` (e.g., `nirvana-usa` vs `nirvana-gbr`).
  - This prevents signature collisions downstream and ensures that the foundation of the canvas is anchored to canonical global entities.

### Phase 2: Canvas Generation
**Objective:** Generate the bespoke spiderweb topology with guaranteed connectivity.
- **Single-Seed Flow (Unfiltered):** Unchanged. Single-seed queries target the **Global Artist Deep Cut Cache** ensuring canonical shareability.
- **Multi-Seed & Filtered Flows:** The LLM generates a *lightweight bespoke spiderweb topology* (only artist names, labels, origins, and relational edges) which is held in memory. This output is specific to the user's private project canvas.
- **Invariants:** 
  - **Topology Guarantee:** Every node has valid relational edges; floating nodes are impossible.
  - **Topology Isolation:** The bespoke topology `graphData` is never written to the global cache, preventing hallucinated multi-seed artifacts from polluting canonical data.

### Phase 3: Instant Global Mapping / Zero-AI Zapping
**Objective:** Resolve canonical entities instantly without spending LLM tokens.
- **Process:** Immediately after generation, the Engine performs an `O(1)` sweep of the lightweight nodes against the global database.
- **Execution:** Existing records found in the global cache are mapped into the project canvas via Firestore pointers. 
- **Invariants:** 
  - Zero AI tokens are spent on nodes already cached by the community.

### Phase 4: Consolidated Gap-Filling & Global Sync
**Objective:** Hydrate all missing "Deep Cuts" from the lightweight topology and persist them globally.
- **Process:** The system identifies all missing Deep Cuts from Phase 3, triggers the AI API to create their full details (biographies, metadata, thumbnails) on-demand, and **saves these newly hydrated profiles globally**.
- **Execution:** 
  - Hydration happens via surgical, concurrent Gemini passes.
  - The fully hydrated Deep Cut details are synced into the global `artists`/`labels` collections (with `graphData: null`), expanding Zcene's global knowledge base.
- **Final Save:** The generated bespoke topology AND all fully hydrated global Deep Cut data are finally saved to the unique user project (`detailsCacheEntries`). All Deep Cuts must be fully hydrated at this point.
- **Invariants:** 
  - Deep Cuts generated during multi-seed canvases ARE saved globally, enforcing a gap-filling strategy.
  - Executed in chunked batches to respect execution timeouts.

---

## Safe, Phased Implementation Plan

To safely roll out this architecture without breaking the currently functioning single-seed curation flows, we will adopt a strict, incremental implementation strategy.

### Phase A: Payload Configuration & Prompt Normalization
**Goal:** Fix the immediate density collapse by passing clean, raw textual names to the LLM and isolating multi-seed generation from the global cache.
1. **Target Files:** `App.tsx`, `curatorService.ts`, `onCurationJobCreated.ts`
2. **Implementation:**
   - **`App.tsx`:** Revert the payload regression. Ensure `generateGraphDataViaCloudJob` receives raw display names (`Turnstile::Militarie Gun`) instead of hyphenated cache keys to prevent LLM hallucination.
   - **`curatorService.ts`:** Update the `isMultiSeed` evaluation gate. Force the usage of `GENERATE_MULTI_SEED_GRAPH_PROMPT_TEMPLATE` whenever `artistList.length > 1`, regardless of whether `cachedSubgraphsContext` is defined.
   - **`onCurationJobCreated.ts`:** Halt the practice of extracting subgraphs and writing them to the global `artists/{id}` cache during multi-seed or filtered generations. Route the full topology strictly to the `Project` document.
3. **Safety & Testing:** Run local tests with complex multi-seeds (e.g., `Turnstile::militatîe gun`) to verify the density gap is resolved and the LLM produces a cohesive 31-node web. Check Firestore to ensure global artist documents are not overwritten.

### Phase B: Disambiguation & The Signature Protocol
**Goal:** Enforce the `[Artist Name + Country]` invariant to prevent naming collisions.
1. **Target Files:** `geminiService.ts`, `curatorService.ts`, `App.tsx` (Phase 1 validation gates)
2. **Implementation:**
   - Update `GENERATE_MULTI_SEED_GRAPH_PROMPT_TEMPLATE` to explicitly demand that generated node IDs append country of origin (e.g., `artistname-usa`).
   - Enhance the frontend Phase 1 / Phase 2 validation to strictly enforce these canonical signatures before allowing the payload to reach Phase 2 Canvas Generation.
3. **Safety & Testing:** Generate queries involving overlapping artist names (e.g., "Nirvana"). Verify that `nirvana-usa` and `nirvana-gbr` co-exist correctly within the same canvas and correctly map to distinct global caches.

### Phase C: Instant Global Mapping (Zero-AI Zapping)
**Goal:** Connect the isolated Project Canvas to the pre-existing global data.
1. **Target Files:** `ProjectLoader.tsx` (or `App.tsx` loading logic), `curatorService.ts`
2. **Implementation:**
   - When a Project is loaded, run an `O(1)` parallel sweep of all node IDs against the global `artists/{id}` cache.
   - Inject the resolved `detailsCache` payloads into the local state so the UI instantly paints thumbnails and biographies for known entities without requesting new generations.
3. **Safety & Testing:** Clear local state but leave Firestore populated. Load a heavy multi-seed project and verify that previously cached nodes render instantly (thumbnails and bios) without triggering loading spinners or cloud jobs.

### Phase D: Asynchronous Targeted Gap-Filling
**Goal:** Surgically hydrate missing nodes in the background safely.
1. **Target Files:** `onCurationJobCreated.ts`, `SeedArtistImages.tsx`, Background Workers
2. **Implementation:**
   - **Backend:** For nodes missing in Phase 3, trigger a chunked asynchronous worker (or Pub/Sub queue) to fetch the missing details via surgical Gemini passes. Once complete, write to global cache and update the `Project` document.
   - **Frontend:** Update `SeedArtistImages.tsx` and detail panels to fallback to `project.graphData` for partial assets. Implement loading skeletons for nodes that are currently in the gap-filling queue.
3. **Safety & Testing:** Monitor Cloud Function execution times and quotas. Ensure the UI remains responsive and automatically snaps newly hydrated thumbnails into place as the background worker completes chunks.
