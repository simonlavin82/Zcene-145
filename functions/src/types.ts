export enum View {
  Home = 'home',
  Dashboard = 'dashboard',
  Graph = 'graph',
  Help = 'help',
  StyleGuide = 'styleguide',
  Engine = 'engine',
  Analytics = 'analytics',
}

export interface Node {
  id: string;
  label?: string;
  type: 'artist' | 'genre' | 'label' | 'country' | 'founded';
  group: number;
  origin?: string;
  isLoading?: boolean;
  isPending?: boolean;
  isSeed?: boolean;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
  narrativeSnippet?: string;
}

export interface Link {
  source: string | Node;
  target: string | Node;
  value: number;
  weight?: number;
  forwardContext?: string;
  inverseContext?: string;
  context?: string;
}

export interface GraphData {
  nodes: Node[];
  links: Link[];
  synthesisRationale?: string;
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  timestamp?: number;
}

export interface NodeDetails {
  _isStub?: boolean;
  summary: string;
  imageUrl?: string;
  details: {
    genre?: string;
    style?: string;
    origin?: string;
    artist?: string;
    founded?: string;
    notableArtists?: string[];
  };
  members?: string[];
  links: Array<{
    site: string;
    url: string | null;
  }>;
  tourInfo?: string;
  discography?: Array<{
    albumName: string;
    releaseYear: string;
  }>;
  recommendationReason?: string;
  youtubeVideoId?: string;
  youtubeSearchQuery?: string;
  groundingLinks?: Array<{
    title: string;
    url: string;
  }>;
  synthesisRationale?: string;
  _isSentinel?: boolean;
}

export interface ParsedArtist {
  name: string;
  dateAdded: Date | null;
}

export interface GraphSettings {
  linkDistance: number; // 1-5 scale
  nodeSize: number; // 1-5 scale
}

export interface StackItem {
  id: string;
  type: string;
  dateSaved: number;
  link?: string;
  discoveredVia?: string;
  docId?: string;
  displayName?: string;
}

/** A lean position reference stored inside a user project's canvasLayout (artist nodes only). */
export interface CanvasNodeRef {
  nodeId: string;
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
}

/**
 * Top-level Firestore 'artists' collection document — per-artist isolated cache entry.
 *
 * STRICT ISOLATION RULE (cacheVersion 4):
 *   - `nodes` contains ONLY the artist's own node plus its direct structural metadata
 *     nodes (genre, label, country, founded).
 *   - `links` contains ONLY the links between this artist and its own metadata nodes.
 *   - Cross-artist session edges (e.g. "End It → Spaced") are NEVER stored here.
 *     They are computed dynamically by the D3 graph state engine at render time.
 */
export interface ArtistCacheEntry {
  artistId?: string;       // Normalized Firestore-safe slug, e.g. "end-it"
  labelId?: string;        // Normalized label slug, e.g. "relapse-records"
  cacheKey?: string;       // Composite cache key
  seedArtists?: string;    // Canonical name as returned by the AI, e.g. "End It"
  seedLabels?: string;
  graphData?: string | null; // Optional for labels (labels do not own graph blobs)
  cacheVersion: number;    // Schema version
  createdAt?: any;         // serverTimestamp()
  updatedAt?: any;         // serverTimestamp()
  hitCount: number;
  detailsCache?: string;   // JSON string or raw text of NodeDetails/bio
  filters?: DiscoveryFilters;
  isDeep?: boolean;
  synthesisRationale?: string;
  // --- Evolved Stub Routing Fields ---
  _isStub?: boolean;
  isAmbiguous?: boolean;
  redirectTo?: string | null;
  candidates?: DisambiguationCandidateStub[];
  /**
   * DATASET INTEGRITY LOCK — Staging → Verified Protocol.
   *
   * Set by the Cloud Function (onCurationJobCreated) to track the write lifecycle
   * of every global /artists/{id} and /labels/{id} document:
   *
   *   'in_progress' — Staging placeholder. Hydration is running on the Cloud Function.
   *                   Clients MUST treat this as a cache miss (isCacheDocumentVerified = false).
   *   'verified'    — Atomic completion seal. All hydration (graphData, detailsCache,
   *                   YouTube, imageUrl) passed schema validation. Safe to serve globally.
   *   'failed'      — Seed validation failed. Document is corrupt. Treat as cache miss.
   *
   * Legacy documents without this field are trusted as verified for backward compatibility.
   * The Cloud Function writes 'in_progress' first, then replaces the entire document
   * atomically with the full payload and 'verified' at the end. No partial state ever
   * reaches 'verified'. See onCurationJobCreated.ts § INTEGRITY LOCK for implementation.
   */
  dataIntegrityStatus?: 'in_progress' | 'verified' | 'failed';
  /** ISO timestamp of when the in_progress staging lock was acquired. Used by
   *  isCacheDocumentVerified to detect stale locks from crashed Cloud Functions (>15 min). */
  integrityLockedAt?: string;
}

