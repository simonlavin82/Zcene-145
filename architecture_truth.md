# ZCENE ARCHITECTURAL TRUTH & IMMUTABLE LAWS
 
![Architecture Diagram](./Zcene Architecture V33.jpg)
 
This document defines the absolute, immutable architectural baseline of Zcene (V33). All future development, bug fixes, and AI agent actions MUST strictly adhere to these laws. Legacy paradigms (like naive string matching, bypass assumptions, single-pointer stubs, open-ended prompt instruction textareas, prose-fallback stubs, or storing entity payloads under bare IDs) are strictly forbidden.
 
## THE IMMUTABLE ARCHITECTURAL LAWS
 
### 1. Three-Column Flow (The Pipeline)
The curation pipeline is strictly divided into three distinct execution columns. 
- **Column 1: React UI (App.tsx / Dashboard.tsx / GraphPage.tsx):** Presentation, 3-Tier Anchor configuration, and pre-flight gateway. Completely decoupled from heavy LLM orchestration. Locks the UI via the Active Loader Gate and strictly ignores the HTTP 200 OK from Column 2. Only drops the loader when Column 3 sets project status to 'completed'. The frontend flow explicitly enforces these architectural steps:
  - **Step 1: Submit Seed(s) + 3-Tier Anchors & Local Topology Routing:** Evaluates `hasActiveDiscoveryFilters(filters)` (ignoring empty filter arrays). Unfiltered single-seed Direct Hits (perfect cache) bypass the network entirely; multi-seed or 3-Tier anchored queries route down the Complex Query path.
  - **Step 2 (Topology Hit):** Explicitly mapped to `<DisambiguationModal>` ("Look What I Found") to verify origin on cache hits.
  - **Step 3 (Pre-Flight Gateway & Collision Detection):** Calls `validateSeedOriginCallable` (`3.6 Flash`, `thinking_level: minimal`, Zero Search Grounding / Parametric Only). Detects multi-tenant homonyms (e.g., "Darko US" vs "Darko UK") and synchronously mints 1-to-many Evolved Stub contracts (`_isStub: true, isAmbiguous: true, candidates: [...]`).
  - **Step 4 (Confirm Your Artists & Escape Hatch Re-Query Bouncer):** Explicitly mapped to `<ConsolidatedValidationModal>`. Presents locked cards for unambiguous seeds, `<DisambiguationRadio>` for collisions, and the "Not this artist?" manual escape hatch.
    - **Escape Hatch Re-Query Bouncer:** If a user specifies custom origin or genre hints and clicks "Apply", the UI enters an active `isVerifying` state and synchronously re-queries `validateSeedOriginCallable` (`3.6 Flash`, `thinking_level: minimal`, Zero Search Grounding / Parametric Only).
    - **Zero-Pollution Inline Rejection:** If Flash rejects (`isValid: false` or `not-found`), an inline error banner ("No significant artist found matching these criteria") is displayed, the card remains in edit mode, and "Confirm & Generate" remains locked. Zero stubs are written to Firestore during the modal interaction.
    - **Verified UI Lock:** "Confirm & Generate" remains strictly disabled while any card is verifying or in edit mode, unlocking only after AI verification succeeds.
  - **Step 5 (API Confirmation):** Explicitly mapped to `<TokenConfirmationModal>`.
  - **Step 6 (Active Loader Gate):** LOCKED.
  - **Step 7 (Drop Loader & Render Zcene):** Drops the loader only when Column 3 sets project status to 'completed'.
- **Column 2: HTTP Fast-Track (executeCurationPipeline.ts):** Synchronous execution layer.
  - **Node 1: Ingest Validated Seed Payload, Sanitize 3-Tier Anchors & Zero Blind Trust:** Ingests frontend-validated seed preferences (`originalQueries`, `disambiguationHints`, `disambiguationGenres`, `activeSeedNames`) and sanitizes `payload.filters` via `sanitizeDiscoveryFilters` (enforcing `1965–2026` era bounds, mutual exclusion of `includeOrigins`/`excludeOrigins`, canonical countries/genres, and stripping legacy `additionalInstructions`). Forces `needsProGeneration = true` and `Complex Generation` whenever `hasActiveDiscoveryFilters(filters)` is true, preventing cached single seeds from bypassing active 3-Tier filters. Enforces `isFullyQualifiedEntityProfile` at the Read Gate.
    - **Zero Blind Trust Mandate:** Column 2 MUST NOT synthesize geographic slugs (e.g., `-jp`) from raw user hints. Stubs and routing targets are minted strictly from validated Flash candidate payloads.
  - **Node 2 & 3: Create Topology (3.1 Pro) | Thinking_level: medium & 3-Tier Anchor Hierarchy ([Rule 41]):** Generates skeleton (Seed, AI Artists, Labels, Genres) in `kebab-case-artist-iso-code` format using the 3-Tier Anchor prompt split (Tier 1 Seed Immunity, Tier 2 Hard Era/Origin Guardrails with cross-era lineage authorization, Tier 3 Soft Genre/Label Gravity with Rule 41 Graceful Degradation fallback retry if 0 non-seed artists survive).
  - **Node 17: Root-as-Router Contract:** Bare IDs (e.g., `'gunmoll'`, `'turnstile'`) MUST be minted exclusively as `_isStub: true` forwarders (`redirectTo: "id-iso"`, `candidates: [...]`). Verified payloads (biography, discography, graphData, image) MUST be stored at geographically suffixed IDs (e.g., `artists/gunmoll-us`). Bare IDs are permanently reserved as routers to future-proof against homonyms and must never hold entity payloads. Cache reads checking bare IDs follow `redirectTo` directly to the suffixed canonical document.
  - Saves the baseline topology to Firestore and returns HTTP 200 OK while creating the `curationJobs` doc, handing full execution to the async worker.
