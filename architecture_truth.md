# ZCENE ARCHITECTURAL TRUTH & IMMUTABLE LAWS

This document defines the absolute, immutable architectural baseline of Zcene. All future development, bug fixes, and AI agent actions MUST strictly adhere to these laws. Legacy paradigms (like naive string matching or bypass assumptions) are strictly forbidden.

## THE IMMUTABLE ARCHITECTURAL LAWS

### 1. Three-Column Flow (The Pipeline)
The curation pipeline is strictly divided into three distinct execution columns. 
- **Column 1: React UI (App.tsx / Dashboard.tsx):** Purely presentation. Completely decoupled from heavy LLM orchestration. Handles caching logic (Front Gate Cache Guard), fast-track local hydration based on synchronous responses, and enforcing UI-level strict state hydration rules (like Guest Hydration Fallbacks).
- **Column 2: HTTP Fast-Track (executeCurationPipeline.ts):** Synchronous execution layer. Responsible for pre-flight origin slugging (returning conflicts to the user), fast-track cache fallback, generative topology (ensuring Deep Cuts connect back to the seed), and saving the baseline topology to Firestore with an unalterable `updatedAt` anchor.
- **Column 3: Background Worker (processCurationJob.ts):** Asynchronous hydration layer. Follows a strict progression: Hydrate Node Batch -> Final Node Positioning -> Root Breakdown -> Persist Assets. Never writes missing hydration data as 'null', but explicitly flags for retry. Writes fully hydrated nodes back to cache.

### 2. Strict Seed Hoisting & Pinning
Seed nodes must ALWAYS be elevated to the highest priority in the topology.
- **activeNodes[0] Pinning:** The seed artist MUST be explicitly hoisted and pinned to `activeNodes[0]` during share generation and project creation to guarantee deterministic Deep Cut Sidebar hydration natively from index `[0]`.
- The generated topology must ensure seeds are visually and programmatically anchored as the roots of the network.

### 3. Universal Coordinate Amnesia (D3 Spatial Data)
- Absolute D3 runtime coordinates (`x`, `y`, `vx`, `vy`, `fx`, `fy`) MUST be explicitly stripped from the `graphData` payload during The Share Generation (when saving clones or sharing projects). 
- This enforces relational link weights to drive an organic, viewport-adaptive D3 recalculation upon load, preventing rigid snapshot locking.

### 4. Deterministic Open Graph Routing
- A deterministic top-level artist image URL (`seedImageUrl`) MUST be appended directly to the root of the project and shared Zcene payloads at creation.
- This eliminates secondary proxy lookups during Open Graph generation (`server.js`), guaranteeing reliable album art rendering across external platforms (e.g., WhatsApp).

### 5. Guest Hydration Fallback
- During The Guest Consumption phase, if a cloned `detailsCache` is empty (e.g., due to previous cache trap anomalies), the Guest view MUST proactively batch-hydrate missing profiles immediately upon mount to prevent UI degradation.

### 6. Defensive Alias Matching via `isNodeInSeedList`
- **Canonical Alias Resolution:** Bypasses and naive strict string matching are dead. Alias matching must be purely canonical.
- The `isNodeInSeedList` utility (and its defensive matching equivalents) MUST be used to reliably resolve node identity across the pipeline, ensuring no hallucinated duplicates or orphaned alias fields corrupt the graph.

### 7. Fail-Fast Media Gatekeeper
- The cache validation predicate must enforce strict completeness.
- Nodes lacking crucial media or complete context (e.g., missing imagery, empty biography) are instantly flagged as cache misses by the gatekeeper. 

## CRITICAL SCHEMA RULES FOR CACHE
- **Root Breakdown Persistence:** The "Root Breakdown narrative" MUST be written to the root level of the project document (not nested inside a sub-object), ensuring schema continuity.
- `synthesisRationale` **MUST** be written explicitly to the **root level** of the global artist cache document (not buried inside stringified layers).
- **Dynamic Dashboard Integrity:** Dashboard metadata (like the `deepCuts` count) must dynamically match the actual rendered nodes in the graph data, strictly prohibiting static placeholders.
- D3 **Link Objects MUST** be safely serialized back to strings (e.g. `link.source.id`) before caching `graphData`.
- Column 2 cache-loading MUST safely parse and clone the cache objects to avoid polluting the memory references, and strictly deduplicate loaded node IDs.

### 8. Strict Topology Verification (Stub Routing)
- The pipeline MUST differentiate between a "Partial Cache Hit" (Stub) and a "Full Cache Hit".
- A document possessing media and biography data but lacking populated `graphData` topology is an Artist Stub.
- Column 2 cache-loading MUST explicitly verify the presence of `graphData`. Stubs MUST be strictly routed to Generative Topology (`needsProGeneration = true`) to build the required node map before asynchronous hydration.
- **The Fast-Track:** Stubs uniquely bypass both the Column 1 Disambiguation Modals and the Column 2 Flash Validation phase, being fast-tracked directly into Generative Topology.

### 9. Canonical Seed Slug Resolution via `resolvedSeedNormMap` (Split-Brain Prevention)
- At the **entry point** of `processCurationJob`, before any Phase 1 cache lookup or hydration loop begins, a `resolvedSeedNormMap` MUST be built by querying Firestore for all existing docs whose `artistId` field starts with each seed's base normalised slug.
- This map resolves the authoritative canonical document ID for each seed (e.g., `"buggin" → "buggin-us"`).
- **All downstream writes in the job — `synthesisRationale`, `graphData`, `detailsCache` — MUST target the canonical ID from this map, not the raw seed string.** Failure to use this map is the direct cause of split-brain writes, where data is fractured across two separate Firestore documents.
- The `extractArtistSubGraph` call (Fix D) MUST receive the canonical ID and its result MUST be validated as non-empty before writing. An empty extracted subgraph (`safeExtractedGraph = null`) MUST prevent overwriting a real, populated `graphData` in the canonical document.

### 10. Redirect Pointer Immunity in the Hydration Loop Slug Dedup
- Fix E remediation creates redirect pointer documents (e.g., `artists/buggin` with `{ redirectTo: "buggin-us" }`) to alias orphaned stubs to their canonical equivalents.
- The hydration loop's slug deduplication query (which uses an `artistId` range query to find existing canonical docs) MUST explicitly **skip any document that has a `redirectTo` field set**.
- **Rationale:** Redirect pointer documents share the same `artistId` value as the canonical document and appear in the same Firestore range query. Without this guard, the dedup logic adopts the redirect pointer as the canonical ID, looks up a `detailsCache` that doesn't exist there, falls back to external API hydration, and on timeout skips the entire Firestore write — leaving `graphData` permanently empty on the canonical document.
- **Rule:** `if (snapData.redirectTo) continue;` is an immutable guard in the slug dedup loop. It must never be removed.