export interface DisambiguationCandidateStub {
  id: string;                    // e.g. "darko-us"
  name: string;                  // e.g. "Darko US"
  origin: string;                // e.g. "United States"
  genre: string;                 // e.g. "Deathcore"
  disambiguationSnippet?: string;// e.g. "American deathcore project formed in 2020"
  isVerifiedEntity?: boolean;
}

export interface Project {
  id: string;
  name: string;
  seedArtists: string;
  // --- Phase 1+: per-artist reference fields ---
  /** Array of normalized artist IDs pointing to individual /artists/{id} cache docs. */
  artistIds?: string[];     // e.g. ['buggin', 'end-it', 'spaced']
  /** Array of normalized label IDs pointing to individual /labels/{id} cache docs. */
  labelIds?: string[];      // e.g. ['relapse-records', 'armageddon-label']
  canvasLayout?: string;    // JSON CanvasNodeRef[] — artist positions only
  // --- DEPRECATED (Phase 1): compound cacheKey — kept for backward-compatible reads of old project docs ---
  /** @deprecated Use `artistIds` instead. Retained for backward-compatible hydration of legacy projects. */
  cacheKey?: string;
  // --- LEGACY: full blob fallback for very old project docs ---
  graphData?: string | null;
  detailsCache?: string;    // JSON Map
  // --- Always present ---
  activeNodes: string[];
  pinnedNodes?: string[];
  chatHistories?: string;   // JSON Map
  discoveryFilters?: string; // JSON
  lastViewedStackCount?: number;
  isMagazineViewOpen?: boolean;
  authorId?: string;
  status?: string;
  activeJobId?: string | null;
  coverImage?: string;
  seedImageUrl?: string;
  seedImageUrls?: (string | null)[];
  generationType?: "Root Generation" | "Partial Generation" | "Direct Hit" | "Complex Generation" | string;
  anchorResolution?: AnchorResolutionStatus;
  apiUsage?: Record<string, any>;
  tokensSpent?: number;
  createdAt?: any;
  updatedAt?: any;
}

export interface UserProfile {
  uid?: string;
  email: string;
  displayName?: string | null;
  photoURL?: string | null;
  role?: 'user' | 'admin';
  libraryArtists?: string;
  libraryBaseGraph?: string | null;
  onboardingProgress?: Record<string, boolean>;
  deepCutsOpened?: number;
  pageAuth?: Record<string, any>;
  tokenBalance?: number;
  lifetimeTokensPurchased?: number;
  lifetimeTokensSpent?: number;
  lastTopUpAt?: any;
  createdAt?: any;
  updatedAt?: any;
}

export type TokenTransactionType =
  | 'topup_simulated'
  | 'spend_preflight_lookup'
  | 'spend_direct_hit'
  | 'spend_live_synthesis'
  | 'spend_deep_web'
  | 'refund_pipeline_error';

export interface TokenTransaction {
  id: string;
  uid: string;
  type: TokenTransactionType;
  delta: number;
  balanceAfter: number;
  amountGbp?: number;
  tierId?: 'gbp_5' | 'gbp_10' | 'gbp_15';
  projectId?: string;
  curationSessionId?: string;
  description: string;
  createdAt?: any;
}