- **Column 3: Background Worker (processCurationJob.ts & healOrphanedAsset.ts):** Asynchronous hydration layer. Follows a strict progression: **Step 2 Hydrate Node Batch** (enforcing `isFullyQualifiedEntityProfile` at the Read Gate, strict `responseMimeType: 'application/json'` + `NODE_DETAILS_SCHEMA` with zero prose fallback and 3x retry, `normalizeLabelId` for label entities, and the **4-Tier iTunes Waterfall** - Rule 38 with discography tie-breaking where `'not-found'` is a valid terminal monogram state once all 4 tiers run against `discography.length > 0`) -> **Step 2B Level 2 Post-Hydration Boundary Audit ([Rule 41])** (pruning non-seed boundary violators from `finalGraph` and `detailsCacheEntries` prior to narrative synthesis) -> Step 3 Root Synthesis (`generateRootsBreakdownBackend` with 3-Tier Anchor lineage framing and `{ editorialMarkdown, artistSnippets }` JSON schema) -> Step 4A Topology Parity (`reconcileNarrativeEdges` - Rule 23) -> Step 4B Deterministic Graph Enrichment & Pod Genre Affinity ([Rule 39]) -> Degree-0 Cleanup (Rule 9) -> Final Node Positioning (Weight Preservation Guard) -> **Step 6 Persist Assets & Dual Write Gate Guard ([Rule 40])** (requiring `synthesisRationale >= 50` chars for seed `graphData` and `isFullyQualifiedEntityProfile` for global `/artists` and `/labels` Deep Cuts). Never writes missing hydration data as 'null'; explicitly falls back to pre-hydrated `seedStubs` for failed primary seeds (JIT Fallback) to prevent database corruption.
  - **Node 7: Set Project status: 'completed':** Extracts and freezes the `seedImageUrls: (string | null)[]` snapshot array from the isolated `detailsCache` and persists strict physical-node `anchorResolution` telemetry (`"Tier 1 + Tier 2 + Tier 3 (Full Parity)"`, `"Tier 1 + Tier 2 + Tier 3 (Genre Applied; Label Bypassed — Narrative Gravity Only)"`, `"Tier 1 + Tier 2 + Tier 3 (Label Applied; Genre Bypassed — Narrative Gravity Only)"`, or `"Tier 1 + Tier 2 Applied (Tier 3 bypassed due to boundary conflict)"`) directly to the project root, strictly immunizing dashboard cards from future global cache updates and enforcing seed-only UI fallbacks.
  - **Node 36: Just-In-Time (JIT) Asset Healer (3.6 Flash):** Dedicated on-demand micro-worker triggered ONLY when a user inspects an orphaned node suffering a true 404 cache miss or failing `isFullyQualifiedEntityProfile`. Bypasses batch queues to synthesize a 100% complete deep cut profile with full **4-Tier iTunes Waterfall** scraping parity (Rule 38) and Write Gate validation (Rule 40), performs atomic write-back to Firestore `artists/{id}` or `labels/{id}`, and records granular token and USD micro-cost receipts directly to `adminLedger/system/jitHeals`. Governed by a platform-wide 100-heal/24h auto-kill circuit breaker and manual admin override. Strictly forbidden from automated background sweeps or soft-expired data healing.

### 2. Strict Seed Hoisting & Pinning
Seed nodes must ALWAYS be elevated to the highest priority in the topology.
- **activeNodes[0] Pinning:** The seed artist MUST be explicitly hoisted and pinned to `activeNodes[0]` during share generation and project creation to guarantee deterministic Deep Cut Sidebar hydration natively from index `[0]`.
- The generated topology must ensure seeds are visually and programmatically anchored as the roots of the network.

### 3. Universal Coordinate Amnesia (D3 Spatial Data) — See also Rule 25
- Absolute D3 runtime coordinates (`x`, `y`, `vx`, `vy`, `fx`, `fy`) MUST be explicitly stripped from the `graphData` payload during The Share Generation (when saving clones or sharing projects).
- This enforces relational link weights to drive an organic, viewport-adaptive D3 recalculation upon load, preventing rigid snapshot locking.
- **Scope Clarification (V8):** This rule applies exclusively to the Share Generation pathway (`/sharedZcenes/{id}`) and the Duplication Pathway (`Clone New Zcene`). Owned user project documents (`users/{uid}/projects/{id}`) use **Coordinate Memory** as defined in Rule 21. See Rule 25 for the formal scoped definition.

### 4. Deterministic Open Graph Routing
- A deterministic top-level artist image URL (`seedImageUrl`) MUST be appended directly to the root of the project and shared Zcene payloads at creation.
- This eliminates secondary proxy lookups during Open Graph generation (`server.js`), guaranteeing reliable album art rendering across external platforms (e.g., WhatsApp).

### 5. [Deprecated] Legacy Client-Side Hydration
- Project payloads are 100% self-contained and atomic. On-demand or lazy guest hydration fallbacks are obsolete and strictly forbidden.

### 6. Ambiguous Stub Bypass & Canonical Resolution via `isNodeInSeedList`
- **Ambiguous Stub Bypass:** Any entity document marked as an ambiguous stub (`_isStub: true && isAmbiguous: true`) MUST strictly bypass direct cache hit fast-tracking and route directly to Node 4 (`<ConsolidatedValidationModal>`). This completely eliminates the "Direct Hit Trap" where early users cemented homonyms without multi-tenant choice.
- **Canonical Alias Resolution:** Bypasses and naive strict string matching are dead. Alias matching must be purely canonical.
- The `isNodeInSeedList` utility (and its defensive matching equivalents) MUST be used to reliably resolve node identity across the pipeline, ensuring no hallucinated duplicates or orphaned alias fields corrupt the graph.

