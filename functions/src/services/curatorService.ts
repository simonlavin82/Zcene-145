import { GoogleGenAI, Type } from "@google/genai";
import { GraphData, Node, Link, DiscoveryFilters } from "../types";

// --- UTILITIES PORTED FROM artistCacheService.ts ---

export const normalizeArtistId = (name: string): string =>
  name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 256);

export const titleCaseArtistId = (id: string): string => {
  if (!id) return '';
  const spacedId = id.replace(/[-_]+/g, ' ').trim();
  return spacedId
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
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

export const sanitizeImageUrl = (rawUrl?: string | null, sanitizeStrFn?: (s: string) => string): string | undefined => {
  if (!rawUrl || typeof rawUrl !== 'string') return undefined;
  if (rawUrl.includes('...')) return undefined;
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
    return undefined;
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
    if (!['https:', 'http:'].includes(parsed.protocol)) return undefined;
    if (!parsed.pathname || parsed.pathname === '/' || parsed.pathname.length <= 1) return undefined;

    const host = parsed.hostname.toLowerCase();
    const pathname = parsed.pathname;

    const isFromTrustedDomain = TRUSTED_IMAGE_DOMAINS.some(d => host === d || host.endsWith(`.${d}`));
    const looksLikeImageAsset = IMAGE_EXTENSIONS.test(pathname) || IMAGE_PATH_SEGMENTS.test(pathname);

    if (isFromTrustedDomain || looksLikeImageAsset) {
      return cleaned;
    }
    return undefined; // Neither Tier A nor Tier B — likely web noise
  } catch (e) {
    return undefined;
  }
};

export const extractCountrySlug = (originStr?: string): string => {
  if (!originStr || typeof originStr !== 'string' || originStr.trim().length === 0) {
    return 'global';
  }

  const parts = originStr.split(',').map(s => s.trim()).filter(Boolean);
  const rawCountry = parts.length > 0 ? parts[parts.length - 1] : originStr;
  const slug = normalizeArtistId(rawCountry);

  return slug || 'global';
};

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
  
  if (parts.length === 1) return artistId;
  
  return parts.join('-').replace(/\s+/g, '-').toLowerCase();
};


