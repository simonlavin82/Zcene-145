import React, { useState, useEffect, useRef } from 'react';
import { View } from '../types';
import { ZceneLogo, InstagramIcon } from './Icons';
import Header from './Header';
import { 
    GRAPH_RESPONSE_SCHEMA, 
    NODE_DETAILS_SCHEMA,
    GENERATE_GRAPH_PROMPT_TEMPLATE,
    GENERATE_GRAPH_WITH_CONTEXT_PROMPT_TEMPLATE,
    FETCH_NODE_DETAILS_PROMPT_TEMPLATE
} from '../services/geminiService';
import { ERROR_MAPPING_RULES, TOAST_MAPPING_RULES } from '../services/errorTranslationLayer';

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

const CRATE_SIZING_RULES_DOCUMENTATION = `
To prevent layout computation leaks, trailing dark voids, and mobile padding clipping bugs, the dashboard uses a count-aware layout system governed by the following rules:

1. FOLDER CONTAINERS:
   Must use a universal 'w-fit max-w-full' class. Sizing is delegated entirely 
   to the inner content boundaries across all viewports to prevent folders 
   from expanding into empty horizontal voids.

2. INNER GRID WRAPPERS:
   Must use explicit, dynamic count-mapped grid tracks ('grid \${gridColsClass}') 
   coupled with a 'w-fit' width property. This breaks circular layout dependencies 
   between the 'w-fit' parent folder and 'w-full' children, ensuring browser 
   engines correctly add the folder's paddings during layout resolution.

3. PROJECT CARDS:
   Must be sized rigidly at 'w-full sm:w-[320px] h-[180px]' with zero 
   elasticity ('flex-grow' and 'flex-shrink' properties are strictly banned) 
   to enforce crisp, uniform grid column tracks and snug row hugging.
`;

const ARCHITECTURE_DOCUMENTATION = `
Zcene is built on a modern, serverless full-stack architecture that prioritizes 
real-time intelligence and global scalability.

1. AI ORCHESTRATION (Google AI Studio):
   The platform leverages Google Gemini models for all musical intelligence. 
   - Gemini 1.5 Flash: Powers the high-speed graph expansion and 
     conversational chat, ensuring near-instant discovery loops.
   - AI Studio Integration: Native environment for rapid prompt engineering, 
     schema definition, and secure API key management during 
     the prototype-to-production lifecycle.

2. COMPUTE & SERVING (Cloud Run & Functions):
   The application is containerized and hosted on Google Cloud Run, supported by 
   Firebase Cloud Functions for event-driven orchestration.
   - Autoscaling: The containers scale dynamically based on request traffic, 
     ensuring the interactive D3 simulations remain responsive.
   - Cloud-Side Orchestrated Background Curation: Curation jobs are delegated 
     to an event-driven queue. Upon a new document in 'curationJobs', a gen2 
     Cloud Function manages the heavy lifting of calling Gemini, scraping YouTube 
     playability, and formatting metadata, fully offloading the client browser.
   - Stateful Project Orchestration: When a curation job begins, the frontend
      immediately saves the project status as 'curating', recording seedArtists
      and activeJobId. Even if the browser tab is closed, the background Cloud
      Function writes the completed graphData, artistIds, detailsCache, and
      activeNodes directly to the project document upon completion, allowing
      seamless session restoration on page reload. The activeNodes field is
      seeded with the normalized IDs of the seed artists confirmed present in
      the generated graph, so the Deep Cut panel opens to the correct artist
      on the user's first load without any user interaction.

   - Global Deployment: Serves at sub-second speeds by leveraging 
     Google's global edge network.

3. DATA & AUTHENTICATION (Firebase):
   - Firebase Auth: Provides secure, frictionless Google Login, 
     enabling users to save and persist their music discovery projects.
   - Cloud Firestore: A NoSQL real-time database used to store Project 
     states, seed artists, graph snapshots, and discovery filters.
   - Global Artist Cache: A top-level 'artists' Firestore collection acts as 
     a permanent, site-wide cache for computed graph structures and enriched 
     Deep Cut metadata, keyed by a normalized artist+filter identifier. 
     Projects store only a lightweight cacheKey reference and artist canvas 
     positions, dramatically reducing document size and Gemini API usage.
   - Rules Engine: Attribute-Based Access Control (ABAC) ensures every 
     music discovery journey remains private and secure. The global cache 
     collection is publicly readable but write-protected: only a CREATE 
     (cache miss) is permitted per key, preventing cache poisoning.
`;

