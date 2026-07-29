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
   - Gemini 3.1 Pro Preview: Powers all high-fidelity generative graph synthesis and 
     Stage 0 live AI searches, ensuring rich, interconnected musical network topology.
   - Gemini 2.5 Flash / Gemini 3 Flash: Standardized for high-speed Deep Cut node 
     details extraction, conversational chat ("Consult AI"), and background hydration.
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
   - PARALLEL CURATION ARCHITECTURE (~3-MINUTE EXECUTION):
     The hydration pipeline has been re-engineered from a sequential per-node loop
     into a chunked concurrent batch execution model. All node profiles (AI artists,
     record labels, and untyped deep cuts) are processed in parallel chunks of 5
     nodes at a time via Promise.all(), dramatically reducing total curation time
     from ~20 minutes to approximately 3 minutes. This architecture is the
     authoritative resilience standard: it prevents Cloud Function timeouts. 
     To ensure data integrity, any node experiencing a transient network timeout 
     during hydration explicitly returns null to bypass Firestore caching. This 
     prevents writing toxic fallback skeletons to the database and seamlessly delegates
     the missed node to the frontend's on-demand 'Consult AI' hydration fallback.
   - UPFRONT UNIVERSAL HYDRATION MANDATE:
     All curation jobs are required to fully hydrate ALL node types upfront during
     the initial background run. This includes: primary AI artist nodes, record label
     nodes (/labels/{labelSlug}), and untyped deep cut artist nodes. Transient network
     timeouts are the sole permitted exception, gracefully skipping the cache write to 
     leverage the frontend's robust on-demand hydration.
   - ROOT ALIAS REPLICATION (detailsCache on Bare Root Documents):
     When the backend creates or updates alias pointer documents (e.g., for regional
     variants like 'artist-united-states'), it replicates the full detailsCache payload
     directly onto the bare root document (e.g., 'artist') in a single atomic write.
     This eliminates secondary redirect lookups during frontend short-ID resolution:
     when the client queries /artists/{shortId} and finds a bare root document, the
     detailsCache is immediately available without requiring a second Firestore hop to
     follow a redirectsTo pointer. Alias replication uses a merge-safe updateDoc to
     avoid overwriting any existing canonical data on the root document.
   - Stateful Project Orchestration: When a curation job begins, the frontend
      immediately saves the project status as 'curating', recording seedArtists
      and activeJobId. Even if the browser tab is closed, the background Cloud
      Function writes the completed graphData, artistIds, detailsCache, and
      activeNodes directly to the project document upon completion, allowing
      seamless session restoration on page reload. The activeNodes field is
      seeded with the normalized IDs of the seed artists confirmed present in
      the generated graph, so the Deep Cut panel opens to the correct artist
      on the user's first load without any user interaction.
   - Curation Job TTL Expiration Policy (expireAt): All curation job documents in
     '/curationJobs' are tagged with a 24-hour Firestore Time-to-Live (TTL) timestamp
     upon creation, completion, or failure. This ensures completed and failed jobs
     are autonomously purged by Firestore without requiring manual intervention.
     Crucially, we implement a 24-hour TTL rather than immediate deletion upon
     completion to prevent real-time WebSocket snapshot coalescing and to allow
     reconnecting clients or refreshed tabs to recover their curation state cleanly.
   - Global Deployment: Serves at sub-second speeds by leveraging 
     Google's global edge network.

