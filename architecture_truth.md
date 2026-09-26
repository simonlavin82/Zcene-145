# ZCENE ARCHITECTURAL TRUTH & IMMUTABLE LAWS

This document defines the absolute, immutable architectural baseline of Zcene. All future development, bug fixes, and AI agent actions MUST strictly adhere to these laws. Legacy paradigms (like naive string matching or bypass assumptions) are strictly forbidden.

## THE IMMUTABLE ARCHITECTURAL LAWS

### 1. Three-Column Flow (The Pipeline)
The curation pipeline is strictly divided into three distinct execution columns. 
- **Column 1: React UI (App.tsx / Dashboard.tsx):** Purely presentation. Completely decoupled from heavy LLM orchestration. Locks the UI via the Active Loader Gate and strictly ignores the HTTP 200 OK from Column 2. Only drops the loader when Column 3 sets project status to 'completed'. The frontend flow explicitly enforces these architectural steps to React components:
  - **Step 2 (Topology Hit):** Explicitly mapped to `<DisambiguationModal>` ("Look What I Found").
  - **Step 3 (API Confirmation):** Explicitly mapped to `<TokenConfirmationModal>`.
  - **Step 4 (Validate Origin):** Explicitly mapped to `<ConsolidatedValidationModal>`.
  - **Step 5 (Active Loader Gate):** LOCKED.
  - **Step 7 (Drop Loader & Render Zcene):** Drops the loader only when Column 3 sets project status to 'completed'.
- **Column 2: HTTP Fast-Track (executeCurationPipeline.ts):** Synchronous execution layer. Responsible for pre-flight origin slugging (returning conflicts to the user), fast-track cache fallback, generative topology (ensuring Deep Cuts connect back to the seed), generating baseline `seedStubs` on cache misses, and saving the baseline topology to Firestore. Returns immediately while creating the curationJobs doc (with injected `seedStubs`), handing full responsibility to the async worker.
- **Column 3: Background Worker (processCurationJob.ts):** Asynchronous hydration layer. Follows a strict progression: Hydrate Node Batch -> Final Node Positioning -> Root Breakdown -> Persist Assets. Never writes missing hydration data as 'null'; explicitly falls back to pre-hydrated `seedStubs` for failed primary seeds (JIT Fallback) to prevent database corruption. Writes fully hydrated nodes back to cache.

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

### 5. (Deprecated - Lazy/Guest Hydration Fallbacks are Obsolete)
- Project payloads are now 100% self-contained and atomic. On-demand or lazy hydration is strictly forbidden.

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

### 9. Canonical Seed Slug Resolution via `resolvedSeedNormMap` & `idRewriteMap` (Split-Brain Prevention)
- At the **entry point** of `processCurationJob`, before any Phase 1 cache lookup or hydration loop begins, a `resolvedSeedNormMap` MUST be built by querying Firestore for all existing docs whose `artistId` field starts with each seed's base normalised slug.
- This map resolves the authoritative canonical document ID for each seed (e.g., `"buggin" → "buggin-us"`).
- **All downstream writes in the job — `synthesisRationale`, `graphData`, `detailsCache` — MUST target the canonical ID from this map, not the raw seed string.** Failure to use this map is the direct cause of split-brain writes, where data is fractured across two separate Firestore documents.
- **Pre-computed `idRewriteMap` (Topology Standardization):** Before extracting subgraphs (Fix D), the job MUST compile an `idRewriteMap` resolving raw IDs to their canonical forms. The entire unified `finalGraph`'s nodes and edges MUST be rewritten using this map *before* subgraph extraction occurs.
- The `extractArtistSubGraph` call MUST receive the canonical ID and its result MUST be validated as non-empty before writing. An empty extracted subgraph (`safeExtractedGraph = null`) MUST prevent overwriting a real, populated `graphData` in the canonical document.

### 10. Redirect Pointer Immunity in the Hydration Loop Slug Dedup
- Fix E remediation creates redirect pointer documents (e.g., `artists/buggin` with `{ redirectTo: "buggin-us" }`) to alias orphaned stubs to their canonical equivalents.
- The hydration loop's slug deduplication query (which uses an `artistId` range query to find existing canonical docs) MUST explicitly **skip any document that has a `redirectTo` field set**.
- **Rationale:** Redirect pointer documents share the same `artistId` value as the canonical document and appear in the same Firestore range query. Without this guard, the dedup logic adopts the redirect pointer as the canonical ID, looks up a `detailsCache` that doesn't exist there, falls back to external API hydration, and on timeout skips the entire Firestore write — leaving `graphData` permanently empty on the canonical document.
- **Rule:** `if (snapData.redirectTo) continue;` is an immutable guard in the slug dedup loop. It must never be removed.

