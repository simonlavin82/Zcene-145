
import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertCircle, X, CheckCircle2, Key } from 'lucide-react';
import { GraphData, Node, ParsedArtist, Link, View, NodeDetails, ChatMessage, StackItem, DiscoveryFilters, Project } from './types';
import { generateGraphData, fetchNodeDetails, extendGraphFromNode } from './services/geminiService';
import { auth, signInWithGoogle, logout, onAuthStateChanged, User, db, handleFirestoreError, OperationType } from './services/firebase';
import { collection, doc, setDoc, deleteDoc, onSnapshot, query, getDocFromServer, serverTimestamp, addDoc, getDoc, getDocs, orderBy, where, writeBatch, getDocFromCache, updateDoc } from 'firebase/firestore';
const StyleGuidePage = React.lazy(() => import('./components/DesignSystem').then(m => ({ default: m.StyleGuidePage })));
const EnginePage = React.lazy(() => import('./components/EnginePage').then(m => ({ default: m.EnginePage })));
import HelpPage from './components/HelpPage';
import GraphPage from './components/GraphPage';
import HomePage from './components/HomePage';
import Dashboard from './components/Dashboard';
import { MyStackDialog, HeaderMenu } from './components/SharedModals';
import { ShareModal } from './components/ShareModal';
import { analyticsService } from './services/analyticsService';
import { ZceneLogo, Spinner } from './components/Icons';

declare global {
  interface Window {
    // aistudio is globally defined by the environment
  }
}

interface ParsedResult {
  baseGraph: GraphData;
  artists: ParsedArtist[];
}

interface ErrorOverlayProps {
  message: string | null;
  onClose: () => void;
  onRetryKey?: () => void;
}

const ErrorOverlay: React.FC<ErrorOverlayProps> = ({ message, onClose, onRetryKey }) => {
  if (!message) return null;

  const isKeyError = message.toLowerCase().includes("requested entity was not found") ||
    message.toLowerCase().includes("api key") ||
    message.toLowerCase().includes("authentication");

  // @ts-ignore
  const isAiStudio = typeof window !== 'undefined' && window.aistudio && typeof window.aistudio.openSelectKey === 'function';

  return (
    <div className="fixed top-4 left-0 w-full z-[100] flex justify-center px-4 pointer-events-none">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        className="w-full max-w-lg pointer-events-auto"
      >
        <div className="bg-red-950/90 backdrop-blur-md border border-red-500/30 text-red-100 px-5 py-4 rounded-none shadow-[0_20px_50px_rgba(0,0,0,0.5)] flex flex-col gap-4" role="alert">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-grow min-w-0 pt-1">
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle className="w-4 h-4 text-red-400" />
                <strong className="font-semibold text-red-50 text-xs uppercase tracking-wider">System Error</strong>
              </div>
              <span className="block text-sm opacity-90 leading-relaxed font-medium">{message}</span>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-xl hover:bg-white/10 transition-colors flex-shrink-0 flex items-center justify-center text-red-300"
              aria-label="Close error message"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {isKeyError && onRetryKey && (
            <div className="flex flex-col gap-3 pt-3 border-t border-white/10">
              <div className="flex items-start gap-3">
                <Key className="w-4 h-4 text-red-400 mt-0.5" />
                <p className="text-xs text-red-200/80 leading-relaxed">
                  {isAiStudio ? (
                    "This usually indicates an issue with your API Key selection in AI Studio. Please re-select a valid key."
                  ) : (
                    "Authentication issue. If you are the site owner, ensure your API key is correctly configured in your environment variables and that zcene.online is allowlisted in your Google Cloud Console."
                  )}
                </p>
              </div>
              <button
                onClick={onRetryKey}
                className="bg-red-500 text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-red-400 transition-all active:scale-95 shadow-lg flex items-center justify-center gap-2"
              >
                {isAiStudio ? "Re-select API Key" : "Check API Key / Billing"}
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};

const Toast: React.FC<{ message: string; onClose: () => void }> = ({ message, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className="fixed bottom-24 sm:bottom-12 left-1/2 -translate-x-1/2 z-[1000] pointer-events-none px-4 w-full max-w-sm">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        className="bg-brand-black text-primary px-6 py-3 rounded-none shadow-2xl flex items-center justify-center gap-3 pointer-events-auto border border-primary/50 backdrop-blur-md"
      >
        <CheckCircle2 className="w-5 h-5" />
        <span className="text-sm font-medium">{message}</span>
      </motion.div>
    </div>
  );
};

const parseAppleMusicXml = (xmlString: string): ParsedResult => {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlString, "application/xml");
  if (xmlDoc.querySelector("parsererror")) throw new Error("Failed to parse XML file.");
  const artistDateMap = new Map<string, Date>();
  const nodes: Node[] = [];
  const links: Link[] = [];
  const nodeIds = new Set<string>();
  const artistToGroupMap = new Map<string, number>();
  let nextGroupId = 1;
  const addNode = (node: Node) => {
    if (node.id && !nodeIds.has(node.id.trim())) {
      const trimmedId = node.id.trim();
      nodes.push({ ...node, id: trimmedId });
      nodeIds.add(trimmedId);
    }
  };
  const addLink = (source: string, target: string) => {
    const trimmedSource = source.trim();
    const trimmedTarget = target.trim();
    if (!links.some(l => (l.source === trimmedSource && l.target === trimmedTarget) || (l.source === trimmedTarget && l.target === trimmedSource))) {
      links.push({ source: trimmedSource, target: trimmedTarget, value: 1 });
    }
  };
  const getArtistGroupId = (artistName: string): number => {
    if (!artistToGroupMap.has(artistName)) artistToGroupMap.set(artistName, nextGroupId++);
    return artistToGroupMap.get(artistName)!;
  };
  const tracksDict = Array.from(xmlDoc.getElementsByTagName("key")).find(el => el.textContent === "Tracks")?.nextElementSibling;
  if (!tracksDict || tracksDict.tagName !== 'dict') throw new Error("Invalid XML structure.");
  const trackDicts = Array.from(tracksDict.children).filter(el => el.tagName === 'dict');
  for (const track of trackDicts) {
    let artist: string | null = null;
    let genre: string | null = null;
    let dateAdded: Date | null = null;
    for (let i = 0; i < track.children.length - 1; i += 2) {
      const key = track.children[i].textContent;
      const value = track.children[i + 1].textContent;
      if (value) {
        switch (key) {
          case 'Artist': artist = value; break;
          case 'Genre': genre = value; break;
          case 'Date Added': dateAdded = new Date(value); break;
        }
      }
    }
    if (artist) {
      const existingDate = artistDateMap.get(artist);
      if (dateAdded && (!existingDate || dateAdded > existingDate)) artistDateMap.set(artist, dateAdded);
      else if (!existingDate) artistDateMap.set(artist, null as any);
      const group = getArtistGroupId(artist);
      addNode({ id: artist, type: 'artist', group });
      if (genre) {
        addNode({ id: genre, type: 'genre', group: 1000 });
        addLink(artist, genre);
      }
    }
  }
  return { baseGraph: { nodes, links }, artists: Array.from(artistDateMap, ([name, dateAdded]) => ({ name, dateAdded })) };
};

const parseCsvLine = (line: string): string[] => {
  const result: string[] = [];
  let currentField = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') { currentField += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) { result.push(currentField); currentField = ''; }
    else currentField += char;
  }
  result.push(currentField);
  return result.map(field => {
    const trimmed = field.trim();
    if (trimmed.startsWith('"') && trimmed.endsWith('"')) return trimmed.substring(1, trimmed.length - 1).replace(/""/g, '"');
    return trimmed;
  });
};

const parseCsvData = (csvString: string): ParsedResult => {
  const lines = csvString.split('\n').filter(line => line.trim() !== '');
  if (lines.length < 1) throw new Error("CSV file is empty.");
  let headerIndex = -1, header: string[] = [], artistHeaderKey: string | null = null;
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    const cleanedHeaders = parseCsvLine(lines[i]).map(h => h.trim().toLowerCase());
    const found = cleanedHeaders.find(h => h === 'artist' || h === 'artist name');
    if (found) { headerIndex = i; header = cleanedHeaders; artistHeaderKey = found; break; }
  }
  if (headerIndex === -1 || !artistHeaderKey) throw new Error("CSV must have 'Artist' column.");
  const artistIndex = header.indexOf(artistHeaderKey);
  const genreIndex = header.findIndex(h => h === 'genre' || h === 'genres');
  const artistSet = new Set<string>();
  const nodes: Node[] = [];
  const links: Link[] = [];
  const nodeIds = new Set<string>();
  const artistToGroupMap = new Map<string, number>();
  let nextGroupId = 1;
  const addNode = (node: Node) => {
    if (node.id && !nodeIds.has(node.id.trim())) {
      const trimmedId = node.id.trim();
      nodes.push({ ...node, id: trimmedId });
      nodeIds.add(trimmedId);
    }
  };
  const addLink = (source: string, target: string) => {
    const trimmedSource = source.trim();
    const trimmedTarget = target.trim();
    if (!links.some(l => (l.source === trimmedSource && l.target === trimmedTarget) || (l.source === trimmedTarget && l.target === trimmedSource))) {
      links.push({ source: trimmedSource, target: trimmedTarget, value: 1 });
    }
  };
  const getArtistGroupId = (artistName: string): number => {
    if (!artistToGroupMap.has(artistName)) artistToGroupMap.set(artistName, nextGroupId++);
    return artistToGroupMap.get(artistName)!;
  };
  for (let i = headerIndex + 1; i < lines.length; i++) {
    const columns = parseCsvLine(lines[i]);
    if (columns.length <= artistIndex) continue;
    const artist = columns[artistIndex];
    if (artist) {
      artistSet.add(artist);
      const group = getArtistGroupId(artist);
      addNode({ id: artist, type: 'artist', group });
      if (genreIndex > -1 && columns[genreIndex]) {
        const genre = columns[genreIndex];
        addNode({ id: genre, type: 'genre', group: 1000 });
        addLink(artist, genre);
      }
    }
  }
  return { baseGraph: { nodes, links }, artists: Array.from(artistSet, name => ({ name, dateAdded: null })) };
};

