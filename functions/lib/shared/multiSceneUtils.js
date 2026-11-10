"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createEmptyScene = exports.LEGACY_SCENE_HORIZONTAL_STRIDE = exports.PREV_SCENE_HORIZONTAL_STRIDE = exports.SCENE_HORIZONTAL_STRIDE = exports.SCENE_BASE_CENTER_Y = exports.SCENE_BASE_CENTER_X = void 0;
exports.getSceneCenterOffset = getSceneCenterOffset;
exports.detectLegacyStrideShiftX = detectLegacyStrideShiftX;
exports.migrateLegacyCanvasLayout = migrateLegacyCanvasLayout;
exports.migrateLegacyGraphDataCoords = migrateLegacyGraphDataCoords;
exports.sanitizeGraphDataForTransport = sanitizeGraphDataForTransport;
exports.sanitizeScenesForTransport = sanitizeScenesForTransport;
exports.namespaceSceneNodeId = namespaceSceneNodeId;
exports.stripSceneNamespace = stripSceneNamespace;
exports.extractSceneIdFromNodeId = extractSceneIdFromNodeId;
exports.normalizeCanonicalEntityId = normalizeCanonicalEntityId;
exports.toSeedArtistsArray = toSeedArtistsArray;
exports.toSeedArtistsString = toSeedArtistsString;
exports.isCanonicalSeedMatch = isCanonicalSeedMatch;
exports.normalizeProjectScene = normalizeProjectScene;
exports.createEmptyProjectScene = createEmptyProjectScene;
exports.normalizeCrossSceneLink = normalizeCrossSceneLink;
exports.computeDeterministicIdentityBridges = computeDeterministicIdentityBridges;
exports.mergeCrossSceneLinks = mergeCrossSceneLinks;
exports.getNodeDisplayLabel = getNodeDisplayLabel;
exports.resolveSceneNodeOverlaps = resolveSceneNodeOverlaps;
exports.buildCompositeCanvasGraph = buildCompositeCanvasGraph;
exports.computeDeduplicatedActiveNodes = computeDeduplicatedActiveNodes;
exports.buildCanonicalDeduplicatedNodesFromScenes = buildCanonicalDeduplicatedNodesFromScenes;
exports.getAllProjectSeedIds = getAllProjectSeedIds;
exports.getAllProjectSeedArtistsList = getAllProjectSeedArtistsList;
exports.getAllProjectSeedArtistsString = getAllProjectSeedArtistsString;
exports.computeProjectCardMetrics = computeProjectCardMetrics;
exports.parseProjectScenes = parseProjectScenes;
exports.parseCrossSceneLinks = parseCrossSceneLinks;
exports.generateProjectTitleFromScenes = generateProjectTitleFromScenes;
exports.compactDetailsCacheToCanonical = compactDetailsCacheToCanonical;
const isoCountries_1 = require("./isoCountries");
exports.SCENE_BASE_CENTER_X = 1000;
exports.SCENE_BASE_CENTER_Y = 1000;
exports.SCENE_HORIZONTAL_STRIDE = 1050;
/** Previous V43.0 stride. Retained to detect and migrate Coordinate Memory from 950px to 1050px. */
exports.PREV_SCENE_HORIZONTAL_STRIDE = 950;
/** Pre-V43.1 stride. Retained only to detect and migrate legacy Coordinate Memory. */
exports.LEGACY_SCENE_HORIZONTAL_STRIDE = 1600;
function getSceneCenterOffset(sceneIndex) {
    const safeIndex = Number.isFinite(sceneIndex) && sceneIndex >= 0 ? Math.floor(sceneIndex) : 0;
    return {
        x: exports.SCENE_BASE_CENTER_X + safeIndex * exports.SCENE_HORIZONTAL_STRIDE,
        y: exports.SCENE_BASE_CENTER_Y,
    };
}
/**
 * Coordinate Memory Migration (1600px / 950px → 1050px stride).
 * Given a scene index and a sample of saved X coordinates belonging to that scene, returns the
 * horizontal delta required to move the cluster from its previous center to the current center
 * (1000 + k*1050). Returns 0 when the coordinates already sit closest to the current center (idempotent).
 */
function detectLegacyStrideShiftX(sceneIndex, sampleXs) {
    const k = Number.isFinite(sceneIndex) ? Math.floor(sceneIndex) : 0;
    if (k < 1)
        return 0;
    const xs = (sampleXs || []).filter((x) => typeof x === 'number' && Number.isFinite(x));
    if (xs.length === 0)
        return 0;
    const meanX = xs.reduce((sum, x) => sum + x, 0) / xs.length;
    const legacy1600CenterX = exports.SCENE_BASE_CENTER_X + k * exports.LEGACY_SCENE_HORIZONTAL_STRIDE;
    const prev950CenterX = exports.SCENE_BASE_CENTER_X + k * exports.PREV_SCENE_HORIZONTAL_STRIDE;
    const currentCenterX = exports.SCENE_BASE_CENTER_X + k * exports.SCENE_HORIZONTAL_STRIDE;
    const distTo1600 = Math.abs(meanX - legacy1600CenterX);
    const distTo950 = Math.abs(meanX - prev950CenterX);
    const distToCurrent = Math.abs(meanX - currentCenterX);
    if (distTo1600 < distToCurrent && distTo1600 <= distTo950) {
        return currentCenterX - legacy1600CenterX;
    }
    if (distTo950 < distToCurrent && distTo950 < distTo1600) {
        return currentCenterX - prev950CenterX;
    }
    return 0;
}
function isLegacyCenterOffset(centerOffset, sceneIndex) {
    if (!centerOffset || typeof centerOffset.x !== 'number' || sceneIndex < 1)
        return false;
    const is1600 = Math.abs(centerOffset.x - (exports.SCENE_BASE_CENTER_X + sceneIndex * exports.LEGACY_SCENE_HORIZONTAL_STRIDE)) < 0.5;
    const is950 = Math.abs(centerOffset.x - (exports.SCENE_BASE_CENTER_X + sceneIndex * exports.PREV_SCENE_HORIZONTAL_STRIDE)) < 0.5;
    return is1600 || is950;
}
function shiftNodeX(node, dx) {
    if (!dx || !node)
        return node;
    const next = { ...node };
    if (typeof next.x === 'number')
        next.x = next.x + dx;
    if (typeof next.fx === 'number')
        next.fx = next.fx + dx;
    return next;
}
function resolveSceneIndexForNodeId(nodeId, sceneIndexById, explicitIndex) {
    if (typeof explicitIndex === 'number' && Number.isFinite(explicitIndex))
        return Math.floor(explicitIndex);
    const sceneId = extractSceneIdFromNodeId(nodeId);
    if (!sceneId)
        return 0;
    if (sceneIndexById.has(sceneId))
        return sceneIndexById.get(sceneId);
    const match = sceneId.match(/^scene-(\d+)$/i);
    return match ? Math.max(0, parseInt(match[1], 10) - 1) : 0;
}
function buildSceneIndexMap(scenes) {
    const map = new Map();
    (scenes || []).forEach((s, idx) => {
        const id = String(s?.sceneId || s?.id || '').toLowerCase();
        if (id)
            map.set(id, typeof s?.sceneIndex === 'number' ? s.sceneIndex : idx);
    });
    return map;
}
/**
 * Migrates a saved `canvasLayout` (CanvasNodeRef[]) written under the legacy 1600px stride.
 * Each scene's refs are shifted as a group (x and fx) only when their mean X sits nearer the
 * legacy center — idempotent and safe to call on every load.
 */
function migrateLegacyCanvasLayout(layout, scenes) {
    if (!Array.isArray(layout) || layout.length === 0)
        return Array.isArray(layout) ? layout : [];
    const sceneIndexById = buildSceneIndexMap(scenes);
    const groups = new Map();
    const refIndex = layout.map((ref) => {
        const idx = resolveSceneIndexForNodeId(String(ref?.id || ref?.nodeId || ''), sceneIndexById);
        if (!groups.has(idx))
            groups.set(idx, []);
        if (typeof ref?.x === 'number')
            groups.get(idx).push(ref.x);
        return idx;
    });
    const shifts = new Map();
    groups.forEach((xs, idx) => shifts.set(idx, detectLegacyStrideShiftX(idx, xs)));
    if (Array.from(shifts.values()).every((dx) => dx === 0))
        return layout;
    return layout.map((ref, i) => shiftNodeX(ref, shifts.get(refIndex[i]) || 0));
}
/**
 * Migrates a composite/project `GraphData` whose scene-namespaced nodes were settled under the
 * legacy 1600px stride. Links are left untouched.
 */
