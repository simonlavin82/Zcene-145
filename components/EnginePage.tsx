import React, { useState, useEffect, useRef } from 'react';
import { View } from '../types';
import { ZceneLogo, InstagramIcon, VisibilityIcon, VisibilityOffIcon } from './Icons';
import { 
    GRAPH_RESPONSE_SCHEMA, 
    NODE_DETAILS_SCHEMA,
    GENERATE_GRAPH_PROMPT_TEMPLATE,
    GENERATE_GRAPH_WITH_CONTEXT_PROMPT_TEMPLATE,
    FETCH_NODE_DETAILS_PROMPT_TEMPLATE
} from '../services/geminiService';

interface SourcePageProps {
    onNavigate: (view: View) => void;
    isActive: boolean;
    profile: any;
    onUpdateProfile: (updates: any) => void;
}

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

2. COMPUTE & SERVING (Cloud Run):
   The application is containerized and hosted on Google Cloud Run.
   - Autoscaling: The container scale dynamically based on request traffic, 
     ensuring the interactive D3 simulations remain responsive.
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

3. NON-DESTRUCTIVE MERGE (App.tsx):
   The merge logic preserves existing Node objects. This is critical because 
   D3 attaches internal state (x, y, vx, vy) directly to these objects. 
   Replacing objects would cause nodes to "explode" and reset their positions.
   - New nodes are injected with randomized positions (+/- 200px from center).
   - Existing nodes are updated via Object.assign to keep physics refs intact.

4. DATA INTEGRITY (geminiService.ts):
   The 'Orphaned Link Mitigation' logic filters the AI response. It ensures 
   every link's 'source' and 'target' corresponds to a validated node ID 
   present in either the legacy graph or the new delta.

5. GLOBAL CACHE ALIGNMENT (artistCacheService.ts):
   Before invoking Gemini for Phase 02 Orchestration, the engine computes a 
   normalized cache key (sorted artist list + serialized filters) and probes 
   the global 'artists' Firestore collection.
   - Cache HIT: Graph structure + Deep Cut metadata are returned instantly. 
     Phases 02 and 03 are bypassed entirely. D3 Phase 04 begins immediately, 
     and artist canvas positions from the project's canvasLayout are restored.
   - Cache MISS: The normal Gemini generation pipeline executes. On success, 
     the computed graph is written to the global cache (detailsCache starts 
     empty). As each Phase 03 Deep Cut fetch completes, it incrementally 
     writes the enriched metadata back into the cache entry so future users 
     receive pre-populated Deep Cuts on a cache hit.
   - Key Format: lowercase, alphanumeric + hyphens, artists sorted and joined 
     with '--', filters appended as suffixes (e.g. 'after2010'). Max 512 chars.
   - Permanent cache by design: music histories, genre bridges, and Deep Cut 
     metadata rarely change. Admin manual deletion handles edge cases.

6. IMMERSIVE DISCOVERY FLOW (MusicGraph.tsx / ExampleMusicGraph.tsx):
   Zcene features a "Spiderweb" discovery interface that allows users to 
   interactively expand the graph in real-time.
   - Discovery UI: Contextual action buttons (+/-) emerge directly from 
     selected nodes, maintaining spatial anchoring during simulation.
   - Predictive Loading: When a new artist is discovered, a "Loading Node" 
     and dashed connection line appear, inheriting the momentum of the 
     parent node to prevent visual jumps.
   - Seamless Evolution: The transition from "Loading" to "Real Node" 
     preserves object identity and physics state, ensuring the narrative 
     flow is never interrupted by hard resets.
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
                    <div className="text-[11px] text-zinc-500 mt-1">Up to 25 Seed Artists + Year/Origin Logic</div>
                </div>
                <div className="h-8 w-0.5 bg-zinc-800 my-2" />
            </div>

            {/* Step 2: Orchestration */}
            <div className="w-full flex flex-col items-center">
                <div className="px-6 py-4 rounded-xl border-2 border-primary bg-zinc-900/50 text-center w-full max-w-md shadow-[0_0_15px_rgba(255,255,255,0.03)]">
                    <div className="text-primary text-[10px] font-mono mb-1 uppercase tracking-tighter">Phase 02: Orchestration</div>
                    <div className="text-white font-medium">Global Cache Check → Gemini 1.5</div>
                    <div className="text-[11px] text-zinc-500 mt-1">Probes the global 'artists' cache first. <span className="text-primary font-semibold">⚡ Cache Hit</span> skips directly to Phase 04. Cache Miss calls Gemini to map relational bridges, then writes the result to the global cache.</div>
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
                    <div className="text-[11px] text-zinc-400 mt-1">Project record stores only a <span className="text-primary font-mono">cacheKey</span> reference + artist <span className="text-primary font-mono">canvasLayout</span> positions. Heavy graph data lives in the global artists cache.</div>
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