### 7. Fail-Fast Media & Profile Gatekeeper (`isFullyQualifiedEntityProfile`)
- The cache validation predicate (`isFullyQualifiedEntityProfile` in `cacheQualification.ts`) must enforce strict completeness across both Read and Write Gates.
- Nodes lacking crucial metadata (`summary <= 50` chars, missing `genre`/`origin`/`founded`, `discography.length === 0` for artists, missing `imageUrl`, or prose-fallback `recommendationReason` containing `"Synthesised from live cultural archives"`) are instantly flagged as cache misses at the Read Gate and barred from global persistence at the Write Gate. Note: `imageUrl: "not-found"` is a valid terminal monogram state when accompanied by a verified non-empty `discography` (`discography.length > 0`).

### 8. Strict Topology Verification, Schema-Locked Hydration & Cache Serialization
- **Schema-Locked Deep Cut Hydration:** `fetchNodeDetailsBackend` (`curatorService.ts`) MUST enforce `responseMimeType: "application/json"` and `responseSchema: NODE_DETAILS_SCHEMA` (with 3x retry). Legacy prose fallbacks (`"Synthesised from live cultural archives..."` with `discography: []`) are strictly eradicated across backend and frontend services.
- **Terminal Monogram State (`'not-found'`):** In the 4-Tier iTunes scraper waterfall, `'not-found'` is a legitimate terminal state for underground artists not indexed on iTunes **only after** all 4 tiers (including Tier 3 discography tie-breaking against `discography.length > 0`) have executed.
- The pipeline MUST differentiate between an "Evolved Stub" (`_isStub: true`) and a "Full Cache Hit".
- An ambiguous stub holds `{ _isStub: true, isAmbiguous: true, redirectTo: null, candidates: [...] }`.
- A single-pointer stub holds `{ _isStub: true, isAmbiguous: false, redirectTo: canonicalId, candidates: [...] }`.
- Column 2 cache-loading MUST safely parse and clone cache objects to avoid polluting memory references, strictly deduplicate loaded node IDs, and explicitly verify the presence of populated `graphData`. Stubs lacking graphData MUST route to Generative Topology (`needsProGeneration = true`).
- **Cache Serialization Invariants:**
  - D3 **Link Objects MUST** be safely serialized back to pure strings (e.g., `link.source.id`) before caching `graphData`.
  - `synthesisRationale` **MUST** be written explicitly to the root level of the global artist cache document (not buried inside stringified layers).
  - The "Root Breakdown narrative" MUST be written to the root level of the project document to ensure schema continuity.
  - **Dynamic Dashboard Integrity:** Dashboard metadata (e.g., `deepCuts` count) must dynamically match the rendered nodes in the graph data, prohibiting static placeholders.
  - **Strict Ledger Payload Parity:** The frontend's `buildBaseProjectPayload` MUST defensively omit `generationType` and `apiUsage` from the payload base to prevent the React autosave hook (`merge: true`) from clobbering the backend's precise token metrics and partial generation statuses with default 'Clone' labels.
- **The Fast-Track:** Single unambiguous stubs bypass redundant re-validation and fast-track into Generative Topology, while ambiguous stubs are pre-resolved in Column 1.

### 9. Canonical Seed Slug Resolution via `resolvedSeedNormMap` & `idRewriteMap` (Split-Brain Prevention)
- At the **entry point** of `processCurationJob`, before any Phase 1 cache lookup or hydration loop begins, a `resolvedSeedNormMap` MUST be built by querying Firestore for all existing docs whose `artistId` field starts with each seed's base normalised slug.
- This map resolves the authoritative canonical document ID for each seed (e.g., `"buggin" → "buggin-us"`).
- **All downstream writes in the job — `synthesisRationale`, `graphData`, `detailsCache` — MUST target the canonical ID from this map, not the raw seed string.** Failure to use this map is the direct cause of split-brain writes, where data is fractured across two separate Firestore documents.
- **Pre-computed `idRewriteMap` (Topology Standardization):** Before extracting subgraphs (Fix D), the job MUST compile an `idRewriteMap` resolving raw IDs to their canonical forms. The entire unified `finalGraph`'s nodes and edges MUST be rewritten using this map *before* subgraph extraction occurs.
- The `extractArtistSubGraph` call MUST receive the canonical ID and its result MUST be validated as non-empty before writing. An empty extracted subgraph (`safeExtractedGraph = null`) MUST prevent overwriting a real, populated `graphData` in the canonical document.
- **isCountryEndpoint & Degree-0 Cleanup:** Geographic link reconciliation uses `isCountryEndpoint` to detect and reroute non-canonical country targets (e.g., "usa" -> "united-states"), followed by Degree-0 cleanup that protects valid connected nodes while pruning orphaned singletons.

### 10. Redirect Pointer & Ambiguous Stub Immunity in the Hydration Loop Slug Dedup
- The hydration loop's slug deduplication query (which uses an `artistId` range query to find existing canonical docs) MUST explicitly **skip any document that has a `redirectTo` field set, is marked with `_isStub: true`, or has `isAmbiguous: true`**.
- **Rationale:** Stubs and redirect pointers share identical normalized slug prefixes. Without this guard, the dedup logic adopts a stub or redirect pointer as the canonical ID, looks up an empty `detailsCache`, falls back to external API hydration, and on timeout skips the entire Firestore write — leaving `graphData` permanently empty on the canonical document.
- **Rule:** `if (snapData.redirectTo || snapData._isStub || snapData.isAmbiguous) continue;` is an immutable guard in the slug dedup loop. It must never be removed.

### 11. Validation Reasoning & Escape Hatch Bouncer
- **Human Confirmation Gate:** Requires human confirmation of seed to prevent costly downstream queries. Unrecognizable entities (`isValid: false`) are hard-blocked at the callable boundary to prevent broken stub minting.
- **Escape Hatch Bouncer:** When the user exercises the "Not this artist?" escape hatch, parametric verification is strictly enforced via Flash: if no legitimate artist exists matching the specified origin/genre, the attempt is hard-rejected with an inline UI error to prevent database pollution.
- **Zero Search Grounding:** Native googleSearch grounding tools and external SERP queries MUST remain fully stripped from both the Cloud Run proxy and Firebase Cloud Functions. The architecture relies purely on Gemini 3.6 Flash's parametric memory (abstracted via `GEMINI_FLASH_MODEL`), completely eliminating search grounding surcharges and third-party SERP API dependencies.

