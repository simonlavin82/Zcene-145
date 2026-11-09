import { describe, it, expect } from 'vitest';
import {
  getSceneCenterOffset,
  namespaceSceneNodeId,
  stripSceneNamespace,
  extractSceneIdFromNodeId,
  createEmptyProjectScene,
  computeDeterministicIdentityBridges,
  mergeCrossSceneLinks,
  buildCompositeCanvasGraph,
  computeDeduplicatedActiveNodes,
  buildCanonicalDeduplicatedNodesFromScenes,
  parseProjectScenes,
  parseCrossSceneLinks,
  toSeedArtistsArray,
  toSeedArtistsString,
  normalizeProjectScene,
  normalizeCrossSceneLink,
  computeProjectCardMetrics,
  getAllProjectSeedArtistsString,
  getAllProjectSeedArtistsList,
  detectLegacyStrideShiftX,
  migrateLegacyCanvasLayout,
  generateProjectTitleFromScenes,
} from '../../shared/multiSceneUtils';
import { normalizeArtistId } from '../../services/artistCacheService';
import { TOKEN_PRICING } from '../../shared/tokenEconomy';
import { computeProjectHydrationFingerprint } from '../../utils/projectHydrationFingerprint';
import { applyShareBlacklistMutation } from '../../App';
import { ProjectScene, CrossSceneLink, CanvasNodeRef } from '../../types';

