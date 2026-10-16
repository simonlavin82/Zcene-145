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
    { id: 1, title: "Three-Column Flow", desc: "Pipeline is strictly partitioned into React UI, HTTP Fast-Track, and Background Worker." },
    { id: 2, title: "Strict Seed Hoisting & Pinning", desc: "Seed nodes must ALWAYS be hoisted and pinned to activeNodes[0] as roots of the network." },
    { id: 3, title: "Universal Coordinate Amnesia", desc: "Absolute D3 runtime coordinates MUST be stripped during Share and Duplication creation." },
    { id: 4, title: "Deterministic Open Graph Routing", desc: "Deterministic seedImageUrl appended to root payload to eliminate proxy lookups." },
    { id: 5, title: "[Deprecated] Client-Side Hydration", desc: "Project payloads are 100% self-contained and atomic. On-demand lazy hydration is obsolete." },
    { id: 6, title: "Ambiguous Stub Bypass & Canonical Resolution", desc: "Ambiguous stubs (_isStub: true && isAmbiguous: true) MUST bypass direct hits and route to Node 4." },
    { id: 7, title: "Fail-Fast Media Gatekeeper", desc: "Cache validation predicate flags nodes missing crucial imagery or biographies as cache misses." },
    { id: 8, title: "Strict Topology Verification & Cache Serialization", desc: "Stubs lacking graphData MUST route to Generative Topology. D3 links safely serialized to strings." },
    { id: 9, title: "Canonical Seed Slug Resolution & Degree-0 Cleanup", desc: "resolvedSeedNormMap and idRewriteMap prevent split-brain writes. isCountryEndpoint and Degree-0 cleanup prune orphans while protecting connected nodes." },
    { id: 10, title: "Redirect Pointer & Stub Dedup Immunity", desc: "Hydration loop slug dedup MUST skip documents with redirectTo, _isStub, or isAmbiguous." },
    { id: 11, title: "Validation Reasoning & Escape Hatch Bouncer", desc: "Parametric Flash 3.6 re-query bouncer with zero-pollution inline rejection. Zero search grounding." },
    { id: 12, title: "Resilient iTunes Artwork Pipeline", desc: "Punctuation-agnostic normalization and bio summary fallback ensure 100% artwork hydration." },
    { id: 13, title: "Auth Handoff Preserver", desc: "Stashes pending project ID in session storage to guarantee clone resumes cleanly post-auth." },
    { id: 14, title: "Atomic Self-Healing", desc: "Graph breakdowns handle atomic self-healing with fuzzy fallbacks mitigating coupling failures." },
    { id: 15, title: "Complex Cache Bypass", desc: "Multi-seed and filtered queries strictly bypass Front Gate cache and default to Live Synthesis." },
    { id: 16, title: "Curation Intercept Guardrails", desc: "ProjectLoader ignores snapshots while status is 'curating' to prevent duplicate generative calls." },
    { id: 17, title: "Universal Pre-Flight Stub Minting & Zero Blind Trust", desc: "Stubs minted synchronously during pre-flight strictly from verified Flash candidate payloads." },
    { id: 18, title: "Authorization Lifecycle", desc: "Token authorization state is strictly scoped to the active generation event and resets on cancel." },
    { id: 19, title: "External Link Security", desc: "Official website and Bandcamp links rely on deterministic client-side search templates." },
    { id: 20, title: "Mandatory Disambiguation on Direct Hits", desc: "Topology hits (Green Line) MUST explicitly route through <DisambiguationModal> to verify origin." },
    { id: 21, title: "Locked Semantic Topology & AI Physics Injection", desc: "D3 dragging forbidden. Final positioning AI link weights dictate variable distance and rigidity." },
    { id: 22, title: "Deep-Cut Range Targeting", desc: "LLM calibrated for rich spiderweb density (18–21 nodes) with scene flexibility to avoid filler." },
    { id: 23, title: "Topology Parity Mandate", desc: "reconcileNarrativeEdges mechanically injects connections stated in narrative missing from links." },
    { id: 24, title: "Verbal Identity", desc: "Root Breakdown prompt strictly enforces the 2 AM record curator voice and 1-sentence hooks." },
    { id: 25, title: "Selective Coordinate Amnesia", desc: "Stripping destructure is strictly scoped to /sharedZcenes. Owned projects retain Coordinate Memory." },
    { id: 26, title: "Contextual Tooltips", desc: "Spiderweb hover tooltips prioritize narrative epicenter hooks over dry encyclopedic summaries." },
    { id: 27, title: "AI-Led Coordinate Panning", desc: "Initial viewport center dynamically calibrated to the spatial bounding box of settled clusters." },
    { id: 28, title: "Canonical Global Caching (Filter Barring)", desc: "Global caching uses pure canonical IDs; query filters are strictly barred from document paths." },
    { id: 29, title: "Data Lifecycle Matrix", desc: "Strict 3-Tier Storage Matrix: Tier 1 Global (365d stale), Tier 2 Ephemeral (30d TTL), Tier 3 Owned." },
    { id: 30, title: "Strict Hydration Lock", desc: "Autosave intervals and listeners suspended via global lock during active generation cycles." },
    { id: 31, title: "Local State Preemption", desc: "Zero-cost local routing synchronously injects graph into React state before releasing the lock." },
    { id: 32, title: "Validation Circuit Breaker", desc: "Validation Modal acts as hard execution stop/return; dismissal terminates downstream pipeline." },
    { id: 33, title: "Payload Completeness", desc: "Direct Hit local routing injects both graphData and detailsCache simultaneously to prevent lookups." },
    { id: 34, title: "Cognitive Tiering & Orchestration Stability", desc: "AI generation strictly utilizes thinking_level (minimal to high); rates pegged to standard list price." },
    { id: 35, title: "Geographic Asset Disambiguation", desc: "iTunes scraper appends parametric regional suffix (e.g. ' US') if primary query collides." },
    { id: 36, title: "Entity Taxonomy Normalization & Root-as-Router", desc: "Bare IDs reserved as _isStub: true forwarders; verified payloads resolve to suffixed IDs (gunmoll-us)." },
    { id: 37, title: "JIT Asset Telemetry & Healing (404 Parachute ONLY)", desc: "Emergency parachute for inspected 404 cache misses. Zero background sweeps. 100-heal/24h auto-kill." },
    { id: 39, title: "Deterministic Metadata Projection & Pod Genre Affinity", desc: "Step 4B projects Country (0.2), Founded (0.3), and 2-Tier Pod Genre Affinity (0.8) for all spawned artists before Degree-0 cleanup, preserving weights through Node 5." },
    { id: 40, title: "Synthesis Rationale Integrity & Direct Hit Read/Write Gates", desc: "Direct Hits strictly require non-empty synthesisRationale (>= 50 chars). Write Gate blocks cache pollution on Step 3 timeouts; 90s AbortController engages instant 3.6 Flash fallback with ISO-suffix country lock." }
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
                                <span className="text-primary font-medium">Local Topology Routing:</span> Direct Hits (perfect cache) bypass the backend entirely.
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
                                <span className="text-primary font-medium">1. Ingest Validated Seed Payload & Zero Blind Trust</span>
                                <ul className="list-disc pl-4 mt-1 space-y-1 text-zinc-500 text-[10px]">
                                    <li>Ingests pre-validated seed preferences (originalQueries, disambiguationHints, disambiguationGenres).</li>
                                    <li>Strips non-standard regional codes and standardizes seed slugs.</li>
                                    <li><span className="text-zinc-300">Zero Blind Trust:</span> Rejects blind stub minting; slugs strictly derive from verified Flash candidate payloads.</li>
                                </ul>
                            </li>
                            <li>
                                <span className="text-primary font-medium">2. Create Topology (3.1 Pro) | Thinking_level: medium</span>
                                <ul className="list-disc pl-4 mt-1 space-y-1 text-zinc-500 text-[10px]">
                                    <li>Generates skeleton: Seed, AI Artists, Labels, Genres.</li>
                                    <li>Enforces <code>kebab-case-artist-iso-code</code> format.</li>
                                    <li>Seed Artist Timeout Protection drops failing nodes gracefully.</li>
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
                                <span className="text-primary font-medium">Hydrate Node Batch | 3.6 Flash (low)</span>
                                <ul className="list-disc pl-4 mt-1 space-y-1 text-zinc-500 text-[10px]">
                                    <li>Global Cache Hit: Attaches existing Deep Cut.</li>
                                    <li>Miss: Synthesizes via 3.6 Flash & iTunes scraper.</li>
                                    <li>Slug deduplication ignores stubs; injects pre-generated seed stubs on timeout.</li>
                                </ul>
                            </li>
                            <li>
                                <span className="text-primary font-medium">Root Breakdown | 3.1 Pro (high) + 90s Flash Fallback</span>
                                <ul className="list-disc pl-4 mt-1 space-y-1 text-zinc-500 text-[10px]">
                                    <li>Synthesizes narrative in 2 AM record curator voice.</li>
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
                                <span className="text-primary font-medium">Step 4B: Deterministic Enrichment & Pod Affinity</span>
                                <ul className="list-disc pl-4 mt-1 space-y-1 text-zinc-500 text-[10px]">
                                    <li>Wires Country, Founded, and 2-Tier Pod Genre nodes for secondary artists before Degree-0 cleanup.</li>
                                </ul>
                            </li>
                            <li>
                                <span className="text-primary font-medium">Final Node Positioning | 3.6 Flash (minimal)</span>
                                <ul className="list-disc pl-4 mt-1 space-y-1 text-zinc-500 text-[10px]">
                                    <li>Evaluates bios to generate semantic link weights (0.1–1.0) with Weight Preservation Guard.</li>
                                </ul>
                            </li>
                            <li>
                                <span className="text-primary font-medium">Persist Assets & Status:</span> Commits graph, breakdown, and link weights. Updates job status to 'completed'.
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
                        <span className="text-[10px] font-mono text-primary uppercase">40 Laws</span>
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
                    V28 Full-Stack Regression Runbook
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

    const CodeBlock: React.FC<{ title: string; content: string }> = ({ title, content }) => (
        <div className="rounded-xl border border-zinc-700/50 bg-zinc-900/50 overflow-hidden mb-6">
            <div className="bg-zinc-800/50 px-5 py-3 border-b border-zinc-700/50 flex justify-between items-center">
                <h4 className="text-zinc-200 font-medium text-xs tracking-wider uppercase">{title}</h4>
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
                            Zcene V28 Blueprint<br/>
                            100% Anti-Regression
                        </div>
                    </div>
                </aside>

                <main className="flex-1 min-w-0">
                    
                    {/* Header Banner */}
                    <div className="mb-8 border-b border-zinc-700/60 pb-6">
                        <div className="flex items-center gap-3 mb-2">
                            <h1 className="text-2xl sm:text-3xl font-medium text-white">Engine</h1>
                            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-primary/20 text-primary border border-primary/40">V28 Locked</span>
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
                    <p className="text-zinc-600">© 2026 Zcene Admin Console. V28 Programmatic Architecture.</p>
                </div>
            </footer>
        </div>
    );
};

export default EnginePage;