3. DATA & AUTHENTICATION (Firebase):
   - Firebase Auth: Provides secure, frictionless Google Login, 
     enabling users to save and persist their music discovery projects.
   - Cloud Firestore: A NoSQL real-time database used to store Project 
     states, seed artists, graph snapshots, and discovery filters.
   - Universal Dual-Collection Cache (/artists vs /labels): Two top-level Firestore
     collections act as permanent, site-wide caches for discovery entities. Primary
     drivers (/artists) store computed graph structures and enriched Deep Cut metadata,
     while secondary deep cuts (/labels) store lightweight publishing house cards
     with graphData explicitly set to null.
   - Rules Engine & ABAC Security: Attribute-Based Access Control ensures every 
     music discovery journey remains private and secure. Both global cache collections
     are publicly readable but write-protected: authenticated users may CREATE new
     entries on a cache miss, and may UPDATE existing entries strictly to perform
     telemetry write-backs (hitCount, detailsCache, cachedAt) or upgrade legacy
     cache versions (< 2) to version 2. Arbitrary graph overwrites are blocked
     to prevent cache poisoning.
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
   - Chunked Concurrent Backend Hydration: Curation details (biographies, genres, origins,
     formed years, member lists, and image URLs) for ALL node types are resolved via a
     chunked Promise.all() execution model on the backend. Nodes are batched into groups
     of 5 and processed concurrently, reducing the per-job wall time from ~20 minutes
     to approximately 3 minutes. This pipeline integrates real-time YouTube scraping
     and status check routines and covers primary AI artist nodes, record labels, and
     previously-unhydrated untyped deep cut nodes in a single unified pass.
   - Dual-Strategy iTunes Fast-Path & Genre Confidence Validation: The image scraper bypasses
     LLM hallucination by querying the iTunes API for \`entity=musicArtist\`. It enforces a deterministic
     case-insensitive exact match on the artist name, and crucially, disambiguates shared names
     (like "Gel" or "Sunami") by actively cross-referencing the iTunes \`primaryGenreName\` against the 
     generated Zcene scene genre. If the genre falls outside a safe whitelist (e.g. World, Gospel) or 
     is hopelessly ambiguous, it safely drops the image rather than display a false match.
   - Organic Deep-Cut Range Targeting: The LLM graph generator prompt is explicitly configured
     to aim for a rich spiderweb density (18 to 21 organic related artists). However, the model is
     given explicit natural flexibility to scale this number down if a smaller musical scene calls
     for fewer genuine connections, completely avoiding padding just to hit an arbitrary quota.
   - Universal Node Type Filter: Only nodes explicitly typed as 'label' are routed to
     /labels/{labelSlug}. All other nodes (including nodes with no type property, which
     represent untyped deep cuts) are treated as artists and hydrated via /artists/{id}.
     This universal filter is the authoritative safeguard against the legacy regression
     where untyped deep cuts were silently skipped during background hydration.
   - Orphaned Link Mitigation (geminiService.ts): Filters the AI response to 
     ensure every link's 'source' and 'target' corresponds to a validated node ID.
   - Client detailsCache callback: The client subscribes to job updates, immediately 
     piping compiled backend metadata into React memory upon completion. The callback
     routes through expandDetailsCacheMap() to automatically register every incoming
     entry under its raw key, lowercased key, normalized artist ID, and display name,
     guaranteeing instant O(1) in-memory short-ID resolution on all subsequent node clicks.

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
    Accepting a candidate re-invokes the pipeline with Phase 02 cache lookups active (skipCacheLookup = false), 
    ensuring full graphs instantly hydrate or partial Flash stubs are seamlessly handed off to Gemini. 
    Clicking "None of these" directly closes the modal and dispatches the live 
    Gemini 3.1 Pro generative synthesis pipeline with cache lookup explicitly skipped (skipCacheLookup = true), 
    STAGE 0 re-entry bypassed (bypassDisambiguation = true), and token authorization enabled (bypassTokenConfirmation = false).

    State Machine & Verification Pipeline:
    - Step 1 (Cache Interrogation): searchDisambiguationCandidates() queries global /artists.
    - Step 2 (Human-in-the-Loop Checkpoint):
      - 0 cache hits -> "No cached records found" + Search Live AI -> Direct Live Synthesis + Cancel.
      - 1 cache hit -> "Look What I Found" (single card). Clicking card accepts candidate.
        Escape: "None of these" -> Direct Live Synthesis + Cancel.
      - >1 cache hits -> "Disambiguation" (list of cards). Clicking card accepts candidate.
    - Step 3 (Direct Live Synthesis & Cloud Rejection Constraint Propagation): Clicking Search Live AI closes the modal instantly.
      STAGE 0 packages rejected card metadata into a negative constraint hint for Gemini 3.1 Pro.
      handleGenerateGraph re-invokes with skipCacheLookup = true, bypassDisambiguation = true,
      and bypassTokenConfirmation = false. The decoupled guard skips STAGE 0 re-entry, displays
      the API Token Authorization Modal, and dispatches generateGraphDataViaCloudJob with disambiguationHints
      passed in inputPayload to /curationJobs. Deep Cut responses are parsed via regex codeblock extraction
      and sanitized with sanitizeBioText() to strip \n* artifacts.

    Self-healing, Universal Composite Keys & Cloud Fallback Alignment: Every successful live synthesis
    writes a Universal Country-Suffixed Composite Cache Key (e.g. "i-wish-i-italy", "i-wish-i-united-states").
    We have successfully pierced the cache cage: "None of these" cleanly bypasses local cache checks and
    triggers live AI generation. The cloud function backend (onCurationJobCreated.ts) now strictly honors 
    the finalized composite-key persistence model, passing the regional discriminator (e.g. connected countries) 
    through to buildCompositeCacheKey. This guarantees that new regional variants generated by the live flow
    documents are healed into alias pointers across both frontend and backend writes.

    Suffix-Deduplication Safeguard: To prevent runaway recursive keys (e.g., "i-wish-i-united-states-united-states"),
    all region concatenation logic now utilizes '.endsWith()' deduplication checks. This ensures that countryNorm
    suffixes are never double-appended during frontend cache lookups, backend curation, or cache hydration loops.

11. HYBRID AI PROBING & GLOBAL STATE-RESET PIPELINE:
    - Lightweight Flash Probe (resolveArtistCandidatesViaAI): Before triggering heavy Pro synthesis, a rapid
      probe intercepts cache misses. This probe quickly validates and disambiguates the user's intent 
      using Gemini Flash. The probe acts as a hard cost gate, only triggering after the Token Quota Warning
      is accepted, ensuring financial safety.
    - Manual Override Normalization: The validation modal provides a manual override text input. Inputs 
      are normalized to standard global variants (e.g., "UK" maps to "United Kingdom"). Before routing the
      override to the Pro generation job, an aggressive cache deduplication check fires to ensure the 
      override doesn't duplicate existing variants, cleanly routing to existing records if found.
      The normalized override acts as a strict injected constraint (activeDisambiguationHints) in the 
      system instruction, making the generative model adhere strictly to the user's specified origin.
    - Global State-Reset Cancellation Model: Because complex generative pipelines span multi-stage cloud 
      fetching and long-running Firestore jobs, simply calling abortController.abort() isn't enough.
      The cancellation handler triggers a deep, synchronous React component state flush: clearing isLoading,
      flushing loadingNodeIds, nullifying active fetch timeouts and activeJobId. This instantly unlocks 
      the UI and kills all visual spinners, resolving unresponsive locked overlays completely and cleanly.
      False affordances have been stripped from individual loading overlays where mid-flight granular aborts 
      were unsafe.

12. ROBUST CANONICAL SEED & ALIAS MATCHING & UX TITLE CLEANUP:
    - Universal Seed & Alias Matching (isEntitySeedMatch / checkSeedMatch / isNodeInSeedList):
      To bridge backend curation (which generates regional and alias records) and frontend graph rendering,
      a centralized bidirectional matching layer is enforced. Instead of ad-hoc strict equality checks, all
      components use isNodeInSeedList(nodeIdOrLabel, seedList) exported from services/artistCacheService.ts.
      This utility evaluates exact matches, normalized canonical strings, and bidirectional country prefix/suffix
      patterns (e.g., matching "buggin-united-states" to "buggin" or vice versa).
    - UX Title & Seed Label Cleanup (cleanArtistDisplayName):
      While the system utilizes disambiguated IDs (e.g., "buggin-united-states") under the hood for Firestore
      keys and cache routing, the UI presentation layer strips clunky country suffixes and slugs. The
      cleanArtistDisplayName helper checks against known regional suffixes and cross-references active graph
      topology nodes to return pristine, human-readable canonical display titles in the browser header, seed
      pills, toasts, and project titles.

13. LOCAL DEVELOPMENT ENVIRONMENT & PROXY RESOLUTION:
    - Synchronised Startup Sequence (concurrently): The development environment uses 'concurrently' to boot the
      Node.js Express backend and the Vite dev server simultaneously in a single terminal process. This strictly
      prevents race conditions where Vite's proxy attempts to forward requests (e.g., /api/label/) to a backend
      that hasn't fully bound to its port yet, eliminating terminal ECONNREFUSED spam on mount.
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

3. PRIMARY SEED VISUAL ANCHOR INTEGRATION:
   - Canonical Seed Anchoring: To ensure primary seed artists (e.g., Buggin) are visually distinguished
     from standard AI recommendations, the visualization engine maps disambiguated session routing keys
     (e.g., "buggin-united-states") to short canonical graph node IDs ("buggin") via isNodeInSeedList.
   - Symbol & Force Differentiation: Primary seeds render as prominent yellow circle anchors (#F6E468,
     d3.symbolCircle with 3px stroke border) while AI recommendations render as purple stars (#A855F7,
     d3.symbolStar). In the D3 force simulation, primary seed nodes exert moderated repulsion (-800 vs -500)
     and stronger central anchoring gravity, establishing solid centers of gravity for spiderweb networks.
`;

