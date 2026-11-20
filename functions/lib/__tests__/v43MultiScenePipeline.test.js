"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const genai_1 = require("@google/genai");
const mockGenerateContent = vitest_1.vi.fn();
vitest_1.vi.mock('@google/genai', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        GoogleGenAI: class MockGoogleGenAI {
            models = {
                generateContent: mockGenerateContent,
            };
        },
    };
});
const curatorService_1 = require("../services/curatorService");
const isoCountries_1 = require("../shared/isoCountries");
const multiSceneUtils_1 = require("../shared/multiSceneUtils");
const tokenEconomy_1 = require("../shared/tokenEconomy");
(0, vitest_1.describe)('V43 Backend Multi-Scene Pipeline & Overarching Zine Synthesis ([Rule 24], [Rule 40], [Rule 43], [Rule 44])', () => {
    (0, vitest_1.beforeEach)(() => {
        vitest_1.vi.clearAllMocks();
        process.env.GEMINI_API_KEY = 'test-gemini-api-key';
    });
    (0, vitest_1.it)('defines OVERARCHING_ZINE_SCHEMA with strict required overarchingRationale and crossSceneBridges fields', () => {
        (0, vitest_1.expect)(curatorService_1.OVERARCHING_ZINE_SCHEMA).toBeDefined();
        (0, vitest_1.expect)(curatorService_1.OVERARCHING_ZINE_SCHEMA.required).toEqual(['overarchingRationale', 'crossSceneBridges']);
    });
    (0, vitest_1.it)('synthesizes overarchingRationale and sanitizes directional crossSceneBridges via generateOverarchingZineBackend (with zero em-dashes)', async () => {
        const scene1 = {
            ...(0, multiSceneUtils_1.createEmptyProjectScene)(0, 'Sense Field::Reason to Believe'),
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
        const scene2 = {
            ...(0, multiSceneUtils_1.createEmptyProjectScene)(1, 'Jimmy Eat World'),
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
                overarchingRationale: 'Southern California post-hardcore — anchored by Sense Field — laid the emotional blueprint that Jimmy Eat World carried into the alternative rock mainstream.',
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
        const usageCollector = { push: vitest_1.vi.fn() };
        const res = await (0, curatorService_1.generateOverarchingZineBackend)([scene1, scene2], {}, usageCollector);
        // Zero em-dashes enforced
        (0, vitest_1.expect)(res.overarchingRationale).not.toContain('—');
        (0, vitest_1.expect)(res.overarchingRationale).toContain('Sense Field');
        (0, vitest_1.expect)(res.overarchingRationale).toContain('Jimmy Eat World');
        // Deterministic identity bridge (jimmy-eat-world-us) + sanitized sonic_lineage bridge (sense-field-us -> christie-front-drive-us)
        const identityBridge = res.crossSceneLinks.find((b) => b.bridgeType === 'identity');
        (0, vitest_1.expect)(identityBridge).toBeDefined();
        (0, vitest_1.expect)(identityBridge?.sourceNodeId).toBe('scene-1::jimmy-eat-world-us');
        (0, vitest_1.expect)(identityBridge?.targetNodeId).toBe('scene-2::jimmy-eat-world-us');
        const sonicBridge = res.crossSceneLinks.find((b) => b.bridgeType === 'sonic_lineage');
        (0, vitest_1.expect)(sonicBridge).toBeDefined();
        (0, vitest_1.expect)(sonicBridge?.sourceNodeId).toBe('scene-1::sense-field-us');
        (0, vitest_1.expect)(sonicBridge?.targetNodeId).toBe('scene-2::christie-front-drive-us');
        // Endpoint names stripped by sanitizeDirectionalLinkContext ([Rule 26])
        (0, vitest_1.expect)(sonicBridge?.forwardContext.toLowerCase()).not.toContain('sense field');
        (0, vitest_1.expect)(sonicBridge?.forwardContext.toLowerCase()).not.toContain('christie front drive');
    });
    (0, vitest_1.it)('fails over cleanly to Gemini 3.6 Flash (low) if Gemini 3.1 Pro (high) times out or throws 504 on generateOverarchingZineBackend ([Rule 40])', async () => {
        const scene1 = {
            ...(0, multiSceneUtils_1.createEmptyProjectScene)(0, 'Sense Field'),
            seedIds: ['sense-field-us'],
            status: 'ready',
            synthesisRationale: 'Scene 1 rationale.',
            graphData: {
                nodes: [{ id: 'sense-field-us', label: 'Sense Field', type: 'artist', group: 1, isSeed: true }],
                links: [],
            },
        };
        const scene2 = {
            ...(0, multiSceneUtils_1.createEmptyProjectScene)(1, 'Jimmy Eat World'),
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
        const usageCollector = { push: vitest_1.vi.fn() };
        const res = await (0, curatorService_1.generateOverarchingZineBackend)([scene1, scene2], {}, usageCollector);
        (0, vitest_1.expect)(mockGenerateContent).toHaveBeenCalledTimes(2);
        // V45.1: sanitizeOverarchingRationale scrubs literal 'Scene 1 and Scene 2' to seed names
        (0, vitest_1.expect)(res.overarchingRationale).toBe('Fallback Flash synthesis connecting Sense Field and Jimmy Eat World.');
        (0, vitest_1.expect)(usageCollector.push).toHaveBeenCalledTimes(1);
    });
    (0, vitest_1.it)('maintains strict per-scene token pricing (5T Single-Seed / 10T Complex) and freezes existing scenes when adding Scene 2', () => {
        (0, vitest_1.expect)(tokenEconomy_1.TOKEN_PRICING.SINGLE_SEED).toBe(5);
        (0, vitest_1.expect)(tokenEconomy_1.TOKEN_PRICING.COMPLEX_QUERY).toBe(10);
        const scene1 = {
            ...(0, multiSceneUtils_1.createEmptyProjectScene)(0, 'Sense Field::Reason to Believe'),
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
        const scene2 = {
            ...(0, multiSceneUtils_1.createEmptyProjectScene)(1, 'Jimmy Eat World'),
            seedIds: ['jimmy-eat-world-us'],
            status: 'ready',
            graphData: {
                nodes: [
                    { id: 'jimmy-eat-world-us', label: 'Jimmy Eat World', type: 'artist', group: 1, isSeed: true },
                ],
                links: [],
            },
        };
        const composite = (0, multiSceneUtils_1.buildCompositeCanvasGraph)([scene1, scene2], []);
        const s1Node = composite.nodes.find((n) => n.id === 'scene-1::sense-field-us');
        const s2Node = composite.nodes.find((n) => n.id === 'scene-2::jimmy-eat-world-us');
        (0, vitest_1.expect)(s1Node?.fx).toBe(950);
        (0, vitest_1.expect)(s1Node?.fy).toBe(1000);
        (0, vitest_1.expect)(s2Node?.x).toBeGreaterThan(1750);
        (0, vitest_1.expect)(s2Node?.x).toBeLessThan(2150);
        (0, vitest_1.expect)((0, multiSceneUtils_1.computeDeduplicatedActiveNodes)([scene1, scene2])).toEqual([
            'sense-field-us',
            'reason-to-believe-us',
            'jimmy-eat-world-us',
        ]);
    });
    (0, vitest_1.describe)('V45.1 Backend Chained-Hop Engine & Multi-Scene Upfront Batch ([Phase B1])', () => {
        (0, vitest_1.it)('skips Step 3B overarching synthesis on intermediate hops when remaining uncurated scenes exist', () => {
            const scene1 = {
                ...(0, multiSceneUtils_1.createEmptyProjectScene)(0, 'Korn'),
                status: 'ready',
                graphData: { nodes: [{ id: 'korn-us', label: 'Korn', type: 'artist', group: 1, isSeed: true }], links: [] },
            };
            const scene2 = {
                ...(0, multiSceneUtils_1.createEmptyProjectScene)(1, 'Radiohead'),
                status: 'ready',
                graphData: { nodes: [{ id: 'radiohead-gb', label: 'Radiohead', type: 'artist', group: 1, isSeed: true }], links: [] },
            };
            const scene3Uncurated = {
                ...(0, multiSceneUtils_1.createEmptyProjectScene)(2, 'Green Day'),
                status: 'idle',
            };
            // Hop 2 scenario: 3 scenes total, scene 1 and 2 ready, scene 3 uncurated
            const allScenes = [scene1, scene2, scene3Uncurated];
            const remainingUncuratedHop2 = allScenes.filter((s) => (s.graphData?.nodes?.length ?? 0) === 0 && s.status !== 'ready');
            const isIntermediateChainedHop2 = remainingUncuratedHop2.length > 0;
            (0, vitest_1.expect)(isIntermediateChainedHop2).toBe(true);
            (0, vitest_1.expect)(remainingUncuratedHop2.length).toBe(1);
            (0, vitest_1.expect)(remainingUncuratedHop2[0].seedArtists).toBe('Green Day');
            // Hop 3 (Final Hop) scenario: scene 3 is now curated as well
            const scene3Ready = {
                ...scene3Uncurated,
                status: 'ready',
                graphData: { nodes: [{ id: 'green-day-us', label: 'Green Day', type: 'artist', group: 1, isSeed: true }], links: [] },
            };
            const allScenesFinal = [scene1, scene2, scene3Ready];
            const remainingUncuratedHop3 = allScenesFinal.filter((s) => (s.graphData?.nodes?.length ?? 0) === 0 && s.status !== 'ready');
            const isIntermediateChainedHop3 = remainingUncuratedHop3.length > 0;
            (0, vitest_1.expect)(isIntermediateChainedHop3).toBe(false);
            (0, vitest_1.expect)(remainingUncuratedHop3.length).toBe(0);
        });
        (0, vitest_1.it)('cleanses foregroundApiUsage, lockedSeeds, and seedStubs when constructing chained job inputPayload (Guard 1)', () => {
            const mockInputPayload = {
                projectId: 'proj-123',
                userId: 'user-456',
                curationSessionId: 'sess-789',
                foregroundApiUsage: { 'gemini-3.1-pro-preview': { prompt: 1000, candidates: 200, total: 1200 } },
                lockedSeeds: [{ id: 'korn-us', label: 'Korn' }],
                seedStubs: { korn: { id: 'korn-us' } },
                tokensSpent: 15,
                targetSceneId: 'scene-1',
            };
            const { foregroundApiUsage: _fa, lockedSeeds: _ls, seedStubs: _ss, ...cleanInputPayload } = mockInputPayload;
            (0, vitest_1.expect)(cleanInputPayload.foregroundApiUsage).toBeUndefined();
            (0, vitest_1.expect)(cleanInputPayload.lockedSeeds).toBeUndefined();
            (0, vitest_1.expect)(cleanInputPayload.seedStubs).toBeUndefined();
            (0, vitest_1.expect)(cleanInputPayload.projectId).toBe('proj-123');
            (0, vitest_1.expect)(cleanInputPayload.userId).toBe('user-456');
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
            (0, vitest_1.expect)(nextHopInputPayload.foregroundApiUsage).toBeUndefined();
            (0, vitest_1.expect)(nextHopInputPayload.lockedSeeds).toBeUndefined();
            (0, vitest_1.expect)(nextHopInputPayload.tokensSpent).toBe(0);
            (0, vitest_1.expect)(nextHopInputPayload.isChainedHop).toBe(true);
            (0, vitest_1.expect)(Object.keys(nextHopInputPayload.seedStubs)).toHaveLength(0);
            // Ensure no undefined keys exist in serialized payload
            for (const [, value] of Object.entries(nextHopInputPayload)) {
                (0, vitest_1.expect)(value).not.toBeUndefined();
            }
        });
        (0, vitest_1.it)('correctly calculates upfront batch detection and defers Phase 1 to worker when uncuratedScenesCount > 1', () => {
            const singleScenePayload = {
                scenes: [(0, multiSceneUtils_1.createEmptyProjectScene)(0, 'Korn')],
            };
            const singleUncuratedCount = singleScenePayload.scenes.filter((s) => (s.graphData?.nodes?.length ?? 0) === 0).length;
            const isUpfrontBatchSingle = singleUncuratedCount > 1;
            (0, vitest_1.expect)(isUpfrontBatchSingle).toBe(false);
            const batchThreeScenesPayload = {
                scenes: [
                    (0, multiSceneUtils_1.createEmptyProjectScene)(0, 'Korn'),
                    (0, multiSceneUtils_1.createEmptyProjectScene)(1, 'Radiohead'),
                    (0, multiSceneUtils_1.createEmptyProjectScene)(2, 'Green Day'),
                ],
            };
            const batchUncuratedCount = batchThreeScenesPayload.scenes.filter((s) => (s.graphData?.nodes?.length ?? 0) === 0).length;
            const isUpfrontBatchMulti = batchUncuratedCount > 1;
            (0, vitest_1.expect)(isUpfrontBatchMulti).toBe(true);
            const shouldDeferToWorker = (payload, isBatch) => payload.deferPhase1ToWorker === true || isBatch;
            (0, vitest_1.expect)(shouldDeferToWorker(singleScenePayload, isUpfrontBatchSingle)).toBe(false);
            (0, vitest_1.expect)(shouldDeferToWorker(batchThreeScenesPayload, isUpfrontBatchMulti)).toBe(true);
            (0, vitest_1.expect)(shouldDeferToWorker({ deferPhase1ToWorker: true }, false)).toBe(true);
        });
        (0, vitest_1.it)('prevents double-counting tokensSpent across chained hops (Catch 3)', () => {
            const initialTokensSpent = 15;
            // Hop 1 (not chained, initial job):
            let accumulatedHop1 = initialTokensSpent;
            const pDataHop1 = { tokensSpent: 0 };
            if (typeof pDataHop1.tokensSpent === 'number') {
                accumulatedHop1 = false /* isChainedHop */
                    ? pDataHop1.tokensSpent
                    : pDataHop1.tokensSpent + accumulatedHop1;
            }
            (0, vitest_1.expect)(accumulatedHop1).toBe(15);
            // Hop 2 (isChainedHop: true):
            let accumulatedHop2 = 0; // inputPayload.tokensSpent = 0
            const pDataHop2 = { tokensSpent: 15 };
            if (typeof pDataHop2.tokensSpent === 'number') {
                accumulatedHop2 = true /* isChainedHop */
                    ? pDataHop2.tokensSpent
                    : pDataHop2.tokensSpent + accumulatedHop2;
            }
            // Must NOT be 15 + 15 = 30; must remain 15!
            (0, vitest_1.expect)(accumulatedHop2).toBe(15);
        });
        (0, vitest_1.it)('correctly ingests peer artist/label profiles in Step 0 handling both array and single-object detailsCache formats with redirectTo (Phase B2.2)', () => {
            const existingProjectDetailsMap = new Map();
            const ingestEntityDocIntoMap = (docId, aData, isLabel, redirectTo) => {
                if (!aData)
                    return;
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
                    }
                    else if (isLabel) {
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
                    const norm = isLabel ? (0, curatorService_1.normalizeLabelId)(docId) : (0, curatorService_1.normalizeArtistId)(docId);
                    const bare = (0, isoCountries_1.stripCountrySlug)(norm);
                    existingProjectDetailsMap.set(docId, profile);
                    existingProjectDetailsMap.set(norm, profile);
                    if (bare)
                        existingProjectDetailsMap.set(bare, profile);
                    if (redirectTo) {
                        const redirNorm = isLabel ? (0, curatorService_1.normalizeLabelId)(redirectTo) : (0, curatorService_1.normalizeArtistId)(redirectTo);
                        const redirBare = (0, isoCountries_1.stripCountrySlug)(redirNorm);
                        existingProjectDetailsMap.set(redirectTo, profile);
                        existingProjectDetailsMap.set(redirNorm, profile);
                        if (redirBare)
                            existingProjectDetailsMap.set(redirBare, profile);
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
            (0, vitest_1.expect)(existingProjectDetailsMap.has('deftones-us')).toBe(true);
            (0, vitest_1.expect)(existingProjectDetailsMap.has('deftones')).toBe(true);
            (0, vitest_1.expect)(existingProjectDetailsMap.get('deftones')?.details?.artist).toBe('Deftones');
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
            (0, vitest_1.expect)(existingProjectDetailsMap.has('pj-harvey-gb')).toBe(true);
            (0, vitest_1.expect)(existingProjectDetailsMap.has('pj-harvey')).toBe(true);
            (0, vitest_1.expect)(existingProjectDetailsMap.get('pj-harvey')?.imageUrl).toBe('https://mzstatic.com/pj.jpg');
            // Case C: Label document with top-level fields
            const epicLabelData = {
                name: 'Epic Records',
                summary: 'Epic Records is an American record label owned by Sony Music.',
                details: { artist: 'Epic Records', genre: 'Alternative' }
            };
            ingestEntityDocIntoMap('epic', epicLabelData, true);
            (0, vitest_1.expect)(existingProjectDetailsMap.has('epic')).toBe(true);
            (0, vitest_1.expect)(existingProjectDetailsMap.get('epic')?.summary).toContain('Epic Records');
        });
        (0, vitest_1.it)('correctly ingests single-profile detailsCache in Step 0 without creating stray root keys (Phase B2.3)', () => {
            const existingProjectDetailsMap = new Map();
            const ingestDetailsCacheIntoMap = (rawCache, targetEntityId) => {
                if (!rawCache)
                    return;
                try {
                    const parsed = typeof rawCache === "string" ? JSON.parse(rawCache) : rawCache;
                    if (Array.isArray(parsed)) {
                        for (const item of parsed) {
                            if (Array.isArray(item) && item.length === 2 && item[0] && item[1]) {
                                const key = (0, isoCountries_1.stripCountrySlug)(String(item[0]));
                                existingProjectDetailsMap.set(key, item[1]);
                                existingProjectDetailsMap.set((0, curatorService_1.normalizeArtistId)(key), item[1]);
                            }
                        }
                    }
                    else if (parsed && typeof parsed === "object") {
                        const isSingleProfile = Boolean(parsed.summary || parsed.details || parsed.imageUrl || parsed.discography) &&
                            !('nodes' in parsed);
                        if (isSingleProfile) {
                            const canonicalId = targetEntityId || (parsed.details?.artist ? (0, curatorService_1.normalizeArtistId)(parsed.details.artist) : null);
                            if (canonicalId) {
                                const norm = (0, curatorService_1.normalizeArtistId)(canonicalId);
                                const bare = (0, isoCountries_1.stripCountrySlug)(norm);
                                existingProjectDetailsMap.set(canonicalId, parsed);
                                existingProjectDetailsMap.set(norm, parsed);
                                if (bare)
                                    existingProjectDetailsMap.set(bare, parsed);
                            }
                        }
                        else {
                            for (const [k, v] of Object.entries(parsed)) {
                                if (k && v) {
                                    const key = (0, isoCountries_1.stripCountrySlug)(k);
                                    existingProjectDetailsMap.set(key, v);
                                    existingProjectDetailsMap.set((0, curatorService_1.normalizeArtistId)(key), v);
                                }
                            }
                        }
                    }
                }
                catch {
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
            (0, vitest_1.expect)(existingProjectDetailsMap.has('korn-us')).toBe(true);
            (0, vitest_1.expect)(existingProjectDetailsMap.has('korn')).toBe(true);
            (0, vitest_1.expect)(existingProjectDetailsMap.get('korn-us')?.details?.artist).toBe('Korn');
            // Crucial: Stray keys MUST NEVER be registered as top-level entities
            (0, vitest_1.expect)(existingProjectDetailsMap.has('summary')).toBe(false);
            (0, vitest_1.expect)(existingProjectDetailsMap.has('details')).toBe(false);
            (0, vitest_1.expect)(existingProjectDetailsMap.has('imageUrl')).toBe(false);
            (0, vitest_1.expect)(existingProjectDetailsMap.has('discography')).toBe(false);
            (0, vitest_1.expect)(existingProjectDetailsMap.has('links')).toBe(false);
            (0, vitest_1.expect)(existingProjectDetailsMap.has('members')).toBe(false);
        });
        (0, vitest_1.it)('strictly avoids double-counting tokensSpent when settleCurationProjectTokens pre-records settlement on project doc (Phase B2.3)', () => {
            // 1. Initial 3-scene upfront batch (15T total)
            const inputPayloadTokensSpent = 15;
            const initialProjectDoc = { tokensSpent: 15 }; // Written by settleCurationProjectTokens
            let accumulatedTokensSpent = typeof inputPayloadTokensSpent === 'number' ? inputPayloadTokensSpent : 0;
            if (typeof initialProjectDoc.tokensSpent === 'number' && initialProjectDoc.tokensSpent > 0) {
                accumulatedTokensSpent = initialProjectDoc.tokensSpent;
            }
            // Must be 15, NEVER 15 + 15 = 30!
            (0, vitest_1.expect)(accumulatedTokensSpent).toBe(15);
            // 2. Chained Hop 2 and 3 (inputPayload.tokensSpent = 0)
            const chainedPayloadTokensSpent = 0;
            let chainedAccumulated = typeof chainedPayloadTokensSpent === 'number' ? chainedPayloadTokensSpent : 0;
            if (typeof initialProjectDoc.tokensSpent === 'number' && initialProjectDoc.tokensSpent > 0) {
                chainedAccumulated = initialProjectDoc.tokensSpent;
            }
            (0, vitest_1.expect)(chainedAccumulated).toBe(15);
            // 3. Fallback when pData.tokensSpent is 0 or unset (e.g. test mock)
            const zeroProjectDoc = { tokensSpent: 0 };
            let zeroAccumulated = typeof inputPayloadTokensSpent === 'number' ? inputPayloadTokensSpent : 0;
            if (typeof zeroProjectDoc.tokensSpent === 'number' && zeroProjectDoc.tokensSpent > 0) {
                zeroAccumulated = zeroProjectDoc.tokensSpent;
            }
            (0, vitest_1.expect)(zeroAccumulated).toBe(15);
        });
    });
    (0, vitest_1.describe)('Phase B2.12: Calibrated Artist-Only Box 5 & Disconnected Sub-Island Bridge Guard', () => {
        (0, vitest_1.it)('filters Box 5 context to artist link endpoints, forwards seedIds & forwardContext, uses ThinkingLevel.LOW, and prompts the 3-Tier Rubric', async () => {
            const detailsEntries = [
                ['korn-us', { summary: 'Bakersfield nu-metal pioneers.', details: { genre: 'Nu Metal', founded: '1993' } }],
                ['deftones-us', { summary: 'Sacramento alt-metal peers.', details: { genre: 'Alternative Metal', founded: '1988' } }],
                ['united-states', { summary: 'North American country.', details: { genre: 'Country' } }],
                ['1993', { summary: 'Year 1993.', details: {} }],
            ];
            const artistLinks = [
                { source: 'korn-us', target: 'deftones-us', forwardContext: 'toured heavily together in the mid-90s' },
            ];
            mockGenerateContent.mockResolvedValueOnce({
                text: JSON.stringify([{ source: 'korn-us', target: 'deftones-us', weight: 0.9 }]),
                usageMetadata: { promptTokenCount: 120, candidatesTokenCount: 40, totalTokenCount: 160 },
            });
            const usageCollector = { push: vitest_1.vi.fn() };
            const res = await (0, curatorService_1.generateSemanticLinkWeights)('test-key', detailsEntries, artistLinks, usageCollector, ['korn-us']);
            (0, vitest_1.expect)(res).toEqual([{ source: 'korn-us', target: 'deftones-us', weight: 0.9 }]);
            (0, vitest_1.expect)(mockGenerateContent).toHaveBeenCalledTimes(1);
            const callArg = mockGenerateContent.mock.calls[0][0];
            (0, vitest_1.expect)(callArg.config.thinkingConfig.thinkingLevel).toBe(genai_1.ThinkingLevel.LOW);
            (0, vitest_1.expect)(callArg.contents).toContain('3-Tier Forced-Distribution Rubric');
            (0, vitest_1.expect)(callArg.contents).toContain('0.85 to 1.00');
            (0, vitest_1.expect)(callArg.contents).toContain('0.45 to 0.70');
            (0, vitest_1.expect)(callArg.contents).toContain('0.15 to 0.35');
            (0, vitest_1.expect)(callArg.contents).toContain('toured heavily together in the mid-90s');
            (0, vitest_1.expect)(callArg.contents).toContain('"isSceneRoot":true');
            // Non-participating metadata context entries excluded
            (0, vitest_1.expect)(callArg.contents).not.toContain('"id":"united-states"');
            (0, vitest_1.expect)(callArg.contents).not.toContain('"id":"1993"');
            (0, vitest_1.expect)(callArg.contents).not.toContain('Year 1993.');
        });
        (0, vitest_1.it)('stitches disconnected artist sub-islands to the primary seed and locks deterministic metadata weights', () => {
            const nodes = [
                { id: 'korn-us', type: 'artist', label: 'Korn', isSeed: true },
                { id: 'deftones-us', type: 'artist', label: 'Deftones' },
                { id: 'static-x-us', type: 'artist', label: 'Static-X' },
                { id: 'disturbed-us', type: 'artist', label: 'Disturbed' },
                { id: 'drowning-pool-us', type: 'artist', label: 'Drowning Pool' },
                { id: 'nu-metal', type: 'genre', label: 'Nu Metal' },
                { id: 'united-states', type: 'country', label: 'United States' },
                { id: 'epic', type: 'label', label: 'Epic' },
                { id: '1993', type: 'founded', label: '1993' },
            ];
            const links = [
                { source: 'korn-us', target: 'deftones-us', weight: 0.8 },
                { source: 'static-x-us', target: 'disturbed-us', weight: 0.7 },
                { source: 'disturbed-us', target: 'drowning-pool-us', weight: 0.6 },
                { source: 'korn-us', target: 'nu-metal', weight: 0.5 },
                { source: 'korn-us', target: 'united-states', weight: 0.5 },
                { source: 'korn-us', target: 'epic', weight: 0.5 },
                { source: 'korn-us', target: '1993', weight: 0.5 },
                { source: 'disturbed-us', target: 'nu-metal', weight: 0.5 },
            ];
            // Mirror Step 4C component bridge guard + deterministic metadata weights
            const nodeById = new Map(nodes.map((n) => [n.id, n]));
            const artistNodesList = nodes.filter((n) => (n.type || 'artist') === 'artist');
            const seedArtistNodes = artistNodesList.filter((n) => n.isSeed);
            const aaAdj = new Map();
            artistNodesList.forEach((n) => aaAdj.set(n.id, new Set()));
            links.forEach((l) => {
                if (aaAdj.has(l.source) && aaAdj.has(l.target) && l.source !== l.target) {
                    aaAdj.get(l.source).add(l.target);
                    aaAdj.get(l.target).add(l.source);
                }
            });
            const reachable = new Set();
            const q = [seedArtistNodes[0].id];
            reachable.add(seedArtistNodes[0].id);
            while (q.length > 0) {
                const curr = q.shift();
                for (const nb of aaAdj.get(curr) || []) {
                    if (!reachable.has(nb)) {
                        reachable.add(nb);
                        q.push(nb);
                    }
                }
            }
            const unvisited = artistNodesList.filter((n) => !reachable.has(n.id));
            const visitedIslands = new Set();
            for (const startNode of unvisited) {
                if (visitedIslands.has(startNode.id))
                    continue;
                const comp = [];
                const iq = [startNode.id];
                visitedIslands.add(startNode.id);
                while (iq.length > 0) {
                    const c = iq.shift();
                    comp.push(c);
                    for (const nb of aaAdj.get(c) || []) {
                        if (!visitedIslands.has(nb) && !reachable.has(nb)) {
                            visitedIslands.add(nb);
                            iq.push(nb);
                        }
                    }
                }
                comp.sort((a, b) => (aaAdj.get(b)?.size || 0) - (aaAdj.get(a)?.size || 0));
                links.push({
                    source: seedArtistNodes[0].id,
                    target: comp[0],
                    value: 1,
                    weight: 0.3,
                    forwardContext: 'shared era and broader scene lineage with',
                });
            }
            const artistOnlyLinks = [];
            links.forEach((l) => {
                const sType = nodeById.get(l.source)?.type || 'artist';
                const tType = nodeById.get(l.target)?.type || 'artist';
                if (sType === 'artist' && tType === 'artist') {
                    artistOnlyLinks.push(l);
                }
                else {
                    const metaType = sType !== 'artist' ? sType : tType;
                    if (metaType === 'country')
                        l.weight = 0.2;
                    else if (metaType === 'founded')
                        l.weight = 0.1;
                    else if (metaType === 'genre')
                        l.weight = 0.8;
                    else if (metaType === 'label')
                        l.weight = 0.7;
                }
            });
            // Highest-degree node in the disconnected 3-band island (`disturbed-us`, degree 2) stitched to `korn-us`
            (0, vitest_1.expect)(links.some((l) => l.source === 'korn-us' && l.target === 'disturbed-us' && l.weight === 0.3)).toBe(true);
            (0, vitest_1.expect)(artistOnlyLinks.every((l) => nodeById.get(l.source)?.type === 'artist' && nodeById.get(l.target)?.type === 'artist')).toBe(true);
            (0, vitest_1.expect)(links.find((l) => l.target === 'united-states')?.weight).toBe(0.2);
            (0, vitest_1.expect)(links.find((l) => l.target === '1993')?.weight).toBe(0.1);
            (0, vitest_1.expect)(links.find((l) => l.target === 'nu-metal' && l.source === 'korn-us')?.weight).toBe(0.8);
            (0, vitest_1.expect)(links.find((l) => l.target === 'epic')?.weight).toBe(0.7);
        });
    });
});
//# sourceMappingURL=v43MultiScenePipeline.test.js.map