const GRAPH_INTELLIGENCE_DOCUMENTATION = `
Zcene implements an incremental exploration engine. Instead of re-generating 
the entire dataset, the app evolves existing visual structures.

1. CONTEXT MAPPING:
   During "Update Zcene", the app scrapes the IDs and Types of all currently 
   visible nodes. This "Context Map" is sent to the Gemini model to prevent 
   entity duplication and force relational bridging.

2. NUCLEAR OPTION FILTERING (App.tsx):
   Zcene strictly enforces discovery filters (e.g., "Founded After", "Origin") 
   via a post-processing layer. Even if the AI model hallucinates or ignores 
   a constraint, the application engine manually prunes the graph to ensure 
   100% compliance with user settings. This includes strict inclusion/exclusion 
   of geographical origins.

3. NON-DESTRUCTIVE MERGE & NODE VISUAL STATES (App.tsx / MusicGraph.tsx):
   The merge logic preserves existing Node objects. This is critical because 
   D3 attaches internal state (x, y, vx, vy) directly to these objects. 
   Replacing objects would cause nodes to "explode" and reset their positions.
   - New nodes are injected with randomized positions (+/- 200px from center).
   - Existing nodes are updated via Object.assign to keep physics refs intact.
   - Robust ID Matching: Node selection is matched case-insensitively and through 
     normalized slugs ('isSameNodeId') to resolve raw artist name and selection mismatches.

4. DATA INTEGRITY & PARALLEL HYDRATION PIPELINE:
   - Parallel Backend Hydration: Curation details (biographies, genres, origins, 
     formed years, and member lists) for all nodes are resolved in sequential-batch 
     API calls on the backend. This pipeline integrates real-time YouTube scraping 
     and status check routines.
   - Orphaned Link Mitigation (geminiService.ts): Filters the AI response to 
     ensure every link's 'source' and 'target' corresponds to a validated node ID.
   - Client detailsCache callback: The client subscribes to job updates, immediately 
     piping compiled backend metadata into React memory upon completion.

5. GLOBAL CACHE ALIGNMENT & PROACTIVE 'DEEP CACHE' STRATEGY (artistCacheService.ts / App.tsx):
   Before invoking Gemini for Phase 02 Orchestration, the engine computes a 
   normalized single-artist ID (using Unicode NFD accent-stripping and hyphen replacement) 
   and probes the global 'artists' collection concurrently for all seeds.
   - Cache HIT: Graph structure + Deep Cut metadata are returned instantly. 
     Phases 02 and 03 are bypassed entirely. D3 Phase 04 begins immediately, 
     artist canvas positions from the project's canvasLayout are restored, and
     the Deep Cut activeNodes queue is initialised via the Seed-Fallback loader
     (see Section 7) so the panel opens to the correct artist on first render.
   - Proactive Deep Cache: Upon generating a graph, the Cloud Function proactively 
     hydrates and caches full profile details (biographies, YouTube IDs, discographies) 
     for both the seeds and all recommended peer bands (isDeep: true). This ensures 
     that subsequent user clicks on recommended nodes load details instantly offline.
   - Case-Insensitive Seed Normalization: Resolves casing discrepancies between 
     user seed inputs and lowercase model graph slugs. This guarantees that seed 
     metadata is correctly identified during proactive recommendation walks and 
     never overwritten with empty/null rationales.
   - Cache Upgrades & Self-Healing: If a cache document exists but fails validation 
     (e.g., legacy version), a "cache_upgrade" confirmation warning is shown. 
     If confirmed, live model queries update the cache. If canceled, the system triggers 
     a fallback using bypassCacheValidation = true to render legacy data.
   - Smart Cancel Fallback Routing: If the user cancels a mixed query warning, 
     the engine strips out the uncached subset on the fly and recursively re-routes 
     the search using only the cached (free) subset of artists (passing bypassCacheValidation = true).
   - State Rollback: Active node and seed artist states are reverted on cancel 
     to prevent canceled artists from leaking into the Deep Cut slider stack.
   - Key Format: lowercase, alphanumeric + hyphens, mapped directly to normalizeArtistId 
     (e.g. 'slowdive', 'my-bloody-valentine'). Max 256 chars.
   - Permanent cache by design: music histories, genre bridges, and Deep Cut 
     metadata rarely change. Admin manual deletion handles edge cases.

6. IMMERSIVE DISCOVERY FLOW & VIEWPORT OPTIMIZATIONS (MusicGraph.tsx / GraphPage.tsx):
   Zcene features a "Spiderweb" discovery interface that allows users to 
   interactively expand the graph in real-time.
   - Discovery UI: Contextual action buttons (+/-) emerge directly from 
     selected nodes, maintaining spatial anchoring during simulation.
   - Central Anchoring Layout: Seed Artist nodes are visually anchored to the center 
     coordinates of the graph viewport by applying a strong target positioning force (0.4), 
     while AI discoveries and metadata hubs orbit them organically.
   - Predictive Loading: When a new artist is discovered, a "Loading Node" 
     and dashed connection line appear, inheriting the momentum of the 
     parent node to prevent visual jumps.
   - Seamless Evolution: The transition from "Loading" to "Real Node" 
     preserves object identity and physics state, ensuring the narrative 
     flow is never interrupted by hard resets.
   - Desktop Sidebar Auto-Collapse: Selecting a node in the D3 graph automatically 
     collapses the left 'ARTISTS' sidebar to yield horizontal space to the canvas.
   - Mobile Dynamic Landing Routing: Initializes the mobile viewport directly on the 
     'SPIDERWEB' canvas tab if the loaded project contains seed artists.

7. UNIFIED PROJECT CONTEXT, ACTIVE NODES SYNCHRONIZATION & STATE-LOADING (App.tsx / GraphPage.tsx):
   Zcene enforces a single, unified project state that orchestrates project identity
   and curation status to eliminate loading jitter and flickering.
   - Synchronous Pre-population: Project identity (seedArtists, projectName, status, and activeJobId)
     is synchronously pre-populated from the local dashboard 'projects' list during routing,
     preventing the header from briefly clearing or flickering.
   - Auto-Hydration: The Deep Cut details panel automatically hydrates upon loading a completed project
     by auto-selecting the first activeNodes entry and triggering the local details loader.
   - SEED-FALLBACK LOADER (CRITICAL — App.tsx: handleProjectSnapshot):
     The project loader runs across four code branches (graphData-direct, Phase 1 per-artist cache,
     legacy cacheKey format, very-legacy blob format). Every branch calls
     setActiveNodeIds() with a resolved value. For projects generated via the backend Cloud
     Function prior to the activeNodes fix, data.activeNodes is always [] because the field
     was never written by the backend — producing a permanent "DEEP CUTS: 0" indicator and a
     flickering panel (briefly showing 1 from a prior state, then reverting to 0 when the
     Firestore snapshot arrives). The Seed-Fallback pattern resolves this at all 6 call sites:

       let resolvedActiveNodes = data.activeNodes;
       if (resolvedActiveNodes.length === 0 && graphNodes.length > 0) {
         const seedSet = new Set(seedArtists.map(normalizeArtistId));
         resolvedActiveNodes = graphNodes
           .filter(n => (n.type === 'artist' || !n.type) && seedSet.has(normalizeArtistId(n.id)))
           .map(n => n.id);
       }
       setActiveNodeIds(resolvedActiveNodes);

     This computes the correct queue on the fly from the already-loaded graph, producing a
     stable non-zero count on first render with no flicker or revert. The first resolved node
     is also used to auto-select and hydrate the Details panel synchronously.
   - BACKEND ACTIVENODES WRITE (onCurationJobCreated.ts):
     The Cloud Function now writes activeNodes: [seedArtistId, ...] to the project document
     on job completion, so future loads restore the queue from Firestore directly without
     needing the fallback. The fallback remains in place for legacy project documents that
     pre-date this fix and for any edge case where the backend write is partial.
   - DASHBOARD FALLBACK (Dashboard.tsx):
     The dashboard project card's deepCutsCount also applies an identical seed-intersection
     fallback when project.activeNodes is empty, ensuring the DEEP CUTS chip always reflects
     at least the number of seed artists present in the graphData — applied to both the card
     view and the list view render paths.
   - Hydration Spinner Safeguard: To prevent race conditions where the Deep Cut panel
     momentarily flickers to the "Create Your Zcene" onboarding state before details are
     loaded, the panel renders the LoadingSpinner if seed artists are present in the project
     context.
   - Graceful Degradation Protocol: Any node with a displayable biography (summary length > 5
     characters) must be rendered immediately from cache, bypassing all loaders. Necessary
     data validation, revalidation, or cache self-healing is executed strictly in the
     background (via 'triggerBackgroundRevalidation') without blocking the user, clearing the
     panel, or triggering the foreground loading overlay. If the JIT details queue revalidation
     fails for an already displayable node, the exception is bypassed silently without writing
     sentinels or toasting error alerts.
   - Canonical Graph Caching: Global shared artist cache documents (/artists/{id}) store the
     complete, canonical compiled graph returned by the model rather than pruned sub-graph
     snippets. This guarantees that both single-seed and multi-seed projects consistently
     reference the full master network.
   - Sentinel Resolution: Cache entries marked as sentinel slots (_isSentinel: true) are
     flagged as corrupt; clicking a sentinel node bypasses the early-return cache checks and
     triggers JIT re-evaluation.
   - Silent Re-validation: Metadata re-validation checks operate fully in the background.
     User-facing toasts for 'Cache Incomplete' (curation incomplete) warnings are suppressed
     to prevent developer-level notification noise.

10. DIRECT-WIRE HUMAN-IN-THE-LOOP DISAMBIGUATION (STAGE 0) — AUTHORITATIVE GOVERNANCE:
    Constitutional Rule: The cache is ALWAYS interrogated first. Every search passes
    through an explicit human-in-the-loop verification checkpoint before synthesis occurs.
    Accepting a candidate loads the cached record. Clicking "Search Live AI" / "Not This One..."
    directly closes the modal and dispatches the live Gemini 3.1 Pro generative synthesis
    pipeline with cache lookup skipped (skipCacheLookup = true), STAGE 0 re-entry bypassed
    (bypassDisambiguation = true), and token authorization enabled (bypassTokenConfirmation = false).

    State Machine & Verification Pipeline:
    - Step 1 (Cache Interrogation): searchDisambiguationCandidates() queries global /artists.
    - Step 2 (Human-in-the-Loop Checkpoint):
      - 0 cache hits -> "No cached records found" + Search Live AI -> Direct Live Synthesis + Cancel.
      - 1 cache hit -> "Look What I Found" (single card). Clicking card accepts candidate.
        Escape: "Not This One — Search Live AI" -> Direct Live Synthesis + Cancel.
      - >1 cache hits -> "Disambiguation" (list of cards). Clicking card accepts candidate.
        Escape: "Not What I'm Looking For — Search Live AI" -> Direct Live Synthesis + Cancel.
    - Step 3 (Direct Live Synthesis): Clicking Search Live AI closes the modal instantly.
      handleGenerateGraph re-invokes with skipCacheLookup = true, bypassDisambiguation = true,
      and bypassTokenConfirmation = false. The decoupled guard skips STAGE 0 re-entry, displays
      the API Token Authorization Modal, and dispatches live Gemini 3.1 Pro synthesis directly.

    Self-healing: Every successful live synthesis writes a country-anchored composite cache key
    (e.g. "oblivion-italy") via writeArtistCacheMany(). Future searches for the same artist name
    populate State B or C with distinct candidates, enriching the index automatically.
`;


const PHYSICS_ENGINE_DOCUMENTATION = `
The spiderweb is powered by a D3.js force-directed simulation (d3-force) 
tuned for "Organic discovery and Stable clustering" (MusicGraph.tsx).

STABILITY & MOMENTUM CONSTANTS:
- Velocity Decay: 0.7. Provides high friction for rapid settling and 
  stability, minimizing jitter during user interaction.
- Charge (ManyBody): -500 (Organic Mode) to -1200 (Cluster Mode). 
  Variable repulsion allows the "gravity" of connections to define the layout.
- Collision: radius(80 * sizeMult in Organic). Prevents overlaps while 
  maintaining dense, semantic grouping without forcing grid symmetry.
- Alpha Targets: 0.15 (Initialization) / 0.2 (Interactive Drag). Reduced 
  initial momentum ensures the graph remains approachable and clickable.
- Alpha Cooling: alphaDecay(0.1) and alphaMin(0.01). Forces the simulation 
  to reach a complete halt rapidly to prevent perpetual "liquid" jitter.
- Sticky Nodes: Nodes are pinned (fx/fy) permanently upon drag release to 
  allow for manual structural curation.

RELATIONAL SCALING (Formulas):
Users can adjust layout density via the Preferences panel.
- Link Distance Multiplier (distMult): Math.pow(1.8, (graphSettings.linkDistance - 3))
- Node Size Multiplier (sizeMult): Math.max(0.1, graphSettings.nodeSize / 3)

SPECIFIC LINK DISTANCES (Organic):
- Artist <-> Artist: 450px * distMult (Tuned for visual flow)
- Artist <-> Founded: 100px * distMult (Tight, satellite relationship)
- Genre Hubs: 280px * distMult
- Label Hubs: 140px * distMult
- Origin Hubs: 320px * distMult

RELATIONAL CLUSTERING (Layout Logic):
Zcene provides two primary view modes to balance discovery and clarity:

1. ORGANIC MODE:
   A standard force-directed layout where all nodes influence each other 
   equally. This provides an honest, interconnected "spiderweb" view of 
   the music scene.

2. CLUSTER MODE (Categoric Hierarchy):
   Forces a radial hierarchical structure to ensure visual clarity even 
   with complex datasets.
   - Radial Spread: Artists are positioned on a wide radial spread to 
     avoid visual huddling.
   - Attribute Petals: Metadata (Genre, Label, Origin) are pulled tightly 
     toward their respective artists, creating distinct "blooms".
   - Anchoring: Seed Artists are positioned on an inner ring, while 
     recommended artists occupy the outer discovery ring.
   - Result: A clean, symmetrical "cluster" layout that eliminates 
     overlapping clusters and emphasizes artist-attribute relationships.
`;

