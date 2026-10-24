"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateSemanticLinkWeights = exports.scrapeImageUrlBackend = exports.checkVideoPlayability = exports.scrapeVideoIdBackend = exports.fetchNodeDetailsBackend = exports.FETCH_NODE_DETAILS_PROMPT_TEMPLATE = exports.NODE_DETAILS_SCHEMA = exports.generateGraphDataBackend = exports.reconcileNarrativeEdges = exports.generateRootsBreakdownBackend = exports.validateSeedOriginBackend = exports.SEED_VALIDATION_SCHEMA = exports.GENERATE_GRAPH_PROMPT_TEMPLATE = exports.GENERATE_MULTI_SEED_GRAPH_PROMPT_TEMPLATE = exports.GENERATE_GRAPH_WITH_CONTEXT_PROMPT_TEMPLATE = exports.GRAPH_RESPONSE_SCHEMA = exports.extractCleanJsonString = exports.extractArtistSubGraph = exports.normalizeGraphData = exports.buildCompositeCacheKey = exports.extractCountrySlug = exports.sanitizeImageUrl = exports.extractValidYoutubeId = exports.cleanLabelDisplayName = exports.cleanArtistDisplayName = exports.titleCaseArtistId = exports.normalizeLabelId = exports.normalizeArtistId = exports.applyCanonicalAlias = exports.CANONICAL_ALIASES = exports.GEMINI_FLASH_MODEL = void 0;
const genai_1 = require("@google/genai");
const executeCurationPipeline_1 = require("../executeCurationPipeline");
const cacheQualification_1 = require("./cacheQualification");
exports.GEMINI_FLASH_MODEL = process.env.GEMINI_FLASH_MODEL || "gemini-3.6-flash";
// --- UTILITIES PORTED FROM artistCacheService.ts ---
exports.CANONICAL_ALIASES = {
    'lungleg': 'Lung Leg',
};
const applyCanonicalAlias = (rawName) => {
    if (!rawName)
        return rawName;
    const lookupKey = rawName.toLowerCase().replace(/[^a-z0-9]/g, '');
    return exports.CANONICAL_ALIASES[lookupKey] || rawName;
};
exports.applyCanonicalAlias = applyCanonicalAlias;
const normalizeArtistId = (name) => name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 256);
exports.normalizeArtistId = normalizeArtistId;
const normalizeLabelId = (name) => {
    let id = (0, exports.normalizeArtistId)(name);
    id = id.replace(/(?:-(?:records|recordings|music|company|recording-company|entertainment|group|productions|inc|ltd))+$/, '');
    if (id === 'century')
        id = 'century-media';
    return id;
};
exports.normalizeLabelId = normalizeLabelId;
const titleCaseArtistId = (id) => {
    if (!id)
        return '';
    const spacedId = id.replace(/[-_]+/g, ' ').trim();
    return spacedId
        .split(' ')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
};
exports.titleCaseArtistId = titleCaseArtistId;
const cleanArtistDisplayName = (name) => {
    if (!name)
        return '';
    let cleaned = name.trim();
    cleaned = cleaned.replace(/^["']+|["']+$/g, '');
    // Canonical Stylization Mandate (Rule 36):
    // Preserve stylized lowercase display names (e.g. "ten56.") synthesized by AI models.
    // Only convert to title case if the name contains hyphens or underscores (indicating a slug).
    if (cleaned.includes('-') || cleaned.includes('_')) {
        cleaned = (0, exports.titleCaseArtistId)(cleaned);
    }
    return cleaned;
};
exports.cleanArtistDisplayName = cleanArtistDisplayName;
/**
 * Normalizes a label display name by stripping trailing structural suffixes
 * like "Records" / "Recordings" and guaranteeing title casing for database slugs.
 */
const cleanLabelDisplayName = (rawIdOrName) => {
    if (!rawIdOrName || typeof rawIdOrName !== 'string')
        return '';
    const trimmed = rawIdOrName.trim();
    if (!trimmed)
        return '';
    const base = (0, exports.cleanArtistDisplayName)((0, exports.applyCanonicalAlias)(trimmed));
    if (!base)
        return '';
    const stripped = base
        .replace(/(?:[-_\s]+(?:records|recordings))+$/i, '')
        .trim();
    const candidate = stripped || base;
    if (/^[a-z0-9\s-_]+$/.test(candidate) && !/[A-Z]/.test(candidate)) {
        return (0, exports.titleCaseArtistId)(candidate);
    }
    if (candidate.includes('-') || candidate.includes('_')) {
        return (0, exports.titleCaseArtistId)(candidate);
    }
    return candidate;
};
exports.cleanLabelDisplayName = cleanLabelDisplayName;
const extractValidYoutubeId = (rawUrlOrId) => {
    if (!rawUrlOrId || typeof rawUrlOrId !== 'string')
        return undefined;
    const cleaned = rawUrlOrId.replace(/['"`]/g, '').trim();
    if (!cleaned || cleaned.toLowerCase() === 'null' || cleaned.toLowerCase() === 'undefined')
        return undefined;
    const vMatch = cleaned.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
    const shortMatch = cleaned.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
    const embedMatch = cleaned.match(/embed\/([a-zA-Z0-9_-]{11})/);
    if (vMatch)
        return vMatch[1];
    if (shortMatch)
        return shortMatch[1];
    if (embedMatch)
        return embedMatch[1];
    if (/^[a-zA-Z0-9_-]{11}$/.test(cleaned))
        return cleaned;
    const anyMatch = cleaned.match(/(?:v=|youtu\.be\/|embed\/|^)([a-zA-Z0-9_-]{11})(?:[&/?]|$)|\b([a-zA-Z0-9_-]{11})\b/);
    const cand = anyMatch ? (anyMatch[1] || anyMatch[2]) : undefined;
    return cand && cand.length === 11 ? cand : undefined;
};
exports.extractValidYoutubeId = extractValidYoutubeId;
const sanitizeImageUrl = (rawUrl, sanitizeStrFn) => {
    if (!rawUrl || typeof rawUrl !== 'string')
        return "";
    if (rawUrl.includes('...'))
        return "";
    let cleaned = sanitizeStrFn ? sanitizeStrFn(rawUrl) : rawUrl;
    cleaned = cleaned.replace(/\[\d+\]/g, '').replace(/\(\d+\)/g, '').replace(/[.,;!"']+$/g, '').trim();
    if (!cleaned ||
        cleaned.includes('..') ||
        cleaned.toLowerCase().includes('example.com') ||
        cleaned.toLowerCase().includes('path/to/') ||
        cleaned.endsWith('/Special:FilePath/') ||
        cleaned === 'https://en.wikipedia.org/wiki/Special:FilePath/') {
        return "";
    }
    // Two-Tier Domain-Aware Image URL Validator — Genre-Contextual Edition.
    // Tier A: Expanded allowlist covering both Contemporary/Indie/Punk and Classical/Institutional domains.
    //         Always accepted if URL structure is valid. Covers CDN paths that lack image file extensions.
    // Tier B: Any domain, but path MUST contain a recognizable image extension or image-suggestive segment.
    // Reject: Any URL that passes neither tier is discarded as potential web noise.
    const TRUSTED_IMAGE_DOMAINS = [
        // ── CONTEMPORARY / INDIE / ELECTRONIC / PUNK / HIP-HOP ──
        'upload.wikimedia.org', // Wikimedia Commons
        'commons.wikimedia.org',
        'f4.bcbits.com', // Bandcamp CDN (all variants)
        'f1.bcbits.com',
        'f2.bcbits.com',
        'f3.bcbits.com',
        'i.discogs.com', // Discogs
        'img.discogs.com',
        'i.scdn.co', // Spotify
        'lastfm.freetls.fastly.net', // Last.fm
        'coverartarchive.org', // MusicBrainz Cover Art Archive
        'assets.bandcamp.com',
        'cdn.allmusic.com', // AllMusic
        // ── CLASSICAL / ORCHESTRAL / TRADITIONAL / JAZZ / OPERA ──
        'images.hyperion-records.co.uk', // Hyperion Records (major British classical label)
        'cdn.naxos.com', // Naxos (world's largest classical label)
        'www.naxos.com',
        'images.ecmrecords.com', // ECM Records (jazz / contemporary classical)
        'www.ecmrecords.com',
        'images.deutschegrammophon.com', // Deutsche Grammophon (DG)
        'www.harmoniamundi.com', // Harmonia Mundi (early music / baroque)
        'images.bis.se', // BIS Records (Nordic classical label)
        'cdn.prestomusic.com', // Presto Music CDN
        'images.chandos.net', // Chandos Records
        'cdn.britannica.com', // Britannica (composer & musician portraits — no ext.)
    ];
    const IMAGE_EXTENSIONS = /\.(jpg|jpeg|png|webp|gif|avif|bmp|tiff?)(\?|#|$)/i;
    const IMAGE_PATH_SEGMENTS = /\/(img|image|images|photo|photos|media|assets|thumbnail|thumb|artwork)\//i;
    try {
        const parsed = new URL(cleaned);
        if (!['https:', 'http:'].includes(parsed.protocol))
            return "";
        if (!parsed.pathname || parsed.pathname === '/' || parsed.pathname.length <= 1)
            return "";
        const host = parsed.hostname.toLowerCase();
        const pathname = parsed.pathname;
        const isFromTrustedDomain = TRUSTED_IMAGE_DOMAINS.some(d => host === d || host.endsWith(`.${d}`));
        const looksLikeImageAsset = IMAGE_EXTENSIONS.test(pathname) || IMAGE_PATH_SEGMENTS.test(pathname);
        if (isFromTrustedDomain || looksLikeImageAsset) {
            return cleaned;
        }
        return ""; // Neither Tier A nor Tier B — likely web noise; scraper will replace
    }
    catch (e) {
        return "";
    }
};
exports.sanitizeImageUrl = sanitizeImageUrl;
const COUNTRY_ISO_MAP = {
    'united states': 'us', 'usa': 'us', 'us': 'us',
    'united kingdom': 'gb', 'uk': 'gb', 'england': 'gb', 'great britain': 'gb', 'scotland': 'gb', 'wales': 'gb', 'northern ireland': 'gb',
    'australia': 'au', 'canada': 'ca', 'germany': 'de',
    'france': 'fr', 'japan': 'jp', 'sweden': 'se',
    'italy': 'it', 'spain': 'es', 'brazil': 'br',
    'mexico': 'mx', 'netherlands': 'nl', 'belgium': 'be',
    'norway': 'no', 'finland': 'fi', 'denmark': 'dk',
    'ireland': 'ie', 'new zealand': 'nz', 'poland': 'pl',
    'austria': 'at', 'switzerland': 'ch'
};
const extractCountrySlug = (originStr) => {
    if (!originStr || typeof originStr !== 'string' || originStr.trim().length === 0) {
        return 'global';
    }
    // Pre-split on '/' to handle multi-origin border towns (e.g. "La Calamine, Belgium / Kelmis, Germany" -> "La Calamine, Belgium")
    const primaryOrigin = originStr.split('/')[0].trim();
    const parts = primaryOrigin.split(',').map(s => s.trim()).filter(Boolean);
    const rawCountry = parts.length > 0 ? parts[parts.length - 1] : primaryOrigin;
    const lowerCountry = rawCountry.toLowerCase().trim();
    if (COUNTRY_ISO_MAP[lowerCountry]) {
        return COUNTRY_ISO_MAP[lowerCountry];
    }
    const slug = (0, exports.normalizeArtistId)(rawCountry);
    return slug || 'global';
};
exports.extractCountrySlug = extractCountrySlug;
const buildCompositeCacheKey = (artistId, filters) => {
    if (!filters)
        return artistId;
    const parts = [artistId];
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
        const sorted = [...filters.anchorLabels].map(s => (0, exports.normalizeLabelId)(s)).filter(Boolean).sort();
        if (sorted.length > 0) {
            parts.push(`inc_labels:${sorted.join(',')}`);
        }
    }
    if (parts.length === 1)
        return artistId;
    return parts.join('-').replace(/\s+/g, '-').toLowerCase();
};
exports.buildCompositeCacheKey = buildCompositeCacheKey;
const normalizeGraphData = (graph) => {
    if (!graph || !graph.nodes)
        return graph;
    const idMap = new Map();
    const normalizedNodes = graph.nodes.map(node => {
        const originalId = (0, exports.applyCanonicalAlias)(node.id);
        let normalizedId = originalId.trim();
        if (node.type === 'label') {
            normalizedId = (0, exports.normalizeLabelId)(node.label || originalId);
        }
        else if (node.type === 'artist') {
            normalizedId = (0, exports.normalizeArtistId)(originalId);
        }
        else {
            normalizedId = normalizedId.toLowerCase();
        }
        idMap.set(node.id, normalizedId);
        idMap.set(originalId, normalizedId);
        idMap.set(originalId.toLowerCase(), normalizedId);
        idMap.set((0, exports.normalizeArtistId)(originalId), normalizedId);
        let label = '';
        if (node.type === 'label') {
            label = (0, exports.cleanLabelDisplayName)(node.label || originalId);
        }
        else {
            label = node.label ? (0, exports.cleanArtistDisplayName)((0, exports.applyCanonicalAlias)(node.label)) : '';
            if (!label) {
                label = node.type === 'artist'
                    ? (0, exports.titleCaseArtistId)(originalId.trim())
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
        const rawSourceId = typeof link.source === 'string' ? link.source : link.source.id;
        const rawTargetId = typeof link.target === 'string' ? link.target : link.target.id;
        const sourceId = (0, exports.applyCanonicalAlias)(rawSourceId);
        const targetId = (0, exports.applyCanonicalAlias)(rawTargetId);
        const sourceLower = sourceId.trim().toLowerCase();
        const targetLower = targetId.trim().toLowerCase();
        const sourceNorm = (0, exports.normalizeArtistId)(sourceId);
        const targetNorm = (0, exports.normalizeArtistId)(targetId);
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
        synthesisRationale: graph.synthesisRationale || graph.synthesis_rationale
    };
};
exports.normalizeGraphData = normalizeGraphData;
const extractArtistSubGraph = (artistName, fullGraph, allSeeds = []) => {
    const artistNameNorm = (0, exports.normalizeArtistId)(artistName);
    const seedsNorm = new Set(allSeeds.map(s => (0, exports.normalizeArtistId)(s)));
    seedsNorm.delete(artistNameNorm);
    const artistNode = fullGraph.nodes.find(n => (n.type === 'artist' || n.type === 'label') && (0, exports.normalizeArtistId)(n.id) === artistNameNorm);
    if (!artistNode) {
        return { nodes: [], links: [] };
    }
    const originalArtistNodeId = artistNode.id;
    const artistNodeIdNorm = (0, exports.normalizeArtistId)(originalArtistNodeId);
    const resolveId = (endpoint) => typeof endpoint === 'string' ? endpoint : endpoint.id;
    const keptNodeIdsNorm = new Set();
    if (seedsNorm.size === 0) {
        // Single-seed generation: include everything (even disjointed clusters)
        fullGraph.nodes.forEach(n => keptNodeIdsNorm.add((0, exports.normalizeArtistId)(n.id)));
    }
    else {
        // Multi-seed generation: BFS to extract only the component reachable from this seed, stopping at other seeds.
        const adjList = new Map();
        (fullGraph.links || []).forEach(link => {
            const sNorm = (0, exports.normalizeArtistId)(resolveId(link.source));
            const tNorm = (0, exports.normalizeArtistId)(resolveId(link.target));
            if (!adjList.has(sNorm))
                adjList.set(sNorm, []);
            if (!adjList.has(tNorm))
                adjList.set(tNorm, []);
            adjList.get(sNorm).push(tNorm);
            adjList.get(tNorm).push(sNorm);
        });
        const queue = [artistNodeIdNorm];
        keptNodeIdsNorm.add(artistNodeIdNorm);
        while (queue.length > 0) {
            const current = queue.shift();
            const neighbors = adjList.get(current) || [];
            for (const neighbor of neighbors) {
                if (!keptNodeIdsNorm.has(neighbor) && !seedsNorm.has(neighbor)) {
                    keptNodeIdsNorm.add(neighbor);
                    queue.push(neighbor);
                }
            }
        }
    }
    const keptNodes = fullGraph.nodes.filter(n => keptNodeIdsNorm.has((0, exports.normalizeArtistId)(n.id)));
    const keptLinks = (fullGraph.links || []).filter(link => {
        const sNorm = (0, exports.normalizeArtistId)(resolveId(link.source));
        const tNorm = (0, exports.normalizeArtistId)(resolveId(link.target));
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
exports.extractArtistSubGraph = extractArtistSubGraph;
// --- JSON REPAIR & CLEANING PORTED FROM geminiService.ts ---
const extractCleanJsonString = (rawText) => {
    if (!rawText || typeof rawText !== 'string')
        return "";
    let text = rawText.trim();
    if (!text)
        return "";
    const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (match && match[1]) {
        text = match[1].trim();
    }
    else {
        text = text.replace(/^```(?:json)?\n?/i, '').replace(/```$/i, '').trim();
    }
    let startIdx = text.indexOf('{');
    const arrayStartIdx = text.search(/\[\s*(?:\{|")/); // allow array of objects or strings
    if (startIdx === -1)
        startIdx = arrayStartIdx;
    else if (arrayStartIdx !== -1 && arrayStartIdx < startIdx)
        startIdx = arrayStartIdx;
    if (startIdx === -1) {
        startIdx = text.indexOf('[');
    }
    if (startIdx === -1)
        return text;
    text = text.substring(startIdx);
    let stack = [];
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
            }
            else if (char === '}' || char === ']') {
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
exports.extractCleanJsonString = extractCleanJsonString;
const repairJson = (json) => {
    if (!json)
        return "";
    let stack = [];
    let inString = false;
    let escaped = false;
    let startIdx = json.indexOf('{');
    const arrayStartIdx = json.search(/\[\s*(?:\{|")/); // allow array of objects or strings
    if (startIdx === -1)
        startIdx = arrayStartIdx;
    else if (arrayStartIdx !== -1 && arrayStartIdx < startIdx)
        startIdx = arrayStartIdx;
    if (startIdx === -1) {
        startIdx = json.indexOf('[');
    }
    if (startIdx === -1)
        return json;
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
            }
            else if (char === '}' || char === ']') {
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
        if (last === '{')
            repaired += '}';
        else if (last === '[')
            repaired += ']';
    }
    return repaired;
};
// --- GEMINI CURATION CONFIGS ---
exports.GRAPH_RESPONSE_SCHEMA = {
    type: genai_1.Type.OBJECT,
    properties: {
        nodes: {
            type: genai_1.Type.ARRAY,
            description: "A list of nodes in the music graph. Each node represents an artist, genre, label, country, or founded year.",
            items: {
                type: genai_1.Type.OBJECT,
                properties: {
                    id: {
                        type: genai_1.Type.STRING,
                        description: "The professional, canonical name of the artist, genre, label, country, or the 4-digit year (YYYY) for founded nodes."
                    },
                    type: {
                        type: genai_1.Type.STRING,
                        description: "The type of the node, can be 'artist', 'genre', 'label', 'country', or 'founded'."
                    },
                    group: {
                        type: genai_1.Type.INTEGER,
                        description: "A group identifier for coloring or categorization, usually based on the initial seed artists."
                    },
                    label: {
                        type: genai_1.Type.STRING,
                        description: "The raw, human-readable name of the entity, especially for artists and labels (e.g., 'Drug Church')."
                    },
                    origin: {
                        type: genai_1.Type.STRING,
                        description: "For artists and labels, the country of origin (e.g., 'USA', 'UK'). Leave empty for other node types."
                    }
                },
                required: ["id", "type", "group"]
            }
        },
        links: {
            type: genai_1.Type.ARRAY,
            description: "A list of links connecting the nodes, representing relationships.",
            items: {
                type: genai_1.Type.OBJECT,
                properties: {
                    source: {
                        type: genai_1.Type.STRING,
                        description: "The ID of the source node."
                    },
                    target: {
                        type: genai_1.Type.STRING,
                        description: "The ID of the target node."
                    },
                    value: {
                        type: genai_1.Type.INTEGER,
                        description: "The strength of the connection, typically a constant value like 1."
                    },
                    forwardContext: {
                        type: genai_1.Type.STRING,
                        description: "A brief, 3-7 word explanation of the relationship in present tense from source to target, e.g., 'discovers and champions' or 'formed in' or 'influenced'."
                    },
                    inverseContext: {
                        type: genai_1.Type.STRING,
                        description: "A brief explanation from target to source, reversing the semantics, e.g., 'discovered and championed by' or 'was formed in' or 'was influenced by'."
                    }
                },
                required: ["source", "target", "value", "forwardContext", "inverseContext"]
            }
        }
    },
    required: ["nodes", "links"]
};
exports.GENERATE_GRAPH_WITH_CONTEXT_PROMPT_TEMPLATE = `I have an existing music graph. The user wants to enhance it by adding connections for these seed artists: {{artists}}.

        The graph ALREADY CONTAINS the following nodes: [{{existingNodeIds}}].
        
        Your task is to generate ONLY the NEW nodes and links needed to integrate the seed artists ({{artists}}) into the existing graph. Follow these rules:
        1.  CANONICAL NAMING: For ALL nodes (especially the seed artists provided in "{{artists}}"), you MUST use the canonical, professional spelling and capitalization as recognized by the music industry. For example, use "Radiohead" even if the user typed "radiohead", and use "blink-182" with a lowercase 'b' and hyphen if that is the correct format.
        2.  DO NOT duplicate any of the existing nodes listed above. When creating links, you MUST reference the existing node IDs if a connection is needed.
        3.  For EACH seed artist in "{{artists}}", if they do not already exist as a node, you MUST add them as an 'artist' node to the 'nodes' array. This is a mandatory requirement. After adding the artist node, attempt to find its primary genre, record label, country of origin, and the year they were formed/founded (YYYY). If you find these details, create nodes for them (if they don't already exist) and link them back to the seed artist. The 'id' for the year node must be the 4-digit year (e.g., "1998") and its type must be 'founded'. If you cannot find some or all of these details, that is acceptable, but the seed artist node itself MUST still be included in the graph.
        4.  In addition, identify and add 8-12 NEW related artists that are musically connected to the seed artists. For these NEW artists, you MUST also identify and create their respective genre, label, country, and especially their 'founded' year nodes (YYYY) to ensure the spiderweb is rich with chronological data. Assign them to the same 'group' as the seed artist they relate to, or a new group if they relate to multiple.
        5.  TEMPORAL ECOSYSTEM & SCENE AUTHENTICITY RULE (STRICT): You MUST reconstruct the true historical scene and temporal ecosystem of the seed artist(s). Node selection must be strictly restricted to the primary active era, geographic scene, and lived touring ecosystem of the seed(s). For example, if a seed artist was primarily active in a late-1990s scene, you MUST surface their exact period-accurate peers from that specific 1990s era. If the seed is a modern 2020s band, you MUST surface contemporary peers from their current 2020s ecosystem. Do NOT suggest modern algorithmic equivalents for legacy bands, and do NOT pull in historical legacy ancestors for modern bands unless they genuinely shared the same active touring scene. The graph must represent a period-accurate, contemporary snapshot of the artist's specific moment in time. EXCEPTION (3-TIER ANCHOR OVERRIDE): When explicit Level 2 Era or Country Guardrails are active below, those guardrails take absolute precedence for all NEW recommended artists. In that case, you MUST map cross-era or cross-border lineage, influence, and spiritual succession connecting the sacred seed artist(s) to peers founded within the specified era/origin window, even if the seed artist belongs to a different decade or country.
        6.  It is absolutely critical that each 'founded' node is linked ONLY to the correct artist node who was founded in that year.
        7.  LINK RELATIONSHIP CONTEXT (Dual-Context): Each link in the 'links' array MUST natively output two strings:
            - 'forwardContext': Explains the connection from source to target (e.g. 'discovers and champions', 'is a sub-genre of').
            - 'inverseContext': Reverses the semantic direction from target to source (e.g. 'discovered and championed by', 'is the parent genre of').
        8.  JSON SCHEMA: The output must be a single, valid JSON object with 'nodes' and 'links' arrays matching the schema.
        
        STRUCTURAL ONLY: You MUST NOT generate or include any biographies, summaries, member lists, discographies, or detailed profile metadata for the artists. The response must strictly contain only structural layout nodes (id, type, group) and connection links (source, target, value, context).
        
        ABSOLUTELY CRITICAL FINAL CHECK: Before you output the JSON, verify that for EVERY SINGLE OBJECT in the 'links' array, the value of its 'source' property and the value of its 'target' property perfectly match an 'id' from an object in EITHER the provided existing nodes list OR your new 'nodes' array. THERE MUST BE NO ORPHANED LINKS. If you create a link with a 'source' or 'target' ID (e.g., "Arista Records"), you MUST ALSO define a node with that exact same 'id' (e.g., { "id": "Arista Records", "type": "label", ... }). Do not invent connections to nodes you haven't defined. This is a strict, mandatory requirement.
        
        IMPORTANT: Ensure that any double quotes within string values are properly escaped (e.g., "Artist \\"Name\\""). The final output must be perfectly valid JSON. Do not emit literal '\\n' strings; use standard JSON string encoding for line breaks. Your entire response MUST be ONLY the raw JSON object, without any surrounding text, explanations, or markdown code fences.`;
exports.GENERATE_MULTI_SEED_GRAPH_PROMPT_TEMPLATE = `Given the following list of seed artists: {{artists}}.
Your task is to explore the genuine cultural, historical, and musical intersection of these seed artists from a blank slate (Tabula Rasa), performing a true co-equal "melting pot" traversal where all input seeds act as simultaneous structural foundations, avoiding any attention bias toward a single anchor artist. The output must be a single, valid JSON object with keys: 'nodes', and 'links'.
'nodes' should be an array of objects, each with 'id', 'type', and 'group'. The 'type' can be 'artist', 'genre', 'label', 'country', or 'founded'.
'links' should be an array of objects, each with 'source', 'target', 'value', 'forwardContext', and 'inverseContext' describing the directional relationship.

Follow these rules precisely:
1.  CANONICAL NAMING: For ALL nodes, use the canonical, professional spelling and capitalization as recognized by the music industry. For example, use "Radiohead" even if the seed provided was "radiohead", and "blink-182" with a lowercase 'b' and hyphen if that is its official name.
2.  MANDATORY SEED NODES (CO-EQUAL ROOTS): You MUST ensure an 'artist' node exists for EVERY seed artist listed in {{artists}}. Assign a unique 'group' number for each seed artist (e.g. 1 for seed 1, 2 for seed 2). Treat every seed as a co-equal foundational anchor. If any seed artist has active filters, do not label them as "[Indirect recommendation]" or isolate them.
3.  For each seed artist, find and add nodes for their primary genre, record label, country of origin, and the year they were formed/founded (YYYY). The 'id' for the year node must be the 4-digit year (e.g. "1994") and its type must be 'founded'. For metadata nodes (genre, label, country, founded), use canonical IDs and types.
4.  TARGET ENTITY DENSITY & DUAL-STRUCTURE TOPOLOGY (RULE 27 — CROSSOVER BRIDGE + NATIVE ECOSYSTEMS):
    In addition, find and add 10 to 16 NEW related artists total across the seeds (bringing the total artist count including seeds to 12 to 18 artists), structured into two complementary layers:
    A. THE CROSSOVER BRIDGE (5 to 6 artists + shared labels/genres): Identify authentic bands, imprints, and genres that legitimately connect multiple seeds through shared musical DNA, split releases, shared producers, record labels, or lived touring history.
    B. NATIVE ECOSYSTEMS (4 to 5 distinct scene artists per seed): Radiate deeply into each seed's authentic regional, temporal, and stylistic ecosystem. Give EACH seed its own dedicated cluster of 2nd-degree peers and formative scene contemporaries rather than stopping at superficial connections.
    
    UPPER-BOUND AMBITION & ANTI-LAZINESS DIRECTIVE: When the musical ecosystems surrounding the seeds are historically fertile, DO NOT lazily default to the bottom of the range. Actively strive toward the upper bound (13 to 16 new artists) to give users a deep, rich scene exploration.
    
    STRICT ANTI-FILLER VALVE: Conversely, NEVER pad the graph with generic or tenuously connected artists just to hit numbers. If an artist belongs to a genuinely tiny or isolated micro-scene with few authentic peers, scaling down and stopping at 9 to 10 new artists if sparse is required; never pad. Quality, historical veracity, and shared scene reality always override numerical quantity.
    
    Labels are explicitly EXCLUDED from this artist cap; generate the natural amount of authentic Label nodes required to accurately connect the generated artists together based on historical reality (typically resulting in an organic overall density of roughly 18 to 26 total Deep Cuts). ONLY include artists that strictly meet any provided discovery filters.
5.  For all artists (seed and related), create links connecting them to their respective genre, label, country, and founded year nodes. CRITICAL TOPOLOGY RULE: You MUST create direct links connecting each seed artist to their native ecosystem peers (sharing their 'group' number), and direct links connecting bridging artists to the seeds/peers they connect. Every new artist MUST be connected back to the central spiderweb, either directly to a seed artist or through a chain of artist-to-artist links. DO NOT leave any artist nodes floating or only connected to metadata nodes. Each link MUST include a 'forwardContext' and 'inverseContext' string explaining the bidirectional relationship (e.g., 'releases music on XL Recordings' / 'released by'). Keep the contexts brief.
6.  TEMPORAL ECOSYSTEM & SCENE AUTHENTICITY RULE (STRICT): You MUST reconstruct the true historical scene and temporal ecosystem of the seed artist(s). Node selection must be strictly restricted to the primary active era, geographic scene, and lived touring ecosystem of the seed(s). For example, if a seed artist was primarily active in a late-1990s scene, you MUST surface their exact period-accurate peers from that specific 1990s era. If the seed is a modern 2020s band, you MUST surface contemporary peers from their current 2020s ecosystem. Do NOT suggest modern algorithmic equivalents for legacy bands, and do NOT pull in historical legacy ancestors for modern bands unless they genuinely shared the same active touring scene. The graph must represent a period-accurate, contemporary snapshot of the artist's specific moment in time. EXCEPTION (3-TIER ANCHOR OVERRIDE): When explicit Level 2 Era or Country Guardrails are active below, those guardrails take absolute precedence for all NEW recommended artists. In that case, you MUST map cross-era or cross-border lineage, influence, and spiritual succession connecting the sacred seed artist(s) to peers founded within the specified era/origin window, even if the seed artist belongs to a different decade or country.
7.  CRITICAL: Each 'founded' node MUST be linked ONLY to the correct artist who was founded in that year.
8.  JSON SCHEMA: The output must be a single, valid JSON object with 'nodes' and 'links' arrays matching the schema.

STRUCTURAL ONLY: You MUST NOT generate or include any biographies, summaries, member lists, discographies, or detailed profile metadata for the artists. The response must strictly contain only structural layout nodes (id, type, group) and connection links (source, target, value, forwardContext, inverseContext).

ABSOLUTELY CRITICAL FINAL CHECK: Before you output the JSON, verify that for EVERY SINGLE OBJECT in the 'links' array, the value of its 'source' property and the value of its 'target' property perfectly match an 'id' from an object in the 'nodes' array. THERE MUST BE NO ORPHANED LINKS. If you create a link with a 'source' or 'target' ID (e.g., "Arista Records"), you MUST ALSO define a node with that exact same 'id' (e.g., { "id": "Arista Records", "type": "label", ... }). Do not invent connections to nodes you haven't defined. This is an architectural requirement.

NEGATIVE CONSTRAINT: NEVER use em-dashes (—) or long hyphens for dramatic effect or clause separation. Use standard editorial punctuation (commas, colons, or semicolons).`;
exports.GENERATE_GRAPH_PROMPT_TEMPLATE = `Given the following list of seed artists: {{artists}}. Generate a music family tree connecting them. The output must be a single, valid JSON object with keys: 'nodes', and 'links'.
'nodes' should be an array of objects, each with 'id', 'type', and 'group'. The 'type' can be 'artist', 'genre', 'label', 'country', or 'founded'.
'links' should be an array of objects, each with 'source', 'target', 'value', 'forwardContext', and 'inverseContext' describing the directional relationship.

Follow these rules precisely:
1.  CANONICAL NAMING: For ALL nodes, use the canonical, professional spelling and capitalization as recognized by the music industry. For example, use "Radiohead" even if the seed provided was "radiohead", and "blink-182" with a lowercase 'b' and hyphen if that is its official name.
2.  MANDATORY: You MUST create an 'artist' node for EVERY seed artist provided in the list: {{artists}}. Assign a unique 'group' number for each seed artist.
3.  For each seed artist, find and add nodes for their primary genre, record label, country of origin, and the year they were formed/founded (YYYY). The 'id' for the year node must be the 4-digit year (e.g. "1994") and its type must be 'founded'.
4.  TARGET ENTITY DENSITY (RULE 27 — 10 TO 16 NEW ARTISTS):
    In addition, find and add 10 to 16 NEW related artists that are musically connected to the seed artists. For these NEW artists, you MUST also identify and create their respective genre, label, country, and especially their 'founded' year nodes (YYYY) to ensure the spiderweb is rich with chronological data.
    
    UPPER-BOUND AMBITION & ANTI-LAZINESS DIRECTIVE: In rich, fertile musical movements, DO NOT satisfice at the lower floor. Strive for the upper range (13 to 16 new artists) by surfacing authentic 2nd-degree scene peers and era contemporaries.
    
    STRICT ANTI-FILLER VALVE: If the seed belongs to an isolated micro-niche, scale down, stopping at 9 to 10 new artists if sparse; never pad with irrelevant or generic artists just to hit a number. Quality, historical veracity, and shared scene reality always override numerical quantity.
    
    Labels are explicitly EXCLUDED from this cap; generate the natural amount of Label nodes required to accurately connect the generated artists together based on historical reality (resulting in an organic target density of roughly 18 to 26 total Deep Cuts). ONLY include artists that strictly meet any provided discovery filters.
5.  For all artists (seed and related), create links connecting them to their respective genre, label, country, and founded year nodes. CRITICAL TOPOLOGY RULE: You MUST create direct links connecting the seed artist(s) to the NEW related artists you introduce. Every new artist MUST be connected back to the central spiderweb, either directly to the seed artist, or through a chain of artist-to-artist links. DO NOT leave any artist nodes floating or only connected to metadata nodes. All direct connections of a seed artist should share their 'group' number. Each link MUST include a 'forwardContext' and 'inverseContext' string explaining the bidirectional relationship (e.g., 'releases music on XL Recordings' / 'released by'). Keep the contexts brief.
6.  TEMPORAL ECOSYSTEM & SCENE AUTHENTICITY RULE (STRICT): You MUST reconstruct the true historical scene and temporal ecosystem of the seed artist(s). Node selection must be strictly restricted to the primary active era, geographic scene, and lived touring ecosystem of the seed(s). For example, if a seed artist was primarily active in a late-1990s scene, you MUST surface their exact period-accurate peers from that specific 1990s era. If the seed is a modern 2020s band, you MUST surface contemporary peers from their current 2020s ecosystem. Do NOT suggest modern algorithmic equivalents for legacy bands, and do NOT pull in historical legacy ancestors for modern bands unless they genuinely shared the same active touring scene. The graph must represent a period-accurate, contemporary snapshot of the artist's specific moment in time. EXCEPTION (3-TIER ANCHOR OVERRIDE): When explicit Level 2 Era or Country Guardrails are active below, those guardrails take absolute precedence for all NEW recommended artists. In that case, you MUST map cross-era or cross-border lineage, influence, and spiritual succession connecting the sacred seed artist(s) to peers founded within the specified era/origin window, even if the seed artist belongs to a different decade or country.
7.  CRITICAL: Each 'founded' node MUST be linked ONLY to the correct artist who was founded in that year.
8.  JSON SCHEMA: The output must be a single, valid JSON object with 'nodes' and 'links' arrays matching the schema.

STRUCTURAL ONLY: You MUST NOT generate or include any biographies, summaries, member lists, discographies, or detailed profile metadata for the artists. The response must strictly contain only structural layout nodes (id, type, group) and connection links (source, target, value, context).
        
ABSOLUTELY CRITICAL FINAL CHECK: Before you output the JSON, verify that for EVERY SINGLE OBJECT in the 'links' array, the value of its 'source' property and the value of its 'target' property perfectly match an 'id' from an object in the 'nodes' array. THERE MUST BE NO ORPHANED LINKS. If you create a link with a 'source' or 'target' ID (e.g., "Arista Records"), you MUST ALSO define a node with that exact same 'id' (e.g., { "id": "Arista Records", "type": "label", ... }). Do not invent connections to nodes you haven't defined. This is a architecture requirement.

NEGATIVE CONSTRAINT: NEVER use em-dashes (—) or long hyphens for dramatic effect or clause separation. Use standard editorial punctuation (commas, colons, or semicolons).`;
// --- GEMINI CURATION CONFIGS ---
exports.SEED_VALIDATION_SCHEMA = {
    type: genai_1.Type.OBJECT,
    properties: {
        isValid: {
            type: genai_1.Type.BOOLEAN,
            description: "True if this is a real, recognized musical entity (artist, band, or label) that can be confidently identified. False if the input cannot be mapped to any known artist."
        },
        correctedInput: {
            type: genai_1.Type.BOOLEAN,
            description: "True if the primary name returned is a spelling or typo correction of the user's input (e.g. input 'turstile' -> 'Turnstile'). False if exact match (case-insensitive)."
        },
        hasCollision: {
            type: genai_1.Type.BOOLEAN,
            description: "True ONLY if there are multiple genuine, prominent, distinct musical acts legitimately sharing this exact or near-identical name (e.g. 'Darko' refers to Darko US [Deathcore] and Darko [UK Melodic Punk]). False if there is one predominant, famous, or unambiguous artist (e.g. 'Turnstile', 'Radiohead', 'Nirvana')."
        },
        primary: {
            type: genai_1.Type.OBJECT,
            description: "The primary or most prominent recognized musical entity.",
            properties: {
                id: {
                    type: genai_1.Type.STRING,
                    description: "The canonical, professional name of the artist. If the real-world official band name includes a regional tag (e.g. 'Darko US'), include it. Otherwise do NOT add country suffixes."
                },
                origin: {
                    type: genai_1.Type.STRING,
                    description: "The country of origin for the artist (e.g., 'USA', 'United Kingdom', 'Canada'). Return empty string if isValid is false."
                },
                genre: {
                    type: genai_1.Type.STRING,
                    description: "The primary genre of the artist (e.g. 'Hardcore Punk', 'Deathcore'). Return empty string if isValid is false."
                },
                disambiguationSnippet: {
                    type: genai_1.Type.STRING,
                    description: "A concise 1-sentence contextual identifier (e.g. 'American deathcore project featuring Tom Barber and Baby J' or 'Baltimore hardcore punk band formed in 2010')."
                }
            },
            required: ["id", "origin", "genre"]
        },
        collisions: {
            type: genai_1.Type.ARRAY,
            description: "List of other genuine, prominent, commercially-released musical artists with identical or colliding names. MUST be EMPTY [] unless there are verified, notable acts with published albums.",
            items: {
                type: genai_1.Type.OBJECT,
                properties: {
                    id: {
                        type: genai_1.Type.STRING,
                        description: "The canonical name of the colliding artist."
                    },
                    origin: {
                        type: genai_1.Type.STRING,
                        description: "Country of origin."
                    },
                    genre: {
                        type: genai_1.Type.STRING,
                        description: "Primary genre."
                    },
                    disambiguationSnippet: {
                        type: genai_1.Type.STRING,
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
const validateSeedOriginBackend = async (artistId, hints) => {
    try {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            throw new Error("GEMINI_API_KEY is not defined in environment secrets.");
        }
        const ai = new genai_1.GoogleGenAI({ apiKey, httpOptions: { timeout: 300000 } });
        const currentModel = exports.GEMINI_FLASH_MODEL; // Column 2: Origin Validation uses Flash
        const hasHints = !!(hints && (hints.originHint?.trim() || hints.genreHint?.trim()));
        const hintContext = hasHints
            ? `\nUSER SPECIFICATION / RE-QUERY HINTS: The user explicitly specifies that this artist operates in or originates from: "${hints?.originHint?.trim() || ''}"${hints?.genreHint?.trim() ? ` with genre: "${hints.genreHint.trim()}"` : ''}.`
            : '';
        const prompt = `Validate this seed artist: "${artistId}".${hintContext}

CRITICAL RULES (non-negotiable):
1. TYPO CORRECTION (MANDATORY): If the input is an obvious misspelling or transposition of a real artist name (e.g. "turstile" for "Turnstile", "radiohed" for "Radiohead", "nirvanna" for "Nirvana"), return the correctly-spelled canonical name in 'primary.id' and set 'correctedInput' to true. Do NOT return the original typo'd spelling under any circumstances.
2. STRICT ANTI-HALLUCINATION / NO "PEOPLE-PLEASING" COLLISIONS:
   - A collision exists ONLY when there are multiple distinct, widely-known, commercially released musical artists that legitimately share this name (e.g. "Darko" -> Darko US [Deathcore] and Darko [UK Melodic Punk]).
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
                systemInstruction: "You are a strict music data validator, collision detector, and anti-hallucination bouncer. You do NOT infer intent or people-please. If the user input contains a spelling error, return the REAL canonical artist name. If the user provides an origin hint, verify whether an artist by that name actually exists from that origin; if not, return isValid: false. Only report collisions when there are multiple genuinely prominent, commercially published artists sharing the name. NEVER invent minor artists. Return ONLY valid JSON matching the schema.",
                thinkingConfig: { thinkingLevel: genai_1.ThinkingLevel.MINIMAL },
                responseMimeType: "application/json",
                responseSchema: exports.SEED_VALIDATION_SCHEMA
            }
        });
        const jsonText = response.text?.trim() || "";
        if (!jsonText)
            throw new Error("Empty validation response");
        const cleanedJsonText = (0, exports.extractCleanJsonString)(jsonText);
        const data = JSON.parse(cleanedJsonText);
        const primary = data.primary || { id: artistId, origin: "", genre: "", disambiguationSnippet: "" };
        const rawCollisions = Array.isArray(data.collisions) ? data.collisions : [];
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
        const candidates = [];
        if (data.isValid) {
            // Build primary candidate
            let primarySlug = (0, exports.normalizeArtistId)(primary.id);
            // V25 Root-as-Router Contract & Rule 36: All verified entities with non-global origins resolve to their geographically suffixed ID
            if (primary.origin) {
                const originSlug = (0, exports.extractCountrySlug)(primary.origin);
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
                        let colSlug = (0, exports.normalizeArtistId)(col.id);
                        if (col.origin) {
                            const originSlug = (0, exports.extractCountrySlug)(col.origin);
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
    }
    catch (err) {
        console.error(`[validateSeedOriginBackend] Failed to validate seed ${artistId}:`, err);
        // Bulletproof: We now actively throw the error so the orchestrator's catch block can flag the job as failed
        throw err;
    }
};
exports.validateSeedOriginBackend = validateSeedOriginBackend;
const generateRootsBreakdownBackend = async (artists, detailsCacheEntries, usageCollector, filters) => {
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
    const seedList = artists.split('::').map(s => (0, executeCurationPipeline_1.stripCountrySlug)((0, exports.normalizeArtistId)(s)));
    const isMultiSeed = seedList.length > 1;
    let seedAnchorInstruction = '';
    if ((0, cacheQualification_1.hasActiveDiscoveryFilters)(filters)) {
        const filterDesc = [
            filters.foundedAfter ? `founded AFTER ${filters.foundedAfter}` : '',
            filters.foundedBefore ? `founded BEFORE ${filters.foundedBefore}` : '',
            filters.includeOrigins?.length ? `from origins: ${filters.includeOrigins.join(', ')}` : '',
            filters.excludeOrigins?.length ? `excluding origins: ${filters.excludeOrigins.join(', ')}` : '',
            filters.includeGenres?.length ? `within genres: ${filters.includeGenres.join(', ')}` : '',
            filters.anchorLabels?.length ? `anchored around labels: ${filters.anchorLabels.map((l) => (0, cacheQualification_1.sanitizeAnchorLabelInput)(l)).filter(Boolean).join(', ')}` : ''
        ].filter(Boolean).join('; ');
        seedAnchorInstruction = `\n\nSEED ANCHOR CONSTRAINT (MANDATORY — 3-TIER ANCHOR SYSTEM): This ecosystem was generated with active 3-Tier Anchors: [${filterDesc}]. Your narrative MUST explicitly frame these spatial/temporal guardrails and scene gravity pulls as the defining thematic lens of the ecosystem (including cross-era or cross-border lineage if the seed artist predates or originates outside the target window). Reference this era, origin, genre, or label constraint as an organizing principle in your opening paragraph. Do NOT write as if this were an unconstrained generation — the filter is a core architectural requirement, not optional context. Failure to acknowledge the filter constraint is a violation of the generation contract.`;
    }
    const coAnchorMandate = isMultiSeed ?
        `\n\nCRITICAL CO-ANCHOR MANDATE (Rule 27): This is a multi-seed generation for the following equal anchors: ${artists.replace(/::/g, ', ')}. You MUST treat EVERY seed artist as a co-equal foundational anchor. Do not relegate any seed to a "satellite" status or focus the narrative on just one artist due to their fame. The resulting breakdown must weave them together as co-equal pillars of the ecosystem.${seedAnchorInstruction}` : `\n\nCRITICAL ANCHOR MANDATE (Rule 27):${seedAnchorInstruction}`;
    const prompt = `Write the Roots Breakdown for these seed artists: ${artists.replace(/::/g, ', ')}.${coAnchorMandate}

Here is the fully enriched context of all nodes (seeds and deep cuts) in their generated ecosystem:
${JSON.stringify(detailsCacheEntries, null, 2)}`;
    const responseSchema = {
        type: genai_1.Type.OBJECT,
        properties: {
            editorialMarkdown: {
                type: genai_1.Type.STRING,
                description: "The main Roots Breakdown narrative in Markdown format.",
            },
            artistSnippets: {
                type: genai_1.Type.ARRAY,
                description: "A list of punchy 1-sentence epicenter hooks for the seed and satellite artists/labels mentioned in the breakdown.",
                items: {
                    type: genai_1.Type.OBJECT,
                    properties: {
                        id: { type: genai_1.Type.STRING, description: "The canonical name of the artist or label." },
                        snippet: { type: genai_1.Type.STRING, description: "A punchy, standalone 1-sentence epicenter hook describing their specific role in this ecosystem." }
                    },
                    required: ["id", "snippet"]
                }
            }
        },
        required: ["editorialMarkdown", "artistSnippets"]
    };
    const executeSynthesis = async (model, thinkingLevel, timeoutMs) => {
        const ai = new genai_1.GoogleGenAI({
            apiKey,
            httpOptions: { timeout: timeoutMs }
        });
        let timer = null;
        const timeoutPromise = new Promise((_, reject) => {
            timer = setTimeout(() => {
                reject(new Error(`Synthesis request timed out after ${timeoutMs}ms for ${model}`));
            }, timeoutMs);
            if (typeof timer?.unref === 'function')
                timer.unref();
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
            if (timer)
                clearTimeout(timer);
            if (usageCollector && response.usageMetadata) {
                usageCollector.push(model, {
                    promptTokenCount: response.usageMetadata.promptTokenCount || 0,
                    candidatesTokenCount: response.usageMetadata.candidatesTokenCount || 0,
                    totalTokenCount: response.usageMetadata.totalTokenCount || 0,
                });
            }
            const text = response.text;
            if (!text)
                return null;
            const parsed = JSON.parse(text);
            // V11.6 Fix 1: Unescape literal \n sequences that the structured JSON output mode over-escapes.
            if (parsed?.editorialMarkdown) {
                parsed.editorialMarkdown = parsed.editorialMarkdown.replace(/\\n/g, '\n');
            }
            return parsed;
        }
        finally {
            if (timer)
                clearTimeout(timer);
        }
    };
    try {
        // Attempt 1: Gemini 3.1 Pro Preview (high thinking) bounded by 90-second timeout
        return await executeSynthesis("gemini-3.1-pro-preview", genai_1.ThinkingLevel.HIGH, 90000);
    }
    catch (proErr) {
        console.warn(`[generateRootsBreakdownBackend] 3.1 Pro synthesis failed or timed out (${proErr?.message || proErr}). Engaging instant resilient fallback to ${exports.GEMINI_FLASH_MODEL} (thinking_level: low)...`);
        try {
            // Attempt 2: Resilient Fallback - Gemini 3.6 Flash (low thinking) bounded by 45-second timeout
            const flashResult = await executeSynthesis(exports.GEMINI_FLASH_MODEL, genai_1.ThinkingLevel.LOW, 45000);
            if (flashResult) {
                console.log(`[generateRootsBreakdownBackend] Resilient Flash fallback succeeded for roots breakdown (${artists}).`);
                return flashResult;
            }
            return null;
        }
        catch (flashErr) {
            console.error("[generateRootsBreakdownBackend] Both 3.1 Pro and Flash fallback failed to generate roots breakdown:", flashErr);
            return null;
        }
    }
};
exports.generateRootsBreakdownBackend = generateRootsBreakdownBackend;
const reconcileNarrativeEdges = async (apiKey, narrative, nodes, existingLinks, usageCollector) => {
    if (!narrative || !narrative.trim() || nodes.length === 0)
        return [];
    const currentModel = exports.GEMINI_FLASH_MODEL;
    const ai = new genai_1.GoogleGenAI({ apiKey, httpOptions: { timeout: 120000 } });
    // Build a deduplicated set of existing edge keys for efficient exclusion
    const existingEdgeSet = new Set(existingLinks.map(l => [l.source, l.target].sort().join('--')));
    // Only expose artist-type nodes — metadata petals are not valid edge endpoints
    const artistNodes = nodes
        .filter(n => n.type === 'artist' || n.type === 'label')
        .map(n => n.id);
    if (artistNodes.length < 2)
        return [];
    const prompt = `You are auditing a music graph for missing edges.

Below is the Root Breakdown narrative generated for this graph, followed by the complete list of valid node IDs and the edges that already exist.

Your task: identify connections between artists that are EXPLICITLY stated or directly implied in the narrative text but are MISSING from the existing edges list. Only return edges where BOTH the source and target appear verbatim in the Valid Node IDs list. Do not invent connections that are not in the text.

--- NARRATIVE ---
${narrative}

--- VALID NODE IDs (artist/label only) ---
${JSON.stringify(artistNodes)}

--- EXISTING EDGES (already in graph, do NOT repeat these) ---
${JSON.stringify(existingLinks.map(l => `${l.source} → ${l.target}`))}

Return a JSON array of missing edges. For each missing edge provide:
- source: the exact node ID from the valid list
- target: the exact node ID from the valid list  
- forwardContext: short verbatim excerpt describing action from source to target
- inverseContext: short verbatim excerpt (or reversed text) describing action from target to source
- weight: a float 0.1–1.0 representing connection strength (1.0 = defining influence, 0.1 = loose mention)

If no missing edges are found, return an empty array [].`;
    const responseSchema = {
        type: genai_1.Type.ARRAY,
        description: "Missing narrative edges not yet present in the graph.",
        items: {
            type: genai_1.Type.OBJECT,
            properties: {
                source: {
                    type: genai_1.Type.STRING,
                    description: "Exact source node ID from the valid node list."
                },
                target: {
                    type: genai_1.Type.STRING,
                    description: "Exact target node ID from the valid node list."
                },
                forwardContext: {
                    type: genai_1.Type.STRING,
                    description: "Short excerpt describing relationship from source to target."
                },
                inverseContext: {
                    type: genai_1.Type.STRING,
                    description: "Short excerpt or inverse phrase from target to source."
                },
                weight: {
                    type: genai_1.Type.NUMBER,
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
                thinkingConfig: { thinkingLevel: genai_1.ThinkingLevel.MINIMAL },
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
        if (!text)
            return [];
        const parsed = JSON.parse(text);
        // Final safety pass: enforce that both endpoints exist in our node list
        // and that the edge is not already present in the graph.
        const artistNodeSet = new Set(artistNodes);
        return parsed.filter(edge => {
            if (!artistNodeSet.has(edge.source) || !artistNodeSet.has(edge.target))
                return false;
            if (edge.source === edge.target)
                return false;
            const key = [edge.source, edge.target].sort().join('--');
            return !existingEdgeSet.has(key);
        });
    }
    catch (error) {
        console.error("[reconcileNarrativeEdges] Failed to reconcile narrative edges:", error);
        return [];
    }
};
exports.reconcileNarrativeEdges = reconcileNarrativeEdges;
const generateGraphDataBackend = async (artists, filters, cachedSubgraphsContext, baseGraph, disambiguationHints, _isTier2FallbackRetry = false) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error("GEMINI_API_KEY is not defined in environment secrets.");
    }
    const ai = new genai_1.GoogleGenAI({
        apiKey,
        httpOptions: { timeout: 300000 } // 5 minutes
    });
    const currentModel = "gemini-3.1-pro-preview";
    const artistList = artists.split('::').map(a => a.trim()).filter(Boolean);
    let userPrompt;
    let systemInstruction;
    const isEnhancement = baseGraph && baseGraph.nodes && baseGraph.nodes.length > 0;
    const isMultiSeed = artistList.length > 1;
    // Reinforce schema with dynamic descriptions if filters exist
    const dynamicSchema = JSON.parse(JSON.stringify(exports.GRAPH_RESPONSE_SCHEMA));
    if (filters?.foundedAfter) {
        dynamicSchema.properties.nodes.description += ` MANDATORY: All NEW artists MUST have been founded in ${filters.foundedAfter} or LATER.`;
    }
    if (filters?.foundedBefore) {
        dynamicSchema.properties.nodes.description += ` MANDATORY: All NEW artists MUST have been founded in ${filters.foundedBefore} or EARLIER.`;
    }
    if (isMultiSeed) {
        systemInstruction = exports.GENERATE_MULTI_SEED_GRAPH_PROMPT_TEMPLATE
            .replace('{{artists}}', artists);
        userPrompt = `Explore the genuine cultural, historical, and musical intersection of these seed artists: ${artists} from a blank slate. Map their crossover bridge and native scene ecosystems.`;
    }
    else if (isEnhancement) {
        const existingNodeIds = baseGraph.nodes.map(n => `"${n.id}" (${n.type})`).join(', ');
        systemInstruction = exports.GENERATE_GRAPH_WITH_CONTEXT_PROMPT_TEMPLATE
            .replace('{{existingNodeIds}}', existingNodeIds);
        userPrompt = `Enhance the graph for these seed artists: ${artists}.`;
    }
    else {
        systemInstruction = exports.GENERATE_GRAPH_PROMPT_TEMPLATE;
        userPrompt = `Generate a music graph for these seed artists: ${artists}.`;
    }
    // Inject 3-Tier Anchor System (Architecture V30 / Rule 41) into System Instruction
    if ((0, cacheQualification_1.hasActiveDiscoveryFilters)(filters) && filters) {
        let filterRules = "\n\n3-TIER ANCHOR HIERARCHY & DISCOVERY CONSTRAINTS (RULE 41):";
        filterRules += `\n- LEVEL 1 (SACRED SEED IMMUNITY): The seed artists [${artists}] are the sacred genesis of the spiderweb and are 100% IMMUNE to all secondary Era, Origin, Genre, and Label filters. Always include them and their authentic metadata.`;
        if ((0, cacheQualification_1.hasActiveTier2Filters)(filters)) {
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
        if ((0, cacheQualification_1.hasActiveTier3Filters)(filters)) {
            filterRules += "\n\n- LEVEL 3 (SOFT SCENE GRAVITY & GRACEFUL DEGRADATION — RULE 41):";
            if (filters.includeGenres && filters.includeGenres.length > 0) {
                filterRules += `\n  * CANONICAL GENRE GRAVITY: Strongly prioritize new artists connected to these genres: ${filters.includeGenres.join(', ')}.`;
            }
            if (filters.anchorLabels && filters.anchorLabels.length > 0) {
                const sanitizedLabels = filters.anchorLabels.map(l => (0, cacheQualification_1.sanitizeAnchorLabelInput)(l)).filter(Boolean);
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
        if (filters.foundedAfter)
            reminder += ` founded in ${filters.foundedAfter} or later;`;
        if (filters.foundedBefore)
            reminder += ` founded in ${filters.foundedBefore} or earlier;`;
        if (filters.includeOrigins?.length)
            reminder += ` origin in [${filters.includeOrigins.join(', ')}];`;
        if (filters.excludeOrigins?.length)
            reminder += ` excluding origins [${filters.excludeOrigins.join(', ')}];`;
        if (filters.includeGenres?.length)
            reminder += ` soft genre pull [${filters.includeGenres.join(', ')}];`;
        if (filters.anchorLabels?.length)
            reminder += ` soft label pull [${filters.anchorLabels.map(l => (0, cacheQualification_1.sanitizeAnchorLabelInput)(l)).filter(Boolean).join(', ')}];`;
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
    let data = null;
    let finalApiUsage = null;
    let attempts = 0;
    const MAX_ATTEMPTS = 3;
    while (attempts < MAX_ATTEMPTS && !data) {
        try {
            const response = await ai.models.generateContent({
                model: currentModel,
                contents: userPrompt,
                config: {
                    systemInstruction: finalizedSystemInstruction,
                    thinkingConfig: { thinkingLevel: genai_1.ThinkingLevel.MEDIUM },
                    maxOutputTokens: 12000,
                    responseMimeType: "application/json",
                    responseSchema: dynamicSchema
                }
            });
            jsonText = response.text?.trim() || "";
            if (!jsonText)
                throw new Error("The AI returned an empty response.");
            if (response.usageMetadata) {
                finalApiUsage = {
                    model: currentModel,
                    promptTokenCount: response.usageMetadata.promptTokenCount || 0,
                    candidatesTokenCount: response.usageMetadata.candidatesTokenCount || 0,
                    totalTokenCount: response.usageMetadata.totalTokenCount || 0,
                };
            }
            const cleanedJsonText = (0, exports.extractCleanJsonString)(jsonText);
            try {
                data = JSON.parse(cleanedJsonText);
            }
            catch (parseError) {
                try {
                    const repaired = repairJson(cleanedJsonText);
                    data = JSON.parse(repaired);
                }
                catch (repairError) {
                    throw new Error(`AI JSON parse failed: ${repairError.message}`);
                }
            }
        }
        catch (error) {
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
    const seedNormBareSet = new Set(seedRawList.map(a => (0, executeCurationPipeline_1.stripCountrySlug)((0, exports.normalizeArtistId)(a))));
    const isSeedNode = (nodeId) => {
        const lower = nodeId.toLowerCase();
        if (seedArtistIds.has(lower))
            return true;
        const normBare = (0, executeCurationPipeline_1.stripCountrySlug)((0, exports.normalizeArtistId)(nodeId));
        return seedNormBareSet.has(normBare);
    };
    const nodesToRemove = new Set();
    const rawNodes = Array.isArray(data?.nodes) ? data.nodes.filter(n => n && n.id != null) : [];
    const rawLinks = Array.isArray(data?.links) ? data.links.filter(l => {
        if (!l)
            return false;
        const s = typeof l.source === 'string' ? l.source : l.source?.id;
        const t = typeof l.target === 'string' ? l.target : l.target?.id;
        return s != null && t != null;
    }) : [];
    // --- MULTI-SEED TOPOLOGY MAPPING ---
    // Re-anchor natural LLM output (e.g. "turnstile") to cached baseGraph roots (e.g. "turnstile-usa")
    if (disambiguationHints) {
        rawNodes.forEach(node => {
            if (!node.id)
                return;
            const mapKey = `__MAP__${(0, exports.normalizeArtistId)(node.id)}`;
            if (disambiguationHints[mapKey]) {
                node.id = disambiguationHints[mapKey];
            }
        });
        rawLinks.forEach(link => {
            if (link.source) {
                const sourceStr = typeof link.source === 'string' ? link.source : link.source.id;
                if (sourceStr) {
                    const mapKey = `__MAP__${(0, exports.normalizeArtistId)(sourceStr)}`;
                    if (disambiguationHints[mapKey]) {
                        if (typeof link.source === 'string') {
                            link.source = disambiguationHints[mapKey];
                        }
                        else {
                            link.source.id = disambiguationHints[mapKey];
                        }
                    }
                }
            }
            if (link.target) {
                const targetStr = typeof link.target === 'string' ? link.target : link.target.id;
                if (targetStr) {
                    const mapKey = `__MAP__${(0, exports.normalizeArtistId)(targetStr)}`;
                    if (disambiguationHints[mapKey]) {
                        if (typeof link.target === 'string') {
                            link.target = disambiguationHints[mapKey];
                        }
                        else {
                            link.target.id = disambiguationHints[mapKey];
                        }
                    }
                }
            }
        });
    }
    if (filters?.foundedAfter) {
        const threshold = Number(filters.foundedAfter);
        const artistToYear = new Map();
        const nodeMap = new Map(rawNodes.map(n => [n.id, n]));
        rawLinks.forEach(link => {
            const sourceId = typeof link.source === 'string' ? link.source : link.source.id;
            const targetId = typeof link.target === 'string' ? link.target : link.target.id;
            const sourceNode = nodeMap.get(sourceId);
            const targetNode = nodeMap.get(targetId);
            if (sourceNode?.type === 'artist' && targetNode?.type === 'founded') {
                const year = parseInt(targetNode.id);
                if (!isNaN(year))
                    artistToYear.set(sourceId.toLowerCase(), year);
            }
            else if (targetNode?.type === 'artist' && sourceNode?.type === 'founded') {
                const year = parseInt(sourceNode.id);
                if (!isNaN(year))
                    artistToYear.set(targetId.toLowerCase(), year);
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
        const artistToYear = new Map();
        const nodeMap = new Map(rawNodes.map(n => [n.id, n]));
        rawLinks.forEach(link => {
            const sourceId = typeof link.source === 'string' ? link.source : link.source.id;
            const targetId = typeof link.target === 'string' ? link.target : link.target.id;
            const sourceNode = nodeMap.get(sourceId);
            const targetNode = nodeMap.get(targetId);
            if (sourceNode?.type === 'artist' && targetNode?.type === 'founded') {
                const year = parseInt(targetNode.id);
                if (!isNaN(year))
                    artistToYear.set(sourceId.toLowerCase(), year);
            }
            else if (targetNode?.type === 'artist' && sourceNode?.type === 'founded') {
                const year = parseInt(sourceNode.id);
                if (!isNaN(year))
                    artistToYear.set(targetId.toLowerCase(), year);
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
        const includeSlugs = new Set((filters.includeOrigins || []).map(o => (0, exports.extractCountrySlug)(o)).filter(s => s && s !== 'global'));
        const excludeSlugs = new Set((filters.excludeOrigins || []).map(o => (0, exports.extractCountrySlug)(o)).filter(s => s && s !== 'global'));
        const artistToCountrySlug = new Map();
        const nodeMap = new Map(rawNodes.map(n => [n.id, n]));
        rawLinks.forEach(link => {
            const sourceId = typeof link.source === 'string' ? link.source : link.source.id;
            const targetId = typeof link.target === 'string' ? link.target : link.target.id;
            const sourceNode = nodeMap.get(sourceId);
            const targetNode = nodeMap.get(targetId);
            if (sourceNode?.type === 'artist' && targetNode?.type === 'country') {
                const slug = (0, exports.extractCountrySlug)(targetNode.label || targetNode.id);
                if (slug && slug !== 'global')
                    artistToCountrySlug.set(sourceId.toLowerCase(), slug);
            }
            else if (targetNode?.type === 'artist' && sourceNode?.type === 'country') {
                const slug = (0, exports.extractCountrySlug)(sourceNode.label || sourceNode.id);
                if (slug && slug !== 'global')
                    artistToCountrySlug.set(targetId.toLowerCase(), slug);
            }
        });
        rawNodes.forEach(node => {
            if (node.type === 'artist' && !isSeedNode(node.id)) {
                const explicitSlug = node.origin ? (0, exports.extractCountrySlug)(node.origin) : undefined;
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
        const s = typeof l.source === 'string' ? l.source : l.source.id;
        const t = typeof l.target === 'string' ? l.target : l.target.id;
        return !nodesToRemove.has(s) && !nodesToRemove.has(t);
    });
    const artistIdsInFilteredNodes = new Set(filteredNodes.filter(n => n.type === 'artist' || n.type === 'label').map(n => n.id));
    filteredNodes = filteredNodes.filter(n => {
        if (n.type === 'artist' || n.type === 'label')
            return true;
        return filteredLinks.some(l => {
            const s = typeof l.source === 'string' ? l.source : l.source.id;
            const t = typeof l.target === 'string' ? l.target : l.target.id;
            return (s === n.id && artistIdsInFilteredNodes.has(t)) || (t === n.id && artistIdsInFilteredNodes.has(s));
        });
    });
    const finalNodeIds = new Set(filteredNodes.map(n => n.id));
    filteredLinks = filteredLinks.filter(l => {
        const s = typeof l.source === 'string' ? l.source : l.source.id;
        const t = typeof l.target === 'string' ? l.target : l.target.id;
        return finalNodeIds.has(s) && finalNodeIds.has(t);
    });
    const deduplicatedNodesMap = new Map();
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
    if (survivingNonSeedArtists.length === 0 && (0, cacheQualification_1.hasActiveTier3Filters)(filters) && !_isTier2FallbackRetry) {
        console.warn(`[Curation Backend] Rule 41 Graceful Degradation: 0 non-seed artists survived post-processing with Tier 3 active. Retrying with Tier 1 + Tier 2 only.`);
        const tier2OnlyFilters = {
            ...(filters?.foundedAfter !== undefined ? { foundedAfter: filters.foundedAfter } : {}),
            ...(filters?.foundedBefore !== undefined ? { foundedBefore: filters.foundedBefore } : {}),
            ...(filters?.includeOrigins?.length ? { includeOrigins: filters.includeOrigins } : {}),
            ...(filters?.excludeOrigins?.length ? { excludeOrigins: filters.excludeOrigins } : {}),
        };
        return (0, exports.generateGraphDataBackend)(artists, tier2OnlyFilters, cachedSubgraphsContext, baseGraph, disambiguationHints, true);
    }
    const validationNodeMap = new Map();
    const allNodesForValidation = [...(baseGraph?.nodes || []), ...deduplicatedNodes];
    for (const node of allNodesForValidation) {
        if (!node.id)
            continue;
        const normalizedId = node.id.trim().toLowerCase();
        const hyphenId = (0, exports.normalizeArtistId)(node.id);
        if (!validationNodeMap.has(normalizedId)) {
            validationNodeMap.set(normalizedId, { ...node, id: node.id.trim() });
        }
        if (!validationNodeMap.has(hyphenId)) {
            validationNodeMap.set(hyphenId, { ...node, id: node.id.trim() });
        }
    }
    const validLinks = filteredLinks.filter(link => {
        const sourceIdRaw = typeof link.source === 'string' ? link.source : link.source.id;
        const targetIdRaw = typeof link.target === 'string' ? link.target : link.target.id;
        if (!sourceIdRaw || !targetIdRaw)
            return false;
        const sourceId = sourceIdRaw.trim().toLowerCase();
        const targetId = targetIdRaw.trim().toLowerCase();
        if (sourceId === targetId)
            return false;
        if (!validationNodeMap.has(sourceId)) {
            const rawSource = typeof link.source === 'string' ? link.source : link.source.id;
            const trimmedSource = rawSource.trim();
            const newNode = { id: trimmedSource, type: 'artist', group: 1, label: trimmedSource };
            const hyphenSource = (0, exports.normalizeArtistId)(trimmedSource);
            validationNodeMap.set(sourceId, newNode);
            validationNodeMap.set(hyphenSource, newNode);
            deduplicatedNodes.push(newNode);
        }
        if (!validationNodeMap.has(targetId)) {
            const rawTarget = typeof link.target === 'string' ? link.target : link.target.id;
            const trimmedTarget = rawTarget.trim();
            const newNode = { id: trimmedTarget, type: 'artist', group: 1, label: trimmedTarget };
            const hyphenTarget = (0, exports.normalizeArtistId)(trimmedTarget);
            validationNodeMap.set(targetId, newNode);
            validationNodeMap.set(hyphenTarget, newNode);
            deduplicatedNodes.push(newNode);
        }
        link.source = validationNodeMap.get(sourceId).id;
        link.target = validationNodeMap.get(targetId).id;
        return true;
    });
    const finalNodes = Array.isArray(deduplicatedNodes) ? deduplicatedNodes : [];
    let mergedLinks = Array.isArray(validLinks) ? validLinks : [];
    // Explicitly merge baseGraph nodes and links to preserve context (Single-Seed enhancement only; strictly bypassed in Tabula Rasa Multi-Seed)
    if (baseGraph && !isMultiSeed) {
        if (baseGraph.nodes) {
            baseGraph.nodes.forEach(baseNode => {
                const normalizedBaseId = (0, exports.normalizeArtistId)(baseNode.id);
                if (!finalNodes.some(n => (0, exports.normalizeArtistId)(n.id) === normalizedBaseId)) {
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
        const seedNorm = (0, exports.normalizeArtistId)(seed);
        let sluggedSeedId = seedNorm;
        // Phase 3 Fix: Natively Slug Seed Nodes using origin data before graph injection
        if (disambiguationHints && disambiguationHints[seedNorm]) {
            const originSlug = (0, exports.extractCountrySlug)(disambiguationHints[seedNorm]);
            if (originSlug && originSlug !== 'global') {
                sluggedSeedId = `${seedNorm}-${originSlug}`;
            }
        }
        const exists = finalNodes.some(n => {
            const nNorm = (0, exports.normalizeArtistId)(n.id);
            const lNorm = (0, exports.normalizeArtistId)(n.label || '');
            return nNorm === sluggedSeedId || lNorm === sluggedSeedId || sluggedSeedId.startsWith(`${nNorm}-`) || sluggedSeedId.startsWith(`${lNorm}-`);
        });
        // Consult disambiguationHints if available to map generated nodes to canonical cache IDs
        let isMapped = false;
        if (!exists && disambiguationHints) {
            const keys = Object.keys(disambiguationHints);
            for (const key of keys) {
                if ((0, exports.normalizeArtistId)(disambiguationHints[key]) === seedNorm) {
                    // We found a hint mapping this seed. Check if the key (e.g. "Turnstile") is in finalNodes
                    const keyNorm = (0, exports.normalizeArtistId)(key);
                    if (finalNodes.some(n => (0, exports.normalizeArtistId)(n.id) === keyNorm)) {
                        isMapped = true;
                        break;
                    }
                }
            }
        }
        if (!exists && !isMapped) {
            finalNodes.push({
                id: sluggedSeedId,
                label: (0, exports.titleCaseArtistId)(seed),
                type: 'artist',
                group: 1
            });
        }
    }
    const finalGraph = (0, exports.normalizeGraphData)({
        nodes: finalNodes,
        links: mergedLinks
    });
    if (data) {
        finalGraph.synthesisRationale = data.synthesisRationale || data.synthesis_rationale;
    }
    return { graphData: finalGraph, apiUsage: finalApiUsage };
};
exports.generateGraphDataBackend = generateGraphDataBackend;
// --- NODE DETAILS SCHEMAS & PROMPTS ---
exports.NODE_DETAILS_SCHEMA = {
    type: genai_1.Type.OBJECT,
    properties: {
        summary: {
            type: genai_1.Type.STRING,
            description: "A scannable bio (approx. 100 words) using Markdown: short paragraphs, bolding for key terms, and bullet points for lists. Focus on style and significance."
        },
        imageUrl: {
            type: genai_1.Type.STRING,
            description: "A direct HTTPS image URL representing the artist or label, extracted from the authoritative genre-appropriate biographical source context (e.g., Wikimedia Commons, Wikipedia, Bandcamp, Discogs, Spotify, or genre-specific archives). Under the Contextual Image Trust Rule, valid images from verified biographical sources are trusted by default."
        },
        members: {
            type: genai_1.Type.ARRAY,
            items: { type: genai_1.Type.STRING },
            description: "List of members and their roles."
        },
        details: {
            type: genai_1.Type.OBJECT,
            properties: {
                artist: {
                    type: genai_1.Type.STRING,
                    description: "The canonical professional display name of the artist or record label. NEVER append geographic acronyms, country names, or regional suffixes (e.g. 'Turnstile', NOT 'Turnstile US'; 'Drug Church', NOT 'Drug Church US')."
                },
                genre: { type: genai_1.Type.STRING },
                origin: { type: genai_1.Type.STRING },
                founded: { type: genai_1.Type.STRING },
                notableArtists: {
                    type: genai_1.Type.ARRAY,
                    items: { type: genai_1.Type.STRING }
                }
            },
            required: ["genre", "origin", "founded", "notableArtists"]
        },
        links: {
            type: genai_1.Type.ARRAY,
            description: "Wikipedia link MUST be index 0 if found. Do NOT include Official Website or Bandcamp entries — those are handled by the client. Only include grounded reference links.",
            items: {
                type: genai_1.Type.OBJECT,
                properties: {
                    site: { type: genai_1.Type.STRING },
                    url: {
                        type: genai_1.Type.STRING,
                        nullable: true,
                        description: "The verified, active URL. MUST be null if the URL cannot be confirmed. Do NOT guess or fabricate."
                    }
                },
                required: ["site"]
            }
        },
        discography: {
            type: genai_1.Type.ARRAY,
            items: {
                type: genai_1.Type.OBJECT,
                properties: {
                    albumName: { type: genai_1.Type.STRING },
                    releaseYear: { type: genai_1.Type.STRING }
                },
                required: ["albumName", "releaseYear"]
            }
        },
        recommendationReason: {
            type: genai_1.Type.STRING,
            description: "Curator insight."
        },
        youtubeVideoId: {
            type: genai_1.Type.STRING,
            nullable: true,
            description: "The YouTube video ID (11-character string) for the best available official video. Priority order: (1) most iconic/popular official music video, (2) high-profile professional full live set on an official channel. MUST NOT be a lyric video, fan-cam bootleg, low-quality upload, non-musical interview clip, or YouTube Shorts (do not return vertical formats or '/shorts/' routes; prioritize landscape videos longer than 2 minutes). Ensure the video belongs strictly to verified artist channels, high-fidelity archives (e.g. Hate5six, KEXP, Audiotree), or standard label uploads. Return null if no high-quality official video can be confirmed."
        },
        youtubeSearchQuery: {
            type: genai_1.Type.STRING,
            description: "A guaranteed-non-null YouTube search query string to use as a fallback when youtubeVideoId cannot be confirmed. Format: '[Artist Name] [genre] [live OR official video]'. Example: 'Turnstile hardcore punk official music video'. Always populate this field. Append semantic terms such as 'full set', 'live performance', or 'official music video' before resolving."
        }
    },
    required: ["summary", "details", "discography", "recommendationReason", "youtubeSearchQuery"]
};
exports.FETCH_NODE_DETAILS_PROMPT_TEMPLATE = `Please provide detailed information for the music entity: "{{nodeIdentifier}}" (type: {{nodeType}}).
    
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
    
    Your task is to generate a JSON object matching this structure precisely:
    {
      "summary": "A scannable bio using Markdown. MUST follow strict Bio Scannability rules: 1. Chunking/Text Segmentation (Max 2-3 short sentences per paragraph). 2. Semantic Splitting (Group by meaning). 3. Formatting (MUST use a bulleted list for stylistic traits/key elements, and bold key terms).",
      "members": ["Name (Role)", ...],
      "details": {
        "artist": "Canonical professional display name of the artist or record label (e.g. 'Turnstile', 'Drug Church'). NEVER append geographic acronyms or country tags (NOT 'Turnstile US', NOT 'Drug Church US').",
        "genre": "The primary music genre(s) as a plain string (e.g. 'Hardcore Punk', 'Post-Hardcore', 'Metalcore'). NEVER return the literal string 'Unknown', 'N/A', or leave this empty — if grounding is inconclusive, infer the genre from the bio summary text and the connected scene context provided.",
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

    WIKIPEDIA ORDERING RULE (MANDATORY):
    If a Wikipedia link is found, it MUST be the very first item (index 0) in the links array.`;
// --- DETAILS HYDRATION MODULES ---
const fetchNodeDetailsBackend = async (node, graphData, seedArtists, originHint, usageCollector) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error("GEMINI_API_KEY is not defined in environment secrets.");
    }
    const ai = new genai_1.GoogleGenAI({
        apiKey,
        httpOptions: { timeout: 300000 } // 5 minutes
    });
    const currentModel = exports.GEMINI_FLASH_MODEL;
    const contextNodes = graphData.links
        .filter(l => (typeof l.source === 'string' ? l.source : l.source.id) === node.id || (typeof l.target === 'string' ? l.target : l.target.id) === node.id)
        .map(l => {
        const sourceId = typeof l.source === 'string' ? l.source : l.source.id;
        const targetId = typeof l.target === 'string' ? l.target : l.target.id;
        return sourceId === node.id ? targetId : sourceId;
    })
        .map(id => graphData.nodes.find(n => n.id === id))
        .filter(Boolean)
        .map(n => `${n.label || n.id} (${n.type})`)
        .slice(0, 10)
        .join(', ');
    const currentDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    let searchArtistName = (0, executeCurationPipeline_1.stripCountrySlug)(node.id);
    if (node.label && node.label !== node.id) {
        searchArtistName = node.label;
    }
    let prompt = exports.FETCH_NODE_DETAILS_PROMPT_TEMPLATE
        .replace('{{nodeIdentifier}}', searchArtistName)
        .replace('{{nodeType}}', node.type)
        .replace('{{contextNodes}}', contextNodes)
        .replace(/{{currentDate}}/g, currentDate);
    if (originHint) {
        prompt = prompt.replace(/{{#if originHint}}[\s\S]*?{{originHint}}[\s\S]*?{{\/if}}/g, `- **Origin Hint (CRITICAL):** Details for: ${originHint}.`);
    }
    else {
        prompt = prompt.replace(/{{#if originHint}}[\s\S]*?{{\/if}}/g, '');
    }
    let details = null;
    let attempts = 0;
    const MAX_ATTEMPTS = 3;
    let lastResponse = null;
    const sanitizeBioText = (rawText) => {
        if (!rawText || typeof rawText !== 'string')
            return '';
        let text = rawText.trim();
        const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
        if (match && match[1]) {
            text = match[1].trim();
        }
        else {
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
        text = text.replace(/\[\s*\d+(?:\s*,\s*\d+)*\s*\]/g, '')
            .replace(/\(\s*\d+(?:\s*,\s*\d+)*\s*\)/g, '')
            .replace(/\[\s*(?:cite|citation)[^\]]*\]/gi, '')
            .replace(/""/g, '')
            .trim();
        return text;
    };
    while (attempts < MAX_ATTEMPTS && !details) {
        try {
            const response = await Promise.race([
                ai.models.generateContent({
                    model: currentModel,
                    contents: prompt,
                    config: {
                        systemInstruction: "You are a late-night record curator — the kind of person who pulls an obscure 7\" from a crate at 2am and traces exactly why it matters. Your tone is knowledgeable, vivid, and deeply immersed in musical history and counterculture scenes. Return detailed, factual, and scene-accurate profile information for the given musical entity matching the schema. No markdown formatting outside strings. NEGATIVE CONSTRAINT: NEVER use em-dashes (—) or long hyphens for dramatic effect or clause separation. Use standard editorial punctuation.",
                        thinkingConfig: { thinkingLevel: genai_1.ThinkingLevel.LOW },
                        responseMimeType: "application/json",
                        responseSchema: exports.NODE_DETAILS_SCHEMA
                    }
                }),
                new Promise((_, reject) => setTimeout(() => reject(new Error('AbortError: Timeout exceeded')), 55000))
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
            const cleanedJsonText = (0, exports.extractCleanJsonString)(jsonText);
            let parsedCandidate = null;
            try {
                parsedCandidate = JSON.parse(cleanedJsonText);
            }
            catch (parseError) {
                const repaired = repairJson(cleanedJsonText);
                try {
                    parsedCandidate = JSON.parse(repaired);
                }
                catch (repairError) {
                    throw new Error("Invalid data format from details service (JSON parse & repair failed; prose fallback forbidden under Rule 40).");
                }
            }
            const isLabelNode = String(node.type || '').toLowerCase() === 'label';
            const candidateBio = sanitizeBioText(parsedCandidate?.summary || parsedCandidate?.bio || "");
            const candidateReason = String(parsedCandidate?.recommendationReason || '').trim();
            const hasValidDiscography = isLabelNode || (Array.isArray(parsedCandidate?.discography) && parsedCandidate.discography.length > 0);
            if (!candidateBio ||
                candidateBio.length <= 50 ||
                !candidateReason ||
                candidateReason.toLowerCase().includes('synthesised from live cultural archives') ||
                !hasValidDiscography) {
                throw new Error(`Invalid data format from details service: incomplete structured payload for ${node.id} ` +
                    `(bioLen=${candidateBio.length}, hasReason=${!!candidateReason}, discographyLen=${Array.isArray(parsedCandidate?.discography) ? parsedCandidate.discography.length : 0}).`);
            }
            details = parsedCandidate;
        }
        catch (error) {
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
    const sanitizeString = (str) => {
        if (typeof str !== 'string')
            return "";
        return str.replace(/\[\s*\d+(?:\s*,\s*\d+)*\s*\]/g, '')
            .replace(/\(\s*\d+(?:\s*,\s*\d+)*\s*\)/g, '')
            .replace(/\[\s*(?:cite|citation)[^\]]*\]/gi, '')
            .replace(/""/g, '')
            .trim();
    };
    const sanitisedLinks = (details.links || []).map((l) => ({
        ...l,
        url: (l.url && typeof l.url === 'string' && l.url.trim().startsWith('http'))
            ? l.url.trim()
            : null
    }));
    const hydratedDetails = {
        ...details,
        summary: sanitizeBioText(details.summary || "No summary available (AI response was truncated)."),
        details: (() => {
            const d = details.details || {};
            const sanitizeMetaField = (val) => {
                if (!val)
                    return "";
                const t = val.trim().toLowerCase();
                if (t === "unknown" || t === "n/a" || t === "none" || t === "not available")
                    return "";
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
        discography: (details.discography || []).map((album) => ({
            albumName: sanitizeString(album?.albumName),
            releaseYear: sanitizeString(album?.releaseYear)
        })),
        members: (details.members || []).map(sanitizeString),
        recommendationReason: sanitizeString(details.recommendationReason || ""),
        youtubeVideoId: (0, exports.extractValidYoutubeId)(details.youtubeVideoId),
        imageUrl: (0, exports.sanitizeImageUrl)(details.imageUrl, sanitizeString),
        youtubeSearchQuery: typeof details.youtubeSearchQuery === 'string' && details.youtubeSearchQuery.trim().length > 0
            ? sanitizeString(details.youtubeSearchQuery.trim())
            : `${details.details?.artist || details.artist || ''} ${details.details?.genre || details.genre || ''} official music video`.trim(),
    };
    if (!hydratedDetails.details)
        hydratedDetails.details = {};
    const groundingChunks = lastResponse?.candidates?.[0]?.groundingMetadata?.groundingChunks;
    if (groundingChunks && Array.isArray(groundingChunks)) {
        const uniqueLinks = new Map();
        groundingChunks.forEach((chunk) => {
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
exports.fetchNodeDetailsBackend = fetchNodeDetailsBackend;
const scrapeVideoIdBackend = async (artistName, artistId) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey)
        return null;
    const ai = new genai_1.GoogleGenAI({
        apiKey,
        httpOptions: { timeout: 300000 } // 5 minutes
    });
    const currentModel = exports.GEMINI_FLASH_MODEL;
    const prompt = `What is the best official 11-character YouTube video ID for '${artistName}'?
Return ONLY the 11-character video ID as a plain string. Do not include any JSON, quotes, explanations, markdown, or other text. If you are not highly confident, return "null".`;
    try {
        const response = await Promise.race([
            ai.models.generateContent({
                model: currentModel,
                contents: prompt,
                config: {
                    thinkingConfig: { thinkingLevel: genai_1.ThinkingLevel.MINIMAL },
                    maxOutputTokens: 200,
                }
            }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('AbortError: Timeout exceeded')), 12000))
        ]);
        const text = response.text?.trim();
        if (!text)
            return null;
        const id = (0, exports.extractValidYoutubeId)(text);
        return id || null;
    }
    catch (err) {
        if (err.message && err.message.includes('AbortError')) {
            console.warn(`[scrapeVideoIdBackend] 12s timeout exceeded for ${artistName}. Returning null.`);
            return null;
        }
        console.error(`[scrapeVideoIdBackend] Scrape failed for ${artistName}:`, err);
        return null;
    }
};
exports.scrapeVideoIdBackend = scrapeVideoIdBackend;
const checkVideoPlayability = async (videoId) => {
    if (!videoId || videoId.length !== 11)
        return false;
    try {
        const url = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), 5000);
        const res = await fetch(url, { method: 'HEAD', signal: controller.signal });
        clearTimeout(id);
        return res.status === 200;
    }
    catch (err) {
        console.error(`[Playability Check] Failed for ${videoId}:`, err);
        return true;
    }
};
exports.checkVideoPlayability = checkVideoPlayability;
// Helper: Tokenizes and checks exact whole-word boundary
const containsWord = (source, token) => {
    if (!source || !token)
        return false;
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`\\b${escaped}\\b`, 'i').test(source);
};
// Expanded Taxonomy Matrix with broad umbrella roots and extreme subgenres
const GENRE_TAXONOMY = {
    'metal': [
        'metal', 'heavy metal', 'death metal', 'black metal', 'doom metal',
        'deathcore', 'metalcore', 'mathcore', 'grindcore', 'cybergrind',
        'powerviolence', 'sludge', 'crust', 'thrash', 'groove metal', 'nu metal',
        'extreme metal', 'industrial metal', 'progressive metal'
    ],
    'punk': [
        'punk', 'hardcore', 'hardcore punk', 'post hardcore', 'emo',
        'skate punk', 'pop punk', 'crust punk', 'd beat', 'anarcho punk',
        'grindcore', 'powerviolence', 'screamo', 'melodic hardcore'
    ],
    'rock': [
        'rock', 'alternative', 'indie', 'grunge', 'post rock',
        'garage rock', 'psychedelic', 'noise rock', 'hard rock', 'space rock',
        // Umbrella bridge: iTunes frequently tags extreme metal/punk as generic 'Rock'
        'grindcore', 'punk', 'metal', 'hardcore'
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
    'pop': ['pop', 'synthpop', 'electropop', 'k pop', 'indie pop'],
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
const extractDistinctiveTokens = (title) => {
    return (title || '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(word => word.length >= 3 && !ALBUM_STOPWORDS.has(word));
};
const normalizeAlbumTitle = (title) => {
    return (title || '')
        .toLowerCase()
        .replace(/\s*[\(\[][^\)\]]*[\)\]]/g, '') // Strips (Deluxe Edition), [Remastered], etc.
        .replace(/\s+-\s+(ep|single)$/i, '') // Strips " - EP", " - Single"
        .replace(/&/g, 'and')
        .replace(/[^a-z0-9]/g, '') // Strips punctuation and spaces
        .trim();
};
const titlesMatchFuzzy = (itunesTitle, zceneTitle, itunesYear, zceneYear) => {
    const normItunes = normalizeAlbumTitle(itunesTitle);
    const normZcene = normalizeAlbumTitle(zceneTitle);
    if (!normItunes || !normZcene)
        return false;
    // 1. Exact normalized match
    if (normItunes === normZcene)
        return true;
    // 2. Substring containment (minimum 8 characters to prevent spurious collisions)
    if (normItunes.length >= 8 && normZcene.length >= 8) {
        if (normItunes.includes(normZcene) || normZcene.includes(normItunes))
            return true;
    }
    // Release year correlation check (within +/- 1 year)
    const yearMatch = (itunesYear && zceneYear) ? Math.abs(itunesYear - zceneYear) <= 1 : false;
    // 3. Prefix match: minimum 10 chars, or 6 chars if supported by release year correlation
    const minPrefixLen = yearMatch ? 6 : 10;
    if (normItunes.length >= minPrefixLen && normZcene.length >= minPrefixLen) {
        const pLen = Math.min(normItunes.length, normZcene.length, 12);
        if (normItunes.slice(0, pLen) === normZcene.slice(0, pLen))
            return true;
    }
    // 4. Distinctive token overlap
    const itunesTokens = extractDistinctiveTokens(itunesTitle);
    const zceneTokens = extractDistinctiveTokens(zceneTitle);
    const sharedTokens = itunesTokens.filter(t => zceneTokens.includes(t));
    if (sharedTokens.length >= 2)
        return true;
    if (sharedTokens.length >= 1 && yearMatch && sharedTokens.some(t => t.length >= 6))
        return true;
    return false;
};
const evaluateGenreMatch = (itunesGenreRaw, zceneGenreRaw, summaryRaw) => {
    const normalizeGenre = (g) => (g || "").toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
    const itunesGenre = normalizeGenre(itunesGenreRaw);
    const zceneGenre = normalizeGenre(zceneGenreRaw);
    if (!itunesGenre)
        return false;
    // 1. Core keyword intersection using whole-word boundaries
    const zceneWords = zceneGenre.split(' ').filter(w => w.length > 2);
    const itunesWords = itunesGenre.split(' ').filter(w => w.length > 2);
    const keywordMatch = zceneWords.some(w => containsWord(itunesGenre, w)) ||
        itunesWords.some(w => containsWord(zceneGenre, w));
    if (keywordMatch)
        return true;
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
        const summaryNorm = normalizeGenre(summaryRaw);
        const summaryMatch = itunesWords.some(w => containsWord(summaryNorm, w));
        if (summaryMatch)
            return true;
    }
    return false;
};
const fetchArtistArtwork = async (artistId) => {
    try {
        const albumUrl = `https://itunes.apple.com/lookup?id=${artistId}&entity=album&limit=1`;
        const albumController = new AbortController();
        const albumTimeout = setTimeout(() => albumController.abort(), 2500);
        try {
            const albumRes = await fetch(albumUrl, { signal: albumController.signal });
            if (albumRes.ok) {
                const albumData = await albumRes.json();
                const album = albumData.results?.find((r) => r.wrapperType === 'collection');
                if (album && album.artworkUrl100) {
                    return album.artworkUrl100.replace('100x100bb', '600x600bb');
                }
            }
        }
        finally {
            clearTimeout(albumTimeout);
        }
    }
    catch (err) {
        // Graceful fallback to null
    }
    return null;
};
const verifyCandidateDiscography = async (candidate, cleanArtistName, discography) => {
    const normArtist = (cleanArtistName || "").toLowerCase().replace(/[^a-z0-9]/g, '');
    const validZceneAlbums = [];
    for (const item of discography) {
        const raw = item.albumName || '';
        const norm = normalizeAlbumTitle(raw);
        if (norm.length < 3)
            continue;
        if (GENERIC_ALBUM_TITLES.has(raw.toLowerCase().trim()))
            continue;
        if (norm === normArtist)
            continue; // Exclude self-titled albums from sole proof
        const parsedYear = item.releaseYear ? parseInt(item.releaseYear, 10) : undefined;
        validZceneAlbums.push({
            raw,
            norm,
            year: (parsedYear && !isNaN(parsedYear)) ? parsedYear : undefined
        });
    }
    if (validZceneAlbums.length === 0) {
        return { candidate, matchCount: 0, matchedTitles: [], bestArtwork: null };
    }
    try {
        const lookupUrl = `https://itunes.apple.com/lookup?id=${candidate.artistId}&entity=album&limit=200`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 2500);
        try {
            const res = await fetch(lookupUrl, { signal: controller.signal });
            if (res.ok) {
                const data = await res.json();
                const albums = (data.results || []).filter((r) => r.wrapperType === 'collection' && String(r.artistId) === String(candidate.artistId));
                // Deduplicate matched albums by unique Zcene title to prevent Deluxe/Remaster inflation
                const matchedZceneTitles = new Set();
                let bestArtwork = null;
                for (const alb of albums) {
                    const albTitle = alb.collectionName || '';
                    const normItunes = normalizeAlbumTitle(albTitle);
                    if (normItunes.length < 3)
                        continue;
                    if (GENERIC_ALBUM_TITLES.has(albTitle.toLowerCase().trim()))
                        continue;
                    if (normItunes === normArtist)
                        continue; // Exclude self-titled albums on candidate side
                    const albYear = alb.releaseDate ? new Date(alb.releaseDate).getFullYear() : undefined;
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
                    bestArtwork
                };
            }
        }
        finally {
            clearTimeout(timeout);
        }
    }
    catch (err) {
        // Graceful fallback to 0 matches
    }
    return { candidate, matchCount: 0, matchedTitles: [], bestArtwork: null };
};
const isQualifyingMatch = (verification) => {
    if (verification.matchCount === 0)
        return false;
    // Multi-word (>=2 words) or >=8 chars title qualifies on 1 match
    const hasStrongTitle = verification.matchedTitles.some(title => {
        const words = title.trim().split(/\s+/);
        return words.length >= 2 || title.length >= 8;
    });
    if (hasStrongTitle)
        return true;
    // Otherwise require at least 2 distinct matched titles
    return verification.matchCount >= 2;
};
const scrapeImageUrlBackend = async (artistName, type, genre, summary, origin, discography) => {
    // Strategy: High-Speed Deterministic iTunes API (Artists Only)
    if (type === 'label') {
        return null;
    }
    // Defense-in-depth: Ensure artistName is human-readable and clean of country slug artifacts
    let cleanArtistName = (0, executeCurationPipeline_1.stripCountrySlug)(artistName).trim();
    if (cleanArtistName.includes('-') && !cleanArtistName.includes(' ')) {
        cleanArtistName = (0, exports.titleCaseArtistId)(cleanArtistName);
    }
    const normName = (name) => (name || "").toLowerCase().replace(/[^a-z0-9]/g, '');
    // --- Tier 1: Base Query & Strict Taxonomy Match ---
    let baseExactMatches = [];
    try {
        const itunesUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(cleanArtistName)}&entity=musicArtist&limit=20`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);
        try {
            const res = await fetch(itunesUrl, { signal: controller.signal });
            if (res.ok) {
                const data = await res.json();
                const targetNorm = normName(cleanArtistName);
                baseExactMatches = (data.results || []).filter((r) => normName(r.artistName) === targetNorm);
            }
        }
        finally {
            clearTimeout(timeoutId);
        }
    }
    catch (err) {
        console.warn(`[scrapeImageUrlBackend] iTunes search failed for "${cleanArtistName}":`, err.message);
    }
    if (baseExactMatches.length > 0) {
        const strictMatches = baseExactMatches.filter(r => evaluateGenreMatch(r.primaryGenreName, genre, summary));
        if (strictMatches.length === 1) {
            const winner = strictMatches[0];
            const artwork = await fetchArtistArtwork(winner.artistId);
            if (artwork) {
                console.log(`[scrapeImageUrlBackend] [Tier 1 Hit] "${cleanArtistName}" verified via strict taxonomy overlap. (iTunes ID: ${winner.artistId}, Genre: '${winner.primaryGenreName}')`);
                return artwork;
            }
        }
        else if (strictMatches.length > 1) {
            console.warn(`[scrapeImageUrlBackend] [Tier 1 Ambiguity] "${cleanArtistName}" has ${strictMatches.length} candidates matching taxonomy [${strictMatches.map(m => `'${m.primaryGenreName}'#${m.artistId}`).join(', ')}]. Escalating to Tier 3.`);
        }
        else {
            console.warn(`[scrapeImageUrlBackend] [Tier 1 Blocked] "${cleanArtistName}" genre mismatch. Zcene: '${genre}', iTunes: [${baseExactMatches.map(m => `'${m.primaryGenreName}'#${m.artistId}`).join(', ')}]. Escalating to Tier 2/3.`);
        }
    }
    // --- Tier 2: Geographic Fallback (e.g., "Darko US") ---
    let geoExactMatches = [];
    if (origin && origin.trim() !== '') {
        let suffix = (0, exports.extractCountrySlug)(origin).toUpperCase();
        if (suffix === 'GB')
            suffix = 'UK';
        if (suffix !== 'GLOBAL') {
            const fallbackName = `${cleanArtistName} ${suffix}`;
            try {
                const geoUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(fallbackName)}&entity=musicArtist&limit=20`;
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 4000);
                try {
                    const res = await fetch(geoUrl, { signal: controller.signal });
                    if (res.ok) {
                        const data = await res.json();
                        const targetGeoNorm = normName(fallbackName);
                        geoExactMatches = (data.results || []).filter((r) => normName(r.artistName) === targetGeoNorm);
                    }
                }
                finally {
                    clearTimeout(timeoutId);
                }
            }
            catch (err) {
                console.warn(`[scrapeImageUrlBackend] Geographic iTunes search failed for "${fallbackName}":`, err.message);
            }
            if (geoExactMatches.length > 0) {
                const geoStrictMatches = geoExactMatches.filter(r => evaluateGenreMatch(r.primaryGenreName, genre, summary));
                if (geoStrictMatches.length === 1) {
                    const winner = geoStrictMatches[0];
                    const artwork = await fetchArtistArtwork(winner.artistId);
                    if (artwork) {
                        console.log(`[scrapeImageUrlBackend] [Tier 2 Hit] "${cleanArtistName}" verified via geographic fallback "${fallbackName}". (iTunes ID: ${winner.artistId}, Genre: '${winner.primaryGenreName}')`);
                        return artwork;
                    }
                }
            }
            else {
                console.log(`[scrapeImageUrlBackend] [Tier 2 Miss] Geographic query "${fallbackName}" returned 0 exact matches.`);
            }
        }
    }
    // --- Tier 3: Discography Tie-Breaker & Verification ---
    // Combine all exact candidates, deduplicated by artistId
    const allCandidatesMap = new Map();
    for (const c of [...baseExactMatches, ...geoExactMatches]) {
        allCandidatesMap.set(String(c.artistId), c);
    }
    const allCandidates = Array.from(allCandidatesMap.values());
    if (allCandidates.length > 0 && discography && discography.length > 0) {
        // Sort candidates: taxonomy-matching candidates first
        allCandidates.sort((a, b) => {
            const aMatch = evaluateGenreMatch(a.primaryGenreName, genre, summary) ? 1 : 0;
            const bMatch = evaluateGenreMatch(b.primaryGenreName, genre, summary) ? 1 : 0;
            return bMatch - aMatch;
        });
        // Cap to top 5 candidates to guarantee zero Cloud Function timeout risk
        const cappedCandidates = allCandidates.slice(0, 5);
        console.log(`[scrapeImageUrlBackend] [Tier 3 Escalation] "${cleanArtistName}": Evaluating ${cappedCandidates.length} candidate(s) against ${discography.length} known album(s).`);
        // Bounded parallel lookup via Promise.allSettled (max 2500ms total latency)
        const verificationResults = await Promise.allSettled(cappedCandidates.map(cand => verifyCandidateDiscography(cand, cleanArtistName, discography)));
        const verifiedWinners = [];
        for (const res of verificationResults) {
            if (res.status === 'fulfilled' && isQualifyingMatch(res.value)) {
                verifiedWinners.push(res.value);
            }
        }
        if (verifiedWinners.length === 1) {
            const winner = verifiedWinners[0];
            let artwork = winner.bestArtwork;
            if (!artwork) {
                artwork = await fetchArtistArtwork(winner.candidate.artistId);
            }
            if (artwork) {
                console.log(`[scrapeImageUrlBackend] [Tier 3 Hit] "${cleanArtistName}" (iTunes ID: ${winner.candidate.artistId}) verified via ${winner.matchCount} album matches: [${winner.matchedTitles.map(t => `"${t}"`).join(', ')}]`);
                return artwork;
            }
        }
        else if (verifiedWinners.length > 1) {
            console.warn(`[scrapeImageUrlBackend] [Tier 3 Ambiguity] "${cleanArtistName}" has ${verifiedWinners.length} candidates matching discography. Aborting to prevent homonym pollution.`);
        }
        else {
            console.warn(`[scrapeImageUrlBackend] [Tier 3 Miss] "${cleanArtistName}": 0 candidates matched discography.`);
        }
    }
    // --- Tier 4: Reject Unverified Lone Wolves / Fail-Fast ---
    console.warn(`[scrapeImageUrlBackend] [Tier 4 Reject] "${cleanArtistName}" failed all verification tiers. Rejecting unverified asset. Returning not-found.`);
    return null;
};
exports.scrapeImageUrlBackend = scrapeImageUrlBackend;
const generateSemanticLinkWeights = async (apiKey, detailsCacheEntries, links, usageCollector) => {
    const currentModel = exports.GEMINI_FLASH_MODEL;
    const ai = new genai_1.GoogleGenAI({ apiKey, httpOptions: { timeout: 300000 } });
    // Map cache to lightweight context
    const evaluationContext = detailsCacheEntries.map(entry => {
        const id = entry[0];
        const details = entry[1];
        return {
            id,
            genre: details?.details?.genre || "Unknown",
            bio: details?.summary || details?.bio || ""
        };
    });
    const prompt = `Evaluate the provided artist biographies. For each provided link, output a semantic weight between 0.1 and 1.0 representing the strength of their musical or cultural connection.

Context:
${JSON.stringify(evaluationContext)}

Links to evaluate:
${JSON.stringify(links)}
`;
    const responseSchema = {
        type: genai_1.Type.ARRAY,
        description: "An array of evaluated links with assigned semantic weights.",
        items: {
            type: genai_1.Type.OBJECT,
            properties: {
                source: {
                    type: genai_1.Type.STRING,
                    description: "The exact source artist ID provided in the input."
                },
                target: {
                    type: genai_1.Type.STRING,
                    description: "The exact target artist ID provided in the input."
                },
                weight: {
                    type: genai_1.Type.NUMBER,
                    description: "A float between 0.1 (loose relation) and 1.0 (core defining connection)."
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
                thinkingConfig: { thinkingLevel: genai_1.ThinkingLevel.MINIMAL },
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
        if (!text)
            return [];
        const parsed = JSON.parse(text);
        return parsed;
    }
    catch (error) {
        console.error("[generateSemanticLinkWeights] Failed to generate link weights:", error);
        return [];
    }
};
exports.generateSemanticLinkWeights = generateSemanticLinkWeights;
//# sourceMappingURL=curatorService.js.map