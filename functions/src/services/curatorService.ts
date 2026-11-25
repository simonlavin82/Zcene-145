import { GoogleGenAI, Type, ThinkingLevel } from "@google/genai";
import {
  GraphData,
  Node,
  Link,
  DiscoveryFilters,
  DisambiguationCandidateStub,
  CANONICAL_STYLES_FLAT,
  ProjectScene,
  CrossSceneLink,
} from "../types";
import {
  extractCountrySlug as extractIsoCountrySlug,
  extractTrailingCountryIso,
  stripCountrySlug,
  doesOriginMatchExpectedIso,
  normalizeIsoCode,
  ISO_TO_COUNTRY_NAME,
} from "../shared/isoCountries";
import { sanitizeDirectionalLinkContext } from "../shared/linkContext";
import {
  computeDeterministicIdentityBridges,
  mergeCrossSceneLinks,
  namespaceSceneNodeId,
  normalizeCanonicalEntityId,
  stripSceneNamespace,
} from "../shared/multiSceneUtils";
import {
  hasActiveDiscoveryFilters,
  hasActiveTier2Filters,
  hasActiveTier3Filters,
  sanitizeAnchorLabelInput
} from "./cacheQualification";

export interface TokenUsage {
  promptTokenCount: number;
  candidatesTokenCount: number;
  totalTokenCount: number;
}

export interface UsageCollector {
  push: (model: string, usage: TokenUsage) => void;
}

export const GEMINI_FLASH_MODEL = process.env.GEMINI_FLASH_MODEL || "gemini-3.6-flash";

// --- UTILITIES PORTED FROM artistCacheService.ts ---

export const CANONICAL_ALIASES: Record<string, string> = {
  'lungleg': 'Lung Leg',
};

export const applyCanonicalAlias = (rawName: string): string => {
  if (!rawName) return rawName;
  const lookupKey = rawName.toLowerCase().replace(/[^a-z0-9]/g, '');
  return CANONICAL_ALIASES[lookupKey] || rawName;
};

export const normalizeArtistId = (name: string): string => {
  if (!name || typeof name !== 'string') return '';
  const clean = stripSceneNamespace(name);
  return clean
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 256);
};

export const normalizeLabelId = (name: string): string => {
  let id = normalizeArtistId(name);
  id = id.replace(/(?:-(?:records|recordings|music|company|recording-company|entertainment|group|productions|inc|ltd))+$/, '');
  if (id === 'century') id = 'century-media';
  return id;
};

export const titleCaseArtistId = (id: string): string => {
  if (!id) return '';
  const spacedId = id.replace(/[-_]+/g, ' ').trim();
  return spacedId
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
};

export const cleanArtistDisplayName = (name?: string): string => {
  if (!name) return '';
  let cleaned = name.trim();
  cleaned = cleaned.replace(/^["']+|["']+$/g, '');
  // Canonical Stylization Mandate (Rule 36):
  // Preserve stylized lowercase display names (e.g. "ten56.") synthesized by AI models.
  // Only convert to title case if the name contains hyphens or underscores (indicating a slug).
  if (cleaned.includes('-') || cleaned.includes('_')) {
    cleaned = titleCaseArtistId(cleaned);
  }
  return cleaned;
};

/**
 * Normalizes a label display name by stripping trailing structural suffixes
 * like "Records" / "Recordings" and guaranteeing title casing for database slugs.
 */
export const cleanLabelDisplayName = (rawIdOrName?: string | null): string => {
  if (!rawIdOrName || typeof rawIdOrName !== 'string') return '';
  const trimmed = rawIdOrName.trim();
  if (!trimmed) return '';

  const base = cleanArtistDisplayName(applyCanonicalAlias(trimmed));
  if (!base) return '';

  const stripped = base
    .replace(/(?:[-_\s]+(?:records|recordings))+$/i, '')
    .trim();

  const candidate = stripped || base;

  if (/^[a-z0-9\s-_]+$/.test(candidate) && !/[A-Z]/.test(candidate)) {
    return titleCaseArtistId(candidate);
  }

  if (candidate.includes('-') || candidate.includes('_')) {
    return titleCaseArtistId(candidate);
  }

  return candidate;
};

export const extractValidYoutubeId = (rawUrlOrId?: string | null): string | undefined => {
  if (!rawUrlOrId || typeof rawUrlOrId !== 'string') return undefined;
  const cleaned = rawUrlOrId.replace(/['"`]/g, '').trim();
  if (!cleaned || cleaned.toLowerCase() === 'null' || cleaned.toLowerCase() === 'undefined') return undefined;

  const vMatch = cleaned.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
  const shortMatch = cleaned.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
  const embedMatch = cleaned.match(/embed\/([a-zA-Z0-9_-]{11})/);
  if (vMatch) return vMatch[1];
  if (shortMatch) return shortMatch[1];
  if (embedMatch) return embedMatch[1];
  if (/^[a-zA-Z0-9_-]{11}$/.test(cleaned)) return cleaned;

  const anyMatch = cleaned.match(/(?:v=|youtu\.be\/|embed\/|^)([a-zA-Z0-9_-]{11})(?:[&/?]|$)|\b([a-zA-Z0-9_-]{11})\b/);
  const cand = anyMatch ? (anyMatch[1] || anyMatch[2]) : undefined;
  return cand && cand.length === 11 ? cand : undefined;
};

export const sanitizeImageUrl = (rawUrl?: string | null, sanitizeStrFn?: (s: string) => string): string => {
  if (!rawUrl || typeof rawUrl !== 'string') return "";
  if (rawUrl.includes('...')) return "";
  let cleaned = sanitizeStrFn ? sanitizeStrFn(rawUrl) : rawUrl;
  cleaned = cleaned.replace(/\[\d+\]/g, '').replace(/\(\d+\)/g, '').replace(/[.,;!"']+$/g, '').trim();
  if (
    !cleaned ||
    cleaned.includes('..') ||
    cleaned.toLowerCase().includes('example.com') ||
    cleaned.toLowerCase().includes('path/to/') ||
    cleaned.endsWith('/Special:FilePath/') ||
    cleaned === 'https://en.wikipedia.org/wiki/Special:FilePath/'
  ) {
    return "";
  }

  // Two-Tier Domain-Aware Image URL Validator — Genre-Contextual Edition.
  // Tier A: Expanded allowlist covering both Contemporary/Indie/Punk and Classical/Institutional domains.
  //         Always accepted if URL structure is valid. Covers CDN paths that lack image file extensions.
  // Tier B: Any domain, but path MUST contain a recognizable image extension or image-suggestive segment.
  // Reject: Any URL that passes neither tier is discarded as potential web noise.
  const TRUSTED_IMAGE_DOMAINS = [
    // ── CONTEMPORARY / INDIE / ELECTRONIC / PUNK / HIP-HOP ──
    'upload.wikimedia.org',        // Wikimedia Commons
    'commons.wikimedia.org',
    'f4.bcbits.com',               // Bandcamp CDN (all variants)
    'f1.bcbits.com',
    'f2.bcbits.com',
    'f3.bcbits.com',
    'i.discogs.com',               // Discogs
    'img.discogs.com',
    'i.scdn.co',                   // Spotify
    'lastfm.freetls.fastly.net',   // Last.fm
    'coverartarchive.org',         // MusicBrainz Cover Art Archive
    'assets.bandcamp.com',
    'cdn.allmusic.com',            // AllMusic
    // ── CLASSICAL / ORCHESTRAL / TRADITIONAL / JAZZ / OPERA ──
    'images.hyperion-records.co.uk', // Hyperion Records (major British classical label)
    'cdn.naxos.com',               // Naxos (world's largest classical label)
    'www.naxos.com',
    'images.ecmrecords.com',        // ECM Records (jazz / contemporary classical)
    'www.ecmrecords.com',
    'images.deutschegrammophon.com', // Deutsche Grammophon (DG)
    'www.harmoniamundi.com',        // Harmonia Mundi (early music / baroque)
    'images.bis.se',               // BIS Records (Nordic classical label)
    'cdn.prestomusic.com',         // Presto Music CDN
    'images.chandos.net',          // Chandos Records
    'cdn.britannica.com',          // Britannica (composer & musician portraits — no ext.)
  ];
  const IMAGE_EXTENSIONS = /\.(jpg|jpeg|png|webp|gif|avif|bmp|tiff?)(\?|#|$)/i;
  const IMAGE_PATH_SEGMENTS = /\/(img|image|images|photo|photos|media|assets|thumbnail|thumb|artwork)\//i;

  try {
    const parsed = new URL(cleaned);
    if (!['https:', 'http:'].includes(parsed.protocol)) return "";
    if (!parsed.pathname || parsed.pathname === '/' || parsed.pathname.length <= 1) return "";

    const host = parsed.hostname.toLowerCase();
    const pathname = parsed.pathname;

    const isFromTrustedDomain = TRUSTED_IMAGE_DOMAINS.some(d => host === d || host.endsWith(`.${d}`));
    const looksLikeImageAsset = IMAGE_EXTENSIONS.test(pathname) || IMAGE_PATH_SEGMENTS.test(pathname);

    if (isFromTrustedDomain || looksLikeImageAsset) {
      return cleaned;
    }
    return ""; // Neither Tier A nor Tier B — likely web noise; scraper will replace
  } catch (e) {
    return "";
  }
};

/**
 * Global 249-Country ISO-3166-1 Alpha-2 Country Slug Extractor ([Rule 2] & [Rule 36]).
 * Never returns a full country word like "thailand" — resolves strictly to 2-letter ISO or 'global'.
 */
export const extractCountrySlug = extractIsoCountrySlug;

export const buildCompositeCacheKey = (artistId: string, filters?: DiscoveryFilters): string => {
  if (!filters) return artistId;
  const parts: string[] = [artistId];
  
  if (filters.foundedAfter) {
    parts.push(`after:${filters.foundedAfter}`);
  }
  if (filters.foundedBefore) {
    parts.push(`before:${filters.foundedBefore}`);
  }
  if (filters.includeOrigins && filters.includeOrigins.length > 0) {
    const sorted = [...filters.includeOrigins].map(s => s.trim().toLowerCase()).sort();
    parts.push(`inc_origins:${sorted.join(',')}`);
  }
  if (filters.excludeOrigins && filters.excludeOrigins.length > 0) {
    const sorted = [...filters.excludeOrigins].map(s => s.trim().toLowerCase()).sort();
    parts.push(`exc_origins:${sorted.join(',')}`);
  }
  if (filters.includeGenres && filters.includeGenres.length > 0) {
    const sorted = [...filters.includeGenres].map(s => s.trim().toLowerCase()).sort();
    parts.push(`inc_genres:${sorted.join(',')}`);
  }
  if (filters.anchorLabels && filters.anchorLabels.length > 0) {
    const sorted = [...filters.anchorLabels].map(s => normalizeLabelId(s)).filter(Boolean).sort();
    if (sorted.length > 0) {
      parts.push(`inc_labels:${sorted.join(',')}`);
    }
  }
  
  if (parts.length === 1) return artistId;
  
  return parts.join('-').replace(/\s+/g, '-').toLowerCase();
};


export const normalizeGraphData = (graph: GraphData): GraphData => {
  if (!graph || !graph.nodes) return graph;

  const idMap = new Map<string, string>();

  const normalizedNodes = graph.nodes.map(node => {
    const originalId = applyCanonicalAlias(node.id);
    let normalizedId = originalId.trim();
    
    if (node.type === 'label') {
      normalizedId = normalizeLabelId(node.label || originalId);
    } else if (node.type === 'artist') {
      normalizedId = normalizeArtistId(originalId);
    } else {
      normalizedId = normalizedId.toLowerCase();
    }
    
    idMap.set(node.id, normalizedId);
    idMap.set(originalId, normalizedId);
    idMap.set(originalId.toLowerCase(), normalizedId);
    idMap.set(normalizeArtistId(originalId), normalizedId);

    let label = '';
    if (node.type === 'label') {
      label = cleanLabelDisplayName(node.label || originalId);
    } else {
      label = node.label ? cleanArtistDisplayName(applyCanonicalAlias(node.label)) : '';
      if (!label) {
        label = node.type === 'artist'
          ? titleCaseArtistId(originalId.trim())
          : originalId.trim();
      }
    }

    return {
      ...node,
      id: normalizedId,
      label
    };
  });

  const normalizedLinks = (graph.links || []).map(link => {
    const rawSourceId = typeof link.source === 'string' ? link.source : (link.source as Node).id;
    const rawTargetId = typeof link.target === 'string' ? link.target : (link.target as Node).id;
    
    const sourceId = applyCanonicalAlias(rawSourceId);
    const targetId = applyCanonicalAlias(rawTargetId);

    const sourceLower = sourceId.trim().toLowerCase();
    const targetLower = targetId.trim().toLowerCase();
    const sourceNorm = normalizeArtistId(sourceId);
    const targetNorm = normalizeArtistId(targetId);

    const newSource = idMap.get(sourceId) || idMap.get(sourceLower) || idMap.get(sourceNorm) || sourceLower;
    const newTarget = idMap.get(targetId) || idMap.get(targetLower) || idMap.get(targetNorm) || targetLower;

    return {
      ...link,
      source: newSource,
      target: newTarget
    };
  });

  return {
    nodes: normalizedNodes,
    links: normalizedLinks,
    synthesisRationale: graph.synthesisRationale || (graph as any).synthesis_rationale
  };
};

export const extractArtistSubGraph = (
  artistName: string,
  fullGraph: GraphData,
  allSeeds: string[] = []
): { nodes: Node[]; links: Link[] } => {
  const artistNameNorm = normalizeArtistId(artistName);
  const seedsNorm = new Set(allSeeds.map(s => normalizeArtistId(s)));
  seedsNorm.delete(artistNameNorm);

  const artistNode = fullGraph.nodes.find(
    n => (n.type === 'artist' || n.type === 'label') && normalizeArtistId(n.id) === artistNameNorm
  );

  if (!artistNode) {
    return { nodes: [], links: [] };
  }

  const originalArtistNodeId = artistNode.id;
  const artistNodeIdNorm = normalizeArtistId(originalArtistNodeId);

  const resolveId = (endpoint: string | Node): string =>
    typeof endpoint === 'string' ? endpoint : endpoint.id;

  const keptNodeIdsNorm = new Set<string>();

  if (seedsNorm.size === 0) {
    // Single-seed generation: include everything (even disjointed clusters)
    fullGraph.nodes.forEach(n => keptNodeIdsNorm.add(normalizeArtistId(n.id)));
  } else {
    // Multi-seed generation: BFS to extract only the component reachable from this seed, stopping at other seeds.
    const adjList = new Map<string, string[]>();
    (fullGraph.links || []).forEach(link => {
       const sNorm = normalizeArtistId(resolveId(link.source));
       const tNorm = normalizeArtistId(resolveId(link.target));
       if (!adjList.has(sNorm)) adjList.set(sNorm, []);
       if (!adjList.has(tNorm)) adjList.set(tNorm, []);
       adjList.get(sNorm)!.push(tNorm);
       adjList.get(tNorm)!.push(sNorm);
    });

    const queue = [artistNodeIdNorm];
    keptNodeIdsNorm.add(artistNodeIdNorm);

    while (queue.length > 0) {
       const current = queue.shift()!;
       const neighbors = adjList.get(current) || [];
       for (const neighbor of neighbors) {
           if (!keptNodeIdsNorm.has(neighbor) && !seedsNorm.has(neighbor)) {
               keptNodeIdsNorm.add(neighbor);
               queue.push(neighbor);
           }
       }
    }
  }

  const keptNodes = fullGraph.nodes.filter(n => keptNodeIdsNorm.has(normalizeArtistId(n.id)));
  const keptLinks = (fullGraph.links || []).filter(link => {
      const sNorm = normalizeArtistId(resolveId(link.source));
      const tNorm = normalizeArtistId(resolveId(link.target));
      return keptNodeIdsNorm.has(sNorm) && keptNodeIdsNorm.has(tNorm);
  });

  const ownNodesMapped = keptNodes.map(n => {
    if (n.id === originalArtistNodeId) {
      return { ...n, id: artistName };
    }
    return n;
  });

  const ownLinksMapped = keptLinks.map(l => {
    const s = resolveId(l.source);
    const t = resolveId(l.target);
    return {
      ...l,
      source: s === originalArtistNodeId ? artistName : s,
      target: t === originalArtistNodeId ? artistName : t
    };
  });

  return { nodes: ownNodesMapped, links: ownLinksMapped };
};

// --- JSON REPAIR & CLEANING PORTED FROM geminiService.ts ---

export const extractCleanJsonString = (rawText?: string): string => {
  if (!rawText || typeof rawText !== 'string') return "";
  let text = rawText.trim();
  if (!text) return "";

  const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (match && match[1]) {
    text = match[1].trim();
  } else {
    text = text.replace(/^```(?:json)?\n?/i, '').replace(/```$/i, '').trim();
  }

  let startIdx = text.indexOf('{');
  const arrayStartIdx = text.search(/\[\s*(?:\{|")/); // allow array of objects or strings
  if (startIdx === -1) startIdx = arrayStartIdx;
  else if (arrayStartIdx !== -1 && arrayStartIdx < startIdx) startIdx = arrayStartIdx;
  
  if (startIdx === -1) {
      startIdx = text.indexOf('[');
  }
  
  if (startIdx === -1) return text;
  text = text.substring(startIdx);

  let stack: string[] = [];
  let inString = false;
  let escaped = false;
  let endIdx = -1;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (char === '{' || char === '[') {
        stack.push(char);
      } else if (char === '}' || char === ']') {
        if (stack.length > 0) {
          const last = stack[stack.length - 1];
          if ((char === '}' && last === '{') || (char === ']' && last === '[')) {
            stack.pop();
            if (stack.length === 0) {
              endIdx = i;
              break;
            }
          }
        }
      }
    }
  }

  if (endIdx !== -1) {
    text = text.substring(0, endIdx + 1);
  }

  return text.trim();
};

const repairJson = (json: string): string => {
  if (!json) return "";
  
  let stack: string[] = [];
  let inString = false;
  let escaped = false;
  
  let startIdx = json.indexOf('{');
  const arrayStartIdx = json.search(/\[\s*(?:\{|")/); // allow array of objects or strings
  if (startIdx === -1) startIdx = arrayStartIdx;
  else if (arrayStartIdx !== -1 && arrayStartIdx < startIdx) startIdx = arrayStartIdx;
  
  if (startIdx === -1) {
      startIdx = json.indexOf('[');
  }
  
  if (startIdx === -1) return json;
  let text = json.substring(startIdx);

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (char === '{' || char === '[') {
        stack.push(char);
      } else if (char === '}' || char === ']') {
        if (stack.length > 0) {
          const last = stack[stack.length - 1];
          if ((char === '}' && last === '{') || (char === ']' && last === '[')) {
            stack.pop();
            if (stack.length === 0) {
              text = text.substring(0, i + 1);
              break;
            }
          }
        }
      }
    }
  }

  let repaired = text;
  if (inString && escaped) {
    repaired = repaired.substring(0, repaired.length - 1);
  }
  if (inString) {
    repaired += '"';
  }
  repaired = repaired.trim();
  if (repaired.endsWith(':')) {
    repaired += ' null';
  }
  repaired = repaired.replace(/,$/, '');

  while (stack.length > 0) {
    const last = stack.pop();
    if (last === '{') repaired += '}';
    else if (last === '[') repaired += ']';
  }

  return repaired;
};

// --- GEMINI CURATION CONFIGS ---

export const GRAPH_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    nodes: {
      type: Type.ARRAY,
      description: "A list of nodes in the music graph. Each node represents an artist, genre, label, country, or founded year.",
      items: {
        type: Type.OBJECT,
        properties: {
          id: {
            type: Type.STRING,
            description: "The professional, canonical name of the artist, genre, label, country, or the 4-digit year (YYYY) for founded nodes."
          },
          type: {
            type: Type.STRING,
            description: "The type of the node, can be 'artist', 'genre', 'label', 'country', or 'founded'."
          },
          group: {
            type: Type.INTEGER,
            description: "A group identifier for coloring or categorization, usually based on the initial seed artists."
          },
          label: {
            type: Type.STRING,
            description: "The raw, human-readable name of the entity, especially for artists and labels (e.g., 'Drug Church')."
          },
          origin: {
            type: Type.STRING,
            description: "For artists and labels, the country of origin (e.g., 'USA', 'UK'). Leave empty for other node types."
          }
        },
        required: ["id", "type", "group"]
      }
    },
    links: {
      type: Type.ARRAY,
      description: "A list of links connecting the nodes, representing relationships.",
      items: {
        type: Type.OBJECT,
        properties: {
          source: {
            type: Type.STRING,
            description: "The ID of the source node."
          },
          target: {
            type: Type.STRING,
            description: "The ID of the target node."
          },
          value: {
            type: Type.INTEGER,
            description: "The strength of the connection, typically a constant value like 1."
          },
          forwardContext: {
            type: Type.STRING,
            description: "A concise 3-7 word directional predicate phrase in present/past tense from source to target OMITTING both endpoint names (e.g., 'discovers and champions', 'traded arena rock hooks with', 'influenced'). Never use generic 'is connected to'."
          },
          inverseContext: {
            type: Type.STRING,
            description: "A concise 3-7 word directional predicate phrase from target to source reversing the semantics and OMITTING both endpoint names (e.g., 'discovered and championed by', 'traded arena rock hooks with', 'was influenced by'). Never use generic 'is connected to'."
          }
        },
        required: ["source", "target", "value", "forwardContext", "inverseContext"]
      }
    }
  },
  required: ["nodes", "links"]
};

export const GENERATE_GRAPH_WITH_CONTEXT_PROMPT_TEMPLATE = `I have an existing music graph. The user wants to enhance it by adding connections for these seed artists: {{artists}}.

        The graph ALREADY CONTAINS the following nodes: [{{existingNodeIds}}].
        
        Your task is to generate ONLY the NEW nodes and links needed to integrate the seed artists ({{artists}}) into the existing graph. Follow these rules:
        1.  CANONICAL NAMING & ORIGIN STAMPING: For ALL nodes (especially the seed artists provided in "{{artists}}"), you MUST use the canonical, professional spelling and capitalization as recognized by the music industry. For example, use "Radiohead" even if the user typed "radiohead", and use "blink-182" with a lowercase 'b' and hyphen if that is the correct format. Additionally, for EVERY 'artist' and 'label' node you create, you MUST populate its 'origin' property with its country of origin (e.g., "Thailand", "USA", "United Kingdom", "Japan") so international homonyms are never confused.
        2.  DO NOT duplicate any of the existing nodes listed above. When creating links, you MUST reference the existing node IDs if a connection is needed.
        3.  For EACH seed artist in "{{artists}}", if they do not already exist as a node, you MUST add them as an 'artist' node to the 'nodes' array. This is a mandatory requirement. After adding the artist node, attempt to find its primary genre, record label, country of origin, and the year they were formed/founded (YYYY). If you find these details, create nodes for them (if they don't already exist) and link them back to the seed artist. The 'id' for the year node must be the 4-digit year (e.g., "1998") and its type must be 'founded'. If you cannot find some or all of these details, that is acceptable, but the seed artist node itself MUST still be included in the graph.
        4.  In addition, identify and add 8-12 NEW related artists that are musically connected to the seed artists. For these NEW artists, you MUST also identify and create their respective genre, label, country, and especially their 'founded' year nodes (YYYY) to ensure the spiderweb is rich with chronological data. Assign them to the same 'group' as the seed artist they relate to, or a new group if they relate to multiple.
        5.  TEMPORAL ECOSYSTEM & SCENE AUTHENTICITY RULE (STRICT): You MUST reconstruct the true historical scene and temporal ecosystem of the seed artist(s). Node selection must be strictly restricted to the primary active era, geographic scene, and lived touring ecosystem of the seed(s). For example, if a seed artist was primarily active in a late-1990s scene, you MUST surface their exact period-accurate peers from that specific 1990s era. If the seed is a modern 2020s band, you MUST surface contemporary peers from their current 2020s ecosystem. Do NOT suggest modern algorithmic equivalents for legacy bands, and do NOT pull in historical legacy ancestors for modern bands unless they genuinely shared the same active touring scene. The graph must represent a period-accurate, contemporary snapshot of the artist's specific moment in time. EXCEPTION (3-TIER ANCHOR OVERRIDE): When explicit Level 2 Era or Country Guardrails are active below, those guardrails take absolute precedence for all NEW recommended artists. In that case, you MUST map cross-era or cross-border lineage, influence, and spiritual succession connecting the sacred seed artist(s) to peers founded within the specified era/origin window, even if the seed artist belongs to a different decade or country.
        6.  It is absolutely critical that each 'founded' node is linked ONLY to the correct artist node who was founded in that year.
        7.  LINK RELATIONSHIP CONTEXT (Dual-Context): Each link in the 'links' array MUST natively output two concise 3-7 word predicate strings OMITTING both endpoint names (never use "is connected to"):
            - 'forwardContext': Explains the connection from source to target (e.g. 'discovers and champions', 'traded stadium rock hooks with').
            - 'inverseContext': Reverses the semantic direction from target to source (e.g. 'discovered and championed by', 'traded stadium rock hooks with').
        8.  JSON SCHEMA: The output must be a single, valid JSON object with 'nodes' and 'links' arrays matching the schema.
        
        STRUCTURAL ONLY: You MUST NOT generate or include any biographies, summaries, member lists, discographies, or detailed profile metadata for the artists. The response must strictly contain only structural layout nodes (id, type, group, label, origin) and connection links (source, target, value, forwardContext, inverseContext).
        
        ABSOLUTELY CRITICAL FINAL CHECK: Before you output the JSON, verify that for EVERY SINGLE OBJECT in the 'links' array, the value of its 'source' property and the value of its 'target' property perfectly match an 'id' from an object in EITHER the provided existing nodes list OR your new 'nodes' array. THERE MUST BE NO ORPHANED LINKS. If you create a link with a 'source' or 'target' ID (e.g., "Arista Records"), you MUST ALSO define a node with that exact same 'id' (e.g., { "id": "Arista Records", "type": "label", ... }). Do not invent connections to nodes you haven't defined. This is a strict, mandatory requirement.
        
        IMPORTANT: Ensure that any double quotes within string values are properly escaped (e.g., "Artist \\"Name\\""). The final output must be perfectly valid JSON. Do not emit literal '\\n' strings; use standard JSON string encoding for line breaks. Your entire response MUST be ONLY the raw JSON object, without any surrounding text, explanations, or markdown code fences.`;

export const GENERATE_MULTI_SEED_GRAPH_PROMPT_TEMPLATE = `Given the following list of seed artists: {{artists}}.
Your task is to explore the genuine cultural, historical, and musical intersection of these seed artists from a blank slate (Tabula Rasa), performing a true co-equal "melting pot" traversal where all input seeds act as simultaneous structural foundations, avoiding any attention bias toward a single anchor artist. The output must be a single, valid JSON object with keys: 'nodes', and 'links'.
'nodes' should be an array of objects, each with 'id', 'type', 'group', 'label', and (for every 'artist' and 'label' node) 'origin'. The 'type' can be 'artist', 'genre', 'label', 'country', or 'founded'.
'links' should be an array of objects, each with 'source', 'target', 'value', 'forwardContext', and 'inverseContext' describing the directional relationship.

Follow these rules precisely:
1.  CANONICAL NAMING & ORIGIN STAMPING: For ALL nodes, use the canonical, professional spelling and capitalization as recognized by the music industry. For example, use "Radiohead" even if the seed provided was "radiohead", and "blink-182" with a lowercase 'b' and hyphen if that is its official name. For EVERY 'artist' and 'label' node, populate its 'origin' field with its country of origin (e.g., "Thailand", "USA", "United Kingdom", "Japan") so international homonyms are never confused.
2.  MANDATORY SEED NODES (CO-EQUAL ROOTS): You MUST ensure an 'artist' node exists for EVERY seed artist listed in {{artists}}. Assign a unique 'group' number for each seed artist (e.g. 1 for seed 1, 2 for seed 2). Treat every seed as a co-equal foundational anchor. If any seed artist has active filters, do not label them as "[Indirect recommendation]" or isolate them.
3.  For each seed artist, find and add nodes for their primary genre, record label, country of origin, and the year they were formed/founded (YYYY). The 'id' for the year node must be the 4-digit year (e.g. "1994") and its type must be 'founded'. For metadata nodes (genre, label, country, founded), use canonical IDs and types.
4.  TARGET ENTITY DENSITY & DUAL-STRUCTURE TOPOLOGY (RULE 27 — CROSSOVER BRIDGE + NATIVE ECOSYSTEMS):
    In addition, find and add 10 to 16 NEW related artists total across the seeds (bringing the total artist count including seeds to 12 to 18 artists), structured into two complementary layers:
    A. THE CROSSOVER BRIDGE (5 to 6 artists + shared labels/genres): Identify authentic bands, imprints, and genres that legitimately connect multiple seeds through shared musical DNA, split releases, shared producers, record labels, or lived touring history.
    B. NATIVE ECOSYSTEMS (4 to 5 distinct scene artists per seed): Radiate deeply into each seed's authentic regional, temporal, and stylistic ecosystem. Give EACH seed its own dedicated cluster of 2nd-degree peers and formative scene contemporaries rather than stopping at superficial connections.
    
    UPPER-BOUND AMBITION & ANTI-LAZINESS DIRECTIVE: When the musical ecosystems surrounding the seeds are historically fertile, DO NOT lazily default to the bottom of the range. Actively strive toward the upper bound (13 to 16 new artists) to give users a deep, rich scene exploration.
    
    STRICT ANTI-FILLER VALVE: Conversely, NEVER pad the graph with generic or tenuously connected artists just to hit numbers. If an artist belongs to a genuinely tiny or isolated micro-scene with few authentic peers, scaling down and stopping at 9 to 10 new artists if sparse is required; never pad. Quality, historical veracity, and shared scene reality always override numerical quantity.
    
    Labels are explicitly EXCLUDED from this artist cap; generate the natural amount of authentic Label nodes required to accurately connect the generated artists together based on historical reality (typically resulting in an organic overall density of roughly 18 to 26 total Deep Cuts). ONLY include artists that strictly meet any provided discovery filters.
5.  For all artists (seed and related), create links connecting them to their respective genre, label, country, and founded year nodes. CRITICAL TOPOLOGY RULE: You MUST create direct links connecting each seed artist to their native ecosystem peers (sharing their 'group' number), and direct links connecting bridging artists to the seeds/peers they connect. Every new artist MUST be connected back to the central spiderweb, either directly to a seed artist or through a chain of artist-to-artist links. DO NOT leave any artist nodes floating or only connected to metadata nodes. Each link MUST include concise 3-7 word 'forwardContext' and 'inverseContext' predicate strings OMITTING both endpoint names (e.g., 'releases music on' / 'released albums by', 'toured the regional club circuit with' — never generic 'is connected to').
6.  TEMPORAL ECOSYSTEM & SCENE AUTHENTICITY RULE (STRICT): You MUST reconstruct the true historical scene and temporal ecosystem of the seed artist(s). Node selection must be strictly restricted to the primary active era, geographic scene, and lived touring ecosystem of the seed(s). For example, if a seed artist was primarily active in a late-1990s scene, you MUST surface their exact period-accurate peers from that specific 1990s era. If the seed is a modern 2020s band, you MUST surface contemporary peers from their current 2020s ecosystem. Do NOT suggest modern algorithmic equivalents for legacy bands, and do NOT pull in historical legacy ancestors for modern bands unless they genuinely shared the same active touring scene. The graph must represent a period-accurate, contemporary snapshot of the artist's specific moment in time. EXCEPTION (3-TIER ANCHOR OVERRIDE): When explicit Level 2 Era or Country Guardrails are active below, those guardrails take absolute precedence for all NEW recommended artists. In that case, you MUST map cross-era or cross-border lineage, influence, and spiritual succession connecting the sacred seed artist(s) to peers founded within the specified era/origin window, even if the seed artist belongs to a different decade or country.
7.  CRITICAL: Each 'founded' node MUST be linked ONLY to the correct artist who was founded in that year.
8.  JSON SCHEMA: The output must be a single, valid JSON object with 'nodes' and 'links' arrays matching the schema.

STRUCTURAL ONLY: You MUST NOT generate or include any biographies, summaries, member lists, discographies, or detailed profile metadata for the artists. The response must strictly contain only structural layout nodes (id, type, group, label, origin) and connection links (source, target, value, forwardContext, inverseContext).

ABSOLUTELY CRITICAL FINAL CHECK: Before you output the JSON, verify that for EVERY SINGLE OBJECT in the 'links' array, the value of its 'source' property and the value of its 'target' property perfectly match an 'id' from an object in the 'nodes' array. THERE MUST BE NO ORPHANED LINKS. If you create a link with a 'source' or 'target' ID (e.g., "Arista Records"), you MUST ALSO define a node with that exact same 'id' (e.g., { "id": "Arista Records", "type": "label", ... }). Do not invent connections to nodes you haven't defined. This is an architectural requirement.

NEGATIVE CONSTRAINT: NEVER use em-dashes (—) or long hyphens for dramatic effect or clause separation. Use standard editorial punctuation (commas, colons, or semicolons).`;

export const GENERATE_GRAPH_PROMPT_TEMPLATE = `Given the following list of seed artists: {{artists}}. Generate a music family tree connecting them. The output must be a single, valid JSON object with keys: 'nodes', and 'links'.
'nodes' should be an array of objects, each with 'id', 'type', 'group', 'label', and (for every 'artist' and 'label' node) 'origin'. The 'type' can be 'artist', 'genre', 'label', 'country', or 'founded'.
'links' should be an array of objects, each with 'source', 'target', 'value', 'forwardContext', and 'inverseContext' describing the directional relationship.

Follow these rules precisely:
1.  CANONICAL NAMING & ORIGIN STAMPING: For ALL nodes, use the canonical, professional spelling and capitalization as recognized by the music industry. For example, use "Radiohead" even if the seed provided was "radiohead", and "blink-182" with a lowercase 'b' and hyphen if that is its official name. For EVERY 'artist' and 'label' node, populate its 'origin' field with its country of origin (e.g., "Thailand", "USA", "United Kingdom", "Japan") so international homonyms are never confused.
2.  MANDATORY: You MUST create an 'artist' node for EVERY seed artist provided in the list: {{artists}}. Assign a unique 'group' number for each seed artist.
3.  For each seed artist, find and add nodes for their primary genre, record label, country of origin, and the year they were formed/founded (YYYY). The 'id' for the year node must be the 4-digit year (e.g. "1994") and its type must be 'founded'.
4.  TARGET ENTITY DENSITY (RULE 27 — 10 TO 16 NEW ARTISTS):
    In addition, find and add 10 to 16 NEW related artists that are musically connected to the seed artists. For these NEW artists, you MUST also identify and create their respective genre, label, country, and especially their 'founded' year nodes (YYYY) to ensure the spiderweb is rich with chronological data.
    
    UPPER-BOUND AMBITION & ANTI-LAZINESS DIRECTIVE: In rich, fertile musical movements, DO NOT satisfice at the lower floor. Strive for the upper range (13 to 16 new artists) by surfacing authentic 2nd-degree scene peers and era contemporaries.
    
    STRICT ANTI-FILLER VALVE: If the seed belongs to an isolated micro-niche, scale down, stopping at 9 to 10 new artists if sparse; never pad with irrelevant or generic artists just to hit a number. Quality, historical veracity, and shared scene reality always override numerical quantity.
    
    Labels are explicitly EXCLUDED from this cap; generate the natural amount of Label nodes required to accurately connect the generated artists together based on historical reality (resulting in an organic target density of roughly 18 to 26 total Deep Cuts). ONLY include artists that strictly meet any provided discovery filters.
5.  For all artists (seed and related), create links connecting them to their respective genre, label, country, and founded year nodes. CRITICAL TOPOLOGY RULE: You MUST create direct links connecting the seed artist(s) to the NEW related artists you introduce. Every new artist MUST be connected back to the central spiderweb, either directly to the seed artist, or through a chain of artist-to-artist links. DO NOT leave any artist nodes floating or only connected to metadata nodes. All direct connections of a seed artist should share their 'group' number. Each link MUST include concise 3-7 word 'forwardContext' and 'inverseContext' predicate strings OMITTING both endpoint names (e.g., 'releases music on' / 'released albums by', 'toured the regional club circuit with' — never generic 'is connected to').
6.  TEMPORAL ECOSYSTEM & SCENE AUTHENTICITY RULE (STRICT): You MUST reconstruct the true historical scene and temporal ecosystem of the seed artist(s). Node selection must be strictly restricted to the primary active era, geographic scene, and lived touring ecosystem of the seed(s). For example, if a seed artist was primarily active in a late-1990s scene, you MUST surface their exact period-accurate peers from that specific 1990s era. If the seed is a modern 2020s band, you MUST surface contemporary peers from their current 2020s ecosystem. Do NOT suggest modern algorithmic equivalents for legacy bands, and do NOT pull in historical legacy ancestors for modern bands unless they genuinely shared the same active touring scene. The graph must represent a period-accurate, contemporary snapshot of the artist's specific moment in time. EXCEPTION (3-TIER ANCHOR OVERRIDE): When explicit Level 2 Era or Country Guardrails are active below, those guardrails take absolute precedence for all NEW recommended artists. In that case, you MUST map cross-era or cross-border lineage, influence, and spiritual succession connecting the sacred seed artist(s) to peers founded within the specified era/origin window, even if the seed artist belongs to a different decade or country.
7.  CRITICAL: Each 'founded' node MUST be linked ONLY to the correct artist who was founded in that year.
8.  JSON SCHEMA: The output must be a single, valid JSON object with 'nodes' and 'links' arrays matching the schema.

STRUCTURAL ONLY: You MUST NOT generate or include any biographies, summaries, member lists, discographies, or detailed profile metadata for the artists. The response must strictly contain only structural layout nodes (id, type, group, label, origin) and connection links (source, target, value, forwardContext, inverseContext).
        
ABSOLUTELY CRITICAL FINAL CHECK: Before you output the JSON, verify that for EVERY SINGLE OBJECT in the 'links' array, the value of its 'source' property and the value of its 'target' property perfectly match an 'id' from an object in the 'nodes' array. THERE MUST BE NO ORPHANED LINKS. If you create a link with a 'source' or 'target' ID (e.g., "Arista Records"), you MUST ALSO define a node with that exact same 'id' (e.g., { "id": "Arista Records", "type": "label", ... }). Do not invent connections to nodes you haven't defined. This is a architecture requirement.

NEGATIVE CONSTRAINT: NEVER use em-dashes (—) or long hyphens for dramatic effect or clause separation. Use standard editorial punctuation (commas, colons, or semicolons).`;

// --- GEMINI CURATION CONFIGS ---

export const SEED_VALIDATION_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    isValid: {
      type: Type.BOOLEAN,
      description: "True if this is a real, recognized musical entity (artist, band, or label) that can be confidently identified. False if the input cannot be mapped to any known artist."
    },
    correctedInput: {
      type: Type.BOOLEAN,
      description: "True if the canonical primary.id differs from the user's input beyond letter casing — including spelling/typo fixes (e.g. 'turstile' -> 'Turnstile'), restored official leading articles (e.g. 'Rocking Horse Winner' -> 'The Rocking Horse Winner', 'Get Up Kids' -> 'The Get Up Kids'), stripped unofficial leading articles (e.g. 'The Deftones' -> 'Deftones', 'The Pixies' -> 'Pixies'), or canonical punctuation (e.g. 'Blink 182' -> 'blink-182'). False only if exact match (case-insensitive)."
    },
    hasCollision: {
      type: Type.BOOLEAN,
      description: "True ONLY if there are multiple genuine, prominent, distinct musical acts legitimately sharing this exact or near-identical name (e.g. 'Darko' refers to Darko US [Deathcore] and Darko [UK Melodic Punk]). False if there is one predominant, famous, or unambiguous artist (e.g. 'Turnstile', 'Radiohead', 'Nirvana')."
    },
    primary: {
      type: Type.OBJECT,
      description: "The primary or most prominent recognized musical entity.",
      properties: {
        id: {
          type: Type.STRING,
          description: "The exact official, commercially published canonical name of the artist (including official leading 'The ' when part of the band's real billing, e.g. 'The Rocking Horse Winner', 'The Get Up Kids', 'The Promise Ring', 'The Smiths', 'The Cure', and excluding 'The ' when not part of the official billing, e.g. 'Pixies', 'Ramones', 'Talking Heads', 'Deftones', 'Fugazi', 'Quicksand', 'Snapcase'). If the real-world official band name includes a regional tag (e.g. 'Darko US'), include it. Otherwise do NOT add country suffixes."
        },
        origin: {
          type: Type.STRING,
          description: "The country of origin for the artist (e.g., 'USA', 'United Kingdom', 'Canada'). Return empty string if isValid is false."
        },
        genre: {
          type: Type.STRING,
          description: "The primary genre of the artist (e.g. 'Hardcore Punk', 'Deathcore'). Return empty string if isValid is false."
        },
        disambiguationSnippet: {
          type: Type.STRING,
          description: "A concise 1-sentence contextual identifier (e.g. 'American deathcore project featuring Tom Barber and Baby J' or 'Baltimore hardcore punk band formed in 2010')."
        }
      },
      required: ["id", "origin", "genre"]
    },
    collisions: {
      type: Type.ARRAY,
      description: "List of other genuine, prominent, commercially-released musical artists with identical or colliding names. MUST be EMPTY [] unless there are verified, notable acts with published albums.",
      items: {
        type: Type.OBJECT,
        properties: {
          id: {
            type: Type.STRING,
            description: "The canonical name of the colliding artist."
          },
          origin: {
            type: Type.STRING,
            description: "Country of origin."
          },
          genre: {
            type: Type.STRING,
            description: "Primary genre."
          },
          disambiguationSnippet: {
            type: Type.STRING,
            description: "A concise 1-sentence contextual identifier (e.g. 'English melodic punk rock band from Guildford')."
          }
        },
        required: ["id", "origin", "genre"]
      }
    }
  },
  required: ["isValid", "correctedInput", "hasCollision", "primary", "collisions"]
};

// --- CORE CURATOR LOGIC ---

export const validateSeedOriginBackend = async (
  artistId: string,
  hints?: { originHint?: string; genreHint?: string }
): Promise<{
  id: string;
  origin: string;
  genre: string;
  isValid: boolean;
  correctedInput: boolean;
  hasCollision?: boolean;
  candidates?: DisambiguationCandidateStub[];
  apiUsage?: any;
}> => {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not defined in environment secrets.");
    }

    const ai = new GoogleGenAI({ apiKey, httpOptions: { timeout: 300000 } });
    const currentModel = GEMINI_FLASH_MODEL; // Column 2: Origin Validation uses Flash

    const hasHints = !!(hints && (hints.originHint?.trim() || hints.genreHint?.trim()));
    const hintContext = hasHints
      ? `\nUSER SPECIFICATION / RE-QUERY HINTS: The user explicitly specifies that this artist operates in or originates from: "${hints?.originHint?.trim() || ''}"${hints?.genreHint?.trim() ? ` with genre: "${hints.genreHint.trim()}"` : ''}.`
      : '';

    const prompt = `Validate this seed artist: "${artistId}".${hintContext}

CRITICAL RULES (non-negotiable):
1. CANONICAL NAME, SPELLING & OFFICIAL ARTICLE NORMALIZATION (MANDATORY):
   - Always return the artist's exact official, commercially published canonical name in 'primary.id', and set 'correctedInput' to true whenever 'primary.id' differs from the user's input beyond letter casing.
   - SPELLING & PUNCTUATION: Fix any misspelling, transposition, or missing punctuation/hyphenation (e.g. "turstile" for "Turnstile", "radiohed" for "Radiohead", "nirvanna" for "Nirvana", "the rocking horse winer" for "The Rocking Horse Winner", "Blink 182" for "blink-182", "Capn Jazz" for "Cap'n Jazz"). Do NOT return the original typo'd spelling under any circumstances.
   - OFFICIAL LEADING "THE " RESTORATION: If the user omitted an official leading "The " from a band whose real-world published name begins with "The " (e.g. "Rocking Horse Winner" -> "The Rocking Horse Winner", "Get Up Kids" -> "The Get Up Kids", "Promise Ring" -> "The Promise Ring", "Dillinger Escape Plan" -> "The Dillinger Escape Plan", "Smiths" -> "The Smiths", "Cure" -> "The Cure", "Starting Line" -> "The Starting Line"), you MUST restore the leading "The " in 'primary.id' and set 'correctedInput' to true.
   - STRICT NON-"THE" PRESERVATION: Never prepend "The " to artists whose official billing does NOT start with "The " (e.g. "Pixies", "Ramones", "Talking Heads", "Deftones", "Fugazi", "Quicksand", "Snapcase", "Turnstile", "Mouthpiece", "Texas Is the Reason"). If the user erroneously typed an unofficial leading "The " (e.g. "The Pixies" -> "Pixies", "The Ramones" -> "Ramones", "The Talking Heads" -> "Talking Heads", "The Deftones" -> "Deftones"), strip the unofficial "The " in 'primary.id' and set 'correctedInput' to true.
2. STRICT ANTI-HALLUCINATION / NO "PEOPLE-PLEASING" COLLISIONS:
   - A collision exists ONLY when there are multiple distinct, widely-known, commercially released musical artists that legitimately share this name or where both a prominent "The <Name>" and a distinct prominent "<Name>" act exist (e.g. "Darko" -> Darko US [Deathcore] and Darko [UK Melodic Punk]).
   - DO NOT invent, hallucinate, or scour for obscure local bar bands, unreleased bedroom projects, or minor soundcloud profiles just to be a "people pleaser".
   - If there is only one predominant, notable, or famous artist (e.g. "Turnstile", "Radiohead", "Nirvana", "Deftones"), you MUST set 'hasCollision' to false and 'collisions' to an empty array []. A false collision ruins user experience.
3. RE-QUERY BOUNCER & REAL ENTITY CHECK:${hasHints ? `
   - The user has provided specific regional/genre hints ("${hints?.originHint || ''}" / "${hints?.genreHint || ''}").
   - You MUST strictly verify whether a genuine, culturally significant, commercially released musical artist or band named "${artistId}" actually exists matching this specified regional origin or genre.
   - If the recognized artist named "${artistId}" is from an entirely different origin (for example, Gunmoll is an American melodic punk band from Gainesville, Florida, NOT from Japan), and NO notable musical artist by this name exists from "${hints?.originHint || ''}", you MUST return 'isValid: false'.
   - DO NOT hallucinate, bend facts, or people-please by claiming the artist is from "${hints?.originHint || ''}" when they are not, or by inventing a non-existent local act.
   - If a legitimate artist named "${artistId}" from "${hints?.originHint || ''}" DOES exist (either as the unique artist or as a legitimate homonym collision act), set 'isValid: true' and return their real canonical name, accurate origin, and genre.` : `
   - If the entity is a real, recognizable musical artist, band, or label, set 'isValid' to true with full origin, genre, and disambiguationSnippet. If completely unrecognizable even after attempting typo correction, set 'isValid' to false. In this case, 'primary.id' should be the original input and 'origin'/'genre' should be empty strings.`}
4. ZERO GEOGRAPHIC SUFFIX HALLUCINATION (STRICT): NEVER append geographic tags, country names, or regional acronyms (e.g., ' US', ' USA', ' UK', ' Australia') to 'primary.id' unless it is legally and officially part of the artist's real-world band name (e.g., 'Darko US'). Country of origin belongs exclusively in the 'origin' field.`;
  
    const response = await ai.models.generateContent({
      model: currentModel,
      contents: prompt,
      config: {
        systemInstruction: "You are a strict music data validator, canonical band-name normalizer, collision detector, and anti-hallucination bouncer. You do NOT infer intent or people-please. Always return the artist's official published canonical name in primary.id (fixing typos, restoring omitted official leading 'The ' articles such as 'Rocking Horse Winner' -> 'The Rocking Horse Winner' or 'Get Up Kids' -> 'The Get Up Kids', and stripping erroneous 'The ' prefixes from bands like 'Pixies', 'Ramones', 'Talking Heads', or 'Deftones') and set correctedInput: true whenever primary.id differs from the input beyond case. If the user provides an origin hint, verify whether an artist by that name actually exists from that origin; if not, return isValid: false. Only report collisions when there are multiple genuinely prominent, commercially published artists sharing the name. NEVER invent minor artists. Return ONLY valid JSON matching the schema.",
        thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
        responseMimeType: "application/json",
        responseSchema: SEED_VALIDATION_SCHEMA
      }
    });

    const jsonText = response.text?.trim() || "";
    if (!jsonText) throw new Error("Empty validation response");

    const cleanedJsonText = extractCleanJsonString(jsonText);
    const data = JSON.parse(cleanedJsonText);

    const primary = data.primary || { id: artistId, origin: "", genre: "", disambiguationSnippet: "" };
    const rawCollisions: any[] = Array.isArray(data.collisions) ? data.collisions : [];

    // Safeguard: Strip accidental hallucinated geographic suffixes if input didn't contain them
    if (primary.id && typeof primary.id === 'string') {
      const trimmedId = primary.id.trim();
      if (/^(.*?)\s+(?:US|USA|UK|GB)$/i.test(trimmedId)) {
        const stripped = trimmedId.replace(/\s+(?:US|USA|UK|GB)$/i, '').trim();
        if (!/\b(?:US|USA|UK|GB)\b/i.test(artistId)) {
          console.warn(`[validateSeedOriginBackend] Stripped hallucinated geographic suffix from primary.id: "${trimmedId}" -> "${stripped}"`);
          primary.id = stripped;
        }
      }
    }

    const hasCollision = !!(data.isValid && data.hasCollision && rawCollisions.length > 0);
    const candidates: DisambiguationCandidateStub[] = [];

    if (data.isValid) {
      // Build primary candidate
      let primarySlug = normalizeArtistId(primary.id);
      // V25 Root-as-Router Contract & Rule 36: All verified entities with non-global origins resolve to their geographically suffixed ID
      if (primary.origin) {
        const originSlug = extractCountrySlug(primary.origin);
        if (originSlug && originSlug !== 'global' && !primarySlug.endsWith(`-${originSlug}`)) {
          primarySlug = `${primarySlug}-${originSlug}`;
        }
      }
      candidates.push({
        id: primarySlug,
        name: primary.id,
        origin: primary.origin || "Unknown",
        genre: primary.genre || "Unknown",
        disambiguationSnippet: primary.disambiguationSnippet || ""
      });

      // Build collision candidates
      if (hasCollision) {
        for (const col of rawCollisions) {
          if (col && col.id) {
            let colSlug = normalizeArtistId(col.id);
            if (col.origin) {
              const originSlug = extractCountrySlug(col.origin);
              if (originSlug && originSlug !== 'global' && !colSlug.endsWith(`-${originSlug}`)) {
                colSlug = `${colSlug}-${originSlug}`;
              }
            }
            // Avoid duplicate slugs
            if (!candidates.some(c => c.id === colSlug)) {
              candidates.push({
                id: colSlug,
                name: col.id,
                origin: col.origin || "Unknown",
                genre: col.genre || "Unknown",
                disambiguationSnippet: col.disambiguationSnippet || ""
              });
            }
          }
        }
      }
    }
    
    let apiUsage = null;
    if (response.usageMetadata) {
      apiUsage = {
        model: currentModel,
        promptTokenCount: response.usageMetadata.promptTokenCount || 0,
        candidatesTokenCount: response.usageMetadata.candidatesTokenCount || 0,
        totalTokenCount: response.usageMetadata.totalTokenCount || 0,
      };
    }
    
    return {
      id: primary.id || artistId,
      origin: primary.origin || "",
      genre: primary.genre || "",
      isValid: !!data.isValid,
      correctedInput: !!data.correctedInput,
      hasCollision,
      candidates,
      apiUsage
    };
  } catch (err: any) {
    console.error(`[validateSeedOriginBackend] Failed to validate seed ${artistId}:`, err);
    // Bulletproof: We now actively throw the error so the orchestrator's catch block can flag the job as failed
    throw err;
  }
};

export const generateRootsBreakdownBackend = async (
  artists: string,
  detailsCacheEntries: any[],
  usageCollector?: UsageCollector,
  filters?: any
): Promise<{ editorialMarkdown: string; artistSnippets: { id: string; snippet: string }[] } | null> => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not defined in environment secrets.");
  }

  // Phase C — Verbal Identity (Rule 24): late-night record curator voice.
  // V10: Structured JSON output with integrated hooks.
  const systemInstruction = `You are a late-night record curator — the kind of person who pulls an obscure 7" from a crate at 2am and traces exactly why it matters. Your task is to write a Roots Breakdown: a rich, interconnected narrative that maps the musical DNA between a set of seed artists and the deeper ecosystem they inhabit, AND simultaneously generate specific 1-sentence hooks for the key artists involved.

Write like you are guiding someone through a web of sounds, scenes, and moments — not cataloguing data. Use active verbs: map, trace, uncover, connect, explore, pull apart, reassemble. Prioritize discovery over description. Make the reader feel the connections before they understand them.

FORMATTING RULES (non-negotiable):
- Use Markdown throughout the editorialMarkdown field: **bold** key artists, genres, and scenes on first mention.
- Use short, punchy paragraphs. No wall-of-text blocks.
- Use bullet points for dense cross-referencing. No double newlines between bullets.
- Open with a hook — a defining tension or surprising throughline in the ecosystem.
- Close with a synthesis: what does this web of connections reveal that no individual artist makes visible alone?
- For the artistSnippets field, generate an array of objects. Each object must have an 'id' (the canonical artist/label name) and a 'snippet' containing a dedicated, punchy, standalone 1-sentence "epicenter hook". This must be a complete sentence that summarizes their specific role in this exact ecosystem (e.g. "Radiohead was the band staring at the static on the television screen."). Generate a hook for EVERY seed artist and EVERY satellite artist/label you mention.

NEGATIVE CONSTRAINT: NEVER use em-dashes (—) or long hyphens for dramatic effect or clause separation. Use standard editorial punctuation (commas, colons, or semicolons).`;

  const seedList = artists.split('::').map(s => normalizeArtistId(stripCountrySlug(s)));
  const isMultiSeed = seedList.length > 1;

  let seedAnchorInstruction = '';
  if (hasActiveDiscoveryFilters(filters)) {
     const filterDesc = [
        filters.foundedAfter ? `founded AFTER ${filters.foundedAfter}` : '',
        filters.foundedBefore ? `founded BEFORE ${filters.foundedBefore}` : '',
        filters.includeOrigins?.length ? `from origins: ${filters.includeOrigins.join(', ')}` : '',
        filters.excludeOrigins?.length ? `excluding origins: ${filters.excludeOrigins.join(', ')}` : '',
        filters.includeGenres?.length ? `within genres: ${filters.includeGenres.join(', ')}` : '',
        filters.anchorLabels?.length ? `anchored around labels: ${filters.anchorLabels.map((l: string) => sanitizeAnchorLabelInput(l)).filter(Boolean).join(', ')}` : ''
     ].filter(Boolean).join('; ');

     seedAnchorInstruction = `\n\nSEED ANCHOR CONSTRAINT (MANDATORY — 3-TIER ANCHOR SYSTEM): This ecosystem was generated with active 3-Tier Anchors: [${filterDesc}]. Your narrative MUST explicitly frame these spatial/temporal guardrails and scene gravity pulls as the defining thematic lens of the ecosystem (including cross-era or cross-border lineage if the seed artist predates or originates outside the target window). Reference this era, origin, genre, or label constraint as an organizing principle in your opening paragraph. Do NOT write as if this were an unconstrained generation — the filter is a core architectural requirement, not optional context. Failure to acknowledge the filter constraint is a violation of the generation contract.`;
  }

  const coAnchorMandate = isMultiSeed ? 
    `\n\nCRITICAL CO-ANCHOR MANDATE (Rule 27): This is a multi-seed generation for the following equal anchors: ${artists.replace(/::/g, ', ')}. You MUST treat EVERY seed artist as a co-equal foundational anchor. Do not relegate any seed to a "satellite" status or focus the narrative on just one artist due to their fame. The resulting breakdown must weave them together as co-equal pillars of the ecosystem.${seedAnchorInstruction}` : `\n\nCRITICAL ANCHOR MANDATE (Rule 27):${seedAnchorInstruction}`;

  const prompt = `Write the Roots Breakdown for these seed artists: ${artists.replace(/::/g, ', ')}.${coAnchorMandate}

Here is the fully enriched context of all nodes (seeds and deep cuts) in their generated ecosystem:
${JSON.stringify(detailsCacheEntries, null, 2)}`;

  const responseSchema = {
    type: Type.OBJECT,
    properties: {
      editorialMarkdown: {
        type: Type.STRING,
        description: "The main Roots Breakdown narrative in Markdown format.",
      },
      artistSnippets: {
        type: Type.ARRAY,
        description: "A list of punchy 1-sentence epicenter hooks for the seed and satellite artists/labels mentioned in the breakdown.",
        items: {
          type: Type.OBJECT,
          properties: {
            id: { type: Type.STRING, description: "The canonical name of the artist or label." },
            snippet: { type: Type.STRING, description: "A punchy, standalone 1-sentence epicenter hook describing their specific role in this ecosystem." }
          },
          required: ["id", "snippet"]
        }
      }
    },
    required: ["editorialMarkdown", "artistSnippets"]
  };

  const executeSynthesis = async (model: string, thinkingLevel: ThinkingLevel, timeoutMs: number) => {
    const ai = new GoogleGenAI({ 
      apiKey,
      httpOptions: { timeout: timeoutMs }
    });

    let timer: any = null;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error(`Synthesis request timed out after ${timeoutMs}ms for ${model}`));
      }, timeoutMs);
      if (typeof timer?.unref === 'function') timer.unref();
    });

    try {
      const response = await Promise.race([
        ai.models.generateContent({
          model,
          contents: prompt,
          config: {
            systemInstruction,
            thinkingConfig: { thinkingLevel },
            responseMimeType: "application/json",
            responseSchema,
          }
        }),
        timeoutPromise
      ]);

      if (timer) clearTimeout(timer);

      if (usageCollector && response.usageMetadata) {
        usageCollector.push(model, {
          promptTokenCount: response.usageMetadata.promptTokenCount || 0,
          candidatesTokenCount: response.usageMetadata.candidatesTokenCount || 0,
          totalTokenCount: response.usageMetadata.totalTokenCount || 0,
        });
      }

      const text = response.text;
      if (!text) return null;
      const parsed = JSON.parse(text) as { editorialMarkdown: string; artistSnippets: { id: string; snippet: string }[] };
      // V11.6 Fix 1: Unescape literal \n sequences that the structured JSON output mode over-escapes.
      if (parsed?.editorialMarkdown) {
        parsed.editorialMarkdown = parsed.editorialMarkdown.replace(/\\n/g, '\n');
      }
      return parsed;
    } finally {
      if (timer) clearTimeout(timer);
    }
  };

  try {
    // Attempt 1: Gemini 3.1 Pro Preview (high thinking) bounded by 90-second timeout
    return await executeSynthesis("gemini-3.1-pro-preview", ThinkingLevel.HIGH, 90000);
  } catch (proErr: any) {
    console.warn(`[generateRootsBreakdownBackend] 3.1 Pro synthesis failed or timed out (${proErr?.message || proErr}). Engaging instant resilient fallback to ${GEMINI_FLASH_MODEL} (thinking_level: low)...`);
    try {
      // Attempt 2: Resilient Fallback - Gemini 3.6 Flash (low thinking) bounded by 45-second timeout
      const flashResult = await executeSynthesis(GEMINI_FLASH_MODEL, ThinkingLevel.LOW, 45000);
      if (flashResult) {
        console.log(`[generateRootsBreakdownBackend] Resilient Flash fallback succeeded for roots breakdown (${artists}).`);
        return flashResult;
      }
      return null;
    } catch (flashErr: any) {
      console.error("[generateRootsBreakdownBackend] Both 3.1 Pro and Flash fallback failed to generate roots breakdown:", flashErr);
      return null;
    }
  }
};