const RESILIENCE_DOCUMENTATION = `
Zcene handles AI model constraints (Rate Limits/Hallucinations) using a 
Chunked Concurrent Batch Architecture on the backend and a targeted Backoff Strategy
for transient API errors on the client.

1. CHUNKED CONCURRENT BATCH PRE-CACHING & O(1) CLIENT READS:
   The backend curation pipeline (onCurationJobCreated.ts) executes node hydration
   using a chunked concurrency model: all nodes are partitioned into groups of 5 and
   each chunk is resolved with Promise.all() before the next chunk begins. This design
   provides two critical resilience guarantees:
   - Timeout Prevention: Sequential per-node API calls on a 20+ node graph previously
     caused Cloud Function wall-time timeouts. The chunked model bounds worst-case
     execution to approximately 3 minutes, well within Cloud Function limits.
   - Thundering Herd Mitigation: Full fan-out (all nodes concurrently) would saturate
     the Gemini API rate limits. The chunk-of-5 constraint serves as an implicit rate
     governor, preventing 429 Resource Exhausted errors during hydration bursts.
   - Guaranteed O(1) Client Reads: By the time the Spiderweb graph finishes rendering
     on the client, all /artists/{id} and /labels/{labelSlug} documents are pre-written
     in Firestore. Clicking any node — including record labels and untyped deep cuts —
     resolves via an instant O(1) global cache hit with zero client-side generation flows.

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

9. ROOTS BREAKDOWN SCANNABILITY FORMATTING (SharedModals.tsx / index.css / curatorService.ts):
   - Markdown Bio Styling Parity: The synthesis rationale payload is parsed and rendered natively via standard Markdown components using the .markdown-bio design guidelines. This ensures bullet points, paragraph spacing, and bold key term highlighting maintain consistent scannability aesthetics with the Deep Cut biographies.
   - Generative Formatting Source Controls: The core generation template strictly commands the AI model to output tightly packed bullet lists (no double newlines between list items) and to emit standard JSON string encodings.
   - Strict Backend Layout Sanitization & Frontend Constraints: The backend 'sanitizeBioText' pipeline now PRESERVES markdown bolding (**) and translates literal escaped newlines (\\n) into structural paragraph breaks to allow the frontend \`<Markdown>\` component to render strict Scannability formatting. The SharedModals renderer retains a robust RegEx normalization pass to scrub stray \`•\` characters and collapse broken loose-list spacing, while the root CSS uses \`list-outside pl-4\` to ensure markdown-rendered \`<p>\` blocks stay perfectly inline with their bullet markers.
   - Regression Prevention (The "Why"): Previous iterations used \`list-inside\` which forced markdown loose-lists (where text is wrapped in \`<p>\` tags) to drop below the bullet point. The strict AI prompt prevents loose lists entirely, while \`list-outside\` serves as a visual safeguard for legacy databases. Future styling must NEVER revert markdown lists to \`list-inside\`.

10. AUTOMATIC DEEP CUT BACKGROUND BATCH-HYDRATION (App.tsx):
    - Active Node Initialization: When a project is loaded from cache (via handleSnap or initial mount), the frontend actively maps all available artist IDs from the graph's nodes array directly into the \`activeNodeIds\` state queue.
    - Client-Side Sparse Queue Fallback: To support legacy or cached projects where the database's \`activeNodes\` array was hardcoded or sparse (e.g., length <= 1), the loader gracefully falls back to injecting all discovered graph artists, ensuring the Deep Cut panel always opens fully populated without requiring manual user clicks on the spiderweb.
    - Continuous Session Sync: Auto-queueing strictly runs as a one-time initialization event. During the active session, the \`activeNodeIds\` queue safely mutates in isolation, respecting the user's manual curation (such as deleting or prioritizing nodes) without disruptive background overwrites.
    - Regression Prevention (The "Why"): Previously, cached projects loaded with empty queues, forcing users to manually click every node to re-hydrate the Deep Cut panel. This frontend fallback ensures legacy databases hydrate gracefully, while continuous session sync prevents auto-population from overwriting deliberate user deletions during an active session.
`;