describe('V43 Multi-Scene Infinite Board & Layered Zine Architecture ([Rule 44])', () => {
  it('computes deterministic horizontal cluster center offsets (1000 + sceneIndex * 950, 1000)', () => {
    expect(getSceneCenterOffset(0)).toEqual({ x: 1000, y: 1000 });
    expect(getSceneCenterOffset(1)).toEqual({ x: 1950, y: 1000 });
    expect(getSceneCenterOffset(2)).toEqual({ x: 2900, y: 1000 });
  });

  it('namespaces canvas node IDs as scene-k::canonicalId and strips namespaces cleanly', () => {
    const namespaced = namespaceSceneNodeId('scene-2', 'jimmy-eat-world-us');
    expect(namespaced).toBe('scene-2::jimmy-eat-world-us');
    expect(stripSceneNamespace(namespaced)).toBe('jimmy-eat-world-us');
    expect(stripSceneNamespace('jimmy-eat-world-us')).toBe('jimmy-eat-world-us');
    expect(extractSceneIdFromNodeId(namespaced)).toBe('scene-2');
    expect(extractSceneIdFromNodeId('jimmy-eat-world-us')).toBeNull();
  });

  it('preserves exact V42_7 / V43 per-scene token pricing (5T Single-Seed / 10T Complex / 3T Deep Connections)', () => {
    expect(TOKEN_PRICING.SINGLE_SEED).toBe(5);
    expect(TOKEN_PRICING.COMPLEX_QUERY).toBe(10);
    expect(TOKEN_PRICING.PREFLIGHT_FLASH_FEE).toBe(1);
    expect(TOKEN_PRICING.DEEP_WEB_CONSULT).toBe(3);
  });

  it('preserves duplicate nodes across Scene 1 and Scene 2 on the infinite canvas while freezing Scene 1 Coordinate Memory ([Rule 21], [Rule 44])', () => {
    const scene1: ProjectScene = {
      ...createEmptyProjectScene(0, 'Sense Field::Reason to Believe'),
      seedIds: ['sense-field-us', 'reason-to-believe-us'],
      status: 'ready',
      synthesisRationale: 'Scene 1 editorial on Southern California melodic hardcore.',
      graphData: {
        nodes: [
          { id: 'sense-field-us', label: 'Sense Field', type: 'artist', group: 1, isSeed: true },
          { id: 'reason-to-believe-us', label: 'Reason to Believe', type: 'artist', group: 1, isSeed: true },
          { id: 'jimmy-eat-world-us', label: 'Jimmy Eat World', type: 'artist', group: 2, isSeed: false },
          { id: 'revelation', label: 'Revelation', type: 'label', group: 3 },
        ],
        links: [
          { source: 'sense-field-us', target: 'jimmy-eat-world-us', value: 1, forwardContext: 'paved the melodic alt-rock crossover for', inverseContext: 'drew soaring post-hardcore dynamics from' },
          { source: 'sense-field-us', target: 'revelation', value: 1 },
        ],
      },
    };

    const scene2: ProjectScene = {
      ...createEmptyProjectScene(1, 'Jimmy Eat World'),
      seedIds: ['jimmy-eat-world-us'],
      status: 'ready',
      synthesisRationale: 'Scene 2 editorial on Mesa, Arizona emo crossover.',
      graphData: {
        nodes: [
          { id: 'jimmy-eat-world-us', label: 'Jimmy Eat World', type: 'artist', group: 1, isSeed: true },
          { id: 'christie-front-drive-us', label: 'Christie Front Drive', type: 'artist', group: 2, isSeed: false },
          { id: 'revelation', label: 'Revelation', type: 'label', group: 3 },
        ],
        links: [
          { source: 'jimmy-eat-world-us', target: 'christie-front-drive-us', value: 1 },
        ],
      },
    };

    const savedLayout: CanvasNodeRef[] = [
      { nodeId: 'scene-1::sense-field-us', x: 980, y: 1010, fx: 980, fy: 1010 },
      { nodeId: 'scene-1::jimmy-eat-world-us', x: 1120, y: 920, fx: 1120, fy: 920 },
    ];

    const aiBridges: CrossSceneLink[] = [
      {
        id: 'scene-1::sense-field-us--scene-2::christie-front-drive-us',
        sourceSceneId: 'scene-1',
        targetSceneId: 'scene-2',
        sourceNodeId: 'scene-1::sense-field-us',
        targetNodeId: 'scene-2::christie-front-drive-us',
        sourceCanonicalId: 'sense-field-us',
        targetCanonicalId: 'christie-front-drive-us',
        bridgeType: 'sonic_lineage',
        forwardContext: 'shaped the shimmering guitar dynamics of',
        inverseContext: 'echoed the cathartic post-hardcore warmth of',
        weight: 0.85,
      },
    ];

    const composite = buildCompositeCanvasGraph([scene1, scene2], aiBridges, savedLayout);

    // Duplicate nodes preserved in their respective scenes
    const jewScene1 = composite.nodes.find((n) => n.id === 'scene-1::jimmy-eat-world-us');
    const jewScene2 = composite.nodes.find((n) => n.id === 'scene-2::jimmy-eat-world-us');
    expect(jewScene1).toBeDefined();
    expect(jewScene2).toBeDefined();
    expect(jewScene1?.canonicalId).toBe('jimmy-eat-world-us');
    expect(jewScene2?.canonicalId).toBe('jimmy-eat-world-us');

    // In Scene 1 Jimmy Eat World is a recommended peer (isSeed: false); in Scene 2 it is the Root Artist (isSeed: true)
    expect(jewScene1?.isSeed).toBe(false);
    expect(jewScene2?.isSeed).toBe(true);

    // Coordinate Memory ([Rule 21]) freezes Scene 1 nodes at their saved (fx, fy)
    expect(jewScene1?.fx).toBe(1120);
    expect(jewScene1?.fy).toBe(920);

    // Scene 2 nodes initialize near Scene 2 center (1950, 1000)
    expect(jewScene2?.x).toBeGreaterThan(1750);
    expect(jewScene2?.x).toBeLessThan(2150);

    // Deterministic identity bridges + AI sonic_lineage bridges are present as Cross-Scene Bridge links
    const crossLinks = composite.links.filter((l) => l.isCrossSceneBridge);
    expect(crossLinks.length).toBeGreaterThanOrEqual(3); // jimmy-eat-world-us identity + revelation identity + sonic_lineage bridge
    const identityBridge = crossLinks.find(
      (l) => l.source === 'scene-1::jimmy-eat-world-us' && l.target === 'scene-2::jimmy-eat-world-us'
    );
    expect(identityBridge).toBeDefined();
    expect(identityBridge?.bridgeType).toBe('identity');
    expect(identityBridge?.forwardContext).toBe('appears as a foundational Root Artist in');

    const sonicBridge = crossLinks.find(
      (l) => l.source === 'scene-1::sense-field-us' && l.target === 'scene-2::christie-front-drive-us'
    );
    expect(sonicBridge).toBeDefined();
    expect(sonicBridge?.bridgeType).toBe('sonic_lineage');
  });

  it('deduplicates Deep Cuts by canonical ID and elevates isSeed=true if an artist is a Root in ANY scene ([Rule 29], [Rule 44])', () => {
    const scene1: ProjectScene = {
      ...createEmptyProjectScene(0, 'Sense Field'),
      seedIds: ['sense-field-us'],
      status: 'ready',
      graphData: {
        nodes: [
          { id: 'sense-field-us', label: 'Sense Field', type: 'artist', group: 1, isSeed: true },
          { id: 'jimmy-eat-world-us', label: 'Jimmy Eat World', type: 'artist', group: 2, isSeed: false },
          { id: 'revelation', label: 'Revelation', type: 'label', group: 3 },
        ],
        links: [],
      },
    };
    const scene2: ProjectScene = {
      ...createEmptyProjectScene(1, 'Jimmy Eat World'),
      seedIds: ['jimmy-eat-world-us'],
      status: 'ready',
      graphData: {
        nodes: [
          { id: 'jimmy-eat-world-us', label: 'Jimmy Eat World', type: 'artist', group: 1, isSeed: true },
          { id: 'mineral-us', label: 'Mineral', type: 'artist', group: 2, isSeed: false },
          { id: 'revelation', label: 'Revelation', type: 'label', group: 3 },
        ],
        links: [],
      },
    };

    const dedupIds = computeDeduplicatedActiveNodes([scene1, scene2]);
    // Artists ordered before Labels (Canonical Presentation Sort) with zero duplicates
    expect(dedupIds).toEqual(['sense-field-us', 'jimmy-eat-world-us', 'mineral-us', 'revelation']);

    const dedupNodes = buildCanonicalDeduplicatedNodesFromScenes([scene1, scene2]);
    expect(dedupNodes.map((n) => n.id)).toEqual(['sense-field-us', 'jimmy-eat-world-us', 'mineral-us', 'revelation']);
    const jewCanonical = dedupNodes.find((n) => n.id === 'jimmy-eat-world-us');
    expect(jewCanonical?.isSeed).toBe(true);
  });

  it('strips coordinates from both composite graphData and per-scene graphData during Share Blacklist Mutation ([Rule 25])', () => {
    const sharePayload: any = {
      canvasLayout: JSON.stringify([{ nodeId: 'scene-1::sense-field-us', x: 1000, y: 1000, fx: 1000, fy: 1000 }]),
      graphData: JSON.stringify({
        nodes: [{ id: 'scene-1::sense-field-us', x: 1000, y: 1000, fx: 1000, fy: 1000 }],
        links: [{ source: { id: 'scene-1::sense-field-us' }, target: { id: 'scene-1::revelation' } }],
      }),
      scenes: [
        {
          id: 'scene-1',
          sceneId: 'scene-1',
          graphData: {
            nodes: [{ id: 'sense-field-us', x: 1000, y: 1000, fx: 1000, fy: 1000 }],
            links: [{ source: { id: 'sense-field-us' }, target: { id: 'revelation' } }],
          },
        },
      ],
    };

    const sanitized = applyShareBlacklistMutation(sharePayload);
    expect(sanitized.canvasLayout).toBeUndefined();
    const parsedComposite = JSON.parse(sanitized.graphData);
    expect(parsedComposite.nodes[0].fx).toBeUndefined();
    expect(parsedComposite.nodes[0].x).toBeUndefined();
    expect(sanitized.scenes[0].graphData.nodes[0].fx).toBeUndefined();
    expect(sanitized.scenes[0].graphData.nodes[0].x).toBeUndefined();
    expect(sanitized.scenes[0].graphData.links[0].source).toBe('sense-field-us');
  });

  it('includes V43 multi-scene fields in computeProjectHydrationFingerprint', () => {
    const baseData = {
      status: 'completed',
      schemaVersion: 43,
      seedArtists: 'Sense Field',
      graphData: '{"nodes":[1],"links":[]}',
      scenes: [{ sceneId: 'scene-1', seedArtists: 'Sense Field' }],
      activeSceneId: 'scene-1',
      overarchingRationale: '',
      crossSceneLinks: [],
    };
    const fp1 = computeProjectHydrationFingerprint('proj-1', baseData);
    const fp2 = computeProjectHydrationFingerprint('proj-1', {
      ...baseData,
      overarchingRationale: 'Synthesized overarching multi-scene editorial.',
    });
    expect(fp1).not.toBe(fp2);
  });

  it('normalizes "::"-delimited string and string[] seedArtists seamlessly via toSeedArtistsArray, toSeedArtistsString, and normalizeProjectScene', () => {
    expect(toSeedArtistsArray('Sense Field::Reason To Believe')).toEqual(['Sense Field', 'Reason To Believe']);
    expect(toSeedArtistsArray(['Sense Field', 'Reason To Believe'])).toEqual(['Sense Field', 'Reason To Believe']);
    expect(toSeedArtistsArray('')).toEqual([]);
    expect(toSeedArtistsArray(null)).toEqual([]);

    expect(toSeedArtistsString(['Sense Field', 'Reason To Believe'])).toBe('Sense Field::Reason To Believe');
    expect(toSeedArtistsString('Sense Field::Reason To Believe')).toBe('Sense Field::Reason To Believe');

    // Backend payload with sceneId (missing id) and string seedArtists
    const normalized = normalizeProjectScene({
      sceneId: 'scene-1',
      sceneIndex: 0,
      title: 'Sense Field + Reason To Believe',
      seedArtists: 'Sense Field::Reason To Believe',
      seedIds: ['sense-field-us', 'reason-to-believe-us'],
    }, 0);

    expect(normalized.id).toBe('scene-1');
    expect(normalized.sceneId).toBe('scene-1');
    expect(normalized.title).toBe('Sense Field + Reason To Believe');
    expect(normalized.name).toBe('Sense Field + Reason To Believe');
    expect(normalized.seedArtists).toBe('Sense Field::Reason To Believe');
    expect(normalized.seedIds).toEqual(['sense-field-us', 'reason-to-believe-us']);
    expect(normalized.seedArtistIds).toEqual(['sense-field-us', 'reason-to-believe-us']);

    // parseProjectScenes normalizes both id/sceneId and title/name on serialized backend JSON
    const parsedScenes = parseProjectScenes(JSON.stringify([{
      sceneId: 'scene-1',
      sceneIndex: 0,
      title: 'Scene 1',
      seedArtists: 'Sense Field::Reason To Believe',
      seedIds: ['sense-field-us', 'reason-to-believe-us'],
    }]));
    expect(parsedScenes).toHaveLength(1);
    expect(parsedScenes[0].id).toBe('scene-1');
    expect(parsedScenes[0].sceneId).toBe('scene-1');
    expect(toSeedArtistsArray(parsedScenes[0].seedArtists)).toEqual(['Sense Field', 'Reason To Believe']);

    // CrossSceneLink dual-alias normalization
    const normLink = normalizeCrossSceneLink({
      fromSceneId: 'scene-1',
      toSceneId: 'scene-2',
      fromNodeId: 'scene-1::jimmy-eat-world-us',
      toNodeId: 'scene-2::jimmy-eat-world-us',
      bridgeType: 'identity',
    });
    expect(normLink.sourceSceneId).toBe('scene-1');
    expect(normLink.targetSceneId).toBe('scene-2');
    expect(normLink.fromSceneId).toBe('scene-1');
    expect(normLink.toSceneId).toBe('scene-2');
    expect(parseCrossSceneLinks(JSON.stringify([normLink]))[0].sourceSceneId).toBe('scene-1');
  });

  it('accurately computes project card metrics across multi-scene projects', () => {
    const mockScenes: ProjectScene[] = [
      normalizeProjectScene({
        sceneIndex: 0,
        title: 'Scene 1',
        seedArtists: 'Sense Field::Reason To Believe',
        seedIds: ['sense-field-us', 'reason-to-believe-us'],
        graphData: {
          nodes: [
            { id: 'scene-1::sense-field-us', label: 'Sense Field', type: 'artist', isSeed: true },
            { id: 'scene-1::reason-to-believe-us', label: 'Reason To Believe', type: 'artist', isSeed: true },
            { id: 'scene-1::texas-is-the-reason-us', label: 'Texas Is the Reason', type: 'artist' },
            { id: 'scene-1::revelation-records', label: 'Revelation Records', type: 'label' }
          ],
          links: []
        }
      }, 0),
      normalizeProjectScene({
        sceneIndex: 1,
        title: 'Scene 2',
        seedArtists: 'Jimmy Eat World',
        seedIds: ['jimmy-eat-world-us'],
        graphData: {
          nodes: [
            { id: 'scene-2::jimmy-eat-world-us', label: 'Jimmy Eat World', type: 'artist', isSeed: true },
            { id: 'scene-2::texas-is-the-reason-us', label: 'Texas Is the Reason', type: 'artist' },
            { id: 'scene-2::revelation-records', label: 'Revelation Records', type: 'label' }
          ],
          links: []
        }
      }, 1)
    ];

    const metrics = computeProjectCardMetrics({
      scenes: mockScenes,
      seedArtists: 'Sense Field::Reason To Believe::Jimmy Eat World',
      activeNodes: ['sense-field-us', 'reason-to-believe-us', 'jimmy-eat-world-us', 'texas-is-the-reason-us', 'revelation-records']
    });

    expect(metrics.rootArtistsCount).toBe(3);
    expect(metrics.seedList).toEqual(['Sense Field', 'Reason To Believe', 'Jimmy Eat World']);
    expect(metrics.recommendedCount).toBe(1); // Texas Is the Reason (deduplicated across scenes)
    expect(metrics.labelCount).toBe(1); // Revelation Records (deduplicated)
    expect(metrics.deepCutsCount).toBe(5);
  });

  it('detects legacy 1600px stride coordinates and shifts them to 950px stride', () => {
    const shift = detectLegacyStrideShiftX(1, [2550, 2600, 2650]);
    expect(shift).toBe(-650);

    const migrated = migrateLegacyCanvasLayout([
      { nodeId: 'scene-1::sense-field-us', x: 1000, y: 1000, fx: 1000, fy: 1000 },
      { nodeId: 'scene-2::jimmy-eat-world-us', x: 2600, y: 1000, fx: 2600, fy: 1000 }
    ]);
    expect(migrated[0].x).toBe(1000);
    expect(migrated[1].x).toBe(1950);
    expect(migrated[1].fx).toBe(1950);
  });

  it('resiliently strips both scene-k:: and legacy/corrupted scene-k- namespaces', () => {
    expect(stripSceneNamespace('scene-1::sense-field-us')).toBe('sense-field-us');
    expect(stripSceneNamespace('scene-2::jimmy-eat-world')).toBe('jimmy-eat-world');
    expect(stripSceneNamespace('scene-1-sense-field-us')).toBe('sense-field-us');
    expect(stripSceneNamespace('scene-3-sense-field')).toBe('sense-field');
    expect(stripSceneNamespace('scene-1::scene-1-sense-field')).toBe('sense-field');
  });

  it('inoculates normalizeArtistId against namespaced canvas IDs', () => {
    expect(normalizeArtistId('scene-1::sense-field-us')).toBe('sense-field-us');
    expect(normalizeArtistId('scene-2::jimmy-eat-world-us')).toBe('jimmy-eat-world-us');
    expect(normalizeArtistId('scene-1-sense-field-us')).toBe('sense-field-us');
    expect(normalizeArtistId('scene-3-sense-field')).toBe('sense-field');
    expect(normalizeArtistId('Sense Field')).toBe('sense-field');
  });

  it('generates clean, deduplicated, title-cased multi-scene project titles', () => {
    const mockScenes = [
      normalizeProjectScene({
        sceneIndex: 0,
        title: 'Scene 1',
        seedArtists: 'Sense Field::Reason To Believe',
        seedIds: ['sense-field-us', 'reason-to-believe-us']
      }, 0),
      normalizeProjectScene({
        sceneIndex: 1,
        title: 'Scene 2',
        seedArtists: 'Jimmy Eat World',
        seedIds: ['jimmy-eat-world-us']
      }, 1),
      normalizeProjectScene({
        sceneIndex: 2,
        title: 'Scene 3',
        seedArtists: 'sense-field-us',
        seedIds: ['sense-field-us']
      }, 2)
    ];

    const mockDetailsCache = new Map<string, any>([
      ['sense-field-us', { details: { artist: 'Sense Field' } }],
      ['reason-to-believe-us', { details: { artist: 'Reason To Believe' } }],
      ['jimmy-eat-world-us', { details: { artist: 'Jimmy Eat World' } }]
    ]);

    const title = generateProjectTitleFromScenes(mockScenes, mockDetailsCache);
    expect(title).toBe('Sense Field + Reason To Believe + Jimmy Eat World');

    // Without detailsCache, fallback formatting strips -us and Title Cases bare slugs
    const fallbackTitle = generateProjectTitleFromScenes(mockScenes, null);
    expect(fallbackTitle).toBe('Sense Field + Reason To Believe + Jimmy Eat World');
  });
});