export const OVERARCHING_ZINE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    overarchingRationale: {
      type: Type.STRING,
      description:
        "A rich Master Overarching Zine Editorial in Markdown weaving or contrasting these distinct musical movements across eras, genres, geographies, and sonic ethos. NEVER fabricate historical collaborations, tours, or label ties, NEVER use literal technical labels like 'Scene 1' or 'Scene 2', and NEVER use em-dashes (—) or long hyphens.",
    },
    crossSceneBridges: {
      type: Type.ARRAY,
      description:
        "Up to 5 grounded cross-scene connections linking a canonical artist/label in one Scene to a distinct canonical artist/label in another Scene. Return 0 to 2 honest stylistic parallel/contrast bridges (or []) if the scenes have no genuine historical lineage—never fabricate ties.",
      items: {
        type: Type.OBJECT,
        properties: {
          sourceSceneId: { type: Type.STRING, description: "e.g., 'scene-1'" },
          targetSceneId: { type: Type.STRING, description: "e.g., 'scene-2'" },
          sourceCanonicalId: { type: Type.STRING, description: "Exact canonical node ID from sourceSceneId" },
          targetCanonicalId: { type: Type.STRING, description: "Exact canonical node ID from targetSceneId" },
          bridgeType: {
            type: Type.STRING,
            enum: ["identity", "sonic_lineage"],
            description:
              "'identity' if the exact same artist/label appears in both scenes; 'sonic_lineage' if connecting two distinct artists/labels across scenes via verified historical lineage OR honest stylistic parallel/contrast.",
          },
          forwardContext: {
            type: Type.STRING,
            description: "3-8 word directional predicate from source to target omitting both endpoint names (Rule 26). Must reflect real lineage or honest stylistic parallel/contrast—never invented collabs or tours.",
          },
          inverseContext: {
            type: Type.STRING,
            description: "3-8 word directional predicate from target to source omitting both endpoint names (Rule 26). Must reflect real lineage or honest stylistic parallel/contrast—never invented collabs or tours.",
          },
          weight: { type: Type.NUMBER },
        },
        required: [
          "sourceSceneId",
          "targetSceneId",
          "sourceCanonicalId",
          "targetCanonicalId",
          "bridgeType",
          "forwardContext",
          "inverseContext",
          "weight",
        ],
      },
    },
  },
  required: ["overarchingRationale", "crossSceneBridges"],
};

/**
 * Sanitizes the raw Overarching Zine Editorial rationale:
 * 1. Normalizes Gemini <br> tags, escape sequences, and excess newlines.
 * 2. Enforces negative constraint against em-dashes (—).
 * 3. Deterministically scrubs and replaces any stray literal "Scene N" labels with the
 *    flagship seed artist or scene movement name so narrative prose remains organic.
 */
export function sanitizeOverarchingRationale(raw: string, scenes: ProjectScene[]): string {
  let cleanRationale = (raw || "")
    .replace(/(?:[ \t]*<\/?br\s*\/?>[ \t]*[\r\n]*)+/gi, "\n\n")
    .replace(/\\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\s*—\s*/g, ", ")
    .trim();

  // Deterministic guard: replace any literal "Scene N" references that slip through LLM generation
  cleanRationale = cleanRationale.replace(/\bScene\s+([1-9]\d*)\b/gi, (match, numStr) => {
    const idx = parseInt(numStr, 10) - 1;
    if (idx >= 0 && idx < scenes.length) {
      const s = scenes[idx];
      const rawSeeds = s.seedArtists || s.curatedSeedArtists || '';
      const firstSeed = rawSeeds ? rawSeeds.split('::')[0].trim() : '';
      if (firstSeed) {
        return firstSeed;
      }
      if (s.customName && !/^Scene\s+\d+$/i.test(s.customName)) {
        return s.customName;
      }
      if (s.title && !/^Scene\s+\d+$/i.test(s.title)) {
        return s.title;
      }
    }
    return 'the corresponding scene';
  });

  if (!cleanRationale && scenes.length > 0) {
    const sceneTitles = scenes.map((s, i) => `**${s.title || `Scene ${i + 1}`}**`).join(" and ");
    cleanRationale = `Across ${sceneTitles}, a shared underground current links these distinct constellations into a single musical continuum.`;
  }

  return cleanRationale;
}

export interface OverarchingQualityAssessment {
  passed: boolean;
  wordCount: number;
  bulletCount: number;
  boldEntityCount: number;
  sonicLineageBridgeCount: number;
  reasons: string[];
}

export function assessOverarchingZineQuality(
  rationale: string,
  validAiBridges: CrossSceneLink[],
  minSonicLineageBridges: number = 2,
  minBoldEntities: number = 10
): OverarchingQualityAssessment {
  const clean = (rationale || "").trim();
  const wordCount = clean ? clean.split(/\s+/).filter(Boolean).length : 0;
  const bulletCount = clean
    .split("\n")
    .filter((l) => /^\s*(\*|-)\s+/.test(l)).length;
  const boldEntityCount = new Set(
    Array.from(clean.matchAll(/\*\*([^*]+)\*\*/g)).map((m) => m[1].trim().toLowerCase())
  ).size;
  const sonicLineageBridgeCount = (validAiBridges || []).filter((b) => {
    if (!b || b.bridgeType !== "sonic_lineage") return false;
    const srcNorm = normalizeCanonicalEntityId(b.sourceCanonicalId || "");
    const tgtNorm = normalizeCanonicalEntityId(b.targetCanonicalId || "");
    if (!srcNorm || !tgtNorm || srcNorm === tgtNorm) return false;
    const srcBare = stripCountrySlug(srcNorm);
    const tgtBare = stripCountrySlug(tgtNorm);
    if (srcBare && tgtBare && srcBare === tgtBare) return false;
    return true;
  }).length;

  const reasons: string[] = [];
  if (wordCount < 280) reasons.push(`wordCount=${wordCount} (<280)`);
  if (bulletCount < 3) reasons.push(`bulletCount=${bulletCount} (<3)`);
  if (boldEntityCount < minBoldEntities) {
    reasons.push(`boldEntityCount=${boldEntityCount} (<${minBoldEntities})`);
  }
  if (minSonicLineageBridges > 0 && sonicLineageBridgeCount < minSonicLineageBridges) {
    reasons.push(`sonicLineageBridgeCount=${sonicLineageBridgeCount} (<${minSonicLineageBridges})`);
  }

  return {
    passed: reasons.length === 0,
    wordCount,
    bulletCount,
    boldEntityCount,
    sonicLineageBridgeCount,
    reasons,
  };
}