function migrateLegacyGraphDataCoords(graph, scenes) {
    if (!graph || !Array.isArray(graph.nodes) || graph.nodes.length === 0)
        return graph;
    const sceneIndexById = buildSceneIndexMap(scenes);
    const groups = new Map();
    const nodeIdx = graph.nodes.map((n) => {
        const idx = resolveSceneIndexForNodeId(String(n?.id || ''), sceneIndexById, n?.sceneIndex);
        if (!groups.has(idx))
            groups.set(idx, []);
        if (typeof n?.x === 'number')
            groups.get(idx).push(n.x);
        return idx;
    });
    const shifts = new Map();
    groups.forEach((xs, idx) => shifts.set(idx, detectLegacyStrideShiftX(idx, xs)));
    if (Array.from(shifts.values()).every((dx) => dx === 0))
        return graph;
    return {
        ...graph,
        nodes: graph.nodes.map((n, i) => shiftNodeX(n, shifts.get(nodeIdx[i]) || 0)),
    };
}
/**
 * Strips D3-mutated object references and `undefined` properties from a GraphData so it is
 * safe to serialize across HTTPS Callable boundaries (links carry plain string IDs).
 */
function sanitizeGraphDataForTransport(graph) {
    const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
    const links = Array.isArray(graph?.links) ? graph.links : [];
    const stripUndefined = (obj) => {
        const out = {};
        for (const [k, v] of Object.entries(obj || {})) {
            if (v !== undefined && typeof v !== 'function')
                out[k] = v;
        }
        return out;
    };
    const cleanNodes = nodes
        .filter((n) => n && n.id)
        .map((n) => {
        const { vx, vy, index, ...rest } = n;
        return stripUndefined(rest);
    });
    const cleanLinks = links
        .map((l) => {
        if (!l)
            return null;
        const source = typeof l.source === 'object' && l.source !== null ? l.source.id : l.source;
        const target = typeof l.target === 'object' && l.target !== null ? l.target.id : l.target;
        if (typeof source !== 'string' || typeof target !== 'string' || !source || !target)
            return null;
        const { index, ...rest } = l;
        return stripUndefined({ ...rest, source, target });
    })
        .filter(Boolean);
    const out = { nodes: cleanNodes, links: cleanLinks };
    if (graph?.synthesisRationale)
        out.synthesisRationale = graph.synthesisRationale;
    return out;
}
/** Applies `sanitizeGraphDataForTransport` to every scene's graphData and strips undefined fields. */
function sanitizeScenesForTransport(scenes) {
    if (!Array.isArray(scenes))
        return [];
    return scenes.map((s) => {
        const out = {};
        for (const [k, v] of Object.entries(s || {})) {
            if (v !== undefined && typeof v !== 'function')
                out[k] = v;
        }
        out.graphData = sanitizeGraphDataForTransport(s?.graphData);
        return out;
    });
}
function namespaceSceneNodeId(sceneId, canonicalId) {
    const cleanSceneId = (sceneId || 'scene-1').trim();
    const cleanCanonical = stripSceneNamespace(canonicalId);
    return `${cleanSceneId}::${cleanCanonical}`;
}
function stripSceneNamespace(nodeId) {
    if (!nodeId || typeof nodeId !== 'string')
        return '';
    return nodeId.replace(/^(?:scene-\d+(?:::|-))+/i, '').trim();
}
function extractSceneIdFromNodeId(nodeId) {
    if (!nodeId || typeof nodeId !== 'string')
        return null;
    const match = nodeId.match(/^(scene-\d+)(?:::|-)/i);
    return match ? match[1].toLowerCase() : null;
}
function normalizeCanonicalEntityId(id) {
    const stripped = stripSceneNamespace(id);
    return stripped
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9-]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
}
/**
 * Defensive universal normalizer that converts any `seedArtists` representation
 * (`string[]`, `'::'`-delimited `string`, `null`, `undefined`, etc.) into a clean `string[]`.
 * Guarantees `.filter()`, `.map()`, `.forEach()`, and `.join()` never throw.
 */
function toSeedArtistsArray(raw) {
    if (!raw)
        return [];
    if (Array.isArray(raw)) {
        const out = [];
        for (const item of raw) {
            if (typeof item === 'string') {
                for (const part of item.split('::')) {
                    const trimmed = part.trim();
                    if (trimmed)
                        out.push(trimmed);
                }
            }
        }
        return out;
    }
    if (typeof raw === 'string') {
        return raw
            .split('::')
            .map((s) => s.trim())
            .filter(Boolean);
    }
    return [];
}
/**
 * Defensive universal normalizer that converts any `seedArtists` representation
 * (`string[]` or `'::'`-delimited `string`) into the canonical `'::'`-delimited `string`.
 */
function toSeedArtistsString(raw) {
    return toSeedArtistsArray(raw).join('::');
}
function isCanonicalSeedMatch(nodeIdOrLabel, seedList) {
    if (!nodeIdOrLabel || !Array.isArray(seedList) || seedList.length === 0)
        return false;
    const targetNorm = normalizeCanonicalEntityId(nodeIdOrLabel);
    const targetBare = (0, isoCountries_1.stripCountrySlug)(targetNorm);
    if (!targetNorm)
        return false;
    return seedList.some((seed) => {
        const seedNorm = normalizeCanonicalEntityId(seed);
        const seedBare = (0, isoCountries_1.stripCountrySlug)(seedNorm);
        if (!seedNorm)
            return false;
        return (targetNorm === seedNorm ||
            (targetBare && seedBare && targetBare === seedBare));
    });
}
/**
 * Canonicalizes a `ProjectScene` object so that `sceneId` & `id`, `title` & `name`,
 * `seedArtists` (string), and `seedIds` & `seedArtistIds` (string[]) are always
 * present and synchronized across frontend and backend boundaries.
 */
function normalizeProjectScene(raw, fallbackIndex = 0) {
    const s = raw || {};
    const sceneIndex = typeof s.sceneIndex === 'number' && Number.isFinite(s.sceneIndex) && s.sceneIndex >= 0
        ? Math.floor(s.sceneIndex)
        : Math.max(0, Math.floor(fallbackIndex));
    const sceneId = String(s.sceneId || s.id || `scene-${sceneIndex + 1}`).trim();
    let graphData = { nodes: [], links: [] };
    if (s.graphData) {
        try {
            const parsedGraph = typeof s.graphData === 'string' ? JSON.parse(s.graphData) : s.graphData;
            if (parsedGraph && typeof parsedGraph === 'object') {
                graphData = {
                    nodes: Array.isArray(parsedGraph.nodes) ? parsedGraph.nodes : [],
                    links: Array.isArray(parsedGraph.links) ? parsedGraph.links : [],
                    ...(parsedGraph.synthesisRationale
                        ? { synthesisRationale: parsedGraph.synthesisRationale }
                        : {}),
                };
            }
        }
        catch {
            graphData = { nodes: [], links: [] };
        }
    }
    let discoveryFilters = {};
    if (s.discoveryFilters) {
        try {
            const parsedFilters = typeof s.discoveryFilters === 'string'
                ? JSON.parse(s.discoveryFilters)
                : s.discoveryFilters;
            if (parsedFilters && typeof parsedFilters === 'object') {
                discoveryFilters = parsedFilters;
            }
        }
        catch {
            discoveryFilters = {};
        }
    }
    const seedsArray = toSeedArtistsArray(s.seedArtists);
    const seedArtists = seedsArray.join('::');
    const rawSeedIds = Array.isArray(s.seedIds) && s.seedIds.length > 0
        ? s.seedIds
        : Array.isArray(s.seedArtistIds) && s.seedArtistIds.length > 0
            ? s.seedArtistIds
            : [];
    const seedIds = rawSeedIds.length > 0
        ? rawSeedIds.map((id) => String(id).trim()).filter(Boolean)
        : seedsArray.map((seed) => normalizeCanonicalEntityId(seed)).filter(Boolean);
    const rawTitle = String(s.title || s.name || '').trim();
    const isGenericDefaultTitle = /^Scene\s+\d+$/i.test(rawTitle);
    const title = rawTitle && (!isGenericDefaultTitle || seedsArray.length === 0)
        ? rawTitle
        : seedsArray.length > 0
            ? seedsArray.join(' + ')
            : `Scene ${sceneIndex + 1}`;
    const status = s.status ||
        (graphData.nodes && graphData.nodes.length > 0 ? 'ready' : 'unmapped');
    // Coordinate Memory Migration (1600px → 950px stride): rebase legacy centers and any
    // settled node coordinates stored inside this scene's graphData.
    let centerOffset = s.centerOffset || getSceneCenterOffset(sceneIndex);
    if (isLegacyCenterOffset(centerOffset, sceneIndex)) {
        centerOffset = { ...centerOffset, x: getSceneCenterOffset(sceneIndex).x };
    }
    if (sceneIndex >= 1 && graphData.nodes.length > 0) {
        const nodeShift = detectLegacyStrideShiftX(sceneIndex, graphData.nodes.map((n) => n?.x));
        if (nodeShift !== 0) {
            graphData = { ...graphData, nodes: graphData.nodes.map((n) => shiftNodeX(n, nodeShift)) };
        }
    }
    return {
        id: sceneId,
        sceneId,
        sceneIndex,
        title,
        name: title,
        seedArtists,
        seedIds,
        seedArtistIds: seedIds,
        ...(Array.isArray(s.activeNodes) ? { activeNodes: s.activeNodes } : {}),
        discoveryFilters,
        graphData,
        synthesisRationale: s.synthesisRationale || graphData.synthesisRationale || '',
        artistSnippets: s.artistSnippets && typeof s.artistSnippets === 'object' ? s.artistSnippets : {},
        centerOffset,
        status,
        ...(s.pathway ? { pathway: s.pathway } : {}),
        ...(s.generationType ? { generationType: s.generationType } : {}),
        updatedAt: typeof s.updatedAt === 'number' ? s.updatedAt : Date.now(),
    };
}
function createEmptyProjectScene(sceneIndex, seedArtists = '', discoveryFilters = {}) {
    return normalizeProjectScene({
        sceneIndex,
        seedArtists: toSeedArtistsString(seedArtists),
        discoveryFilters: discoveryFilters || {},
        graphData: { nodes: [], links: [] },
        synthesisRationale: '',
        artistSnippets: {},
        centerOffset: getSceneCenterOffset(sceneIndex),
        status: 'unmapped',
        updatedAt: Date.now(),
    }, sceneIndex);
}
exports.createEmptyScene = createEmptyProjectScene;
/**
 * Normalizes a `CrossSceneLink` so both `sourceSceneId`/`targetSceneId` and
 * `fromSceneId`/`toSceneId` (plus `sourceCanonicalId`/`targetCanonicalId` and
 * `fromNodeId`/`toNodeId`) are always populated and consistent.
 */
