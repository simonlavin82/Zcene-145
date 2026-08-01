
import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { flushSync } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { AlertCircle, AlertTriangle, X, CheckCircle2, Key } from 'lucide-react';
import { GraphData, Node, ParsedArtist, Link, View, NodeDetails, ChatMessage, StackItem, DiscoveryFilters, Project, ArtistCacheEntry, COST_PER_AI_CALL } from './types';
import { generateGraphData, fetchNodeDetails, extendGraphFromNode, resolveArtistCandidatesViaAI } from './services/geminiService';
import { normalizeArtistId, readArtistCacheMany, writeArtistCacheMany, assembleGraphFromCache, incrementCacheHit, readLegacyArtistCache, normalizeGraphData, extractArtistSubGraph, isCacheExpired, getArtistDocWithRedirect, getEntityDocWithRedirect, getLabelDocWithRedirect, getAnyEntityDocWithRedirect, titleCaseArtistId, cleanArtistDisplayName, findCanonicalNodeForArtist, buildCompositeCacheKey, enforceArtistCacheSchema, stripUndefinedProperties } from './services/artistCacheService';
import { normalizeCountry } from './utils/normalization';
import { auth, signInWithGoogle, logout, onAuthStateChanged, User, db, handleFirestoreError, OperationType } from './services/firebase';
import { translateError, translateToast } from './services/errorTranslationLayer';
import { collection, doc, setDoc, deleteDoc, onSnapshot, query, getDocFromServer, serverTimestamp, addDoc, getDoc, getDocs, orderBy, where, writeBatch, getDocFromCache, updateDoc, increment, limit } from 'firebase/firestore';
const StyleGuidePage = React.lazy(() => import('./components/DesignSystem').then(m => ({ default: m.StyleGuidePage })));
const EnginePage = React.lazy(() => import('./components/EnginePage').then(m => ({ default: m.EnginePage })));
const UsageAnalyticsPage = React.lazy(() => import('./components/UsageAnalyticsPage').then(m => ({ default: m.UsageAnalyticsPage })));
import HelpPage from './components/HelpPage';
import GraphPage from './components/GraphPage';
import HomePage from './components/HomePage';
import Dashboard from './components/Dashboard';
import { MyStackDialog, TokenConfirmationDialog, CacheChoiceDialog, DisambiguationCandidate, ExploreActionDialog } from './components/SharedModals';

import { ShareModal } from './components/ShareModal';
import { analyticsService } from './services/analyticsService';
import { ZceneLogo, Spinner } from './components/Icons';
import CookieConsent from './components/CookieConsent';

const checkVideoPlayabilityOnServer = async (videoId: string): Promise<boolean> => {
  if (!videoId || videoId.length !== 11) return false;
  try {
    const response = await fetch(`/api/artist/validate-video/${videoId}`);
    if (response.ok) {
      const data = await response.json();
      return !!data.playable;
    }
  } catch (e) {
    console.warn(`[Playability] Client fetch check failed for ${videoId}:`, e);
  }
  return false;
};

const checkIsProfileStaleOrCorrupt = (details: any): boolean => {
  if (!details) return false;
  if (details._isSentinel) return true;

  // Refined Priority-Based Self-Healing:
  // ONLY biography/summary gaps (empty, placeholders, corrupted formatting, or < 100 chars) trigger auto-healing.
  const summary = details.summary || details.bio || "";
  if (!summary || summary.trim() === "") return true;
  if (summary.length < 100) return true;
  if (summary.toLowerCase().includes('sandbox mock') || summary.toLowerCase().includes('test scenarios')) return true;
  if (summary.toLowerCase().includes('failed to curate')) return true;
  if (summary.includes('{{') || summary.includes('}}')) return true;

  // Images and metadata (genre/origin) missing/unknown are best-effort only — they do NOT trigger autonomous re-synthesis.
  return false;
};

const isArtistIdMatch = (nodeId: string, activeId: string): boolean => {
  if (!nodeId || !activeId) return false;
  const nNorm = normalizeArtistId(nodeId);
  const aNorm = normalizeArtistId(activeId);
  if (nNorm === aNorm) return true;
  if (aNorm.startsWith(nNorm + '-')) return true;
  if (nNorm.startsWith(aNorm + '-')) return true;
  return false;
};