### 12. Resilient iTunes Artwork Pipeline
- **Punctuation-Agnostic Normalization:** The iTunes scraper MUST use the punctuation-agnostic normalization rule (`toLowerCase().replace(/[^a-z0-9]/g, '')`) to resolve strict equality naming edge cases (e.g., "Jay Z" vs "JAY-Z").
- **Summary Match Fallback:** If the LLM produces an empty genre string or a highly esoteric subgenre that fails the iTunes master taxonomy, the validator MUST fall back to scanning the artist biography (summary) for core iTunes taxonomy keywords (e.g., "hip", "hop", "rap"). This guarantees 100% hydration while preserving strict homonym protection.

### 13. Auth Handoff Preserver
- If a guest clicks 'Save' on a shared project, the app stashes the ID in session storage to guarantee the clone resumes post-auth.

### 14. Atomic Self-Healing
- Graph breakdowns handle atomic self-healing. Fuzzy fallbacks mitigate strict-coupling vulnerabilities.

### 15. Complex Cache Bypass & Tabula Rasa Gate (`hasActiveDiscoveryFilters`)
- Multi-seed and 3-Tier anchored queries (`hasActiveDiscoveryFilters(filters) === true`) must strictly bypass the Global Topology Cache (Front Gate) and force `needsProGeneration = true` in Column 2 (`executeCurationPipeline.ts`), even if a single seed already has cached `graphData`.
- **Tabula Rasa Gate:** For all Complex Generations, Column 2 strictly bypasses `cachedSubgraphsContext` and `baseGraph` canvas merging to guarantee that Gemini 3.1 Pro generates a clean-slate crossover topology without pre-conditioned bias. Seed identities are locked by passing concise 1-line origin and genre constraints (`disambiguationHints`) derived from Column 1 validation.
- Empty filter arrays (`{ includeGenres: [], anchorLabels: [], includeOrigins: [], excludeOrigins: [] }`) MUST evaluate to `false` via `hasActiveDiscoveryFilters` so unfiltered runs are never misclassified as Complex Generations or blocked from global cache write-back.

### 16. Curation Intercept Guardrails
- **ProjectLoader Guardrails:** The ProjectLoader must strictly bypass Phase 1 interception when a document's status is `curating`. The UI must remain locked and patiently await the backend background worker rather than firing duplicate generative calls.
- **Identity Lock (`isRegeneration`):** During 'Overwrite Existing' (`isRegeneration = true`), the original project name is strictly write-locked. New deep links or explicit forks derive fresh names natively from the seed strings.

### 17. Universal Pre-Flight Stub Minting & Zero Blind Trust
- **The Synchronous Pre-Flight:** Bare stubs (`_isStub: true, isAmbiguous: boolean, candidates: []`) MUST be minted synchronously in Column 1 during the pre-flight phase via `validateSeedOriginCallable` before the backend generation pipeline is triggered. This applies universally to both frontend-resolved partial hits and backend-resolved cache misses.
- **Zero Blind Trust Mandate:** Pre-flight stubs MUST strictly derive from validated Flash candidate payloads. Minting stubs directly from unverified user strings or un-bouncer-checked escape hatch inputs is strictly prohibited to prevent database pollution.
- **Multi-Tenant Disambiguation Contract:** When a collision is detected, the stub holds all potential candidates without prematurely forcing a single `redirectTo` pointer. The user resolves the candidate in Node 4 (`<ConsolidatedValidationModal>`), and the chosen canonical ID is ingested into Column 2.
- **Local Topology Routing Exemption:** Direct cache hits completely bypass the backend, meaning legacy missing stubs are explicitly not healed during direct cache accesses.

### 18. Authorization Lifecycle
- **Rule:** Token/billing authorization state must be strictly scoped to the active generation event. The authorization flag must instantly reset to false on any modal cancellation, API failure, or project unmount to prevent tollbooth bypasses.

### 19. External Link Security
- **Rule:** Official Website and Bandcamp links must rely on deterministic client-side search templates to prevent the AI from hallucinating or routing to malicious squatted domains.

### 20. Mandatory Disambiguation on Direct Hits
- **Rule:** A single-seed Topology Hit (Green Line) MUST NEVER bypass the user confirmation phase. The frontend MUST explicitly trigger the `<DisambiguationModal>` ("Look What I Found") to allow the user to verify the cached entity's origin. 
- **Enforcement:** The system is strictly forbidden from instantly hydrating the state and bypassing this modal. The Green Line hydration route can only execute after explicit confirmation from the `<DisambiguationModal>`. Legacy components (e.g., `CacheChoiceDialog`) are strictly prohibited.
### 21. Locked Semantic Topology & AI Physics Injection
- **Rule:** D3 node dragging gestures are strictly forbidden. The graph operates as a Locked Semantic Topology to ensure mobile panning remains unobstructed and to preserve the calculated semantic clusters.
- **Enforcement:** The D3 layout is strictly driven by the 'Final Node Positioning' step via `gemini-3.6-flash` (abstracted via `GEMINI_FLASH_MODEL`). The AI generates float weights (0.1 to 1.0) using a lean bio payload strategy, which dictate variable link distance, spring rigidity, and collision radii. If the AI model fails or returns an empty array, the pipeline gracefully falls back to injecting a neutral weight of `0.5` across all links to guarantee physics stability.
- **Coordinate Memory Sub-Clause (V8):** Once `simulation.on("end")` fires and all nodes are pinned via `fx`/`fy` in memory, the settled artist and label node positions MUST be persisted back to the owned project document (`users/{uid}/projects/{id}`) via a debounced `updateDoc` targeting the `canvasLayout` field only. This is called **Coordinate Memory**. The debounce window is 5 seconds; a dirty-check prevents redundant writes when the layout is unchanged. Coordinate Memory is strictly scoped to authenticated, non-guest, project-owning sessions. The Share Generation and Duplication pathways are explicitly excluded (see Rule 25).

