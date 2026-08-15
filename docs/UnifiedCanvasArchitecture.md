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
**Objective:** Generate the spiderweb topology with guaranteed connectivity and zero floating nodes.
- **Single-Seed Flow (Unfiltered):** Remains completely untouched and backwards-compatible. Single-seed queries bypass the private canvas and target the **Global Artist Deep Cut Cache**, ensuring that standalone deep cuts remain highly shareable, instantly accessible O(1) canonical assets.
- **Multi-Seed & Filtered Flows:** Bypasses global cache writes. The LLM is prompted to generate a complete, continuous spiderweb topology as a *single, cohesive creative act*. The output is saved **exclusively to a private Project ID canvas**.
- **Invariants:** 
  - **Topology Guarantee:** Every generated node is structurally guaranteed to have valid relational edges to the rest of the canvas. Floating, orphaned, or disconnected nodes are strictly impossible.
  - **Cache Isolation:** Multi-seed generations must never write directly to the global `artists/{id}` collection during generation, preventing context-specific LLM hallucinations from polluting canonical global data.

### Phase 3: Instant Global Mapping / Zero-AI Zapping
**Objective:** Resolve canonical entities instantly without spending LLM tokens.
- **Process:** Immediately after the canvas is generated and saved to the project, the Engine performs an `O(1)` sweep of all generated nodes against the global database.
- **Execution:** Existing records found in the global cache are instantly mapped into the project canvas via Firestore pointers and redirects. 
- **Invariants:** 
  - Zero AI tokens are spent on nodes that have already been discovered and cached by the community.

### Phase 4: Targeted Gap-Filling
**Objective:** Hydrate any remaining "Deep Cuts" missing from the global registry.
- **Process:** For the subset of nodes that resulted in a cache miss during Phase 3, the system extracts their `[Artist Name + Country]` signature and queues them for hydration.
- **Execution:** The system fires asynchronous, surgical API creation passes (utilizing Gemini and Google Search) to construct rich profiles (biographies, metadata, and thumbnails) for these missing entities. Once constructed, they are snapped back into the Project canvas and permanently persisted to the global cache for future users.
- **Invariants:** 
  - Executed in strictly chunked concurrency batches (e.g., `Promise.all` in blocks of 5) to respect Cloud Function execution timeouts and API rate limits.
  - The UI must gracefully handle partial hydration states, rendering skeletons or initials until the gap-filling process syncs via real-time Firestore listeners.

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