function normalizeCrossSceneLink(raw) {
    if (!raw || typeof raw !== 'object')
        return null;
    const sourceSceneId = String(raw.sourceSceneId || raw.fromSceneId || '').trim();
    const targetSceneId = String(raw.targetSceneId || raw.toSceneId || '').trim();
    if (!sourceSceneId || !targetSceneId || sourceSceneId === targetSceneId)
        return null;
    const sourceCanonicalId = stripSceneNamespace(String(raw.sourceCanonicalId || raw.fromNodeId || raw.sourceNodeId || '').trim());
    const targetCanonicalId = stripSceneNamespace(String(raw.targetCanonicalId || raw.toNodeId || raw.targetNodeId || '').trim());
    if (!sourceCanonicalId || !targetCanonicalId)
        return null;
    const sourceNodeId = raw.sourceNodeId && String(raw.sourceNodeId).includes('::')
        ? String(raw.sourceNodeId).trim()
        : namespaceSceneNodeId(sourceSceneId, sourceCanonicalId);
    const targetNodeId = raw.targetNodeId && String(raw.targetNodeId).includes('::')
        ? String(raw.targetNodeId).trim()
        : namespaceSceneNodeId(targetSceneId, targetCanonicalId);
    const id = String(raw.id || `${sourceNodeId}--${targetNodeId}`).trim();
    const bridgeType = raw.bridgeType === 'sonic_lineage' ? 'sonic_lineage' : 'identity';
    const forwardContext = String(raw.forwardContext || 'bridges both constellations as a shared anchor with').trim();
    const inverseContext = String(raw.inverseContext || forwardContext).trim();
    const weight = typeof raw.weight === 'number' && Number.isFinite(raw.weight)
        ? raw.weight
        : bridgeType === 'identity'
            ? 1.0
            : 0.85;
    return {
        id,
        sourceSceneId,
        targetSceneId,
        fromSceneId: sourceSceneId,
        toSceneId: targetSceneId,
        sourceNodeId,
        targetNodeId,
        fromNodeId: sourceCanonicalId,
        toNodeId: targetCanonicalId,
        sourceCanonicalId,
        targetCanonicalId,
        bridgeType,
        forwardContext,
        inverseContext,
        weight,
    };
}
/**
 * Deterministically identifies shared canonical Artist or Label entities across Scene pairs
 * and generates `bridgeType: 'identity'` CrossSceneLinks ([Rule 26], [Rule 44]).
 */
function computeDeterministicIdentityBridges(scenes) {
    if (!Array.isArray(scenes) || scenes.length < 2)
        return [];
    const bridges = [];
    const seenBridgeKeys = new Set();
    for (let i = 0; i < scenes.length; i++) {
        const sceneA = scenes[i];
        const nodesA = sceneA?.graphData?.nodes || [];
        if (nodesA.length === 0)
            continue;
        const seedsA = sceneA.seedIds?.length
            ? sceneA.seedIds
            : sceneA.seedArtistIds?.length
                ? sceneA.seedArtistIds
                : toSeedArtistsArray(sceneA.seedArtists);
        for (let j = i + 1; j < scenes.length; j++) {
            const sceneB = scenes[j];
            const nodesB = sceneB?.graphData?.nodes || [];
            if (nodesB.length === 0)
                continue;
            const seedsB = sceneB.seedIds?.length
                ? sceneB.seedIds
                : sceneB.seedArtistIds?.length
                    ? sceneB.seedArtistIds
                    : toSeedArtistsArray(sceneB.seedArtists);
            for (const nodeA of nodesA) {
                if (nodeA.type !== 'artist' && nodeA.type !== 'label')
                    continue;
                const canonA = stripSceneNamespace(nodeA.canonicalId || nodeA.id);
                const normA = normalizeCanonicalEntityId(canonA);
                const bareA = (0, isoCountries_1.stripCountrySlug)(normA);
                const matchingNodeB = nodesB.find((nodeB) => {
                    if (nodeB.type !== nodeA.type)
                        return false;
                    const canonB = stripSceneNamespace(nodeB.canonicalId || nodeB.id);
                    const normB = normalizeCanonicalEntityId(canonB);
                    if (normA === normB)
                        return true;
                    const bareB = (0, isoCountries_1.stripCountrySlug)(normB);
                    return Boolean(bareA && bareB && bareA === bareB && normA === normB);
                });
                if (!matchingNodeB)
                    continue;
                const sceneAId = sceneA.sceneId || sceneA.id || `scene-${i + 1}`;
                const sceneBId = sceneB.sceneId || sceneB.id || `scene-${j + 1}`;
                const canonB = stripSceneNamespace(matchingNodeB.canonicalId || matchingNodeB.id);
                const sourceNodeId = namespaceSceneNodeId(sceneAId, canonA);
                const targetNodeId = namespaceSceneNodeId(sceneBId, canonB);
                const bridgeId = `${sourceNodeId}--${targetNodeId}`;
                if (seenBridgeKeys.has(bridgeId))
                    continue;
                seenBridgeKeys.add(bridgeId);
                const isSeedInA = nodeA.type === 'artist' &&
                    (Boolean(nodeA.isSceneSeed) || Boolean(nodeA.isSeed) || isCanonicalSeedMatch(canonA, seedsA));
                const isSeedInB = matchingNodeB.type === 'artist' &&
                    (Boolean(matchingNodeB.isSceneSeed) || Boolean(matchingNodeB.isSeed) || isCanonicalSeedMatch(canonB, seedsB));
                let forwardContext = 'bridges both constellations as a shared anchor with';
                let inverseContext = 'bridges both constellations as a shared anchor with';
                if (!isSeedInA && isSeedInB) {
                    forwardContext = 'appears as a foundational Root Artist in';
                    inverseContext = 'emerged as a recommended peer within';
                }
                else if (isSeedInA && !isSeedInB) {
                    forwardContext = 'emerged as a recommended peer within';
                    inverseContext = 'appears as a foundational Root Artist in';
                }
                else if (nodeA.type === 'label') {
                    forwardContext = 'anchors both scenes through shared label roster with';
                    inverseContext = 'anchors both scenes through shared label roster with';
                }
                const normalizedBridge = normalizeCrossSceneLink({
                    id: bridgeId,
                    sourceSceneId: sceneAId,
                    targetSceneId: sceneBId,
                    sourceNodeId,
                    targetNodeId,
                    sourceCanonicalId: canonA,
                    targetCanonicalId: canonB,
                    bridgeType: 'identity',
                    forwardContext,
                    inverseContext,
                    weight: 1.0,
                });
                if (normalizedBridge)
                    bridges.push(normalizedBridge);
            }
        }
    }
    return bridges;
}
/**
 * Merges deterministic `identity` bridges with AI-synthesized `sonic_lineage` bridges,
 * ensuring deterministic identity bridges take precedence on identical endpoint pairs.
 */