export const EnginePage: React.FC<SourcePageProps> = ({ onNavigate, isActive, profile, onUpdateProfile }) => {
    const isAuthenticated = profile?.pageAuth?.engine === true;
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (isActive && containerRef.current) {
            containerRef.current.scrollTo(0, 0);
        }
    }, [isActive]);

    const handleLogin = (e: React.FormEvent) => {
        e.preventDefault();
        if (password === 'Zcenester') {
            onUpdateProfile({ 
                pageAuth: { ...profile?.pageAuth, engine: true } 
            });
            setError(false);
        } else {
            setError(true);
            setPassword('');
        }
    };

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

    if (!isAuthenticated) {
        return (
            <div ref={containerRef} className="h-full w-full overflow-y-auto bg-background-dark text-zinc-200 font-display flex flex-col items-center justify-center p-4">
                <div className="w-full max-w-md bg-zinc-900 border border-zinc-700 rounded-xl p-8 shadow-2xl my-auto">
                    <div className="text-center mb-8">
                        <ZceneLogo className="h-10 w-auto text-primary mx-auto mb-6" />
                        <h2 className="text-xl font-medium text-white">Restricted Access</h2>
                        <p className="text-zinc-400 text-sm mt-2">Please enter the password to view the Engine & Architecture documentation.</p>
                    </div>
                    <form onSubmit={handleLogin} className="space-y-4">
                        <div className="space-y-2">
                            <div className="relative">
                                <input 
                                    type={showPassword ? "text" : "password"} 
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="Enter password"
                                    className={`w-full bg-zinc-950 border ${error ? 'border-red-500 focus:border-red-500' : 'border-zinc-700 focus:border-primary'} rounded-xl px-4 pr-12 py-3.5 lg:py-3 text-base lg:text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-primary/50 transition-colors`}
                                    autoFocus
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors focus:outline-none h-10 w-10 flex items-center justify-center"
                                    aria-label={showPassword ? "Hide password" : "Show password"}
                                >
                                    {showPassword ? <VisibilityOffIcon className="w-6 h-6" /> : <VisibilityIcon className="w-6 h-6" />}
                                </button>
                            </div>
                            {error && <p className="text-red-500 text-xs ml-1">Incorrect password. Please try again.</p>}
                        </div>
                        <button 
                            type="submit"
                            className="w-full bg-primary text-brand-black font-medium py-3 rounded-xl hover:bg-primary/90 transition-colors"
                        >
                            Access Source
                        </button>
                    </form>
                    <div className="mt-6 text-center">
                        <button onClick={() => onNavigate(View.Home)} className="text-zinc-500 text-sm hover:text-zinc-300 transition-colors">
                            Return Home
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div ref={containerRef} className="h-full w-full overflow-y-auto bg-background-dark text-zinc-200 font-display flex flex-col relative">
            <header className="px-4 sm:px-6 lg:px-8 z-20 flex-shrink-0 border-b border-zinc-700 sticky top-0 bg-background-dark/80 backdrop-blur-sm">
                <div className="flex h-12 items-center justify-between">
                    <button onClick={() => onNavigate(View.Home)} className="flex items-center gap-4 cursor-pointer">
                        <ZceneLogo className="h-8 w-auto text-primary" />
                        <span className="text-xl font-medium text-white hidden sm:block">Engine & Architecture</span>
                    </button>
                    <div className="flex items-center gap-4">
                        <button 
                            onClick={() => {
                                onUpdateProfile({ 
                                    pageAuth: { ...profile?.pageAuth, engine: false } 
                                });
                            }}
                            className="text-sm font-medium text-zinc-400 hover:text-white transition-colors"
                        >
                            Lock
                        </button>
                        <button onClick={() => onNavigate(View.Home)} className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-800">
                            <span className="material-symbols-outlined">arrow_back</span>
                            Back
                        </button>
                    </div>
                </div>
            </header>

            <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-12 flex-grow">
                <div className="max-w-5xl mx-auto">
                    <div className="mb-10 border-b border-zinc-700 pb-8">
                        <h1 className="text-3xl font-medium text-white mb-4">The Zcene Engine</h1>
                        <p className="text-zinc-400 leading-relaxed max-w-3xl text-base">
                            This page documents the structural architecture, prompt templates, and discovery logic that drive Zcene. 
                            It is the underlying system that allows the Author to map the unknown.
                        </p>
                    </div>

                    <div className="space-y-4">
                        <h2 className="text-xl font-medium text-primary mb-6">Site Map</h2>
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

                        <h2 className="text-xl font-medium text-primary mb-6 pt-8 border-t border-zinc-700">Architecture</h2>
                        <ArchitectureDiagram />
                        <CodeBlock title="Cloud Infrastructure & Orchestration" content={ARCHITECTURE_DOCUMENTATION} />

                        <h2 className="text-xl font-medium text-primary mb-6 pt-8 border-t border-zinc-700">Graph Intelligence</h2>
                        <DiscoveryFlowDiagram />
                        <CodeBlock title="State Maintenance & lifecycle" content={GRAPH_INTELLIGENCE_DOCUMENTATION} />

                        <h2 className="text-xl font-medium text-primary mb-6 pt-8 border-t border-zinc-700">Visualization Engine</h2>
                        <CodeBlock title="Physics & D3 Constants" content={PHYSICS_ENGINE_DOCUMENTATION} />

                        <h2 className="text-xl font-medium text-primary mb-6 pt-8 border-t border-zinc-700">Collaboration & Sharing Flow</h2>
                        <SharingFlowDiagram />
                        <CodeBlock title="Guest Preview & Project Cloning" content={SHARING_FLOW_DOCUMENTATION} />

                        <h2 className="text-xl font-medium text-primary mb-6 pt-8 border-t border-zinc-700">System Resilience</h2>
                        <CodeBlock title="Network Logic & Selection strategy" content={RESILIENCE_DOCUMENTATION} />

                        <h2 className="text-xl font-medium text-primary mb-6 pt-8 border-t border-zinc-700">Graph Generation</h2>
                        <CodeBlock title="Initial Graph Prompt" content={GENERATE_GRAPH_PROMPT_TEMPLATE} />
                        <CodeBlock title="Enhance Graph (Context) Prompt" content={GENERATE_GRAPH_WITH_CONTEXT_PROMPT_TEMPLATE} />
                        <CodeBlock title="Graph Response Schema" content={GRAPH_RESPONSE_SCHEMA} isJson />
                        
                        <h2 className="text-xl font-medium text-primary mb-6 pt-8 border-t border-zinc-700">Deep Cut Details</h2>
                        <CodeBlock title="Lexical Hardening & Persona" content={DEEP_CUT_INTELLIGENCE_DOCUMENTATION} />
                        <CodeBlock title="Fetch Details Prompt" content={FETCH_NODE_DETAILS_PROMPT_TEMPLATE} />
                        <CodeBlock title="Node Details Schema" content={NODE_DETAILS_SCHEMA} isJson />

                        <h2 className="text-xl font-medium text-primary mb-6 pt-8 border-t border-zinc-700">Access Management</h2>
                        <div className="space-y-6">
                            <CodeBlock 
                                title="Fortress Approach Implementation" 
                                content={`// IDENTITY-BASED AUTHORIZATION
// Access to sensitive modules (Engine & Design System) is strictly gated 
// by identity-based authorization.
const ADMIN_EMAIL = 'simon.lavin1@gmail.com';
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

                        <h2 className="text-xl font-medium text-primary mb-6 pt-8 border-t border-zinc-700">Conversational Intelligence</h2>
                        <CodeBlock title="Consult AI Logic" content={CONVERSATIONAL_INTELLIGENCE_DOCUMENTATION} />
                    </div>
                </div>
            </main>

            <footer className="w-full p-8 text-zinc-400 text-sm z-10 relative bg-neutral-900 flex-shrink-0 border-t border-neutral-800">
                <div className="container mx-auto">
                    <div className="flex flex-col items-center gap-8">
                        <button onClick={() => onNavigate(View.Home)} className="cursor-pointer">
                            <ZceneLogo className="h-8 w-auto text-primary" />
                        </button>
                        <nav className="flex flex-wrap justify-center gap-x-6 gap-y-2 font-medium">
                            <button onClick={() => onNavigate(View.Home)} className="hover:text-primary transition-colors">Home</button>
                            <button onClick={() => onNavigate(View.Graph)} className="hover:text-primary transition-colors">App</button>
                            <button onClick={() => onNavigate(View.Help)} className="hover:text-primary transition-colors">Help</button>
                            <button onClick={() => onNavigate(View.StyleGuide)} className="hover:text-primary transition-colors">Design System</button>
                            <button onClick={() => onNavigate(View.Engine)} className="hover:text-primary transition-colors">Engine</button>
                        </nav>
                        <div className="flex items-center gap-4">
                            <a href="https://www.instagram.com/zcene.online/" target="_blank" rel="noopener noreferrer" aria-label="Instagram">
                                <InstagramIcon className="w-6 h-6 hover:text-primary transition-colors" />
                            </a>
                        </div>
                    </div>
                    <div className="mt-8 border-t border-zinc-600/50 pt-8 text-center">
                        <p>© 2026 Zcene. All Rights Reserved.</p>
                    </div>
                </div>
            </footer>
        </div>
    );
};
