import React, { useState, useEffect, useRef } from 'react';
import { View } from '../types';
import { ZceneLogo } from './Icons';
import Header from './Header';
import Markdown from 'react-markdown';
import { Terminal, ChevronDown, ChevronRight } from 'lucide-react';
import { BACKEND_REGRESSION_RUNBOOK } from '../docs/backend-regression-runbook';
import { BackButton } from './DesignSystem';

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
    tokenBalance?: number;
}

export const ARCHITECTURE_RULES = [
    { 
        id: 1, 
        title: "Client-Side ISO Fallback", 
        desc: "Strips ISO-3166-1 alpha-2 codes (-uk, -gb) to gracefully cascade into bare ID lookups." 
    },
    { 
        id: 2, 
        title: "Slugging Reasoning", 
        desc: "Prevents namespace collisions. Enforces global 249-country ISO-3166-1 alpha-2 mapping via shared/isoCountries.ts (e.g., Scotland → GB, Thailand → TH) with pre-slugging country-link origin inference (inferNodeOriginsFromCountryLinks) and scene-aware/ambiguity-safe deep-cut slug deduplication; full-country-name suffixes (-thailand) and cross-country homonym hijacking are strictly forbidden. Base-to-Suffixed ISO Parity Inoculation (isEntitySeedMatch: strippedC === rawS || strippedS === rawC) guarantees that artists whose names end in 2-letter tokens matching ISO codes (e.g., Vein.fm → vein-fm, End It → end-it) match their suffixed forms (vein-fm-us, end-it-us) without being falsely rejected as foreign homonyms." 
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
        title: "Grounding & Schema-Scraper Locker Logic", 
        desc: "Deep Cut hydration enforces responseMimeType: 'application/json' and ARTIST/LABEL_NODE_DETAILS_SCHEMA (with Zero Google Search Grounding). LABEL_NODE_DETAILS_SCHEMA omits imageUrl and sanitizeLabelProfile enforces imageUrl: null in both backend and client. Honest LLM generation is preserved by permitting empty discography arrays ([]). Post-synthesis filters enforce exact releaseYear constraints, and Tier 3 strict homonym collisions are stripped via token-Jaccard similarity scoring. Unverified fabricated albums for Artists are strictly quarantined to []." 
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
        title: "Complex Cache Bypass & Tabula Rasa Gate", 
        desc: "Multi-seed and 3-Tier anchored queries (hasActiveDiscoveryFilters === true) must strictly bypass the Global Topology Cache (Front Gate) and force needsProGeneration = true in Column 2. To preserve Tabula Rasa generation, Column 2 strictly bypasses cachedSubgraphsContext and baseGraph merging, ensuring Gemini 3.1 Pro generates fresh bespoke topologies while seed identities remain locked by Column 1 disambiguation hints." 
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
        title: "Authorization Lifecycle & Split-Debit Session Scoping", 
        desc: "Legacy shared API_PASSWORD is completely retired in favor of cryptographic Firebase Auth (request.auth / Bearer ID tokens). Token authorization and curationSessions/{sessionId} split-debit state are strictly scoped to the active Scene generation event and reset immediately on modal cancellation, API failure, scene switch/addition, or project unmount." 
    },
    { 
        id: 19, 
        title: "External Link Security", 
        desc: "Official Website and Bandcamp links must rely on deterministic client-side search templates to prevent the AI from hallucinating or routing to malicious squatted domains." 
    },
    { 
        id: 20, 
        title: "Mandatory Disambiguation & Settlement on Direct Hits", 
        desc: "Single-seed Topology Hits and Ambiguous Cache Hits MUST NEVER bypass Box 3 (Token Spend & Top-Up Gate) or Box 4 (Confirm Your Artists), and MUST settle via authorizeDirectHitCallable (-5T pure cache hit, or -4T remainder after 1T Flash lookup) before rendering. When a Direct Hit is added as Scene >= 2, authorizeDirectHitCallable asynchronously queues an overarching_only background pass at 0 extra user token cost to synthesize overarchingRationale and crossSceneLinks." 
    },
    { 
        id: 21, 
        title: "Locked Topology & Coordinate Memory", 
        desc: "Node positions are strictly derived from AI-evaluated link weights around deterministic per-scene centers (1000 + sceneIndex * 1050, 1000). Direct D3 node dragging is permanently disabled. resolveSceneNodeOverlaps enforces AABB collision boxes (W = 7.2px/char + 22px + padding, H = 24px) with seed mass = ∞, artist mass = 6.7, outward-arc petal sprouting (r ∈ [65px, 75px], charges -100 to -120), and 1-degree metadata satellites tethered to parent artist orbits (r ∈ [62px, 85px]) via tangential arc rotation. Settled (fx, fy) coordinates (keyed by namespaced ID scene-k::canonicalId) are persisted to the owned project's canvasLayout (5s debounce) so existing scenes remain frozen when new scenes are added." 
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
        desc: "Both the Scene Zine (generateRootsBreakdownBackend) and Overarching Multi-Scene Zine (generateOverarchingZineBackend) system prompts must enforce the \"late-night record curator\" voice with zero em-dashes. Academic language and regional English constraints are strictly prohibited." 
    },
    { 
        id: 25, 
        title: "Selective Coordinate Amnesia", 
        desc: "When generating a shared link, single-scene projects (scenes.length < 2) apply Selective Coordinate Amnesia, stripping fixed coordinates (fx, fy) so guests experience a fresh, organic D3 layout. Multi-scene shared projects (scenes.length >= 2) strictly preserve canvasLayout and settled coordinates so the recipient experiences exact 1:1 multi-cluster spatial parity on /z/:id without collisions." 
    },
    { 
        id: 26, 
        title: "Contextual Tooltips", 
        desc: "Hover states and tooltips must prioritize native narrative snippets (node.narrativeSnippet) generated during the Scene Zine synthesis over generic database summaries. Intra-scene and Cross-Scene Bridge relationships output sanitized 3–8 word bi-directional predicate phrases (forwardContext / inverseContext) omitting endpoint names, with deterministic graph/narrative fallback resolution (shared label → narrative co-mention → shared genre/country scene → 'shares scene lineage with') so generic 'Is connected to' copy never renders." 
    },
    { 
        id: 27, 
        title: "Unified Generation DNA & Multi-Seed Co-Anchoring", 
        desc: "All generation modes share unified prompt DNA and organic target density (~18–26 Deep Cuts). Complex Generations operate Tabula Rasa (blank slate), dynamically co-anchor both the topological connections graph and the editorial narrative across all seeds. The graph targets 10 to 16 NEW related artists (12 to 18 total artists with seeds), balancing The Crossover Bridge (5 to 6 shared-DNA artists/labels) with Native Ecosystems (4 to 5 scene peers per seed). In fertile scenes, the model exercises Upper-Bound Ambition (aiming for 13 to 16 new artists) while enforcing a Strict Anti-Filler Valve (stopping at 9–10 if sparse; never padding) to prevent hallucinated padding. All generated Deep Cuts reuse cached global bio/assets in Column 3, achieving $0.00 zero-latency hydration while preserving bespoke multi-seed topology." 
    },
    { 
        id: 28, 
        title: "Canonical Persistence Mandate", 
        desc: "Global asset persistence (artists, labels, genres) must exclusively use the pure, canonical ID (e.g., 'spaced-us', normalizeLabelId). Ephemeral 3-Tier query constraints belong exclusively to the live Project lifecycle and must never pollute global cache keys. compactDetailsCacheToCanonical strips transient scene-k namespaces upon project persistence to maintain a single canonical record per entity across all scenes." 
    },
    { 
        id: 29, 
        title: "Universal Payload Serializer", 
        desc: "Project saving, autosave, and share generation derive from a single source of truth (schemaVersion: 43, including scenes, activeSceneId, overarchingRationale, and crossSceneLinks) to guarantee 1:1 data parity. Share links apply a post-serialization blacklist for ephemeral constraints without risking data omission. Strict Ledger Parity: buildBaseProjectPayload defensively omits generationType, apiUsage, tokensSpent, and anchorResolution during frontend autosave (merge: true) to prevent clobbering server-stamped token costs, labeling, and 3-Tier telemetry. Frontend payload MUST pass a seedNames map as the absolute source of truth for display names to prevent backend hallucination. Dashboard cards & UI consumers must rely solely on the frozen seedImageUrls snapshot across all scenes. V41/V44 Audio Flow & Presentation Sort Parity: Client hydration and autosave pipelines preserve itunesArtistId, previewUrl, and previewTrackName across project saving, cloning, and reconciliation while strictly keeping LLM schemas free of audio fields. The UI enforces the Canonical Presentation Sort (Audio Flow) across canonical-deduplicated Deep Cuts (elevating isSeed: true if an artist is a Root in any Scene), grouping Artists before Record Labels in Deep Cuts and Zine View while preserving graph traversal order, overlaid with the One-SVG Concentric Artwork Watermark." 
    },
    { 
        id: 30, 
        title: "Strict Hydration Lock", 
        desc: "Autosave intervals and database snapshot listeners (e.g., ProjectLoader) MUST be strictly suspended via a global lock (isHydratingSessionRef = true) the moment a seed is submitted, and must remain locked while the Validation Modal is open to prevent partial-state database leaks." 
    },
    { 
        id: 31, 
        title: "Local State Preemption", 
        desc: "Direct Hit local routing (applyLocalTopologyHit) executes immediately after authorizeDirectHitCallable settlement and must synchronously inject the constructed graph into local React state (setGraphData) before releasing the Hydration Lock, preventing destructive autosave overwrites." 
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
        title: "Cognitive Tiering, Orchestration Stability & Dual-Lock Admin Identity", 
        desc: "All 7 AI touchpoints strictly operate on categorical thinking_level mapping (minimal to high) via the legacy generateContent API. Flash-tier touchpoints dynamically resolve to GEMINI_FLASH_MODEL (target: gemini-3.6-flash). Custom sampling parameters (temperature, top_p, top_k, thinking_budget) are strictly prohibited. Admin Discovery Ledger accounting is permanently pegged to standard list prices ($1.50/1M input, $7.50/1M output), while Column 2 enforces atomic Split-Debit remainder settlement and automatic error refunds. Admin verification is strictly dual-locked to both ADMIN_EMAIL (zcene.online@gmail.com) and ADMIN_UID (9FBuWDALnNfUAjxV0pRe3RnKwJy1), decoupled from public customer support contacts (ZCENE_SUPPORT_EMAIL = support@zcene.online). <GlobalWall> wraps <App/> at the application root (index.tsx) using a cryptographic SHA-256 HMAC verification token to prevent pre-gate listener mounting and profile creation." 
    },
    { 
        id: 35, 
        title: "Geographic Asset Disambiguation", 
        desc: "Non-US artists query their regional iTunes storefront (&country=ISO, e.g., country=TH) prior to US fallback. If Tier 1 fails due to a homonym collision, Tier 2 appends the 2-letter ISO code (e.g., ' US', ' TH') for a secondary validation query." 
    },
    { 
        id: 36, 
        title: "Entity Taxonomy Normalization", 
        desc: "The extraction pipeline MUST algorithmically enforce pure root IDs for all global assets. Artists require strict 2-letter kebab-case-artist-iso-code formatting via the unified 249-country ISO registry (never full-word suffixes). To future-proof against homonyms, bare IDs (e.g., 'gunmoll') are strictly reserved as routing stubs and must never hold entity payloads. All verified entities, whether seeds or deep cuts, must resolve to their geographically suffixed ID. Bare router stub keys are derived strictly from normalized artist names (or single-stripped origin suffixes) and are never double-stripped, preserving artists like Vein.fm as artists/vein-fm → vein-fm-us and End It as artists/end-it → end-it-us (never stripping down to vein or end). Label taxonomy normalizations (normalizeLabelId) strip structural suffixes (-records, -music, -recordings, -discos, -platen, -label, etc.) down to pure root IDs across hydration, idRewriteMap, labelIds, and Level 3 anchorLabels. Canonical stylized display names synthesized by the AI (e.g., intentional lowercase or special characters) must bypass forced Title Case formatters and be preserved as the absolute UI truth." 
    },
    { 
        id: 37, 
        title: "JIT Asset Telemetry & Healing", 
        desc: "Missing Deep Cuts discovered during eager hydration or direct clicks must first verify against the localized project detailsCache. If a genuine global and local miss occurs, and the project generation is fully completed, trigger a secondary background synthesis to repair the global cache with 100% complete payloads. The healing payload must pass all standard entity taxonomy normalizations. In-flight duplicate triggers MUST be suppressed via a memory dedup lock. The backend must record granular token usage and calculated micro-cost receipts to adminLedger for Admin Discovery Ledger auditing. JIT Healer acts strictly as a 404 emergency parachute for non-existent graph nodes. Stale or soft-expired assets (>365 days) are strictly air-gapped from JIT Healing and require user-subsidized generation runs to refresh. Circuit breaker caps daily exposure at 100 heals/24h." 
    },
    { 
        id: 38, 
        title: "4-Tier Asset Disambiguation Waterfall", 
        desc: "Third-party media scraping (Artists ONLY; Record Labels strictly excluded and locked to imageUrl: null & itunesArtistId: null) executes a 4-tier cascade: (1) Strict taxonomy match & distance scoring with Mandatory Catalog Corroboration (when discography is provided, candidates require >=1 verified album match; 0-match candidates escalate to Tier 2/3 to prevent out-of-print bands locking onto modern homonyms), (2) Geographic suffix fallback, (3) Resilient Discography Tie-Breaker with Zero-Match Backfill Prohibition (100% unverified catalogs never backfill impostor releases), Tightened Substring Matching (requires <=1-year release proximity AND >=0.70 length ratio), and Hostile Genre Defense (blocks single partial matches on conflicting genres like Dance for Post-Hardcore unless >=2 album matches), deterministically stamping itunesArtistId onto detailsCache (0 added HTTP calls) for on-demand client audio streaming (entity=song&limit=1). (4) Fail-fast reject to terminal monogram quarantine (imageUrl: 'not-found', discography: [], itunesArtistId: null)." 
    },
    { 
        id: 39, 
        title: "Deterministic Metadata Projection & Pod Genre Affinity", 
        desc: "Prior to Final Node Positioning, the worker deterministically projects verified Country and Founded (YYYY) links onto 100% of artist nodes, while ensuring canonical Style metadata is projected directly from detailsCache. Missing genre links resolve via 2-Tier Pod Affinity: wiring artists to their group's existing seed genre node on shared stylistic stems to prevent cross-pod D3 gravity bridges, or minting a divergent subgenre node." 
    },
    { 
        id: 40, 
        title: "Synthesis Rationale & Deep Cut Integrity (Read/Write Gates)", 
        desc: "Direct Hits strictly require a non-empty synthesisRationale (>= 50 chars) AND a fully qualified profile (isFullyQualifiedEntityProfile + Origin-Suffix Parity: summary > 50 chars, genre/origin/founded matching the entity's -iso suffix, canonical style for artists, Array.isArray(profile.discography) where honest empty arrays [] are accepted for unindexed underground artists and non-arrays/null are rejected, valid imageUrl or terminal 'not-found' monogram, and authentic recommendationReason) at both the Read Gate and Write Gate (Step 6). Foreign homonym profiles and prose-fallback stubs are hard-rejected. V40 Audio Agnosticism: isFullyQualifiedEntityProfile is 100% agnostic to itunesArtistId, previewUrl, and previewTrackName. Both Step 3 Scene Zine (generateRootsBreakdownBackend) and Step 3B Overarching Multi-Scene Zine (generateOverarchingZineBackend) bound primary 3.1 Pro high synthesis by 90s and fail over immediately to 3.6 Flash (low) on timeout/504. Step 4B locks canonical ISO artist suffixes (-be, -th) over free-text origins." 
    },
    { 
        id: 41, 
        title: "3-Tier Anchor Hierarchy & Dual-Layer Scene Gravity", 
        desc: "Enforces a strict 3-Tier Anchor System: Tier 1 (Artist Seeds — Sacred Genesis, immune to secondary filters), Tier 2 (Hard Spatial & Temporal Guardrails: 1965 to N-2 (Current Year - 2) Era Slider & 22 Canonical Countries with Include/Exclude toggle and cross-era lineage authorization), and Tier 3 (Dual-Layer Scene Gravity: Canonical Genres & Creatable Anchor Labels). Separates Editorial Narrative Context from Topological Truth: Step 2B executes the Level 2 Post-Hydration Boundary Audit BEFORE Step 3 Zine synthesis so boundary violators are pruned prior to prose generation, while anchorResolution strictly evaluates physical graph nodes with granular partial Tier 3 telemetry (e.g., Genre Applied; Label Bypassed — Narrative Gravity Only)." 
    },
    { 
        id: 42, 
        title: "Data Lifecycle, 3-Tier Storage Matrix & Session TTLs", 
        desc: "Enforces a strict 3-tier storage matrix: Tier 1 (Global Assets /artists & /labels: Soft-expires 365d (createdAt + 365d); updatedAt mutations do not reset clock; anti-sweep law prohibits automated cron-sweeps), Tier 2 (Ephemeral Snapshots & Sessions /sharedZcenes: +30d hard TTL; /curationJobs: completedAt +24h; /curationSessions: +24h sliding; /deepWebSessions: no TTL account pass until all 3 messages consumed), and Tier 3 (Owned Projects /users/{uid}/projects: schemaVersion: 43 multi-scene workspaces, 2-Stage 30-Day Trash lifecycle, Coordinate Memory preserves settled per-scene positions)." 
    },
    { 
        id: 43, 
        title: "Prepaid Token Economy, 2-Stage Trash & Immutable Discovery Ledger", 
        desc: "Zcene enforces a server-authoritative prepaid Token Economy on users/{uid} (tokenBalance, tokenTransactions; 1T = £0.10 / ~$0.13 USD), write-locked against client mutation in firestore.rules. Standard users top up via <SimulatedStripeModal> (£5=50T, £10=100T, £15=150T) and spend value-based tokens strictly per Scene: 5T Single-Seed Scene, 10T Complex Scene, 3T Deep Connections (account-wide {uid}_global_deepweb_pass, no TTL), with 1T non-refundable pre-flight credited against final settlement (0 extra user tokens for Overarching Zine synthesis on Scene >= 2 Direct Hits). Workspace deletions follow a 2-Stage 30-Day Trash lifecycle: Stage 1 preserves 100% of graphData/scenes/canvasLayout for 0T user restoration; Stage 2 compacts heavy blobs to null upon permanent purge while preserving telemetry headers. Cloud Functions dual-write exact apiUsage, costUsd, seedArtist, and anchorResolution to users/{uid}/tokenTransactions. On load, The Discovery Ledger automatically reconciles tokenTransactions against projects, reconstituting historical deleted runs as [ARCHIVED] so Executive P&L KPI cards and unified activity tables retain 100% lifetime accuracy." 
    },
    { 
        id: 44, 
        title: "Multi-Scene Infinite Board, Scene Namespacing & Layered Zine Hierarchy", 
        desc: "Projects (schemaVersion: 43) support up to 5 independent ProjectScenes (scene-1..scene-5, MAX_SCENES_PER_PROJECT = 5) on a single infinite CONNECTIONS canvas. Multi-scene drafting enforces Option A sequential gating (+ Add Scene is gated until the current scene is mapped). Each Scene renders at its deterministic cluster center (1000 + sceneIndex * 1050, 1000) with namespaced canvas IDs (scene-k::canonicalId) so duplicate nodes remain in their respective Scene clusters while sharing canonical Deep Cut profiles. Settled scenes remain frozen in Coordinate Memory ([Rule 21]) when new scenes are added. resolveSceneNodeOverlaps guarantees 100% collision-free node and label placement. Initial canvas state defaults to a neutral rest state (isPassiveSelection = true: 100% node resting opacity, resting link states, no auto-hover tooltips until active interaction). Scene removal of mapped scenes is guarded by a confirmation modal. Mobile Scene-pill taps retain the ROOTS tab without disorienting camera snapping. Shared entities (identity) and AI sonic bridges (sonic_lineage) render as non-physics quadratic Bézier Cross-Scene Bridge Lines with 70–200px upward arc lift and hypot >= 12px degenerate arc guards—illuminating on endpoint node hover/selection with pointer-events: none line hitboxes, presenting directional narrative snippets ([Rule 26]) prioritized at the top of the node hover tooltip rather than on standalone line hover. Deep Cuts enforce Ordering A (sequential Scene 1 → Scene 2 → Scene 3 with per-scene Root Artist anchoring, followed by scene-grouped labels) with Scene Membership badges (SCENE 1, SCENE 2, SCENE 1 & 2) and canonical Root badge resolution. The Zine view renders a stacked hierarchy when scenes.length >= 2: H1 OVERARCHING ZINE at top → sequential H2 SCENE k editorials → canonical-deduplicated DEEP CUTS grid." 
    }
];

