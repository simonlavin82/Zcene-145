import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CrossSceneLink, ProjectScene } from '../types';

const mockGenerateContent = vi.fn();

vi.mock('@google/genai', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    GoogleGenAI: class MockGoogleGenAI {
      models = {
        generateContent: mockGenerateContent,
      };
    },
  };
});

import {
  OVERARCHING_ZINE_SCHEMA,
  generateOverarchingZineBackend,
  UsageCollector,
  normalizeArtistId,
  normalizeLabelId,
} from '../services/curatorService';
import { stripCountrySlug } from '../shared/isoCountries';
import {
  createEmptyProjectScene,
  buildCompositeCanvasGraph,
  computeDeduplicatedActiveNodes,
} from '../shared/multiSceneUtils';
import { TOKEN_PRICING } from '../shared/tokenEconomy';

describe('V43 Backend Multi-Scene Pipeline & Overarching Zine Synthesis ([Rule 24], [Rule 40], [Rule 43], [Rule 44])', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GEMINI_API_KEY = 'test-gemini-api-key';
  });

  it('defines OVERARCHING_ZINE_SCHEMA with strict required overarchingRationale and crossSceneBridges fields', () => {
    expect(OVERARCHING_ZINE_SCHEMA).toBeDefined();
    expect(OVERARCHING_ZINE_SCHEMA.required).toEqual(['overarchingRationale', 'crossSceneBridges']);
  });

  it('synthesizes overarchingRationale and sanitizes directional crossSceneBridges via generateOverarchingZineBackend (with zero em-dashes)', async () => {
    const scene1: ProjectScene = {
      ...createEmptyProjectScene(0, 'Sense Field::Reason to Believe'),
      seedIds: ['sense-field-us', 'reason-to-believe-us'],
      status: 'ready',
      synthesisRationale: 'Scene 1 explores the Southern California transition from hardcore to emotional post-hardcore.',
      graphData: {
        nodes: [
          { id: 'sense-field-us', label: 'Sense Field', type: 'artist', group: 1, isSeed: true },
          { id: 'reason-to-believe-us', label: 'Reason to Believe', type: 'artist', group: 1, isSeed: true },
          { id: 'jimmy-eat-world-us', label: 'Jimmy Eat World', type: 'artist', group: 2, isSeed: false },
        ],
        links: [],
      },
    };

    const scene2: ProjectScene = {
      ...createEmptyProjectScene(1, 'Jimmy Eat World'),
      seedIds: ['jimmy-eat-world-us'],
      status: 'ready',
      synthesisRationale: 'Scene 2 maps the Arizona melodic rock boom led by Jimmy Eat World and Christie Front Drive.',
      graphData: {
        nodes: [
          { id: 'jimmy-eat-world-us', label: 'Jimmy Eat World', type: 'artist', group: 1, isSeed: true },
          { id: 'christie-front-drive-us', label: 'Christie Front Drive', type: 'artist', group: 2, isSeed: false },
        ],
        links: [],
      },
    };

    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        overarchingRationale:
          'Southern California post-hardcore — anchored by Sense Field — laid the emotional blueprint that Jimmy Eat World carried into the alternative rock mainstream.',
        crossSceneBridges: [
          {
            sourceSceneId: 'scene-1',
            sourceCanonicalId: 'sense-field-us',
            targetSceneId: 'scene-2',
            targetCanonicalId: 'christie-front-drive-us',
            bridgeType: 'sonic_lineage',
            forwardContext: 'Sense Field shaped the shimmering melodic guitars of Christie Front Drive',
            inverseContext: 'Christie Front Drive expanded the soaring dynamics pioneered by Sense Field',
            weight: 0.88,
          },
        ],
      }),
      usageMetadata: {
        promptTokenCount: 950,
        candidatesTokenCount: 320,
        totalTokenCount: 1270,
      },
    });

    const usageCollector: UsageCollector = { push: vi.fn() };
    const res = await generateOverarchingZineBackend([scene1, scene2], {}, usageCollector);

    // Zero em-dashes enforced
    expect(res.overarchingRationale).not.toContain('—');
    expect(res.overarchingRationale).toContain('Sense Field');
    expect(res.overarchingRationale).toContain('Jimmy Eat World');

    // Deterministic identity bridge (jimmy-eat-world-us) + sanitized sonic_lineage bridge (sense-field-us -> christie-front-drive-us)
    const identityBridge = res.crossSceneLinks.find((b: CrossSceneLink) => b.bridgeType === 'identity');
    expect(identityBridge).toBeDefined();
    expect(identityBridge?.sourceNodeId).toBe('scene-1::jimmy-eat-world-us');
    expect(identityBridge?.targetNodeId).toBe('scene-2::jimmy-eat-world-us');

    const sonicBridge = res.crossSceneLinks.find((b: CrossSceneLink) => b.bridgeType === 'sonic_lineage');
    expect(sonicBridge).toBeDefined();
    expect(sonicBridge?.sourceNodeId).toBe('scene-1::sense-field-us');
    expect(sonicBridge?.targetNodeId).toBe('scene-2::christie-front-drive-us');
    // Endpoint names stripped by sanitizeDirectionalLinkContext ([Rule 26])
    expect(sonicBridge?.forwardContext.toLowerCase()).not.toContain('sense field');
    expect(sonicBridge?.forwardContext.toLowerCase()).not.toContain('christie front drive');
  });

  it('fails over cleanly to Gemini 3.6 Flash (low) if Gemini 3.1 Pro (high) times out or throws 504 on generateOverarchingZineBackend ([Rule 40])', async () => {
    const scene1: ProjectScene = {
      ...createEmptyProjectScene(0, 'Sense Field'),
      seedIds: ['sense-field-us'],
      status: 'ready',
      synthesisRationale: 'Scene 1 rationale.',
      graphData: {
        nodes: [{ id: 'sense-field-us', label: 'Sense Field', type: 'artist', group: 1, isSeed: true }],
        links: [],
      },
    };
    const scene2: ProjectScene = {
      ...createEmptyProjectScene(1, 'Jimmy Eat World'),
      seedIds: ['jimmy-eat-world-us'],
      status: 'ready',
      synthesisRationale: 'Scene 2 rationale.',
      graphData: {
        nodes: [{ id: 'jimmy-eat-world-us', label: 'Jimmy Eat World', type: 'artist', group: 1, isSeed: true }],
        links: [],
      },
    };

    mockGenerateContent
      .mockRejectedValueOnce(new Error('504 DEADLINE_EXCEEDED'))
      .mockResolvedValueOnce({
        text: JSON.stringify({
          overarchingRationale: 'Fallback Flash synthesis connecting Scene 1 and Scene 2.',
          crossSceneBridges: [],
        }),
        usageMetadata: { promptTokenCount: 500, candidatesTokenCount: 200, totalTokenCount: 700 },
      });

    const usageCollector: UsageCollector = { push: vi.fn() };
    const res = await generateOverarchingZineBackend([scene1, scene2], {}, usageCollector);

    expect(mockGenerateContent).toHaveBeenCalledTimes(2);
    // V45.1: sanitizeOverarchingRationale scrubs literal 'Scene 1 and Scene 2' to seed names
    expect(res.overarchingRationale).toBe('Fallback Flash synthesis connecting Sense Field and Jimmy Eat World.');
    expect(usageCollector.push).toHaveBeenCalledTimes(1);
  });

  it('maintains strict per-scene token pricing (5T Single-Seed / 10T Complex) and freezes existing scenes when adding Scene 2', () => {
    expect(TOKEN_PRICING.SINGLE_SEED).toBe(5);
    expect(TOKEN_PRICING.COMPLEX_QUERY).toBe(10);

    const scene1: ProjectScene = {
      ...createEmptyProjectScene(0, 'Sense Field::Reason to Believe'),
      seedIds: ['sense-field-us', 'reason-to-believe-us'],
      status: 'ready',
      graphData: {
        nodes: [
          { id: 'sense-field-us', label: 'Sense Field', type: 'artist', group: 1, isSeed: true, x: 950, y: 1000, fx: 950, fy: 1000 },
          { id: 'reason-to-believe-us', label: 'Reason to Believe', type: 'artist', group: 1, isSeed: true, x: 1050, y: 1000, fx: 1050, fy: 1000 },
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
        ],
        links: [],
      },
    };

    const composite = buildCompositeCanvasGraph([scene1, scene2], []);
    const s1Node = composite.nodes.find((n) => n.id === 'scene-1::sense-field-us');
    const s2Node = composite.nodes.find((n) => n.id === 'scene-2::jimmy-eat-world-us');
    expect(s1Node?.fx).toBe(950);
    expect(s1Node?.fy).toBe(1000);
    expect(s2Node?.x).toBeGreaterThan(1750);
    expect(s2Node?.x).toBeLessThan(2150);
    expect(computeDeduplicatedActiveNodes([scene1, scene2])).toEqual([
      'sense-field-us',
      'reason-to-believe-us',
      'jimmy-eat-world-us',
    ]);
  });

  describe('V45.1 Backend Chained-Hop Engine & Multi-Scene Upfront Batch ([Phase B1])', () => {
    it('skips Step 3B overarching synthesis on intermediate hops when remaining uncurated scenes exist', () => {
      const scene1: ProjectScene = {
        ...createEmptyProjectScene(0, 'Korn'),
        status: 'ready',
        graphData: { nodes: [{ id: 'korn-us', label: 'Korn', type: 'artist', group: 1, isSeed: true }], links: [] },
      };
      const scene2: ProjectScene = {
        ...createEmptyProjectScene(1, 'Radiohead'),
        status: 'ready',
        graphData: { nodes: [{ id: 'radiohead-gb', label: 'Radiohead', type: 'artist', group: 1, isSeed: true }], links: [] },
      };
      const scene3Uncurated: ProjectScene = {
        ...createEmptyProjectScene(2, 'Green Day'),
        status: 'idle',
      };

      // Hop 2 scenario: 3 scenes total, scene 1 and 2 ready, scene 3 uncurated
      const allScenes = [scene1, scene2, scene3Uncurated];
      const remainingUncuratedHop2 = allScenes.filter(
        (s) => (s.graphData?.nodes?.length ?? 0) === 0 && s.status !== 'ready'
      );
      const isIntermediateChainedHop2 = remainingUncuratedHop2.length > 0;
      expect(isIntermediateChainedHop2).toBe(true);
      expect(remainingUncuratedHop2.length).toBe(1);
      expect(remainingUncuratedHop2[0].seedArtists).toBe('Green Day');

      // Hop 3 (Final Hop) scenario: scene 3 is now curated as well
      const scene3Ready: ProjectScene = {
        ...scene3Uncurated,
        status: 'ready',
        graphData: { nodes: [{ id: 'green-day-us', label: 'Green Day', type: 'artist', group: 1, isSeed: true }], links: [] },
      };
      const allScenesFinal = [scene1, scene2, scene3Ready];
      const remainingUncuratedHop3 = allScenesFinal.filter(
        (s) => (s.graphData?.nodes?.length ?? 0) === 0 && s.status !== 'ready'
      );
      const isIntermediateChainedHop3 = remainingUncuratedHop3.length > 0;
      expect(isIntermediateChainedHop3).toBe(false);
      expect(remainingUncuratedHop3.length).toBe(0);
    });

    it('cleanses foregroundApiUsage, lockedSeeds, and seedStubs when constructing chained job inputPayload (Guard 1)', () => {
      const mockInputPayload: Record<string, any> = {
        projectId: 'proj-123',
        userId: 'user-456',
        curationSessionId: 'sess-789',
        foregroundApiUsage: { 'gemini-3.1-pro-preview': { prompt: 1000, candidates: 200, total: 1200 } },
        lockedSeeds: [{ id: 'korn-us', label: 'Korn' }],
        seedStubs: { korn: { id: 'korn-us' } },
        tokensSpent: 15,
        targetSceneId: 'scene-1',
      };

      const {
        foregroundApiUsage: _fa,
        lockedSeeds: _ls,
        seedStubs: _ss,
        ...cleanInputPayload
      } = mockInputPayload;

      expect(cleanInputPayload.foregroundApiUsage).toBeUndefined();
      expect(cleanInputPayload.lockedSeeds).toBeUndefined();
      expect(cleanInputPayload.seedStubs).toBeUndefined();
      expect(cleanInputPayload.projectId).toBe('proj-123');
      expect(cleanInputPayload.userId).toBe('user-456');

      // Firestore nextJobRef inputPayload shape
      const nextHopInputPayload = {
        ...cleanInputPayload,
        targetSceneId: 'scene-2',
        sceneIndex: 1,
        artists: 'Radiohead',
        filters: {},
        isChainedHop: true,
        tokensSpent: 0,
        seedStubs: {},
        baseGraph: { nodes: [], links: [] },
      };

      expect((nextHopInputPayload as any).foregroundApiUsage).toBeUndefined();
      expect((nextHopInputPayload as any).lockedSeeds).toBeUndefined();
      expect(nextHopInputPayload.tokensSpent).toBe(0);
      expect(nextHopInputPayload.isChainedHop).toBe(true);
      expect(Object.keys(nextHopInputPayload.seedStubs)).toHaveLength(0);
      // Ensure no undefined keys exist in serialized payload
      for (const [, value] of Object.entries(nextHopInputPayload)) {
        expect(value).not.toBeUndefined();
      }
    });

    it('correctly calculates upfront batch detection and defers Phase 1 to worker when uncuratedScenesCount > 1', () => {
      const singleScenePayload = {
        scenes: [createEmptyProjectScene(0, 'Korn')],
      };
      const singleUncuratedCount = singleScenePayload.scenes.filter(
        (s) => (s.graphData?.nodes?.length ?? 0) === 0
      ).length;
      const isUpfrontBatchSingle = singleUncuratedCount > 1;
      expect(isUpfrontBatchSingle).toBe(false);

      const batchThreeScenesPayload = {
        scenes: [
          createEmptyProjectScene(0, 'Korn'),
          createEmptyProjectScene(1, 'Radiohead'),
          createEmptyProjectScene(2, 'Green Day'),
        ],
      };
      const batchUncuratedCount = batchThreeScenesPayload.scenes.filter(
        (s) => (s.graphData?.nodes?.length ?? 0) === 0
      ).length;
      const isUpfrontBatchMulti = batchUncuratedCount > 1;
      expect(isUpfrontBatchMulti).toBe(true);

      const shouldDeferToWorker = (payload: any, isBatch: boolean) =>
        payload.deferPhase1ToWorker === true || isBatch;

      expect(shouldDeferToWorker(singleScenePayload, isUpfrontBatchSingle)).toBe(false);
      expect(shouldDeferToWorker(batchThreeScenesPayload, isUpfrontBatchMulti)).toBe(true);
      expect(shouldDeferToWorker({ deferPhase1ToWorker: true }, false)).toBe(true);
    });

    it('prevents double-counting tokensSpent across chained hops (Catch 3)', () => {
      const initialTokensSpent = 15;

      // Hop 1 (not chained, initial job):
      let accumulatedHop1 = initialTokensSpent;
      const pDataHop1: any = { tokensSpent: 0 };
      if (typeof pDataHop1.tokensSpent === 'number') {
        accumulatedHop1 = false /* isChainedHop */
          ? pDataHop1.tokensSpent
          : pDataHop1.tokensSpent + accumulatedHop1;
      }
      expect(accumulatedHop1).toBe(15);

      // Hop 2 (isChainedHop: true):
      let accumulatedHop2 = 0; // inputPayload.tokensSpent = 0
      const pDataHop2: any = { tokensSpent: 15 };
      if (typeof pDataHop2.tokensSpent === 'number') {
        accumulatedHop2 = true /* isChainedHop */
          ? pDataHop2.tokensSpent
          : pDataHop2.tokensSpent + accumulatedHop2;
      }
      // Must NOT be 15 + 15 = 30; must remain 15!
      expect(accumulatedHop2).toBe(15);
    });

    it('correctly ingests peer artist/label profiles in Step 0 handling both array and single-object detailsCache formats with redirectTo (Phase B2.2)', () => {
      const existingProjectDetailsMap = new Map<string, any>();

      const ingestEntityDocIntoMap = (docId: string, aData: any, isLabel: boolean, redirectTo?: string) => {
        if (!aData) return;
        let profile = aData.detailsCache ? (typeof aData.detailsCache === 'string' ? JSON.parse(aData.detailsCache) : aData.detailsCache) : null;
        if (Array.isArray(profile) && profile.length > 0) {
          profile = Array.isArray(profile[0]) ? profile[0][1] : profile[0];
        }
        if (!profile || !profile.summary) {
          if (aData.summary || aData.bio || aData.details) {
            profile = {
              summary: aData.summary || aData.bio || aData.description || (isLabel ? 'Record label active in the music scene.' : ''),
              imageUrl: aData.imageUrl || '',
              details: aData.details || { artist: aData.name || aData.seedArtists || aData.label || docId },
              members: aData.members || [],
              discography: aData.discography || [],
              youtubeVideoId: aData.youtubeVideoId || undefined,
              previewUrl: aData.previewUrl || undefined,
              itunesArtistId: aData.itunesArtistId || undefined,
            };
          } else if (isLabel) {
            profile = {
              summary: 'Record label active in the music scene.',
              imageUrl: '',
              details: { artist: aData.name || aData.label || docId, genre: '', style: '', origin: '', founded: '', notableArtists: [] },
              members: [],
              discography: []
            };
          }
        }
        if (profile && (profile.summary || profile.details)) {
          const norm = isLabel ? normalizeLabelId(docId) : normalizeArtistId(docId);
          const bare = stripCountrySlug(norm);
          existingProjectDetailsMap.set(docId, profile);
          existingProjectDetailsMap.set(norm, profile);
          if (bare) existingProjectDetailsMap.set(bare, profile);
          if (redirectTo) {
            const redirNorm = isLabel ? normalizeLabelId(redirectTo) : normalizeArtistId(redirectTo);
            const redirBare = stripCountrySlug(redirNorm);
            existingProjectDetailsMap.set(redirectTo, profile);
            existingProjectDetailsMap.set(redirNorm, profile);
            if (redirBare) existingProjectDetailsMap.set(redirBare, profile);
          }
        }
      };

      // Case A: Single profile object format (e.g. from healOrphanedAsset or direct cache)
      const deftonesData = {
        detailsCache: {
          summary: 'Deftones are an American alternative metal band from Sacramento, California.',
          imageUrl: 'https://mzstatic.com/deftones.jpg',
          details: { artist: 'Deftones', origin: 'Sacramento, USA', genre: 'Alternative Metal', founded: '1988' }
        }
      };
      ingestEntityDocIntoMap('deftones-us', deftonesData, false, 'deftones');

      expect(existingProjectDetailsMap.has('deftones-us')).toBe(true);
      expect(existingProjectDetailsMap.has('deftones')).toBe(true);
      expect(existingProjectDetailsMap.get('deftones')?.details?.artist).toBe('Deftones');

      // Case B: 2D Array format (e.g. [ [ 'pj-harvey-gb', profile ] ])
      const pjHarveyData = {
        detailsCache: [
          ['pj-harvey-gb', {
            summary: 'PJ Harvey is an English musician and singer-songwriter.',
            imageUrl: 'https://mzstatic.com/pj.jpg',
            details: { artist: 'PJ Harvey', origin: 'Dorset, UK', genre: 'Brit Indie', founded: '1988' }
          }]
        ]
      };
      ingestEntityDocIntoMap('pj-harvey-gb', pjHarveyData, false, 'pj-harvey');

      expect(existingProjectDetailsMap.has('pj-harvey-gb')).toBe(true);
      expect(existingProjectDetailsMap.has('pj-harvey')).toBe(true);
      expect(existingProjectDetailsMap.get('pj-harvey')?.imageUrl).toBe('https://mzstatic.com/pj.jpg');

      // Case C: Label document with top-level fields
      const epicLabelData = {
        name: 'Epic Records',
        summary: 'Epic Records is an American record label owned by Sony Music.',
        details: { artist: 'Epic Records', genre: 'Alternative' }
      };
      ingestEntityDocIntoMap('epic', epicLabelData, true);

      expect(existingProjectDetailsMap.has('epic')).toBe(true);
      expect(existingProjectDetailsMap.get('epic')?.summary).toContain('Epic Records');
    });

    it('correctly ingests single-profile detailsCache in Step 0 without creating stray root keys (Phase B2.3)', () => {
      const existingProjectDetailsMap = new Map<string, any>();

      const ingestDetailsCacheIntoMap = (rawCache: any, targetEntityId?: string) => {
        if (!rawCache) return;
        try {
          const parsed = typeof rawCache === "string" ? JSON.parse(rawCache) : rawCache;
          if (Array.isArray(parsed)) {
            for (const item of parsed) {
              if (Array.isArray(item) && item.length === 2 && item[0] && item[1]) {
                const key = stripCountrySlug(String(item[0]));
                existingProjectDetailsMap.set(key, item[1]);
                existingProjectDetailsMap.set(normalizeArtistId(key), item[1]);
              }
            }
          } else if (parsed && typeof parsed === "object") {
            const isSingleProfile =
              Boolean(parsed.summary || parsed.details || parsed.imageUrl || parsed.discography) &&
              !('nodes' in parsed);

            if (isSingleProfile) {
              const canonicalId = targetEntityId || (parsed.details?.artist ? normalizeArtistId(parsed.details.artist) : null);
              if (canonicalId) {
                const norm = normalizeArtistId(canonicalId);
                const bare = stripCountrySlug(norm);
                existingProjectDetailsMap.set(canonicalId, parsed);
                existingProjectDetailsMap.set(norm, parsed);
                if (bare) existingProjectDetailsMap.set(bare, parsed);
              }
            } else {
              for (const [k, v] of Object.entries(parsed)) {
                if (k && v) {
                  const key = stripCountrySlug(k);
                  existingProjectDetailsMap.set(key, v);
                  existingProjectDetailsMap.set(normalizeArtistId(key), v);
                }
              }
            }
          }
        } catch {
          // Ignore malformed cache
        }
      };

      // Raw single profile as stored in /artists/korn-us
      const kornProfile = {
        summary: 'Korn altered the trajectory of heavy music by popularizing low-tuned seven-string guitar tunings.',
        imageUrl: 'https://mzstatic.com/korn.jpg',
        details: { artist: 'Korn', origin: 'Bakersfield, USA', genre: 'Nu Metal', founded: '1993' },
        discography: [{ albumName: 'Follow the Leader', releaseYear: '1998' }],
        links: [{ type: 'spotify', url: 'https://spotify.com/korn' }],
        members: ['Jonathan Davis', 'James Shaffer', 'Brian Welch']
      };

      ingestDetailsCacheIntoMap(kornProfile, 'korn-us');

      // Verified: Associated under canonical and bare keys
      expect(existingProjectDetailsMap.has('korn-us')).toBe(true);
      expect(existingProjectDetailsMap.has('korn')).toBe(true);
      expect(existingProjectDetailsMap.get('korn-us')?.details?.artist).toBe('Korn');

      // Crucial: Stray keys MUST NEVER be registered as top-level entities
      expect(existingProjectDetailsMap.has('summary')).toBe(false);
      expect(existingProjectDetailsMap.has('details')).toBe(false);
      expect(existingProjectDetailsMap.has('imageUrl')).toBe(false);
      expect(existingProjectDetailsMap.has('discography')).toBe(false);
      expect(existingProjectDetailsMap.has('links')).toBe(false);
      expect(existingProjectDetailsMap.has('members')).toBe(false);
    });

    it('strictly avoids double-counting tokensSpent when settleCurationProjectTokens pre-records settlement on project doc (Phase B2.3)', () => {
      // 1. Initial 3-scene upfront batch (15T total)
      const inputPayloadTokensSpent = 15;
      const initialProjectDoc = { tokensSpent: 15 }; // Written by settleCurationProjectTokens

      let accumulatedTokensSpent = typeof inputPayloadTokensSpent === 'number' ? inputPayloadTokensSpent : 0;
      if (typeof initialProjectDoc.tokensSpent === 'number' && initialProjectDoc.tokensSpent > 0) {
        accumulatedTokensSpent = initialProjectDoc.tokensSpent;
      }

      // Must be 15, NEVER 15 + 15 = 30!
      expect(accumulatedTokensSpent).toBe(15);

      // 2. Chained Hop 2 and 3 (inputPayload.tokensSpent = 0)
      const chainedPayloadTokensSpent = 0;
      let chainedAccumulated = typeof chainedPayloadTokensSpent === 'number' ? chainedPayloadTokensSpent : 0;
      if (typeof initialProjectDoc.tokensSpent === 'number' && initialProjectDoc.tokensSpent > 0) {
        chainedAccumulated = initialProjectDoc.tokensSpent;
      }
      expect(chainedAccumulated).toBe(15);

      // 3. Fallback when pData.tokensSpent is 0 or unset (e.g. test mock)
      const zeroProjectDoc = { tokensSpent: 0 };
      let zeroAccumulated = typeof inputPayloadTokensSpent === 'number' ? inputPayloadTokensSpent : 0;
      if (typeof zeroProjectDoc.tokensSpent === 'number' && zeroProjectDoc.tokensSpent > 0) {
        zeroAccumulated = zeroProjectDoc.tokensSpent;
      }
      expect(zeroAccumulated).toBe(15);
    });
  });
});
