"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createEmptyScene = exports.SCENE_HORIZONTAL_STRIDE = exports.SCENE_BASE_CENTER_Y = exports.SCENE_BASE_CENTER_X = void 0;
exports.getSceneCenterOffset = getSceneCenterOffset;
exports.namespaceSceneNodeId = namespaceSceneNodeId;
exports.stripSceneNamespace = stripSceneNamespace;
exports.extractSceneIdFromNodeId = extractSceneIdFromNodeId;
exports.normalizeCanonicalEntityId = normalizeCanonicalEntityId;
exports.isCanonicalSeedMatch = isCanonicalSeedMatch;
exports.createEmptyProjectScene = createEmptyProjectScene;
exports.computeDeterministicIdentityBridges = computeDeterministicIdentityBridges;
exports.mergeCrossSceneLinks = mergeCrossSceneLinks;
exports.buildCompositeCanvasGraph = buildCompositeCanvasGraph;
exports.computeDeduplicatedActiveNodes = computeDeduplicatedActiveNodes;
exports.buildCanonicalDeduplicatedNodesFromScenes = buildCanonicalDeduplicatedNodesFromScenes;
exports.getAllProjectSeedIds = getAllProjectSeedIds;
exports.getAllProjectSeedArtistsString = getAllProjectSeedArtistsString;
exports.parseProjectScenes = parseProjectScenes;
exports.parseCrossSceneLinks = parseCrossSceneLinks;
const isoCountries_1 = require("./isoCountries");
exports.SCENE_BASE_CENTER_X = 1000;
exports.SCENE_BASE_CENTER_Y = 1000;
exports.SCENE_HORIZONTAL_STRIDE = 1600;
function getSceneCenterOffset(sceneIndex) {
    const safeIndex = Number.isFinite(sceneIndex) && sceneIndex >= 0 ? Math.floor(sceneIndex) : 0;
    return {
        x: exports.SCENE_BASE_CENTER_X + safeIndex * exports.SCENE_HORIZONTAL_STRIDE,
        y: exports.SCENE_BASE_CENTER_Y,
    };
}
function namespaceSceneNodeId(sceneId, canonicalId) {
    const cleanSceneId = (sceneId || 'scene-1').trim();
    const cleanCanonical = stripSceneNamespace(canonicalId);
    return `${cleanSceneId}::${cleanCanonical}`;
}
function stripSceneNamespace(nodeId) {
    if (!nodeId || typeof nodeId !== 'string')
        return '';
    return nodeId.replace(/^scene-\d+::/i, '').trim();
}
function extractSceneIdFromNodeId(nodeId) {
    if (!nodeId || typeof nodeId !== 'string')
        return null;
    const match = nodeId.match(/^(scene-\d+)::/i);
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
function createEmptyProjectScene(sceneIndex, seedArtists = '', discoveryFilters = {}) {
    const sceneId = `scene-${sceneIndex + 1}`;
    const seeds = seedArtists
        .split('::')
        .map((s) => s.trim())
        .filter(Boolean);
    const title = seeds.length > 0 ? seeds.join(' + ') : `Scene ${sceneIndex + 1}`;
    return {
        id: sceneId,
        sceneId,
        sceneIndex,
        title,
        seedArtists,
        seedIds: seeds.map((s) => normalizeCanonicalEntityId(s)),
        discoveryFilters: discoveryFilters || {},
        graphData: { nodes: [], links: [] },
        synthesisRationale: '',
        artistSnippets: {},
        centerOffset: getSceneCenterOffset(sceneIndex),
        status: 'unmapped',
        updatedAt: Date.now(),
    };
}
exports.createEmptyScene = createEmptyProjectScene;
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
            : (sceneA.seedArtists || '').split('::').map((s) => s.trim()).filter(Boolean);
        for (let j = i + 1; j < scenes.length; j++) {
            const sceneB = scenes[j];
            const nodesB = sceneB?.graphData?.nodes || [];
            if (nodesB.length === 0)
                continue;
            const seedsB = sceneB.seedIds?.length
                ? sceneB.seedIds
                : (sceneB.seedArtists || '').split('::').map((s) => s.trim()).filter(Boolean);
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
                bridges.push({
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
        const a = `${link.sourceSceneId}::${normalizeCanonicalEntityId(link.sourceCanonicalId)}`;
        const b = `${link.targetSceneId}::${normalizeCanonicalEntityId(link.targetCanonicalId)}`;
        return [a, b].sort().join('--');
    };
    for (const d of deterministicBridges || []) {
        merged.set(makePairKey(d), d);
    }
    for (const ai of aiBridges || []) {
        if (!ai || !ai.sourceSceneId || !ai.targetSceneId)
            continue;
        if (ai.sourceSceneId === ai.targetSceneId)
            continue;
        const key = makePairKey(ai);
        if (!merged.has(key)) {
            merged.set(key, ai);
        }
    }
    return Array.from(merged.values());
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
        const center = scene.centerOffset || getSceneCenterOffset(sceneIndex);
        const seedList = scene.seedIds?.length
            ? scene.seedIds
            : (scene.seedArtists || '')
                .split('::')
                .map((s) => s.trim())
                .filter(Boolean);
        const rawNodes = scene.graphData?.nodes || [];
        const rawLinks = scene.graphData?.links || [];
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
            const savedRef = layoutMap.get(namespacedId) ||
                layoutMap.get(namespacedId.toLowerCase()) ||
                (sceneIndex === 0 ? layoutMap.get(canonicalId) || layoutMap.get(canonicalId.toLowerCase()) : undefined);
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
                nodeClone.x = savedRef.x;
                nodeClone.y = savedRef.y;
                nodeClone.fx = savedRef.x;
                nodeClone.fy = savedRef.y;
            }
            else if (typeof rawNode.x === 'number' && typeof rawNode.y === 'number') {
                nodeClone.x = rawNode.x;
                nodeClone.y = rawNode.y;
                if (typeof rawNode.fx === 'number' && typeof rawNode.fy === 'number') {
                    nodeClone.fx = rawNode.fx;
                    nodeClone.fy = rawNode.fy;
                }
            }
            else {
                // Initialize near the deterministic Scene center so D3 blooms cleanly around (1000 + k*1600, 1000)
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
        const srcId = bridge.sourceNodeId || namespaceSceneNodeId(bridge.sourceSceneId, bridge.sourceCanonicalId);
        const tgtId = bridge.targetNodeId || namespaceSceneNodeId(bridge.targetSceneId, bridge.targetCanonicalId);
        if (!nodeExistsSet.has(srcId.toLowerCase()) || !nodeExistsSet.has(tgtId.toLowerCase())) {
            continue;
        }
        compositeLinks.push({
            source: srcId,
            target: tgtId,
            value: 2,
            weight: typeof bridge.weight === 'number' ? bridge.weight : 0.85,
            forwardContext: bridge.forwardContext,
            inverseContext: bridge.inverseContext,
            context: bridge.forwardContext,
            isCrossSceneBridge: true,
            bridgeType: bridge.bridgeType,
            sourceSceneId: bridge.sourceSceneId,
            targetSceneId: bridge.targetSceneId,
        });
    }
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
            : (scene.seedArtists || '')
                .split('::')
                .map((s) => s.trim())
                .filter(Boolean);
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
                    sceneId: scene.sceneId,
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
            : (scene?.seedArtists || '')
                .split('::')
                .map((s) => s.trim())
                .filter(Boolean);
        for (const s of list) {
            const clean = stripSceneNamespace(s).trim();
            const norm = normalizeCanonicalEntityId(clean);
            if (norm && !seen.has(norm)) {
                seen.add(norm);
                result.push(clean);
            }
        }
    }
    return result;
}
function getAllProjectSeedArtistsString(scenes) {
    if (!Array.isArray(scenes) || scenes.length === 0)
        return '';
    const seen = new Set();
    const names = [];
    for (const scene of scenes) {
        const rawNames = (scene?.seedArtists || '')
            .split('::')
            .map((s) => s.trim())
            .filter(Boolean);
        for (const name of rawNames) {
            const norm = normalizeCanonicalEntityId(name);
            if (norm && !seen.has(norm)) {
                seen.add(norm);
                names.push(name);
            }
        }
    }
    return names.join('::');
}
function parseProjectScenes(rawScenes) {
    if (!rawScenes)
        return [];
    try {
        const parsed = typeof rawScenes === 'string' ? JSON.parse(rawScenes) : rawScenes;
        if (!Array.isArray(parsed))
            return [];
        return parsed.map((s, idx) => {
            const sceneIndex = typeof s.sceneIndex === 'number' ? s.sceneIndex : idx;
            const sceneId = s.sceneId || s.id || `scene-${sceneIndex + 1}`;
            let graphData = { nodes: [], links: [] };
            if (s.graphData) {
                graphData = typeof s.graphData === 'string' ? JSON.parse(s.graphData) : s.graphData;
            }
            let discoveryFilters = {};
            if (s.discoveryFilters) {
                discoveryFilters =
                    typeof s.discoveryFilters === 'string'
                        ? JSON.parse(s.discoveryFilters)
                        : s.discoveryFilters;
            }
            const seeds = (s.seedArtists || '')
                .split('::')
                .map((seed) => seed.trim())
                .filter(Boolean);
            return {
                id: sceneId,
                sceneId,
                sceneIndex,
                title: s.title || (seeds.length > 0 ? seeds.join(' + ') : `Scene ${sceneIndex + 1}`),
                seedArtists: s.seedArtists || '',
                seedIds: Array.isArray(s.seedIds)
                    ? s.seedIds
                    : seeds.map((seed) => normalizeCanonicalEntityId(seed)),
                discoveryFilters,
                graphData: graphData || { nodes: [], links: [] },
                synthesisRationale: s.synthesisRationale || graphData?.synthesisRationale || '',
                artistSnippets: s.artistSnippets || {},
                centerOffset: s.centerOffset || getSceneCenterOffset(sceneIndex),
                status: s.status || (graphData?.nodes?.length > 0 ? 'ready' : 'unmapped'),
                pathway: s.pathway,
                updatedAt: s.updatedAt || Date.now(),
            };
        });
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
        return Array.isArray(parsed) ? parsed : [];
    }
    catch (e) {
        console.warn('[parseCrossSceneLinks] Failed to parse crossSceneLinks:', e);
        return [];
    }
}
//# sourceMappingURL=multiSceneUtils.js.map