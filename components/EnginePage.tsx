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

const SitemapNode: React.FC<{ title: string; description: string; children?: React.ReactNode }> = ({ title, description, children }) => (
    <li>
        <div className="font-medium text-white pt-4 hover:text-primary transition-colors cursor-default">{title}</div>
        <p className="text-zinc-400 text-sm leading-relaxed mb-2">{description}</p>
        {children && <ul className="pl-6 border-l-2 border-zinc-700 mt-2 space-y-4">{children}</ul>}
    </li>
);

const ARCHITECTURE_RULES = [
    { id: 1, title: "Three-Column Flow", desc: "Pipeline is strictly divided into React UI, HTTP Fast-Track, and Background Worker." },
    { id: 2, title: "Strict Seed Hoisting & Pinning", desc: "Seed nodes must ALWAYS be elevated to the highest priority in the topology." },
    { id: 3, title: "Universal Coordinate Amnesia", desc: "Absolute D3 runtime coordinates MUST be explicitly stripped during generation." },
    { id: 4, title: "Deterministic Open Graph Routing", desc: "A deterministic top-level artist image URL MUST be appended to the root." },
    { id: 5, title: "Schema Role", desc: "synthesisRationale MUST be written to root level of the Firestore artist document." },
    { id: 6, title: "Defensive Alias Matching", desc: "isNodeInSeedList strictly enforces canonical mapping without naive substrings." },
    { id: 7, title: "Fail-Fast Media Gatekeeper", desc: "Re-hydrates any node missing crucial iTunes/Spotify imagery or biography." },
    { id: 8, title: "Strict Topology Verification", desc: "Stubs MUST be strictly routed to Generative Topology before async hydration." },
    { id: 9, title: "Canonical Seed Slug Resolution", desc: "All downstream writes MUST target the canonical ID to prevent split-brain." },
    { id: 10, title: "Redirect Pointer Immunity", desc: "Hydration loop slug dedup MUST explicitly skip any document with a redirectTo field." },
    { id: 11, title: "Cost-Optimized Parametric Hydration", desc: "Native googleSearch grounding tools MUST remain fully stripped." },
    { id: 12, title: "Resilient iTunes Artwork Pipeline", desc: "Punctuation-Agnostic Normalization and Summary Match Fallback." },
    { id: 13, title: "Auth Handoff Preserver", desc: "Stashes ID in session storage to guarantee clone resumes post-auth." },
    { id: 14, title: "Atomic Self-Healing", desc: "Graph breakdowns handle atomic self-healing." },
    { id: 15, title: "Complex Cache Bypass", desc: "Multi-seed and filtered queries must strictly bypass the Global Topology Cache." },
    { id: 16, title: "Curation Intercept Guardrails", desc: "ProjectLoader must strictly bypass Phase 1 interception when curating." },
    { id: 17, title: "Universal Pre-Flight Stub Minting", desc: "Bare stubs (_isStub: true) are minted synchronously before async generation to guarantee pipeline integrity." },
    { id: 18, title: "Authorization Lifecycle", desc: "Token/billing authorization state must be strictly scoped to the active generation event." },
    { id: 19, title: "External Link Security", desc: "Official Website and Bandcamp links must rely on deterministic client-side search templates." },
    { id: 20, title: "Mandatory Disambiguation on Direct Hits", desc: "Green Line MUST NEVER bypass the user confirmation phase." },
    { id: 21, title: "Locked Topology & Coordinate Memory", desc: "Node positions derived from AI link weights. (fx, fy) coordinates are persisted to canvasLayout to lock orientation." },
    { id: 22, title: "Deep Cloning Isolation", desc: "Duplication executes a deep 1:1 clone of the project object via the Universal Serializer to ensure localized edits never mutate the original canonical document." },
    { id: 23, title: "Topology Parity Mandate", desc: "Any connection explicitly cited in the Root Breakdown narrative MUST have a corresponding physical edge in the graph." },
    { id: 24, title: "Verbal Identity", desc: "The Root Breakdown system prompt must enforce the 'late-night record curator' voice." },
    { id: 25, title: "Selective Coordinate Amnesia", desc: "When generating a shared link, fixed coordinates are stripped via a post-serialization Blacklist Mutation so guests experience a fresh D3 layout." },
    { id: 26, title: "Contextual Tooltips", desc: "Hover states and tooltips must prioritize native narrative snippets generated during the Root Breakdown." },
    { id: 27, title: "Multi-Seed Co-Anchoring", desc: "Complex Generations MUST dynamically force the AI to co-anchor the narrative to explore the relationship between all seeds." },
    { id: 28, title: "Canonical Global Caching", desc: "Global caching must use pure canonical IDs. Query filters are barred from document paths to prevent cache fracturing." },
    { id: 29, title: "Universal Payload Serializer", desc: "A Single Source of Truth for generating Zcene payloads. Guarantees 1:1 data parity between Saves, Duplicates, and Shares prior to any ephemeral mutations." },
    { id: 30, title: "Strict Hydration Lock", desc: "Autosave intervals & listeners suspended via global lock during generation." },
    { id: 31, title: "Local State Preemption", desc: "Zero-cost local routing must synchronously inject graph into React state before releasing lock." },
    { id: 32, title: "Validation Circuit Breaker", desc: "Phase 3 Validation Modal must act as a hard execution stop/return." },
    { id: 33, title: "Payload Completeness", desc: "Direct Hit local routing must inject both graphData and detailsCache simultaneously." },
    { id: 34, title: "Cognitive Tiering & Orchestration Stability", desc: "AI generation strictly utilizes the thinking_level tier system (minimal to high) with legacy sampling parameters explicitly forbidden. Discovery Ledger remains pegged to standard list rates ($1.50 / 1M input, $7.50 / 1M output)." },
    { id: 35, title: "Geographic Asset Disambiguation", desc: "If the deterministic iTunes scraper fails to validate an image asset due to a multi-artist name collision or missing legal alias, the background worker must parse the node's parametric origin data, append the relevant regional suffix (e.g., ' US', ' UK'), and execute a secondary validation query." },
    { id: 36, title: "Label Taxonomy Normalization", desc: "The extraction pipeline MUST algorithmically strip interchangeable structural suffixes (e.g., -records, -music, -company, -group, -media) from label entities prior to caching. This enforces the Canonical Persistence Mandate by reducing natural LLM variations to a single, pure root ID." }
];