const DiscoveryFlowDiagram: React.FC = () => (
    <div className="w-full py-6 px-4 bg-zinc-950/50 rounded-xl border border-zinc-800 mb-8">
        {/* Tier 1: 3-Column Core Pipeline */}
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_auto_1fr_auto_1fr] items-stretch justify-center gap-3 px-1 mb-6">
            
            {/* Column 1: React UI */}
            <div className="flex flex-col flex-1 min-w-0">
                <div className="p-4 rounded-xl border border-zinc-700 bg-zinc-900/80 h-full flex flex-col justify-between">
                    <div>
                        <div className="text-primary text-[10px] font-mono mb-1 uppercase tracking-wider font-semibold">Column 1</div>
                        <div className="text-white font-medium text-sm mb-3">React UI</div>
                        <ul className="text-[11px] text-zinc-400 space-y-3 break-words [overflow-wrap:anywhere]">
                            <li>
                                <span className="text-primary font-medium">1 & 2. Submit Seed(s) + Check Global Topology Cache ([Rule 44]):</span> Scoped to active <code>targetSceneId</code> (<code>Scene 1..5</code> switcher pills + <code>+ Add Scene</code> [max 5 scenes] in ROOTS). Evaluates <code>hasActiveDiscoveryFilters</code> & per-seed cache status; 100% of curations enter Box 3.
                            </li>
                            <li>
                                <span className="text-primary font-medium">3. Token Spend & Top-Up Gate ([Rules 18, 43]):</span> <code>&lt;TokenConfirmationDialog&gt;</code> intercepts every Scene curation (<code>5T</code> Single-Seed/Direct Hit, <code>10T</code> Complex per Scene; <code>3T</code> Deep Connections 3-message account pass; prompts <code>&lt;SimulatedStripeModal&gt;</code> <code>£5/£10/£15</code> if low balance). On "Confirm &amp; Spend", transitions immediately (0ms cross-fade, keeping mobile on ROOTS) into Box 4 <code>&lt;ConsolidatedValidationModal&gt;</code> with inline <code>isVerifyingOrigin</code> loading while Flash 3.6 runs in background.
                            </li>
                            <li>
                                <span className="text-primary font-medium">Flash 3.6 Collision Detection (-1T Pre-Flight):</span> Calls <code>validateSeedOriginCallable</code> (<code>thinking_level: minimal</code>, Zero Search Grounding). Deducts non-refundable <code>1T</code> lookup fee once per uncached batch and mints Evolved Stubs. Runs concurrently inside Box 4 with <code>validationRunIdRef</code> cancellation guard.
                            </li>
                            <li>
                                <span className="text-primary font-medium">4. Confirm Your Artists &amp; Inline Origin Verification ([Rules 11, 20]):</span> <code>&lt;ConsolidatedValidationModal&gt;</code> presents inline micro-spinners for verifying seeds, transitioning dynamically to verified cards, disambiguation radio, or Escape Hatch (<code>-1T</code> per re-query). "Confirm &amp; Generate" button stays disabled until verification finishes.
                                <ul className="list-disc pl-4 mt-1 space-y-1 text-zinc-500 text-[10px]">
                                    <li><span className="text-zinc-300">Direct Hit / Typo Corrected Exit:</span> Routes through <code>authorizeDirectHitCallable</code> (settling <code>-5T</code> or <code>-4T</code> remainder) directly to Box 7 (queuing <code>overarching_only</code> background synthesis at <code>0T</code> when Scene &ge; 2).</li>
                                    <li><span className="text-zinc-300">Zero-Pollution Rejection:</span> Unverified Escape Hatch inputs rejected inline; zero unverified stubs written.</li>
                                </ul>
                            </li>
                            <li>
                                <span className="text-primary font-medium">5 & 7. Active Loader Gate (LOCKED) &amp; Mobile Tab Switch &rarr; Render Multi-Scene Zcene ([Rules 29, 44]):</span> The full-screen curation loader and mobile tab switch to CONNECTIONS (<code>'spiderweb'</code>) activate ONLY AFTER the user clicks "Confirm &amp; Generate" in Box 4. Live synthesis locks UI until Column 3 sets project status to <code>'completed'</code>; Deep Connections consults unlock or resume account-wide pass (<code>{'{uid}_global_deepweb_pass'}</code>; <code>3T</code> / 3 msgs, no TTL) via <code>unlockDeepWebSessionCallable</code>. Drops loader on Direct Hit or job completion, rendering Multi-Scene Infinite Board D3 Canvas (scenes at <code>(1000 + sceneIndex * 1050, 1000)</code> with namespaced IDs <code>scene-k::canonicalId</code>, <code>resolveSceneNodeOverlaps</code> collision protection, and non-physics quadratic Bézier Cross-Scene Bridge Lines with <code>hypot &ge; 12px</code> collision protection, illuminating on endpoint node hover/selection with top-prioritized bridge snippets in node hover tooltips), stacked <strong>Zine</strong> View (<code>OVERARCHING ZINE</code> H1 &rarr; <code>SCENE k</code> H2s &rarr; canonical-deduplicated <code>DEEP CUTS</code> grid), and Deep Cuts (<code>&lt;DetailsPanel&gt;</code>). Enforces <strong>Ordering A</strong> (Per-Scene Root &rarr; Peer Artists &rarr; Labels deduplication sequence with Scene Membership badge resolution) with One-SVG Concentric Artwork Watermark on artist artwork for on-demand 30s audio previews.
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
                        <ul className="text-[11px] text-zinc-400 space-y-3 break-words [overflow-wrap:anywhere]">
                            <li>
                                <span className="text-primary font-medium">1. Ingest Validated Seed Payload & Settle Token Balance ([Rules 2, 34, 43])</span>
                                <ul className="list-disc pl-4 mt-1 space-y-1 text-zinc-500 text-[10px]">
                                    <li>Verifies <code>request.auth</code>, settles remaining balance (<code>4T/5T</code> Single-Seed or <code>9T/10T</code> Complex), stamps <code>tokensSpent</code>, and auto-refunds settlement on fatal pipeline failure.</li>
                                    <li>Sanitizes <code>payload.filters</code> via <code>sanitizeDiscoveryFilters</code> and forces <code>needsProGeneration = true</code> when <code>hasActiveDiscoveryFilters</code> is true.</li>
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
                                <span className="text-primary font-medium">Saves Baseline & Handoff:</span> Persists baseline topology to Firestore, returns HTTP 200 OK, and writes <code>curationJobs</code> with <code>lockedSeeds</code> (origin, ISO &amp; genre lock).
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
                        <ul className="text-[11px] text-zinc-400 space-y-3 break-words [overflow-wrap:anywhere]">
                            <li>
                                <span className="text-primary font-medium">1. Update Job | Atomic Claim Lock</span>
                                <ul className="list-disc pl-4 mt-1 space-y-1 text-zinc-500 text-[10px]">
                                    <li>Atomic Firestore transaction (<code>db.runTransaction</code>) checks live <code>curationJobs/&#123;jobId&#125;</code> status. Transitions <code>'pending' &rarr; 'processing'</code>, stamps <code>claimedAt</code> &amp; <code>claimedByEventId</code>, and sets project status to <code>'curating'</code>.</li>
                                    <li>Suppresses duplicate Eventarc deliveries (exits 200 OK immediately if status &ne; 'pending') to prevent race-condition re-runs.</li>
                                </ul>
                            </li>
                            <li>
                                <span className="text-primary font-medium">2. Hydrate Node Batch | 3.6 Flash (low) [Rules 8, 38 & 40]</span>
                                <ul className="list-disc pl-4 mt-1 space-y-1 text-zinc-500 text-[10px]">
                                    <li>Read Gate (isFullyQualifiedEntityProfile + Origin-Suffix Parity): Requires complete structured schema and origin matching <code>-iso</code> suffix (100% agnostic to audio preview fields). Rejects foreign homonyms and prose-fallback stubs.</li>
                                    <li>Miss: Enforces <code>lockedSeeds</code> / <code>-iso</code> identity lock, canonical <code>node.id</code> scene context, and strict <code>ARTIST/LABEL_NODE_DETAILS_SCHEMA</code> (3x retry). Rule 38 4-Tier Scraper queries regional <code>country=ISO</code> storefronts first before US fallback; enforces Tier 1 mandatory catalog corroboration, Tier 3 zero-match backfill prohibition (<code>canBackfill</code>), tightened substring matching (&ge;0.70 ratio + year proximity), and hostile genre defense (&ge;2 albums required for hostile profiles); unverified artists fail fast to terminal quarantine <code>imageUrl: 'not-found'</code>, <code>discography: []</code>, <code>itunesArtistId: null</code>.</li>
                                    <li>Slug deduplication skips stubs, ambiguous multi-ISO collisions, and cross-scene foreign homonyms (<code>sceneAnchorIsos</code>); falls back to <code>seedStubs</code> if retries fail. Dynamic cooldown skips sleep on 100% cache-hit batches.</li>
                                </ul>
                            </li>
                            <li>
                                <span className="text-primary font-medium">2B. Level 2 Post-Hydration Boundary Audit ([Rule 41])</span>
                                <ul className="list-disc pl-4 mt-1 space-y-1 text-zinc-500 text-[10px]">
                                    <li>Audits hydrated non-seed artists against Level 2 Era/Origin guardrails BEFORE Step 3 synthesis, excising boundary violators from both <code>finalGraph</code> and <code>detailsCacheEntries</code>.</li>
                                </ul>
                            </li>
                            <li>
                                <span className="text-primary font-medium">3. Scene Zine &amp; Step 3B Overarching Multi-Scene Zine ([Rules 24, 40, 44])</span>
                                <ul className="list-disc pl-4 mt-1 space-y-1 text-zinc-500 text-[10px]">
                                    <li>Synthesizes Scene narrative in 2 AM record curator voice (zero em-dashes), weaving active Tier 2 &amp; Tier 3 anchors.</li>
                                    <li>When <code>scenes.length &gt;= 2</code>, runs <code>generateOverarchingZineBackend</code> (<code>3.1 Pro high</code>, 90s timeout failover to <code>3.6 Flash low</code>) to synthesize <code>overarchingRationale</code> and <code>crossSceneLinks</code> (<code>sonic_lineage</code> + deterministic <code>identity</code> bridges).</li>
                                </ul>
                            </li>
                            <li>
                                <span className="text-primary font-medium">Step 4A: Topology Parity | 3.6 Flash (minimal)</span>
                                <ul className="list-disc pl-4 mt-1 space-y-1 text-zinc-500 text-[10px]">
                                    <li>Injects missing narrative connections into <code>finalGraph.links</code> via <code>reconcileNarrativeEdges</code> with sanitized directional <code>forwardContext</code> &amp; <code>inverseContext</code> predicates.</li>
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
                                <span className="text-primary font-medium">6. Persist Assets (Dual Write Gate Guard [Rule 40]) & Telemetry:</span> Commits seed <code>graphData</code> ONLY if <code>synthesisRationale &gt;= 50</code> chars. Commits global <code>/artists</code> &amp; <code>/labels</code> ONLY if profile passes <code>isFullyQualifiedEntityProfile</code> (<code>Array.isArray(discography)</code>, authentic <code>recommendationReason</code>, zero prose-fallback stubs; Labels enforce <code>imageUrl: null</code>). Updates job status to 'completed'.
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

        </div>

        {/* Tier 2: Rules Ledger (Bottom Row, 2 Columns) */}
        <div className="p-4 sm:p-5 rounded-xl border border-zinc-700 bg-zinc-900/80">
            <div className="text-white font-medium text-sm mb-4 pb-2 border-b border-zinc-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary text-base">gavel</span>
                    <span>Rules Ledger</span>
                </div>
                <span className="text-[10px] font-mono text-primary uppercase font-bold tracking-wider">44 Laws</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {ARCHITECTURE_RULES.map(rule => (
                    <div key={rule.id} className="p-2.5 bg-yellow-500/5 border border-yellow-500/15 rounded-lg flex flex-col justify-start">
                        <div className="text-[10px] font-bold text-yellow-500 uppercase tracking-tighter mb-0.5">[Rule {rule.id}] {rule.title}</div>
                        <div className="text-[10px] text-zinc-400 leading-relaxed">{rule.desc}</div>
                    </div>
                ))}
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
                    <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-zinc-900 text-[10px] text-primary px-2">Sync: Render Connections</span>
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
                    <div className="flex justify-between items-start gap-3 border-b border-zinc-800 pb-1.5"><span className="text-zinc-400 shrink-0">createdAt</span><span className="text-white text-right">Immutable</span></div>
                    <div className="flex justify-between items-start gap-3 border-b border-zinc-800 pb-1.5"><span className="text-zinc-400 shrink-0">updatedAt</span><span className="text-green-400 text-right">Mutable</span></div>
                    <div className="flex justify-between items-start gap-3 border-b border-zinc-800 pb-1.5"><span className="text-zinc-400 shrink-0">expireAt</span><span className="text-yellow-400 text-right">Soft-expires 365d (createdAt + 365d)</span></div>
                    <div className="flex justify-between items-start gap-3"><span className="text-zinc-400 shrink-0">cachedAt</span><span className="text-red-500 line-through text-right">Eradicated</span></div>
                </div>
                <div className="mt-3 text-[11px] text-zinc-500 leading-relaxed">
                    Soft-expires at 365 days. Lifecycle Rule: Soft-expires 365 days from createdAt strictly. updatedAt mutations (e.g., appending a graph to a stub) DO NOT reset the 365-day biographical lifespan. Stale nodes are ONLY refreshed when intersected by a user-funded generation. Never auto-swept.
                </div>
            </div>

            {/* Tier 2 */}
            <div className="bg-zinc-900 border border-zinc-700 p-4 rounded-xl">
                <div className="flex items-center gap-2 mb-2">
                    <div className="w-2 h-2 rounded-full bg-purple-500"></div>
                    <div className="text-purple-400 font-bold text-xs uppercase tracking-wider">Tier 2: Ephemeral</div>
                </div>
                <div className="text-zinc-500 text-[10px] mb-3 uppercase font-mono break-words [overflow-wrap:anywhere]">/sharedZcenes, /curationJobs, /curationSessions, /deepWebSessions</div>
                <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between items-start gap-3 border-b border-zinc-800 pb-1.5"><span className="text-zinc-400 shrink-0">createdAt</span><span className="text-white text-right">IMMUTABLE (DeepWeb Pass: reset on re-unlock)</span></div>
                    <div className="flex justify-between items-start gap-3 border-b border-zinc-800 pb-1.5"><span className="text-zinc-400 shrink-0">updatedAt</span><span className="text-zinc-300 text-right">NULL (Shared) | MUTABLE (Jobs / Sessions / DeepWeb Pass)</span></div>
                    <div className="flex justify-between items-start gap-3 border-b border-zinc-800 pb-1.5"><span className="text-zinc-400 shrink-0">expireAt</span><span className="text-orange-400 text-right">30d (Shared) | 24h (Jobs / Sessions) | NULL (DeepWeb Pass)</span></div>
                    <div className="flex justify-between items-start gap-3"><span className="text-zinc-400 shrink-0">cachedAt</span><span className="text-red-500 line-through text-right">Eradicated</span></div>
                </div>
                <div className="mt-3 text-[11px] text-zinc-500 leading-relaxed">
                    Hard TTL on ephemeral docs (/sharedZcenes: +30d; /curationJobs: completedAt +24h; /curationSessions: +24h sliding). /deepWebSessions ({'{uid}_global_deepweb_pass'}) persists with no TTL for free cross-Zcene resume until all 3 messages are consumed.
                </div>
            </div>

            {/* Tier 3: Owned */}
            <div className="bg-zinc-900 border border-zinc-700 p-4 rounded-xl">
                <div className="flex items-center gap-2 mb-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                    <div className="text-emerald-400 font-bold text-xs uppercase tracking-wider">Tier 3: Owned (2-Stage Lifecycle)</div>
                </div>
                <div className="text-zinc-500 text-[10px] mb-3 uppercase font-mono">users/uid/projects</div>
                <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between items-start gap-3 border-b border-zinc-800 pb-1.5"><span className="text-zinc-400 shrink-0">createdAt</span><span className="text-white text-right">Immutable</span></div>
                    <div className="flex justify-between items-start gap-3 border-b border-zinc-800 pb-1.5"><span className="text-zinc-400 shrink-0">updatedAt</span><span className="text-green-400 text-right">Mutable (Autosave & Compaction)</span></div>
                    <div className="flex justify-between items-start gap-3 border-b border-zinc-800 pb-1.5"><span className="text-zinc-400 shrink-0">purgeAt</span><span className="text-amber-400 text-right">trashedAt + 30d (Trash) | NULL (Active)</span></div>
                    <div className="flex justify-between items-start gap-3"><span className="text-zinc-400 shrink-0">lifecycle</span><span className="text-emerald-400 text-right">Active → 30d Trash (0T Restore) → Compaction</span></div>
                </div>
                <div className="mt-3 text-[11px] text-zinc-500 leading-relaxed">
                    Enforces a 2-Stage Lifecycle: Active workspaces soft-delete to 30-Day Trash (<code className="text-amber-300">status: 'trashed'</code>), retaining 100% of <code className="text-zinc-300">graphData</code>, <code className="text-zinc-300">detailsCache</code>, and <code className="text-zinc-300">canvasLayout</code> for zero-token (0T) user restoration. After 30 days or upon "Delete Forever", documents undergo Telemetry Compaction (<code className="text-zinc-400">status: 'deleted'</code>): heavy graph blobs are stripped to null while financial and cache headers (<code className="text-primary">tokensSpent</code>, <code className="text-red-400">apiUsage</code>, <code className="text-zinc-300">anchorResolution</code>, <code className="text-zinc-300">activeNodesCount</code>) are permanently retained for immutable accounting in The Discovery Ledger.
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
                <div className="text-zinc-500 text-[10px] text-center italic">Multi-Scene: canvasLayout &amp; settled coords preserved; Single-Scene: Coordinate Amnesia applied</div>
            </div>

            <div><span className="material-symbols-outlined text-zinc-700 text-sm">arrow_forward</span></div>

            {/* Step 3: Trigger Save */}
            <div className="flex flex-col items-center gap-2 flex-1">
                <div className="w-full py-2.5 px-2 rounded-lg bg-primary text-brand-black font-bold text-xs text-center shadow-lg shadow-primary/20">
                    SAVE TO MY ZCENES
                </div>
                <div className="text-zinc-400 text-[10px] text-center">1:1 Clone via Serializer (0 Tokens)</div>
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
                    V44 Full-Stack Regression Runbook
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
    onNavigateMenu,
    tokenBalance
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
                tokenBalance={tokenBalance ?? profile?.tokenBalance ?? 0}
                isProfileOpen={isProfileOpen}
                setIsProfileOpen={setIsProfileOpen}
                isDeleteAccountModalOpen={isDeleteAccountModalOpen}
                setIsDeleteAccountModalOpen={setIsDeleteAccountModalOpen}
                isMenuOpen={isMenuOpen}
                setIsMenuOpen={setIsMenuOpen}
                onRestartWalkthrough={onRestartWalkthrough}
            />

            {/* Mobile Navigation Dropdown */}
            <div className="lg:hidden p-4 sticky top-0 bg-background-dark/95 backdrop-blur-md z-[90] border-b border-zinc-800 flex items-center gap-3">
                <BackButton onClose={onClose} onNavigate={onNavigateMenu || onNavigate} fallbackView={View.Dashboard} />
                <div className="relative flex-1 min-w-0">
                    <select
                        id="engine-nav"
                        className="w-full appearance-none rounded-xl border border-zinc-700 bg-zinc-900 text-zinc-300 py-2 pl-4 pr-8 text-xs font-medium focus:ring-1 focus:ring-primary focus:outline-none"
                        onChange={handleSelectChange}
                        defaultValue=""
                    >
                        <option value="" disabled>Jump to architectural pillar...</option>
                        {sections.map(s => (
                            <option key={s.id} value={s.id}>{s.title}</option>
                        ))}
                    </select>
                    <span className="material-symbols-outlined pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 text-sm">arrow_drop_down</span>
                </div>
            </div>

            <div className="container mx-auto px-4 sm:px-6 lg:px-8 flex gap-12 flex-grow">
                {/* Desktop Sticky Sidebar */}
                <aside className="w-56 flex-shrink-0 sticky top-28 self-start h-[calc(100vh-8rem)] hidden lg:block overflow-y-auto overflow-x-hidden pl-4 scrollbar-thin scrollbar-thumb-zinc-800">
                    <div className="pt-6 pb-4">
                        <BackButton onClose={onClose} onNavigate={onNavigateMenu || onNavigate} fallbackView={View.Dashboard} />
                    </div>
                    <nav className="space-y-1">
                        {sections.map(s => (
                            <a 
                                key={s.id} 
                                href={`#${s.id}`} 
                                onClick={(e) => handleNavClick(e, s.id)}
                                className="block text-zinc-400 hover:text-primary hover:bg-zinc-800/50 py-1.5 px-2 rounded-xl transition-colors text-sm"
                            >
                                {s.title}
                            </a>
                        ))}
                    </nav>
                    <div className="mt-8 pt-4 border-t border-zinc-800/60 text-[10px] text-zinc-500 font-mono pl-2">
                        Zcene V44 Blueprint<br/>
                        100% Anti-Regression
                    </div>
                </aside>

                <main className="flex-1 py-10 space-y-16 min-w-0">
                    <div className="lg:hidden pt-4 pb-2">
                        <BackButton onClose={onClose} onNavigate={onNavigateMenu || onNavigate} fallbackView={View.Dashboard} />
                    </div>
                    
                    {/* Header Banner */}
                    <div className="mb-8 border-b border-zinc-700/60 pb-6">
                        <div className="flex items-center gap-3 mb-2">
                            <h1 className="text-2xl sm:text-3xl font-medium text-white">Engine</h1>
                            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-primary/20 text-primary border border-primary/40">V44 Locked</span>
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
- Charge (ManyBody): -500 (Organic Mode) to -1200 (Cluster Mode); Petal Satellites: -100 to -120
- Collision Radius: 80 * sizeMult (Prevents overlap while preserving semantic density)
- Alpha Targets: 0.15 (Initialization) / 0.2 (Selection Wake) / 1.0 (Structural Topology Change)
- Alpha Cooling: alphaDecay(0.1) and alphaMin(0.01) halt simulation rapidly
- Horizontal Scene Stride: SCENE_HORIZONTAL_STRIDE = 1050px