function mergeCrossSceneLinks(deterministicBridges, aiBridges = []) {
    const merged = new Map();
    const makePairKey = (link) => {
        const srcScene = link.sourceSceneId || link.fromSceneId || '';
        const tgtScene = link.targetSceneId || link.toSceneId || '';
        const srcCanon = link.sourceCanonicalId || link.fromNodeId || stripSceneNamespace(link.sourceNodeId || '');
        const tgtCanon = link.targetCanonicalId || link.toNodeId || stripSceneNamespace(link.targetNodeId || '');
        const a = `${srcScene}::${normalizeCanonicalEntityId(srcCanon)}`;
        const b = `${tgtScene}::${normalizeCanonicalEntityId(tgtCanon)}`;
        return [a, b].sort().join('--');
    };
    for (const rawD of deterministicBridges || []) {
        const d = normalizeCrossSceneLink(rawD);
        if (d)
            merged.set(makePairKey(d), d);
    }
    for (const rawAi of aiBridges || []) {
        const ai = normalizeCrossSceneLink(rawAi);
        if (!ai)
            continue;
        const key = makePairKey(ai);
        if (!merged.has(key)) {
            merged.set(key, ai);
        }
    }
    return Array.from(merged.values());
}
function getNodeDisplayLabel(node) {
    if (node.label && typeof node.label === 'string' && node.label.trim()) {
        return node.label.trim();
    }
    const canonRaw = stripSceneNamespace(String(node.canonicalId || node.id || ''));
    return canonRaw
        .split('-')
        .filter(Boolean)
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
}
/**
 * Resolves node and text-label collisions across scene clusters while strictly preserving
 * Box 5 (3.6 Flash) semantic radial hierarchy and artist-satellite orbital pairing ([Rule 21]).
 *
 * Guarantees:
 * 1. Root Artist Seeds (isSeed === true) stay permanently anchored at scene centers (mass = infinity).
 * 2. Artist Peers (type === 'artist') hold high inertia (mass = 6.7), adjusting minimally along their radial axis.
 * 3. 1-Degree Metadata Satellites (founded, genre, country, 1-degree label) are tethered within an orbit
 *    of r in [62px, 85px] around their parent artist, resolving clashes via tangential arc rotation.
 * 4. Wide labels ("Alternative Rock", "Emo / Post Hardcore") and vertical stacks (Tooth & Nail / 1991)
 *    achieve zero AABB overlap.
 */
function resolveSceneNodeOverlaps(nodes, links = [], options) {
    if (!Array.isArray(nodes) || nodes.length <= 1)
        return nodes;
    const maxIterations = options?.maxIterations ?? 15;
    const padX = options?.paddingX ?? 10;
    const padY = options?.paddingY ?? 8;
    const expansionFactor = options?.clusterExpansionFactor ?? 1.0;
    // Helper to extract scene index from namespaced ID if sceneIndex is not set
    const extractSceneIndexFromId = (id) => {
        const match = id?.match(/^scene-(\d+)/i);
        return match ? parseInt(match[1], 10) - 1 : null;
    };
    // Group nodes by sceneIndex
    const sceneGroups = new Map();
    nodes.forEach(n => {
        const sIdx = typeof n.sceneIndex === 'number' ? n.sceneIndex : (extractSceneIndexFromId(n.id) ?? 0);
        if (!sceneGroups.has(sIdx))
            sceneGroups.set(sIdx, []);
        sceneGroups.get(sIdx).push(n);
    });
    // Build parent artist tether map from links
    // A metadata node with type !== 'artist' is tethered to parent A if it connects to an artist in the scene
    const parentMap = new Map();
    const artistById = new Map();
    nodes.forEach(n => {
        if (n.type === 'artist')
            artistById.set(n.id, n);
    });
    const metadataArtistNeighbors = new Map();
    links.forEach(l => {
        if (l.isCrossSceneBridge)
            return;
        const sId = typeof l.source === 'object' ? l.source.id : l.source;
        const tId = typeof l.target === 'object' ? l.target.id : l.target;
        if (!sId || !tId)
            return;
        const sNode = nodes.find(n => n.id === sId);
        const tNode = nodes.find(n => n.id === tId);
        if (!sNode || !tNode)
            return;
        if (sNode.type !== 'artist' && tNode.type === 'artist') {
            if (!metadataArtistNeighbors.has(sId))
                metadataArtistNeighbors.set(sId, new Set());
            metadataArtistNeighbors.get(sId).add(tId);
        }
        else if (tNode.type !== 'artist' && sNode.type === 'artist') {
            if (!metadataArtistNeighbors.has(tId))
                metadataArtistNeighbors.set(tId, new Set());
            metadataArtistNeighbors.get(tId).add(sId);
        }
    });
    metadataArtistNeighbors.forEach((artistSet, metaId) => {
        if (artistSet.size === 1) {
            const parentId = Array.from(artistSet)[0];
            const parentNode = artistById.get(parentId);
            if (parentNode) {
                parentMap.set(metaId, parentNode);
            }
        }
    });
    // Process each scene cluster independently
    sceneGroups.forEach((sceneNodes, sIdx) => {
        const center = getSceneCenterOffset(sIdx);
        // Optional cluster expansion (e.g. 18% breathing room)
        if (expansionFactor > 1.0) {
            sceneNodes.forEach(n => {
                const isSeed = Boolean(n.isSeed || n.isSceneSeed);
                if (!isSeed && typeof n.x === 'number' && typeof n.y === 'number') {
                    const dx = n.x - center.x;
                    const dy = n.y - center.y;
                    n.x = center.x + dx * expansionFactor;
                    n.y = center.y + dy * expansionFactor;
                    if (typeof n.fx === 'number')
                        n.fx = n.x;
                    if (typeof n.fy === 'number')
                        n.fy = n.y;
                }
            });
        }
        // Initialize unplaced or zero-distance metadata petals to outward arc
        sceneNodes.forEach(n => {
            if (parentMap.has(n.id)) {
                const parent = parentMap.get(n.id);
                const distToParent = Math.hypot((n.x ?? 0) - (parent.x ?? 0), (n.y ?? 0) - (parent.y ?? 0));
                // If petal sits right on parent (< 45px), spawn it on outward arc relative to scene center
                if (distToParent < 45 || isNaN(n.x ?? NaN) || isNaN(n.y ?? NaN)) {
                    const outAngle = Math.atan2((parent.y ?? center.y) - center.y, (parent.x ?? center.x) - center.x);
                    const targetR = 72;
                    n.x = (parent.x ?? center.x) + targetR * Math.cos(outAngle);
                    n.y = (parent.y ?? center.y) + targetR * Math.sin(outAngle);
                    if (n.fx != null)
                        n.fx = n.x;
                    if (n.fy != null)
                        n.fy = n.y;
                }
            }
        });
        // Helper for AABB half-extents
        const getHalfExtents = (n) => {
            const label = getNodeDisplayLabel(n);
            const textWidth = Math.max(28, label.length * 7.2);
            const isSeed = Boolean(n.isSeed || n.isSceneSeed);
            const r = isSeed ? 18 : (n.type === 'artist' ? 16 : 14);
            const hx = Math.max(r, textWidth / 2) + padX;
            const hy = 22 + padY; // text is at y + 22, height ~16
            return { hx, hy };
        };
        // Relaxation loop
        for (let iter = 0; iter < maxIterations; iter++) {
            const damping = Math.pow(0.88, iter);
            let overlapCount = 0;
            for (let i = 0; i < sceneNodes.length; i++) {
                for (let j = i + 1; j < sceneNodes.length; j++) {
                    const A = sceneNodes[i];
                    const B = sceneNodes[j];
                    if (A.x === undefined || A.y === undefined || B.x === undefined || B.y === undefined)
                        continue;
                    const boxA = getHalfExtents(A);
                    const boxB = getHalfExtents(B);
                    const dx = B.x - A.x;
                    const dy = B.y - A.y;
                    const overlapX = (boxA.hx + boxB.hx) - Math.abs(dx);
                    const overlapY = (boxA.hy + boxB.hy) - Math.abs(dy);
                    if (overlapX > 0 && overlapY > 0) {
                        const isSeedA = Boolean(A.isSeed || A.isSceneSeed);
                        const isSeedB = Boolean(B.isSeed || B.isSceneSeed);
                        if (isSeedA && isSeedB)
                            continue; // Both are seeds: anchor coordinates are immutable!
                        overlapCount++;
                        let nx = dx !== 0 ? Math.sign(dx) : 1;
                        let ny = dy !== 0 ? Math.sign(dy) : 0;
                        const dist = Math.hypot(dx, dy);
                        if (dist > 0.001) {
                            nx = dx / dist;
                            ny = dy / dist;
                        }
                        const parentA = parentMap.get(A.id);
                        const parentB = parentMap.get(B.id);
                        // Case 1: A is a 1-degree petal of parentA
                        if (parentA && !parentB) {
                            rotatePetalAlongArc(A, parentA, -nx, -ny, Math.min(overlapX, overlapY) * damping);
                        }
                        // Case 2: B is a 1-degree petal of parentB
                        else if (parentB && !parentA) {
                            rotatePetalAlongArc(B, parentB, nx, ny, Math.min(overlapX, overlapY) * damping);
                        }
                        // Case 3: Both are 1-degree petals
                        else if (parentA && parentB) {
                            if (parentA.id === parentB.id) {
                                // Sibling petals on same parent: rotate in opposite directions
                                rotatePetalAlongArc(A, parentA, -nx, -ny, (overlapX + overlapY) * 0.5 * damping);
                                rotatePetalAlongArc(B, parentB, nx, ny, (overlapX + overlapY) * 0.5 * damping);
                            }
                            else {
                                rotatePetalAlongArc(A, parentA, -nx, -ny, Math.min(overlapX, overlapY) * 0.5 * damping);
                                rotatePetalAlongArc(B, parentB, nx, ny, Math.min(overlapX, overlapY) * 0.5 * damping);
                            }
                        }
                        // Case 4: One is an immutable seed
                        else if (isSeedA && !isSeedB) {
                            B.x += nx * overlapX * damping;
                            B.y += ny * overlapY * damping;
                            if (B.fx != null)
                                B.fx = B.x;
                            if (B.fy != null)
                                B.fy = B.y;
                        }
                        else if (isSeedB && !isSeedA) {
                            A.x -= nx * overlapX * damping;
                            A.y -= ny * overlapY * damping;
                            if (A.fx != null)
                                A.fx = A.x;
                            if (A.fy != null)
                                A.fy = A.y;
                        }
                        // Case 5: Two non-seed nodes (two artists or labels)
                        else {
                            // Vertical stack guard: if horizontal delta is very small, add a slight lateral nudge
                            if (Math.abs(dx) < 16) {
                                const lateral = (i % 2 === 0 ? 1 : -1) * 16 * damping;
                                A.x -= lateral;
                                B.x += lateral;
                            }
                            const pushX = overlapX * 0.5 * damping;
                            const pushY = overlapY * 0.5 * damping;
                            A.x -= nx * pushX;
                            A.y -= ny * pushY;
                            B.x += nx * pushX;
                            B.y += ny * pushY;
                            if (A.fx != null)
                                A.fx = A.x;
                            if (A.fy != null)
                                A.fy = A.y;
                            if (B.fx != null)
                                B.fx = B.x;
                            if (B.fy != null)
                                B.fy = B.y;
                        }
                    }
                }
            }
            if (overlapCount === 0)
                break;
        }
    });
    return nodes;
}
function rotatePetalAlongArc(petal, parent, pushX, pushY, pushDist) {
    const px = parent.x ?? 0;
    const py = parent.y ?? 0;
    const rx = (petal.x ?? px) - px;
    const ry = (petal.y ?? py) - py;
    const currentR = Math.hypot(rx, ry);
    const tetherR = Math.max(62, Math.min(85, currentR || 72));
    const currentTheta = Math.atan2(ry === 0 && rx === 0 ? 1 : ry, rx);
    // Tangent vector along orbit: (-sin(theta), cos(theta))
    const tx = -Math.sin(currentTheta);
    const ty = Math.cos(currentTheta);
    const dot = pushX * tx + pushY * ty;
    const dir = Math.abs(dot) > 0.05 ? Math.sign(dot) : 1;
    const angularDelta = dir * Math.max(0.12, Math.min(0.5, pushDist / tetherR));
    const newTheta = currentTheta + angularDelta;
    petal.x = px + tetherR * Math.cos(newTheta);
    petal.y = py + tetherR * Math.sin(newTheta);
    if (petal.fx != null)
        petal.fx = petal.x;
    if (petal.fy != null)
        petal.fy = petal.y;
}
/**
 * Assembles the composite namespaced `GraphData` for `<MusicGraph>` across all `ProjectScene`s ([Rule 21], [Rule 44]).
 */
