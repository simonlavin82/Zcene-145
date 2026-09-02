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