### 22. Deep-Cut Range Targeting
- **Rule:** The LLM graph generator prompt is explicitly calibrated to aim for a rich spiderweb density (18 to 21 organic related artists).
- **Enforcement:** The model is granted natural flexibility to scale this density down if a more localized or niche musical scene has fewer genuine connections, strictly prohibiting artificial padding or hallucinated filler nodes just to meet a numerical quota.

### 23. Topology Parity Mandate
- **Rule:** Any stylistic, genre, or scene connection explicitly cited in the Root Breakdown narrative (Step 3.1, `generateRootsBreakdownBackend`) MUST have a corresponding edge entry in `finalGraph.links`.
- **Enforcement:** A new `reconcileNarrativeEdges()` step (Step 3.2) in Column 3 (`processCurationJob.ts`) runs immediately after the Root Breakdown narrative is generated and before the ID Rewrite Map is applied. It calls `gemini-3.6-flash` (abstracted via `GEMINI_FLASH_MODEL`) with a structured JSON output schema to extract connections explicitly stated in the narrative that are absent from the current graph topology. Missing edges are injected into `finalGraph.links` and canonicalized by the subsequent ID Rewrite pass. The Semantic Link Weights step (Step 3.3) then evaluates all links, including newly reconciled ones.
- **Deduplication guard:** Before injecting, each candidate edge is checked against the existing link set using the `[source, target].sort().join('--')` key pattern. Duplicate edges are silently discarded.
- **Orphan safety:** The existing orphan-link pruner downstream automatically discards any reconciled edge whose source or target does not match a valid node ID in `finalGraph.nodes`.
- **Failure mode:** If the reconciliation call fails or times out, the step is silently skipped via a `try/catch` with a `console.warn`. The pipeline proceeds with the original `finalGraph.links` intact.

### 24. Verbal Identity
- **Rule:** The Root Breakdown system prompt (`generateRootsBreakdownBackend` in `curatorService.ts`) MUST enforce Zcene's late-night record curator voice. Academic analysis language (e.g., "co-equal cross-analysis", "acoustic dimensions", "chronological intersections") and any regional English constraint (e.g., explicit UK English spellings) are strictly prohibited. The "2 AM record curator" generates 1-sentence epicenter hooks natively within the synthesis phase.
- **Persona:** The curator is the kind of person who knows why a Bristol basement in 1991 changed everything, who connects a Chicago church organ to a Berlin techno floor, and who finds the overlooked B-side that explains an entire scene.
- **Formatting contract:** Active curation verbs only (map, uncover, trace, surface, anchor, explore). Lead with cultural significance and scene context. Discovery over data: prioritize shared producers, venues, hometown scenes, and mutual influences over obvious genre tags. International scope: write for a global audience.
- **Enforcement:** The `systemInstruction` variable in `generateRootsBreakdownBackend` is the single source of truth for voice. Any revert to the prior "expert archivist" persona is a violation of this rule.

### 25. Selective Coordinate Amnesia
- **Rule:** Coordinate amnesia (stripping `x`, `y`, `vx`, `vy`, `fx`, `fy`, `index` from node objects before write) applies **exclusively** to the following two pathways:
  1. **Share Generation pathway** — writes to `/sharedZcenes/{id}` (`handleShareZcene`, `App.tsx` L1809–L1818).
  2. **Duplication / Dashboard Share pathway** — writes to `/sharedZcenes/{id}` from Dashboard (`handleDashboardShareProject`, `App.tsx` L1924–L1929).
- **Owned project documents** (`users/{uid}/projects/{id}`) are explicitly excluded from Coordinate Amnesia. They use **Coordinate Memory** (Rule 21 sub-clause) to persist settled positions.
- **Rationale:** Shared and cloned Zcenes intentionally receive fresh organic D3 layouts because the recipient's viewport dimensions and graph context are unknown at write time. Owned projects retain their settled topology to eliminate re-orientation on re-entry.
- **Enforcement:** The stripping destructure `const { x, y, vx, vy, fx, fy, index, ...cleanNode } = n` is an immutable pattern in share and duplication code paths. It must never be extended to project autosave, canvasLayout writes, or `handleCoordinatesSettled` writes.

### 26. Contextual Tooltips
- **Rule:** Spiderweb node tooltips must prioritize the AI-generated `narrativeSnippet` (epicenter hook) over the encyclopedic `summary` to provide cohesive, web-specific context.

### 27. Unified Generation DNA & Multi-Seed Co-Anchoring (Tabula Rasa & Global Asset Reuse)
- **Rule:** All generation modes (Single-Seed, Multi-Seed, Single-Seed + Anchors, Multi-Seed + Anchors) share the exact same unified prompt DNA, node taxonomy rules, and organic target density philosophy (~18–26 Deep Cuts). Complex Generations operate Tabula Rasa (from a blank slate), dynamically co-anchor both the topological spiderweb and the editorial narrative across all seeds, preventing parametric gravity from collapsing into a single famous entity.
- **Topology Density & Parity Mandate:** Multi-seed topology generation targets 10 to 16 NEW related artists (12 to 18 total artists with seeds). Labels are explicitly excluded from numerical caps and scale organically according to historical authenticity, achieving an overall organic target density of roughly 18 to 26 total Deep Cuts (Artists + Labels), eliminating rigid hallucination quotas.
- **Dual-Structure Architecture:** When multiple seeds are submitted (`seeds.length > 1`), the prompt commands the model to construct two balanced, complementary layers:
  1. *The Crossover Bridge (5 to 6 artists + shared labels/genres):* Identifies authentic bands, imprints, and genres that legitimately connect multiple seeds through shared musical DNA, split releases, shared producers, record labels, or lived touring history.
  2. *Native Ecosystems (4 to 5 distinct scene peers per seed):* Radiates deeply into each seed's authentic regional, temporal, and stylistic ecosystem, giving each seed its own dedicated cluster of 2nd-degree peers and formative scene contemporaries rather than stopping at superficial connections.