function buildCompositeCanvasGraph(scenes, crossSceneLinks = [], savedLayout) {
    if (!Array.isArray(scenes) || scenes.length === 0) {
        return { nodes: [], links: [] };
    }
    const layoutMap = new Map();
    if (Array.isArray(savedLayout)) {
        for (const ref of savedLayout) {
            const refKey = ref?.id || ref?.nodeId;
            if (refKey) {
                layoutMap.set(refKey, ref);
                layoutMap.set(refKey.toLowerCase(), ref);
            }
        }
    }
    const compositeNodes = [];
    const compositeLinks = [];
    const nodeExistsSet = new Set();
    scenes.forEach((scene, idx) => {
        const sceneIndex = typeof scene.sceneIndex === 'number' ? scene.sceneIndex : idx;
        const sceneId = scene.sceneId || scene.id || `scene-${sceneIndex + 1}`;
        const center = scene.centerOffset && !isLegacyCenterOffset(scene.centerOffset, sceneIndex)
            ? scene.centerOffset
            : getSceneCenterOffset(sceneIndex);
        const seedList = scene.seedIds?.length
            ? scene.seedIds
            : scene.seedArtistIds?.length
                ? scene.seedArtistIds
                : toSeedArtistsArray(scene.seedArtists);
        const rawNodes = scene.graphData?.nodes || [];
        const rawLinks = scene.graphData?.links || [];
        // Coordinate Memory Migration: detect per-scene legacy (1600px stride) saved positions as a group.
        const lookupSavedRef = (canonicalId, namespacedId) => layoutMap.get(namespacedId) ||
            layoutMap.get(namespacedId.toLowerCase()) ||
            (sceneIndex === 0 ? layoutMap.get(canonicalId) || layoutMap.get(canonicalId.toLowerCase()) : undefined);
        const sceneSavedXs = [];
        const sceneRawXs = [];
        for (const rawNode of rawNodes) {
            if (!rawNode || !rawNode.id)
                continue;
            const canon = stripSceneNamespace(rawNode.canonicalId || rawNode.id);
            const ref = lookupSavedRef(canon, namespaceSceneNodeId(sceneId, canon));
            if (ref && typeof ref.x === 'number')
                sceneSavedXs.push(ref.x);
            if (typeof rawNode.x === 'number')
                sceneRawXs.push(rawNode.x);
        }
        const savedShiftX = detectLegacyStrideShiftX(sceneIndex, sceneSavedXs);
        const rawShiftX = detectLegacyStrideShiftX(sceneIndex, sceneRawXs);
        for (const rawNode of rawNodes) {
            if (!rawNode || !rawNode.id)
                continue;
            const canonicalId = stripSceneNamespace(rawNode.canonicalId || rawNode.id);
            const namespacedId = namespaceSceneNodeId(sceneId, canonicalId);
            if (nodeExistsSet.has(namespacedId.toLowerCase()))
                continue;
            nodeExistsSet.add(namespacedId.toLowerCase());
            const isSceneSeed = rawNode.type === 'artist' &&
                (Boolean(rawNode.isSceneSeed) ||
                    Boolean(rawNode.isSeed) ||
                    isCanonicalSeedMatch(canonicalId, seedList) ||
                    (rawNode.label ? isCanonicalSeedMatch(rawNode.label, seedList) : false));
            const savedRef = lookupSavedRef(canonicalId, namespacedId);
            const hasSavedCoords = savedRef && typeof savedRef.x === 'number' && typeof savedRef.y === 'number';
            const snippetFromScene = scene.artistSnippets?.[canonicalId] ||
                scene.artistSnippets?.[canonicalId.toLowerCase()] ||
                rawNode.narrativeSnippet;
            const nodeClone = {
                ...rawNode,
                id: namespacedId,
                canonicalId,
                sceneId,
                sceneIndex,
                isSeed: isSceneSeed,
                isSceneSeed,
                ...(snippetFromScene ? { narrativeSnippet: snippetFromScene } : {}),
            };
            if (hasSavedCoords) {
                nodeClone.x = savedRef.x + savedShiftX;
                nodeClone.y = savedRef.y;
                nodeClone.fx = savedRef.x + savedShiftX;
                nodeClone.fy = savedRef.y;
            }
            else if (typeof rawNode.x === 'number' && typeof rawNode.y === 'number') {
                nodeClone.x = rawNode.x + rawShiftX;
                nodeClone.y = rawNode.y;
                if (typeof rawNode.fx === 'number' && typeof rawNode.fy === 'number') {
                    nodeClone.fx = rawNode.fx + rawShiftX;
                    nodeClone.fy = rawNode.fy;
                }
            }
            else {
                // Initialize near the deterministic Scene center so D3 blooms cleanly around (1000 + k*950, 1000)
                const angle = (compositeNodes.length * 137.5 * Math.PI) / 180;
                const radius = isSceneSeed ? 25 : 90 + (compositeNodes.length % 7) * 30;
                nodeClone.x = center.x + Math.cos(angle) * radius;
                nodeClone.y = center.y + Math.sin(angle) * radius;
            }
            compositeNodes.push(nodeClone);
        }
        for (const rawLink of rawLinks) {
            if (!rawLink)
                continue;
            const rawSource = typeof rawLink.source === 'string' ? rawLink.source : rawLink.source?.id;
            const rawTarget = typeof rawLink.target === 'string' ? rawLink.target : rawLink.target?.id;
            if (!rawSource || !rawTarget)
                continue;
            const sourceNamespaced = namespaceSceneNodeId(sceneId, stripSceneNamespace(rawSource));
            const targetNamespaced = namespaceSceneNodeId(sceneId, stripSceneNamespace(rawTarget));
            if (!nodeExistsSet.has(sourceNamespaced.toLowerCase()) ||
                !nodeExistsSet.has(targetNamespaced.toLowerCase())) {
                continue;
            }
            compositeLinks.push({
                ...rawLink,
                source: sourceNamespaced,
                target: targetNamespaced,
                sceneId,
                isCrossSceneBridge: false,
            });
        }
    });
    // Resolve deterministic identity bridges + supplied cross-scene bridges
    const deterministicBridges = computeDeterministicIdentityBridges(scenes);
    const allBridges = mergeCrossSceneLinks(deterministicBridges, crossSceneLinks);
    for (const bridge of allBridges) {
        const srcSceneId = bridge.sourceSceneId || bridge.fromSceneId || 'scene-1';
        const tgtSceneId = bridge.targetSceneId || bridge.toSceneId || 'scene-2';
        const srcCanonId = bridge.sourceCanonicalId || bridge.fromNodeId || '';
        const tgtCanonId = bridge.targetCanonicalId || bridge.toNodeId || '';
        const srcId = bridge.sourceNodeId || namespaceSceneNodeId(srcSceneId, srcCanonId);
        const tgtId = bridge.targetNodeId || namespaceSceneNodeId(tgtSceneId, tgtCanonId);
        if (!srcId || !tgtId || srcId.toLowerCase() === tgtId.toLowerCase()) {
            continue;
        }
        if (!nodeExistsSet.has(srcId.toLowerCase()) || !nodeExistsSet.has(tgtId.toLowerCase())) {
            continue;
        }
        compositeLinks.push({
            source: srcId,
            target: tgtId,
            sourceNodeId: srcId,
            targetNodeId: tgtId,
            value: 2,
            weight: typeof bridge.weight === 'number' ? bridge.weight : 0.85,
            forwardContext: bridge.forwardContext,
            inverseContext: bridge.inverseContext,
            context: bridge.forwardContext,
            isCrossSceneBridge: true,
            bridgeType: bridge.bridgeType,
            sourceSceneId: srcSceneId,
            targetSceneId: tgtSceneId,
        });
    }
    // Resolve any remaining node and text-label collisions across all scene clusters
    // before returning the composite GraphData ([Rule 21]).
    resolveSceneNodeOverlaps(compositeNodes, compositeLinks);
    return {
        nodes: compositeNodes,
        links: compositeLinks,
        synthesisRationale: scenes[0]?.synthesisRationale || '',
    };
}
/**
 * Deduplicates Deep Cuts (`artist` and `label` nodes) by canonical ID across all Scenes,
 * ordered by Scene arrival and grouped by Canonical Presentation Sort (Artists before Labels — [Rule 29], [Rule 44]).
 */
