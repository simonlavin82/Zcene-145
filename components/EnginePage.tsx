import React, { useState, useEffect, useRef } from 'react';
import { View } from '../types';
import { ZceneLogo } from './Icons';
import Header from './Header';
import Markdown from 'react-markdown';
import { Terminal, ChevronDown, ChevronRight } from 'lucide-react';
import { BACKEND_REGRESSION_RUNBOOK } from '../docs/backend-regression-runbook';

interface SourcePageProps {
    onNavigate: (view: View) => void;
    isActive: boolean;
    profile: any;
    onUpdateProfile: (updates: any) => void;
    user: any;
    onLogoClick: () => void;
    isSmallScreen: boolean;
    stackCount: number;
    isStackNew: boolean;
    onOpenStack: () => void;
    onLogout: () => void;
    onDeleteAccount: () => void;
    isAdmin?: boolean;
    isProfileOpen: boolean;
    setIsProfileOpen: (open: boolean) => void;
    isDeleteAccountModalOpen: boolean;
    setIsDeleteAccountModalOpen: (open: boolean) => void;
    isMenuOpen: boolean;
    setIsMenuOpen: (open: boolean) => void;
    onRestartWalkthrough?: () => void;
    onClose?: () => void;
    onNavigateMenu?: (path: string) => void;
}

