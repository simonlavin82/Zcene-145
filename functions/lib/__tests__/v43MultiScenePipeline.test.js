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
        (0, vitest_1.expect)(res.overarchingRationale).toBe('Fallback Flash synthesis connecting Scene 1 and Scene 2.');
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
        (0, vitest_1.expect)(s2Node?.x).toBeGreaterThan(2400);
        (0, vitest_1.expect)((0, multiSceneUtils_1.computeDeduplicatedActiveNodes)([scene1, scene2])).toEqual([
            'sense-field-us',
            'reason-to-believe-us',
            'jimmy-eat-world-us',
        ]);
    });
});
//# sourceMappingURL=v43MultiScenePipeline.test.js.map