- **Upper-Bound Ambition & Anti-Filler Valve:** In fertile, well-documented musical scenes, Gemini 3.1 Pro is explicitly instructed to exercise Upper-Bound Ambition (actively aiming for 13 to 16 new artists). Conversely, a Strict Anti-Filler Valve commands the model to scale down (stopping at 9–10 if sparse; never padding) rather than padding the graph with generic or hallucinated connections if a scene is small or isolated.
- **Global Bio & Asset Reuse Mandate:** All Deep Cuts generated during Tabula Rasa topology generation reuse existing cached profiles from `/artists` and `/labels` in Column 3 (`processCurationJob.ts`), achieving 100% biography, discography, artwork, and media reuse at $0.00 token cost and zero network latency while preserving bespoke multi-seed topology.
- **Editorial Co-Anchoring:** The Magazine Roots Breakdown narrative must weave all input seeds as co-equal foundational pillars.
- **Enforcement:** Enforced in `GENERATE_MULTI_SEED_GRAPH_PROMPT_TEMPLATE` and `GENERATE_GRAPH_PROMPT_TEMPLATE` across `functions/src/services/curatorService.ts` and `services/geminiService.ts`, and verified during Column 3 hydration.

### 28. Canonical Global Caching (Filter Barring)
- **Rule:** Global entity caching (`artists`, `labels`) MUST use pure canonical IDs for document paths (`cleanCanonicalId` / `normalizeLabelId`). 
- **Enforcement:** Ephemeral 3-Tier query filters (e.g., `after:2019`, `before:1995`, `inc_origins:uk`, `exc_origins:us`, `inc_genres:hardcore`, `inc_labels:dischord`) are strictly barred from canonical document paths and stripped via regex prior to global persistence. Composite keys (`buildCompositeCacheKey`) are strictly scoped to session/project cache keys and never pollute `/artists/{id}` or `/labels/{id}` document IDs.
- **Rationale:** Zcene strictly separates bespoke 3-Tier anchored Zcene generation (which lives in ephemeral project topologies) from its canonical global artist and label libraries (which must remain a pure, singular source of truth for all users).

### 29. Universal Payload Serializer
- **Rule:** Project saving and share generation must strictly derive from a single source of truth to guarantee 1:1 data parity (including curation elements like pinned/styled nodes).
- **Share Links Blacklist:** Share links apply a post-serialization blacklist to handle ephemeral environment constraints without risking data omission.
- **Strict Ledger Parity:** `buildBaseProjectPayload` defensively omits worker-owned telemetry fields (`generationType`, `apiUsage`, and `anchorResolution`) during frontend autosave (`merge: true`) to prevent clobbering background worker token costs, generation classification, and 3-Tier resolution telemetry. `labelIds` are normalized via `normalizeLabelId`.
- **Display Name Invariant:** Frontend payload MUST pass a `seedNames` map as the absolute source of truth for display names to prevent backend hallucination.
- **Dashboard Card & UI Isolation:** Dashboard cards & UI consumers must rely solely on the frozen `seedImageUrls` snapshot. Querying the global artists cache for visual assets on isolated projects is strictly prohibited.

### 30. Strict Hydration Lock
- **Rule:** Autosave intervals and listeners MUST be suspended via a global lock during generation cycles to prevent race conditions and partial snapshot overwrites.

### 31. Local State Preemption
- **Rule:** Zero-cost local routing (Direct Hits) must synchronously inject the graph topology into React state before releasing the global lock.

### 32. Validation Circuit Breaker
- **Rule:** The Phase 3 Validation Modal must act as a hard execution stop/return. Failure or dismissal immediately terminates downstream pipeline execution.

### 33. Payload Completeness
- **Rule:** Direct Hit local routing must inject both `graphData` and `detailsCache` simultaneously to prevent post-hydration network lookups or blank inspection panels.

### 34. Cognitive Tiering & Orchestration Stability
- **Rule:** AI generation strictly utilizes the categorical `thinking_level` parameter (minimal to high) to optimize cost-to-quality ratios based on task complexity. Legacy sampling parameters (`temperature`, `top_p`, `top_k`, and `thinking_budget`) are explicitly forbidden in AI orchestration configurations.
- **Enforcement:** Deterministic extraction tasks (e.g., origin validation, edge reconciliation) are strictly locked to `minimal` or `low`. Creative narrative synthesis (e.g., Root Breakdowns) requires a `high` thinking level.
- **Discovery Ledger Rate Pegging:** The Discovery Ledger is permanently pegged to standard non-promotional list rates ($1.50 / 1M input, $7.50 / 1M output) for Gemini 3.6 Flash, strictly ignoring temporary discounts (e.g., 50% promotional pricing) to ensure stable long-term unit cost modeling and billing predictability.
- **API Stability:** The background pipeline jobs officially retain the legacy `generateContent` API. Migration to the stateful Interactions API is formally deferred to preserve single-shot execution stability until multi-turn conversational features are scoped.

### 35. Geographic Asset Disambiguation
- **Rule:** If the deterministic iTunes scraper fails to validate an image asset due to a multi-artist name collision or missing legal alias, the background worker must parse the node's parametric origin data, append the relevant regional suffix (e.g., ' US', ' UK'), and execute a secondary validation query.

