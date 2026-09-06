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
  isLoading?: boolean;
  isPending?: boolean;
  isSeed?: boolean;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
}

export interface Link {
  source: string | Node;
  target: string | Node;
  value: number;
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
  summary: string;
  imageUrl?: string;
  details: {
    genre?: string;
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
  tourDates?: string[];
  tourCachedAt?: string;
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
  cachedAt: any;           // serverTimestamp()
  hitCount: number;
  detailsCache?: string;   // JSON string or raw text of NodeDetails/bio
  filters?: DiscoveryFilters;
  isDeep?: boolean;
  synthesisRationale?: string;
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
  chatHistories?: string;   // JSON Map
  discoveryFilters?: string; // JSON
  lastViewedStackCount?: number;
  isMagazineViewOpen?: boolean;
  authorId?: string;
  status?: string;
  activeJobId?: string | null;
  coverImage?: string;
  seedImageUrl?: string;
  generationType?: "Root Generation" | "Partial Generation" | "Direct Hit" | "Complex Generation" | string;
  createdAt?: any;
  updatedAt?: any;
}

export interface DiscoveryFilters {
  foundedAfter?: number;
  foundedBefore?: number;
  includeOrigins?: string[];
  excludeOrigins?: string[];
  includeGenres?: string[];
  additionalInstructions?: string;
}

export interface TasteProfile {
  id: string;
  name: string;
  color: string;
  isActive: boolean;
  favoriteGenre: string;
  style: string;
  favoriteOrigin: string;
  eraMin: number | null;
  eraMax: number | null;
}

export type UserTaste = TasteProfile[];

export const COST_PER_AI_CALL = 0.0015;

export const RADIUS_TOKENS = {
  frame: "rounded-none", // Structural Brutalist Framing (0px hard borders)
  input: "rounded-xl",   // Tactile Interactive Controls (Inputs, drop-downs)
  button: "rounded-lg",  // Standard Interactive UI (Clickable utilities)
  toggle: "rounded-xl",  // Segmented Component Selectors
};