const RESILIENCE_DOCUMENTATION = `
Zcene handles AI model constraints (Rate Limits/Hallucinations) using a 
Serial Fetch & Backoff Strategy in App.tsx and OS-level stability logic.

1. SERIAL QUEUEING:
   Details (Deep Cut) are fetched one-at-a-time rather than in parallel. 
   This stays within the 15 RPM (Requests Per Minute) free tier limits 
   of Flash-series models.

2. RETRY LOGIC (Backoff):
   If a 429 (Resource Exhausted) or 500 error occurs:
   - Jittered Exponential Backoff: Wait time increases exponentially 
     (e.g., 2s, 4s, 8s) + random noise to prevent thundering herd issues.
   - Max Retries: 3 attempts per node.

3. DISCOVERY MODE STABILITY:
   When filters are changed, Zcene forces a full graph refresh. This 
   prevents "Ghost Nodes" (artists that no longer match the filter) from 
   polluting the visualization or influencing new AI recommendations.

4. SELECTION DEPTH STRATEGY:
   - Artist Selection: Highlights 2nd-degree connections (Metadata + Peers).
   - Metadata Selection (Genre/Label): Highlights 1st-degree only (Local 
     artists only). This prevents "Global Washout" when clicking 
     large hubs like 'Pop' or 'Electronic'.

5. SCREEN WAKE LOCK (Mobile Stability):
   Long-running AI tasks (40s+) often hit mobile OS sleep limits. Zcene 
   implements the 'Screen Wake Lock API' during 'isLoading' states.
   - Request: Acquires sentinel when generation starts.
   - Purpose: Prevents JavaScript suspension and socket closure.
   - Recovery: Automatically re-acquires lock on 'visibilitychange' if the 
     user returns to an active loading state.

6. DEEP CUT CREATION GATING (App.tsx):
   Clicking a node whose biography is not cached in local state or Firestore 
   triggers the Token Quota Warning dialog before any sidebar updates or loading states 
   are applied. The query is labeled as "DEEP CUT CREATION" at a cost of $0.0015. 
   If canceled, the operation aborts cleanly and the screen remains unchanged. 
   If confirmed, the sidebar opens and detail generation proceeds.

7. HEAL CACHE & LOADER STATE OPTIMIZATION (App.tsx):
   - Heal Cache & Invalidation Fallback: Manual force-refresh evicts the node from local cache, clears bio/metadata properties on selectedNode to allow re-fetching (bypassing hasHydratedBio), and populates evictedNodeIdsRef. If deleteDoc fails due to security restrictions, the system falls back to updateDoc to invalidate the Firestore document cache in-place (detailsCache = '').
   - Outer Try/Catch/Finally Loader Gate: The entire graph generation pipeline is wrapped in a comprehensive outer try/catch/finally block to guarantee isLoading is cleared.
   - Mutated Seed ID Cleanups: Mutation from a partial query to a canonical node (e.g. 'Gaye' -> 'Marvin Gaye') clears the old unmutated seed ID from loadingNodeIds, and the JIT details queue finally block removes all variation formats case-insensitively.

8. LIVE SYNTHESIS TIMEOUTS & ABORT DELEGATION (App.tsx / geminiService.ts):
   - 180s Execution Timeout Ceiling: The main graph generation timeout ceiling is extended to 180 seconds (3 minutes) to accommodate heavy multi-seed co-equal synthesis passes.
   - AbortSignal Propagation: The client-side AbortController's signal is propagated directly down to the outbound fetch wrappers. If the query times out or is manually canceled by the user, the network request is immediately aborted to prevent leaking queries.
   - Quota-Rinsing Retry Mitigation: The network layer explicitly catches AbortErrors and excludes gateway timeouts/504 errors from automated transient retries, ensuring that aborted or timed-out requests do not rinse the API key's token quota.

9. ROOTS BREAKDOWN SCANNABILITY FORMATTING (SharedModals.tsx / index.css):
   - Markdown Bio Styling Parity: The synthesis rationale payload is parsed and rendered natively via standard Markdown components using the .markdown-bio design guidelines. This ensures bullet points, paragraph spacing, and bold key term highlighting maintain consistent scannability aesthetics with the Deep Cut biographies.
`;

const SHARING_FLOW_DOCUMENTATION = `
Zcene enables collaborative discovery via project sharing. The flow is 
designed to minimize friction for new users while rewarding existing authors.

1. URL-BASED SHARING:
   Every 'Share' operation generates a unique document ID in the Global 
   Shared collection. This ID is appended to the URL as a query parameter 
   (#/app?shareId=...).

2. READ-ONLY PREVIEW:
   - Anonymous/Logged-out: Users see a "Guest Mode" watermark. They can 
     explore the graph but cannot add nodes or modify filters.
   - Logged-in: Users see a "Shared Access" label. The graph remains read-only 
     until they clone it.

3. "CLONE & AUTHOR" FLOW (Atomic Copying):
   When a user clicks "Save to My Zcenes":
   - Authentication: If logged out, the request is queued and the user is 
     redirected to Google Login.
   - Hydration: After login, the pending action is triggered automatically.
   - Deep Copy: The application performs a server-side expansion of the 
     client-side state and writes it as a BRAND NEW document in the user's 
     personal project collection.
   - Ownership Transfer: The user becomes the full 'Author' of the clone, 
     instantly unlocking all discovery engine features (Spiderweb expansion, 
     Consult AI, and project renaming).
`;

const DATA_SYNTHESIS_PERSISTENCE_DOCUMENTATION = `
To prevent data rot, API failures, and visual rendering regressions, the synthesis and persistence pipeline is governed by the following rules:

1. ATOMICITY MANDATE (Direct Writes):
   - All synthesized seed artist documents must bundle 'graphData', 'detailsCache',
     and 'activeNodes' in a single, atomic database write (either setDoc or updateDoc).
   - Writing 'graphData' (Phase 2 graph synthesis) as a fire-and-forget promise
     prior to details extraction is strictly banned.
   - 'activeNodes' must be computed from the finished graphData (seed artist IDs
     intersected with confirmed graph nodes) and included in the same write.
     Omitting activeNodes from the completion write leaves the project document
     with activeNodes: [] (set at creation time), causing the Deep Cut panel to
     permanently display 0 and flicker on every subsequent project load.
   - This ensures that Firestore documents are never committed in a fragmented,
     "half-made" state that bypasses schema validation.


2. API GATEWAY MUTUAL EXCLUSIVITY RULE:
   - Tool calls (specifically Google Search grounding) and structured output 
     configurations (responseMimeType: 'application/json' or responseSchema) 
     are mutually exclusive at the Google Gemini API layer.
   - For any details-fetching request with search tools enabled, the client and 
     server MUST conditionally omit 'responseMimeType' and 'responseSchema' from 
     generationConfig to avoid a terminal 400 Invalid Argument error.

3. STRING SANITIZATION PIPELINE:
   - All AI-synthesized string metadata must pass through the 'sanitizeString' 
     utility to strip search-grounding citations and footnote brackets 
     (e.g., [1], [2], (3)) prior to caching or database serialization.
   - This ensures that UI-ready fields remain clean, readable, and free of 
     unsightly citation markers when bound to the sidebar panels.

4. MODEL STANDARDIZATION:
   - Detail extraction (fetchNodeDetails and triggerReSynthesis) must strictly 
     standardize on the 'gemini-2.5-flash' model. 
   - This model offers the optimal speed-to-fidelity ratio and guarantees 
     reliable JSON structure output, preventing parser failures and empty 
     metadata fallbacks.
`;

const DEEP_CUT_INTELLIGENCE_DOCUMENTATION = `
Zcene's "Curator Insights" use a Variety-First strategy to ensure every 
artist recommendation feels bespoke, snappy, and avoiding AI linguistic decay.

1. BREVITY MANDATE (Snappiness):
   The curator is strictly limited to ONE high-impact sentence (max 25 words). 
   This ensures insights remain punchy and scannable within the UI, 
   mirroring the sharp "Curator Insight" aesthetic.

2. LINGUISTIC ENTROPY (Anti-Rut Logic):
   The model is strictly instructed to avoid "linguistic fingerprints"—recurring 
   pattern metaphors like "waypoint," "bridge," or "nexus." This forces the 
   neural network to generate unique hooks for every card.

3. GENRE-SPECIFIC DICTION:
   Instead of a flat "Preferred Lexicon," Zcene mandates the use of 
   sub-culture specific terminology (e.g., 'Analogue warmth' for synth-pop, 
   'Distortion' for noise-rock). 

4. DYNAMIC SYNTAX GATING:
   The generation template explicitly forbids fixed sentence starters, 
   ensuring the rhythm of the curator's insights remains as varied as 
   the music itself.
`;

const CONVERSATIONAL_INTELLIGENCE_DOCUMENTATION = `
The "Consult Zcene AI" chat feature implements a zero-friction persona 
designed for expert-friend utility.

1. ATMOSPHERIC CONCISION:
   Responses are capped at 50 words and a single paragraph. This prevents 
   "Chatbot Fatigue" and keeps the user focused on the discovery graph.

2. UK ENGLISH STANDARDIZATION:
   To maintain a consistent cultural tone, the model is locked to UK 
   English spelling and idiom (e.g., 'Analysing', 'Colour').

3. PURE TEXT GATING:
   Zcene strictly forbids markdown (bolding, headers, lists) and symbolic 
   clutter in chat. This ensures the conversational layer maintains 
   a raw, editorial feel that contrasts with the structured metadata 
   of the Deep Cut.

4. NO REPLIES / PURE INSIGHT:
   The model is forbidden from using conversational fillers (e.g., "Hi," 
   "Sure thing"). It starts immediately with the musical insight to 
   maximize information density.
`;

const ADMIN_OVERRIDE_DOCUMENTATION = `
The "Quick Heal" (Force Refresh) capability is a privileged, Admin-only operation.
It is strictly gated behind identity-based authorization to protect the shared
global artist cache from unauthorized mutations.

1. IDENTITY GATE (App.tsx / DetailsPanel.tsx):
   The isAdmin flag is derived from a hard-coded email comparison:
     const ADMIN_EMAIL = 'zcene.online@gmail.com';
     const isAdmin = user?.email === ADMIN_EMAIL;
   The "Quick Heal" button is conditionally rendered ONLY when isAdmin === true.
   Standard users see no such control in the DetailsPanel UI.

2. CONFIRMATION REQUIREMENT:
   When an Admin triggers Quick Heal, a TokenConfirmationDialog is shown before
   any write operation or synthesis call proceeds. This "human-in-the-loop" step
   prevents accidental global cache evictions.

3. CACHE EVICTION FALLBACK:
   The eviction flow first attempts deleteDoc on the Firestore artist document.
   If this fails due to security rule restrictions (e.g. non-admin context),
   the system falls back to updateDoc, setting detailsCache to '' (empty string)
   to in-place invalidate the cache without full document deletion.
   - Successful: The node is added to evictedNodeIdsRef and cleared from the
     local detailsCache Map and healedNodeIdsRef, forcing a full re-synthesis.
   - Failed/Fallback: updateDoc marks the document as stale, triggering a
     validation failure on the next read, which routes through the synthesis flow.

4. RATIONALE (Design Decision):
   Deep Cut metadata is a shared global resource. Every user reading the same
   artist benefits from the cached result. Granting standard users the ability
   to trigger re-synthesis would: (a) cause unnecessary token quota consumption,
   (b) allow cache poisoning via rapid successive refresh clicks, and
   (c) introduce race conditions between parallel synthesis calls.
   The Admin-only model ensures curation quality and budget control.
`;

