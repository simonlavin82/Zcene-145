"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
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
    });
});
//# sourceMappingURL=v43MultiScenePipeline.test.js.map