export const generateOverarchingZineBackend = async (
  scenes: ProjectScene[],
  detailsCache?: Record<string, any>,
  usageCollector?: UsageCollector
): Promise<{ overarchingRationale: string; crossSceneLinks: CrossSceneLink[] }> => {
  const deterministicBridges = computeDeterministicIdentityBridges(scenes);
  if (!Array.isArray(scenes) || scenes.length < 2) {
    return {
      overarchingRationale: "",
      crossSceneLinks: deterministicBridges,
    };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not defined in environment secrets.");
  }

  // Build scene-by-scene lookup tables for strict endpoint verification & directional sanitization ([Rule 26], [Rule 44])
  const sceneNodeLookup = new Map<string, Map<string, { canonicalId: string; label: string; type: string }>>();
  const sceneSummaries = scenes.map((scene, idx) => {
    const sceneId = scene.sceneId || `scene-${idx + 1}`;
    const nodeMap = new Map<string, { canonicalId: string; label: string; type: string }>();
    const validEntities: Array<{ canonicalId: string; label: string; type: string; isSeed: boolean; bioSnippet?: string }> = [];

    for (const n of scene.graphData?.nodes || []) {
      if (n.type !== "artist" && n.type !== "label") continue;
      const canonId = stripSceneNamespace(n.canonicalId || n.id);
      const normId = normalizeCanonicalEntityId(canonId);
      const bareId = stripCountrySlug(normId);
      const label = n.label || titleCaseArtistId(stripCountrySlug(canonId));
      nodeMap.set(canonId, { canonicalId: canonId, label, type: n.type });
      nodeMap.set(normId, { canonicalId: canonId, label, type: n.type });

      const cachedEntry = detailsCache?.[canonId] || detailsCache?.[normId] || (bareId ? detailsCache?.[bareId] : undefined);
      const sceneSnippet =
        scene.artistSnippets?.[canonId] ||
        scene.artistSnippets?.[normId] ||
        (bareId ? scene.artistSnippets?.[bareId] : undefined) ||
        scene.artistSnippets?.[label];
      validEntities.push({
        canonicalId: canonId,
        label,
        type: n.type,
        isSeed: Boolean(n.isSceneSeed || n.isSeed),
        bioSnippet:
          sceneSnippet ||
          n.narrativeSnippet ||
          cachedEntry?.recommendationReason ||
          (typeof cachedEntry?.summary === "string" ? cachedEntry.summary.slice(0, 180) : undefined),
      });
    }
    sceneNodeLookup.set(sceneId, nodeMap);

    return {
      sceneId,
      sceneNumber: idx + 1,
      title: scene.title || scene.seedArtists?.replace(/::/g, " + ") || `Scene ${idx + 1}`,
      seedArtists: (scene.seedArtists || "").split("::").filter(Boolean),
      discoveryFilters: scene.discoveryFilters || {},
      sceneEditorialSummary: (scene.synthesisRationale || "").slice(0, 2400),
      validArtistAndLabelNodes: validEntities,
    };
  });

  let totalEntityCount = 0;
  const allUniqueBareEntities = new Set<string>();
  const sceneEntityBareSets = sceneSummaries.map((s) => {
    totalEntityCount += s.validArtistAndLabelNodes.length;
    return new Set(
      s.validArtistAndLabelNodes.map((e) => {
        const norm = normalizeCanonicalEntityId(e.canonicalId);
        const bare = stripCountrySlug(norm) || norm;
        allUniqueBareEntities.add(bare);
        return bare;
      })
    );
  });
  let distinctCrossScenePairCapacity = 0;
  for (let i = 0; i < sceneEntityBareSets.length; i++) {
    for (let j = i + 1; j < sceneEntityBareSets.length; j++) {
      for (const a of sceneEntityBareSets[i]) {
        for (const b of sceneEntityBareSets[j]) {
          if (a !== b) distinctCrossScenePairCapacity++;
        }
      }
    }
  }
  // V45.9 Overlap-aware & roster-scaled quality floors:
  // - Never force fabricated bridges when scenes share 0 deterministic entities (unrelated/clashing scenes).
  // - When deterministic overlap exists, enforce >= 2 grounded bridges (protecting against coincidental major-label overlap
  //   while still rejecting sparse 1-bridge Direct Hit regressions and encouraging 3-5 bridges in the prompt).
  // - Scale bolded entity floor smoothly on sparse/niche rosters while keeping >= 10 on standard rosters.
  const effectiveMinBoldEntities = Math.min(10, Math.max(4, Math.floor(allUniqueBareEntities.size * 0.5)));
  const effectiveMinSonicBridges =
    deterministicBridges.length === 0 ? 0 : Math.min(2, distinctCrossScenePairCapacity);
  const wordTargetRange = scenes.length >= 4 ? "360 to 540" : "320 to 450";
  const blockStructureGuidance =
    scenes.length >= 4
      ? "5 to 6 semantic blocks (4 to 5 narrative paragraphs followed by the final closing bullet block)"
      : "4 semantic blocks for 2-scene boards (or 4 to 5 blocks for 3-scene boards)";
  const boldTargetCount = Math.min(12, Math.max(effectiveMinBoldEntities + 2, 6));

  const systemInstruction = `You are a late-night record curator — the kind of person who pulls an obscure 7" from a crate at 2am and illuminates how separate musical movements, eras, and scenes either connect through shared lineage or illuminate each other through sharp contrast.
Your task is to write the Overarching Zine Editorial (Master Multi-Scene Synthesis) for a multi-scene Zcene board containing ${scenes.length} distinct Scenes, AND identify up to 5 grounded 'sonic_lineage' cross-scene bridges linking DISTINCT artists or record labels across different Scenes (aiming for 3 to 5 when genuine historical lineage exists, or 0 to 2 honest stylistic parallels/contrasts—or []—if the movements are historically unrelated).

FACTUAL RESTRAINT & ANTI-FABRICATION (NON-NEGOTIABLE):
- NEVER fabricate collaborations, tours, shared band members, record label signings, or direct historical influence between artists or scenes that did not actually interact.
- ONLY cite artists and record labels that appear in the provided scene rosters (plus accurate genres, cities, eras, and movements).
- If two scenes come from unrelated eras, geographies, or genres with zero historical overlap, NEVER force a fictional lineage. Instead, frame the editorial honestly through aesthetic contrast, sonic polarity, parallel DIY/independent ethos, or opposing cultural philosophies.

FORMATTING & EDITORIAL RULES (Rule 24 & Rule 44 — non-negotiable):
- LENGTH & 3-COLUMN MAGAZINE RHYTHM: Write ${wordTargetRange} words in Markdown for 'overarchingRationale', structured as ${blockStructureGuidance} so Zcene's 3-column print layout balances evenly:
  1. Block 1 (Paragraph 1): Hook and foundational movement arc establishing the opening constellation's ethos, geography, and imprint infrastructure.
  2. Block 2 (Paragraph 2): Cross-scene pivot—either tracing real bridging artists, shared labels, and structural evolution where scenes intersect, OR articulating the stark sonic/cultural contrast where distant scenes diverge.
  3. Block 3 (Paragraph 3, plus optional additional narrative paragraph(s) on 3+ scene boards): The counterpart/transformation chapter exploring how the subsequent constellation(s) either absorb and mutate the lineage or represent an opposing sonic pole.
  4. Final Block (Closing Synthesis + 3 Bullets): A concise 1-sentence colon lead-in followed immediately (no blank line before bullets) by exactly 3 punchy Markdown bullet points ('* ...') distilling the label infrastructure, key artist peers, and overarching lineage or comparative contrast across the board.
- ENTITY COVERAGE FLOOR: **Bold** at least ${boldTargetCount} distinct artists, record labels, genres, and movements on first mention across ALL scenes (drawing from secondary peers and independent labels in the provided rosters, not just the root artists).
- NEGATIVE CONSTRAINT: NEVER use literal technical or UI labels such as "Scene 1", "Scene 2", "Scene 3", "Scene N", or temporary tab names in the narrative prose. Instead, refer to each constellation organically by its flagship seed artists, genres, regional undergrounds, and eras (e.g., "the East Bay punk explosion", "the Bakersfield Nu Metal vanguard", "Oxford's cerebral alternative movement").
- NEGATIVE CONSTRAINT: NEVER use em-dashes (—) or long hyphens for dramatic effect or clause separation. Use standard editorial punctuation (commas, colons, or semicolons).
- CROSS-SCENE BRIDGES (GROUNDED & NON-DUPLICATIVE): Deterministic 'identity' bridges (exact same artist/label appearing in both scenes) are ALREADY computed automatically and listed below. Do NOT repeat those identity pairs. Return up to 5 NEW 'sonic_lineage' bridges where 'sourceCanonicalId' !== 'targetCanonicalId' and 'sourceSceneId' !== 'targetSceneId', referencing exact IDs from the provided rosters. Aim for 3 to 5 strong lineage bridges when scenes share real history; when scenes are historically unrelated, ONLY include honest stylistic parallel/contrast bridges (or return [] rather than inventing history).
- Each bridge's 'forwardContext' and 'inverseContext' MUST be a concise 3-to-8 word directional verb/prepositional predicate phrase OMITTING both endpoint names (Rule 26)—using real lineage phrasing when historically true (e.g., "passed the melodic post-hardcore torch to" / "inherited the melodic post-hardcore blueprint from") OR honest contrast/parallel phrasing when scenes are unrelated (e.g., "contrasts warm analog soul devotion against" / "counters raw Nordic extremity with"). Never output generic "is connected to".`;

  const prompt = `Synthesize the Overarching Zine Editorial and Cross-Scene Bridges across these ${scenes.length} Scenes:

${JSON.stringify(sceneSummaries, null, 2)}

Deterministic Shared-Entity Bridges Already Detected (already wired — do NOT repeat these pairs; return up to 5 grounded distinct 'sonic_lineage' bridges, or [] if the scenes are historically unrelated):
${JSON.stringify(
  deterministicBridges.map((b) => ({
    sourceSceneId: b.sourceSceneId,
    targetSceneId: b.targetSceneId,
    sourceCanonicalId: b.sourceCanonicalId,
    targetCanonicalId: b.targetCanonicalId,
    bridgeType: b.bridgeType,
    forwardContext: b.forwardContext,
  })),
  null,
  2
)}`;

  const executeOverarchingSynthesis = async (
    model: string,
    thinkingLevel: ThinkingLevel,
    timeoutMs: number,
    promptContents: string = prompt
  ): Promise<{ overarchingRationale: string; crossSceneBridges: any[] } | null> => {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: { timeout: timeoutMs },
    });

    let timer: any = null;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error(`Overarching Zine synthesis timed out after ${timeoutMs}ms for ${model}`));
      }, timeoutMs);
      if (typeof timer?.unref === "function") timer.unref();
    });

    try {
      const response = await Promise.race([
        ai.models.generateContent({
          model,
          contents: promptContents,
          config: {
            systemInstruction,
            thinkingConfig: { thinkingLevel },
            responseMimeType: "application/json",
            responseSchema: OVERARCHING_ZINE_SCHEMA,
          },
        }),
        timeoutPromise,
      ]);

      if (timer) clearTimeout(timer);

      if (usageCollector && response.usageMetadata) {
        usageCollector.push(model, {
          promptTokenCount: response.usageMetadata.promptTokenCount || 0,
          candidatesTokenCount: response.usageMetadata.candidatesTokenCount || 0,
          totalTokenCount: response.usageMetadata.totalTokenCount || 0,
        });
      }

      const text = response.text;
      if (!text) return null;
      const cleaned = extractCleanJsonString(text);
      const parsed = JSON.parse(cleaned);
      return parsed;
    } finally {
      if (timer) clearTimeout(timer);
    }
  };

  const buildValidAiBridges = (rawBridges: any[] | undefined): CrossSceneLink[] => {
    const valid: CrossSceneLink[] = [];
    for (const rawBridge of rawBridges || []) {
      if (!rawBridge || !rawBridge.sourceSceneId || !rawBridge.targetSceneId) continue;
      if (rawBridge.sourceSceneId === rawBridge.targetSceneId) continue;

      const srcSceneMap = sceneNodeLookup.get(rawBridge.sourceSceneId);
      const tgtSceneMap = sceneNodeLookup.get(rawBridge.targetSceneId);
      if (!srcSceneMap || !tgtSceneMap) continue;

      const srcRaw = stripSceneNamespace(rawBridge.sourceCanonicalId || "");
      const tgtRaw = stripSceneNamespace(rawBridge.targetCanonicalId || "");
      const srcEntry = srcSceneMap.get(srcRaw) || srcSceneMap.get(normalizeCanonicalEntityId(srcRaw));
      const tgtEntry = tgtSceneMap.get(tgtRaw) || tgtSceneMap.get(normalizeCanonicalEntityId(tgtRaw));
      if (!srcEntry || !tgtEntry) continue;

      const cleanForward =
        sanitizeDirectionalLinkContext(rawBridge.forwardContext, srcEntry.label, tgtEntry.label) ||
        "bridges sonic lineage across scenes with";
      const cleanInverse =
        sanitizeDirectionalLinkContext(rawBridge.inverseContext, tgtEntry.label, srcEntry.label) ||
        cleanForward;

      const sourceNodeId = namespaceSceneNodeId(rawBridge.sourceSceneId, srcEntry.canonicalId);
      const targetNodeId = namespaceSceneNodeId(rawBridge.targetSceneId, tgtEntry.canonicalId);

      const srcNorm = normalizeCanonicalEntityId(srcEntry.canonicalId);
      const tgtNorm = normalizeCanonicalEntityId(tgtEntry.canonicalId);
      const srcBare = stripCountrySlug(srcNorm);
      const tgtBare = stripCountrySlug(tgtNorm);
      const isSameCanonical =
        srcEntry.canonicalId === tgtEntry.canonicalId ||
        srcNorm === tgtNorm ||
        Boolean(srcBare && tgtBare && srcBare === tgtBare);

      valid.push({
        id: `${sourceNodeId}--${targetNodeId}`,
        sourceSceneId: rawBridge.sourceSceneId,
        targetSceneId: rawBridge.targetSceneId,
        sourceNodeId,
        targetNodeId,
        sourceCanonicalId: srcEntry.canonicalId,
        targetCanonicalId: tgtEntry.canonicalId,
        bridgeType: isSameCanonical || rawBridge.bridgeType === "identity" ? "identity" : "sonic_lineage",
        forwardContext: cleanForward,
        inverseContext: cleanInverse,
        weight: typeof rawBridge.weight === "number" ? Math.max(0.1, Math.min(1.0, rawBridge.weight)) : 0.85,
      });
    }
    return valid;
  };

  let rawResult: { overarchingRationale: string; crossSceneBridges: any[] } | null = null;
  let activeModel = "gemini-3.1-pro-preview";
  let activeThinkingLevel: ThinkingLevel = ThinkingLevel.HIGH;
  try {
    rawResult = await executeOverarchingSynthesis(activeModel, activeThinkingLevel, 90000);
  } catch (proErr: any) {
    console.warn(
      `[generateOverarchingZineBackend] 3.1 Pro synthesis failed or timed out (${proErr?.message || proErr}). Engaging resilient fallback to ${GEMINI_FLASH_MODEL} (thinking_level: low)...`
    );
    activeModel = GEMINI_FLASH_MODEL;
    activeThinkingLevel = ThinkingLevel.LOW;
    try {
      rawResult = await executeOverarchingSynthesis(activeModel, activeThinkingLevel, 45000);
    } catch (flashErr: any) {
      console.error("[generateOverarchingZineBackend] Both 3.1 Pro and Flash fallback failed:", flashErr);
    }
  }

  let cleanRationale = sanitizeOverarchingRationale(rawResult?.overarchingRationale || "", scenes);
  let validAiBridges = buildValidAiBridges(rawResult?.crossSceneBridges);

  // V45.8 / V45.9 Deterministic Quality Gate & Bounded Single Corrective Retry:
  // Enforces editorial parity (length, 3-column bullet rhythm, roster-scaled bold entities)
  // and overlap-aware bridge floors without ever pressuring fabricated history on unrelated scenes.
  if (rawResult && totalEntityCount >= 8 && distinctCrossScenePairCapacity >= 3) {
    const attempt1Assessment = assessOverarchingZineQuality(
      cleanRationale,
      validAiBridges,
      effectiveMinSonicBridges,
      effectiveMinBoldEntities
    );
    if (!attempt1Assessment.passed) {
      console.warn(
        `[generateOverarchingZineBackend] Quality gate triggered single corrective retry (${attempt1Assessment.reasons.join(", ")}).`
      );
      const bridgeRepairLine =
        effectiveMinSonicBridges > 0
          ? `- Return ${effectiveMinSonicBridges} to 5 NEW grounded 'sonic_lineage' bridges linking DISTINCT entities across different scenes (sourceCanonicalId !== targetCanonicalId; do NOT repeat already-detected identity bridges).`
          : `- Keep 'crossSceneBridges' strictly grounded (0 to 2 honest stylistic parallel/contrast bridges, or [] if the scenes are historically unrelated).`;
      const repairPrompt = `${prompt}

QUALITY GATE CORRECTION REQUIRED (Attempt 2):
Your previous draft did not meet Zcene's editorial parity floor because: ${attempt1Assessment.reasons.join("; ")}.
Please produce a complete, upgraded replacement that fixes the failed structural/parity criteria WITHOUT inventing facts:
- Ensure 'overarchingRationale' is ${wordTargetRange} words (strictly >= 280 words) with ${blockStructureGuidance}, ending with a 1-sentence colon lead-in followed immediately by 3 Markdown bullets ('* ...').
- Bold at least ${boldTargetCount} distinct artists, record labels, genres, and movements drawn strictly from the provided rosters across ALL scenes.
${bridgeRepairLine}
- ANTI-FABRICATION RULE: NEVER invent collaborations, tours, shared members, label ties, or historical influence. If scenes are historically unrelated, expand through rich comparative contrast of their real rosters, eras, and sonic ethos.`;

      try {
        const retryResult = await executeOverarchingSynthesis(
          activeModel,
          activeThinkingLevel,
          75000,
          repairPrompt
        );
        if (retryResult) {
          const retryRationale = sanitizeOverarchingRationale(retryResult.overarchingRationale || "", scenes);
          const retryBridges = buildValidAiBridges(retryResult.crossSceneBridges);
          const attempt2Assessment = assessOverarchingZineQuality(
            retryRationale,
            retryBridges,
            effectiveMinSonicBridges,
            effectiveMinBoldEntities
          );

          const scoreCandidate = (a: OverarchingQualityAssessment): [number, number, number] => [
            4 - a.reasons.length,
            effectiveMinSonicBridges > 0 ? a.sonicLineageBridgeCount : 0,
            a.wordCount,
          ];
          const [c1, b1, w1] = scoreCandidate(attempt1Assessment);
          const [c2, b2, w2] = scoreCandidate(attempt2Assessment);
          const isAttempt2Better =
            c2 > c1 || (c2 === c1 && (b2 > b1 || (b2 === b1 && w2 > w1)));

          if (isAttempt2Better) {
            console.log(
              `[generateOverarchingZineBackend] Corrective retry accepted (words: ${attempt1Assessment.wordCount}->${attempt2Assessment.wordCount}, bullets: ${attempt1Assessment.bulletCount}->${attempt2Assessment.bulletCount}, sonicBridges: ${attempt1Assessment.sonicLineageBridgeCount}->${attempt2Assessment.sonicLineageBridgeCount}).`
            );
            cleanRationale = retryRationale;
            validAiBridges = retryBridges;
          } else {
            console.warn(
              `[generateOverarchingZineBackend] Corrective retry did not beat attempt 1; retaining attempt 1.`
            );
          }
        }
      } catch (retryErr: any) {
        console.warn(
          `[generateOverarchingZineBackend] Corrective retry failed (${retryErr?.message || retryErr}); gracefully retaining attempt 1.`
        );
      }
    }
  }

  const finalCrossSceneLinks = mergeCrossSceneLinks(deterministicBridges, validAiBridges);

  return {
    overarchingRationale: cleanRationale,
    crossSceneLinks: finalCrossSceneLinks,
  };
};

// Phase B — Topology Parity (Rule 23): Narrative-to-Graph Edge Reconciliation.
// Audits the Root Breakdown narrative against the existing graph edges and returns
// any artist-to-artist connections explicitly cited in the text that are missing from
// finalGraph.links. Both source and target must exist in the provided node list.
// Uses GEMINI_FLASH_MODEL with structured JSON output for deterministic parsing.
export interface ReconciliationEdge {
  source: string;         // nodeId exactly as it appears in the node list
  target: string;         // nodeId exactly as it appears in the node list
  forwardContext: string; // concise 3-8 word predicate from source -> target (omitting both names)
  inverseContext: string; // concise 3-8 word predicate from target -> source (omitting both names)
  weight: number;         // semantic strength 0.1–1.0
}

export const reconcileNarrativeEdges = async (
  apiKey: string,
  narrative: string,
  nodes: Array<{ id: string; type: string; label?: string }>,
  existingLinks: Array<{ source: string; target: string }>,
  usageCollector: UsageCollector
): Promise<ReconciliationEdge[]> => {
  if (!narrative || !narrative.trim() || nodes.length === 0) return [];

  const currentModel = GEMINI_FLASH_MODEL;
  const ai = new GoogleGenAI({ apiKey, httpOptions: { timeout: 120000 } });

  // Build a deduplicated set of existing edge keys for efficient exclusion
  const existingEdgeSet = new Set<string>(
    existingLinks.map(l => [l.source, l.target].sort().join('--'))
  );

  const labelById = new Map<string, string>();
  for (const n of nodes) {
    if (n?.id) {
      labelById.set(n.id, n.label || stripCountrySlug(n.id));
    }
  }

  // Only expose artist/label nodes — metadata petals are not valid edge endpoints
  const artistNodes = nodes
    .filter(n => n.type === 'artist' || n.type === 'label')
    .map(n => n.id);

  if (artistNodes.length < 2) return [];

  const prompt = `You are auditing a music graph for missing edges.

Below is the Root Breakdown narrative generated for this graph, followed by the complete list of valid node IDs and the edges that already exist.

Your task: identify connections between artists/labels that are EXPLICITLY stated or directly implied in the narrative text but are MISSING from the existing edges list. Only return edges where BOTH the source and target appear verbatim in the Valid Node IDs list. Do not invent connections that are not in the text.

--- NARRATIVE ---
${narrative}

--- VALID NODE IDs (artist/label only) ---
${JSON.stringify(artistNodes)}

--- EXISTING EDGES (already in graph, do NOT repeat these) ---
${JSON.stringify(existingLinks.map(l => `${l.source} → ${l.target}`))}

Return a JSON array of missing edges. For each missing edge provide:
- source: the exact node ID from the valid list
- target: the exact node ID from the valid list  
- forwardContext: a concise 3 to 8 word directional verb/prepositional predicate phrase from source to target grounded in the narrative, OMITTING both artist/label names so the UI bullet "• {Capitalized forwardContext} {TargetName}" reads naturally (e.g. "kept explosive live rock energy alive alongside", "traded stadium rock hooks with", "refined emotional arena balladry alongside"). NEVER output generic "is connected to" and NEVER include the source or target artist names in the phrase.
- inverseContext: a concise 3 to 8 word directional verb/prepositional predicate phrase from target to source reversing or mirroring the relationship, OMITTING both artist/label names so "• {Capitalized inverseContext} {SourceName}" reads naturally.
- weight: a float 0.1–1.0 representing connection strength (1.0 = defining influence, 0.1 = loose mention)

If no missing edges are found, return an empty array [].`;

  const responseSchema = {
    type: Type.ARRAY,
    description: "Missing narrative edges not yet present in the graph.",
    items: {
      type: Type.OBJECT,
      properties: {
        source: {
          type: Type.STRING,
          description: "Exact source node ID from the valid node list."
        },
        target: {
          type: Type.STRING,
          description: "Exact target node ID from the valid node list."
        },
        forwardContext: {
          type: Type.STRING,
          description: "3-8 word directional predicate phrase from source to target omitting both artist/label names (e.g. 'kept explosive live energy alive alongside'). Never 'is connected to'."
        },
        inverseContext: {
          type: Type.STRING,
          description: "3-8 word directional predicate phrase from target to source omitting both artist/label names (e.g. 'kept explosive live energy alive alongside'). Never 'is connected to'."
        },
        weight: {
          type: Type.NUMBER,
          description: "Semantic weight 0.1 (loose) to 1.0 (core defining connection)."
        }
      },
      required: ["source", "target", "forwardContext", "inverseContext", "weight"]
    }
  };

  try {
    const response = await ai.models.generateContent({
      model: currentModel,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema,
        thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
      }
    });

    if (response.usageMetadata) {
      usageCollector.push(currentModel, {
        promptTokenCount: response.usageMetadata.promptTokenCount || 0,
        candidatesTokenCount: response.usageMetadata.candidatesTokenCount || 0,
        totalTokenCount: response.usageMetadata.totalTokenCount || 0,
      });
    }

    const text = response.text;
    if (!text) return [];

    const parsed: any[] = JSON.parse(text);

    // Final safety pass: enforce that both endpoints exist in our node list,
    // that the edge is not already present, and sanitize directional contexts.
    const artistNodeSet = new Set(artistNodes);
    const validEdges: ReconciliationEdge[] = [];

    for (const edge of parsed) {
      if (!edge || !artistNodeSet.has(edge.source) || !artistNodeSet.has(edge.target)) continue;
      if (edge.source === edge.target) continue;
      const key = [edge.source, edge.target].sort().join('--');
      if (existingEdgeSet.has(key)) continue;
      existingEdgeSet.add(key);

      const srcLabel = labelById.get(edge.source) || edge.source;
      const tgtLabel = labelById.get(edge.target) || edge.target;

      const cleanForward =
        sanitizeDirectionalLinkContext(edge.forwardContext, srcLabel, tgtLabel) ||
        sanitizeDirectionalLinkContext(edge.context, srcLabel, tgtLabel) ||
        "highlighted in this scene alongside";
      const cleanInverse =
        sanitizeDirectionalLinkContext(edge.inverseContext, tgtLabel, srcLabel) ||
        sanitizeDirectionalLinkContext(edge.context, tgtLabel, srcLabel) ||
        cleanForward;

      validEdges.push({
        source: edge.source,
        target: edge.target,
        forwardContext: cleanForward,
        inverseContext: cleanInverse,
        weight: typeof edge.weight === "number" ? edge.weight : 0.6,
      });
    }

    return validEdges;
  } catch (error) {
    console.error("[reconcileNarrativeEdges] Failed to reconcile narrative edges:", error);
    return [];
  }
};