const SHARING_FLOW_DOCUMENTATION = `
Zcene enables collaborative discovery via project sharing. The flow is 
designed to minimize friction for new users while rewarding existing authors.

1. URL-BASED SHARING:
   Every 'Share' operation generates a unique document ID in the '/sharedZcenes' 
   collection. This ID is appended to the URL as a query parameter (/app?id=...) 
   or accessed directly via path-based routing (/z/{shareId}).

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

1. ATOMICITY MANDATE & BACKEND CLOUD FUNCTION OPTIMIZATIONS:
   - All synthesized seed artist documents must bundle 'graphData', 'detailsCache',
     and 'activeNodes' in a single, atomic database write (either setDoc or updateDoc).
   - Writing 'graphData' (Phase 2 graph synthesis) as a fire-and-forget promise
     prior to details extraction is strictly banned.
   - Native Queue Generation: The backend Cloud Function (\`onCurationJobCreated\`) explicitly computes the 'activeNodes' queue natively by extracting every generated artist ID from the final graphData. This ensures that the frontend's Deep Cut panel boots fully hydrated instantly from the database payload.
   - Omitting activeNodes from the completion write leaves the project document
     with activeNodes: [] (set at creation time), causing the Deep Cut panel to
     permanently display 0 and flicker on every subsequent project load.
   - Regression Prevention (The "Why"): Fragmented backend writes meant the frontend had to guess queue state. By computing the full native queue server-side from \`graphData\` and bundling it atomically, we prevent race conditions where the UI flashes empty before hydration. Ensure all future Cloud Function updates maintain this atomic multi-field \`updateDoc\`.
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

5. UPFRONT UNIVERSAL HYDRATION MANDATE & DUAL-COLLECTION CACHING:
   - The global shared cache splits entities cleanly between two Firestore collections: /artists (for bands, musicians, and musical acts) and /labels (for record labels and publishing houses).
   - Label entities use normalized canonical slugs (bypassing multi-origin country suffixes like -united-states or -united-kingdom) because record labels represent global publishing organizations without country-specific disambiguation requirements.
   - ARCHITECTURAL LAW — UPFRONT UNIVERSAL HYDRATION: Every curation job MUST fully hydrate
     ALL node types during the initial background run — this includes primary AI artist nodes,
     record label nodes, and untyped deep cut artist nodes. Transient network failures (timeouts) 
     are the explicitly permitted exception: failing nodes return null to safely bypass the cache write, 
     preventing permanent database corruption and smoothly handing off hydration to the frontend 
     on-demand fallback. Partial hydration (outside of these transient skips) is a regression and is 
     strictly prohibited.
   - Chunked Concurrent Pre-Caching: Hydration is executed in parallel chunks of 5 nodes via
     Promise.all() to prevent Cloud Function timeouts while avoiding Gemini API rate exhaustion.
     On a cache miss for any entity, the pipeline synthesizes its profile via Gemini Flash and
     atomically writes it to /labels/{labelSlug} or /artists/{id} with isDeep: true before the
     job finalizes.
   - Root Alias Replication: After writing a disambiguated regional variant document (e.g.,
     /artists/artist-united-states), the backend replicates the full detailsCache payload onto
     the bare root document (/artists/artist). This guarantees that frontend short-ID queries
     against root documents immediately return hydrated content without requiring a redirectsTo
     pointer follow-through.
   - Guaranteed Instant Cache Hits: By the time the Spiderweb graph finishes rendering on the
     client, all /artists/{id} and /labels/{canonicalId} documents exist in Firestore, ensuring
     that clicking any node — including record labels and previously unhydrated deep cuts —
     resolves via an instant O(1) global cache hit with zero client-side generation flows.
   - imageUrl Preservation During Cache Writes: All entity profile writes — via both
     sanitizeLabelProfile (labels) and the artist hydration path — MUST explicitly preserve the
     'imageUrl' field. Any utility that strips or overwrites this field to null or undefined
     during a sanitization or merge operation is a regression. The Contextual Image Trust Rule
     applies at the persistence layer: a valid imageUrl discovered during synthesis must survive
     the full write cycle to Firestore without being discarded.

6. STRICT PAYLOAD SANITIZATION (stripUndefinedProperties):
   - The Google Cloud Firestore JavaScript SDK strictly forbids properties with value undefined in document payloads, throwing an immediate client-side synchronous error (Unsupported field value: undefined).
   - In AI-generated metadata (such as NodeDetails), optional properties (e.g. youtubeVideoId or youtubeSearchQuery) are frequently missing for non-musical entities like record labels.
   - Before any payload is transmitted to Firestore via setDoc or updateDoc, it MUST be wrapped with stripUndefinedProperties(...) (exported from services/artistCacheService.ts). This utility recursively traverses objects and arrays to strip any property whose value is strictly undefined, preventing serialization exceptions and silent generation failures.

7. TWO-STEP HYDRATION & IMAGE VALIDATION ARCHITECTURE:
   - Monolithic Prompt Decoupling: To prevent JSON schema constraint overwhelm and AI hallucination, entity hydration is split into two distinct steps. The primary \`fetchNodeDetailsBackend\` prompt focuses exclusively on synthesizing rich text (bio, genre, discography). A dedicated secondary step (\`scrapeImageUrlBackend\`) uses this text context to isolate and extract a single verified image URL.
   - Bulletproof URL Extraction: The secondary image scraper bypasses rigid JSON schema requirements, outputting the URL naturally. A robust RegEx parser (\`/https:\\/\\/[^\\s"'<>()\\[\\]]+/i\`) strictly plucks the raw HTTPS link, preventing formatting failures.
   - Active HTTP HEAD Validation: Before any image is cached, the backend actively pings the extracted URL using an HTTP HEAD request bundled with a standard Chrome \`User-Agent\`. This critical safety net catches 404s (hallucinated paths), 403s (expired CDN tokens), and 429s (bot blockers). If the link fails this ping, it is instantly discarded to \`null\`, ensuring only active, clickable imagery reaches the Firestore database.
   - Flexible Frontend Rendering: Frontend image containers (e.g., DetailsPanel) strictly avoid fixed ratios (like \`aspect-video\`) or forced \`object-cover\` cropping, instead using natural proportional flow (\`w-full h-auto\`) so artist photos display fully without getting cut off, regardless of intrinsic height.
`;