const DiscoveryFlowDiagram: React.FC = () => (
    <div className="w-full py-12 bg-zinc-950/50 rounded-xl border border-zinc-800 mb-8">
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_auto_1fr_auto_1fr_auto_minmax(220px,280px)] items-stretch justify-center gap-3 lg:gap-4 px-2 xl:px-4">
            {/* Column 1: React UI */}
            <div className="flex flex-col flex-1 min-w-0">
                <div className="px-4 py-5 rounded-xl border border-zinc-700 bg-zinc-900 h-full">
                    <div className="text-primary text-[10px] font-mono mb-1 uppercase tracking-tighter">Column 1</div>
                    <div className="text-white font-medium mb-4">React UI</div>
                    <ul className="text-[12px] text-zinc-400 space-y-4">
                        <li><span className="text-primary font-medium">Local Topology Routing:</span> Direct Hits (perfect cache) bypass the backend entirely.</li>
                        <li><span className="text-primary font-medium">Front Gate Cache Guard:</span> Bypasses network entirely if a valid, complete cache document exists. Topology Hits MUST explicitly route through the <code>&lt;DisambiguationModal&gt;</code> to verify origin.</li>
                        <li><span className="text-primary font-medium">API Confirmation:</span> <code>&lt;TokenConfirmationModal&gt;</code> intercepts generation to authorize API token spend.</li>
                        <li><span className="text-primary font-medium">Active Loader Gate:</span> Locks the UI completely to wait for backend processing.</li>
                        <li><span className="text-primary font-medium">Drop Loader & Render Zcene:</span> The loader drops only when the background worker sets project status to 'completed'.</li>
                    </ul>
                </div>
            </div>

            {/* Arrow */}
            <div className="flex flex-col justify-center">
                <span className="material-symbols-outlined text-zinc-700">arrow_forward</span>
            </div>
            
            {/* Column 2: HTTP Fast-Track */}
            <div className="flex flex-col flex-1 min-w-0">
                <div className="px-4 py-5 rounded-xl border-2 border-primary bg-zinc-900/50 h-full shadow-[0_0_15px_rgba(255,255,255,0.03)] relative">
                    <div className="text-primary text-[10px] font-mono mb-1 uppercase tracking-tighter">Column 2 (Synchronous)</div>
                    <div className="text-white font-medium mb-4">HTTP Fast-Track</div>
                    <ul className="text-[12px] text-zinc-400 space-y-4">
                        <li>
                            <span className="text-primary font-semibold">Validate Origin (3.6 Flash) | Thinking_level: minimal</span>
                            <ul className="list-disc pl-4 mt-1 space-y-1 text-zinc-500">
                                <li>Seed origin slug(s) created.</li>
                                <li>Strips non-standard regional country codes.</li>
                                <li>Zero Search Grounding (Parametric Only) to reflect the eradication of the Search API for cost savings.</li>
                            </ul>
                        </li>
                        <li>
                            <span className="text-primary font-semibold">Pre-Flight Alias Resolution & Stub Minting</span>
                            <ul className="list-disc pl-4 mt-1 space-y-1 text-zinc-500">
                                <li>Evaluates originalQueries payload against global cache.</li>
                                <li>Synchronously writes bare stub pointers (<code>_isStub: true</code>, <code>redirectTo: canonical-id</code>) directly to Firestore BEFORE worker trigger.</li>
                            </ul>
                        </li>
                        <li>
                            <span className="text-primary font-semibold">Create Topology (3.1 Pro) | Thinking_level: medium</span>
                            <ul className="list-disc pl-4 mt-1 space-y-1 text-zinc-500">
                                <li>Skeleton: Seed, AI Artists, Labels, Genres.</li>
                                <li>Enforces kebab-case-artist-iso-code format.</li>
                                <li>Seed Artist Timeout Protection: Drops failing.</li>
                            </ul>
                        </li>
                    </ul>
                </div>
            </div>

            {/* Arrow */}
            <div className="flex flex-col justify-center">
                <span className="material-symbols-outlined text-zinc-700">arrow_forward</span>
            </div>

            {/* Column 3: Background Worker */}
            <div className="flex flex-col flex-1 min-w-0">
                <div className="px-4 py-5 rounded-xl border border-zinc-700 bg-zinc-900 h-full">
                    <div className="text-primary text-[10px] font-mono mb-1 uppercase tracking-tighter">Column 3 (Asynchronous)</div>
                    <div className="text-white font-medium mb-4">Background Worker</div>
                    <ul className="text-[12px] text-zinc-400 space-y-4">
                        <li>
                            <span className="text-primary font-medium">Update Job</span>
                            <ul className="list-disc pl-4 mt-1 space-y-1 text-zinc-500">
                                <li>Status remains: 'curating'.</li>
                            </ul>
                        </li>
                        <li>
                            <span className="text-primary font-medium">Hydrate Node Batch | Thinking_level: low</span>
                            <ul className="list-disc pl-4 mt-1 space-y-1 text-zinc-500">
                                <li>Global Cache Hit: Attaches existing Deep Cut.</li>
                                <li>Miss: Synthesizes via 3.6 Flash & scraper.</li>
                                <li>High-Fidelity Cap: Strict limit on gen nodes.</li>
                                <li>Slug Deduplication actively ignores legacy deep cuts, but injects pre-generated stubs for timed-out Seed Artists.</li>
                            </ul>
                        </li>
                        <li>
                            <span className="text-primary font-medium">Root Breakdown (3.1 Pro) | Thinking_level: high</span>
                            <ul className="list-disc pl-4 mt-1 space-y-1 text-zinc-500">
                                <li>Synthesizes ecosystem narrative using atmospheric, late-night record curator voice.</li>
                                <li>Outputs structured JSON containing full markdown, 1-sentence artist/seed hooks, and bi-directional edge context (forwardContext / inverseContext).</li>
                                <li>Dynamically branches prompt logic: Single-Seed vs. Multi-Seed Co-Anchoring.</li>
                            </ul>
                        </li>
                        <li>
                            <span className="text-primary font-medium">Topology Parity (3.6 Flash) | Thinking_level: minimal</span>
                            <ul className="list-disc pl-4 mt-1 space-y-1 text-zinc-500">
                                <li>Parses narrative to mechanically inject any missing structural edges into the graph before final positioning.</li>
                            </ul>
                        </li>
                        <li>
                            <span className="text-primary font-medium">Final Node Positioning (3.6 Flash) | Thinking_level: minimal</span>
                            <ul className="list-disc pl-4 mt-1 space-y-1 text-zinc-500">
                                <li>Evaluates pruned bios and new narrative edges to generate semantic link weights (0.1-1.0).</li>
                                <li>Graceful Fallback: Injects 0.5 neutral weight on AI failure to preserve UI.</li>
                            </ul>
                        </li>
                        <li>
                            <span className="text-primary font-medium">Persist Assets</span>
                            <ul className="list-disc pl-4 mt-1 space-y-1 text-zinc-500">
                                <li>Single-Seed: Save Graph + Breakdown + Cuts.</li>
                                <li>Strict Cache Key Coupling prevents desync.</li>
                                <li>Link Persistence: Permanently commits evaluated semantic link weights (0.1-1.0) to edge records.</li>
                            </ul>
                        </li>
                    </ul>
                </div>
            </div>

            {/* Divider */}
            <div className="w-px bg-zinc-800/50 justify-self-center hidden xl:block" />

            {/* Rules Ledger */}
            <div className="flex flex-col">
                <div className="px-4 py-5 rounded-xl border border-zinc-700 bg-zinc-900 h-[600px] overflow-y-auto">
                    <div className="text-white font-medium mb-4 sticky -top-5 bg-zinc-900 py-2 border-b border-zinc-800 z-10">Rules Ledger</div>
                    <div className="space-y-3 pt-2">
                        {ARCHITECTURE_RULES.map(rule => (
                            <div key={rule.id} className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                                <div className="text-[10px] font-bold text-yellow-500 uppercase tracking-tighter mb-1">[Rule {rule.id}] {rule.title}</div>
                                <div className="text-[10px] text-zinc-400 leading-relaxed">{rule.desc}</div>
                            </div>
                        ))}
                    </div>
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
                <div className="px-2 py-1 bg-zinc-900 border border-zinc-800 rounded-md text-[10px] font-mono text-zinc-500">/z/...</div>
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