### 11. Cost-Optimized Parametric Hydration (No Grounding)
- **Eradication of Google Grounding Surcharge:** Native googleSearch grounding tools MUST remain fully stripped from both the Cloud Run proxy and Firebase Cloud Functions. The architecture relies purely on Gemini 3.5 Flash's parametric memory. This enforcement dropped the real-world cost per 40-node root generation from ~£4.30+ down to an average of ~$0.15 / £0.12 – £0.48.
- **Deprecation of external SERP queries:** The legacy `serpService.ts` (Google Custom Search API) has been completely removed to avoid unnecessary third-party API costs ($5 per 1,000 queries), quota limits, and 400 Bad Request errors.

### 12. Resilient iTunes Artwork Pipeline
- **Punctuation-Agnostic Normalization:** The iTunes scraper MUST use the punctuation-agnostic normalization rule (`toLowerCase().replace(/[^a-z0-9]/g, '')`) to resolve strict equality naming edge cases (e.g., "Jay Z" vs "JAY-Z").
- **Summary Match Fallback:** If the LLM produces an empty genre string or a highly esoteric subgenre that fails the iTunes master taxonomy, the validator MUST fall back to scanning the artist biography (summary) for core iTunes taxonomy keywords (e.g., "hip", "hop", "rap"). This guarantees 100% hydration while preserving strict homonym protection.

### 13. Auth Handoff Preserver
- If a guest clicks 'Save' on a shared project, the app stashes the ID in session storage to guarantee the clone resumes post-auth.

### 14. Atomic Self-Healing
- Graph breakdowns handle atomic self-healing. Fuzzy fallbacks mitigate strict-coupling vulnerabilities.

### 15. Complex Cache Bypass
- Multi-seed and filtered queries must strictly bypass the Global Topology Cache (Front Gate). The engine must default to Live Synthesis to guarantee bespoke graph generation.

### 16. Curation Intercept Guardrails
- **ProjectLoader Guardrails:** The ProjectLoader must strictly bypass Phase 1 interception when a document's status is `curating`. The UI must remain locked and patiently await the backend background worker rather than firing duplicate generative calls.
- **Identity Lock (`isRegeneration`):** During 'Overwrite Existing' (`isRegeneration = true`), the original project name is strictly write-locked. New deep links or explicit forks derive fresh names natively from the seed strings.

### 17. JIT Stub Fallback
- **The Frontend/Backend Handshake:** When background hydration times out or fails for a primary seed artist, the backend intercepts this failure and injects a pre-generated JIT stub (`_isStub: true`) from the initial payload rather than writing `null`.
- **The UI Interception:** The React UI intercepts the selection of any node flagged as `_isStub: true`, executing a Just-In-Time (JIT) API fetch to hydrate the missing details live, and silently merges them into the global cache to self-heal the missing Deep Cut details permanently.

### 18. Authorization Lifecycle
- **Rule:** Token/billing authorization state must be strictly scoped to the active generation event. The authorization flag must instantly reset to false on any modal cancellation, API failure, or project unmount to prevent tollbooth bypasses.

### 19. External Link Security
- **Rule:** Official Website and Bandcamp links must rely on deterministic client-side search templates to prevent the AI from hallucinating or routing to malicious squatted domains.

### 20. Mandatory Disambiguation on Direct Hits
- **Rule:** A single-seed Topology Hit (Green Line) MUST NEVER bypass the user confirmation phase. The frontend MUST explicitly trigger the `<DisambiguationModal>` ("Look What I Found") to allow the user to verify the cached entity's origin. 
- **Enforcement:** The system is strictly forbidden from instantly hydrating the state and bypassing this modal. The Green Line hydration route can only execute after explicit confirmation from the `<DisambiguationModal>`. Legacy components (e.g., `CacheChoiceDialog`) are strictly prohibited.
### 21. Locked Semantic Topology & AI Physics Injection
- **Rule:** D3 node dragging gestures are strictly forbidden. The graph operates as a Locked Semantic Topology to ensure mobile panning remains unobstructed and to preserve the calculated semantic clusters.
- **Enforcement:** The D3 layout is strictly driven by the 'Final Node Positioning' step via `gemini-3.5-flash`. The AI generates float weights (0.1 to 1.0) using a lean bio payload strategy, which dictate variable link distance, spring rigidity, and collision radii. If the AI model fails or returns an empty array, the pipeline gracefully falls back to injecting a neutral weight of `0.5` across all links to guarantee physics stability.