const ARCHITECTURAL_SEPARATION_DOCUMENTATION = `
To maintain strict data cleanliness and prevent schema bloat across our global datasets, Zcene enforces a fundamental architectural separation between artists and record labels based on their core roles:

1. PRIMARY DRIVERS (ARTISTS & GRAPH OWNERSHIP):
   - Canonical artist documents (/artists/{id}) serve as the primary discovery anchors and initiate every Zcene project.
   - Because artists represent the focal point of musical networks, global artist documents strictly own the spiderweb D3 graph payload ('graphData'), storing the interconnected network of artists, scenes, and labels.

2. SECONDARY DEEP CUTS (LABELS & LIGHTWEIGHT CARDS):
   - Users never seed a project around a record label. Labels are purely contextual secondary entities encountered while exploring an artist's network or deep cuts.
   - Record labels do not need, nor should they store, graph blobs or spiderweb structures. Therefore, when persisting documents to /labels/{labelId}, the pipeline explicitly sets 'graphData: null' (or omits graph blobs entirely).

3. STRICT PAYLOAD SANITIZATION (sanitizeLabelProfile):
   - Before caching any record label profile in Firestore, the dataset MUST pass through the 'sanitizeLabelProfile' filter (exported from services/artistCacheService.ts).
   - This utility strips out all artist-centric noise and interactive widgets that do not apply to publishing houses, including:
     * YouTube music video IDs and search queries ('youtubeVideoId', 'youtubeSearchQuery')
     * Active touring status, ticket URLs, and cached tour dates ('tourDates', 'tourCachedAt', 'tourInfo')
     * Band roster and personnel lists ('members')
   - A global label document in /labels is strictly standardized to contain only:
     * Core Metadata: founded year, origin, genre, and notable artists (Scene Circle / Released Artists).
     * Narrative History: high-impact bio summary ('summary').
     * Essential Listening: key catalog album releases ('discography').
     * Clean External Links: official website, Bandcamp, Discogs, and store URLs ('links').
     * Image URL ('imageUrl'): Explicitly preserved during sanitization. Labels may have genuine logo
       or cover art imagery sourced from credible genre ecosystem platforms (e.g., Bandcamp, Discogs,
       Wikimedia). The Contextual Image Trust Rule applies equally to label entities: if the image URL
       is a valid https:// asset accompanying verified biographical copy, it MUST be carried through
       sanitizeLabelProfile without being stripped or nullified. Any future changes to sanitizeLabelProfile
       MUST NOT remove imageUrl from the preserved field set.
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

const DEEP_CUT_IMAGE_PIPELINE_DOCUMENTATION = `
The Deep Cuts image rendering engine implements a genre-flexible contextual sourcing hierarchy, universal URL sanitization, automated self-healing for corrupt cache entries, and a zero-clutter UI without visual source tags.