const filterGraphByDiscoveryFilters = (data: GraphData, filters: DiscoveryFilters, seedArtists: string): GraphData => {
  if (!data || !data.nodes || !data.links) return data || { nodes: [], links: [] };
  if (!filters.foundedAfter && (!filters.includeOrigins || filters.includeOrigins.length === 0) && (!filters.excludeOrigins || filters.excludeOrigins.length === 0)) return data;

  const seedArtistIds = new Set(seedArtists.split('::').map(a => a.trim().toLowerCase()));
  const nodesToRemove = new Set<string>();

  // Map artists to their founded years and origins from the graph
  const artistToYear = new Map<string, number>();
  const artistToOrigins = new Map<string, Set<string>>();
  const nodeMap = new Map(data.nodes.map(n => [n.id, n]));

  data.links.forEach(link => {
    const sourceId = typeof link.source === 'string' ? link.source : (link.source as Node).id;
    const targetId = typeof link.target === 'string' ? link.target : (link.target as Node).id;

    const sourceNode = nodeMap.get(sourceId);
    const targetNode = nodeMap.get(targetId);

    if (sourceNode?.type === 'artist') {
      if (targetNode?.type === 'founded') {
        const year = parseInt(targetNode.id);
        if (!isNaN(year)) artistToYear.set(sourceId.toLowerCase(), year);
      } else if (targetNode?.type === 'country') {
        if (!artistToOrigins.has(sourceId.toLowerCase())) artistToOrigins.set(sourceId.toLowerCase(), new Set());
        artistToOrigins.get(sourceId.toLowerCase())!.add(targetNode.id.toLowerCase());
      }
    } else if (targetNode?.type === 'artist') {
      if (sourceNode?.type === 'founded') {
        const year = parseInt(sourceNode.id);
        if (!isNaN(year)) artistToYear.set(targetId.toLowerCase(), year);
      } else if (sourceNode?.type === 'country') {
        if (!artistToOrigins.has(targetId.toLowerCase())) artistToOrigins.set(targetId.toLowerCase(), new Set());
        artistToOrigins.get(targetId.toLowerCase())!.add(sourceNode.id.toLowerCase());
      }
    }
  });

  data.nodes.forEach(node => {
    if (node.type === 'artist' && !seedArtistIds.has(node.id.toLowerCase())) {
      // Year Filter
      if (filters.foundedAfter) {
        const threshold = Number(filters.foundedAfter);
        const year = artistToYear.get(node.id.toLowerCase());
        if (year && year <= threshold) {
          nodesToRemove.add(node.id);
          return;
        }
      }

      // Origin Include Filter
      if (filters.includeOrigins && filters.includeOrigins.length > 0) {
        const origins = artistToOrigins.get(node.id.toLowerCase());
        const allowed = filters.includeOrigins.map(o => o.toLowerCase());
        if (origins) {
          const hasAllowed = Array.from(origins).some(o => allowed.includes(o));
          if (!hasAllowed) {
            nodesToRemove.add(node.id);
            return;
          }
        }
      }

      // Origin Exclude Filter
      if (filters.excludeOrigins && filters.excludeOrigins.length > 0) {
        const origins = artistToOrigins.get(node.id.toLowerCase());
        const forbidden = filters.excludeOrigins.map(o => o.toLowerCase());
        if (origins) {
          const hasForbidden = Array.from(origins).some(o => forbidden.includes(o));
          if (hasForbidden) {
            nodesToRemove.add(node.id);
            return;
          }
        }
      }
    }
  });

  // Filter nodes and links
  let filteredNodes = data.nodes.filter(n => !nodesToRemove.has(n.id));
  let filteredLinks = data.links.filter(l => {
    const s = typeof l.source === 'string' ? l.source : (l.source as Node).id;
    const t = typeof l.target === 'string' ? l.target : (l.target as Node).id;
    return !nodesToRemove.has(s) && !nodesToRemove.has(t);
  });

  // Cleanup orphaned utility nodes
  const artistIdsInFilteredNodes = new Set(filteredNodes.filter(n => n.type === 'artist').map(n => n.id));
  filteredNodes = filteredNodes.filter(n => {
    if (n.type === 'artist') return true;
    return filteredLinks.some(l => {
      const s = typeof l.source === 'string' ? l.source : (l.source as Node).id;
      const t = typeof l.target === 'string' ? l.target : (l.target as Node).id;
      return (s === n.id && artistIdsInFilteredNodes.has(t)) || (t === n.id && artistIdsInFilteredNodes.has(s));
    });
  });

  // Deduplicate nodes by ID
  const deduplicatedNodesMap = new Map<string, Node>();
  filteredNodes.forEach(node => {
    const normalizedId = node.id.toLowerCase();
    if (!deduplicatedNodesMap.has(normalizedId)) {
      deduplicatedNodesMap.set(normalizedId, node);
    }
  });
  const deduplicatedNodes = Array.from(deduplicatedNodesMap.values());

  const finalNodeIds = new Set(deduplicatedNodes.map(n => n.id));
  filteredLinks = filteredLinks.filter(l => {
    const s = typeof l.source === 'string' ? l.source : (l.source as Node).id;
    const t = typeof l.target === 'string' ? l.target : (l.target as Node).id;
    return finalNodeIds.has(s) && finalNodeIds.has(t);
  });

  return { nodes: deduplicatedNodes, links: filteredLinks };
};

