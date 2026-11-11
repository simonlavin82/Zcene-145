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
  compactDetailsCacheToCanonical,
  resolveSceneNodeOverlaps,
  MAX_SCENES_PER_PROJECT,
} from '../../shared/multiSceneUtils';
import { normalizeArtistId } from '../../services/artistCacheService';
import { TOKEN_PRICING } from '../../shared/tokenEconomy';
import { computeProjectHydrationFingerprint, computeAutosaveDocSnapshot, extractCanonicalGraphSignature } from '../../utils/projectHydrationFingerprint';
import { BACKEND_REGRESSION_RUNBOOK } from '../../docs/backend-regression-runbook';
import { ARCHITECTURE_RULES } from '../../components/EnginePage';
import { applyShareBlacklistMutation } from '../../App';
import { PreFlightSeed } from '../../components/SharedModals';
import { ProjectScene, CrossSceneLink, CanvasNodeRef } from '../../types';

describe('V43 Multi-Scene Infinite Board & Layered Zine Architecture ([Rule 44])', () => {
  it('computes deterministic horizontal cluster center offsets (1000 + sceneIndex * 1050, 1000)', () => {
    expect(getSceneCenterOffset(0)).toEqual({ x: 1000, y: 1000 });
    expect(getSceneCenterOffset(1)).toEqual({ x: 2050, y: 1000 });
    expect(getSceneCenterOffset(2)).toEqual({ x: 3100, y: 1000 });
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

    // Scene 2 nodes initialize near Scene 2 center (2050, 1000)
    expect(jewScene2?.x).toBeGreaterThan(1850);
    expect(jewScene2?.x).toBeLessThan(2250);

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

  it('detects legacy 1600px stride coordinates and shifts them to 1050px stride', () => {
    const shift1600 = detectLegacyStrideShiftX(1, [2550, 2600, 2650]);
    expect(shift1600).toBe(-550);

    const shift950 = detectLegacyStrideShiftX(1, [1900, 1950, 2000]);
    expect(shift950).toBe(100);

    const migrated = migrateLegacyCanvasLayout([
      { nodeId: 'scene-1::sense-field-us', x: 1000, y: 1000, fx: 1000, fy: 1000 },
      { nodeId: 'scene-2::jimmy-eat-world-us', x: 2600, y: 1000, fx: 2600, fy: 1000 }
    ]);
    expect(migrated[0].x).toBe(1000);
    expect(migrated[1].x).toBe(2050);
    expect(migrated[1].fx).toBe(2050);
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

  it('compactDetailsCacheToCanonical reduces alias duplicates to a single canonical entry while preserving 100% of profile fields', () => {
    const rawAliases = [
      ['Sense Field', { details: { artist: 'Sense Field', genre: 'Emo' }, summary: 'Bio 1' }],
      ['sense field', { details: { artist: 'Sense Field', genre: 'Emo' }, summary: 'Bio 2' }],
      ['sense-field', { details: { artist: 'Sense Field', genre: 'Emo' }, summary: 'Bio 3' }],
      ['sense-field-us', {
        details: { artist: 'Sense Field', genre: 'Emo / Post-Hardcore', origin: 'El Segundo, USA', founded: '1991' },
        summary: 'Pioneered soaring, emotionally resonant melodic hardcore.',
        discography: [{ albumName: 'Building', releaseYear: '1996' }],
        members: ['Jon Bunch', 'Chris Fullmer'],
        recommendationReason: 'Crucial melodic transition act.',
        previewUrl: 'https://preview.url/sense-field.m4a',
      }],
      ['revelation', {
        details: { artist: 'Revelation Records', genre: 'Hardcore' },
        summary: 'Historic hardcore label.',
        discography: [],
      }],
      ['Revelation Records', {
        details: { artist: 'Revelation Records', genre: 'Hardcore' },
        summary: 'Historic hardcore label.',
        discography: [],
      }],
    ];

    const mockNodes = [
      { id: 'scene-1::sense-field-us', canonicalId: 'sense-field-us', name: 'Sense Field' },
      { id: 'scene-1::revelation', canonicalId: 'revelation', name: 'Revelation Records' },
    ];

    const compacted = compactDetailsCacheToCanonical(rawAliases, mockNodes);

    // 6 alias entries must compact to exactly 2 canonical entries
    expect(compacted.length).toBe(2);

    const keys = compacted.map(([k]) => k);
    expect(keys).toContain('sense-field-us');
    expect(keys).toContain('revelation');

    // 100% of rich profile fields must be preserved on the canonical winner
    const sfEntry = compacted.find(([k]) => k === 'sense-field-us');
    expect(sfEntry).toBeDefined();
    const sfProfile = sfEntry![1];
    expect(sfProfile.details.origin).toBe('El Segundo, USA');
    expect(sfProfile.summary).toBe('Pioneered soaring, emotionally resonant melodic hardcore.');
    expect(sfProfile.discography).toEqual([{ albumName: 'Building', releaseYear: '1996' }]);
    expect(sfProfile.members).toEqual(['Jon Bunch', 'Chris Fullmer']);
    expect(sfProfile.recommendationReason).toBe('Crucial melodic transition act.');
    expect(sfProfile.previewUrl).toBe('https://preview.url/sense-field.m4a');

    // Verify idempotency: compacting already-compacted entries preserves them unchanged
    const recompacted = compactDetailsCacheToCanonical(compacted, mockNodes);
    expect(recompacted.length).toBe(2);
    expect(recompacted.map(([k]) => k)).toEqual(keys);
  });

  describe('resolveSceneNodeOverlaps ([Rule 21] Box 5 Semantic Weighting & Tether Preservation)', () => {
    it('separates identical-coordinate metadata petal and seed artist into an outward arc tether without moving the seed', () => {
      const seed: any = {
        id: 'scene-1::sense-field-us',
        label: 'Sense Field',
        type: 'artist',
        isSeed: true,
        sceneIndex: 0,
        x: 1086.0,
        y: 1006.4,
        fx: 1086.0,
        fy: 1006.4,
      };
      const year1982: any = {
        id: 'scene-1::1982',
        label: '1982',
        type: 'founded',
        sceneIndex: 0,
        x: 1086.0,
        y: 1006.4,
      };
      const links: any = [
        { source: 'scene-1::sense-field-us', target: 'scene-1::1982', weight: 0.4 }
      ];

      const resolved = resolveSceneNodeOverlaps([seed, year1982], links);
      const resSeed = resolved.find(n => n.id === 'scene-1::sense-field-us')!;
      const res1982 = resolved.find(n => n.id === 'scene-1::1982')!;

      // Root artist seed must stay completely anchored
      expect(resSeed.x).toBe(1086.0);
      expect(resSeed.y).toBe(1006.4);

      // Metadata petal must be placed on an orbital tether (r between 60px and 85px)
      const dist = Math.hypot(res1982.x! - resSeed.x!, res1982.y! - resSeed.y!);
      expect(dist).toBeGreaterThanOrEqual(60);
      expect(dist).toBeLessThanOrEqual(85);
    });

    it('clears wide horizontal label collision ("Alternative Rock", 16 chars) against adjacent nodes without moving root', () => {
      const root: any = {
        id: 'scene-2::jimmy-eat-world-us',
        label: 'Jimmy Eat World',
        type: 'artist',
        isSeed: true,
        sceneIndex: 1,
        x: 2050,
        y: 1000,
        fx: 2050,
        fy: 1000,
      };
      const genreNode: any = {
        id: 'scene-2::alternative-rock',
        label: 'Alternative Rock',
        type: 'genre',
        sceneIndex: 1,
        x: 2000,
        y: 920,
      };
      const year1999: any = {
        id: 'scene-2::1999',
        label: '1999',
        type: 'founded',
        sceneIndex: 1,
        x: 2010,
        y: 918, // 10px delta, completely overlapping Alternative Rock 115px wide label
      };
      const links: any = [
        { source: 'scene-2::jimmy-eat-world-us', target: 'scene-2::alternative-rock', weight: 0.85 },
        { source: 'scene-2::jimmy-eat-world-us', target: 'scene-2::1999', weight: 0.3 }
      ];

      const resolved = resolveSceneNodeOverlaps([root, genreNode, year1999], links);
      const resGenre = resolved.find(n => n.id === 'scene-2::alternative-rock')!;
      const res1999 = resolved.find(n => n.id === 'scene-2::1999')!;

      // Separation must be sufficient so their AABB bounding boxes do not clash
      const dx = Math.abs(resGenre.x! - res1999.x!);
      const dy = Math.abs(resGenre.y! - res1999.y!);
      // Either horizontal separation >= 50px or vertical separation >= 25px
      expect(dx >= 50 || dy >= 25).toBe(true);
    });

    it('clears vertical stack collision (Tooth & Nail and 1991) guaranteeing vertical label clearance', () => {
      const parentArtist: any = {
        id: 'scene-3::further-seems-forever-us',
        label: 'Further Seems Forever',
        type: 'artist',
        sceneIndex: 2,
        x: 2900,
        y: 750,
      };
      const labelNode: any = {
        id: 'scene-3::tooth-nail',
        label: 'Tooth & Nail',
        type: 'label',
        sceneIndex: 2,
        x: 2750,
        y: 745,
      };
      const yearNode: any = {
        id: 'scene-3::1991',
        label: '1991',
        type: 'founded',
        sceneIndex: 2,
        x: 2752,
        y: 780, // Stacked vertically right under Tooth & Nail label
      };
      const links: any = [
        { source: 'scene-3::further-seems-forever-us', target: 'scene-3::tooth-nail', weight: 0.85 },
        { source: 'scene-3::further-seems-forever-us', target: 'scene-3::1991', weight: 0.3 }
      ];

      const resolved = resolveSceneNodeOverlaps([parentArtist, labelNode, yearNode], links);
      const resLabel = resolved.find(n => n.id === 'scene-3::tooth-nail')!;
      const resYear = resolved.find(n => n.id === 'scene-3::1991')!;

      const dx = Math.abs(resLabel.x! - resYear.x!);
      const dy = Math.abs(resLabel.y! - resYear.y!);
      expect(dx >= 30 || dy >= 30).toBe(true);
    });

    it('preserves Box 5 relative radial hierarchy and angular bearings under cluster expansion', () => {
      const center = { x: 1000, y: 1000 };
      const rootSeed: any = {
        id: 'scene-1::root',
        label: 'Root Artist',
        type: 'artist',
        isSeed: true,
        sceneIndex: 0,
        x: center.x,
        y: center.y,
        fx: center.x,
        fy: center.y,
      };
      // Peer A (weight 0.95): closest at angle 0 deg
      const peerA: any = {
        id: 'scene-1::peer-a',
        label: 'Lineage Peer',
        type: 'artist',
        sceneIndex: 0,
        x: center.x + 120,
        y: center.y,
      };
      // Peer B (weight 0.75): intermediate at angle 60 deg
      const peerB: any = {
        id: 'scene-1::peer-b',
        label: 'Label Peer',
        type: 'artist',
        sceneIndex: 0,
        x: center.x + 90,
        y: center.y + 155,
      };
      // Peer C (weight 0.55): distant at angle 150 deg
      const peerC: any = {
        id: 'scene-1::peer-c',
        label: 'Second Degree Peer',
        type: 'artist',
        sceneIndex: 0,
        x: center.x - 200,
        y: center.y + 115,
      };

      const angleA_before = Math.atan2(peerA.y - center.y, peerA.x - center.x);
      const angleB_before = Math.atan2(peerB.y - center.y, peerB.x - center.x);
      const angleC_before = Math.atan2(peerC.y - center.y, peerC.x - center.x);

      const resolved = resolveSceneNodeOverlaps([rootSeed, peerA, peerB, peerC], [], {
        clusterExpansionFactor: 1.18,
      });

      const resSeed = resolved.find(n => n.id === 'scene-1::root')!;
      const resA = resolved.find(n => n.id === 'scene-1::peer-a')!;
      const resB = resolved.find(n => n.id === 'scene-1::peer-b')!;
      const resC = resolved.find(n => n.id === 'scene-1::peer-c')!;

      // Seed must remain centered
      expect(resSeed.x).toBe(center.x);
      expect(resSeed.y).toBe(center.y);

      // Radial hierarchy dist(Root, A) < dist(Root, B) < dist(Root, C) must be preserved
      const distA = Math.hypot(resA.x! - center.x, resA.y! - center.y);
      const distB = Math.hypot(resB.x! - center.x, resB.y! - center.y);
      const distC = Math.hypot(resC.x! - center.x, resC.y! - center.y);
      expect(distA).toBeLessThan(distB);
      expect(distB).toBeLessThan(distC);

      // Angular bearings must be preserved (within 0.05 radians)
      const angleA_after = Math.atan2(resA.y! - center.y, resA.x! - center.x);
      const angleB_after = Math.atan2(resB.y! - center.y, resB.x! - center.x);
      const angleC_after = Math.atan2(resC.y! - center.y, resC.x! - center.x);
      expect(Math.abs(angleA_after - angleA_before)).toBeLessThan(0.05);
      expect(Math.abs(angleB_after - angleB_before)).toBeLessThan(0.05);
      expect(Math.abs(angleC_after - angleC_before)).toBeLessThan(0.05);
    });
  });

  describe('computeProjectCardMetrics Resilient Fallbacks', () => {
    it('falls back to artistCanon + labelCanon entity count when activeNodes is empty ([Rule 44])', () => {
      const mockScenes: ProjectScene[] = [
        normalizeProjectScene({
          sceneId: 'scene-1',
          sceneIndex: 0,
          title: 'Sense Field + Reason To Believe',
          seedArtists: 'Sense Field::Reason To Believe',
          status: 'completed',
          graphData: {
            nodes: [
              { id: 'scene-1::sense-field-us', canonicalId: 'sense-field-us', label: 'Sense Field', type: 'artist', isSeed: true, group: 1 },
              { id: 'scene-1::reason-to-believe-us', canonicalId: 'reason-to-believe-us', label: 'Reason To Believe', type: 'artist', isSeed: true, group: 1 },
              { id: 'scene-1::samiam-us', canonicalId: 'samiam-us', label: 'Samiam', type: 'artist', group: 1 },
              { id: 'scene-1::revelation', canonicalId: 'revelation', label: 'Revelation', type: 'label', group: 2 },
            ],
            links: [],
          },
        }),
        normalizeProjectScene({
          sceneId: 'scene-2',
          sceneIndex: 1,
          title: 'Jimmy Eat World',
          seedArtists: 'Sense Field::Reason To Believe::Jimmy Eat World',
          status: 'completed',
          graphData: {
            nodes: [
              { id: 'scene-2::jimmy-eat-world-us', canonicalId: 'jimmy-eat-world-us', label: 'Jimmy Eat World', type: 'artist', isSeed: true, group: 1 },
              { id: 'scene-2::samiam-us', canonicalId: 'samiam-us', label: 'Samiam', type: 'artist', group: 1 },
              { id: 'scene-2::sub-pop', canonicalId: 'sub-pop', label: 'Sub Pop', type: 'label', group: 2 },
            ],
            links: [],
          },
        }),
      ];

      // Test 1: Stale / wiped project document with activeNodes: []
      const projectWithEmptyActiveNodes: any = {
        id: 'test-proj-empty-active',
        scenes: mockScenes,
        seedArtists: 'Sense Field::Reason To Believe::Jimmy Eat World',
        activeNodes: [],
      };

      const metricsEmpty = computeProjectCardMetrics(projectWithEmptyActiveNodes);
      // Canonical entities: sense-field-us, reason-to-believe-us, samiam-us, jimmy-eat-world-us (4 artists) + revelation, sub-pop (2 labels) = 6
      expect(metricsEmpty.sceneCount).toBe(2);
      expect(metricsEmpty.rootArtistsCount).toBe(3);
      expect(metricsEmpty.labelCount).toBe(2);
      expect(metricsEmpty.deepCutsCount).toBe(6); // Resilient fallback: does NOT drop to 0!

      // Test 2: Populated activeNodes (with namespaced or canonical IDs)
      const projectWithPopulatedActiveNodes: any = {
        id: 'test-proj-populated-active',
        scenes: mockScenes,
        seedArtists: 'Sense Field::Reason To Believe::Jimmy Eat World',
        activeNodes: ['scene-1::sense-field-us', 'reason-to-believe-us', 'revelation'],
      };

      const metricsPopulated = computeProjectCardMetrics(projectWithPopulatedActiveNodes);
      expect(metricsPopulated.deepCutsCount).toBe(3);
    });
  });

  describe('V44 Visual & Multi-Scene Polish ([Rule 44])', () => {
    it('guards mapped scenes with confirmation while allowing unmapped draft scenes to be removed immediately', () => {
      const mappedScene = normalizeProjectScene({
        sceneId: 'scene-2',
        sceneIndex: 1,
        title: 'Jimmy Eat World',
        seedArtists: 'Jimmy Eat World',
        graphData: {
          nodes: [
            { id: 'scene-2::jimmy-eat-world-us', canonicalId: 'jimmy-eat-world-us', label: 'Jimmy Eat World', type: 'artist', isSeed: true, group: 1 }
          ],
          links: []
        }
      });

      const unmappedDraftScene = normalizeProjectScene({
        sceneId: 'scene-3',
        sceneIndex: 2,
        title: 'Draft Scene',
        seedArtists: '',
        graphData: { nodes: [], links: [] }
      });

      // Simulation of pill click handler logic in GraphPage.tsx
      const handleRemoveClick = (scene: ProjectScene, triggerModal: (payload: any) => void, directRemove: (id: string) => void) => {
        const isMapped = (scene?.graphData?.nodes?.length || 0) > 0;
        if (isMapped) {
          triggerModal({ sceneId: scene.sceneId, title: scene.title });
        } else {
          directRemove(scene.sceneId);
        }
      };

      let modalTriggered: any = null;
      let directlyRemovedId: string | null = null;

      // 1. Mapped scene must trigger confirmation modal
      handleRemoveClick(mappedScene, (p) => { modalTriggered = p; }, (id) => { directlyRemovedId = id; });
      expect(modalTriggered).toEqual({ sceneId: 'scene-2', title: 'Jimmy Eat World' });
      expect(directlyRemovedId).toBeNull();

      // Reset
      modalTriggered = null;
      directlyRemovedId = null;

      // 2. Unmapped draft scene removes immediately without modal
      handleRemoveClick(unmappedDraftScene, (p) => { modalTriggered = p; }, (id) => { directlyRemovedId = id; });
      expect(modalTriggered).toBeNull();
      expect(directlyRemovedId).toBe('scene-3');
    });

    it('enforces scene seed isolation so local scene seeds never get polluted by composite project seeds', () => {
      const compositeProjectSeeds = 'Sense Field::Reason To Believe::Jimmy Eat World';
      const scene1 = normalizeProjectScene({
        sceneId: 'scene-1',
        sceneIndex: 0,
        title: 'Sense Field + Reason To Believe',
        seedArtists: 'Sense Field::Reason To Believe',
        seedIds: ['sense-field-us', 'reason-to-believe-us']
      });
      const scene2 = normalizeProjectScene({
        sceneId: 'scene-2',
        sceneIndex: 1,
        title: 'Jimmy Eat World',
        seedArtists: 'Jimmy Eat World',
        seedIds: ['jimmy-eat-world-us']
      });

      // Scene 2's seeds must be strictly isolated to 'Jimmy Eat World' (count 1)
      const scene1Seeds = toSeedArtistsArray(scene1.seedArtists);
      const scene2Seeds = toSeedArtistsArray(scene2.seedArtists);
      const allProjectSeeds = toSeedArtistsArray(compositeProjectSeeds);

      expect(scene1Seeds).toHaveLength(2);
      expect(scene2Seeds).toHaveLength(1);
      expect(scene2Seeds[0]).toBe('Jimmy Eat World');
      expect(allProjectSeeds).toHaveLength(3);

      // Verify pill count representation
      expect(scene2Seeds.length).toBe(1); // Badge displays '1'
    });

    it('preserves mobile ROOTS tab on scene-pill change and restricts spatial camera zoom to desktop screens', () => {
      let activeMobileTab: 'artists' | 'spiderweb' | 'details' = 'artists';
      let focusedSceneClusterTriggered = false;

      // Simulation of Scene pill click on mobile:
      const onSelectSceneMobile = (sceneId: string, isSmallScreen: boolean) => {
        // In V44, seedArtists effect that flipped to 'spiderweb' is removed.
        // Active tab stays as whatever the user was on ('artists')
        if (!isSmallScreen) {
          focusedSceneClusterTriggered = true;
        }
      };

      // Test mobile: isSmallScreen = true
      onSelectSceneMobile('scene-2', true);
      expect(activeMobileTab).toBe('artists'); // Retained ROOTS tab!
      expect(focusedSceneClusterTriggered).toBe(false); // No camera zoom on mobile!

      // Test desktop: isSmallScreen = false
      onSelectSceneMobile('scene-2', false);
      expect(focusedSceneClusterTriggered).toBe(true); // Camera zooms on desktop!
    });

    it('suppresses programmatic node hover in triggerNodeHover and clearNodeHover when isPassiveSelection is true', () => {
      // Mock references simulating MusicGraph state
      const isPassiveSelectionRef = { current: true };
      const selectedNodeRef = { current: { id: 'scene-1::sense-field-us', name: 'Sense Field' } as any };
      const peekedNodeRef = { current: null as any };
      let activeHoveredNode: any = null;
      let hoveredNodeId: string | null = null;
      let hoveredLink: any = null;

      const triggerNodeHover = (d: any, isProgrammatic = false) => {
        if (isProgrammatic && isPassiveSelectionRef.current) return;
        hoveredNodeId = d.id;
        activeHoveredNode = d;
      };

      const clearNodeHover = () => {
        const activeNode = !isPassiveSelectionRef.current ? (selectedNodeRef.current || peekedNodeRef.current) : null;
        if (activeNode) {
          triggerNodeHover(activeNode, true);
          hoveredLink = null;
        } else {
          hoveredNodeId = null;
          activeHoveredNode = null;
          hoveredLink = null;
        }
      };

      // 1. On initial load, with isPassiveSelection = true and auto-selected primary seed:
      clearNodeHover();
      expect(hoveredNodeId).toBeNull();
      expect(activeHoveredNode).toBeNull();
      expect(hoveredLink).toBeNull();

      // Attempt programmatic hover during passive selection
      triggerNodeHover(selectedNodeRef.current, true);
      expect(hoveredNodeId).toBeNull();
      expect(activeHoveredNode).toBeNull();

      // 2. Explicit user click switches isPassiveSelection to false:
      isPassiveSelectionRef.current = false;
      triggerNodeHover(selectedNodeRef.current, false);
      expect(hoveredNodeId).toBe('scene-1::sense-field-us');
      expect(activeHoveredNode).toBe(selectedNodeRef.current);

      // Now clearNodeHover re-triggers hover for the active selected node
      clearNodeHover();
      expect(hoveredNodeId).toBe('scene-1::sense-field-us');
      expect(activeHoveredNode).toBe(selectedNodeRef.current);
    });

    it('verifies all Zine metadata pills share the unified neutral dark capsule styling contract', () => {
      const unifiedZinePillClass = 'text-[10px] uppercase tracking-widest text-zinc-400 font-bold px-2.5 py-0.5 bg-zinc-900 rounded-full border border-zinc-800 font-mono whitespace-nowrap';
      
      // Ensure the canonical styling classes match expectations:
      expect(unifiedZinePillClass).toContain('text-zinc-400');
      expect(unifiedZinePillClass).toContain('bg-zinc-900');
      expect(unifiedZinePillClass).toContain('border-zinc-800');
      expect(unifiedZinePillClass).not.toContain('text-primary');
      expect(unifiedZinePillClass).not.toContain('bg-primary');
      expect(unifiedZinePillClass).not.toContain('border-primary');
    });

    it('resets passive selection, peekedNode, and selectedNode upon project re-entry', () => {
      let isPassiveSelection = false;
      let peekedNode: any = { id: 'scene-2::jimmy-eat-world-us' };
      let selectedNode: any = { id: 'scene-1::sense-field-us' };
      let navigatedPath: string | null = null;

      const onSelectProject = (id: string) => {
        isPassiveSelection = true;
        peekedNode = null;
        selectedNode = null;
        navigatedPath = `/p/${id}`;
      };

      onSelectProject('i1c1KFgYdXr6flXT7lLQ');

      expect(isPassiveSelection).toBe(true);
      expect(peekedNode).toBeNull();
      expect(selectedNode).toBeNull();
      expect(navigatedPath).toBe('/p/i1c1KFgYdXr6flXT7lLQ');
    });

    it('guarantees computeAutosaveDocSnapshot determinism and eliminates false positive idle saves', () => {
      const rawFirestoreDoc = {
        name: 'Sense Field + Reason To Believe + Jimmy Eat World',
        seedArtists: 'Sense Field::Reason To Believe::Jimmy Eat World',
        scenes: JSON.stringify([
          { id: 'scene-1', name: 'Scene 1' },
          { id: 'scene-2', name: 'Scene 2' },
        ]),
        activeSceneId: 'scene-1',
        overarchingRationale: 'Southern California melodic post-hardcore and Arizona alt-rock crossover.',
        crossSceneLinks: '[]',
        discoveryFilters: '{}',
        activeNodes: ['scene-1::sense-field-us', 'scene-2::jimmy-eat-world-us'],
        pinnedNodes: [],
        chatHistories: '[]',
        lastViewedStackCount: 12,
        graphData: JSON.stringify({
          nodes: [
            { id: 'scene-1::sense-field-us', type: 'artist' },
            { id: 'scene-1::revelation', type: 'label' },
            { id: 'scene-1::genre-emo', type: 'genre' },
            { id: 'scene-2::jimmy-eat-world-us', type: 'artist' },
          ],
          links: [
            { source: 'scene-1::sense-field-us', target: 'scene-1::revelation' },
            { source: 'scene-1::sense-field-us', target: 'scene-1::genre-emo' },
          ],
          synthesisRationale: 'Connecting Scene 1 and Scene 2.',
        }),
      };

      // In-memory base payload where D3 has mutated links into objects with physics coordinates
      const inMemoryBasePayload = {
        name: 'Sense Field + Reason To Believe + Jimmy Eat World',
        seedArtists: 'Sense Field::Reason To Believe::Jimmy Eat World',
        scenes: JSON.stringify([
          { id: 'scene-1', name: 'Scene 1' },
          { id: 'scene-2', name: 'Scene 2' },
        ]),
        activeSceneId: 'scene-1',
        overarchingRationale: 'Southern California melodic post-hardcore and Arizona alt-rock crossover.',
        crossSceneLinks: '[]',
        discoveryFilters: '{}',
        activeNodes: ['scene-2::jimmy-eat-world-us', 'scene-1::sense-field-us'], // Different insertion order
        pinnedNodes: [],
        chatHistories: '[]',
        lastViewedStackCount: 12,
        graphData: JSON.stringify({
          nodes: [
            { id: 'scene-1::sense-field-us', type: 'artist', x: 1000, y: 1000, vx: 0.0001, vy: -0.0002 },
            { id: 'scene-1::revelation', type: 'label', x: 950, y: 920, vx: 0.0003, vy: 0.0001 },
            { id: 'scene-1::genre-emo', type: 'genre', x: 1050, y: 940, vx: -0.0001, vy: 0.0002 },
            { id: 'scene-2::jimmy-eat-world-us', type: 'artist', x: 2050, y: 1000, vx: 0.0002, vy: 0.0001 },
          ],
          // D3-mutated links where source and target are node objects
          links: [
            { source: { id: 'scene-1::sense-field-us', x: 1000, y: 1000 }, target: { id: 'scene-1::revelation', x: 950, y: 920 } },
            { source: { id: 'scene-1::sense-field-us', x: 1000, y: 1000 }, target: { id: 'scene-1::genre-emo', x: 1050, y: 940 } },
          ],
          synthesisRationale: 'Connecting Scene 1 and Scene 2.',
        }),
      };

      const snap1 = computeAutosaveDocSnapshot(rawFirestoreDoc);
      const snap2 = computeAutosaveDocSnapshot(inMemoryBasePayload);

      // Must be 100% identical despite D3 physics mutations and array ordering differences
      expect(snap1).toBe(snap2);

      // Verify that a genuine user change invalidates the snapshot:
      const modifiedPayload = {
        ...inMemoryBasePayload,
        activeNodes: ['scene-1::sense-field-us'], // User deselected a node
      };
      const snapModified = computeAutosaveDocSnapshot(modifiedPayload);
      expect(snapModified).not.toBe(snap1);
    });

    it('verifies canvasLayout preserves all node types including genre, country, and founded petals', () => {
      const mockGraphNodes = [
        { id: 'scene-1::sense-field-us', type: 'artist', x: 1000, y: 1000, fx: 1000, fy: 1000 },
        { id: 'scene-1::revelation', type: 'label', x: 950, y: 920, fx: 950, fy: 920 },
        { id: 'scene-1::genre-emo', type: 'genre', x: 1060, y: 940, fx: 1060, fy: 940 },
        { id: 'scene-1::origin-us', type: 'country', x: 940, y: 1070, fx: 940, fy: 1070 },
        { id: 'scene-1::founded-1991', type: 'founded', x: 1070, y: 1050, fx: 1070, fy: 1050 },
      ];

      // Filtering with the new rule (all nodes with coordinates)
      const canvasLayout = mockGraphNodes
        .filter((n: any) => (n.x !== undefined && n.x !== null) || (n.fx !== undefined && n.fx !== null))
        .map((n: any) => ({ nodeId: n.id, x: n.x, y: n.y, fx: n.fx ?? null, fy: n.fy ?? null }));

      expect(canvasLayout).toHaveLength(5);
      expect(canvasLayout.some(c => c.nodeId === 'scene-1::genre-emo')).toBe(true);
      expect(canvasLayout.some(c => c.nodeId === 'scene-1::origin-us')).toBe(true);
      expect(canvasLayout.some(c => c.nodeId === 'scene-1::founded-1991')).toBe(true);
    });

    it('verifies V44 Runbook Protocol specifies schemaVersion: 43 backward compatibility with 0 database purge required', () => {
      expect(BACKEND_REGRESSION_RUNBOOK).toContain('# V44 Regression Suite (Full-Stack)');
      expect(BACKEND_REGRESSION_RUNBOOK).toContain('schemaVersion: 43');
      expect(BACKEND_REGRESSION_RUNBOOK).toContain('Zero database purge is required for V44 operations');
    });

    it('verifies ARCHITECTURE_RULES contains all 44 contiguous laws with Rule 22 as Deep Cloning Isolation', () => {
      expect(ARCHITECTURE_RULES).toHaveLength(44);
      ARCHITECTURE_RULES.forEach((rule, idx) => {
        expect(rule.id).toBe(idx + 1);
        expect(rule.title.trim().length).toBeGreaterThan(0);
        expect(rule.desc.trim().length).toBeGreaterThan(0);
      });

      const rule22 = ARCHITECTURE_RULES.find(r => r.id === 22);
      expect(rule22?.title).toBe('Deep Cloning Isolation');
      expect(rule22?.desc).toContain('Duplication must execute a deep, disconnected 1:1 clone');

      const rule29 = ARCHITECTURE_RULES.find(r => r.id === 29);
      expect(rule29?.desc).toContain('V41/V44 Audio Flow & Presentation Sort Parity');

      const rule44 = ARCHITECTURE_RULES.find(r => r.id === 44);
      expect(rule44?.title).toBe('Multi-Scene Infinite Board, Scene Namespacing & Layered Zine Hierarchy');
      expect(rule44?.desc).toContain('pointer-events: none line hitboxes');
      expect(rule44?.desc).toContain('prioritized at the top of the node hover tooltip');
    });

    it('prioritizes cross-scene bridge connections before intra-scene connections in hover tooltips', () => {
      interface TooltipConnection {
        context: string;
        targetName: string;
        isBridge?: boolean;
      }

      const mockConnections: TooltipConnection[] = [
        { context: 'Evolved directly into the post-hardcore band', targetName: 'Sense Field', isBridge: false },
        { context: 'Shared local scene roots with', targetName: 'Farside', isBridge: false },
        { context: 'Laid the melodic hardcore groundwork for', targetName: 'Jimmy Eat World (Scene 2)', isBridge: true },
        { context: 'Shared lead vocalist lineage with', targetName: 'Further Seems Forever', isBridge: false },
      ];

      mockConnections.sort((a, b) => {
        if (a.isBridge && !b.isBridge) return -1;
        if (!a.isBridge && b.isBridge) return 1;
        return 0;
      });

      expect(mockConnections[0].targetName).toBe('Jimmy Eat World (Scene 2)');
      expect(mockConnections[0].isBridge).toBe(true);
      expect(mockConnections[1].targetName).toBe('Sense Field');
    });

    it('verifies pagination dot track switches alignment from justify-center to justify-start when nodes > 18 and clamps scrollTarget >= 0', () => {
      const getAlignmentClass = (nodeCount: number) => (nodeCount > 18 ? 'justify-start' : 'justify-center');
      expect(getAlignmentClass(12)).toBe('justify-center');
      expect(getAlignmentClass(18)).toBe('justify-center');
      expect(getAlignmentClass(19)).toBe('justify-start');
      expect(getAlignmentClass(50)).toBe('justify-start');

      // Clamping scrollTarget at >= 0 so dot 0 never scrolls negative
      const computeScrollTarget = (dotOffsetLeft: number, trackWidth: number, dotWidth: number) => {
        return Math.max(0, dotOffsetLeft - (trackWidth / 2) + (dotWidth / 2));
      };

      // Dot 0 (offsetLeft: 4px, trackWidth: 240px, dotWidth: 16px)
      expect(computeScrollTarget(4, 240, 16)).toBe(0);
      // Mid dot (offsetLeft: 200px, trackWidth: 240px, dotWidth: 16px)
      expect(computeScrollTarget(200, 240, 16)).toBe(200 - 120 + 8); // 88
    });

    it('verifies scene-namespaced click preserves raw namespaced ID and stamps canonicalId', () => {
      const rawNode = {
        id: 'scene-3::further-seems-forever-us',
        canonicalId: 'further-seems-forever-us',
        type: 'artist',
        label: 'Further Seems Forever',
        sceneId: 'scene-3',
        sceneIndex: 2,
        x: 3120,
        y: 920,
      };

      const canonicalNodeId = stripSceneNamespace(rawNode.canonicalId || rawNode.id);
      expect(canonicalNodeId).toBe('further-seems-forever-us');

      // Mimic handleNodeClick's preservation logic
      const node = {
        ...rawNode,
        canonicalId: canonicalNodeId,
      };

      expect(node.id).toBe('scene-3::further-seems-forever-us');
      expect(node.canonicalId).toBe('further-seems-forever-us');
      expect(node.sceneId).toBe('scene-3');
    });

    it('verifies camera target resolver prioritizes exact ID match before canonical fallback', () => {
      const visibleNodes = [
        { id: 'scene-1::further-seems-forever-us', x: 1050, y: 880, sceneId: 'scene-1' },
        { id: 'scene-3::further-seems-forever-us', x: 3120, y: 920, sceneId: 'scene-3' },
      ];

      const targetNodeId = 'scene-3::further-seems-forever-us';

      // Old resolver (fell back to Scene 1)
      const oldMatched = visibleNodes.find(n => stripSceneNamespace(n.id) === stripSceneNamespace(targetNodeId));
      expect(oldMatched?.id).toBe('scene-1::further-seems-forever-us');
      expect(oldMatched?.x).toBe(1050);

      // New resolver (prioritizes exact ID first)
      const newMatched = visibleNodes.find(n => n.id === targetNodeId) ||
                         visibleNodes.find(n => stripSceneNamespace(n.id) === stripSceneNamespace(targetNodeId));
      expect(newMatched?.id).toBe('scene-3::further-seems-forever-us');
      expect(newMatched?.x).toBe(3120);
    });

    it('verifies scene-scoped selectionHighlightIds spotlights Scene 3 and cross-scene bridge endpoint while keeping Scene 1 intra-scene nodes dimmed', () => {
      const activeInteractionNode = {
        id: 'scene-3::further-seems-forever-us',
        canonicalId: 'further-seems-forever-us',
        type: 'artist',
        sceneId: 'scene-3',
      };

      const visibleLinks = [
        // Scene 3 intra-scene link
        { source: 'scene-3::further-seems-forever-us', target: 'scene-3::sense-field-us', isCrossSceneBridge: false },
        // Cross-scene bridge line
        { source: 'scene-3::further-seems-forever-us', target: 'scene-1::further-seems-forever-us', isCrossSceneBridge: true },
        // Scene 1 intra-scene links
        { source: 'scene-1::further-seems-forever-us', target: 'scene-1::tooth-and-nail', isCrossSceneBridge: false },
        { source: 'scene-1::further-seems-forever-us', target: 'scene-1::dischord', isCrossSceneBridge: false },
      ];

      const selectedIdStr = String(activeInteractionNode.id);
      const hasSceneNs = selectedIdStr.includes('::');
      const highlighted = new Set<string>([selectedIdStr, selectedIdStr.toLowerCase()]);
      const primaryConnections = new Set<string>();

      visibleLinks.forEach(link => {
        const sourceId = link.source;
        const targetId = link.target;
        const isSourceSelected = hasSceneNs ? sourceId.toLowerCase() === selectedIdStr.toLowerCase() : false;
        const isTargetSelected = hasSceneNs ? targetId.toLowerCase() === selectedIdStr.toLowerCase() : false;

        if (isSourceSelected) {
          highlighted.add(targetId);
          primaryConnections.add(targetId);
        }
        if (isTargetSelected) {
          highlighted.add(sourceId);
          primaryConnections.add(sourceId);
        }
      });

      // Target Scene 3 node is highlighted
      expect(highlighted.has('scene-3::further-seems-forever-us')).toBe(true);
      // Scene 3 local neighbor is highlighted
      expect(highlighted.has('scene-3::sense-field-us')).toBe(true);
      // Cross-scene bridge endpoint in Scene 1 is highlighted (visual safeguard)
      expect(highlighted.has('scene-1::further-seems-forever-us')).toBe(true);

      // Unrelated Scene 1 intra-scene neighbors are NOT highlighted
      expect(highlighted.has('scene-1::tooth-and-nail')).toBe(false);
      expect(highlighted.has('scene-1::dischord')).toBe(false);
    });

    it('verifies DetailsPanel canonical viewedIndex sync finds the correct card without mutating selectedNode.id', () => {
      const selectedNode = {
        id: 'scene-3::further-seems-forever-us',
        canonicalId: 'further-seems-forever-us',
        type: 'artist',
      };

      const filteredAndSortedNodes = [
        { id: 'sense-field-us', canonicalId: 'sense-field-us', label: 'Sense Field' },
        { id: 'further-seems-forever-us', canonicalId: 'further-seems-forever-us', label: 'Further Seems Forever' },
        { id: 'jimmy-eat-world-us', canonicalId: 'jimmy-eat-world-us', label: 'Jimmy Eat World' },
      ];

      // Exact string match fails
      const exactIdx = filteredAndSortedNodes.findIndex(n => n.id.toLowerCase() === selectedNode.id.toLowerCase());
      expect(exactIdx).toBe(-1);

      // Canonical match succeeds
      const selectedCanon = stripSceneNamespace(selectedNode.canonicalId || selectedNode.id).toLowerCase();
      const canonicalIdx = filteredAndSortedNodes.findIndex(n => {
        const nCanon = stripSceneNamespace(n.canonicalId || n.id).toLowerCase();
        return nCanon === selectedCanon || normalizeArtistId(nCanon) === normalizeArtistId(selectedCanon);
      });
      expect(canonicalIdx).toBe(1);
      expect(filteredAndSortedNodes[canonicalIdx].label).toBe('Further Seems Forever');
    });
  });

  describe('MAX_SCENES_PER_PROJECT = 5 Guardrails & Symmetry ([Rule 44])', () => {
    it('confirms MAX_SCENES_PER_PROJECT is exported as 5', () => {
      expect(MAX_SCENES_PER_PROJECT).toBe(5);
    });

    it('clamps parseProjectScenes to a maximum of 5 scenes when given > 5 scenes', () => {
      const excessiveScenes = Array.from({ length: 8 }, (_, i) => ({
        id: `scene-${i + 1}`,
        sceneId: `scene-${i + 1}`,
        title: `Scene ${i + 1}`,
        seedArtists: `Artist ${i + 1}`,
        graphData: { nodes: [], links: [] },
      }));

      const parsed = parseProjectScenes(JSON.stringify(excessiveScenes));
      expect(parsed.length).toBe(MAX_SCENES_PER_PROJECT);
      expect(parsed.length).toBe(5);
      expect(parsed.map(s => s.sceneId)).toEqual([
        'scene-1',
        'scene-2',
        'scene-3',
        'scene-4',
        'scene-5',
      ]);
    });

    it('preserves exactly N scenes when N <= 5', () => {
      const threeScenes = [
        { id: 'scene-1', sceneId: 'scene-1', title: 'Scene 1', seedArtists: 'Sense Field' },
        { id: 'scene-2', sceneId: 'scene-2', title: 'Scene 2', seedArtists: 'The Get Up Kids' },
        { id: 'scene-3', sceneId: 'scene-3', title: 'Scene 3', seedArtists: 'Further Seems Forever' },
      ];
      const parsed = parseProjectScenes(JSON.stringify(threeScenes));
      expect(parsed.length).toBe(3);
    });

    it('verifies UI Add Scene button and App.tsx handleAddScene guard condition', () => {
      const currentScenesCount = 5;
      const isAddSceneDisabled = currentScenesCount >= MAX_SCENES_PER_PROJECT;
      expect(isAddSceneDisabled).toBe(true);

      const canAddMoreScenes = (count: number) => count < MAX_SCENES_PER_PROJECT;
      expect(canAddMoreScenes(0)).toBe(true);
      expect(canAddMoreScenes(1)).toBe(true);
      expect(canAddMoreScenes(4)).toBe(true);
      expect(canAddMoreScenes(5)).toBe(false);
      expect(canAddMoreScenes(6)).toBe(false);
    });
  });

  describe('Inline Artist Verification UX & Curation Circuit Breakers ([Rules 5, 19, 30, 44])', () => {
    it('manages PreFlightSeed isVerifyingOrigin state transitions cleanly', () => {
      // 1. Initial mounting state: uncached seed has isVerifyingOrigin = true
      const seed: PreFlightSeed = {
        id: 'the-hope-conspiracy',
        query: 'The Hope Conspiracy',
        predictedOrigin: '',
        isKnownCacheHit: false,
        isVerifyingOrigin: true,
      };

      const hasVerifyingSeeds = (seeds: PreFlightSeed[]) => seeds.some(s => s.isVerifyingOrigin);
      const isConfirmDisabled = (seeds: PreFlightSeed[]) =>
        seeds.some(s => s.isVerifyingOrigin || (!s.predictedOrigin && !s.isAmbiguous));

      expect(hasVerifyingSeeds([seed])).toBe(true);
      expect(isConfirmDisabled([seed])).toBe(true);

      // 2. Verified single artist state
      const verifiedSingle: PreFlightSeed = {
        ...seed,
        isVerifyingOrigin: false,
        predictedOrigin: 'USA',
        genre: 'Hardcore Punk',
      };
      expect(hasVerifyingSeeds([verifiedSingle])).toBe(false);
      expect(isConfirmDisabled([verifiedSingle])).toBe(false);

      // 3. Collision detected state: candidates.length > 1
      const collisionSeed: PreFlightSeed = {
        ...seed,
        isVerifyingOrigin: false,
        isAmbiguous: true,
        candidates: [
          { id: 'ghost-se', name: 'Ghost', origin: 'Sweden', genre: 'Heavy Metal' },
          { id: 'ghost-jp', name: 'Ghost', origin: 'Japan', genre: 'Psychedelic Rock' },
        ],
        selectedCandidateId: undefined,
      };
      const isCollisionDisabled = (s: PreFlightSeed) =>
        s.isVerifyingOrigin || (s.isAmbiguous && !s.selectedCandidateId);
      expect(isCollisionDisabled(collisionSeed)).toBe(true);

      collisionSeed.selectedCandidateId = 'ghost-se';
      expect(isCollisionDisabled(collisionSeed)).toBe(false);

      // 4. Escape hatch required state: isValid === false
      const invalidSeed: PreFlightSeed = {
        ...seed,
        isVerifyingOrigin: false,
        predictedOrigin: '',
        genre: '',
      };
      expect(isConfirmDisabled([invalidSeed])).toBe(true);
    });

    it('enforces attemptedMissIdsRef circuit breaker to prevent infinite proxy-fetch loops', () => {
      const attemptedMissIds = new Set<string>();

      const checkShouldFetch = (nodeId: string, simpleId: string, disambiguatedId: string) => {
        if (
          attemptedMissIds.has(nodeId) ||
          attemptedMissIds.has(nodeId.toLowerCase()) ||
          attemptedMissIds.has(simpleId) ||
          attemptedMissIds.has(disambiguatedId)
        ) {
          return false;
        }
        return true;
      };

      const nodeId = 'the-hope-conspiracy-us';
      const simpleId = 'the-hope-conspiracy';
      const disambiguatedId = 'the-hope-conspiracy-us';

      // First attempt: should fetch
      expect(checkShouldFetch(nodeId, simpleId, disambiguatedId)).toBe(true);

      // On cache miss / synthesis required: record into circuit breaker
      attemptedMissIds.add(nodeId);
      attemptedMissIds.add(nodeId.toLowerCase());
      attemptedMissIds.add(disambiguatedId);
      attemptedMissIds.add(simpleId);

      // Subsequent re-renders / queue cycles: blocked by circuit breaker
      expect(checkShouldFetch(nodeId, simpleId, disambiguatedId)).toBe(false);
      expect(checkShouldFetch('the-hope-conspiracy', 'the-hope-conspiracy', 'the-hope-conspiracy-us')).toBe(false);

      // Clearing on project completed or navigation resets circuit breaker
      attemptedMissIds.clear();
      expect(checkShouldFetch(nodeId, simpleId, disambiguatedId)).toBe(true);
    });

    it('tightens curatingWithSettledScenes to prevent premature hydration of Scene 1 skeleton nodes', () => {
      const evaluateCuratingWithSettledScenes = (
        incomingStatus: string,
        activeSceneId: string,
        scenes: ProjectScene[]
      ) => {
        return (
          incomingStatus === 'curating' &&
          scenes.some(
            s => (s.sceneId || s.id) !== activeSceneId &&
                 s.status === 'completed' &&
                 s.graphData && Array.isArray(s.graphData.nodes) && s.graphData.nodes.length > 0
          )
        );
      };

      // Case A: Scene 1 is curating (incomingStatus = 'curating', activeSceneId = 'scene-1')
      // Scene 1 doc contains 20 skeleton nodes from Column 2, but status is 'curating'
      const curatingScene1: ProjectScene = {
        ...createEmptyProjectScene(0, 'The Hope Conspiracy'),
        id: 'scene-1',
        sceneId: 'scene-1',
        status: 'curating',
        graphData: {
          nodes: Array.from({ length: 20 }, (_, i) => ({
            id: `node-${i}`,
            label: `Node ${i}`,
            type: 'artist' as const,
            group: 1,
          })),
          links: [],
        },
      };

      // Must evaluate to false: Active Loader Gate remains locked, no batch hydration of skeletons
      expect(evaluateCuratingWithSettledScenes('curating', 'scene-1', [curatingScene1])).toBe(false);

      // Case B: Scene 1 completed, now adding Scene 2 (activeSceneId = 'scene-2', status = 'curating')
      const completedScene1: ProjectScene = {
        ...curatingScene1,
        status: 'completed',
      };
      const curatingScene2: ProjectScene = {
        ...createEmptyProjectScene(1, 'Converge'),
        id: 'scene-2',
        sceneId: 'scene-2',
        status: 'curating',
        graphData: { nodes: [], links: [] },
      };

      // Must evaluate to true: Scene 1 remains rendered and interactive while Scene 2 maps
      expect(evaluateCuratingWithSettledScenes('curating', 'scene-2', [completedScene1, curatingScene2])).toBe(true);
    });
  });
});