const AsyncHydrationDiagram: React.FC = () => (
    <div className="bg-zinc-900/30 p-8 rounded-xl border border-zinc-700/50 mb-12">
        <h3 className="text-zinc-200 font-medium text-lg mb-6 uppercase tracking-wider">Async Hydration Decoupling</h3>
        <div className="flex flex-col gap-6">
            <div className="flex items-center gap-4">
                <div className="bg-primary/20 p-3 rounded-lg border border-primary/50 text-primary w-64 text-center font-bold shadow-[0_0_15px_rgba(168,85,247,0.4)]">
                    HTTP Fast-Track
                    <div className="text-[10px] font-normal mt-2 opacity-80">
                        Origin Validation: Gemini 3.5 Flash<br/>
                        Topology Creation: Gemini 3.1 Pro
                    </div>
                </div>
                <div className="flex-1 h-px bg-primary/50 relative">
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-zinc-900 text-xs text-primary px-2">Sync: Render Spiderweb</span>
                </div>
                <div className="bg-zinc-800 p-3 rounded-lg border border-zinc-600 text-zinc-300 w-48 text-center">
                    Graph Data Written
                </div>
            </div>
            <div className="flex items-center gap-4 opacity-80">
                <div className="bg-amber-500/20 p-3 rounded-lg border border-amber-500/50 text-amber-500 w-64 text-center font-bold">
                    Background Worker
                    <div className="text-[10px] font-normal mt-2 opacity-80">
                        Node Positioning: Gemini 3.5 Flash<br/>
                        Root Breakdowns: Gemini 3.1 Pro
                    </div>
                </div>
                <div className="flex-1 h-px bg-amber-500/50 relative border-dashed border-b">
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-zinc-900 text-xs text-amber-500 px-2">Async: Hydrate Metadata</span>
                </div>
                <div className="flex flex-col gap-2 w-48">
                    <div className="bg-zinc-800 p-2 rounded border border-zinc-700 text-xs text-center text-zinc-400">Hydrate Node 1 ⏳</div>
                    <div className="bg-zinc-800 p-2 rounded border border-zinc-700 text-xs text-center text-zinc-400">Hydrate Node 2 ⏳</div>
                </div>
            </div>
        </div>
    </div>
);



const DataLifecycleMatrix: React.FC = () => (
    <div className="w-full py-8 px-6 bg-zinc-950/50 rounded-xl border border-zinc-800 mb-12">
        <h3 className="text-zinc-200 font-medium text-lg mb-6 uppercase tracking-wider">Data Lifecycle Matrix</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Tier 1 */}
            <div className="bg-zinc-900 border border-zinc-700 p-5 rounded-xl">
                <div className="flex items-center gap-2 mb-3">
                    <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                    <div className="text-blue-400 font-bold text-xs uppercase tracking-wider">Tier 1: Global Assets</div>
                </div>
                <div className="text-zinc-500 text-xs mb-4 uppercase">artists / labels</div>
                <div className="space-y-2 text-sm">
                    <div className="flex justify-between border-b border-zinc-800 pb-2"><span className="text-zinc-400">createdAt</span><span className="text-white">Immutable</span></div>
                    <div className="flex justify-between border-b border-zinc-800 pb-2"><span className="text-zinc-400">updatedAt</span><span className="text-green-400">Mutable</span></div>
                    <div className="flex justify-between border-b border-zinc-800 pb-2"><span className="text-zinc-400">expireAt</span><span className="text-zinc-600">NULL (No TTL)</span></div>
                    <div className="flex justify-between"><span className="text-zinc-400">cachedAt</span><span className="text-red-500 line-through">Eradicated</span></div>
                </div>
                <div className="mt-4 text-xs text-zinc-500 leading-relaxed">
                    Canonical source of truth. Scraped/Generated via Gemini + Google Search.
                </div>
            </div>

            {/* Tier 2 */}
            <div className="bg-zinc-900 border border-zinc-700 p-5 rounded-xl">
                <div className="flex items-center gap-2 mb-3">
                    <div className="w-2 h-2 rounded-full bg-purple-500"></div>
                    <div className="text-purple-400 font-bold text-xs uppercase tracking-wider">Tier 2: Ephemeral</div>
                </div>
                <div className="text-zinc-500 text-xs mb-4 uppercase">sharedZcenes</div>
                <div className="space-y-2 text-sm">
                    <div className="flex justify-between border-b border-zinc-800 pb-2"><span className="text-zinc-400">createdAt</span><span className="text-white">Immutable</span></div>
                    <div className="flex justify-between border-b border-zinc-800 pb-2"><span className="text-zinc-400">updatedAt</span><span className="text-zinc-600">NULL (Read-Only)</span></div>
                    <div className="flex justify-between border-b border-zinc-800 pb-2"><span className="text-zinc-400">expireAt</span><span className="text-orange-400">+30 Days Hard TTL</span></div>
                    <div className="flex justify-between"><span className="text-zinc-400">cachedAt</span><span className="text-red-500 line-through">Eradicated</span></div>
                </div>
                <div className="mt-4 text-xs text-zinc-500 leading-relaxed">
                    Frozen snapshots generated for sharing. Coordinates stripped (Amnesia).
                </div>
            </div>

            {/* Tier 3 */}
            <div className="bg-zinc-900 border border-zinc-700 p-5 rounded-xl">
                <div className="flex items-center gap-2 mb-3">
                    <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                    <div className="text-emerald-400 font-bold text-xs uppercase tracking-wider">Tier 3: Owned</div>
                </div>
                <div className="text-zinc-500 text-xs mb-4 uppercase">users/uid/projects</div>
                <div className="space-y-2 text-sm">
                    <div className="flex justify-between border-b border-zinc-800 pb-2"><span className="text-zinc-400">createdAt</span><span className="text-white">Immutable</span></div>
                    <div className="flex justify-between border-b border-zinc-800 pb-2"><span className="text-zinc-400">updatedAt</span><span className="text-green-400">Mutable</span></div>
                    <div className="flex justify-between border-b border-zinc-800 pb-2"><span className="text-zinc-400">expireAt</span><span className="text-zinc-600">NULL (No TTL)</span></div>
                    <div className="flex justify-between"><span className="text-zinc-400">cachedAt</span><span className="text-red-500 line-through">Eradicated</span></div>
                </div>
                <div className="mt-4 text-xs text-zinc-500 leading-relaxed">
                    User-controlled topologies. Preserves fixed coordinate memory.
                </div>
            </div>
        </div>
    </div>
);

const GatekeeperFlowchart: React.FC = () => (
    <div className="bg-zinc-900/30 p-8 rounded-xl border border-zinc-700/50 mb-12">
        <h3 className="text-zinc-200 font-medium text-lg mb-6 uppercase tracking-wider text-center">Fail-Fast iTunes Image Gatekeeper</h3>
        <div className="flex flex-col items-center gap-4">
            <div className="bg-zinc-800 px-6 py-2 rounded-full border border-zinc-600 text-zinc-200">Image Requested</div>
            <span className="material-symbols-outlined text-zinc-500">arrow_downward</span>
            
            <div className="flex flex-col md:flex-row gap-12 items-start w-full justify-center">
                <div className="flex flex-col items-center gap-3 w-48">
                    <div className="bg-blue-500/10 border border-blue-500/30 text-blue-400 p-3 rounded w-full text-center text-sm font-bold">
                        Primary: iTunes API
                    </div>
                    <span className="material-symbols-outlined text-green-500">check_circle</span>
                    <div className="bg-green-500/10 border border-green-500/30 text-green-400 p-2 rounded w-full text-center text-xs">
                        Valid Artwork? Lock & Cache
                    </div>
                </div>

                <div className="flex flex-col items-center gap-3 w-48">
                    <div className="bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 p-3 rounded w-full text-center text-sm font-bold">
                        Secondary: Google Search
                    </div>
                    <span className="material-symbols-outlined text-red-500">cancel</span>
                    <div className="bg-red-500/10 border border-red-500/30 text-red-400 p-2 rounded w-full text-center text-xs">
                        404 / Invalid? Discard to Null
                    </div>
                </div>
            </div>
        </div>
    </div>
);