export const generateGraphDataBackend = async (
  artists: string,
  filters?: DiscoveryFilters,
  cachedSubgraphsContext?: string,
  baseGraph?: GraphData,
  disambiguationHints?: Record<string, string>,
  _isTier2FallbackRetry: boolean = false
): Promise<{ graphData: GraphData; apiUsage?: any }> => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not defined in environment secrets.");
  }

  const ai = new GoogleGenAI({ 
    apiKey,
    httpOptions: { timeout: 300000 } // 5 minutes
  });
  const currentModel = "gemini-3.1-pro-preview";
  const artistList = artists.split('::').map(a => a.trim()).filter(Boolean);

  let userPrompt: string;
  let systemInstruction: string;

  const isEnhancement = baseGraph && baseGraph.nodes && baseGraph.nodes.length > 0;
  const isMultiSeed = artistList.length > 1;
  
  // Reinforce schema with dynamic descriptions if filters exist
  const dynamicSchema = JSON.parse(JSON.stringify(GRAPH_RESPONSE_SCHEMA));
  if (filters?.foundedAfter) {
      dynamicSchema.properties.nodes.description += ` MANDATORY: All NEW artists MUST have been founded in ${filters.foundedAfter} or LATER.`;
  }
  if (filters?.foundedBefore) {
      dynamicSchema.properties.nodes.description += ` MANDATORY: All NEW artists MUST have been founded in ${filters.foundedBefore} or EARLIER.`;
  }

  if (isMultiSeed) {
      systemInstruction = GENERATE_MULTI_SEED_GRAPH_PROMPT_TEMPLATE
          .replace('{{artists}}', artists);
      userPrompt = `Explore the genuine cultural, historical, and musical intersection of these seed artists: ${artists} from a blank slate. Map their crossover bridge and native scene ecosystems.`;
  } else if (isEnhancement) {
      const existingNodeIds = baseGraph!.nodes.map(n => `"${n.id}" (${n.type})`).join(', ');
      systemInstruction = GENERATE_GRAPH_WITH_CONTEXT_PROMPT_TEMPLATE
          .replace('{{existingNodeIds}}', existingNodeIds);
      userPrompt = `Enhance the graph for these seed artists: ${artists}.`;
  } else {
      systemInstruction = GENERATE_GRAPH_PROMPT_TEMPLATE;
      userPrompt = `Generate a music graph for these seed artists: ${artists}.`;
  }

  // Inject 3-Tier Anchor System (Architecture V30 / Rule 41) into System Instruction
  if (hasActiveDiscoveryFilters(filters) && filters) {
      let filterRules = "\n\n3-TIER ANCHOR HIERARCHY & DISCOVERY CONSTRAINTS (RULE 41):";
      filterRules += `\n- LEVEL 1 (SACRED SEED IMMUNITY): The seed artists [${artists}] are the sacred genesis of the spiderweb and are 100% IMMUNE to all secondary Era, Origin, Genre, and Label filters. Always include them and their authentic metadata.`;

      if (hasActiveTier2Filters(filters)) {
          filterRules += "\n\n- LEVEL 2 (HARD SPATIAL & TEMPORAL GUARDRAILS — ZERO-TOLERANCE):";
          filterRules += "\n  Every NEW recommended artist you add MUST strictly obey these hard boundaries. Cross-era and cross-border lineage is explicitly authorized: if a seed artist predates or originates outside the target window, map their cross-era/cross-border influence, spiritual successors, and musical lineage inside the target window.";
          if (filters.foundedAfter) {
              filterRules += `\n  * MANDATORY ERA FLOOR: Every NEW artist you add MUST have been founded in the year ${filters.foundedAfter} or LATER.`;
              const forbiddenYear = filters.foundedAfter - 1;
              filterRules += `\n  * FORBIDDEN: Do not include any new artists founded in ${forbiddenYear} or earlier.`;
          }
          if (filters.foundedBefore) {
              filterRules += `\n  * MANDATORY ERA CEILING: Every NEW artist you add MUST have been founded in the year ${filters.foundedBefore} or EARLIER.`;
              const forbiddenYear = filters.foundedBefore + 1;
              filterRules += `\n  * FORBIDDEN: Do not include any new artists founded in ${forbiddenYear} or later.`;
          }
          if (filters.includeOrigins && filters.includeOrigins.length > 0) {
              filterRules += `\n  * ORIGIN MANDATE: Only include new artists from: ${filters.includeOrigins.join(', ')}.`;
          }
          if (filters.excludeOrigins && filters.excludeOrigins.length > 0) {
              filterRules += `\n  * FORBIDDEN ORIGINS: Strictly exclude all new artists from: ${filters.excludeOrigins.join(', ')}.`;
          }
      }

      if (hasActiveTier3Filters(filters)) {
          filterRules += "\n\n- LEVEL 3 (SOFT SCENE GRAVITY & GRACEFUL DEGRADATION — RULE 41):";
          if (filters.includeGenres && filters.includeGenres.length > 0) {
              filterRules += `\n  * CANONICAL GENRE GRAVITY: Strongly prioritize new artists connected to these genres: ${filters.includeGenres.join(', ')}.`;
          }
          if (filters.anchorLabels && filters.anchorLabels.length > 0) {
              const sanitizedLabels = filters.anchorLabels.map(l => sanitizeAnchorLabelInput(l)).filter(Boolean);
              if (sanitizedLabels.length > 0) {
                  filterRules += `\n  * ANCHOR LABEL GRAVITY: Strongly prioritize new artists released on or connected to these record labels: ${sanitizedLabels.join(', ')}, and include their 'label' node(s) where authentic.`;
              }
          }
          filterRules += "\n  * GRACEFUL DEGRADATION MANDATE: Level 2 Era and Origin guardrails ALWAYS supersede Level 3 Genre and Label gravity. If a Level 3 genre or record label has zero authentic artists inside the Level 2 Era/Origin window, DO NOT violate Level 2 and DO NOT return an empty graph. Silently bypass the conflicting Level 3 constraint and complete the spiderweb using Level 1 and Level 2.";
      }

      filterRules += "\n\nIMPORTANT: Do NOT include any search citations or footnotes. The JSON must be clean.";
      filterRules += "\n\nCAPACITY LIMIT: You MUST NOT generate more than 12-15 NEW artist nodes. Including metadata nodes, do not exceed 60 nodes in total. Quality over quantity.";
      filterRules += "\n\nFINAL VERIFICATION: Audit your list. If any new artist violates a Level 2 Era or Origin guardrail above, delete them.";
      filterRules += "\n\nID SANITIZATION (CRITICAL): The `id` string for all nodes in the JSON graph MUST be the exact, canonical ID for the entity. NEVER concatenate, append, or inject any filter strings, era tags, genre tags, or label tags (e.g. `after:`, `before:`, `genre:`, `inc_genres:`, `inc_origins:`, `exc_origins:`, `label:`, `inc_labels:`, `anchor_labels:`) onto the `id` field. For example, use `id: 'spaced-us'`, NEVER `id: 'spaced-us-after:2019'`. Failure to follow this rule corrupts the global database.";
      
      systemInstruction += filterRules;
      
      let reminder = `\n\nREMINDER: All new artists MUST obey the active 3-Tier Anchors:`;
      if (filters.foundedAfter) reminder += ` founded in ${filters.foundedAfter} or later;`;
      if (filters.foundedBefore) reminder += ` founded in ${filters.foundedBefore} or earlier;`;
      if (filters.includeOrigins?.length) reminder += ` origin in [${filters.includeOrigins.join(', ')}];`;
      if (filters.excludeOrigins?.length) reminder += ` excluding origins [${filters.excludeOrigins.join(', ')}];`;
      if (filters.includeGenres?.length) reminder += ` soft genre pull [${filters.includeGenres.join(', ')}];`;
      if (filters.anchorLabels?.length) reminder += ` soft label pull [${filters.anchorLabels.map(l => sanitizeAnchorLabelInput(l)).filter(Boolean).join(', ')}];`;
      userPrompt += reminder;
  }

  // [Disambiguation Gate] Inject user-confirmed identity constraint when present.
  if (disambiguationHints && Object.keys(disambiguationHints).length > 0) {
    const hintBlock = Object.values(disambiguationHints).join('\n');
    systemInstruction += `\n\nDISAMBIGUATION CONSTRAINTS (MANDATORY — DO NOT OVERRIDE):\n${hintBlock}`;
  }

  // Apply system instruction to the prompt template artists
  const finalizedSystemInstruction = systemInstruction.replace(/{{artists}}/g, artists);

  let jsonText = "";
  let data: GraphData | null = null;
  let finalApiUsage: any = null;
  let attempts = 0;
  const MAX_ATTEMPTS = 3;

  while (attempts < MAX_ATTEMPTS && !data) {
    try {
      const response = await ai.models.generateContent({
        model: currentModel,
        contents: userPrompt,
        config: {
          systemInstruction: finalizedSystemInstruction,
          thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
          maxOutputTokens: 12000,
          responseMimeType: "application/json",
          responseSchema: dynamicSchema
        }
      });

      jsonText = response.text?.trim() || "";
      if (!jsonText) throw new Error("The AI returned an empty response.");

      if (response.usageMetadata) {
        finalApiUsage = {
          model: currentModel,
          promptTokenCount: response.usageMetadata.promptTokenCount || 0,
          candidatesTokenCount: response.usageMetadata.candidatesTokenCount || 0,
          totalTokenCount: response.usageMetadata.totalTokenCount || 0,
        };
      }

      const cleanedJsonText = extractCleanJsonString(jsonText);

      try {
        data = JSON.parse(cleanedJsonText) as GraphData;
      } catch (parseError) {
        try {
          const repaired = repairJson(cleanedJsonText);
          data = JSON.parse(repaired) as GraphData;
        } catch (repairError: any) {
          throw new Error(`AI JSON parse failed: ${repairError.message}`);
        }
      }
    } catch (error: any) {
      attempts++;
      console.warn(`[Curation Backend] Graph generation attempt ${attempts} failed: ${error.message}`);
      if (attempts >= MAX_ATTEMPTS) {
        throw new Error(`AI generated an unparsable response format after ${MAX_ATTEMPTS} attempts: ${error.message}`);
      }
      // Wait a moment before retrying
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  // --- POST-PROCESSING FILTERING (LEVEL 1 IMMUNITY + LEVEL 2 HARD GUARDRAILS) ---
  const seedRawList = artists.split('::').map(a => a.trim()).filter(Boolean);
  const seedArtistIds = new Set(seedRawList.map(a => a.toLowerCase()));
  const seedNormBareSet = new Set(seedRawList.map(a => normalizeArtistId(stripCountrySlug(a))));
  const isSeedNode = (nodeId: string): boolean => {
      const lower = nodeId.toLowerCase();
      if (seedArtistIds.has(lower)) return true;
      const normDirect = normalizeArtistId(nodeId);
      if (seedNormBareSet.has(normDirect)) return true;
      const normBare = normalizeArtistId(stripCountrySlug(nodeId));
      return seedNormBareSet.has(normBare);
  };
  const nodesToRemove = new Set<string>();

  const rawNodes = Array.isArray(data?.nodes) ? data.nodes.filter(n => n && n.id != null) : [];
  const rawLinks = Array.isArray(data?.links) ? data.links.filter(l => {
      if (!l) return false;
      const s = typeof l.source === 'string' ? l.source : l.source?.id;
      const t = typeof l.target === 'string' ? l.target : l.target?.id;
      return s != null && t != null;
  }) : [];

  // --- MULTI-SEED TOPOLOGY MAPPING ---
  // Re-anchor natural LLM output (e.g. "turnstile") to cached baseGraph roots (e.g. "turnstile-usa")
  if (disambiguationHints) {
      rawNodes.forEach(node => {
          if (!node.id) return;
          const mapKey = `__MAP__${normalizeArtistId(node.id)}`;
          if (disambiguationHints[mapKey]) {
              node.id = disambiguationHints[mapKey];
          }
      });
      rawLinks.forEach(link => {
          if (link.source) {
              const sourceStr = typeof link.source === 'string' ? link.source : link.source.id;
              if (sourceStr) {
                  const mapKey = `__MAP__${normalizeArtistId(sourceStr)}`;
                  if (disambiguationHints[mapKey]) {
                      if (typeof link.source === 'string') {
                          link.source = disambiguationHints[mapKey];
                      } else {
                          link.source.id = disambiguationHints[mapKey];
                      }
                  }
              }
          }
          if (link.target) {
              const targetStr = typeof link.target === 'string' ? link.target : link.target.id;
              if (targetStr) {
                  const mapKey = `__MAP__${normalizeArtistId(targetStr)}`;
                  if (disambiguationHints[mapKey]) {
                      if (typeof link.target === 'string') {
                          link.target = disambiguationHints[mapKey];
                      } else {
                          link.target.id = disambiguationHints[mapKey];
                      }
                  }
              }
          }
      });
  }


  if (filters?.foundedAfter) {
      const threshold = Number(filters.foundedAfter);
      const artistToYear = new Map<string, number>();
      const nodeMap = new Map(rawNodes.map(n => [n.id, n]));

      rawLinks.forEach(link => {
          const sourceId = typeof link.source === 'string' ? link.source : (link.source as Node).id;
          const targetId = typeof link.target === 'string' ? link.target : (link.target as Node).id;
          
          const sourceNode = nodeMap.get(sourceId);
          const targetNode = nodeMap.get(targetId);
          
          if (sourceNode?.type === 'artist' && targetNode?.type === 'founded') {
              const year = parseInt(targetNode.id);
              if (!isNaN(year)) artistToYear.set(sourceId.toLowerCase(), year);
          } else if (targetNode?.type === 'artist' && sourceNode?.type === 'founded') {
              const year = parseInt(sourceNode.id);
              if (!isNaN(year)) artistToYear.set(targetId.toLowerCase(), year);
          }
      });

      rawNodes.forEach(node => {
          if (node.type === 'artist' && !isSeedNode(node.id)) {
              const year = artistToYear.get(node.id.toLowerCase());
              if (year !== undefined && year < threshold) {
                  nodesToRemove.add(node.id);
              }
          }
      });
  }

  if (filters?.foundedBefore) {
      const threshold = Number(filters.foundedBefore);
      const artistToYear = new Map<string, number>();
      const nodeMap = new Map(rawNodes.map(n => [n.id, n]));

      rawLinks.forEach(link => {
          const sourceId = typeof link.source === 'string' ? link.source : (link.source as Node).id;
          const targetId = typeof link.target === 'string' ? link.target : (link.target as Node).id;
          
          const sourceNode = nodeMap.get(sourceId);
          const targetNode = nodeMap.get(targetId);
          
          if (sourceNode?.type === 'artist' && targetNode?.type === 'founded') {
              const year = parseInt(targetNode.id);
              if (!isNaN(year)) artistToYear.set(sourceId.toLowerCase(), year);
          } else if (targetNode?.type === 'artist' && sourceNode?.type === 'founded') {
              const year = parseInt(sourceNode.id);
              if (!isNaN(year)) artistToYear.set(targetId.toLowerCase(), year);
          }
      });

      rawNodes.forEach(node => {
          if (node.type === 'artist' && !isSeedNode(node.id)) {
              const year = artistToYear.get(node.id.toLowerCase());
              if (year !== undefined && year > threshold) {
                  nodesToRemove.add(node.id);
              }
          }
      });
  }

  if ((filters?.includeOrigins && filters.includeOrigins.length > 0) || (filters?.excludeOrigins && filters.excludeOrigins.length > 0)) {
      const includeSlugs = new Set((filters.includeOrigins || []).map(o => extractCountrySlug(o)).filter(s => s && s !== 'global'));
      const excludeSlugs = new Set((filters.excludeOrigins || []).map(o => extractCountrySlug(o)).filter(s => s && s !== 'global'));
      const artistToCountrySlug = new Map<string, string>();
      const nodeMap = new Map(rawNodes.map(n => [n.id, n]));

      rawLinks.forEach(link => {
          const sourceId = typeof link.source === 'string' ? link.source : (link.source as Node).id;
          const targetId = typeof link.target === 'string' ? link.target : (link.target as Node).id;
          const sourceNode = nodeMap.get(sourceId);
          const targetNode = nodeMap.get(targetId);
          if (sourceNode?.type === 'artist' && targetNode?.type === 'country') {
              const slug = extractCountrySlug(targetNode.label || targetNode.id);
              if (slug && slug !== 'global') artistToCountrySlug.set(sourceId.toLowerCase(), slug);
          } else if (targetNode?.type === 'artist' && sourceNode?.type === 'country') {
              const slug = extractCountrySlug(sourceNode.label || sourceNode.id);
              if (slug && slug !== 'global') artistToCountrySlug.set(targetId.toLowerCase(), slug);
          }
      });

      rawNodes.forEach(node => {
          if (node.type === 'artist' && !isSeedNode(node.id)) {
              const explicitSlug = node.origin ? extractCountrySlug(node.origin) : undefined;
              const slug = (explicitSlug && explicitSlug !== 'global') ? explicitSlug : artistToCountrySlug.get(node.id.toLowerCase());
              if (slug && slug !== 'global') {
                  if (includeSlugs.size > 0 && !includeSlugs.has(slug)) {
                      nodesToRemove.add(node.id);
                  }
                  if (excludeSlugs.size > 0 && excludeSlugs.has(slug)) {
                      nodesToRemove.add(node.id);
                  }
              }
          }
      });
  }

  let filteredNodes = rawNodes.filter(n => !nodesToRemove.has(n.id));
  let filteredLinks = rawLinks.filter(l => {
      const s = typeof l.source === 'string' ? l.source : (l.source as Node).id;
      const t = typeof l.target === 'string' ? l.target : (l.target as Node).id;
      return !nodesToRemove.has(s) && !nodesToRemove.has(t);
  });

  const artistIdsInFilteredNodes = new Set(filteredNodes.filter(n => n.type === 'artist' || n.type === 'label').map(n => n.id));
  
  filteredNodes = filteredNodes.filter(n => {
      if (n.type === 'artist' || n.type === 'label') return true;
      return filteredLinks.some(l => {
          const s = typeof l.source === 'string' ? l.source : (l.source as Node).id;
          const t = typeof l.target === 'string' ? l.target : (l.target as Node).id;
          return (s === n.id && artistIdsInFilteredNodes.has(t)) || (t === n.id && artistIdsInFilteredNodes.has(s));
      });
  });
  
  const finalNodeIds = new Set(filteredNodes.map(n => n.id));
  filteredLinks = filteredLinks.filter(l => {
      const s = typeof l.source === 'string' ? l.source : (l.source as Node).id;
      const t = typeof l.target === 'string' ? l.target : (l.target as Node).id;
      return finalNodeIds.has(s) && finalNodeIds.has(t);
  });

  const deduplicatedNodesMap = new Map<string, Node>();
  filteredNodes.forEach(node => {
      const normalizedId = node.id.trim().toLowerCase();
      if (!deduplicatedNodesMap.has(normalizedId)) {
          deduplicatedNodesMap.set(normalizedId, { ...node, id: node.id.trim() });
      }
  });
  const deduplicatedNodes = Array.from(deduplicatedNodesMap.values());

  // Rule 41 Graceful Degradation Retry: If 0 non-seed artists survived Level 2 post-processing while Tier 3 was active,
  // silently bypass Tier 3 and re-run once with Tier 1 + Tier 2 only.
  const survivingNonSeedArtists = deduplicatedNodes.filter(n => n.type === 'artist' && !isSeedNode(n.id));
  if (survivingNonSeedArtists.length === 0 && hasActiveTier3Filters(filters) && !_isTier2FallbackRetry) {
      console.warn(`[Curation Backend] Rule 41 Graceful Degradation: 0 non-seed artists survived post-processing with Tier 3 active. Retrying with Tier 1 + Tier 2 only.`);
      const tier2OnlyFilters: DiscoveryFilters = {
          ...(filters?.foundedAfter !== undefined ? { foundedAfter: filters.foundedAfter } : {}),
          ...(filters?.foundedBefore !== undefined ? { foundedBefore: filters.foundedBefore } : {}),
          ...(filters?.includeOrigins?.length ? { includeOrigins: filters.includeOrigins } : {}),
          ...(filters?.excludeOrigins?.length ? { excludeOrigins: filters.excludeOrigins } : {}),
      };
      return generateGraphDataBackend(artists, tier2OnlyFilters, cachedSubgraphsContext, baseGraph, disambiguationHints, true);
  }

  const validationNodeMap = new Map<string, Node>();
  const allNodesForValidation = [...(baseGraph?.nodes || []), ...deduplicatedNodes];
  for (const node of allNodesForValidation) {
      if (!node.id) continue;
      const normalizedId = node.id.trim().toLowerCase();
      const hyphenId = normalizeArtistId(node.id);
      
      if (!validationNodeMap.has(normalizedId)) {
          validationNodeMap.set(normalizedId, { ...node, id: node.id.trim() });
      }
      if (!validationNodeMap.has(hyphenId)) {
          validationNodeMap.set(hyphenId, { ...node, id: node.id.trim() });
      }
  }
  
  const validLinks = filteredLinks.filter(link => {
      const sourceIdRaw = typeof link.source === 'string' ? link.source : (link.source as Node).id;
      const targetIdRaw = typeof link.target === 'string' ? link.target : (link.target as Node).id;
      if (!sourceIdRaw || !targetIdRaw) return false;
      
      const sourceId = sourceIdRaw.trim().toLowerCase();
      const targetId = targetIdRaw.trim().toLowerCase();
      
      if (sourceId === targetId) return false;
      if (!validationNodeMap.has(sourceId)) {
          const rawSource = typeof link.source === 'string' ? link.source : (link.source as Node).id;
          const trimmedSource = rawSource.trim();
          const newNode: Node = { id: trimmedSource, type: 'artist', group: 1, label: trimmedSource };
          const hyphenSource = normalizeArtistId(trimmedSource);
          
          validationNodeMap.set(sourceId, newNode);
          validationNodeMap.set(hyphenSource, newNode);
          deduplicatedNodes.push(newNode);
      }
      if (!validationNodeMap.has(targetId)) {
          const rawTarget = typeof link.target === 'string' ? link.target : (link.target as Node).id;
          const trimmedTarget = rawTarget.trim();
          const newNode: Node = { id: trimmedTarget, type: 'artist', group: 1, label: trimmedTarget };
          const hyphenTarget = normalizeArtistId(trimmedTarget);
          
          validationNodeMap.set(targetId, newNode);
          validationNodeMap.set(hyphenTarget, newNode);
          deduplicatedNodes.push(newNode);
      }

      link.source = validationNodeMap.get(sourceId)!.id;
      link.target = validationNodeMap.get(targetId)!.id;
      return true;
  });

  const finalNodes = Array.isArray(deduplicatedNodes) ? deduplicatedNodes : [];
  let mergedLinks = Array.isArray(validLinks) ? validLinks : [];
  
  // Explicitly merge baseGraph nodes and links to preserve context (Single-Seed enhancement only; strictly bypassed in Tabula Rasa Multi-Seed)
  if (baseGraph && !isMultiSeed) {
      if (baseGraph.nodes) {
          baseGraph.nodes.forEach(baseNode => {
              const normalizedBaseId = normalizeArtistId(baseNode.id);
              if (!finalNodes.some(n => normalizeArtistId(n.id) === normalizedBaseId)) {
                  finalNodes.push(baseNode);
              }
          });
      }
      if (baseGraph.links) {
          mergedLinks = [...mergedLinks, ...baseGraph.links];
      }
  }
  
  // Guarantee that ALL requested seed artists are present in the final graph.
  // If the LLM hallucinated and omitted a seed, inject a stub node for it.
  const seedList = artists.split('::').map(a => a.trim()).filter(Boolean);
  for (const seed of seedList) {
      const seedNorm = normalizeArtistId(seed);
      let sluggedSeedId = seedNorm;
      
      // Phase 3 Fix: Natively Slug Seed Nodes using origin data before graph injection
      if (disambiguationHints && disambiguationHints[seedNorm]) {
          const originSlug = extractCountrySlug(disambiguationHints[seedNorm]);
          if (originSlug && originSlug !== 'global') {
              sluggedSeedId = `${seedNorm}-${originSlug}`;
          }
      }

      const exists = finalNodes.some(n => {
          const nNorm = normalizeArtistId(n.id);
          const lNorm = normalizeArtistId(n.label || '');
          return nNorm === sluggedSeedId || lNorm === sluggedSeedId || sluggedSeedId.startsWith(`${nNorm}-`) || sluggedSeedId.startsWith(`${lNorm}-`);
      });
      
      // Consult disambiguationHints if available to map generated nodes to canonical cache IDs
      let isMapped = false;
      if (!exists && disambiguationHints) {
          const keys = Object.keys(disambiguationHints);
          for (const key of keys) {
              if (normalizeArtistId(disambiguationHints[key]) === seedNorm) {
                  // We found a hint mapping this seed. Check if the key (e.g. "Turnstile") is in finalNodes
                  const keyNorm = normalizeArtistId(key);
                  if (finalNodes.some(n => normalizeArtistId(n.id) === keyNorm)) {
                      isMapped = true;
                      break;
                  }
              }
          }
      }
      
      if (!exists && !isMapped) {
          finalNodes.push({
              id: sluggedSeedId,
              label: titleCaseArtistId(seed),
              type: 'artist',
              group: 1
          });
      }
  }

  const finalGraph: GraphData = normalizeGraphData({
      nodes: finalNodes,
      links: mergedLinks
  });

  if (data) {
      const rawSynthesis = (data as any).synthesisRationale || (data as any).synthesis_rationale;
      finalGraph.synthesisRationale = typeof rawSynthesis === "string"
        ? rawSynthesis
            .replace(/(?:[ \t]*<\/?br\s*\/?>[ \t]*[\r\n]*)+/gi, "\n\n")
            .replace(/\\n/g, "\n")
            .replace(/\n{3,}/g, "\n\n")
            .trim()
        : rawSynthesis;
  }

  return { graphData: finalGraph, apiUsage: finalApiUsage };
};

// --- NODE DETAILS SCHEMAS & PROMPTS ---

export const ARTIST_NODE_DETAILS_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    summary: {
      type: Type.STRING,
      description: "A scannable bio (approx. 100 words) using Markdown: short paragraphs, bolding for key terms, and bullet points for lists. Focus on style and significance."
    },
    imageUrl: {
      type: Type.STRING,
      description: "A direct HTTPS image URL representing the artist or label, extracted from the authoritative genre-appropriate biographical source context (e.g., Wikimedia Commons, Wikipedia, Bandcamp, Discogs, Spotify, or genre-specific archives). Under the Contextual Image Trust Rule, valid images from verified biographical sources are trusted by default."
    },
    members: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "MANDATORY list of authentic current or historical members with instruments/roles in parentheses: 'Name (Instrument/Role)' e.g. 'Billie Joe Armstrong (Lead Vocals, Guitar)'. For solo artists, list the artist's full name and their roles: 'Name (Lead Vocals, Primary Instruments/Roles)' e.g. 'Jeff Buckley (Lead Vocals, Guitar)', 'PJ Harvey (Vocals, Guitar, Autoharp)'. Obscure underground acts with zero verifiable lineup history may return an honest []."
    },
    details: {
      type: Type.OBJECT,
      properties: {
        artist: {
          type: Type.STRING,
          description: "The canonical professional display name of the artist. NEVER append geographic acronyms, country names, or regional suffixes (e.g. 'Turnstile', NOT 'Turnstile US'; 'Drug Church', NOT 'Drug Church US')."
        },
        genre: { type: Type.STRING },
        style: {
          type: Type.STRING,
          enum: CANONICAL_STYLES_FLAT,
          description: "The single primary musical style trait describing the artist's sonic identity, strictly chosen from the canonical taxonomy."
        },
        origin: { type: Type.STRING },
        founded: { type: Type.STRING },
        notableArtists: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: "Array of 2 to 6 authentic PEER OR CONTEMPORARY BANDS/ARTISTS from the same era/scene (e.g. ['Deftones', 'Korn', 'Slipknot']). STRICT NEGATIVE CONSTRAINT: NEVER include individual band members of this artist (e.g. for System of a Down, NEVER return Serj Tankian or Daron Malakian; return peer bands). NEVER include the artist themselves. For solo artists, list peer solo artists or contemporary bands (e.g. for Jeff Buckley, return ['Elliott Smith', 'Fiona Apple', 'Chris Cornell']). NEVER output sentences or scene summaries."
        }
      },
      required: ["genre", "style", "origin", "founded", "notableArtists"]
    },
    links: {
      type: Type.ARRAY,
      description: "Wikipedia link MUST be index 0 if found. Do NOT include Official Website or Bandcamp entries — those are handled by the client. Only include grounded reference links.",
      items: {
        type: Type.OBJECT,
        properties: {
          site: { type: Type.STRING },
          url: {
            type: Type.STRING,
            nullable: true,
            description: "The verified, active URL. MUST be null if the URL cannot be confirmed. Do NOT guess or fabricate."
          }
        },
        required: ["site"]
      }
    },
    discography: {
      type: Type.ARRAY,
      description: "Array of official, verified studio albums or EPs. If you do not have factual, exact knowledge of the artist's real releases, return an empty array []. NEVER invent, guess, or extrapolate plausible-sounding album titles.",
      items: {
        type: Type.OBJECT,
        properties: {
          albumName: {
            type: Type.STRING,
            description: "The authentic, exact release title as officially issued. Do NOT guess or alter."
          },
          releaseYear: {
            type: Type.STRING,
            description: "4-digit release year (YYYY)."
          }
        },
        required: ["albumName", "releaseYear"]
      }
    },
    recommendationReason: {
      type: Type.STRING,
      description: "Curator insight."
    },
    youtubeVideoId: {
      type: Type.STRING,
      nullable: true,
      description: "The YouTube video ID (11-character string) for the best available official video. Priority order: (1) most iconic/popular official music video, (2) high-profile professional full live set on an official channel. MUST NOT be a lyric video, fan-cam bootleg, low-quality upload, non-musical interview clip, or YouTube Shorts (do not return vertical formats or '/shorts/' routes; prioritize landscape videos longer than 2 minutes). Ensure the video belongs strictly to verified artist channels, high-fidelity archives (e.g. Hate5six, KEXP, Audiotree), or standard label uploads. Return null if no high-quality official video can be confirmed."
    },
    youtubeSearchQuery: {
      type: Type.STRING,
      description: "A guaranteed-non-null YouTube search query string to use as a fallback when youtubeVideoId cannot be confirmed. Format: '[Artist Name] [genre] [live OR official video]'. Example: 'Turnstile hardcore punk official music video'. Always populate this field. Append semantic terms such as 'full set', 'live performance', or 'official music video' before resolving."
    }
  },
  required: ["summary", "details", "discography", "members", "recommendationReason", "youtubeSearchQuery"]
};

export const LABEL_NODE_DETAILS_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    summary: {
      type: Type.STRING,
      description: "A scannable bio (approx. 100 words) using Markdown: short paragraphs, bolding for key terms, and bullet points for lists. Focus on significance and catalogue."
    },
    members: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Key founders, executives, or notable personnel of this label. Grounding guard: Only include verified personnel. If uncertain, return []."
    },
    details: {
      type: Type.OBJECT,
      properties: {
        artist: {
          type: Type.STRING,
          description: "The canonical professional display name of the record label. NEVER append geographic acronyms, country names, or regional suffixes."
        },
        genre: { type: Type.STRING },
        origin: { type: Type.STRING },
        founded: { type: Type.STRING },
        notableArtists: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: "Array of 2 to 6 authentic artist names signed to or released by this label. NEVER output sentences or phrases. If uncertain, return []."
        }
      },
      required: ["genre", "origin", "founded", "notableArtists"]
    },
    links: {
      type: Type.ARRAY,
      description: "Wikipedia link MUST be index 0 if found. Do NOT include Official Website or Bandcamp entries.",
      items: {
        type: Type.OBJECT,
        properties: {
          site: { type: Type.STRING },
          url: {
            type: Type.STRING,
            nullable: true,
            description: "The verified, active URL. MUST be null if the URL cannot be confirmed."
          }
        },
        required: ["site"]
      }
    },
    discography: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          albumName: { type: Type.STRING },
          releaseYear: { type: Type.STRING }
        },
        required: ["albumName", "releaseYear"]
      }
    },
    recommendationReason: {
      type: Type.STRING,
      description: "Curator insight on the label's cultural impact."
    },
    youtubeVideoId: {
      type: Type.STRING,
      nullable: true,
      description: "Nullable for labels."
    },
    youtubeSearchQuery: {
      type: Type.STRING,
      description: "A guaranteed-non-null search query string."
    }
  },
  required: ["summary", "details", "discography", "recommendationReason", "youtubeSearchQuery"]
};

export const getNodeDetailsSchema = (nodeType?: string) => {
  const isLabel = String(nodeType || '').toLowerCase() === 'label';
  return isLabel ? LABEL_NODE_DETAILS_SCHEMA : ARTIST_NODE_DETAILS_SCHEMA;
};

export const NODE_DETAILS_SCHEMA = ARTIST_NODE_DETAILS_SCHEMA;

export const FETCH_NODE_DETAILS_PROMPT_TEMPLATE = `Please provide detailed information for the music entity: "{{nodeIdentifier}}" (type: {{nodeType}}).
    
    Context:
    - Search Disambiguation & Temporal Era Anchors: {{contextNodes}}.
    - Date: {{currentDate}}.
    {{#if originHint}}
    - Origin Hint: {{originHint}}.
    {{/if}}
    
    CRITICAL UNIVERSALITY & TEMPORAL RULE:
    The summary (bio) MUST be globally universal and entity-focused. DO NOT mention or reference the "Temporal Era Anchors" or any other specific bands from the context in the generated text. They are provided strictly to lock your Google Search grounding to the entity's exact historical era and lived scene. Do NOT inject historical predecessors into the narrative of a modern band just because they share a hometown or genre. All generated fields must describe the band's own history, sonic identity, and subgenre standing intrinsically.

    
    Synthesize the biography, origin, and discography strictly using the EXTERNAL SEARCH CONTEXT provided below. If the context is empty or insufficient, fall back to your pre-training knowledge. You MUST dynamically adapt your synthesis strategy to authoritative sources and knowledge bases specific to the artist's musical genre. Use scannability techniques:
       - Chunking: Break information into smaller, digestible units.
       - Text Segmentation: Use short paragraphs and meaningful phrases.
       - Formatting: Use bolding for key terms and bullet points where appropriate to create white space.
       - Semantic Splitting: Group related content together by meaning.
    
    Extract the 11-character YouTube video ID directly from the URLs provided in the EXTERNAL SEARCH CONTEXT. Do not hallucinate URLs. If you cannot find a verified active video ID, or if the search results do not show the full URL, you MUST return null. Never guess or hallucinate a video ID.
    
    NEGATIVE CONSTRAINT: NEVER use em-dashes (—) or long hyphens for dramatic effect or clause separation. Use standard editorial punctuation.
    
    CRITICAL OUTPUT REQUIREMENTS (STRICTLY ENFORCED):
    1. You MUST respond with a single, valid JSON object matching the schema below. Do NOT write any conversational text or prose outside the JSON.
    2. Do NOT include markdown code fences (do NOT wrap the response in \`\`\`json ... \`\`\`). Output raw JSON directly.
    3. Do NOT include any inline search citations, footnote markers (such as [1], [4, 9, 11], [cite: 20]), or source references anywhere in the text or JSON fields. Ensure all string values are plain text or markdown bold/bullets only, with absolutely no citation brackets or array-style citations.
    
    STYLE SPECIFICATION (STRICT ZERO-HALLUCINATION ENUM RULE):
    - For ARTISTS: You MUST include the "style" property inside "details". It is MANDATORY and MUST be exactly one of the canonical taxonomy values enforced by your schema (e.g. Melodic, Heavy, Aggressive, Atmospheric, Ambient, Lo-Fi, Hi-Fi, Progressive, Math, Experimental, Fast-Paced, Midwest, Modern, Underground, etc.).
    - For RECORD LABELS: Omit "style" completely from "details". Record labels represent curatorial entities and do not possess an acoustic style.

    Your task is to generate a JSON object matching this structure precisely:
    {
      "summary": "A scannable bio using Markdown following /design Bio Scannability: 1. Paragraph 1: 1-2 concise sentences on identity, era, and core sound. 2. Capitalized lead-in line (e.g. 'Key stylistic traits include:' or 'Key elements of their sound include:'). 3. Adaptive bullet list: 2 to 4 distinct bullet items (* **Trait**: context) based strictly on verified ground truth; NEVER hallucinate filler for obscure acts. ANTI-CLUMPING: Each trait MUST have its own individual bullet line (NEVER combine multiple traits into a single comma-separated bullet). 4. Optional closing paragraph: 1-2 sentences on defining releases or cultural legacy ONLY if verified.",
      "members": ["Name (Role)", ...],
      "details": {
        "artist": "Canonical professional display name of the artist or record label (e.g. 'Turnstile', 'Drug Church'). NEVER append geographic acronyms or country tags (NOT 'Turnstile US', NOT 'Drug Church US').",
        "genre": "The primary music genre(s) as a plain string (e.g. 'Hardcore Punk', 'Post-Hardcore', 'Metalcore'). NEVER return the literal string 'Unknown', 'N/A', or leave this empty — if grounding is inconclusive, infer the genre from the bio summary text and the connected scene context provided.",
        "style": "[ARTISTS ONLY] Exactly one canonical style trait from the schema enum. OMIT THIS KEY FOR RECORD LABELS.",
        "origin": "City, Country format (e.g. 'Baltimore, USA'). NEVER return the literal string 'Unknown', 'N/A', or leave this empty — if grounding is inconclusive, infer the origin from the bio summary text or the band's known regional scene.",
        "founded": "YYYY",
        "notableArtists": ["Artist Name", ...]
      },
      "links": [
        {"site": "Wikipedia", "url": "https://en.wikipedia.org/wiki/..."}
      ],
      "discography": [{"albumName": "Name", "releaseYear": "YYYY"}],
      "recommendationReason": "A 1-2 sentence curator insight explaining exactly why they matter to their genre and musical era, focusing strictly on their intrinsic artistic contributions. DO NOT reference any other specific bands or the search context.",
      "youtubeVideoId": "dQw4w9WgXcQ",
      "youtubeSearchQuery": "Turnstile hardcore punk official music video"
    }

    YOUTUBE VIDEO SELECTION RULES (CRITICAL):
    - Use the EXTERNAL SEARCH CONTEXT provided to find the best official YouTube video for this artist.
    - Priority: (1) Most iconic/popular official music video from their official YouTube channel, (2) high-profile full professional live set on an official or reputable label channel.
    - ABSOLUTELY FORBIDDEN: lyric videos, fan-cam bootlegs, low-resolution uploads, non-musical interview clips, or YouTube Shorts (do not return vertical formats or '/shorts/' routes; prioritize landscape videos longer than 2 minutes).
    - The youtubeVideoId value must be ONLY the 11-character YouTube video ID (e.g. "dQw4w9WgXcQ"), NOT a full URL.
    - Set youtubeVideoId to null if no high-quality, officially-sourced video can be confirmed.
    - youtubeSearchQuery MUST always be populated as a non-null fallback. Format: "[Artist Name] [genre] [live OR official video]". This is MANDATORY.
    - NEGATIVE SHORTS CONSTRAINT: DO NOT parse or return video hashes derived from search queries matching vertical formats or the '/shorts/' route structure. Prioritize landscape video IDs with durations longer than 2 minutes.
    - ZERO HALLUCINATION (MANDATORY): You must only return a youtubeVideoId if you can extract the exact 11-character ID from a YouTube watch URL (e.g., youtube.com/watch?v=...) present in your EXTERNAL SEARCH CONTEXT. If you do not see the exact URL or video ID in the context, set youtubeVideoId to null. NEVER guess or hallucinate a video ID under any circumstances.

    MEMBERS SPECIFICATION & FORMAT RULE (MANDATORY):
    - For BANDS: List 2 to 8 authentic current or historical members with instruments/roles in parentheses: "Name (Instrument/Role)" (e.g. "Billie Joe Armstrong (Lead Vocals, Guitar)", "Mike Dirnt (Bass, Backing Vocals)").
    - For SOLO ARTISTS: List the artist's full name and their roles: "Name (Lead Vocals, Primary Instruments/Roles)" (e.g. "Jeff Buckley (Lead Vocals, Guitar)", "PJ Harvey (Vocals, Guitar, Autoharp)", "Björk (Lead Vocals, Production)").
    - ABSOLUTELY FORBIDDEN: NEVER include guest contributors, touring package mates, festival peers, or members of other bands.
    - Obscure underground/DIY acts with zero verifiable lineup history online may return an honest empty array: "members": [].

    DISCOGRAPHY GROUNDING & ZERO-HALLUCINATION RULE (CRITICAL):
    - Only include real, officially released studio albums, EPs, or qualifying demos that exist in authoritative discographies.
    - Whenever known, prioritize official studio LPs and EPs available on digital streaming catalogs over generic bare "Demo" titles.
    - If you do not possess verified, exact historical knowledge of the artist's releases, you MUST return an empty array: "discography": [].
    - ABSOLUTELY FORBIDDEN: NEVER invent, fabricate, guess, or extrapolate plausible album titles based on the band's location, lyrics, song titles, or genre clichés (e.g. NEVER invent regional titles like 'To Live and Die in New England' for a Massachusetts hardcore band).
    - An empty array [] is 100% compliant, fully valid, and strictly preferred over any unverified, approximate, or hallucinated titles.

    NOTABLE ARTISTS (SCENE CIRCLE) GROUNDING RULE (CRITICAL):
    - Array of 2 to 6 authentic PEER OR CONTEMPORARY BANDS OR MUSICAL ACTS from the same era/scene (e.g. ["Deftones", "Korn", "Slipknot", "Limp Bizkit"]).
    - STRICT NEGATIVE CONSTRAINT (NEVER LEAK MEMBERS): You are STRICTLY FORBIDDEN from putting individual band members of the subject artist into "notableArtists" (e.g. for System of a Down, DO NOT return Serj Tankian, Daron Malakian, Shavo Odadjian, or John Dolmayan; return peer bands like Deftones, Korn, Slipknot).
    - STRICT NEGATIVE CONSTRAINT (NEVER LEAK SELF): NEVER put the artist themselves into "notableArtists" (e.g. for PJ Harvey, do NOT return PJ Harvey).
    - For solo artists, return peer solo artists or contemporary bands from their era (e.g. for Jeff Buckley, return ["Elliott Smith", "Fiona Apple", "Chris Cornell", "Rufus Wainwright"]).
    - NEVER output explanatory sentences, scene summaries, or generic phrases.
    - If no specific peer bands are verified, return [].

    WIKIPEDIA ORDERING RULE (MANDATORY):
    If a Wikipedia link is found, it MUST be the very first item (index 0) in the links array.`;

