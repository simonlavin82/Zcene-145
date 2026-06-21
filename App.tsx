
import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertCircle, X, CheckCircle2, Key } from 'lucide-react';
import { GraphData, Node, ParsedArtist, Link, View, NodeDetails, ChatMessage, StackItem, DiscoveryFilters, Project, ArtistCacheEntry, COST_PER_AI_CALL } from './types';
import { generateGraphData, fetchNodeDetails, extendGraphFromNode } from './services/geminiService';
import { normalizeArtistId, readArtistCacheMany, writeArtistCacheMany, assembleGraphFromCache, incrementCacheHit, readLegacyArtistCache, normalizeGraphData, extractArtistSubGraph, isCacheExpired, getArtistDocWithRedirect, titleCaseArtistId } from './services/artistCacheService';
import { auth, signInWithGoogle, logout, onAuthStateChanged, User, db, handleFirestoreError, OperationType } from './services/firebase';
import { collection, doc, setDoc, deleteDoc, onSnapshot, query, getDocFromServer, serverTimestamp, addDoc, getDoc, getDocs, orderBy, where, writeBatch, getDocFromCache, updateDoc, increment } from 'firebase/firestore';
const StyleGuidePage = React.lazy(() => import('./components/DesignSystem').then(m => ({ default: m.StyleGuidePage })));
const EnginePage = React.lazy(() => import('./components/EnginePage').then(m => ({ default: m.EnginePage })));
const UsageAnalyticsPage = React.lazy(() => import('./components/UsageAnalyticsPage').then(m => ({ default: m.UsageAnalyticsPage })));
import HelpPage from './components/HelpPage';
import GraphPage from './components/GraphPage';
import HomePage from './components/HomePage';
import Dashboard from './components/Dashboard';
import { MyStackDialog, HeaderMenu, TokenConfirmationDialog, CacheChoiceDialog } from './components/SharedModals';