const ARCHITECTURE_RULES = [
    { 
        id: 1, 
        title: "Client-Side ISO Fallback", 
        desc: "Strips ISO-3166-1 alpha-2 codes (-uk, -gb) to gracefully cascade into bare ID lookups." 
    },
    { 
        id: 2, 
        title: "Slugging Reasoning", 
        desc: "Prevents namespace collisions. Enforces ISO mapping via COUNTRY_ISO_MAP (e.g., Scotland → GB)." 
    },
    { 
        id: 3, 
        title: "Fuzzy Origin Fallback", 
        desc: "If exact cache misses, server executes fuzzy rescue query on bareId to retrieve canonical doc." 
    },
    { 
        id: 4, 
        title: "Sanitization Intercept", 
        desc: "Canonical Alias Dictionary intercepts raw LLM data at normalizeGraphData to correct hallucinations." 
    },
    { 
        id: 5, 
        title: "Schema Rule", 
        desc: "synthesisRationale MUST be written to root level of the Firestore artist document, not nested." 
    },
    { 
        id: 6, 
        title: "Stub Bypass (Fast-Track)", 
        desc: "Unambiguous stubs bypass validation. Ambiguous stubs (isAmbiguous: true) MUST route to Node 4 for human candidate selection." 
    },
    { 
        id: 7, 
        title: "State Hydration Rule", 
        desc: "Ensure detailsObj state explicitly pulls synthesisRationale on mount for both fresh/cached hits." 
    },
    { 
        id: 8, 
        title: "Grounding / Scraper Logic", 
        desc: "Search API eradicated; relies on parametric memory. iTunes scraper upgraded for 100% fallback." 
    },
    { 
        id: 9, 
        title: "Post-Hydration Reconciliation", 
        desc: "Worker rewrites hallucinated IDs to canonical slugs, reroutes legacy country endpoints ('usa' → 'united-states') via isCountryEndpoint, and prunes Degree-0 ghost nodes." 
    },
    { 
        id: 10, 
        title: "Guest Hydration Fallback", 
        desc: "Logged-out guests bypass standard API; UI dynamically runs batchHydrateDetailsCache to fetch metadata." 
    },
    { 
        id: 11, 
        title: "Validation Reasoning & Escape Hatch Bouncer", 
        desc: "Requires human confirmation of seed to prevent costly AI pipeline runs on acronyms or typos. The 'Not this artist?' manual escape hatch MUST NOT bypass validation. Any user-injected origin or genre hints must trigger a synchronous Flash 3.6 re-query. Overrides that fail parametric verification are hard-rejected with inline UI errors to prevent database pollution." 
    },
    { 
        id: 12, 
        title: "Eager Pre-Hydration", 
        desc: "Strictly preserves eager batch hydration to guarantee 100% data fidelity for tooltips instantly." 
    },
    { 
        id: 13, 
        title: "Auth Handoff Preserver", 
        desc: "If a guest clicks 'Save', app stashes ID in session storage to guarantee clone resumes post-auth." 
    },
    { 
        id: 14, 
        title: "Atomic Self-Healing", 
        desc: "Graph breakdowns handle atomic self-healing. Fuzzy fallbacks mitigate strict-coupling vulnerabilities." 
    },
    { 
        id: 15, 
        title: "Complex Cache Bypass", 
        desc: "Multi-seed and 3-Tier anchored queries (hasActiveDiscoveryFilters === true) must strictly bypass the Global Topology Cache (Front Gate) and force needsProGeneration = true in Column 2 even if a single seed has cached graphData. Empty filter arrays evaluate to false so unfiltered runs are never misclassified." 
    },
    { 
        id: 16, 
        title: "Curation Intercept Guardrails", 
        desc: "ProjectLoader must strictly bypass Phase 1 interception when a document's status is 'curating'. During 'Overwrite Existing' (isRegeneration = true), the original project name is strictly write-locked." 
    },
    { 
        id: 17, 
        title: "Universal Pre-Flight Stub Minting", 
        desc: "Pre-flight alias resolution MUST synchronously mint evolved stubs (_isStub: true, isAmbiguous: boolean, candidates: []) to Firestore before background job creation. Stubs MUST ONLY be minted from verified Flash candidate payloads or verified cache hits. Minting stubs directly from unverified raw user strings is strictly prohibited." 
    },
    { 
        id: 18, 
        title: "Authorization Lifecycle", 
        desc: "Token/billing authorization state must be strictly scoped to the active generation event. The authorization flag must instantly reset to false on any modal cancellation, API failure, or project unmount to prevent tollbooth bypasses." 
    },
    { 
        id: 19, 
        title: "External Link Security", 
        desc: "Official Website and Bandcamp links must rely on deterministic client-side search templates to prevent the AI from hallucinating or routing to malicious squatted domains." 
    },
    { 
        id: 20, 
        title: "Mandatory Disambiguation on Direct Hits", 
        desc: "Green Line MUST NEVER bypass the user confirmation phase." 
    },
    { 
        id: 21, 
        title: "Locked Topology & Coordinate Memory", 
        desc: "Node positions are strictly derived from AI-evaluated link weights. Direct D3 node dragging is permanently disabled. Settled (fx, fy) coordinates are persisted to the owned project's canvasLayout (5s debounce) to permanently lock orientation." 
    },
    { 
        id: 22, 
        title: "Deep Cloning Isolation", 
        desc: "Duplication must execute a deep, disconnected 1:1 clone of the entire project object (including topology, seeds, style profiles, and Deep Cuts). The cloned dataset must operate on a newly minted Project ID and append a copy identifier to the project name to ensure future localized edits never mutate the original canonical document." 
    },
    { 
        id: 23, 
        title: "Topology Parity Mandate", 
        desc: "Any connection explicitly cited in the Root Breakdown narrative MUST have a corresponding physical edge in the graph. Mechanically enforced prior to Final Node Positioning." 
    },
    { 
        id: 24, 
        title: "Verbal Identity", 
        desc: "The Root Breakdown system prompt must enforce the \"late-night record curator\" voice. Academic language and regional English constraints are strictly prohibited." 
    },
    { 
        id: 25, 
        title: "Selective Coordinate Amnesia", 
        desc: "When generating a shared link, fixed coordinates (fx, fy) are intentionally stripped so guests experience a fresh, organic D3 layout. This is a post-serialization mutation strictly applied to ephemeral guest links." 
    },
    { 
        id: 26, 
        title: "Contextual Tooltips", 
        desc: "Hover states and tooltips must prioritize native narrative snippets (node.narrativeSnippet) generated during the Root Breakdown over generic database summaries. This ensures tooltips reinforce specific editorial relationships without requiring post-generation extraction. Edge relationships must natively output bi-directional phrasing to prevent frontend verb-flipping." 
    },
    { 
        id: 27, 
        title: "Multi-Seed Co-Anchoring", 
        desc: "Complex Generations (multi-seed) MUST dynamically force the AI to co-anchor the narrative. The essay must explore the relationship, contrast, or shared DNA between all seeds, strictly preventing parametric gravity from allowing one famous entity to dominate the story." 
    },
    { 
        id: 28, 
        title: "Canonical Persistence Mandate", 
        desc: "Global asset persistence (artists, labels, genres) must exclusively use the pure, canonical ID (e.g., 'spaced-us', normalizeLabelId). Ephemeral 3-Tier query constraints (after, before, inc_origins, exc_origins, inc_genres, inc_labels) belong exclusively to the live Project lifecycle and must never be appended to global cache document keys or DB paths to prevent cache fracturing." 
    },
    { 
        id: 29, 
        title: "Universal Payload Serializer", 
        desc: "Project saving and share generation must strictly derive from a single source of truth to guarantee 1:1 data parity (including curation elements like pinned/styled nodes). Share links apply a post-serialization blacklist to handle ephemeral environment constraints without risking data omission. Strict Ledger Parity: buildBaseProjectPayload defensively omits generationType, apiUsage, and anchorResolution during frontend autosave (merge: true) to prevent clobbering background worker token costs, labeling, and 3-Tier telemetry. Frontend payload MUST pass a seedNames map as the absolute source of truth for display names to prevent backend hallucination. Dashboard cards & UI consumers must rely solely on the frozen seedImageUrls snapshot." 
    },
    { 
        id: 30, 
        title: "Strict Hydration Lock", 
        desc: "Autosave intervals and database snapshot listeners (e.g., ProjectLoader) MUST be strictly suspended via a global lock (isHydratingSessionRef = true) the moment a seed is submitted, and must remain locked while the Validation Modal is open to prevent partial-state database leaks." 
    },
    { 
        id: 31, 
        title: "Local State Preemption", 
        desc: "Zero-cost local routing (applyLocalTopologyHit) must synchronously inject the constructed graph into the local React state (setGraphData) before releasing the Hydration Lock. This guarantees that when background sync resumes, local memory matches database state, preventing destructive overwrites." 
    },
    { 
        id: 32, 
        title: "Validation Circuit Breaker", 
        desc: "Triggering the Phase 3 Validation Modal must act as a hard execution stop (return;). Pass 1 must completely terminate when the modal opens to prevent background database minting before the user explicitly confirms." 
    },
    { 
        id: 33, 
        title: "Payload Completeness", 
        desc: "Direct Hit local routing must inject both the graphData (topology) AND the detailsCache (metadata) simultaneously. Partial payloads will trigger legacy hydration fallbacks, causing a mass network proxy barrage." 
    },
    { 
        id: 34, 
        title: "Cognitive Tiering & Orchestration Stability", 
        desc: "All 7 AI touchpoints strictly operate on categorical thinking_level mapping (minimal to high) via the legacy generateContent API. Flash-tier touchpoints dynamically resolve to GEMINI_FLASH_MODEL (target: gemini-3.6-flash). Custom sampling parameters (temperature, top_p, top_k, thinking_budget) are strictly prohibited. Discovery Ledger accounting is permanently pegged to standard list prices ($1.50/1M input, $7.50/1M output), ignoring promotional discounts to preserve margin integrity. Interactions API migration is deferred until conversational features are scoped." 
    },
    { 
        id: 35, 
        title: "Geographic Asset Disambiguation", 
        desc: "If the deterministic iTunes scraper fails to validate an image asset due to a multi-artist name collision or missing legal alias, the background worker must parse the node's parametric origin data, append the relevant regional suffix (e.g., ' US', ' UK'), and execute a secondary validation query." 
    },
    { 
        id: 36, 
        title: "Entity Taxonomy Normalization", 
        desc: "The extraction pipeline MUST algorithmically enforce pure root IDs for all global assets. Artists require strict kebab-case-artist-iso-code formatting. To future-proof against homonyms, bare IDs (e.g., 'gunmoll') are strictly reserved as routing stubs and must never hold entity payloads. All verified entities, whether seeds or deep cuts, must resolve to their geographically suffixed ID. Label taxonomy normalizations (normalizeLabelId) strip structural suffixes (-records, -music, -recordings, -discos, -platen, -label, etc.) down to pure root IDs across hydration, idRewriteMap, labelIds, and Level 3 anchorLabels." 
    },
    { 
        id: 37, 
        title: "JIT Asset Telemetry & Healing", 
        desc: "Missing Deep Cuts discovered during eager hydration or direct clicks must first verify against the localized project detailsCache. If a genuine global and local miss occurs, and the project generation is fully completed, trigger a secondary background synthesis to repair the global cache with 100% complete payloads. The healing payload must pass all standard entity taxonomy normalizations. In-flight duplicate triggers MUST be suppressed via a memory dedup lock. The backend must record granular token usage and calculated micro-cost receipts to adminLedger for Admin Discovery Ledger auditing. JIT Healer acts strictly as a 404 emergency parachute for non-existent graph nodes. Stale or soft-expired assets (>365 days) are strictly air-gapped from JIT Healing and require user-subsidized generation runs to refresh. Circuit breaker caps daily exposure at 100 heals/24h." 
    },
    { 
        id: 38, 
        title: "4-Tier Asset Disambiguation Waterfall", 
        desc: "Third-party media scraping executes a 4-tier cascade: (1) Strict whole-word taxonomy match (homonyms escalate to Tier 3), (2) Geographic suffix fallback, (3) Resilient Discography Tie-Breaker (exact, substring, or prefix/distinctive-token overlap ± 1yr release correlation; blocks self-titled/generic titles and deduplicates Deluxe editions), (4) Fail-fast rejection to 'not-found'." 
    },
    { 
        id: 39, 
        title: "Deterministic Metadata Projection & Pod Genre Affinity", 
        desc: "Prior to Final Node Positioning, the worker deterministically projects verified Country and Founded (YYYY) links from detailsCache onto 100% of artist nodes. Missing genre links resolve via 2-Tier Pod Affinity: wiring artists to their group's existing seed genre node on shared stylistic stems to prevent cross-pod D3 gravity bridges, or minting a divergent subgenre node." 
    },
    { 
        id: 40, 
        title: "Synthesis Rationale Integrity & Direct Hit Read/Write Gates", 
        desc: "Direct Hits strictly require a non-empty synthesisRationale (>= 50 chars) at both the Read Gate (qualifyCacheEntry) and Write Gate (Step 5/6 Self-Heal). If Step 3 Root Breakdown exceeds 90s or throws 504, execution immediately fails over to 3.6 Flash (low) so no seed is ever persisted with a null editorial. Step 4B locks canonical ISO artist suffixes (-be) over slash-separated border-town origins." 
    },
    { 
        id: 41, 
        title: "3-Tier Anchor Hierarchy & Dual-Layer Scene Gravity", 
        desc: "Enforces a strict 3-Tier Anchor System: Tier 1 (Artist Seeds — Sacred Genesis, immune to secondary filters), Tier 2 (Hard Spatial & Temporal Guardrails: 1965–2026 Era Slider & 22 Canonical Countries with Include/Exclude toggle and cross-era lineage authorization), and Tier 3 (Dual-Layer Scene Gravity: Canonical Genres & Creatable Anchor Labels). Separates Editorial Narrative Context from Topological Truth: Step 2B executes the Level 2 Post-Hydration Boundary Audit BEFORE Step 3 Magazine synthesis so boundary violators are pruned prior to prose generation, while anchorResolution strictly evaluates physical graph nodes with granular partial Tier 3 telemetry (e.g., Genre Applied; Label Bypassed — Narrative Gravity Only)." 
    }
];