// --- DETAILS HYDRATION MODULES ---

export interface NodeDetailsHydrationHints {
  originHint?: string | null;
  countryIso?: string | null;
  genreHint?: string | null;
}

/**
 * Resolves connected scene peers/labels/genres from `graphData.links` using canonical `node.id`
 * while displaying clean human-readable labels (stripping country routing suffixes).
 */
export const resolveSceneContextNodes = (node: Node, graphData: GraphData): string => {
  if (!graphData || !Array.isArray(graphData.links) || !Array.isArray(graphData.nodes)) {
    return '';
  }
  return graphData.links
    .filter(l => {
      const sourceId = typeof l.source === 'string' ? l.source : (l.source as Node).id;
      const targetId = typeof l.target === 'string' ? l.target : (l.target as Node).id;
      return sourceId === node.id || targetId === node.id;
    })
    .map(l => {
      const sourceId = typeof l.source === 'string' ? l.source : (l.source as Node).id;
      const targetId = typeof l.target === 'string' ? l.target : (l.target as Node).id;
      return sourceId === node.id ? targetId : sourceId;
    })
    .map(id => graphData.nodes.find(n => n.id === id))
    .filter(Boolean)
    .map(n => {
      const displayLabel = (n!.label && n!.label !== n!.id)
        ? n!.label
        : titleCaseArtistId(stripCountrySlug(n!.id));
      return `${displayLabel} (${n!.type})`;
    })
    .slice(0, 10)
    .join(', ');
};

/**
 * Builds the MANDATORY IDENTITY LOCK block injected into `FETCH_NODE_DETAILS_PROMPT_TEMPLATE`
 * so Gemini 3.6 Flash is strictly forbidden from hydrating a foreign (e.g. US/UK) homonym.
 */
export const buildHydrationIdentityLockBlock = (
  searchArtistName: string,
  nodeType: string,
  hints?: NodeDetailsHydrationHints | null
): string => {
  const countryIso = normalizeIsoCode(hints?.countryIso);
  const originLabel =
    (hints?.originHint && hints.originHint !== 'Unknown' ? hints.originHint.trim() : '') ||
    (countryIso ? ISO_TO_COUNTRY_NAME[countryIso] : '');
  const genreLabel =
    hints?.genreHint && hints.genreHint.trim() && hints.genreHint.trim().toLowerCase() !== 'unknown'
      ? hints.genreHint.trim()
      : '';

  if (!originLabel && !countryIso && !genreLabel) {
    return '';
  }

  const lines: string[] = [];
  if (originLabel) {
    lines.push(`- **Origin Hint (CRITICAL):** Details for: ${originLabel}${countryIso ? ` (ISO: ${countryIso.toUpperCase()})` : ''}.`);
  }
  if (genreLabel) {
    lines.push(`- **Genre Anchor (CRITICAL):** Primary scene/genre: ${genreLabel}.`);
  }
  if (originLabel || countryIso) {
    const regionDesc = originLabel || countryIso!.toUpperCase();
    lines.push(
      `- **MANDATORY IDENTITY LOCK (ZERO FOREIGN HOMONYMS):** You MUST hydrate ONLY the ${nodeType} "${searchArtistName}" from ${regionDesc}${countryIso ? ` (ISO-3166: ${countryIso.toUpperCase()})` : ''}${genreLabel ? `, associated with ${genreLabel}` : ''}. Returning biography, formation year, members, notable artists, or discography from any US, UK, or foreign homonym with the same name is STRICTLY FORBIDDEN. In \`details.origin\`, state the authentic city/country within ${regionDesc}. Every release in \`discography\` MUST belong exclusively to the ${regionDesc} ${nodeType} (return \`[]\` if uncertain).`
    );
  }
  return lines.join('\n    ');
};

/**
 * Deterministically sanitizes `details.notableArtists`:
 * - Ensures all items are strings and trims whitespace
 * - Strips trailing punctuation
 * - Strips sentence-length or explanatory category phrases (> 4 words, > 35 chars,
 *   or matching prefixes like "inclusive of", "acts", "bands", etc.)
 * - Strips artist self-references and member leaks
 * - Returns only clean, verified peer artist/band names
 */
export const sanitizeNotableArtists = (
  artists: any,
  members?: any[],
  currentArtistName?: string
): string[] => {
  if (!Array.isArray(artists)) return [];
  const SENTENCE_PREFIX_REGEX = /^(?:inclusive of|associated with|related to|peers in|features|bands like|including|various|such as|influence of|consisting of|pioneers of|spanning|known for)\b/i;
  const GENERIC_CATEGORY_REGEX = /\b(?:acts|bands|artists|musicians|scene|subgenres?|influences)\b/i;

  const normalizedCurrentArtist = currentArtistName ? currentArtistName.trim().toLowerCase() : '';
  const memberNames = Array.isArray(members)
    ? members
        .map((m: any) => {
          const raw = typeof m === 'string' ? m : (typeof m?.name === 'string' ? m.name : '');
          return raw.replace(/\s*\(.*?\)/g, '').trim().toLowerCase();
        })
        .filter((n: string) => n.length > 0)
    : [];

  return artists
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map(s => s.trim().replace(/[.;!?]+$/, ''))
    .filter(name => {
      if (name.length < 2 || name.length > 35) return false;
      if (name.split(/\s+/).length > 4) return false;
      if (SENTENCE_PREFIX_REGEX.test(name)) return false;
      if (GENERIC_CATEGORY_REGEX.test(name) && !/^(the|a)\s/i.test(name)) return false;

      const lower = name.toLowerCase();
      // Negative check: strip artist self-reference
      if (normalizedCurrentArtist && lower === normalizedCurrentArtist) return false;
      // Negative check: strip band members from notable artists
      if (memberNames.includes(lower)) return false;

      return true;
    });
};

/**
 * Normalizes an album title to ensure proper punctuation, citation stripping,
 * and deterministic parenthesis balancing for label releases with artist attributions.
 * Prevents LLM decoder conflation where an artist name ending with closing parentheses
 * (e.g. "Sunn O)))") causes the wrapper's outer closing parenthesis to be omitted.
 */
export const sanitizeAlbumName = (albumName: any, notableArtists?: string[]): string => {
  if (typeof albumName !== 'string') return '';

  let cleaned = albumName
    .replace(/\[\s*\d+(?:\s*,\s*\d+)*\s*\]/g, '')
    .replace(/\(\s*\d+(?:\s*,\s*\d+)*\s*\)/g, '')
    .replace(/\[\s*(?:cite|citation)[^\]]*\]/gi, '')
    .replace(/""/g, '')
    .trim();

  if (!cleaned) return '';

  // 1. Contextual pass: generic check for any artist in notableArtists whose name ends with
  // closing parentheses or contains parentheses where the attribution wrapper '(' was left unclosed.
  if (Array.isArray(notableArtists) && notableArtists.length > 0) {
    for (const rawArtist of notableArtists) {
      if (typeof rawArtist !== 'string' || !rawArtist.trim()) continue;
      const artist = rawArtist.trim();

      // If the album title ends with `(${artist}` (i.e. an opening '(' followed by the exact artist string,
      // missing the outer closing ')' that wraps the attribution—such as "Flight of the Behemoth (Sunn O)))"),
      // append ')' so it becomes "Flight of the Behemoth (Sunn O))))".
      const escapedArtist = artist.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const unclosedWrapperRegex = new RegExp(`\\(\\s*${escapedArtist}\\s*$`);
      if (unclosedWrapperRegex.test(cleaned)) {
        cleaned = `${cleaned})`;
        break;
      }
    }
  }

  // 2. Direct-hit fall-through for parenthesized entities even without notableArtists context
  // e.g. "(Sunn O)))" at end of string without matching outer closing paren
  if (/\(\s*Sunn O\){3}\s*$/i.test(cleaned)) {
    cleaned = `${cleaned})`;
  }

  // 3. General parenthesis-balancing guard:
  // If openCount > closeCount, append closing parentheses until balanced
  const openCount = (cleaned.match(/\(/g) || []).length;
  const closeCount = (cleaned.match(/\)/g) || []).length;
  if (openCount > closeCount) {
    cleaned = `${cleaned}${')'.repeat(openCount - closeCount)}`;
  }

  return cleaned.trim();
};

/**
 * Sanitizes Deep Cut biography and summary text:
 * - Strips raw codeblock wrappers (```json ... ```)
 * - Extracts summary text if wrapped in unparsed JSON ({ "summary": "..." })
 * - Filters out Chain-of-Thought search reasoning preambles
 * - Converts raw escaped newlines (\n) to actual newlines
 * - Strips citation brackets and footnote markers ([1], (1), [cite: 20]) while consuming trailing space
 * - Unpacks clumped single-bullet trait lists into individual bullet lines with capitalized bullet items
 * - Fixes leading space and enforces proper capitalization on bullet lead-in lines (e.g. "Key stylistic traits include:")
 */
export const sanitizeBioText = (rawText?: string): string => {
  if (!rawText || typeof rawText !== 'string') return '';
  let text = rawText.trim();
  const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (match && match[1]) {
    text = match[1].trim();
  } else {
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  }
  if (text.startsWith('{') || text.startsWith('[')) {
    const summaryMatch = text.match(/["'](?:summary|bio|description|text)["']\s*:\s*["']([\s\S]*?)(?=["']\s*(?:,\s*["'](?:imageUrl|members|details|discography|tourInfo|recommendationReason|nodes|links|group|id|type)["']|\s*\}|\s*$))/i);
    if (summaryMatch && summaryMatch[1]) {
      text = summaryMatch[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\').trim();
    }
  }
  let prevText;
  do {
    prevText = text;
    text = text.replace(/^(?:I have confirmed|I will manually check|I will check|I need to check|I need to get|To answer your request|For the YouTube video|Here is the JSON|Here are the details|Here is the information|Note: Some details|Based on the search)[^.\n]*[.\n]+\s*/ig, '').trim();
  } while (text !== prevText && text.length > 0);

  text = text.replace(/\\n/g, '\n');

  // Strip citations while consuming trailing whitespace so "[1] word" becomes "word" instead of " word"
  text = text.replace(/\[\s*\d+(?:\s*,\s*\d+)*\s*\][ \t]*/g, '')
             .replace(/\(\s*\d+(?:\s*,\s*\d+)*\s*\)[ \t]*/g, '')
             .replace(/\[\s*(?:cite|citation)[^\]]*\][ \t]*/gi, '')
             .replace(/""/g, '');

  // 1. Capitalize list lead-in lines and clean leading spaces on internal lines
  // Fixes lines starting with " key stylistic elements include:", " key elements of their sound include:", etc.
  text = text.replace(/(^|\n)[ \t]*(key (?:stylistic|elements|traits|sonic|characteristics|attributes|achievements|label attributes)\b[^\n]*:)/gi, (m, prefix, leadIn) => {
    const capitalized = leadIn.charAt(0).toUpperCase() + leadIn.slice(1);
    return `${prefix}${capitalized}`;
  });

  // Clean any remaining leading spaces on lines before non-bullet prose
  text = text.replace(/(^|\n)[ \t]+([^•*\-\s])/g, '$1$2');

  // 2. Clumped Single-Bullet Unpacker:
  // Detects: * **Key Characteristics**: Blistering breakdowns, sample-heavy glitch textures, erratic mathcore tempo shifts, and oppressive atmosphere.
  // Unpacks into individual capitalized bullets
  text = text.replace(
    /(?:^|\n)[ \t]*[•*-][ \t]*(?:\*\*)?(?:Key Characteristics|Key Traits|Key Elements|Stylistic Traits)(?:\*\*)?:?[ \t]*([^\n]+)/i,
    (m, rawTraits) => {
      const cleanTraits = rawTraits
        .replace(/\band\s+/gi, '')
        .split(/[,;]/)
        .map((t: string) => t.trim().replace(/\.$/, ''))
        .filter((t: string) => t.length > 2);

      if (cleanTraits.length >= 2) {
        const formattedBullets = cleanTraits
          .map((t: string) => {
            const capitalized = t.charAt(0).toUpperCase() + t.slice(1);
            return `* ${capitalized}`;
          })
          .join('\n');
        return `\n\nKey stylistic traits include:\n${formattedBullets}`;
      }
      return m;
    }
  );

  return text.trim();
};

export const fetchNodeDetailsBackend = async (
  node: Node,
  graphData: GraphData,
  seedArtists: string,
  originHint?: string | NodeDetailsHydrationHints | null,
  usageCollector?: UsageCollector
): Promise<any> => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not defined in environment secrets.");
  }
  
  const ai = new GoogleGenAI({ 
    apiKey,
    httpOptions: { timeout: 300000 } // 5 minutes
  });
  const currentModel = GEMINI_FLASH_MODEL;
  const isLabelNode = String(node.type || '').toLowerCase() === 'label';

  const contextNodes = resolveSceneContextNodes(node, graphData);

  const currentDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  let searchArtistName = stripCountrySlug(node.id);
  if (node.label && node.label !== node.id) {
    searchArtistName = node.label;
  }

  const structuredHints: NodeDetailsHydrationHints =
    typeof originHint === 'string'
      ? { originHint }
      : (originHint || {});

  const resolvedCountryIso = !isLabelNode
    ? (
        normalizeIsoCode(structuredHints.countryIso) ||
        extractTrailingCountryIso(node.id) ||
        (structuredHints.originHint ? normalizeIsoCode(extractCountrySlug(structuredHints.originHint)) : null) ||
        ((node as any).origin ? normalizeIsoCode(extractCountrySlug((node as any).origin)) : null)
      )
    : null;

  const resolvedOriginHint =
    (structuredHints.originHint && structuredHints.originHint !== 'Unknown' ? structuredHints.originHint : null) ||
    ((node as any).origin && (node as any).origin !== 'Unknown' ? (node as any).origin : null) ||
    (resolvedCountryIso ? ISO_TO_COUNTRY_NAME[resolvedCountryIso] : null);

  const identityLockBlock = buildHydrationIdentityLockBlock(searchArtistName, node.type, {
    originHint: resolvedOriginHint,
    countryIso: resolvedCountryIso,
    genreHint: structuredHints.genreHint || (node as any).genre || null,
  });

  let basePrompt = FETCH_NODE_DETAILS_PROMPT_TEMPLATE
    .replace('{{nodeIdentifier}}', searchArtistName)
    .replace('{{nodeType}}', node.type)
    .replace('{{contextNodes}}', contextNodes)
    .replace(/{{currentDate}}/g, currentDate);
      
  if (identityLockBlock) {
    basePrompt = basePrompt.replace(/{{#if originHint}}[\s\S]*?{{\/if}}/g, identityLockBlock);
  } else {
    basePrompt = basePrompt.replace(/{{#if originHint}}[\s\S]*?{{\/if}}/g, '');
  }

  let prompt = basePrompt;

  let details: any = null;
  let attempts = 0;
  const MAX_ATTEMPTS = 3;
  let lastResponse: any = null;

  while (attempts < MAX_ATTEMPTS && !details) {
    try {
      const response = await Promise.race([
        ai.models.generateContent({
          model: currentModel,
          contents: prompt,
          config: {
            systemInstruction: "You are a late-night record curator — the kind of person who pulls an obscure 7\" from a crate at 2am and traces exactly why it matters. Your tone is knowledgeable, vivid, and deeply immersed in musical history and counterculture scenes. Return detailed, factual, and scene-accurate profile information for the given musical entity matching the schema. No markdown formatting outside strings. NEGATIVE CONSTRAINT: NEVER use em-dashes (—) or long hyphens for dramatic effect or clause separation. Use standard editorial punctuation.",
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            responseMimeType: "application/json",
            responseSchema: getNodeDetailsSchema(node.type)
          }
        }),
        new Promise<any>((_, reject) => setTimeout(() => reject(new Error('AbortError: Timeout exceeded')), 55000))
      ]);
      lastResponse = response;

      if (usageCollector && response.usageMetadata) {
        usageCollector.push(currentModel, {
          promptTokenCount: response.usageMetadata.promptTokenCount || 0,
          candidatesTokenCount: response.usageMetadata.candidatesTokenCount || 0,
          totalTokenCount: response.usageMetadata.totalTokenCount || 0,
        });
      }

      const jsonText = response.text?.trim();
      if (!jsonText) {
        throw new Error("The AI returned an empty response for details.");
      }
      const cleanedJsonText = extractCleanJsonString(jsonText);

      let parsedCandidate: any = null;
      try {
        parsedCandidate = JSON.parse(cleanedJsonText);
      } catch (parseError) {
        const repaired = repairJson(cleanedJsonText);
        try {
          parsedCandidate = JSON.parse(repaired);
        } catch (repairError) {
          throw new Error("Invalid data format from details service (JSON parse & repair failed; prose fallback forbidden under Rule 40).");
        }
      }

      const candidateBio = sanitizeBioText(parsedCandidate?.summary || parsedCandidate?.bio || "");
      const candidateReason = String(parsedCandidate?.recommendationReason || '').trim();
      const hasValidDiscography = isLabelNode || Array.isArray(parsedCandidate?.discography);

      if (
        !candidateBio ||
        candidateBio.length <= 50 ||
        !candidateReason ||
        candidateReason.toLowerCase().includes('synthesised from live cultural archives') ||
        !hasValidDiscography
      ) {
        throw new Error(
          `Invalid data format from details service: incomplete structured payload for ${node.id} ` +
          `(bioLen=${candidateBio.length}, hasReason=${!!candidateReason}, discographyLen=${Array.isArray(parsedCandidate?.discography) ? parsedCandidate.discography.length : 0}).`
        );
      }

      // Gate A — Origin-Suffix Parity Retry Escalation ([Rule 8], [Rule 40]):
      // Reject foreign homonyms (e.g. US band returned for a -th Thai artist) and escalate corrective feedback on retry.
      if (!isLabelNode && resolvedCountryIso) {
        const candidateOrigin = String(parsedCandidate?.details?.origin || parsedCandidate?.origin || '').trim();
        if (!doesOriginMatchExpectedIso(candidateOrigin, resolvedCountryIso)) {
          const expectedCountryLabel = ISO_TO_COUNTRY_NAME[resolvedCountryIso] || resolvedCountryIso.toUpperCase();
          prompt = `${basePrompt}\n\nCRITICAL RETRY CORRECTION: Your previous output returned a foreign homonym from "${candidateOrigin || 'Unknown'}". That is the WRONG artist! You MUST hydrate ONLY "${searchArtistName}" from ${resolvedOriginHint || expectedCountryLabel} (ISO: ${resolvedCountryIso.toUpperCase()}). Set details.origin to their authentic city/country in ${expectedCountryLabel} and include ONLY releases by the ${expectedCountryLabel} artist (or [] if uncertain).`;
          throw new Error(
            `Origin mismatch for ${node.id}: expected ${expectedCountryLabel} (${resolvedCountryIso}), got "${candidateOrigin}".`
          );
        }
      }

      details = parsedCandidate;
    } catch (error: any) {
      attempts++;
      console.warn(`[Curation Backend] fetchNodeDetailsBackend attempt ${attempts} failed for ${node.id}: ${error.message}`);
      if (error.message.includes('AbortError')) {
         return null; // Strict 12s timeout fallback
      }
      if (attempts >= MAX_ATTEMPTS) {
        throw new Error(`fetchNodeDetailsBackend failed after ${MAX_ATTEMPTS} attempts: ${error.message}`);
      }
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
  }

  const sanitizeString = (str: any): string => {
    if (typeof str !== 'string') return "";
    return str.replace(/\[\s*\d+(?:\s*,\s*\d+)*\s*\]/g, '')
              .replace(/\(\s*\d+(?:\s*,\s*\d+)*\s*\)/g, '')
              .replace(/\[\s*(?:cite|citation)[^\]]*\]/gi, '')
              .replace(/""/g, '')
              .trim();
  };

  const sanitisedLinks = (details.links || []).map((l: any) => ({
    ...l,
    url: (l.url && typeof l.url === 'string' && l.url.trim().startsWith('http'))
      ? l.url.trim()
      : null
  }));

  const rawMembers = Array.isArray(details.members) ? details.members.map(sanitizeString) : [];

  const hydratedDetails: any = {
    ...details,
    summary: sanitizeBioText(details.summary || "No summary available (AI response was truncated)."),
    details: (() => {
      const d = details.details || {};
      const sanitizeMetaField = (val: string | undefined): string => {
        if (!val) return "";
        const t = val.trim().toLowerCase();
        if (t === "unknown" || t === "n/a" || t === "none" || t === "not available") return "";
        return sanitizeString(val);
      };
      const cleanedDetails: any = {
        ...d,
        genre: sanitizeMetaField(d.genre),
        origin: sanitizeMetaField(d.origin),
        founded: sanitizeString(d.founded),
        notableArtists: sanitizeNotableArtists(d.notableArtists, rawMembers, searchArtistName)
      };
      if (isLabelNode) {
        delete cleanedDetails.style;
      } else {
        cleanedDetails.style = sanitizeMetaField(d.style);
      }
      return cleanedDetails;
    })(),
    links: sanitisedLinks,
    discography: (details.discography || []).map((album: any) => ({
      albumName: sanitizeAlbumName(album?.albumName, details.details?.notableArtists),
      releaseYear: sanitizeString(album?.releaseYear)
    })),
    members: rawMembers,
    recommendationReason: sanitizeString(details.recommendationReason || ""),
    youtubeVideoId: extractValidYoutubeId(details.youtubeVideoId),
    imageUrl: isLabelNode ? null : sanitizeImageUrl(details.imageUrl, sanitizeString),
    youtubeSearchQuery: typeof details.youtubeSearchQuery === 'string' && details.youtubeSearchQuery.trim().length > 0
      ? sanitizeString(details.youtubeSearchQuery.trim())
      : `${details.details?.artist || details.artist || ''} ${details.details?.genre || details.genre || ''} official music video`.trim(),
  };

  if (!hydratedDetails.details) hydratedDetails.details = {};

  const groundingChunks = (lastResponse as any)?.candidates?.[0]?.groundingMetadata?.groundingChunks;
  if (groundingChunks && Array.isArray(groundingChunks)) {
    const uniqueLinks = new Map<string, { title: string; url: string }>();
    groundingChunks.forEach((chunk: any) => {
      if (chunk.web) {
        uniqueLinks.set(chunk.web.uri, {
          title: chunk.web.title || 'Source',
          url: chunk.web.uri
        });
      }
    });
    hydratedDetails.groundingLinks = Array.from(uniqueLinks.values());
  }

  return hydratedDetails;
};

export const scrapeVideoIdBackend = async (
  artistName: string,
  artistId: string
): Promise<string | null> => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const ai = new GoogleGenAI({ 
    apiKey,
    httpOptions: { timeout: 300000 } // 5 minutes
  });
  const currentModel = GEMINI_FLASH_MODEL;

  const prompt = `What is the best official 11-character YouTube video ID for '${artistName}'?
Return ONLY the 11-character video ID as a plain string. Do not include any JSON, quotes, explanations, markdown, or other text. If you are not highly confident, return "null".`;

  try {
    const response = await Promise.race([
      ai.models.generateContent({
        model: currentModel,
        contents: prompt,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
          maxOutputTokens: 200,
        }
      }),
      new Promise<any>((_, reject) => setTimeout(() => reject(new Error('AbortError: Timeout exceeded')), 12000))
    ]);

    const text = response.text?.trim();
    if (!text) return null;

    const id = extractValidYoutubeId(text);
    return id || null;
  } catch (err: any) {
    if (err.message && err.message.includes('AbortError')) {
      console.warn(`[scrapeVideoIdBackend] 12s timeout exceeded for ${artistName}. Returning null.`);
      return null;
    }
    console.error(`[scrapeVideoIdBackend] Scrape failed for ${artistName}:`, err);
    return null;
  }
};

export const checkVideoPlayability = async (videoId: string): Promise<boolean> => {
  if (!videoId || videoId.length !== 11) return false;
  try {
    const url = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, { method: 'HEAD', signal: controller.signal });
    clearTimeout(id);
    return res.status === 200;
  } catch (err) {
    console.error(`[Playability Check] Failed for ${videoId}:`, err);
    return true;
  }
};

export interface DiscographyItem {
  albumName: string;
  releaseYear?: string;
  itunesCollectionId?: number;
}

// Helper: Tokenizes and checks exact whole-word boundary
const containsWord = (source: string, token: string): boolean => {
  if (!source || !token) return false;
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escaped}\\b`, 'i').test(source);
};

// Expanded Taxonomy Matrix with broad umbrella roots and extreme subgenres
const GENRE_TAXONOMY: Record<string, string[]> = {
  'metal': [
    'metal', 'heavy metal', 'death metal', 'black metal', 'doom metal',
    'deathcore', 'metalcore', 'mathcore', 'grindcore', 'cybergrind',
    'powerviolence', 'sludge', 'crust', 'thrash', 'groove metal', 'nu metal',
    'extreme metal', 'industrial metal', 'progressive metal', 'post metal', 'blackgaze'
  ],
  'punk': [
    'punk', 'hardcore', 'hardcore punk', 'post hardcore', 'emo', 'midwest emo',
    'skate punk', 'pop punk', 'crust punk', 'd beat', 'anarcho punk',
    'grindcore', 'powerviolence', 'screamo', 'skramz', 'emoviolence', 'melodic hardcore',
    'straight edge', 'youth crew', 'post punk', 'riot grrrl', 'queercore', 'psychobilly'
  ],
  'rock': [
    'rock', 'alternative', 'indie', 'grunge', 'post rock',
    'garage rock', 'psychedelic', 'noise rock', 'hard rock', 'space rock',
    'emo', 'midwest emo', 'screamo', 'skramz', 'emoviolence', 'post hardcore', 'hardcore punk',
    'pop punk', 'skate punk', 'melodic hardcore', 'shoegaze', 'math rock', 'post punk',
    'dream pop', 'slowcore', 'britpop', 'new wave', 'no wave', 'darkwave', 'coldwave',
    'goth', 'gothic', 'industrial', 'krautrock', 'stoner', 'sludge', 'doom', 'thrash',
    'crust', 'powerviolence', 'metalcore', 'deathcore', 'mathcore', 'post metal', 'blackgaze',
    'riot grrrl', 'queercore', 'psychobilly',
    // Umbrella bridge: iTunes frequently tags extreme metal/punk as generic 'Rock'
    'grindcore', 'punk', 'metal', 'hardcore', 'straight edge', 'youth crew'
  ],
  'hip hop rap': [
    'hip hop', 'rap', 'boom bap', 'g funk', 'trap', 'drill',
    'crunk', 'grime', 'lo fi hip hop', 'east coast', 'west coast', 'hardcore rap'
  ],
  'electronic': [
    'electronic', 'techno', 'house', 'trance', 'dubstep', 'edm',
    'dance', 'idm', 'drum and bass', 'jungle', 'ambient', 'synthwave'
  ],
  'r b soul': ['rnb', 'r b', 'soul', 'funk', 'motown', 'neo soul'],
  'pop': ['pop', 'synthpop', 'electropop', 'k pop', 'indie pop', 'dream pop', 'britpop', 'new wave'],
  'country': ['country', 'bluegrass', 'americana', 'alt country'],
  'jazz': ['jazz', 'bebop', 'swing', 'fusion', 'free jazz']
};

const GENERIC_ALBUM_TITLES = new Set([
  'demo', 'demos', 'live', 'ep', 'single', 'greatest hits', 'the best of',
  'best of', 'singles', 'compilation', 'untitled', 'self titled', 'rarities',
  'b sides', 'anthology', 'remixes', 'acoustic', 'unplugged', 'split'
]);

const ALBUM_STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'in', 'on', 'at', 'to', 'for', 'with', 'by', 'from',
  'vol', 'volume', 'part', 'pt', 'ep', 'lp', 'live', 'deluxe', 'edition', 'remaster', 'remastered',
  'version', 'bonus', 'track', 'tracks'
]);

const extractDistinctiveTokens = (title: string): string[] => {
  return (title || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length >= 3 && !ALBUM_STOPWORDS.has(word));
};

const normalizeAlbumTitle = (title: string): string => {
  return (title || '')
    .toLowerCase()
    .replace(/\s*[\(\[][^\)\]]*[\)\]]/g, '')       // Strips (Deluxe Edition), [Remastered], etc.
    .replace(/\s+-\s+(ep|single)$/i, '')            // Strips " - EP", " - Single"
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]/g, '')                      // Strips punctuation and spaces
    .trim();
};

const hasQualifyingDescriptor = (title: string): boolean => {
  return /\b(demo|demos|ep|live|single|session|sessions|split|tape)\b/i.test(title) ||
         /\([^\)]*(demo|ep|live|split|single)[^\)]*\)/i.test(title) ||
         /\[[^\]]*(demo|ep|live|split|single)[^\]]*\]/i.test(title);
};

const titlesMatchFuzzy = (
  itunesTitle: string,
  zceneTitle: string,
  itunesYear?: number,
  zceneYear?: number
): boolean => {
  const normItunes = normalizeAlbumTitle(itunesTitle);
  const normZcene = normalizeAlbumTitle(zceneTitle);
  if (!normItunes || !normZcene) return false;

  // 1. Exact normalized match
  if (normItunes === normZcene) return true;

  // Release year correlation checks
  const exactYearMatch = (itunesYear && zceneYear) ? itunesYear === zceneYear : false;
  const yearMatch = (itunesYear && zceneYear) ? Math.abs(itunesYear - zceneYear) <= 1 : false;

  // 1b. Exact normalized match with release year appended (e.g. "Demo" (2022) matching "Demo 2022")
  if (exactYearMatch && itunesYear && (normZcene + itunesYear === normItunes || normItunes + itunesYear === normZcene)) {
    return true;
  }

  // 2. Substring containment (minimum 8 characters, yearMatch required, and length ratio >= 0.70 to prevent spurious collisions)
  if (normItunes.length >= 8 && normZcene.length >= 8) {
    const lenRatio = Math.min(normItunes.length, normZcene.length) / Math.max(normItunes.length, normZcene.length);
    if (yearMatch && lenRatio >= 0.70) {
      if (normItunes.includes(normZcene) || normZcene.includes(normItunes)) return true;
    }
  }

  // 3. Prefix match: minimum 10 chars, or 6 chars if supported by release year correlation
  const minPrefixLen = yearMatch ? 6 : 10;
  if (normItunes.length >= minPrefixLen && normZcene.length >= minPrefixLen) {
    const pLen = Math.min(normItunes.length, normZcene.length, 12);
    if (normItunes.slice(0, pLen) === normZcene.slice(0, pLen)) return true;
  }

  // 4. Distinctive token overlap: strictly requires exact release-year match to prevent homonym album collisions
  const itunesTokens = extractDistinctiveTokens(itunesTitle);
  const zceneTokens = extractDistinctiveTokens(zceneTitle);
  const sharedTokens = itunesTokens.filter(t => zceneTokens.includes(t));
  if (exactYearMatch) {
    if (sharedTokens.length >= 2) return true;
    if (sharedTokens.length >= 1 && sharedTokens.some(t => t.length >= 6)) return true;
  }

  return false;
};

const normalizeGenreText = (g: string): string =>
  (g || "").toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

const APPLE_ELECTRONIC_HARDCORE_ZCENE_TERMS = [
  'gabber', 'happy hardcore', 'hardcore techno', 'uk hardcore', 'hardstyle', 'rave',
  'electronic', 'dance', 'techno', 'edm', 'drum and bass', 'jungle', 'trance', 'house',
  'breakbeat', 'electronica', 'idm', 'dubstep'
];

const NON_ELECTRONIC_HARDCORE_EXCLUDE_TERMS = [
  'punk', 'post hardcore', 'hardcore punk', 'melodic hardcore', 'youth crew', 'straight edge',
  'metalcore', 'deathcore', 'mathcore', 'grindcore', 'powerviolence', 'metal', 'rock', 'emo',
  'screamo', 'skramz', 'emoviolence', 'shoegaze', 'math rock', 'post punk', 'pop punk', 'skate punk',
  'alternative', 'indie', 'rap', 'hip hop', 'hardcore rap'
];

const HOSTILE_APPLE_GENRE_TOKENS = [
  'hip hop', 'rap', 'afrobeats', 'country', 'bluegrass', 'americana',
  'christian', 'gospel', 'inspirational', 'classical', 'opera',
  'new age', 'meditation', 'fitness', 'workout', 'children', 'lullabies',
  'comedy', 'spoken word', 'podcast', 'audiobook', 'holiday', 'christmas',
  'soundtrack', 'musical', 'easy listening', 'lounge', 'reggaeton', 'salsa',
  'bachata', 'enka', 'bollywood', 'karaoke', 'tribute'
];

const CATALOG_CORROBORATED_APPLE_UMBRELLA_TOKENS = [
  'rock', 'alternative', 'punk', 'indie', 'metal', 'pop', 'grunge', 'new wave'
];

const INCOMPATIBLE_NON_UMBRELLA_ZCENE_GENRE_TOKENS = [
  'hip hop', 'rap', 'boom bap', 'g funk', 'trap', 'drill', 'crunk', 'grime', 'afrobeats',
  'classical', 'opera', 'chamber', 'symphony', 'orchestral',
  'country', 'bluegrass', 'americana',
  'jazz', 'bebop', 'swing', 'free jazz',
  'electronic', 'techno', 'house', 'trance', 'dubstep', 'edm', 'drum and bass', 'jungle',
  'gabber', 'happy hardcore', 'hardcore techno', 'uk hardcore', 'hardstyle', 'rave', 'ambient',
  'rnb', 'r b', 'soul', 'funk', 'motown', 'neo soul',
  'christian', 'gospel', 'new age', 'meditation', 'children', 'comedy', 'spoken word',
  'reggaeton', 'salsa', 'bachata', 'enka', 'bollywood'
];

const ZCENE_UMBRELLA_CROSSOVER_TOKENS = [
  'rock', 'alternative', 'punk', 'indie', 'metal', 'pop', 'grunge', 'new wave',
  'no wave', 'darkwave', 'coldwave', 'emo', 'screamo', 'skramz', 'emoviolence',
  'hardcore punk', 'post hardcore', 'melodic hardcore', 'youth crew', 'straight edge',
  'metalcore', 'deathcore', 'mathcore', 'grindcore', 'powerviolence', 'thrash', 'crust',
  'sludge', 'doom', 'stoner', 'shoegaze', 'blackgaze', 'slowcore', 'britpop', 'synthpop',
  'electropop', 'krautrock', 'goth', 'gothic', 'industrial', 'garage', 'psychedelic',
  'ska', 'psychobilly', 'riot grrrl', 'queercore', 'sasscore', 'orgcore'
];

/**
 * V47.14: Mutual Non-Hostility Catalog-Corroborated Genre Guard.
 * Returns true when an Apple Music genre is a non-hostile coarse umbrella bucket
 * ('Rock', 'Alternative', 'Punk', 'Indie', 'Metal', 'Pop', etc.) AND the Zcene artist's
 * genre is not an incompatible pure non-umbrella family (Hip-Hop/Rap, Classical, Country,
 * Jazz, Electronic/Techno/House/EDM/Gabber, R&B/Soul, etc., unless an explicit rock/punk/metal/pop
 * crossover token is present). Strictly blocks bare Apple Electronic "Hardcore" (ID 1050).
 */
export const isCatalogCorroboratedNonHostileGenre = (
  itunesGenreRaw: string,
  zceneGenreRaw?: string
): boolean => {
  const itunesGenre = normalizeGenreText(itunesGenreRaw);
  if (!itunesGenre || itunesGenre === 'undefined') return false;
  if (isAppleElectronicHardcoreGenre(itunesGenre)) return false;
  if (HOSTILE_APPLE_GENRE_TOKENS.some((token) => containsWord(itunesGenre, token))) {
    return false;
  }
  const isAppleUmbrella = CATALOG_CORROBORATED_APPLE_UMBRELLA_TOKENS.some((token) =>
    containsWord(itunesGenre, token)
  );
  if (!isAppleUmbrella) return false;

  if (zceneGenreRaw !== undefined) {
    const zceneGenre = normalizeGenreText(zceneGenreRaw);
    if (!zceneGenre || zceneGenre === 'unknown') return false;
    const hasIncompatibleFamily = INCOMPATIBLE_NON_UMBRELLA_ZCENE_GENRE_TOKENS.some((token) =>
      containsWord(zceneGenre, token)
    );
    if (hasIncompatibleFamily) {
      const hasUmbrellaCrossover = ZCENE_UMBRELLA_CROSSOVER_TOKENS.some((token) =>
        containsWord(zceneGenre, token)
      );
      if (!hasUmbrellaCrossover) {
        return false;
      }
    }
  }

  return true;
};

/**
 * Apple Music / iTunes Genre ID 1050 ("Hardcore") is exclusively a Dance/Electronic/Gabber subgenre.
 * Hardcore Punk, Post-Hardcore, Melodic Hardcore, Youth Crew, and Metalcore bands are tagged by Apple
 * as "Punk", "Rock", "Alternative", or "Metal" — never bare "Hardcore".
 */
export const isAppleElectronicHardcoreGenre = (itunesGenreRaw: string): boolean => {
  return normalizeGenreText(itunesGenreRaw) === 'hardcore';
};

const matchesAppleElectronicHardcore = (zceneGenreNorm: string): boolean => {
  if (!zceneGenreNorm) return false;
  if (NON_ELECTRONIC_HARDCORE_EXCLUDE_TERMS.some(term => containsWord(zceneGenreNorm, term))) {
    return false;
  }
  return APPLE_ELECTRONIC_HARDCORE_ZCENE_TERMS.some(term => containsWord(zceneGenreNorm, term));
};

export const evaluateGenreMatch = (itunesGenreRaw: string, zceneGenreRaw: string, summaryRaw: string): boolean => {
  const itunesGenre = normalizeGenreText(itunesGenreRaw);
  const zceneGenre = normalizeGenreText(zceneGenreRaw);
  if (!itunesGenre) return false;

  // V47.9: Apple bare "Hardcore" is strictly Electronic/Dance/Gabber (never Punk/Metal/Rock/Rap)
  if (isAppleElectronicHardcoreGenre(itunesGenre)) {
    return matchesAppleElectronicHardcore(zceneGenre);
  }

  // 1. Core keyword intersection using whole-word boundaries
  const zceneWords = zceneGenre.split(' ').filter(w => w.length > 2);
  const itunesWords = itunesGenre.split(' ').filter(w => w.length > 2);
  const keywordMatch = zceneWords.some(w => containsWord(itunesGenre, w)) ||
                       itunesWords.some(w => containsWord(zceneGenre, w));
  if (keywordMatch) return true;

  // 2. Taxonomy family intersection using whole-word boundaries
  for (const [_, subgenres] of Object.entries(GENRE_TAXONOMY)) {
    const itunesInFamily = subgenres.some(token => containsWord(itunesGenre, token));
    const zceneInFamily = subgenres.some(token => containsWord(zceneGenre, token));
    if (itunesInFamily && zceneInFamily) {
      return true;
    }
  }

  // 3. Summary fallback match using whole-word boundaries
  if (summaryRaw) {
    const summaryNorm = normalizeGenreText(summaryRaw);
    const summaryMatch = itunesWords.some(w => containsWord(summaryNorm, w));
    if (summaryMatch) return true;
  }

  return false;
};

export const evaluateGenreDistanceScore = (
  itunesGenreRaw: string,
  zceneGenreRaw: string,
  summaryRaw: string
): number => {
  const itunesGenre = normalizeGenreText(itunesGenreRaw);
  const zceneGenre = normalizeGenreText(zceneGenreRaw);
  if (!itunesGenre) return 0;

  // V47.9: Apple bare "Hardcore" is strictly Electronic/Dance/Gabber (never Punk/Metal/Rock/Rap)
  if (isAppleElectronicHardcoreGenre(itunesGenre)) {
    if (!matchesAppleElectronicHardcore(zceneGenre)) return 0;
    const isDirectGabberHardcore = ['gabber', 'happy hardcore', 'hardcore techno', 'uk hardcore', 'hardstyle', 'rave']
      .some(term => containsWord(zceneGenre, term));
    return isDirectGabberHardcore ? 10 : 8;
  }

  // 1. Direct equality
  if (itunesGenre === zceneGenre) return 10;

  // 2. Direct core keyword intersection (e.g. "hardcore punk" contains "punk")
  const zceneWords = zceneGenre.split(' ').filter(w => w.length > 2);
  const itunesWords = itunesGenre.split(' ').filter(w => w.length > 2);
  const keywordMatch = zceneWords.some(w => containsWord(itunesGenre, w)) ||
                       itunesWords.some(w => containsWord(zceneGenre, w));
  if (keywordMatch) return 8;

  // 3. Taxonomy family intersection (bridge)
  for (const [_, subgenres] of Object.entries(GENRE_TAXONOMY)) {
    const itunesInFamily = subgenres.some(token => containsWord(itunesGenre, token));
    const zceneInFamily = subgenres.some(token => containsWord(zceneGenre, token));
    if (itunesInFamily && zceneInFamily) {
      return 3;
    }
  }

  // 4. Summary fallback
  if (summaryRaw) {
    const summaryNorm = normalizeGenreText(summaryRaw);
    const summaryMatch = itunesWords.some(w => containsWord(summaryNorm, w));
    if (summaryMatch) return 2;
  }

  return 0;
};

const ITUNES_RETRY_DELAY_RANGES_MS: ReadonlyArray<[number, number]> = [
  [1200, 1800],
  [2500, 3500],
];

const SOUNDTRACK_ALBUM_RE =
  /\b(original motion picture soundtrack|motion picture soundtrack|original soundtrack|original score|film score|soundtrack|o\.?s\.?t\.?)\b/i;
const HOLIDAY_ALBUM_RE =
  /\b(christmas|x-?mas|holiday|yuletide|noel)\b/i;
const SECONDARY_RELEASE_RE =
  /\b(greatest hits|the best of|best of|anthology|compilation|rarities|b-sides|live at|live in|unplugged|remixes|remix)\b|\s*-\s*single\b|\(single\)/i;
export const COMPILATION_COLLECTION_RE =
  /\b(discography|anthology|complete|collection|retrospective|singles)\b/i;

/**
 * Shared rate-limit-resilient iTunes JSON fetch helper (V45.10).
 * Zero delay on HTTP 200; on transient HTTP 403 / 429 responses only, executes up to 2 jittered retries
 * (1200-1800ms, then 2500-3500ms) with a 4000ms per-attempt timeout before falling through.
 */
const fetchItunesJsonWithRetry = async (
  url: string,
  timeoutMs: number = 4000
): Promise<any | null> => {
  const maxAttempts = ITUNES_RETRY_DELAY_RANGES_MS.length + 1;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: controller.signal });
      if (res.ok) {
        return await res.json();
      }
      if ((res.status === 403 || res.status === 429) && attempt < ITUNES_RETRY_DELAY_RANGES_MS.length) {
        const [minMs, maxMs] = ITUNES_RETRY_DELAY_RANGES_MS[attempt];
        const delayMs = minMs + Math.floor(Math.random() * (maxMs - minMs + 1));
        console.warn(`[iTunes Fetch] Transient HTTP ${res.status} on attempt ${attempt + 1}/${maxAttempts}. Backing off ${delayMs}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }
      return null;
    } finally {
      clearTimeout(timeoutId);
    }
  }
  return null;
};