const SELF_HEALING_DOCUMENTATION = `
Zcene implements a Priority-Based Self-Healing system that autonomously repairs
degraded Deep Cut metadata without triggering unnecessary API calls.

The system distinguishes between two categories of data quality:

1. HARD REQUIREMENT — AUTO-HEAL (App.tsx: checkIsProfileStaleOrCorrupt):
   The following conditions trigger an immediate background re-synthesis:
   - Biography/summary is null, empty, or consists only of whitespace.
   - Summary length is below 100 characters (classified as a "lite" profile).
   - Summary contains placeholder text (e.g., "currently unavailable").

   Trigger mechanism: handleNodeClick detects a stale profile via
   checkIsProfileStaleOrCorrupt(cachedDetails). If stale, the node is quietly
   evicted from the local healedNodeIdsRef tracking set and re-queued for
   synthesis in the background, WITHOUT prompting the user.

   Session Guard (healedNodeIdsRef): A Set<string> tracks node IDs that have
   already been auto-healed in the current session. A node will not be
   re-synthesized more than once per session, preventing infinite healing loops.

2. OPPORTUNISTIC ENHANCEMENT — DO NOT AUTO-HEAL:
   The following conditions are treated as acceptable "lite" states:
   - High-quality biography present (>= 100 chars) but no image URL.
   - Genre or origin is "Unknown" but bio text is substantive.

   Images are classified as optional enrichment data. The system will NOT
   trigger re-synthesis solely because an image is absent. This prevents
   wasteful API calls for content that is functionally complete.

3. ADMIN OVERRIDE:
   An Admin can bypass the "Do Not Auto-Heal" logic at any time using the
   "Quick Heal" button. This forces a full re-synthesis, which includes a
   fresh attempt at image discovery, regardless of current profile quality.

4. SCOPE BOUNDARY:
   Auto-healing only fires for ARTIST nodes (type === 'artist'). Metadata
   hub nodes (Genre, Label, Origin, Founded) are never auto-healed.

5. THE SELF-HEALING LIFECYCLE (MANDATORY CONTRACT):
   - To prevent legacy data regressions, a strict "schema-first" cache validation model is enforced via the 'validateCacheEntry' and 'validateRootsBreakdown' pattern.
   - Every cached artist card/document must contain a complete dataset, including the required "Roots Breakdown" structure (Acoustic & Sonics, Scene Context, Overlap Insights).
   - MANDATORY CONTRACT FOR DATA-LAYER CHANGES: Any new data field introduced to 'NodeDetails' that is required for high-fidelity UI representation must be added to the 'validateCacheEntry' schema-validation gate in 'App.tsx'.
   - This ensures that legacy or incomplete datasets lacking the new fields are treated as "cache misses" at the front gate and details panel, automatically routing through the standard 'confirmTokenUsage' estimation warning and live Gemini API re-synthesis to heal the cached records to the current schema standards.
`;

const CACHE_VALIDATION_DOCUMENTATION = `
1. CONTEXT-AWARE VALIDATION (validateRootsBreakdown):
   The validation of cached reasoning rationales (synthesisRationale) is context-aware to ensure optimal data-reuse. 
   It operates in two distinct validation scopes governed by the 'isSingleArtist' flag:
   - Single-Artist Mode (isSingleArtist === true):
     Validates single-artist Zcenes. Requires only 'acoustic' and 'scene' keywords.
     The 'overlap' insight check is bypassed because single-seed graphs contain no overlapping relationships.
   - Multi-Artist Mode (isSingleArtist === false):
     Validates complex, multi-artist graphs. Enforces all three keywords: 'acoustic', 'scene', and 'overlap' 
     to ensure cross-connection network fidelity.

2. LOGIC FORKING GATES (MANDATORY REQUIREMENT):
   Any future modifications to the 'validateRootsBreakdown' or 'validateCacheEntry' functions in 'App.tsx' 
   MUST preserve this context-aware logic fork. Disabling the fork or applying the strict multi-artist 
   'overlap' constraint globally will regress the system into redundant, paid Gemini API re-synthesis loops 
   for single-artist caches.

3. FLAG PROPAGATION PATTERN:
   The 'isSingleArtist' flag should be propagated dynamically from the graph generation queries 
   (e.g., checking 'artistList.length === 1' inside handleGenerateGraph) or set to 'true' in isolated 
   detail panel reads where only a single artist's profile card is being evaluated.
`;

const LOCALIZED_LOADING_DOCUMENTATION = `
1. CARD-BODY-SCOPED LOADING SPINNER (DetailsPanel.tsx):
   Instead of global or panel-level overlays, the loading spinner is rendered
   strictly inside the body of the individual NodeDetailsCard:
   - When details is null (net-new): The card body is replaced by the spinner.
   - When details exists (Force Refresh/regenerating): An absolute backdrop
     blur and loading spinner overlays the details container, leaving the
     artist title, tags, and header action buttons fully visible and active.
   - Cancel button is accessible directly in the card body at all times.

2. GUARANTEEING SPINNER PAINT WITH flushSync & activeNodes BYPASS (App.tsx):
   To prevent React 18 automatic batching and the Firestore SDK in-memory cache
   from bypassing the spinner entirely (which happens when the JIT useEffect
   completes in 0ms and adds details before the card is even mounted), we wrap
   both setSelectedNode and setActiveNodeIds in flushSync:

     flushSync(() => {
       setSelectedNode(node);
       setActiveNodeIds(prev => [...prev, node.id]);
     });

   Additionally, because activeNodes is filtered to only include nodes with
   populated details Cache, a net-new generating node would normally be filtered
   out and its card would never mount. We update the activeNodes useMemo filter
   to check loadingNodeIds and bypass the details presence check:

     const isGenerating = loadingNodeIds.has(n.id) || ...;
     if (isGenerating) return true;

   This forces React to synchronously mount the card and paint the spinner
   before the JIT useEffect executes.

3. PERSISTENT BACKGROUND AWARENESS & NAVIGATION:
   - Navigation: Because each card in the carousel evaluates its own loading
     state via loadingNodeIds.has(node.id), navigation does not kill the loader.
     Users can scroll between cards freely, and generating cards will show
     spinners while loaded cards show content normally.
   - Carousel Navigation Dots: Dots corresponding to loading nodes pulse
     gently in the accent color, indicating background progress.

4. WHY PREVIOUS APPROACHES FAILED (History):
   - ATTEMPT 1: JIT ran too fast and cleared loadingNodeIds before setSelectedNode.
   - ATTEMPT 2: JIT SDK cache read (0ms) batched with setActiveNodeIds. The card
     rendered directly with details without painting a spinner frame.
   - ATTEMPT 3: flushSync only wrapped setSelectedNode. The card was not in
     activeNodes yet, so it was not rendered in the carousel during the paint frame.
     Then the next frame batched activeNodes and details together, bypassing spinner.

5. EXACT ORDERING (App.tsx: handleNodeClick):
     setLoadingNodeIds(prev => new Set(prev).add(node.id));  // reserve slot
     const confirmed = await confirmTokenUsage(...);          // modal
     if (!confirmed) {
       setLoadingNodeIds(prev => { ... delete(node.id) });    // cancel
       return;
     }
     flushSync(() => {
       setSelectedNode(node);
       setActiveNodeIds(prev => [...prev, node.id]);          // force synchronous mount
     });

4. TRANSITION BEHAVIOR:
   - loadingNodeIds has node.id → spinner/overlay appears inside the card body
   - JIT queue fires (selectedNode changed) → reads Firestore or calls Gemini
   - On success: setDetailsCache(add) → card transitions to populated content
   - JIT per-node finally: setLoadingNodeIds(delete node.id) → spinner clears
   - React renders card with content already populated → seamless transition

5. ANTI-PATTERNS (AVOID):
   - DO NOT remove the flushSync wrapper around setSelectedNode/setActiveNodeIds.
     Without it, React 18 batching collapses the card-mount and JIT fetch into
     a single render frame, skipping the spinner entirely.
   - DO NOT call setSelectedNode BEFORE await confirmTokenUsage.
     This triggers the JIT during the modal wait.
   - DO NOT use global isLoading (setIsLoading) for individual node generation.

6. SPINNER COPY (Icons.tsx: DETAIL_THINKING_STEPS):
   "Contacting live model orchestration..."
   "Scanning live cultural archives..."
   "Synthesising musical profile and discography..."
   "Indexing audio-visual fragments..."
   "Finalising deep insights..."
`;

