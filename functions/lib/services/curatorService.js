"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateGraphDataBackend = exports.GENERATE_GRAPH_PROMPT_TEMPLATE = exports.GENERATE_MULTI_SEED_GRAPH_PROMPT_TEMPLATE = exports.GENERATE_GRAPH_WITH_CONTEXT_PROMPT_TEMPLATE = exports.GRAPH_RESPONSE_SCHEMA = exports.extractArtistSubGraph = exports.normalizeGraphData = exports.titleCaseArtistId = exports.normalizeArtistId = void 0;
const genai_1 = require("@google/genai");
// --- UTILITIES PORTED FROM artistCacheService.ts ---
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
const normalizeGraphData = (graph) => {
    if (!graph || !graph.nodes)
        return graph;
    const idMap = new Map();
    const normalizedNodes = graph.nodes.map(node => {
        const originalId = node.id;
        let normalizedId = originalId.trim();
        if (node.type === 'artist') {
            normalizedId = (0, exports.normalizeArtistId)(originalId);
        }
        else {
            normalizedId = normalizedId.toLowerCase();
        }
        idMap.set(originalId, normalizedId);
        idMap.set(originalId.toLowerCase(), normalizedId);
        idMap.set((0, exports.normalizeArtistId)(originalId), normalizedId);
        let label = node.label || originalId.trim();
        if (node.type === 'artist') {
            label = (0, exports.titleCaseArtistId)(label);
        }
        return {
            ...node,
            id: normalizedId,
            label
        };
    });
    const normalizedLinks = (graph.links || []).map(link => {
        const sourceId = typeof link.source === 'string' ? link.source : link.source.id;
        const targetId = typeof link.target === 'string' ? link.target : link.target.id;
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
    const isArtistIdMatch = (a, b) => {
        const na = (0, exports.normalizeArtistId)(a);
        const nb = (0, exports.normalizeArtistId)(b);
        return na === nb || na.startsWith(nb + '-') || nb.startsWith(na + '-');
    };
    const artistNode = fullGraph.nodes.find(n => n.type === 'artist' && ((0, exports.normalizeArtistId)(n.id) === artistNameNorm || isArtistIdMatch(n.id, artistName)));
    if (!artistNode) {
        return { nodes: [], links: [] };
    }
    const originalArtistNodeId = artistNode.id;
    const artistNodeIdNorm = (0, exports.normalizeArtistId)(originalArtistNodeId);
    const resolveId = (endpoint) => typeof endpoint === 'string' ? endpoint : endpoint.id;
    const peerArtistIds = new Set();
    (fullGraph.links || []).forEach(link => {
        const s = resolveId(link.source);
        const t = resolveId(link.target);
        const sNorm = (0, exports.normalizeArtistId)(s);
        const tNorm = (0, exports.normalizeArtistId)(t);
        if (sNorm === artistNodeIdNorm || tNorm === artistNodeIdNorm) {
            const otherId = sNorm === artistNodeIdNorm ? t : s;
            const otherNorm = (0, exports.normalizeArtistId)(otherId);
            const otherNode = fullGraph.nodes.find(n => (0, exports.normalizeArtistId)(n.id) === otherNorm);
            if (otherNode && otherNode.type === 'artist' && !seedsNorm.has(otherNorm)) {
                peerArtistIds.add(otherNode.id);
            }
        }
    });
    const keptArtistIds = new Set([originalArtistNodeId]);
    peerArtistIds.forEach(id => keptArtistIds.add(id));
    const keptArtistIdsNorm = new Set(Array.from(keptArtistIds).map(id => (0, exports.normalizeArtistId)(id)));
    const metadataNodeIds = new Set();
    (fullGraph.links || []).forEach(link => {
        const s = resolveId(link.source);
        const t = resolveId(link.target);
        const sNorm = (0, exports.normalizeArtistId)(s);
        const tNorm = (0, exports.normalizeArtistId)(t);
        const sIsKeptArtist = keptArtistIdsNorm.has(sNorm);
        const tIsKeptArtist = keptArtistIdsNorm.has(tNorm);
        if (sIsKeptArtist || tIsKeptArtist) {
            const otherId = sIsKeptArtist ? t : s;
            const otherLower = otherId.trim().toLowerCase();
            const otherNode = fullGraph.nodes.find(n => n.id.trim().toLowerCase() === otherLower);
            if (otherNode && otherNode.type !== 'artist') {
                metadataNodeIds.add(otherNode.id);
            }
        }
    });
    const keptNodeIds = new Set();
    keptNodeIds.add(originalArtistNodeId);
    peerArtistIds.forEach(id => keptNodeIds.add(id));
    metadataNodeIds.forEach(id => keptNodeIds.add(id));
    const keptNodeIdsLower = new Set(Array.from(keptNodeIds).map(id => id.trim().toLowerCase()));
    const keptNodeIdsNorm = new Set(Array.from(keptNodeIds).map(id => (0, exports.normalizeArtistId)(id)));
    const ownNodes = fullGraph.nodes.filter(n => {
        const norm = (0, exports.normalizeArtistId)(n.id);
        const lower = n.id.trim().toLowerCase();
        return keptNodeIdsNorm.has(norm) || keptNodeIdsLower.has(lower);
    });
    const ownLinks = (fullGraph.links || []).filter(link => {
        const s = resolveId(link.source);
        const t = resolveId(link.target);
        const sNorm = (0, exports.normalizeArtistId)(s);
        const tNorm = (0, exports.normalizeArtistId)(t);
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
exports.extractArtistSubGraph = extractArtistSubGraph;
// --- JSON REPAIR PORTED FROM geminiService.ts ---
const repairJson = (json) => {
    if (!json)
        return "";
    let stack = [];
    let inString = false;
    let escaped = false;
    const startIdx = json.search(/[{[]/);
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
                        description: "A group identifier for colouring or categorisation, usually based on the initial seed artists."
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
                    context: {
                        type: genai_1.Type.STRING,
                        description: "A brief, 3-7 word explanation of the relationship in present tense, e.g., 'releases music on Flatspot Records' or 'formed in San Jose, California' or 'influenced musical style'."
                    }
                },
                required: ["source", "target", "value", "context"]
            }
        },
        synthesis_rationale: {
            type: genai_1.Type.STRING,
            description: "A scannable reasoning chain (approx. 100-150 words) using Markdown: short paragraphs (separated by double newlines), bolding for key terms, and bullet points for lists. Detail how the seeds' acoustic, geographic, and chronological dimensions intersect to yield the generated connections."
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
        5.  It is absolutely critical that each 'founded' node is linked ONLY to the correct artist node who was founded in that year.
        6.  LINK RELATIONSHIP CONTEXT: Each link in the 'links' array MUST include a 'context' string explaining the connection concisely (e.g. 'founded in 1994' or 'is a sub-genre of' or 'signed to XL Recordings' or 'is related to'). Keep the context to a brief 3-7 words in present tense.
        7.  SYNTHESIS RATIONALE (MANDATORY): You MUST output the step-by-step reasoning chain of your analysis in the 'synthesis_rationale' field of the JSON object. The text MUST be scannable and formatted using Markdown: use short paragraphs (separated by double newlines), bolding for key terms, and bullet points for lists. Explain in detail how the seeds' acoustic, geographic, and chronological dimensions intersect to yield the generated connections.
        8.  JSON SCHEMA: The output must be a single, valid JSON object with 'nodes', 'links' arrays and a 'synthesis_rationale' string matching the schema.
        
        STRUCTURAL ONLY: You MUST NOT generate or include any biographies, summaries, member lists, discographies, or detailed profile metadata for the artists. The response must strictly contain only structural layout nodes (id, type, group), connection links (source, target, value, context), and the synthesis_rationale string.
        
        ABSOLUTELY CRITICAL FINAL CHECK: Before you output the JSON, verify that for EVERY SINGLE OBJECT in the 'links' array, the value of its 'source' property and the value of its 'target' property perfectly match an 'id' from an object in EITHER the provided existing nodes list OR your new 'nodes' array. THERE MUST BE NO ORPHANED LINKS. If you create a link with a 'source' or 'target' ID (e.g., "Arista Records"), you MUST ALSO define a node with that exact same 'id' (e.g., { "id": "Arista Records", "type": "label", ... }). Do not invent connections to nodes you haven't defined. This is a strict, mandatory requirement.
        
        IMPORTANT: Ensure that any double quotes within string values are properly escaped (e.g., "Artist \\"Name\\""). The final output must be perfectly valid JSON. Your entire response MUST be ONLY the raw JSON object, without any surrounding text, explanations, or markdown code fences.`;
exports.GENERATE_MULTI_SEED_GRAPH_PROMPT_TEMPLATE = `Given the following list of seed artists: {{artists}}.
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
7.  SYNTHESIS RATIONALE (MANDATORY): You MUST output the step-by-step reasoning chain of your co-equal cross-analysis in the 'synthesis_rationale' field of the JSON object. The text MUST be scannable and formatted using Markdown: use short paragraphs (separated by double newlines), bolding for key terms, and bullet points for lists. Explain in detail how the seeds' acoustic, geographic, and chronological dimensions intersect to yield the generated connections.
8.  JSON SCHEMA: The output must be a single, valid JSON object with 'nodes', 'links' arrays and a 'synthesis_rationale' string matching the schema.

STRUCTURAL ONLY: You MUST NOT generate or include any biographies, summaries, member lists, discographies, or detailed profile metadata for the artists. The response must strictly contain only structural layout nodes (id, type, group), connection links (source, target, value, context), and the synthesis_rationale string.

ABSOLUTELY CRITICAL: Ensure NO ORPHANED LINKS. Every source/target in the 'links' array must map to a node in the 'nodes' array.

Your entire response MUST be ONLY the raw JSON object, without any surrounding text or markdown code fences.`;
exports.GENERATE_GRAPH_PROMPT_TEMPLATE = `Given the following list of seed artists: {{artists}}. Generate a music family tree connecting them. The output must be a single, valid JSON object with keys: 'nodes', 'links', and 'synthesis_rationale'.
'nodes' should be an array of objects, each with 'id', 'type', and 'group'. The 'type' can be 'artist', 'genre', 'label', 'country', or 'founded'.
'links' should be an array of objects, each with 'source', 'target', 'value', and 'context' string describing the nature of their relationship.

Follow these rules precisely:
1.  CANONICAL NAMING: For ALL nodes, use the canonical, professional spelling and capitalization as recognized by the music industry. For example, use "Radiohead" even if the seed provided was "radiohead", and "blink-182" with a lowercase 'b' and hyphen if that is its official name.
2.  MANDATORY: You MUST create an 'artist' node for EVERY seed artist provided in the list: {{artists}}. Assign a unique 'group' number for each seed artist.
3.  For each seed artist, find and add nodes for their primary genre, record label, country of origin, and the year they were formed/founded (YYYY). The 'id' for the year node must be the 4-digit year (e.g. "1994") and its type must be 'founded'.
4.  In addition, find and add UP TO 12 NEW related artists that are musically connected to the seed artists. For these NEW artists, you MUST also identify and create their respective genre, label, country, and especially their 'founded' year nodes (YYYY) to ensure the spiderweb is rich with chronological data. ONLY include artists that strictly meet any provided discovery filters.
5.  For all artists (seed and related), create links connecting them to their respective genre, label, country, and founded year nodes. Also create links between related artists. All direct connections of a seed artist should share their 'group' number. Each link MUST include a 'context' string explaining the relationship (e.g., 'releases music on XL Recordings' or 'founded in 1985' or 'is a genre of'). Keep the context to a brief 3-7 words in present tense.
6.  CRITICAL: Each 'founded' node MUST be linked ONLY to the correct artist who was founded in that year.
7.  SYNTHESIS RATIONALE (MANDATORY): You MUST output the step-by-step reasoning chain of your analysis in the 'synthesis_rationale' field of the JSON object. The text MUST be scannable and formatted using Markdown: use short paragraphs (separated by double newlines), bolding for key terms, and bullet points for lists. Explain in detail how the seeds' acoustic, geographic, and chronological dimensions intersect to yield the generated connections.
8.  JSON SCHEMA: The output must be a single, valid JSON object with 'nodes', 'links' arrays and a 'synthesis_rationale' string matching the schema.

STRUCTURAL ONLY: You MUST NOT generate or include any biographies, summaries, member lists, discographies, or detailed profile metadata for the artists. The response must strictly contain only structural layout nodes (id, type, group), connection links (source, target, value, context), and the synthesis_rationale string.
        
ABSOLUTELY CRITICAL FINAL CHECK: Before you output the JSON, verify that for EVERY SINGLE OBJECT in the 'links' array, the value of its 'source' property and the value of its 'target' property perfectly match an 'id' from an object in the 'nodes' array. THERE MUST BE NO ORPHANED LINKS. If you create a link with a 'source' or 'target' ID (e.g., "Arista Records"), you MUST ALSO define a node with that exact same 'id' (e.g., { "id": "Arista Records", "type": "label", ... }). Do not invent connections to nodes you haven't defined. This is a architecture requirement.

IMPORTANT: Ensure that any double quotes within string values are properly escaped (e.g., "Artist \\"Name\\""). The final output must be perfectly valid JSON. Your entire response MUST be ONLY the raw JSON object, without any surrounding text, explanations, or markdown code fences.`;
// --- CORE CURATOR LOGIC ---
const generateGraphDataBackend = async (artists, filters, cachedSubgraphsContext, baseGraph) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error("GEMINI_API_KEY is not defined in environment secrets.");
    }
    const ai = new genai_1.GoogleGenAI({ apiKey });
    const currentModel = "gemini-3.1-pro-preview";
    const artistList = artists.split('::').map(a => a.trim()).filter(Boolean);
    let userPrompt;
    let systemInstruction;
    const isEnhancement = baseGraph && baseGraph.nodes && baseGraph.nodes.length > 0;
    const isMultiSeed = artistList.length > 1 && cachedSubgraphsContext && cachedSubgraphsContext.length > 0;
    // Reinforce schema with dynamic descriptions if filters exist
    const dynamicSchema = JSON.parse(JSON.stringify(exports.GRAPH_RESPONSE_SCHEMA));
    if (filters?.foundedAfter) {
        dynamicSchema.properties.nodes.description += ` MANDATORY: All NEW artists MUST have been founded AFTER ${filters.foundedAfter}.`;
    }
    if (filters?.foundedBefore) {
        dynamicSchema.properties.nodes.description += ` MANDATORY: All NEW artists MUST have been founded BEFORE ${filters.foundedBefore}.`;
    }
    if (isMultiSeed) {
        systemInstruction = exports.GENERATE_MULTI_SEED_GRAPH_PROMPT_TEMPLATE
            .replace('{{cachedSubgraphsContext}}', cachedSubgraphsContext);
        userPrompt = `Stitch together the music graphs for these seed artists: ${artists}. Use the provided cached graphs as context.`;
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
        if (filters.foundedAfter)
            reminder += ` founded after ${filters.foundedAfter};`;
        if (filters.foundedBefore)
            reminder += ` founded before ${filters.foundedBefore};`;
        userPrompt += reminder;
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
    let cleanedJsonText = jsonText;
    if (cleanedJsonText.startsWith('```')) {
        cleanedJsonText = cleanedJsonText.replace(/^```(?:json)?\n?/i, '').replace(/```$/, '').trim();
    }
    let data;
    try {
        data = JSON.parse(cleanedJsonText);
    }
    catch (parseError) {
        const repaired = repairJson(cleanedJsonText);
        data = JSON.parse(repaired);
    }
    // --- POST-PROCESSING FILTERING ---
    const seedArtistIds = new Set(artists.split('::').map(a => a.trim().toLowerCase()));
    const nodesToRemove = new Set();
    const rawNodes = Array.isArray(data?.nodes) ? data.nodes : [];
    const rawLinks = Array.isArray(data?.links) ? data.links : [];
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
        const s = typeof l.source === 'string' ? l.source : l.source.id;
        const t = typeof l.target === 'string' ? l.target : l.target.id;
        return !nodesToRemove.has(s) && !nodesToRemove.has(t);
    });
    const artistIdsInFilteredNodes = new Set(filteredNodes.filter(n => n.type === 'artist').map(n => n.id));
    filteredNodes = filteredNodes.filter(n => {
        if (n.type === 'artist')
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
    const finalGraph = (0, exports.normalizeGraphData)({
        nodes: Array.isArray(deduplicatedNodes) ? deduplicatedNodes : [],
        links: Array.isArray(validLinks) ? validLinks : []
    });
    if (data && data.synthesis_rationale) {
        finalGraph.synthesisRationale = data.synthesis_rationale;
    }
    return finalGraph;
};
exports.generateGraphDataBackend = generateGraphDataBackend;
//# sourceMappingURL=curatorService.js.map