export const CURRENT_ITUNES_SCRAPE_VERSION = 4;

/**
 * V47.16: Bidirectional Leading "The " Artist Name Equivalence Helper.
 * Matches artist names across optional leading "The " (e.g. "Murder City Devils" <-> "The Murder City Devils")
 * while guarding against collapsing "The The" -> "The" and protecting single-word uncorroborated names
 * (e.g. "Band" vs "The Band", "Who" vs "The Who") when `requireMultiWordForOptionalThe` is enabled.
 */
export const artistNamesMatchWithOptionalThe = (
  a?: string | null,
  b?: string | null,
  options?: { requireMultiWordForOptionalThe?: boolean }
): boolean => {
  const rawA = String(a || '').trim();
  const rawB = String(b || '').trim();
  if (!rawA || !rawB) return false;
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const normA = norm(rawA);
  const normB = norm(rawB);
  if (!normA || !normB) return false;
  if (normA === normB) return true;

  const bareA = rawA.replace(/^the\s+/i, '').trim();
  const bareB = rawB.replace(/^the\s+/i, '').trim();
  const normBareA = norm(bareA);
  const normBareB = norm(bareB);
  if (!normBareA || normBareA !== normBareB) return false;
  if (normBareA.length < 3 || normBareA === 'the') return false;

  if (options?.requireMultiWordForOptionalThe) {
    const words = bareA.split(/[\s\-_]+/).filter(Boolean);
    if (words.length < 2 && normBareA.length < 8) return false;
  }
  return true;
};

/**
 * V47.17: Resolves the official Apple Music / iTunes display name from an ordered list of
 * verified candidate `artistName` strings (e.g. `[winner.artistName, ...albums.map(a => a.artistName), matchedTrackArtist]`).
 * Returns the first candidate that is non-empty, not `'Various Artists'`, and satisfies
 * `artistNamesMatchWithOptionalThe(candidate, searchArtistName)` (preventing `"Various Artists"` short-circuits,
 * multi-artist collaborations, or Tier 2 geographic suffix tags like `"Klear TH"` from polluting `details.artist`).
 */
export const resolveVerifiedItunesArtistDisplayName = (
  itunesArtistNameCandidates: Array<string | null | undefined>,
  searchArtistName: string
): string | null => {
  const target = String(searchArtistName || '').trim();
  if (!target || !Array.isArray(itunesArtistNameCandidates)) return null;
  for (const rawCandidate of itunesArtistNameCandidates) {
    const candidate = String(rawCandidate || '').trim();
    if (!candidate || candidate.toLowerCase() === 'various artists') continue;
    if (artistNamesMatchWithOptionalThe(candidate, target)) {
      return candidate;
    }
  }
  return null;
};

/**
 * V47.18 (Pillar A — Front-Door iTunes Naming Authority):
 * Fast, $0.00, fail-open iTunes catalog artist-name check bounded by a strict wall-clock timeout (default 1500ms,
 * zero 403/429 backoff sleep). Resolves Apple Music's canonical capitalization, internal hyphens ("At the Drive-In"),
 * and official leading "The " ("The Murder City Devils") for unambiguous seeds at pre-flight.
 *
 * Guardrails:
 * 1. Regional storefront priority (&country=ISO for non-US origins before US fallback).
 * 2. Strict genre/taxonomy compatibility via evaluateGenreMatch.
 * 3. Pass 1 (Exact normalized name match) takes absolute priority over Pass 2 (optional leading "The "),
 *    guaranteeing non-"The " acts (e.g. "Supersuckers", "Deftones", "Pixies") never flip to a "The ..." variant.
 * 4. Fails open (returns null) on timeout, HTTP error, or underground/DIY artists absent from iTunes.
 */
export const resolveItunesCanonicalArtistNameBackend = async (
  artistName: string,
  genre: string,
  origin?: string,
  disambiguationSnippet?: string,
  timeoutMs: number = 1500
): Promise<string | null> => {
  const resolvedIso = origin ? normalizeIsoCode(extractCountrySlug(origin)) : null;
  let cleanName = stripCountrySlug(String(artistName || ''), resolvedIso || origin).trim();
  if (!cleanName) return null;
  if (cleanName.includes('-') && !cleanName.includes(' ')) {
    cleanName = titleCaseArtistId(cleanName);
  }

  const normName = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const targetNorm = normName(cleanName);
  if (targetNorm.length < 2) return null;

  const deadline = Date.now() + Math.max(250, timeoutMs);
  const fetchFrontDoorJson = async (url: string): Promise<any | null> => {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 100) return null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), remainingMs);
    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res || !res.ok) return null;
      return await res.json();
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  };

  const storefrontsToTry: Array<string | undefined> =
    resolvedIso && resolvedIso !== 'us' ? [resolvedIso.toUpperCase(), undefined] : [undefined];

  const hasLeadingThe = /^the\s+/i.test(cleanName);
  const bareWithoutThe = cleanName.replace(/^the\s+/i, '').trim();
  const articleVariantName = hasLeadingThe
    ? (normName(bareWithoutThe).length >= 3 && normName(bareWithoutThe) !== 'the' ? bareWithoutThe : null)
    : (targetNorm.length >= 3 ? `The ${cleanName}` : null);
  const canTryOptionalThe =
    Boolean(articleVariantName) &&
    artistNamesMatchWithOptionalThe(articleVariantName, cleanName, {
      requireMultiWordForOptionalThe: true,
    });

  for (const storefront of storefrontsToTry) {
    if (deadline - Date.now() <= 100) break;
    const countryParam = storefront ? `&country=${encodeURIComponent(storefront)}` : '';
    const primaryUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(cleanName)}&entity=musicArtist&limit=15${countryParam}`;
    const data = await fetchFrontDoorJson(primaryUrl);
    const results: any[] = Array.isArray(data?.results) ? data.results : [];

    const taxonomyValid = results.filter((r: any) => {
      if (!r || typeof r.artistName !== 'string' || !r.artistName.trim()) return false;
      if (r.artistName.trim().toLowerCase() === 'various artists') return false;
      return evaluateGenreMatch(String(r.primaryGenreName || ''), genre || '', disambiguationSnippet || '');
    });

    // Pass 1: Exact normalized match priority (never flips "Supersuckers" -> "The Supersuckers")
    const exactNormMatches = taxonomyValid.filter((r: any) => normName(r.artistName) === targetNorm);
    if (exactNormMatches.length > 0) {
      exactNormMatches.sort(
        (a: any, b: any) =>
          evaluateGenreDistanceScore(String(b.primaryGenreName || ''), genre || '', disambiguationSnippet || '') -
          evaluateGenreDistanceScore(String(a.primaryGenreName || ''), genre || '', disambiguationSnippet || '')
      );
      const resolved = resolveVerifiedItunesArtistDisplayName(
        exactNormMatches.map((r: any) => r.artistName),
        cleanName
      );
      if (resolved) return resolved;
    }

    // Pass 2A: Optional-"The " match already present in primary search payload
    if (canTryOptionalThe) {
      const primaryOptionalTheMatches = taxonomyValid.filter(
        (r: any) =>
          normName(r.artistName) !== targetNorm &&
          artistNamesMatchWithOptionalThe(r.artistName, cleanName, {
            requireMultiWordForOptionalThe: true,
          })
      );
      if (primaryOptionalTheMatches.length > 0) {
        primaryOptionalTheMatches.sort(
          (a: any, b: any) =>
            evaluateGenreDistanceScore(String(b.primaryGenreName || ''), genre || '', disambiguationSnippet || '') -
            evaluateGenreDistanceScore(String(a.primaryGenreName || ''), genre || '', disambiguationSnippet || '')
        );
        const resolved = resolveVerifiedItunesArtistDisplayName(
          primaryOptionalTheMatches.map((r: any) => r.artistName),
          cleanName
        );
        if (resolved) return resolved;
      }

      // Pass 2B: Dedicated leading-"The " fallback query only when Pass 1 & 2A yielded 0 matches
      if (articleVariantName && deadline - Date.now() > 200) {
        const variantNorm = normName(articleVariantName);
        const variantUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(articleVariantName)}&entity=musicArtist&limit=15${countryParam}`;
        const variantData = await fetchFrontDoorJson(variantUrl);
        const variantResults: any[] = Array.isArray(variantData?.results) ? variantData.results : [];
        const variantMatches = variantResults.filter((r: any) => {
          if (!r || typeof r.artistName !== 'string' || !r.artistName.trim()) return false;
          if (r.artistName.trim().toLowerCase() === 'various artists') return false;
          if (normName(r.artistName) !== variantNorm) return false;
          return evaluateGenreMatch(String(r.primaryGenreName || ''), genre || '', disambiguationSnippet || '');
        });
        if (variantMatches.length > 0) {
          variantMatches.sort(
            (a: any, b: any) =>
              evaluateGenreDistanceScore(String(b.primaryGenreName || ''), genre || '', disambiguationSnippet || '') -
              evaluateGenreDistanceScore(String(a.primaryGenreName || ''), genre || '', disambiguationSnippet || '')
          );
          const resolved = resolveVerifiedItunesArtistDisplayName(
            variantMatches.map((r: any) => r.artistName),
            cleanName
          );
          if (resolved) return resolved;
        }
      }
    }
  }

  return null;
};

const isSelfTitledAlbumMatch = (normTitle: string, cleanArtistName: string): boolean => {
  if (!normTitle || !cleanArtistName) return false;
  const norm = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const normArtist = norm(cleanArtistName);
  if (normTitle === normArtist) return true;
  const bareArtist = cleanArtistName.replace(/^the\s+/i, '').trim();
  const normBare = norm(bareArtist);
  if (normBare.length >= 3 && normBare !== 'the') {
    if (normTitle === normBare || normTitle === `the${normBare}`) return true;
  }
  return false;
};

export const shouldRunRule38NotFoundUpgrade = (
  details: any,
  isLabel: boolean = false
): boolean => {
  if (isLabel || !details || typeof details !== 'object') return false;
  const currentVersion = Number(details.itunesScrapeVersion) || 0;
  // V47.16 / V47.17: v3 is the Rule 38 not-found rescue floor; once a not-found doc is stamped >= 3,
  // do not re-scrape genuinely unindexed underground bands when v4 upgrades imaged v3 artist names.
  if (details.imageUrl !== 'not-found' || currentVersion >= 3) {
    return false;
  }
  const artistName = typeof details.details?.artist === 'string' ? details.details.artist : '';
  const hasQualifyingCatalog = getQualifyingDiscographyTitles(details.discography, artistName).length > 0;
  const hasFoundedYear = parseFoundedYear(details.details?.founded) !== undefined;
  return hasQualifyingCatalog || hasFoundedYear;
};

/**
 * V47.17: One-time $0.00 iTunes-only canonical artistName upgrade for `itunesScrapeVersion === 3` docs
 * upgraded during V47.16 (e.g. `murder-city-devils-us` -> `"The Murder City Devils"` and `at-the-drive-in-us` -> `v4`).
 */
export const shouldRunRule38ArtistNameUpgrade = (
  details: any,
  isLabel: boolean = false
): boolean => {
  if (isLabel || !details || typeof details !== 'object') return false;
  if (!details.imageUrl || details.imageUrl === 'not-found') return false;
  const currentVersion = Number(details.itunesScrapeVersion) || 0;
  return currentVersion === 3 && CURRENT_ITUNES_SCRAPE_VERSION > 3;
};

export interface CollectionSanityContext {
  genre?: string;
  summary?: string;
  foundedYear?: string | number | null;
}

const parseFoundedYear = (raw?: string | number | null): number | undefined => {
  if (raw === undefined || raw === null) return undefined;
  const match = String(raw).match(/\b(19\d\d|20\d\d)\b/);
  if (!match) return undefined;
  const parsed = parseInt(match[1], 10);
  return !isNaN(parsed) && parsed >= 1900 && parsed <= 2100 ? parsed : undefined;
};

/**
 * Uncorroborated Debut-Era Sanity Gate (V47.9):
 * When Tier 1 / Tier 2 has zero album-title corroboration (qualifyingDiscography.length === 0),
 * require >= 1 verified reconciled release, a valid foundedYear, and that the earliest verified
 * release falls within [foundedYear - 1, foundedYear + maxDebutLagYears] (default 10 years).
 * Prevents both younger homonyms (+14 to +39 yr lag) and older pre-formation homonyms (< foundedYear - 1).
 */
export const passesUncorroboratedEraGate = (
  reconciled: DiscographyItem[],
  foundedYear?: string | number | null,
  maxDebutLagYears: number = 10
): boolean => {
  if (!Array.isArray(reconciled) || reconciled.length === 0) return false;
  const founded = parseFoundedYear(foundedYear);
  if (founded === undefined) return false;

  const releaseYears = reconciled
    .map((item) => parseFoundedYear(item?.releaseYear))
    .filter((y): y is number => y !== undefined);

  if (releaseYears.length === 0) return false;
  const earliestYear = Math.min(...releaseYears);
  return earliestYear >= founded - 1 && (earliestYear - founded) <= maxDebutLagYears;
};

/**
 * Collection-Level Apple Music Conflation Guard (V47.8):
 * Protects against merged iTunes artist profiles (e.g. Exhibition #1511350574 mixing
 * 2021-2023 Punk LP/EPs with 1994-2003 Christian/New Age 1-track singles) by filtering
 * to genre-matching and post-formation collections whenever qualifying releases exist.
 */
export const filterConflatedArtistCollections = (
  itunesAlbums: any[],
  context?: CollectionSanityContext,
  llmDiscography?: DiscographyItem[]
): any[] => {
  const collections = (itunesAlbums || []).filter((alb) => alb && alb.wrapperType === 'collection');
  if (collections.length === 0 || !context) return collections;

  let filtered = collections;

  const targetGenre = (context.genre || '').trim();
  const targetSummary = (context.summary || '').trim();

  const isTitleCorroboratedNonHostile = (alb: any): boolean => {
    if (!Array.isArray(llmDiscography) || llmDiscography.length === 0) return false;
    const rawGenre = String(alb?.primaryGenreName || '');
    if (!isCatalogCorroboratedNonHostileGenre(rawGenre, targetGenre || undefined)) return false;
    const rawTitle = String(alb?.collectionName || '');
    if (!rawTitle) return false;
    const albYear = alb?.releaseDate ? new Date(alb.releaseDate).getFullYear() : undefined;
    const validAlbYear = albYear && !isNaN(albYear) ? albYear : undefined;
    return llmDiscography.some((item) => {
      if (!item?.albumName) return false;
      const zceneYear = item.releaseYear ? parseInt(item.releaseYear, 10) : undefined;
      return titlesMatchFuzzy(rawTitle, item.albumName, validAlbYear, isNaN(zceneYear as number) ? undefined : zceneYear);
    });
  };

  if (targetGenre || targetSummary) {
    const genreMatched = filtered.filter(
      (alb) =>
        evaluateGenreMatch(String(alb.primaryGenreName || ''), targetGenre, targetSummary) ||
        isTitleCorroboratedNonHostile(alb)
    );
    if (genreMatched.length > 0) {
      filtered = genreMatched;
    } else {
      const nonHostileMatched = filtered.filter((alb) =>
        isCatalogCorroboratedNonHostileGenre(String(alb.primaryGenreName || ''), targetGenre || undefined)
      );
      if (nonHostileMatched.length > 0) {
        filtered = nonHostileMatched;
      } else {
        // V47.16: Strip collections with an explicitly hostile primaryGenreName while preserving mock collections without primaryGenreName
        filtered = filtered.filter((alb) => {
          const rawAlbGenre = String(alb?.primaryGenreName || '').trim();
          if (!rawAlbGenre) return true;
          return (
            evaluateGenreMatch(rawAlbGenre, targetGenre, targetSummary) ||
            isCatalogCorroboratedNonHostileGenre(rawAlbGenre, targetGenre || undefined)
          );
        });
      }
    }
  }

  const foundedYear = parseFoundedYear(context.foundedYear);
  if (foundedYear !== undefined) {
    const eraMatched = filtered.filter((alb) => {
      if (!alb.releaseDate) return false;
      const albYear = new Date(alb.releaseDate).getFullYear();
      return !isNaN(albYear) && albYear >= foundedYear - 1;
    });
    if (eraMatched.length > 0) {
      filtered = eraMatched;
    }
  }

  return filtered;
};

export const getQualifyingDiscographyTitles = (
  discography: DiscographyItem[] | undefined,
  cleanArtistName: string
): Array<{ raw: string; norm: string; year?: number }> => {
  if (!Array.isArray(discography) || discography.length === 0) return [];
  const valid: Array<{ raw: string; norm: string; year?: number }> = [];
  for (const item of discography) {
    const raw = item?.albumName || '';
    const norm = normalizeAlbumTitle(raw);
    if (norm.length < 3) continue;
    if (GENERIC_ALBUM_TITLES.has(raw.toLowerCase().trim())) continue;
    if (isSelfTitledAlbumMatch(norm, cleanArtistName) && !hasQualifyingDescriptor(raw)) continue;
    const parsedYear = item.releaseYear ? parseInt(item.releaseYear, 10) : undefined;
    valid.push({
      raw,
      norm,
      year: parsedYear && !isNaN(parsedYear) ? parsedYear : undefined,
    });
  }
  return valid;
};

/**
 * Deterministically picks the best 600x600 hero artwork URL from a verified artist's iTunes albums (V45.10 / V47.8):
 * 1. Filters out Apple-conflated wrong-genre / pre-formation collections when valid releases exist.
 * 2. Strongly prefers albums matching the artist's reconciled Essential Listening (`reconciledDiscography`).
 * 3. Deprioritizes soundtracks/film scores (`primaryGenreName === 'Soundtrack'` or OST title markers)
 *    and compilations/live/singles whenever non-soundtrack studio albums exist.
 * 4. Gracefully falls back to a soundtrack/holiday cover if the artist only has those releases on iTunes.
 */
export const selectBestArtistArtwork = (
  itunesAlbums: any[],
  reconciledDiscography: DiscographyItem[] = [],
  context?: CollectionSanityContext
): string | null => {
  const rawCandidates = (itunesAlbums || []).filter(
    (alb) => alb && alb.wrapperType === 'collection' && typeof alb.artworkUrl100 === 'string' && alb.artworkUrl100.length > 0
  );
  if (rawCandidates.length === 0) return null;

  const filteredByConflation = filterConflatedArtistCollections(rawCandidates, context).filter(
    (alb) => typeof alb.artworkUrl100 === 'string' && alb.artworkUrl100.length > 0
  );
  const candidates = filteredByConflation.length > 0 ? filteredByConflation : rawCandidates;

  const scored = candidates.map((alb, idx) => {
    const rawTitle = String(alb.collectionName || '');
    const genre = String(alb.primaryGenreName || '');
    const trackCount = Number(alb.trackCount) || 0;
    const albYear = alb.releaseDate ? new Date(alb.releaseDate).getFullYear() : undefined;

    let score = 0;

    // 1. Match against reconciled Essential Listening titles (highest priority)
    const matchedIdx = (reconciledDiscography || []).findIndex((item) => {
      if (!item?.albumName) return false;
      const itemYear = item.releaseYear ? parseInt(item.releaseYear, 10) : undefined;
      return titlesMatchFuzzy(rawTitle, item.albumName, albYear, isNaN(itemYear as number) ? undefined : itemYear);
    });
    if (matchedIdx !== -1) {
      score += 100 - Math.min(matchedIdx, 10);
    }

    // 2. Deprioritize soundtracks / film scores when studio albums exist
    const isSoundtrack =
      genre.toLowerCase() === 'soundtrack' || SOUNDTRACK_ALBUM_RE.test(rawTitle);
    if (isSoundtrack) {
      score -= 80;
    }

    // 2b. Deprioritize holiday / seasonal albums (e.g., Christmas Songs) when core studio albums exist
    const isHoliday =
      genre.toLowerCase() === 'holiday' || HOLIDAY_ALBUM_RE.test(rawTitle);
    if (isHoliday) {
      score -= 55;
    }

    // 3. Deprioritize compilations, live albums, remixes, and singles
    const isSecondary =
      SECONDARY_RELEASE_RE.test(rawTitle) || (trackCount > 0 && trackCount <= 3);
    if (isSecondary) {
      score -= 35;
    }

    // 4. Full studio LP bonus
    if (!isSoundtrack && !isHoliday && !isSecondary && trackCount >= 6) {
      score += 15;
    }

    return { alb, score, idx };
  });

  scored.sort((a, b) => (b.score !== a.score ? b.score - a.score : a.idx - b.idx));
  return scored[0].alb.artworkUrl100.replace('100x100bb', '600x600bb');
};

