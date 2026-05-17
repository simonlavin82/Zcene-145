export enum View {
  Home = 'home',
  Dashboard = 'dashboard',
  Graph = 'graph',
  Help = 'help',
  StyleGuide = 'styleguide',
  Engine = 'engine',
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
    url: string;
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

/** Top-level Firestore 'artists' collection document — global cache entry. */
export interface ArtistCacheEntry {
  cacheKey: string;
  graphData: string;     // JSON-stringified GraphData
  detailsCache: string;  // JSON-stringified Map<string, NodeDetails> entries
  seedArtists: string;
  filters: string;       // JSON-stringified DiscoveryFilters
  cacheVersion: number;  // Schema version (currently 1)
  cachedAt: any;         // serverTimestamp()
  hitCount: number;
}

export interface Project {
  id: string;
  name: string;
  seedArtists: string;
  // --- NEW: lightweight reference fields ---
  cacheKey?: string;       // points to artists/{cacheKey} global cache doc
  canvasLayout?: string;   // JSON CanvasNodeRef[] — artist positions only
  // --- LEGACY: kept for backward-compatible reads of old project docs ---
  graphData?: string | null;
  detailsCache?: string;   // JSON Map
  // --- Always present ---
  activeNodes: string[];
  chatHistories?: string;  // JSON Map
  discoveryFilters?: string; // JSON
  lastViewedStackCount?: number;
  isMagazineViewOpen?: boolean;
  createdAt?: any;
  updatedAt?: any;
}

export interface DiscoveryFilters {
  foundedAfter?: number;
  includeOrigins?: string[];
  excludeOrigins?: string[];
  additionalInstructions?: string;
}