const PHYSICS_STABILIZATION_DOCUMENTATION = `
Zcene's D3.js physics engine is intentionally stabilized to prevent jitter and positional snaps.
This section documents the specific anti-patterns and stabilization layers that guarantee a smooth Spiderweb experience.

1. THE LIVE COORDINATE HANDSHAKE (MusicGraph.tsx):
   - Problem: When the background Firestore sync downloaded fresh graphData JSON (e.g. after a deep cut curation finished), App.tsx passed these newly parsed nodes down to MusicGraph. D3 would accept these nodes and overwrite its live, high-framerate physics coordinates with the 3-5 second old stale JSON coordinates, causing nodes to violently "Time-travel Snap" back to their old positions.
   - Fix: Right before calling simulation.nodes(visibleNodes), the engine performs a Live Coordinate Handshake. It reads the live momentum and position (x, y, vx, vy, fx, fy) from the active simulation and maps them. It then iterates over the incoming JSON visibleNodes and overwrites their stale coordinates with the live physics data. This allows network updates to seamlessly inject into the web without disturbing active nodes.

2. SELECTION LIFECYCLE & RESTART DECOUPLING (MusicGraph.tsx):
   - Problem: Previously, mutating the active node list (even just selecting an already existing node) triggered a high-energy simulation.alpha(1.0).restart(). This blast caused the physics gravity well to violently drag the unpinned node toward the center of the screen, pulling the Spring Camera with it and causing a visual "jump".
   - Fix: The simulation restart is decoupled. A prevVisibleNodesLengthRef tracks the physical structure of the web. The simulation now only fires a 1.0 high-energy restart if nodes are added or removed. If a node is merely selected (a metadata/CSS change), the graph uses a gentle alpha(0.2) wake. Pinned coordinates are respected, and the camera glides smoothly.

3. REVERSION BUG & AUTO-HYDRATION DEFANGING (App.tsx):
   - Problem: The Re-hydration Hook automatically reverted the selection to the Seed Artist if the selection became null.
   - Fix: The Re-hydration and Background Sync hooks are wrapped with a hasAutoSelectedRef so they only auto-select ONCE per project load. If the user intentionally clicks the background to clear the selection, the panel now gracefully closes without reverting to the seed.

4. INTERACTION SAFEGUARDS & CLICK DAMPENING (MusicGraph.tsx):
   - Problem: If a user clicked a bouncing node and their cursor slipped slightly off the circle during the click, the browser registered an SVG background click, nullifying the selection accidentally.
   - Fix: A dragEndTimeRef tracks the timestamp of the last drag/physics interaction. The system ignores SVG background clicks that occur within 100ms of a drag terminating, shielding the UX from micro-slips.

5. ALPHA VALUES (Reference):
   - Structural Layout Change (Length Delta): alpha(1.0) — high energy wake
   - Metadata Selection Change: alpha(0.2) — gentle wake, respects pins
   - Initial layout: alpha(0.15) — approachable initialization
   - Tab re-activation: alpha(0.3) — moderate re-energization
   - Interactive drag: alphaTarget(0.2) on drag start, alphaTarget(0) on end
   - alphaDecay(0.1) and alphaMin(0.01) ensure the sim halts quickly
`;

const COST_ESTIMATION_DOCUMENTATION = `
Zcene implements an explicit cost estimation ledger to track and gate billable 
AI API credit utilization.

1. LEDGER METRICS (UsageAnalyticsPage.tsx):
   The platform's base usage rate is defined as:
   - COST_PER_AI_CALL = 0.0015 ($0.0015 per query / AI invocation).
   This base rate is mapped directly from the platform's Usage Analytics ledger 
   to ensure UI warnings match the backend billing metrics.

2. INVOCATION ENTRY-POINTS:
   The cost metrics apply uniformly to all three billable API endpoints:
   - Graph Generation: Triggered when creating/updating the spiderweb graph with uncached seeds.
   - Node Expansion (Graph Extension): Triggered when extending connection nodes.
   - Deep Cut Creation (Node Click): Triggered when enriching/generating an uncached biography.

3. CACHE-GATING RATIONALES (Plain English):
   - Outbound Gemini calls generate real-world token usage charges. To minimize cost, 
     any request matching pre-existing Firestore global artist document results is loaded 
     for free as a zero-cost cache hit.
   - Warning pop-ups provide transparency, ensuring users explicitly opt-in to credit 
     consumption for net-new generation flows.
   - Sandbox environments hardcode "isLocal = true" in the services layer. This short-circuits 
     all live dispatches with local mock payloads, preserving billing limits while still 
     simulating the full token warning and ledger logging behaviors.
`;

const STICKY_PEEK_ACTION_GATEWAY_DOCUMENTATION = `
Zcene implements a cross-platform 'Sticky Peek + Action Gateway' interaction model to unify hover and click behaviors, eliminate layout jitter, and provide a clutter-free, premium visual aesthetic.

1. STATE 1: THE 'STICKY PEEK' (Primary Interaction):
   - Trigger: Single click (Desktop) or single tap (Mobile) on any node.
   - Behavior: Instantly pins the floating 'Hover Box' (info snippet) and yellow connection highlights to the selected node, locking the D3 camera focus. This state persists until the user explicitly clicks the SVG background.
   - Purpose: Provides identical, friction-free connection tracing and information peeks across all platforms without triggering paid network API transactions.

2. STATE 2: THE 'ACTION GATEWAY' (Secondary Interaction):
   - Trigger: A second click/tap on the already-selected (peeked) node.
   - Behavior: Automatically hides/dismisses the floating hover box to clear visual clutter, opens the sidebar Details Panel, and displays the node action overlay (+ Explore / - buttons).
   - API Gateways:
     - Blocked & Cached nodes: Bypasses the token quota modal and enters State 2 instantly.
     - Uncached nodes: Triggers the JIT details queue and presents the Token Quota Confirmation warning. If canceled, the node remains in State 2 (with + Explore button and sidebar details card visible) to allow easy re-initiation.

3. PINNED MOUSE EVENT LOCKING (D3 Mouseleave Bypass):
   - In D3's 'mouseleave' event handler, the system queries the active ref states (selectedNodeRef.current and peekedNodeRef.current).
   - If the cursor leaves a node that is currently peeked or selected, the clearNodeHover command is bypassed. This keeps connection lines and hover snippet elements locked and stable.
   - When hovering over other nodes, temporary transient highlights are drawn, and leaving those transient nodes gracefully restores the pinned node's visual state.

4. DEEP CUT PAGINATION BYPASS:
   - When navigating artists in the Deep Cut pagination carousel (via <, >, or dot indicators), the graph automatically bypasses the Sticky Peek state (State 1) and transitions directly to the Action Gateway (State 2) by passing the forceActionState=true flag to handleNodeClick.
   - This ensures that the floating hover box is immediately dismissed and connection lines/explore button are shown, maintaining visual focus on details rather than graph overlay cards.
`;

const SitemapNode: React.FC<{ title: string; description: string; children?: React.ReactNode }> = ({ title, description, children }) => (
    <li>
        <div className="font-medium text-white pt-4 hover:text-primary transition-colors cursor-default">{title}</div>
        <p className="text-zinc-400 text-sm leading-relaxed mb-2">{description}</p>
        {children && <ul className="pl-6 border-l-2 border-zinc-700 mt-2 space-y-4">{children}</ul>}
    </li>
);