const DiscoveryFlowDiagram: React.FC = () => (
    <div className="w-full py-6 px-4 bg-zinc-950/50 rounded-xl border border-zinc-800 mb-8">
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_auto_1fr_auto_1fr_auto_minmax(240px,300px)] items-stretch justify-center gap-3 px-1">
            
            {/* Column 1: React UI */}
            <div className="flex flex-col flex-1 min-w-0">
                <div className="p-4 rounded-xl border border-zinc-700 bg-zinc-900/80 h-full flex flex-col justify-between">
                    <div>
                        <div className="text-primary text-[10px] font-mono mb-1 uppercase tracking-wider font-semibold">Column 1</div>
                        <div className="text-white font-medium text-sm mb-3">React UI</div>
                        <ul className="text-[11px] text-zinc-400 space-y-3">
                            <li>
                                <span className="text-primary font-medium">Submit Seed(s) + 3-Tier Anchors:</span> Evaluates <code>hasActiveDiscoveryFilters</code> (ignoring empty arrays). Unfiltered single-seed Direct Hits bypass the backend; Multi-Seed / 3-Tier Anchored queries route to Complex Generation.
                            </li>
                            <li>
                                <span className="text-primary font-medium">Front Gate Cache Guard:</span> Bypasses network if a complete cache doc exists. Topology hits route through <code>&lt;DisambiguationModal&gt;</code> to verify origin.
                            </li>
                            <li>
                                <span className="text-primary font-medium">Flash 3.6 Collision Detection:</span> Calls <code>validateSeedOriginCallable</code> (<code>thinking_level: minimal</code>, Zero Search Grounding). Synchronously detects homonyms and mints 1-to-many Evolved Stub contracts.
                            </li>
                            <li>
                                <span className="text-primary font-medium">Confirm Artists & Escape Hatch Bouncer:</span> <code>&lt;ConsolidatedValidationModal&gt;</code> presents locked cards, disambiguation radio, and the "Not this artist?" escape hatch.
                                <ul className="list-disc pl-4 mt-1 space-y-1 text-zinc-500 text-[10px]">
                                    <li><span className="text-zinc-300">Re-Query Bouncer:</span> User custom hints trigger synchronous Flash 3.6 re-verification.</li>
                                    <li><span className="text-zinc-300">Zero-Pollution Rejection:</span> Unverified inputs rejected inline with error banner; zero unverified stubs written.</li>
                                    <li><span className="text-zinc-300">Verified UI Lock:</span> Generation locked until all cards are verified or reverted.</li>
                                </ul>
                            </li>
                            <li>
                                <span className="text-primary font-medium">API Confirmation:</span> <code>&lt;TokenConfirmationModal&gt;</code> intercepts generation to authorize API token spend.
                            </li>
                            <li>
                                <span className="text-primary font-medium">Active Loader Gate:</span> Locks UI completely; drops only when Column 3 sets job status to 'completed'.
                            </li>
                        </ul>
                    </div>
                </div>
            </div>

            {/* Arrow */}
            <div className="hidden xl:flex flex-col justify-center items-center">
                <span className="material-symbols-outlined text-zinc-600 text-sm">arrow_forward</span>
            </div>
            
            {/* Column 2: HTTP Fast-Track */}
            <div className="flex flex-col flex-1 min-w-0">
                <div className="p-4 rounded-xl border-2 border-primary/80 bg-zinc-900/60 h-full shadow-[0_0_15px_rgba(255,255,255,0.02)] flex flex-col justify-between">
                    <div>
                        <div className="text-primary text-[10px] font-mono mb-1 uppercase tracking-wider font-semibold">Column 2 (Synchronous)</div>
                        <div className="text-white font-medium text-sm mb-3">HTTP Fast-Track</div>
                        <ul className="text-[11px] text-zinc-400 space-y-3">
                            <li>
                                <span className="text-primary font-medium">1. Ingest Validated Payload, Sanitize 3-Tier Anchors & Zero Blind Trust</span>
                                <ul className="list-disc pl-4 mt-1 space-y-1 text-zinc-500 text-[10px]">
                                    <li>Sanitizes <code>payload.filters</code> via <code>sanitizeDiscoveryFilters</code> (1965–2026 era bounds, mutual origin exclusion, strips <code>additionalInstructions</code>).</li>
                                    <li>Forces <code>needsProGeneration = true</code> when <code>hasActiveDiscoveryFilters</code> is true.</li>
                                    <li><span className="text-zinc-300">Zero Blind Trust:</span> Rejects blind stub minting; slugs strictly derive from verified Flash candidate payloads.</li>
                                </ul>
                            </li>
                            <li>
                                <span className="text-primary font-medium">2 & 3. Create Topology (3.1 Pro) | 3-Tier Anchor Hierarchy ([Rule 41])</span>
                                <ul className="list-disc pl-4 mt-1 space-y-1 text-zinc-500 text-[10px]">
                                    <li>Splits prompt into Tier 1 Seed Immunity, Tier 2 Hard Era/Origin Guardrails (cross-era lineage allowed), and Tier 3 Soft Genre/Label Gravity.</li>
                                    <li>Executes Rule 41 Graceful Degradation fallback retry (Tier 1 + Tier 2) if 0 non-seed artists survive Tier 3.</li>
                                </ul>
                            </li>
                            <li>
                                <span className="text-primary font-medium">Root-as-Router Contract (Node 17)</span>
                                <ul className="list-disc pl-4 mt-1 space-y-1 text-zinc-500 text-[10px]">
                                    <li>Bare IDs (<code>gunmoll</code>) minted exclusively as <code>_isStub: true</code> forwarders (<code>redirectTo: "id-iso"</code>).</li>
                                    <li>Verified payloads (bio, graph, details) reside strictly at suffixed IDs (<code>artists/gunmoll-us</code>).</li>
                                    <li>Bare IDs permanently reserved as routers to future-proof against homonyms.</li>
                                </ul>
                            </li>
                            <li>
                                <span className="text-primary font-medium">Saves Baseline & Handoff:</span> Persists baseline topology to Firestore, returns HTTP 200 OK, and creates curation job.
                            </li>
                        </ul>
                    </div>
                </div>
            </div>

            {/* Arrow */}
            <div className="hidden xl:flex flex-col justify-center items-center">
                <span className="material-symbols-outlined text-zinc-600 text-sm">arrow_forward</span>
            </div>

            {/* Column 3: Background Worker */}
            <div className="flex flex-col flex-1 min-w-0">
                <div className="p-4 rounded-xl border border-zinc-700 bg-zinc-900/80 h-full flex flex-col justify-between">
                    <div>
                        <div className="text-primary text-[10px] font-mono mb-1 uppercase tracking-wider font-semibold">Column 3 (Asynchronous)</div>
                        <div className="text-white font-medium text-sm mb-3">Background Worker</div>
                        <ul className="text-[11px] text-zinc-400 space-y-3">
                            <li>
                                <span className="text-primary font-medium">2. Hydrate Node Batch | 3.6 Flash (low)</span>
                                <ul className="list-disc pl-4 mt-1 space-y-1 text-zinc-500 text-[10px]">
                                    <li>Global Cache Hit: Attaches existing Deep Cut (labels normalized via <code>normalizeLabelId</code>).</li>
                                    <li>Miss: Synthesizes via 3.6 Flash & 4-Tier iTunes scraper.</li>
                                    <li>Slug deduplication ignores stubs; injects pre-generated seed stubs on timeout.</li>
                                </ul>
                            </li>
                            <li>
                                <span className="text-primary font-medium">2B. Level 2 Post-Hydration Boundary Audit ([Rule 41])</span>
                                <ul className="list-disc pl-4 mt-1 space-y-1 text-zinc-500 text-[10px]">
                                    <li>Audits hydrated non-seed artists against Level 2 Era/Origin guardrails BEFORE Step 3 synthesis, excising boundary violators from both <code>finalGraph</code> and <code>detailsCacheEntries</code>.</li>
                                </ul>
                            </li>
                            <li>
                                <span className="text-primary font-medium">3. Root Breakdown | 3.1 Pro (high) + 3-Tier Lineage Framing</span>
                                <ul className="list-disc pl-4 mt-1 space-y-1 text-zinc-500 text-[10px]">
                                    <li>Synthesizes narrative in 2 AM record curator voice, weaving active Tier 2 & Tier 3 anchors.</li>
                                    <li>Outputs structured JSON with markdown, 1-sentence hooks, and bi-directional edge context.</li>
                                    <li>90s timeout fallback to 3.6 Flash prevents 504 DEADLINE_EXCEEDED errors.</li>
                                </ul>
                            </li>
                            <li>
                                <span className="text-primary font-medium">Step 4A: Topology Parity | 3.6 Flash (minimal)</span>
                                <ul className="list-disc pl-4 mt-1 space-y-1 text-zinc-500 text-[10px]">
                                    <li>Injects missing narrative connections into graph edges via <code>reconcileNarrativeEdges</code>.</li>
                                </ul>
                            </li>
                            <li>
                                <span className="text-primary font-medium">Step 4B: Deterministic Enrichment & Degree-0 Cleanup</span>
                                <ul className="list-disc pl-4 mt-1 space-y-1 text-zinc-500 text-[10px]">
                                    <li>Wires Country, Founded, and 2-Tier Pod Genre nodes before Degree-0 cleanup and strict physical-node <code>anchorResolution</code> evaluation.</li>
                                </ul>
                            </li>
                            <li>
                                <span className="text-primary font-medium">Final Node Positioning | 3.6 Flash (minimal)</span>
                                <ul className="list-disc pl-4 mt-1 space-y-1 text-zinc-500 text-[10px]">
                                    <li>Evaluates bios to generate semantic link weights (0.1–1.0) with Weight Preservation Guard.</li>
                                </ul>
                            </li>
                            <li>
                                <span className="text-primary font-medium">Persist Assets, Status & Telemetry:</span> Commits graph, breakdown, link weights, and <code>anchorResolution</code> telemetry. Updates job status to 'completed'.
                            </li>
                            <li>
                                <span className="text-primary font-medium">Node 36: JIT Asset Healer (3.6 Flash)</span>
                                <ul className="list-disc pl-4 mt-1 space-y-1 text-zinc-500 text-[10px]">
                                    <li>Emergency parachute for inspected 404 cache misses. 100-heal/24h circuit breaker.</li>
                                </ul>
                            </li>
                        </ul>
                    </div>
                </div>
            </div>

            {/* Divider */}
            <div className="w-px bg-zinc-800/50 justify-self-center hidden xl:block" />

            {/* Rules Ledger */}
            <div className="flex flex-col flex-1 min-w-0">
                <div className="p-4 rounded-xl border border-zinc-700 bg-zinc-900/80 h-[560px] flex flex-col">
                    <div className="text-white font-medium text-sm mb-2 sticky top-0 bg-zinc-900 py-1 border-b border-zinc-800 z-10 flex items-center justify-between">
                        <span>Rules Ledger</span>
                        <span className="text-[10px] font-mono text-primary uppercase">41 Laws</span>
                    </div>
                    <div className="space-y-2 pt-2 overflow-y-auto pr-1 flex-1">
                        {ARCHITECTURE_RULES.map(rule => (
                            <div key={rule.id} className="p-2.5 bg-yellow-500/5 border border-yellow-500/15 rounded-lg">
                                <div className="text-[10px] font-bold text-yellow-500 uppercase tracking-tighter mb-0.5">[Rule {rule.id}] {rule.title}</div>
                                <div className="text-[10px] text-zinc-400 leading-relaxed">{rule.desc}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

        </div>
    </div>
);

const AsyncHydrationDiagram: React.FC = () => (
    <div className="bg-zinc-900/30 p-6 rounded-xl border border-zinc-700/50 mb-8">
        <h3 className="text-zinc-200 font-medium text-sm mb-4 uppercase tracking-wider">Async Hydration Decoupling</h3>
        <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
                <div className="bg-primary/20 p-2.5 rounded-lg border border-primary/50 text-primary w-56 text-center font-bold text-xs shadow-[0_0_15px_rgba(168,85,247,0.3)]">
                    HTTP Fast-Track
                    <div className="text-[10px] font-normal mt-1 opacity-80">
                        Origin Validation: Gemini 3.6 Flash<br/>
                        Topology Creation: Gemini 3.1 Pro
                    </div>
                </div>
                <div className="flex-1 h-px bg-primary/50 relative">
                    <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-zinc-900 text-[10px] text-primary px-2">Sync: Render Spiderweb</span>
                </div>
                <div className="bg-zinc-800 p-2.5 rounded-lg border border-zinc-600 text-zinc-300 w-44 text-center text-xs">
                    Graph Data Written
                </div>
            </div>
            <div className="flex items-center gap-3 opacity-85">
                <div className="bg-amber-500/20 p-2.5 rounded-lg border border-amber-500/50 text-amber-500 w-56 text-center font-bold text-xs">
                    Background Worker
                    <div className="text-[10px] font-normal mt-1 opacity-80">
                        Node Positioning: Gemini 3.6 Flash<br/>
                        Root Breakdowns: Gemini 3.1 Pro
                    </div>
                </div>
                <div className="flex-1 h-px bg-amber-500/50 relative border-dashed border-b">
                    <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-zinc-900 text-[10px] text-amber-500 px-2">Async: Hydrate Metadata</span>
                </div>
                <div className="flex flex-col gap-1.5 w-44">
                    <div className="bg-zinc-800 p-1.5 rounded border border-zinc-700 text-[11px] text-center text-zinc-400">Hydrate Node Batch ⏳</div>
                    <div className="bg-zinc-800 p-1.5 rounded border border-zinc-700 text-[11px] text-center text-zinc-400">Persist Curation Doc ⏳</div>
                </div>
            </div>
        </div>
    </div>
);

const DataLifecycleMatrix: React.FC = () => (
    <div className="w-full py-6 px-6 bg-zinc-950/50 rounded-xl border border-zinc-800 mb-8">
        <h3 className="text-zinc-200 font-medium text-sm mb-4 uppercase tracking-wider">3-Tier Storage Matrix</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Tier 1 */}
            <div className="bg-zinc-900 border border-zinc-700 p-4 rounded-xl">
                <div className="flex items-center gap-2 mb-2">
                    <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                    <div className="text-blue-400 font-bold text-xs uppercase tracking-wider">Tier 1: Global Assets</div>
                </div>
                <div className="text-zinc-500 text-[10px] mb-3 uppercase font-mono">artists / labels</div>
                <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between border-b border-zinc-800 pb-1.5"><span className="text-zinc-400">createdAt</span><span className="text-white">Immutable</span></div>
                    <div className="flex justify-between border-b border-zinc-800 pb-1.5"><span className="text-zinc-400">updatedAt</span><span className="text-green-400">Mutable</span></div>
                    <div className="flex justify-between border-b border-zinc-800 pb-1.5"><span className="text-zinc-400">expireAt</span><span className="text-yellow-400">Soft-expires 365d (Stale)</span></div>
                    <div className="flex justify-between"><span className="text-zinc-400">cachedAt</span><span className="text-red-500 line-through">Eradicated</span></div>
                </div>
                <div className="mt-3 text-[11px] text-zinc-500 leading-relaxed">
                    Canonical source of truth. Soft-expires at 365 days. Stale nodes are ONLY refreshed when intersected by a user-funded generation. NEVER auto-swept.
                </div>
            </div>

            {/* Tier 2 */}
            <div className="bg-zinc-900 border border-zinc-700 p-4 rounded-xl">
                <div className="flex items-center gap-2 mb-2">
                    <div className="w-2 h-2 rounded-full bg-purple-500"></div>
                    <div className="text-purple-400 font-bold text-xs uppercase tracking-wider">Tier 2: Ephemeral</div>
                </div>
                <div className="text-zinc-500 text-[10px] mb-3 uppercase font-mono">sharedZcenes</div>
                <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between border-b border-zinc-800 pb-1.5"><span className="text-zinc-400">createdAt</span><span className="text-white">Immutable</span></div>
                    <div className="flex justify-between border-b border-zinc-800 pb-1.5"><span className="text-zinc-400">updatedAt</span><span className="text-zinc-600">NULL (Read-Only)</span></div>
                    <div className="flex justify-between border-b border-zinc-800 pb-1.5"><span className="text-zinc-400">expireAt</span><span className="text-orange-400">+30 Days Hard TTL</span></div>
                    <div className="flex justify-between"><span className="text-zinc-400">cachedAt</span><span className="text-red-500 line-through">Eradicated</span></div>
                </div>
                <div className="mt-3 text-[11px] text-zinc-500 leading-relaxed">
                    Frozen snapshots generated for sharing. Coordinates stripped (Amnesia) to enforce organic guest recalculation.
                </div>
            </div>

            {/* Tier 3 */}
            <div className="bg-zinc-900 border border-zinc-700 p-4 rounded-xl">
                <div className="flex items-center gap-2 mb-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                    <div className="text-emerald-400 font-bold text-xs uppercase tracking-wider">Tier 3: Owned</div>
                </div>
                <div className="text-zinc-500 text-[10px] mb-3 uppercase font-mono">users/uid/projects</div>
                <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between border-b border-zinc-800 pb-1.5"><span className="text-zinc-400">createdAt</span><span className="text-white">Immutable</span></div>
                    <div className="flex justify-between border-b border-zinc-800 pb-1.5"><span className="text-zinc-400">updatedAt</span><span className="text-green-400">Mutable</span></div>
                    <div className="flex justify-between border-b border-zinc-800 pb-1.5"><span className="text-zinc-400">expireAt</span><span className="text-zinc-600">NULL (No TTL)</span></div>
                    <div className="flex justify-between"><span className="text-zinc-400">cachedAt</span><span className="text-red-500 line-through">Eradicated</span></div>
                </div>
                <div className="mt-3 text-[11px] text-zinc-500 leading-relaxed">
                    User-controlled topologies. Preserves fixed Coordinate Memory in canvasLayout to prevent spatial re-orientation.
                </div>
            </div>
        </div>
    </div>
);

const SharingFlowDiagram: React.FC = () => (
    <div className="w-full py-6 px-4 bg-zinc-950/50 rounded-xl border border-zinc-800 mb-8 overflow-x-auto">
        <h3 className="text-zinc-200 font-medium text-sm mb-4 uppercase tracking-wider">Collaboration & Sharing Flow</h3>
        <div className="min-w-[640px] flex justify-between items-center gap-3 px-4">
            {/* Step 1: Share Link */}
            <div className="flex flex-col items-center gap-2 flex-1">
                <div className="w-10 h-10 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center">
                    <span className="material-symbols-outlined text-zinc-400 text-sm">share</span>
                </div>
                <div className="text-white font-medium text-center text-xs">Share Zcene</div>
                <div className="px-2 py-0.5 bg-zinc-900 border border-zinc-800 rounded text-[10px] font-mono text-zinc-500">/z/:shareId</div>
            </div>

            <div><span className="material-symbols-outlined text-zinc-700 text-sm">arrow_forward</span></div>

            {/* Step 2: Guest/Auth Preview */}
            <div className="flex flex-col items-center gap-2 flex-1">
                <div className="w-full p-2.5 rounded-lg border border-zinc-700 bg-zinc-900 flex flex-col gap-1 text-center">
                    <span className="text-[9px] uppercase tracking-wider font-bold text-amber-500">Read Only</span>
                    <div className="text-xs text-white">Interactive Graph Preview</div>
                </div>
                <div className="text-zinc-500 text-[10px] text-center italic">Coordinate Amnesia applied</div>
            </div>

            <div><span className="material-symbols-outlined text-zinc-700 text-sm">arrow_forward</span></div>

            {/* Step 3: Trigger Save */}
            <div className="flex flex-col items-center gap-2 flex-1">
                <div className="w-full py-2.5 px-2 rounded-lg bg-primary text-brand-black font-bold text-xs text-center shadow-lg shadow-primary/20">
                    SAVE TO MY ZCENES
                </div>
                <div className="text-zinc-400 text-[10px] text-center">1:1 Clone via Serializer</div>
            </div>

            <div><span className="material-symbols-outlined text-zinc-700 text-sm">arrow_forward</span></div>

            {/* Step 4: Final Ownership */}
            <div className="flex flex-col items-center gap-2 flex-1">
                <div className="w-full p-2.5 rounded-lg border-2 border-primary bg-zinc-900 flex flex-col gap-1 text-center">
                    <span className="text-[9px] uppercase tracking-wider font-bold text-primary">Full Control</span>
                    <div className="text-xs text-white">Saved to Dashboard</div>
                </div>
                <div className="text-zinc-500 text-[10px] text-center">Coordinate Memory Active</div>
            </div>
        </div>
    </div>
);

const RunbookAccordion: React.FC = () => {
    const [isOpen, setIsOpen] = useState(true);
    return (
        <div className="bg-zinc-900/30 rounded-xl border border-zinc-700/50 mb-8 overflow-hidden">
            <button 
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center justify-between p-5 bg-zinc-900/50 hover:bg-zinc-800/50 transition-colors text-left"
            >
                <div className="flex items-center gap-3 text-zinc-200 font-medium text-sm uppercase tracking-wider">
                    <Terminal className="w-4 h-4 text-primary" />
                    V30 Full-Stack Regression Runbook
                </div>
                {isOpen ? <ChevronDown className="w-4 h-4 text-zinc-400" /> : <ChevronRight className="w-4 h-4 text-zinc-400" />}
            </button>
            {isOpen && (
                <div className="p-6 border-t border-zinc-700/50">
                    <div className="prose prose-invert prose-sm max-w-none prose-pre:bg-zinc-950 prose-pre:border prose-pre:border-zinc-800">
                        <Markdown>{BACKEND_REGRESSION_RUNBOOK}</Markdown>
                    </div>
                </div>
            )}
        </div>
    );
};

export const EnginePage: React.FC<SourcePageProps> = ({ 
    onNavigate, 
    isActive, 
    profile, 
    onUpdateProfile,
    user,
    onLogoClick,
    isSmallScreen,
    stackCount,
    isStackNew,
    onOpenStack,
    onLogout,
    onDeleteAccount,
    isAdmin,
    isProfileOpen,
    setIsProfileOpen,
    isDeleteAccountModalOpen,
    setIsDeleteAccountModalOpen,
    isMenuOpen,
    setIsMenuOpen,
    onRestartWalkthrough,
    onClose,
    onNavigateMenu
}) => {
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (isActive && containerRef.current) {
            containerRef.current.scrollTo(0, 0);
        }
    }, [isActive]);

    const CodeBlock: React.FC<{ title: string; content: string }> = ({ title: blockTitle, content }) => (
        <div className="rounded-xl border border-zinc-700/50 bg-zinc-900/50 overflow-hidden mb-6">
            <div className="bg-zinc-800/50 px-5 py-3 border-b border-zinc-700/50 flex justify-between items-center">
                <h4 className="text-zinc-200 font-medium text-xs tracking-wider uppercase">{blockTitle}</h4>
                <span className="text-zinc-500 text-[10px] font-mono">Contract / Constants</span>
            </div>
            <div className="p-5 overflow-x-auto">
                <pre className="text-xs font-mono text-zinc-400 leading-relaxed whitespace-pre-wrap">
                    {content}
                </pre>
            </div>
        </div>
    );

    const sections = [
        { id: 'architecture', title: '1. Architecture & Pipeline' },
        { id: 'data-lifecycle', title: '2. Data Lifecycle & Storage' },
        { id: 'runbooks', title: '3. Runbooks & Automation' },
        { id: 'runtime-physics', title: '4. Runtime Systems & Physics' }
    ];

    const scrollToSection = (sectionId: string, offset: number = 80) => {
        const element = document.getElementById(sectionId);
        const container = containerRef.current;
        if (element && container) {
            const containerRect = container.getBoundingClientRect();
            const elementRect = element.getBoundingClientRect();
            const relativeTop = elementRect.top - containerRect.top;
            const targetScrollTop = container.scrollTop + relativeTop - offset;
            container.scrollTo({ top: targetScrollTop, behavior: 'smooth' });
        }
    };

    const handleNavClick = (e: React.MouseEvent<HTMLAnchorElement>, sectionId: string) => {
        e.preventDefault();
        scrollToSection(sectionId, 80);
    };

    const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const sectionId = e.target.value;
        if (!sectionId) return;
        scrollToSection(sectionId, 80);
        e.target.value = "";
    };

    return (
        <div ref={containerRef} className="h-full w-full overflow-y-auto bg-background-dark text-zinc-200 font-display flex flex-col relative">
            <Header
                user={user}
                onLogoClick={onLogoClick}
                view="dashboard"
                isSmallScreen={isSmallScreen}
                isMagazineViewOpen={false}
                stackCount={stackCount}
                isStackNew={isStackNew}
                onOpenStack={onOpenStack}
                onNavigate={onNavigateMenu || onNavigate}
                onLogout={onLogout}
                onDeleteAccount={onDeleteAccount}
                isAdmin={isAdmin}
                isProfileOpen={isProfileOpen}
                setIsProfileOpen={setIsProfileOpen}
                isDeleteAccountModalOpen={isDeleteAccountModalOpen}
                setIsDeleteAccountModalOpen={setIsDeleteAccountModalOpen}
                isMenuOpen={isMenuOpen}
                setIsMenuOpen={setIsMenuOpen}
                onRestartWalkthrough={onRestartWalkthrough}
            />

            {/* Mobile Navigation Dropdown */}
            <div className="lg:hidden p-4 sticky top-0 bg-background-dark z-[90] border-b border-zinc-700">
                <div className="relative">
                    <select
                        id="engine-nav"
                        className="w-full appearance-none rounded-xl border border-zinc-700 bg-zinc-900 text-zinc-300 py-2.5 pl-4 pr-8 text-xs font-medium focus:ring-1 focus:ring-primary focus:outline-none"
                        onChange={handleSelectChange}
                        defaultValue=""
                    >
                        <option value="" disabled>Jump to architectural pillar...</option>
                        {sections.map(s => (
                            <option key={s.id} value={s.id}>{s.title}</option>
                        ))}
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-zinc-400">
                        <span className="material-symbols-outlined text-sm">unfold_more</span>
                    </div>
                </div>
            </div>

            <div className="container mx-auto px-4 sm:px-6 py-8 flex flex-col lg:flex-row gap-8 flex-1">
                {/* Desktop Sticky Sidebar */}
                <aside className="w-64 flex-shrink-0 hidden lg:block">
                    <div className="sticky top-8 bg-zinc-900/40 p-4 rounded-xl border border-zinc-800">
                        <div className="text-[10px] font-mono text-primary uppercase tracking-wider mb-2 font-semibold">Engine Navigation</div>
                        <h3 className="text-zinc-200 font-medium text-xs mb-3">System Pillars</h3>
                        <nav className="flex flex-col space-y-1">
                            {sections.map(s => (
                                <a 
                                    key={s.id} 
                                    href={`#${s.id}`} 
                                    onClick={(e) => handleNavClick(e, s.id)}
                                    className="text-xs text-zinc-400 hover:text-primary transition-colors py-1.5 px-2 rounded hover:bg-zinc-800/50"
                                >
                                    {s.title}
                                </a>
                            ))}
                        </nav>
                        <div className="mt-6 pt-4 border-t border-zinc-800/60 text-[10px] text-zinc-500 font-mono">
                            Zcene V30 Blueprint<br/>
                            100% Anti-Regression
                        </div>
                    </div>
                </aside>

                <main className="flex-1 min-w-0">
                    
                    {/* Header Banner */}
                    <div className="mb-8 border-b border-zinc-700/60 pb-6">
                        <div className="flex items-center gap-3 mb-2">
                            <h1 className="text-2xl sm:text-3xl font-medium text-white">Engine</h1>
                            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-primary/20 text-primary border border-primary/40">V30 Locked</span>
                        </div>
                        <p className="text-zinc-400 leading-relaxed text-xs sm:text-sm max-w-3xl">
                            Visual mirror and execution interface for the Zcene curation pipeline. Defines behavioral laws, state orchestration, anti-pollution boundaries, and regression-proof contracts.
                        </p>
                    </div>

                    {/* ── PILLAR 1: ARCHITECTURE & PIPELINE ── */}
                    <section id="architecture" className="scroll-mt-24 mb-12">
                        <h2 className="text-xl sm:text-2xl font-medium text-white tracking-tight border-b-2 border-primary/50 pb-2 mb-6">
                            1. Architecture & Pipeline
                        </h2>
                        <DiscoveryFlowDiagram />
                        <AsyncHydrationDiagram />
                    </section>

                    {/* ── PILLAR 2: DATA LIFECYCLE & STORAGE ── */}
                    <section id="data-lifecycle" className="scroll-mt-24 mb-12">
                        <h2 className="text-xl sm:text-2xl font-medium text-white tracking-tight border-b-2 border-primary/50 pb-2 mb-6">
                            2. Data Lifecycle & Storage
                        </h2>
                        <DataLifecycleMatrix />
                        <SharingFlowDiagram />
                    </section>

                    {/* ── PILLAR 3: RUNBOOKS & AUTOMATION ── */}
                    <section id="runbooks" className="scroll-mt-24 mb-12">
                        <h2 className="text-xl sm:text-2xl font-medium text-white tracking-tight border-b-2 border-primary/50 pb-2 mb-6">
                            3. Runbooks & Automation
                        </h2>
                        <RunbookAccordion />
                    </section>

                    {/* ── PILLAR 4: RUNTIME SYSTEMS & PHYSICS ── */}
                    <section id="runtime-physics" className="scroll-mt-24 mb-12">
                        <h2 className="text-xl sm:text-2xl font-medium text-white tracking-tight border-b-2 border-primary/50 pb-2 mb-6">
                            4. Runtime Systems & Physics
                        </h2>
                        
                        <CodeBlock 
                            title="D3 Force Simulation & Physics Constants" 
                            content={`STABILITY & MOMENTUM CONSTANTS (MusicGraph.tsx):
- Velocity Decay: 0.7 (High friction for rapid settling and zero canvas jitter)
- Charge (ManyBody): -500 (Organic Mode) to -1200 (Cluster Mode)
- Collision Radius: 80 * sizeMult (Prevents overlap while preserving semantic density)
- Alpha Targets: 0.15 (Initialization) / 0.2 (Selection Wake) / 1.0 (Structural Topology Change)
- Alpha Cooling: alphaDecay(0.1) and alphaMin(0.01) halt simulation rapidly

LINK DISTANCES (Organic Mode):
- Artist <-> Artist: 450px * distMult
- Artist <-> Founded: 100px * distMult (Tight satellite relationship)
- Genre Hubs: 280px * distMult
- Label Hubs: 140px * distMult
- Origin Hubs: 320px * distMult

LOCKED SEMANTIC TOPOLOGY (Rule 21):
- D3 node drag gestures are permanently disabled (.drag() removed).
- Mobile canvas panning is completely unobstructed.
- Settled positions committed to canvasLayout via Coordinate Memory.`} 
                        />

                        <CodeBlock 
                            title="JIT Asset Telemetry & Circuit Breaker Contract (Rule 37)" 
                            content={`EMERGENCY PARACHUTE SPECIFICATION (healOrphanedAsset.ts):
- Trigger: Inspected node suffering a true 404 miss during live canvas exploration or eager hydration.
- Anti-Sweep Law: Automated background cron sweeps, scheduled cloud tasks, or janitorial scanners are strictly prohibited. Stale data (>365d) never triggers JIT healing.
- In-Flight Memory Lock: Concurrent requests for identical slugs are deduplicated via inFlightHealsRef.
- Circuit Breaker: Hard kill switch trips if > 100 heals occur within a rolling 24-hour window.
- Telemetry Audit: Granular token usage and USD list-price receipts committed to adminLedger/system/jitHeals.`} 
                        />
                    </section>

                </main>
            </div>

            <footer className="w-full p-6 text-zinc-400 text-xs z-10 relative bg-neutral-900 flex-shrink-0 border-t border-neutral-800">
                <div className="container mx-auto text-center">
                    <ZceneLogo className="h-6 w-auto text-primary mx-auto mb-2" />
                    <p className="text-zinc-600">© 2026 Zcene Admin Console. V30 Programmatic Architecture.</p>
                </div>
            </footer>
        </div>
    );
};

export default EnginePage;