export const fetchArtistCollections = async (
  artistId: number | string,
  countryIso?: string | null,
  context?: CollectionSanityContext
): Promise<{ artwork: string | null; albums: any[] }> => {
  const normIso = normalizeIsoCode(countryIso);
  const storefrontsToTry: Array<string | undefined> =
    normIso && normIso !== 'us' ? [normIso.toUpperCase(), undefined] : [undefined];

  for (const storefront of storefrontsToTry) {
    try {
      const countryParam = storefront ? `&country=${encodeURIComponent(storefront)}` : '';
      const lookupUrl = `https://itunes.apple.com/lookup?id=${artistId}&entity=album&limit=200${countryParam}`;
      const data = await fetchItunesJsonWithRetry(lookupUrl, 4000);
      if (data) {
        const albums = (data.results || []).filter(
          (r: any) => r.wrapperType === 'collection' && String(r.artistId) === String(artistId)
        );
        if (albums.length > 0) {
          const artwork = selectBestArtistArtwork(albums, [], context);
          return { artwork, albums };
        }
      }
    } catch (err: any) {
      // Graceful fallback to next storefront
    }
  }
  return { artwork: null, albums: [] };
};

export const fetchArtistArtwork = async (
  artistId: number | string,
  countryIso?: string | null
): Promise<string | null> => {
  const result = await fetchArtistCollections(artistId, countryIso);
  return result.artwork;
};

export const cleanCollectionTitle = (title: string): string => {
  if (!title) return "";
  return title
    .replace(/\s*-\s*(ep|single|album|live|remastered|deluxe\s+edition|deluxe|expanded\s+edition)$/i, '')
    .replace(/\s*\((ep|single|album|live|remastered|deluxe\s+edition|deluxe|expanded\s+edition)\)$/i, '')
    .replace(/\s*\[(ep|single|album|live|remastered|deluxe\s+edition|deluxe|expanded\s+edition)\]$/i, '')
    .trim();
};

/**
 * V47.12: Strips trailing/parenthetical vinyl & format descriptors ("EP", "LP", "Single", "Album", "Demo(s)", "7\"", "7-inch", "12\"", "12-inch")
 * so Apple's strict token-AND `entity=song` search doesn't return 0 hits when matching compilation tracks.
 */
export const cleanSongQueryAlbumTitle = (title: string): string => {
  if (!title) return "";
  const cleaned = cleanCollectionTitle(title)
    .replace(/\s*[\(\[][^\)\]]*\b(ep|lp|single|album|demo|demos|7"|7''|7\s*-?\s*inch|12"|12''|12\s*-?\s*inch)\b[^\)\]]*[\)\]]\s*$/i, '')
    .replace(/(?:\s+-\s+|\s+)(7"|7''|7\s*-?\s*inch|12"|12''|12\s*-?\s*inch|ep|lp|single|album|demos?)(?:\s+(ep|lp|single))?\s*$/i, '')
    .trim();
  return cleaned.length >= 2 ? cleaned : title.trim();
};

/**
 * V47.14: Year-Aware Deterministic Discography Deduplication.
 * Deduplicates Essential Listening items by:
 * 1. `itunesCollectionId` (when present and > 0)
 * 2. `${normClean}::${releaseYear}` (clean normalized title + release year, preserving multi-year self-titled albums)
 * 3. Empty-year guard: prevents a yearless duplicate from slipping past a dated item of the same title
 *    (and upgrades a prior yearless item in-place if a dated duplicate arrives later).
 */
export const deduplicateDiscographyItems = (items: DiscographyItem[]): DiscographyItem[] => {
  if (!Array.isArray(items) || items.length === 0) return [];
  const seenCollectionIds = new Set<number>();
  const seenTitleYearKeys = new Set<string>();
  const seenNormToIndex = new Map<string, number>();
  const deduped: DiscographyItem[] = [];

  for (const item of items) {
    if (!item || typeof item.albumName !== 'string' || !item.albumName.trim()) continue;
    const cid =
      typeof item.itunesCollectionId === 'number' && item.itunesCollectionId > 0
        ? item.itunesCollectionId
        : undefined;
    if (cid !== undefined && seenCollectionIds.has(cid)) continue;

    const cleanName = cleanCollectionTitle(item.albumName) || item.albumName.trim();
    const normClean = normalizeAlbumTitle(cleanName) || cleanName.toLowerCase().trim();
    const year = String(item.releaseYear || '').trim();
    const titleYearKey = `${normClean}::${year}`;

    if (year.length > 0) {
      if (seenTitleYearKeys.has(titleYearKey)) continue;
      if (seenTitleYearKeys.has(`${normClean}::`)) {
        const prevIdx = seenNormToIndex.get(normClean);
        if (prevIdx !== undefined && !deduped[prevIdx].releaseYear) {
          deduped[prevIdx] = {
            ...deduped[prevIdx],
            releaseYear: year,
            ...(cid !== undefined && !deduped[prevIdx].itunesCollectionId
              ? { itunesCollectionId: cid }
              : {}),
          };
          seenTitleYearKeys.delete(`${normClean}::`);
          seenTitleYearKeys.add(titleYearKey);
          if (cid !== undefined) seenCollectionIds.add(cid);
          continue;
        }
      }
    } else {
      if (seenNormToIndex.has(normClean)) continue;
    }

    if (cid !== undefined) seenCollectionIds.add(cid);
    seenTitleYearKeys.add(titleYearKey);
    if (!seenNormToIndex.has(normClean)) {
      seenNormToIndex.set(normClean, deduped.length);
    }
    deduped.push(item);
  }

  return deduped;
};

/**
 * V47.16 (Rule 38 Tier 4 Relaxation):
 * Sanitizes and deduplicates Gemini's text-only discography on Tier 4 iTunes misses,
 * stripping any unverified `itunesCollectionId` fields while preserving `{ albumName, releaseYear }`.
 */
export const sanitizeTextOnlyDiscography = (
  discography?: DiscographyItem[] | null
): DiscographyItem[] => {
  if (!Array.isArray(discography) || discography.length === 0) return [];
  const stripped: DiscographyItem[] = [];
  for (const item of discography) {
    if (!item || typeof item.albumName !== 'string' || !item.albumName.trim()) continue;
    const releaseYear =
      item.releaseYear !== undefined && item.releaseYear !== null
        ? String(item.releaseYear).trim()
        : '';
    stripped.push({
      albumName: item.albumName.trim(),
      releaseYear,
    });
  }
  return deduplicateDiscographyItems(stripped);
};

export const reconcileDiscographyWithITunes = (
  llmDiscography: DiscographyItem[],
  itunesAlbums: any[],
  cleanArtistName: string,
  context?: CollectionSanityContext
): DiscographyItem[] => {
  if (!Array.isArray(itunesAlbums) || itunesAlbums.length === 0) {
    return deduplicateDiscographyItems(llmDiscography || []);
  }

  const sanityAlbums = filterConflatedArtistCollections(itunesAlbums, context, llmDiscography);

  const validItunesCollections: {
    rawTitle: string;
    cleanTitle: string;
    normTitle: string;
    year?: string;
    trackCount: number;
    releaseDate?: string;
    collectionId?: number;
  }[] = [];

  const seenCollectionIds = new Set<number>();
  const seenTitleYearKeys = new Set<string>();
  const seenAnyTitleNorms = new Set<string>();

  for (const alb of sanityAlbums) {
    if (alb.wrapperType !== 'collection') continue;
    const rawTitle = alb.collectionName || '';
    if (!rawTitle) continue;
    const cleanTitle = cleanCollectionTitle(rawTitle);
    const normTitle = normalizeAlbumTitle(rawTitle);
    if (normTitle.length < 2) continue;
    if (GENERIC_ALBUM_TITLES.has(cleanTitle.toLowerCase().trim())) continue;
    if (isSelfTitledAlbumMatch(normTitle, cleanArtistName) && !hasQualifyingDescriptor(rawTitle)) continue;

    const rawYear = alb.releaseDate ? new Date(alb.releaseDate).getFullYear() : undefined;
    const year = rawYear && !isNaN(rawYear) ? String(rawYear) : undefined;
    const numericCollectionId = Number(alb.collectionId);
    const validCollectionId =
      numericCollectionId > 0 && !isNaN(numericCollectionId) ? numericCollectionId : undefined;

    if (validCollectionId !== undefined && seenCollectionIds.has(validCollectionId)) continue;
    const titleYearKey = `${normTitle}::${year || ''}`;
    if (year) {
      if (seenTitleYearKeys.has(titleYearKey)) continue;
    } else {
      if (seenAnyTitleNorms.has(normTitle)) continue;
    }

    if (validCollectionId !== undefined) seenCollectionIds.add(validCollectionId);
    seenTitleYearKeys.add(titleYearKey);
    seenAnyTitleNorms.add(normTitle);

    validItunesCollections.push({
      rawTitle,
      cleanTitle,
      normTitle,
      year,
      trackCount: Number(alb.trackCount) || 0,
      releaseDate: alb.releaseDate,
      collectionId: validCollectionId
    });
  }

  const reconciled: DiscographyItem[] = [];
  const consumedCollectionIds = new Set<number>();
  const consumedTitleYearKeys = new Set<string>();

  const isItunesAlbConsumed = (alb: typeof validItunesCollections[0]): boolean => {
    if (alb.collectionId !== undefined && consumedCollectionIds.has(alb.collectionId)) return true;
    const key = `${alb.normTitle}::${alb.year || ''}`;
    if (consumedTitleYearKeys.has(key)) return true;
    if (!alb.year && Array.from(consumedTitleYearKeys).some((k) => k.startsWith(`${alb.normTitle}::`))) {
      return true;
    }
    return false;
  };

  const markItunesAlbConsumed = (alb: typeof validItunesCollections[0]): void => {
    if (alb.collectionId !== undefined) consumedCollectionIds.add(alb.collectionId);
    consumedTitleYearKeys.add(`${alb.normTitle}::${alb.year || ''}`);
  };

  if (Array.isArray(llmDiscography)) {
    for (const item of llmDiscography) {
      if (!item || !item.albumName) continue;
      const zceneYear = item.releaseYear ? parseInt(item.releaseYear, 10) : undefined;
      const itemNorm = normalizeAlbumTitle(item.albumName);

      let matchedItunes: typeof validItunesCollections[0] | null = null;

      // Pass 1: Prefer unconsumed exact normalized title match (with year agreement when multiple years exist)
      for (const itunesAlb of validItunesCollections) {
        if (isItunesAlbConsumed(itunesAlb)) continue;
        if (itunesAlb.normTitle === itemNorm) {
          const itunesYear = itunesAlb.year ? parseInt(itunesAlb.year, 10) : undefined;
          if (!zceneYear || !itunesYear || Math.abs(itunesYear - zceneYear) <= 1) {
            matchedItunes = itunesAlb;
            break;
          }
        }
      }

      // Pass 2: Fallback to unconsumed fuzzy match (prevents multi-volume prefix collisions from re-matching consumed Volume One)
      if (!matchedItunes) {
        for (const itunesAlb of validItunesCollections) {
          if (isItunesAlbConsumed(itunesAlb)) continue;
          const itunesYear = itunesAlb.year ? parseInt(itunesAlb.year, 10) : undefined;
          if (titlesMatchFuzzy(itunesAlb.rawTitle, item.albumName, itunesYear, zceneYear)) {
            matchedItunes = itunesAlb;
            break;
          }
        }
      }

      if (matchedItunes) {
        reconciled.push({
          albumName: matchedItunes.cleanTitle || matchedItunes.rawTitle,
          releaseYear: matchedItunes.year || item.releaseYear || '',
          ...(matchedItunes.collectionId ? { itunesCollectionId: matchedItunes.collectionId } : {})
        });
        markItunesAlbConsumed(matchedItunes);
      } else {
        console.warn(`[reconcileDiscographyWithITunes] Dropping unverified hallucinated album "${item.albumName}" (${item.releaseYear}) for ${cleanArtistName}.`);
      }
    }
  }

  // Backfill from authentic iTunes collections only if at least one release has been positively verified,
  // OR if the input LLM discography was empty / contained solely stripped generic entries (e.g. bare "Demo").
  // Never backfill when 100% of non-generic LLM albums were rejected as unverified.
  const qualifyingLlmTitles = getQualifyingDiscographyTitles(llmDiscography, cleanArtistName);
  const canBackfill =
    (reconciled.length >= 1) ||
    (!llmDiscography || llmDiscography.length === 0) ||
    (qualifyingLlmTitles.length === 0);

  if (reconciled.length < 2 && validItunesCollections.length > 0 && canBackfill) {
    validItunesCollections.sort((a, b) => {
      const aMulti = a.trackCount >= 4 ? 0 : 1;
      const bMulti = b.trackCount >= 4 ? 0 : 1;
      if (aMulti !== bMulti) return aMulti - bMulti;
      const dateA = a.releaseDate ? new Date(a.releaseDate).getTime() : 0;
      const dateB = b.releaseDate ? new Date(b.releaseDate).getTime() : 0;
      return dateA - dateB;
    });

    for (const alb of validItunesCollections) {
      if (reconciled.length >= 3) break;
      if (!isItunesAlbConsumed(alb)) {
        reconciled.push({
          albumName: alb.cleanTitle || alb.rawTitle,
          releaseYear: alb.year || '',
          ...(alb.collectionId ? { itunesCollectionId: alb.collectionId } : {})
        });
        markItunesAlbConsumed(alb);
      }
    }
    console.log(`[reconcileDiscographyWithITunes] Reconciled/Backfilled ${reconciled.length} verified collections from iTunes for ${cleanArtistName}: [${reconciled.map(r => `"${r.albumName}"`).join(', ')}]`);
  }

  return deduplicateDiscographyItems(reconciled);
};

export interface ScrapeImageResult {
  imageUrl: string | null;
  reconciledDiscography: DiscographyItem[];
  itunesArtistId?: number | null;
  verifiedArtistName?: string | null;
}

interface CandidateVerification {
  candidate: any;
  matchCount: number;
  matchedTitles: string[];
  bestArtwork: string | null;
  albums?: any[];
}

const verifyCandidateDiscography = async (
  candidate: any,
  cleanArtistName: string,
  discography: DiscographyItem[],
  storefrontCountry?: string,
  context?: CollectionSanityContext
): Promise<CandidateVerification> => {
  const validZceneAlbums = getQualifyingDiscographyTitles(discography, cleanArtistName);
  const targetGenre = (context?.genre || '').trim();
  const targetSummary = (context?.summary || '').trim();
  const parsedFoundedYear = parseFoundedYear(context?.foundedYear);

  if (validZceneAlbums.length === 0) {
    return { candidate, matchCount: 0, matchedTitles: [], bestArtwork: null, albums: [] };
  }

  try {
    const countryParam = storefrontCountry ? `&country=${encodeURIComponent(storefrontCountry)}` : '';
    const lookupUrl = `https://itunes.apple.com/lookup?id=${candidate.artistId}&entity=album&limit=200${countryParam}`;
    const data = await fetchItunesJsonWithRetry(lookupUrl, 4000);
    if (data) {
      const albums = (data.results || []).filter(
        (r: any) => r.wrapperType === 'collection' && String(r.artistId) === String(candidate.artistId)
      );

      const matchedZceneTitles = new Set<string>();
      let bestArtwork: string | null = null;

      for (const alb of albums) {
        const albTitle = alb.collectionName || '';
        const normItunes = normalizeAlbumTitle(albTitle);
        if (normItunes.length < 3) continue;
        if (GENERIC_ALBUM_TITLES.has(albTitle.toLowerCase().trim())) continue;
        if (isSelfTitledAlbumMatch(normItunes, cleanArtistName) && !hasQualifyingDescriptor(albTitle)) continue;

        const albGenre = String(alb.primaryGenreName || '').trim();
        if (
          albGenre &&
          (targetGenre || targetSummary) &&
          !evaluateGenreMatch(albGenre, targetGenre, targetSummary) &&
          !isCatalogCorroboratedNonHostileGenre(albGenre, targetGenre || undefined)
        ) {
          continue;
        }

        const rawAlbYear = alb.releaseDate ? new Date(alb.releaseDate).getFullYear() : undefined;
        const albYear = rawAlbYear && !isNaN(rawAlbYear) ? rawAlbYear : undefined;
        if (parsedFoundedYear !== undefined && albYear !== undefined && albYear < parsedFoundedYear - 1) {
          continue;
        }

        for (const zceneAlb of validZceneAlbums) {
          if (titlesMatchFuzzy(albTitle, zceneAlb.raw, albYear, zceneAlb.year)) {
            matchedZceneTitles.add(zceneAlb.raw);
            if (!bestArtwork && alb.artworkUrl100) {
              bestArtwork = alb.artworkUrl100.replace('100x100bb', '600x600bb');
            }
            break;
          }
        }
      }

      const uniqueMatches = Array.from(matchedZceneTitles);
      return {
        candidate,
        matchCount: uniqueMatches.length,
        matchedTitles: uniqueMatches,
        bestArtwork,
        albums
      };
    }
  } catch (err) {
    // Graceful fallback to 0 matches
  }

  return { candidate, matchCount: 0, matchedTitles: [], bestArtwork: null, albums: [] };
};

const isQualifyingMatch = (verification: CandidateVerification): boolean => {
  if (verification.matchCount === 0) return false;
  const hasStrongTitle = verification.matchedTitles.some(title => {
    const words = title.trim().split(/\s+/);
    return words.length >= 2 || title.length >= 8;
  });
  if (hasStrongTitle) return true;
  return verification.matchCount >= 2;
};

