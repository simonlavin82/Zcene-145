import {
  Node,
  Link,
  GraphData,
  ProjectScene,
  CrossSceneLink,
  CanvasNodeRef,
  SceneCenterOffset,
  DiscoveryFilters,
} from '../types';
import { stripCountrySlug } from './isoCountries';

export const SCENE_BASE_CENTER_X = 1000;
export const SCENE_BASE_CENTER_Y = 1000;
export const SCENE_HORIZONTAL_STRIDE = 1600;

export function getSceneCenterOffset(sceneIndex: number): SceneCenterOffset {
  const safeIndex = Number.isFinite(sceneIndex) && sceneIndex >= 0 ? Math.floor(sceneIndex) : 0;
  return {
    x: SCENE_BASE_CENTER_X + safeIndex * SCENE_HORIZONTAL_STRIDE,
    y: SCENE_BASE_CENTER_Y,
  };
}

export function namespaceSceneNodeId(sceneId: string, canonicalId: string): string {
  const cleanSceneId = (sceneId || 'scene-1').trim();
  const cleanCanonical = stripSceneNamespace(canonicalId);
  return `${cleanSceneId}::${cleanCanonical}`;
}

export function stripSceneNamespace(nodeId: string): string {
  if (!nodeId || typeof nodeId !== 'string') return '';
  return nodeId.replace(/^scene-\d+::/i, '').trim();
}

export function extractSceneIdFromNodeId(nodeId: string): string | null {
  if (!nodeId || typeof nodeId !== 'string') return null;
  const match = nodeId.match(/^(scene-\d+)::/i);
  return match ? match[1].toLowerCase() : null;
}