export interface CurationSession {
  sessionId: string;
  uid: string;
  expectedProjectCost: 5 | 10;
  initialPreFlightCharged: boolean;
  initialPreFlightCallsUsed: number;
  escapeHatchCallsUsed: number;
  preFlightTokensDeducted: number;
  creditablePreFlightTokens: 0 | 1;
  settlementTokensDeducted: number;
  status: 'preflight' | 'settled' | 'refunded_settlement';
  projectId?: string;
  createdAt?: any;
  updatedAt?: any;
  expireAt?: any;
}

export type AnchorResolutionStatus =
  | "Tier 1 + Tier 2 + Tier 3 (Full Parity)"
  | "Tier 1 + Tier 2 + Tier 3 (Genre Applied; Label Bypassed — Narrative Gravity Only)"
  | "Tier 1 + Tier 2 + Tier 3 (Label Applied; Genre Bypassed — Narrative Gravity Only)"
  | "Tier 1 + Tier 2 Applied (Tier 3 bypassed due to boundary conflict)"
  | "Tier 1 + Tier 2 Applied"
  | "Tier 1 + Tier 3 Applied"
  | "Tier 1 + Tier 3 (Genre Applied; Label Bypassed — Narrative Gravity Only)"
  | "Tier 1 + Tier 3 (Label Applied; Genre Bypassed — Narrative Gravity Only)"
  | "Tier 1 Only (Tier 3 bypassed)"
  | "Tier 1 Only";

export interface DiscoveryFilters {
  // Level 2: Hard Spatial & Temporal Guardrails
  foundedAfter?: number;
  foundedBefore?: number;
  includeOrigins?: string[];
  excludeOrigins?: string[];
  // Level 3: Soft Scene Gravity
  includeGenres?: string[];
  anchorLabels?: string[];
}

export const ERA_MIN_BOUND = 1965;

/**
 * Rolling Scene Maturity Buffer (N - 2):
 * Emerging bands formed in the most recent 1-2 years lack mature scene footprint,
 * iTunes/YouTube hydration metadata, and parametric LLM representation.
 * The horizon rolls forward automatically with the calendar year (e.g. 2024 in 2026, 2025 in 2027).
 */
export const SCENE_MATURITY_BUFFER_YEARS = 2;

export const getDynamicEraMax = (now: Date = new Date()): number => {
  return now.getFullYear() - SCENE_MATURITY_BUFFER_YEARS;
};

export const ERA_MAX_BOUND = getDynamicEraMax();

export const CANONICAL_COUNTRIES_22: readonly string[] = [
  'United States',
  'United Kingdom',
  'Australia',
  'Canada',
  'Germany',
  'France',
  'Japan',
  'Sweden',
  'Italy',
  'Spain',
  'Brazil',
  'Mexico',
  'Netherlands',
  'Belgium',
  'Norway',
  'Finland',
  'Denmark',
  'Ireland',
  'New Zealand',
  'Poland',
  'Austria',
  'Switzerland',
] as const;

