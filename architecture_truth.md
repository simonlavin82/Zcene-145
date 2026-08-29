# ZCENE ARCHITECTURAL TRUTH & IMMUTABLE LAWS

This document defines the absolute, immutable architectural baseline of Zcene. All future development, bug fixes, and AI agent actions MUST strictly adhere to these laws. Legacy paradigms (like naive string matching or bypass assumptions) are strictly forbidden.

## THE IMMUTABLE ARCHITECTURAL LAWS

### 1. Three-Column Flow (The Pipeline)
The curation pipeline is strictly divided into three distinct execution columns. 
- **Column 1: React UI (App.tsx / Dashboard.tsx):** Purely presentation. Completely decoupled from heavy LLM orchestration. Handles caching logic (Front Gate Cache Guard) and fast-track local hydration based on synchronous responses.
- **Column 2: HTTP Fast-Track (executeCurationPipeline.ts):** Synchronous execution layer. Responsible for pre-flight origin slugging, fast-track cache fallback, generative topology (synthesizing relational graph structure via Gemini), and saving the baseline topology to Firestore with an unalterable `updatedAt` anchor.
- **Column 3: Background Worker (processCurationJob.ts):** Asynchronous hydration layer. Never creates foundational topology. Triggered via Eventarc to fetch rich metadata (Google Search/Gemini Flash) and scrape imagery (iTunes/Spotify). Writes fully hydrated nodes back to cache.

### 2. Strict Seed Hoisting
Seed nodes must ALWAYS be elevated to the highest priority in the topology.
- Active node order processing is strictly governed by Seed Hoisting. 
- The generated topology must ensure seeds are visually and programmatically anchored as the roots of the network, preventing them from being buried or misclassified during rendering.

### 3. Defensive Alias Matching via `isNodeInSeedList`
- **Canonical Alias Resolution:** Bypasses and naive strict string matching are dead. Alias matching must be purely canonical.
- Variations of aliases must resolve cleanly to a single canonical node without producing duplicates.
- The `isNodeInSeedList` utility (and its defensive matching equivalents) MUST be used to reliably resolve node identity across the pipeline, ensuring no hallucinated duplicates or orphaned alias fields corrupt the graph.

### 4. Fail-Fast Media Gatekeeper
- The cache validation predicate must enforce strict completeness.
- Nodes lacking crucial media or complete context (e.g., missing imagery, empty biography) are instantly flagged as cache misses by the gatekeeper. 
- The Gatekeeper ensures only fully hydrated, media-rich nodes pass through the zero-AI zapping threshold without re-triggering hydration.

## CRITICAL SCHEMA RULES FOR CACHE
- `synthesisRationale` **MUST** be written explicitly to the **root level** of the global artist cache document (not buried inside stringified layers).
- D3 **Link Objects MUST** be safely serialized back to strings (e.g. `link.source.id`) before caching `graphData`.
- Column 2 cache-loading MUST safely parse and clone the cache objects to avoid polluting the memory references, and strictly deduplicate loaded node IDs.