function computeDeduplicatedActiveNodes(scenes) {
    if (!Array.isArray(scenes) || scenes.length === 0)
        return [];
    const seenCanonicalNorms = new Set();
    const orderedArtists = [];
    const orderedLabels = [];
    const sortedScenes = [...scenes].sort((a, b) => (a.sceneIndex ?? 0) - (b.sceneIndex ?? 0));
    for (const scene of sortedScenes) {
        const nodes = scene?.graphData?.nodes || [];
        const seedList = scene.seedIds?.length
            ? scene.seedIds
            : scene.seedArtistIds?.length
                ? scene.seedArtistIds
                : toSeedArtistsArray(scene.seedArtists);
        // 1. Scene Seed Artists first
        for (const node of nodes) {
            if (node.type !== 'artist')
                continue;
            const canonId = stripSceneNamespace(node.canonicalId || node.id);
            const isSeed = Boolean(node.isSceneSeed) ||
                Boolean(node.isSeed) ||
                isCanonicalSeedMatch(canonId, seedList) ||
                (node.label ? isCanonicalSeedMatch(node.label, seedList) : false);
            if (!isSeed)
                continue;
            const norm = normalizeCanonicalEntityId(canonId);
            if (norm && !seenCanonicalNorms.has(norm)) {
                seenCanonicalNorms.add(norm);
                orderedArtists.push(canonId);
            }
        }
        // 2. Scene Peer Artists
        for (const node of nodes) {
            if (node.type !== 'artist')
                continue;
            const canonId = stripSceneNamespace(node.canonicalId || node.id);
            const norm = normalizeCanonicalEntityId(canonId);
            if (norm && !seenCanonicalNorms.has(norm)) {
                seenCanonicalNorms.add(norm);
                orderedArtists.push(canonId);
            }
        }
        // 3. Scene Record Labels
        for (const node of nodes) {
            if (node.type !== 'label')
                continue;
            const canonId = stripSceneNamespace(node.canonicalId || node.id);
            const norm = normalizeCanonicalEntityId(canonId);
            if (norm && !seenCanonicalNorms.has(norm)) {
                seenCanonicalNorms.add(norm);
                orderedLabels.push(canonId);
            }
        }
    }
    return [...orderedArtists, ...orderedLabels];
}
/**
 * Returns the deduplicated canonical Node list (one canonical Node per unique artist/label across all scenes)
 * for use in `<DetailsPanel>` (DEEP CUTS right drawer and Zine footer grid).
 * If an artist is a Root Artist in ANY Scene, its canonical Node has `isSeed: true` ([Rule 44]).
 */