export const scrapeImageUrlBackend = async (
  artistName: string,
  type: string,
  genre: string,
  summary: string,
  origin?: string,
  discography?: DiscographyItem[],
  countryIso?: string | null,
  foundedYear?: string | number | null
): Promise<ScrapeImageResult> => {
  // Strategy: High-Speed Deterministic iTunes API (Artists Only)
  if (type === 'label') {
    return { imageUrl: null, reconciledDiscography: discography || [], itunesArtistId: null };
  }

  // Rule 35 & Rule 38 Regional Storefront Routing:
  // Non-US artists query their regional ISO-3166-1 alpha-2 storefront (&country=ISO, e.g. TH, GB, JP)
  // FIRST before falling back to the default US storefront.
  const resolvedIso =
    normalizeIsoCode(countryIso) ||
    (origin ? normalizeIsoCode(extractCountrySlug(origin)) : null);

  let cleanArtistName = stripCountrySlug(artistName, resolvedIso || origin).trim();
  if (cleanArtistName.includes('-') && !cleanArtistName.includes(' ')) {
    cleanArtistName = titleCaseArtistId(cleanArtistName);
  }

  const normName = (name: string) => (name || "").toLowerCase().replace(/[^a-z0-9]/g, '');
  const sanityContext: CollectionSanityContext = { genre, summary, foundedYear };
  const parsedFoundedYear = parseFoundedYear(foundedYear);
  const qualifyingDiscography = getQualifyingDiscographyTitles(discography, cleanArtistName);
  const requiresCatalogCorroboration = qualifyingDiscography.length > 0;

  const storefrontsToTry: Array<string | undefined> =
    resolvedIso && resolvedIso !== 'us' ? [resolvedIso.toUpperCase(), undefined] : [undefined];

  for (const storefront of storefrontsToTry) {
    const countryParam = storefront ? `&country=${encodeURIComponent(storefront)}` : '';
    const storefrontLabel = storefront || 'US(default)';

    // --- Tier 1: Base Query & Strict Taxonomy Match ---
    let baseExactMatches: any[] = [];
    let primaryOptionalTheMatches: any[] = [];
    let articleVariantMatches: any[] = [];
    const targetNorm = normName(cleanArtistName);
    const hasLeadingThe = /^the\s+/i.test(cleanArtistName);
    const bareWithoutThe = cleanArtistName.replace(/^the\s+/i, '').trim();
    const articleVariantName = hasLeadingThe
      ? (normName(bareWithoutThe).length >= 3 && normName(bareWithoutThe) !== 'the' ? bareWithoutThe : null)
      : (targetNorm.length >= 3 ? `The ${cleanArtistName}` : null);

    try {
      const itunesUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(cleanArtistName)}&entity=musicArtist&limit=20${countryParam}`;
      const data = await fetchItunesJsonWithRetry(itunesUrl, 4000);
      if (data) {
        const results = data.results || [];
        baseExactMatches = results.filter((r: any) => normName(r.artistName) === targetNorm);
        primaryOptionalTheMatches = results.filter(
          (r: any) =>
            normName(r.artistName) !== targetNorm &&
            artistNamesMatchWithOptionalThe(r.artistName, cleanArtistName, {
              requireMultiWordForOptionalThe: !requiresCatalogCorroboration,
            })
        );
      }
    } catch (err: any) {
      console.warn(`[scrapeImageUrlBackend] iTunes search failed for "${cleanArtistName}" (${storefrontLabel}):`, err.message);
    }

    // V45.10 Spacing-collapsed fallback (e.g. "Lung Leg" -> "LungLeg") strictly gated by normName exact match
    if (baseExactMatches.length === 0 && cleanArtistName.includes(' ')) {
      const collapsedName = cleanArtistName.replace(/\s+/g, '');
      if (collapsedName && collapsedName !== cleanArtistName) {
        try {
          const collapsedUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(collapsedName)}&entity=musicArtist&limit=20${countryParam}`;
          const collapsedData = await fetchItunesJsonWithRetry(collapsedUrl, 4000);
          if (collapsedData) {
            baseExactMatches = (collapsedData.results || []).filter((r: any) => normName(r.artistName) === targetNorm);
            if (baseExactMatches.length > 0) {
              console.log(`[scrapeImageUrlBackend] [Tier 1 Spacing Fallback | ${storefrontLabel}] "${cleanArtistName}" recovered ${baseExactMatches.length} exact match(es) via "${collapsedName}".`);
            }
          }
        } catch (err: any) {
          console.warn(`[scrapeImageUrlBackend] Spacing-collapsed iTunes search failed for "${collapsedName}" (${storefrontLabel}):`, err.message);
        }
      }
    }

    const evaluateTier1CandidateGroup = async (
      candidates: any[],
      candidateArtistName: string
    ): Promise<ScrapeImageResult | null> => {
      if (candidates.length === 0) return null;
      const strictMatches = candidates.filter(r => evaluateGenreMatch(r.primaryGenreName, genre, summary));

      if (strictMatches.length === 1) {
        const winner = strictMatches[0];
        const { artwork, albums } = await fetchArtistCollections(winner.artistId, storefront, sanityContext);
        if (artwork) {
          const reconciled = reconcileDiscographyWithITunes(discography || [], albums, candidateArtistName, sanityContext);
          const hasVerifiedCatalog = reconciled.length > 0;
          const passesGate = requiresCatalogCorroboration
            ? hasVerifiedCatalog
            : passesUncorroboratedEraGate(reconciled, foundedYear);
          if (hasVerifiedCatalog && passesGate) {
            const bestImageUrl = selectBestArtistArtwork(albums, reconciled, sanityContext) || artwork;
            const verifiedArtistName = resolveVerifiedItunesArtistDisplayName(
              [winner.artistName, ...albums.map((a: any) => a?.artistName)],
              cleanArtistName
            );
            console.log(`[scrapeImageUrlBackend] [Tier 1 Hit | ${storefrontLabel}] "${cleanArtistName}" verified via strict taxonomy overlap. (iTunes ID: ${winner.artistId}, Genre: '${winner.primaryGenreName}')`);
            return { imageUrl: bestImageUrl, reconciledDiscography: reconciled, itunesArtistId: Number(winner.artistId) || null, verifiedArtistName };
          } else if (!hasVerifiedCatalog) {
            console.warn(`[scrapeImageUrlBackend] [Tier 1 Empty Catalog Reject | ${storefrontLabel}] "${cleanArtistName}" candidate #${winner.artistId} ('${winner.primaryGenreName}') yielded 0 verified releases after reconciliation. Escalating to Tier 2/3.`);
          } else {
            console.warn(`[scrapeImageUrlBackend] [Tier 1 Uncorroborated Era Reject | ${storefrontLabel}] "${cleanArtistName}" candidate #${winner.artistId} ('${winner.primaryGenreName}') failed debut-era ceiling against foundedYear='${foundedYear || ''}'. Escalating to Tier 2/3.`);
          }
        }
      } else if (strictMatches.length > 1) {
        // Tier 1 Genre-Distance Scoring (Rule 38)
        const scoredCandidates = strictMatches.map(c => ({
          candidate: c,
          score: evaluateGenreDistanceScore(c.primaryGenreName, genre, summary)
        }));
        scoredCandidates.sort((a, b) => b.score - a.score);

        const top = scoredCandidates[0];
        const runnerUp = scoredCandidates[1];

        // If top candidate has direct taxonomy match (>= 8) and runner-up is distant bridge (<= 4)
        if (top.score >= 8 && runnerUp.score <= 4) {
          const winner = top.candidate;
          const { artwork, albums } = await fetchArtistCollections(winner.artistId, storefront, sanityContext);
          if (artwork) {
            const reconciled = reconcileDiscographyWithITunes(discography || [], albums, candidateArtistName, sanityContext);
            const hasVerifiedCatalog = reconciled.length > 0;
            const passesGate = requiresCatalogCorroboration
              ? hasVerifiedCatalog
              : passesUncorroboratedEraGate(reconciled, foundedYear);
            if (hasVerifiedCatalog && passesGate) {
              const bestImageUrl = selectBestArtistArtwork(albums, reconciled, sanityContext) || artwork;
              const verifiedArtistName = resolveVerifiedItunesArtistDisplayName(
                [winner.artistName, ...albums.map((a: any) => a?.artistName)],
                cleanArtistName
              );
              console.log(`[scrapeImageUrlBackend] [Tier 1 Genre-Distance Hit | ${storefrontLabel}] "${cleanArtistName}" resolved among ${strictMatches.length} candidates via taxonomic distance (Score: ${top.score} vs ${runnerUp.score}). Winner iTunes ID: ${winner.artistId} ('${winner.primaryGenreName}')`);
              return { imageUrl: bestImageUrl, reconciledDiscography: reconciled, itunesArtistId: Number(winner.artistId) || null, verifiedArtistName };
            } else if (!hasVerifiedCatalog) {
              console.warn(`[scrapeImageUrlBackend] [Tier 1 Genre-Distance Empty Catalog Reject | ${storefrontLabel}] "${cleanArtistName}" candidate #${winner.artistId} ('${winner.primaryGenreName}') yielded 0 verified releases. Escalating to Tier 3.`);
            } else {
              console.warn(`[scrapeImageUrlBackend] [Tier 1 Uncorroborated Era Reject | ${storefrontLabel}] "${cleanArtistName}" candidate #${winner.artistId} ('${winner.primaryGenreName}') failed debut-era ceiling against foundedYear='${foundedYear || ''}'. Escalating to Tier 3.`);
            }
          }
        }

        console.warn(`[scrapeImageUrlBackend] [Tier 1 Ambiguity | ${storefrontLabel}] "${cleanArtistName}" has ${strictMatches.length} candidates matching taxonomy [${strictMatches.map(m => `'${m.primaryGenreName}'#${m.artistId}`).join(', ')}]. Escalating to Tier 3.`);
      } else {
        console.warn(`[scrapeImageUrlBackend] [Tier 1 Blocked | ${storefrontLabel}] "${cleanArtistName}" genre mismatch. Zcene: '${genre}', iTunes: [${candidates.map(m => `'${m.primaryGenreName}'#${m.artistId}`).join(', ')}]. Escalating to Tier 2/3.`);
      }
      return null;
    };

    if (baseExactMatches.length > 0) {
      const primaryTier1Hit = await evaluateTier1CandidateGroup(baseExactMatches, cleanArtistName);
      if (primaryTier1Hit) return primaryTier1Hit;
    }

    // V47.10 / V47.16 Bidirectional Leading "The " fallback (e.g. "Murder City Devils" <-> "The Murder City Devils")
    // Fires when primary exact matches are empty OR when primary exact matches failed to resolve a Tier 1 winner (e.g. 0-album stub).
    const canTryOptionalTheInTier1 =
      Boolean(articleVariantName) &&
      artistNamesMatchWithOptionalThe(articleVariantName, cleanArtistName, {
        requireMultiWordForOptionalThe: !requiresCatalogCorroboration,
      });

    if (canTryOptionalTheInTier1 && articleVariantName) {
      if (primaryOptionalTheMatches.length > 0) {
        articleVariantMatches = primaryOptionalTheMatches;
      } else {
        const variantTargetNorm = normName(articleVariantName);
        try {
          const theUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(articleVariantName)}&entity=musicArtist&limit=20${countryParam}`;
          const theData = await fetchItunesJsonWithRetry(theUrl, 4000);
          if (theData) {
            articleVariantMatches = (theData.results || []).filter((r: any) => normName(r.artistName) === variantTargetNorm);
          }
        } catch (err: any) {
          console.warn(`[scrapeImageUrlBackend] Leading-The iTunes search failed for "${articleVariantName}" (${storefrontLabel}):`, err.message);
        }
      }

      if (articleVariantMatches.length > 0) {
        console.log(`[scrapeImageUrlBackend] [Tier 1 Leading-The Fallback | ${storefrontLabel}] "${cleanArtistName}" recovered ${articleVariantMatches.length} match(es) via "${articleVariantName}".`);
        const articleTier1Hit = await evaluateTier1CandidateGroup(articleVariantMatches, articleVariantName);
        if (articleTier1Hit) return articleTier1Hit;
      }
    }

    // --- Tier 2: Geographic Fallback (e.g., "Darko US", "Klear TH") ---
    let geoExactMatches: any[] = [];
    const tier2Iso = resolvedIso || (origin ? normalizeIsoCode(extractCountrySlug(origin)) : null);
    if (tier2Iso) {
      let suffix = tier2Iso.toUpperCase();
      if (suffix === 'GB') suffix = 'UK';

      const fallbackName = `${cleanArtistName} ${suffix}`;
      try {
        const geoUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(fallbackName)}&entity=musicArtist&limit=20${countryParam}`;
        const data = await fetchItunesJsonWithRetry(geoUrl, 4000);
        if (data) {
          const targetGeoNorm = normName(fallbackName);
          geoExactMatches = (data.results || []).filter((r: any) => normName(r.artistName) === targetGeoNorm);
        }
      } catch (err: any) {
        console.warn(`[scrapeImageUrlBackend] Geographic iTunes search failed for "${fallbackName}" (${storefrontLabel}):`, err.message);
      }

      if (geoExactMatches.length > 0) {
        const geoStrictMatches = geoExactMatches.filter(r => evaluateGenreMatch(r.primaryGenreName, genre, summary));
        if (geoStrictMatches.length === 1) {
          const winner = geoStrictMatches[0];
          const { artwork, albums } = await fetchArtistCollections(winner.artistId, storefront, sanityContext);
          if (artwork) {
            const reconciled = reconcileDiscographyWithITunes(discography || [], albums, cleanArtistName, sanityContext);
            const hasVerifiedCatalog = reconciled.length > 0;
            const passesGate = requiresCatalogCorroboration
              ? hasVerifiedCatalog
              : passesUncorroboratedEraGate(reconciled, foundedYear);
            if (hasVerifiedCatalog && passesGate) {
              const bestImageUrl = selectBestArtistArtwork(albums, reconciled, sanityContext) || artwork;
              const verifiedArtistName = resolveVerifiedItunesArtistDisplayName(
                [...albums.map((a: any) => a?.artistName), winner.artistName],
                cleanArtistName
              );
              console.log(`[scrapeImageUrlBackend] [Tier 2 Hit | ${storefrontLabel}] "${cleanArtistName}" verified via geographic fallback "${fallbackName}". (iTunes ID: ${winner.artistId}, Genre: '${winner.primaryGenreName}')`);
              return { imageUrl: bestImageUrl, reconciledDiscography: reconciled, itunesArtistId: Number(winner.artistId) || null, verifiedArtistName };
            } else if (!hasVerifiedCatalog) {
              console.warn(`[scrapeImageUrlBackend] [Tier 2 Empty Catalog Reject | ${storefrontLabel}] "${cleanArtistName}" candidate #${winner.artistId} ('${winner.primaryGenreName}') yielded 0 verified releases.`);
            } else {
              console.warn(`[scrapeImageUrlBackend] [Tier 2 Uncorroborated Era Reject | ${storefrontLabel}] "${cleanArtistName}" candidate #${winner.artistId} ('${winner.primaryGenreName}') failed debut-era ceiling against foundedYear='${foundedYear || ''}'.`);
            }
          }
        }
      } else {
        console.log(`[scrapeImageUrlBackend] [Tier 2 Miss | ${storefrontLabel}] Geographic query "${fallbackName}" returned 0 exact matches.`);
      }
    }

    // --- Tier 3A: Discography Tie-Breaker & Verification ---
    const allCandidatesMap = new Map<string, any>();
    for (const c of [...baseExactMatches, ...articleVariantMatches, ...geoExactMatches]) {
      allCandidatesMap.set(String(c.artistId), c);
    }
    const allCandidates = Array.from(allCandidatesMap.values());

    // V47.16: Track candidates whose artist-level primaryGenreName is explicitly hostile so Tier 3B
    // requires >= 2 verified non-hostile releases before promoting a conflated hostile profile (e.g. Radon #75264551).
    const hostileProfileArtistIds = new Set<number>();
    for (const c of allCandidates) {
      const candId = Number(c?.artistId);
      const candGenre = String(c?.primaryGenreName || '').trim();
      if (
        candId > 0 &&
        candGenre &&
        (genre || summary) &&
        !evaluateGenreMatch(candGenre, genre, summary) &&
        !isCatalogCorroboratedNonHostileGenre(candGenre, genre || undefined)
      ) {
        hostileProfileArtistIds.add(candId);
      }
    }

    if (allCandidates.length > 0 && qualifyingDiscography.length > 0) {
      allCandidates.sort((a, b) => {
        const aMatch = evaluateGenreMatch(a.primaryGenreName, genre, summary) ? 1 : 0;
        const bMatch = evaluateGenreMatch(b.primaryGenreName, genre, summary) ? 1 : 0;
        return bMatch - aMatch;
      });

      const cappedCandidates = allCandidates.slice(0, 5);
      console.log(`[scrapeImageUrlBackend] [Tier 3 Escalation | ${storefrontLabel}] "${cleanArtistName}": Evaluating ${cappedCandidates.length} candidate(s) against ${discography!.length} known album(s).`);

      const verificationResults = await Promise.allSettled(
        cappedCandidates.map(cand => verifyCandidateDiscography(cand, cleanArtistName, discography!, storefront, sanityContext))
      );

      const verifiedWinners: CandidateVerification[] = [];
      for (const res of verificationResults) {
        if (res.status === 'fulfilled' && isQualifyingMatch(res.value)) {
          verifiedWinners.push(res.value);
        }
      }

      let finalWinner: CandidateVerification | null = null;

      if (verifiedWinners.length === 1) {
        const candidate = verifiedWinners[0].candidate;
        const isGenreMatch = evaluateGenreMatch(candidate.primaryGenreName, genre, summary);
        if (isGenreMatch || verifiedWinners[0].matchCount >= 2) {
          finalWinner = verifiedWinners[0];
        } else {
          console.warn(`[scrapeImageUrlBackend] [Tier 3 Hostile Genre Block | ${storefrontLabel}] "${cleanArtistName}" candidate #${candidate.artistId} has hostile genre ('${candidate.primaryGenreName}' vs '${genre}') with insufficient proof (${verifiedWinners[0].matchCount} match). Aborting.`);
        }
      } else if (verifiedWinners.length > 1) {
        const genreMatchedWinners = verifiedWinners.filter(w =>
          evaluateGenreMatch(w.candidate.primaryGenreName, genre, summary)
        );

        if (genreMatchedWinners.length === 1) {
          finalWinner = genreMatchedWinners[0];
          console.log(`[scrapeImageUrlBackend] [Tier 3 Tie-Breaker Hit | ${storefrontLabel}] "${cleanArtistName}" resolved among ${verifiedWinners.length} candidates via strict genre affinity. Winner iTunes ID: ${finalWinner.candidate.artistId} ('${finalWinner.candidate.primaryGenreName}')`);
        } else if (genreMatchedWinners.length > 1) {
          const scored = genreMatchedWinners.map(w => {
            let score = w.matchCount * 10;
            const itunesGenre = (w.candidate.primaryGenreName || '').toLowerCase().trim();
            const targetGenre = (genre || '').toLowerCase().trim();
            if (itunesGenre && targetGenre && (itunesGenre.includes(targetGenre) || targetGenre.includes(itunesGenre))) {
              score += 5;
            }
            return { winner: w, score };
          });

          scored.sort((a, b) => b.score - a.score);

          if (scored[0].score > scored[1].score) {
            finalWinner = scored[0].winner;
            console.log(`[scrapeImageUrlBackend] [Tier 3 Score Winner | ${storefrontLabel}] "${cleanArtistName}" resolved with score ${scored[0].score} vs runner-up ${scored[1].score}. Winner iTunes ID: ${finalWinner.candidate.artistId}`);
          } else {
            console.warn(`[scrapeImageUrlBackend] [Tier 3 Ambiguity | ${storefrontLabel}] "${cleanArtistName}" has ${genreMatchedWinners.length} genre-matched candidates with tied score (${scored[0].score}). Aborting storefront to prevent homonym pollution.`);
          }
        } else {
          const catalogCorroboratedWinners = verifiedWinners.filter(
            (w) =>
              w.matchCount >= 2 &&
              isCatalogCorroboratedNonHostileGenre(String(w.candidate.primaryGenreName || ''), genre || undefined)
          );
          if (catalogCorroboratedWinners.length === 1) {
            finalWinner = catalogCorroboratedWinners[0];
            console.log(`[scrapeImageUrlBackend] [Tier 3 Catalog-Corroborated Tie-Breaker Hit | ${storefrontLabel}] "${cleanArtistName}" resolved via ${finalWinner.matchCount} non-hostile album matches. Winner iTunes ID: ${finalWinner.candidate.artistId} ('${finalWinner.candidate.primaryGenreName}')`);
          } else {
            console.warn(`[scrapeImageUrlBackend] [Tier 3 Ambiguity | ${storefrontLabel}] "${cleanArtistName}" has ${verifiedWinners.length} candidates matching discography, but 0 matched genre taxonomy ('${genre}'). Aborting storefront to prevent homonym pollution.`);
          }
        }
      } else {
        console.warn(`[scrapeImageUrlBackend] [Tier 3 Miss | ${storefrontLabel}] "${cleanArtistName}": 0 candidates matched discography.`);
      }

      if (finalWinner) {
        let artwork = finalWinner.bestArtwork;
        let albums = finalWinner.albums || [];
        if (!artwork || albums.length === 0) {
          const fetched = await fetchArtistCollections(finalWinner.candidate.artistId, storefront, sanityContext);
          if (!artwork) artwork = fetched.artwork;
          if (albums.length === 0) albums = fetched.albums;
        }
        if (artwork) {
          const reconciled = reconcileDiscographyWithITunes(discography || [], albums, cleanArtistName, sanityContext);
          if (reconciled.length > 0) {
            const bestImageUrl = selectBestArtistArtwork(albums, reconciled, sanityContext) || artwork;
            const verifiedArtistName = resolveVerifiedItunesArtistDisplayName(
              [finalWinner.candidate?.artistName, ...albums.map((a: any) => a?.artistName)],
              cleanArtistName
            );
            console.log(`[scrapeImageUrlBackend] [Tier 3 Hit | ${storefrontLabel}] "${cleanArtistName}" (iTunes ID: ${finalWinner.candidate.artistId}) verified via ${finalWinner.matchCount} album matches: [${finalWinner.matchedTitles.map(t => `"${t}"`).join(', ')}]`);
            return { imageUrl: bestImageUrl, reconciledDiscography: reconciled, itunesArtistId: Number(finalWinner.candidate.artistId) || null, verifiedArtistName };
          } else {
            console.warn(`[scrapeImageUrlBackend] [Tier 3 Empty Catalog Reject | ${storefrontLabel}] "${cleanArtistName}" candidate #${finalWinner.candidate.artistId} yielded 0 verified releases after reconciliation.`);
          }
        }
      }
    }

    // --- Tier 3B: Album-Anchored entity=song Fallback (V47.8 / V47.10 — Rule 38 Layer 2) ---
    // Fires ONLY when Tiers 1, 2, and 3A failed to resolve a verified winner AND >=1 non-generic album title exists.
    // Uses entity=song (reliably indexed where multi-term entity=album misses), capped at 3 queries, strictly fail-closed.
    if (qualifyingDiscography.length > 0) {
      // V47.12: Compute format-stripped title metadata and strictly guard against any entry whose
      // stripped title collapses to self-titled (targetNorm, e.g. "Mouthpiece EP" -> "Mouthpiece")
      // or GENERIC_ALBUM_TITLES (e.g. "Demo 1991" -> "Demo").
      const isCollapsedSelfTitledOrGeneric = (rawTitle: string): boolean => {
        const strippedRaw = cleanSongQueryAlbumTitle(rawTitle);
        const strippedLower = strippedRaw.toLowerCase().trim();
        const strippedNorm = normalizeAlbumTitle(strippedRaw);
        const strippedWithoutYear = strippedLower.replace(/\b(19\d\d|20\d\d|'\d\d)\b/g, '').replace(/\s+/g, ' ').trim();
        return (
          strippedNorm.length < 3 ||
          isSelfTitledAlbumMatch(strippedNorm, cleanArtistName) ||
          GENERIC_ALBUM_TITLES.has(strippedLower) ||
          GENERIC_ALBUM_TITLES.has(strippedWithoutYear)
        );
      };

      const matchesTier3bTitle = (
        itunesTitle: string,
        qAlb: { raw: string; year?: number },
        itunesYear?: number,
        zceneYear?: number
      ): boolean => {
        if (isCollapsedSelfTitledOrGeneric(qAlb.raw)) return false;
        if (titlesMatchFuzzy(itunesTitle, qAlb.raw, itunesYear, zceneYear)) return true;
        const strippedQueryTitle = cleanSongQueryAlbumTitle(qAlb.raw);
        if (strippedQueryTitle !== qAlb.raw) {
          return titlesMatchFuzzy(itunesTitle, strippedQueryTitle, itunesYear, zceneYear);
        }
        return false;
      };

      // Prioritize distinct named releases ahead of self-titled/demo variants and filter out collapsed entries
      const tier3bQualifying = [...qualifyingDiscography]
        .filter((q) => !isCollapsedSelfTitledOrGeneric(q.raw))
        .sort((a, b) => {
          const aCleanNorm = normalizeAlbumTitle(cleanSongQueryAlbumTitle(a.raw));
          const bCleanNorm = normalizeAlbumTitle(cleanSongQueryAlbumTitle(b.raw));
          const aIsLowPriority = aCleanNorm === targetNorm || /\bdemos?\b/i.test(a.raw) ? 1 : 0;
          const bIsLowPriority = bCleanNorm === targetNorm || /\bdemos?\b/i.test(b.raw) ? 1 : 0;
          return aIsLowPriority - bIsLowPriority;
        });

      const cappedAlbums = tier3bQualifying.slice(0, 4);
      const tier3bDiagnostics: string[] = [];
      const verifiedArtistIds = new Set<number>();
      const matchedTrackArtistNameById = new Map<number, string>();
      let hasPerQueryAmbiguity = false;

      // V47.10 Multi-Album Reissue Year-Drift Relaxation (>=2 distinct albums -> same unambiguous artistId)
      const reissueArtistAlbums = new Map<number, Set<string>>();
      let hasReissuePerQueryAmbiguity = false;

      // V47.10 / V47.11 Conflation-Pinned Compilation Track-Match Rescue:
      // Keyed by `${artistId}::${collectionId}` -> distinct matched Gemini album norms, track norms,
      // and collection-title album norms corroborated on the exact same compilation release.
      const compilationCandidates = new Map<
        string,
        {
          artistId: number;
          collectionId: number;
          albumNorms: Set<string>;
          trackNorms: Set<string>;
          trackAlbumNorms: Set<string>;
          collectionAlbumNorms: Set<string>;
        }
      >();

      for (const alb of cappedAlbums) {
        const cleanQueryAlb = cleanSongQueryAlbumTitle(alb.raw);
        const queryTerm = `${cleanArtistName} ${cleanQueryAlb}`.trim();
        try {
          const songUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(queryTerm)}&entity=song&limit=15${countryParam}`;
          const data = await fetchItunesJsonWithRetry(songUrl, 4000);
          if (!data || !Array.isArray(data.results)) {
            tier3bDiagnostics.push(`"${alb.raw}"(q="${cleanQueryAlb}"):noData`);
            continue;
          }

          const matchedIdsForQuery = new Set<number>();
          const reissueIdsForQuery = new Set<number>();
          let rawSongCount = 0;
          let artistMatchCount = 0;
          let genreRejectCount = 0;
          let eraRejectCount = 0;
          let titleMatchCount = 0;

          for (const track of data.results) {
            if (!track || track.wrapperType !== 'track' || track.kind !== 'song') continue;
            rawSongCount++;

            const rawTrackArtist = String(track.artistName || '').trim();
            if (!rawTrackArtist || rawTrackArtist.toLowerCase() === 'various artists') continue;
            if (!artistNamesMatchWithOptionalThe(rawTrackArtist, cleanArtistName)) continue;
            artistMatchCount++;

            const numericArtistId = Number(track.artistId);
            if (!numericArtistId || isNaN(numericArtistId) || numericArtistId <= 0) continue;
            if (!matchedTrackArtistNameById.has(numericArtistId)) {
              matchedTrackArtistNameById.set(numericArtistId, rawTrackArtist);
            }

            const trackCollectionName = String(track.collectionName || '').trim();
            if (!trackCollectionName) continue;

            const trackYear = track.releaseDate ? new Date(track.releaseDate).getFullYear() : undefined;
            const validTrackYear = trackYear && !isNaN(trackYear) ? trackYear : undefined;

            const trackGenre = String(track.primaryGenreName || '');
            const isStrictTrackGenre = evaluateGenreMatch(trackGenre, genre, summary);
            const isNonHostileTrackGenre =
              tier3bQualifying.length >= 2 && isCatalogCorroboratedNonHostileGenre(trackGenre, genre || undefined);
            if (!isStrictTrackGenre && !isNonHostileTrackGenre) {
              genreRejectCount++;
              continue;
            }

            // Formation-year floor (shared across strict, reissue, and compilation paths)
            if (parsedFoundedYear !== undefined && validTrackYear !== undefined) {
              if (validTrackYear < parsedFoundedYear - 1) {
                eraRejectCount++;
                continue;
              }
            }

            // Path A & B: Collection title matches Gemini album title
            if (matchesTier3bTitle(trackCollectionName, alb, validTrackYear, alb.year)) {
              titleMatchCount++;
              reissueIdsForQuery.add(numericArtistId);

              // Strict single-album year proximity (|itunesYear - zceneYear| <= 2) + strict genre match
              const withinStrictYearWindow =
                alb.year === undefined ||
                (validTrackYear !== undefined && Math.abs(validTrackYear - alb.year) <= 2);
              if (isStrictTrackGenre && withinStrictYearWindow) {
                matchedIdsForQuery.add(numericArtistId);
              }
            }

            // Path C: Compilation Track-Match Rescue (when >=2 qualifying Gemini titles exist)
            if (tier3bQualifying.length >= 2 && COMPILATION_COLLECTION_RE.test(trackCollectionName)) {
              const numericCollectionId = Number(track.collectionId);
              if (numericCollectionId > 0 && !isNaN(numericCollectionId)) {
                const getOrCreateCompEntry = () => {
                  const pairKey = `${numericArtistId}::${numericCollectionId}`;
                  let entry = compilationCandidates.get(pairKey);
                  if (!entry) {
                    entry = {
                      artistId: numericArtistId,
                      collectionId: numericCollectionId,
                      albumNorms: new Set<string>(),
                      trackNorms: new Set<string>(),
                      trackAlbumNorms: new Set<string>(),
                      collectionAlbumNorms: new Set<string>(),
                    };
                    compilationCandidates.set(pairKey, entry);
                  }
                  return entry;
                };

                // 1. V47.11 / V47.12: Check if the compilation's collectionName itself matches any qualifying Gemini title
                const cleanColl = cleanCollectionTitle(trackCollectionName).toLowerCase().trim();
                const normColl = normalizeAlbumTitle(trackCollectionName);
                if (
                  normColl.length >= 4 &&
                  !GENERIC_ALBUM_TITLES.has(cleanColl) &&
                  !GENERIC_ALBUM_TITLES.has(trackCollectionName.toLowerCase()) &&
                  !(normColl === targetNorm && !hasQualifyingDescriptor(trackCollectionName))
                ) {
                  for (const qAlb of tier3bQualifying) {
                    if (matchesTier3bTitle(trackCollectionName, qAlb)) {
                      titleMatchCount++;
                      const entry = getOrCreateCompEntry();
                      entry.albumNorms.add(qAlb.norm);
                      entry.collectionAlbumNorms.add(qAlb.norm);
                    }
                  }
                }

                // 2. V47.11 / V47.12: Cross-match returned compilation song row against all qualifying Gemini titles
                const rawTrackName = String(track.trackName || '').trim();
                const cleanTrack = cleanCollectionTitle(rawTrackName).toLowerCase().trim();
                const normTrack = normalizeAlbumTitle(rawTrackName);
                if (
                  normTrack.length >= 4 &&
                  !GENERIC_ALBUM_TITLES.has(cleanTrack) &&
                  !GENERIC_ALBUM_TITLES.has(rawTrackName.toLowerCase()) &&
                  !(normTrack === targetNorm && !hasQualifyingDescriptor(rawTrackName))
                ) {
                  for (const qAlb of tier3bQualifying) {
                    if (matchesTier3bTitle(rawTrackName, qAlb)) {
                      titleMatchCount++;
                      const entry = getOrCreateCompEntry();
                      entry.albumNorms.add(qAlb.norm);
                      entry.trackAlbumNorms.add(qAlb.norm);
                      entry.trackNorms.add(normTrack);
                    }
                  }
                }
              }
            }
          }

          tier3bDiagnostics.push(
            `"${alb.raw}"(q="${cleanQueryAlb}"):hits=${rawSongCount},artist=${artistMatchCount},genreReject=${genreRejectCount},eraReject=${eraRejectCount},matched=${titleMatchCount}`
          );

          if (matchedIdsForQuery.size === 1) {
            const [singleId] = Array.from(matchedIdsForQuery);
            verifiedArtistIds.add(singleId);
          } else if (matchedIdsForQuery.size > 1) {
            hasPerQueryAmbiguity = true;
            console.warn(`[scrapeImageUrlBackend] [Tier 3B Ambiguity | ${storefrontLabel}] "${cleanArtistName}" album query "${alb.raw}" matched ${matchedIdsForQuery.size} distinct artistIds. Failing closed.`);
            if (tier3bQualifying.length < 2) break;
          }

          if (reissueIdsForQuery.size === 1) {
            const [singleReissueId] = Array.from(reissueIdsForQuery);
            if (!reissueArtistAlbums.has(singleReissueId)) {
              reissueArtistAlbums.set(singleReissueId, new Set<string>());
            }
            reissueArtistAlbums.get(singleReissueId)!.add(alb.norm);
          } else if (reissueIdsForQuery.size > 1) {
            hasReissuePerQueryAmbiguity = true;
          }
        } catch (err: any) {
          tier3bDiagnostics.push(`"${alb.raw}"(q="${cleanQueryAlb}"):error`);
          console.warn(`[scrapeImageUrlBackend] [Tier 3B Error | ${storefrontLabel}] Album-anchored lookup failed for "${queryTerm}":`, err?.message || err);
        }
      }

      if (!hasPerQueryAmbiguity && verifiedArtistIds.size === 1) {
        const [verifiedArtistId] = Array.from(verifiedArtistIds);
        const isHostileConflatedProfile = hostileProfileArtistIds.has(verifiedArtistId);
        const minRequiredReconciled = isHostileConflatedProfile ? 2 : 1;
        const { artwork, albums } = await fetchArtistCollections(verifiedArtistId, storefront, sanityContext);
        if (artwork && albums.length > 0) {
          const reconciled = reconcileDiscographyWithITunes(discography || [], albums, cleanArtistName, sanityContext);
          if (reconciled.length >= minRequiredReconciled) {
            const bestImageUrl = selectBestArtistArtwork(albums, reconciled, sanityContext) || artwork;
            const verifiedArtistName = resolveVerifiedItunesArtistDisplayName(
              [...albums.map((a: any) => a?.artistName), matchedTrackArtistNameById.get(verifiedArtistId)],
              cleanArtistName
            );
            console.log(`[scrapeImageUrlBackend] [Tier 3B Album-Anchored Hit | ${storefrontLabel}] "${cleanArtistName}" recovered verified iTunes artistId #${verifiedArtistId} with ${reconciled.length} reconciled release(s).`);
            return { imageUrl: bestImageUrl, reconciledDiscography: reconciled, itunesArtistId: verifiedArtistId, verifiedArtistName };
          } else if (isHostileConflatedProfile) {
            console.warn(`[scrapeImageUrlBackend] [Tier 3B Hostile Conflation Block | ${storefrontLabel}] "${cleanArtistName}" candidate #${verifiedArtistId} was flagged with a hostile artist-level genre in Tier 1/3A and only corroborated ${reconciled.length} release(s) (<2 required). Rejecting.`);
          }
        }
      } else if (verifiedArtistIds.size > 1) {
        console.warn(`[scrapeImageUrlBackend] [Tier 3B Cross-Query Ambiguity | ${storefrontLabel}] "${cleanArtistName}" matched ${verifiedArtistIds.size} distinct artistIds across album queries. Aborting fail-closed.`);
      }

      // V47.10 Fallback 1: Multi-Album Reissue Year-Drift Relaxation (>=2 distinct albums on 1 unambiguous artistId)
      if (tier3bQualifying.length >= 2 && !hasReissuePerQueryAmbiguity && verifiedArtistIds.size <= 1) {
        const reissueWinners = Array.from(reissueArtistAlbums.entries()).filter(([_, set]) => set.size >= 2);
        if (reissueWinners.length === 1) {
          const [reissueArtistId] = reissueWinners[0];
          const { artwork, albums } = await fetchArtistCollections(reissueArtistId, storefront, sanityContext);
          if (artwork && albums.length > 0) {
            const reconciled = reconcileDiscographyWithITunes(discography || [], albums, cleanArtistName, sanityContext);
            if (reconciled.length >= 2) {
              const bestImageUrl = selectBestArtistArtwork(albums, reconciled, sanityContext) || artwork;
              const verifiedArtistName = resolveVerifiedItunesArtistDisplayName(
                [...albums.map((a: any) => a?.artistName), matchedTrackArtistNameById.get(reissueArtistId)],
                cleanArtistName
              );
              console.log(`[scrapeImageUrlBackend] [Tier 3B Multi-Album Reissue Hit | ${storefrontLabel}] "${cleanArtistName}" recovered verified iTunes artistId #${reissueArtistId} across ${reconciled.length} reissued releases.`);
              return { imageUrl: bestImageUrl, reconciledDiscography: reconciled, itunesArtistId: reissueArtistId, verifiedArtistName };
            }
          }
        }
      }

      // V47.10 / V47.11 Fallback 2: Conflation-Pinned Compilation Track-Match Rescue
      if (tier3bQualifying.length >= 2) {
        const compilationWinners = Array.from(compilationCandidates.values()).filter((c) => {
          if (c.albumNorms.size < 2) return false;
          if (c.trackNorms.size >= 2) return true;
          // V47.11: Allow 1 compilation collectionName match + >=1 distinct trackName match on the exact same (artistId, collectionId)
          const hasDistinctCollectionMatch = Array.from(c.collectionAlbumNorms).some(
            (colNorm) => !c.trackAlbumNorms.has(colNorm)
          );
          return c.trackNorms.size >= 1 && hasDistinctCollectionMatch;
        });
        if (compilationWinners.length === 1) {
          const { artistId: compArtistId, collectionId: compCollectionId } = compilationWinners[0];
          try {
            const lookupUrl = `https://itunes.apple.com/lookup?id=${compCollectionId}&entity=album${countryParam}`;
            const lookupData = await fetchItunesJsonWithRetry(lookupUrl, 4000);
            const coll = (lookupData?.results || []).find(
              (r: any) =>
                r &&
                r.wrapperType === 'collection' &&
                Number(r.collectionId) === compCollectionId &&
                Number(r.artistId) === compArtistId
            );
            if (coll) {
              const collName = String(coll.collectionName || '').trim();
              const collGenre = String(coll.primaryGenreName || '');
              const collTrackCount = Number(coll.trackCount) || 0;
              const collArtwork100 = typeof coll.artworkUrl100 === 'string' ? coll.artworkUrl100.trim() : '';
              const collYearNum = coll.releaseDate ? new Date(coll.releaseDate).getFullYear() : undefined;
              const validCollYear = collYearNum && !isNaN(collYearNum) ? collYearNum : undefined;
              const passesEraFloor =
                parsedFoundedYear === undefined ||
                validCollYear === undefined ||
                validCollYear >= parsedFoundedYear - 1;

              if (
                collName &&
                COMPILATION_COLLECTION_RE.test(collName) &&
                collTrackCount >= 8 &&
                (evaluateGenreMatch(collGenre, genre, summary) ||
                  isCatalogCorroboratedNonHostileGenre(collGenre, genre || undefined)) &&
                passesEraFloor &&
                collArtwork100.length > 0
              ) {
                const pinnedImageUrl = collArtwork100.replace('100x100bb', '600x600bb');
                const pinnedAlbumName = cleanCollectionTitle(collName) || collName;
                const pinnedDiscography: DiscographyItem[] = [
                  {
                    albumName: pinnedAlbumName,
                    releaseYear: validCollYear ? String(validCollYear) : '',
                    itunesCollectionId: compCollectionId,
                  },
                ];
                const verifiedArtistName = resolveVerifiedItunesArtistDisplayName(
                  [coll.artistName, matchedTrackArtistNameById.get(compArtistId)],
                  cleanArtistName
                );
                console.log(`[scrapeImageUrlBackend] [Tier 3B Compilation Rescue Hit | ${storefrontLabel}] "${cleanArtistName}" pinned to verified compilation "${pinnedAlbumName}" (artistId #${compArtistId}, collectionId #${compCollectionId}).`);
                return {
                  imageUrl: pinnedImageUrl,
                  reconciledDiscography: pinnedDiscography,
                  itunesArtistId: compArtistId,
                  verifiedArtistName,
                };
              }
            }
          } catch (err: any) {
            console.warn(`[scrapeImageUrlBackend] [Tier 3B Compilation Lookup Error | ${storefrontLabel}] Failed verifying collectionId #${compCollectionId}:`, err?.message || err);
          }
        } else if (compilationWinners.length > 1) {
          console.warn(`[scrapeImageUrlBackend] [Tier 3B Compilation Ambiguity | ${storefrontLabel}] "${cleanArtistName}" matched ${compilationWinners.length} compilation pairs. Aborting fail-closed.`);
        }
      }

      const compSummary = Array.from(compilationCandidates.entries())
        .map(([k, v]) => `${k}(albums=${v.albumNorms.size},tracks=${v.trackNorms.size},col=${v.collectionAlbumNorms.size})`)
        .join(', ');
      console.warn(
        `[scrapeImageUrlBackend] [Tier 3B Miss | ${storefrontLabel}] "${cleanArtistName}" (genre='${genre}', founded='${foundedYear || ''}') ` +
        `raw=[${(discography || []).map((d) => `"${d.albumName}"(${d.releaseYear || ''})`).join(', ')}] ` +
        `queries=[${tier3bDiagnostics.join('; ') || 'none'}] comp=[${compSummary || 'none'}]`
      );
    }

    if (storefront) {
      console.log(`[scrapeImageUrlBackend] Regional storefront '${storefront}' yielded 0 verified winners for "${cleanArtistName}". Falling back to default US storefront...`);
    }
  }

  // --- Tier 4: Reject Unverified Lone Wolves / Fail-Fast (Rule 38 Text-Only Discography Preservation) ---
  const preservedTextDiscography = sanitizeTextOnlyDiscography(discography);
  console.warn(`[scrapeImageUrlBackend] [Tier 4 Reject] "${cleanArtistName}" failed all verification tiers. Rejecting unverified image asset and preserving ${preservedTextDiscography.length} text-only discography item(s).`);
  return { imageUrl: null, reconciledDiscography: preservedTextDiscography, itunesArtistId: null };
};

export const generateSemanticLinkWeights = async (
  apiKey: string,
  detailsCacheEntries: any[],
  links: Array<{ source: string; target: string; forwardContext?: string }>,
  usageCollector: UsageCollector,
  seedIds: string[] = []
): Promise<any[]> => {
  if (!Array.isArray(links) || links.length === 0) return [];
  const currentModel = GEMINI_FLASH_MODEL;
  const ai = new GoogleGenAI({ apiKey, httpOptions: { timeout: 300000 } });

  const seedIdSet = new Set(seedIds.map(s => String(s).toLowerCase().trim()));
  const endpointSet = new Set<string>();
  links.forEach(l => {
    if (l?.source) endpointSet.add(String(l.source).toLowerCase());
    if (l?.target) endpointSet.add(String(l.target).toLowerCase());
  });

  // Map artist cache entries participating in artist-to-artist links to lightweight context
  const evaluationContext = detailsCacheEntries
    .filter(entry => entry && entry[0] && endpointSet.has(String(entry[0]).toLowerCase()))
    .map(entry => {
      const id = entry[0];
      const details = entry[1];
      return {
        id,
        isSceneRoot: seedIdSet.has(String(id).toLowerCase()),
        genre: details?.details?.genre || "Unknown",
        founded: details?.details?.founded || "Unknown",
        bio: details?.summary || details?.bio || ""
      };
    });

  const prompt = `You are calibrating the radial force-directed layout weights for a music scene constellation anchored by Root Artist ID(s): ${JSON.stringify(seedIds)}.

Evaluate each artist-to-artist link using the provided biographies and relationship predicates (forwardContext), and assign a semantic weight between 0.15 and 1.00 strictly following this 3-Tier Forced-Distribution Rubric:

- TIER 1 — INNER CIRCLE & DIRECT LINEAGE (0.85 to 1.00):
  Shared band members, direct spinoff/predecessor bands ("formed from the ashes of", "was formed by members of"), direct mentor/protégé discovery, or foundational co-architects of the exact same local micro-scene.
- TIER 2 — SCENE PEERS & CONTEMPORARIES (0.45 to 0.70):
  Active touring partners, shared labelmates, regional scene contemporaries, or direct stylistic peers from the same era.
- TIER 3 — OUTER ECHOES & LOOSE BRIDGES (0.15 to 0.35):
  Broader era or genre successors, secondary 2nd/3rd-hop stylistic branches, cross-scene stepping stones, or indirect commercial rivalries.

MANDATORY DISTRIBUTION RULE:
You MUST utilize the full 0.15 to 1.00 dynamic range across the provided links so the constellation forms distinct inner, middle, and outer radial rings. Do NOT bunch all weights in the 0.60–0.85 middle range. Reserve >= 0.85 strictly for Tier 1 Inner Circle ties, place standard contemporaries in 0.45–0.70, and score outer/secondary branches in 0.15–0.35.

Artist Context:
${JSON.stringify(evaluationContext)}

Artist-to-Artist Links to Evaluate:
${JSON.stringify(links)}
`;

  const responseSchema = {
    type: Type.ARRAY,
    description: "An array of evaluated artist-to-artist links with calibrated 3-tier semantic weights.",
    items: {
      type: Type.OBJECT,
      properties: {
        source: {
          type: Type.STRING,
          description: "The exact source artist ID provided in the input."
        },
        target: {
          type: Type.STRING,
          description: "The exact target artist ID provided in the input."
        },
        weight: {
          type: Type.NUMBER,
          description: "A float between 0.15 (Tier 3 outer echo) and 1.00 (Tier 1 inner-circle lineage)."
        }
      },
      required: ["source", "target", "weight"]
    }
  };

  try {
    const response = await ai.models.generateContent({
      model: currentModel,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: responseSchema,
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      }
    });

    if (response.usageMetadata) {
      usageCollector.push(currentModel, {
        promptTokenCount: response.usageMetadata.promptTokenCount || 0,
        candidatesTokenCount: response.usageMetadata.candidatesTokenCount || 0,
        totalTokenCount: response.usageMetadata.totalTokenCount || 0
      });
    }

    const text = response.text;
    if (!text) return [];
    const parsed = JSON.parse(text);
    return parsed;
  } catch (error) {
    console.error("[generateSemanticLinkWeights] Failed to generate link weights:", error);
    return [];
  }
};