const ArchitectureDiagram: React.FC = () => (
    <div className="w-full py-8 px-4 bg-zinc-950/50 rounded-xl border border-zinc-800 mb-8 overflow-x-auto">
        <div className="min-w-[600px] flex flex-col items-center gap-12">
            {/* Top Layer: External Intelligence */}
            <div className="flex justify-center gap-24 w-full">
                <div className="flex flex-col items-center">
                    <div className="w-40 h-16 rounded-lg border border-primary/40 bg-zinc-900 flex items-center justify-center text-primary font-medium text-sm text-center px-4">
                        Google AI Studio (Gemini 1.5)
                    </div>
                    <div className="text-[10px] text-zinc-500 mt-2 uppercase tracking-widest font-mono">Orchestration</div>
                </div>
            </div>

            {/* Middle Layer: Application Core */}
            <div className="relative w-full flex justify-center">
                <div className="absolute top-[-32px] left-[calc(50%-1px)] w-0.5 h-8 bg-zinc-800" />
                
                <div className="flex flex-col items-center relative">
                    <div className="w-64 h-24 rounded-xl border-2 border-primary bg-zinc-900 shadow-[0_0_20px_rgba(255,255,255,0.05)] flex flex-col items-center justify-center p-4 z-10">
                        <ZceneLogo className="h-6 w-auto text-primary mb-2" />
                        <span className="text-white font-semibold tracking-tight">Cloud Run Container</span>
                        <span className="text-[10px] text-zinc-500 font-mono mt-1">Node.js + React + Vite</span>
                    </div>
                </div>

                {/* Arrows to sides */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-between w-[480px]">
                    <div className="flex items-center">
                        <div className="h-0.5 w-16 bg-zinc-800" />
                        <div className="w-2 h-2 rounded-full bg-zinc-700 -ml-1" />
                    </div>
                    <div className="flex items-center">
                        <div className="w-2 h-2 rounded-full bg-zinc-700 -mr-1" />
                        <div className="h-0.5 w-16 bg-zinc-800" />
                    </div>
                </div>
            </div>

            {/* Bottom Layer: Clients & Data */}
            <div className="flex justify-between gap-24 w-full max-w-4xl px-12">
                <div className="flex flex-col items-center">
                    <div className="w-36 h-16 rounded-lg border border-zinc-700 bg-zinc-900/80 flex items-center justify-center text-zinc-300 text-sm font-medium">
                        User Interface (React)
                    </div>
                    <div className="text-[10px] text-zinc-500 mt-2 uppercase tracking-widest font-mono">Client Edge</div>
                </div>

                <div className="flex flex-col items-center">
                    <div className="w-36 h-16 rounded-lg border border-zinc-700 bg-zinc-900/80 flex items-center justify-center text-zinc-300 text-sm font-medium">
                        Firebase (Auth/DB)
                    </div>
                    <div className="text-[10px] text-zinc-500 mt-2 uppercase tracking-widest font-mono">Persistence</div>
                </div>
            </div>
        </div>
    </div>
);

const DiscoveryFlowDiagram: React.FC = () => (
    <div className="w-full py-12 px-4 bg-zinc-950/50 rounded-xl border border-zinc-800 mb-8">
        <div className="max-w-3xl mx-auto flex flex-col items-center gap-4">
            {/* Step 1: Input */}
            <div className="w-full flex flex-col items-center">
                <div className="px-6 py-4 rounded-xl border border-zinc-700 bg-zinc-900 text-center w-full max-w-sm">
                    <div className="text-primary text-[10px] font-mono mb-1 uppercase tracking-tighter">Phase 01: Formulation</div>
                    <div className="text-white font-medium">Artist Selection & Filters</div>
                    <div className="text-[11px] text-zinc-500 mt-1">Up to 5 Seed Artists + Year/Origin Logic</div>
                </div>
                <div className="h-8 w-0.5 bg-zinc-800 my-2" />
            </div>

            {/* Step 2: Orchestration */}
            <div className="w-full flex flex-col items-center">
                <div className="px-6 py-4 rounded-xl border-2 border-primary bg-zinc-900/50 text-center w-full max-w-md shadow-[0_0_15px_rgba(255,255,255,0.03)]">
                    <div className="text-primary text-[10px] font-mono mb-1 uppercase tracking-tighter">Phase 02: Orchestration</div>
                    <div className="text-white font-medium">Global Cache Check → Gemini 1.5</div>
                    <div className="text-[11px] text-zinc-500 mt-1">Probes the global 'artists' cache first, evaluating our dual-layer cache windows: Core Artist Metadata features a 1-year persistence window before triggering a structural background refresh, while Live Tour Data uses a strict 7-day Time-To-Live (TTL) cache window before the UI automatically resets to an 'idle' state. <span className="text-primary font-semibold">⚡ Cache Hit</span> skips directly to Phase 04. Cache Miss calls Gemini to map relational bridges, then writes the result to the global cache.</div>
                </div>
                <div className="h-8 w-0.5 bg-zinc-800 my-2" />
            </div>

            {/* Step 3: Serial Queue */}
            <div className="w-full flex flex-col items-center">
                <div className="px-6 py-4 rounded-xl border border-zinc-700 bg-zinc-900 text-center w-full max-w-sm relative group">
                    <div className="text-primary text-[10px] font-mono mb-1 uppercase tracking-tighter">Phase 03: Enrichment</div>
                    <div className="text-white font-medium text-sm">Serial Extraction Queue (Deep Cuts)</div>
                    <div className="text-[11px] text-zinc-500 mt-1">Each Deep Cut fetch incrementally writes back to the global cache entry, so future cache hits include pre-populated metadata.</div>
                    <div className="flex gap-1 justify-center mt-3">
                        {[1, 2, 3].map(i => (
                            <div key={i} className="w-2 h-2 rounded-full bg-primary/40 animate-pulse" style={{ animationDelay: `${i * 200}ms` }} />
                        ))}
                    </div>
                </div>
                <div className="h-8 w-0.5 bg-zinc-800 my-2" />
            </div>

            {/* Step 4: Verification & Physics */}
            <div className="w-full flex flex-col items-center">
                <div className="px-6 py-4 rounded-xl border border-zinc-700 bg-zinc-900/50 text-center w-full max-w-sm italic">
                    <div className="text-primary text-[10px] font-mono mb-1 uppercase tracking-tighter">Phase 04: Validation</div>
                    <div className="text-white font-medium text-sm">D3.js Force Field Convergence</div>
                    <div className="text-[11px] text-zinc-500 mt-1 italic">Nodes stabilize into organic clusters. Saved artist positions are re-applied from canvasLayout on project load.</div>
                </div>
                <div className="h-8 w-0.5 bg-zinc-800 my-2" />
            </div>

            {/* Step 5: Save */}
            <div className="w-full flex flex-col items-center">
                <div className="px-6 py-4 rounded-xl border border-primary/20 bg-primary/5 text-center w-full max-w-md">
                    <div className="text-primary text-[10px] font-mono mb-1 uppercase tracking-tighter">Phase 05: Persistence</div>
                    <div className="text-white font-medium">Lightweight Firestore Commit</div>
                    <div className="text-[11px] text-zinc-400 mt-1">Project record stores seed list inputs + artist <span className="text-primary font-mono">canvasLayout</span> positions. Heavy graph data lives in the global artists cache, structured with our dual-layer cache windows (1-year persistence for core metadata, 7-day TTL for live tour data).</div>
                </div>
            </div>
        </div>
    </div>
);

const SharingFlowDiagram: React.FC = () => (
    <div className="w-full py-12 px-4 bg-zinc-950/50 rounded-xl border border-zinc-800 mb-8 overflow-x-auto">
        <div className="min-w-[700px] flex justify-between items-start gap-4 px-8">
            {/* Step 1: Share Link */}
            <div className="flex flex-col items-center gap-3 w-40">
                <div className="w-12 h-12 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center">
                    <span className="material-symbols-outlined text-zinc-400">share</span>
                </div>
                <div className="text-white font-medium text-center text-xs">A User Shares a Zcene Project</div>
                <div className="px-2 py-1 bg-zinc-900 border border-zinc-800 rounded-md text-[10px] font-mono text-zinc-500">?shareId=...</div>
            </div>

            <div className="pt-6">
                <span className="material-symbols-outlined text-zinc-700">arrow_forward</span>
            </div>

            {/* Step 2: Guest/Auth Preview */}
            <div className="flex flex-col items-center gap-3 w-48">
                <div className="w-full p-3 rounded-lg border border-zinc-700 bg-zinc-900 flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                        <span className="text-[9px] uppercase tracking-wider font-bold text-zinc-500">Read Only</span>
                    </div>
                    <div className="text-[11px] text-white">Interactive Graph Preview</div>
                </div>
                <div className="text-zinc-500 text-[10px] text-center italic">"Guest Mode" or "Shared Access" active</div>
            </div>

            <div className="pt-6">
                <span className="material-symbols-outlined text-zinc-700">arrow_forward</span>
            </div>

            {/* Step 3: Trigger Save */}
            <div className="flex flex-col items-center gap-3 w-40">
                <div className="w-full py-3 px-3 rounded-lg bg-primary text-brand-black font-bold text-[10px] text-center shadow-lg shadow-primary/20">
                    SAVE TO MY ZCENES
                </div>
                <div className="text-zinc-400 text-[10px] text-center leading-tight">Cloning process initiated by user</div>
            </div>

            <div className="pt-6">
                <span className="material-symbols-outlined text-zinc-700">arrow_forward</span>
            </div>

            {/* Step 4: Final Ownership */}
            <div className="flex flex-col items-center gap-3 w-44">
                <div className="w-full p-3 rounded-lg border-2 border-primary bg-zinc-900 flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                        <span className="text-[9px] uppercase tracking-wider font-bold text-primary">Full Control</span>
                    </div>
                    <div className="text-[11px] text-white">Project Saved to Dashboard</div>
                </div>
                <div className="text-center">
                    <span className="text-[10px] text-zinc-500">Ownership Verified</span>
                </div>
            </div>
        </div>
    </div>
);

interface StrategyMatrixRow {
  failureType: string;
  userImpact: string;
  component: string;
  persistence: string;
  mitigation: string;
}

const ERROR_STRATEGY_MATRIX: StrategyMatrixRow[] = [
  {
    failureType: "API Rate Limit (429)",
    userImpact: "Curation paused; delay.",
    component: "geminiService.ts (queue) / App.tsx",
    persistence: "Transient (Memory)",
    mitigation: "Jittered Exponential Backoff (2s, 4s, 8s...) up to 3 retries; falls back to Sentinel Cache Write."
  },
  {
    failureType: "Invalid API Key (401/403)",
    userImpact: "Blocked generation & query.",
    component: "App.tsx / ApiKeySelectorModal",
    persistence: "Persistent (LocalStorage)",
    mitigation: "Triggers Global Error Overlay. Blocks UI inputs. Demands key re-entry or token refresh."
  },
  {
    failureType: "Network Loss (Fetch Fail)",
    userImpact: "Canvas or sidebar loading freeze.",
    component: "App.tsx (humanizeError) / fetch",
    persistence: "Transient (Memory)",
    mitigation: "Global Error Overlay if app cannot initialise; Toast notification if transient detail fetching fails."
  },
  {
    failureType: "Grounding JSON Mutation",
    userImpact: "Partial artist details (no bio).",
    component: "geminiService.ts (Prose Fallback)",
    persistence: "Semi-Persistent (Firestore)",
    mitigation: "Intercepts raw prose, maps to schema, writes to database with incomplete tag. Triggers Curation incomplete Toast."
  },
  {
    failureType: "Retry Exhaustion (Sentinel)",
    userImpact: "Localized detail panel failure.",
    component: "App.tsx Deep Cut Queue catch block",
    persistence: "Persistent (detailsCache)",
    mitigation: "Writes Sentinel record (_isSentinel: true) to detailsCache. Prevents infinite fetch loops. Evicts on Force Refresh."
  },
  {
    failureType: "Security Rule Breach",
    userImpact: "Operation aborted cleanly.",
    component: "Firebase Security Rules / App.tsx",
    persistence: "Persistent (Rules Engine)",
    mitigation: "Catches permission error, aborts state transition, alerts user to authenticate or upgrade credentials."
  },
  {
    failureType: "Quota Saturated (Firestore)",
    userImpact: "Cannot save curations online.",
    component: "App.tsx (showToast quota error)",
    persistence: "Semi-Persistent (Session)",
    mitigation: "Notifies user via Toast; redirects saves to local browser sandbox storage."
  }
];

const Table: React.FC<{ headers: string[]; children: React.ReactNode }> = ({ headers, children }) => (
    <div className="overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-950/40 mb-12">
        <table className="w-full border-collapse text-left">
            <thead>
                <tr className="bg-zinc-900/60 border-b border-zinc-800">
                    {headers.map(h => (
                        <th key={h} className="py-4 px-6 text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">{h}</th>
                    ))}
                </tr>
            </thead>
            <tbody className="divide-y divide-zinc-900/50">
                {children}
            </tbody>
        </table>
    </div>
);

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

    const CodeBlock: React.FC<{ title: string; content: any; isJson?: boolean }> = ({ title, content, isJson = false }) => (
        <div className="rounded-xl border border-zinc-700/50 bg-zinc-900/50 overflow-hidden mb-12">
            <div className="bg-zinc-800/50 px-6 py-4 border-b border-zinc-700/50 flex justify-between items-center">
                <h3 className="text-zinc-200 font-medium text-sm tracking-wider uppercase">{title}</h3>
                <span className="text-zinc-500 text-xs font-mono">{isJson ? 'JSON Schema' : 'Logic / Template'}</span>
            </div>
            <div className="p-6 overflow-x-auto">
                <pre className="text-xs sm:text-sm font-mono text-zinc-400 leading-relaxed whitespace-pre-wrap">
                    {isJson ? JSON.stringify(content, null, 2) : content}
                </pre>
            </div>
        </div>
    );

    const sections = [
        { id: 'site-map', title: 'Site Map' },
        { id: 'architecture', title: 'Architecture' },
        { id: 'graph-intelligence', title: 'Graph Intelligence' },
        { id: 'visualization-engine', title: 'Visualization Engine' },
        { id: 'sticky-peek-gateway', title: 'Sticky Peek + Action Gateway' },
        { id: 'sharing-flow', title: 'Sharing & Collaboration' },
        { id: 'system-resilience', title: 'System Resilience' },
        { id: 'error-messaging-reference', title: 'Error Messaging Reference' },
        { id: 'admin-override', title: 'Admin-Only Override' },
        { id: 'self-healing', title: 'Priority-Based Self-Healing' },
        { id: 'localized-loading', title: 'Localized Loading UX' },
        { id: 'physics-stabilization', title: 'Physics Stabilization' },
        { id: 'cost-estimation', title: 'Cost & Caching' },
        { id: 'crate-sizing-rules', title: 'Dashboard Crate Sizing' },
        { id: 'graph-generation', title: 'Graph Generation' },
        { id: 'deep-cut-details', title: 'Deep Cut Details' },
        { id: 'data-synthesis', title: 'Data Synthesis & Persistence' },
        { id: 'conversational-ai', title: 'Conversational AI' },
        { id: 'access-management', title: 'Access Management' },
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
        scrollToSection(sectionId, 160);
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

            <div className="lg:hidden p-4 sticky top-0 bg-background-dark z-[90] border-b border-zinc-700">
                <div className="relative">
                    <select
                        id="engine-nav"
                        className="w-full appearance-none rounded-xl border border-zinc-700 bg-zinc-900 text-zinc-300 py-2.5 pl-4 pr-8 font-medium focus:ring-1 focus:ring-primary focus:outline-none"
                        onChange={handleSelectChange}
                        defaultValue=""
                    >
                        <option value="" disabled>Jump to section...</option>
                        {sections.map(section => (
                            <option key={section.id} value={section.id}>{section.title}</option>
                        ))}
                    </select>
                    <span className="material-symbols-outlined pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400">arrow_drop_down</span>
                </div>
            </div>

            <div className="container mx-auto px-4 sm:px-6 lg:px-8 flex gap-12 flex-grow">
                <aside className="w-56 flex-shrink-0 sticky top-28 self-start h-[calc(100vh-8rem)] hidden lg:block overflow-y-auto overflow-x-hidden pl-4 scrollbar-thin scrollbar-thumb-zinc-800">
                    <div className="pt-6 pb-2">
                        <button 
                            onClick={() => onClose ? onClose() : (window.history.length > 1 ? window.history.back() : onNavigate(View.Home))} 
                            className="inline-flex items-center gap-2 text-zinc-400 hover:text-white transition-colors bg-transparent border-0 p-0 cursor-pointer text-sm font-medium"
                        >
                            <span className="material-symbols-outlined text-sm">arrow_back</span>
                            Back
                        </button>
                    </div>
                    <nav className="space-y-1">
                        {sections.map(section => (
                            <a 
                                key={section.id} 
                                href={`#${section.id}`} 
                                onClick={(e) => handleNavClick(e, section.id)} 
                                className="block text-zinc-400 hover:text-primary hover:bg-zinc-800/50 py-1.5 px-2 rounded-xl transition-colors text-sm"
                            >
                                {section.title}
                            </a>
                        ))}
                    </nav>
                </aside>

                <main className="flex-1 py-10 space-y-24 min-w-0">
                    <div className="lg:hidden pt-6 pb-2">
                        <button 
                            onClick={() => onClose ? onClose() : (window.history.length > 1 ? window.history.back() : onNavigate(View.Home))} 
                            className="inline-flex items-center gap-2 text-zinc-400 hover:text-white transition-colors bg-transparent border-0 p-0 cursor-pointer text-sm font-medium"
                        >
                            <span className="material-symbols-outlined text-sm">arrow_back</span>
                            Back
                        </button>
                    </div>

                    {/* ── SITE MAP ── */}
                    <section id="site-map">
                        <div className="mb-10 border-b border-zinc-700 pb-8">
                            <h1 className="text-3xl font-medium text-white mb-4">Engine</h1>
                            <p className="text-zinc-400 leading-relaxed max-w-3xl text-base">
                                This page documents the structural architecture, prompt templates, and discovery logic that drive Zcene. 
                                It is the underlying system that allows the Author to map the unknown.
                                <br /><br />
                                <strong className="text-zinc-300 font-medium">Governance Intent:</strong> This document defines the system's behavioral laws—how the architecture orchestrates state, handles errors, and prevents regressions. It captures the 'why' behind structural decisions to ensure any new code reinforces system resilience.
                            </p>
                        </div>

                        <h2 className="text-3xl font-medium text-white tracking-tight border-b-2 border-primary/50 pb-2 mb-8">Site Map</h2>
                        <div className="bg-zinc-900/30 p-8 rounded-xl border border-zinc-700/50 mb-12">
                            <ul className="space-y-6 max-w-2xl">
                                <SitemapNode 
                                    title="Home (Landing)" 
                                    description="High-level feature overview, hero CTA, and community support."
                                />
                                <SitemapNode 
                                    title="Dashboard" 
                                    description="Personal mission control for managing discovery projects and account settings."
                                />
                                <SitemapNode 
                                    title="Application View (Graph)" 
                                    description="The core immersive Zcene experience."
                                >
                                    <SitemapNode 
                                        title="Artist Panel" 
                                        description="Control center for managing seed artists and library imports."
                                    />
                                    <SitemapNode 
                                        title="Spiderweb View" 
                                        description="Primary visual interface featuring the D3 force-directed graph."
                                    />
                                    <SitemapNode 
                                        title="Deep Cut Panel" 
                                        description="Conversational AI layer and contextual node analysis."
                                    />
                                    <SitemapNode 
                                        title="Magazine View" 
                                        description="Full-screen editorial layout for immersive multi-card exploration."
                                    />
                                </SitemapNode>
                                <SitemapNode 
                                    title="Help Guide" 
                                    description="Comprehensive documentation on file exports and graph navigation."
                                />
                                <SitemapNode 
                                    title="Design System" 
                                    description="Internal source of truth for brand identity and UI patterns."
                                />
                                <SitemapNode 
                                    title="Engine" 
                                    description="Authenticated access to architecture, prompts and system configs (You are here)."
                                />
                            </ul>
                        </div>
                    </section>

                    {/* ── ARCHITECTURE ── */}
                    <section id="architecture">
                        <h2 className="text-3xl font-medium text-white tracking-tight border-b-2 border-primary/50 pb-2 mb-8 mt-12">Architecture</h2>
                        <ArchitectureDiagram />
                        <CodeBlock title="Cloud Infrastructure & Orchestration" content={ARCHITECTURE_DOCUMENTATION} />
                    </section>

                    {/* ── GRAPH INTELLIGENCE ── */}
                    <section id="graph-intelligence">
                        <h2 className="text-3xl font-medium text-white tracking-tight border-b-2 border-primary/50 pb-2 mb-8 mt-12">Graph Intelligence</h2>
                        <DiscoveryFlowDiagram />
                        <CodeBlock title="State Maintenance & lifecycle" content={GRAPH_INTELLIGENCE_DOCUMENTATION} />
                    </section>

                    {/* ── VISUALIZATION ENGINE ── */}
                    <section id="visualization-engine">
                        <h2 className="text-3xl font-medium text-white tracking-tight border-b-2 border-primary/50 pb-2 mb-8 mt-12">Visualization Engine</h2>
                        <CodeBlock title="Physics & D3 Constants" content={PHYSICS_ENGINE_DOCUMENTATION} />
                    </section>

                    {/* ── STICKY PEEK + ACTION GATEWAY ── */}
                    <section id="sticky-peek-gateway">
                        <h2 className="text-3xl font-medium text-white tracking-tight border-b-2 border-primary/50 pb-2 mb-8 mt-12">Sticky Peek + Action Gateway</h2>
                        <CodeBlock title="Interaction Model & State Machine" content={STICKY_PEEK_ACTION_GATEWAY_DOCUMENTATION} />
                    </section>

                    {/* ── SHARING FLOW ── */}
                    <section id="sharing-flow">
                        <h2 className="text-3xl font-medium text-white tracking-tight border-b-2 border-primary/50 pb-2 mb-8 mt-12">Collaboration & Sharing Flow</h2>
                        <SharingFlowDiagram />
                        <CodeBlock title="Guest Preview & Project Cloning" content={SHARING_FLOW_DOCUMENTATION} />
                    </section>

                    {/* ── SYSTEM RESILIENCE ── */}
                    <section id="system-resilience">
                        <h2 className="text-3xl font-medium text-white tracking-tight border-b-2 border-primary/50 pb-2 mb-8 mt-12">System Resilience</h2>
                        <CodeBlock title="Network Logic & Selection strategy" content={RESILIENCE_DOCUMENTATION} />
                        
                        <div className="mb-12">
                            <h3 className="text-zinc-200 font-medium text-lg mb-6 uppercase tracking-wider">Error Strategy Matrix</h3>
                            <Table headers={["Failure Type", "User Impact", "Component", "Persistence", "Mitigation / Recovery Pathway"]}>
                                {ERROR_STRATEGY_MATRIX.map((row, idx) => (
                                    <tr key={idx} className="hover:bg-zinc-900/10 transition-colors border-b border-zinc-900/30">
                                        <td className="py-4 px-6 text-xs font-semibold text-zinc-200">{row.failureType}</td>
                                        <td className="py-4 px-6 text-xs text-zinc-400 leading-relaxed">{row.userImpact}</td>
                                        <td className="py-4 px-6 text-xs text-zinc-500 font-mono">{row.component}</td>
                                        <td className="py-4 px-6 text-xs">
                                            <span className={`inline-block px-2.5 py-0.5 rounded-full text-[9px] font-semibold tracking-wide uppercase border ${
                                                row.persistence.includes('Transient') 
                                                    ? 'text-primary bg-primary/10 border-primary/20' 
                                                    : row.persistence.includes('Semi-Persistent')
                                                    ? 'text-amber-400 bg-amber-950/40 border-amber-900/40'
                                                    : 'text-red-400 bg-red-950/40 border-red-900/40'
                                            }`}>
                                                {row.persistence}
                                            </span>
                                        </td>
                                        <td className="py-4 px-6 text-xs text-zinc-400 leading-relaxed">{row.mitigation}</td>
                                    </tr>
                                ))}
                            </Table>
                        </div>
                    </section>

                    {/* ── ERROR MESSAGING REFERENCE ── */}
                    <section id="error-messaging-reference">
                        <h2 className="text-3xl font-medium text-white tracking-tight border-b-2 border-primary/50 pb-2 mb-8 mt-12">Error Messaging Reference</h2>
                        <p className="text-sm text-zinc-400 leading-relaxed mb-8 max-w-3xl">
                            The following reference tables catalog the mapping rules resolved by the <code>ErrorTranslationLayer</code> to translate raw platform signals into brand-aligned, UK English curation feedback.
                        </p>

                        <div className="mb-12">
                            <h3 className="text-zinc-200 font-medium text-lg mb-6 uppercase tracking-wider">System & API Exception Translations</h3>
                            <Table headers={["Scenario", "Raw Pattern / Code", "Final User Message", "Target UI Component"]}>
                                {ERROR_MAPPING_RULES.map((rule, idx) => (
                                    <tr key={idx} className="hover:bg-zinc-900/10 transition-colors border-b border-zinc-900/30">
                                        <td className="py-4 px-6 text-xs font-semibold text-zinc-200">{rule.scenario}</td>
                                        <td className="py-4 px-6 text-xs text-zinc-500 font-mono break-all">{rule.rawPattern}{rule.code ? ` (with: "${rule.code}")` : ""}</td>
                                        <td className="py-4 px-6 text-xs text-zinc-200 italic leading-relaxed">"{rule.finalMessage}"</td>
                                        <td className="py-4 px-6 text-xs">
                                            <span className={`inline-block px-2.5 py-0.5 rounded-full text-[9px] font-semibold tracking-wide uppercase border ${
                                                rule.severity === 'system'
                                                    ? 'text-red-400 bg-red-950/40 border-red-900/40'
                                                    : rule.severity === 'entity'
                                                    ? 'text-amber-400 bg-amber-950/40 border-amber-900/40'
                                                    : 'text-primary bg-primary/10 border-primary/20'
                                            }`}>
                                                {rule.targetComponent}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </Table>
                        </div>

                        <div className="mb-12">
                            <h3 className="text-zinc-200 font-medium text-lg mb-6 uppercase tracking-wider">Transient Toast Notifications</h3>
                            <Table headers={["Original Message", "Translated Curator Message", "Target Component"]}>
                                {Object.entries(TOAST_MAPPING_RULES).map(([raw, final], idx) => (
                                    <tr key={idx} className="hover:bg-zinc-900/10 transition-colors border-b border-zinc-900/30">
                                        <td className="py-4 px-6 text-xs text-zinc-500 font-mono break-all">{raw}</td>
                                        <td className="py-4 px-6 text-xs text-zinc-200 italic leading-relaxed">"{final}"</td>
                                        <td className="py-4 px-6 text-xs">
                                            <span className="inline-block px-2.5 py-0.5 rounded-full text-[9px] font-semibold tracking-wide uppercase border text-primary bg-primary/10 border-primary/20">
                                                Transient Toast
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </Table>
                        </div>
                    </section>

                    {/* ── ADMIN OVERRIDE ── */}
                    <section id="admin-override">
                        <h2 className="text-3xl font-medium text-white tracking-tight border-b-2 border-primary/50 pb-2 mb-8 mt-12">Admin-Only Override</h2>
                        <CodeBlock title="Quick Heal (Force Refresh) — Access Control & Eviction Logic" content={ADMIN_OVERRIDE_DOCUMENTATION} />
                    </section>

                    {/* ── SELF-HEALING ── */}
                    <section id="self-healing">
                        <h2 className="text-3xl font-medium text-white tracking-tight border-b-2 border-primary/50 pb-2 mb-8 mt-12">Priority-Based Self-Healing</h2>
                        <CodeBlock title="Auto-Heal Rules & Session Guard" content={SELF_HEALING_DOCUMENTATION} />
                    </section>

                    {/* ── LOCALIZED LOADING ── */}
                    <section id="localized-loading">
                        <h2 className="text-3xl font-medium text-white tracking-tight border-b-2 border-primary/50 pb-2 mb-8 mt-12">Localized Loading UX Pattern</h2>
                        <CodeBlock title="Card-Level Spinner — Implementation & Anti-Pattern" content={LOCALIZED_LOADING_DOCUMENTATION} />
                    </section>

                    {/* ── PHYSICS STABILIZATION ── */}
                    <section id="physics-stabilization">
                        <h2 className="text-3xl font-medium text-white tracking-tight border-b-2 border-primary/50 pb-2 mb-8 mt-12">Physics Stabilization</h2>
                        <CodeBlock title="D3 Jitter Prevention & Governing Rules" content={PHYSICS_STABILIZATION_DOCUMENTATION} />
                    </section>

                    {/* ── COST ESTIMATION ── */}
                    <section id="cost-estimation">
                        <h2 className="text-3xl font-medium text-white tracking-tight border-b-2 border-primary/50 pb-2 mb-8 mt-12">Cost Estimation Architecture</h2>
                        <CodeBlock title="Ledger Rules & Caching Strategy" content={COST_ESTIMATION_DOCUMENTATION} />
                    </section>

                    {/* ── DASHBOARD CRATE SIZING ── */}
                    <section id="crate-sizing-rules">
                        <h2 className="text-3xl font-medium text-white tracking-tight border-b-2 border-primary/50 pb-2 mb-8 mt-12">Dashboard Crate Sizing</h2>
                        <CodeBlock title="Crate Sizing Rules & Layout Guidelines" content={CRATE_SIZING_RULES_DOCUMENTATION} />
                    </section>

                    {/* ── GRAPH GENERATION ── */}
                    <section id="graph-generation">
                        <h2 className="text-3xl font-medium text-white tracking-tight border-b-2 border-primary/50 pb-2 mb-8 mt-12">Graph Generation</h2>
                        <CodeBlock title="Initial Graph Prompt" content={GENERATE_GRAPH_PROMPT_TEMPLATE} />
                        <CodeBlock title="Enhance Graph (Context) Prompt" content={GENERATE_GRAPH_WITH_CONTEXT_PROMPT_TEMPLATE} />
                        <CodeBlock title="Graph Response Schema" content={GRAPH_RESPONSE_SCHEMA} isJson />
                    </section>

                    {/* ── DEEP CUT DETAILS ── */}
                    <section id="deep-cut-details">
                        <h2 className="text-3xl font-medium text-white tracking-tight border-b-2 border-primary/50 pb-2 mb-8 mt-12">Deep Cut Details</h2>
                        <CodeBlock title="Lexical Hardening & Persona" content={DEEP_CUT_INTELLIGENCE_DOCUMENTATION} />
                        <CodeBlock title="Fetch Details Prompt" content={FETCH_NODE_DETAILS_PROMPT_TEMPLATE} />
                        <CodeBlock title="Node Details Schema" content={NODE_DETAILS_SCHEMA} isJson />
                    </section>

                    {/* ── DATA SYNTHESIS & PERSISTENCE ── */}
                    <section id="data-synthesis">
                        <h2 className="text-3xl font-medium text-white tracking-tight border-b-2 border-primary/50 pb-2 mb-8 mt-12">Data Synthesis & Persistence</h2>
                        <CodeBlock title="Atomicity, API Gateway & Sanitization Specification" content={DATA_SYNTHESIS_PERSISTENCE_DOCUMENTATION} />
                        <CodeBlock title="Cache Validation & Qualification Rules" content={CACHE_VALIDATION_DOCUMENTATION} />
                    </section>

                    {/* ── CONVERSATIONAL AI ── */}
                    <section id="conversational-ai">
                        <h2 className="text-3xl font-medium text-white tracking-tight border-b-2 border-primary/50 pb-2 mb-8 mt-12">Conversational Intelligence</h2>
                        <CodeBlock title="Consult AI Logic" content={CONVERSATIONAL_INTELLIGENCE_DOCUMENTATION} />
                    </section>

                    {/* ── ACCESS MANAGEMENT ── */}
                    <section id="access-management">
                        <h2 className="text-3xl font-medium text-white tracking-tight border-b-2 border-primary/50 pb-2 mb-8 mt-12">Access Management</h2>
                        <div className="space-y-6">
                            <CodeBlock 
                                title="Fortress Approach Implementation" 
                                content={`// IDENTITY-BASED AUTHORIZATION
// Access to sensitive modules (Engine & Design System) is strictly gated 
// by identity-based authorization.
const ADMIN_EMAIL = 'zcene.online@gmail.com';
const isAdmin = user?.email === ADMIN_EMAIL;

// DYNAMIC BUNDLE SPLITTING (React.lazy)
// To prevent unauthorized code discovery, sensitive pages are removed 
// from the main application bundle. They are only fetched via dynamic 
// import if the user satisfies the isAdmin predicate.
const EnginePage = React.lazy(() => import('./EnginePage'));
const StyleGuidePage = React.lazy(() => import('./StyleGuidePage'));

// GATED RENDERING
// Access is enforced at the routing level. Unauthorized attempts 
// result in immediate redirection to the primary application state.
{isAdmin && (
    <Suspense fallback={<LoadingView />}>
        <EnginePage />
    </Suspense>
)}

// UI TRIMMING
// All navigational pointers and UI entrance markers for these modules 
// are conditionally hidden from non-admin authenticated sessions.`} 
                            />
                        </div>
                    </section>

                </main>
            </div>

            <footer className="w-full p-8 text-zinc-400 text-sm z-10 relative bg-neutral-900 flex-shrink-0 border-t border-neutral-800">
                <div className="container mx-auto text-center">
                    <ZceneLogo className="h-8 w-auto text-primary mx-auto mb-4" />
                    <p className="text-zinc-600">© 2026 Zcene Admin Console. Restricted access authorisation engine.</p>
                </div>
            </footer>
        </div>
    );
};