import { ShareModal } from './components/ShareModal';
import { analyticsService } from './services/analyticsService';
import { ZceneLogo, Spinner } from './components/Icons';
import CookieConsent from './components/CookieConsent';

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
      links.push({ source: trimmedSource, target: trimmedTarget, value: 1, context: "performs style" });
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
      links.push({ source: trimmedSource, target: trimmedTarget, value: 1, context: "performs style" });
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
  if (!filters.foundedAfter && !filters.foundedBefore && (!filters.includeOrigins || filters.includeOrigins.length === 0) && (!filters.excludeOrigins || filters.excludeOrigins.length === 0) && (!filters.includeGenres || filters.includeGenres.length === 0)) return data;

  const seedArtistIds = new Set(seedArtists.split('::').map(a => a.trim().toLowerCase()));
  const nodesToRemove = new Set<string>();

  // Map artists to their founded years, origins, and genres from the graph
  const artistToYear = new Map<string, number>();
  const artistToOrigins = new Map<string, Set<string>>();
  const artistToGenres = new Map<string, Set<string>>();
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
      } else if (targetNode?.type === 'genre') {
        if (!artistToGenres.has(sourceId.toLowerCase())) artistToGenres.set(sourceId.toLowerCase(), new Set());
        artistToGenres.get(sourceId.toLowerCase())!.add(targetNode.id.toLowerCase());
      }
    } else if (targetNode?.type === 'artist') {
      if (sourceNode?.type === 'founded') {
        const year = parseInt(sourceNode.id);
        if (!isNaN(year)) artistToYear.set(targetId.toLowerCase(), year);
      } else if (sourceNode?.type === 'country') {
        if (!artistToOrigins.has(targetId.toLowerCase())) artistToOrigins.set(targetId.toLowerCase(), new Set());
        artistToOrigins.get(targetId.toLowerCase())!.add(sourceNode.id.toLowerCase());
      } else if (sourceNode?.type === 'genre') {
        if (!artistToGenres.has(targetId.toLowerCase())) artistToGenres.set(targetId.toLowerCase(), new Set());
        artistToGenres.get(targetId.toLowerCase())!.add(sourceNode.id.toLowerCase());
      }
    }
  });

  data.nodes.forEach(node => {
    if (node.type === 'artist' && !seedArtistIds.has(node.id.toLowerCase())) {
      // Year Filter (Min Year)
      if (filters.foundedAfter) {
        const threshold = Number(filters.foundedAfter);
        const year = artistToYear.get(node.id.toLowerCase());
        if (year && year <= threshold) {
          nodesToRemove.add(node.id);
          return;
        }
      }

      // Year Filter (Max Year)
      if (filters.foundedBefore) {
        const maxThreshold = Number(filters.foundedBefore);
        const year = artistToYear.get(node.id.toLowerCase());
        if (year && year >= maxThreshold) {
          nodesToRemove.add(node.id);
          return;
        }
      }

      // Genre Include Filter
      if (filters.includeGenres && filters.includeGenres.length > 0) {
        const genres = artistToGenres.get(node.id.toLowerCase());
        const allowed = filters.includeGenres.map(g => g.toLowerCase());
        if (genres) {
          const hasAllowed = Array.from(genres).some(g => 
            allowed.some(allowedGenre => g.includes(allowedGenre) || allowedGenre.includes(g))
          );
          if (!hasAllowed) {
            nodesToRemove.add(node.id);
            return;
          }
        } else {
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

const areFiltersEqual = (f1?: any, f2?: any): boolean => {
  const clean1 = f1 || {};
  const clean2 = f2 || {};
  
  const keys = ['foundedAfter', 'foundedBefore', 'additionalInstructions'];
  for (const key of keys) {
    if ((clean1[key] ?? '') !== (clean2[key] ?? '')) return false;
  }
  
  const arrayKeys = ['includeOrigins', 'excludeOrigins', 'includeGenres'];
  for (const key of arrayKeys) {
    const arr1 = Array.isArray(clean1[key]) ? clean1[key] : [];
    const arr2 = Array.isArray(clean2[key]) ? clean2[key] : [];
    if (arr1.length !== arr2.length) return false;
    const sorted1 = [...arr1].sort();
    const sorted2 = [...arr2].sort();
    for (let i = 0; i < sorted1.length; i++) {
      if (sorted1[i] !== sorted2[i]) return false;
    }
  }
  
  return true;
};

const mergeGraphData = (base: GraphData, enhancement: GraphData): GraphData => {
  if (!base || !base.nodes) return enhancement || { nodes: [], links: [] };
  if (!enhancement || !enhancement.nodes) return base || { nodes: [], links: [] };

  const combinedNodes = [...base.nodes];
  const combinedLinks = [...(base.links || [])];
  const nodeMap = new Map<string, Node>(combinedNodes.map(n => [n.id.toLowerCase(), n]));

  // Update existing nodes or add new ones
  enhancement.nodes.forEach(newNode => {
    const normalizedId = newNode.id.toLowerCase();
    const existingNode = nodeMap.get(normalizedId);
    if (existingNode) {
      if (existingNode.id !== newNode.id) {
        const oldId = existingNode.id, newId = newNode.id;
        combinedLinks.forEach(link => {
          if (typeof link.source === 'string') {
            if (link.source.toLowerCase() === oldId.toLowerCase()) link.source = newId;
          } else if (typeof link.source === 'object' && link.source !== null) {
            if ((link.source as Node).id.toLowerCase() === oldId.toLowerCase()) (link.source as Node).id = newId;
          }

          if (typeof link.target === 'string') {
            if (link.target.toLowerCase() === oldId.toLowerCase()) link.target = newId;
          } else if (typeof link.target === 'object' && link.target !== null) {
            if ((link.target as Node).id.toLowerCase() === oldId.toLowerCase()) (link.target as Node).id = newId;
          }
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

  // Track existing links in a Map for fast lookup and property overwriting
  const linkMap = new Map<string, Link>();
  combinedLinks.forEach(l => {
    const sId = (typeof l.source === 'string' ? l.source : (l.source as Node).id).toLowerCase();
    const tId = (typeof l.target === 'string' ? l.target : (l.target as Node).id).toLowerCase();
    const linkId = [sId, tId].sort().join('--');
    linkMap.set(linkId, l);
  });

  enhancement.links.forEach(newLink => {
    const sourceId = (typeof newLink.source === 'string' ? newLink.source : (newLink.source as Node).id).toLowerCase();
    const targetId = (typeof newLink.target === 'string' ? newLink.target : (newLink.target as Node).id).toLowerCase();
    if (nodeMap.has(sourceId) && nodeMap.has(targetId)) {
      const linkId = [sourceId, targetId].sort().join('--');
      const existingLink = linkMap.get(linkId);
      const correctSource = nodeMap.get(sourceId)!.id;
      const correctTarget = nodeMap.get(targetId)!.id;

      if (existingLink) {
        // Casing and property updates: Ensure the link points to the nodeMap's canonical cased ID
        if (typeof existingLink.source === 'string') {
          existingLink.source = correctSource;
        } else if (typeof existingLink.source === 'object' && existingLink.source !== null) {
          (existingLink.source as Node).id = correctSource;
        }

        if (typeof existingLink.target === 'string') {
          existingLink.target = correctTarget;
        } else if (typeof existingLink.target === 'object' && existingLink.target !== null) {
          (existingLink.target as Node).id = correctTarget;
        }

        // Overwrite existing properties with new ones, specifically the context string
        if (newLink.context) {
          existingLink.context = newLink.context;
        }
      } else {
        const linkToPush: Link = {
          ...newLink,
          source: correctSource,
          target: correctTarget
        };
        combinedLinks.push(linkToPush);
        linkMap.set(linkId, linkToPush);
      }
    }
  });

  return { nodes: combinedNodes, links: combinedLinks };
};

const pruneGraphToSeeds = (graph: GraphData, seedNamesLower: Set<string>): GraphData => {
  if (!graph || !graph.nodes || graph.nodes.length === 0) {
    return { nodes: [], links: [] };
  }

  // Find all actual seed nodes matching the lowercase seed names.
  const seedNodes = graph.nodes.filter(node => 
    node.type === 'artist' && seedNamesLower.has(node.id.toLowerCase())
  );
  
  if (seedNodes.length === 0) {
    return { nodes: [], links: [] };
  }

  // Build adjacency list
  const adj = new Map<string, string[]>();
  graph.nodes.forEach(n => adj.set(n.id, []));
  (graph.links || []).forEach(l => {
    const s = typeof l.source === 'string' ? l.source : (l.source as Node).id;
    const t = typeof l.target === 'string' ? l.target : (l.target as Node).id;
    // Defensive check: only record edge if both nodes exist in the graph.
    if (adj.has(s) && adj.has(t)) {
      adj.get(s)!.push(t);
      adj.get(t)!.push(s);
    }
  });

  // BFS traversal
  const queue: string[] = seedNodes.map(n => n.id);
  const visited = new Set<string>(queue);
  let head = 0;
  while (head < queue.length) {
    const curr = queue[head++];
    const neighbors = adj.get(curr) || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
  }

  const prunedNodes = graph.nodes.filter(n => visited.has(n.id));
  const prunedLinks = (graph.links || []).filter(l => {
    const s = typeof l.source === 'string' ? l.source : (l.source as Node).id;
    const t = typeof l.target === 'string' ? l.target : (l.target as Node).id;
    return visited.has(s) && visited.has(t);
  });

  return { nodes: prunedNodes, links: prunedLinks };
};

const applyHumanCasedLabels = (graph: GraphData, seedsStr: string): GraphData => {
  if (!graph || !graph.nodes) return graph;
  const originalSeeds = seedsStr.split('::').map(s => s.trim()).filter(Boolean);
  const originalSeedMap = new Map<string, string>();
  originalSeeds.forEach(s => {
    originalSeedMap.set(normalizeArtistId(s), s);
  });

  const updatedNodes = graph.nodes.map(n => {
    if (n.type === 'artist') {
      const norm = normalizeArtistId(n.id);
      const rawSeed = originalSeedMap.get(norm);
      if (rawSeed) {
        return { ...n, label: rawSeed };
      }
    }
    return n;
  });

  return {
    ...graph,
    nodes: updatedNodes
  };
};

const toTitleCase = (str: string): string => {
  if (!str) return '';
  return str
    .split(' ')
    .map(word => {
      return word
        .split('-')
        .map(seg => seg.charAt(0).toUpperCase() + seg.slice(1))
        .join('-');
    })
    .join(' ');
};

// Hardened check for purely lowercase string values
const isPurelyLowercase = (str: any): boolean => {
  if (!str || typeof str !== 'string') return false;
  const trimmed = str.trim();
  return trimmed.length > 0 && trimmed === trimmed.toLowerCase() && /[a-z]/.test(trimmed);
};

const getNodeLabel = (node: Node, seedList: string[], detailsCache?: Map<string, NodeDetails>): string => {
  if (node.type === 'artist') {
    const normId = normalizeArtistId(node.id);
    const seedMatch = seedList.find(s => normalizeArtistId(s) === normId);
    if (seedMatch) return seedMatch;

    if (detailsCache) {
      const cached = detailsCache.get(node.id) || 
                     detailsCache.get(node.id.toLowerCase()) || 
                     detailsCache.get(normId);
      const cachedName = cached?.details?.artist;
      if (cachedName) return cachedName;
    }
  }

  const rawLabel = node.label || titleCaseArtistId(node.id) || '';

  if (rawLabel === rawLabel.toLowerCase()) {
    return toTitleCase(rawLabel);
  }

  return rawLabel;
};

const checkIsProfileIncomplete = (node: Node, details: NodeDetails | null | undefined): boolean => {
  // Hardened artist node check: treat as artist if type matches OR if type is missing but we have artist details
  const isArtist = node.type === 'artist' || !node.type || details?.details?.artist !== undefined;
  if (!details || !isArtist) return false;

  const SENTINEL_INSIGHT = 'No insight provided.';

  // Hardened check for missing, null, or any "Unknown" variant
  const isInvalidOrUnknown = (val: any): boolean => {
    if (val === null || val === undefined) return true;
    if (typeof val === 'string') {
      const clean = val.trim().toLowerCase();
      return (
        clean === '' ||
        clean.includes('unknown') ||
        clean === 'n/a' ||
        clean === 'none' ||
        clean === 'null' ||
        clean === 'undefined' ||
        clean.includes('not available') ||
        clean.includes('placeholder')
      );
    }
    return false;
  };

  // Fallback chain normalization: try details field first, then node label
  let displayTitle = details.details?.artist || node.label;
  if (!displayTitle || displayTitle.toLowerCase() === node.id.toLowerCase()) {
    // Extract exact casing of the artist name from the biography summary if present
    const spacedId = node.id.replace(/[-_]+/g, ' ').trim();
    if (details.summary) {
      const idx = details.summary.toLowerCase().indexOf(spacedId.toLowerCase());
      if (idx !== -1) {
        displayTitle = details.summary.substring(idx, idx + spacedId.length);
      }
    }
    // Fall back to title-casing the spaced ID if not found in the summary
    if (!displayTitle || displayTitle.toLowerCase() === node.id.toLowerCase()) {
      displayTitle = titleCaseArtistId(node.id);
    }
  }

  // 1. Core structural property validation (All fields must exist and be valid)
  const genreEmpty      = isInvalidOrUnknown(details.details?.genre);
  const originEmpty     = isInvalidOrUnknown(details.details?.origin);
  const foundedEmpty    = isInvalidOrUnknown(details.details?.founded);
  const artistNameEmpty  = isInvalidOrUnknown(details.details?.artist || displayTitle);
  // Only flag insightEmpty if the field was explicitly synthesized with a sentinel/low-quality value.
  // Absent (undefined) or empty ("") fields — legacy Firestore records pre-dating this schema field —
  // are non-blocking and must not trigger a re-synthesis loop.
  // Truth table: undefined → false, "" → false, "No insight provided." → true, real content → false.
  const insightEmpty    = typeof details.recommendationReason === 'string' &&
                          details.recommendationReason.trim().length > 0 &&
                          details.recommendationReason.trim().toLowerCase() === SENTINEL_INSIGHT.toLowerCase();

  // 2. Lowercase identifier validation (Check display title, details artist, and first bolded summary word)
  // Guard: single-word artist names with no spaces or hyphens (e.g. "buggin", "zulu", "scowl") are
  // legitimate all-lowercase names, NOT corruption signals. Only flag multi-word or hyphenated names.
  const isSingleWordName = !displayTitle.includes(' ') && !displayTitle.includes('-');
  const isLabelLower    = !isSingleWordName && isPurelyLowercase(displayTitle);
  const isArtistNameLower = !isSingleWordName && isPurelyLowercase(details.details?.artist || displayTitle);
  
  // Find all bolded terms in summary (e.g. "**scowl**", "**alternative rock**")
  const boldMatches     = details.summary ? Array.from(details.summary.matchAll(/\*\*([^*]+)\*\*/g)) : [];
  
  // Compare bolded terms to the normalized displayTitle to find the one representing the artist
  const cleanCompare    = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const artistClean     = cleanCompare(displayTitle);
  const matchingBold    = boldMatches.find(m => cleanCompare(m[1]) === artistClean);
  
  // Check if the matched bolded artist name is purely lowercase.
  // Single-word names are exempt here too — only multi-word bold leaks are meaningful.
  const isBoldBioNameLower = matchingBold && !isSingleWordName ? isPurelyLowercase(matchingBold[1]) : false;
  
  const isLowercasedMarker = isLabelLower || isArtistNameLower || isBoldBioNameLower;

  // 3. Syntax leak check
  const hasSyntaxLeak   = !!(details.summary && /\*{1,2}[^*]+\*{1,2}/.test(details.summary) && isBoldBioNameLower);

  // 4. Repeating generic template/placeholder pattern check
  const PLACEHOLDER_PHRASES = [
    "is a notable music entity",
    "stylistic contributions, helping shape the sonic evolution",
    "sandbox mock",
    "test scenarios"
  ];
  const hasPlaceholderPattern = !!(details.summary && PLACEHOLDER_PHRASES.some(phrase => 
    details.summary.toLowerCase().includes(phrase.toLowerCase())
  ));

  // 🚨 Self-Healing Check: Catch legacy entries missing core Phase 3 schema fields
  const hasNoCuratorQuote = !details.recommendationReason || details.recommendationReason.trim() === "";
  const hasNoMediaSearchQuery = !details.youtubeSearchQuery || details.youtubeSearchQuery.trim() === "";

  if (hasNoCuratorQuote || hasNoMediaSearchQuery) {
    console.log(`[Self-Healing Alarm] Triggering update pass for legacy profile fields.`);
    return true; // Force validation failure to open the API optimization modal
  }

  return (
    genreEmpty ||
    originEmpty ||
    foundedEmpty ||
    artistNameEmpty ||
    insightEmpty ||
    isLowercasedMarker ||
    hasPlaceholderPattern
  );
};

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

interface CacheValidationResult {
  isFullyQualified: boolean;
  needsPeerBands: boolean;
  needsFutureFields: boolean;
}

const validateCacheEntry = (data: any): CacheValidationResult => {
  if (!data) {
    return { isFullyQualified: false, needsPeerBands: false, needsFutureFields: false };
  }

  let needsPeerBands = false;
  let needsFutureFields = false;

  // 1. Verify graphData layout is non-empty and has nodes
  if (!data.graphData) {
    return { isFullyQualified: false, needsPeerBands: false, needsFutureFields: false };
  }

  try {
    const graph = typeof data.graphData === 'string' ? JSON.parse(data.graphData) : data.graphData;
    if (!graph || !graph.nodes || !Array.isArray(graph.nodes) || graph.nodes.length === 0) {
      return { isFullyQualified: false, needsPeerBands: false, needsFutureFields: false };
    }
    
    // Check if there are peer bands (multiple artist nodes)
    const artistNodes = graph.nodes.filter((n: any) => n.type === 'artist');
    if (artistNodes.length <= 1) {
      needsPeerBands = true;
    }

    // Check if links exist and if any of them are missing context or use low-value literal fallbacks
    const graphLinks = graph.links || [];
    if (graphLinks.length > 0) {
      const hasInvalidContext = graphLinks.some((l: any) => {
        if (!l.context || typeof l.context !== 'string') return true;
        const normalizedContext = l.context.trim().toLowerCase();
        return (
          normalizedContext === '' ||
          normalizedContext.includes('is connected to') ||
          normalizedContext.includes('is musically related to')
        );
      });
      if (hasInvalidContext) {
        needsFutureFields = true;
      }
    }
  } catch (e) {
    return { isFullyQualified: false, needsPeerBands: false, needsFutureFields: false };
  }

  // 2. Verify detailsCache exists, parses correctly, and has a populated bio/summary
  if (!data.detailsCache) {
    return { isFullyQualified: false, needsPeerBands: true, needsFutureFields: false };
  }

  try {
    const parsed = typeof data.detailsCache === 'string' ? JSON.parse(data.detailsCache) : data.detailsCache;
    let targetObj = parsed;
    
    // Support legacy Map serialization format: Array of [key, value] pairs
    if (Array.isArray(parsed) && parsed.length > 0) {
      if (Array.isArray(parsed[0]) && parsed[0].length === 2) {
        targetObj = parsed[0][1];
      } else {
        targetObj = parsed[0];
      }
    }

    const bio = targetObj?.summary || targetObj?.bio || targetObj?.description || targetObj?.text || '';
    if (!bio || bio.trim().length <= 5 || bio.includes('sandbox mock') || bio.includes('test scenarios')) {
      return { isFullyQualified: false, needsPeerBands: false, needsFutureFields: false };
    }

    // Future-proof placeholder: check if there's any links array (as an example of future properties)
    const links = targetObj?.links || [];
    if (!links || links.length === 0) {
      needsFutureFields = true;
    }
  } catch (e) {
    return { isFullyQualified: false, needsPeerBands: false, needsFutureFields: false };
  }

  // A document is fully qualified if it has no deficiencies
  const isFullyQualified = !needsPeerBands && !needsFutureFields;

  return {
    isFullyQualified,
    needsPeerBands,
    needsFutureFields
  };
};

const isCacheEntryFullyQualified = (data: any): boolean => {
  return validateCacheEntry(data).isFullyQualified;
};

/**
 * Lightweight check used exclusively in handleExtendNode.
 * A single-node sub-graph written by writeArtistCacheMany is structurally
 * correct for canvas merging even though it contains only 1 artist node.
 * isCacheEntryFullyQualified would reject it (peer-band check) — this
 * function only asks: "is there usable graphData?"
 */
const isGraphDataPresent = (data: any): boolean => {
  if (!data?.graphData) return false;
  try {
    const g = typeof data.graphData === 'string' ? JSON.parse(data.graphData) : data.graphData;
    if (!Array.isArray(g?.nodes) || g.nodes.length === 0) return false;
    
    // Reject graph cache if links are missing the context property
    const links = g.links || [];
    if (links.length > 0) {
      const hasMissingContext = links.some((l: any) => !l.context || typeof l.context !== 'string' || l.context.trim() === '');
      if (hasMissingContext) return false;
    }
    return true;
  } catch { return false; }
};

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<View>(View.Home);
  const currentViewRef = useRef<View>(View.Home);

  const navigate = useCallback((path: string, replace = false) => {
    if (replace) {
      window.history.replaceState(null, '', path);
    } else {
      window.history.pushState(null, '', path);
    }
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, []);
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const currentProjectIdRef = useRef<string | null>(null);
  const [currentProjectOwnerId, setCurrentProjectOwnerId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState<string>('');
  const [previousWorkspace, setPreviousWorkspace] = useState<{ view: View; projectId: string | null } | null>(null);
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
  const healedDetailsCacheRef = useRef<Map<string, NodeDetails>>(new Map());
  const [detailsCache, setDetailsCacheState] = useState<Map<string, NodeDetails>>(new Map());
  const setDetailsCache = useCallback((updater: Map<string, NodeDetails> | ((prev: Map<string, NodeDetails>) => Map<string, NodeDetails>)) => {
    setDetailsCacheState(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      const merged = new Map(next);
      healedDetailsCacheRef.current.forEach((v, k) => {
        merged.set(k, v);
      });
      return merged;
    });
  }, []);
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
  const [isExitBlockerModalOpen, setIsExitBlockerModalOpen] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [isAuthInitialized, setIsAuthInitialized] = useState(false);
  const [isFirebaseReady, setIsFirebaseReady] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [activeShareUrl, setActiveShareUrl] = useState<string | null>(null);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [currentCacheKey, setCurrentCacheKey] = useState<string | null>(null);
  const [isStackDialogOpen, setIsStackDialogOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const isAdmin = useMemo(() => {
    if (!user || !user.email) return false;
    const email = user.email.toLowerCase();
    return email === 'zcene.online@gmail.com';
  }, [user]);
  const [pendingAuthAction, setPendingAuthAction] = useState<{ type: string; payload: any } | null>(null);
  const [tokenConfirmation, setTokenConfirmation] = useState<{
    isOpen: boolean;
    type: 'generation' | 'extension' | 'deep_cut_creation' | 'partial_synthesis' | 'cache_upgrade' | 'data_quality_optimization';
    cost: number;
    cachedArtists: string[];
    missingArtists: string[];
    enrichmentArtists?: string[];
    onConfirm: () => void;
    onCancel: () => void;
  } | null>(null);
  const [cacheChoiceDialog, setCacheChoiceDialog] = useState<{
    isOpen: boolean;
    artists: string[];
    cost: number;
    onSelect: (choice: 'cache' | 'synthesis' | 'cancel') => void;
  } | null>(null);

  const confirmTokenUsage = useCallback((
    type: 'generation' | 'extension' | 'deep_cut_creation' | 'partial_synthesis' | 'cache_upgrade' | 'data_quality_optimization',
    cachedArtists: string[],
    missingArtists: string[],
    enrichmentArtists?: string[]
  ) => {
    return new Promise<boolean>((resolve) => {
      setTokenConfirmation({
        isOpen: true,
        type,
        cost: COST_PER_AI_CALL,
        cachedArtists,
        missingArtists,
        enrichmentArtists,
        onConfirm: () => {
          setTokenConfirmation(null);
          resolve(true);
        },
        onCancel: () => {
          setTokenConfirmation(null);
          resolve(false);
        }
      });
    });
  }, []);

  const confirmCacheChoice = useCallback((artists: string[]) => {
    return new Promise<'cache' | 'synthesis' | 'cancel'>((resolve) => {
      setCacheChoiceDialog({
        isOpen: true,
        artists,
        cost: COST_PER_AI_CALL,
        onSelect: (choice) => {
          setCacheChoiceDialog(null);
          resolve(choice);
        }
      });
    });
  }, []);

  const authRedirectPathRef = useRef<string | null>(null);
  const isHydratingSessionRef = useRef(false);

  const currentProjectOwnerIdRef = useRef<string | null>(null);
  const projectNameRef = useRef<string>('');
  const graphDataRef = useRef<GraphData | null>(null);
  const seedArtistsRef = useRef<string>('');
  const activeNodesRef = useRef<Node[]>([]);
  const detailsCacheRef = useRef<Map<string, NodeDetails>>(new Map());
  const chatHistoriesRef = useRef<Map<string, ChatMessage[]>>(new Map());
  const discoveryFiltersRef = useRef<DiscoveryFilters>({});
  const lastViewedStackCountRef = useRef<number>(0);
  const currentCacheKeyRef = useRef<string | null>(null);
  const evictedNodeIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => { currentProjectOwnerIdRef.current = currentProjectOwnerId; }, [currentProjectOwnerId]);
  useEffect(() => { projectNameRef.current = projectName; }, [projectName]);
  useEffect(() => { graphDataRef.current = graphData; }, [graphData]);
  useEffect(() => { seedArtistsRef.current = seedArtists; }, [seedArtists]);
  useEffect(() => { activeNodesRef.current = activeNodes; }, [activeNodes]);
  useEffect(() => { detailsCacheRef.current = detailsCache; }, [detailsCache]);
  useEffect(() => { chatHistoriesRef.current = chatHistories; }, [chatHistories]);
  useEffect(() => { discoveryFiltersRef.current = discoveryFilters; }, [discoveryFilters]);
  useEffect(() => { lastViewedStackCountRef.current = lastViewedStackCount; }, [lastViewedStackCount]);
  useEffect(() => { currentCacheKeyRef.current = currentCacheKey; }, [currentCacheKey]);

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
  const fetchingNodeIdsRef = useRef<Set<string>>(new Set());
  const lastProgressTimestampRef = useRef<number>(Date.now());

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

    // EXPLICITLY RESET CANVAS STATE IMMEDIATELY (Fixing state leak from previous guest projects)
    setGraphData({ nodes: [], links: [] });
    setSeedArtists('');
    setActiveNodes([]);
    setDetailsCache(new Map());
    setChatHistories(new Map());
    setCurrentCacheKey(null);

    // Update route immediately
    navigate(`/z/${newId}`);
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
    // 1. Robust Check for existing Share ID (Path or Params)
    const pathname = window.location.pathname;
    const params = new URLSearchParams(window.location.search);
    
    // Check /z/ID pattern (used for both projects and shares)
    let existingShareId = null;
    if (pathname.startsWith('/z/')) {
      existingShareId = pathname.split('/z/')[1];
    }
    
    // Fallback to query params
    if (!existingShareId) {
      existingShareId = params.get('shareId') || params.get('id');
    }
    
    // If we are viewing a shared link (even as a guest), we can just reshare the existing ID
    if (existingShareId && isGuest) {
      console.log(`[Sharing] Resharing existing guest ID: ${existingShareId}`);
      return existingShareId;
    }

    if (isSharing) return null;

    // 2. Auth gating for NEW share generation
    if (!user) {
      setPendingAuthAction({ type: 'share', payload: null });
      handleLogin();
      return null;
    }

    if (!graphData) {
      showToast('No graph data to share!');
      return null;
    }

    if (!user.emailVerified) {
      setError("Your email must be verified to share Zcenes. Please check your inbox or sign in with a verified account.");
      return null;
    }

    setIsSharing(true);
    const path = 'sharedZcenes';
    try {
      // Build lightweight canvas layout — artist positions only
      const canvasLayout = graphData!.nodes
        .filter(n => n.type === 'artist')
        .map(n => ({ nodeId: n.id, x: n.x, y: n.y, fx: n.fx ?? null, fy: n.fy ?? null }));

      const sharePayload: Record<string, any> = {
        seedArtists,
        activeNodes: activeNodes.map(n => n.id),
        authorId: user.uid,
        createdAt: serverTimestamp(),
      };

      if (currentCacheKey) {
        // New format: store cacheKey + canvasLayout for fast hydration from artists cache.
        // Also include the full graphData as an inline fallback — guests can render the canvas
        // immediately even if the artists cache document is unavailable.
        sharePayload.cacheKey = currentCacheKey;
        sharePayload.canvasLayout = JSON.stringify(canvasLayout);
        sharePayload.graphData = JSON.stringify(graphData);
        sharePayload.detailsCache = JSON.stringify(Array.from(detailsCache.entries()));
      } else {
        // Fallback: no cache key, write full blobs directly
        sharePayload.graphData = JSON.stringify(graphData);
        sharePayload.detailsCache = JSON.stringify(Array.from(detailsCache.entries()));
      }


      const docRef = await addDoc(collection(db, path), sharePayload);

      const shareUrl = `${window.location.origin}/app?id=${docRef.id}`;
      try {
        await navigator.clipboard.writeText(shareUrl);
        showToast('Link copied to clipboard!');
      } catch (err) {
        console.error("Failed to copy link:", err);
        showToast(`Share created! ID: ${docRef.id}`);
      }

      return docRef.id;
    } catch (err) {
      // Gracefully handle Firestore errors (like Quota Exhausted)
      const errMessage = err instanceof Error ? err.message : String(err);
      if (errMessage.includes('resource-exhausted') || errMessage.includes('quota')) {
        showToast("Database quota reached. Please try again tomorrow.");
      } else {
        handleFirestoreError(err, OperationType.WRITE, path);
      }
      return null;
    } finally {
      setIsSharing(false);
    }
  }, [user, graphData, seedArtists, activeNodes, detailsCache, isSharing, currentCacheKey, showToast, handleLogin, isGuest]);


  const handleTriggerShareModal = useCallback(async () => {
    const shareId = await handleShareZcene();
    if (shareId) {
      const deepLink = `${window.location.origin}/app?shareId=${shareId}`;
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
        navigate('/dashboard');
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, path);
    }
  }, [user, currentProjectId, showToast]);

  const handleUpdateProjectName = useCallback(async (name: string) => {
    setProjectName(name);
    if (currentProjectId) {
      localStorage.setItem(`zcene_project_name_${currentProjectId}`, name);
      console.log(`[Offline Sandbox] Saved name to localStorage: ${name}`);
    }
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

  const handleRenameProject = useCallback(async (projectId: string, name: string) => {
    localStorage.setItem(`zcene_project_name_${projectId}`, name);
    console.log(`[Offline Sandbox] Saved name to localStorage for project ${projectId}: ${name}`);
    showToast("Zcene renamed (offline sandbox)");
    if (!user) return;
    const path = `users/${user.uid}/projects/${projectId}`;
    try {
      await setDoc(doc(db, 'users', user.uid, 'projects', projectId), {
        name,
        updatedAt: serverTimestamp()
      }, { merge: true });
      showToast("Zcene renamed");
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  }, [user, showToast]);

  const displayProjectName = useMemo(() => {
    if (projectName) return projectName;
    if (seedArtists) {
      const first = seedArtists.split('::')[0]?.trim();
      return first || 'Untitled Zcene';
    }
    return 'Untitled Zcene';
  }, [projectName, seedArtists]);

  useEffect(() => {
    if (seedArtists && (!projectName || projectName === 'Untitled Zcene')) {
      const first = seedArtists.split('::')[0]?.trim();
      if (first) {
        handleUpdateProjectName(first);
      }
    }
  }, [seedArtists, projectName, handleUpdateProjectName]);

  const handleUpdateProfile = useCallback(async (updates: any) => {
    if (!user) return;
    const path = `users/${user.uid}`;
    try {
      await setDoc(doc(db, 'users', user.uid), updates, { merge: true });
      setProfile(prev => prev ? { ...prev, ...updates } : updates);
      
      if (user.uid === 'mock-user-123') {
        const currentProfile = {
          displayName: 'Sandbox User',
          email: 'sandbox@zcene.online',
          onboardingProgress: { step1: true, step2: true, step3: true, step4: true, step5: true },
          ...profile,
          ...updates
        };
        localStorage.setItem(`zcene_mock_profile_${user.uid}`, JSON.stringify(currentProfile));
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  }, [user, profile]);

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
      case 'home': navigate('/'); break;
      case 'dashboard': navigate('/dashboard'); break;
      case 'help': navigate('/help'); break;
      case 'design': navigate('/design'); break;
      case 'engine': navigate('/engine'); break;
      case 'analytics': navigate('/analytics'); break;
      default: navigate('/');
    }
  }, [navigate]);

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
    if (window.location.search) {
      navigate(window.location.pathname);
    }
  }, [navigate]);

  const handleRefreshUI = useCallback(() => {
    setRefreshKey(prev => prev + 1);
    setIsStackDialogOpen(false);
    setIsMenuOpen(false);
  }, []);

  const restoreActiveNodesHelper = useCallback((activeNodesData: any[], graphNodes: Node[]): Node[] => {
    if (!activeNodesData || !Array.isArray(activeNodesData) || !graphNodes) return [];
    const normalizedGraphNodeMap = new Map<string, Node>();
    graphNodes.forEach((n: any) => {
      const normId = n.type === 'artist' ? normalizeArtistId(n.id) : n.id.trim().toLowerCase();
      normalizedGraphNodeMap.set(normId, n);
    });

    const activeNodesToRestore: Node[] = [];
    activeNodesData.forEach((item: any) => {
      const originalId = typeof item === 'string' ? item : item.id;
      if (!originalId) return;
      const asArtistNorm = normalizeArtistId(originalId);
      const asMetaNorm = originalId.trim().toLowerCase();
      
      const matchedNode = normalizedGraphNodeMap.get(asArtistNorm) || normalizedGraphNodeMap.get(asMetaNorm);
      if (matchedNode) {
        activeNodesToRestore.push(matchedNode);
      }
    });
    return activeNodesToRestore;
  }, []);


  const handleNodeClick = useCallback(async (node: Node | null) => {
    if (!node) {
       setSelectedNode(null);
       return;
    }

    if (node.id === selectedNode?.id) {
      return;
    }

    const isTransitioning = loadingNodeIds.has(node.id) || 
                            fetchingNodeIdsRef.current.has(node.id) || 
                            loadingNodeIds.has(node.id.toLowerCase()) || 
                            fetchingNodeIdsRef.current.has(node.id.toLowerCase()) ||
                            loadingNodeIds.has(normalizeArtistId(node.id)) || 
                            fetchingNodeIdsRef.current.has(normalizeArtistId(node.id));
    if (isTransitioning) {
       setSelectedNode(node);
       if (node.type !== 'founded') {
         setActiveNodes(prev => prev.some(n => n.id.toLowerCase() === node.id.toLowerCase()) ? prev : [...prev, node]);
       }
       return;
    }

    // 1. Prioritize the Local Details Map
    // IMPORTANT: Read from detailsCacheRef.current (the ref), NOT the `detailsCache` state
    // variable. The state variable is captured at callback creation time and is subject to
    // stale closure: if the user clicks a node before the React render cycle commits a
    // `setDetailsCache` update (e.g. immediately after batchHydrateDetailsCache resolves),
    // the closure still holds the old empty Map and the lookup returns undefined — causing
    // the Token Quota modal to fire even though the data is already in memory.
    // detailsCacheRef.current is always synchronously up-to-date (synced via useEffect).
    const cachedDetails = detailsCacheRef.current.get(node.id) || 
                          detailsCacheRef.current.get(node.id.toLowerCase()) || 
                          detailsCacheRef.current.get(normalizeArtistId(node.id)) ||
                          healedDetailsCacheRef.current.get(node.id) || 
                          healedDetailsCacheRef.current.get(node.id.toLowerCase()) || 
                          healedDetailsCacheRef.current.get(normalizeArtistId(node.id));
    
    // 2. Load Locally and Block the Network
    const isPlaceholderBio = cachedDetails && cachedDetails.summary && 
      (cachedDetails.summary.includes('sandbox mock') || cachedDetails.summary.includes('test scenarios'));
      
    if (cachedDetails && cachedDetails.summary && cachedDetails.summary.length >= 5 && !isPlaceholderBio && !checkIsProfileIncomplete(node, cachedDetails)) {
       const hydratedNode = {
          ...node,
          bio: cachedDetails.summary,
          summary: cachedDetails.summary,
          genre: cachedDetails.details?.genre || "",
          origin: cachedDetails.details?.origin || "",
          founded: cachedDetails.details?.founded || "",
          name: cachedDetails.details?.artist || node.id,
          isLibrary: true
       };
       
       setSelectedNode(hydratedNode);
       if (node.type !== 'founded') {
         setActiveNodes(prev => prev.some(n => n.id.toLowerCase() === node.id.toLowerCase()) ? prev : [...prev, node]);
       }
       incrementDeepCutsOpenedCount();
       
       // Force stop all loading indicators for this node
       fetchingNodeIdsRef.current.delete(node.id);
       setLoadingNodeIds(prev => { const next = new Set(prev); next.delete(node.id); return next; });
       return; // BLOCK network queue entirely
    } else if (cachedDetails) {
       console.log(`[Node Click Intercept] Incomplete/broken local profile detected for: ${node.id}`);
       const displayName = cachedDetails?.details?.artist || node.label || titleCaseArtistId(node.id);
       const confirmed = await confirmTokenUsage('data_quality_optimization', [], [displayName]);
       if (!confirmed) return; // Cancel: return early without rendering details
       
       const cacheId = normalizeArtistId(node.id);
       evictedNodeIdsRef.current.add(node.id);
       evictedNodeIdsRef.current.add(node.id.toLowerCase());
       evictedNodeIdsRef.current.add(cacheId);

       healedDetailsCacheRef.current.delete(node.id);
       healedDetailsCacheRef.current.delete(node.id.toLowerCase());
       healedDetailsCacheRef.current.delete(cacheId);

       // Synchronously clear the stale entries from detailsCacheRef.current
       detailsCacheRef.current.delete(node.id);
       detailsCacheRef.current.delete(node.id.toLowerCase());
       detailsCacheRef.current.delete(cacheId);

       setDetailsCache(prev => {
           const n = new Map(prev);
           n.delete(node.id);
           n.delete(node.id.toLowerCase());
           n.delete(cacheId);
           return n;
       });

       // Attempt to evict the stale Firestore document in the background (non-blocking)
       deleteDoc(doc(db, 'artists', cacheId))
         .then(() => console.log(`[Node Click Intercept] Evicted stale local Firestore cache for: ${cacheId}`))
         .catch((error: any) => {
           console.error(
               `[PERMISSIONS] deleteDoc failed for artists/${cacheId}:`,
               `code=${error?.code}`,
               `message=${error.message}`
           );
           updateDoc(doc(db, 'artists', cacheId), {
               detailsCache: '',
               cachedAt: serverTimestamp()
           }).then(() => console.log(`[Node Click Intercept] Fallback: Invalidated stale record in-place for: ${cacheId}`))
             .catch((fallbackError: any) => {
               console.error(
                   `[PERMISSIONS] updateDoc fallback also failed for artists/${cacheId}:`,
                   `code=${fallbackError?.code}`,
                   `message=${fallbackError.message}`
               );
             });
         });

       // Trigger spinner immediately
       setLoadingNodeIds(prev => new Set(prev).add(node.id));

       // Select the node so the sidebar shows and queue triggers a fresh live load
       setSelectedNode(node);
       if (node.type !== 'founded') {
         setActiveNodes(prev => prev.some(n => n.id.toLowerCase() === node.id.toLowerCase()) ? prev : [...prev, node]);
       }
       return;
    }
    
    // 2.5 GLOBAL ARTISTS FALLBACK
    // If the local detailsCache is empty (e.g. freshly loaded project), query the root artists collection directly.
    // Firestore stores detailsCache as a JSON string — parse it and unwrap any array wrapper layers.
    const isEvicted = evictedNodeIdsRef.current.has(node.id) || 
                      evictedNodeIdsRef.current.has(node.id.toLowerCase()) || 
                      evictedNodeIdsRef.current.has(normalizeArtistId(node.id));
    if (!isEvicted) {
        try {
            const standardizedId = normalizeArtistId(node.id);
            let globalDoc = await getArtistDocWithRedirect(standardizedId);
        
        if (globalDoc.exists()) {
            const data = globalDoc.data();
            if (data && data.detailsCache) {
                // Step 1: Parse the raw JSON string
                let parsed: any = data.detailsCache;
                try {
                    if (typeof parsed === 'string') parsed = JSON.parse(parsed);
                } catch(e) { console.warn("[Node Click] detailsCache JSON.parse failed", e); }
                
                // Step 2: Unwrap array wrapper if the schema is [{...}] instead of {...}
                if (Array.isArray(parsed) && parsed.length > 0) {
                    parsed = parsed[0];
                }
                
                // Step 3: Extract text values, checking multiple field name variants
                const bio = parsed?.summary || parsed?.bio || parsed?.description || parsed?.text || "";
                const imageUrl = parsed?.imageUrl || parsed?.image || "";
                const genre = parsed?.details?.genre || parsed?.genre || parsed?.genres || "";
                const origin = parsed?.details?.origin || parsed?.origin || parsed?.location || parsed?.country || "";
                const founded = parsed?.details?.founded || parsed?.founded || parsed?.formed || parsed?.year || "";
                const artistName = parsed?.details?.artist || parsed?.artist || parsed?.name || data.seedArtists || data.artistId || titleCaseArtistId(node.id);
                const notableArtists = parsed?.details?.notableArtists || parsed?.notableArtists || [];
                const members = parsed?.members || [];
                const links = parsed?.links || [];
                const discography = parsed?.discography || [];
                const tourInfo = parsed?.tourInfo || "";
                const recommendationReason = parsed?.recommendationReason || parsed?.reason || "";
                const groundingLinks = parsed?.groundingLinks || [];
                const youtubeVideoId = typeof parsed?.youtubeVideoId === 'string' && parsed.youtubeVideoId.trim().length === 11
                    ? parsed.youtubeVideoId.trim()
                    : undefined;
                const youtubeSearchQuery = typeof parsed?.youtubeSearchQuery === 'string' && parsed.youtubeSearchQuery.trim().length > 0
                    ? parsed.youtubeSearchQuery.trim()
                    : undefined;
                
                const isPlaceholderBio = bio.includes('sandbox mock') || bio.includes('test scenarios');
                const isBioTooShort = !bio || bio.trim().length < 5;
                const detailsPayload: NodeDetails = {
                    summary: bio,
                    imageUrl,
                    details: { artist: artistName, genre, origin, founded, notableArtists },
                    members,
                    links,
                    discography,
                    tourInfo,
                    recommendationReason,
                    groundingLinks,
                    youtubeVideoId,
                    youtubeSearchQuery
                };

                const isIncomplete = checkIsProfileIncomplete(node, detailsPayload) || isBioTooShort || isPlaceholderBio;

                if (!isIncomplete) {
                    const hydratedNode = {
                        ...node,
                        bio,
                        summary: bio,
                        genre,
                        origin,
                        founded,
                        name: artistName,
                        imageUrl,
                        isLibrary: true
                    };
                    
                    setSelectedNode(hydratedNode);
                    if (node.type !== 'founded') {
                        setActiveNodes(prev => prev.some(n => n.id.toLowerCase() === node.id.toLowerCase()) ? prev : [...prev, node]);
                    }
                    incrementDeepCutsOpenedCount();
                    
                    // Push to detailsCache so the background queue skips this node entirely
                    console.log("[Phase 3 Cache Payload]", node.id, JSON.stringify({ youtubeVideoId: detailsPayload.youtubeVideoId, summary: detailsPayload.summary?.substring(0, 40) }));
                    setDetailsCache(prev => new Map(prev).set(node.id.toLowerCase(), detailsPayload).set(standardizedId, detailsPayload).set(node.id, detailsPayload));

                    if (isCacheExpired(data.cachedAt)) {
                        triggerBackgroundRevalidation(node, standardizedId);
                    }

                    // Air-gap: clear all loading flags and hard-stop before any network call
                    fetchingNodeIdsRef.current.delete(node.id);
                    setLoadingNodeIds(prev => { const next = new Set(prev); next.delete(node.id); return next; });
                    setIsLoading(false);
                    console.log("[Node Click] Hydrated from global artists collection:", node.id, "→", standardizedId);
                    return;
                } else {
                    console.log(`[Node Click Intercept] Incomplete global Firestore profile detected for: ${node.id}`);
                    const displayName = detailsPayload?.details?.artist || node.label || titleCaseArtistId(node.id);
                    const confirmed = await confirmTokenUsage('data_quality_optimization', [], [displayName]);
                    if (!confirmed) return; // Cancel: return early without rendering details

                    // Delete from local memory and Firestore cache
                    healedDetailsCacheRef.current.delete(node.id);
                    healedDetailsCacheRef.current.delete(node.id.toLowerCase());
                    healedDetailsCacheRef.current.delete(standardizedId);

                    // Clear detailsCacheRef.current and detailsCache state synchronously
                    detailsCacheRef.current.delete(node.id);
                    detailsCacheRef.current.delete(node.id.toLowerCase());
                    detailsCacheRef.current.delete(standardizedId);

                    setDetailsCache(prev => {
                        const n = new Map(prev);
                        n.delete(node.id);
                        n.delete(node.id.toLowerCase());
                        n.delete(standardizedId);
                        return n;
                    });

                    // Synchronously mark as evicted so the queue skips cache lookup
                    evictedNodeIdsRef.current.add(node.id);
                    evictedNodeIdsRef.current.add(node.id.toLowerCase());
                    evictedNodeIdsRef.current.add(standardizedId);

                    // Perform Firestore eviction in the background (non-blocking)
                    deleteDoc(doc(db, 'artists', standardizedId))
                      .then(() => console.log(`[Node Click Intercept] Evicted stale global Firestore cache for: ${standardizedId}`))
                      .catch((error: any) => {
                        console.error(
                            `[PERMISSIONS] deleteDoc failed for artists/${standardizedId}:`,
                            `code=${error?.code}`,
                            `message=${error.message}`
                        );
                        updateDoc(doc(db, 'artists', standardizedId), {
                            detailsCache: '',
                            cachedAt: serverTimestamp()
                        }).then(() => console.log(`[Node Click Intercept] Fallback: Invalidated stale record in-place for: ${standardizedId}`))
                          .catch((fallbackError: any) => {
                            console.error(
                                `[PERMISSIONS] updateDoc fallback also failed for artists/${standardizedId}:`,
                                `code=${fallbackError?.code}`,
                                `message=${fallbackError.message}`
                            );
                          });
                      });

                    // Trigger spinner immediately
                    setLoadingNodeIds(prev => new Set(prev).add(node.id));

                    // Select the node so the sidebar shows and queue triggers a fresh live load
                    setSelectedNode(node);
                    if (node.type !== 'founded') {
                        setActiveNodes(prev => prev.some(n => n.id.toLowerCase() === node.id.toLowerCase()) ? prev : [...prev, node]);
                    }
                    return;
                }
            }
        }
        } catch(err) {
            console.warn("[Node Click] Global fallback read failed:", err);
        }
    }

    // 3. Fallback Only if Empty
    const confirmed = await confirmTokenUsage('deep_cut_creation', [], [node.label || titleCaseArtistId(node.id)]);
    if (!confirmed) {
      return;
    }
    
    // Trigger spinner immediately
    setLoadingNodeIds(prev => new Set(prev).add(node.id));

    setSelectedNode(node);
    if (node.type !== 'founded') {
      setActiveNodes(prev => prev.some(n => n.id.toLowerCase() === node.id.toLowerCase()) ? prev : [...prev, node]);
    }
  }, [confirmTokenUsage, selectedNode, loadingNodeIds]);

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

    // Phase 05: Build lightweight canvas layout — artist nodes only (x/y/fx/fy).
    // Heavy graphData and detailsCache live in the global 'artists' cache, referenced by cacheKey.
    const canvasLayout = graphData.nodes
      .filter(n => n.type === 'artist')
      .map(n => ({ nodeId: n.id, x: n.x, y: n.y, fx: n.fx ?? null, fy: n.fy ?? null }));

    const path = `users/${user.uid}/projects/${newId}`;
    try {
      const docPayload: Record<string, any> = {
        name: projectName || (seedArtists ? seedArtists.split('::')[0] : 'Saved Zcene'),
        seedArtists,
        activeNodes: activeNodes.map(n => n.id),
        chatHistories: JSON.stringify(Array.from(chatHistories.entries())),
        discoveryFilters: JSON.stringify(discoveryFilters),
        lastViewedStackCount,
        isMagazineViewOpen: false,
        authorId: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      if (currentCacheKey) {
        // Legacy path: if a compound cacheKey is still present in state (e.g. from a
        // session started before Phase 1 landed), write it for backward compatibility.
        // New sessions will always use artistIds instead.
        docPayload.cacheKey = currentCacheKey;
        docPayload.canvasLayout = JSON.stringify(canvasLayout);
      } else {
        // Phase 1+: write individual artist ID references + canvas layout.
        // Each ID points to its own isolated /artists/{id} Firestore document.
        const seedList = seedArtists.split('::').map((a: string) => a.trim()).filter(Boolean);
        const normalizedIds = seedList.map((name: string) => normalizeArtistId(name));
        docPayload.artistIds = normalizedIds;
        docPayload.canvasLayout = JSON.stringify(canvasLayout);
        docPayload.graphData = JSON.stringify(graphData);
      }

      await setDoc(newDocRef, docPayload);
      showToast('Zcene saved to your dashboard!');
      navigate(`/z/${newId}`);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    } finally {
      setIsCreatingProject(false);
    }
  }, [user, graphData, seedArtists, projectName, activeNodes, detailsCache, chatHistories, discoveryFilters, lastViewedStackCount, currentCacheKey, handleLogin, showToast, navigate]);

  const handleDashboardRestartWalkthrough = useCallback(async () => {
    if (user) {
      await handleUpdateProfile({ onboardingProgress: {} });
    } else {
      try {
        localStorage.removeItem('zcene_onboarding_progress');
      } catch (e) {
        console.error(e);
      }
    }
    showToast("Walkthrough restarted!");
  }, [user, handleUpdateProfile, showToast]);

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
      navigate('/');
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

  const handleGenerateGraph = useCallback(async (
    artists: string,
    isRegeneration: boolean = false,
    graphToEnhance?: GraphData | null,
    bypassCacheValidation: boolean = false,
    bypassTokenConfirmation: boolean = false,
    overrideFilters?: DiscoveryFilters
  ) => {
    isHydratingSessionRef.current = true;
    let isLockReleasedByAutosave = false;
    let bypassToken = bypassTokenConfirmation;
    const prevActiveNodes = activeNodes;
    const prevSeedArtists = seedArtists;
    const activeDiscoveryFilters = overrideFilters || discoveryFilters;

    if (!user && (isRegeneration || !window.location.search)) {
      isHydratingSessionRef.current = false;
      // Only gate if it's a manual action (regeneration or fresh start)
      // Imports (via deep links) are allowed for guests
      console.log(`[Lazy Registration] Queueing generateGraph for guest. User: ${!!user}`);
      setPendingAuthAction({ type: 'generateGraph', payload: { artists, isRegeneration, graphToEnhance, bypassCacheValidation } });
      handleLogin();
      return;
    }

    const artistList = artists.split('::').map(a => normalizeArtistId(a)).filter(Boolean);
    if (artistList.length > 25) {
      isHydratingSessionRef.current = false;
      setError(`Limit: 25 artists.`);
      return;
    }

    const hasActiveFilters = !!(
      activeDiscoveryFilters.foundedAfter ||
      activeDiscoveryFilters.foundedBefore ||
      (activeDiscoveryFilters.includeOrigins && activeDiscoveryFilters.includeOrigins.length > 0) ||
      (activeDiscoveryFilters.excludeOrigins && activeDiscoveryFilters.excludeOrigins.length > 0) ||
      (activeDiscoveryFilters.includeGenres && activeDiscoveryFilters.includeGenres.length > 0) ||
      (activeDiscoveryFilters.additionalInstructions && activeDiscoveryFilters.additionalInstructions.trim().length > 0)
    );

    // --- STRICT FRONT-GATE CACHE CHECK ---
    // If this is a fresh search for a single artist without special filters, check the cache immediately
    if (artistList.length === 1 && !isRegeneration && !hasActiveFilters) {
      const searchId = artistList[0];
      const searchIdLower = searchId.toLowerCase();
      
      try {
        let cacheDoc = await getArtistDocWithRedirect(searchId);
        if (!cacheDoc.exists()) {
          cacheDoc = await getArtistDocWithRedirect(searchIdLower);
        }

        if (cacheDoc.exists()) {
          const data = cacheDoc.data();
          const isDeep = data?.isDeep === true;
          if (data && (bypassCacheValidation || (isCacheEntryFullyQualified(data) && isDeep))) {
            let parsedGraph = null;
            try {
              parsedGraph = typeof data.graphData === 'string' ? JSON.parse(data.graphData) : data.graphData;
            } catch (e) {
              console.warn("Failed to parse cached graphData");
            }
            
            if (parsedGraph && parsedGraph.nodes && parsedGraph.nodes.length > 0) {
              const normalizedGraph = applyHumanCasedLabels(normalizeGraphData(parsedGraph), artists);
              console.log("[Front Gate Cache] Hit! Bypassing all generation logic for:", searchId);
              setGraphData(normalizedGraph);
              
              // 3. Extract the detailsCache string from the same document read
              let parsedDetails: any = null;
              if (data.detailsCache) {
                  try {
                      parsedDetails = typeof data.detailsCache === 'string' ? JSON.parse(data.detailsCache) : data.detailsCache;
                      
                      // Unwrap array wrapper layer [{ ... }] or [ [ "name", { ... } ] ]
                      if (Array.isArray(parsedDetails) && parsedDetails.length > 0) {
                          parsedDetails = Array.isArray(parsedDetails[0]) ? parsedDetails[0][1] : parsedDetails[0];
                      }
                      
                      const bio = parsedDetails?.summary || parsedDetails?.bio || parsedDetails?.description || parsedDetails?.text || "";
                      if (bio && bio.length > 5) {
                         const detailsPayload = {
                            summary: bio,
                            imageUrl: parsedDetails?.imageUrl || parsedDetails?.image || "",
                            details: {
                               artist: parsedDetails?.details?.artist || parsedDetails?.artist || parsedDetails?.name || data.seedArtists || data.artistId || searchId,
                               genre: parsedDetails?.details?.genre || parsedDetails?.genre || parsedDetails?.genres || "",
                               origin: parsedDetails?.details?.origin || parsedDetails?.origin || parsedDetails?.location || parsedDetails?.country || "",
                               founded: parsedDetails?.details?.founded || parsedDetails?.founded || parsedDetails?.formed || parsedDetails?.year || "",
                               notableArtists: parsedDetails?.details?.notableArtists || parsedDetails?.notableArtists || []
                            },
                            members: parsedDetails?.members || [],
                            links: parsedDetails?.links || [],
                            discography: parsedDetails?.discography || [],
                            tourInfo: parsedDetails?.tourInfo || "",
                            recommendationReason: parsedDetails?.recommendationReason || parsedDetails?.reason || "",
                            groundingLinks: parsedDetails?.groundingLinks || [],
                            youtubeVideoId: typeof parsedDetails?.youtubeVideoId === 'string' && parsedDetails.youtubeVideoId.trim().length === 11
                                ? parsedDetails.youtubeVideoId.trim()
                                : undefined,
                            youtubeSearchQuery: typeof parsedDetails?.youtubeSearchQuery === 'string' && parsedDetails.youtubeSearchQuery.trim().length > 0
                                ? parsedDetails.youtubeSearchQuery.trim()
                                : undefined
                         };
                          console.log("[Phase 3 Cache Payload – Front Gate]", searchId, JSON.stringify({ youtubeVideoId: detailsPayload.youtubeVideoId, youtubeSearchQuery: detailsPayload.youtubeSearchQuery }));
                          setDetailsCache(prev => new Map(prev).set(searchIdLower, detailsPayload).set(searchId, detailsPayload).set(normalizeArtistId(searchId), detailsPayload));
                      }
                  } catch(e) { console.warn("Failed to parse detailsCache", e); }
              }
              
              // 4. Find the primary node and instantly hydrate it with the biography text
              const primaryNode = normalizedGraph.nodes.find((n: any) => n.id.toLowerCase() === searchIdLower) as any;
              if (primaryNode) {
                  let unwrappedDetails = parsedDetails;
                  if (Array.isArray(unwrappedDetails) && unwrappedDetails.length > 0) {
                      unwrappedDetails = Array.isArray(unwrappedDetails[0]) ? unwrappedDetails[0][1] : unwrappedDetails[0];
                  }
                  const bio = unwrappedDetails?.summary || unwrappedDetails?.bio || unwrappedDetails?.description || unwrappedDetails?.text || primaryNode.bio || primaryNode.summary || "";
                  const hydratedNode = {
                      ...primaryNode,
                      bio: bio,
                      summary: bio,
                      imageUrl: unwrappedDetails?.imageUrl || unwrappedDetails?.image || primaryNode.imageUrl || "",
                      genre: unwrappedDetails?.details?.genre || unwrappedDetails?.genre || unwrappedDetails?.genres || primaryNode.genre || "",
                      origin: unwrappedDetails?.details?.origin || unwrappedDetails?.origin || unwrappedDetails?.location || unwrappedDetails?.country || primaryNode.origin || "",
                      founded: unwrappedDetails?.details?.founded || unwrappedDetails?.founded || unwrappedDetails?.formed || unwrappedDetails?.year || primaryNode.founded || "",
                      isLibrary: true,
                      type: 'artist' as const,
                      group: 0
                  };
                  setSelectedNode(hydratedNode);
                  setActiveNodes([{...hydratedNode}]);
              }
              
              setSeedArtists(artists);
              // Force all loading flags off and short-circuit the entire function
              setIsLoading(false);
              isFetchingDetailsRef.current = false;
              if (user && isFirebaseReady && isAuthInitialized && currentProjectId && !isGuest) {
                isLockReleasedByAutosave = true;
              } else {
                isHydratingSessionRef.current = false;
              }
              showToast('⚡ Loaded from cache');
              return;
            }
          } else {
            console.log(`[Front Gate Cache] Cache doc found for "${searchId}" but failed strict validation. Intercepting for self-healing.`);
            setIsLoading(true);
            const confirmed = await confirmTokenUsage('cache_upgrade', [], [searchId], []);
            if (confirmed) {
              console.log(`[Front Gate Cache] User confirmed cache upgrade. Overwriting old entry.`);
              bypassToken = true;
              // Fall through to live generation logic (which will generate and write back)
            } else {
              console.log(`[Front Gate Cache] User cancelled cache upgrade. Falling back to legacy data.`);
              isHydratingSessionRef.current = false;
              handleGenerateGraph(artists, isRegeneration, graphToEnhance, true);
              return;
            }
          }
        }
      } catch (err) {
        console.warn("[Front Gate Cache] Read failed, falling through:", err);
      }
    }
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
      pruned = pruneGraphToSeeds(graphToEnhance, seedsLower);
    }
    if (pruned) {
      pruned = filterGraphByDiscoveryFilters(pruned, activeDiscoveryFilters, artists);
    }


    setIsLoading(true); setError(null); setSeedArtists(artists);
    isFetchingDetailsRef.current = false;
    fetchingNodeIdsRef.current.clear();
    setLoadingNodeIds(new Set());

    if (activeDiscoveryFilters.foundedAfter || activeDiscoveryFilters.foundedBefore || (activeDiscoveryFilters.includeOrigins && activeDiscoveryFilters.includeOrigins.length > 0) || (activeDiscoveryFilters.includeGenres && activeDiscoveryFilters.includeGenres.length > 0)) {
      showToast(`Discovery Mode: Applying advanced filters...`);
    }

    // --- PHASE 02: PER-ARTIST CACHE CHECK ---
    // Concurrently read one Firestore doc per artist. Determine exactly which are
    // cached and which are missing — then only call Gemini for the missing ones.
    let fullCacheHit = false;

    try {
      let cached = new Map<string, ArtistCacheEntry>();
      let missing: string[] = [];
      let enrichmentRequired: string[] = [];
      let fullHits: string[] = [];

      let bypassChoiceConfirmation = false;

      if (!bypassToken) {
        const normalizedArtistList = artistList.map(name => name.toLowerCase());
        const cacheResult = await readArtistCacheMany(normalizedArtistList, user?.uid);
        cached = new Map<string, ArtistCacheEntry>();
        missing = [];
        enrichmentRequired = [];
        fullHits = [];

        const allArtistsCached = normalizedArtistList.every(name => {
          const normName = name.toLowerCase();
          const entry = cacheResult.cached.get(name) || cacheResult.cached.get(normName);
          return entry && isGraphDataPresent(entry);
        });

        if (allArtistsCached) {
          const allDeep = normalizedArtistList.every(name => {
            const normName = name.toLowerCase();
            const entry = cacheResult.cached.get(name) || cacheResult.cached.get(normName);
            return entry && entry.isDeep === true;
          });
          const choice = (allDeep || bypassCacheValidation) ? 'cache' : await confirmCacheChoice(artistList);
          if (choice === 'cancel' || controller.signal.aborted) {
            isHydratingSessionRef.current = false;
            setIsLoading(false);
            setActiveNodes(prevActiveNodes);
            setSeedArtists(prevSeedArtists);
            return;
          }

          if (choice === 'synthesis') {
            console.log("[Phase 02 Cache] Option B chosen: forcing net-new AI generation.");
            handleGenerateGraph(artists, true, graphToEnhance, bypassCacheValidation, true);
            return;
          }

          console.log("[Phase 02 Cache] Option A chosen: loading standard cached layout (bypassing validation checks).");
          
          // Populate cached map directly from cacheResult with all entries
          normalizedArtistList.forEach(name => {
            const normName = name.toLowerCase();
            const entry = cacheResult.cached.get(name) || cacheResult.cached.get(normName);
            if (entry) {
              cached.set(name, entry);
              cached.set(normName, entry);
            }
          });

          // 1. FORCE STEP 1 - Check local database cache first
          console.log(`[Music Discovery] Full cache HIT for: ${artistList.map(n => normalizeArtistId(n)).join(', ')}`);
          cached.forEach((_, name) => incrementCacheHit(normalizeArtistId(name), user?.uid));

          // 2. FORCE STEP 2 - Immediately update the UI state from local data
          const originalSeeds = artists.split('::').map(s => s.trim()).filter(Boolean);
          const originalSeedMap = new Map<string, string>();
          originalSeeds.forEach(s => {
            originalSeedMap.set(normalizeArtistId(s), s);
          });

          const firstSlug = artistList[0];
          const entry = cached.get(firstSlug.toLowerCase()) || cached.values().next().value;
          let humanName = originalSeedMap.get(firstSlug.toLowerCase()) || entry?.seedArtists || entry?.artistId || firstSlug;

          // A. Parse the local detailsCache JSON block safely
          let bio = "", genre = "", origin = "", founded = "", summary = "", imageUrl = "";
          if (entry && entry.detailsCache) {
               try {
                  let parsedData = typeof entry.detailsCache === 'string' ? JSON.parse(entry.detailsCache) : entry.detailsCache;
                  if (Array.isArray(parsedData) && parsedData.length > 0) {
                     parsedData = Array.isArray(parsedData[0]) ? parsedData[0][1] : parsedData[0];
                  }
                  bio = parsedData?.summary || parsedData?.bio || parsedData?.description || parsedData?.text || "";
                  summary = bio;
                  imageUrl = parsedData?.imageUrl || parsedData?.image || "";
                  genre = parsedData?.details?.genre || parsedData?.genre || parsedData?.genres || "";
                  origin = parsedData?.details?.origin || parsedData?.origin || parsedData?.location || parsedData?.country || "";
                  founded = parsedData?.details?.founded || parsedData?.founded || parsedData?.formed || parsedData?.year || "";
               } catch(e) {
                  console.warn("Silent parse failure on detailsCache:", e);
               }
          }

          // B. Construct a clean node layout object
          const hydratedNode = {
               id: firstSlug.toLowerCase(),
               label: humanName,
               name: humanName,
               bio, summary, genre, origin, founded, imageUrl,
               type: 'artist' as const,
               isLibrary: true,
               group: 0
           };

          setSelectedNode(hydratedNode);

          // C. Set the pre-compiled graph array straight into setGraphData
          let parsedGraphData = assembleGraphFromCache(cached);
          
          const returnedIds = new Set(parsedGraphData.nodes.map((n: Node) => n.id.toLowerCase()));
          let maxG = parsedGraphData.nodes.reduce((m: number, n: Node) => Math.max(m, n.group || 0), 0);
          artistList.forEach((name, idx) => {
            const normName = name.toLowerCase();
            if (!returnedIds.has(normName)) {
              maxG++;
              const rawName = originalSeeds[idx] || name;
              parsedGraphData.nodes.push({ id: normName, type: 'artist', label: rawName, group: maxG });
            }
          });

          // Bypass merging with pruned to preserve the full map retrieved from Firestore cache
          let final = parsedGraphData;
          final = applyHumanCasedLabels(final, artists);
          final = filterGraphByDiscoveryFilters(final, activeDiscoveryFilters, artists);
          
          setGraphData(final);

          setActiveNodes(prev => {
            const currentActive = [...prev];
            const seedMapped = artistList.map(name => {
              const match = final.nodes.find(fn => fn.id.toLowerCase() === name.toLowerCase());
              return (match || { id: name, type: 'artist' as any, group: 0 }) as Node;
            });
            const seedIds = new Set(seedMapped.map(s => s.id.toLowerCase()));
            const finalActive = [...seedMapped];
            currentActive.forEach(p => {
              if (!seedIds.has(p.id.toLowerCase())) {
                const match = final.nodes.find(fn => fn.id.toLowerCase() === p.id.toLowerCase());
                finalActive.push(match || p);
                seedIds.add(p.id.toLowerCase());
              }
            });
            return finalActive;
          });

          setDetailsCache(prev => {
            const next = new Map(prev);
            cached.forEach((cachedEntry, key) => {
              if (cachedEntry && cachedEntry.detailsCache) {
                try {
                  let parsedData = typeof cachedEntry.detailsCache === 'string' ? JSON.parse(cachedEntry.detailsCache) : cachedEntry.detailsCache;
                  if (Array.isArray(parsedData) && parsedData.length > 0) {
                    parsedData = Array.isArray(parsedData[0]) ? parsedData[0][1] : parsedData[0];
                  }
                  const entryBio = parsedData?.summary || parsedData?.bio || parsedData?.description || parsedData?.text || "";
                  
                  if (!entryBio || entryBio.length < 5) return;

                  const entryGenre = parsedData?.details?.genre || parsedData?.genre || parsedData?.genres || "";
                  const entryOrigin = parsedData?.details?.origin || parsedData?.origin || parsedData?.location || parsedData?.country || "";
                  const entryFounded = parsedData?.details?.founded || parsedData?.founded || parsedData?.formed || parsedData?.year || "";
                  const entryArtistName = parsedData?.details?.artist || parsedData?.artist || parsedData?.name || cachedEntry.seedArtists || cachedEntry.artistId || key;

                  const detailsObj = {
                    summary: entryBio,
                    imageUrl: parsedData?.imageUrl || parsedData?.image || "",
                    details: {
                      genre: entryGenre,
                      origin: entryOrigin,
                      founded: entryFounded,
                      artist: entryArtistName,
                      notableArtists: parsedData?.details?.notableArtists || parsedData?.notableArtists || []
                    },
                    members: parsedData?.members || [],
                    links: parsedData?.links || [],
                    discography: parsedData?.discography || [],
                    tourInfo: parsedData?.tourInfo || "",
                    recommendationReason: parsedData?.recommendationReason || parsedData?.reason || "",
                    groundingLinks: parsedData?.groundingLinks || []
                  };

                  next.set(key.toLowerCase(), detailsObj);
                  next.set(key, detailsObj);
                  next.set(normalizeArtistId(key), detailsObj);
                  if (cachedEntry.artistId) {
                    next.set(cachedEntry.artistId.toLowerCase(), detailsObj);
                    next.set(normalizeArtistId(cachedEntry.artistId), detailsObj);
                  }
                  if (entryArtistName) {
                    next.set(entryArtistName.toLowerCase(), detailsObj);
                    next.set(entryArtistName, detailsObj);
                    next.set(normalizeArtistId(entryArtistName), detailsObj);
                  }
                } catch (e) {
                  console.warn("Silent parse failure on detailsCache in loop:", e);
                }
              }
            });
            return next;
          });

          // 3. FORCE STEP 3 - Shut down ALL loading states and force an absolute return
          window.dispatchEvent(new CustomEvent('zcene-cache-hit-success', { 
              detail: { artist: entry?.seedArtists || entry?.artistId || firstSlug } 
          }));
          
          showToast('⚡ Loaded from cache');
          setIsLoading(false);
          
          isFetchingDetailsRef.current = true;
          setTimeout(() => { isFetchingDetailsRef.current = false; }, 500);
          fullCacheHit = true;
          if (user && isFirebaseReady && isAuthInitialized && currentProjectId && !isGuest) {
            isLockReleasedByAutosave = true;
          } else {
            isHydratingSessionRef.current = false;
          }
          return;
        }
        
        const currentSeeds = prevSeedArtists.split('::').map(s => normalizeArtistId(s)).filter(Boolean);
        
        artistList.forEach(name => {
          const normName = name.toLowerCase();
          const entry = cacheResult.cached.get(name) || cacheResult.cached.get(normName);
          const forceMockHit = (import.meta.env.DEV || import.meta.env.VITE_USE_MOCKS === 'true') && 
            ['sick of it all', 'h2o', 'radiohead', 'blink-182', 'orange 9mm', 'madball'].includes(normName);

          const isAlreadyInGraph = !hasActiveFilters && (
            currentSeeds.includes(normName) || 
            (graphData?.nodes.some(n => n.id.toLowerCase() === normName || normalizeArtistId(n.id) === normName) ?? false)
          );

          const validation = entry ? validateCacheEntry(entry) : null;
          const filtersMatch = bypassChoiceConfirmation ? true : (entry ? areFiltersEqual(entry.filters, activeDiscoveryFilters) : false);
          const isQualified = bypassChoiceConfirmation ? true : validation?.isFullyQualified;

          if (forceMockHit || (entry && filtersMatch && (bypassCacheValidation || isQualified))) {
            fullHits.push(name);
            const finalEntry: ArtistCacheEntry = entry || {
              artistId: normalizeArtistId(name),
              seedArtists: name,
              graphData: JSON.stringify({ nodes: [{ id: name, type: 'artist', label: name, group: 1 }], links: [] }),
              cacheVersion: 2,
              cachedAt: { seconds: Date.now() / 1000, nanoseconds: 0 } as any,
              hitCount: 0,
              detailsCache: JSON.stringify({
                summary: `**${name}** is a standard sandbox mock cached band for test scenarios.`,
                imageUrl: '',
                members: [],
                details: { genre: 'Hardcore Punk', origin: 'New York, USA', founded: '1990' },
                links: [],
                discography: []
              })
            };
            cached.set(name, finalEntry);
            cached.set(normName, finalEntry);
          } else if (entry && filtersMatch && (validation?.needsPeerBands || validation?.needsFutureFields)) {
            enrichmentRequired.push(name);
            cached.set(name, entry);
            cached.set(normName, entry);
            console.log(`[Phase 02 Cache] Cache hit for "${name}" needs enrichment. Validation:`, validation);
          } else if (isAlreadyInGraph) {
            // Local scene check: if artist is already in the graph, extract its subgraph to avoid redundant query/AI calls
            const { nodes, links } = extractArtistSubGraph(name, graphData || { nodes: [], links: [] }, artistList);
            if (nodes.length > 0) {
              const details = detailsCache.get(normName) || detailsCache.get(name) || detailsCache.get(normalizeArtistId(name));
              const virtualEntry: ArtistCacheEntry = {
                artistId: normalizeArtistId(name),
                seedArtists: name,
                graphData: JSON.stringify({ nodes, links }),
                cacheVersion: 2,
                cachedAt: { seconds: Date.now() / 1000, nanoseconds: 0 } as any,
                hitCount: 0,
                detailsCache: details ? JSON.stringify(details) : undefined
              };
              fullHits.push(name);
              cached.set(name, virtualEntry);
              cached.set(normName, virtualEntry);
              console.log(`[Phase 02 Cache] Handled existing artist "${name}" from local graphData`);
            } else {
              missing.push(name);
            }
          } else {
            console.log(`[Phase 02 Cache] Cache miss for "${name}". Forcing regeneration.`);
            missing.push(name);
          }
        });
      }

      if (!controller.signal.aborted && missing.length === 0 && enrichmentRequired.length === 0 && cached.size > 0) {
        // Intercept with the dual-option choice gate if it's a multi-artist or filtered query.
        // Single-artist queries without filters are already handled by the Front Gate cache check.
        // Thus, any full hit reaching Phase 2 is by definition multi-artist or filtered.
        const allDeep = Array.from(cached.values()).every(entry => entry.isDeep === true);
        const choice = (allDeep || bypassCacheValidation || bypassChoiceConfirmation) ? 'cache' : await confirmCacheChoice(artistList);
        if (choice === 'cancel' || controller.signal.aborted) {
          isHydratingSessionRef.current = false;
          setIsLoading(false);
          setActiveNodes(prevActiveNodes);
          setSeedArtists(prevSeedArtists);
          return;
        }

        if (choice === 'synthesis') {
          console.log("[Phase 02 Cache] Option B chosen: forcing net-new AI generation.");
          handleGenerateGraph(artists, true, graphToEnhance, bypassCacheValidation, true);
          return;
        }

        console.log("[Phase 02 Cache] Option A chosen: loading standard cached layout.");

        // 1. FORCE STEP 1 - Check local database cache first
        console.log(`[Music Discovery] Full cache HIT for: ${artistList.map(n => normalizeArtistId(n)).join(', ')}`);
        cached.forEach((_, name) => incrementCacheHit(normalizeArtistId(name), user?.uid));

        // 2. FORCE STEP 2 - Immediately update the UI state from local data
        const originalSeeds = artists.split('::').map(s => s.trim()).filter(Boolean);
        const originalSeedMap = new Map<string, string>();
        originalSeeds.forEach(s => {
          originalSeedMap.set(normalizeArtistId(s), s);
        });

        const firstSlug = artistList[0];
        const entry = cached.get(firstSlug.toLowerCase()) || cached.values().next().value;
        let humanName = originalSeedMap.get(firstSlug.toLowerCase()) || entry?.seedArtists || entry?.artistId || firstSlug;

        // A. Parse the local detailsCache JSON block safely
        let bio = "", genre = "", origin = "", founded = "", summary = "", imageUrl = "";
        if (entry && entry.detailsCache) {
             try {
                let parsedData = typeof entry.detailsCache === 'string' ? JSON.parse(entry.detailsCache) : entry.detailsCache;
                if (Array.isArray(parsedData) && parsedData.length > 0) {
                   parsedData = Array.isArray(parsedData[0]) ? parsedData[0][1] : parsedData[0];
                }
                bio = parsedData?.summary || parsedData?.bio || parsedData?.description || parsedData?.text || "";
                summary = bio;
                imageUrl = parsedData?.imageUrl || parsedData?.image || "";
                genre = parsedData?.details?.genre || parsedData?.genre || parsedData?.genres || "";
                origin = parsedData?.details?.origin || parsedData?.origin || parsedData?.location || parsedData?.country || "";
                founded = parsedData?.details?.founded || parsedData?.founded || parsedData?.formed || parsedData?.year || "";
             } catch(e) {
                console.warn("Silent parse failure on detailsCache:", e);
             }
        }

        // B. Construct a clean node layout object
        const hydratedNode = {
             id: firstSlug.toLowerCase(),
             label: humanName,
             name: humanName,
             bio, summary, genre, origin, founded, imageUrl,
             type: 'artist' as const,
             isLibrary: true,
             group: 0
         };

        // Pass it straight to setSelectedNode
        setSelectedNode(hydratedNode);

        // C. Set the pre-compiled graph array straight into setGraphData
        let parsedGraphData = assembleGraphFromCache(cached);
        
        // Defensive guard
        const returnedIds = new Set(parsedGraphData.nodes.map((n: Node) => n.id.toLowerCase()));
        let maxG = parsedGraphData.nodes.reduce((m: number, n: Node) => Math.max(m, n.group || 0), 0);
        artistList.forEach((name, idx) => {
          const normName = name.toLowerCase();
          if (!returnedIds.has(normName)) {
            maxG++;
            const rawName = originalSeeds[idx] || name;
            parsedGraphData.nodes.push({ id: normName, type: 'artist', label: rawName, group: maxG });
          }
        });

        // Bypass merging with pruned to preserve the full map retrieved from Firestore cache
        let final = parsedGraphData;
        final = applyHumanCasedLabels(final, artists);
        final = filterGraphByDiscoveryFilters(final, activeDiscoveryFilters, artists);
        
        setGraphData(final);

        setActiveNodes(prev => {
          const currentActive = [...prev];
          const seedMapped = artistList.map(name => {
            const match = final.nodes.find(fn => fn.id.toLowerCase() === name.toLowerCase());
            return (match || { id: name, type: 'artist' as any, group: 0 }) as Node;
          });
          const seedIds = new Set(seedMapped.map(s => s.id.toLowerCase()));
          const finalActive = [...seedMapped];
          currentActive.forEach(p => {
            if (!seedIds.has(p.id.toLowerCase())) {
              const match = final.nodes.find(fn => fn.id.toLowerCase() === p.id.toLowerCase());
              finalActive.push(match || p);
              seedIds.add(p.id.toLowerCase());
            }
          });
          return finalActive;
        });

        setDetailsCache(prev => {
          const next = new Map(prev);
          cached.forEach((cachedEntry, key) => {
            if (cachedEntry && cachedEntry.detailsCache) {
              try {
                let parsedData = typeof cachedEntry.detailsCache === 'string' ? JSON.parse(cachedEntry.detailsCache) : cachedEntry.detailsCache;
                if (Array.isArray(parsedData) && parsedData.length > 0) {
                  parsedData = Array.isArray(parsedData[0]) ? parsedData[0][1] : parsedData[0];
                }
                const entryBio = parsedData?.summary || parsedData?.bio || parsedData?.description || parsedData?.text || "";
                
                // Guard: Only add to detailsCache if bio is present and has length > 5
                if (!entryBio || entryBio.length < 5) return;

                const entryGenre = parsedData?.details?.genre || parsedData?.genre || parsedData?.genres || "";
                const entryOrigin = parsedData?.details?.origin || parsedData?.origin || parsedData?.location || parsedData?.country || "";
                const entryFounded = parsedData?.details?.founded || parsedData?.founded || parsedData?.formed || parsedData?.year || "";
                const entryArtistName = parsedData?.details?.artist || parsedData?.artist || parsedData?.name || cachedEntry.seedArtists || cachedEntry.artistId || key;

                const detailsObj = {
                  summary: entryBio,
                  imageUrl: parsedData?.imageUrl || parsedData?.image || "",
                  details: {
                    genre: entryGenre,
                    origin: entryOrigin,
                    founded: entryFounded,
                    artist: entryArtistName,
                    notableArtists: parsedData?.details?.notableArtists || parsedData?.notableArtists || []
                  },
                  members: parsedData?.members || [],
                  links: parsedData?.links || [],
                  discography: parsedData?.discography || [],
                  tourInfo: parsedData?.tourInfo || "",
                  recommendationReason: parsedData?.recommendationReason || parsedData?.reason || "",
                  groundingLinks: parsedData?.groundingLinks || []
                };

                next.set(key.toLowerCase(), detailsObj);
                next.set(key, detailsObj);
                next.set(normalizeArtistId(key), detailsObj);
                if (cachedEntry.artistId) {
                  next.set(cachedEntry.artistId.toLowerCase(), detailsObj);
                  next.set(normalizeArtistId(cachedEntry.artistId), detailsObj);
                }
                if (entryArtistName) {
                  next.set(entryArtistName.toLowerCase(), detailsObj);
                  next.set(entryArtistName, detailsObj);
                  next.set(normalizeArtistId(entryArtistName), detailsObj);
                }
              } catch (e) {
                console.warn("Silent parse failure on detailsCache in loop:", e);
              }
            }
          });
          return next;
        });

        // 3. FORCE STEP 3 - Shut down ALL loading states and force an absolute return
        window.dispatchEvent(new CustomEvent('zcene-cache-hit-success', { 
            detail: { artist: entry?.seedArtists || entry?.artistId || firstSlug } 
        }));
        
        showToast('⚡ Loaded from cache');
        setIsLoading(false);
        
        // Lock the deep cut queue momentarily to let React's async detailsCache commit settle
        isFetchingDetailsRef.current = true;
        setTimeout(() => { isFetchingDetailsRef.current = false; }, 500);
        fullCacheHit = true;
        if (user && isFirebaseReady && isAuthInitialized && currentProjectId && !isGuest) {
          isLockReleasedByAutosave = true;
        } else {
          isHydratingSessionRef.current = false;
        }
        return;

      } else if (!controller.signal.aborted && (missing.length > 0 || enrichmentRequired.length > 0) && (cached.size > 0 || fullHits.length > 0)) {
        // ── PARTIAL CACHE HIT: some artists cached (or needing enrichment), some missing/needing-enrichment ─────────────
        const toFetch = [...missing, ...enrichmentRequired];
        console.log(`[Music Discovery] Partial cache HIT. Full hits: [${fullHits.join(', ')}] | Enrichment required: [${enrichmentRequired.join(', ')}] | Missing: [${missing.join(', ')}]`);
        showToast(`⚡ ${fullHits.length + enrichmentRequired.length} artist${(fullHits.length + enrichmentRequired.length) > 1 ? 's' : ''} from cache — fetching ${toFetch.join(', ')}...`);

        // Intercept with token confirmation modal
        const confirmed = await confirmTokenUsage(
          enrichmentRequired.length > 0 && missing.length === 0 ? 'cache_upgrade' : 'generation',
          fullHits,
          missing,
          enrichmentRequired
        );
        if (!confirmed || controller.signal.aborted) {
          setIsLoading(false);
          const legacyArtists = [...fullHits, ...enrichmentRequired];
          if (legacyArtists.length > 0) {
            setActiveNodes(prevActiveNodes);
            setSeedArtists(prevSeedArtists);
            showToast(`Loading cached artists: ${legacyArtists.join(', ')}`);
            handleGenerateGraph(legacyArtists.join('::'), isRegeneration, graphToEnhance, true);
          } else {
            isHydratingSessionRef.current = false;
            setActiveNodes(prevActiveNodes);
            setSeedArtists(prevSeedArtists);
          }
          return;
        }

        // Call Gemini ONLY for the missing and enrichment artists
        const partialGraphPromise = generateGraphData(toFetch.join('::'), pruned, activeDiscoveryFilters, user?.uid);
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("The AI is taking too long to respond. The request has timed out.")), 120000)
        );

        const startTime = Date.now();
        const freshData = await Promise.race([partialGraphPromise, timeoutPromise]) as GraphData;
        console.log(`[Music Discovery] Partial AI fetch in ${((Date.now() - startTime) / 1000).toFixed(1)}s for: [${toFetch.join(', ')}]`);

        if (controller.signal.aborted) return;
        if (!freshData || !freshData.nodes || !freshData.links) {
          throw new Error("The AI returned formless data for the missing artists. Please try again.");
        }

        // Write both newly fetched and enriched/upgraded artists to Firestore (fire-and-forget) - only for standalone queries
        if (artistList.length === 1) {
          writeArtistCacheMany(toFetch, freshData, user?.uid, activeDiscoveryFilters, true, true)
            .then(() => console.log(`[Music Discovery] Cache write/upgrade confirmed for: [${toFetch.join(', ')}]`))
            .catch(e => console.error('[Music Discovery] Cache write/upgrade failed:', e));
        }

        // Assemble the cached portion and merge with the fresh Gemini data
        const cachedGraph = assembleGraphFromCache(cached);
        const returnedIds = new Set(freshData.nodes.map(n => n.id.toLowerCase()));
        let maxG = freshData.nodes.reduce((m, n) => Math.max(m, n.group || 0), 0);
        toFetch.forEach(name => {
          if (!returnedIds.has(name.toLowerCase())) { maxG++; freshData.nodes.push({ id: name, type: 'artist', group: maxG }); }
        });

        let merged = mergeGraphData(cachedGraph, freshData);
        if (pruned) {
          merged = mergeGraphData(pruned, merged);
        }
        merged = applyHumanCasedLabels(merged, artists);
        merged = filterGraphByDiscoveryFilters(merged, activeDiscoveryFilters, artists);
        setGraphData(merged);

        setSelectedNode(prev => {
          if (!prev) return null;
          const match = merged.nodes.find(n => n.id.toLowerCase() === prev.id.toLowerCase());
          return match ? { ...prev, id: match.id, label: match.label || prev.label } : prev;
        });

        setActiveNodes(prev => {
          const currentActive = [...prev];
          const seedMapped = artistList.map(name => {
            const match = merged.nodes.find(fn => fn.id.toLowerCase() === name.toLowerCase());
            return (match || { id: name, type: 'artist' as any, group: 0 }) as Node;
          });
          const seedIds = new Set(seedMapped.map(s => s.id.toLowerCase()));
          const finalActive = [...seedMapped];
          currentActive.forEach(p => {
            if (!seedIds.has(p.id.toLowerCase())) {
              const match = merged.nodes.find(fn => fn.id.toLowerCase() === p.id.toLowerCase());
              finalActive.push(match || p);
              seedIds.add(p.id.toLowerCase());
            }
          });
          return finalActive;
        });

        setIsLoading(false);
        fullCacheHit = true;
        if (user && isFirebaseReady && isAuthInitialized && currentProjectId && !isGuest) {
          isLockReleasedByAutosave = true;
        } else {
          isHydratingSessionRef.current = false;
        }
        return; // Partial hit complete — go to Phase 04
      }
    } catch (cacheErr) {
      console.warn('[Music Discovery] Per-artist cache read error, falling back to full Gemini fetch:', cacheErr);
    }
    // --- END CACHE CHECK ---

    if (fullCacheHit) return;

    if (!bypassToken) {
      const confirmed = await confirmTokenUsage('generation', [], artistList);
      if (!confirmed || controller.signal.aborted) {
        isHydratingSessionRef.current = false;
        setIsLoading(false);
        setActiveNodes(prevActiveNodes);
        setSeedArtists(prevSeedArtists);
        return;
      }
    }

    try {
      const graphPromise = generateGraphData(artists, pruned, activeDiscoveryFilters, user?.uid);
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
      final = applyHumanCasedLabels(final, artists);
      final = filterGraphByDiscoveryFilters(final, activeDiscoveryFilters, artists);
      setGraphData(final);

      setSelectedNode(prev => {
        if (!prev) return null;
        const match = final.nodes.find(n => n.id.toLowerCase() === prev.id.toLowerCase());
        return match ? { ...prev, id: match.id, label: match.label || prev.label } : prev;
      });

      // Phase 02 complete — write each artist as an isolated individual doc - only for standalone queries
      if (artistList.length === 1) {
        console.log(`[Music Discovery] Full cache MISS — writing per-artist docs for: [${artistList.join(', ')}]`);
        writeArtistCacheMany(artistList, final, user?.uid, activeDiscoveryFilters, true, true)
          .then(() => console.log(`[Music Discovery] Per-artist cache write confirmed for: [${artistList.join(', ')}]`))
          .catch(e => console.error('[Music Discovery] Per-artist cache write failed:', e));
      }


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

      // Find the primary/seed node in the final graph and select it to paint the sidebar immediately
      const firstSlug = artistList[0];
      const primaryNode = final.nodes.find(n => n.id.toLowerCase() === firstSlug.toLowerCase()) || final.nodes[0];
      if (primaryNode) {
        setSelectedNode(primaryNode);
      }
      if (user && isFirebaseReady && isAuthInitialized && currentProjectId && !isGuest) {
        isLockReleasedByAutosave = true;
      } else {
        isHydratingSessionRef.current = false;
      }
    } catch (err: any) {
      if (err.name !== 'AbortError' && !controller.signal.aborted) {
        showToast(humanizeError(err));
        setIsLoading(false);
        isFetchingDetailsRef.current = false;
      }
    } finally {
      if (abortControllerRef.current === controller) {
        setIsLoading(false);
      }
      if (!isLockReleasedByAutosave) {
        isHydratingSessionRef.current = false;
      }
    }
  }, [
    user,
    discoveryFilters,
    showToast,
    humanizeError,
    handleLogin,
    graphData,
    activeNodes,
    seedArtists,
    confirmCacheChoice,
    confirmTokenUsage,
    detailsCache
  ]);



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

    // Standard Firebase Auth State Observer
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAuthInitialized(true);
      setIsFirebaseReady(true);
      console.log('[Auth] User state changed:', currentUser?.email);
    });

    return () => unsubscribe();
  }, []);

  // Sync user profile from Firestore (Real-Time)
  useEffect(() => {
    if (!user || !isAuthInitialized || !isFirebaseReady) {
      setProfile(null);
      setLibraryArtists([]);
      return;
    }

    // Subscribe to real-time profile updates from Firestore
    const userRef = doc(db, 'users', user.uid);
    const unsubscribe = onSnapshot(userRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setProfile(data);
        if (data && data.libraryArtists) {
          try {
            const parsed = JSON.parse(data.libraryArtists);
            if (Array.isArray(parsed)) {
              const inflatedArtists = parsed.map((artist: any) => {
                let dateObj: Date | null = null;
                if (artist.dateAdded) {
                  const d = new Date(artist.dateAdded);
                  if (!isNaN(d.getTime())) {
                    dateObj = d;
                  }
                }
                return {
                  name: artist.name || '',
                  dateAdded: dateObj
                };
              });
              setLibraryArtists(inflatedArtists);
            }
          } catch (e) {
            console.error("[Profile Listener] Failed to parse libraryArtists:", e);
          }
        } else {
          setLibraryArtists([]);
        }
      } else {
        // Automatically initialize profile record on signup
        const initialProfile = {
          email: user.email || '',
          displayName: user.displayName || '',
          onboardingProgress: { step1: true, step2: true, step3: true, step4: true, step5: true }
        };
        setProfile(initialProfile);
        setDoc(userRef, initialProfile, { merge: true }).catch(console.error);
        setLibraryArtists([]);
      }
    }, (err) => {
      console.error("[Profile Listener] Failed to fetch profile:", err);
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
      // If we already have a meaningful pathname, don't override it with the default redirect
      const currentPath = window.location.pathname;
      if (currentPath && currentPath !== '/' && currentPath !== '/index.html') {
        console.log('[HealthCheck] Auth Ready. Preserving existing path:', currentPath);
        hasInitialRedirectOccurredRef.current = true;
        return;
      }

      console.log('[HealthCheck] Auth and Firebase Ready. Redirecting to user destination...');
      const targetPath = authRedirectPathRef.current || '/dashboard';
      navigate(targetPath);
      authRedirectPathRef.current = null;
      hasInitialRedirectOccurredRef.current = true;
    }
  }, [isAuthInitialized, user, isFirebaseReady, currentView, navigate]);

  // Sync stack from Firestore (Real-Time)
  useEffect(() => {
    if (!isAuthInitialized || !isFirebaseReady) return;

    if (!user) {
      setStack([]);
      return;
    }

    const stackRef = collection(db, 'users', user.uid, 'stack');
    const unsubscribe = onSnapshot(stackRef, (snapshot) => {
      const items: StackItem[] = [];
      snapshot.forEach((docSnap) => {
        items.push({ ...docSnap.data() } as StackItem);
      });
      setStack(items);
      console.log(`[Stack Listener] Synchronized ${items.length} stack items.`);
    }, (err) => {
      console.error('[Stack Listener] Failed to fetch stack:', err);
    });

    return () => unsubscribe();
  }, [user, isAuthInitialized, isFirebaseReady]);

  // Sync projects list (Dashboard)
  useEffect(() => {
    if (!user || !isAuthInitialized || !isFirebaseReady) {
      setProjects([]);
      return;
    }

    const projectsRef = collection(db, 'users', user.uid, 'projects');
    const unsubscribe = onSnapshot(projectsRef, (snapshot) => {
      const projs: Project[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        projs.push({
          id: docSnap.id,
          ...data
        } as Project);
      });
      setProjects(projs);
      console.log(`[Projects Listener] Synchronized ${projs.length} projects.`);
    }, (err) => {
      console.error("[Projects Listener] Failed to fetch projects:", err);
    });

    return () => unsubscribe();
  }, [user, isAuthInitialized, isFirebaseReady]);

  // ── BATCH GLOBAL HYDRATION HELPER ──────────────────────────────────────
  // Reads the global 'artists' collection for every node in a loaded graph
  // and pre-populates the local detailsCache Map before the UI declares
  // the load cycle complete. This completely prevents the deep cut queue
  // from ever falling through to a live Gemini proxy call for known artists.
  const batchHydrateDetailsCache = useCallback(async (nodes: any[]): Promise<void> => {
    const artistNodes = nodes.filter((n: any) => n.type === 'artist' || !n.type);
    if (!artistNodes.length) return;

    const results = new Map<string, NodeDetails>();

    await Promise.allSettled(artistNodes.map(async (n: any) => {
      const standardizedId = normalizeArtistId(n.id);
      
      try {
        let snap = await getArtistDocWithRedirect(standardizedId);
        if (!snap.exists()) return;

        const data = snap.data();
        if (!data?.detailsCache) return;

        // Parse the raw JSON string
        let parsed: any = data.detailsCache;
        if (typeof parsed === 'string') parsed = JSON.parse(parsed);

        // Unwrap array wrapper layer [{ ... }] → { ... }
        if (Array.isArray(parsed) && parsed.length > 0) parsed = parsed[0];

        const bio = parsed?.summary || parsed?.bio || parsed?.description || parsed?.text || '';
        const imageUrl = parsed?.imageUrl || parsed?.image || '';
        const genre = parsed?.details?.genre || parsed?.genre || parsed?.genres || '';
        const origin = parsed?.details?.origin || parsed?.origin || parsed?.location || parsed?.country || '';
        const founded = parsed?.details?.founded || parsed?.founded || parsed?.formed || parsed?.year || '';
        // Fix C: Heal all-lowercase legacy artist names in-place — avoids quality gate firing on
        // every refresh for artists like 'buggin', 'zulu', 'scowl' whose old cache entries stored
        // the artist name without title casing.
        const rawArtistName = parsed?.details?.artist || parsed?.artist || parsed?.name || data.seedArtists || data.artistId || n.id;
        const artistName = rawArtistName && typeof rawArtistName === 'string' && rawArtistName === rawArtistName.toLowerCase()
            ? titleCaseArtistId(rawArtistName)
            : rawArtistName;
        const notableArtists = parsed?.details?.notableArtists || parsed?.notableArtists || [];
        const members = parsed?.members || [];
        const links = parsed?.links || [];
        const discography = parsed?.discography || [];
        const tourInfo = parsed?.tourInfo || '';
        const recommendationReason = parsed?.recommendationReason || parsed?.reason || '';
        const groundingLinks = parsed?.groundingLinks || [];
        // Fix A: Extract YouTube media fields with same guards as handleNodeClick hydration paths
        const youtubeVideoId = typeof parsed?.youtubeVideoId === 'string' && parsed.youtubeVideoId.trim().length === 11
            ? parsed.youtubeVideoId.trim() : undefined;
        const youtubeSearchQuery = typeof parsed?.youtubeSearchQuery === 'string' && parsed.youtubeSearchQuery.trim().length > 0
            ? parsed.youtubeSearchQuery.trim() : undefined;

        if (!bio || bio.length < 5) return;

        const payload: NodeDetails = {
          summary: bio,
          imageUrl,
          details: { artist: artistName, genre, origin, founded, notableArtists },
          members,
          links,
          discography,
          tourInfo,
          recommendationReason,
          groundingLinks,
          youtubeVideoId,
          youtubeSearchQuery
        };

        // Register under all lookup key variants
        results.set(n.id, payload);
        results.set(n.id.toLowerCase(), payload);
        results.set(standardizedId, payload);
        console.log('[Batch Hydration] Loaded from global artists:', n.id, '→', standardizedId);
      } catch (e) {
        console.warn('[Batch Hydration] Failed for', n.id, e);
      }
    }));

    if (results.size > 0) {
      // ── Synchronous ref pre-mutation ────────────────────────────────────────
      // handleNodeClick reads from detailsCacheRef.current (a stable ref), NOT from
      // the `detailsCache` React state value. The state is kept in sync via a useEffect
      // binder (line 943), but useEffect runs AFTER the render cycle commits — creating
      // a window where a URL-driven auto-selection or fast first click finds an empty ref.
      //
      // Fix: write results directly into the ref HERE, before calling setDetailsCache,
      // so any click handler that fires during the render-commit gap finds the data
      // synchronously. React does not track mutations to .current, so this is safe and
      // causes no extra renders. setDetailsCache still runs below to keep the state tree
      // consistent for all rendering components.
      results.forEach((v, k) => {
        const existing = detailsCacheRef.current.get(k);
        detailsCacheRef.current.set(k,
          (existing && existing.imageUrl && !v.imageUrl)
            ? { ...v, imageUrl: existing.imageUrl }
            : v
        );
      });
      // ────────────────────────────────────────────────────────────────────────

      setDetailsCache(prev => {
        const merged = new Map(prev);
        results.forEach((v, k) => {
          const existing = prev.get(k);
          if (existing && existing.imageUrl && !v.imageUrl) {
            console.log(`[Batch Hydration] Bypassing overwrite for ${k} because local cache has imageUrl but database is missing it`);
            merged.set(k, { ...v, imageUrl: existing.imageUrl });
          } else {
            merged.set(k, v);
          }
        });
        return merged;
      });
    }
  }, []);

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
        setCurrentCacheKey(null);
        setCurrentProjectOwnerId(null);
      }
      return;
    }

    let isMounted = true;
    const unsubscribeList: (() => void)[] = [];

    const isGraphEqual = (g1: any, g2: any) => {
      if (!g1 || !g2) return g1 === g2;
      try {
        const strip = (g: any) => ({
          nodes: g.nodes.map((n: any) => ({ id: n.id, type: n.type, label: n.label, group: n.group })),
          links: g.links.map((l: any) => ({ 
            source: typeof l.source === 'object' ? l.source.id : l.source, 
            target: typeof l.target === 'object' ? l.target.id : l.target 
          }))
        });
        return JSON.stringify(strip(g1)) === JSON.stringify(strip(g2));
      } catch (e) {
        return false;
      }
    };

    const handleSnap = async (snap: any): Promise<boolean> => {
      if (isHydratingSessionRef.current) {
        console.log('[ProjectLoader] Bypassing snapshot handle because local session is saving/hydrating');
        return false;
      }
      if (!isMounted || !snap.exists()) return false;

      const data = snap.data();

      // Guard against race condition: if local state is already populated (e.g. from a cache hit or manual generation),
      // do not let a snapshot with empty graph/seeds overwrite it, because the local save has not synced to Firestore yet.
      const localGraphPopulated = graphDataRef.current && graphDataRef.current.nodes && graphDataRef.current.nodes.length > 0;
      let incomingGraphEmpty = true;
      if (data.graphData) {
        try {
          const parsed = typeof data.graphData === 'string' ? JSON.parse(data.graphData) : data.graphData;
          if (parsed && parsed.nodes && parsed.nodes.length > 0) {
            incomingGraphEmpty = false;
          }
        } catch (e) {}
      } else if (data.artistIds && Array.isArray(data.artistIds) && data.artistIds.length > 0) {
        incomingGraphEmpty = false;
      } else if (data.cacheKey) {
        incomingGraphEmpty = false;
      }

      if (localGraphPopulated && incomingGraphEmpty) {
        console.log('[ProjectLoader] Bypassing snapshot handle because local state is populated but incoming database state is empty/blank');
        return false;
      }
      setCurrentProjectOwnerId(data.authorId || null);
      if (data.name !== undefined) setProjectName(data.name);

      // Always restore non-graph metadata (available in both new and legacy formats)
      if (data.seedArtists) setSeedArtists((prev: any) => prev === data.seedArtists ? prev : data.seedArtists);
      if (data.discoveryFilters) {
        const parsedFilters = typeof data.discoveryFilters === 'string' && data.discoveryFilters.startsWith('{') ? JSON.parse(data.discoveryFilters) : null;
        if (parsedFilters) setDiscoveryFilters((prev: any) => JSON.stringify(prev) === JSON.stringify(parsedFilters) ? prev : parsedFilters);
      }
      if (data.lastViewedStackCount !== undefined) setLastViewedStackCount((prev: any) => prev === data.lastViewedStackCount ? prev : data.lastViewedStackCount);
      if (data.chatHistories) {
        try {
          const newChatsMap = new Map<string, ChatMessage[]>(JSON.parse(data.chatHistories));
          setChatHistories((prev) => {
            if (prev.size !== newChatsMap.size) return newChatsMap;
            return JSON.stringify(Array.from(prev.entries())) === data.chatHistories ? prev : newChatsMap;
          });
        } catch (e) { console.error("Chat histories parse fail", e); }
      }
      if (data.isMagazineViewOpen !== undefined) {
        setIsMagazineViewOpen((prev: any) => prev === data.isMagazineViewOpen ? prev : data.isMagazineViewOpen);
      }

      try {
        let loadedFromGraphData = false;
        if (data.graphData && typeof data.graphData === 'string' && data.graphData.trim().length > 20) {
          try {
            console.log('[ProjectLoader] Hydrating directly from project graphData');
            const g = normalizeGraphData(JSON.parse(data.graphData));
            g.links = g.links.map((l: any) => ({
              ...l,
              source: typeof l.source === 'object' ? l.source.id : l.source,
              target: typeof l.target === 'object' ? l.target.id : l.target,
            }));

            // Re-apply saved canvas positions
            if (data.canvasLayout) {
              try {
                const positions: Array<{ nodeId: string; x?: number; y?: number; fx?: number | null; fy?: number | null }> = JSON.parse(data.canvasLayout);
                positions.forEach(ref => {
                  const node = g.nodes.find((n: any) => n.id === ref.nodeId);
                  if (node) { node.x = ref.x; node.y = ref.y; node.fx = ref.fx ?? null; node.fy = ref.fy ?? null; }
                });
              } catch (e) { console.warn('[ProjectLoader] canvasLayout parse failed:', e); }
            }

            g.nodes.forEach((n: any) => { n.fx = n.fx ?? null; n.fy = n.fy ?? null; });
            setGraphData((prev: any) => isGraphEqual(prev, g) ? prev : g);

            // ── FIRESTORE-FIRST: batch-load all node biographies before marking load complete
            await batchHydrateDetailsCache(g.nodes);

            // Restore active nodes
            if (data.activeNodes && Array.isArray(data.activeNodes)) {
              const nextActive = restoreActiveNodesHelper(data.activeNodes, g.nodes);
              setActiveNodes((prev: any) => {
                if (prev.length !== nextActive.length) return nextActive;
                return JSON.stringify(prev.map((n: any) => n.id)) === JSON.stringify(nextActive.map((n: any) => n.id)) ? prev : nextActive;
              });
            }

            loadedFromGraphData = true;
          } catch (e) {
            console.error('[ProjectLoader] Failed to hydrate directly from graphData:', e);
          }
        }

        if (!loadedFromGraphData) {
          if (data.artistIds && Array.isArray(data.artistIds) && data.artistIds.length > 0) {
            // Check if it's a complex configuration (multi-artist or has active filters)
            let parsedFilters: DiscoveryFilters = {};
            if (data.discoveryFilters) {
              try {
                parsedFilters = typeof data.discoveryFilters === 'string' && data.discoveryFilters.startsWith('{')
                  ? JSON.parse(data.discoveryFilters)
                  : data.discoveryFilters;
              } catch (e) {
                console.warn("Failed to parse incoming discoveryFilters:", e);
              }
            }
            const hasActiveFiltersIncoming = !!(
              parsedFilters.foundedAfter ||
              parsedFilters.foundedBefore ||
              (parsedFilters.includeOrigins && parsedFilters.includeOrigins.length > 0) ||
              (parsedFilters.excludeOrigins && parsedFilters.excludeOrigins.length > 0) ||
              (parsedFilters.includeGenres && parsedFilters.includeGenres.length > 0) ||
              (parsedFilters.additionalInstructions && parsedFilters.additionalInstructions.trim().length > 0)
            );
            const isMultiArtistIncoming = data.artistIds.length > 1 || (data.seedArtists && data.seedArtists.includes('::'));

            if (isMultiArtistIncoming || hasActiveFiltersIncoming) {
              console.log(`[ProjectLoader] Intercepting Phase 1 loading for complex query. Multi-artist: ${isMultiArtistIncoming}, Filtered: ${hasActiveFiltersIncoming}. Handing over to handleGenerateGraph.`);
              handleGenerateGraph(data.seedArtists || data.artistIds.join('::'), false, null, false, false, parsedFilters);
              return true;
            }

            // --- PHASE 1 FORMAT: hydrate from individual per-artist /artists/{id} docs ---
            console.log(`[ProjectLoader] Phase 1 format. Hydrating from artistIds: [${data.artistIds.join(', ')}]`);
            const { cached, missing } = await readArtistCacheMany(
              // artistIds are already normalized slugs — reconstruct display names from seedArtists
              // but pass the slugs directly as lookup keys via a thin wrapper
              data.artistIds.map((id: string) => id), // IDs are normalized slugs; readArtistCacheMany uses normalizeArtistId internally
              user?.uid
            );

            if (!isMounted) return false;

            if (cached.size > 0) {
              const g = assembleGraphFromCache(cached);

              // Re-apply saved canvas positions
              if (data.canvasLayout) {
                try {
                  const positions: Array<{ nodeId: string; x?: number; y?: number; fx?: number | null; fy?: number | null }> = JSON.parse(data.canvasLayout);
                  positions.forEach(ref => {
                    const node = g.nodes.find((n: any) => n.id === ref.nodeId);
                    if (node) { node.x = ref.x; node.y = ref.y; node.fx = ref.fx ?? null; node.fy = ref.fy ?? null; }
                  });
                } catch (e) { console.warn('[ProjectLoader] canvasLayout parse failed:', e); }
              }

              g.nodes.forEach((n: any) => { n.fx = n.fx ?? null; n.fy = n.fy ?? null; });
              setGraphData((prev: any) => isGraphEqual(prev, g) ? prev : g);

              // ── FIRESTORE-FIRST: batch-load all node biographies before marking load complete
              await batchHydrateDetailsCache(g.nodes);

              if (missing.length > 0) {
                console.warn(`[ProjectLoader] ${missing.length} artist doc(s) missing from cache: [${missing.join(', ')}]. They will be re-fetched on next graph generation.`);
              }
            } else {
              console.warn(`[ProjectLoader] All artistIds cache-missed — graph will be empty until regenerated.`);
            }

            // Restore active nodes
            if (data.activeNodes && Array.isArray(data.activeNodes)) {
              setActiveNodes((prev: any) => {
                const gNodes = cached.size > 0 ? assembleGraphFromCache(cached).nodes : [];
                const nextActive = restoreActiveNodesHelper(data.activeNodes, gNodes);
                if (prev.length !== nextActive.length) return nextActive;
                return JSON.stringify(prev.map((n: any) => n.id)) === JSON.stringify(nextActive.map((n: any) => n.id)) ? prev : nextActive;
              });
            }

          } else if (data.cacheKey) {
            // --- LEGACY FORMAT (deprecated): hydrate from compound /artists/{cacheKey} doc ---
            console.log(`[ProjectLoader] Legacy cacheKey format detected. Hydrating from: ${data.cacheKey}`);
            const legacyEntry = await readLegacyArtistCache(data.cacheKey);
            if (!isMounted) return false;

            if (legacyEntry) {
              const g: GraphData = JSON.parse(legacyEntry.graphData);
              g.links = g.links.map((l: any) => ({
                ...l,
                source: typeof l.source === 'object' ? l.source.id : l.source,
                target: typeof l.target === 'object' ? l.target.id : l.target,
              }));
              g.nodes.forEach((n: any) => { n.fx = null; n.fy = null; });

              if (data.canvasLayout) {
                try {
                  const positions: Array<{ nodeId: string; x?: number; y?: number; fx?: number | null; fy?: number | null }> = JSON.parse(data.canvasLayout);
                  positions.forEach(ref => {
                    const node = g.nodes.find((n: any) => n.id === ref.nodeId);
                    if (node) { node.x = ref.x; node.y = ref.y; node.fx = ref.fx ?? null; node.fy = ref.fy ?? null; }
                  });
                } catch (e) { console.warn('[ProjectLoader] canvasLayout parse failed:', e); }
              }

              setGraphData((prev: any) => isGraphEqual(prev, g) ? prev : g);
              setCurrentCacheKey(data.cacheKey);

              // ── FIRESTORE-FIRST: batch-load biographies from global collection
              await batchHydrateDetailsCache(g.nodes);


              if (legacyEntry.detailsCache) {
                try {
                  const rawMap = new Map<string, NodeDetails>(JSON.parse(legacyEntry.detailsCache));
                  const newCacheMap = new Map<string, NodeDetails>();
                  rawMap.forEach((v, k) => {
                    newCacheMap.set(k, v);
                    newCacheMap.set(k.toLowerCase(), v);
                    newCacheMap.set(normalizeArtistId(k), v);
                  });
                  setDetailsCache((prev) => {
                    if (prev.size !== newCacheMap.size) return newCacheMap;
                    return JSON.stringify(Array.from(prev.entries())) === JSON.stringify(Array.from(newCacheMap.entries())) ? prev : newCacheMap;
                  });
                } catch (e) { console.error("Details cache parse fail", e); }
              }

              if (data.activeNodes && Array.isArray(data.activeNodes)) {
                const nextActive = restoreActiveNodesHelper(data.activeNodes, g.nodes);
                setActiveNodes((prev: any) => {
                  if (prev.length !== nextActive.length) return nextActive;
                  return JSON.stringify(prev.map((n: any) => n.id)) === JSON.stringify(nextActive.map((n: any) => n.id)) ? prev : nextActive;
                });
              }
            } else {
              // Legacy cache miss — fall back to inline graphData blob if available
              console.warn(`[ProjectLoader] Legacy cache miss for key: ${data.cacheKey} — trying inline graphData fallback.`);
              if (data.graphData && data.graphData.length > 20) {
                const g = normalizeGraphData(JSON.parse(data.graphData));
                g.links = g.links.map((l: any) => ({
                  ...l,
                  source: typeof l.source === 'object' ? l.source.id : l.source,
                  target: typeof l.target === 'object' ? l.target.id : l.target,
                }));
                g.nodes.forEach((n: any) => { n.fx = null; n.fy = null; });
                if (g.nodes.length > 0) {
                  setGraphData((prev: any) => isGraphEqual(prev, g) ? prev : g);
                  if (data.activeNodes && Array.isArray(data.activeNodes)) {
                    const nextActive = restoreActiveNodesHelper(data.activeNodes, g.nodes);
                    setActiveNodes((prev: any) => {
                      if (prev.length !== nextActive.length) return nextActive;
                      return JSON.stringify(prev.map((n: any) => n.id)) === JSON.stringify(nextActive.map((n: any) => n.id)) ? prev : nextActive;
                    });
                  }
                }
              }
            }
          } else if (data.graphData) {
            // --- VERY LEGACY FORMAT: full graph blob stored inline ---
            console.log(`[ProjectLoader] Full blob legacy format — loading graphData inline.`);
            const g = normalizeGraphData(JSON.parse(data.graphData));
            g.links = g.links.map((l: any) => ({
              ...l,
              source: typeof l.source === 'object' ? l.source.id : l.source,
              target: typeof l.target === 'object' ? l.target.id : l.target
            }));
            g.nodes.forEach((n: any) => { n.fx = null; n.fy = null; });

            setGraphData((prev: any) => isGraphEqual(prev, g) ? prev : g);

            // ── FIRESTORE-FIRST: batch-load biographies from global collection
            await batchHydrateDetailsCache(g.nodes);

            if (data.detailsCache) {
              try {
                const rawMap = new Map<string, NodeDetails>(JSON.parse(data.detailsCache));
                const newCacheMap = new Map<string, NodeDetails>();
                rawMap.forEach((v, k) => {
                  newCacheMap.set(k, v);
                  newCacheMap.set(k.toLowerCase(), v);
                  newCacheMap.set(normalizeArtistId(k), v);
                });
                setDetailsCache((prev) => {
                  if (prev.size !== newCacheMap.size) return newCacheMap;
                  return JSON.stringify(Array.from(prev.entries())) === JSON.stringify(Array.from(newCacheMap.entries())) ? prev : newCacheMap;
                });
              } catch (e) { console.error("Details cache parse fail", e); }
            }

            if (data.activeNodes && Array.isArray(data.activeNodes)) {
              const nextActive = restoreActiveNodesHelper(data.activeNodes, g.nodes);
              setActiveNodes((prev: any) => {
                if (prev.length !== nextActive.length) return nextActive;
                return JSON.stringify(prev.map((n: any) => n.id)) === JSON.stringify(nextActive.map((n: any) => n.id)) ? prev : nextActive;
              });
            }
          }
        }
      } catch (err) {
        console.error("Failed to parse project data:", err);
      }

      return true; // Found
    };


    const loadProject = async () => {
      try {
        console.log(`[ProjectLoader] Attempting to load project: ${currentProjectId}`);

        // Offline Sandbox Interception
        if (currentProjectId === 'sandbox-project-1') {
          console.log(`[ProjectLoader] [Offline Sandbox] Hydrating sandbox-project-1`);
          const mockProj = {
            nodes: [
              { id: 'Orange 9mm', type: 'artist' as const, group: 1, x: 200, y: 200 },
              { id: 'Madball', type: 'artist' as const, group: 2, x: 250, y: 220 },
              { id: 'H2O', type: 'artist' as const, group: 3, x: 220, y: 280 }
            ],
            links: [
              { source: 'Orange 9mm', target: 'Madball', value: 1 },
              { source: 'Orange 9mm', target: 'H2O', value: 1 }
            ]
          };
          setGraphData(mockProj);
          setSeedArtists('Orange 9mm::Madball::H2O');
          const fallbackName = localStorage.getItem('zcene_project_name_sandbox-project-1') || 'Offline Zcene Project';
          setProjectName(fallbackName);
          return;
        }

        // 1. Try Shared Zcenes (top-level)
        const shareRef = doc(db, 'sharedZcenes', currentProjectId);
        try {
          const shareSnap = await getDoc(shareRef);
          if (!isMounted) return;
          if (await handleSnap(shareSnap)) {
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
          if (await handleSnap(flatSnap)) {
            console.log(`[ProjectLoader] Found in top-level projects, setting up real-time sync`);
            const unsub = onSnapshot(flatProjectRef, (snap) => { handleSnap(snap); }, (err) => {
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
            if (await handleSnap(userSnap)) {
              console.log(`[ProjectLoader] Found in user projects, setting up real-time sync`);
              const unsub = onSnapshot(userProjectRef, (snap) => { handleSnap(snap); }, (err) => {
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
        if (isMounted) {
          const fallbackName = localStorage.getItem(`zcene_project_name_${currentProjectId}`) || 'Mock Zcene Sandbox';
          setProjectName(fallbackName);
          console.log(`[ProjectLoader] [Offline Sandbox] Hydrated project name from fallback: ${fallbackName}`);
        }
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
        
        // Phase 05: Build lightweight canvas layout — artist nodes only (x/y/fx/fy)
        const canvasLayout = graphData.nodes
          .filter(n => n.type === 'artist')
          .map(n => ({ nodeId: n.id, x: n.x, y: n.y, fx: n.fx ?? null, fy: n.fy ?? null }));

        const docPayload: Record<string, any> = {
          seedArtists,
          discoveryFilters: JSON.stringify(discoveryFilters),
          lastViewedStackCount,
          activeNodes: activeNodes.map(n => n.id),
          isMagazineViewOpen: isMagazineViewOpen && activeNodes.length > 0,
          chatHistories: JSON.stringify(Array.from(chatHistories.entries())),
          authorId: user.uid,
          updatedAt: serverTimestamp(),
        };

        if (currentCacheKey) {
          // Legacy path: preserve the compound cacheKey if it was set in the current session
          // (e.g. session started before Phase 1 was deployed). Write it for backward compatibility.
          docPayload.cacheKey = currentCacheKey;
          docPayload.canvasLayout = JSON.stringify(canvasLayout);
        } else {
          // Phase 1+: derive the artistIds array from all artist nodes currently in the graph.
          // Each entry points to an individual /artists/{id} Firestore document.
          const currentArtistList = graphData.nodes
            .filter((n: any) => n.type === 'artist')
            .map((n: any) => n.id);

          if (currentArtistList.length > 0) {
            docPayload.artistIds = currentArtistList.map((name: string) => normalizeArtistId(name));
            docPayload.canvasLayout = JSON.stringify(canvasLayout);
            docPayload.graphData = JSON.stringify(graphData);
          } else {
            // No artists present yet — fall back to full blob (should be rare)
            docPayload.graphData = JSON.stringify(graphData);
          }
        }

        // Sync project state to Firestore
        await setDoc(doc(db, projectPath), docPayload, { merge: true });
        console.log(`[Database Reporter] SUCCESS: Project synced.`);

        console.log(`[Database Reporter] SUCCESS: Project synced (mock).`);
        setTimeout(() => { isHydratingSessionRef.current = false; }, 1000);
      } catch (err) {
        console.error(`[Database Reporter] PROJECT SAVE FAILED: ${projectPath}`);
        isHydratingSessionRef.current = false;
      }
    }, 3000);

    return () => clearTimeout(timer);
  }, [user, isFirebaseReady, isAuthInitialized, currentProjectId, graphData, seedArtists, discoveryFilters, activeNodes, isMagazineViewOpen, chatHistories, lastViewedStackCount, currentCacheKey]);

  const lastProcessedHashRef = useRef<string>('');
  const lastProcessedSelectedRef = useRef<string | null>(null);
  const lastProcessedSessionKeyRef = useRef<string>('');

  // Gracefully clean up legacy hash routing URLs to clean pathnames on entry
  useEffect(() => {
    const hash = window.location.hash;
    if (hash) {
      let legacyPath = '';
      if (hash.startsWith('#/')) {
        legacyPath = hash.substring(2);
      } else if (hash.startsWith('#')) {
        legacyPath = hash.substring(1);
      }
      
      if (legacyPath && legacyPath !== '/') {
        const [pathPart, queryPart] = legacyPath.split('?');
        const searchStr = queryPart ? `?${queryPart}` : window.location.search;
        const cleanPath = `/${pathPart}`;
        
        window.history.replaceState(null, '', cleanPath + searchStr);
        window.dispatchEvent(new PopStateEvent('popstate'));
      }
    }
  }, []);

  useEffect(() => {
    const processDeepLink = async () => {
      const pathname = window.location.pathname;
      const searchParams = new URLSearchParams(window.location.search);
      const projectIdFromQuery = searchParams.get('id') || searchParams.get('projectId');
      const shareIdFromQuery = searchParams.get('shareId');

      const isAppPath = pathname === '/app' || pathname.startsWith('/app/');
      const isDashboardPath = pathname === '/dashboard';
      const isProjectPath = pathname.startsWith('/z/') || pathname.startsWith('/project/');

      // --- ROUTING LOGIC ---
      if (isAppPath || isDashboardPath || isProjectPath || pathname === '/help' || pathname.startsWith('/design') || pathname === '/engine' || pathname === '/analytics' || shareIdFromQuery || projectIdFromQuery) {
        // Optimization: Pre-capture pathname + search for redirection if auth is not ready
        if (!isAuthInitialized) {
          authRedirectPathRef.current = pathname + window.location.search;
          return;
        }

        // Allow access to app if we have a deep link ID, even if not logged in
        if (!user && !projectIdFromQuery && !shareIdFromQuery) {
          authRedirectPathRef.current = pathname + window.location.search;
          if (currentViewRef.current !== View.Home) {
            setCurrentView(View.Home);
            navigate('/', true);
          }
          return;
        }

        if (user && !isFirebaseReady) return;

        if (isDashboardPath) {
          setPreviousWorkspace({ view: View.Dashboard, projectId: null });
          if (currentViewRef.current !== View.Dashboard) {
            setCurrentView(View.Dashboard);
            setCurrentProjectId(null);
            setCurrentProjectOwnerId(null);
          }
        } else if (isProjectPath || projectIdFromQuery || shareIdFromQuery) {
          let projectId = projectIdFromQuery || shareIdFromQuery;
          if (!projectId) {
            if (pathname.startsWith('/z/')) {
              projectId = pathname.substring(3).split('?')[0];
            } else if (pathname.startsWith('/project/')) {
              projectId = pathname.substring(9).split('?')[0];
            }
          }
          if (projectId) {
            setPreviousWorkspace({ view: View.Graph, projectId: projectId });
            if (currentViewRef.current !== View.Graph || currentProjectIdRef.current !== projectId) {
              if (currentProjectIdRef.current !== projectId) {
                setGraphData({ nodes: [], links: [] });
                setSeedArtists('');
                setActiveNodes([]);
                setDetailsCache(new Map());
                setChatHistories(new Map());
                setCurrentCacheKey(null);
              }
              setCurrentProjectId(projectId);
              setCurrentView(View.Graph);
            }
          }
        } else if (isAppPath) {
          // Fallback for old /app link - redirect to dashboard if logged in
          if (user) navigate('/dashboard', true);
          else setCurrentView(View.Graph);
        } else if (pathname === '/help') {
          if (currentViewRef.current !== View.Help) setCurrentView(View.Help);
        } else if (pathname.startsWith('/design')) {
          if (isAdmin) {
            if (currentViewRef.current !== View.StyleGuide) setCurrentView(View.StyleGuide);
          } else {
            setCurrentView(View.Home);
          }
        } else if (pathname === '/engine') {
          if (isAdmin) {
            if (currentViewRef.current !== View.Engine) setCurrentView(View.Engine);
          } else {
            setCurrentView(View.Home);
          }
        } else if (pathname === '/analytics') {
          if (user) {
            if (currentViewRef.current !== View.Analytics) setCurrentView(View.Analytics);
          } else {
            setCurrentView(View.Home);
          }
        }

        // Only initialize empty graph if it's actually null (initial state)
        if (graphData === null) {
          setGraphData({ nodes: [], links: [] });
        }
      } else if (pathname === '/source') {
        if (currentViewRef.current !== View.Engine) setCurrentView(View.Engine);
      } else {
        if (currentViewRef.current !== View.Home) setCurrentView(View.Home);
      }

      // --- PARAMETER PROCESSING ---
      const authKey = user ? user.uid : 'guest';
      const sessionKey = `${pathname}${window.location.search}-${authKey}`;

      if (pathname === lastProcessedHashRef.current && sessionKey === lastProcessedSessionKeyRef.current && isAuthInitialized) {
        // Check if we still need to process 'selected' because graphData just arrived
        const selected = searchParams.get('selected');
        if (selected && selected !== lastProcessedSelectedRef.current && graphData) {
          const node = graphData.nodes.find(n => n.id.toLowerCase() === selected.toLowerCase());
          if (node) {
            lastProcessedSelectedRef.current = selected;
            handleNodeClick(node);
          }
        }
        return;
      }

      lastProcessedHashRef.current = pathname;
      lastProcessedSessionKeyRef.current = sessionKey;
      if (!window.location.search) return;

      const seeds = searchParams.get('seeds'), origin = searchParams.get('origin'), selected = searchParams.get('selected');
      const shareId = searchParams.get('shareId') || searchParams.get('id');

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
            const g = normalizeGraphData(JSON.parse(data.graphData));
            g.links = g.links.map((l: any) => ({
              ...l,
              source: typeof l.source === 'object' ? l.source.id : l.source,
              target: typeof l.target === 'object' ? l.target.id : l.target
            }));
            g.nodes.forEach((n: any) => { n.fx = null; n.fy = null; });

            setGraphData(g);
            setSeedArtists(data.seedArtists);
            if (data.detailsCache) setDetailsCache(new Map(JSON.parse(data.detailsCache)));
            await batchHydrateDetailsCache(g.nodes);
            if (data.activeNodes && Array.isArray(data.activeNodes)) {
              setActiveNodes(restoreActiveNodesHelper(data.activeNodes, g.nodes));
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
    window.addEventListener('popstate', processDeepLink);
    window.addEventListener('hashchange', processDeepLink);
    return () => {
      window.removeEventListener('popstate', processDeepLink);
      window.removeEventListener('hashchange', processDeepLink);
    };
  }, [handleGenerateGraph, seedArtists, isLoading, graphData, handleNodeClick, isAuthInitialized, user, isFirebaseReady, showToast, isAdmin, navigate]);

  const handleCloseNode = useCallback((nodeId: string) => {
    setActiveNodes(prev => {
      const idx = prev.findIndex(n => n.id.toLowerCase() === nodeId.toLowerCase());
      if (idx === -1) return prev;
      const next = prev.filter((_, i) => i !== idx);
      if (selectedNode?.id.toLowerCase() === nodeId.toLowerCase()) setSelectedNode(next.length ? next[Math.min(idx, next.length - 1)] : null);
      return next;
    });
  }, [selectedNode]);

  const handleRefreshNode = useCallback(async (nodeId: string) => {
    // ── Token Quota Gate ───────────────────────────────────────────────────────
    // Must run BEFORE any cache eviction or Firestore deletion.
    // If the curator cancels, the profile is left untouched and no AI call fires.
    const confirmed = await confirmTokenUsage('data_quality_optimization', [], [titleCaseArtistId(nodeId)]);
    if (!confirmed) return;
    // ──────────────────────────────────────────────────────────────────────────

    // 1. Evict from local state immediately to show loading spinner
    setDetailsCache(prev => { 
        const n = new Map(prev); 
        n.delete(nodeId); 
        n.delete(nodeId.toLowerCase());
        n.delete(normalizeArtistId(nodeId));
        return n; 
    });
    
    // 2. Hard-delete the Firestore cache document to bypass cache
    try {
        const cacheId = normalizeArtistId(nodeId);
        try {
            await deleteDoc(doc(db, 'artists', cacheId));
            console.log(`[Cache Eviction] Deleted Firestore cache for: ${cacheId}`);
        } catch (error: any) {
            console.warn("Global write bypassed due to rule restrictions:", error.message);
        }
    } catch (error) {
        console.error(`[Cache Eviction] Failed to delete Firestore cache for ${nodeId}:`, error);
    }
  }, [confirmTokenUsage]);
  const handleExtendNode = useCallback(async (node: Node) => {
    if (!graphData) return;

    // Restoring Immersive Discovery Flow: Bypass the cache check on node expansions
    // to force open the Cost Dialogue and dispatch a live API call upon user confirmation.

    const confirmed = await confirmTokenUsage('extension', [], [node.label || titleCaseArtistId(node.id)]);
    if (!confirmed) return;

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

      // Identify newly discovered artists in the extension
      const discoveredArtistNodes = extension.nodes.filter(n => n.type === 'artist');
      const discoveredArtistNames = discoveredArtistNodes.map(n => n.id);

      const filteredNodes = graphData.nodes.filter(n => n.id !== loadingNodeId);
      const filteredLinks = graphData.links.filter(l => {
        const s = typeof l.source === 'string' ? l.source : (l.source as Node).id;
        const t = typeof l.target === 'string' ? l.target : (l.target as Node).id;
        return s !== loadingNodeId && t !== loadingNodeId;
      });

      const baseGraph = { nodes: filteredNodes, links: filteredLinks };
      const mergedGraph = mergeGraphData(baseGraph, extension);

      // Double-Write to Global Cache: Await global cache writes before updating canvas graphData state.
      // This prevents the project canvas auto-save from racing ahead before the cache entries exist.
      if (discoveredArtistNames.length > 0) {
        showToast("Saving new artists to global cache...");
        try {
          await writeArtistCacheMany(discoveredArtistNames, mergedGraph, user?.uid, discoveryFilters);
          console.log(`[Node Extension] Global cache double-write confirmed for: ${discoveredArtistNames.join(', ')}`);
        } catch (e) {
          console.error('[Node Extension] Global cache double-write failed:', e);
        }
      }

      setGraphData(mergedGraph);

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
  }, [graphData, seedArtists, user, discoveryFilters, showToast, humanizeError]);

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

  const incrementDeepCutsOpenedCount = useCallback(async () => {
    // Guardrail: Sandbox Safety & Key Protection
    const isLocal = typeof window !== 'undefined' && 
      (window.location.hostname === 'localhost' || 
       window.location.hostname === '127.0.0.1' ||
       window.location.port === '3000');
    
    if (isLocal || import.meta.env.DEV) {
      console.log("[Analytics] Sandbox Mode: Suppressed JIT increment of Deep Cuts Opened counter.");
      return;
    }

    if (!user) return;

    try {
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        deepCutsOpened: increment(1)
      });
      console.log("[Analytics] JIT incremented Deep Cuts Opened counter.");
    } catch (e: any) {
      console.warn("[Analytics] Bypassed incrementing Deep Cuts Opened count:", e.message);
    }
  }, [user]);

  const triggerBackgroundRevalidation = useCallback(async (node: Node, cacheId: string) => {
    // Guardrail: Sandbox Safety & Key Protection
    const isLocal = typeof window !== 'undefined' && 
      (window.location.hostname === 'localhost' || 
       window.location.hostname === '127.0.0.1' ||
       window.location.port === '3000');
    
    if (isLocal || import.meta.env.DEV) {
      console.log("[Revalidation] Sandbox Mode: Suppressed background refresh for: " + node.id);
      return;
    }

    console.log("[Revalidation] Silently refreshing stale cache in background for: " + node.id);
    try {
      const freshDetails = await fetchNodeDetails(node, graphData, seedArtists, urlOriginHint);
      
      // Update local state details cache
      setDetailsCache(prev => {
        const updated = new Map(prev);
        updated.set(node.id, freshDetails);
        updated.set(node.id.toLowerCase(), freshDetails);
        updated.set(normalizeArtistId(node.id), freshDetails);
        return updated;
      });

      // Update selectedNode UI state if the user is still actively viewing it
      setSelectedNode(prev => {
        if (prev && normalizeArtistId(prev.id) === cacheId) {
          return {
            ...prev,
            bio: freshDetails.summary,
            summary: freshDetails.summary,
            genre: freshDetails.details?.genre || "",
            origin: freshDetails.details?.origin || "",
            founded: freshDetails.details?.founded || "",
            name: freshDetails.details?.artist || prev.id,
            imageUrl: freshDetails.imageUrl || (prev as any).imageUrl
          };
        }
        return prev;
      });

      // Overwrite the global cache doc with fresh data and a new cachedAt timestamp
      await updateDoc(doc(db, 'artists', cacheId), {
        detailsCache: JSON.stringify(freshDetails),
        cachedAt: serverTimestamp()
      });
      console.log("[Revalidation] Successfully updated stale cache in Firestore for: " + cacheId);
    } catch (e: any) {
      console.warn("[Revalidation] Background refresh failed for: " + cacheId, e.message);
    }
  }, [graphData, seedArtists, urlOriginHint]);

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

  // Reset the deep cut queue when navigating to a different project.
  // Without this, isFetchingDetailsRef stays `true` from the old guest/shared
  // queue, so any newly-clicked node hangs in loadingNodeIds forever.
  useEffect(() => {
    isFetchingDetailsRef.current = false;
    fetchingNodeIdsRef.current.clear();
    setLoadingNodeIds(new Set());
  }, [currentProjectId]);

  useEffect(() => {
    if (isLoading) return;
    const fetch = async () => {
      // 1. Block Automated Background Fetches: ✦
      // ONLY process the actively selected node to prevent neighbor chain-fetching
      const nodes = activeNodes.filter(n => {
        const isSelected = selectedNode && normalizeArtistId(selectedNode.id) === normalizeArtistId(n.id);
        
        // If the selected node has already been hydrated with bio text from the local cache, 
        // DO NOT fetch again, even if the detailsCache Map hasn't technically committed to the component yet.
        const hasHydratedBio = isSelected && (selectedNode as any)?.bio && (selectedNode as any).bio.length > 5;
        
        const normId = normalizeArtistId(n.id);
        return !detailsCache.has(normId) && 
               !detailsCache.has(n.id.toLowerCase()) && 
               !fetchingNodeIdsRef.current.has(n.id) &&
               isSelected &&
               !hasHydratedBio;
      });
      
      if (!nodes.length || isFetchingDetailsRef.current) return;
      isFetchingDetailsRef.current = true;
      lastProgressTimestampRef.current = Date.now();

      try {
        for (const node of nodes) {
          const slugId = normalizeArtistId(node.id);
          if (detailsCache.has(node.id) || detailsCache.has(node.id.toLowerCase()) || detailsCache.has(slugId) || fetchingNodeIdsRef.current.has(node.id)) continue;

          fetchingNodeIdsRef.current.add(node.id);
          setLoadingNodeIds(prev => new Set(prev).add(node.id));
          lastProgressTimestampRef.current = Date.now();

          // Fix 2: Per-node try/finally guarantees loadingNodeIds cleanup even if an
          // unexpected exception escapes the inner while-loop try/catch. Previously only
          // isFetchingDetailsRef was reset (in the outer finally), leaving the spinner
          // stranded indefinitely.
          try {
            let retries = 0, max = 3, success = false;
            while (retries < max && !success) {
              try {
                if (!graphData) throw new Error("No data");

                // Global Artists Fallback Read
                let fallbackDetails: NodeDetails | null = null;
                let isStale = false;
                
                const isEvicted = evictedNodeIdsRef.current.has(node.id) || 
                                  evictedNodeIdsRef.current.has(node.id.toLowerCase()) || 
                                  evictedNodeIdsRef.current.has(normalizeArtistId(node.id));
                if (!isEvicted) {
                  try {
                    const cacheId = normalizeArtistId(node.id);
                    let cacheDoc = await getArtistDocWithRedirect(cacheId);
                    
                    if (cacheDoc.exists()) {
                       const data = cacheDoc.data();
                     if (data) {
                        isStale = isCacheExpired(data.cachedAt);
                     }
                     if (data && data.detailsCache) {
                        try {
                            const parsed = typeof data.detailsCache === 'string' ? JSON.parse(data.detailsCache) : data.detailsCache;
                            if (parsed && (parsed.bio || parsed.summary)) {
                               const bio = parsed.summary || parsed.bio || parsed.description || parsed.text || "";
                               const imageUrl = parsed.imageUrl || parsed.image || "";
                               const genre = parsed.details?.genre || parsed.genre || parsed.genres || "";
                               const origin = parsed.details?.origin || parsed.origin || parsed.location || parsed.country || "";
                               const founded = parsed.details?.founded || parsed.founded || parsed.formed || parsed.year || "";
                               const artistName = parsed.details?.artist || parsed.artist || parsed.name || data.seedArtists || data.artistId || node.id;
                               const notableArtists = parsed.details?.notableArtists || parsed.notableArtists || [];
                               const members = parsed.members || [];
                               const links = parsed.links || [];
                               const discography = parsed.discography || [];
                               const tourInfo = parsed.tourInfo || "";
                               const recommendationReason = parsed.recommendationReason || parsed.reason || "";
                               const groundingLinks = parsed.groundingLinks || [];

                               fallbackDetails = {
                                  summary: bio,
                                  imageUrl,
                                  details: {
                                      artist: artistName,
                                      genre,
                                      origin,
                                      founded,
                                      notableArtists
                                  },
                                  members,
                                  links,
                                  discography,
                                  tourInfo,
                                  recommendationReason,
                                  groundingLinks
                               };
                               console.log("[Global Cache] Fallback successful for:", node.id);
                            }
                        } catch(e) { console.warn("Failed parsing global detailsCache", e); }
                     }
                  }
                } catch (e) { console.warn("[Global Cache] Fallback read failed", e); }
                }

                let details: NodeDetails;
                if (fallbackDetails) {
                   details = fallbackDetails;
                   if (isStale) {
                     const cacheId = normalizeArtistId(node.id);
                     triggerBackgroundRevalidation(node, cacheId);
                   }
                } else {
                   // Individual node timeout (45s) to prevent the whole queue from hanging
                   const nodeDetailsPromise = fetchNodeDetails(node, graphData, seedArtists, urlOriginHint);
                   const timeoutPromise = new Promise((_, reject) =>
                     setTimeout(() => reject(new Error("Request timed out after 45s")), 45000)
                   );
                   details = await Promise.race([nodeDetailsPromise, timeoutPromise]) as NodeDetails;
                }

                healedDetailsCacheRef.current.set(node.id, details);
                healedDetailsCacheRef.current.set(node.id.toLowerCase(), details);
                healedDetailsCacheRef.current.set(normalizeArtistId(node.id), details);

                setDetailsCache(prev => {
                  const updated = new Map(prev);
                  updated.set(node.id, details);
                  updated.set(node.id.toLowerCase(), details);
                  updated.set(normalizeArtistId(node.id), details);
                  return updated;
                });
                
                evictedNodeIdsRef.current.delete(node.id);
                evictedNodeIdsRef.current.delete(node.id.toLowerCase());
                evictedNodeIdsRef.current.delete(normalizeArtistId(node.id));

                incrementDeepCutsOpenedCount();

                // Fix 3: Race-safe details write-back.
                // Previously guarded by `if (!fallbackDetails)`, which caused the write to be skipped
                // entirely when the queue read a stale-but-undeletable document (delete is admin-only).
                // Fix: always attempt updateDoc when the doc exists, so cachedAt is refreshed
                // regardless of whether the data came from a live Gemini call or the Firestore fallback.
                // JIT creation (setDoc) is only attempted when the document does not yet exist.
                {
                  const cacheId = normalizeArtistId(node.id);
                  try {
                    const existingSnap = await getArtistDocWithRedirect(cacheId);
                    if (existingSnap.exists()) {
                      // Update the existing doc with fresh detailsCache and a new cachedAt timestamp.
                      // The security rule Case A permits: detailsCache, hitCount, and cachedAt.
                      await updateDoc(doc(db, 'artists', existingSnap.id), {
                        detailsCache: JSON.stringify(details),
                        cachedAt: serverTimestamp()
                      });
                      console.log(`[Deep Cut Queue] Write-back: Updated detailsCache + cachedAt for: ${existingSnap.id}`);
                    } else if (!fallbackDetails) {
                      // JIT cache creation for peripheral recommendation nodes:
                      // Only create a new document if the node came from live Gemini synthesis
                      // (i.e. no fallback was available). This prevents poisoning with stale data.
                      const normalizedGraph = normalizeGraphData(graphData);
                      let { nodes: subNodes, links: subLinks } = extractArtistSubGraph(node.id, normalizedGraph, seedArtists.split('::'));
                      
                      if (subNodes.length === 0) {
                        subNodes = [{ id: node.id, label: node.label || node.id, type: 'artist', group: node.group || 1 }];
                      }
                      
                      const canonicalNode = subNodes.find(
                        n => n.type === 'artist' && (n.id.trim().toLowerCase() === node.id.trim().toLowerCase() || normalizeArtistId(n.id) === cacheId)
                      );
                      const canonicalName = canonicalNode?.label ?? canonicalNode?.id ?? node.id;
                      
                      const canonicalNameFromDetails = details.details?.artist;
                      const canonicalId = canonicalNameFromDetails ? normalizeArtistId(canonicalNameFromDetails) : cacheId;
                      const isAlias = canonicalId !== cacheId;
                      
                      const canonicalDocRef = doc(db, 'artists', canonicalId);
                      await setDoc(canonicalDocRef, {
                        cacheKey: canonicalId,
                        artistId: canonicalId,
                        seedArtists: canonicalNameFromDetails || canonicalName,
                        graphData: JSON.stringify({ nodes: subNodes, links: subLinks }),
                        filters: discoveryFiltersRef.current || {},
                        cacheVersion: 2,
                        cachedAt: serverTimestamp(),
                        hitCount: 0,
                        isDeep: false,
                        detailsCache: JSON.stringify(details)
                      });
                      console.log(`[Deep Cut Queue] JIT cached Canonical node: ${canonicalId}`);
                      
                      if (isAlias) {
                        const aliasDocRef = doc(db, 'artists', cacheId);
                        await setDoc(aliasDocRef, {
                          cacheKey: cacheId,
                          artistId: cacheId,
                          seedArtists: node.id,
                          graphData: JSON.stringify({ nodes: [], links: [] }),
                          filters: {},
                          cacheVersion: 2,
                          cachedAt: serverTimestamp(),
                          hitCount: 0,
                          redirectTo: canonicalId
                        });
                        console.log(`[Deep Cut Queue] Created Alias Redirect: ${cacheId} -> ${canonicalId}`);
                      }
                    }
                  } catch (e: any) {
                    console.error(
                        `[PERMISSIONS] write-back failed for artists/${cacheId}:`,
                        `code=${(e as any)?.code}`,
                        `message=${e.message}`
                    );
                  }
                }
                
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
                  
                  // Insulate the Sidebar Lifecycle:
                  // Show a toast instead of setting detailsError to prevent the sidebar from wiping cache values
                  if (selectedNode?.id === node.id) {
                      showToast(humanizeError(err));
                  }
                  break;
                }
              }
            }
          } finally {
            // Guaranteed per-node cleanup — runs even if an unexpected exception escapes
            // the while-loop's inner catch block.
            fetchingNodeIdsRef.current.delete(node.id);
            setLoadingNodeIds(prev => { const next = new Set(prev); next.delete(node.id); return next; });
            lastProgressTimestampRef.current = Date.now();
          }
        }
      } finally { isFetchingDetailsRef.current = false; }
    };
    fetch();
  }, [activeNodes, detailsCache, graphData, seedArtists, selectedNode, urlOriginHint, humanizeError, user, isLoading, incrementDeepCutsOpenedCount, triggerBackgroundRevalidation]);

  const handleViewChange = useCallback((newView: View) => {
    if (newView === View.Graph && !graphData) setGraphData({ nodes: [], links: [] });
    const targetPath = {
      [View.Graph]: '/app',
      [View.Dashboard]: '/dashboard',
      [View.Help]: '/help',
      [View.StyleGuide]: isAdmin ? '/design' : '/',
      [View.Engine]: isAdmin ? '/engine' : '/',
      [View.Analytics]: user ? '/analytics' : '/',
      [View.Home]: '/'
    }[newView];
    if (window.location.pathname !== targetPath) {
      navigate(targetPath);
    }
  }, [graphData, isAdmin, user, navigate]);

  const handleLogoClick = useCallback(() => {
    const pathname = window.location.pathname;
    if (pathname === '/dashboard') {
      handleViewChange(View.Home);
    } else {
      handleViewChange(View.Dashboard);
    }
  }, [handleViewChange]);

  const handleSubpageClose = useCallback(() => {
    if (previousWorkspace) {
      if (previousWorkspace.view === View.Graph && previousWorkspace.projectId) {
        setCurrentView(View.Graph);
        navigate(`/z/${previousWorkspace.projectId}`);
      } else {
        setCurrentView(View.Dashboard);
        navigate('/dashboard');
      }
    } else {
      if (currentProjectId) {
        setCurrentView(View.Graph);
        navigate(`/z/${currentProjectId}`);
      } else {
        setCurrentView(View.Dashboard);
        navigate('/dashboard');
      }
    }
  }, [previousWorkspace, currentProjectId, navigate]);

  const handleCancel = useCallback(() => { if (abortControllerRef.current) { abortControllerRef.current.abort(); setIsLoading(false); abortControllerRef.current = null; } }, []);

  const formattedGraphData = useMemo(() => {
    if (!graphData) return null;
    const seedList = seedArtists.split('::').map(s => s.trim()).filter(Boolean);
    return {
      ...graphData,
      nodes: graphData.nodes.map(n => ({
        ...n,
        label: getNodeLabel(n, seedList, detailsCache)
      }))
    };
  }, [graphData, seedArtists, detailsCache]);

  const formattedSelectedNode = useMemo(() => {
    if (!selectedNode || !formattedGraphData) return selectedNode;
    const match = formattedGraphData.nodes.find(n => n.id === selectedNode.id);
    const isLoadingNode = loadingNodeIds.has(selectedNode.id) || 
                          loadingNodeIds.has(selectedNode.id.toLowerCase()) || 
                          loadingNodeIds.has(normalizeArtistId(selectedNode.id));
    return match 
      ? { ...selectedNode, label: match.label, isLoading: isLoadingNode } 
      : { ...selectedNode, isLoading: isLoadingNode };
  }, [selectedNode, formattedGraphData, loadingNodeIds]);

  const formattedActiveNodes = useMemo(() => {
    if (!activeNodes || !formattedGraphData) return activeNodes;
    return activeNodes.map(node => {
      const match = formattedGraphData.nodes.find(n => n.id === node.id);
      return match ? { ...node, label: match.label } : node;
    });
  }, [activeNodes, formattedGraphData]);

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
            onSelectProject={(id) => navigate(`/z/${id}`)}
            onCreateProject={handleCreateProject}
            isCreatingProject={isCreatingProject}
            onDeleteProject={handleDeleteProject}
            onRenameProject={handleRenameProject}
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
            onRestartWalkthrough={handleDashboardRestartWalkthrough}
          />
        </div>
        <div className={`absolute inset-0 transition-opacity duration-300 ${currentView === View.Graph ? 'z-10' : 'z-0 opacity-0 pointer-events-none'}`}>
          {graphData && (
            <GraphPage
              data={formattedGraphData || { nodes: [], links: [] }} baseGraph={baseGraph} libraryArtists={libraryArtists} seedArtists={seedArtists}
              onRegenerate={(n) => handleGenerateGraph(n, true, graphData)} isLoading={isLoading}
              onCancelGeneration={handleCancel} onFileUpload={(f) => {
                const r = new FileReader(); r.onload = (e) => {
                  const t = e.target?.result as string;
                  try {
                    let res: ParsedResult;
                    if (f.name.endsWith('.xml')) res = parseAppleMusicXml(t);
                    else if (f.name.endsWith('.csv')) res = parseCsvData(t);
                    else res = { artists: Array.from(new Set(t.split(/[\n,]+/))).map(n => ({ name: n.trim(), dateAdded: null })).filter(a => a.name), baseGraph: { nodes: [], links: [] } };
                    setLibraryArtists(res.artists); setBaseGraph(normalizeGraphData(res.baseGraph));
                    if (res.artists.length && user) {
                      setDoc(doc(db, 'users', user.uid), {
                        libraryArtists: JSON.stringify(res.artists)
                      }, { merge: true }).catch(console.error);
                    }
                  } catch (err: any) { setError(err.message); }
                }; r.readAsText(f);
              }}
              onNodeClick={handleNodeClick} selectedNode={formattedSelectedNode} activeNodes={formattedActiveNodes}
              detailsCache={detailsCache} loadingNodeIds={loadingNodeIds} onCloseNode={handleCloseNode}
              onRefreshNode={handleRefreshNode} detailsError={detailsError} systemError={error}
              onLogoClick={() => {
                if (isGuest) {
                  setIsExitBlockerModalOpen(true);
                } else {
                  navigate('/dashboard');
                }
              }}
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
            onNavigateMenu={handleMenuNavigate}
            isActive={currentView === View.Help}
            isAdmin={isAdmin}
            onClose={handleSubpageClose}
            user={user}
            onLogoClick={handleLogoClick}
            isSmallScreen={isSmallScreen}
            stackCount={stack.length}
            isStackNew={stack.length > lastViewedStackCount}
            onOpenStack={() => setIsStackDialogOpen(true)}
            onLogout={handleLogout}
            onDeleteAccount={handleDeleteAccount}
            isProfileOpen={isProfileOpen}
            setIsProfileOpen={setIsProfileOpen}
            isDeleteAccountModalOpen={isDeleteAccountModalOpen}
            setIsDeleteAccountModalOpen={setIsDeleteAccountModalOpen}
            isMenuOpen={isMenuOpen}
            setIsMenuOpen={setIsMenuOpen}
            onRestartWalkthrough={handleDashboardRestartWalkthrough}
          />
        </div>
        <div className={`absolute inset-0 transition-opacity duration-300 ${currentView === View.Engine ? 'z-10' : 'z-0 opacity-0 pointer-events-none'}`}>
          <EnginePage
            onNavigate={handleViewChange}
            onNavigateMenu={handleMenuNavigate}
            isActive={currentView === View.Engine}
            profile={profile}
            onUpdateProfile={handleUpdateProfile}
            user={user}
            onLogoClick={handleLogoClick}
            isSmallScreen={isSmallScreen}
            stackCount={stack.length}
            isStackNew={stack.length > lastViewedStackCount}
            onOpenStack={() => setIsStackDialogOpen(true)}
            onLogout={handleLogout}
            onDeleteAccount={handleDeleteAccount}
            isAdmin={isAdmin}
            isProfileOpen={isProfileOpen}
            setIsProfileOpen={setIsProfileOpen}
            isDeleteAccountModalOpen={isDeleteAccountModalOpen}
            setIsDeleteAccountModalOpen={setIsDeleteAccountModalOpen}
            isMenuOpen={isMenuOpen}
            setIsMenuOpen={setIsMenuOpen}
            onRestartWalkthrough={handleDashboardRestartWalkthrough}
            onClose={handleSubpageClose}
          />
        </div>
        <div className={`absolute inset-0 transition-opacity duration-300 ${currentView === View.StyleGuide ? 'z-10' : 'z-0 opacity-0 pointer-events-none'}`}>
          <StyleGuidePage
            onNavigate={handleViewChange}
            onNavigateMenu={handleMenuNavigate}
            isActive={currentView === View.StyleGuide}
            onShowToast={showToast}
            profile={profile}
            onUpdateProfile={handleUpdateProfile}
            user={user}
            onLogoClick={handleLogoClick}
            isSmallScreen={isSmallScreen}
            stackCount={stack.length}
            isStackNew={stack.length > lastViewedStackCount}
            onOpenStack={() => setIsStackDialogOpen(true)}
            onLogout={handleLogout}
            onDeleteAccount={handleDeleteAccount}
            isAdmin={isAdmin}
            isProfileOpen={isProfileOpen}
            setIsProfileOpen={setIsProfileOpen}
            isDeleteAccountModalOpen={isDeleteAccountModalOpen}
            setIsDeleteAccountModalOpen={setIsDeleteAccountModalOpen}
            isMenuOpen={isMenuOpen}
            setIsMenuOpen={setIsMenuOpen}
            onRestartWalkthrough={handleDashboardRestartWalkthrough}
            onClose={handleSubpageClose}
          />
        </div>
        <div className={`absolute inset-0 transition-opacity duration-300 ${currentView === View.Analytics ? 'z-10' : 'z-0 opacity-0 pointer-events-none'}`}>
          <UsageAnalyticsPage
            onNavigate={handleViewChange}
            onNavigateMenu={handleMenuNavigate}
            isActive={currentView === View.Analytics}
            user={user}
            onLogoClick={handleLogoClick}
            isSmallScreen={isSmallScreen}
            stackCount={stack.length}
            isStackNew={stack.length > lastViewedStackCount}
            onOpenStack={() => setIsStackDialogOpen(true)}
            onLogout={handleLogout}
            onDeleteAccount={handleDeleteAccount}
            isAdmin={isAdmin}
            isProfileOpen={isProfileOpen}
            setIsProfileOpen={setIsProfileOpen}
            isDeleteAccountModalOpen={isDeleteAccountModalOpen}
            setIsDeleteAccountModalOpen={setIsDeleteAccountModalOpen}
            isMenuOpen={isMenuOpen}
            setIsMenuOpen={setIsMenuOpen}
            onRestartWalkthrough={handleDashboardRestartWalkthrough}
            onClose={handleSubpageClose}
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
              className="w-full max-w-sm rounded-none bg-zinc-900 border border-zinc-800 p-8 shadow-2xl relative overflow-hidden"
            >
              {isDeletingAccount && (
                <div className="absolute top-0 left-0 w-full h-1 bg-zinc-800 overflow-hidden">
                  <div className="h-full bg-primary animate-[loading-sliver_1.5s_infinite_linear] w-[40%]" />
                </div>
              )}

              <div className="w-16 h-16 rounded-none bg-red-500/10 flex items-center justify-center text-red-500 mb-6">
                <span className="material-symbols-outlined !text-[32px]">warning</span>
              </div>

              <h3 className="text-xl font-bold text-white mb-3">Delete Account?</h3>
              <p className="text-zinc-400 text-sm mb-3 leading-relaxed">
                This will permanently delete your profile, projects, saved stack, and all active sessions. This action is irreversible.
              </p>

              {error && (
                <div className="mb-6 p-4 rounded-none bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-medium leading-relaxed">
                  {error}
                </div>
              )}

              <div className="flex flex-col gap-3">
                <button
                  disabled={isDeletingAccount}
                  onClick={handleDeleteAccount}
                  className="w-full py-4 rounded-none bg-[#ef4444] hover:bg-[#ef4444]/90 text-white font-bold transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 flex items-center justify-center gap-2 shadow-lg shadow-red-900/20"
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
                  className="w-full py-4 rounded-none border border-zinc-800 text-zinc-400 font-bold hover:bg-zinc-800 hover:text-white transition-all disabled:opacity-50"
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
                if (currentProjectId) navigate(`/z/${currentProjectId}`);
              }
            }
          }
        }}
        onAddArtist={(name) => {
          const normalize = (s: string) => s.toLowerCase().replace(/[-_]/g, ' ').trim();
          const normalizedName = normalize(name);
          const existingSeeds = (seedArtists || '').split('::').filter(Boolean);
          const alreadyExists = existingSeeds.some(s => normalize(s) === normalizedName);
          if (alreadyExists) return;
          const newSeeds = existingSeeds.length > 0 ? `${seedArtists}::${name}` : name;
          handleGenerateGraph(newSeeds, true, graphData);
        }}
        seedArtists={(seedArtists || "").split('::').filter(Boolean)}
      />

       <ShareModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        shareUrl={activeShareUrl || ''}
      />

      <TokenConfirmationDialog
        isOpen={!!tokenConfirmation}
        onClose={() => tokenConfirmation?.onCancel()}
        onConfirm={() => tokenConfirmation?.onConfirm()}
        type={tokenConfirmation?.type || 'generation'}
        cost={tokenConfirmation?.cost || 0}
        cachedArtists={tokenConfirmation?.cachedArtists || []}
        missingArtists={tokenConfirmation?.missingArtists || []}
        enrichmentArtists={tokenConfirmation?.enrichmentArtists || []}
      />

      <CacheChoiceDialog
        isOpen={!!cacheChoiceDialog}
        onClose={() => cacheChoiceDialog?.onSelect('cancel')}
        onSelect={(choice) => cacheChoiceDialog?.onSelect(choice)}
        artists={cacheChoiceDialog?.artists || []}
        cost={cacheChoiceDialog?.cost || 0}
      />

      <AnimatePresence>
        {isExitBlockerModalOpen && (
          <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/60">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="w-full max-w-sm rounded-none bg-zinc-900 border border-zinc-800 p-8 shadow-2xl relative overflow-hidden"
            >
              <div className="w-16 h-16 rounded-none bg-red-500/10 flex items-center justify-center text-red-500 mb-6">
                <span className="material-symbols-outlined !text-[32px]">warning</span>
              </div>

              <h3 className="text-xl font-bold text-white mb-3">Exit Preview?</h3>
              <p className="text-zinc-400 text-sm mb-6 leading-relaxed">
                Your preview session will be lost unless saved. Sign in or save this Zcene to your account to preserve your changes.
              </p>

              <div className="flex flex-col gap-3">
                <button
                  onClick={() => {
                    setIsExitBlockerModalOpen(false);
                    navigate('/');
                  }}
                  className="w-full py-4 rounded-none bg-[#ef4444] hover:bg-[#ef4444]/90 text-white font-bold transition-all active:scale-[0.98]"
                >
                  Exit without Saving
                </button>
                <button
                  onClick={() => setIsExitBlockerModalOpen(false)}
                  className="w-full py-4 rounded-none border border-zinc-800 text-zinc-400 font-bold hover:bg-zinc-800 hover:text-white transition-all"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <CookieConsent />
    </div>
  );
};

export default App;