const mergeGraphData = (base: GraphData, enhancement: GraphData): GraphData => {
  if (!base || !base.nodes) return enhancement || { nodes: [], links: [] };
  if (!enhancement || !enhancement.nodes) return base || { nodes: [], links: [] };

  const combinedNodes = [...base.nodes];
  const combinedLinks = [...(base.links || [])];
  const nodeMap = new Map<string, Node>(combinedNodes.map(n => [n.id.toLowerCase(), n]));
  enhancement.nodes.forEach(newNode => {
    const normalizedId = newNode.id.toLowerCase();
    const existingNode = nodeMap.get(normalizedId);
    if (existingNode) {
      if (existingNode.id !== newNode.id) {
        const oldId = existingNode.id, newId = newNode.id;
        combinedLinks.forEach(link => {
          if (typeof link.source === 'string' && link.source === oldId) link.source = newId;
          if (typeof link.target === 'string' && link.target === oldId) link.target = newId;
        });
        existingNode.id = newId;
      }
      const { id: _, ...other } = newNode;
      Object.assign(existingNode, other);
    } else {
      combinedNodes.push(newNode);
      nodeMap.set(normalizedId, newNode);
    }
  });
  const linkIdSet = new Set(combinedLinks.map(l => {
    const ids = [(typeof l.source === 'string' ? l.source : (l.source as Node).id).toLowerCase(), (typeof l.target === 'string' ? l.target : (l.target as Node).id).toLowerCase()].sort();
    return ids.join('--');
  }));
  enhancement.links.forEach(newLink => {
    const sourceId = (typeof newLink.source === 'string' ? newLink.source : (newLink.source as Node).id).toLowerCase();
    const targetId = (typeof newLink.target === 'string' ? newLink.target : (newLink.target as Node).id).toLowerCase();
    if (nodeMap.has(sourceId) && nodeMap.has(targetId)) {
      const linkId = [sourceId, targetId].sort().join('--');
      if (!linkIdSet.has(linkId)) {
        combinedLinks.push({ ...newLink, source: nodeMap.get(sourceId)!.id, target: nodeMap.get(targetId)!.id });
        linkIdSet.add(linkId);
      }
    }
  });
  return { nodes: combinedNodes, links: combinedLinks };
};

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<View>(View.Home);
  const currentViewRef = useRef<View>(View.Home);
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const currentProjectIdRef = useRef<string | null>(null);
  const [currentProjectOwnerId, setCurrentProjectOwnerId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState<string>('');
  useEffect(() => { currentViewRef.current = currentView; }, [currentView]);
  useEffect(() => { currentProjectIdRef.current = currentProjectId; }, [currentProjectId]);
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; id: number } | null>(null);
  const [libraryArtists, setLibraryArtists] = useState<ParsedArtist[]>([]);
  const [seedArtists, setSeedArtists] = useState<string>('');
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [activeNodes, setActiveNodes] = useState<Node[]>([]);
  const [stack, setStack] = useState<StackItem[]>([]);
  const [lastViewedStackCount, setLastViewedStackCount] = useState<number>(0);
  const [baseGraph, setBaseGraph] = useState<GraphData | null>(null);
  const [detailsCache, setDetailsCache] = useState<Map<string, NodeDetails>>(new Map());
  const [loadingNodeIds, setLoadingNodeIds] = useState<Set<string>>(new Set());
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [urlOriginHint, setUrlOriginHint] = useState<string | null>(null);
  const [chatHistories, setChatHistories] = useState<Map<string, ChatMessage[]>>(new Map());
  const [discoveryFilters, setDiscoveryFilters] = useState<DiscoveryFilters>({});
  const [isMagazineViewOpen, setIsMagazineViewOpen] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [user, setUser] = useState<User | null>(null);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isDeleteAccountModalOpen, setIsDeleteAccountModalOpen] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [isAuthInitialized, setIsAuthInitialized] = useState(false);
  const [isFirebaseReady, setIsFirebaseReady] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [activeShareUrl, setActiveShareUrl] = useState<string | null>(null);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [isStackDialogOpen, setIsStackDialogOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const isAdmin = useMemo(() => {
    if (!user || !user.email) return false;
    return user.email.toLowerCase() === 'simon.lavin1@gmail.com';
  }, [user]);
  const [pendingAuthAction, setPendingAuthAction] = useState<{ type: string; payload: any } | null>(null);
  const authRedirectPathRef = useRef<string | null>(null);
  const isHydratingSessionRef = useRef(false);

  const isGuest = useMemo(() => {
    if (!currentProjectId) return false;
    if (!user) return true;
    return currentProjectOwnerId !== null && currentProjectOwnerId !== user.uid;
  }, [user, currentProjectId, currentProjectOwnerId]);

  const [isSmallScreen, setIsSmallScreen] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth < 768;
    }
    return false;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const updateSize = () => setIsSmallScreen(window.innerWidth < 768);
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  const abortControllerRef = useRef<AbortController | null>(null);
  const lastProcessedSeedsRef = useRef<string | null>(null);
  const isFetchingDetailsRef = useRef<boolean>(false);

  const showToast = useCallback((message: string) => setToast({ message, id: Date.now() }), []);

  const humanizeError = useCallback((error: any): string => {
    const message = error?.message || String(error) || 'An unknown error occurred.';

    // Check for specific AI Studio Key error
    if (message.includes("Requested entity was not found")) {
      return "The selected AI model is unavailable for your current API key. Please use the 'Re-select API Key' button below to refresh your session.";
    }

    try {
      const errorJson = JSON.parse(message);
      if (errorJson.error === "Proxying failed") return "Connection issue: AI unreachable.";
      if (errorJson.error?.message) {
        const apiMessage = errorJson.error.message;
        if (apiMessage.includes("Requested entity was not found")) {
          return "The selected AI model is unavailable for your current API key. Please use the 'Re-select API Key' button below to refresh your session.";
        }
        if (errorJson.error.status === 'RESOURCE_EXHAUSTED' || errorJson.error.code === 429) return "AI is busy. Please wait a minute.";
        if (errorJson.error.status === 'INVALID_ARGUMENT' && apiMessage.toLowerCase().includes('api key')) {
          return "Authentication issue. Please use the 'Re-select API Key' button below to refresh your session.";
        }
        return apiMessage;
      }
    } catch (e) {
      if (message.includes('Failed to fetch') || message.includes('NetworkError')) return "Network issue. Check your internet.";
    }
    return message;
  }, []);

  const handleLogin = useCallback(async () => {
    try {
      await signInWithGoogle();
      showToast('Logged in successfully');
    } catch (err) {
      setError(humanizeError(err));
    }
  }, [showToast, humanizeError]);

  const handleLogout = useCallback(async () => {
    try {
      await logout();
      setProfile(null);
      showToast('Logged out');
    } catch (err) {
      setError(humanizeError(err));
    }
  }, [showToast, humanizeError]);

  const handleCreateProject = useCallback(async () => {
    if (!user) {
      handleLogin();
      return;
    }

    // Create reference and ID immediately for instant navigation
    const newDocRef = doc(collection(db, 'users', user.uid, 'projects'));
    const newId = newDocRef.id;

    console.log(`[Dashboard] Creating Project: ${newId}`);

    // Update route immediately
    window.location.hash = `#/z/${newId}`;
    setIsCreatingProject(true);

    const path = `users/${user.uid}/projects/${newId}`;
    try {
      await setDoc(newDocRef, {
        name: '',
        seedArtists: '',
        graphData: JSON.stringify({ nodes: [], links: [] }),
        activeNodes: [],
        detailsCache: '[]',
        chatHistories: '[]',
        discoveryFilters: '{}',
        lastViewedStackCount: 0,
        isMagazineViewOpen: false,
        authorId: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    } finally {
      setIsCreatingProject(false);
    }
  }, [user, handleLogin]);

  const handleShareZcene = useCallback(async () => {
    if (!user || !graphData || isSharing) return null;

    if (!user.emailVerified) {
      setError("Your email must be verified to share Zcenes. Please check your inbox or sign in with a verified account.");
      return null;
    }

    setIsSharing(true);
    const path = 'sharedZcenes';
    try {
      const docRef = await addDoc(collection(db, path), {
        graphData: JSON.stringify(graphData),
        seedArtists,
        activeNodes: activeNodes.map(n => n.id),
        detailsCache: JSON.stringify(Array.from(detailsCache.entries())),
        authorId: user.uid,
        createdAt: serverTimestamp()
      });

      const shareUrl = `${window.location.protocol}//${window.location.host}${window.location.pathname}#/app?id=${docRef.id}`;
      try {
        await navigator.clipboard.writeText(shareUrl);
        showToast('Link copied to clipboard!');
      } catch (err) {
        console.error("Failed to copy link:", err);
        showToast(`Share created! ID: ${docRef.id}`);
      }

      return docRef.id;
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
      return null;
    } finally {
      setIsSharing(false);
    }
  }, [user, graphData, seedArtists, activeNodes, detailsCache, isSharing, showToast]);

  const handleTriggerShareModal = useCallback(async () => {
    const shareId = await handleShareZcene();
    if (shareId) {
      const baseUrl = window.location.origin + window.location.pathname;
      const deepLink = `${baseUrl}${baseUrl.endsWith('/') ? '' : '/'}#/app?shareId=${shareId}`;
      setActiveShareUrl(deepLink);
      setIsShareModalOpen(true);
    }
    return shareId;
  }, [handleShareZcene]);

  const handleDeleteProject = useCallback(async (projectId: string) => {
    if (!user) return;
    const path = `users/${user.uid}/projects/${projectId}`;
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'projects', projectId));
      showToast("Zcene deleted");
      if (currentProjectId === projectId) {
        window.location.hash = '#/dashboard';
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, path);
    }
  }, [user, currentProjectId, showToast]);

  const handleUpdateProjectName = useCallback(async (name: string) => {
    setProjectName(name);
    if (!user || !currentProjectId) return;
    const path = `users/${user.uid}/projects/${currentProjectId}`;
    try {
      await setDoc(doc(db, 'users', user.uid, 'projects', currentProjectId), {
        name,
        updatedAt: serverTimestamp()
      }, { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  }, [user, currentProjectId]);

  const displayProjectName = useMemo(() => {
    if (projectName) return projectName;
    if (seedArtists) {
      const first = seedArtists.split('::')[0]?.trim();
      return first || 'Untitled Zcene';
    }
    return 'Untitled Zcene';
  }, [projectName, seedArtists]);

  const handleUpdateProfile = useCallback(async (updates: any) => {
    if (!user) return;
    const path = `users/${user.uid}`;
    try {
      await setDoc(doc(db, 'users', user.uid), updates, { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  }, [user]);

  const handleSelectKey = useCallback(async () => {
    // @ts-ignore - aistudio is globally defined by the environment
    const isAiStudio = window.aistudio && typeof window.aistudio.openSelectKey === 'function';

    if (isAiStudio) {
      // @ts-ignore
      await window.aistudio.openSelectKey();
    } else {
      // Fallback for non-AI Studio environments
      console.warn("AI Studio key selector not found. Please set your key in the settings menu.");
    }
  }, []);

  const handleMenuNavigate = useCallback((path: string) => {
    switch (path) {
      case 'home': window.location.hash = '#/'; break;
      case 'dashboard': window.location.hash = '#/dashboard'; break;
      case 'help': window.location.hash = '#/help'; break;
      case 'design': window.location.hash = '#/design'; break;
      case 'engine': window.location.hash = '#/engine'; break;
      default: window.location.hash = '#/';
    }
  }, []);

  const handleOpenStack = useCallback(() => {
    setIsStackDialogOpen(true);
    setLastViewedStackCount(stack.length);
  }, [stack.length]);

  const handleCloseModals = useCallback(() => {
    setIsStackDialogOpen(false);
    setIsMenuOpen(false);
  }, []);

  const handleClearLib = useCallback(() => {
    setLibraryArtists([]); setBaseGraph(null);
    if (user) {
      setDoc(doc(db, 'users', user.uid), { libraryArtists: "[]" }, { merge: true }).catch(console.error);
    }
  }, [user]);

  const handleClearZcene = useCallback(() => {
    setSeedArtists('');
    setGraphData(null);
    setBaseGraph(null);
    setSelectedNode(null);
    setActiveNodes([]);
    setDetailsCache(new Map());
    setChatHistories(new Map());
    setError(null);
    setDetailsError(null);
    setLoadingNodeIds(new Set());
    setLastViewedStackCount(0);
    setRefreshKey(prev => prev + 1);
    setIsStackDialogOpen(false);
    setIsMenuOpen(false);
    if (window.location.hash.includes('?')) {
      window.location.hash = window.location.hash.split('?')[0];
    }
  }, []);

  const handleRefreshUI = useCallback(() => {
    setRefreshKey(prev => prev + 1);
    setIsStackDialogOpen(false);
    setIsMenuOpen(false);
  }, []);

  const handleNodeClick = useCallback((node: Node | null) => {
    setSelectedNode(node);
    if (node && node.type !== 'founded') {
      setActiveNodes(prev => prev.some(n => n.id.toLowerCase() === node.id.toLowerCase()) ? prev : [...prev, node]);
    }
  }, []);

  const handleToggleStack = useCallback(async (node: Node, link?: string) => {
    if (!user) {
      setPendingAuthAction({ type: 'toggleStack', payload: { node, link } });
      handleLogin();
      return;
    }

    const stackPath = `users/${user.uid}/stack`;
    const safeNodeId = node.id.replace(/[^a-zA-Z0-9_\-]/g, '_');
    const itemRef = doc(db, stackPath, safeNodeId);
    const itemPath = `${stackPath}/${safeNodeId}`;
    let exists = false;

    try {
      const existingItem = stack.find(item => item.id.toLowerCase() === node.id.toLowerCase());
      exists = !!existingItem;
      if (exists) {
        console.log(`[Database Reporter] Attempting DELETE | Path: ${itemPath}`);
        await deleteDoc(itemRef);
        console.log(`[Database Reporter] SUCCESS: Item removed from Stack.`);
        showToast(`Removed from My Stack`);
      } else {
        const newItem: StackItem = {
          id: node.id,
          type: node.type || "artist",
          dateSaved: Date.now(),
          link: link || ""
        };

        // PRE-FLIGHT DIAGNOSTIC LOGGING
        console.log(`[Deep Cut Stack] PRE-FLIGHT CHECK - Object to be sent to Firestore:`, JSON.stringify(newItem, null, 2));

        // Check for undefined or illegal fields
        Object.entries(newItem).forEach(([key, value]) => {
          if (value === undefined) {
            console.warn(`[Deep Cut Stack] WARNING: Field '${key}' is undefined! This will cause Firebase failure.`);
            // Cleanup to prevent crash
            delete (newItem as any)[key];
          }
        });

        console.log(`[Database Reporter] Attempting WRITE | Path: ${itemPath}`);
        await setDoc(itemRef, newItem);
        console.log(`[Database Reporter] SUCCESS: Item added to Stack.`);

        // SYNC VERIFICATION: Only show toast AFTER we know for sure it's in the DB
        showToast(`Added to My Stack`);
      }
    } catch (err: any) {
      console.error(`[Database Reporter] STACK OPERATION FAILED at: ${itemPath}`);
      console.error("Full Firestore Error Object:", {
        code: err?.code,
        message: err?.message,
        name: err?.name,
        stack: err?.stack,
        ...err
      });
      handleFirestoreError(err, exists ? OperationType.DELETE : OperationType.WRITE, itemPath);
    }
  }, [user, stack, showToast, handleLogin]);

  const handleSaveToDashboard = useCallback(async () => {
    if (!user) {
      setPendingAuthAction({ type: 'saveToDashboard', payload: null });
      handleLogin();
      return;
    }

    if (!graphData) return;

    setIsCreatingProject(true);
    const newDocRef = doc(collection(db, 'users', user.uid, 'projects'));
    const newId = newDocRef.id;

    const path = `users/${user.uid}/projects/${newId}`;
    try {
      await setDoc(newDocRef, {
        name: projectName || (seedArtists ? seedArtists.split('::')[0] : 'Saved Zcene'),
        seedArtists,
        graphData: JSON.stringify(graphData),
        activeNodes: activeNodes.map(n => n.id),
        detailsCache: JSON.stringify(Array.from(detailsCache.entries())),
        chatHistories: JSON.stringify(Array.from(chatHistories.entries())),
        discoveryFilters: JSON.stringify(discoveryFilters),
        lastViewedStackCount,
        isMagazineViewOpen: false,
        authorId: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      showToast('Zcene saved to your dashboard!');
      window.location.hash = `#/z/${newId}`;
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    } finally {
      setIsCreatingProject(false);
    }
  }, [user, graphData, seedArtists, projectName, activeNodes, detailsCache, chatHistories, discoveryFilters, lastViewedStackCount, handleLogin, showToast]);

  const handleDeleteAccount = async () => {
    if (!user) return;

    setIsDeletingAccount(true);
    setError(null);
    try {
      const batch = writeBatch(db);

      // 1. Clean Sweep: Projects in subcollection
      const projectsRef = collection(db, 'users', user.uid, 'projects');
      const projectsSnap = await getDocs(projectsRef);
      projectsSnap.docs.forEach(docSnap => batch.delete(docSnap.ref));

      // 2. Clean Sweep: Search for projects in potential top-level collection
      try {
        const topLevelProjectsRef = collection(db, 'projects');
        const q = query(topLevelProjectsRef, where('authorId', '==', user.uid));
        const topLevelSnap = await getDocs(q);
        topLevelSnap.docs.forEach(docSnap => batch.delete(docSnap.ref));
      } catch (e) {
        console.log("No top-level projects collection or access denied (expected if not using top-level)");
      }

      // 3. Delete Stack items
      const stackRef = collection(db, 'users', user.uid, 'stack');
      const stackSnap = await getDocs(stackRef);
      stackSnap.docs.forEach(docSnap => batch.delete(docSnap.ref));

      // 4. Delete Session
      const sessionRef = doc(db, 'users', user.uid, 'userSession', 'current');
      batch.delete(sessionRef);

      // 5. Delete shared Zcenes
      const sharedRef = collection(db, 'sharedZcenes');
      const sharedQ = query(sharedRef, where('authorId', '==', user.uid));
      const sharedSnap = await getDocs(sharedQ);
      sharedSnap.docs.forEach(docSnap => batch.delete(docSnap.ref));

      // 6. Delete user profile
      const userRef = doc(db, 'users', user.uid);
      batch.delete(userRef);

      // Commit the batch
      await batch.commit();

      // 7. Delete Auth User
      await user.delete();

      setUser(null);
      setProfile(null);
      setIsDeleteAccountModalOpen(false);
      setCurrentView(View.Home);
      window.location.hash = '#/';
      showToast('Account deleted successfully');
    } catch (err: any) {
      console.error("Deletion error details:", err);
      if (err.code === 'auth/requires-recent-login' || (err.message && err.message.includes('auth/requires-recent-login'))) {
        setError("For security, please log out and back in once more before deleting your account.");
      } else {
        handleFirestoreError(err, OperationType.DELETE, `users/${user.uid}`);
      }
    } finally {
      setIsDeletingAccount(false);
    }
  };

  const handleGenerateGraph = useCallback(async (artists: string, isRegeneration: boolean = false, graphToEnhance?: GraphData | null) => {
    if (!user && (isRegeneration || !window.location.hash.includes('?'))) {
      // Only gate if it's a manual action (regeneration or fresh start)
      // Imports (via deep links) are allowed for guests
      console.log(`[Lazy Registration] Queueing generateGraph for guest. User: ${!!user}`);
      setPendingAuthAction({ type: 'generateGraph', payload: { artists, isRegeneration, graphToEnhance } });
      handleLogin();
      return;
    }

    const artistList = artists.split('::').map(a => a.trim()).filter(Boolean);
    if (artistList.length > 25) { setError(`Limit: 25 artists.`); return; }
    if (abortControllerRef.current) abortControllerRef.current.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setActiveNodes(prev => {
      const currentActiveIds = new Set(prev.map(n => n.id.toLowerCase()));
      const nextActive = [...prev];

      // Ensure all current seeds are in the active list
      artistList.forEach(name => {
        if (!currentActiveIds.has(name.toLowerCase())) {
          console.log(`[Graph Generation] Syncing Seed to Active:`, name);
          nextActive.push({ id: name, type: 'artist' as any, group: 0 });
        }
      });
      return nextActive;
    });
    let pruned: GraphData | undefined = undefined;
    if (graphToEnhance && graphToEnhance.nodes && graphToEnhance.nodes.length > 0) {
      const seedsLower = new Set(artists.split('::').map(a => a.trim().toLowerCase()));
      const seedNodes = graphToEnhance.nodes.filter(node => node.type === 'artist' && seedsLower.has(node.id.toLowerCase()));
      const seedNodesIds = new Set(seedNodes.map(n => n.id));
      if (seedNodesIds.size > 0) {
        const relevant = new Set<string>(seedNodesIds);
        graphToEnhance.links.forEach(l => {
          const s = typeof l.source === 'string' ? l.source : l.source.id, t = typeof l.target === 'string' ? l.target : l.target.id;
          if (seedNodesIds.has(s)) relevant.add(t); if (seedNodesIds.has(t)) relevant.add(s);
        });
        pruned = {
          nodes: graphToEnhance.nodes.filter(n => relevant.has(n.id)), links: graphToEnhance.links.filter(l => {
            const s = typeof l.source === 'string' ? l.source : l.source.id, t = typeof l.target === 'string' ? l.target : l.target.id;
            return relevant.has(s) && relevant.has(t);
          })
        };
      }
    }
    if (pruned) {
      pruned = filterGraphByDiscoveryFilters(pruned, discoveryFilters, artists);
    }

    setIsLoading(true); setError(null); setSeedArtists(artists);

    if (discoveryFilters.foundedAfter) {
      showToast(`Discovery Mode: Filtering artists founded after ${discoveryFilters.foundedAfter}...`);
    }

    try {
      const graphPromise = generateGraphData(artists, pruned, discoveryFilters);
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("The AI is taking too long to respond. The request has timed out.")), 120000)
      );

      const startTime = Date.now();
      const newData = await Promise.race([graphPromise, timeoutPromise]) as GraphData;
      console.log(`[Music Discovery] AI generated graph in ${((Date.now() - startTime) / 1000).toFixed(1)}s`);

      if (controller.signal.aborted) return;
      if (!newData || !newData.nodes || !newData.links) {
        throw new Error("The AI returned formless data. Please try again with different artists.");
      }

      const returnedIds = new Set(newData.nodes.map(n => n.id.toLowerCase()));
      let maxG = newData.nodes.reduce((m, n) => Math.max(m, n.group || 0), 0);
      artistList.forEach(name => { if (!returnedIds.has(name.toLowerCase())) { maxG++; newData.nodes.push({ id: name, type: 'artist', group: maxG }); } });
      let final = pruned ? mergeGraphData(pruned, newData) : newData;
      final = filterGraphByDiscoveryFilters(final, discoveryFilters, artists);
      setGraphData(final);

      // Update active nodes metadata from the final graph, ensuring all seeds are present
      setActiveNodes(prev => {
        const currentActive = [...prev];

        // Map current seeds first to maintain their presence and update them
        const seedMapped = artistList.map(name => {
          const match = final.nodes.find(fn => fn.id.toLowerCase() === name.toLowerCase());
          return (match || { id: name, type: 'artist' as any, group: 0 }) as Node;
        });

        const seedIds = new Set(seedMapped.map(s => s.id.toLowerCase()));
        const finalActive = [...seedMapped];

        // Add back other previously active nodes that aren't seeds (e.g. manual discoveries)
        currentActive.forEach(p => {
          if (!seedIds.has(p.id.toLowerCase())) {
            const match = final.nodes.find(fn => fn.id.toLowerCase() === p.id.toLowerCase());
            finalActive.push(match || p);
            seedIds.add(p.id.toLowerCase());
          }
        });

        return finalActive;
      });
    } catch (err: any) {
      if (err.name !== 'AbortError' && !controller.signal.aborted) {
        setError(humanizeError(err));
        setIsLoading(false);
      }
    } finally {
      if (abortControllerRef.current === controller) {
        setIsLoading(false);
      }
    }
  }, [user, discoveryFilters, showToast, humanizeError, handleLogin]);


  useEffect(() => {
    // Health Check
    const runHealthCheck = async () => {
      try {
        console.log('[HealthCheck] Attempting Firestore connection test...');
        const connectionPromise = getDocFromServer(doc(db, 'test', 'connection'));
        const connectionTimeout = new Promise((_, reject) => setTimeout(() => reject(new Error("Health check timeout")), 5000));

        await Promise.race([connectionPromise, connectionTimeout]);
        setIsFirebaseReady(true);
        console.log('[HealthCheck] Firestore Status: Connected');
      } catch (error: any) {
        console.warn("[HealthCheck] Health check failed or timed out. Proceeding with fallback state.");
        setIsFirebaseReady(true); // Fallback: allow attempts anyway
      }
    };
    runHealthCheck();

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setIsAuthInitialized(true);

      if (currentUser) {
        console.log(`[HealthCheck] Authenticated as: ${currentUser.uid}`);

        // Sync user profile
        try {
          const userRef = doc(db, 'users', currentUser.uid);
          const userSnap = await getDocFromCache(userRef).catch(() => getDocFromServer(userRef)).catch(() => null);

          if (!userSnap || !userSnap.exists()) {
            // New user initialization
            await setDoc(userRef, {
              email: currentUser.email,
              displayName: currentUser.displayName,
              photoURL: currentUser.photoURL,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          } else {
            // Existing user sync - update profile info from Auth
            await updateDoc(userRef, {
              displayName: currentUser.displayName,
              photoURL: currentUser.photoURL,
              updatedAt: serverTimestamp(),
            });
          }
        } catch (err) {
          console.error("Error syncing user profile:", err);
        }
      } else {
        console.log('[HealthCheck] Public/Guest Access Mode');
        if (currentViewRef.current === View.Graph && !window.location.hash.includes('?')) {
          authRedirectPathRef.current = window.location.hash;
          setCurrentView(View.Home);
          window.location.hash = '#/';
        }
      }
    });
    return () => unsubscribe();
  }, []);

  // Sync user profile and fetch extended data (Real-Time)
  useEffect(() => {
    if (!user || !isAuthInitialized || !isFirebaseReady) return;

    const userRef = doc(db, 'users', user.uid);
    const unsubscribe = onSnapshot(userRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();

        // Use functional state updates and stringified checks to avoid loop if data same
        setProfile((prev: any) => JSON.stringify(prev) === JSON.stringify(data) ? prev : data);

        if (data.libraryArtists) {
          try {
            const parsedLib: ParsedArtist[] = JSON.parse(data.libraryArtists);
            const normalized = parsedLib.map(a => ({ ...a, dateAdded: a.dateAdded ? new Date(a.dateAdded) : null }));
            setLibraryArtists((prev) => JSON.stringify(prev) === JSON.stringify(normalized) ? prev : normalized);
          } catch (e) {
            console.error("Failed to parse library artists:", e);
          }
        }
      }
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, `users/${user.uid}`);
    });

    return () => unsubscribe();
  }, [user, isAuthInitialized, isFirebaseReady]);

  useEffect(() => {
    if (isAuthInitialized && user && pendingAuthAction) {
      const { type, payload } = pendingAuthAction;
      setPendingAuthAction(null);

      console.log(`[Lazy Registration] Executing pending action: ${type}`);
      if (type === 'toggleStack') {
        handleToggleStack(payload.node, payload.link);
      } else if (type === 'generateGraph') {
        handleGenerateGraph(payload.artists, payload.isRegeneration, payload.graphToEnhance);
      } else if (type === 'saveToDashboard') {
        handleSaveToDashboard();
      }
    }
  }, [user, isAuthInitialized, pendingAuthAction, handleToggleStack, handleGenerateGraph, handleSaveToDashboard]);

  const hasInitialRedirectOccurredRef = useRef(false);

  // Handle post-auth redirection after connection is verified
  useEffect(() => {
    if (isAuthInitialized && user && isFirebaseReady && currentView === View.Home && !hasInitialRedirectOccurredRef.current) {
      // If we already have a meaningful hash, don't override it with the default redirect
      const currentHash = window.location.hash;
      if (currentHash && currentHash !== '#/' && currentHash !== '#') {
        console.log('[HealthCheck] Auth Ready. Preserving existing hash:', currentHash);
        hasInitialRedirectOccurredRef.current = true;
        return;
      }

      console.log('[HealthCheck] Auth and Firebase Ready. Redirecting to user destination...');
      const targetHash = authRedirectPathRef.current || '#/dashboard';
      window.location.hash = targetHash;
      authRedirectPathRef.current = null;
      hasInitialRedirectOccurredRef.current = true;
    }
  }, [isAuthInitialized, user, isFirebaseReady, currentView]);

  // Sync stack from Firestore
  useEffect(() => {
    if (!isAuthInitialized || !isFirebaseReady) return;

    if (!user) {
      setStack([]);
      return;
    }

    console.log(`[Database Sync] Starting real-time stack listener for UID: ${user.uid}`);
    const q = query(collection(db, 'users', user.uid, 'stack'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items: StackItem[] = [];
      snapshot.forEach((doc) => {
        items.push(doc.data() as StackItem);
      });
      console.log(`[Database Sync] Stack updated. Remote count: ${items.length} | UID: ${user.uid}`);
      // Sort by dateSaved locally for UI consistency if needed
      setStack(items.sort((a, b) => b.dateSaved - a.dateSaved));
    }, (error) => {
      console.error(`[Database Sync] STACK LISTENER ERROR for UID: ${user.uid}`);
      handleFirestoreError(error, OperationType.LIST, `users/${user.uid}/stack`);
    });

    return () => unsubscribe();
  }, [user, isAuthInitialized, isFirebaseReady]);

  // Sync projects list (Dashboard)
  useEffect(() => {
    if (!user || !isAuthInitialized || !isFirebaseReady) return;
    const q = query(collection(db, 'users', user.uid, 'projects'), orderBy('updatedAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snap) => {
      const projs: Project[] = [];
      snap.forEach(docSnap => projs.push({ id: docSnap.id, ...docSnap.data() } as Project));
      setProjects(projs);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, `users/${user.uid}/projects`);
    });
    return () => unsubscribe();
  }, [user, isAuthInitialized, isFirebaseReady]);

  // Re-hydrate and Sync current project from Firestore (Real-Time)
  useEffect(() => {
    if (!isAuthInitialized || !isFirebaseReady || !currentProjectId) {
      if (!currentProjectId) {
        // Clear ephemeral state if no project selected
        setGraphData(null);
        setSeedArtists('');
        setActiveNodes([]);
        setDetailsCache(new Map());
        setChatHistories(new Map());
        setCurrentProjectOwnerId(null);
      }
      return;
    }

    let isMounted = true;
    const unsubscribeList: (() => void)[] = [];

    const handleSnap = (snap: any) => {
      if (!isMounted || !snap.exists()) return false;

      const data = snap.data();
      setCurrentProjectOwnerId(data.authorId || null);

      if (data.name !== undefined) setProjectName(data.name);

      if (data.graphData) {
        try {
          const g = JSON.parse(data.graphData);
          // Map structure cleanup for D3 compatibility
          g.links = g.links.map((l: any) => ({
            ...l,
            source: typeof l.source === 'object' ? l.source.id : l.source,
            target: typeof l.target === 'object' ? l.target.id : l.target
          }));
          g.nodes.forEach((n: any) => { n.fx = null; n.fy = null; });

          setGraphData((prev: any) => JSON.stringify(prev) === JSON.stringify(g) ? prev : g);
          if (data.seedArtists) setSeedArtists((prev: any) => prev === data.seedArtists ? prev : data.seedArtists);

          if (data.discoveryFilters) {
            const parsedFilters = typeof data.discoveryFilters === 'string' && data.discoveryFilters.startsWith('{') ? JSON.parse(data.discoveryFilters) : null;
            if (parsedFilters) setDiscoveryFilters((prev: any) => JSON.stringify(prev) === JSON.stringify(parsedFilters) ? prev : parsedFilters);
          }
          if (data.lastViewedStackCount !== undefined) setLastViewedStackCount((prev: any) => prev === data.lastViewedStackCount ? prev : data.lastViewedStackCount);

          if (data.detailsCache) {
            try {
              const newCacheMap = new Map<string, NodeDetails>(JSON.parse(data.detailsCache));
              setDetailsCache((prev) => {
                if (prev.size !== newCacheMap.size) return newCacheMap;
                return JSON.stringify(Array.from(prev.entries())) === data.detailsCache ? prev : newCacheMap;
              });
            } catch (e) { console.error("Details cache parse fail", e); }
          }
          if (data.chatHistories) {
            try {
              const newChatsMap = new Map<string, ChatMessage[]>(JSON.parse(data.chatHistories));
              setChatHistories((prev) => {
                if (prev.size !== newChatsMap.size) return newChatsMap;
                return JSON.stringify(Array.from(prev.entries())) === data.chatHistories ? prev : newChatsMap;
              });
            } catch (e) { console.error("Chat histories parse fail", e); }
          }

          if (data.activeNodes && Array.isArray(data.activeNodes)) {
            const activeIds = new Set(data.activeNodes.map((item: any) => typeof item === 'string' ? item : item.id));
            const nextActive = g.nodes.filter((n: any) => activeIds.has(n.id));
            setActiveNodes((prev: any) => {
              if (prev.length !== nextActive.length) return nextActive;
              return JSON.stringify(prev.map((n: any) => n.id)) === JSON.stringify(nextActive.map((n: any) => n.id)) ? prev : nextActive;
            });
          }

          if (data.isMagazineViewOpen !== undefined) {
            setIsMagazineViewOpen(prev => prev === data.isMagazineViewOpen ? prev : data.isMagazineViewOpen);
          }
        } catch (err) {
          console.error("Failed to parse project data:", err);
        }
      }
      return true; // Found
    };

    const loadProject = async () => {
      try {
        console.log(`[ProjectLoader] Attempting to load project: ${currentProjectId}`);

        // 1. Try Shared Zcenes (top-level)
        const shareRef = doc(db, 'sharedZcenes', currentProjectId);
        try {
          const shareSnap = await getDoc(shareRef);
          if (!isMounted) return;
          if (handleSnap(shareSnap)) {
            console.log(`[ProjectLoader] Found in sharedZcenes`);
            return;
          }
        } catch (e) {
          console.log(`[ProjectLoader] Shared probe failed or denied`);
        }

        // 2. Try Projects (top-level flat)
        const flatProjectRef = doc(db, 'projects', currentProjectId);
        try {
          const flatSnap = await getDoc(flatProjectRef);
          if (!isMounted) return;
          if (handleSnap(flatSnap)) {
            console.log(`[ProjectLoader] Found in top-level projects, setting up real-time sync`);
            const unsub = onSnapshot(flatProjectRef, handleSnap, (err) => {
              if (isMounted && err.code !== 'permission-denied') handleFirestoreError(err, OperationType.GET, `projects/${currentProjectId}`);
            });
            unsubscribeList.push(unsub);
            return;
          }
        } catch (e) {
          console.log(`[ProjectLoader] Flat probe failed or denied`);
        }

        // 3. Try User-owned projects (if logged in)
        if (user) {
          const userProjectRef = doc(db, 'users', user.uid, 'projects', currentProjectId);
          try {
            const userSnap = await getDoc(userProjectRef);
            if (!isMounted) return;
            if (handleSnap(userSnap)) {
              console.log(`[ProjectLoader] Found in user projects, setting up real-time sync`);
              const unsub = onSnapshot(userProjectRef, handleSnap, (err) => {
                if (isMounted && err.code !== 'permission-denied') handleFirestoreError(err, OperationType.GET, `users/${user.uid}/projects/${currentProjectId}`);
              });
              unsubscribeList.push(unsub);
              return;
            }
          } catch (e) {
            console.log(`[ProjectLoader] My projects probe failed or denied`);
          }
        }

        console.log(`[ProjectLoader] Project not found in any accessible location.`);
      } catch (err) {
        if (isMounted) {
          console.error(`[ProjectLoader] Failure loading ${currentProjectId}:`, err);
        }
      }
    };

    loadProject();

    return () => {
      isMounted = false;
      unsubscribeList.forEach(u => u());
    };
  }, [user, isAuthInitialized, isFirebaseReady, currentProjectId]);


  // Save Current Project to Firestore (Silent background task)
  useEffect(() => {
    if (!user || !isFirebaseReady || !isAuthInitialized || !currentProjectId || isGuest) return;
    if (!graphData) return;

    const timer = setTimeout(async () => {
      const projectPath = `users/${user.uid}/projects/${currentProjectId}`;
      try {
        isHydratingSessionRef.current = true;

        console.log(`[Database Reporter] Attempting PROJECT SAVE | Path: ${projectPath}`);
        await setDoc(doc(db, projectPath), {
          graphData: JSON.stringify(graphData),
          seedArtists,
          discoveryFilters: JSON.stringify(discoveryFilters),
          lastViewedStackCount,
          activeNodes: activeNodes.map(n => n.id),
          isMagazineViewOpen: isMagazineViewOpen && activeNodes.length > 0,
          detailsCache: JSON.stringify(Array.from(detailsCache.entries())),
          chatHistories: JSON.stringify(Array.from(chatHistories.entries())),
          authorId: user.uid,
          updatedAt: serverTimestamp(),
        }, { merge: true });

        console.log(`[Database Reporter] SUCCESS: Project synced.`);
        setTimeout(() => { isHydratingSessionRef.current = false; }, 1000);
      } catch (err) {
        console.error(`[Database Reporter] PROJECT SAVE FAILED: ${projectPath}`);
        isHydratingSessionRef.current = false;
      }
    }, 3000);

    return () => clearTimeout(timer);
  }, [user, isFirebaseReady, isAuthInitialized, currentProjectId, graphData, seedArtists, discoveryFilters, activeNodes, isMagazineViewOpen, detailsCache, chatHistories, lastViewedStackCount]);

  const lastProcessedHashRef = useRef<string>('');
  const lastProcessedSelectedRef = useRef<string | null>(null);
  const lastProcessedSessionKeyRef = useRef<string>('');

  useEffect(() => {
    const processDeepLink = async () => {
      const hash = window.location.hash || '#/';
      const isAppPath = hash.startsWith('#/app');
      const isDashboardPath = hash.startsWith('#/dashboard');
      const isProjectPath = hash.startsWith('#/z/');

      // --- ROUTING LOGIC ---
      if (isAppPath || isDashboardPath || isProjectPath || hash.startsWith('#/help') || hash.startsWith('#/design') || hash.startsWith('#/engine')) {
        // Optimization: Pre-capture hash for redirection if auth is not ready
        if (!isAuthInitialized) {
          authRedirectPathRef.current = hash;
          return;
        }

        const params = new URLSearchParams(hash.split('?')[1] || '');
        const projectIdFromQuery = params.get('id') || params.get('projectId');
        const shareIdFromQuery = params.get('shareId');

        // Allow access to app if we have a deep link ID, even if not logged in
        if (!user && !projectIdFromQuery && !shareIdFromQuery) {
          authRedirectPathRef.current = hash;
          if (currentViewRef.current !== View.Home) {
            setCurrentView(View.Home);
            window.location.hash = '#/';
          }
          return;
        }

        if (user && !isFirebaseReady) return;

        if (isDashboardPath) {
          if (currentViewRef.current !== View.Dashboard) {
            setCurrentView(View.Dashboard);
            setCurrentProjectId(null);
            setCurrentProjectOwnerId(null);
          }
        } else if (isProjectPath || projectIdFromQuery || shareIdFromQuery) {
          const projectId = projectIdFromQuery || shareIdFromQuery || hash.split('#/z/')[1]?.split('?')[0];
          if (projectId) {
            if (currentViewRef.current !== View.Graph || currentProjectIdRef.current !== projectId) {
              setCurrentProjectId(projectId);
              setCurrentView(View.Graph);
            }
          }
        } else if (isAppPath) {
          // Fallback for old /app link - redirect to dashboard if logged in
          if (user) window.location.hash = '#/dashboard';
          else setCurrentView(View.Graph);
        } else if (hash.startsWith('#/help')) {
          if (currentViewRef.current !== View.Help) setCurrentView(View.Help);
        } else if (hash.startsWith('#/design')) {
          if (isAdmin) {
            if (currentViewRef.current !== View.StyleGuide) setCurrentView(View.StyleGuide);
          } else {
            setCurrentView(View.Home);
          }
        } else if (hash.startsWith('#/engine')) {
          if (isAdmin) {
            if (currentViewRef.current !== View.Engine) setCurrentView(View.Engine);
          } else {
            setCurrentView(View.Home);
          }
        }

        // Only initialize empty graph if it's actually null (initial state)
        if (graphData === null) {
          setGraphData({ nodes: [], links: [] });
        }
      } else if (hash.startsWith('#/source')) {
        if (currentViewRef.current !== View.Engine) setCurrentView(View.Engine);
      } else {
        if (currentViewRef.current !== View.Home) setCurrentView(View.Home);
      }

      // --- PARAMETER PROCESSING ---
      const authKey = user ? user.uid : 'guest';
      const sessionKey = `${hash}-${authKey}`;

      if (hash === lastProcessedHashRef.current && sessionKey === lastProcessedSessionKeyRef.current && isAuthInitialized) {
        // Check if we still need to process 'selected' because graphData just arrived
        const params = new URLSearchParams(hash.split('?')[1] || '');
        const selected = params.get('selected');
        if (selected && selected !== lastProcessedSelectedRef.current && graphData) {
          const node = graphData.nodes.find(n => n.id.toLowerCase() === selected.toLowerCase());
          if (node) {
            lastProcessedSelectedRef.current = selected;
            handleNodeClick(node);
          }
        }
        return;
      }

      lastProcessedHashRef.current = hash;
      lastProcessedSessionKeyRef.current = sessionKey;
      if (!hash.includes('?')) return;

      const params = new URLSearchParams(hash.split('?')[1] || '');
      const seeds = params.get('seeds'), origin = params.get('origin'), selected = params.get('selected');
      const shareId = params.get('shareId') || params.get('id');

      if (origin) setUrlOriginHint(origin);

      // Handle Share Import
      if (shareId && shareId !== lastProcessedSeedsRef.current && !isLoading) {
        lastProcessedSeedsRef.current = shareId;
        setIsLoading(true);
        try {
          console.log(`[Router] Importing Share: ${shareId}`);
          const shareRef = doc(db, 'sharedZcenes', shareId);
          const shareSnap = await getDoc(shareRef);
          if (shareSnap.exists()) {
            const data = shareSnap.data();
            const g = JSON.parse(data.graphData);
            g.links = g.links.map((l: any) => ({
              ...l,
              source: typeof l.source === 'object' ? l.source.id : l.source,
              target: typeof l.target === 'object' ? l.target.id : l.target
            }));
            g.nodes.forEach((n: any) => { n.fx = null; n.fy = null; });

            setGraphData(g);
            setSeedArtists(data.seedArtists);
            if (data.detailsCache) setDetailsCache(new Map(JSON.parse(data.detailsCache)));
            if (data.activeNodes && Array.isArray(data.activeNodes)) {
              const activeIds = new Set((data.activeNodes as string[]).map(id => id.toLowerCase()));
              setActiveNodes(g.nodes.filter((n: any) => activeIds.has(n.id.toLowerCase())));
            }
            showToast("Zcene Imported");
          } else {
            setError("Shared Zcene not found.");
          }
        } catch (err) {
          console.error("Import failed:", err);
        } finally {
          setIsLoading(false);
        }
        return;
      }

      // Handle Seed Import
      if (seeds && seeds !== seedArtists && seeds !== lastProcessedSeedsRef.current && !isLoading) {
        lastProcessedSeedsRef.current = seeds;
        handleGenerateGraph(seeds);
      }

      // Handle selected node from URL
      if (selected && selected !== lastProcessedSelectedRef.current && graphData) {
        const node = graphData.nodes.find(n => n.id.toLowerCase() === selected.toLowerCase());
        if (node) {
          lastProcessedSelectedRef.current = selected;
          handleNodeClick(node);
        }
      }
    };
    processDeepLink();
    window.addEventListener('hashchange', processDeepLink);
    return () => window.removeEventListener('hashchange', processDeepLink);
  }, [handleGenerateGraph, seedArtists, isLoading, graphData, handleNodeClick, isAuthInitialized, user, isFirebaseReady, showToast, isAdmin]);

  const handleCloseNode = useCallback((nodeId: string) => {
    setActiveNodes(prev => {
      const idx = prev.findIndex(n => n.id.toLowerCase() === nodeId.toLowerCase());
      if (idx === -1) return prev;
      const next = prev.filter((_, i) => i !== idx);
      if (selectedNode?.id.toLowerCase() === nodeId.toLowerCase()) setSelectedNode(next.length ? next[Math.min(idx, next.length - 1)] : null);
      return next;
    });
  }, [selectedNode]);

  const handleRefreshNode = useCallback((nodeId: string) => setDetailsCache(prev => { const n = new Map(prev); n.delete(nodeId); return n; }), []);
  const handleExtendNode = useCallback(async (node: Node) => {
    if (!graphData) return;

    // 1. Mark the parent node as a seed if it's an artist
    if (node.type === 'artist') {
      const currentSeeds = seedArtists.split('::').map(s => s.trim().toLowerCase()).filter(Boolean);
      if (!currentSeeds.includes(node.id.toLowerCase())) {
        setSeedArtists(prev => prev ? `${prev}::${node.id}` : node.id);
      }
    }

    // 2. Add a temporary loading node connected to the parent
    const loadingNodeId = `loading-${Date.now()}`;
    const loadingNode: Node = {
      id: loadingNodeId,
      label: 'Discovering...',
      type: 'artist',
      group: node.group,
      isLoading: true,
      x: node.x,
      y: node.y
    };

    setGraphData(prev => {
      if (!prev) return prev;
      return {
        nodes: [...prev.nodes, loadingNode],
        links: [...prev.links, { source: node.id, target: loadingNodeId, value: 1 }]
      };
    });

    try {
      const extension = await extendGraphFromNode(node, graphData);

      setGraphData(prev => {
        if (!prev) return prev;
        // Remove loading node and link
        const filteredNodes = prev.nodes.filter(n => n.id !== loadingNodeId);
        const filteredLinks = prev.links.filter(l => {
          const s = typeof l.source === 'string' ? l.source : (l.source as Node).id;
          const t = typeof l.target === 'string' ? l.target : (l.target as Node).id;
          return s !== loadingNodeId && t !== loadingNodeId;
        });

        const base = { nodes: filteredNodes, links: filteredLinks };
        return mergeGraphData(base, extension);
      });

      // Show toast for the new discovery
      const newArtist = extension.nodes.find(n => n.type === 'artist');
      if (newArtist) {
        showToast(`Discovered ${newArtist.id}`);
      }

    } catch (err: any) {
      setError(humanizeError(err));
      // Cleanup loading node on error
      setGraphData(prev => {
        if (!prev) return prev;
        return {
          nodes: prev.nodes.filter(n => n.id !== loadingNodeId),
          links: prev.links.filter(l => {
            const s = typeof l.source === 'string' ? l.source : (l.source as Node).id;
            const t = typeof l.target === 'string' ? l.target : (l.target as Node).id;
            return s !== loadingNodeId && t !== loadingNodeId;
          })
        };
      });
    }
  }, [graphData, seedArtists, showToast, humanizeError]);

  const handleRemoveNode = useCallback((node: Node) => {
    setGraphData(prev => {
      if (!prev) return prev;

      // 1. Remove the node
      const filteredNodes = prev.nodes.filter(n => n.id !== node.id);

      // 2. Remove all links connected to this node
      const filteredLinks = prev.links.filter(l => {
        const s = typeof l.source === 'string' ? l.source : (l.source as Node).id;
        const t = typeof l.target === 'string' ? l.target : (l.target as Node).id;
        return s !== node.id && t !== node.id;
      });

      // 3. Optional: Cleanup orphaned attribute nodes (genre, label, etc.)
      // We'll keep them for now as they might be connected to other artists

      return { nodes: filteredNodes, links: filteredLinks };
    });

    if (selectedNode?.id === node.id) {
      setSelectedNode(null);
    }

    showToast(`Removed ${node.label || node.id}`);
  }, [selectedNode, showToast]);

  const fetchingNodeIdsRef = useRef<Set<string>>(new Set());
  const lastProgressTimestampRef = useRef<number>(Date.now());

  // Watchdog to prevent stuck queue
  useEffect(() => {
    const checkStuck = setInterval(() => {
      if (isFetchingDetailsRef.current && (Date.now() - lastProgressTimestampRef.current > 15000)) {
        console.warn("[Deep Cut Queue] Watchdog detected stuck loop. Resetting.");
        isFetchingDetailsRef.current = false;
        // Also clear any loading IDs that have been there too long
        setLoadingNodeIds(prev => {
          if (prev.size > 0) return new Set();
          return prev;
        });
      }
    }, 5000);
    return () => clearInterval(checkStuck);
  }, []);

  useEffect(() => {
    const fetch = async () => {
      const nodes = activeNodes.filter(n => !detailsCache.has(n.id) && !fetchingNodeIdsRef.current.has(n.id));
      if (!nodes.length || isFetchingDetailsRef.current) return;
      isFetchingDetailsRef.current = true;
      lastProgressTimestampRef.current = Date.now();

      try {
        for (const node of nodes) {
          if (detailsCache.has(node.id) || fetchingNodeIdsRef.current.has(node.id)) continue;

          fetchingNodeIdsRef.current.add(node.id);
          setLoadingNodeIds(prev => new Set(prev).add(node.id));
          lastProgressTimestampRef.current = Date.now();

          let retries = 0, max = 3, success = false;
          while (retries < max && !success) {
            try {
              if (!graphData) throw new Error("No data");

              // Individual node timeout (45s) to prevent the whole queue from hanging
              const nodeDetailsPromise = fetchNodeDetails(node, graphData, seedArtists, urlOriginHint);
              const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error("Request timed out after 45s")), 45000)
              );

              const details = await Promise.race([nodeDetailsPromise, timeoutPromise]) as NodeDetails;

              setDetailsCache(prev => new Map(prev).set(node.id, details));
              success = true;
              lastProgressTimestampRef.current = Date.now();
              await wait(1000);
            } catch (err: any) {
              const isRate = err?.message?.includes('429') || err?.message?.includes('RESOURCE_EXHAUSTED');
              const isTimeout = err?.message?.includes('timed out');

              if (isRate && retries < max - 1) {
                retries++;
                await wait(Math.pow(2, retries) * 1000 + Math.random() * 1000);
              } else if (isTimeout && retries < max - 1) {
                retries++;
                console.warn(`[Deep Cut Queue] Node ${node.id} timed out. Retry ${retries}/${max}`);
                await wait(1000);
              } else {
                console.error(`[Deep Cut Queue] Failed for node ${node.id}:`, err);
                if (selectedNode?.id === node.id) setDetailsError(humanizeError(err));
                break;
              }
            }
          }
          fetchingNodeIdsRef.current.delete(node.id);
          setLoadingNodeIds(prev => { const next = new Set(prev); next.delete(node.id); return next; });
          lastProgressTimestampRef.current = Date.now();
        }
      } finally { isFetchingDetailsRef.current = false; }
    };
    fetch();
  }, [activeNodes, detailsCache, graphData, seedArtists, selectedNode, urlOriginHint, humanizeError]);

  const handleViewChange = useCallback((newView: View) => {
    if (newView === View.Graph && !graphData) setGraphData({ nodes: [], links: [] });
    const h = {
      [View.Graph]: '#/app',
      [View.Dashboard]: '#/dashboard',
      [View.Help]: '#/help',
      [View.StyleGuide]: isAdmin ? '#/designsystem' : '#/',
      [View.Engine]: isAdmin ? '#/engine' : '#/',
      [View.Home]: '#/'
    }[newView];
    if (window.location.hash !== h) window.location.hash = h;
  }, [graphData, isAdmin]);

  const handleCancel = useCallback(() => { if (abortControllerRef.current) { abortControllerRef.current.abort(); setIsLoading(false); abortControllerRef.current = null; } }, []);

  return (
    <div className="h-[100dvh] flex flex-col overflow-hidden" key={refreshKey}>
      {/* Loading Sliver */}
      {(isLoading || loadingNodeIds.size > 0) && (
        <div className="fixed top-0 left-0 w-full h-[2px] z-[200] overflow-hidden pointer-events-none">
          <div className="h-full bg-primary animate-[loading-sliver_2s_infinite_linear] w-[30%] shadow-[0_0_10px_#F6E468]" />
        </div>
      )}
      <AnimatePresence>
        {error && (
          <ErrorOverlay
            message={error}
            onClose={() => {
              setError(null);
              setDetailsError(null);
              setLoadingNodeIds(new Set());
              setActiveNodes([]);
              setSelectedNode(null);
            }}
            onRetryKey={handleSelectKey}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {toast && <Toast key={toast.id} message={toast.message} onClose={() => setToast(null)} />}
      </AnimatePresence>
      <div className="flex-grow relative overflow-hidden h-full">
        <div className={`absolute inset-0 transition-opacity duration-300 ${currentView === View.Home ? 'z-10' : 'z-0 opacity-0 pointer-events-none'}`}>
          <HomePage
            onNavigate={handleViewChange}
            hasExistingGraph={projects.length > 0}
            isActive={currentView === View.Home}
            user={user}
            isAuthInitialized={isAuthInitialized}
            onLogin={handleLogin}
            onLogout={handleLogout}
            isAdmin={isAdmin}
          />
        </div>
        <div className={`absolute inset-0 transition-opacity duration-300 ${currentView === View.Dashboard ? 'z-10' : 'z-0 opacity-0 pointer-events-none'}`}>
          <Dashboard
            user={user}
            projects={projects}
            stack={stack}
            isStackNew={stack.length > lastViewedStackCount}
            onSelectProject={(id) => window.location.hash = `#/z/${id}`}
            onCreateProject={handleCreateProject}
            isCreatingProject={isCreatingProject}
            onDeleteProject={handleDeleteProject}
            onLogoClick={() => handleViewChange(View.Home)}
            onLogout={handleLogout}
            onDeleteAccount={handleDeleteAccount}
            isAdmin={isAdmin}
            isProfileOpen={isProfileOpen}
            setIsProfileOpen={setIsProfileOpen}
            isDeleteAccountModalOpen={isDeleteAccountModalOpen}
            setIsDeleteAccountModalOpen={setIsDeleteAccountModalOpen}
            isSmallScreen={isSmallScreen}
            onOpenStack={handleOpenStack}
            isMenuOpen={isMenuOpen}
            setIsMenuOpen={setIsMenuOpen}
            onNavigate={handleMenuNavigate}
          />
        </div>
        <div className={`absolute inset-0 transition-opacity duration-300 ${currentView === View.Graph ? 'z-10' : 'z-0 opacity-0 pointer-events-none'}`}>
          {graphData && (
            <GraphPage
              data={graphData} baseGraph={baseGraph} libraryArtists={libraryArtists} seedArtists={seedArtists}
              onRegenerate={(n) => handleGenerateGraph(n, true, graphData)} isLoading={isLoading}
              onCancelGeneration={handleCancel} onFileUpload={(f) => {
                const r = new FileReader(); r.onload = (e) => {
                  const t = e.target?.result as string;
                  try {
                    let res: ParsedResult;
                    if (f.name.endsWith('.xml')) res = parseAppleMusicXml(t);
                    else if (f.name.endsWith('.csv')) res = parseCsvData(t);
                    else res = { artists: Array.from(new Set(t.split(/[\n,]+/))).map(n => ({ name: n.trim(), dateAdded: null })).filter(a => a.name), baseGraph: { nodes: [], links: [] } };
                    setLibraryArtists(res.artists); setBaseGraph(res.baseGraph);
                    if (res.artists.length && user) {
                      setDoc(doc(db, 'users', user.uid), {
                        libraryArtists: JSON.stringify(res.artists)
                      }, { merge: true }).catch(console.error);
                    }
                  } catch (err: any) { setError(err.message); }
                }; r.readAsText(f);
              }}
              onNodeClick={handleNodeClick} selectedNode={selectedNode} activeNodes={activeNodes}
              detailsCache={detailsCache} loadingNodeIds={loadingNodeIds} onCloseNode={handleCloseNode}
              onRefreshNode={handleRefreshNode} detailsError={detailsError} systemError={error}
              onLogoClick={() => window.location.hash = '#/dashboard'}
              onNavigate={handleMenuNavigate} onClearLibrary={handleClearLib} onClearZcene={handleClearZcene}
              isActive={currentView === View.Graph} chatHistories={chatHistories} onUpdateChatHistories={setChatHistories}
              onShowToast={showToast} onRefreshUI={handleRefreshUI} stack={stack} onToggleStack={handleToggleStack}
              onShareZcene={handleTriggerShareModal} isSharingZcene={isSharing}
              onDeleteAccount={handleDeleteAccount}
              isAdmin={isAdmin}
              lastViewedStackCount={lastViewedStackCount} onUpdateLastViewedStackCount={setLastViewedStackCount}
              discoveryFilters={discoveryFilters} onUpdateDiscoveryFilters={setDiscoveryFilters}
              isMagazineViewOpen={isMagazineViewOpen} onUpdateIsMagazineViewOpen={setIsMagazineViewOpen}
              onExtendNode={handleExtendNode} onRemoveNode={handleRemoveNode}
              user={user} isGuest={isGuest}
              profile={profile}
              projectName={displayProjectName}
              onProjectNameChange={handleUpdateProjectName}
              onUpdateProfile={handleUpdateProfile}
              isAuthInitialized={isAuthInitialized}
              onLogin={handleLogin} onLogout={handleLogout}
              onSaveToDashboard={handleSaveToDashboard}
              isProfileOpen={isProfileOpen}
              setIsProfileOpen={setIsProfileOpen}
              isDeleteAccountModalOpen={isDeleteAccountModalOpen}
              setIsDeleteAccountModalOpen={setIsDeleteAccountModalOpen}
              isStackDialogOpen={isStackDialogOpen}
              setIsStackDialogOpen={setIsStackDialogOpen}
              isMenuOpen={isMenuOpen}
              setIsMenuOpen={setIsMenuOpen}
            />
          )}
        </div>
        <div className={`absolute inset-0 transition-opacity duration-300 ${currentView === View.Help ? 'z-10' : 'z-0 opacity-0 pointer-events-none'}`}>
          <HelpPage
            onNavigate={handleViewChange}
            isActive={currentView === View.Help}
            isAdmin={isAdmin}
            onClose={() => {
              if (currentProjectId) {
                setCurrentView(View.Graph);
                window.location.hash = `#/z/${currentProjectId}`;
              } else {
                setCurrentView(View.Dashboard);
                window.location.hash = '#/dashboard';
              }
            }}
          />
        </div>
        <div className={`absolute inset-0 transition-opacity duration-300 ${currentView === View.Engine ? 'z-10' : 'z-0 opacity-0 pointer-events-none'}`}>
          <EnginePage
            onNavigate={handleViewChange}
            isActive={currentView === View.Engine}
            profile={profile}
            onUpdateProfile={handleUpdateProfile}
          />
        </div>
        <div className={`absolute inset-0 transition-opacity duration-300 ${currentView === View.StyleGuide ? 'z-10' : 'z-0 opacity-0 pointer-events-none'}`}>
          <StyleGuidePage
            onNavigate={handleViewChange}
            isActive={currentView === View.StyleGuide}
            onShowToast={showToast}
            profile={profile}
            onUpdateProfile={handleUpdateProfile}
          />
        </div>
      </div>

      {/* Global Modals */}
      <AnimatePresence>
        {isDeleteAccountModalOpen && (
          <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="w-full max-w-sm rounded-[32px] bg-zinc-900 border border-zinc-800 p-8 shadow-2xl relative overflow-hidden"
            >
              {isDeletingAccount && (
                <div className="absolute top-0 left-0 w-full h-1 bg-zinc-800 overflow-hidden">
                  <div className="h-full bg-primary animate-[loading-sliver_1.5s_infinite_linear] w-[40%]" />
                </div>
              )}

              <div className="w-16 h-16 rounded-2xl bg-red-500/10 flex items-center justify-center text-red-500 mb-6">
                <span className="material-symbols-outlined !text-[32px]">warning</span>
              </div>

              <h3 className="text-xl font-bold text-white mb-3">Delete Account?</h3>
              <p className="text-zinc-400 text-sm mb-3 leading-relaxed">
                This will permanently delete your profile, projects, saved stack, and all active sessions. This action is irreversible.
              </p>

              {error && (
                <div className="mb-6 p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-medium leading-relaxed">
                  {error}
                </div>
              )}

              <div className="flex flex-col gap-3">
                <button
                  disabled={isDeletingAccount}
                  onClick={handleDeleteAccount}
                  className="w-full py-4 rounded-2xl bg-red-600 hover:bg-red-500 text-white font-bold transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 flex items-center justify-center gap-2 shadow-lg shadow-red-900/20"
                >
                  {isDeletingAccount ? (
                    <>
                      <Spinner className="w-4 h-4 text-white" />
                      Deleting...
                    </>
                  ) : (
                    'Delete Forever'
                  )}
                </button>
                <button
                  disabled={isDeletingAccount}
                  onClick={() => setIsDeleteAccountModalOpen(false)}
                  className="w-full py-4 rounded-2xl border border-zinc-800 text-zinc-400 font-bold hover:bg-zinc-800 hover:text-white transition-all disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <MyStackDialog
        isOpen={isStackDialogOpen}
        onClose={() => {
          handleCloseModals();
          if (stack.length !== lastViewedStackCount) {
            setLastViewedStackCount(stack.length);
            if (user && currentProjectId) {
              setDoc(doc(db, 'users', user.uid, 'projects', currentProjectId), {
                lastViewedStackCount: stack.length,
                updatedAt: serverTimestamp()
              }, { merge: true });
            }
          }
        }}
        stack={stack}
        onRemove={(node) => handleToggleStack(node)}
        onView={(id) => {
          if (id) {
            const node = graphData?.nodes.find(n => n.id.toLowerCase() === id.toLowerCase());
            if (node) {
              handleNodeClick(node);
              if (currentView !== View.Graph) {
                setCurrentView(View.Graph);
                if (currentProjectId) window.location.hash = `#/z/${currentProjectId}`;
              }
            }
          }
        }}
        onAddArtist={(name) => {
          const newSeeds = seedArtists ? `${seedArtists}::${name}` : name;
          handleGenerateGraph(newSeeds, true);
        }}
        seedArtists={(seedArtists || "").split('::').filter(Boolean)}
      />

      <ShareModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        shareUrl={activeShareUrl || ''}
      />
    </div>
  );
};

export default App;
