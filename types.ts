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

export interface Project {
  id: string;
  name: string;
  seedArtists: string;
  graphData: string | null;
  activeNodes: string[];
  detailsCache?: string; // JSON Map
  chatHistories?: string; // JSON Map
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
