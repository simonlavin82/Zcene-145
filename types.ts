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
}

export interface GraphData {
  nodes: Node[];
  links: Link[];
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
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
  groundingLinks?: Array<{
    title: string;
    url: string;
  }>;
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
 * STRICT ISOLATION RULE (cacheVersion 2):
 *   - `nodes` contains ONLY the artist's own node plus its direct structural metadata
 *     nodes (genre, label, country, founded).
 *   - `links` contains ONLY the links between this artist and its own metadata nodes.
 *   - Cross-artist session edges (e.g. "End It → Spaced") are NEVER stored here.
 *     They are computed dynamically by the D3 graph state engine at render time.
 */
export interface ArtistCacheEntry {
  artistId: string;        // Normalized Firestore-safe slug, e.g. "end-it"
  seedArtists: string;     // Canonical name as returned by the AI, e.g. "End It"
  graphData: string;       // JSON-stringified GraphData map {"nodes":[], "links":[]}
  cacheVersion: number;    // Schema version
  cachedAt: any;           // serverTimestamp()
  hitCount: number;
  detailsCache?: string;   // JSON string or raw text of NodeDetails/bio
}

export interface Project {
  id: string;
  name: string;
  seedArtists: string;
  // --- Phase 1+: per-artist reference fields ---
  /** Array of normalized artist IDs pointing to individual /artists/{id} cache docs. */
  artistIds?: string[];     // e.g. ['buggin', 'end-it', 'spaced']
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

export interface UserTaste {
  favoriteArtist: string;
  favoriteGenre: string;
  favoriteOrigin: string;
  eraMin: number | null;
  eraMax: number | null;
}

export const COST_PER_AI_CALL = 0.0015;

export const RADIUS_TOKENS = {
  frame: "rounded-none", // Structural Brutalist Framing (0px hard borders)
  input: "rounded-xl",   // Tactile Interactive Controls (Inputs, drop-downs)
  button: "rounded-lg",  // Standard Interactive UI (Clickable utilities)
  toggle: "rounded-xl",  // Segmented Component Selectors
};