export const normalizeGraphData = (graph: GraphData): GraphData => {
  if (!graph || !graph.nodes) return graph;

  const idMap = new Map<string, string>();

  const normalizedNodes = graph.nodes.map(node => {
    const originalId = node.id;
    let normalizedId = originalId.trim();
    
    if (node.type === 'artist' || node.type === 'label') {
      normalizedId = normalizeArtistId(originalId);
    } else {
      normalizedId = normalizedId.toLowerCase();
    }
    
    idMap.set(originalId, normalizedId);
    idMap.set(originalId.toLowerCase(), normalizedId);
    idMap.set(normalizeArtistId(originalId), normalizedId);

    let label = node.label || originalId.trim();
    if (node.type === 'artist' || node.type === 'label') {
      label = titleCaseArtistId(label);
    }

    return {
      ...node,
      id: normalizedId,
      label
    };
  });

  const normalizedLinks = (graph.links || []).map(link => {
    const sourceId = typeof link.source === 'string' ? link.source : (link.source as Node).id;
    const targetId = typeof link.target === 'string' ? link.target : (link.target as Node).id;

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

  const isArtistIdMatch = (a: string, b: string) => {
    const na = normalizeArtistId(a);
    const nb = normalizeArtistId(b);
    return na === nb || na.startsWith(nb + '-') || nb.startsWith(na + '-');
  };

  const artistNode = fullGraph.nodes.find(
    n => (n.type === 'artist' || n.type === 'label') && (normalizeArtistId(n.id) === artistNameNorm || isArtistIdMatch(n.id, artistName))
  );

  if (!artistNode) {
    return { nodes: [], links: [] };
  }

  const originalArtistNodeId = artistNode.id;
  const artistNodeIdNorm = normalizeArtistId(originalArtistNodeId);

  const resolveId = (endpoint: string | Node): string =>
    typeof endpoint === 'string' ? endpoint : endpoint.id;

  const peerArtistIds = new Set<string>();
  (fullGraph.links || []).forEach(link => {
    const s = resolveId(link.source);
    const t = resolveId(link.target);
    const sNorm = normalizeArtistId(s);
    const tNorm = normalizeArtistId(t);

    if (sNorm === artistNodeIdNorm || tNorm === artistNodeIdNorm) {
      const otherId = sNorm === artistNodeIdNorm ? t : s;
      const otherNorm = normalizeArtistId(otherId);
      
      const otherNode = fullGraph.nodes.find(n => normalizeArtistId(n.id) === otherNorm);
      if (otherNode && (otherNode.type === 'artist' || otherNode.type === 'label') && !seedsNorm.has(otherNorm)) {
        peerArtistIds.add(otherNode.id);
      }
    }
  });

  const keptArtistIds = new Set<string>([originalArtistNodeId]);
  peerArtistIds.forEach(id => keptArtistIds.add(id));
  const keptArtistIdsNorm = new Set<string>(
    Array.from(keptArtistIds).map(id => normalizeArtistId(id))
  );

  const metadataNodeIds = new Set<string>();
  (fullGraph.links || []).forEach(link => {
    const s = resolveId(link.source);
    const t = resolveId(link.target);
    const sNorm = normalizeArtistId(s);
    const tNorm = normalizeArtistId(t);

    const sIsKeptArtist = keptArtistIdsNorm.has(sNorm);
    const tIsKeptArtist = keptArtistIdsNorm.has(tNorm);

    if (sIsKeptArtist || tIsKeptArtist) {
      const otherId = sIsKeptArtist ? t : s;
      const otherLower = otherId.trim().toLowerCase();
      const otherNode = fullGraph.nodes.find(n => n.id.trim().toLowerCase() === otherLower);
      if (otherNode && (otherNode.type !== 'artist' && otherNode.type !== 'label')) {
        metadataNodeIds.add(otherNode.id);
      }
    }
  });

  const keptNodeIds = new Set<string>();
  keptNodeIds.add(originalArtistNodeId);
  peerArtistIds.forEach(id => keptNodeIds.add(id));
  metadataNodeIds.forEach(id => keptNodeIds.add(id));

  const keptNodeIdsLower = new Set<string>(
    Array.from(keptNodeIds).map(id => id.trim().toLowerCase())
  );
  const keptNodeIdsNorm = new Set<string>(
    Array.from(keptNodeIds).map(id => normalizeArtistId(id))
  );

  const ownNodes = fullGraph.nodes.filter(n => {
    const norm = normalizeArtistId(n.id);
    const lower = n.id.trim().toLowerCase();
    return keptNodeIdsNorm.has(norm) || keptNodeIdsLower.has(lower);
  });
  const ownLinks = (fullGraph.links || []).filter(link => {
    const s = resolveId(link.source);
    const t = resolveId(link.target);
    const sNorm = normalizeArtistId(s);
    const tNorm = normalizeArtistId(t);
    const sLower = s.trim().toLowerCase();
    const tLower = t.trim().toLowerCase();
    return (keptNodeIdsNorm.has(sNorm) || keptNodeIdsLower.has(sLower)) && 
           (keptNodeIdsNorm.has(tNorm) || keptNodeIdsLower.has(tLower));
  });

  const ownNodesMapped = ownNodes.map(n => {
    if (n.id === originalArtistNodeId) {
      return { ...n, id: artistName };
    }
    return n;
  });

  const ownLinksMapped = ownLinks.map(link => {
    const s = resolveId(link.source);
    const t = resolveId(link.target);
    const newSource = s === originalArtistNodeId ? artistName : s;
    const newTarget = t === originalArtistNodeId ? artistName : t;
    return { ...link, source: newSource, target: newTarget };
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

  const startIdx = text.search(/[{[]/);
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
  
  const startIdx = json.search(/[{[]/);
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
            description: "A group identifier for colouring or categorisation, usually based on the initial seed artists."
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
          context: {
            type: Type.STRING,
            description: "A brief, 3-7 word explanation of the relationship in present tense, e.g., 'releases music on Flatspot Records' or 'formed in San Jose, California' or 'influenced musical style'."
          }
        },
        required: ["source", "target", "value", "context"]
      }
    },
    synthesis_rationale: {
      type: Type.STRING,
      description: "A scannable reasoning chain (approx. 100-150 words) using Markdown: short paragraphs, bolding for key terms, and bullet points for lists. Do NOT use double newlines between bullet points. Detail how the seeds' acoustic, geographic, and chronological dimensions intersect to yield the generated connections."
    }
  },
  required: ["nodes", "links"]
};

export const GENERATE_GRAPH_WITH_CONTEXT_PROMPT_TEMPLATE = `I have an existing music graph. The user wants to enhance it by adding connections for these seed artists: {{artists}}.

        The graph ALREADY CONTAINS the following nodes: [{{existingNodeIds}}].
        
        Your task is to generate ONLY the NEW nodes and links needed to integrate the seed artists ({{artists}}) into the existing graph. Follow these rules:
        1.  CANONICAL NAMING: For ALL nodes (especially the seed artists provided in "{{artists}}"), you MUST use the canonical, professional spelling and capitalization as recognized by the music industry. For example, use "Radiohead" even if the user typed "radiohead", and use "blink-182" with a lowercase 'b' and hyphen if that is the correct format.
        2.  DO NOT duplicate any of the existing nodes listed above. When creating links, you MUST reference the existing node IDs if a connection is needed.
        3.  For EACH seed artist in "{{artists}}", if they do not already exist as a node, you MUST add them as an 'artist' node to the 'nodes' array. This is a mandatory requirement. After adding the artist node, attempt to find its primary genre, record label, country of origin, and the year they were formed/founded (YYYY). If you find these details, create nodes for them (if they don't already exist) and link them back to the seed artist. The 'id' for the year node must be the 4-digit year (e.g., "1998") and its type must be 'founded'. If you cannot find some or all of these details, that is acceptable, but the seed artist node itself MUST still be included in the graph.
        4.  In addition, identify and add 8-12 NEW related artists that are musically connected to the seed artists. For these NEW artists, you MUST also identify and create their respective genre, label, country, and especially their 'founded' year nodes (YYYY) to ensure the spiderweb is rich with chronological data. Assign them to the same 'group' as the seed artist they relate to, or a new group if they relate to multiple.
        5.  It is absolutely critical that each 'founded' node is linked ONLY to the correct artist node who was founded in that year.
        6.  LINK RELATIONSHIP CONTEXT: Each link in the 'links' array MUST include a 'context' string explaining the connection concisely (e.g. 'founded in 1994' or 'is a sub-genre of' or 'signed to XL Recordings' or 'is related to'). Keep the context to a brief 3-7 words in present tense.
        7.  SYNTHESIS RATIONALE (MANDATORY): You MUST output the step-by-step reasoning chain of your analysis in the 'synthesis_rationale' field of the JSON object. The text MUST be scannable and formatted using Markdown: use short paragraphs, bolding for key terms, and bullet points for lists. Do NOT use double newlines between bullet points. Explain in detail how the seeds' acoustic, geographic, and chronological dimensions intersect to yield the generated connections.
        8.  JSON SCHEMA: The output must be a single, valid JSON object with 'nodes', 'links' arrays and a 'synthesis_rationale' string matching the schema.
        
        STRUCTURAL ONLY: You MUST NOT generate or include any biographies, summaries, member lists, discographies, or detailed profile metadata for the artists. The response must strictly contain only structural layout nodes (id, type, group), connection links (source, target, value, context), and the synthesis_rationale string.
        
        ABSOLUTELY CRITICAL FINAL CHECK: Before you output the JSON, verify that for EVERY SINGLE OBJECT in the 'links' array, the value of its 'source' property and the value of its 'target' property perfectly match an 'id' from an object in EITHER the provided existing nodes list OR your new 'nodes' array. THERE MUST BE NO ORPHANED LINKS. If you create a link with a 'source' or 'target' ID (e.g., "Arista Records"), you MUST ALSO define a node with that exact same 'id' (e.g., { "id": "Arista Records", "type": "label", ... }). Do not invent connections to nodes you haven't defined. This is a strict, mandatory requirement.
        
        IMPORTANT: Ensure that any double quotes within string values are properly escaped (e.g., "Artist \\"Name\\""). The final output must be perfectly valid JSON. Do not emit literal '\\n' strings; use standard JSON string encoding for line breaks. Your entire response MUST be ONLY the raw JSON object, without any surrounding text, explanations, or markdown code fences.`;

export const GENERATE_MULTI_SEED_GRAPH_PROMPT_TEMPLATE = `Given the following list of seed artists: {{artists}}.
We already have cached, independent music graphs for these seed artists.
Your task is to perform a true co-equal "melting pot" traversal where all input seeds act as simultaneous structural foundations, avoiding any attention bias toward a single anchor artist.

The existing, cached nodes and connections are provided below as context:
{{cachedSubgraphsContext}}

Follow these rules precisely:
1.  CO-EQUAL TRAVERSAL & CROSS-ANALYSIS: Before selecting recommendation branches, perform a concurrent, multi-dimensional cross-analysis of ALL seed artists across:
    - Acoustic/Sonics: Shared styles, instruments, tempos, tones, production styles.
    - Geographic: Scene locations, tours, regional interactions.
    - Chronological: Overlapping time periods, eras, shared sub-culture epochs.
    Synthesize connections treating every seed as a co-equal anchor. If any seed artist has active filters, do not label them as "[Indirect recommendation]" or isolate them. They must serve as base anchors.
2.  CONNECTIVE STITCHING: Discover or generate the overlap bridges between the independent seed artist graphs. These bridges can be:
    - Direct musical links/connections between the seed artists or their related bands.
    - Shared metadata nodes (e.g. sharing a record label like "Victory Records", a genre like "Alternative Rock", or country of origin/founded year).
    - UP TO 6 NEW "bridging" artists/bands that musically bridge the gap or are related to multiple seeds, helping connect the separate subgraphs.
3.  REUSE EXISTING IDENTITIES: For all existing nodes from the cached subgraphs (e.g. genres, labels, countries, founded years, and artists), you MUST reuse their exact 'id' and 'type' without modifying them. Do not duplicate or rename existing metadata or artist nodes.
4.  NO DISJOINT GRAPHS: Ensure that there is a path connecting the subgraphs so that the resulting graph is fully unified rather than multiple disconnected clusters.
5.  NEW BRIDGING BANDS: If you add new bridging bands, you must also identify and create their respective genre, label, country, and founded year nodes (YYYY) and link them to build a rich graph.
6.  LINK RELATIONSHIP CONTEXT: Each link in the 'links' array MUST also include a 'context' string explaining the connection (e.g. 'releases music on Epitaph Records' or 'formed in 1988'). Keep the context to a brief 3-7 words in present tense.
7.  SYNTHESIS RATIONALE (MANDATORY): You MUST output the step-by-step reasoning chain of your co-equal cross-analysis in the 'synthesis_rationale' field of the JSON object. The text MUST be scannable and formatted using Markdown: use short paragraphs, bolding for key terms, and bullet points for lists. Do NOT use double newlines between bullet points. Explain in detail how the seeds' acoustic, geographic, and chronological dimensions intersect to yield the generated connections.
8.  JSON SCHEMA: The output must be a single, valid JSON object with 'nodes', 'links' arrays and a 'synthesis_rationale' string matching the schema.

STRUCTURAL ONLY: You MUST NOT generate or include any biographies, summaries, member lists, discographies, or detailed profile metadata for the artists. The response must strictly contain only structural layout nodes (id, type, group), connection links (source, target, value, context), and the synthesis_rationale string.

ABSOLUTELY CRITICAL: Ensure NO ORPHANED LINKS. Every source/target in the 'links' array must map to a node in the 'nodes' array.

Your entire response MUST be ONLY the raw JSON object, without any surrounding text or markdown code fences. Do not emit literal '\\n' strings; use standard JSON string encoding for line breaks.`;

export const GENERATE_GRAPH_PROMPT_TEMPLATE = `Given the following list of seed artists: {{artists}}. Generate a music family tree connecting them. The output must be a single, valid JSON object with keys: 'nodes', 'links', and 'synthesis_rationale'.
'nodes' should be an array of objects, each with 'id', 'type', and 'group'. The 'type' can be 'artist', 'genre', 'label', 'country', or 'founded'.
'links' should be an array of objects, each with 'source', 'target', 'value', and 'context' string describing the nature of their relationship.

Follow these rules precisely:
1.  CANONICAL NAMING: For ALL nodes, use the canonical, professional spelling and capitalization as recognized by the music industry. For example, use "Radiohead" even if the seed provided was "radiohead", and "blink-182" with a lowercase 'b' and hyphen if that is its official name.
2.  MANDATORY: You MUST create an 'artist' node for EVERY seed artist provided in the list: {{artists}}. Assign a unique 'group' number for each seed artist.
3.  For each seed artist, find and add nodes for their primary genre, record label, country of origin, and the year they were formed/founded (YYYY). The 'id' for the year node must be the 4-digit year (e.g. "1994") and its type must be 'founded'.
4.  In addition, find and add 18-21 NEW related artists that are musically connected to the seed artists, but you have the flexibility to scale down if the specific musical scene is smaller and fewer genuine connections exist. Do not pad the graph with irrelevant artists just to hit the number. For these NEW artists, you MUST also identify and create their respective genre, label, country, and especially their 'founded' year nodes (YYYY) to ensure the spiderweb is rich with chronological data. ONLY include artists that strictly meet any provided discovery filters.
5.  For all artists (seed and related), create links connecting them to their respective genre, label, country, and founded year nodes. Also create links between related artists. All direct connections of a seed artist should share their 'group' number. Each link MUST include a 'context' string explaining the relationship (e.g., 'releases music on XL Recordings' or 'founded in 1985' or 'is a genre of'). Keep the context to a brief 3-7 words in present tense.
6.  CRITICAL: Each 'founded' node MUST be linked ONLY to the correct artist who was founded in that year.
7.  SYNTHESIS RATIONALE (MANDATORY): You MUST output the step-by-step reasoning chain of your analysis in the 'synthesis_rationale' field of the JSON object. The text MUST be scannable and formatted using Markdown: use short paragraphs, bolding for key terms, and bullet points for lists. Do NOT use double newlines between bullet points. Explain in detail how the seeds' acoustic, geographic, and chronological dimensions intersect to yield the generated connections.
8.  JSON SCHEMA: The output must be a single, valid JSON object with 'nodes', 'links' arrays and a 'synthesis_rationale' string matching the schema.

STRUCTURAL ONLY: You MUST NOT generate or include any biographies, summaries, member lists, discographies, or detailed profile metadata for the artists. The response must strictly contain only structural layout nodes (id, type, group), connection links (source, target, value, context), and the synthesis_rationale string.
        
ABSOLUTELY CRITICAL FINAL CHECK: Before you output the JSON, verify that for EVERY SINGLE OBJECT in the 'links' array, the value of its 'source' property and the value of its 'target' property perfectly match an 'id' from an object in the 'nodes' array. THERE MUST BE NO ORPHANED LINKS. If you create a link with a 'source' or 'target' ID (e.g., "Arista Records"), you MUST ALSO define a node with that exact same 'id' (e.g., { "id": "Arista Records", "type": "label", ... }). Do not invent connections to nodes you haven't defined. This is a architecture requirement.

IMPORTANT: Ensure that any double quotes within string values are properly escaped (e.g., "Artist \\"Name\\""). The final output must be perfectly valid JSON. Do not emit literal '\\n' strings; use standard JSON string encoding for line breaks. Your entire response MUST be ONLY the raw JSON object, without any surrounding text, explanations, or markdown code fences.`;

// --- CORE CURATOR LOGIC ---

export const generateGraphDataBackend = async (
  artists: string,
  filters?: DiscoveryFilters,
  cachedSubgraphsContext?: string,
  baseGraph?: GraphData,
  disambiguationHints?: Record<string, string>
): Promise<GraphData> => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not defined in environment secrets.");
  }

  const ai = new GoogleGenAI({ apiKey });
  const currentModel = "gemini-2.5-flash";
  const artistList = artists.split('::').map(a => a.trim()).filter(Boolean);

  let userPrompt: string;
  let systemInstruction: string;

  const isEnhancement = baseGraph && baseGraph.nodes && baseGraph.nodes.length > 0;
  const isMultiSeed = artistList.length > 1 && cachedSubgraphsContext && cachedSubgraphsContext.length > 0;
  
  // Reinforce schema with dynamic descriptions if filters exist
  const dynamicSchema = JSON.parse(JSON.stringify(GRAPH_RESPONSE_SCHEMA));
  if (filters?.foundedAfter) {
      dynamicSchema.properties.nodes.description += ` MANDATORY: All NEW artists MUST have been founded AFTER ${filters.foundedAfter}.`;
  }
  if (filters?.foundedBefore) {
      dynamicSchema.properties.nodes.description += ` MANDATORY: All NEW artists MUST have been founded BEFORE ${filters.foundedBefore}.`;
  }

  if (isMultiSeed) {
      systemInstruction = GENERATE_MULTI_SEED_GRAPH_PROMPT_TEMPLATE
          .replace('{{cachedSubgraphsContext}}', cachedSubgraphsContext!);
      userPrompt = `Stitch together the music graphs for these seed artists: ${artists}. Use the provided cached graphs as context.`;
  } else if (isEnhancement) {
      const existingNodeIds = baseGraph!.nodes.map(n => `"${n.id}" (${n.type})`).join(', ');
      systemInstruction = GENERATE_GRAPH_WITH_CONTEXT_PROMPT_TEMPLATE
          .replace('{{existingNodeIds}}', existingNodeIds);
      userPrompt = `Enhance the graph for these seed artists: ${artists}.`;
  } else {
      systemInstruction = GENERATE_GRAPH_PROMPT_TEMPLATE;
      userPrompt = `Generate a music graph for these seed artists: ${artists}.`;
  }

  // Inject Discovery Filters into System Instruction
  if (filters) {
      let filterRules = "\n\nSTRICT DISCOVERY CONSTRAINTS (ZERO-TOLERANCE):";
      filterRules += "\nYou are a strict filtering agent. Your primary mission is to obey these filters. Musical relevance is secondary.";
      
      if (filters.foundedAfter) {
          filterRules += `\n- MANDATORY: Every NEW artist you add MUST have been founded AFTER the year ${filters.foundedAfter}.`;
          filterRules += `\n- FORBIDDEN: Do not include any artists founded in ${filters.foundedAfter} or earlier.`;
          filterRules += `\n- NO FALLBACK: If you cannot find an artist founded after ${filters.foundedAfter}, DO NOT include a substitute.`;
      }
      if (filters.foundedBefore) {
          filterRules += `\n- MANDATORY: Every NEW artist you add MUST have been founded BEFORE the year ${filters.foundedBefore}.`;
          filterRules += `\n- FORBIDDEN: Do not include any artists founded in ${filters.foundedBefore} or later.`;
      }
      if (filters.includeGenres && filters.includeGenres.length > 0) {
          filterRules += `\n- GENRE MANDATE: Only include new artists that play/belong to these genres: ${filters.includeGenres.join(', ')}.`;
      }
      if (filters.includeOrigins && filters.includeOrigins.length > 0) {
          filterRules += `\n- ORIGIN MANDATE: Only include new artists from: ${filters.includeOrigins.join(', ')}.`;
      }
      if (filters.excludeOrigins && filters.excludeOrigins.length > 0) {
          filterRules += `\n- FORBIDDEN ORIGINS: Strictly exclude all artists from: ${filters.excludeOrigins.join(', ')}.`;
      }
      if (filters.additionalInstructions) {
          filterRules += `\n- USER DIRECTION: ${filters.additionalInstructions}`;
      }

      filterRules += "\n\nIMPORTANT: Do NOT include any search citations or footnotes. The JSON must be clean.";
      filterRules += `\n\n(Note: The seed artists [${artists}] are the ONLY exception. ALL other artists MUST obey these rules.)`;
      filterRules += "\n\nFINAL VERIFICATION: Audit your list. If an artist violates any rules above, delete them.";
      
      systemInstruction += filterRules;
      
      let reminder = `\n\nREMINDER: All new artists MUST meet the active filters:`;
      if (filters.foundedAfter) reminder += ` founded after ${filters.foundedAfter};`;
      if (filters.foundedBefore) reminder += ` founded before ${filters.foundedBefore};`;
      userPrompt += reminder;
  }

  // [Disambiguation Gate] Inject user-confirmed identity constraint when present.
  if (disambiguationHints && Object.keys(disambiguationHints).length > 0) {
    const hintBlock = Object.values(disambiguationHints).join('\n');
    systemInstruction += `\n\nDISAMBIGUATION CONSTRAINTS (MANDATORY — DO NOT OVERRIDE):\n${hintBlock}`;
  }

  const response = await ai.models.generateContent({
    model: currentModel,
    contents: userPrompt,
    config: {
      systemInstruction: systemInstruction.replace(/{{artists}}/g, artists),
      temperature: 0.2,
      topP: 0.95,
      topK: 40,
      maxOutputTokens: 12000,
      responseMimeType: "application/json",
      responseSchema: dynamicSchema
    }
  });

  const jsonText = response.text?.trim();
  if (!jsonText) {
    throw new Error("The AI returned an empty response.");
  }

  const cleanedJsonText = extractCleanJsonString(jsonText);

  let data: GraphData;
  try {
    data = JSON.parse(cleanedJsonText) as GraphData;
  } catch (parseError) {
    const repaired = repairJson(cleanedJsonText);
    data = JSON.parse(repaired) as GraphData;
  }

  // --- POST-PROCESSING FILTERING ---
  const seedArtistIds = new Set(artists.split('::').map(a => a.trim().toLowerCase()));
  const nodesToRemove = new Set<string>();

  const rawNodes = Array.isArray(data?.nodes) ? data.nodes : [];
  const rawLinks = Array.isArray(data?.links) ? data.links : [];

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
          if (node.type === 'artist' && !seedArtistIds.has(node.id.toLowerCase())) {
              const year = artistToYear.get(node.id.toLowerCase());
              if (year && year <= threshold) {
                  nodesToRemove.add(node.id);
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

  const finalGraph: GraphData = normalizeGraphData({
      nodes: Array.isArray(deduplicatedNodes) ? deduplicatedNodes : [],
      links: Array.isArray(validLinks) ? validLinks : []
  });

  if (data) {
      finalGraph.synthesisRationale = (data as any).synthesisRationale || (data as any).synthesis_rationale;
  }

  return finalGraph;
};

// --- NODE DETAILS SCHEMAS & PROMPTS ---

export const NODE_DETAILS_SCHEMA = {
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
      description: "List of members and their roles."
    },
    details: {
      type: Type.OBJECT,
      properties: {
        genre: { type: Type.STRING },
        origin: { type: Type.STRING },
        founded: { type: Type.STRING },
        notableArtists: {
          type: Type.ARRAY,
          items: { type: Type.STRING }
        }
      },
      required: ["genre", "origin", "founded", "notableArtists"]
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
  required: ["summary", "details", "discography", "recommendationReason", "youtubeSearchQuery"]
};

export const FETCH_NODE_DETAILS_PROMPT_TEMPLATE = `Please provide detailed information for the music entity: "{{nodeIdentifier}}" (type: {{nodeType}}).
    
    Context:
    - Seed artists: {{seedArtists}}.
    - Connected nodes: {{contextNodes}}.
    - Date: {{currentDate}}.
    {{#if originHint}}
    - Origin Hint: {{originHint}}.
    {{/if}}
    
    USE GOOGLE SEARCH to find:
    1. The most accurate bio and cultural significance. You MUST dynamically adapt your search strategy to target authoritative sources and knowledge bases specific to the artist's musical genre (e.g., Resident Advisor/Beatport for electronic, DownBeat/Blue Note archives for jazz, Gramophone/publisher databases for classical, or Bandcamp/Discogs/AllMusic for independent rock/punk). Avoid single-genre biases or rigid source hierarchies. Use scannability techniques:
       - Chunking: Break information into smaller, digestible units.
       - Text Segmentation: Use short paragraphs and meaningful phrases.
       - Formatting: Use bolding for key terms and bullet points where appropriate to create white space.
       - Semantic Splitting: Group related content together by meaning.
    2. Confirmed top 3 studio albums.
    3. A verified, active YouTube video for the artist. You MUST run a dedicated search query like "[Artist Name] official music video site:youtube.com" or "[Artist Name] live performance site:youtube.com" to find a real, active video URL. Extract the 11-character video ID (e.g. from watch?v=XXXXXXXXXXX) only from verified Search results. If you cannot find a verified active video ID, or if the search results do not show the full URL, you MUST return null. Never guess or hallucinate a video ID.
    
    CRITICAL OUTPUT REQUIREMENTS (STRICTLY ENFORCED):
    1. You MUST respond with a single, valid JSON object matching the schema below. Do NOT write any conversational text or prose outside the JSON.
    2. Do NOT include markdown code fences (do NOT wrap the response in \`\`\`json ... \`\`\`). Output raw JSON directly.
    3. Do NOT include any inline search citations, footnote markers (such as [1], [2], [3], etc.), or source references anywhere in the text or JSON fields. Ensure all string values are plain text or markdown bold/bullets only, with absolutely no citation brackets.
    
    Your task is to generate a JSON object matching this structure precisely:
    {
      "summary": "A scannable bio (approx. 100 words) using Markdown: short paragraphs, bolding for key terms, and bullet points for lists. Focus on style and significance.",
      "members": ["Name (Role)", ...],
      "details": {
        "genre": "The primary music genre(s) as a plain string (e.g. 'Hardcore Punk', 'Post-Hardcore', 'Metalcore'). NEVER return the literal string 'Unknown', 'N/A', or leave this empty — if grounding is inconclusive, infer the genre from the bio summary text and the connected scene context provided.",
        "origin": "City, Country format (e.g. 'Baltimore, USA'). NEVER return the literal string 'Unknown', 'N/A', or leave this empty — if grounding is inconclusive, infer the origin from the bio summary text or the band's known regional scene.",
        "founded": "YYYY",
        "notableArtists": ["Artist Name", ...]
      },
      "links": [
        {"site": "Wikipedia", "url": "https://en.wikipedia.org/wiki/..."}
      ],
      "discography": [{"albumName": "Name", "releaseYear": "YYYY"}],
      "recommendationReason": "Curator insight about their role in this scene.",
      "youtubeVideoId": "dQw4w9WgXcQ",
      "youtubeSearchQuery": "Turnstile hardcore punk official music video"
    }

    YOUTUBE VIDEO SELECTION RULES (CRITICAL):
    - Use Google Search to find the best official YouTube video for this artist.
    - Priority: (1) Most iconic/popular official music video from their official YouTube channel, (2) high-profile full professional live set on an official or reputable label channel.
    - ABSOLUTELY FORBIDDEN: lyric videos, fan-cam bootlegs, low-resolution uploads, non-musical interview clips, or YouTube Shorts (do not return vertical formats or '/shorts/' routes; prioritize landscape videos longer than 2 minutes).
    - The youtubeVideoId value must be ONLY the 11-character YouTube video ID (e.g. "dQw4w9WgXcQ"), NOT a full URL.
    - Set youtubeVideoId to null if no high-quality, officially-sourced video can be confirmed via search.
    - youtubeSearchQuery MUST always be populated as a non-null fallback. Format: "[Artist Name] [genre] [live OR official video]". This is MANDATORY.
    - QUERY MODIFICATION: Append semantic terms such as "full set", "live performance", or "official music video" to your search queries before resolving an asset hash.
    - NEGATIVE SHORTS CONSTRAINT: DO NOT parse or return video hashes derived from search queries matching vertical formats or the '/shorts/' route structure. Prioritize landscape video IDs with durations longer than 2 minutes.
    - ENTITY VALIDATION: Ensure the chosen video belongs strictly to verified artist channels, high-fidelity archive channels (e.g., Hate5six, KEXP, Audiotree), or standard label uploads (e.g., Relapse Records, Epitaph Records).
    - ZERO HALLUCINATION (MANDATORY): You must only return a youtubeVideoId if you can extract the exact 11-character ID from a YouTube watch URL (e.g., youtube.com/watch?v=...) present in your Google Search results. If you do not see the exact URL or video ID in the search results, set youtubeVideoId to null. NEVER guess or hallucinate a video ID under any circumstances.
    - AMBIGUITY RESOLUTION: For bands with common or ambiguous names (such as "Cave In"), make sure your search query includes qualifiers (e.g. "Cave In band" or "Cave In post-hardcore") to avoid generic results.

    WIKIPEDIA ORDERING RULE (MANDATORY):
    If a Wikipedia link is found, it MUST be the very first item (index 0) in the links array.`;

// --- DETAILS HYDRATION MODULES ---

export const fetchNodeDetailsBackend = async (
  node: Node,
  graphData: GraphData,
  seedArtists: string,
  originHint?: string | null
): Promise<any> => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not defined in environment secrets.");
  }
  
  const ai = new GoogleGenAI({ apiKey });
  const currentModel = "gemini-2.5-flash";

  const contextNodes = graphData.links
    .filter(l => (typeof l.source === 'string' ? l.source : (l.source as Node).id) === node.id || (typeof l.target === 'string' ? l.target : (l.target as Node).id) === node.id)
    .map(l => {
      const sourceId = typeof l.source === 'string' ? l.source : (l.source as Node).id;
      const targetId = typeof l.target === 'string' ? l.target : (l.target as Node).id;
      return sourceId === node.id ? targetId : sourceId;
    })
    .slice(0, 10)
    .join(', ');

  const currentDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  let prompt = FETCH_NODE_DETAILS_PROMPT_TEMPLATE
    .replace('{{nodeIdentifier}}', node.label || node.id)
    .replace('{{nodeType}}', node.type)
    .replace('{{seedArtists}}', seedArtists)
    .replace('{{contextNodes}}', contextNodes)
    .replace(/{{currentDate}}/g, currentDate);
      
  if (originHint) {
    prompt = prompt.replace(/{{#if originHint}}[\s\S]*?{{originHint}}[\s\S]*?{{\/if}}/g, 
        `- **Origin Hint (CRITICAL):** Details for: ${originHint}.`);
  } else {
    prompt = prompt.replace(/{{#if originHint}}[\s\S]*?{{\/if}}/g, '');
  }

  const response = await ai.models.generateContent({
    model: currentModel,
    contents: prompt,
    config: {
      tools: [{ googleSearch: {} }]
    }
  });

  const jsonText = response.text?.trim();
  if (!jsonText) {
    throw new Error("The AI returned an empty response for details.");
  }

  const cleanedJsonText = extractCleanJsonString(jsonText);

  const sanitizeBioText = (rawText?: string): string => {
    if (!rawText || typeof rawText !== 'string') return '';
    let text = rawText.trim();
    const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (match && match[1]) {
      text = match[1].trim();
    } else {
      text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    }
    if (text.startsWith('{') || text.startsWith('[')) {
      const summaryMatch = text.match(/["'](?:summary|bio|description|text)["']\s*:\s*["']([\s\S]*?)["']\s*(?:,\s*["']|\}|$)/i);
      if (summaryMatch && summaryMatch[1]) {
        text = summaryMatch[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\').trim();
      }
    }
    let prevText;
    do {
      prevText = text;
      text = text.replace(/^(?:I have confirmed|I will manually check|I will check|I need to check|I need to get|To answer your request|For the YouTube video|Here is the JSON|Here are the details|Here is the information|Note: Some details|Based on the search)[^.\n]*[.\n]+\s*/ig, '').trim();
    } while (text !== prevText && text.length > 0);
    text = text.replace(/\\n\*/g, '\n• ').replace(/\\n-/g, '\n• ').replace(/\\n\n/g, '\n\n');
    text = text.replace(/\[\d+\]/g, '').replace(/\(\d+\)/g, '').trim();
    return text;
  };

  let details: any;
  try {
    details = JSON.parse(cleanedJsonText);
  } catch (parseError) {
    const repaired = repairJson(cleanedJsonText);
    try {
      details = JSON.parse(repaired);
    } catch (repairError) {
      const rawProse = sanitizeBioText(cleanedJsonText);
      if (rawProse.startsWith('{') || rawProse.startsWith('[') || rawProse.includes('":') || rawProse.includes('": ')) {
        throw new Error("Invalid data format from details service (unparsed JSON wrapper).");
      }
      if (rawProse.length > 40) {
        details = {
          summary: rawProse,
          details: { genre: "", origin: "", founded: "", notableArtists: [] },
          links: [],
          discography: [],
          members: [],
          recommendationReason: ""
        };
      } else {
        throw new Error("Invalid data format from details service.");
      }
    }
  }

  const sanitizeString = (str: any): string => {
    if (typeof str !== 'string') return "";
    return str.replace(/\[\d+\]/g, '').replace(/\(\d+\)/g, '').trim();
  };

  const sanitisedLinks = (details.links || []).map((l: any) => ({
    ...l,
    url: (l.url && typeof l.url === 'string' && l.url.trim().startsWith('http'))
      ? l.url.trim()
      : null
  }));

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
      return {
        ...d,
        genre: sanitizeMetaField(d.genre),
        origin: sanitizeMetaField(d.origin),
        founded: sanitizeString(d.founded),
        notableArtists: (d.notableArtists || []).map(sanitizeString)
      };
    })(),
    links: sanitisedLinks,
    discography: (details.discography || []).map((album: any) => ({
      albumName: sanitizeString(album?.albumName),
      releaseYear: sanitizeString(album?.releaseYear)
    })),
    members: (details.members || []).map(sanitizeString),
    recommendationReason: sanitizeString(details.recommendationReason || ""),
    youtubeVideoId: extractValidYoutubeId(details.youtubeVideoId),
    imageUrl: sanitizeImageUrl(details.imageUrl, sanitizeString),
    youtubeSearchQuery: typeof details.youtubeSearchQuery === 'string' && details.youtubeSearchQuery.trim().length > 0
      ? sanitizeString(details.youtubeSearchQuery.trim())
      : undefined,
  };

  if (!hydratedDetails.details) hydratedDetails.details = {};

  const groundingChunks = (response as any).candidates?.[0]?.groundingMetadata?.groundingChunks;
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

  const ai = new GoogleGenAI({ apiKey });
  const currentModel = "gemini-2.5-flash";

  const prompt = `Perform a Google Search for: '${artistName} official music video youtube'. 
Look at the top organic YouTube video in search results. Extract its 11-character video ID (the string after v= or inside the URL). Return ONLY the 11-character video ID as a plain string. Do not include any JSON, quotes, explanations, markdown, or other text. If not found, return "null".`;

  try {
    const response = await ai.models.generateContent({
      model: currentModel,
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        maxOutputTokens: 200,
      }
    });

    const text = response.text?.trim();
    if (!text) return null;

    const id = extractValidYoutubeId(text);
    return id || null;
  } catch (err) {
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

export const scrapeImageUrlBackend = async (
  artistName: string,
  type: string,
  genre: string,
  summary: string
): Promise<string | null> => {
  // Strategy 1: High-Speed Deterministic iTunes API (Artists Only)
  if (type !== 'label') {
    try {
      // Step 1: Search for the exact artist ID to avoid generic name collisions
      const itunesUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(artistName)}&entity=musicArtist&limit=20`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(itunesUrl, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        const exactMatches = data.results?.filter((r: any) => (r.artistName || "").toLowerCase() === artistName.toLowerCase()) || [];
        
        let selectedArtistId = null;
        const zceneGenreLower = (genre || "").toLowerCase();
        const allowedGenres = ['rock', 'alternative', 'punk', 'metal', 'hardcore', 'indie', 'emo', 'pop punk', 'post-hardcore', 'hip-hop', 'rap', 'electronic'];

        if (exactMatches.length > 0) {
          const bestMatch = exactMatches.find((r: any) => {
            const itunesGenre = (r.primaryGenreName || "").toLowerCase();
            if (!itunesGenre) return false;
            
            // Match 1: Direct intersection with Zcene's determined genre
            if (zceneGenreLower.includes(itunesGenre) || itunesGenre.includes(zceneGenreLower)) return true;
            
            // Match 2: Intersection with our approved broad alternative whitelist
            return allowedGenres.some(allowed => itunesGenre.includes(allowed));
          });

          if (bestMatch) {
            selectedArtistId = bestMatch.artistId;
          } else {
            console.warn(`[scrapeImageUrlBackend] iTunes validation blocked for ${artistName}. No genre overlap found, skipping to Gemini fallback.`);
            selectedArtistId = null;
          }
        }

        if (selectedArtistId) {
          // Step 2: Fetch their albums for the high-res artwork using the exact artistId
          const albumUrl = `https://itunes.apple.com/lookup?id=${selectedArtistId}&entity=album&limit=1`;
          const albumController = new AbortController();
          const albumTimeout = setTimeout(() => albumController.abort(), 3000);
          const albumRes = await fetch(albumUrl, { signal: albumController.signal });
          clearTimeout(albumTimeout);
          
          if (albumRes.ok) {
             const albumData = await albumRes.json();
             const album = albumData.results?.find((r: any) => r.wrapperType === 'collection');
             if (album && album.artworkUrl100) {
                const hiResArtwork = album.artworkUrl100.replace('100x100bb', '600x600bb');
                console.log(`[scrapeImageUrlBackend] Deterministic iTunes success for ${artistName}`);
                return hiResArtwork;
             }
          }
        }
      }
    } catch (itunesErr: any) {
      console.warn(`[scrapeImageUrlBackend] iTunes fallback bypassed for ${artistName}:`, itunesErr.message);
    }
  }

  // Strategy 2: Gemini Google Search Fallback (for Labels or obscure deep cuts)
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const ai = new GoogleGenAI({ apiKey });
  const currentModel = "gemini-2.5-flash";

  const prompt = `Find a high-quality, direct HTTPS image URL representing the music ${type}: "${artistName}".
  
Context:
Genre: ${genre}
Bio: ${summary}

USE GOOGLE SEARCH to find a verified artist photo, album cover, or official logo. 

GENRE-CONTEXTUAL IMAGE SOURCING HIERARCHY (STRICTLY ENFORCED):
▸ FOR ALL GENRES:
  Priority 1 — Spotify CDN (i.scdn.co) or Last.fm CDN (lastfm.freetls.fastly.net) artist images.
  Priority 2 — Discogs (i.discogs.com) or AllMusic artist entries.
  Priority 3 — Wikimedia Commons.
  Priority 4 — Official press sites or established music publications (Pitchfork, Stereogum).

CRITICAL ANTI-HALLUCINATION RULE:
DO NOT guess or invent random 10-digit IDs for Bandcamp (f4.bcbits.com) or other CDNs. Only return a URL if you extracted the exact, complete HTTPS image path directly from your Google Search results. If you cannot find a verified direct image path, state that no verified image was found.

ACCEPTED IMAGE TYPES (all genre contexts): press photos, live performance photos, official band/artist portraits, album artwork, release covers, band logos, and official banners.

FORBIDDEN IMAGE SOURCES: Generic stock photo sites (Unsplash, Pexels, Shutterstock, Getty Images), news article thumbnails, social media preview cards, YouTube thumbnails, retail product listing images from general music stores.

CRITICAL OUTPUT REQUIREMENTS:
1. Provide the direct HTTPS image URL in your response.
2. If you cannot find ANY verified image from the priority sources above, state that no verified image was found.`;

  try {
    const response = await ai.models.generateContent({
      model: currentModel,
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        maxOutputTokens: 200,
      }
    });

    const text = response.text?.trim() || '';
    if (text.toLowerCase().includes('null') && !text.includes('http')) return null;
    
    // Extract the first HTTPS URL from the response
    const urlMatch = text.match(/https:\/\/[^\s"'<>()\[\]]+/i);
    if (urlMatch) {
      const extractedUrl = urlMatch[0];
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        const imgRes = await fetch(extractedUrl, { 
          method: 'HEAD', 
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
          },
          signal: controller.signal 
        });
        clearTimeout(timeoutId);
        
        if (imgRes.ok) {
          const contentType = imgRes.headers.get('content-type');
          if (contentType && contentType.startsWith('image/')) {
            return extractedUrl;
          } else {
            console.warn(`[scrapeImageUrlBackend] Extracted URL returned valid status but invalid content-type (${contentType}): ${extractedUrl}`);
            return null;
          }
        } else {
          console.warn(`[scrapeImageUrlBackend] Extracted URL returned ${imgRes.status}: ${extractedUrl}`);
          return null;
        }
      } catch (fetchErr: any) {
        console.warn(`[scrapeImageUrlBackend] URL validation failed for ${extractedUrl}:`, fetchErr.message);
        return null;
      }
    }
    return null;
  } catch (err) {
    console.error(`[scrapeImageUrlBackend] Scrape failed for ${artistName}:`, err);
    return null;
  }
};