const RunbookAccordion: React.FC = () => {
    const [isOpen, setIsOpen] = useState(false);
    return (
        <div className="bg-zinc-900/30 rounded-xl border border-zinc-700/50 mb-12 overflow-hidden">
            <button 
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center justify-between p-6 bg-zinc-900/50 hover:bg-zinc-800/50 transition-colors text-left"
            >
                <div className="flex items-center gap-3 text-zinc-200 font-medium text-lg uppercase tracking-wider">
                    <Terminal className="w-5 h-5 text-primary" />
                    Runbooks & Automation
                </div>
                {isOpen ? <ChevronDown className="w-5 h-5 text-zinc-400" /> : <ChevronRight className="w-5 h-5 text-zinc-400" />}
            </button>
            {isOpen && (
                <div className="p-8 border-t border-zinc-700/50">
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
        { id: 'runbooks', title: 'Runbooks & Automation' },
        { id: 'data-lifecycle', title: 'Data Lifecycle Matrix' },
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
        { id: 'custom-svg-integration', title: 'Custom SVG Integration Pipeline' },
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
                        <AsyncHydrationDiagram />
                    </section>

                    {/* ── RUNBOOKS ── */}
                    <section id="runbooks">
                        <h2 className="text-3xl font-medium text-white tracking-tight border-b-2 border-primary/50 pb-2 mb-8 mt-12">Runbooks & Automation</h2>
                        <RunbookAccordion />
                    </section>

                    {/* ── GRAPH INTELLIGENCE ── */}
                    <section id="graph-intelligence">
                        <h2 className="text-3xl font-medium text-white tracking-tight border-b-2 border-primary/50 pb-2 mb-8 mt-12">Graph Intelligence</h2>
                        <CodeBlock title="Core Curation Engine" content={`
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
   - Temporal Isolation (v4): The prompt architecture strictly enforces period-accurate temporal isolation by excluding explicit token-biasing band examples (e.g., Snapcase) that previously caused generation leakage. Native googleSearch grounding tools and external SERP queries (Google Custom Search API) have been fully stripped from the Cloud Run proxy and Firebase Cloud Functions to eradicate Search Grounding surcharges (dropping cost from ~£4.30+ to ~$0.15 / £0.12 – £0.48 per 40-node generation) and eliminate third-party API dependencies (avoiding $5/1K query costs and 400 Bad Request errors). Entity hydration now relies strictly on Gemini 3.5 Flash's parametric memory.
   - Chunked Concurrent Backend Hydration: Curation details (biographies, genres, origins,
     formed years, member lists, and image URLs) for ALL node types are resolved via a
     chunked Promise.all() execution model on the backend. Nodes are batched into groups
     of 5 and processed concurrently, reducing the per-job wall time from ~20 minutes
     to approximately 3 minutes. This pipeline integrates real-time YouTube scraping
     and status check routines and covers primary AI artist nodes, record labels, and
     previously-unhydrated untyped deep cut nodes in a single unified pass.
   - iTunes Fast-Path & Taxonomic Confidence Validation: The image scraper bypasses
     LLM hallucination by querying the iTunes API for \`entity=musicArtist\`. It enforces a deterministic
     punctuation-agnostic exact match on the artist name, and disambiguates homonyms using a
     normalized taxonomic dictionary (see ITUNES_SCRAPER_DOCUMENTATION) to validate niche
     subgenres against Apple's broad primary categories.
   - Organic Deep-Cut Range Targeting: The LLM graph generator prompt is explicitly configured
     to aim for a rich spiderweb density (18 to 21 organic related artists). However, the model is
     given explicit natural flexibility to scale this number down if a smaller musical scene calls
     for fewer genuine connections, completely avoiding padding just to hit an arbitrary quota.
   - Universal Node Type Filter: Only nodes explicitly typed as 'label' are routed to
     /labels/{labelSlug}. All other nodes (including nodes with no type property, which
     represent untyped deep cuts) are treated as artists and hydrated via /artists/{id}.
     This universal filter is the authoritative safeguard against the legacy regression
     where untyped deep cuts were silently skipped during background hydration.
   - Strict Entity Disambiguation & Contextual Anchoring: Node details fetches (fetchNodeDetails) strictly 
     incorporate the original seed artists (Ecosystem Anchors) and strongly-typed context edges (e.g., Genres, 
     Labels, connected Artists) directly into the LLM prompt. This forces the model to synthesize period-accurate 
     biographies utilizing its parametric memory, completely eliminating historical homonym collisions where obscure 
     local bands were previously conflated with identically-named legacy acts from different eras and genres.
   - Orphaned Link Mitigation (geminiService.ts): Filters the AI response to 
     ensure every link's 'source' and 'target' corresponds to a validated node ID.
   - Client detailsCache callback: The UI remains locked until the Background Worker completes this atomic hydration block. Once the project status hits 'completed', the frontend natively pipes the 100% self-contained details payload into memory, guaranteeing instant offline O(1) resolution for every node on the board.

5. VERBAL IDENTITY & CONTEXTUAL TOOLTIPS (THE "2 AM RECORD CURATOR"):
   Zcene features a bespoke narrative layer powered by our custom "2 AM Record Curator" AI persona. 
   Instead of just pulling encyclopedic facts, Zcene dynamically writes a cohesive essay explaining the 
   specific musical DNA connecting the web. 
   - Contextual Tooltips: Spiderweb hover states are natively powered by this intelligence. Hovering over a band 
     won't just tell you *who* they are, but *why* they were pulled into this specific ecosystem, 
     delivering a punchy 1-sentence "epicenter hook" drawn directly from the curator's analysis.
   - Fallback Logic: The UI prioritizes these generated \`narrativeSnippet\` hooks, falling back to 
     the global encyclopedic \`summary\` only if necessary.

5. GLOBAL CACHE ALIGNMENT & PROACTIVE 'DEEP CACHE' STRATEGY (artistCacheService.ts / App.tsx):
   Before invoking Gemini for Phase 02 Orchestration, the engine computes a 
   normalized single-artist ID (using Unicode NFD accent-stripping and hyphen replacement) 
   and probes the global 'artists' collection concurrently for all seeds.
   - Cache Merge & Image Immutability Rule: Background revalidation processes ('triggerBackgroundRevalidation') 
     MUST perform a safe merge when updating cache payloads. They are strictly forbidden from overwriting or clearing 
     existing canonical 'imageUrl' properties in 'detailsCache' or global Firestore documents. This ensures that 
     highly accurate artwork resolved during initial graph hydration (e.g. from Spotify) is permanently protected 
     against subsequent generic Google Image Search hits.
   - Cache HIT: Graph structure + Deep Cut metadata are returned instantly. 
     Phases 02 and 03 are bypassed entirely. D3 Phase 04 begins immediately, 
     and the D3 simulation is explicitly masked by the global loading curtain.
     The curtain only drops once the network has fully settled and the canvas
     dynamically calculates its bounding box to snap into a perfectly framed view.
     Returning to a saved Zcene guarantees a completely unfocused, centered, and 
     unobstructed view with the workspace controls elegantly tucked away.
   - Proactive Deep Cache: Upon generating a graph, the Background Worker proactively 
     hydrates and bundles full profile details (biographies, YouTube IDs, discographies) 
     for both the seeds and all recommended peer bands. The UI remains locked until this atomic 
     hydration block is complete, ensuring a 100% self-contained payload that loads instantly offline.
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
   - Dynamic Bounding Box Framing: On initialization and when manually centering, the graph calculates the precise physical boundaries (minX, maxX, minY, maxY) of the settled network. It dynamically scales and translates the camera to perfectly frame the graph based on the device viewport, replacing all legacy static zoom scales.
   - Simulation Masking (The Loading Curtain): The global loading state explicitly masks the D3 physics simulation. It is strictly synchronized with the simulation lifecycle via a React-to-D3 state bridge, only unmounting after the physics engine reaches its '.on("end")' event and the bounding box is framed.
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
   - Expanded Hit-Box Architecture: Nodes implement an invisible, expanded bounding circle 
     (pointer-events="all", fill="transparent") behind the visual symbols. This decouples 
     the interactive touch/hover target area from the aesthetic visual radius, significantly 
     improving usability and click forgiveness on mobile devices without cluttering the UI.

7. UNIFIED PROJECT CONTEXT, ACTIVE NODES SYNCHRONIZATION & STATE-LOADING (App.tsx / GraphPage.tsx):
   Zcene enforces a single, unified project state that orchestrates project identity
   and curation status to eliminate loading jitter and flickering.
   - Synchronous Pre-population: Project identity (seedArtists, projectName, status, and activeJobId)
     is synchronously pre-populated from the local dashboard 'projects' list during routing,
     preventing the header from briefly clearing or flickering.
   - Clean Slate Mounts: Returning to a completed project now guarantees a completely unfocused 
     and centered state. No default selection is imposed on mount, providing an unobstructed, 
     unbiased view of the network until the user explicitly interacts with a node.
   - O(1) Cold-Start Database Hydration: Synchronous state mutations (setGraphData) have been removed from the generation and cache-hit pipelines for authenticated users. The pipeline strictly writes the generated graph and active nodes to the minted Project Document in Firestore, relying entirely on the onSnapshot listener to organically hydrate the frontend React state.
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
   - Target System Architecture Boundaries:
     * Single Seed (Unfiltered): Use the canonical, pre-calculated Spiderweb cached globally on the artist's Firestore document.
     * Custom Spiderwebs (Multi-Seed OR Filtered): Trigger a brand-new, project-specific Spiderweb via Gemini 3.1 Pro. The LLM discovers novel intermediate bridge nodes.
     * Isolation (Phase 4 Sandbox Guard): Custom Spiderwebs strictly bypass the writeArtistCacheMany routine (for both initial generation and network extension). They belong only to the specific project (/projects/{id}) and NEVER write to or overwrite global single-artist graph documents, protecting the master network from topology pollution.
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
    - Step 0 (Upfront Project Minting): Immediately upon generation start, a new Project ID is minted and the user is routed to /z/:id.
    - Step 1 (Cache Interrogation): searchDisambiguationCandidates() queries global /artists.
    - Step 2 (Token Guard): If API synthesis is required, the API Token Authorization Modal is displayed BEFORE any AI validation.
    - Step 3 (Human-in-the-Loop Checkpoint):
      - 1 cache hit -> "Look What I Found" modal. Clicking card accepts candidate.
        Escape: "None of these" -> Validate Origin.
      - >1 cache hits -> "Disambiguation" modal. Clicking card accepts candidate.
        Escape: "None of these" -> Validate Origin.
    - Step 4 (Flash AI Validation): "Validate Origin" modal resolves ambiguity. Clicking candidate accepts it.
      - Negative AI Constraints: Rejected candidates from the cache hit are sent to resolveArtistCandidatesViaAI to ensure the live model strictly excludes them from its regional variance suggestions.
      - Back Escape Route: If the user presses "Back" in the Token Quota Warning or Validate Origin modals, the state machine triggers an 'i--; continue;' loop-reset to cleanly restore the original cache hit modal without data pollution.
      STAGE 0 packages rejected card metadata into a negative constraint hint for Gemini 3.1 Pro.
      handleGenerateGraph re-invokes with skipCacheLookup = true, bypassDisambiguation = true,
      and bypassTokenConfirmation = true. The decoupled guard skips STAGE 0 re-entry, and dispatches generateGraphDataViaCloudJob with disambiguationHints
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
    all region concatenation logic now utilises '.endsWith()' deduplication checks. This ensures that countryNorm
    suffixes are never double-appended during frontend cache lookups, backend curation, or cache hydration loops.
    Furthermore, frontend detail batch-hydration (App.tsx) explicitly uses extractCountrySlug rather than standard 
    normalization to robustly compute canonical keys, ensuring that nodes with non-standard country suffixes are 
    properly resolved without proxy routing loops. This mirrors the backend's pre-computed idRewriteMap which rewrites
    all graph topology IDs to their canonical forms before subgraph extraction.

    Token Quota Modal Immediate-Close Contract (Sprint Fix):
    The Token Quota Warning modal MUST call setTokenConfirmation(null) synchronously within the onConfirm handler
    in App.tsx BEFORE the pipeline re-invocation. This guarantees the modal unmounts immediately on confirm and does
    not linger while the subsequent Validate Origin modal (or canvas) is mounting. Any implementation that relies
    on the modal closing via a downstream state flush (e.g., a resolved Promise) is strictly forbidden, as it
    produces a stale overlay that the user must manually dismiss.

    Redirect Pointer Immunity (Split-Brain Remediation, Sprint Fix):
    The hydration loop slug-dedup query in processCurationJob.ts iterates docs whose artistId starts with the seed
    slug. Orphaned alias stubs created by Fix E carry a redirectTo field pointing to the canonical document. The
    dedup loop MUST include the guard 'if (snapData.redirectTo) continue;' to skip these pointer documents.
    Without this guard the loop incorrectly adopts the redirect pointer as the canonical ID, causing a failed
    detailsCache lookup, an unnecessary external API call, and ultimately an empty graphData write timeout —
    re-introducing the original cache persistence failure. See Immutable Law §10 in architecture_truth.md.

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
      pills, toasts, and project titles. Clipboard Quick-Copy Consistency: The Deep Cut quick-copy 
      action strictly relies on this formatted output to write clean, title-cased strings (e.g., "Militarie Gun") 
      to the user's clipboard rather than exposing internal database slugs.

13. LOCAL DEVELOPMENT ENVIRONMENT & PROXY RESOLUTION:
    - Synchronised Startup Sequence (concurrently): The development environment uses 'concurrently' to boot the
      Node.js Express backend and the Vite dev server simultaneously in a single terminal process. This strictly
      prevents race conditions where Vite's proxy attempts to forward requests (e.g., /api/label/) to a backend
      that hasn't fully bound to its port yet, eliminating terminal ECONNREFUSED spam on mount.

14. DETERMINISTIC INSTANT AI & DEEP CONNECTIONS:
    - Instead of open-ended regex routing, the free Instant AI mode operates on a strictly structured query chip architecture.
    - Graph Proximity Synthesis: Connection query chips evaluate peer relationships by traversing exact graph edges in a prioritized strict hierarchy (Mutual Labels > Shared Genres > Explicit Topological Links > Broad Geographic Origins). This synthesizes intelligent relational context locally without incurring external LLM inference costs.
    - Component-Bound State Isolation: Critical chat states such as \`chatLoadingMap\`, spent \`clickedChips\`, and dynamic node dropdown lists are firmly isolated per \`NodeDetailsCard\`. This ensures perfectly decoupled, simultaneous multi-node investigations without cross-panel layout bleeding or "phantom reflows".
    - Interactive Select UI: Dynamic queries utilize a styled native \`<select>\` dropdown masked as a standard query chip, allowing users to intuitively cross-examine any graph peer directly from their active context window.

15. NETWORK STREAMING & DECOMPRESSION FIX:
    - The browser fetch for Live AI generation was aborting precisely due to 'ERR_CONTENT_DECODING_FAILED'.
    - Root Cause: The local proxy (server.js) or Node fetch client was aggressively compressing streams without properly syncing headers.
    - Fix: We implemented explicit header sanitization in the proxy middleware by stripping 'accept-encoding' and 'content-length' before forwarding requests to the Gemini API, ensuring clean decompression of chunked streams.

16. STRICT UI DIALOG ARCHITECTURE:
    - SharedModals.tsx previously contained inline, unstandardized HTML for modals that drifted from our design spec.
    - Fix: We extracted the mandatory dialog primitives into components/ui/Dialog.tsx (ModalBackdrop, ModalContainer, ModalHeader, ModalBody, ModalFooter).
    - Rule: All future modals must strictly import and compose these primitives to maintain the rigid 0px border-radius, background darkness, and animate-fade-in-down timing, acting as the Single Source of Truth.

17. LIBRARY IMPORT & GRAPH PERSISTENCE:
    - Library Upload parsing strictly supports Apple Music XML and raw CSV formats natively in the browser without backend preprocessing.
    - Graph Synthesis: During parsing, the engine dynamically constructs a secondary 'libraryBaseGraph' by creating nodes for the imported artist, their extracted genres, and linking them together. This ensures native spiderweb metadata (like 'acoustic-punk' genres) is preserved directly from the user's iTunes database.
    - Sanitization: XML genre fields containing multiple comma-separated or slash-separated values are split into individual genre nodes, while discarding pure numeric metadata anomalies.
    - Persistent Storage: Upon successful import, both the raw 'libraryArtists' array and the compiled 'libraryBaseGraph' are stringified and written to the authenticated user's root document in Firestore. This guarantees that multi-genre filtering capabilities inside the Library Modal persist safely across browser reloads.
    
    18. FALLBACK HYDRATION & isLibrary FLAG:
    - The 'isLibrary: true' flag is hardcoded in the frontend (App.tsx -> handleNodeClick) for *every* node that is loaded or generated locally from the cache during an on-demand fallback.
    - It is NOT exclusively tied to the Apple Music XML import process.
    - If the backend curation job bypasses a seed node, the frontend is forced to generate the data on-demand and stamp it with 'isLibrary: true'. This must be understood when debugging hydration bypasses to avoid misidentifying the source of the flag.

19. TOPOLOGICAL RECONCILIATION & EXECUTION PHASE TIMING:
    - Topological Reconciliation (resolving LLM geographic hallucinated links in the backend pipeline) MUST strictly occur AFTER all node and link IDs are fully canonicalized by the 'idRewriteMap'.
    - If geographic routing or link traversal is executed before the graph state is unified (i.e. before the Link ID normalization block), the engine will suffer from Phase-Timing Mismatches (e.g. attempting to match a canonical node ID like 'slam-coke-de' against an un-normalized link source like 'slam-coke'), resulting in silently orphaned geographic edges.
`} />
                        <DiscoveryFlowDiagram />

                        <section id="data-lifecycle" className="pt-8 scroll-mt-24">
                            <DataLifecycleMatrix />
                        </section>

                    </section>

                    {/* ── VISUALIZATION ENGINE ── */}
                    <section id="visualization-engine">
                        <h2 className="text-3xl font-medium text-white tracking-tight border-b-2 border-primary/50 pb-2 mb-8 mt-12">Visualization Engine</h2>
                        <CodeBlock title="Physics & D3 Constants" content={`
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
`} />
                    </section>

                    {/* ── STICKY PEEK + ACTION GATEWAY ── */}
                    <section id="sticky-peek-gateway">
                        <h2 className="text-3xl font-medium text-white tracking-tight border-b-2 border-primary/50 pb-2 mb-8 mt-12">Sticky Peek + Action Gateway</h2>
                        <CodeBlock title="Interaction Model & State Machine" content={`
Zcene implements a cross-platform 'Sticky Peek + Action Gateway' interaction model to unify hover and click behaviors, eliminate layout jitter, and provide a clutter-free, premium visual aesthetic.

1. STATE 1: THE 'STICKY PEEK' (Primary Interaction):
   - Trigger: Single click (Desktop) or single tap (Mobile touch viewports) on any node.
   - Behavior: Instantly sets active node focus, pins the floating 'Hover Box' (info snippet) banner, and illuminates yellow connection lines (#F6E468 at 0.9 opacity) to all 1st-degree related nodes while locking D3 camera focus. This state persists until the user explicitly clicks/taps the SVG background.
   - Mobile Touch & Line Highlighting: Touch viewports execute synchronous node hover and line highlighting logic on single tap, guaranteeing mobile visual feature parity with desktop hover. To prevent D3 double-click zoom from hijacking rapid second taps on nodes, the native D3 '.on("dblclick.zoom", null)' event is suppressed. Instead, a targeted 'dblclick' listener is applied to the SVG that conditionally triggers zooming only when double-tapping blank background space. Node interactions correctly bypass this to cleanly transition to the Deep Cut tab.
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
`} />
                    </section>

                    {/* ── SHARING FLOW ── */}
                    <section id="sharing-flow">
                        <h2 className="text-3xl font-medium text-white tracking-tight border-b-2 border-primary/50 pb-2 mb-8 mt-12">Collaboration & Sharing Flow</h2>
                        <SharingFlowDiagram />
                        <CodeBlock title="Guest Preview & Project Cloning" content={`
Zcene enables collaborative discovery via project sharing. The flow is 
designed to minimize friction for new users while rewarding existing authors.

1. URL-BASED SHARING:
   Every 'Share' operation generates a unique document ID in the '/sharedZcenes' 
   collection. This ID is directly accessed via path-based routing (/z/{shareId}).
   (The legacy /app?shareId= format has been sunset).

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
   - Universal Base Payload: The application invokes the Universal Serializer 
     to extract a perfect 1:1 base payload of the project and writes it as a 
     BRAND NEW document in the user's personal project collection.
   - Ownership Transfer: The user becomes the full 'Author' of the clone, 
     instantly unlocking all discovery engine features (Spiderweb expansion, 
     Consult AI, and project renaming).

4. COORDINATE AMNESIA & BLACKLIST MUTATION:
   When a user shares a project, we don't rely on a fragile whitelist. Instead, 
   the Universal Serializer extracts a full 1:1 base payload clone. We then 
   apply an aggressive Ephemeral Blacklist Mutation that strictly strips out 
   all rigid coordinate locks (canvasLayout, fx/fy) and injects a 30-day TTL.
   
   This is a deliberate, load-bearing feature. By enforcing spatial amnesia, 
   the guest's D3 engine natively detects the nodes as "new" and organically 
   recalculates the entire layout from scratch. This completely prevents viewport 
   scaling crashes and NaN cascades. 
   > RULE: Never attempt to extract, parse, or save live D3 layout coordinates. 
   > The share payload must be a pure, location-less data clone.

5. DYNAMIC GUEST HYDRATION:
   The Guest routing block (/z/:id) bypasses standard API generation (curation 
   pipelines), as it receives a pre-compiled JSON payload. However, it explicitly 
   and forcefully runs 'batchHydrateDetailsCache(g.nodes)'. 
   > RULE: This fallback is mandatory. It guarantees that if a project is shared 
   > with an empty local cache (e.g., if the author shared the project straight 
   > from their Dashboard without opening it), the guest browser will dynamically 
   > fetch any missing artist bios from Firestore before rendering the UI.
`} />
                        <CodeBlock title="Generation Modifications (Fork vs Overwrite)" content={`
The "Generation Modification Container" handles how Live Synthesis (generating a new graph) impacts the user's project structure. It strictly branches into two distinct paths:

1. "OVERWRITE EXISTING" (In-Place Modification):
   - Definition: Updates the current project container in-place with a freshly synthesized spiderweb graph.
   - Mechanism: Sets \`isRegeneration = true\`.
   - Identity Lock: This acts as a strict write-lock on the project's identity. The existing Project ID (URL) and Project Name are strictly preserved.
   - Curation Intercept Guardrail: To prevent infinite modal loops, the UI's ProjectLoader entirely ignores incoming Firebase snapshots while the project status is \`curating\`, patiently waiting for the \`completed\` status from the background worker.

2. "SAVE AS NEW ZCENE" (Fork):
   - Definition: Forks the current context into a brand new container, preserving the original project untouched.
   - Mechanism: Sets \`isRegeneration = false\`.
   - Identity Generation: Automatically derives a fresh project name based on the selected artists, and mints a bespoke Project ID (URL) for independent sharing and exploration.
`} />
                    </section>

                    {/* ── SYSTEM RESILIENCE ── */}
                    <section id="system-resilience">
                        <h2 className="text-3xl font-medium text-white tracking-tight border-b-2 border-primary/50 pb-2 mb-8 mt-12">System Resilience</h2>
                        <GatekeeperFlowchart />
                        
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
                            <h3 className="text-zinc-200 font-medium text-lg mb-6 uppercase tracking-wider">Global Toast Notifications</h3>
                            <p className="text-zinc-400 text-sm leading-relaxed mb-4">
                                Global toasts are top-anchored, dismissible notifications used to inform users of critical errors and necessary confirmations. To prevent user fatigue and UI obstruction, redundant background logs have been purged in favor of direct, user-actionable feedback.
                            </p>
                            <Table headers={["Original Message", "Translated Curator Message", "Target Component"]}>
                                {Object.entries(TOAST_MAPPING_RULES).map(([raw, final], idx) => (
                                    <tr key={idx} className="hover:bg-zinc-900/10 transition-colors border-b border-zinc-900/30">
                                        <td className="py-4 px-6 text-xs text-zinc-500 font-mono break-all">{raw}</td>
                                        <td className="py-4 px-6 text-xs text-zinc-200 italic leading-relaxed">"{final}"</td>
                                        <td className="py-4 px-6 text-xs">
                                            <span className="inline-block px-2.5 py-0.5 rounded-full text-[9px] font-semibold tracking-wide uppercase border text-primary bg-primary/10 border-primary/20">
                                                Global Toast
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
                        <CodeBlock title="Quick Heal (Force Refresh) — Access Control & Eviction Logic" content={`
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
`} />
                    </section>

                    {/* ── STATE RESILIENCY & TOKEN SAFETY ── */}
                    <section id="state-resiliency">
                        <h2 className="text-3xl font-medium text-white tracking-tight border-b-2 border-primary/50 pb-2 mb-8 mt-12">State Resiliency, Caching, & Token Safety</h2>
                        <CodeBlock title="Diagnostic Manual & Pipeline Rules" content={`
Zcene implements a strict Token Safety Contract and a dual-pipeline architecture 
to manage Deep Cut metadata healing and graph topology caching.

1. THE HUMAN-IN-THE-LOOP TOKEN SAFETY CONTRACT (MANDATORY):
   - Zero Unprompted Calls: Passive project loads, graph navigation, and node selection 
     must NEVER trigger unprompted backend API calls.
   - Suppressed Auto-Fetching: If the system detects a stale, corrupt, or missing cache entry 
     during passive exploration, it MUST NOT auto-fetch data from the backend. 
   - Manual Curation UI: Instead, the UI explicitly exposes the missing/corrupt state (e.g. 
     via 'checkIsProfileStaleOrCorrupt'). The user must explicitly click the 
     "Profile Missing: Click to Curate" CTA button in the DetailsPanel to manually approve 
     the token expenditure and heal the cache.

2. PIPELINE DUALITY (CLIENT VS. QUEUE):
   - Single-Node Deep Cut Healing / Admin Force Refresh:
     * Flow: 'handleRefreshNode' -> Client-side Gemini execution ('fetchNodeDetails') -> Direct Firestore 'setDoc'.
     * Why: Single-node curation requires immediate, synchronous UI feedback. Executing 
       natively on the client allows the UI to instantly transition from the Token Quota 
       Warning to the loading spinner, and immediately render the fresh Deep Cut upon resolution.
   - Multi-Seed Project Graph Generation:
     * Flow: 'createCurationJob' -> Firebase Cloud Function queue ('onCurationJobCreated') -> 'artists' global cache write.
     * Why: Generating a heavy multi-seed topology involves cross-referencing massive amounts 
       of overlapping artist data, which exceeds safe browser execution timeframes. Offloading 
       this to a gen2 Cloud Function ensures the client does not hang or timeout.

3. CACHE VALIDATION & EXCEPTION CONTRACTS:
   - Synthesis Rationale Contract: Every cached multi-seed graph document MUST contain a 
     'synthesisRationale' (Roots Breakdown). Missing this field invalidates the cache via 
     'validateCacheEntry'.
   - Single-Seed Exception: Single-seed projects inherently have no overlapping roots to synthesize. 
     They intentionally use a structural fallback string ("[Single-Seed Analysis]...") which is 
     explicitly permitted by 'validateRootsBreakdown'. This is NOT a broken stub and must 
     never be flagged for healing.
   - Pruning Rules: To maintain payload efficiency, 'onCurationJobCreated' aggressively strips 
     dead fields (e.g., 'hitCount' and redundant root 'synthesisRationale' keys) and prunes explicit 
     'null' properties (e.g., 'youtubeVideoId: null') before writing to Firestore.

4. TROUBLESHOOTING & DIAGNOSTIC MATRIX:
   | Symptom / Action | Expected Behavior & Flow | Root Cause Check (File/Function) |
   | :--- | :--- | :--- |
   | Deep cut missing origin/genre | Node is flagged as incomplete. DetailsPanel renders the "Profile Missing: Click to Curate" CTA. | App.tsx: checkIsProfileStaleOrCorrupt |
   | User clicks "Click to Curate" | App prompts Token Warning. If confirmed, 'handleRefreshNode' evicts cache. UI reverts to "Generate Deep Cut". | App.tsx: handleRefreshNode |
   | Admin clicks "Force Refresh" | Identical flow to above. Token Warning -> Eviction -> "Generate Deep Cut". | App.tsx: handleRefreshNode |
   | User clicks "Generate Deep Cut" | Client calls Gemini natively. Spinner runs. Fresh payload is written to Firestore. | App.tsx: handleGenerateDeepCut, fetchNodeDetails |
   | Single-seed shows fallback rationale | Valid behavior. 'validateRootsBreakdown' explicitly permits the fallback string. | App.tsx: validateRootsBreakdown |
   | Infinite loading spinner on graph | Usually a topology/cache mismatch. Check if a new required UI field is missing from the validation gate. | App.tsx: validateCacheEntry |
`} />
                    </section>

                    {/* ── LOCALIZED LOADING ── */}
                    <section id="localized-loading">
                        <h2 className="text-3xl font-medium text-white tracking-tight border-b-2 border-primary/50 pb-2 mb-8 mt-12">Localized Loading UX Pattern</h2>
                        <CodeBlock title="Card-Level Spinner — Implementation & Anti-Pattern" content={`
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
`} />
                    </section>

                    {/* ── PHYSICS STABILIZATION ── */}
                    <section id="physics-stabilization">
                        <h2 className="text-3xl font-medium text-white tracking-tight border-b-2 border-primary/50 pb-2 mb-8 mt-12">Physics Stabilization</h2>
                        <CodeBlock title="D3 Jitter Prevention & Governing Rules" content={`
Zcene's D3.js physics engine is intentionally stabilized to prevent jitter and positional snaps.
This section documents the specific anti-patterns and stabilization layers that guarantee a smooth Spiderweb experience.

1. THE LIVE COORDINATE HANDSHAKE (MusicGraph.tsx):
   - Problem: When the background Firestore sync downloaded fresh graphData JSON (e.g. after a deep cut curation finished), App.tsx passed these newly parsed nodes down to MusicGraph. D3 would accept these nodes and overwrite its live, high-framerate physics coordinates with the 3-5 second old stale JSON coordinates, causing nodes to violently "Time-travel Snap" back to their old positions.
   - Fix: Right before calling simulation.nodes(visibleNodes), the engine performs a Live Coordinate Handshake. It reads the live momentum and position (x, y, vx, vy, fx, fy) from the active simulation and maps them. It then iterates over the incoming JSON visibleNodes and overwrites their stale coordinates with the live physics data. This allows network updates to seamlessly inject into the web without disturbing active nodes.

2. SELECTION LIFECYCLE & RESTART DECOUPLING (MusicGraph.tsx):
   - Problem: Previously, mutating the active node list (even just selecting an already existing node) triggered a high-energy simulation.alpha(1.0).restart(). This blast caused the physics gravity well to violently drag the unpinned node toward the center of the screen, pulling the Spring Camera with it and causing a visual "jump".
   - Fix: The simulation restart is decoupled. A prevVisibleNodesLengthRef tracks the physical structure of the web. The simulation now only fires a 1.0 high-energy restart if nodes are added or removed. If a node is merely selected (a metadata/CSS change), the graph uses a gentle alpha(0.2) wake. Pinned coordinates are respected, and the camera glides smoothly.

3. CLEAN SLATE MOUNTS & SELECTION REVERSION (App.tsx):
   - Problem: The legacy Re-hydration Hook automatically reverted the selection to the Seed Artist on load or if the selection became null.
   - Fix: The Re-hydration hooks have been completely stripped of auto-selection logic. Returning to a saved Zcene now guarantees a completely unfocused, centered, and unobstructed view. The panel gracefully remains closed until explicitly invoked.

4. LOCKED SEMANTIC TOPOLOGY & AI PHYSICS INJECTION (MusicGraph.tsx):
   - Problem: D3 natively allowed users to drag nodes around the canvas. On mobile devices, this conflicted heavily with canvas panning. Furthermore, manually dragging nodes broke the intelligent semantic clustering just generated by the AI model.
   - Fix: The D3 .drag() behaviors and dragEndTimeRef interceptors have been completely removed. The graph is now a Locked Semantic Topology. Users can pan and zoom freely across mobile without accidentally tearing the web apart.
   - AI Injection: The D3 layout is strictly driven by the 'Final Node Positioning' step in the background worker. Gemini 3.5 Flash generates float weights (0.1 to 1.0) for every link, dictating variable link distance, spring rigidity, and collision radii. The physics engine translates these AI weights into semantic clusters.

5. ALPHA VALUES (Reference):
   - Structural Layout Change (Length Delta): alpha(1.0) — high energy wake
   - Metadata Selection Change: alpha(0.2) — gentle wake, respects pins
   - Initial layout: alpha(0.15) — approachable initialization
   - Tab re-activation: alpha(0.3) — moderate re-energization
   - alphaDecay(0.1) and alphaMin(0.01) ensure the sim halts quickly
`} />
                    </section>

                    {/* ── COST ESTIMATION ── */}
                    <section id="cost-estimation">
                        <h2 className="text-3xl font-medium text-white tracking-tight border-b-2 border-primary/50 pb-2 mb-8 mt-12">Cost Estimation Architecture</h2>
                        <CodeBlock title="Ledger Rules & Caching Strategy" content={`
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
`} />
                    </section>

                    {/* ── DASHBOARD CRATE SIZING ── */}
                    <section id="crate-sizing-rules">
                        <h2 className="text-3xl font-medium text-white tracking-tight border-b-2 border-primary/50 pb-2 mb-8 mt-12">Dashboard Crate Sizing</h2>
                        <CodeBlock title="Crate Sizing Rules & Layout Guidelines" content={`
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
`} />
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
                        <CodeBlock title="Lexical Hardening & Persona" content={`
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
`} />
                        <CodeBlock title="Image Pipeline & Rendering Rules" content={`
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
`} />
                        <CodeBlock title="Fetch Details Prompt" content={FETCH_NODE_DETAILS_PROMPT_TEMPLATE} />
                        <CodeBlock title="Node Details Schema" content={NODE_DETAILS_SCHEMA} isJson />
                    </section>

                    {/* ── DATA SYNTHESIS & PERSISTENCE ── */}
                    <section id="data-synthesis">
                        <h2 className="text-3xl font-medium text-white tracking-tight border-b-2 border-primary/50 pb-2 mb-8 mt-12">Data Synthesis & Persistence</h2>
                        <CodeBlock title="Architectural Separation: Artists vs. Labels & Simultaneous Pre-Caching" content={`
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
`} />
                        <CodeBlock title="AI Parsing Resilience & Anti-Leakage Defense" content={`
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
`} />
                    </section>

                    {/* ── CUSTOM SVG INTEGRATION PIPELINE ── */}
                    <section id="custom-svg-integration">
                        <h2 className="text-3xl font-medium text-white tracking-tight border-b-2 border-primary/50 pb-2 mb-8 mt-12">Custom SVG Integration Pipeline</h2>

                        <div className="space-y-8">
                            <div className="bg-zinc-900/50 p-6 rounded-xl border border-zinc-800">
                                <h3 className="text-xl font-medium text-primary mb-3">Architectural Rules for External Icons</h3>
                                <p className="text-zinc-300 leading-relaxed mb-6">
                                    When introducing non-Material external brand assets (e.g., Bandcamp, Spotify), they must be sanitized and converted into reusable React components to preserve styling continuity across states.
                                </p>

                                <ul className="space-y-4 text-sm text-zinc-400">
                                    <li className="flex items-start gap-3">
                                        <span className="material-symbols-outlined text-green-500 !text-[18px] mt-0.5">check_circle</span>
                                        <div>
                                            <strong className="text-zinc-200 block mb-1">1. Preserve Original ViewBox</strong>
                                            Drop explicit `width` and `height` properties from the parent `svg` tag, but retain the exact `viewBox` coordinates (e.g., `viewBox="0 0 800 800"`) to prevent distortion.
                                        </div>
                                    </li>
                                    <li className="flex items-start gap-3">
                                        <span className="material-symbols-outlined text-green-500 !text-[18px] mt-0.5">check_circle</span>
                                        <div>
                                            <strong className="text-zinc-200 block mb-1">2. Strip Hardcoded Colors</strong>
                                            Locate all `fill="#XXXXXX"` or `stroke="#XXXXXX"` hex values in paths.
                                        </div>
                                    </li>
                                    <li className="flex items-start gap-3">
                                        <span className="material-symbols-outlined text-green-500 !text-[18px] mt-0.5">check_circle</span>
                                        <div>
                                            <strong className="text-zinc-200 block mb-1">3. Inject Contextual Color</strong>
                                            Replace stripped colors with `fill="currentColor"` or `stroke="currentColor"`. This guarantees the component perfectly respects the parent element's `text-zinc-400` defaults and `hover:text-white` hover states.
                                        </div>
                                    </li>
                                    <li className="flex items-start gap-3">
                                        <span className="material-symbols-outlined text-green-500 !text-[18px] mt-0.5">check_circle</span>
                                        <div>
                                            <strong className="text-zinc-200 block mb-1">4. Component Wrapping</strong>
                                            Wrap the final sanitized `&lt;svg&gt;` markup inside a React functional component inside `components/Icons.tsx` accepting standard `className` props.
                                        </div>
                                    </li>
                                </ul>
                            </div>
                        </div>
                    </section>

                    {/* ── CONVERSATIONAL AI ── */}
                    <section id="conversational-ai">
                        <h2 className="text-3xl font-medium text-white tracking-tight border-b-2 border-primary/50 pb-2 mb-8 mt-12">Conversational Intelligence</h2>
                        <CodeBlock title="Consult AI Logic" content={`
Zcene provides two distinct layers of conversational intelligence: the free, heuristically-driven "Instant AI" and the token-based "Deep Web" live query engine.

--- INSTANT AI (LOCAL HEURISTICS) ---
The Instant AI relies entirely on local graph traversal and deterministic heuristics, requiring zero external API calls:

1. ENTITY PROMPT BRANCHING:
   Query chips dynamically adapt based on entity type. Artists and Record Labels receive completely distinct, context-aware prompt sets.

2. BIO-EXTRACTED SOUND SYNTHESIS (ARTISTS):
   For the artist "sound" prompt, the engine scans the raw biography for musical keywords (e.g., "riffs", "vocals"). It surgically extracts that precise sentence to craft a deeply tailored response. If extraction fails, it falls back to a deterministic template rotation.

3. TWO-SENTENCE LEGACY SYNTHESIS (LABELS):
   For a record label's "legacy" prompt, the engine dynamically splits the biography based on punctuation and extracts the first two sentences, ensuring a punchy, conversational takeaway.

4. UNIVERSAL PLAIN-TEXT FORMATTING:
   Before streaming any Instant AI response, the engine executes a regex cascade to strip all Markdown artifacts (bolding, italics, links) for a pristine UI experience.

--- DEEP WEB AI (LIVE LLM) ---
When users switch to Deep Web queries, the engine enforces strict persona constraints:
- Atmospheric Concision: Responses are capped at 50 words.
- UK English Standardization: Enforces regional spelling.
- Pure Text Gating: Strips all markdown and conversational fillers for maximum information density.
`} />
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