export function normalizeCanonicalEntityId(id: string): string {
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
export function toSeedArtistsArray(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    const out: string[] = [];
    for (const item of raw) {
      if (typeof item === 'string') {
        for (const part of item.split('::')) {
          const trimmed = part.trim();
          if (trimmed) out.push(trimmed);
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
export function toSeedArtistsString(raw: unknown): string {
  return toSeedArtistsArray(raw).join('::');
}

export function isCanonicalSeedMatch(nodeIdOrLabel: string, seedList: string[]): boolean {
  if (!nodeIdOrLabel || !Array.isArray(seedList) || seedList.length === 0) return false;
  const targetNorm = normalizeCanonicalEntityId(nodeIdOrLabel);
  const targetBare = stripCountrySlug(targetNorm);
  if (!targetNorm) return false;

  return seedList.some((seed) => {
    const seedNorm = normalizeCanonicalEntityId(seed);
    const seedBare = stripCountrySlug(seedNorm);
    if (!seedNorm) return false;
    return (
      targetNorm === seedNorm ||
      (targetBare && seedBare && targetBare === seedBare)
    );
  });
}

/**
 * Canonicalizes a `ProjectScene` object so that `sceneId` & `id`, `title` & `name`,
 * `seedArtists` (string), and `seedIds` & `seedArtistIds` (string[]) are always
 * present and synchronized across frontend and backend boundaries.
 */
export function normalizeProjectScene(
  raw: Partial<ProjectScene> | Record<string, any> | null | undefined,
  fallbackIndex: number = 0
): ProjectScene {
  const s = raw || {};
  const sceneIndex =
    typeof s.sceneIndex === 'number' && Number.isFinite(s.sceneIndex) && s.sceneIndex >= 0
      ? Math.floor(s.sceneIndex)
      : Math.max(0, Math.floor(fallbackIndex));
  const sceneId = String(s.sceneId || s.id || `scene-${sceneIndex + 1}`).trim();

  let graphData: GraphData = { nodes: [], links: [] };
  if (s.graphData) {
    try {
      const parsedGraph =
        typeof s.graphData === 'string' ? JSON.parse(s.graphData) : s.graphData;
      if (parsedGraph && typeof parsedGraph === 'object') {
        graphData = {
          nodes: Array.isArray(parsedGraph.nodes) ? parsedGraph.nodes : [],
          links: Array.isArray(parsedGraph.links) ? parsedGraph.links : [],
          ...(parsedGraph.synthesisRationale
            ? { synthesisRationale: parsedGraph.synthesisRationale }
            : {}),
        };
      }
    } catch {
      graphData = { nodes: [], links: [] };
    }
  }

  let discoveryFilters: DiscoveryFilters = {};
  if (s.discoveryFilters) {
    try {
      const parsedFilters =
        typeof s.discoveryFilters === 'string'
          ? JSON.parse(s.discoveryFilters)
          : s.discoveryFilters;
      if (parsedFilters && typeof parsedFilters === 'object') {
        discoveryFilters = parsedFilters;
      }
    } catch {
      discoveryFilters = {};
    }
  }

  const seedsArray = toSeedArtistsArray(s.seedArtists);
  const seedArtists = seedsArray.join('::');
  const rawSeedIds =
    Array.isArray(s.seedIds) && s.seedIds.length > 0
      ? s.seedIds
      : Array.isArray(s.seedArtistIds) && s.seedArtistIds.length > 0
        ? s.seedArtistIds
        : [];
  const seedIds =
    rawSeedIds.length > 0
      ? rawSeedIds.map((id: any) => String(id).trim()).filter(Boolean)
      : seedsArray.map((seed) => normalizeCanonicalEntityId(seed)).filter(Boolean);

  const rawTitle = String(s.title || s.name || '').trim();
  const isGenericDefaultTitle = /^Scene\s+\d+$/i.test(rawTitle);
  const title =
    rawTitle && (!isGenericDefaultTitle || seedsArray.length === 0)
      ? rawTitle
      : seedsArray.length > 0
        ? seedsArray.join(' + ')
        : `Scene ${sceneIndex + 1}`;

  const status =
    s.status ||
    (graphData.nodes && graphData.nodes.length > 0 ? 'ready' : 'unmapped');

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
    centerOffset: s.centerOffset || getSceneCenterOffset(sceneIndex),
    status,
    ...(s.pathway ? { pathway: s.pathway } : {}),
    ...(s.generationType ? { generationType: s.generationType } : {}),
    updatedAt: typeof s.updatedAt === 'number' ? s.updatedAt : Date.now(),
  };
}

export function createEmptyProjectScene(
  sceneIndex: number,
  seedArtists: string | string[] = '',
  discoveryFilters: DiscoveryFilters = {}
): ProjectScene {
  return normalizeProjectScene(
    {
      sceneIndex,
      seedArtists: toSeedArtistsString(seedArtists),
      discoveryFilters: discoveryFilters || {},
      graphData: { nodes: [], links: [] },
      synthesisRationale: '',
      artistSnippets: {},
      centerOffset: getSceneCenterOffset(sceneIndex),
      status: 'unmapped',
      updatedAt: Date.now(),
    },
    sceneIndex
  );
}

export const createEmptyScene = createEmptyProjectScene;

/**
 * Normalizes a `CrossSceneLink` so both `sourceSceneId`/`targetSceneId` and
 * `fromSceneId`/`toSceneId` (plus `sourceCanonicalId`/`targetCanonicalId` and
 * `fromNodeId`/`toNodeId`) are always populated and consistent.
 */
export function normalizeCrossSceneLink(
  raw: Partial<CrossSceneLink> | Record<string, any> | null | undefined
): CrossSceneLink | null {
  if (!raw || typeof raw !== 'object') return null;
  const sourceSceneId = String(raw.sourceSceneId || raw.fromSceneId || '').trim();
  const targetSceneId = String(raw.targetSceneId || raw.toSceneId || '').trim();
  if (!sourceSceneId || !targetSceneId || sourceSceneId === targetSceneId) return null;

  const sourceCanonicalId = stripSceneNamespace(
    String(raw.sourceCanonicalId || raw.fromNodeId || raw.sourceNodeId || '').trim()
  );
  const targetCanonicalId = stripSceneNamespace(
    String(raw.targetCanonicalId || raw.toNodeId || raw.targetNodeId || '').trim()
  );
  if (!sourceCanonicalId || !targetCanonicalId) return null;

  const sourceNodeId =
    raw.sourceNodeId && String(raw.sourceNodeId).includes('::')
      ? String(raw.sourceNodeId).trim()
      : namespaceSceneNodeId(sourceSceneId, sourceCanonicalId);
  const targetNodeId =
    raw.targetNodeId && String(raw.targetNodeId).includes('::')
      ? String(raw.targetNodeId).trim()
      : namespaceSceneNodeId(targetSceneId, targetCanonicalId);
  const id = String(raw.id || `${sourceNodeId}--${targetNodeId}`).trim();
  const bridgeType = raw.bridgeType === 'sonic_lineage' ? 'sonic_lineage' : 'identity';
  const forwardContext = String(
    raw.forwardContext || 'bridges both constellations as a shared anchor with'
  ).trim();
  const inverseContext = String(raw.inverseContext || forwardContext).trim();
  const weight =
    typeof raw.weight === 'number' && Number.isFinite(raw.weight)
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
export function computeDeterministicIdentityBridges(scenes: ProjectScene[]): CrossSceneLink[] {
  if (!Array.isArray(scenes) || scenes.length < 2) return [];

  const bridges: CrossSceneLink[] = [];
  const seenBridgeKeys = new Set<string>();

  for (let i = 0; i < scenes.length; i++) {
    const sceneA = scenes[i];
    const nodesA = sceneA?.graphData?.nodes || [];
    if (nodesA.length === 0) continue;

    const seedsA = sceneA.seedIds?.length
      ? sceneA.seedIds
      : sceneA.seedArtistIds?.length
        ? sceneA.seedArtistIds
        : toSeedArtistsArray(sceneA.seedArtists);

    for (let j = i + 1; j < scenes.length; j++) {
      const sceneB = scenes[j];
      const nodesB = sceneB?.graphData?.nodes || [];
      if (nodesB.length === 0) continue;

      const seedsB = sceneB.seedIds?.length
        ? sceneB.seedIds
        : sceneB.seedArtistIds?.length
          ? sceneB.seedArtistIds
          : toSeedArtistsArray(sceneB.seedArtists);

      for (const nodeA of nodesA) {
        if (nodeA.type !== 'artist' && nodeA.type !== 'label') continue;
        const canonA = stripSceneNamespace(nodeA.canonicalId || nodeA.id);
        const normA = normalizeCanonicalEntityId(canonA);
        const bareA = stripCountrySlug(normA);

        const matchingNodeB = nodesB.find((nodeB) => {
          if (nodeB.type !== nodeA.type) return false;
          const canonB = stripSceneNamespace(nodeB.canonicalId || nodeB.id);
          const normB = normalizeCanonicalEntityId(canonB);
          if (normA === normB) return true;
          const bareB = stripCountrySlug(normB);
          return Boolean(bareA && bareB && bareA === bareB && normA === normB);
        });

        if (!matchingNodeB) continue;

        const sceneAId = sceneA.sceneId || sceneA.id || `scene-${i + 1}`;
        const sceneBId = sceneB.sceneId || sceneB.id || `scene-${j + 1}`;
        const canonB = stripSceneNamespace(matchingNodeB.canonicalId || matchingNodeB.id);
        const sourceNodeId = namespaceSceneNodeId(sceneAId, canonA);
        const targetNodeId = namespaceSceneNodeId(sceneBId, canonB);
        const bridgeId = `${sourceNodeId}--${targetNodeId}`;

        if (seenBridgeKeys.has(bridgeId)) continue;
        seenBridgeKeys.add(bridgeId);

        const isSeedInA =
          nodeA.type === 'artist' &&
          (Boolean(nodeA.isSceneSeed) || Boolean(nodeA.isSeed) || isCanonicalSeedMatch(canonA, seedsA));
        const isSeedInB =
          matchingNodeB.type === 'artist' &&
          (Boolean(matchingNodeB.isSceneSeed) || Boolean(matchingNodeB.isSeed) || isCanonicalSeedMatch(canonB, seedsB));

        let forwardContext = 'bridges both constellations as a shared anchor with';
        let inverseContext = 'bridges both constellations as a shared anchor with';

        if (!isSeedInA && isSeedInB) {
          forwardContext = 'appears as a foundational Root Artist in';
          inverseContext = 'emerged as a recommended peer within';
        } else if (isSeedInA && !isSeedInB) {
          forwardContext = 'emerged as a recommended peer within';
          inverseContext = 'appears as a foundational Root Artist in';
        } else if (nodeA.type === 'label') {
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
        if (normalizedBridge) bridges.push(normalizedBridge);
      }
    }
  }

  return bridges;
}

/**
 * Merges deterministic `identity` bridges with AI-synthesized `sonic_lineage` bridges,
 * ensuring deterministic identity bridges take precedence on identical endpoint pairs.
 */
export function mergeCrossSceneLinks(
  deterministicBridges: CrossSceneLink[],
  aiBridges: CrossSceneLink[] = []
): CrossSceneLink[] {
  const merged = new Map<string, CrossSceneLink>();

  const makePairKey = (link: CrossSceneLink): string => {
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
    if (d) merged.set(makePairKey(d), d);
  }

  for (const rawAi of aiBridges || []) {
    const ai = normalizeCrossSceneLink(rawAi);
    if (!ai) continue;
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
export function buildCompositeCanvasGraph(
  scenes: ProjectScene[],
  crossSceneLinks: CrossSceneLink[] = [],
  savedLayout?: CanvasNodeRef[] | null
): GraphData {
  if (!Array.isArray(scenes) || scenes.length === 0) {
    return { nodes: [], links: [] };
  }

  const layoutMap = new Map<string, CanvasNodeRef>();
  if (Array.isArray(savedLayout)) {
    for (const ref of savedLayout) {
      const refKey = ref?.id || ref?.nodeId;
      if (refKey) {
        layoutMap.set(refKey, ref);
        layoutMap.set(refKey.toLowerCase(), ref);
      }
    }
  }

  const compositeNodes: Node[] = [];
  const compositeLinks: Link[] = [];
  const nodeExistsSet = new Set<string>();

  scenes.forEach((scene, idx) => {
    const sceneIndex = typeof scene.sceneIndex === 'number' ? scene.sceneIndex : idx;
    const sceneId = scene.sceneId || scene.id || `scene-${sceneIndex + 1}`;
    const center = scene.centerOffset || getSceneCenterOffset(sceneIndex);
    const seedList = scene.seedIds?.length
      ? scene.seedIds
      : scene.seedArtistIds?.length
        ? scene.seedArtistIds
        : toSeedArtistsArray(scene.seedArtists);

    const rawNodes = scene.graphData?.nodes || [];
    const rawLinks = scene.graphData?.links || [];

    for (const rawNode of rawNodes) {
      if (!rawNode || !rawNode.id) continue;
      const canonicalId = stripSceneNamespace(rawNode.canonicalId || rawNode.id);
      const namespacedId = namespaceSceneNodeId(sceneId, canonicalId);
      if (nodeExistsSet.has(namespacedId.toLowerCase())) continue;
      nodeExistsSet.add(namespacedId.toLowerCase());

      const isSceneSeed =
        rawNode.type === 'artist' &&
        (Boolean(rawNode.isSceneSeed) ||
          Boolean(rawNode.isSeed) ||
          isCanonicalSeedMatch(canonicalId, seedList) ||
          (rawNode.label ? isCanonicalSeedMatch(rawNode.label, seedList) : false));

      const savedRef =
        layoutMap.get(namespacedId) ||
        layoutMap.get(namespacedId.toLowerCase()) ||
        (sceneIndex === 0 ? layoutMap.get(canonicalId) || layoutMap.get(canonicalId.toLowerCase()) : undefined);

      const hasSavedCoords =
        savedRef && typeof savedRef.x === 'number' && typeof savedRef.y === 'number';

      const snippetFromScene =
        scene.artistSnippets?.[canonicalId] ||
        scene.artistSnippets?.[canonicalId.toLowerCase()] ||
        rawNode.narrativeSnippet;

      const nodeClone: Node = {
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
        nodeClone.x = savedRef!.x;
        nodeClone.y = savedRef!.y;
        nodeClone.fx = savedRef!.x;
        nodeClone.fy = savedRef!.y;
      } else if (typeof rawNode.x === 'number' && typeof rawNode.y === 'number') {
        nodeClone.x = rawNode.x;
        nodeClone.y = rawNode.y;
        if (typeof rawNode.fx === 'number' && typeof rawNode.fy === 'number') {
          nodeClone.fx = rawNode.fx;
          nodeClone.fy = rawNode.fy;
        }
      } else {
        // Initialize near the deterministic Scene center so D3 blooms cleanly around (1000 + k*1600, 1000)
        const angle = (compositeNodes.length * 137.5 * Math.PI) / 180;
        const radius = isSceneSeed ? 25 : 90 + (compositeNodes.length % 7) * 30;
        nodeClone.x = center.x + Math.cos(angle) * radius;
        nodeClone.y = center.y + Math.sin(angle) * radius;
      }

      compositeNodes.push(nodeClone);
    }

    for (const rawLink of rawLinks) {
      if (!rawLink) continue;
      const rawSource = typeof rawLink.source === 'string' ? rawLink.source : rawLink.source?.id;
      const rawTarget = typeof rawLink.target === 'string' ? rawLink.target : rawLink.target?.id;
      if (!rawSource || !rawTarget) continue;

      const sourceNamespaced = namespaceSceneNodeId(sceneId, stripSceneNamespace(rawSource));
      const targetNamespaced = namespaceSceneNodeId(sceneId, stripSceneNamespace(rawTarget));

      if (
        !nodeExistsSet.has(sourceNamespaced.toLowerCase()) ||
        !nodeExistsSet.has(targetNamespaced.toLowerCase())
      ) {
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
      sourceSceneId: srcSceneId,
      targetSceneId: tgtSceneId,
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
export function computeDeduplicatedActiveNodes(scenes: ProjectScene[]): string[] {
  if (!Array.isArray(scenes) || scenes.length === 0) return [];

  const seenCanonicalNorms = new Set<string>();
  const orderedArtists: string[] = [];
  const orderedLabels: string[] = [];

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
      if (node.type !== 'artist') continue;
      const canonId = stripSceneNamespace(node.canonicalId || node.id);
      const isSeed =
        Boolean(node.isSceneSeed) ||
        Boolean(node.isSeed) ||
        isCanonicalSeedMatch(canonId, seedList) ||
        (node.label ? isCanonicalSeedMatch(node.label, seedList) : false);
      if (!isSeed) continue;

      const norm = normalizeCanonicalEntityId(canonId);
      if (norm && !seenCanonicalNorms.has(norm)) {
        seenCanonicalNorms.add(norm);
        orderedArtists.push(canonId);
      }
    }

    // 2. Scene Peer Artists
    for (const node of nodes) {
      if (node.type !== 'artist') continue;
      const canonId = stripSceneNamespace(node.canonicalId || node.id);
      const norm = normalizeCanonicalEntityId(canonId);
      if (norm && !seenCanonicalNorms.has(norm)) {
        seenCanonicalNorms.add(norm);
        orderedArtists.push(canonId);
      }
    }

    // 3. Scene Record Labels
    for (const node of nodes) {
      if (node.type !== 'label') continue;
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
export function buildCanonicalDeduplicatedNodesFromScenes(scenes: ProjectScene[]): Node[] {
  if (!Array.isArray(scenes) || scenes.length === 0) return [];

  const allProjectSeeds = getAllProjectSeedIds(scenes);
  const canonicalNodeMap = new Map<string, Node>();
  const orderedKeys: string[] = [];

  const sortedScenes = [...scenes].sort((a, b) => (a.sceneIndex ?? 0) - (b.sceneIndex ?? 0));

  for (const scene of sortedScenes) {
    const nodes = scene?.graphData?.nodes || [];
    for (const rawNode of nodes) {
      if (!rawNode || !rawNode.id) continue;
      const canonId = stripSceneNamespace(rawNode.canonicalId || rawNode.id);
      const norm = normalizeCanonicalEntityId(canonId);
      if (!norm) continue;

      const isRootInAnyScene =
        rawNode.type === 'artist' &&
        (Boolean(rawNode.isSceneSeed) ||
          Boolean(rawNode.isSeed) ||
          isCanonicalSeedMatch(canonId, allProjectSeeds) ||
          (rawNode.label ? isCanonicalSeedMatch(rawNode.label, allProjectSeeds) : false));

      const snippet =
        scene.artistSnippets?.[canonId] ||
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
      } else {
        const existing = canonicalNodeMap.get(norm)!;
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

  const allNodes = orderedKeys.map((k) => canonicalNodeMap.get(k)!);
  const artistNodes = allNodes.filter((n) => n.type === 'artist' || !n.type);
  const labelNodes = allNodes.filter((n) => n.type === 'label');
  const otherNodes = allNodes.filter((n) => n.type && n.type !== 'artist' && n.type !== 'label');
  return [...artistNodes, ...labelNodes, ...otherNodes];
}

export function getAllProjectSeedIds(scenes: ProjectScene[]): string[] {
  if (!Array.isArray(scenes)) return [];
  const seen = new Set<string>();
  const result: string[] = [];

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

export function getAllProjectSeedArtistsString(scenes: ProjectScene[]): string {
  if (!Array.isArray(scenes) || scenes.length === 0) return '';
  const seen = new Set<string>();
  const names: string[] = [];

  for (const scene of scenes) {
    const rawNames = toSeedArtistsArray(scene?.seedArtists);
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

export function parseProjectScenes(
  rawScenes: string | ProjectScene[] | null | undefined
): ProjectScene[] {
  if (!rawScenes) return [];
  try {
    const parsed = typeof rawScenes === 'string' ? JSON.parse(rawScenes) : rawScenes;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((s: any, idx: number) => normalizeProjectScene(s, idx));
  } catch (e) {
    console.warn('[parseProjectScenes] Failed to parse scenes:', e);
    return [];
  }
}

export function parseCrossSceneLinks(
  rawLinks: string | CrossSceneLink[] | null | undefined
): CrossSceneLink[] {
  if (!rawLinks) return [];
  try {
    const parsed = typeof rawLinks === 'string' ? JSON.parse(rawLinks) : rawLinks;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((l: any) => normalizeCrossSceneLink(l))
      .filter((l): l is CrossSceneLink => l !== null);
  } catch (e) {
    console.warn('[parseCrossSceneLinks] Failed to parse crossSceneLinks:', e);
    return [];
  }
}