const generateGraphDataViaCloudJob = async (
  artists: string,
  filters: DiscoveryFilters,
  userId: string,
  signal?: AbortSignal,
  onDetailsCacheReceived?: (detailsCacheJson: string) => void,
  projectId?: string,
  jobId?: string,
  disambiguationHints?: Record<string, string>
): Promise<GraphData> => {
  const finalJobId = jobId || `job-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  const jobRef = doc(db, 'curationJobs', finalJobId);

  await setDoc(jobRef, {
    jobId: finalJobId,
    userId,
    status: 'pending',
    jobType: 'graph_generation',
    inputPayload: {
      artists,
      filters,
      projectId,
      disambiguationHints
    },
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    expireAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
  });

  return new Promise((resolve, reject) => {
    let hasAborted = false;
    let unsubscribe: () => void = () => {};

    if (signal) {
      if (signal.aborted) {
        reject(new DOMException("Aborted", "AbortError"));
        return;
      }
      signal.addEventListener('abort', () => {
        hasAborted = true;
        unsubscribe();
        updateDoc(jobRef, { status: 'cancelled' }).catch(err => {
          console.warn("[Cloud Job] Failed to mark job as cancelled:", err);
        });
        reject(new DOMException("Aborted", "AbortError"));
      });
    }

    unsubscribe = onSnapshot(jobRef, (snapshot) => {
      if (hasAborted) {
        unsubscribe();
        return;
      }
      
      const job = snapshot.data();
      if (!job) {
        unsubscribe();
        reject(new Error("Curation job was deleted or not found."));
        return;
      }

      console.log(`[Cloud Curation Listener] Job ${finalJobId} status: ${job.status}`);

      if (job.status === 'completed') {
        unsubscribe();
        if (job.result && job.result.graphData) {
          if (job.result.detailsCache && onDetailsCacheReceived) {
            onDetailsCacheReceived(job.result.detailsCache);
          }
          resolve(job.result.graphData);
        } else {
          reject(new Error("Job completed but did not return graphData."));
        }
      } else if (job.status === 'failed') {
        unsubscribe();
        const serverError = new Error(job.errorMessage || "Backend curation failed.");
        (serverError as any).errorDetails = job.errorDetails;
        if (job.errorDetails && job.errorDetails.stack) {
          (serverError as any).stackSnippet = job.errorDetails.stack.substring(0, 300);
          console.error("[Cloud Job Listener] Backend Stack Trace:", job.errorDetails.stack);
        }
        reject(serverError);
      }
    }, (error) => {
      unsubscribe();
      reject(error);
    });
  });
};



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

  const isWarning = message.startsWith('⚠️');
  // Strip leading status emoji so it isn't rendered twice alongside the icon
  const cleanMessage = message.replace(/^[⚠️⚡✅]\s?/, '').trim();

  return (
    <div className="fixed bottom-24 sm:bottom-12 left-1/2 -translate-x-1/2 z-[1000] pointer-events-none px-4 w-full max-w-sm">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        className={`px-6 py-3 rounded-none shadow-2xl flex items-center justify-center gap-3 pointer-events-auto backdrop-blur-md border ${
          isWarning
            ? 'bg-yellow-950/90 border-yellow-500/50 text-yellow-400'
            : 'bg-brand-black border-primary/50 text-primary'
        }`}
      >
        {isWarning
          ? <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          : <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
        }
        <span className="text-sm font-medium">{cleanMessage}</span>
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

  return { nodes: deduplicatedNodes, links: filteredLinks, synthesisRationale: data.synthesisRationale };
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

  return { 
    nodes: combinedNodes, 
    links: combinedLinks, 
    synthesisRationale: enhancement.synthesisRationale || base.synthesisRationale 
  };
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

  return { nodes: prunedNodes, links: prunedLinks, synthesisRationale: graph.synthesisRationale };
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
const mutateGraphArtistId = (graph: GraphData, oldId: string, newId: string, newLabel: string): GraphData => {
  if (!graph || !graph.nodes) return graph;
  const normOld = normalizeArtistId(oldId);
  
  const updatedNodes = graph.nodes.map(n => {
    if (normalizeArtistId(n.id) === normOld) {
      return { ...n, id: newId, label: newLabel };
    }
    return n;
  });

  const updatedLinks = (graph.links || []).map(l => {
    const sourceId = typeof l.source === 'object' ? (l.source as any).id : l.source;
    const targetId = typeof l.target === 'object' ? (l.target as any).id : l.target;
    
    let nextSource = l.source;
    let nextTarget = l.target;
    
    if (normalizeArtistId(sourceId) === normOld) {
      nextSource = typeof l.source === 'object' ? { ...l.source, id: newId } : newId;
    }
    if (normalizeArtistId(targetId) === normOld) {
      nextTarget = typeof l.target === 'object' ? { ...l.target, id: newId } : newId;
    }
    
    return { ...l, source: nextSource, target: nextTarget };
  });

  return { nodes: updatedNodes, links: updatedLinks, synthesisRationale: graph.synthesisRationale };
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

  // A sentinel entry (written by §3.7 after total queue failure) is always incomplete.
  if ((details as any)._isSentinel) {
    return true;
  }

  // Only treat a profile as corrupt if the bio itself is absent or empty.
  // Genre/origin being "Unknown" or empty is a display-level gap — it surfaces the
  // Cache Incomplete UI warning box in DetailsPanel for manual self-healing, but it
  // must NOT trigger automatic re-synthesis. Doing so caused an infinite eviction loop
  // for artists (like "End It") where the model legitimately returns "Unknown" for
  // those fields: the profile was evicted, re-synthesised to the same state, then
  // immediately evicted again on the next click — silently bypassing the Token Warning
  // because approvedSeedsRef auto-confirms the re-synthesis for seed artists.
  if (!details.summary || details.summary.trim() === "") {
    return true;
  }

  return false;
};

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

interface CacheValidationResult {
  isFullyQualified: boolean;
  needsPeerBands: boolean;
  needsFutureFields: boolean;
}

/**
 * Safely parses the detailsCache field from Firestore which might be stored as
 * a native Map/Object, a stringified JSON object, or a double-stringified JSON array of string.
 */
export const parseDetailsCacheSafely = (field: any): any => {
  if (!field) return null;
  try {
    let parsed = typeof field === 'string' ? JSON.parse(field) : field;
    // Unwrap array wrapper layer [{ ... }] or [ [ "name", { ... } ] ]
    if (Array.isArray(parsed) && parsed.length > 0) {
      parsed = Array.isArray(parsed[0]) ? parsed[0][1] : parsed[0];
    }
    // If still string (double-stringified case)
    if (typeof parsed === 'string') {
      parsed = JSON.parse(parsed);
    }
    return parsed;
  } catch (e) {
    console.warn("Failed to parse detailsCache safely:", e);
    return null;
  }
};

export const validateNodeDetailsContent = (detailsCacheField: any): boolean => {
  if (!detailsCacheField) return false;
  try {
    const parsed = parseDetailsCacheSafely(detailsCacheField);
    if (!parsed || typeof parsed !== 'object') return false;
    if (checkIsProfileStaleOrCorrupt(parsed)) return false;
    return true;
  } catch (e) {
    return false;
  }
};

export const expandDetailsCacheMap = (entries: any): Map<string, NodeDetails> => {
  const map = new Map<string, NodeDetails>();
  if (!entries) return map;
  try {
    const rawMap = new Map<string, any>(typeof entries === 'string' ? JSON.parse(entries) : entries);
    rawMap.forEach((v, k) => {
      map.set(k, v);
      if (typeof k === 'string') {
        map.set(k.toLowerCase(), v);
        map.set(normalizeArtistId(k), v);
      }
      if (v?.details?.artist && typeof v.details.artist === 'string') {
        const name = v.details.artist;
        map.set(name, v);
        map.set(name.toLowerCase(), v);
        map.set(normalizeArtistId(name), v);
      }
    });
  } catch (e) {
    console.warn("Failed to expand details cache map:", e);
  }
  return map;
};

const validateRootsBreakdown = (rationale?: string, isSingleArtist: boolean = false): boolean => {
  if (!rationale) return false;
  const lower = rationale.toLowerCase();
  if (isSingleArtist) {
    return lower.includes('acoustic') && lower.includes('scene');
  }
  return lower.includes('acoustic') && lower.includes('scene') && lower.includes('overlap');
};


const validateCacheEntry = (data: any, isSingleArtist: boolean = false): CacheValidationResult => {
  if (!data) {
    return { isFullyQualified: false, needsPeerBands: false, needsFutureFields: false };
  }

  // 1. graphData exists, parses cleanly, and contains nodes
  if (!data.graphData || data.isPrimarySeed === false || data.hasUniqueSpiderweb === false) {
    return { isFullyQualified: false, needsPeerBands: false, needsFutureFields: false };
  }

  try {
    const graph = typeof data.graphData === 'string' ? JSON.parse(data.graphData) : data.graphData;
    if (!graph || !graph.nodes || !Array.isArray(graph.nodes) || graph.nodes.length === 0) {
      return { isFullyQualified: false, needsPeerBands: false, needsFutureFields: false };
    }

    // Topology sanity check against legacy polluted records (e.g., Buggin loaded with Spaced's graph)
    if (data.isPrimarySeed === undefined && graph.links && Array.isArray(graph.links)) {
      const targetId = normalizeArtistId(data.artistId || data.seedArtists || "");
      const myLinks = graph.links.filter((l: any) => {
        const sId = typeof l.source === 'string' ? l.source : (l.source as any)?.id || "";
        const tId = typeof l.target === 'string' ? l.target : (l.target as any)?.id || "";
        return normalizeArtistId(sId) === targetId || normalizeArtistId(tId) === targetId;
      });
      if (myLinks.length < 3 && graph.nodes.length > 5) {
        return { isFullyQualified: false, needsPeerBands: false, needsFutureFields: false };
      }
    }

    // Check for peer bands
    const artistNodes = graph.nodes.filter((n: any) => n.type === 'artist' || !n.type);
    const needsPeerBands = artistNodes.length < 2;

    // 2. Graph edge context strings are meaningful (not generic fallbacks)
    let hasGenericContext = false;
    if (graph.links && Array.isArray(graph.links)) {
      const genericStrings = ["is connected to", "is musically related to"];
      hasGenericContext = graph.links.some((l: any) => 
        l.context && genericStrings.includes(l.context.toLowerCase().trim())
      );
    }
    if (hasGenericContext) {
      return { isFullyQualified: false, needsPeerBands, needsFutureFields: true };
    }

    // 5. If synthesisRationale exists, validate it
    const rationale = data.synthesisRationale || graph.synthesisRationale;
    if (rationale && !validateRootsBreakdown(rationale, isSingleArtist)) {
      return { isFullyQualified: false, needsPeerBands, needsFutureFields: true };
    }

    // 3. detailsCache exists, parses cleanly, and contains a non-trivial biography (>5 chars, no mock)
    if (!data.detailsCache) {
      return { isFullyQualified: false, needsPeerBands, needsFutureFields: true };
    }
    const details = parseDetailsCacheSafely(data.detailsCache);
    if (!details) {
      return { isFullyQualified: false, needsPeerBands, needsFutureFields: true };
    }
    const bio = details.summary || details.bio || details.description || details.text || "";
    if (typeof bio !== 'string' || bio.trim().length <= 5 || bio.toLowerCase().includes("sandbox mock")) {
      return { isFullyQualified: false, needsPeerBands, needsFutureFields: true };
    }

    // 4. genre and origin fields are non-empty and not "unknown"
    const genre = details.details?.genre || details.genre;
    const origin = details.details?.origin || details.origin;
    if (!genre || typeof genre !== 'string' || genre.trim().length === 0 || genre.toLowerCase().trim() === "unknown") {
      return { isFullyQualified: false, needsPeerBands, needsFutureFields: true };
    }
    if (!origin || typeof origin !== 'string' || origin.trim().length === 0 || origin.toLowerCase().trim() === "unknown") {
      return { isFullyQualified: false, needsPeerBands, needsFutureFields: true };
    }

    return {
      isFullyQualified: !needsPeerBands,
      needsPeerBands,
      needsFutureFields: false
    };
  } catch (e) {
    return { isFullyQualified: false, needsPeerBands: false, needsFutureFields: false };
  }
};

const isCacheEntryFullyQualified = (data: any, isSingleArtist: boolean = false): boolean => {
  return validateCacheEntry(data, isSingleArtist).isFullyQualified;
};

/**
 * Lightweight check used exclusively in handleExtendNode.
 * A single-node sub-graph written by writeArtistCacheMany is structurally
 * correct for canvas merging even though it contains only 1 artist node.
 * isCacheEntryFullyQualified would reject it (peer-band check) — this
 * function only asks: "is there usable graphData?"
 */
const isGraphDataPresent = (data: any): boolean => {
  // Gold Standard: any document with non-empty graphData nodes is considered cache-present.
  // Link context quality is a secondary enrichment concern, NOT a cache validity gate.
  if (!data?.graphData) return false;
  try {
    const g = typeof data.graphData === 'string' ? JSON.parse(data.graphData) : data.graphData;
    return Array.isArray(g?.nodes) && g.nodes.length > 0;
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
  const [projectStatus, setProjectStatus] = useState<string | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [previousWorkspace, setPreviousWorkspace] = useState<{ view: View; projectId: string | null } | null>(null);
  useEffect(() => { currentViewRef.current = currentView; }, [currentView]);
  useEffect(() => { currentProjectIdRef.current = currentProjectId; }, [currentProjectId]);

  // One-time startup database migration for 'needtobreathe' collision resolution
  useEffect(() => {
    const performNeedtobreatheMigration = async () => {
      try {
        const simpleRef = doc(db, 'artists', 'needtobreathe');
        const suffixedRef = doc(db, 'artists', 'needtobreathe-united-states');
        
        const [simpleSnap, suffixedSnap] = await Promise.all([
          getDoc(simpleRef),
          getDoc(suffixedRef)
        ]);
        
        if (simpleSnap.exists() && suffixedSnap.exists()) {
          const simpleData = simpleSnap.data();
          const suffixedData = suffixedSnap.data();
          
          if (simpleData && simpleData.detailsCache && suffixedData && !suffixedData.detailsCache) {
            console.log("[Migration] needtobreathe data mismatch detected. Merging simple record into suffixed record...");
            const batch = writeBatch(db);
            batch.update(suffixedRef, {
              detailsCache: simpleData.detailsCache,
              cachedAt: serverTimestamp()
            });
            batch.set(simpleRef, {
              artistId: "needtobreathe",
              cacheKey: "needtobreathe",
              redirectTo: "needtobreathe-united-states",
              cacheVersion: 4,
              cachedAt: serverTimestamp()
            });
            await batch.commit();
            console.log("[Migration] needtobreathe merge and redirect successfully completed.");
          }
        }
      } catch (err) {
        console.warn("[Migration] failed to execute needtobreathe cleanup:", err);
      }
    };
    performNeedtobreatheMigration();
  }, []);

  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; id: number } | null>(null);
  const [libraryArtists, setLibraryArtists] = useState<ParsedArtist[]>([]);
  const [seedArtists, setSeedArtists] = useState<string>('');
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [peekedNode, setPeekedNode] = useState<Node | null>(null);
  const [activeNodeIds, setActiveNodeIds] = useState<string[]>([]);
  const [stack, setStack] = useState<StackItem[]>([]);
  const [lastViewedStackCount, setLastViewedStackCount] = useState<number>(0);
  const [baseGraph, setBaseGraph] = useState<GraphData | null>(null);
  const hasAutoSelectedRef = useRef<string | null>(null);
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
  const [lastAppliedFilters, setLastAppliedFilters] = useState<DiscoveryFilters>({});
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
  const [supportsLabelDeepCuts, setSupportsLabelDeepCuts] = useState<boolean>(true);
  const healedNodeIdsRef = useRef<Set<string>>(new Set());

  const activeNodes = useMemo(() => {
    if (!graphData || !graphData.nodes) return [];
    return activeNodeIds
      .map(id => graphData.nodes.find(n => n.id.toLowerCase() === id.toLowerCase() || normalizeArtistId(n.id) === normalizeArtistId(id) || isArtistIdMatch(n.id, id)))
      .filter((n): n is Node => !!n && (n.type === 'artist' || n.type === 'label'));
  }, [activeNodeIds, graphData]);
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
    type: 'generation' | 'extension' | 'deep_cut_creation' | 'partial_synthesis' | 'cache_upgrade' | 'data_quality_optimization' | 'live_tour_search' | 'live_synthesis';
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
  const [disambiguationDialog, setDisambiguationDialog] = useState<{
    isOpen: boolean;
    query: string;
    candidates: DisambiguationCandidate[];
    onSelect: (choice: string | 'synthesis' | 'cancel') => void;
    isLiveAISuggestions?: boolean;
  } | null>(null);
  const [exploreConfirmation, setExploreConfirmation] = useState<{
    isOpen: boolean;
    artistName: string;
    onConfirm: () => void;
    onCancel: () => void;
  } | null>(null);

  const confirmExploreAction = useCallback((artistName: string) => {
    return new Promise<boolean>((resolve) => {
      setExploreConfirmation({
        isOpen: true,
        artistName,
        onConfirm: () => {
          setExploreConfirmation(null);
          resolve(true);
        },
        onCancel: () => {
          setExploreConfirmation(null);
          resolve(false);
        }
      });
    });
  }, []);

  const confirmTokenUsage = useCallback((
    type: 'generation' | 'extension' | 'deep_cut_creation' | 'partial_synthesis' | 'cache_upgrade' | 'data_quality_optimization' | 'live_tour_search' | 'live_synthesis',
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
  const resolveContextualEntityIds = useCallback(async (
    artistsStr: string,
    filters: DiscoveryFilters
  ): Promise<string> => {
    const list = artistsStr.split('::').map(s => s.trim()).filter(Boolean);
    const resolvedList = await Promise.all(
      list.map(async (name) => {
        const normName = normalizeArtistId(name);
        try {
          const q = query(
            collection(db, 'artists'),
            where('cacheKey', '>=', normName),
            where('cacheKey', '<=', normName + '\uf8ff'),
            limit(10)
          );
          const snapshot = await getDocs(q);
          
          let matchedDocId: string | null = null;
          
          for (const docSnap of snapshot.docs) {
            const data = docSnap.data();
            let originVal = "";
            let genreVal = "";
            if (data.graphData) {
              try {
                const parsed = JSON.parse(data.graphData);
                const nodes = parsed.nodes || [];
                const countries = nodes.filter((n: any) => n.type === 'country').map((n: any) => n.label || n.id);
                originVal = countries.join(', ');
                const genres = nodes.filter((n: any) => n.type === 'genre').map((n: any) => n.label || n.id);
                genreVal = genres.join(', ');
              } catch (e) {}
            }
            
            const normOrigin = originVal.toLowerCase().trim();
            const normGenre = genreVal.toLowerCase().trim();
            let satisfiesFilters = true;

            if (filters.includeOrigins && filters.includeOrigins.length > 0) {
              const allowed = filters.includeOrigins.map(o => o.toLowerCase().trim());
              const matchesOrigin = allowed.some(o => normOrigin.includes(o) || o.includes(normOrigin));
              if (!matchesOrigin) satisfiesFilters = false;
            }
            if (filters.excludeOrigins && filters.excludeOrigins.length > 0) {
              const forbidden = filters.excludeOrigins.map(o => o.toLowerCase().trim());
              const matchesOrigin = forbidden.some(o => normOrigin.includes(o) || o.includes(normOrigin));
              if (matchesOrigin) satisfiesFilters = false;
            }
            if (filters.includeGenres && filters.includeGenres.length > 0) {
              const allowed = filters.includeGenres.map(g => g.toLowerCase().trim());
              const matchesGenre = allowed.some(g => normGenre.includes(g) || g.includes(normGenre));
              if (!matchesGenre) satisfiesFilters = false;
            }

            if (satisfiesFilters) {
              matchedDocId = docSnap.id;
              break;
            }
          }

          if (matchedDocId) {
            console.log(`[Contextual Resolve] Mapped "${name}" to entity ID "${matchedDocId}" matching filters`);
            return cleanArtistDisplayName(matchedDocId);
          }
        } catch (err) {
          console.warn(`[Contextual Resolve] Failed for "${name}":`, err);
        }
        return name;
      })
    );
    return resolvedList.join('::');
  }, []);

  const searchMatchingArtistsInCache = useCallback(async (queryStr: string): Promise<string[]> => {
    const normQuery = normalizeArtistId(queryStr);
    if (normQuery.length < 2) return [];

    try {
      const q = query(
        collection(db, 'artists'),
        where('cacheKey', '>=', normQuery),
        where('cacheKey', '<=', normQuery + '\uf8ff')
      );

      const snapshot = await getDocs(q);
      const matches = new Set<string>();

      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        if (data.redirectTo) {
          matches.add(data.redirectTo);
        } else {
          matches.add(docSnap.id);
        }
      });

      return Array.from(matches).map(id => cleanArtistDisplayName(id));
    } catch (err) {
      console.warn("[Disambiguation] Prefix match lookup failed:", err);
      return [];
    }
  }, []);

  const searchDisambiguationCandidates = useCallback(async (queryStr: string): Promise<DisambiguationCandidate[]> => {
    const normQuery = normalizeArtistId(queryStr);
    if (normQuery.length < 2) return [];

    try {
      const q = query(
        collection(db, 'artists'),
        where('cacheKey', '>=', normQuery),
        where('cacheKey', '<=', normQuery + '\uf8ff')
      );

      const snapshot = await getDocs(q);
      const candidatesMap = new Map<string, DisambiguationCandidate>();

      for (const docSnap of snapshot.docs) {
        const data = docSnap.data();
        const docId = docSnap.id;
        
        if (data.redirectTo) {
          continue; // Skip redirect pointer documents
        }
        
        let originVal = "";
        let genreVal = "";
        let labelVal = docId;
        
        if (data.detailsCache) {
          const parsed = parseDetailsCacheSafely(data.detailsCache);
          labelVal = parsed?.details?.artist || parsed?.name || docId;
          originVal = parsed?.details?.origin || parsed?.origin || "";
          genreVal = parsed?.details?.genre || parsed?.genre || "";
        } else if (data.graphData) {
          try {
            const parsed = JSON.parse(data.graphData);
            const nodes = parsed.nodes || [];
            const primaryNode = nodes.find((n: any) => n.type === 'artist' && n.id.toLowerCase() === docId.toLowerCase()) || nodes[0];
            if (primaryNode) {
              labelVal = primaryNode.label || primaryNode.id;
            }
            const countries = nodes.filter((n: any) => n.type === 'country').map((n: any) => n.label || n.id);
            originVal = countries.join(', ');
            const genres = nodes.filter((n: any) => n.type === 'genre').map((n: any) => n.label || n.id);
            genreVal = genres.join(', ');
          } catch (e) {}
        }
        
        const candidateKey = normalizeArtistId(docId);
        if (!candidatesMap.has(candidateKey)) {
          candidatesMap.set(candidateKey, {
            id: docId,
            label: cleanArtistDisplayName(labelVal),
            origin: originVal,
            genre: genreVal
          });
        }
      }
      return Array.from(candidatesMap.values());
    } catch (err) {
      console.warn('[Disambiguation Candidates Search] Failed:', err);
      return [];
    }
  }, []);

  const mergeAndCleanupArtists = useCallback(async (selectedId: string, nonSelectedId: string) => {
    try {
      const selectedRef = doc(db, 'artists', selectedId);
      const nonSelectedRef = doc(db, 'artists', nonSelectedId);
      
      const [selectedSnap, nonSelectedSnap] = await Promise.all([
        getDoc(selectedRef),
        getDoc(nonSelectedRef)
      ]);
      
      if (selectedSnap.exists() && nonSelectedSnap.exists()) {
        const selectedData = selectedSnap.data();
        const nonSelectedData = nonSelectedSnap.data();
        
        const mergedData: any = { ...selectedData };
        let hasMerged = false;
        
        if (nonSelectedData.detailsCache && !selectedData.detailsCache) {
          mergedData.detailsCache = nonSelectedData.detailsCache;
          hasMerged = true;
        }
        if (nonSelectedData.graphData && !selectedData.graphData) {
          mergedData.graphData = nonSelectedData.graphData;
          mergedData.filters = nonSelectedData.filters || {};
          hasMerged = true;
        }
        
        const batch = writeBatch(db);
        if (hasMerged) {
          batch.set(selectedRef, mergedData, { merge: true });
        }
        batch.set(nonSelectedRef, {
          artistId: nonSelectedData.artistId || normalizeArtistId(nonSelectedId),
          cacheKey: nonSelectedId,
          redirectTo: selectedId,
          cacheVersion: 4,
          cachedAt: serverTimestamp()
        });
        
        await batch.commit();
        console.log(`[Auto-Merge] Successfully merged duplicate artist "${nonSelectedId}" into canonical "${selectedId}" and redirected.`);
      }
    } catch (err) {
      console.error("[Auto-Merge] Failed to merge duplicate artists:", err);
    }
  }, []);

  const authRedirectPathRef = useRef<string | null>(null);
  const isHydratingSessionRef = useRef(false);
  const isProjectLoadingRef = useRef(false);

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
  const lastSyncedDocRef = useRef<string>('');
  const evictedNodeIdsRef = useRef<Set<string>>(new Set());
  const approvedSeedsRef = useRef<Set<string>>(new Set());
  const handleGenerateDeepCutRef = useRef<((node: Node) => Promise<void>) | null>(null);

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

  const showToast = useCallback((message: string) => setToast({ message: translateToast(message), id: Date.now() }), []);
  const hasShownCacheToastRef = useRef(false);
  const showCacheToast = useCallback(() => {
    if (!hasShownCacheToastRef.current) {
      showToast('⚡ Loaded from cache');
      hasShownCacheToastRef.current = true;
    }
  }, [showToast]);

  const humanizeError = useCallback((error: any): string => {
    return translateError(error).userFriendlyMessage;
  }, []);

  const handleLogin = useCallback(async (onSuccess?: () => void) => {
    try {
      await signInWithGoogle();
      showToast('Logged in successfully');
      if (onSuccess) {
        onSuccess();
      }
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
    setActiveNodeIds([]);
    setDetailsCache(new Map());
    setChatHistories(new Map());
    setCurrentCacheKey(null);
    setSupportsLabelDeepCuts(true);

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
        supportsLabelDeepCuts: true,
        schemaVersion: 2,
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
      // Build lightweight canvas layout — artist and label positions
      const canvasLayout = graphData!.nodes
        .filter(n => n.type === 'artist' || n.type === 'label')
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

  const handleDashboardShareProject = useCallback(async (project: Project) => {
    if (!user) return;
    try {
      const sharePayload: Record<string, any> = {
        ...project,
        authorId: user.uid,
        createdAt: serverTimestamp(),
      };
      delete sharePayload.id; // Exclude the local ID
      
      const sharedRef = await addDoc(collection(db, 'sharedZcenes'), sharePayload);
      const shareUrl = `${window.location.origin}/app?shareId=${sharedRef.id}`;
      
      await navigator.clipboard.writeText(shareUrl);
      showToast('Link copied to clipboard!');
    } catch (err) {
      console.error("Failed to share project from dashboard:", err);
      showToast("Failed to create share link");
    }
  }, [user, showToast]);

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
    let name = projectName;
    if (!name && seedArtists) {
      name = seedArtists.split('::')[0]?.trim();
    }
    if (!name) return 'Untitled Zcene';
    
    return cleanArtistDisplayName(name, graphData?.nodes);
  }, [projectName, seedArtists, graphData]);

  useEffect(() => {
    if (displayProjectName && displayProjectName !== 'Untitled Zcene') {
      document.title = `${displayProjectName} - Zcene`;
    } else {
      document.title = 'Zcene - Own Music Discovery';
    }
  }, [displayProjectName]);

  useEffect(() => {
    if (seedArtists && (!projectName || projectName === 'Untitled Zcene')) {
      const first = seedArtists.split('::')[0]?.trim();
      if (first) {
        const formatted = cleanArtistDisplayName(first, graphData?.nodes);
        handleUpdateProjectName(formatted);
      }
    }
  }, [seedArtists, projectName, handleUpdateProjectName, graphData]);

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
    setActiveNodeIds([]);
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
      } else {
        // FALLBACK: Preserve the node details from the incoming list to prevent deletion during hydration
        const rawNode = typeof item === 'string' 
          ? { id: item, type: 'artist' as const, group: 0 } 
          : { id: item.id, type: item.type || 'artist', group: item.group || 0, label: item.label };
        activeNodesToRestore.push(rawNode);
      }
    });
    return activeNodesToRestore;
  }, []);


  const handleNodeClick = useCallback(async (node: Node | null, forceActionState = false) => {
    if (!node) {
       setSelectedNode(null);
       setPeekedNode(null);
       return;
    }

    const isTouchInteraction = isSmallScreen || (typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches);
    const isAlreadySelected = selectedNode && (
      selectedNode.id.toLowerCase() === node.id.toLowerCase() ||
      normalizeArtistId(selectedNode.id) === normalizeArtistId(node.id) ||
      (selectedNode.type === 'artist' && node.type === 'artist' && isArtistIdMatch(selectedNode.id, node.id))
    );

    const isAlreadyPeeked = peekedNode && (
      peekedNode.id.toLowerCase() === node.id.toLowerCase() ||
      normalizeArtistId(peekedNode.id) === normalizeArtistId(node.id) ||
      (peekedNode.type === 'artist' && node.type === 'artist' && isArtistIdMatch(peekedNode.id, node.id))
    );

    const isBlockedType = node.type === 'founded' || node.type === 'country' || node.type === 'genre';

    if (isAlreadySelected) {
      return;
    }

    // The 'Sticky Peek' state requirement was removed to allow direct navigation.
    // Desktop will now navigate on the first click, and mobile will navigate on the second tap
    // (since MusicGraph.tsx swallows the first mobile tap to show the connection snippet).

    const isTransitioning = loadingNodeIds.has(node.id) || 
                            fetchingNodeIdsRef.current.has(node.id) || 
                            loadingNodeIds.has(node.id.toLowerCase()) || 
                            fetchingNodeIdsRef.current.has(node.id.toLowerCase()) ||
                            loadingNodeIds.has(normalizeArtistId(node.id)) || 
                            fetchingNodeIdsRef.current.has(normalizeArtistId(node.id));
    if (isTransitioning) {
       setPeekedNode(null);
       setSelectedNode(node);
       if (node.type !== 'founded') {
         setActiveNodeIds(prev => prev.some(id => id.toLowerCase() === node.id.toLowerCase()) ? prev : [...prev, node.id]);
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
    const simpleId = normalizeArtistId(node.id);
    let disambiguatedCacheId = simpleId;
    let connectedCountries: string[] = [];
    if (graphData) {
      connectedCountries = graphData.links
        .filter((l: any) => {
          const sId = typeof l.source === 'string' ? l.source : l.source.id;
          const tId = typeof l.target === 'string' ? l.target : l.target.id;
          return sId.toLowerCase() === node.id.toLowerCase() || tId.toLowerCase() === node.id.toLowerCase();
        })
        .map((l: any) => {
          const sId = typeof l.source === 'string' ? l.source : l.source.id;
          const tId = typeof l.target === 'string' ? l.target : l.target.id;
          const otherId = sId.toLowerCase() === node.id.toLowerCase() ? tId : sId;
          return graphData.nodes.find((no: any) => no.id.toLowerCase() === otherId.toLowerCase());
        })
        .filter((no: any) => no && no.type === 'country')
        .map((no: any) => no.label || no.id);
        
      if (connectedCountries.length > 0) {
        const countryNorm = normalizeArtistId(connectedCountries[0]);
        if (countryNorm) disambiguatedCacheId = simpleId.endsWith(`-${countryNorm}`) ? simpleId : `${simpleId}-${countryNorm}`;
      }
    }

    let cachedDetails = detailsCacheRef.current.get(disambiguatedCacheId) || 
                        healedDetailsCacheRef.current.get(disambiguatedCacheId);

    if (!cachedDetails && disambiguatedCacheId !== simpleId) {
      // If we didn't find the disambiguated key, check the simple key, but run context verification
      const fallbackDetails = detailsCacheRef.current.get(simpleId) || 
                              detailsCacheRef.current.get(node.id.toLowerCase()) ||
                              detailsCacheRef.current.get(node.id) ||
                              healedDetailsCacheRef.current.get(simpleId) ||
                              healedDetailsCacheRef.current.get(node.id.toLowerCase()) ||
                              healedDetailsCacheRef.current.get(node.id);
      if (fallbackDetails) {
        const cachedOrigin = fallbackDetails?.details?.origin || (fallbackDetails as any)?.origin || '';
        const hasMismatch = connectedCountries.length > 0 && 
          !connectedCountries.some((c: string) => {
            const normC = c.toLowerCase().trim();
            const normO = cachedOrigin.toLowerCase().trim();
            return normO.includes(normC) || normC.includes(normO);
          });
        if (!hasMismatch) {
          cachedDetails = fallbackDetails;
        }
      }
    } else if (!cachedDetails) {
      // If there is no country link/context, just check the simple key
      cachedDetails = detailsCacheRef.current.get(simpleId) || 
                      detailsCacheRef.current.get(node.id.toLowerCase()) ||
                      detailsCacheRef.current.get(node.id) ||
                      healedDetailsCacheRef.current.get(simpleId) ||
                      healedDetailsCacheRef.current.get(node.id.toLowerCase()) ||
                      healedDetailsCacheRef.current.get(node.id);
    }
    
    // 2. Load Locally and Block the Network
    // Treat existing cache entries (even if incomplete or containing placeholders) as authoritative on normal click.
    // We only trigger re-synthesis when the user explicitly clicks "Heal Cache" (which runs handleRefreshNode).
    const isStaleDetails = cachedDetails?.synthesisRationale ? !validateRootsBreakdown(cachedDetails.synthesisRationale, true) : false;
    if (cachedDetails && cachedDetails.summary && cachedDetails.summary.length >= 5 && !isStaleDetails && !cachedDetails._isSentinel) {
       const hydratedNode = {
          ...node,
          bio: cachedDetails.summary,
          summary: cachedDetails.summary,
          genre: cachedDetails.details?.genre || "",
          origin: cachedDetails.details?.origin || "",
          founded: cachedDetails.details?.founded || "",
          name: cachedDetails.details?.artist || node.id,
          imageUrl: cachedDetails.imageUrl || cachedDetails.image || node.imageUrl || "",
          isLibrary: true
       };
       
       setPeekedNode(null);
       setSelectedNode(hydratedNode);
       if (node.type !== 'founded') {
         setActiveNodeIds(prev => prev.some(id => id.toLowerCase() === node.id.toLowerCase()) ? prev : [...prev, node.id]);
       }
       incrementDeepCutsOpenedCount();
       
       // Force stop all loading indicators for this node
       fetchingNodeIdsRef.current.delete(node.id);
       setLoadingNodeIds(prev => { const next = new Set(prev); next.delete(node.id); return next; });
       return; // BLOCK network queue entirely
    }
    
    // 2.5 GLOBAL ARTISTS FALLBACK
    // If the local detailsCache is empty (e.g. freshly loaded project), query the root artists collection directly.
    // Firestore stores detailsCache as a JSON string — parse it and unwrap any array wrapper layers.
    let globalDoc: any | null = null;
    const isEvicted = evictedNodeIdsRef.current.has(node.id) || 
                      evictedNodeIdsRef.current.has(node.id.toLowerCase()) || 
                      evictedNodeIdsRef.current.has(normalizeArtistId(node.id));
    if (!isEvicted) {
        try {
            const standardizedId = normalizeArtistId(node.id);
            globalDoc = await getEntityDocWithRedirect(standardizedId, node.type === 'label' ? 'label' : 'artist');
        
        if (globalDoc.exists()) {
            const data = globalDoc.data();
            console.log("[Node Click Telemetry] globalDoc data:", {
              exists: true,
              cacheKey: data?.cacheKey,
              artistId: data?.artistId,
              hasDetailsCache: !!data?.detailsCache,
              detailsCacheType: typeof data?.detailsCache,
              detailsCacheKeys: data?.detailsCache ? Object.keys(data.detailsCache) : [],
              detailsCache: data?.detailsCache
            });
            if (data && data.detailsCache) {
                let parsed: any = parseDetailsCacheSafely(data.detailsCache);
                
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
                const tourDates = parsed?.tourDates || [];
                const tourCachedAt = parsed?.tourCachedAt || "";
                
                const isPlaceholderBio = bio.includes('sandbox mock') || bio.includes('test scenarios');
                const isBioTooShort = !bio || bio.trim().length < 5;
                const detailsPayload: NodeDetails = {
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
                    groundingLinks,
                    youtubeVideoId,
                    youtubeSearchQuery,
                    tourDates,
                    tourCachedAt,
                    synthesisRationale: data.synthesisRationale || parsed?.synthesisRationale || ""
                };

                const isDisplayable = bio && bio.trim().length > 5 && !isPlaceholderBio;
                const isIncomplete = checkIsProfileIncomplete(node, detailsPayload) || 
                                     isBioTooShort || 
                                     isPlaceholderBio || 
                                     !validateNodeDetailsContent(data.detailsCache);

                if (isDisplayable) {
                    const hydratedNode = {
                        ...node,
                        bio,
                        summary: bio,
                        genre,
                        origin,
                        founded,
                        name: artistName,
                        imageUrl: imageUrl || node.imageUrl || "",
                        isLibrary: true
                    };
                    
                    setPeekedNode(null);
                    setSelectedNode(hydratedNode);
                    if (node.type !== 'founded') {
                        setActiveNodeIds(prev => prev.some(id => id.toLowerCase() === node.id.toLowerCase()) ? prev : [...prev, node.id]);
                    }
                    incrementDeepCutsOpenedCount();
                    
                    // Push to detailsCache so the background queue skips this node entirely
                    console.log("[Phase 3 Cache Payload]", node.id, JSON.stringify({ youtubeVideoId: detailsPayload.youtubeVideoId, summary: detailsPayload.summary?.substring(0, 40) }));
                    setDetailsCache(prev => new Map(prev).set(node.id.toLowerCase(), detailsPayload).set(standardizedId, detailsPayload).set(node.id, detailsPayload));

                    if (isIncomplete || isCacheExpired(data.cachedAt)) {
                        console.log("[Node Click] Cache is incomplete or expired; triggering background revalidation:", node.id);
                        triggerBackgroundRevalidation(node, standardizedId);
                    }

                    // Air-gap: clear all loading flags and hard-stop before any network call
                    fetchingNodeIdsRef.current.delete(node.id);
                    setLoadingNodeIds(prev => { const next = new Set(prev); next.delete(node.id); return next; });
                    setIsLoading(false);
                    console.log("[Node Click] Hydrated displayable cache from global collection:", node.id, "→", standardizedId);
                    return;
                }
            }
        }
        } catch(err) {
            console.warn("[Node Click] Global fallback read failed:", err);
        }
    }

    const isNodeInGraph = graphData && graphData.nodes.some((n: any) => 
      n.id.toLowerCase() === node.id.toLowerCase() || 
      normalizeArtistId(n.id) === normalizeArtistId(node.id) || 
      isArtistIdMatch(n.id, node.id)
    );

    console.log("[DEEP CUT Cache Validity Check]", {
      nodeId: node.id,
      hasLocalCachedDetails: !!cachedDetails,
      localCachedSummaryLen: cachedDetails?.summary?.length ?? 0,
      globalDocExists: !!(globalDoc && globalDoc.exists()),
      globalDocHasDetailsCache: !!(globalDoc && globalDoc.exists() && globalDoc.data()?.detailsCache),
      graphDataLoaded: !!graphData,
      nodeInGraph: !!isNodeInGraph
    });

    // Blocked types must never trigger an API call.
    if (isBlockedType) {
      setPeekedNode(null);
      setSelectedNode(node);
      if (node.type !== 'founded') {
        setActiveNodeIds(prev => prev.some(id => id.toLowerCase() === node.id.toLowerCase()) ? prev : [...prev, node.id]);
      }
      return;
    }

    // Sticky Peek logic: first tap/click on a non-cached, allowed node type enters Peek state
    if (!isAlreadyPeeked) {
      setSelectedNode(null);
      setPeekedNode(node);
      return;
    }

    // Second tap/click: transition to selectedNode (Action State) immediately so cancellation preserves it there
    setPeekedNode(null);
    setSelectedNode(node);
    if (node.type !== 'founded') {
      setActiveNodeIds(prev => prev.some(id => id.toLowerCase() === node.id.toLowerCase()) ? prev : [...prev, node.id]);
    }

    if (node.type === 'label' && !supportsLabelDeepCuts) {
      showToast("⚠️ Legacy project structure detected: Label deep cuts require a newly created Zcene project.");
      return;
    }

    const isApprovedSeed = approvedSeedsRef.current.has(normalizeArtistId(node.id)) || 
                           approvedSeedsRef.current.has(node.id.toLowerCase());

    // Reserve the loading slot BEFORE the modal so the spinner is ready to show
    setLoadingNodeIds(prev => new Set(prev).add(node.id));

    const confirmed = isApprovedSeed ? true : await confirmTokenUsage('deep_cut_creation', [], [node.label || titleCaseArtistId(node.id)]);
    if (!confirmed) {
      // User cancelled — release the loading slot but KEEP it selected (in Action state)
      setLoadingNodeIds(prev => { const next = new Set(prev); next.delete(node.id); return next; });
      return;
    }

    if (handleGenerateDeepCutRef.current) {
      approvedSeedsRef.current.add(normalizeArtistId(node.id));
      approvedSeedsRef.current.add(node.id.toLowerCase());
      await handleGenerateDeepCutRef.current(node);
    }
  }, [confirmTokenUsage, selectedNode, peekedNode, loadingNodeIds, isSmallScreen, supportsLabelDeepCuts, showToast]);

  const handleGenerateDeepCut = useCallback(async (node: Node) => {
    if (node.type === 'label' && !supportsLabelDeepCuts) {
      showToast("⚠️ Legacy project structure detected: Label deep cuts require a newly created Zcene project.");
      return;
    }

    const isApprovedSeed = approvedSeedsRef.current.has(normalizeArtistId(node.id)) || 
                           approvedSeedsRef.current.has(node.id.toLowerCase());

    const confirmed = isApprovedSeed ? true : await confirmTokenUsage('deep_cut_creation', [], [node.label || titleCaseArtistId(node.id)]);
    if (!confirmed) {
      return;
    }

    // 1. Show Loading UI immediately
    setLoadingNodeIds(prev => new Set(prev).add(node.id));

    try {
      const simpleArtistId = normalizeArtistId(node.id);
      let disambiguatedCacheId = simpleArtistId;

      // 2. Perform Multi-Origin Slug Suffix Calculation
      if (graphData && node.type !== 'label') {
        const connectedCountries = graphData.links
          .filter((l: any) => (typeof l.source === 'object' ? l.source.id : l.source) === node.id || 
                       (typeof l.target === 'object' ? l.target.id : l.target) === node.id)
          .map((l: any) => {
            const connectedId = (typeof l.source === 'object' ? l.source.id : l.source) === node.id 
              ? (typeof l.target === 'object' ? l.target : null) 
              : (typeof l.source === 'object' ? l.source : null);
            return graphData.nodes.find((n: any) => n.id === (connectedId?.id || connectedId));
          })
          .filter((no: any) => no && no.type === 'country')
          .map((no: any) => no.label || no.id);
          
        if (connectedCountries.length > 0) {
          const countryNorm = normalizeArtistId(connectedCountries[0]);
          if (countryNorm) disambiguatedCacheId = simpleArtistId.endsWith(`-${countryNorm}`) ? simpleArtistId : `${simpleArtistId}-${countryNorm}`;
        }
      }

      // 3. Direct API Dispatch
      const params = new URLSearchParams(window.location.search);
      const urlOriginHint = params.get('origin');
      
      const details = await fetchNodeDetails(node, graphData, seedArtists, urlOriginHint);
      
      // 4. Update UI Cache
      healedDetailsCacheRef.current.set(node.id, details);
      healedDetailsCacheRef.current.set(simpleArtistId, details);
      healedDetailsCacheRef.current.set(disambiguatedCacheId, details);
      
      setDetailsCache(prev => {
        const next = new Map(prev);
        next.set(node.id, details);
        next.set(node.id.toLowerCase(), details);
        next.set(simpleArtistId, details);
        if (disambiguatedCacheId !== simpleArtistId) {
          next.set(disambiguatedCacheId, details);
        }
        return next;
      });

      setSelectedNode(prev => {
        if (prev && (normalizeArtistId(prev.id) === simpleArtistId || prev.id.toLowerCase() === node.id.toLowerCase())) {
          return {
            ...prev,
            bio: details.summary,
            summary: details.summary,
            genre: details.details?.genre || "",
            origin: details.details?.origin || "",
            founded: details.details?.founded || "",
          };
        }
        return prev;
      });

      // 5. Safe Split-Document Write-Back
      const collName = node.type === 'label' ? 'labels' : 'artists';
      if (disambiguatedCacheId !== simpleArtistId) {
        const simpleDocRef = doc(db, collName, simpleArtistId);
        const simpleSnap = await getDoc(simpleDocRef);
        
        if (simpleSnap.exists()) {
          const simpleData = simpleSnap.data();
          if (simpleData && !simpleData.redirectTo) {
            // Use updateDoc (or setDoc with merge) to preserve existing graphData/filters on the stub
            await setDoc(simpleDocRef, stripUndefinedProperties({
              artistId: simpleArtistId,
              cacheKey: simpleArtistId,
              redirectTo: disambiguatedCacheId,
              cacheVersion: 4,
              cachedAt: serverTimestamp()
            }), { merge: true });
          }
        }
      }

      // 6. Write the canonical Deep Cache payload
      const normalizedGraph = normalizeGraphData(graphData);
      const canonicalNode = normalizedGraph.nodes.find(
        (n: any) => (n.type === 'artist' || n.type === 'label') && (n.id.trim().toLowerCase() === node.id.trim().toLowerCase() || normalizeArtistId(n.id) === disambiguatedCacheId)
      );
      
      const isLabel = node.type === 'label' || canonicalNode?.type === 'label';
      const setPayload = isLabel ? {
        cacheKey: disambiguatedCacheId,
        labelId: simpleArtistId,
        cacheVersion: 4,
        cachedAt: serverTimestamp(),
        hitCount: 0,
        isDeep: true,
        detailsCache: details,
      } : {
        cacheKey: disambiguatedCacheId,
        artistId: simpleArtistId,
        cacheVersion: 4,
        cachedAt: serverTimestamp(),
        hitCount: 0,
        isDeep: true,
        detailsCache: details
      };
      
      if (!isLabel) enforceArtistCacheSchema(setPayload);
      const targetDocRef = doc(db, collName, disambiguatedCacheId);
      const targetSnap = await getDoc(targetDocRef);
      if (!targetSnap.exists()) {
        if (!isLabel) {
          (setPayload as any).graphData = null;
          (setPayload as any).isPrimarySeed = false;
          (setPayload as any).hasUniqueSpiderweb = false;
        }
        await setDoc(targetDocRef, stripUndefinedProperties(setPayload));
      } else {
        await updateDoc(targetDocRef, stripUndefinedProperties(setPayload));
      }

    } catch (err) {
      console.error("[Manual Generation] Failed to fetch and write split document:", err);
      showToast("Generation failed. Please try again.");
    } finally {
      setLoadingNodeIds(prev => { const next = new Set(prev); next.delete(node.id); return next; });
    }
  }, [confirmTokenUsage, graphData, seedArtists, showToast]);

  useEffect(() => { handleGenerateDeepCutRef.current = handleGenerateDeepCut; }, [handleGenerateDeepCut]);

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

    // Phase 05: Build lightweight canvas layout — artist and label nodes (x/y/fx/fy).
    // Heavy graphData and detailsCache live in the global cache, referenced by cacheKey.
    const canvasLayout = graphData.nodes
      .filter(n => n.type === 'artist' || n.type === 'label')
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
        // Phase 1+: write individual entity ID references + canvas layout.
        // Each ID points to its own isolated /artists/{id} or /labels/{id} Firestore document.
        const artistEntityIds = graphData.nodes
          .filter((n: any) => n.type === 'artist')
          .map((n: any) => normalizeArtistId(n.id));
        const labelEntityIds = graphData.nodes
          .filter((n: any) => n.type === 'label')
          .map((n: any) => normalizeArtistId(n.id));
        const seedList = seedArtists.split('::').map((a: string) => a.trim()).filter(Boolean);
        const normalizedIds = seedList.map((name: string) => normalizeArtistId(name));
        docPayload.artistIds = artistEntityIds.length > 0 ? artistEntityIds : normalizedIds;
        docPayload.labelIds = labelEntityIds;
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
    rawArtists: string,
    isRegeneration: boolean = false,
    graphToEnhance?: GraphData | null,
    skipCacheLookup: boolean = false,
    bypassTokenConfirmation: boolean = false,
    overrideFilters?: DiscoveryFilters,
    disambiguationHints?: Record<string, string>,
    bypassDisambiguation: boolean = false
  ) => {
    // Normalize empty graph to null to eliminate ghost-enhancement API path
    if (graphToEnhance && (!graphToEnhance.nodes || graphToEnhance.nodes.length === 0)) {
      graphToEnhance = null;
    }

    const activeDiscoveryFilters = overrideFilters || discoveryFilters;
    const hasActiveFilters = !!(
      activeDiscoveryFilters.foundedAfter ||
      activeDiscoveryFilters.foundedBefore ||
      (activeDiscoveryFilters.includeOrigins && activeDiscoveryFilters.includeOrigins.length > 0) ||
      (activeDiscoveryFilters.excludeOrigins && activeDiscoveryFilters.excludeOrigins.length > 0) ||
      (activeDiscoveryFilters.includeGenres && activeDiscoveryFilters.includeGenres.length > 0) ||
      (activeDiscoveryFilters.additionalInstructions && activeDiscoveryFilters.additionalInstructions.trim().length > 0)
    );
    const isLiveSynthesisTemp = hasActiveFilters || (rawArtists.split('::').map(s => s.trim()).filter(Boolean).length > 1);

    let artists = rawArtists;
    if (isLiveSynthesisTemp) {
      artists = await resolveContextualEntityIds(rawArtists, activeDiscoveryFilters);
    }

    isHydratingSessionRef.current = true;
    isProjectLoadingRef.current = true;
    setIsLoading(true);
    if (abortControllerRef.current) abortControllerRef.current.abort();
    let controller = new AbortController();
    abortControllerRef.current = controller;
    let isLockReleasedByAutosave = false;
    let bypassToken = bypassTokenConfirmation;
    const prevActiveNodeIds = activeNodeIds;
    const prevSeedArtists = seedArtists;

    // Clear previously approved seeds on fresh project generation
    if (!isRegeneration && !graphToEnhance) {
      approvedSeedsRef.current.clear();
    }

    if (!user && (isRegeneration || !window.location.search)) {
      isHydratingSessionRef.current = false;
      isProjectLoadingRef.current = false;
      setIsLoading(false);
      // Only gate if it's a manual action (regeneration or fresh start)
      // Imports (via deep links) are allowed for guests
      console.log(`[Lazy Registration] Queueing generateGraph for guest. User: ${!!user}`);
      setPendingAuthAction({ type: 'generateGraph', payload: { artists, isRegeneration, graphToEnhance, skipCacheLookup, bypassDisambiguation } });
      handleLogin();
      return;
    }

    const artistList = artists.split('::').map(a => normalizeArtistId(a)).filter(Boolean);
    if (artistList.length > 25) {
      isHydratingSessionRef.current = false;
      isProjectLoadingRef.current = false;
      setIsLoading(false);
      setError(`Limit: 25 artists.`);
      return;
    }

    // ─── STAGE 0: UNIFIED DISAMBIGUATION GATE ─────────────────────────────────
    // Constitutional rule: Cache is always interrogated first.
    // The live AI probe fires ONLY on explicit "Search Live AI" click — never automatically.
    //
    // Every artist search ALWAYS passes through this checkpoint.
    // The modal is shown regardless of how many cache records are found:
    //   0 candidates → "No records found" + Search Live AI + Continue
    //   1 candidate  → "Look what I found — is this correct?" + None of these + Continue
    //   >1 candidates → "Multiple found — which did you mean?" + None of these + Continue
    // ─────────────────────────────────────────────────────────────────────────────
    let resolvedArtistSeeds = [...artistList];
    let activeDisambiguationHints: Record<string, string> = disambiguationHints || {};
    let hasDisambiguated = false;

    if (!bypassToken && !bypassDisambiguation) {
      for (let i = 0; i < artistList.length; i++) {
        const rawInput = artists.split('::').map(s => s.trim()).filter(Boolean)[i] || artistList[i];
        const searchId = artistList[i];

        // Step 1: Interrogate the Firestore cache first (always).
        const cacheCandidates = await searchDisambiguationCandidates(searchId);

        setIsLoading(false);
        isHydratingSessionRef.current = false;
        isProjectLoadingRef.current = false;

        let choice: string | 'synthesis' | 'cancel' = 'synthesis';

        // Step 2: Show the verification modal if we have cached candidates.
        if (cacheCandidates.length > 0) {
          choice = await new Promise<string | 'synthesis' | 'cancel'>((resolve) => {
            setDisambiguationDialog({
              isOpen: true,
              query: rawInput,
              candidates: cacheCandidates, 
              onSelect: (c) => { setDisambiguationDialog(null); resolve(c); }
            });
          });
        }

        if (choice === 'cancel') {
          setIsLoading(false);
          isHydratingSessionRef.current = false;
          isProjectLoadingRef.current = false;
          setActiveNodeIds(prevActiveNodeIds);
          setSeedArtists(prevSeedArtists);
          return;
        }

        if (choice === 'synthesis') {
          // --- FRONT-LOADED TOKEN QUOTA GATE ---
          // Ensure absolutely zero API tokens or network dispatches occur before user accepts cost.
          if (!bypassToken) {
            const confirmed = await confirmTokenUsage(isLiveSynthesisTemp ? 'live_synthesis' : 'generation', [], artistList);
            if (!confirmed) {
              setIsLoading(false);
              isHydratingSessionRef.current = false;
              isProjectLoadingRef.current = false;
              return;
            }
          }

          // --- FLASH MODEL VALIDATION GATE ---
          setIsLoading(true);
          const flashCandidates = await resolveArtistCandidatesViaAI(rawInput, controller?.signal);
          setIsLoading(false);

          // Always mount the modal to act as a mandatory verification gate
          const flashChoice = await new Promise<string | 'synthesis' | 'cancel'>((resolve) => {
            setDisambiguationDialog({
              isOpen: true,
              query: rawInput,
              candidates: flashCandidates || [],
              onSelect: (c) => { setDisambiguationDialog(null); resolve(c); },
              isLiveAISuggestions: true
            });
          });

          if (flashChoice === 'cancel') {
            setIsLoading(false);
            isHydratingSessionRef.current = false;
            isProjectLoadingRef.current = false;
            setActiveNodeIds(prevActiveNodeIds);
            setSeedArtists(prevSeedArtists);
            return;
          }

          if (flashChoice.startsWith('override::')) {
            const userInputCountry = flashChoice.split('::')[1];
            const normalizedCountry = normalizeCountry(userInputCountry);
            
            // Check for collision against cache
            const cacheHit = cacheCandidates.find(c => 
              c.origin && c.origin.toLowerCase().includes(normalizedCountry.toLowerCase())
            );

            if (cacheHit) {
              console.log(`[Disambiguation Override] Cache collision detected for ${normalizedCountry}. Routing to ${cacheHit.id}`);
              resolvedArtistSeeds[i] = normalizeArtistId(cacheHit.id);
              hasDisambiguated = true;
              const nonSelected = cacheCandidates.filter(c => c.id !== cacheHit.id);
              nonSelected.forEach(ns => mergeAndCleanupArtists(cacheHit.id, ns.id));
              continue; // proceed to next artist in loop
            } else {
              const probeKey = normalizeArtistId(rawInput);
              activeDisambiguationHints[probeKey] = 
                `[MANDATORY DISAMBIGUATION CONSTRAINT: The user explicitly requested the regional variant of "${rawInput}" originating from or associated with "${userInputCountry}". You MUST synthesize this specific regional act and NO OTHER.]`;
              console.log(`[Disambiguation Override Hint Injected for ${probeKey}]:`, activeDisambiguationHints[probeKey]);
            }
          } else if (flashChoice !== 'synthesis') {
            const selectedCand = (flashCandidates || []).find(c => c.id === flashChoice);
            if (selectedCand) {
              const probeKey = normalizeArtistId(rawInput);
              activeDisambiguationHints[probeKey] = 
                `[MANDATORY DISAMBIGUATION CONSTRAINT: The user explicitly selected the following regional entity: "${selectedCand.label}" from ${selectedCand.origin} (${selectedCand.genre}). You MUST synthesize this specific act and NO OTHER.]`;
              console.log(`[Flash Validation Hint Injected for ${probeKey}]:`, activeDisambiguationHints[probeKey]);
            }
          }

          // Direct Wire to Live Generative Synthesis & Rejection Constraint Injection:
          // Extract rejected metadata from cacheCandidates and inject negative constraint hint for Gemini 3.1 Pro:
          if (cacheCandidates && cacheCandidates.length > 0) {
            const rejectedDescriptions = cacheCandidates.map(c => 
              `"${c.label}"${c.origin ? ` from ${c.origin}` : ''}${c.genre ? ` (${c.genre})` : ''}`
            ).join(', ');

            const probeKey = normalizeArtistId(rawInput);
            // Append or create rejection hint
            const rejectionHint = 
              `[DISAMBIGUATION REJECTION CONSTRAINTS: The user explicitly rejected the cached artist ` +
              `candidate(s): ${rejectedDescriptions}. Synthesize a DIFFERENT regional or genre act ` +
              `sharing the name "${rawInput}". Do NOT synthesize any of the rejected candidates.]`;
            
            activeDisambiguationHints[probeKey] = activeDisambiguationHints[probeKey] 
              ? activeDisambiguationHints[probeKey] + '\n' + rejectionHint 
              : rejectionHint;
            
            console.log(`[Disambiguation Rejection Hint Injected for ${probeKey}]:`, activeDisambiguationHints[probeKey]);
          }

          // We immediately re-invoke handleGenerateGraph with:
          //   - skipCacheLookup = true (bypass local Firestore cache)
          //   - bypassTokenConfirmation = true (we already confirmed it above!)
          //   - bypassDisambiguation = true (break STAGE 0 re-entry loop)
          handleGenerateGraph(artists, isRegeneration, graphToEnhance, true, true, overrideFilters, activeDisambiguationHints, true);
          return;
        } else {
          // User accepted a specific candidate card from the cache.
          resolvedArtistSeeds[i] = normalizeArtistId(choice);
          hasDisambiguated = true;
          const nonSelected = cacheCandidates.filter(c => c.id !== choice);
          nonSelected.forEach(ns => mergeAndCleanupArtists(choice, ns.id));
        }
      }
    }

    if (hasDisambiguated) {
      const newArtistsStr = resolvedArtistSeeds.join('::');
      handleGenerateGraph(newArtistsStr, isRegeneration, graphToEnhance, false, true, overrideFilters, activeDisambiguationHints, true);
      return;
    }

    try {
      const hasActiveFilters = !!(
        activeDiscoveryFilters.foundedAfter ||
        activeDiscoveryFilters.foundedBefore ||
        (activeDiscoveryFilters.includeOrigins && activeDiscoveryFilters.includeOrigins.length > 0) ||
        (activeDiscoveryFilters.excludeOrigins && activeDiscoveryFilters.excludeOrigins.length > 0) ||
        (activeDiscoveryFilters.includeGenres && activeDiscoveryFilters.includeGenres.length > 0) ||
        (activeDiscoveryFilters.additionalInstructions && activeDiscoveryFilters.additionalInstructions.trim().length > 0)
      );

      const isLiveSynthesis = hasActiveFilters || artistList.length > 1;

      if (isLiveSynthesis) {
        // Concurrently fetch baseline cache to populate detailsCache and preserve biographies
        const normalizedArtistList = artistList.map(name => name.toLowerCase());
        readArtistCacheMany(normalizedArtistList, user?.uid).then(baseCacheResult => {
          baseCacheResult.cached.forEach((entry, key) => {
            if (entry && entry.detailsCache) {
              try {
                let parsedData = parseDetailsCacheSafely(entry.detailsCache);
                
                // Context Check: Verify if the parsed origin aligns with the active search constraints
                const originVal = parsedData?.details?.origin || parsedData?.origin || parsedData?.location || parsedData?.country || "";
                const normOrigin = originVal.toLowerCase().trim();
                
                let isOriginMismatched = false;
                if (activeDiscoveryFilters.includeOrigins && activeDiscoveryFilters.includeOrigins.length > 0) {
                  isOriginMismatched = !activeDiscoveryFilters.includeOrigins.some(c => {
                    const normC = c.toLowerCase().trim();
                    return normOrigin.includes(normC) || normC.includes(normOrigin);
                  });
                }
                if (activeDiscoveryFilters.excludeOrigins && activeDiscoveryFilters.excludeOrigins.length > 0) {
                  const isExcluded = activeDiscoveryFilters.excludeOrigins.some(c => {
                    const normC = c.toLowerCase().trim();
                    return normOrigin.includes(normC) || normC.includes(normOrigin);
                  });
                  if (isExcluded) isOriginMismatched = true;
                }

                if (isOriginMismatched) {
                  console.log(`[Baseline Prefetch Gate] Discarding baseline cache for ${key} due to origin mismatch: "${originVal}" does not match active filter.`);
                  return; // Skip setting this entry in detailsCache
                }

                const entryBio = parsedData?.summary || parsedData?.bio || parsedData?.description || parsedData?.text || "";
                if (entryBio && entryBio.length > 5) {
                  const detailsObj = {
                    summary: entryBio,
                    imageUrl: parsedData?.imageUrl || parsedData?.image || "",
                    details: {
                      genre: parsedData?.details?.genre || parsedData?.genre || "",
                      origin: parsedData?.details?.origin || parsedData?.origin || "",
                      founded: parsedData?.details?.founded || parsedData?.founded || "",
                      artist: parsedData?.details?.artist || entry.seedArtists || key,
                      notableArtists: parsedData?.details?.notableArtists || []
                    },
                    members: parsedData?.members || [],
                    links: parsedData?.links || [],
                    discography: parsedData?.discography || [],
                    tourInfo: parsedData?.tourInfo || "",
                    recommendationReason: parsedData?.recommendationReason || "",
                    groundingLinks: parsedData?.groundingLinks || [],
                    tourDates: parsedData?.tourDates || [],
                    tourCachedAt: parsedData?.tourCachedAt || ""
                  };
                  setDetailsCache(prev => {
                    const updated = new Map(prev);
                    updated.set(key.toLowerCase(), detailsObj);
                    updated.set(key, detailsObj);
                    updated.set(normalizeArtistId(key), detailsObj);
                    if (entry.artistId) {
                      updated.set(entry.artistId.toLowerCase(), detailsObj);
                      updated.set(normalizeArtistId(entry.artistId), detailsObj);
                    }
                    return updated;
                  });
                }
              } catch (e) {
                console.warn("[DetailsCache] Failed to parse baseline detailsCache:", e);
              }
            }
          });
        }).catch(e => console.warn("[DetailsCache] Failed to fetch baseline cache:", e));
      }

    // --- STRICT FRONT-GATE CACHE CHECK ---
    // If this is a fresh search for a single artist without special filters, check the cache immediately
    // Skip entirely if skipCacheLookup is true (e.g. user explicitly rejected cache hit in disambiguation gate)
    if (!skipCacheLookup && artistList.length === 1 && !hasActiveFilters) {
      const searchId = artistList[0];
      const searchIdLower = searchId.toLowerCase();
      
      try {
        let cacheDoc = await getAnyEntityDocWithRedirect(searchId);
        if (!cacheDoc.exists()) {
          cacheDoc = await getAnyEntityDocWithRedirect(searchIdLower);
        }
        
        if (!cacheDoc.exists()) {
          console.log("Decision State:", {
            searchedId: searchId,
            foundDoc: false,
            hasGraph: false,
            hasDetails: false,
            finalDecision: 'API'
          });
        } else {
          const data = cacheDoc.data();
          // getArtistDocWithRedirect already followed any redirectTo chain and returned the canonical doc's data.
          // Compute the canonical ID so we can update the seedArtists state, but do NOT re-dispatch
          // handleGenerateGraph — we already have the resolved data and can fall straight through to
          // the cache-hit path below.  Re-dispatching caused the Token Quota Warning to appear because
          // bypassTokenConfirmation was not propagated to the recursive call.
          const canonicalArtistId = data?.cacheKey || data?.artistId || cacheDoc.id;
          const resolvedSearchId = (canonicalArtistId && canonicalArtistId.toLowerCase() !== searchIdLower)
            ? canonicalArtistId
            : searchId;

          if (resolvedSearchId !== searchId) {
            console.log(`[Front Gate Cache] Redirect resolved inline: ${searchId} -> ${resolvedSearchId} (data already in hand, no re-dispatch)`);
            setSeedArtists(resolvedSearchId);
          }


          let parsedGraph = null;
          try {
            parsedGraph = typeof data.graphData === 'string' ? JSON.parse(data.graphData) : data.graphData;
          } catch (e) {
            console.warn("Failed to parse cached graphData");
          }

          const isDeep = data?.isDeep === true;
          const validation = validateCacheEntry(data, true);
          const hasGraph = parsedGraph && parsedGraph.nodes && parsedGraph.nodes.length > 0;
          const hasDetailsObj = !!data.detailsCache && (
            typeof data.detailsCache === 'string'
              ? data.detailsCache.trim().length > 0
              : Object.keys(data.detailsCache).length > 0
          );
          
          // Relaxed cache qualification check: if graphData exists, accept as cache hit!
          const isQualified = !!hasGraph && validation.isFullyQualified;
          
          console.log("Decision State:", {
            searchedId: searchId,
            resolvedId: resolvedSearchId,
            firestoreDocId: cacheDoc.id,
            foundDoc: true,
            hasGraph,
            graphNodeCount: parsedGraph?.nodes?.length ?? 0,
            hasDetails: hasDetailsObj,
            isQualifiedByCacheEntry: validation.isFullyQualified,
            finalDecision: isQualified ? 'CACHE' : 'API'
          });
          
          console.log(`[Front Gate Cache Check] searchId: ${searchId}, resolvedId: ${resolvedSearchId}, isQualified: ${isQualified}`);
          console.log(`[Front Gate Cache Details] isDeep: ${isDeep}, hasGraph: ${hasGraph}, hasDetailsObj: ${hasDetailsObj}, isFullyQualified: ${validation.isFullyQualified}`);
          if (!isQualified) {
            console.log(`[Front Gate Cache Rejected Reasons] searchId: ${searchId}:`, {
              missingGraphData: !parsedGraph,
              emptyGraphNodes: parsedGraph && (!parsedGraph.nodes || parsedGraph.nodes.length === 0),
              isDeep: isDeep,
              validationErrors: validation
            });
          }
          
          if (data && isQualified) {
            if (parsedGraph && parsedGraph.nodes && parsedGraph.nodes.length > 0) {
              const rationaleVal = data.synthesisRationale || parsedGraph.synthesisRationale;
              if (rationaleVal) {
                parsedGraph.synthesisRationale = rationaleVal;
              }
              const normalizedGraph = applyHumanCasedLabels(normalizeGraphData(parsedGraph), artists);
              console.log(`[Front Gate Cache] GOLD STANDARD HIT! Bypassing all generation logic. searchId: ${searchId} -> resolvedId: ${resolvedSearchId}, nodes: ${normalizedGraph.nodes.length}`);
              setGraphData(normalizedGraph);
              
              // 3. Extract the detailsCache string from the same document read
              let parsedDetails: any = null;
              if (data.detailsCache) {
                  try {
                      parsedDetails = parseDetailsCacheSafely(data.detailsCache);
                      
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
                                : undefined,
                            tourDates: parsedDetails?.tourDates || [],
                            tourCachedAt: parsedDetails?.tourCachedAt || ""
                         };
                          console.log("[Phase 3 Cache Payload – Front Gate]", searchId, JSON.stringify({ youtubeVideoId: detailsPayload.youtubeVideoId, youtubeSearchQuery: detailsPayload.youtubeSearchQuery }));
                          
                          const canonicalId = data?.cacheKey || searchId;
                          const canonicalIdLower = canonicalId.toLowerCase();
                          const normalizedCanonicalId = normalizeArtistId(canonicalId);
                          
                          setDetailsCache(prev => {
                            const updated = new Map(prev);
                            updated.set(searchIdLower, detailsPayload);
                            updated.set(searchId, detailsPayload);
                            updated.set(normalizeArtistId(searchId), detailsPayload);
                            updated.set(canonicalIdLower, detailsPayload);
                            updated.set(canonicalId, detailsPayload);
                            updated.set(normalizedCanonicalId, detailsPayload);
                            if (data?.artistId) {
                              updated.set(data.artistId.toLowerCase(), detailsPayload);
                              updated.set(normalizeArtistId(data.artistId), detailsPayload);
                            }
                            return updated;
                          });
                      }
                  } catch(e) { console.warn("Failed to parse detailsCache", e); }
              }
              
              // 4. Find the primary node and instantly hydrate it with the biography text
              const primaryNode = normalizedGraph.nodes.find((n: any) => 
                n.id.toLowerCase() === searchIdLower || 
                normalizeArtistId(n.id) === normalizeArtistId(searchId) || 
                isArtistIdMatch(n.id, searchId)
              ) as any;
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
                  setActiveNodeIds([hydratedNode.id]);
              }
              
              setSeedArtists(artists);
              artistList.forEach(name => {
                approvedSeedsRef.current.add(normalizeArtistId(name));
              });
              // Force all loading flags off and short-circuit the entire function
              setIsLoading(false);
              isFetchingDetailsRef.current = false;
              if (user && isFirebaseReady && isAuthInitialized && currentProjectId && !isGuest) {
                isLockReleasedByAutosave = true;
              } else {
                isHydratingSessionRef.current = false;
              }
              if (!isQualified) {
                console.log('[Front Gate Cache] Cache doc found but not fully qualified. Background revalidation queued.');
              } else {
                showCacheToast();
              }
              return;
            }
          } else {
            console.log(`[Front Gate Cache] Cache doc found for "${searchId}" but failed strict validation. Intercepting for self-healing.`);
            setIsLoading(true);
            
            let parsedGraph = null;
            try {
              parsedGraph = typeof data.graphData === 'string' ? JSON.parse(data.graphData) : data.graphData;
            } catch (e) {}
            if (parsedGraph && parsedGraph.nodes && parsedGraph.nodes.length > 0) {
              const normalizedGraph = applyHumanCasedLabels(normalizeGraphData(parsedGraph), artists);
              normalizedGraph.nodes = normalizedGraph.nodes.map((n: any) => {
                if (n.type === 'artist' && (normalizeArtistId(n.id) === normalizeArtistId(searchId) || n.id.toLowerCase() === searchIdLower || isArtistIdMatch(n.id, searchId))) {
                  return { ...n, isPending: true };
                }
                return n;
              });
              setGraphData(normalizedGraph);
              setActiveNodeIds([searchId]);
            }

            const confirmed = await confirmTokenUsage('cache_upgrade', [], [searchId], []);
            if (confirmed) {
              console.log(`[Front Gate Cache] User confirmed cache upgrade. Overwriting old entry.`);
              bypassToken = true;
              // Fall through to live generation logic (which will generate and write back)
            } else {
              console.log(`[Front Gate Cache] User cancelled cache upgrade. Falling back to legacy data.`);
              isHydratingSessionRef.current = false;
              handleGenerateGraph(artists, isRegeneration, graphToEnhance, true, true);
              return;
            }
          }
        }
      } catch (err) {
        console.warn("[Front Gate Cache] Read failed, falling through:", err);
      }
    }
    // AbortController is now initialized at the start of the function.
    setActiveNodeIds(prev => {
      const currentActiveIds = new Set(prev.map(id => id.toLowerCase()));
      const nextActive = [...prev];

      // Ensure all current seeds are in the active list
      artistList.forEach(name => {
        if (!currentActiveIds.has(name.toLowerCase())) {
          console.log(`[Graph Generation] Syncing Seed to Active:`, name);
          nextActive.push(name);
        }
      });
      return nextActive;
    });
    let pruned: GraphData | undefined = undefined;
    if (graphToEnhance && graphToEnhance.nodes && graphToEnhance.nodes.length > 0) {
      const seedsLower = new Set(artists.split('::').map(a => a.trim().toLowerCase()));
      if (isLiveSynthesis) {
        // Enforce a Clean Slate hand-off: keep ONLY the seed nodes, discard all recommended nodes/links
        const seedNodes = graphToEnhance.nodes.filter(node => 
          node.type === 'artist' && seedsLower.has(node.id.toLowerCase())
        );
        pruned = { nodes: seedNodes, links: [] };
      } else {
        pruned = pruneGraphToSeeds(graphToEnhance, seedsLower);
      }
    }
    if (pruned) {
      pruned = filterGraphByDiscoveryFilters(pruned, activeDiscoveryFilters, artists);
    }

    // Instantly commit the clean-slate pruned graph to React state to purge stale lineage data
    setGraphData(pruned || { nodes: [], links: [] });

    setIsLoading(true); setError(null); setSeedArtists(artists);
    isFetchingDetailsRef.current = false;
    fetchingNodeIdsRef.current.clear();
    setLoadingNodeIds(new Set());

    // [Selection Lifecycle Reset — bypassToken path] ✦
    // For synthesis paths that skip the token confirmation dialog (force-synthesis,
    // cache-upgrade confirms, bypassTokenConfirmation=true callers), apply the same
    // selectedNode reset so the Deep Cut panel stays clean during loading regardless
    // of entry path. No deep detailsCache eviction needed here because these paths
    // are entered only after the user has already approved a separate confirmation.
    if (isLiveSynthesis) {
      setSelectedNode(null);
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

      if (!skipCacheLookup && !bypassToken && !isLiveSynthesis) {
        const normalizedArtistList = artistList.map(name => name.toLowerCase());
        const compositeCacheResult = await readArtistCacheMany(normalizedArtistList, user?.uid, activeDiscoveryFilters);
        const baseCacheResult = await readArtistCacheMany(normalizedArtistList, user?.uid);

        // Intercept redirects/disambiguations in Phase 02 Cache Hit
        let seedUpdated = false;
        const mappedSeeds = artists.split('::').map(a => {
          const trimmed = a.trim();
          const norm = normalizeArtistId(trimmed);
          const entry = compositeCacheResult.cached.get(norm) || 
                        compositeCacheResult.cached.get(norm.toLowerCase()) ||
                        baseCacheResult.cached.get(norm) ||
                        baseCacheResult.cached.get(norm.toLowerCase());
          if (entry && entry.artistId && entry.artistId.toLowerCase() !== norm.toLowerCase()) {
            seedUpdated = true;
            showToast(`Did you mean ${entry.seedArtists}? Resolved '${trimmed}' to '${entry.seedArtists}'.`);
            return entry.seedArtists;
          }
          return trimmed;
        });

        if (seedUpdated) {
          const resolvedArtists = mappedSeeds.join('::');
          setSeedArtists(resolvedArtists);
          console.log(`[Phase 02 Cache] Redirect detected, restarting generation with: ${resolvedArtists}`);
          handleGenerateGraph(resolvedArtists, isRegeneration, graphToEnhance, skipCacheLookup, bypassTokenConfirmation, overrideFilters);
          return;
        }

        cached = new Map<string, ArtistCacheEntry>();
        missing = [];
        enrichmentRequired = [];
        fullHits = [];

        const allArtistsCached = !skipCacheLookup && normalizedArtistList.every(name => {
          const normName = name.toLowerCase();
          const entry = baseCacheResult.cached.get(name) || baseCacheResult.cached.get(normName);
          return entry && isGraphDataPresent(entry) && isCacheEntryFullyQualified(entry, artistList.length === 1);
        });

        const allCompositeCached = !skipCacheLookup && normalizedArtistList.every(name => {
          const normName = name.toLowerCase();
          const entry = compositeCacheResult.cached.get(name) || compositeCacheResult.cached.get(normName);
          return entry && isGraphDataPresent(entry) && isCacheEntryFullyQualified(entry, artistList.length === 1);
        });

        // Phase 02 Decision State Trace
        normalizedArtistList.forEach(name => {
          const entry = baseCacheResult.cached.get(name) || baseCacheResult.cached.get(name.toLowerCase());
          const hasGraph = entry ? isGraphDataPresent(entry) : false;
          const isFullyQ = entry ? isCacheEntryFullyQualified(entry, artistList.length === 1) : false;
          console.log(`[Phase 02 Decision State] name: "${name}", foundDoc: ${!!entry}, hasGraph: ${hasGraph}, isFullyQualified: ${isFullyQ}, allArtistsCached: ${allArtistsCached}`);
        });

        if (allArtistsCached) {
          // For single-artist queries: skip confirmCacheChoice entirely — load directly from cache.
          // This prevents the cache-choice modal appearing for known artists.
          const skipChoiceModal = artistList.length === 1 || allCompositeCached;
          const choice = skipChoiceModal ? 'cache' : await confirmCacheChoice(artistList);
          if (choice === 'cancel' || controller.signal.aborted) {
            isHydratingSessionRef.current = false;
            setIsLoading(false);
            setActiveNodeIds(prevActiveNodeIds);
            setSeedArtists(prevSeedArtists);
            return;
          }

          if (choice === 'synthesis') {
            console.log("[Phase 02 Cache] Option B chosen: forcing net-new AI generation.");
            handleGenerateGraph(artists, true, null, true, true);
            return;
          }

          console.log("[Phase 02 Cache] Option A chosen: loading standard cached layout (bypassing validation checks).");
          
          let finalCacheResult = allCompositeCached ? compositeCacheResult : baseCacheResult;
          let workingFilters = activeDiscoveryFilters;

          if (!allCompositeCached) {
            // Option A chosen on a filter mismatch: load base cache, align filters to the loaded cache doc
            const firstSlug = artistList[0];
            const entry = baseCacheResult.cached.get(firstSlug) || baseCacheResult.cached.get(firstSlug.toLowerCase()) || baseCacheResult.cached.values().next().value;
            const entryFilters = entry?.filters || {};
            setDiscoveryFilters(entryFilters);
            setLastAppliedFilters(entryFilters);
            workingFilters = entryFilters;
          } else {
            setLastAppliedFilters(activeDiscoveryFilters);
          }

          // Populate cached map directly from finalCacheResult with all entries
          normalizedArtistList.forEach(name => {
            const normName = name.toLowerCase();
            const entry = finalCacheResult.cached.get(name) || finalCacheResult.cached.get(normName);
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
                  let parsedData = parseDetailsCacheSafely(entry.detailsCache);
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
          final = filterGraphByDiscoveryFilters(final, workingFilters, artists);
          
          setGraphData(final);

          setActiveNodeIds(prev => {
            const seedIds = new Set(artistList.map(name => name.toLowerCase()));
            const finalActive = [...artistList];
            prev.forEach(id => {
              if (!seedIds.has(id.toLowerCase())) {
                finalActive.push(id);
                seedIds.add(id.toLowerCase());
              }
            });
            return finalActive;
          });

          setDetailsCache(prev => {
            const next = new Map(prev);
            cached.forEach((cachedEntry, key) => {
              if (cachedEntry && cachedEntry.detailsCache) {
                try {
                  let parsedData = parseDetailsCacheSafely(cachedEntry.detailsCache);
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
                    groundingLinks: parsedData?.groundingLinks || [],
                    tourDates: parsedData?.tourDates || [],
                    tourCachedAt: parsedData?.tourCachedAt || ""
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
          
          const allQualified = Array.from(cached.values()).every(e => validateCacheEntry(e, artistList.length === 1).isFullyQualified);
          if (!allQualified) {
            console.log('[Front Gate Cache] Some artists not fully qualified. Background revalidation queued.');
          } else {
            showCacheToast();
          }
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
          const entry = compositeCacheResult.cached.get(name) || compositeCacheResult.cached.get(normName);
          const forceMockHit = ((import.meta.env.VITE_USE_MOCKS === 'true') || (import.meta.env.VITE_USE_MOCKS !== 'false' && import.meta.env.DEV)) && 
            ['sick of it all', 'h2o', 'radiohead', 'blink-182', 'orange 9mm', 'madball'].includes(normName);

          const isAlreadyInGraph = !hasActiveFilters && (
            currentSeeds.includes(normName) || 
            (graphData?.nodes.some(n => n.id.toLowerCase() === normName || normalizeArtistId(n.id) === normName || isArtistIdMatch(n.id, normName)) ?? false)
          );

          const validation = entry ? validateCacheEntry(entry, artistList.length === 1) : null;
          const filtersMatch = bypassChoiceConfirmation ? true : (entry ? areFiltersEqual(entry.filters, activeDiscoveryFilters) : false);
          const isQualified = bypassChoiceConfirmation ? true : validation?.isFullyQualified;

          if (!skipCacheLookup && (forceMockHit || (entry && filtersMatch && isQualified))) {
            fullHits.push(name);
            const finalEntry: ArtistCacheEntry = entry || {
              artistId: normalizeArtistId(name),
              seedArtists: name,
              graphData: JSON.stringify({ nodes: [{ id: name, type: 'artist', label: name, group: 1 }], links: [] }),
              cacheVersion: 4,
              cachedAt: { seconds: Date.now() / 1000, nanoseconds: 0 } as any,
              hitCount: 0,
              detailsCache: JSON.stringify({
                summary: `**${name}** is a standard sandbox mock cached band for test scenarios.`,
                imageUrl: '',
                members: [],
                details: { genre: 'Hardcore Punk', origin: 'New York, USA', founded: '1990', notableArtists: [], artist: name },
                links: [],
                discography: [],
                recommendationReason: "Mock curator insight.",
                youtubeSearchQuery: `Mock youtube search query for ${name}`
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
                cacheVersion: 4,
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
        const choice = (allDeep || bypassChoiceConfirmation) ? 'cache' : await confirmCacheChoice(artistList);
        if (choice === 'cancel' || controller.signal.aborted) {
          isHydratingSessionRef.current = false;
          setIsLoading(false);
          setActiveNodeIds(prevActiveNodeIds);
          setSeedArtists(prevSeedArtists);
          return;
        }

        if (choice === 'synthesis') {
          console.log("[Phase 02 Cache] Option B chosen: forcing net-new AI generation.");
          handleGenerateGraph(artists, true, null, true, true);
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
                let parsedData = parseDetailsCacheSafely(entry.detailsCache);
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

        setActiveNodeIds(prev => {
          const seedIds = new Set(artistList.map(name => name.toLowerCase()));
          const finalActive = [...artistList];
          prev.forEach(id => {
            if (!seedIds.has(id.toLowerCase())) {
              finalActive.push(id);
              seedIds.add(id.toLowerCase());
            }
          });
          return finalActive;
        });

        setDetailsCache(prev => {
          const next = new Map(prev);
          cached.forEach((cachedEntry, key) => {
            if (cachedEntry && cachedEntry.detailsCache) {
              try {
                let parsedData = parseDetailsCacheSafely(cachedEntry.detailsCache);
                const entryBio = parsedData?.summary || parsedData?.bio || parsedData?.description || parsedData?.text || "";
                
                // Guard: Only add to detailsCache if bio is present and has length > 5
                if (!entryBio || entryBio.length < 5) return;

                const entryGenre = parsedData?.details?.genre || parsedData?.genre || parsedData?.genres || "";
                const entryOrigin = parsedData?.details?.origin || parsedData?.origin || parsedData?.location || parsedData?.country || "";
                const entryFounded = parsedData?.details?.founded || parsedData?.founded || parsedData?.formed || parsedData?.year || "";
                const entryArtistName = parsedData?.details?.artist || parsedData?.artist || parsedData?.name || cachedEntry.seedArtists || cachedEntry.artistId || key;
                const entryTourDates = parsedData?.tourDates || [];
                const entryTourCachedAt = parsedData?.tourCachedAt || "";

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
                  groundingLinks: parsedData?.groundingLinks || [],
                  tourDates: entryTourDates,
                  tourCachedAt: entryTourCachedAt,
                  synthesisRationale: cachedEntry.synthesisRationale || parsedData?.synthesisRationale || ""
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
        
        const allQualified = Array.from(cached.values()).every(e => validateCacheEntry(e, artistList.length === 1).isFullyQualified);
        if (!allQualified) {
          console.log('[Front Gate Cache] Some artists not fully qualified. Background revalidation queued.');
        } else {
          showCacheToast();
        }
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
        const optimisticGraph = assembleGraphFromCache(cached);
        const enrichmentSet = new Set(enrichmentRequired.map(name => normalizeArtistId(name)));
        optimisticGraph.nodes = optimisticGraph.nodes.map(n => {
          if (n.type === 'artist' && enrichmentSet.has(normalizeArtistId(n.id))) {
            return { ...n, isPending: true };
          }
          return n;
        });
        setGraphData(optimisticGraph);
        const optimisticActiveIds = Array.from(cached.values()).map(entry => entry.artistId || (entry as any).labelId || entry.cacheKey).filter(Boolean);
        if (optimisticActiveIds.length > 0) {
          setActiveNodeIds(optimisticActiveIds);
        }

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
            setActiveNodeIds(prevActiveNodeIds);
            setSeedArtists(prevSeedArtists);
            showToast(`Loading cached artists: ${legacyArtists.join(', ')}`);
            handleGenerateGraph(legacyArtists.join('::'), isRegeneration, graphToEnhance, true, true);
          } else {
            isHydratingSessionRef.current = false;
            setActiveNodeIds(prevActiveNodeIds);
            setSeedArtists(prevSeedArtists);
          }
          return;
        }

        // Call Gemini ONLY for the missing and enrichment artists
        const useCloudCuration = import.meta.env.VITE_USE_CLOUD_CURATION === 'true';
        let partialGraphPromise;
        if (useCloudCuration && user?.uid) {
          console.log("[Music Discovery] Routing partial graph generation via Cloud-Side Curation.");
          partialGraphPromise = generateGraphDataViaCloudJob(
            toFetch.join('::'),
            activeDiscoveryFilters,
            user.uid,
            controller?.signal,
            (detailsCacheJson) => {
              try {
                const expandedMap = expandDetailsCacheMap(detailsCacheJson);
                setDetailsCache(prev => {
                  const next = new Map(prev);
                  expandedMap.forEach((v, k) => next.set(k, v));
                  return next;
                });
              } catch (e) {
                console.warn("Failed to parse detailsCache from cloud job:", e);
              }
            }
          );
        } else {
          partialGraphPromise = generateGraphData(toFetch.join('::'), pruned, activeDiscoveryFilters, user?.uid, controller?.signal, activeDisambiguationHints);
        }
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("The AI is taking too long to respond. The request has timed out.")), 600000)
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
          const fetchedDetailsMap = new Map<string, NodeDetails>();
          const seedName = toFetch[0];
          const nodeObj = { id: seedName, label: seedName, type: 'artist' as any, group: 0 };
          
          const runUpfrontFetchAndWrite = async () => {
            try {
              console.log(`[Music Discovery] Fetching upfront details for seed: ${seedName}`);
              const details = await fetchNodeDetails(nodeObj, freshData, seedArtists, urlOriginHint);
              
              // JIT Scraper Hook
              const artistDisplay = details.details?.artist || seedName;
              try {
                const scrapeRes = await window.fetch('/api/artist/scrape-video-id', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    artistName: artistDisplay,
                    artistId: normalizeArtistId(seedName)
                  })
                });
                if (scrapeRes.ok) {
                  const scrapeData = await scrapeRes.json();
                  if (scrapeData.youtubeVideoId) {
                    details.youtubeVideoId = scrapeData.youtubeVideoId;
                  }
                }
              } catch (err) {
                console.warn("[Music Discovery] Scraper failed during upfront fetch:", err);
              }

              if (details.youtubeVideoId) {
                const playable = await checkVideoPlayabilityOnServer(details.youtubeVideoId);
                if (!playable) {
                  details.youtubeVideoId = null;
                }
              }

              if (!details.details) {
                details.details = { genre: "", origin: "", founded: "", notableArtists: [] };
              }
              details.details.artist = details.details.artist || seedName;
              if (!details.synthesisRationale) {
                details.synthesisRationale = freshData.synthesisRationale || "";
              }

              fetchedDetailsMap.set(normalizeArtistId(seedName), details);
              fetchedDetailsMap.set(seedName.toLowerCase(), details);

              // Seed detailsCache so JIT loading is instant
              setDetailsCache(prev => {
                const updated = new Map(prev);
                updated.set(seedName, details);
                updated.set(seedName.toLowerCase(), details);
                updated.set(normalizeArtistId(seedName), details);
                return updated;
              });
              healedDetailsCacheRef.current.set(seedName, details);
              healedDetailsCacheRef.current.set(seedName.toLowerCase(), details);
              healedDetailsCacheRef.current.set(normalizeArtistId(seedName), details);
            } catch (err) {
              console.error(`[Music Discovery] Upfront details fetch failed for ${seedName}:`, err);
            }

            // Write to Firestore
            const combinedDetailsMap = new Map([
              ...fetchedDetailsMap,
              ...detailsCacheRef.current,
              ...healedDetailsCacheRef.current,
              ...detailsCache
            ]);
            const allEntityNamesToCache = Array.from(new Set([...toFetch, ...freshData.nodes.filter(n => n.type === 'artist' || n.type === 'label').map(n => n.label || n.id)]));
            await writeArtistCacheMany(allEntityNamesToCache, freshData, user?.uid, activeDiscoveryFilters, true, true, combinedDetailsMap, toFetch);
          };

          runUpfrontFetchAndWrite()
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

        setActiveNodeIds(prev => {
          const currentActive = [...prev];
          const seedMapped = artistList.map(name => {
            const match = merged.nodes.find(fn => fn.id.toLowerCase() === name.toLowerCase());
            const baseNode = (match || { id: name, type: 'artist' as any, group: 0 }) as Node;
            const normId = normalizeArtistId(baseNode.id);
            const cachedDetails = detailsCache.get(normId) || detailsCache.get(baseNode.id.toLowerCase());
            
            // Find connected countries in the merged graph
            const connectedCountries = merged.links
              .filter((l: any) => {
                const sId = typeof l.source === 'string' ? l.source : l.source.id;
                const tId = typeof l.target === 'string' ? l.target : l.target.id;
                return sId.toLowerCase() === baseNode.id.toLowerCase() || tId.toLowerCase() === baseNode.id.toLowerCase();
              })
              .map((l: any) => {
                const sId = typeof l.source === 'string' ? l.source : l.source.id;
                const tId = typeof l.target === 'string' ? l.target : l.target.id;
                const otherId = sId.toLowerCase() === baseNode.id.toLowerCase() ? tId : sId;
                return merged.nodes.find((no: any) => no.id.toLowerCase() === otherId.toLowerCase());
              })
              .filter((no: any) => no && no.type === 'country')
              .map((no: any) => no.label || no.id);

            const cachedOrigin = cachedDetails?.details?.origin || (cachedDetails as any)?.origin || '';
            const hasMismatch = connectedCountries.length > 0 && 
              !connectedCountries.some((c: string) => {
                const normC = c.toLowerCase().trim();
                const normO = cachedOrigin.toLowerCase().trim();
                return normO.includes(normC) || normC.includes(normO);
              });

            if (cachedDetails && cachedDetails.summary && !hasMismatch) {
              return {
                ...baseNode,
                bio: cachedDetails.summary,
                summary: cachedDetails.summary,
                genre: cachedDetails.details?.genre || "",
                origin: cachedDetails.details?.origin || "",
                founded: cachedDetails.details?.founded || "",
                imageUrl: cachedDetails.imageUrl || (baseNode as any).imageUrl || ""
              };
            }
            return baseNode;
          });
          const seedIds = new Set(seedMapped.map(s => s.id.toLowerCase()));
          const finalActive = [...seedMapped.map(n => n.id)];
          currentActive.forEach(p => {
            if (!seedIds.has(p.toLowerCase())) {
              finalActive.push(p);
              seedIds.add(p.toLowerCase());
            }
          });
          return finalActive;
        });

        setIsLoading(false);
        fullCacheHit = true;
        setLastAppliedFilters(activeDiscoveryFilters);
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

    // ── DEFINITIVE HARD GUARD: Last-Chance Cache Firewall ─────────────────────────────────────
    // Prevent confirmTokenUsage from ever firing for artists that exist in Firestore.
    // This catches any edge case where Phase 02's validation gates (isGraphDataPresent / filtersMatch)
    // returned false for non-critical reasons (e.g. missing link context, filter mismatch).
    // If we find a valid graphData document for ALL artists, we load from cache and return.
    if (!skipCacheLookup && !bypassToken && artistList.length >= 1) {
      try {
        const hardGuardResults = await Promise.allSettled(
          artistList.map(async (name) => {
            const snap = await getAnyEntityDocWithRedirect(normalizeArtistId(name));
            if (!snap.exists()) return null;
            const d = snap.data();
            if (!d) return null;
            return isGraphDataPresent(d) ? d : null;
          })
        );

        const hardGuardEntries = hardGuardResults
          .filter(r => r.status === 'fulfilled' && r.value !== null)
          .map(r => (r as PromiseFulfilledResult<any>).value);

        if (hardGuardEntries.length === artistList.length) {
          // ALL artists have cached graphData — load the first one's graph and abort synthesis
          console.log(`[HARD GUARD] All ${artistList.length} artist(s) found in Firestore with graphData. Blocking synthesis.`);
          const firstData = hardGuardEntries[0];
          let parsedGraph: GraphData | null = null;
          try {
            parsedGraph = typeof firstData.graphData === 'string'
              ? JSON.parse(firstData.graphData)
              : firstData.graphData;
          } catch (e) { console.warn('[HARD GUARD] Failed to parse graphData:', e); }

          if (parsedGraph && parsedGraph.nodes && parsedGraph.nodes.length > 0) {
            const normalizedGraph = applyHumanCasedLabels(normalizeGraphData(parsedGraph), artists);
            setGraphData(normalizedGraph);
            setIsLoading(false);
            isHydratingSessionRef.current = false;
            showCacheToast();
            console.log(`[HARD GUARD] Cache loaded successfully. Nodes: ${normalizedGraph.nodes.length}. Synthesis blocked.`);
            return;
          }
        } else {
          console.log(`[HARD GUARD] ${hardGuardEntries.length}/${artistList.length} artists cached — synthesis will proceed for missing artists.`);
        }
      } catch (guardErr) {
        console.warn('[HARD GUARD] Last-chance firewall check failed, proceeding to synthesis:', guardErr);
      }
    }

    if (!bypassToken) {
      const confirmed = await confirmTokenUsage(isLiveSynthesis ? 'live_synthesis' : 'generation', [], artistList);
      if (!confirmed || (controller && controller.signal.aborted)) {
        isHydratingSessionRef.current = false;
        setIsLoading(false);
        setActiveNodeIds(prevActiveNodeIds);
        setSeedArtists(prevSeedArtists);
        return;
      }
    }


    // [Selection Lifecycle Reset] ✦
    // The user has confirmed a live synthesis pass. Any selectedNode hydrated from
    // a pre-generation simple-key cache lookup is now stale context. Reset to null
    // so the Deep Cut panel clears immediately and does not display a mismatched
    // profile during the loading window. Gates 1–3 will correctly re-hydrate on
    // graph completion.
    if (isLiveSynthesis) {
      setSelectedNode(null);
      // Evict simple-key detailsCache entries for the seed artists so a concurrent
      // Baseline Prefetch flush cannot re-inject stale data via React state batching.
      const seedEvictionKeys = artistList.flatMap(name => [
        name, name.toLowerCase(), normalizeArtistId(name)
      ]);
      setDetailsCache(prev => {
        const next = new Map(prev);
        seedEvictionKeys.forEach(k => next.delete(k));
        return next;
      });
      seedEvictionKeys.forEach(k => detailsCacheRef.current.delete(k));
    }

    artistList.forEach(name => {
      approvedSeedsRef.current.add(normalizeArtistId(name));
    });


      const useCloudCuration = import.meta.env.VITE_USE_CLOUD_CURATION === 'true';
      let graphPromise;
      if (useCloudCuration && user?.uid) {
        console.log("[Music Discovery] Routing graph generation via Cloud-Side Curation.");
        const jobId = `job-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;

        // Stateful Project UX: Update project document immediately before running job
        if (currentProjectId && !isGuest) {
          const projectPath = `users/${user.uid}/projects/${currentProjectId}`;
          const firstArtist = artists.split('::')[0];
          try {
            await updateDoc(doc(db, projectPath), {
              status: 'curating',
              activeJobId: jobId,
              seedArtists: artists,
              name: projectName || firstArtist,
              updatedAt: serverTimestamp()
            });
          } catch (e) {
            if (controller?.signal.aborted) {
              console.log("[Kill-Switch] Task cancelled. Blocking Firestore persistence.");
              return;
            }
            await setDoc(doc(db, projectPath), {
              status: 'curating',
              activeJobId: jobId,
              seedArtists: artists,
              name: projectName || firstArtist,
              updatedAt: serverTimestamp()
            }, { merge: true });
          }
        }

        graphPromise = generateGraphDataViaCloudJob(
          artists,
          activeDiscoveryFilters,
          user.uid,
          controller?.signal,
          (detailsCacheJson) => {
            try {
              const expandedMap = expandDetailsCacheMap(detailsCacheJson);
              setDetailsCache(prev => {
                const next = new Map(prev);
                expandedMap.forEach((v, k) => next.set(k, v));
                return next;
              });
            } catch (e) {
              console.warn("Failed to parse detailsCache from cloud job:", e);
            }
          },
          currentProjectId || undefined,
          jobId,
          activeDisambiguationHints
        );
      } else {
        graphPromise = generateGraphData(artists, pruned, activeDiscoveryFilters, user?.uid, controller?.signal, activeDisambiguationHints);
      }
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("The AI is taking too long to respond. The request has timed out.")), 600000)
      );

      const startTime = Date.now();
      const newData = await Promise.race([graphPromise, timeoutPromise]) as GraphData;
      console.log(`[Music Discovery] AI generated graph in ${((Date.now() - startTime) / 1000).toFixed(1)}s`);

      if (controller && controller.signal.aborted) return;
      if (!newData || !newData.nodes || !newData.links) {
        throw new Error("The AI returned formless data. Please try again with different artists.");
      }

      let seedUpdated = false;
      const mappedSeeds = artists.split('::').map(a => {
        const trimmed = a.trim();
        const canonicalNode = findCanonicalNodeForArtist(trimmed, newData.nodes);
        if (canonicalNode && normalizeArtistId(canonicalNode.id) !== normalizeArtistId(trimmed)) {
          seedUpdated = true;
          showToast(`Did you mean ${canonicalNode.label || canonicalNode.id}? Resolved '${trimmed}' to '${canonicalNode.label || canonicalNode.id}'.`);
          return canonicalNode.label || canonicalNode.id;
        }
        return trimmed;
      });

      let resolvedArtists = artists;
      let resolvedArtistList = artistList;
      let mutatedNewData = { ...newData };
      let mutatedPruned = pruned ? { ...pruned } : null;

      if (seedUpdated) {
        resolvedArtists = mappedSeeds.join('::');
        resolvedArtistList = mappedSeeds.map(a => normalizeArtistId(a));
        setSeedArtists(resolvedArtists);

        resolvedArtistList.forEach(name => {
          approvedSeedsRef.current.add(normalizeArtistId(name));
        });

        // Mutate seed IDs in-place on both newData and pruned
        artists.split('::').forEach((oldSeed, idx) => {
          const newSeedLabel = mappedSeeds[idx];
          const oldSeedId = normalizeArtistId(oldSeed);
          const newSeedId = normalizeArtistId(newSeedLabel);
          if (oldSeedId !== newSeedId) {
            mutatedNewData = mutateGraphArtistId(mutatedNewData, oldSeed, newSeedId, newSeedLabel);
            if (mutatedPruned) {
              mutatedPruned = mutateGraphArtistId(mutatedPruned, oldSeed, newSeedId, newSeedLabel);
            }
            
            // Clean up old unmutated seed IDs from loadingNodeIds to prevent loader leaks
            setLoadingNodeIds(prev => {
              const next = new Set(prev);
              next.delete(oldSeed);
              next.delete(oldSeedId);
              next.delete(oldSeed.toLowerCase());
              return next;
            });
            
            // Also mutate selectedNode and activeNodes if they matched the old seed ID
            setSelectedNode(prev => {
              if (prev && normalizeArtistId(prev.id) === oldSeedId) {
                return { ...prev, id: newSeedId, label: newSeedLabel, name: newSeedLabel };
              }
              return prev;
            });
            setActiveNodeIds(prev => {
              return prev.map(id => {
                if (normalizeArtistId(id) === oldSeedId) {
                  return newSeedId;
                }
                return id;
              });
            });
          }
        });
      }

      const returnedIds = new Set(mutatedNewData.nodes.map(n => n.id.toLowerCase()));
      let maxG = mutatedNewData.nodes.reduce((m, n) => Math.max(m, n.group || 0), 0);
      resolvedArtistList.forEach(name => { if (!returnedIds.has(name.toLowerCase())) { maxG++; mutatedNewData.nodes.push({ id: name, type: 'artist', group: maxG }); } });
      let final = mutatedPruned ? mergeGraphData(mutatedPruned, mutatedNewData) : mutatedNewData;
      final = applyHumanCasedLabels(final, resolvedArtists);
      final = filterGraphByDiscoveryFilters(final, activeDiscoveryFilters, resolvedArtists);
      setGraphData(final);

      setSelectedNode(prev => {
        if (!prev) return null;
        const match = final.nodes.find(n => n.id.toLowerCase() === prev.id.toLowerCase());
        return match ? { ...prev, id: match.id, label: match.label || prev.label } : prev;
      });

      // Phase 02 complete — write each artist as an isolated individual doc - only for standalone queries
      if (artistList.length === 1) {
        console.log(`[Music Discovery] Full cache MISS — writing per-artist docs for: [${artistList.join(', ')}]`);
        const fetchedDetailsMap = new Map<string, NodeDetails>();
        const seedName = artistList[0];
        const nodeObj = { id: seedName, label: seedName, type: 'artist' as any, group: 0 };
        
        const runUpfrontFetchAndWrite = async () => {
          try {
            console.log(`[Music Discovery] Fetching upfront details for seed: ${seedName}`);
            const details = await fetchNodeDetails(nodeObj, final, seedArtists, urlOriginHint);
            
            // JIT Scraper Hook
            const artistDisplay = details.details?.artist || seedName;
            try {
              const scrapeRes = await window.fetch('/api/artist/scrape-video-id', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  artistName: artistDisplay,
                  artistId: normalizeArtistId(seedName)
                })
              });
              if (scrapeRes.ok) {
                const scrapeData = await scrapeRes.json();
                if (scrapeData.youtubeVideoId) {
                  details.youtubeVideoId = scrapeData.youtubeVideoId;
                }
              }
            } catch (err) {
              console.warn("[Music Discovery] Scraper failed during upfront fetch:", err);
            }

            if (details.youtubeVideoId) {
              const playable = await checkVideoPlayabilityOnServer(details.youtubeVideoId);
              if (!playable) {
                details.youtubeVideoId = null;
              }
            }

            if (!details.details) {
              details.details = { genre: "", origin: "", founded: "", notableArtists: [] };
            }
            details.details.artist = details.details.artist || seedName;
            if (!details.synthesisRationale) {
              details.synthesisRationale = final.synthesisRationale || "";
            }

            fetchedDetailsMap.set(normalizeArtistId(seedName), details);
            fetchedDetailsMap.set(seedName.toLowerCase(), details);

            // Seed detailsCache so JIT loading is instant
            setDetailsCache(prev => {
              const updated = new Map(prev);
              updated.set(seedName, details);
              updated.set(seedName.toLowerCase(), details);
              updated.set(normalizeArtistId(seedName), details);
              return updated;
            });
            healedDetailsCacheRef.current.set(seedName, details);
            healedDetailsCacheRef.current.set(seedName.toLowerCase(), details);
            healedDetailsCacheRef.current.set(normalizeArtistId(seedName), details);
          } catch (err) {
            console.error(`[Music Discovery] Upfront details fetch failed for ${seedName}:`, err);
          }

          // Write to Firestore
          if (controller?.signal.aborted) {
            console.log("[Kill-Switch] Task cancelled. Blocking Firestore persistence.");
            return;
          }
          setSupportsLabelDeepCuts(true);
          const combinedDetailsMap = new Map([
            ...fetchedDetailsMap,
            ...detailsCacheRef.current,
            ...healedDetailsCacheRef.current,
            ...detailsCache
          ]);
          const allEntityNamesToCache = Array.from(new Set([...artistList, ...final.nodes.filter(n => n.type === 'artist' || n.type === 'label').map(n => n.label || n.id)]));
          await writeArtistCacheMany(allEntityNamesToCache, final, user?.uid, activeDiscoveryFilters, true, true, combinedDetailsMap, artistList);
        };

        runUpfrontFetchAndWrite()
          .then(() => console.log(`[Music Discovery] Per-artist cache write confirmed for: [${artistList.join(', ')}]`))
          .catch(e => console.error('[Music Discovery] Per-artist cache write failed:', e));
      }

      // Update active nodes metadata from the final graph, ensuring all seeds are present
      setActiveNodeIds(prev => {
        const seedIds = new Set(resolvedArtistList.map(name => name.toLowerCase()));
        const finalActive = [...resolvedArtistList];

        // Add back other previously active nodes that aren't seeds (e.g. manual discoveries)
        prev.forEach(id => {
          if (!seedIds.has(id.toLowerCase())) {
            finalActive.push(id);
            seedIds.add(id.toLowerCase());
          }
        });

        return finalActive;
      });

      // Find the primary/seed node in the final graph and select it to paint the sidebar immediately
      const firstSlug = resolvedArtistList[0];
      const primaryNode = final.nodes.find(n => n.id.toLowerCase() === firstSlug.toLowerCase()) || final.nodes[0];
      if (primaryNode) {
        const normId = normalizeArtistId(primaryNode.id);
        const cachedDetails = detailsCache.get(normId) || detailsCache.get(primaryNode.id.toLowerCase());
        
        // Find connected countries in the newly synthesized graph
        const connectedCountries = final.links
          .filter((l: any) => {
            const sId = typeof l.source === 'string' ? l.source : l.source.id;
            const tId = typeof l.target === 'string' ? l.target : l.target.id;
            return sId.toLowerCase() === primaryNode.id.toLowerCase() || tId.toLowerCase() === primaryNode.id.toLowerCase();
          })
          .map((l: any) => {
            const sId = typeof l.source === 'string' ? l.source : l.source.id;
            const tId = typeof l.target === 'string' ? l.target : l.target.id;
            const otherId = sId.toLowerCase() === primaryNode.id.toLowerCase() ? tId : sId;
            return final.nodes.find((no: any) => no.id.toLowerCase() === otherId.toLowerCase());
          })
          .filter((no: any) => no && no.type === 'country')
          .map((no: any) => no.label || no.id);

        const cachedOrigin = cachedDetails?.details?.origin || (cachedDetails as any)?.origin || '';
        const hasMismatch = connectedCountries.length > 0 && 
          !connectedCountries.some((c: string) => {
            const normC = c.toLowerCase().trim();
            const normO = cachedOrigin.toLowerCase().trim();
            return normO.includes(normC) || normC.includes(normO);
          });

        if (cachedDetails && cachedDetails.summary && !hasMismatch) {
          setSelectedNode({
            ...primaryNode,
            bio: cachedDetails.summary,
            summary: cachedDetails.summary,
            genre: cachedDetails.details?.genre || "",
            origin: cachedDetails.details?.origin || "",
            founded: cachedDetails.details?.founded || "",
            imageUrl: cachedDetails.imageUrl || (primaryNode as any).imageUrl || ""
          } as any);
        } else {
          // If there is an origin mismatch, evict the stale entry from detailsCache so the queue can fetch it
          if (hasMismatch) {
            console.log(`[Selection Hydration Gate] Origin mismatch detected for ${primaryNode.id} selection (cached: "${cachedOrigin}", graph: [${connectedCountries.join(', ')}]). Evicting simple-key cache.`);
            setDetailsCache(prev => {
              const next = new Map(prev);
              next.delete(normId);
              next.delete(primaryNode.id.toLowerCase());
              return next;
            });
            detailsCacheRef.current.delete(normId);
            detailsCacheRef.current.delete(primaryNode.id.toLowerCase());
          }
          setSelectedNode(primaryNode);
        }
      }
      setLastAppliedFilters(activeDiscoveryFilters);
      if (user && isFirebaseReady && isAuthInitialized && currentProjectId && !isGuest) {
        isLockReleasedByAutosave = true;
      } else {
        isHydratingSessionRef.current = false;
      }
    } catch (err: any) {
      if (err.name !== 'AbortError' && !(controller && controller.signal.aborted)) {
        const snippet = err.stackSnippet ? err.stackSnippet : "";
        showToast(humanizeError(err) + snippet);
        setIsLoading(false);
        isFetchingDetailsRef.current = false;
      }
    } finally {
      if (controller && abortControllerRef.current === controller) {
        setIsLoading(false);
      }
      if (!isLockReleasedByAutosave) {
        isHydratingSessionRef.current = false;
      }
      isProjectLoadingRef.current = false;
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
          name: data.name || 'Untitled Zcene',
          seedArtists: data.seedArtists || '',
          cacheKey: data.cacheKey || '',
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
          artistIds: data.artistIds,
          graphData: data.graphData,
          detailsCache: data.detailsCache,
          canvasLayout: data.canvasLayout,
          activeNodes: data.activeNodes,
          isMagazineViewOpen: data.isMagazineViewOpen
        });
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
  const batchHydrateDetailsCache = useCallback(async (nodes: any[], links: any[] = []): Promise<void> => {
    const artistNodes = nodes.filter((n: any) => n.type === 'artist' || n.type === 'label' || !n.type);
    if (!artistNodes.length) return;

    const results = new Map<string, NodeDetails>();

    await Promise.allSettled(artistNodes.map(async (n: any) => {
      const simpleId = normalizeArtistId(n.id);

      // Find connected countries in the graph links
      const connectedCountries = links
        .filter((l: any) => {
          const sId = typeof l.source === 'string' ? l.source : l.source.id;
          const tId = typeof l.target === 'string' ? l.target : l.target.id;
          return sId.toLowerCase() === n.id.toLowerCase() || tId.toLowerCase() === n.id.toLowerCase();
        })
        .map((l: any) => {
          const sId = typeof l.source === 'string' ? l.source : l.source.id;
          const tId = typeof l.target === 'string' ? l.target : l.target.id;
          const otherId = sId.toLowerCase() === n.id.toLowerCase() ? tId : sId;
          return nodes.find((no: any) => no.id.toLowerCase() === otherId.toLowerCase());
        })
        .filter((no: any) => no && no.type === 'country')
        .map((no: any) => no.label || no.id);

      let cacheId = simpleId;
      if (connectedCountries.length > 0) {
        const countryNorm = normalizeArtistId(connectedCountries[0]);
        if (countryNorm) cacheId = simpleId.endsWith(`-${countryNorm}`) ? simpleId : `${simpleId}-${countryNorm}`;
      }
      
      try {
        let snap = await getEntityDocWithRedirect(cacheId, n.type === 'label' ? 'label' : 'artist');
        
        // If the country-disambiguated doc does not exist, check the simple ID with context verification
        if (!snap.exists() && cacheId !== simpleId) {
          const fallbackSnap = await getEntityDocWithRedirect(simpleId, n.type === 'label' ? 'label' : 'artist');
          if (fallbackSnap.exists()) {
            const data = fallbackSnap.data();
            if (data?.detailsCache) {
              const parsed = parseDetailsCacheSafely(data.detailsCache);
              const cachedOrigin = parsed?.details?.origin || parsed?.origin || '';
              const hasMismatch = connectedCountries.length > 0 && 
                !connectedCountries.some((c: string) => {
                  const normC = c.toLowerCase().trim();
                  const normO = cachedOrigin.toLowerCase().trim();
                  return normO.includes(normC) || normC.includes(normO);
                });
              if (!hasMismatch) {
                snap = fallbackSnap;
              }
            }
          }
        }

        if (!snap.exists()) return;

        const data = snap.data();
        if (!data?.detailsCache) return;

        // Parse the detailsCache safely
        let parsed: any = parseDetailsCacheSafely(data.detailsCache);

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
        const tourDates = parsed?.tourDates || [];
        const tourCachedAt = parsed?.tourCachedAt || '';

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
          youtubeSearchQuery,
          tourDates,
          tourCachedAt
        };

        // Register under all lookup key variants
        results.set(n.id, payload);
        results.set(n.id.toLowerCase(), payload);
        results.set(simpleId, payload);
        if (cacheId !== simpleId) {
          results.set(cacheId, payload);
        }
        console.log('[Batch Hydration] Loaded from global artists:', n.id, '→', cacheId);
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
        const isExistingLocked = existing && existing.summary && existing.summary.trim().length > 5 && !existing._isSentinel;
        if (isExistingLocked) {
          console.log(`[Batch Hydration] Bypassing ref sync for locked artist: ${k}`);
          return;
        }
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
          const isExistingLocked = existing && existing.summary && existing.summary.trim().length > 5 && !existing._isSentinel;
          if (isExistingLocked) {
            console.log(`[Batch Hydration] Bypassing state merge for locked artist: ${k}`);
            return;
          }
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
        setActiveNodeIds([]);
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
      if (!isMounted || !snap.exists()) {
        isProjectLoadingRef.current = false;
        return false;
      }

      const data = snap.data();
      const statusChanged = data.status !== projectStatus;
      const jobChanged = data.activeJobId !== activeJobId;
      const incomingHasGraph = data.graphData && typeof data.graphData === 'string' && data.graphData.trim().length > 20;
      const localHasGraph = graphDataRef.current && graphDataRef.current.nodes && graphDataRef.current.nodes.length > 0;
      
      const isCriticalUpdate = statusChanged || jobChanged || (incomingHasGraph && !localHasGraph);

      if (isHydratingSessionRef.current && !isCriticalUpdate) {
        console.log('[ProjectLoader] Bypassing snapshot handle because local session is saving/hydrating and update is non-critical');
        return false;
      }

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
      } else if (data.labelIds && Array.isArray(data.labelIds) && data.labelIds.length > 0) {
        incomingGraphEmpty = false;
      } else if (data.cacheKey) {
        incomingGraphEmpty = false;
      } else if (data.status === 'curating') {
        incomingGraphEmpty = false;
      }

      if (localGraphPopulated && incomingGraphEmpty) {
        console.log('[ProjectLoader] Bypassing snapshot handle because local state is populated but incoming database state is empty/blank');
        isProjectLoadingRef.current = false;
        return false;
      }
      setCurrentProjectOwnerId(data.authorId || null);
      if (data.name !== undefined) setProjectName(data.name);
      setProjectStatus(data.status || null);
      setActiveJobId(data.activeJobId || null);
      setSupportsLabelDeepCuts(data.supportsLabelDeepCuts === true || data.schemaVersion >= 2);
      if (data.status === 'curating') {
        setIsLoading(true);
      }

      // Always restore non-graph metadata (available in both new and legacy formats)
      if (data.seedArtists) setSeedArtists((prev: any) => prev === data.seedArtists ? prev : data.seedArtists);
      if (data.discoveryFilters) {
        const parsedFilters = typeof data.discoveryFilters === 'string' && data.discoveryFilters.startsWith('{') ? JSON.parse(data.discoveryFilters) : null;
        if (parsedFilters) {
          setDiscoveryFilters((prev: any) => JSON.stringify(prev) === JSON.stringify(parsedFilters) ? prev : parsedFilters);
          setLastAppliedFilters(parsedFilters);
        }
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
      if (data.isMagazineViewOpen !== undefined && isProjectLoadingRef.current) {
        setIsMagazineViewOpen(false); // Safely default to workspace view on initial load
      }

      try {
        let loadedFromGraphData = false;
        let hydratedNodes: Node[] = [];
        if (data.graphData && typeof data.graphData === 'string' && data.graphData.trim().length > 20) {
          try {
            const parsed = JSON.parse(data.graphData);
            if (parsed && parsed.nodes && parsed.nodes.length > 0) {
              console.log('[ProjectLoader] Hydrating directly from project graphData');
              const g = normalizeGraphData(parsed);
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

              if (data.detailsCache) {
                try {
                  const newCacheMap = expandDetailsCacheMap(data.detailsCache);
                  newCacheMap.forEach((v, k) => {
                    detailsCacheRef.current.set(k, v);
                  });
                  setDetailsCache((prev) => {
                    const merged = new Map(prev);
                    newCacheMap.forEach((v, k) => merged.set(k, v));
                    return merged;
                  });
                } catch (e) {
                  console.error("[ProjectLoader] Details cache parse fail", e);
                }
              }

              // ── FIRESTORE-FIRST: batch-load all node biographies before marking load complete
              const isInitialHydration = isProjectLoadingRef.current;
              if (isInitialHydration) setIsLoading(true);
              try {
                await batchHydrateDetailsCache(g.nodes, g.links);
              } finally {
                if (isInitialHydration) setIsLoading(false);
              }
              hydratedNodes = g.nodes;

              // Restore active nodes — with seed-fallback for stale documents where activeNodes was never
              // written by the backend (legacy projects have activeNodes: [] from creation).
              if (data.activeNodes && Array.isArray(data.activeNodes)) {
                let resolvedActiveNodes = data.activeNodes;
                const availableEntities = g.nodes.map((n: any) => n.id);
                if (resolvedActiveNodes.length <= 1 && availableEntities.length > resolvedActiveNodes.length) {
                  resolvedActiveNodes = availableEntities;
                }
                setActiveNodeIds(resolvedActiveNodes);
                
                // Synchronously auto-select/hydrate the first active node if nothing is selected
                if (!selectedNode && resolvedActiveNodes.length > 0 && hasAutoSelectedRef.current !== currentProjectId) {
                  hasAutoSelectedRef.current = currentProjectId;
                  const defaultNodeId = resolvedActiveNodes[0];
                  const defaultNode = g.nodes.find((n: any) => n.id.toLowerCase() === defaultNodeId.toLowerCase() || normalizeArtistId(n.id) === normalizeArtistId(defaultNodeId));
                  if (defaultNode) {
                    const normId = normalizeArtistId(defaultNode.id);
                    const cachedDetails = detailsCacheRef.current.get(normId) || detailsCacheRef.current.get(defaultNode.id.toLowerCase());
                    if (cachedDetails && cachedDetails.summary && !cachedDetails._isSentinel) {
                      const hydratedNode = {
                        ...defaultNode,
                        bio: cachedDetails.summary,
                        summary: cachedDetails.summary,
                        genre: cachedDetails.details?.genre || "",
                        origin: cachedDetails.details?.origin || "",
                        founded: cachedDetails.details?.founded || "",
                        name: cachedDetails.details?.artist || defaultNode.id,
                        imageUrl: cachedDetails.imageUrl || ""
                      };
                      setSelectedNode(hydratedNode);
                    } else {
                      setSelectedNode(defaultNode);
                    }
                  }
                }
              }

              loadedFromGraphData = true;
            } else {
              console.warn('[ProjectLoader] Project document contains empty graph. Falling back to Phase 1 cache lookup.');
            }
          } catch (e) {
            console.error('[ProjectLoader] Failed to hydrate directly from graphData:', e);
          }
        }

        if (!loadedFromGraphData) {
          const hasEntityIds = (data.artistIds && Array.isArray(data.artistIds) && data.artistIds.length > 0) ||
                               (data.labelIds && Array.isArray(data.labelIds) && data.labelIds.length > 0);
          if (hasEntityIds) {
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
            const isMultiArtistIncoming = (data.artistIds && data.artistIds.length > 1) || (data.seedArtists && data.seedArtists.includes('::'));

            if (isMultiArtistIncoming || hasActiveFiltersIncoming) {
              console.log(`[ProjectLoader] Intercepting Phase 1 loading for complex query. Multi-artist: ${isMultiArtistIncoming}, Filtered: ${hasActiveFiltersIncoming}. Handing over to handleGenerateGraph.`);
              if (data.activeNodes && Array.isArray(data.activeNodes)) {
                let resolvedActiveNodes = data.activeNodes;
                if (resolvedActiveNodes.length <= 1 && data.seedArtists) {
                  const seedList = data.seedArtists.split('::').map((s: string) => normalizeArtistId(s.trim())).filter(Boolean);
                  resolvedActiveNodes = seedList.slice(0, 1); // pass through; handleGenerateGraph will compute graph
                }
                setActiveNodeIds(resolvedActiveNodes);
              }

              handleGenerateGraph(data.seedArtists || (data.artistIds || []).join('::'), false, null, false, false, parsedFilters);
              return true;
            }

            // --- PHASE 1 FORMAT: hydrate from individual per-artist /artists/{id} and /labels/{id} docs ---
            const allLookupIds = Array.from(new Set([
              ...(data.artistIds || []),
              ...(data.labelIds || [])
            ]));
            console.log(`[ProjectLoader] Phase 1 format. Hydrating from entity IDs: [${allLookupIds.join(', ')}]`);
            const { cached, missing } = await readArtistCacheMany(
              allLookupIds,
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
              await batchHydrateDetailsCache(g.nodes, g.links);
              hydratedNodes = g.nodes;

              if (missing.length > 0) {
                console.warn(`[ProjectLoader] ${missing.length} artist doc(s) missing from cache: [${missing.join(', ')}]. They will be re-fetched on next graph generation.`);
              }
            } else {
              console.warn(`[ProjectLoader] All artistIds cache-missed — graph will be empty until regenerated.`);
            }

            if (data.activeNodes && Array.isArray(data.activeNodes)) {
              let resolvedActiveNodes = data.activeNodes;
              const availableEntities = hydratedNodes.map((n: any) => n.id);
              if (resolvedActiveNodes.length <= 1 && availableEntities.length > resolvedActiveNodes.length) {
                 resolvedActiveNodes = availableEntities;
              }
              setActiveNodeIds(resolvedActiveNodes);
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
              await batchHydrateDetailsCache(g.nodes, g.links);
              hydratedNodes = g.nodes;


              if (legacyEntry.detailsCache) {
                try {
                  const newCacheMap = expandDetailsCacheMap(legacyEntry.detailsCache);
                  setDetailsCache((prev) => {
                    if (prev.size !== newCacheMap.size) return newCacheMap;
                    return JSON.stringify(Array.from(prev.entries())) === JSON.stringify(Array.from(newCacheMap.entries())) ? prev : newCacheMap;
                  });
                } catch (e) { console.error("Details cache parse fail", e); }
              }

              if (data.activeNodes && Array.isArray(data.activeNodes)) {
                let resolvedActiveNodes = data.activeNodes;
                const availableEntities = g.nodes.map((n: any) => n.id);
                if (resolvedActiveNodes.length <= 1 && availableEntities.length > resolvedActiveNodes.length) {
                   resolvedActiveNodes = availableEntities;
                }
                setActiveNodeIds(resolvedActiveNodes);
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
                  hydratedNodes = g.nodes;
                    if (data.activeNodes && Array.isArray(data.activeNodes)) {
                      let resolvedActiveNodes = data.activeNodes;
                      const availableEntities = g.nodes.map((n: any) => n.id);
                      if (resolvedActiveNodes.length <= 1 && availableEntities.length > resolvedActiveNodes.length) {
                         resolvedActiveNodes = availableEntities;
                      }
                      setActiveNodeIds(resolvedActiveNodes);
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
            await batchHydrateDetailsCache(g.nodes, g.links);
            hydratedNodes = g.nodes;

            let preHydratedIds: string[] = [];

            if (data.detailsCache) {
              try {
                const newCacheMap = expandDetailsCacheMap(data.detailsCache);
                newCacheMap.forEach((v, k) => {
                  const node = g.nodes.find((n: any) => n.id === k || n.id.toLowerCase() === k.toLowerCase() || normalizeArtistId(n.id) === normalizeArtistId(k));
                  if (node && v.summary && v.summary.trim().length > 5 && !v._isSentinel) {
                     preHydratedIds.push(node.id);
                  }
                });
                setDetailsCache((prev) => {
                  if (prev.size !== newCacheMap.size) return newCacheMap;
                  return JSON.stringify(Array.from(prev.entries())) === JSON.stringify(Array.from(newCacheMap.entries())) ? prev : newCacheMap;
                });
              } catch (e) { console.error("Details cache parse fail", e); }
            }

            if (data.activeNodes && Array.isArray(data.activeNodes)) {
              let resolvedActiveNodes = data.activeNodes;
              const availableEntities = g.nodes.map((n: any) => n.id);
              if (resolvedActiveNodes.length <= 1 && availableEntities.length > resolvedActiveNodes.length) {
                 resolvedActiveNodes = availableEntities;
              }
              setActiveNodeIds(resolvedActiveNodes);
            }

          }
        }

        // Cache completeness check — scoped to seed artists only (not peer-band nodes).
        // Peer bands may have shallow/incomplete docs; only the user's seeded artists
        // should gate the toast. This mirrors the validation scope used by
        // handleGenerateGraph's Front Gate Cache path (validateCacheEntry on seed doc only).
        if (hydratedNodes.length > 0) {
          const seedIds = new Set(
            (data.seedArtists ? data.seedArtists.split('::') : [...(data.artistIds || []), ...(data.labelIds || [])])
              .map((s: string) => normalizeArtistId(s.trim()))
              .filter(Boolean)
          );
          const seedNodes = hydratedNodes.filter((n: any) => seedIds.has(normalizeArtistId(n.id)));
          // Graceful fallback: if no seed IDs matched (old project format), check only the first node
          const nodesToCheck = seedNodes.length > 0 ? seedNodes : hydratedNodes.slice(0, 1);

          let hasIncomplete = false;
          for (const n of nodesToCheck) {
            const details = detailsCacheRef.current.get(n.id) ||
                            detailsCacheRef.current.get(n.id.toLowerCase()) ||
                            detailsCacheRef.current.get(normalizeArtistId(n.id));
            if (details && details.summary && details.summary.trim().length > 5 && checkIsProfileIncomplete(n, details)) {
              hasIncomplete = true;
              break;
            }
          }
          if (hasIncomplete) {
            console.log('[ProjectLoader] Cache incomplete for some seed nodes. Background revalidation queued.');
          } else {
            showCacheToast();
          }
        }
      } catch (err) {
        console.error("Failed to parse project data:", err);
      }

      // Update the last synced payload to prevent the autosave hook from running on load
      const snapPayload = {
        seedArtists: data.seedArtists || '',
        discoveryFilters: typeof data.discoveryFilters === 'string' ? data.discoveryFilters : JSON.stringify(data.discoveryFilters || {}),
        lastViewedStackCount: data.lastViewedStackCount || 0,
        activeNodes: data.activeNodes || [],
        isMagazineViewOpen: false, // Don't rely on saved state for initial mount
        chatHistories: typeof data.chatHistories === 'string' ? data.chatHistories : JSON.stringify(data.chatHistories || []),
        canvasLayout: data.canvasLayout || '[]',
        graphData: data.graphData || '{}'
      };
      lastSyncedDocRef.current = JSON.stringify(snapPayload);

      isProjectLoadingRef.current = false;
      return true; // Found
    };


    const loadProject = async () => {
      try {
        isProjectLoadingRef.current = true;
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
          isProjectLoadingRef.current = false;
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
        isProjectLoadingRef.current = false;
      } catch (err) {
        if (isMounted) {
          console.error(`[ProjectLoader] Failure loading ${currentProjectId}:`, err);
        }
        isProjectLoadingRef.current = false;
      }
    };


    loadProject();

    return () => {
      isMounted = false;
      unsubscribeList.forEach(u => u());
    };
  }, [user, isAuthInitialized, isFirebaseReady, currentProjectId]);

  // Reconnect to active background curation job if page refreshed during curation
  useEffect(() => {
    if (!user || !currentProjectId || !isFirebaseReady || isGuest) return;
    if (projectStatus !== 'curating' || !activeJobId) return;

    console.log(`[Curation Reconnect] Listening to active background job: ${activeJobId}`);
    setIsLoading(true);

    const jobRef = doc(db, 'curationJobs', activeJobId);
    const unsub = onSnapshot(jobRef, async (snap) => {
      const job = snap.data();
      if (!job) return;

      console.log(`[Curation Reconnect] Job ${activeJobId} status updated: ${job.status}`);

      if (job.status === 'completed') {
        setIsLoading(false);
        console.log(`[Curation Reconnect] Job completed. Handled by backend project update.`);
      } else if (job.status === 'failed') {
        setIsLoading(false);
        setError(job.errorMessage || "Backend curation failed.");
        
        let stackSnippet = "";
        if (job.errorDetails && job.errorDetails.stack) {
          stackSnippet = "\\n\\nTrace: " + job.errorDetails.stack.substring(0, 300);
          console.error("[Curation Reconnect] Backend Stack Trace:", job.errorDetails.stack);
        } else if (job.errorDetails && job.errorDetails.rawMessage) {
          stackSnippet = "\\n\\nDetails: " + job.errorDetails.rawMessage;
          console.error("[Curation Reconnect] Backend Raw Error:", job.errorDetails.rawMessage);
        }
        
        showToast(`Curation failed: ${job.errorMessage || "System anomaly"}${stackSnippet}`);
      }
    }, (err) => {
      console.error(`[Curation Reconnect] Failed listening to job ${activeJobId}:`, err);
    });

    return () => unsub();
  }, [user, currentProjectId, isFirebaseReady, isGuest, projectStatus, activeJobId]);

  // Re-hydration Hook: Synchronize frontend UI state with Firestore project status
  useEffect(() => {
    if (!user || !currentProjectId || !isFirebaseReady || isGuest) return;

    if (projectStatus === 'completed') {
      const hasGraphNodes = graphData && graphData.nodes && graphData.nodes.length > 0;
      if (hasGraphNodes) {
        console.log(`[Re-hydration Hook] Project completed with graph. Clearing loading state.`);
        setIsLoading(false);

        // Auto-hydrate the Deep Cut panel on load if nothing is selected
        if (!selectedNode && hasAutoSelectedRef.current !== currentProjectId) {
          hasAutoSelectedRef.current = currentProjectId;
          const seeds = (seedArtists || '').split('::').map(s => s.trim().toLowerCase());
          const firstSeedNode = graphData.nodes.find(n => 
            (n.type === 'artist' || n.type === 'label') && seeds.includes(n.id.toLowerCase())
          );
          const defaultNode = firstSeedNode || graphData.nodes.find(n => n.type === 'artist' || n.type === 'label');
          if (defaultNode) {
            console.log(`[Re-hydration Hook] Auto-selecting seed node for hydration:`, defaultNode.id);
            handleNodeClick(defaultNode);
          }
        }
      } else {
        console.log(`[Re-hydration Hook] Project status is completed but local graphData state is empty. Falling back to curation loading state.`);
        setIsLoading(true);
      }
    } else if (projectStatus === 'curating') {
      console.log(`[Re-hydration Hook] Project status: curating. Ensuring loading spinner is active.`);
      setIsLoading(true);
    } else if (projectStatus === 'failed') {
      console.log(`[Re-hydration Hook] Project status: failed. Clearing loading state.`);
      setIsLoading(false);
    }
  }, [user, currentProjectId, isFirebaseReady, isGuest, projectStatus, graphData, selectedNode, seedArtists, handleNodeClick]);


  // Save Current Project to Firestore (Silent background task)
  useEffect(() => {
    if (!user || !isFirebaseReady || !isAuthInitialized || !currentProjectId || isGuest) return;
    if (!graphData || isProjectLoadingRef.current) return;

    // Build canvas layout and payload for dirty comparison
    const canvasLayout = graphData.nodes
      .filter(n => n.type === 'artist' || n.type === 'label')
      .map(n => ({ nodeId: n.id, x: n.x, y: n.y, fx: n.fx ?? null, fy: n.fy ?? null }));

    const currentPayload = {
      seedArtists,
      discoveryFilters: JSON.stringify(discoveryFilters),
      lastViewedStackCount,
      activeNodes: activeNodes.map(n => n.id),
      isMagazineViewOpen: isMagazineViewOpen && activeNodes.length > 0,
      chatHistories: JSON.stringify(Array.from(chatHistories.entries())),
      canvasLayout: JSON.stringify(canvasLayout),
      graphData: JSON.stringify(graphData)
    };

    if (lastSyncedDocRef.current && JSON.stringify(currentPayload) === lastSyncedDocRef.current) {
      console.log('[Autosave] Skipping write: local state is identical to last synced Firestore state');
      return;
    }

    const timer = setTimeout(async () => {
      const projectPath = `users/${user.uid}/projects/${currentProjectId}`;
      try {
        isHydratingSessionRef.current = true;

        console.log(`[Database Reporter] Attempting PROJECT SAVE | Path: ${projectPath}`);
        
        const docPayload: Record<string, any> = {
          seedArtists,
          discoveryFilters: JSON.stringify(discoveryFilters),
          lastViewedStackCount,
          activeNodes: activeNodes.map(n => n.id),
          isMagazineViewOpen: isMagazineViewOpen && activeNodes.length > 0,
          chatHistories: JSON.stringify(Array.from(chatHistories.entries())),
          authorId: user.uid,
          supportsLabelDeepCuts: supportsLabelDeepCuts,
          schemaVersion: supportsLabelDeepCuts ? 2 : 1,
          updatedAt: serverTimestamp(),
        };

        const hasGraphNodes = graphData && graphData.nodes && graphData.nodes.length > 0;
        if (hasGraphNodes && projectStatus !== 'curating') {
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
              .map((n: any) => normalizeArtistId(n.id));
            const currentLabelList = graphData.nodes
              .filter((n: any) => n.type === 'label')
              .map((n: any) => normalizeArtistId(n.id));

            if (currentArtistList.length > 0 || currentLabelList.length > 0) {
              docPayload.artistIds = currentArtistList;
              docPayload.labelIds = currentLabelList;
              docPayload.canvasLayout = JSON.stringify(canvasLayout);
              docPayload.graphData = JSON.stringify(graphData);
            } else {
              // No artists present yet — fall back to full blob (should be rare)
              docPayload.graphData = JSON.stringify(graphData);
            }
          }
        }

        // Sync project state to Firestore
        await setDoc(doc(db, projectPath), docPayload, { merge: true });
        console.log(`[Database Reporter] SUCCESS: Project synced.`);

        // Update the last synced payload ref
        let updatedPayload = currentPayload;
        try {
          if (lastSyncedDocRef.current) {
            const parsed = JSON.parse(lastSyncedDocRef.current);
            updatedPayload = {
              ...parsed,
              ...currentPayload
            };
            if (!docPayload.graphData) {
              updatedPayload.graphData = parsed.graphData;
              updatedPayload.canvasLayout = parsed.canvasLayout;
            }
          }
        } catch (e) {}
        lastSyncedDocRef.current = JSON.stringify(updatedPayload);

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
                isProjectLoadingRef.current = true;
                setGraphData({ nodes: [], links: [] });
                setActiveNodeIds([]);
                setDetailsCache(new Map());
                setChatHistories(new Map());
                setCurrentCacheKey(null);
                
                const localProj = projects.find(p => p.id === projectId);
                if (localProj) {
                  console.log(`[Router] Pre-populating context for project ${projectId} from dashboard data:`, localProj.seedArtists);
                  setSeedArtists(localProj.seedArtists || localProj.name || '');
                  setProjectName(localProj.name || '');
                  setProjectStatus(localProj.status || null);
                  setActiveJobId(localProj.activeJobId || null);
                  if (localProj.status === 'curating') {
                    setIsLoading(true);
                  }
                } else {
                  setSeedArtists('');
                  setProjectName('');
                  setProjectStatus(null);
                  setActiveJobId(null);
                }
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
            const g = normalizeGraphData(typeof data.graphData === 'string' ? JSON.parse(data.graphData) : data.graphData);
            g.links = g.links.map((l: any) => ({
              ...l,
              source: typeof l.source === 'string' ? l.source : l.source.id,
              target: typeof l.target === 'string' ? l.target : l.target.id
            }));
            g.nodes.forEach((n: any) => { n.fx = null; n.fy = null; });

            setGraphData(g);
            setSeedArtists(data.seedArtists);
            if (data.detailsCache) setDetailsCache(expandDetailsCacheMap(data.detailsCache));
            await batchHydrateDetailsCache(g.nodes, g.links);
            if (data.activeNodes && Array.isArray(data.activeNodes)) {
              setActiveNodeIds(data.activeNodes);
            }
            showToast("Zcene Imported");
          } else {
            setError("Shared Zcene not found.");
          }
        } catch (err: any) {
          console.error("Import failed:", err);
          setError("This shared link appears to be broken or corrupted.");
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
  }, [handleGenerateGraph, seedArtists, isLoading, graphData, handleNodeClick, isAuthInitialized, user, isFirebaseReady, showToast, isAdmin, navigate, projects]);

  const handleCloseNode = useCallback((nodeId: string) => {
    setActiveNodeIds(prev => {
      const idx = prev.findIndex(id => id.toLowerCase() === nodeId.toLowerCase());
      if (idx === -1) return prev;
      const next = prev.filter((_, i) => i !== idx);
      if (selectedNode?.id.toLowerCase() === nodeId.toLowerCase()) {
        const remaining = activeNodes.filter(n => n.id.toLowerCase() !== nodeId.toLowerCase());
        setSelectedNode(remaining.length ? remaining[Math.min(idx, remaining.length - 1)] : null);
      }
      return next;
    });
  }, [selectedNode, activeNodes]);

  const handleRefreshNode = useCallback(async (nodeId: string) => {
    // ── Token Quota Gate ───────────────────────────────────────────────────────
    // Must run BEFORE any cache eviction or Firestore deletion.
    // If the curator cancels, the profile is left untouched and no AI call fires.
    const confirmed = await confirmTokenUsage('data_quality_optimization', [], [titleCaseArtistId(nodeId)]);
    if (!confirmed) return;
    // ──────────────────────────────────────────────────────────────────────────

    const cacheId = normalizeArtistId(nodeId);

    // 1. Evict from local state immediately to show loading spinner
    setDetailsCache(prev => { 
        const n = new Map(prev); 
        n.delete(nodeId); 
        n.delete(nodeId.toLowerCase());
        n.delete(cacheId);
        return n; 
    });

    detailsCacheRef.current.delete(nodeId);
    detailsCacheRef.current.delete(nodeId.toLowerCase());
    detailsCacheRef.current.delete(cacheId);

    healedDetailsCacheRef.current.delete(nodeId);
    healedDetailsCacheRef.current.delete(nodeId.toLowerCase());
    healedDetailsCacheRef.current.delete(cacheId);

    // 2. Clear bio/details from selectedNode so that the details queue runs and does not hit hasHydratedBio
    setSelectedNode(prev => {
      if (prev && (normalizeArtistId(prev.id) === cacheId || prev.id.toLowerCase() === nodeId.toLowerCase())) {
        return {
          ...prev,
          bio: undefined,
          summary: undefined,
          genre: undefined,
          origin: undefined,
          founded: undefined
        };
      }
      return prev;
    });

    // 3. Mark as evicted so the details queue skips cache lookup
    evictedNodeIdsRef.current.add(nodeId);
    evictedNodeIdsRef.current.add(nodeId.toLowerCase());
    evictedNodeIdsRef.current.add(cacheId);

    // 4. Trigger spinner immediately
    setLoadingNodeIds(prev => new Set(prev).add(nodeId));

    // 5. Evict from global Firestore cache
    deleteDoc(doc(db, 'artists', cacheId))
      .then(() => console.log(`[Cache Eviction] Deleted Firestore cache for: ${cacheId}`))
      .catch((error: any) => {
        console.warn("[Cache Eviction] deleteDoc failed, invalidating in-place:", error.message);
        updateDoc(doc(db, 'artists', cacheId), {
            detailsCache: null,
            cachedAt: serverTimestamp()
        }).then(() => console.log(`[Cache Eviction] Fallback: Invalidated stale record in-place for: ${cacheId}`))
          .catch((fallbackError: any) => {
            console.error(`[Cache Eviction] Fallback updateDoc also failed for ${nodeId}:`, fallbackError);
          });
      });
  }, [confirmTokenUsage]);
  const handleExtendNode = useCallback(async (node: Node) => {
    if (!graphData) return;

    const artistDisplayName = node.label || titleCaseArtistId(node.id);
    const exploreConfirmed = await confirmExploreAction(artistDisplayName);
    if (!exploreConfirmed) return;

    // Restoring Immersive Discovery Flow: Bypass the cache check on node expansions
    // to force open the Cost Dialogue and dispatch a live API call upon user confirmation.

    const confirmed = await confirmTokenUsage('extension', [], [artistDisplayName]);
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
        ...prev,
        nodes: [...prev.nodes, loadingNode],
        links: [...prev.links, { source: node.id, target: loadingNodeId, value: 1 }]
      };
    });

    try {
      const extension = await extendGraphFromNode(node, graphData);

      // Identify newly discovered artists and labels in the extension
      const discoveredArtistNodes = extension.nodes.filter(n => n.type === 'artist' || n.type === 'label');
      const discoveredArtistNames = discoveredArtistNodes.map(n => n.id);

      const filteredNodes = graphData.nodes.filter(n => n.id !== loadingNodeId);
      const filteredLinks = graphData.links.filter(l => {
        const s = typeof l.source === 'string' ? l.source : (l.source as Node).id;
        const t = typeof l.target === 'string' ? l.target : (l.target as Node).id;
        return s !== loadingNodeId && t !== loadingNodeId;
      });

      const baseGraph = { nodes: filteredNodes, links: filteredLinks, synthesisRationale: graphData.synthesisRationale };
      const mergedGraph = mergeGraphData(baseGraph, extension);

      // Double-Write to Global Cache: Await global cache writes before updating canvas graphData state.
      // This prevents the project canvas auto-save from racing ahead before the cache entries exist.
      if (discoveredArtistNames.length > 0) {
        showToast("Saving new discoveries to global cache...");
        try {
          const combinedDetailsMap = new Map([
            ...detailsCacheRef.current,
            ...healedDetailsCacheRef.current,
            ...detailsCache
          ]);
          const allEntityNamesToCache = Array.from(new Set([...discoveredArtistNames, ...mergedGraph.nodes.filter(n => n.type === 'artist' || n.type === 'label').map(n => n.label || n.id)]));
          await writeArtistCacheMany(allEntityNamesToCache, mergedGraph, user?.uid, discoveryFilters, true, false, combinedDetailsMap, discoveredArtistNames);
          console.log(`[Node Extension] Global cache double-write confirmed for: ${allEntityNamesToCache.join(', ')}`);
        } catch (e) {
          console.error('[Node Extension] Global cache double-write failed:', e);
        }
      }

      setGraphData(mergedGraph);

      // Show toast for the new discovery
      const newArtist = extension.nodes.find(n => n.type === 'artist' || n.type === 'label');
      if (newArtist) {
        showToast(`Discovered ${newArtist.id}`);
      }

    } catch (err: any) {
      setError(humanizeError(err));
      // Cleanup loading node on error
      setGraphData(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          nodes: prev.nodes.filter(n => n.id !== loadingNodeId),
          links: prev.links.filter(l => {
            const s = typeof l.source === 'string' ? l.source : (l.source as Node).id;
            const t = typeof l.target === 'string' ? l.target : (l.target as Node).id;
            return s !== loadingNodeId && t !== loadingNodeId;
          })
        };
      });
    }
  }, [graphData, seedArtists, user, discoveryFilters, showToast, humanizeError, confirmExploreAction, confirmTokenUsage]);

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

      return { ...prev, nodes: filteredNodes, links: filteredLinks };
    });

    if (selectedNode?.id === node.id) {
      setSelectedNode(null);
    }

    showToast(`Removed ${node.label || node.id}`);
  }, [selectedNode, showToast]);

  const incrementDeepCutsOpenedCount = useCallback(async () => {
    const isLocal = typeof window !== 'undefined' && 
      (window.location.hostname === 'localhost' || 
       window.location.hostname === '127.0.0.1' ||
       window.location.port === '3000');
    
    const shouldMock = (import.meta.env.VITE_USE_MOCKS === 'true') || (import.meta.env.VITE_USE_MOCKS !== 'false' && (isLocal || import.meta.env.DEV));
    if (shouldMock) {
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
    
    const shouldMock = (import.meta.env.VITE_USE_MOCKS === 'true') || (import.meta.env.VITE_USE_MOCKS !== 'false' && (isLocal || import.meta.env.DEV));
    if (shouldMock) {
      console.log("[Revalidation] Sandbox Mode: Suppressed background refresh for: " + node.id);
      return;
    }

    console.log("[Revalidation] Silently refreshing stale cache in background for: " + node.id);
    try {
      const freshDetails = await fetchNodeDetails(node, graphData, seedArtists, urlOriginHint);
      
      // JIT Playability Check
      if (freshDetails && freshDetails.youtubeVideoId) {
        const playable = await checkVideoPlayabilityOnServer(freshDetails.youtubeVideoId);
        if (!playable) {
          console.warn(`[Revalidation] Pruned unplayable video ID JIT on client: ${freshDetails.youtubeVideoId}`);
          freshDetails.youtubeVideoId = null;
        }
      }
      
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
      const updatePayload = {
        detailsCache: freshDetails,
        cachedAt: serverTimestamp()
      };
      enforceArtistCacheSchema(updatePayload);

      // Resolve target snapshot via redirect before updating to avoid overwriting bare root alias docs
      const collName = node.type === 'label' ? 'labels' : 'artists';
      const targetSnap = await getEntityDocWithRedirect(cacheId, node.type === 'label' ? 'label' : 'artist');
      const targetDocId = targetSnap.exists() ? targetSnap.id : cacheId;
      await updateDoc(doc(db, collName, targetDocId), stripUndefinedProperties(updatePayload));
      console.log("[Revalidation] Successfully updated stale cache in Firestore for: " + targetDocId);
    } catch (e: any) {
      console.warn("[Revalidation] Background refresh failed for: " + cacheId, e.message);
    }
  }, [graphData, seedArtists, urlOriginHint]);

  // Watchdog to prevent stuck queue
  useEffect(() => {
    const checkStuck = setInterval(() => {
      if (isFetchingDetailsRef.current && (Date.now() - lastProgressTimestampRef.current > 60000)) {
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
    if (isLoading || isProjectLoadingRef.current) return;
    const fetch = async () => {
      // 1. Block Automated Background Fetches: ✦
      // ONLY process the actively selected node to prevent neighbor chain-fetching
      const candidateNodes = (graphData?.nodes || []).filter(n => 
        (n.type === 'artist' || n.type === 'label' || n.type === 'genre') && (
          activeNodeIds.some(id => n.id.toLowerCase() === id.toLowerCase() || normalizeArtistId(n.id) === normalizeArtistId(id) || (n.type === 'artist' && isArtistIdMatch(n.id, id))) ||
          (selectedNode && (n.id.toLowerCase() === selectedNode.id.toLowerCase() || normalizeArtistId(n.id) === normalizeArtistId(selectedNode.id) || (n.type === 'artist' && selectedNode.type === 'artist' && isArtistIdMatch(n.id, selectedNode.id))))
        )
      );

      const nodes = candidateNodes.filter(n => {
        const isSelected = selectedNode && (normalizeArtistId(selectedNode.id) === normalizeArtistId(n.id) || (selectedNode.type === 'artist' && n.type === 'artist' && isArtistIdMatch(n.id, selectedNode.id)));
        const simpleId = normalizeArtistId(n.id);
        let disambiguatedCacheId = simpleId;
        let connectedCountries: string[] = [];

        if (graphData) {
          connectedCountries = graphData.links
            .filter((l: any) => {
              const sId = typeof l.source === 'string' ? l.source : l.source.id;
              const tId = typeof l.target === 'string' ? l.target : l.target.id;
              return sId.toLowerCase() === n.id.toLowerCase() || tId.toLowerCase() === n.id.toLowerCase();
            })
            .map((l: any) => {
              const sId = typeof l.source === 'string' ? l.source : l.source.id;
              const tId = typeof l.target === 'string' ? l.target : l.target.id;
              const otherId = sId.toLowerCase() === n.id.toLowerCase() ? tId : sId;
              return graphData.nodes.find((no: any) => no.id.toLowerCase() === otherId.toLowerCase());
            })
            .filter((no: any) => no && no.type === 'country')
            .map((no: any) => no.label || no.id);
            
          if (connectedCountries.length > 0) {
            const countryNorm = normalizeArtistId(connectedCountries[0]);
            if (countryNorm) disambiguatedCacheId = simpleId.endsWith(`-${countryNorm}`) ? simpleId : `${simpleId}-${countryNorm}`;
          }
        }

        // Context Check for simpleId details: if it is in cache, verify if its origin conflicts with connected countries
        const simpleDetails = detailsCache.get(simpleId) || detailsCache.get(n.id.toLowerCase());
        const simpleOrigin = simpleDetails?.details?.origin || (simpleDetails as any)?.origin || '';
        let isSimpleKeyMismatched = false;
        if (simpleDetails && connectedCountries.length > 0) {
          isSimpleKeyMismatched = !connectedCountries.some((c: string) => {
            const normC = c.toLowerCase().trim();
            const normO = simpleOrigin.toLowerCase().trim();
            return normO.includes(normC) || normC.includes(normO);
          });
        }

        // If the selected node has already been hydrated with bio text from the local cache, 
        // DO NOT fetch again, unless the biography has an origin mismatch.
        const selectedOrigin = (selectedNode as any)?.origin || (selectedNode as any)?.details?.origin || '';
        let isSelectedMismatched = false;
        if (isSelected && selectedNode && connectedCountries.length > 0) {
          isSelectedMismatched = !connectedCountries.some((c: string) => {
            const normC = c.toLowerCase().trim();
            const normO = selectedOrigin.toLowerCase().trim();
            return normO.includes(normC) || normC.includes(normO);
          });
        }

        const cachedDetails = detailsCache.get(disambiguatedCacheId) || 
                              detailsCache.get(simpleId) || 
                              detailsCache.get(n.id.toLowerCase());

        const isLocked = !!(cachedDetails && cachedDetails.summary && cachedDetails.summary.trim().length > 5 && !cachedDetails._isSentinel);

        const isCorruptOrStale = checkIsProfileStaleOrCorrupt(cachedDetails) &&
                                 !healedNodeIdsRef.current.has(simpleId) &&
                                 !healedNodeIdsRef.current.has(disambiguatedCacheId) &&
                                 !healedNodeIdsRef.current.has(n.id.toLowerCase());

        const hasHydratedBio = isSelected && 
                               (selectedNode as any)?.bio && 
                               (selectedNode as any).bio.length > 5 && 
                               !isSelectedMismatched;

        const isCached = (detailsCache.has(simpleId) && !isSimpleKeyMismatched) || 
                         detailsCache.has(disambiguatedCacheId) || 
                         (detailsCache.has(n.id.toLowerCase()) && !isSimpleKeyMismatched);

        return !isLocked &&
               (!isCached || isCorruptOrStale) && 
               !fetchingNodeIdsRef.current.has(n.id) &&
               isSelected &&
               (!hasHydratedBio || isCorruptOrStale);
      });
      
      if (!nodes.length || isFetchingDetailsRef.current) return;
      isFetchingDetailsRef.current = true;
      lastProgressTimestampRef.current = Date.now();

      try {
        for (const node of nodes) {
          const simpleId = normalizeArtistId(node.id);
          
          // Find connected countries in the graph links
          const connectedCountries = graphData.links
            .filter((l: any) => {
              const sId = typeof l.source === 'string' ? l.source : l.source.id;
              const tId = typeof l.target === 'string' ? l.target : l.target.id;
              return sId.toLowerCase() === node.id.toLowerCase() || tId.toLowerCase() === node.id.toLowerCase();
            })
            .map((l: any) => {
              const sId = typeof l.source === 'string' ? l.source : l.source.id;
              const tId = typeof l.target === 'string' ? l.target : l.target.id;
              const otherId = sId.toLowerCase() === node.id.toLowerCase() ? tId : sId;
              return graphData.nodes.find((no: any) => no.id.toLowerCase() === otherId.toLowerCase());
            })
            .filter((no: any) => no && no.type === 'country')
            .map((no: any) => no.label || no.id);

          let disambiguatedCacheId = simpleId;
          if (connectedCountries.length > 0) {
            const countryNorm = normalizeArtistId(connectedCountries[0]);
            if (countryNorm) disambiguatedCacheId = simpleId.endsWith(`-${countryNorm}`) ? simpleId : `${simpleId}-${countryNorm}`;
          }

          const cachedVal = detailsCache.get(disambiguatedCacheId) || detailsCache.get(node.id) || detailsCache.get(node.id.toLowerCase());
          const wasDisplayable = !!(cachedVal && cachedVal.summary && cachedVal.summary.length > 5 && !cachedVal._isSentinel);
          const isCorruptOrStale = checkIsProfileStaleOrCorrupt(cachedVal) &&
                                   !healedNodeIdsRef.current.has(simpleId) &&
                                   !healedNodeIdsRef.current.has(disambiguatedCacheId) &&
                                   !healedNodeIdsRef.current.has(node.id.toLowerCase());
          const isCached = detailsCache.has(node.id) || detailsCache.has(node.id.toLowerCase()) || detailsCache.has(disambiguatedCacheId);

          if (isCached && !isCorruptOrStale) continue;
          if (fetchingNodeIdsRef.current.has(node.id)) continue;

          fetchingNodeIdsRef.current.add(node.id);
          fetchingNodeIdsRef.current.add(node.id.toLowerCase());
          fetchingNodeIdsRef.current.add(disambiguatedCacheId);
          fetchingNodeIdsRef.current.add(simpleId);

          if (isCorruptOrStale) {
            healedNodeIdsRef.current.add(simpleId);
            healedNodeIdsRef.current.add(disambiguatedCacheId);
            healedNodeIdsRef.current.add(node.id.toLowerCase());
            healedNodeIdsRef.current.add(node.id);
          }

          // Silent background self-healing: DO NOT show a spinner if the user already has cached data or it was displayable
          if (!isCached && !wasDisplayable) {
            setLoadingNodeIds(prev => new Set(prev).add(node.id));
          }
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
                                  evictedNodeIdsRef.current.has(simpleId) ||
                                  evictedNodeIdsRef.current.has(disambiguatedCacheId);
                if (!isEvicted) {
                  try {
                    let cacheId = disambiguatedCacheId;
                    let cacheDoc = await getEntityDocWithRedirect(cacheId, node.type === 'label' ? 'label' : 'artist');
                    
                    if (!cacheDoc.exists() && cacheId !== simpleId) {
                      // Try simple ID fallback
                      const fallbackSnap = await getEntityDocWithRedirect(simpleId, node.type === 'label' ? 'label' : 'artist');
                      if (fallbackSnap.exists()) {
                        const data = fallbackSnap.data();
                        if (data && data.detailsCache && validateNodeDetailsContent(data.detailsCache)) {
                          const parsed = parseDetailsCacheSafely(data.detailsCache);
                          const cachedOrigin = parsed?.details?.origin || parsed?.origin || '';
                          const hasMismatch = connectedCountries.length > 0 && 
                            !connectedCountries.some((c: string) => {
                              const normC = c.toLowerCase().trim();
                              const normO = cachedOrigin.toLowerCase().trim();
                              return normO.includes(normC) || normC.includes(normO);
                            });
                          if (!hasMismatch) {
                            cacheDoc = fallbackSnap;
                            cacheId = simpleId;
                          }
                        }
                      }
                    }
                    
                    if (cacheDoc.exists()) {
                       const data = cacheDoc.data();
                      if (data) {
                         isStale = isCacheExpired(data.cachedAt) || !validateNodeDetailsContent(data.detailsCache);
                      }
                      if (data && data.detailsCache && validateNodeDetailsContent(data.detailsCache)) {
                         try {
                             const parsed = parseDetailsCacheSafely(data.detailsCache);
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
                               const tourDates = parsed.tourDates || [];
                               const tourCachedAt = parsed.tourCachedAt || "";

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
                                  groundingLinks,
                                  tourDates,
                                  tourCachedAt,
                                  synthesisRationale: data.synthesisRationale || parsed.synthesisRationale || ""
                                };
                               console.log("[Global Cache] Fallback successful for:", node.id);
                             }
                         } catch(e) { console.warn("Failed parsing global detailsCache", e); }
                      }
                   }
                } catch (e) { console.warn("[Global Cache] Fallback read failed", e); }
                }

                let details: NodeDetails;
                if (fallbackDetails && !checkIsProfileStaleOrCorrupt(fallbackDetails)) {
                   details = fallbackDetails;
                   if (isStale) {
                     triggerBackgroundRevalidation(node, disambiguatedCacheId);
                   }
                } else {
                   if (fallbackDetails) {
                     console.log(`[Queue] Node ${node.id} cache entry is corrupt or sentinel. Triggering background revalidation...`);
                     triggerBackgroundRevalidation(node, disambiguatedCacheId);
                   } else {
                     console.log(`[Queue] Node ${node.id} requires synthesis. The background queue does not perform automated live synthesis. Skipping API fetch.`);
                   }
                   fetchingNodeIdsRef.current.delete(node.id);
                   fetchingNodeIdsRef.current.delete(node.id.toLowerCase());
                   fetchingNodeIdsRef.current.delete(disambiguatedCacheId);
                   fetchingNodeIdsRef.current.delete(simpleId);
                   setLoadingNodeIds(prev => { const next = new Set(prev); next.delete(node.id); return next; });
                   continue;
                   
                   // Individual node timeout (45s) to prevent the whole queue from hanging
                   const nodeDetailsPromise = fetchNodeDetails(node, graphData, seedArtists, urlOriginHint);
                   const timeoutPromise = new Promise((_, reject) =>
                     setTimeout(() => reject(new Error("Request timed out after 45s")), 45000)
                   );
                   details = await Promise.race([nodeDetailsPromise, timeoutPromise]) as NodeDetails;

                    // Dedicated Scraper Hook to override metadata prompt lookup
                    try {
                      const artistDisplay = details.details?.artist || node.label || titleCaseArtistId(node.id);
                      console.log(`[Scraper Hook] Fetching video ID for ${artistDisplay} from scraper...`);
                      const scrapeRes = await window.fetch('/api/artist/scrape-video-id', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          artistName: artistDisplay,
                          artistId: normalizeArtistId(node.id)
                        })
                      });
                      if (scrapeRes.ok) {
                        const scrapeData = await scrapeRes.json();
                        if (scrapeData.youtubeVideoId) {
                          console.log(`[Scraper Hook] Scraper returned video ID: ${scrapeData.youtubeVideoId}`);
                          details.youtubeVideoId = scrapeData.youtubeVideoId;
                        } else {
                          console.log(`[Scraper Hook] Scraper returned null`);
                          details.youtubeVideoId = null;
                        }
                      } else {
                        console.warn('[Scraper Hook] Scraper API returned error status:', scrapeRes.status);
                        details.youtubeVideoId = null;
                      }
                    } catch (scrapeErr) {
                      console.error('[Scraper Hook] Scraper API dispatch failed:', scrapeErr);
                      details.youtubeVideoId = null;
                    }

                   // JIT Playability Check
                   if (details && details.youtubeVideoId) {
                     const playable = await checkVideoPlayabilityOnServer(details.youtubeVideoId);
                     if (!playable) {
                       console.warn(`[Deep Cut Queue] Pruned unplayable video ID JIT on client: ${details.youtubeVideoId}`);
                       details.youtubeVideoId = null;
                     }
                   }
                }

                if (details) {
                  if (!details.details) {
                    details.details = { genre: "", origin: "", founded: "", notableArtists: [] };
                  }
                  details.details.artist = details.details.artist || node.label || titleCaseArtistId(node.id);
                  if (!details.synthesisRationale) {
                    details.synthesisRationale = `[Single-Seed Analysis]\n- Acoustic & Sonics: Resolved core musical properties and stylistic lineage.\n- Scene Context: Mapped direct influences, record label history, and geographic background.\n- Overlap Insights: Unified structural connections and surrounding chronological relationships.`;
                  }
                }

                healedDetailsCacheRef.current.set(node.id, details);
                healedDetailsCacheRef.current.set(node.id.toLowerCase(), details);
                healedDetailsCacheRef.current.set(simpleId, details);
                if (disambiguatedCacheId !== simpleId) {
                  healedDetailsCacheRef.current.set(disambiguatedCacheId, details);
                }



                setDetailsCache(prev => {
                  const updated = new Map(prev);
                  updated.set(node.id, details);
                  updated.set(node.id.toLowerCase(), details);
                  updated.set(simpleId, details);
                  if (disambiguatedCacheId !== simpleId) {
                    updated.set(disambiguatedCacheId, details);
                  }
                  return updated;
                });
                
                evictedNodeIdsRef.current.delete(node.id);
                evictedNodeIdsRef.current.delete(node.id.toLowerCase());
                evictedNodeIdsRef.current.delete(simpleId);
                evictedNodeIdsRef.current.delete(disambiguatedCacheId);

                incrementDeepCutsOpenedCount();

                // Fix 3: Race-safe details write-back.
                // Previously guarded by `if (!fallbackDetails)`, which caused the write to be skipped
                // entirely when the queue read a stale-but-undeletable document (delete is admin-only).
                // Fix: always attempt updateDoc when the doc exists, so cachedAt is refreshed
                // regardless of whether the data came from a live Gemini call or the Firestore fallback.
                // JIT creation (setDoc) is only attempted when the document does not yet exist.
                {
                  const cacheId = disambiguatedCacheId;
                  try {
                    const existingSnap = await getArtistDocWithRedirect(cacheId);
                    
                    const canonicalNameFromDetails = details.details?.artist;
                    
                    const freshCountries = connectedCountries.length > 0 
                      ? connectedCountries 
                      : (details.details?.origin ? [details.details.origin] : []);
                    let canonicalId = canonicalNameFromDetails ? normalizeArtistId(canonicalNameFromDetails) : simpleId;
                    if (freshCountries.length > 0) {
                      const countryNorm = normalizeArtistId(freshCountries[0]);
                      if (countryNorm) canonicalId = canonicalId.endsWith(`-${countryNorm}`) ? canonicalId : `${canonicalId}-${countryNorm}`;
                    }
                    const isAlias = canonicalId !== cacheId;

                    if (isAlias) {
                      const canonicalName = canonicalNameFromDetails || canonicalId;
                      
                      // 1. Mutate seedArtists
                      setSeedArtists(prev => {
                        const seeds = prev.split('::').map(s => {
                          if (normalizeArtistId(s) === cacheId) return canonicalName;
                          return s;
                        });
                        return seeds.join('::');
                      });

                      // 2. Mutate graphData
                      setGraphData(prev => {
                        if (!prev) return prev;
                        return mutateGraphArtistId(prev, node.id, canonicalId, canonicalName);
                      });

                      // 3. Mutate activeNodeIds
                      setActiveNodeIds(prev => {
                        return prev.map(id => {
                          if (normalizeArtistId(id) === cacheId) {
                            return canonicalId;
                          }
                          return id;
                        });
                      });

                    }

                    // 4. Mutate selectedNode (always run to ensure fresh metadata is painted to the active sidebar)
                    setSelectedNode(prev => {
                      if (prev && (normalizeArtistId(prev.id) === simpleId || prev.id.toLowerCase() === node.id.toLowerCase())) {
                        return {
                          ...prev,
                          bio: details.summary,
                          summary: details.summary,
                          genre: details.details?.genre || "",
                          origin: details.details?.origin || "",
                          founded: details.details?.founded || "",
                        };
                      }
                      return prev;
                    });

                    const simpleArtistId = normalizeArtistId(node.id);

                    let targetDocId = cacheId;
                    let docExists = existingSnap.exists();

                    const collName = node.type === 'label' ? 'labels' : 'artists';
                    // If we have a disambiguated ID (e.g. "needtobreathe-united-states"), we should check if
                    // there is an existing legacy or simple record at "needtobreathe" and merge it.
                    if (cacheId !== simpleArtistId) {
                      try {
                        const simpleDocRef = doc(db, collName, simpleArtistId);
                        const simpleSnap = await getDoc(simpleDocRef);
                        if (simpleSnap.exists()) {
                          const simpleData = simpleSnap.data();
                          if (simpleData && !simpleData.redirectTo) {
                            console.log(`[Reconciliation] Found legacy base document for "${simpleArtistId}". Merging into "${cacheId}".`);
                            // Merge detailsCache from base doc if we don't have fallbackDetails already
                            if (simpleData.detailsCache && !fallbackDetails) {
                              try {
                                const parsed = parseDetailsCacheSafely(simpleData.detailsCache);
                                if (parsed && (parsed.bio || parsed.summary)) {
                                  fallbackDetails = {
                                    summary: parsed.summary || parsed.bio || "",
                                    imageUrl: parsed.imageUrl || "",
                                    details: parsed.details || { genre: "", origin: "", founded: "", notableArtists: [] },
                                    members: parsed.members || [],
                                    links: parsed.links || [],
                                    discography: parsed.discography || [],
                                    tourInfo: parsed.tourInfo || "",
                                    recommendationReason: parsed.recommendationReason || "",
                                    groundingLinks: parsed.groundingLinks || [],
                                    tourDates: parsed.tourDates || [],
                                    tourCachedAt: parsed.tourCachedAt || ""
                                  };
                                  details = fallbackDetails;
                                  console.log(`[Reconciliation] Merging detailsCache from legacy base doc.`);
                                }
                              } catch (pe) {
                                console.warn("Failed parsing legacy detailsCache during merge", pe);
                              }
                            }
                            
                            // Convert the base document into a redirect to the disambiguated document
                            await setDoc(simpleDocRef, stripUndefinedProperties({
                              artistId: simpleArtistId,
                              cacheKey: simpleArtistId,
                              redirectTo: cacheId,
                              cacheVersion: 4,
                              cachedAt: serverTimestamp()
                            }));
                            console.log(`[Reconciliation] Converted base document "${simpleArtistId}" into a redirect to "${cacheId}".`);
                          }
                        }
                      } catch (err) {
                        console.warn("[Reconciliation] Failed base document check/migration:", err);
                      }
                    }

                    if (docExists) {
                      const updatePayload = {
                        detailsCache: details,
                        cachedAt: serverTimestamp(),
                        synthesisRationale: details.synthesisRationale || null
                      };
                      enforceArtistCacheSchema(updatePayload);
                      await updateDoc(doc(db, collName, targetDocId), stripUndefinedProperties(updatePayload));
                      console.log(`[Deep Cut Queue] Write-back: Successfully updated detailsCache + cachedAt for: ${targetDocId}`);
                    } else if (!fallbackDetails) {
                      const normalizedGraph = normalizeGraphData(graphData);
                      const canonicalNode = normalizedGraph.nodes.find(
                        n => (n.type === 'artist' || n.type === 'label') && (n.id.trim().toLowerCase() === node.id.trim().toLowerCase() || normalizeArtistId(n.id) === targetDocId)
                      );
                      const canonicalName = canonicalNode?.label ?? canonicalNode?.id ?? node.id;

                      const setPayload = {
                        cacheKey: targetDocId,
                        artistId: simpleArtistId,
                        seedArtists: canonicalNameFromDetails || canonicalName,
                        graphData: JSON.stringify(normalizedGraph),
                        filters: discoveryFiltersRef.current || {},
                        cacheVersion: 4,
                        cachedAt: serverTimestamp(),
                        hitCount: 0,
                        isDeep: true,
                        detailsCache: details,
                        synthesisRationale: details.synthesisRationale || null
                      };
                      enforceArtistCacheSchema(setPayload);
                      await setDoc(doc(db, collName, targetDocId), stripUndefinedProperties(setPayload));
                      console.log(`[Deep Cut Queue] JIT cached Canonical node (full context): ${targetDocId}`);
                    }
                      
                    if (isAlias) {
                      const aliasDocRef = doc(db, collName, cacheId);
                      await setDoc(aliasDocRef, stripUndefinedProperties({
                        cacheKey: cacheId,
                        artistId: cacheId,
                        redirectTo: canonicalId,
                        cacheVersion: 4,
                        cachedAt: serverTimestamp()
                      }));
                      console.log(`[Deep Cut Queue] Created Alias Redirect: ${cacheId} -> ${canonicalId}`);
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

                if (wasDisplayable) {
                  console.warn(`[Deep Cut Queue] Silent background revalidation failed for displayable node ${node.id}. Keeping cached data.`, err);
                  success = true;
                  break;
                }

                if (isRate && retries < max - 1) {
                  retries++;
                  await wait(Math.pow(2, retries) * 1000 + Math.random() * 1000);
                } else if (isTimeout && retries < max - 1) {
                  retries++;
                  console.warn(`[Deep Cut Queue] Node ${node.id} timed out. Retry ${retries}/${max}`);
                  await wait(1000);
                } else {
                  console.error(`[Deep Cut Queue] Failed for node ${node.id}:`, err);

                  // [Sentinel Write] ✦
                  // Write a minimal placeholder entry to detailsCache and its ref before
                  // breaking so the queue filter's `isCached` check resolves to `true` on
                  // the next render. Without this, an empty cache causes infinite re-queuing
                  // because the filter never becomes satisfied after a parse or network failure.
                  const sentinelEntry = {
                    summary: `Archival slot offline for ${node.label || node.id}. Re-evaluate node to re-establish curation.`,
                    details: { genre: "", origin: "", founded: "", notableArtists: [] },
                    links: [],
                    discography: [],
                    members: [],
                    recommendationReason: "",
                    _isSentinel: true,
                  } as any;
                  healedDetailsCacheRef.current.set(node.id, sentinelEntry);
                  healedDetailsCacheRef.current.set(node.id.toLowerCase(), sentinelEntry);
                  healedDetailsCacheRef.current.set(simpleId, sentinelEntry);
                  setDetailsCache(prev => {
                    const next = new Map(prev);
                    next.set(node.id, sentinelEntry);
                    next.set(node.id.toLowerCase(), sentinelEntry);
                    next.set(simpleId, sentinelEntry);
                    return next;
                  });

                  // Show toast only for the actively selected node
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
            fetchingNodeIdsRef.current.delete(node.id.toLowerCase());
            fetchingNodeIdsRef.current.delete(normalizeArtistId(node.id));
            setLoadingNodeIds(prev => {
              const next = new Set(prev);
              next.delete(node.id);
              next.delete(node.id.toLowerCase());
              next.delete(normalizeArtistId(node.id));
              return next;
            });
            lastProgressTimestampRef.current = Date.now();
          }
        }
      } finally { isFetchingDetailsRef.current = false; }
    };
    fetch();
  }, [activeNodeIds, activeNodes, detailsCache, graphData, seedArtists, selectedNode, urlOriginHint, humanizeError, user, isLoading, incrementDeepCutsOpenedCount, triggerBackgroundRevalidation, loadingNodeIds]);

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

  const handleCancel = useCallback(() => { 
    if (abortControllerRef.current) { 
      // 1. Sever active network requests
      abortControllerRef.current.abort(); 
      abortControllerRef.current = null; 
    }
    
    // 2. Unconditionally clear global UI loading states (Spiderweb)
    setIsLoading(false); 
    
    // 3. Clear node-specific loading states (Deep Cut / DetailsPanel)
    setLoadingNodeIds(new Set()); 
    fetchingNodeIdsRef.current.clear();
    
    // 4. Release all async pipeline locks
    isHydratingSessionRef.current = false;
    isProjectLoadingRef.current = false;
    isFetchingDetailsRef.current = false;
    
    // 5. Clear active Cloud Run jobs & modals
    setActiveJobId(null);
    setDisambiguationDialog(null);
  }, []);

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

  const formattedPeekedNode = useMemo(() => {
    if (!peekedNode || !formattedGraphData) return peekedNode;
    const match = formattedGraphData.nodes.find(n => n.id === peekedNode.id);
    return match 
      ? { ...peekedNode, label: match.label } 
      : peekedNode;
  }, [peekedNode, formattedGraphData]);

  const formattedActiveNodes = useMemo(() => {
    if (!activeNodes || !formattedGraphData) return activeNodes;
    return activeNodes.map(node => {
      const match = formattedGraphData.nodes.find(n => n.id === node.id);
      return match ? { ...node, label: match.label } : node;
    });
  }, [activeNodes, formattedGraphData]);

  const areFiltersChanged = useMemo(() => {
    return !areFiltersEqual(discoveryFilters, lastAppliedFilters);
  }, [discoveryFilters, lastAppliedFilters]);

  return (
    <div className="h-[100dvh] flex flex-col overflow-hidden" key={refreshKey}>
      <AnimatePresence>
        {error && (
          <ErrorOverlay
            message={error}
            onClose={() => {
              setError(null);
              setDetailsError(null);
              setLoadingNodeIds(new Set());
              setActiveNodeIds([]);
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
            onRestartWalkthrough={handleDashboardRestartWalkthrough}
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
            onShareProject={handleDashboardShareProject}
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
              areFiltersChanged={areFiltersChanged}
              data={formattedGraphData || { nodes: [], links: [] }} baseGraph={baseGraph} libraryArtists={libraryArtists} seedArtists={seedArtists}
              onRegenerate={(n) => handleGenerateGraph(n, true, graphData)} isLoading={isLoading} isHydrating={isProjectLoadingRef.current}
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
              onNodeClick={handleNodeClick} onGenerateDeepCut={handleGenerateDeepCut} selectedNode={formattedSelectedNode} peekedNode={formattedPeekedNode} activeNodes={formattedActiveNodes}
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
              disambiguationDialog={disambiguationDialog}
              onSelectDisambiguation={(choice) => disambiguationDialog?.onSelect(choice)}
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

      <ExploreActionDialog
        isOpen={!!exploreConfirmation}
        onClose={() => exploreConfirmation?.onCancel()}
        onConfirm={() => exploreConfirmation?.onConfirm()}
        artistName={exploreConfirmation?.artistName || ''}
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
          <div 
            className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/60 animate-fade-in-down"
            style={{ animationDuration: '200ms' }}
            onClick={() => setIsExitBlockerModalOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-background-dark border border-zinc-600 rounded-none w-full max-w-md shadow-2xl flex flex-col overflow-hidden text-left"
              onClick={e => e.stopPropagation()}
            >
              <header className="p-3 bg-zinc-900 border-b border-zinc-700 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-red-500 !text-[18px]">warning</span>
                  <h3 className="text-base font-medium text-white">Exit Preview?</h3>
                </div>
                <button 
                  onClick={() => setIsExitBlockerModalOpen(false)} 
                  className="w-8 h-8 flex flex-shrink-0 items-center justify-center rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors leading-none"
                >
                  <span className="material-symbols-outlined !text-[18px]">close</span>
                </button>
              </header>

              <div className="p-5 space-y-4 text-sm text-zinc-400">
                <p className="leading-relaxed">
                  Your preview session will be lost unless saved. Sign in or save this Zcene to your account to preserve your changes.
                </p>
              </div>

              <footer className="p-3 bg-zinc-900 border-t border-zinc-700 flex justify-end gap-2">
                <button 
                  onClick={() => setIsExitBlockerModalOpen(false)} 
                  className="px-3 py-1.5 text-zinc-400 text-sm rounded-xl hover:bg-zinc-800 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => {
                    setIsExitBlockerModalOpen(false);
                    navigate('/');
                  }} 
                  className="px-4 py-1.5 bg-red-500 text-white rounded-xl font-medium text-sm transition-opacity hover:opacity-90"
                >
                  Exit without Saving
                </button>
              </footer>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <CookieConsent />
    </div>
  );
};

export default App;