function buildCanonicalDeduplicatedNodesFromScenes(scenes) {
    if (!Array.isArray(scenes) || scenes.length === 0)
        return [];
    const allProjectSeeds = getAllProjectSeedIds(scenes);
    const canonicalNodeMap = new Map();
    const orderedKeys = [];
    const sortedScenes = [...scenes].sort((a, b) => (a.sceneIndex ?? 0) - (b.sceneIndex ?? 0));
    for (const scene of sortedScenes) {
        const nodes = scene?.graphData?.nodes || [];
        for (const rawNode of nodes) {
            if (!rawNode || !rawNode.id)
                continue;
            const canonId = stripSceneNamespace(rawNode.canonicalId || rawNode.id);
            const norm = normalizeCanonicalEntityId(canonId);
            if (!norm)
                continue;
            const isRootInAnyScene = rawNode.type === 'artist' &&
                (Boolean(rawNode.isSceneSeed) ||
                    Boolean(rawNode.isSeed) ||
                    isCanonicalSeedMatch(canonId, allProjectSeeds) ||
                    (rawNode.label ? isCanonicalSeedMatch(rawNode.label, allProjectSeeds) : false));
            const snippet = scene.artistSnippets?.[canonId] ||
                scene.artistSnippets?.[norm] ||
                rawNode.narrativeSnippet;
            if (!canonicalNodeMap.has(norm)) {
                orderedKeys.push(norm);
                canonicalNodeMap.set(norm, {
                    ...rawNode,
                    id: canonId,
                    canonicalId: canonId,
                    sceneId: scene.sceneId || scene.id,
                    sceneIndex: scene.sceneIndex,
                    isSeed: isRootInAnyScene,
                    isSceneSeed: isRootInAnyScene,
                    ...(snippet ? { narrativeSnippet: snippet } : {}),
                });
            }
            else {
                const existing = canonicalNodeMap.get(norm);
                if (isRootInAnyScene && !existing.isSeed) {
                    existing.isSeed = true;
                    existing.isSceneSeed = true;
                }
                if (snippet && !existing.narrativeSnippet) {
                    existing.narrativeSnippet = snippet;
                }
            }
        }
    }
    const allNodes = orderedKeys.map((k) => canonicalNodeMap.get(k));
    const artistNodes = allNodes.filter((n) => n.type === 'artist' || !n.type);
    const labelNodes = allNodes.filter((n) => n.type === 'label');
    const otherNodes = allNodes.filter((n) => n.type && n.type !== 'artist' && n.type !== 'label');
    return [...artistNodes, ...labelNodes, ...otherNodes];
}
function getAllProjectSeedIds(scenes) {
    if (!Array.isArray(scenes))
        return [];
    const seen = new Set();
    const result = [];
    for (const scene of scenes) {
        const list = scene?.seedIds?.length
            ? scene.seedIds
            : scene?.seedArtistIds?.length
                ? scene.seedArtistIds
                : toSeedArtistsArray(scene?.seedArtists);
        for (const s of list) {
            const clean = stripSceneNamespace(String(s)).trim();
            const norm = normalizeCanonicalEntityId(clean);
            if (norm && !seen.has(norm)) {
                seen.add(norm);
                result.push(clean);
            }
        }
    }
    return result;
}
/**
 * Aggregates every unique Root Artist display name across all Scenes (scene order).
 * Accepts parsed scenes or the raw Firestore JSON string. When no scene carries seeds,
 * falls back to `fallbackSeedArtists` (legacy single-scene documents).
 */
function getAllProjectSeedArtistsList(scenes, fallbackSeedArtists) {
    const parsedScenes = typeof scenes === 'string' ? parseProjectScenes(scenes) : Array.isArray(scenes) ? scenes : [];
    const seen = new Set();
    const names = [];
    const sorted = [...parsedScenes].sort((a, b) => (a?.sceneIndex ?? 0) - (b?.sceneIndex ?? 0));
    for (const scene of sorted) {
        for (const name of toSeedArtistsArray(scene?.seedArtists)) {
            const norm = normalizeCanonicalEntityId(name);
            if (norm && !seen.has(norm)) {
                seen.add(norm);
                names.push(name);
            }
        }
    }
    if (names.length === 0) {
        for (const name of toSeedArtistsArray(fallbackSeedArtists)) {
            const norm = normalizeCanonicalEntityId(name);
            if (norm && !seen.has(norm)) {
                seen.add(norm);
                names.push(name);
            }
        }
    }
    return names;
}
function getAllProjectSeedArtistsString(scenes, fallbackSeedArtists) {
    return getAllProjectSeedArtistsList(scenes, fallbackSeedArtists).join('::');
}
/**
 * Pure, scene-aware Dashboard card metrics. Strips `scene-k::` namespaces, deduplicates
 * canonical entities across all Scenes, counts Root Artists across every Scene, and matches
 * `activeNodes` (canonical IDs) against canonical node IDs so multi-scene Deep Cuts resolve.
 */
function computeProjectCardMetrics(project) {
    const empty = {
        sceneCount: 0,
        seedList: [],
        rootArtistsCount: 0,
        recommendedCount: 0,
        labelCount: 0,
        deepCutsCount: 0,
    };
    if (!project)
        return empty;
    const scenes = parseProjectScenes(project.scenes);
    const mappedScenes = scenes.filter((s) => (s.graphData?.nodes?.length || 0) > 0);
    const seedList = getAllProjectSeedArtistsList(scenes, project.seedArtists);
    // Prefer authoritative per-scene topology; fall back to the composite / legacy graphData.
    let nodes = mappedScenes.flatMap((s) => s.graphData?.nodes || []);
    if (nodes.length === 0 && project.graphData) {
        try {
            const pg = typeof project.graphData === 'string' ? JSON.parse(project.graphData) : project.graphData;
            if (pg && Array.isArray(pg.nodes))
                nodes = pg.nodes;
        }
        catch {
            nodes = [];
        }
    }
    const seedNorms = seedList.map((s) => normalizeCanonicalEntityId(s));
    const artistCanon = new Map();
    const labelCanon = new Set();
    for (const n of nodes) {
        if (!n || !n.id)
            continue;
        const canon = normalizeCanonicalEntityId(stripSceneNamespace(n.canonicalId || n.id));
        if (!canon)
            continue;
        if (n.type === 'label')
            labelCanon.add(canon);
        else if (n.type === 'artist' || !n.type) {
            if (!artistCanon.has(canon))
                artistCanon.set(canon, n);
        }
    }
    let rootArtistsInGraph = 0;
    let recommendedCount = 0;
    artistCanon.forEach((n, canon) => {
        const isRoot = isCanonicalSeedMatch(canon, seedNorms) ||
            (n.label ? isCanonicalSeedMatch(n.label, seedNorms) : false);
        if (isRoot)
            rootArtistsInGraph++;
        else
            recommendedCount++;
    });
    const rawActive = Array.isArray(project.activeNodes) ? project.activeNodes : [];
    const activeCanon = new Set(rawActive.map((id) => normalizeCanonicalEntityId(stripSceneNamespace(String(id)))).filter(Boolean));
    let deepCutsCount;
    if (activeCanon.size > 0 && artistCanon.size + labelCanon.size > 0) {
        deepCutsCount = 0;
        activeCanon.forEach((id) => {
            if (artistCanon.has(id) || labelCanon.has(id))
                deepCutsCount++;
        });
    }
    else if (artistCanon.size + labelCanon.size > 0) {
        deepCutsCount = artistCanon.size + labelCanon.size;
    }
    else {
        deepCutsCount = activeCanon.size;
    }
    return {
        sceneCount: Math.max(mappedScenes.length, scenes.length > 0 ? 1 : 0),
        seedList,
        rootArtistsCount: seedList.length > 0 ? seedList.length : rootArtistsInGraph,
        recommendedCount,
        labelCount: labelCanon.size,
        deepCutsCount,
    };
}
function parseProjectScenes(rawScenes) {
    if (!rawScenes)
        return [];
    try {
        const parsed = typeof rawScenes === 'string' ? JSON.parse(rawScenes) : rawScenes;
        if (!Array.isArray(parsed))
            return [];
        return parsed.map((s, idx) => normalizeProjectScene(s, idx));
    }
    catch (e) {
        console.warn('[parseProjectScenes] Failed to parse scenes:', e);
        return [];
    }
}
function parseCrossSceneLinks(rawLinks) {
    if (!rawLinks)
        return [];
    try {
        const parsed = typeof rawLinks === 'string' ? JSON.parse(rawLinks) : rawLinks;
        if (!Array.isArray(parsed))
            return [];
        return parsed
            .map((l) => normalizeCrossSceneLink(l))
            .filter((l) => l !== null);
    }
    catch (e) {
        console.warn('[parseCrossSceneLinks] Failed to parse crossSceneLinks:', e);
        return [];
    }
}
/**
 * Universal multi-scene project title generator.
 * Resolves each seed across scenes to clean display names (via detailsCache or title-casing),
 * strips trailing ISO country slugs (-us, -gb, etc.), and deduplicates repeated artists case-insensitively.
 */