### 36. Entity Taxonomy Normalization & Root-as-Router Contract
- **Rule:** The extraction pipeline MUST algorithmically enforce bare root IDs for all global assets. Artists require strict `kebab-case-artist-iso-code` format.
- **Root-as-Router Contract:** Bare IDs (e.g., `gunmoll`) are strictly reserved as routing stubs (`_isStub: true, redirectTo: "id-iso"`) to future-proof against homonyms and MUST NEVER hold entity payloads. All verified entities, whether seeds or deep cuts, must resolve to their geographically suffixed ID (e.g., `artists/gunmoll-us`). Failed parametric verifications are hard-rejected with inline UI errors to prevent database pollution.
- **Label Taxonomy Normalization:** The extraction and hydration pipeline MUST algorithmically strip interchangeable structural suffixes (e.g., `-records`, `-recordings`, `-music`, `-company`, `-group`, `-entertainment`, `-inc`, `-ltd`) while preserving `-media` in label entities via `normalizeLabelId` across hydration, `idRewriteMap`, `labelIds`, composite cache keys, and Level 3 `anchorLabels`. This enforces the Canonical Persistence Mandate by reducing natural LLM variations (e.g., `"Century Media"` and `"Century Media Records"` -> `"century-media"`) to a single, pure root ID.

### 37. JIT Asset Telemetry & Healing (404 Emergency Parachute ONLY)
- **Separation of Powers & Anti-Sweep Law:** The JIT Asset Healer (`healOrphanedAsset`) is strictly an **emergency parachute triggered ONLY by true 404 cache misses** (or corrupted profiles failing `isFullyQualifiedEntityProfile`) on inspected nodes during live canvas exploration or post-generation eager hydration.
- **Strict Prohibition of Background Sweeping:** Automated background cron-sweeps, scheduled cloud tasks, or janitorial scanners for soft-expired data are strictly forbidden. Stale datasets (> 365 days) do NOT trigger the JIT Healer. Refreshes of stale data occur strictly when intersected and funded by a natural user-initiated generation.
- **Enforcement:**
  1. **Local Pre-Check:** The trigger MUST verify against local `detailsCacheRef.current` and generation state before querying the network to prevent redundant invocations.
  2. **In-Flight Memory Lock:** Duplicate requests for the same entity slug MUST be suppressed via an in-flight set lock (`inFlightHealsRef`).
  3. **100% Complete Repair & Write Gate:** The healer MUST synthesize a full deep cut profile using identical Gemini schemas (`NODE_DETAILS_SCHEMA`), `thinking_level`, and 4-Tier iTunes scraping parity, and verify `isFullyQualifiedEntityProfile` before writing to Firestore.
  4. **Circuit Breakers & Telemetry:** Execution is strictly gated by the global 100-heal/24h circuit breaker and admin override (`adminLedger/system/settings.jitEnabled`). Every heal records micro-cost token and USD receipts to `adminLedger/system/jitHeals`.

### 38. 4-Tier Asset Disambiguation Waterfall
- **Rule:** Image asset validation (`scrapeImageUrlBackend`) MUST execute as a strict 4-tier waterfall across Column 3 background hydration (`processCurationJob.ts`) and JIT healing (`healOrphanedAsset.ts`), enforcing the platform mandate: *we would rather have no image than the wrong image*.
- **Waterfall Cascade:**
  1. **Tier 1 (Strict Match):** Query exact artist name. Pass if exact name match AND genre passes whole-word taxonomy (`\b` regex boundary). If $>1$ candidates pass, escalate to Tier 3 to prevent homonym guessing (V1 guard).
  2. **Tier 2 (Geographic Fallback):** If Tier 1 produces zero matches or fails taxonomy, append regional ISO suffix (e.g., `'Darko US'`) and query iTunes. Pass if exact full-term match and taxonomy pass.
  3. **Tier 3 (Discography Tie-Breaker & Title Resilience):** Cross-reference candidates against the verified 3.1 Pro / 3.6 Flash discography array (`discography?: DiscographyItem[]`). Uses fuzzy prefix/substring matching ($\ge 10$ chars, or $\ge 6$ chars with $\pm 1\text{yr}$ release correlation) and distinctive token overlap ($\ge 2$ tokens, or 1 token $\ge 6$ chars with $\pm 1\text{yr}$ release correlation). Excludes self-titled albums (`norm === normArtist`) and generic titles (`GENERIC_ALBUM_TITLES`) on both Zcene inputs and candidate albums. Deduplicates matched albums by unique Zcene title to prevent Deluxe/Remaster edition inflation. Limit to $\le 5$ candidates executed in parallel (`Promise.allSettled`) bounded by a 2,500ms `AbortController` timeout. Require $\ge 1$ strong multi-word title or $\ge 2$ distinct matches. Pass if exactly 1 candidate verified; reject if 0 or $>1$ (ambiguous).
  4. **Tier 4 (Fail-Fast Reject / Terminal Monogram):** Unverified lone wolves, underground artists absent from iTunes, and discography ties return `null` -> caller records `imageUrl = 'not-found'`. Once all 4 tiers have run against a valid non-empty `discography` (`discography.length > 0`), `'not-found'` is a valid terminal monogram state. Never inject unverified homonym artwork.

### 39. Deterministic Metadata Projection & Pod Genre Affinity
- **Rule:** Column 3 background worker (`processCurationJob.ts`) executes a deterministic enrichment pass (Step 4B) prior to Degree-0 cleanup, guaranteeing that 100% of generated artists (including secondary/recommended bridging artists in multi-seed generations) are wired to valid Country, Founded, and Genre nodes.
- **Enforcement:**
  1. **Snapshot Iteration Safety:** Iterates over a pre-filtered snapshot of artist nodes (`artistNodesSnapshot`), preventing infinite loops or skipping from in-place node array growth.
  2. **Deterministic Country Projection:** Normalizes parametric origin (`extractCountrySlug`), reroutes any non-canonical country targets via `isCountryEndpoint`, ensures the canonical country node exists, and injects missing artist-to-country edges (`weight: 0.2`). Syncs `existingLinkSet` bidirectionally.
  3. **Deterministic Chronological Projection:** Extracts 4-digit formation years (`/\b(19\d\d|20\d\d)\b/`) from hydrated metadata, instantiates missing `founded` nodes, and injects missing artist-to-year edges (`weight: 0.3`).
  4. **2-Tier Pod Genre Affinity:**
     - *Tier 1 (Pod Scene Affinity):* If any candidate genre from `meta.genre` shares a root stem/token with an existing genre node in the artist's seed pod cluster, wires the artist directly to that existing genre node (`weight: 0.8`), preserving tight D3 visual scene clustering.
     - *Tier 2 (Scene Divergence):* If there is zero token overlap with the pod's existing genres, mints a new divergent genre node with the artist's pod group and links it (`weight: 0.8`).
  5. **Weight Preservation Guard:** In Node 5 (`generateSemanticLinkWeights`), pre-set link weights (0.2 Country, 0.3 Founded, 0.8 Genre) are preserved if unscored by Flash, preventing neutral 0.5 clobbering.