1. GENRE-CONTEXTUAL SOURCING HIERARCHY & TWO-TIER VALIDATION:
   - Genre-Contextual Image Sourcing Hierarchy: The AI curation prompt actively infers genre context from entity names and connected node scenes, routing to genre-specific source priorities:
     * Contemporary/Indie/Punk/Electronic/Hip-Hop: Priority 1 Official Bandcamp artist page (band photo, header banner, or release artwork); Priority 2 Discogs; Priority 3 AllMusic/Pitchfork; Priority 4 Wikimedia Commons; Priority 5 Official label page.
     * Classical/Orchestral/Traditional/Opera: Priority 1 Wikimedia Commons (composer portraits or archival images); Priority 2 Record label catalog pages (Naxos, Hyperion, Deutsche Grammophon, ECM, Harmonia Mundi, BIS, Chandos); Priority 3 Gramophone/Britannica editorial portraits; Priority 4 Institutional archives/musicological databases.
     * Jazz/Blues: Priority 1 Wikimedia Commons or Blue Note/Verve/ECM label CDNs; Priority 2 AllMusic/DownBeat; Priority 3 Bandcamp independent pages.
   - Two-Tier Domain-Aware Image Validator (sanitizeImageUrl):
     * Tier A (Curated Allowlist): Divided into two named groups: Contemporary/Indie (Wikimedia, Bandcamp CDN f1-f4.bcbits.com, Discogs, Spotify, Last.fm, MusicBrainz, AllMusic) and Classical/Institutional (Hyperion, Naxos, ECM, Deutsche Grammophon, Harmonia Mundi, BIS, Presto Music, Chandos, Britannica). Any URL from a Tier A domain is accepted automatically if structurally valid, covering institutional CDNs whose image endpoints lack file extensions.
     * Tier B (Extension & Path Fallback): Any domain is accepted if its pathname contains a recognized image extension (.jpg, .png, .webp, .gif, .avif, etc.) or image-suggestive directory segment (/img/, /photo/, /artwork/), allowing clean release artwork or artist photos from retailer shops or independent web pages.
     * Null Fallback Safety Net: Any URL failing both Tier A and Tier B is rejected as web noise. If no verified image from permitted sources is found, the engine mandates omitting imageUrl (returning null) rather than falling back to generic stock photography (Unsplash, Pexels, Shutterstock) or irrelevant landscape imagery.
   - Contextual Image Trust Rule: If biographical copy is verified and extracted from a credible genre source, the accompanying contextual image asset is trusted by default—bypassing restrictive Special:FilePath formatting hurdles regardless of unconventional URI structures.
   - Universal URL Sanitization: All image URLs across frontend proxies (geminiService.ts) and backend Cloud Functions (curatorService.ts) enforce identical two-tier rules, cleanly rejecting template placeholders (example.com, ...), empty strings, and search citation markers.
   - YouTube Thumbnail Retirement: Legacy YouTube video stills (hqdefault.jpg) have been completely removed from the asset hierarchy to eliminate mismatched video frames. Missing or failed images fall back directly to our curated design-system placeholder cards.

2. ZERO-CLUTTER UI & SOURCE BADGE REMOVAL:
   - Dynamic Placeholder Omission: When no valid image is available (or if all sources return network errors), the generic grey placeholder box is completely omitted from the DOM, allowing the card layout to collapse cleanly without visual filler.
   - Zero Source Attribution Badges: To maintain a clean, immersive user experience, text-based source attribution tags (such as 'Wiki Photo' or 'YouTube Still') and interactive source switcher buttons have been completely removed from both the card header badges and floating image overlays.

3. AUTONOMOUS SELF-HEALING & QUEUE REVALIDATION:
   - Sentinel Cache Detection: The client cache validation engine (checkIsProfileStaleOrCorrupt) detects corrupt cache states and sentinel failure records (such as 'Failed to curate details for...').
   - Queue Revalidation: When the background deep cut queue encounters a corrupt or sentinel entry, it actively triggers asynchronous background revalidation (triggerBackgroundRevalidation) to heal the record in Firestore without blocking the UI.

4. CONTAINER SIZING & PORTRAIT FRAMING RULES:
   - Standardized 16:9 Widescreen Wrapper (aspect-video): Locks the image container to a consistent widescreen ratio across all card stacks, eliminating awkward letterboxing or layout shifts.
   - Upward Focal Point Alignment (object-cover object-[center_25%]): Replaces default center-cropping with facial-bias positioning, aligning the focal point to the upper-mid quadrant where human heads reside in portrait photographs.