function generateProjectTitleFromScenes(scenes, detailsCache) {
    if (!scenes || !Array.isArray(scenes) || scenes.length === 0) {
        return 'Untitled Zcene';
    }
    let cacheMap = null;
    if (detailsCache) {
        if (typeof detailsCache.get === 'function') {
            cacheMap = detailsCache;
        }
        else if (typeof detailsCache === 'string') {
            try {
                const parsed = JSON.parse(detailsCache);
                if (Array.isArray(parsed)) {
                    cacheMap = new Map(parsed);
                }
                else if (typeof parsed === 'object') {
                    cacheMap = new Map(Object.entries(parsed));
                }
            }
            catch { }
        }
        else if (typeof detailsCache === 'object') {
            cacheMap = new Map(Object.entries(detailsCache));
        }
    }
    const seenCanonicalIds = new Set();
    const titleParts = [];
    for (const scene of scenes) {
        const rawSeeds = toSeedArtistsArray(scene.seedArtists);
        for (const seed of rawSeeds) {
            if (!seed || typeof seed !== 'string')
                continue;
            const strippedSeed = stripSceneNamespace(seed).trim();
            if (!strippedSeed)
                continue;
            // Extract canonical slug and strip ISO country codes (-us, -gb, etc.)
            const bareSlug = strippedSeed
                .toLowerCase()
                .replace(/-(?:us|gb|uk|de|fr|ca|au|jp|se|no|fi|nl|be|ch|at|es|it|br|mx|nz|ie|pl|za)$/i, '')
                .trim();
            const canonNorm = bareSlug.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
            if (!canonNorm || seenCanonicalIds.has(canonNorm))
                continue;
            seenCanonicalIds.add(canonNorm);
            // Attempt to resolve display name from detailsCache
            let displayName = null;
            if (cacheMap) {
                const entry = cacheMap.get(strippedSeed) ||
                    cacheMap.get(canonNorm) ||
                    cacheMap.get(strippedSeed.toLowerCase()) ||
                    cacheMap.get(bareSlug);
                if (entry) {
                    displayName = entry.details?.artist || entry.artist || entry.name || entry.title || null;
                }
            }
            if (!displayName) {
                // If the seed was already formatted (e.g. "Sense Field" or "Jimmy Eat World")
                if (strippedSeed.includes(' ') && !strippedSeed.includes('-')) {
                    displayName = strippedSeed;
                }
                else {
                    // Format slug into Title Case
                    displayName = bareSlug
                        .split(/[-_]+/)
                        .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
                        .join(' ');
                }
            }
            titleParts.push(displayName);
        }
    }
    return titleParts.length > 0 ? titleParts.join(' + ') : 'Untitled Zcene';
}
/**
 * Compacts a detailsCache (Map, array of entries, or JSON string) into a deduplicated
 * array of [canonicalKey, profile] entries, storing exactly one canonical entry per entity
 * to prevent document bloat and respect Firestore's 1MB limit.
 *
 * Rules:
 * 1. Strips any scene namespace prefixes (scene-k::) from keys.
 * 2. Groups alias variants ("Sense Field", "sense-field", "sense-field-us", etc.) by base slug.
 * 3. Prefers geographically-suffixed IDs (e.g. "sense-field-us") over bare slugs ("sense-field").
 * 4. Preserves 100% of the profile fields, retaining the richest profile payload.
 */
function compactDetailsCacheToCanonical(rawCache, nodes) {
    if (!rawCache)
        return [];
    let entries = [];
    if (typeof rawCache === 'string') {
        try {
            const parsed = JSON.parse(rawCache);
            return compactDetailsCacheToCanonical(parsed, nodes);
        }
        catch {
            return [];
        }
    }
    else if (rawCache instanceof Map || (typeof rawCache?.get === 'function' && typeof rawCache?.set === 'function')) {
        entries = Array.from(rawCache.entries());
    }
    else if (Array.isArray(rawCache)) {
        for (const item of rawCache) {
            if (Array.isArray(item) && item.length >= 2) {
                if (Array.isArray(item[1]) && item[1].length >= 2 && typeof item[1][1] === 'object') {
                    // Defensive unwrap if nested under index: [ '1', [ 'Sense Field', profile ] ]
                    entries.push([String(item[1][0]), item[1][1]]);
                }
                else {
                    entries.push([String(item[0]), item[1]]);
                }
            }
            else if (item && typeof item === 'object' && item.id) {
                entries.push([String(item.id), item]);
            }
        }
    }
    else if (typeof rawCache === 'object') {
        entries = Object.entries(rawCache);
    }
    if (entries.length === 0)
        return [];
    // ISO country suffix pattern (matches e.g. -us, -gb, -de, etc.)
    const ISO_SUFFIX_REGEX = /-(?:us|gb|uk|de|fr|ca|au|jp|se|no|fi|nl|be|ch|at|es|it|br|mx|nz|ie|pl|za)$/i;
    // Index any canonical node IDs passed in
    const nodeCanonicalMap = new Map();
    if (Array.isArray(nodes)) {
        for (const n of nodes) {
            if (!n)
                continue;
            const cleanId = stripSceneNamespace(n.id || '').trim().toLowerCase();
            const cleanCanon = stripSceneNamespace(n.canonicalId || '').trim().toLowerCase();
            const cleanName = normalizeCanonicalEntityId(n.name || n.details?.artist || '');
            if (cleanCanon) {
                if (cleanId)
                    nodeCanonicalMap.set(cleanId, cleanCanon);
                if (cleanName)
                    nodeCanonicalMap.set(cleanName, cleanCanon);
                const canonBaseSlug = cleanCanon.replace(ISO_SUFFIX_REGEX, '');
                if (canonBaseSlug)
                    nodeCanonicalMap.set(canonBaseSlug, cleanCanon);
            }
        }
    }
    const groups = new Map();
    for (const [rawKey, profile] of entries) {
        if (!rawKey || !profile || typeof profile !== 'object')
            continue;
        const cleanKey = stripSceneNamespace(String(rawKey)).trim();
        if (!cleanKey)
            continue;
        const lowerKey = cleanKey.toLowerCase();
        const artistName = profile.details?.artist || profile.artist || profile.name || profile.title || '';
        const nameNorm = normalizeCanonicalEntityId(artistName);
        // Base slug stripped of ISO suffix
        const baseSlug = lowerKey.replace(ISO_SUFFIX_REGEX, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
        const canonicalOverride = nodeCanonicalMap.get(lowerKey) || nodeCanonicalMap.get(baseSlug) || (nameNorm ? nodeCanonicalMap.get(nameNorm) : undefined);
        const groupKey = canonicalOverride ? canonicalOverride.replace(ISO_SUFFIX_REGEX, '') : (baseSlug || nameNorm);
        if (!groupKey)
            continue;
        // Calculate score for canonical key selection:
        // 3: Contains valid ISO country suffix (e.g. sense-field-us)
        // 2: Matches a known node's canonicalId
        // 1: Is a hyphenated slug (e.g. sense-field)
        // 0: Contains spaces or uppercase
        let score = 0;
        if (ISO_SUFFIX_REGEX.test(lowerKey)) {
            score = 3;
        }
        else if (nodeCanonicalMap.has(lowerKey) || (cleanKey === nodeCanonicalMap.get(groupKey))) {
            score = 2;
        }
        else if (!cleanKey.includes(' ') && cleanKey === lowerKey) {
            score = 1;
        }
        if (!groups.has(groupKey)) {
            groups.set(groupKey, []);
        }
        groups.get(groupKey).push({ key: cleanKey, profile, score });
    }
    const result = [];
    for (const [groupKey, candidates] of groups.entries()) {
        // Sort candidates by score desc (highest priority key first)
        candidates.sort((a, b) => {
            if (b.score !== a.score)
                return b.score - a.score;
            const aHasSpace = a.key.includes(' ') ? 1 : 0;
            const bHasSpace = b.key.includes(' ') ? 1 : 0;
            if (aHasSpace !== bHasSpace)
                return aHasSpace - bHasSpace;
            return b.key.length - a.key.length;
        });
        let bestKey = candidates[0].key.toLowerCase();
        if (nodeCanonicalMap.has(groupKey)) {
            const explicitCanon = nodeCanonicalMap.get(groupKey);
            if (explicitCanon)
                bestKey = explicitCanon;
        }
        let bestProfile = candidates[0].profile;
        for (const c of candidates) {
            if ((c.profile.discography?.length || 0) > (bestProfile.discography?.length || 0) ||
                (c.profile.summary?.length || 0) > (bestProfile.summary?.length || 0)) {
                bestProfile = c.profile;
            }
        }
        result.push([bestKey, bestProfile]);
    }
    return result;
}
//# sourceMappingURL=multiSceneUtils.js.map