### 40. Synthesis Rationale & Deep Cut Integrity (Read/Write Gates)
- **Rule:** A Direct Hit (Topology Hit) in Zcene cannot exist without an editorial Roots Breakdown (`synthesisRationale >= 50` chars), and a global Deep Cut cache entry (`/artists/{id}`, `/labels/{id}`) cannot exist without passing `isFullyQualifiedEntityProfile(profile, isLabel)`. Global caches must never be poisoned by partial, timed-out, or prose-fallback generation runs.
- **Enforcement:**
  1. **The Read Gate (`cacheQualification.ts`, `executeCurationPipeline.ts`, `processCurationJob.ts`, `healOrphanedAsset.ts`):** `qualifyCacheEntry` strictly validates `synthesisRationale >= 50` chars AND `isFullyQualifiedEntityProfile` (`summary > 50` chars, non-empty `genre`/`origin`/`founded`, `discography.length > 0` for artists, non-empty `imageUrl` including valid terminal `'not-found'`, and authentic `recommendationReason` free of `"Synthesised from live cultural archives"`). Any cached document failing `isFullyQualifiedEntityProfile` is treated as a cache miss and re-hydrated via Gemini 3.6 Flash + 4-Tier iTunes waterfall.
  2. **The Write Gate (`processCurationJob.ts` & `healOrphanedAsset.ts`):** In Step 6 atomic transactions and proactive recommendation persistence, `hasUniqueSpiderweb: true` and `graphData` writes are strictly barred unless `finalGraph.synthesisRationale` is $\ge 50$ characters, and global Deep Cut `detailsCache` writes are strictly barred unless `isFullyQualifiedEntityProfile(details, isLabel)` passes. Corrupted or prose-fallback stubs are dropped with a warning rather than polluting `/artists` or `/labels`.
  3. **Resilient 90s Fallback (`curatorService.ts`):** Step 3 `generateRootsBreakdownBackend` bounds primary Gemini 3.1 Pro Preview synthesis by a 90-second timeout. Upon timeout or 504/503/429 errors, it instantly engages a resilient fallback to `gemini-3.6-flash` (`thinking_level: low`, 45s timeout) using the identical schema, guaranteeing 100% essay and epicenter hook completion.
  4. **Border-Town Country Normalization & ISO Suffix Priority:** `extractCountrySlug` pre-splits multi-origin strings on `/` (e.g., `"La Calamine, Belgium / Kelmis, Germany"` -> `"be"`). In Step 4B, artist node IDs ending with a recognized ISO suffix (e.g., `nasty-be` -> `be`) lock canonical country resolution to that ISO code, preventing conflicting free-text parsing from detaching verified entities.

### 41. 3-Tier Anchor Hierarchy & Dual-Layer Scene Gravity
- **Rule:** Zcene's generation engine enforces a strict 3-Tier Anchor System (`DiscoveryFilters`), completely eradicating open-ended free-text prompt instructions (`additionalInstructions`) in favor of structured, deterministic constraints, and separating **Editorial Narrative Context** from **Topological Truth**.
- **Enforcement:**
  1. **Level 1 (Artist Seeds — Sacred Genesis):** Primary seed artists hold absolute immunity across both Gemini prompt synthesis and post-processing pruning. Even if a seed's native formation year or country lies outside Level 2 guardrails, the seed remains anchored on the canvas and the engine maps its cross-era or cross-border lineage inside the target window.
  2. **Level 2 (Hard Spatial & Temporal Guardrails):** Bounded Era Slider (`1965–2026`, inclusive `<` and `>` year bounds; unfiltered only when both thumbs rest at `1965` and `2026`) and 22 Canonical Countries (`CANONICAL_COUNTRIES_22` with mutually exclusive `Include | Exclude` toggle). Enforced at three gates: Gemini 3.1 Pro prompt rules, Column 2 post-processing (`curatorService.ts`), and Column 3 **Step 2B Post-Hydration Boundary Audit** (`processCurationJob.ts`) prior to Step 3 Magazine synthesis (so boundary violators are excised from both `finalGraph` and `detailsCacheEntries` before prose generation).
  3. **Level 3 (Dual-Layer Scene Gravity & Granular Telemetry):** Canonical Genres (`CANONICAL_GENRE_TAXONOMY`) and Creatable Anchor Labels (`anchorLabels`, normalized via `normalizeLabelId`). Treated strictly as soft gravitational pulls—never hard client or server node-deletion gates. When a Level 3 anchor (such as a 1990s label) has no factual signings among bands founded inside the Level 2 era window, the engine weaves that label as sonic/historical gravity in the Editorial Narrative while refusing to hallucinate false graph edges, and records strict physical-node `anchorResolution` telemetry (`"Tier 1 + Tier 2 + Tier 3 (Full Parity)"`, `"Tier 1 + Tier 2 + Tier 3 (Genre Applied; Label Bypassed — Narrative Gravity Only)"`, `"Tier 1 + Tier 2 + Tier 3 (Label Applied; Genre Bypassed — Narrative Gravity Only)"`, or `"Tier 1 + Tier 2 Applied (Tier 3 bypassed due to boundary conflict)"`).