`;

const AI_PARSING_RESILIENCE_DOCUMENTATION = `
The Zcene AI curation and client proxy pipelines implement a 4-tier defense-in-depth architecture to prevent LLM Chain-of-Thought (CoT) reasoning and raw JSON string wrapper leakage into Firestore database fields.

1. ROOT-BOUND JSON EXTRACTOR (extractCleanJsonString):
   When Google Search grounding is active, Gemini 2.5 Flash frequently emits step-by-step reasoning preambles before code blocks or trailing citations after them. Naive string checks (startsWith('\`\`\`')) fail when preceded by conversational commentary. The Root-Bound Extractor isolates markdown fences via regex and bounds root bracket depth ({/}), truncating trailing postambles exactly at root closure (depth === 0).

2. STACK-BOUNDED REPAIR (repairJson):
   When JSON responses are truncated or malformed, the stack-bounded repair loop matches opening and closing braces/brackets. Unlike naive character scanners that continue into trailing markdown or sign-offs, our repair loop terminates and breaks immediately as soon as the outer root JSON structure closes (stack.length === 0).

3. ANTI-LEAKAGE PROSE GUARD & WRAPPER RESCUE:
   In cases where Google Search grounding forces Gemini to drop JSON mode in favor of unstructured prose, the error handlers execute a Grounding Prose Fallback. To prevent raw JSON syntax wrappers ({ "summary": "..." }) or AI reasoning from being saved as band biographies:
   - Wrapper Rescue: Detects JSON artifact prefixes ({/[ or "summary":) and regex-extracts clean bio strings.
   - CoT Rejection: Actively rejects reasoning sentences (e.g., 'I have confirmed...', 'I will manually check...') and throws a safe formatting exception rather than writing commentary to Firestore alongside youtubeVideoId: null.
   - Markdown Preservation: Preserves markdown formatting (bolding, lists) while translating literal escaped newlines (\\n) into actual breaks, allowing native frontend components to handle structural chunking and styling according to the Design System.

4. CROSS-ENVIRONMENT SYNC:
   This defense-in-depth parsing contract is identically enforced across client proxies (services/geminiService.ts), Cloud Functions curation jobs (functions/src/services/curatorService.ts), and Node.js server endpoints (server.js).
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

6. SECONDARY NODE EVICTION LOOP PREVENTION (CRITICAL — validateNodeDetailsContent):
   - Root Cause: The topology-focused 'validateCacheEntry' gate requires graphData, isPrimarySeed,
     and synthesisRationale/Roots Breakdown. Secondary nodes (deep cuts, record labels, untyped artists)
     never store these fields. Applying validateCacheEntry to secondary documents always returns
     isFullyQualified: false, triggering eviction on every background worker queue tick, causing
     an infinite synthesis loop that exhausts API quota and never settles.
   - Fix: The background worker queue, the fallback Firestore read inside onNodeClick, and the
     isStale computation all use the content-focused 'validateNodeDetailsContent' gate instead.
     This gate only checks for a valid, non-sentinel summary/bio presence in detailsCache.
   - CONTRACT: The background worker queue checks (App.tsx: the JIT details fetcher) MUST use
     validateNodeDetailsContent for ALL non-seed node evaluations. Future refactoring of the
     background queue MUST preserve this routing — reverting to validateCacheEntry in the
     secondary-node path will reintroduce the infinite eviction loop regression.
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

4. DUAL-GATE VALIDATION MODEL — TOPOLOGY vs. CONTENT (MANDATORY CONTRACT):
   The system enforces two semantically distinct validation gates. Each gate has a precisely scoped
   purpose and MUST NOT be substituted for the other:

   GATE 1 — validateCacheEntry (Topology Gate):
   - Purpose: Full graph-topology validation for seed-level data quality.
   - Scope: Used exclusively in the high-level cache front gate inside handleGenerateGraph and
     in global cache hit checks where a complete, qualified seed document is required.
   - Checks: graphData structure presence, synthesisRationale/Roots Breakdown completeness
     ('acoustic', 'scene', optional 'overlap'), and document version integrity.
   - Usage: validateCacheEntry(data, isSingleArtist).isFullyQualified
   - DO NOT use this gate for secondary nodes, deep cuts, or background worker queue checks.
     Applying it to non-seed documents will block all secondary node hydration because deep
     cuts never carry graphData or synthesisRationale, causing a permanent cache eviction loop.

   GATE 2 — validateNodeDetailsContent (Content Gate):
   - Purpose: Lightweight content-presence validation for secondary node details.
   - Scope: Used in the background worker queue (JIT details fetcher), in the fallback
     Firestore read path inside onNodeClick, and in the staleness check inside the
     background cache loader. Does NOT require graphData, isPrimarySeed, or synthesisRationale.
   - Checks: detailsCache field is a non-null, non-empty value. Parses the field and confirms
     that the resolved object has a 'summary' or 'bio' string with length > 5, and that the
     entry is not marked as corrupt (_isSentinel: true).
   - Usage: validateNodeDetailsContent(data.detailsCache)
   - This is the authoritative gate for: (a) deciding whether to skip or trigger background
     revalidation for a node, (b) deciding whether to treat a Firestore cache read as a valid
     hit or a miss in the short-ID fallback lookup, and (c) computing isStale for background
     worker queue scheduling.

5. CACHE MAP ALIAS RESOLUTION (expandDetailsCacheMap):
   All detailsCache Map population — across project loaders, shared Zcene imports, and cloud
   curation job callbacks — MUST route through the expandDetailsCacheMap() utility (App.tsx).
   This function parses raw detailsCache JSON (handling string, array-wrapped, and object forms),
   then replicates each entry under four keys: the raw original key, a lowercased variant, a
   normalizeArtistId() slug variant, and a display-name variant derived from the cached
   artist/details.artist field. This quad-binding guarantees that any node ID format used
   at query time — regardless of casing, hyphenation, or slug normalization — resolves
   to the correct cached entry without an O(n) scan. Any future project loader code that
   directly calls new Map(JSON.parse(data.detailsCache)) bypasses this guarantee and MUST
   be refactored to use expandDetailsCacheMap() instead.
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
   - Trigger: Single click (Desktop) or single tap (Mobile touch viewports) on any node.
   - Behavior: Instantly sets active node focus, pins the floating 'Hover Box' (info snippet) banner, and illuminates yellow connection lines (#F6E468 at 0.9 opacity) to all 1st-degree related nodes while locking D3 camera focus. This state persists until the user explicitly clicks/taps the SVG background.
   - Mobile Touch & Line Highlighting: Touch viewports execute synchronous node hover and line highlighting logic on single tap, guaranteeing mobile visual feature parity with desktop hover.
   - Purpose: Provides identical, friction-free connection tracing and information peeks across all platforms without triggering paid network API transactions.

2. STATE 2: THE 'ACTION GATEWAY' (Secondary Interaction):
   - Trigger: A second click/tap on the already-selected (peeked) node.
   - Behavior: Automatically hides/dismisses the floating hover box to clear visual clutter and opens the sidebar Details Panel (which now houses the standard square Explore icon button with a compass icon and node removal controls in its header, keeping the spiderweb canvas pristine).
   - Persistent Yellow Highlights: All yellow 1st-degree connection lines highlighted during State 1 remain illuminated throughout State 2 to maintain graph context.
   - API Gateways:
     - Blocked & Cached nodes: Bypasses the token quota modal and enters State 2 instantly.
     - Uncached nodes: Triggers the JIT details queue and presents the Token Quota Confirmation warning. If canceled, the node remains in State 2 (with Explore icon button and sidebar details card visible) to allow easy re-initiation.

3. PINNED MOUSE EVENT LOCKING (D3 Mouseleave Bypass):
   - In D3's 'mouseleave' event handler, the system queries the active ref states (selectedNodeRef.current and peekedNodeRef.current).
   - If the cursor leaves a node that is currently peeked or selected, the clearNodeHover command is bypassed. This keeps connection lines and hover snippet elements locked and stable.
   - When hovering over other nodes, temporary transient highlights are drawn, and leaving those transient nodes gracefully restores the pinned node's visual state.

4. DEEP CUT PAGINATION BYPASS:
   - When navigating artists in the Deep Cut pagination carousel (via <, >, or dot indicators), the graph automatically bypasses the Sticky Peek state (State 1) and transitions directly to the Action Gateway (State 2) by passing the forceActionState=true flag to handleNodeClick.
   - This ensures that the floating hover box is immediately dismissed while yellow connection lines and explore button overlays are shown, maintaining visual focus on details rather than graph overlay cards.
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
    failureType: "Grounding JSON Mutation & CoT Leakage",
    userImpact: "Partial artist details or CoT reasoning contamination.",
    component: "geminiService.ts / curatorService.ts / server.js",
    persistence: "Semi-Persistent (Firestore)",
    mitigation: "Root-Bound Extractor isolates fences; Stack-Bounded repair terminates on root close; Anti-Leakage Guard prevents unparsed JSON syntax or CoT reasoning from leaking into bio fields."
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
                        <CodeBlock title="Image Pipeline & Rendering Rules" content={DEEP_CUT_IMAGE_PIPELINE_DOCUMENTATION} />
                        <CodeBlock title="Fetch Details Prompt" content={FETCH_NODE_DETAILS_PROMPT_TEMPLATE} />
                        <CodeBlock title="Node Details Schema" content={NODE_DETAILS_SCHEMA} isJson />
                    </section>

                    {/* ── DATA SYNTHESIS & PERSISTENCE ── */}
                    <section id="data-synthesis">
                        <h2 className="text-3xl font-medium text-white tracking-tight border-b-2 border-primary/50 pb-2 mb-8 mt-12">Data Synthesis & Persistence</h2>
                        <CodeBlock title="Atomicity, API Gateway & Sanitization Specification" content={DATA_SYNTHESIS_PERSISTENCE_DOCUMENTATION} />
                        <CodeBlock title="Architectural Separation: Artists vs. Labels & Simultaneous Pre-Caching" content={ARCHITECTURAL_SEPARATION_DOCUMENTATION} />
                        <CodeBlock title="Cache Validation & Qualification Rules" content={CACHE_VALIDATION_DOCUMENTATION} />
                        <CodeBlock title="AI Parsing Resilience & Anti-Leakage Defense" content={AI_PARSING_RESILIENCE_DOCUMENTATION} />
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