LINK DISTANCES & STIFFNESS:
- Artist <-> Artist: 450px * distMult (derived from 3.6 Flash semantic weight 0.1 - 1.0)
- Outward-Arc Petals: Satellites at r ∈ [65px, 75px] radiating away from scene centroid
- Petal Link Distances: 65px (Genre) / 70px (Origin) / 75px (Founded) at 0.35 spring stiffness
- Cross-Scene Bridge Lines: Non-physics quadratic Bézier curves with 70–200px upward arc lift; fixed coordinate anchors, hypot >= 12px sub-pixel arc guard; resting and illuminated states governed by Design System (/design)

COLLISION RESOLUTION (resolveSceneNodeOverlaps):
- Deterministic post-physics AABB bounding box collision resolution (W = 7.2px/char + 22px + padding, H = 24px)
- Mass Hierarchy: Root Seeds (mass = ∞, immovable), Artists (mass = 6.7), Satellites (1° iterative tethered arc rotation preserving radial distance r ∈ [62px, 85px])

LOCKED SEMANTIC TOPOLOGY (Rule 21):
- D3 node drag gestures are permanently disabled (.drag() removed).
- Mobile canvas panning is completely unobstructed.
- Settled positions committed to canvasLayout via Coordinate Memory.`} 
                        />

                        <CodeBlock 
                            title="JIT Asset Telemetry & Circuit Breaker Contract (Rule 37)" 
                            content={`EMERGENCY PARACHUTE SPECIFICATION (healOrphanedAsset.ts):
- Trigger: Inspected node suffering a true 404 miss during live canvas exploration or eager hydration.
- Direct Delegation Parity: healOrphanedAsset delegates directly to fetchNodeDetailsBackend (curatorService.ts), guaranteeing 100% prompt, schema, bio scannability, anti-clumping, and zero-hallucination sanitizer parity with Column 3 batch hydration while recording granular token usage via usageCollector.
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
                    <p className="text-zinc-600">© 2026 Zcene Admin Console. V44 Programmatic Architecture.</p>
                </div>
            </footer>
        </div>
    );
};

export default EnginePage;