export const CANONICAL_GENRE_TAXONOMY: Record<string, string[]> = {
  'Metal': [
    'Metal', 'Heavy Metal', 'Death Metal', 'Black Metal', 'Doom Metal',
    'Deathcore', 'Metalcore', 'Mathcore', 'Grindcore', 'Cybergrind',
    'Powerviolence', 'Sludge', 'Crust', 'Thrash', 'Groove Metal', 'Nu Metal',
    'Extreme Metal', 'Industrial Metal', 'Progressive Metal'
  ],
  'Punk': [
    'Punk', 'Hardcore', 'Hardcore Punk', 'Post-Hardcore', 'Post-Punk', 'Emo',
    'Skate Punk', 'Pop Punk', 'Crust Punk', 'D-Beat', 'Anarcho-Punk',
    'Screamo', 'Melodic Hardcore', 'Beatdown Hardcore'
  ],
  'Rock': [
    'Rock', 'Alternative', 'Indie', 'Grunge', 'Post-Rock',
    'Garage Rock', 'Psychedelic', 'Noise Rock', 'Hard Rock', 'Space Rock', 'Shoegaze'
  ],
  'Hip-Hop / Rap': [
    'Hip-Hop', 'Rap', 'Boom Bap', 'G-Funk', 'Trap', 'Drill',
    'Crunk', 'Grime', 'Lo-Fi Hip-Hop', 'East Coast', 'West Coast', 'Hardcore Rap'
  ],
  'Electronic': [
    'Electronic', 'Techno', 'House', 'Trance', 'Dubstep', 'EDM',
    'Dance', 'IDM', 'Drum and Bass', 'Jungle', 'Ambient', 'Synthwave'
  ],
  'R&B / Soul': [
    'R&B', 'Soul', 'Funk', 'Motown', 'Neo-Soul'
  ],
  'Pop': [
    'Pop', 'Synthpop', 'Electropop', 'K-Pop', 'Indie Pop'
  ],
  'Country': [
    'Country', 'Bluegrass', 'Americana', 'Alt-Country'
  ],
  'Jazz': [
    'Jazz', 'Bebop', 'Swing', 'Fusion', 'Free Jazz'
  ]
};

export const CANONICAL_GENRES_FLAT: string[] = Array.from(
  new Set(Object.values(CANONICAL_GENRE_TAXONOMY).flat())
);

export const CANONICAL_STYLE_TAXONOMY: Record<string, string[]> = {
  'Sonics & Dynamics': [
    'Melodic', 'Heavy', 'Aggressive', 'Atmospheric', 'Ambient', 'Dissonant',
    'Minimalist', 'Maximalist', 'Driving', 'Groove-Heavy', 'Sludgy', 'Distorted',
    'Clean', 'Acoustic', 'Unplugged'
  ],
  'Production & Aesthetics': [
    'Lo-Fi', 'Hi-Fi', 'Wall of Sound', 'Fuzz', 'Reverb-Drenched', 'Raw',
    'Polished', 'DIY', 'Synthesized', 'Sample-Heavy', 'Analog', 'Bedroom'
  ],
  'Composition & Structure': [
    'Progressive', 'Math', 'Experimental', 'Polyrhythmic', 'Drone',
    'Improvisational', 'Avant-Garde', 'Loop-Based', 'Technical', 'Spoken-Word',
    'Riff-Driven', 'Virtuosic'
  ],
  'Vibe & Emotion': [
    'Anthemic', 'Introspective', 'Melancholic', 'Uplifting', 'Aggro',
    'Ethereal', 'Brooding', 'Cathartic', 'Earnest', 'Cinematic',
    'Nostalgic', 'Energetic', 'Moody'
  ],
  'Scene & Era Modifiers': [
    'Midwest', 'Revival', 'Old School', 'Modern', 'First-Wave',
    'Second-Wave', 'Post-', 'Proto-', 'Contemporary', 'Traditional',
    'Underground', 'Mainstream'
  ]
};

export const CANONICAL_STYLES_FLAT: string[] = Array.from(
  new Set(Object.values(CANONICAL_STYLE_TAXONOMY).flat())
);

export interface TasteProfile {
  id: string;
  name: string;
  color: string;
  isActive: boolean;
  favoriteLabel?: string;
  favoriteGenre: string;
  style: string;
  favoriteOrigin: string;
  eraMin: number | null;
  eraMax: number | null;
}

export type UserTaste = TasteProfile[];

export const COST_PER_AI_CALL = 0.0015;

export const RADIUS_TOKENS = {
  frame: "rounded-2xl", // Standardized Structural Container Geometry (Panels, Modals, Cards)
  modal: "rounded-2xl", // Modal & Dialog Containers
  input: "rounded-xl",  // Tactile Interactive Controls (Inputs, drop-downs)
  button: "rounded-lg", // Standard Interactive UI (Clickable utilities)
  toggle: "rounded-xl", // Segmented Component Selectors
};



