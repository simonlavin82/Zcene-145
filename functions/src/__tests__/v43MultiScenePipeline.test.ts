import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ThinkingLevel } from '@google/genai';
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
  assessOverarchingZineQuality,
  generateOverarchingZineBackend,
  generateSemanticLinkWeights,
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

  it('rejects sparse 247-word / 0-bullet / 1-bridge Direct Hit output and passes rich 330-word / 3-bullet / 4-bridge editorial via assessOverarchingZineQuality (V45.8)', () => {
    const sparseRationale =
      'The 1990s British music press was largely obsessed with London pop royalty, but a much noisier revolution was quietly brewing on four-track cassette recorders in Scotland. Trace the origins of this ecosystem to Dundee, where **Spare Snare** forged a definitive **lo-fi** sound. They actively rejected studio polish in favor of analog tape saturation and angular guitar work. This militant **DIY ethos** laid a gritty foundation that would soon infect the broader regional underground, championing unvarnished authenticity over commercial sheen.\n\n' +
      'Map this fierce independence westward to Glasgow, where the local scene was exploding with bands trading abrasive pop melodies and fuzz pedals. At the center of this nexus stood **The Delgados**, a band that combined delicate chamber pop with jagged guitars while single-handedly sustaining the community through their own label, **Chemikal Underground**. This imprint became the essential launchpad for the **indie rock** vanguard, providing a crucial platform for the intimate, late-night storytelling of **Arab Strap** and setting the stage for a dramatic sonic shift.\n\n' +
      'From within this exact infrastructure, a new paradigm emerged that rejected the traditional frontman entirely. **Mogwai** absorbed the local punk spirit and weaponized it, drawing heavy inspiration from American innovators like **Slint** and **Tortoise**. By prioritizing visceral volume and cinematic pacing over conventional pop structures, they shifted the regional sound away from scratchy vocal hooks and toward monumental instrumental crescendos. This marked the birth of a formidable **post-rock** explosion, proving that silence and tectonic dynamics could carry as much emotional weight as any lyric.';

    const sparseBridges: CrossSceneLink[] = [
      {
        id: 'scene-1::chemikal-underground--scene-2::rock-action',
        sourceSceneId: 'scene-1',
        targetSceneId: 'scene-2',
        sourceNodeId: 'scene-1::chemikal-underground',
        targetNodeId: 'scene-2::rock-action',
        sourceCanonicalId: 'chemikal-underground',
        targetCanonicalId: 'rock-action',
        bridgeType: 'sonic_lineage',
        forwardContext: 'inspired the artist-run ethos of',
        inverseContext: 'built upon the independent blueprint of',
        weight: 0.8,
      },
      // Same-endpoint bridge mislabeled as sonic_lineage must NOT count toward sonic_lineage floor
      {
        id: 'scene-1::mogwai-gb--scene-2::mogwai-gb',
        sourceSceneId: 'scene-1',
        targetSceneId: 'scene-2',
        sourceNodeId: 'scene-1::mogwai-gb',
        targetNodeId: 'scene-2::mogwai-gb',
        sourceCanonicalId: 'mogwai-gb',
        targetCanonicalId: 'mogwai-gb',
        bridgeType: 'sonic_lineage',
        forwardContext: 'bridges both constellations with',
        inverseContext: 'bridges both constellations with',
        weight: 1,
      },
    ];

    const sparseAssessment = assessOverarchingZineQuality(sparseRationale, sparseBridges, 3);
    expect(sparseAssessment.passed).toBe(false);
    expect(sparseAssessment.wordCount).toBeLessThan(280);
    expect(sparseAssessment.bulletCount).toBe(0);
    expect(sparseAssessment.sonicLineageBridgeCount).toBe(1);
    expect(sparseAssessment.reasons.some((r) => r.startsWith('wordCount='))).toBe(true);
    expect(sparseAssessment.reasons.some((r) => r.startsWith('bulletCount='))).toBe(true);
    expect(sparseAssessment.reasons.some((r) => r.startsWith('sonicLineageBridgeCount='))).toBe(true);

    const richRationale =
      'The 1990s British music press was largely obsessed with the glitz of London pop royalty, but a much noisier revolution was quietly brewing on four-track cassette recorders in Scotland. In Dundee, acts like **Spare Snare** forged a definitive **lo-fi** sound by actively rejecting studio polish in favor of analog tape saturation. This militant **DIY ethos** found a vital early home on regional labels like **Chute**, documenting the raw energy of an East Coast **indie rock** underground that was about to echo far beyond its local borders.\n\n' +
      'Map this gritty independence westward to Glasgow, and the musical architecture shifts from abrasive slacker hooks into a highly organized, self-sustaining community. Bands like **Urusei Yatsura** drenched their pop melodies in walls of fuzz, while **The Delgados** single-handedly sustained the local ecosystem by launching **Chemikal Underground**. This imprint became the essential nerve center for the European independent landscape, creating a space where the jagged chamber pop of its founders could coexist with the brutal, late-night storytelling and stark drum loops of **Arab Strap**.\n\n' +
      'Simultaneously, a tectonic shift in underground guitar music was occurring globally, characterized by the rejection of the traditional frontman in favor of visceral volume and cinematic pacing. American innovators like **Slint** and **Tortoise** had already dismantled conventional verse-chorus rock structures via pioneering imprints like **Touch and Go** and **Thrill Jockey**. Absorbing this tension, Glasgow\'s own **Mogwai** weaponized the quiet-to-deafening dynamic template, effectively bridging the local punk spirit with monumental **post-rock** soundscapes.\n\n' +
      'This evolution from four-track noise pop to expansive instrumental grandeur reveals a shared, uncompromising musical lineage:\n' +
      '* The foundational DIY grit of the Scottish indie scene evolved directly into the infrastructural backbone of forward-thinking experimental labels like **Rock Action** and **FatCat**.\n' +
      '* The rejection of polished Britpop aesthetics paved the way for emotionally devastating, orchestral subterranean rock mastered by international peers like **Godspeed You! Black Emperor** and **Sigur Rós**.\n' +
      '* Shared independent labels transformed the region from a hub for razor-sharp art-punk into a global launchpad for cinematic, non-verbal storytelling.';

    const richBridges: CrossSceneLink[] = [
      {
        id: 'scene-1::the-delgados-gb--scene-2::chemikal-underground',
        sourceSceneId: 'scene-1',
        targetSceneId: 'scene-2',
        sourceNodeId: 'scene-1::the-delgados-gb',
        targetNodeId: 'scene-2::chemikal-underground',
        sourceCanonicalId: 'the-delgados-gb',
        targetCanonicalId: 'chemikal-underground',
        bridgeType: 'sonic_lineage',
        forwardContext: 'founded and actively managed the roster of',
        inverseContext: 'was launched as an artist-run label by',
        weight: 0.95,
      },
      {
        id: 'scene-2::mogwai-gb--scene-1::chemikal-underground',
        sourceSceneId: 'scene-2',
        targetSceneId: 'scene-1',
        sourceNodeId: 'scene-2::mogwai-gb',
        targetNodeId: 'scene-1::chemikal-underground',
        sourceCanonicalId: 'mogwai-gb',
        targetCanonicalId: 'chemikal-underground',
        bridgeType: 'sonic_lineage',
        forwardContext: 'released early formative sonic masterworks on',
        inverseContext: 'championed the early instrumental breakthroughs of',
        weight: 0.9,
      },
      {
        id: 'scene-1::arab-strap-gb--scene-2::mogwai-gb',
        sourceSceneId: 'scene-1',
        targetSceneId: 'scene-2',
        sourceNodeId: 'scene-1::arab-strap-gb',
        targetNodeId: 'scene-2::mogwai-gb',
        sourceCanonicalId: 'arab-strap-gb',
        targetCanonicalId: 'mogwai-gb',
        bridgeType: 'sonic_lineage',
        forwardContext: 'shared deep Glasgow underground ties with',
        inverseContext: 'shared deep Glasgow underground ties with',
        weight: 0.85,
      },
      {
        id: 'scene-1::the-delgados-gb--scene-2::mogwai-gb',
        sourceSceneId: 'scene-1',
        targetSceneId: 'scene-2',
        sourceNodeId: 'scene-1::the-delgados-gb',
        targetNodeId: 'scene-2::mogwai-gb',
        sourceCanonicalId: 'the-delgados-gb',
        targetCanonicalId: 'mogwai-gb',
        bridgeType: 'sonic_lineage',
        forwardContext: 'championed and released early singles for',
        inverseContext: 'found crucial early label backing from',
        weight: 0.85,
      },
    ];

    const richAssessment = assessOverarchingZineQuality(richRationale, richBridges, 3);
    expect(richAssessment.passed).toBe(true);
    expect(richAssessment.wordCount).toBeGreaterThanOrEqual(280);
    expect(richAssessment.bulletCount).toBe(3);
    expect(richAssessment.boldEntityCount).toBeGreaterThanOrEqual(10);
    expect(richAssessment.sonicLineageBridgeCount).toBe(4);
    expect(richAssessment.reasons).toEqual([]);
  });

  it('triggers a single corrective retry on sparse Step 3B output, selects the richer candidate, and falls back cleanly if retry fails (V45.8)', async () => {
    const buildRichScene = (idx: number, seed: string, nodes: Array<{ id: string; label: string; type: 'artist' | 'label' }>): ProjectScene => ({
      ...createEmptyProjectScene(idx, seed),
      seedIds: [nodes[0].id],
      status: 'ready',
      synthesisRationale: `${seed} scene editorial overview.`,
      graphData: {
        nodes: nodes.map((n, i) => ({ ...n, group: i === 0 ? 1 : 2, isSeed: i === 0 })),
        links: [],
      },
    });

    const scene1 = buildRichScene(0, 'Spare Snare', [
      { id: 'spare-snare-gb', label: 'Spare Snare', type: 'artist' },
      { id: 'the-delgados-gb', label: 'The Delgados', type: 'artist' },
      { id: 'arab-strap-gb', label: 'Arab Strap', type: 'artist' },
      { id: 'urusei-yatsura-gb', label: 'Urusei Yatsura', type: 'artist' },
      { id: 'chemikal-underground', label: 'Chemikal Underground', type: 'label' },
    ]);
    const scene2 = buildRichScene(1, 'Mogwai', [
      { id: 'mogwai-gb', label: 'Mogwai', type: 'artist' },
      { id: 'slint-us', label: 'Slint', type: 'artist' },
      { id: 'tortoise-us', label: 'Tortoise', type: 'artist' },
      { id: 'chemikal-underground', label: 'Chemikal Underground', type: 'label' },
      { id: 'rock-action', label: 'Rock Action', type: 'label' },
      { id: 'fatcat', label: 'FatCat', type: 'label' },
    ]);

    const upgradedRationale =
      Array.from({ length: 3 }, (_, p) =>
        `Paragraph ${p + 1} traces how **Spare Snare**, **The Delgados**, **Chemikal Underground**, and **Arab Strap** built an uncompromising Scottish **lo-fi** and **indie rock** infrastructure that directly empowered **Mogwai**, **Slint**, **Tortoise**, **Rock Action**, **FatCat**, and **Urusei Yatsura** to reshape **post-rock** dynamics across the 1990s underground with ferocious tape saturation, towering orchestral crescendos, and fearless independent distribution that rejected major label gloss in favor of raw regional solidarity and bold sonic experimentation across every release.`
      ).join('\n\n') +
      '\n\nThis arc reveals three lasting pillars:\n' +
      '* Independent labels like **Chemikal Underground** and **Rock Action** anchored artist-run autonomy.\n' +
      '* Regional peers **The Delgados** and **Arab Strap** bridged vocal songcraft into stark atmosphere.\n' +
      '* Instrumental architects **Mogwai**, **Slint**, and **Tortoise** turned dynamics into pure narrative weight.';

    // Case 1: Attempt 1 is sparse -> retry succeeds with upgraded output -> upgraded output selected
    mockGenerateContent
      .mockResolvedValueOnce({
        text: JSON.stringify({
          overarchingRationale: 'Short **Spare Snare** and **Mogwai** summary without bullets.',
          crossSceneBridges: [
            {
              sourceSceneId: 'scene-1',
              sourceCanonicalId: 'chemikal-underground',
              targetSceneId: 'scene-2',
              targetCanonicalId: 'rock-action',
              bridgeType: 'sonic_lineage',
              forwardContext: 'inspired the artist-run ethos of',
              inverseContext: 'built upon the label ethos of',
              weight: 0.8,
            },
          ],
        }),
        usageMetadata: { promptTokenCount: 1000, candidatesTokenCount: 200, totalTokenCount: 1200 },
      })
      .mockResolvedValueOnce({
        text: JSON.stringify({
          overarchingRationale: upgradedRationale,
          crossSceneBridges: [
            {
              sourceSceneId: 'scene-1',
              sourceCanonicalId: 'chemikal-underground',
              targetSceneId: 'scene-2',
              targetCanonicalId: 'rock-action',
              bridgeType: 'sonic_lineage',
              forwardContext: 'inspired the artist-run ethos of',
              inverseContext: 'built upon the label ethos of',
              weight: 0.9,
            },
            {
              sourceSceneId: 'scene-1',
              sourceCanonicalId: 'the-delgados-gb',
              targetSceneId: 'scene-2',
              targetCanonicalId: 'mogwai-gb',
              bridgeType: 'sonic_lineage',
              forwardContext: 'championed and released early singles for',
              inverseContext: 'found crucial early label backing from',
              weight: 0.88,
            },
            {
              sourceSceneId: 'scene-1',
              sourceCanonicalId: 'arab-strap-gb',
              targetSceneId: 'scene-2',
              targetCanonicalId: 'mogwai-gb',
              bridgeType: 'sonic_lineage',
              forwardContext: 'shared deep Glasgow underground ties with',
              inverseContext: 'shared deep Glasgow underground ties with',
              weight: 0.85,
            },
          ],
        }),
        usageMetadata: { promptTokenCount: 1200, candidatesTokenCount: 600, totalTokenCount: 1800 },
      });

    const res = await generateOverarchingZineBackend([scene1, scene2], {});
    expect(mockGenerateContent).toHaveBeenCalledTimes(2);
    expect(res.overarchingRationale).toContain('This arc reveals three lasting pillars:');
    expect(res.crossSceneLinks.filter((l) => l.bridgeType === 'sonic_lineage')).toHaveLength(3);

    // Case 2: Attempt 1 is sparse -> retry throws -> gracefully retains Attempt 1 without failing
    vi.clearAllMocks();
    mockGenerateContent
      .mockResolvedValueOnce({
        text: JSON.stringify({
          overarchingRationale: 'Retained attempt 1 connecting **Spare Snare** and **Mogwai**.',
          crossSceneBridges: [
            {
              sourceSceneId: 'scene-1',
              sourceCanonicalId: 'chemikal-underground',
              targetSceneId: 'scene-2',
              targetCanonicalId: 'rock-action',
              bridgeType: 'sonic_lineage',
              forwardContext: 'inspired the artist-run ethos of',
              inverseContext: 'built upon the label ethos of',
              weight: 0.8,
            },
          ],
        }),
        usageMetadata: { promptTokenCount: 1000, candidatesTokenCount: 150, totalTokenCount: 1150 },
      })
      .mockRejectedValueOnce(new Error('504 RETRY_TIMEOUT'));

    const resFallback = await generateOverarchingZineBackend([scene1, scene2], {});
    expect(mockGenerateContent).toHaveBeenCalledTimes(2);
    expect(resFallback.overarchingRationale).toBe('Retained attempt 1 connecting **Spare Snare** and **Mogwai**.');
    expect(resFallback.crossSceneLinks.filter((l) => l.bridgeType === 'sonic_lineage')).toHaveLength(1);
  });

  it('passes unrelated 1960s Soul vs 1990s Norwegian Black Metal editorial with 0 bridges on Attempt 1 with zero corrective retry (V45.9)', async () => {
    const buildScene = (idx: number, seed: string, nodes: Array<{ id: string; label: string; type: 'artist' | 'label' }>): ProjectScene => ({
      ...createEmptyProjectScene(idx, seed),
      seedIds: [nodes[0].id],
      status: 'ready',
      synthesisRationale: `${seed} scene editorial overview.`,
      graphData: {
        nodes: nodes.map((n, i) => ({ ...n, group: i === 0 ? 1 : 2, isSeed: i === 0 })),
        links: [],
      },
    });

    const soulScene = buildScene(0, 'Otis Redding', [
      { id: 'otis-redding-us', label: 'Otis Redding', type: 'artist' },
      { id: 'sam-and-dave-us', label: 'Sam & Dave', type: 'artist' },
      { id: 'booker-t-and-the-mgs-us', label: 'Booker T. & the M.G.\'s', type: 'artist' },
      { id: 'carla-thomas-us', label: 'Carla Thomas', type: 'artist' },
      { id: 'stax-records', label: 'Stax Records', type: 'label' },
      { id: 'volt-records', label: 'Volt Records', type: 'label' },
    ]);

    const blackMetalScene = buildScene(1, 'Mayhem', [
      { id: 'mayhem-no', label: 'Mayhem', type: 'artist' },
      { id: 'darkthrone-no', label: 'Darkthrone', type: 'artist' },
      { id: 'emperor-no', label: 'Emperor', type: 'artist' },
      { id: 'immortal-no', label: 'Immortal', type: 'artist' },
      { id: 'deathlike-silence-productions', label: 'Deathlike Silence Productions', type: 'label' },
      { id: 'peaceville-records', label: 'Peaceville Records', type: 'label' },
    ]);

    const honestContrastRationale =
      'Across three decades and an ocean of aesthetic distance, 1960s Memphis **Southern Soul** and 1990s **Norwegian Black Metal** share zero historical lineage, yet placing them side by side exposes two radical, uncompromising poles of regional music making. In Tennessee, **Otis Redding** and the house rhythm section **Booker T. & the M.G.\'s** turned **Stax Records** and sister imprint **Volt Records** into warm, sweat-soaked laboratories of communal groove, where **Sam & Dave** and **Carla Thomas** recorded live in an old movie theater with zero regard for glossy pop symmetry.\n\n' +
      'Rather than tracing a fictional bridge where none exists, the true fascination lies in the stark sonic polarity between these two worlds. Where Memphis thrived on brass-driven catharsis, open-room warmth, and direct emotional generosity, Oslo and Bergen retreated into winter isolation, tape hiss, and deliberate alienation. Both movements rejected slick corporate polish in favor of hyper-local studios and fiercely independent distribution, proving that total artistic conviction can emerge from opposite emotional temperatures.\n\n' +
      'In the frozen fjords of the early 1990s, **Mayhem** and **Darkthrone** dismantled heavy metal conventions through frostbitten tremolo picking and austere four-track fidelity. Alongside symphonic innovators **Emperor** and relentless peers **Immortal**, this underground crystallized around micro-imprints like **Deathlike Silence Productions** and UK allies **Peaceville Records**, weaponizing raw atmosphere to build a self-contained extreme-music subculture.\n\n' +
      'Viewing these two unrelated constellations together highlights three enduring contrasts in underground music:\n' +
      '* **Stax Records** and **Deathlike Silence Productions** both proved that small, fiercely regional labels can define an entire global genre without major-label interference.\n' +
      '* Warm analog soul devotion led by **Otis Redding** stands in total sonic polarity to the austere, dissonant extremity of **Mayhem** and **Darkthrone**.\n' +
      '* Both scenes demonstrate that geographic isolation and raw studio limitations forge timeless, unmistakable musical identities.';

    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        overarchingRationale: honestContrastRationale,
        crossSceneBridges: [],
      }),
      usageMetadata: { promptTokenCount: 1100, candidatesTokenCount: 520, totalTokenCount: 1620 },
    });

    const res = await generateOverarchingZineBackend([soulScene, blackMetalScene], {});
    // Zero deterministic overlap -> effectiveMinSonicBridges = 0 -> passes Attempt 1 with ZERO retry!
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    expect(res.crossSceneLinks).toEqual([]);
    expect(res.overarchingRationale).toContain('**Otis Redding**');
    expect(res.overarchingRationale).toContain('**Mayhem**');
  });

  it('scales boldEntityCount floor dynamically for sparse rosters via assessOverarchingZineQuality while keeping word & bullet floors (V45.9)', () => {
    const sparseRosterRichEditorial =
      Array.from({ length: 4 }, (_, i) =>
        `Block ${i + 1} explores how **Band Alpha**, **Band Beta**, and **Label One** carved out a stark underground aesthetic in the late eighties, while **Band Gamma**, **Band Delta**, and **Label Two** pursued a contrasting melodic path across regional tape networks, building independent communities from scratch through basement gigs, photocopied sleeves, hand-dubbed cassettes, and relentless regional touring without chasing commercial radio airplay or major label distribution deals across their formative years.`
      ).join('\n\n') +
      '\n\nThree parallel dynamics stand out across both movements:\n' +
      '* **Label One** and **Label Two** sustained local scenes through small-run physical pressings.\n' +
      '* **Band Alpha** and **Band Gamma** anchored distinct regional styles with uncompromising focus.\n' +
      '* **Band Beta** and **Band Delta** expanded each scene\'s vocabulary without sacrificing DIY autonomy.';

    // 6 unique bold entities: fails default minBoldEntities=10, passes dynamic sparse floor minBoldEntities=5
    const defaultCheck = assessOverarchingZineQuality(sparseRosterRichEditorial, [], 0);
    expect(defaultCheck.passed).toBe(false);
    expect(defaultCheck.boldEntityCount).toBe(6);
    expect(defaultCheck.reasons).toEqual(['boldEntityCount=6 (<10)']);

    const sparseCheck = assessOverarchingZineQuality(sparseRosterRichEditorial, [], 0, 5);
    expect(sparseCheck.passed).toBe(true);
    expect(sparseCheck.reasons).toEqual([]);

    // Still rejects < 280 words or < 3 bullets even with minBoldEntities=5 and minSonicLineageBridges=0
    const tooShortCheck = assessOverarchingZineQuality(
      '**Band Alpha**, **Band Beta**, **Label One**, **Band Gamma**, **Band Delta**, **Label Two** short text.',
      [],
      0,
      5
    );
    expect(tooShortCheck.passed).toBe(false);
    expect(tooShortCheck.reasons.some((r) => r.startsWith('wordCount='))).toBe(true);
    expect(tooShortCheck.reasons.some((r) => r.startsWith('bulletCount='))).toBe(true);
  });

  it('does not reward fabricated bridges in scoreCandidate tie-breaker when scenes have zero deterministic overlap (V45.9)', async () => {
    const buildScene = (idx: number, seed: string, nodes: Array<{ id: string; label: string; type: 'artist' | 'label' }>): ProjectScene => ({
      ...createEmptyProjectScene(idx, seed),
      seedIds: [nodes[0].id],
      status: 'ready',
      synthesisRationale: `${seed} scene editorial overview.`,
      graphData: {
        nodes: nodes.map((n, i) => ({ ...n, group: i === 0 ? 1 : 2, isSeed: i === 0 })),
        links: [],
      },
    });

    const sceneA = buildScene(0, 'Otis Redding', [
      { id: 'otis-redding-us', label: 'Otis Redding', type: 'artist' },
      { id: 'sam-and-dave-us', label: 'Sam & Dave', type: 'artist' },
      { id: 'carla-thomas-us', label: 'Carla Thomas', type: 'artist' },
      { id: 'stax-records', label: 'Stax Records', type: 'label' },
    ]);
    const sceneB = buildScene(1, 'Mayhem', [
      { id: 'mayhem-no', label: 'Mayhem', type: 'artist' },
      { id: 'darkthrone-no', label: 'Darkthrone', type: 'artist' },
      { id: 'emperor-no', label: 'Emperor', type: 'artist' },
      { id: 'deathlike-silence-productions', label: 'Deathlike Silence Productions', type: 'label' },
    ]);

    // Both Attempt 1 and Attempt 2 miss ONLY bulletCount (<3); Attempt 1 has 0 bridges & 315 words,
    // while Attempt 2 has 305 words + 3 fabricated bridges. Attempt 1 MUST win!
    const makeNoBulletEditorial = (extraWords: number) =>
      `In Memphis, **Otis Redding**, **Sam & Dave**, **Carla Thomas**, and **Stax Records** built **Southern Soul**, while in Norway **Mayhem**, **Darkthrone**, **Emperor**, and **Deathlike Silence Productions** forged **Norwegian Black Metal**. ` +
      Array.from({ length: extraWords }, (_, i) => `word${i}`).join(' ');

    mockGenerateContent
      .mockResolvedValueOnce({
        text: JSON.stringify({
          overarchingRationale: makeNoBulletEditorial(295),
          crossSceneBridges: [],
        }),
        usageMetadata: { promptTokenCount: 900, candidatesTokenCount: 400, totalTokenCount: 1300 },
      })
      .mockResolvedValueOnce({
        text: JSON.stringify({
          overarchingRationale: makeNoBulletEditorial(280),
          crossSceneBridges: [
            {
              sourceSceneId: 'scene-1',
              sourceCanonicalId: 'otis-redding-us',
              targetSceneId: 'scene-2',
              targetCanonicalId: 'mayhem-no',
              bridgeType: 'sonic_lineage',
              forwardContext: 'contrasts warm analog soul devotion against',
              inverseContext: 'counters raw Nordic extremity with',
              weight: 0.7,
            },
            {
              sourceSceneId: 'scene-1',
              sourceCanonicalId: 'stax-records',
              targetSceneId: 'scene-2',
              targetCanonicalId: 'deathlike-silence-productions',
              bridgeType: 'sonic_lineage',
              forwardContext: 'parallels fierce regional label independence with',
              inverseContext: 'parallels fierce regional label independence with',
              weight: 0.7,
            },
            {
              sourceSceneId: 'scene-1',
              sourceCanonicalId: 'sam-and-dave-us',
              targetSceneId: 'scene-2',
              targetCanonicalId: 'darkthrone-no',
              bridgeType: 'sonic_lineage',
              forwardContext: 'stands in stark sonic polarity to',
              inverseContext: 'stands in stark sonic polarity to',
              weight: 0.65,
            },
          ],
        }),
        usageMetadata: { promptTokenCount: 1000, candidatesTokenCount: 450, totalTokenCount: 1450 },
      });

    const res = await generateOverarchingZineBackend([sceneA, sceneB], {});
    expect(mockGenerateContent).toHaveBeenCalledTimes(2);
    // Attempt 1 retained (0 bridges, higher word count) rather than rewarding Attempt 2's 3 bridges!
    expect(res.crossSceneLinks).toEqual([]);
  });

  it('injects full input parity via ISO-stripped artistSnippets lookup and 2400-char sceneEditorialSummary (V45.8)', async () => {
    const longRationale = 'A'.repeat(1800) + ' DISTINCTIVE_TAIL_MARKER_1850';
    const scene1: ProjectScene = {
      ...createEmptyProjectScene(0, 'Spare Snare'),
      seedIds: ['spare-snare-gb'],
      status: 'ready',
      synthesisRationale: longRationale,
      artistSnippets: {
        'spare-snare': 'Dundee four-track lo-fi pioneers who rejected studio polish.',
        'Chemikal Underground': 'Glasgow artist-run nerve center founded by The Delgados.',
      },
      graphData: {
        nodes: [
          { id: 'spare-snare-gb', label: 'Spare Snare', type: 'artist', group: 1, isSeed: true },
          { id: 'chemikal-underground', label: 'Chemikal Underground', type: 'label', group: 2, isSeed: false },
        ],
        links: [],
      },
    };
    const scene2: ProjectScene = {
      ...createEmptyProjectScene(1, 'Mogwai'),
      seedIds: ['mogwai-gb'],
      status: 'ready',
      synthesisRationale: 'Mogwai short editorial.',
      artistSnippets: {
        mogwai: 'Glasgow post-rock architects of quiet-to-deafening crescendos.',
      },
      graphData: {
        nodes: [
          { id: 'mogwai-gb', label: 'Mogwai', type: 'artist', group: 1, isSeed: true },
        ],
        links: [],
      },
    };

    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        overarchingRationale: 'Parity verified between **Spare Snare** and **Mogwai**.',
        crossSceneBridges: [],
      }),
      usageMetadata: { promptTokenCount: 800, candidatesTokenCount: 100, totalTokenCount: 900 },
    });

    await generateOverarchingZineBackend([scene1, scene2], {});
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);

    const promptArg = mockGenerateContent.mock.calls[0][0].contents as string;
    // 2400-char sceneEditorialSummary preserves content well beyond the old 900-char cutoff
    expect(promptArg).toContain('DISTINCTIVE_TAIL_MARKER_1850');
    // ISO-stripped bare key ('spare-snare' -> 'spare-snare-gb', 'mogwai' -> 'mogwai-gb') and label key ('Chemikal Underground') resolve into bioSnippet
    expect(promptArg).toContain('Dundee four-track lo-fi pioneers who rejected studio polish.');
    expect(promptArg).toContain('Glasgow artist-run nerve center founded by The Delgados.');
    expect(promptArg).toContain('Glasgow post-rock architects of quiet-to-deafening crescendos.');
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

    it('cleanses foregroundApiUsage, lockedSeeds, seedStubs, and duplicate existingDetailsCache when constructing chained job inputPayload (Guard 1 & V47.16 P2.6)', () => {
      const mockInputPayload: Record<string, any> = {
        projectId: 'proj-123',
        userId: 'user-456',
        curationSessionId: 'sess-789',
        foregroundApiUsage: { 'gemini-3.1-pro-preview': { prompt: 1000, candidates: 200, total: 1200 } },
        lockedSeeds: [{ id: 'korn-us', label: 'Korn' }],
        seedStubs: { korn: { id: 'korn-us' } },
        detailsCache: '[["korn-us",{"summary":"old"}]]',
        existingDetailsCache: '[["korn-us",{"summary":"old"}]]',
        tokensSpent: 15,
        targetSceneId: 'scene-1',
      };

      const {
        foregroundApiUsage: _fa,
        lockedSeeds: _ls,
        seedStubs: _ss,
        detailsCache: _dc,
        existingDetailsCache: _edc,
        ...cleanInputPayload
      } = mockInputPayload;

      expect(cleanInputPayload.foregroundApiUsage).toBeUndefined();
      expect(cleanInputPayload.lockedSeeds).toBeUndefined();
      expect(cleanInputPayload.seedStubs).toBeUndefined();
      expect(cleanInputPayload.detailsCache).toBeUndefined();
      expect(cleanInputPayload.existingDetailsCache).toBeUndefined();
      expect(cleanInputPayload.projectId).toBe('proj-123');
      expect(cleanInputPayload.userId).toBe('user-456');

      // Firestore nextJobRef inputPayload shape (serializes detailsCache once, never existingDetailsCache)
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
        detailsCache: '[["korn-us",{"summary":"updated"}]]',
      };

      expect((nextHopInputPayload as any).foregroundApiUsage).toBeUndefined();
      expect((nextHopInputPayload as any).lockedSeeds).toBeUndefined();
      expect((nextHopInputPayload as any).existingDetailsCache).toBeUndefined();
      expect(nextHopInputPayload.detailsCache).toBe('[["korn-us",{"summary":"updated"}]]');
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

  describe('Phase B2.12: Calibrated Artist-Only Box 5 & Disconnected Sub-Island Bridge Guard', () => {
    it('filters Box 5 context to artist link endpoints, forwards seedIds & forwardContext, uses ThinkingLevel.LOW, and prompts the 3-Tier Rubric', async () => {
      const detailsEntries: [string, any][] = [
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

      const usageCollector: UsageCollector = { push: vi.fn() };
      const res = await generateSemanticLinkWeights('test-key', detailsEntries, artistLinks, usageCollector, ['korn-us']);

      expect(res).toEqual([{ source: 'korn-us', target: 'deftones-us', weight: 0.9 }]);
      expect(mockGenerateContent).toHaveBeenCalledTimes(1);

      const callArg = mockGenerateContent.mock.calls[0][0];
      expect(callArg.config.thinkingConfig.thinkingLevel).toBe(ThinkingLevel.LOW);
      expect(callArg.contents).toContain('3-Tier Forced-Distribution Rubric');
      expect(callArg.contents).toContain('0.85 to 1.00');
      expect(callArg.contents).toContain('0.45 to 0.70');
      expect(callArg.contents).toContain('0.15 to 0.35');
      expect(callArg.contents).toContain('toured heavily together in the mid-90s');
      expect(callArg.contents).toContain('"isSceneRoot":true');
      // Non-participating metadata context entries excluded
      expect(callArg.contents).not.toContain('"id":"united-states"');
      expect(callArg.contents).not.toContain('"id":"1993"');
      expect(callArg.contents).not.toContain('Year 1993.');
    });

    it('stitches disconnected artist sub-islands to the primary seed and locks deterministic metadata weights', () => {
      const nodes: any[] = [
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
      const links: any[] = [
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
      const nodeById = new Map<string, any>(nodes.map((n) => [n.id, n]));
      const artistNodesList = nodes.filter((n) => (n.type || 'artist') === 'artist');
      const seedArtistNodes = artistNodesList.filter((n) => n.isSeed);
      const aaAdj = new Map<string, Set<string>>();
      artistNodesList.forEach((n) => aaAdj.set(n.id, new Set()));
      links.forEach((l) => {
        if (aaAdj.has(l.source) && aaAdj.has(l.target) && l.source !== l.target) {
          aaAdj.get(l.source)!.add(l.target);
          aaAdj.get(l.target)!.add(l.source);
        }
      });
      const reachable = new Set<string>();
      const q = [seedArtistNodes[0].id];
      reachable.add(seedArtistNodes[0].id);
      while (q.length > 0) {
        const curr = q.shift()!;
        for (const nb of aaAdj.get(curr) || []) {
          if (!reachable.has(nb)) {
            reachable.add(nb);
            q.push(nb);
          }
        }
      }
      const unvisited = artistNodesList.filter((n) => !reachable.has(n.id));
      const visitedIslands = new Set<string>();
      for (const startNode of unvisited) {
        if (visitedIslands.has(startNode.id)) continue;
        const comp: string[] = [];
        const iq = [startNode.id];
        visitedIslands.add(startNode.id);
        while (iq.length > 0) {
          const c = iq.shift()!;
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

      const artistOnlyLinks: any[] = [];
      links.forEach((l) => {
        const sType = nodeById.get(l.source)?.type || 'artist';
        const tType = nodeById.get(l.target)?.type || 'artist';
        if (sType === 'artist' && tType === 'artist') {
          artistOnlyLinks.push(l);
        } else {
          const metaType = sType !== 'artist' ? sType : tType;
          if (metaType === 'country') l.weight = 0.2;
          else if (metaType === 'founded') l.weight = 0.1;
          else if (metaType === 'genre') l.weight = 0.8;
          else if (metaType === 'label') l.weight = 0.7;
        }
      });

      // Highest-degree node in the disconnected 3-band island (`disturbed-us`, degree 2) stitched to `korn-us`
      expect(links.some((l) => l.source === 'korn-us' && l.target === 'disturbed-us' && l.weight === 0.3)).toBe(true);
      expect(artistOnlyLinks.every((l) => nodeById.get(l.source)?.type === 'artist' && nodeById.get(l.target)?.type === 'artist')).toBe(true);
      expect(links.find((l) => l.target === 'united-states')?.weight).toBe(0.2);
      expect(links.find((l) => l.target === '1993')?.weight).toBe(0.1);
      expect(links.find((l) => l.target === 'nu-metal' && l.source === 'korn-us')?.weight).toBe(0.8);
      expect(links.find((l) => l.target === 'epic')?.weight).toBe(0.7);
    });

    it('V45.22: backend buildCompositeCanvasGraph gives dual-root scenes >= 220px root separation, >= 70px vertical root clearance, and strict ±480px territory containment', () => {
      const scene1: ProjectScene = {
        ...createEmptyProjectScene(0, 'The Jealous Sound::Hey Mercedes'),
        seedIds: ['the-jealous-sound-us', 'hey-mercedes-us'],
        status: 'ready',
        graphData: {
          nodes: [
            { id: 'the-jealous-sound-us', label: 'The Jealous Sound', type: 'artist', group: 1, isSeed: true },
            { id: 'hey-mercedes-us', label: 'Hey Mercedes', type: 'artist', group: 2, isSeed: true },
            { id: 'no-knife-us', label: 'No Knife', type: 'artist', group: 3 },
            { id: 'the-get-up-kids-us', label: 'The Get Up Kids', type: 'artist', group: 3 },
            { id: 'desaparecidos-us', label: 'Desaparecidos', type: 'artist', group: 3 },
            { id: 'knapsack-us', label: 'Knapsack', type: 'artist', group: 1 },
            { id: 'braid-us', label: 'Braid', type: 'artist', group: 2 },
          ],
          links: [
            { source: 'the-jealous-sound-us', target: 'hey-mercedes-us', value: 1 },
            { source: 'the-jealous-sound-us', target: 'no-knife-us', value: 1 },
            { source: 'hey-mercedes-us', target: 'no-knife-us', value: 1 },
            { source: 'the-jealous-sound-us', target: 'the-get-up-kids-us', value: 1 },
            { source: 'hey-mercedes-us', target: 'the-get-up-kids-us', value: 1 },
            { source: 'the-jealous-sound-us', target: 'desaparecidos-us', value: 1 },
            { source: 'hey-mercedes-us', target: 'desaparecidos-us', value: 1 },
            { source: 'the-jealous-sound-us', target: 'knapsack-us', value: 1 },
            { source: 'hey-mercedes-us', target: 'braid-us', value: 1 },
          ],
        },
      };
      const scene2: ProjectScene = {
        ...createEmptyProjectScene(1, 'The City on Film'),
        seedIds: ['the-city-on-film-us'],
        status: 'ready',
        graphData: {
          nodes: [
            { id: 'the-city-on-film-us', label: 'The City on Film', type: 'artist', group: 1, isSeed: true },
            { id: 'braid-us', label: 'Braid', type: 'artist', group: 1 },
          ],
          links: [{ source: 'the-city-on-film-us', target: 'braid-us', value: 1 }],
        },
      };

      const composite = buildCompositeCanvasGraph([scene1, scene2], [], null);
      const root1 = composite.nodes.find((n) => n.id === 'scene-1::the-jealous-sound-us')!;
      const root2 = composite.nodes.find((n) => n.id === 'scene-1::hey-mercedes-us')!;
      expect(Math.abs(root2.x! - root1.x!)).toBeGreaterThanOrEqual(220);

      const getBox = (n: any) => {
        const textWidth = Math.max(30, (n.label || n.id).length * 7.5);
        const isSeed = Boolean(n.isSeed || n.isSceneSeed);
        const r = isSeed ? 18 : (n.type === 'artist' ? 16 : 14);
        return { hx: Math.max(r, textWidth / 2) + 10 + (isSeed ? 6 : 0), hy: 30 + (isSeed ? 10 : 0) };
      };
      expect(getBox(root1).hx + getBox(root2).hx - Math.abs(root2.x! - root1.x!)).toBeLessThanOrEqual(0);

      const scene1Nodes = composite.nodes.filter((n) => n.sceneIndex === 0);
      const scene2Nodes = composite.nodes.filter((n) => n.sceneIndex === 1);
      for (const peer of scene1Nodes.filter((n) => !(n.isSeed || n.isSceneSeed))) {
        const pBox = getBox(peer);
        for (const root of [root1, root2]) {
          const rBox = getBox(root);
          if (Math.abs(peer.x! - root.x!) < rBox.hx + pBox.hx - 0.5) {
            expect(Math.abs(peer.y! - root.y!)).toBeGreaterThanOrEqual(69.5);
          }
        }
      }
      for (const n of scene1Nodes) expect(Math.abs(n.x! - 1000)).toBeLessThanOrEqual(480);
      for (const n of scene2Nodes) expect(Math.abs(n.x! - 2050)).toBeLessThanOrEqual(480);
    });

    it('V45.22: backend buildCompositeCanvasGraph does not promote unsettled (fx: null, fy: null) savedLayout entries into hard pins', () => {
      const dualScene: ProjectScene = {
        ...createEmptyProjectScene(0, 'The Jealous Sound::Hey Mercedes'),
        seedIds: ['the-jealous-sound-us', 'hey-mercedes-us'],
        status: 'ready',
        graphData: {
          nodes: [
            { id: 'the-jealous-sound-us', label: 'The Jealous Sound', type: 'artist', group: 1, isSeed: true },
            { id: 'hey-mercedes-us', label: 'Hey Mercedes', type: 'artist', group: 2, isSeed: true },
          ],
          links: [],
        },
      };

      const unsettledComposite = buildCompositeCanvasGraph([dualScene], [], [
        { nodeId: 'scene-1::the-jealous-sound-us', x: 885, y: 1000, fx: null, fy: null },
        { nodeId: 'scene-1::hey-mercedes-us', x: 1115, y: 1000, fx: null, fy: null },
      ]);
      expect(unsettledComposite.nodes.find((n) => n.id === 'scene-1::the-jealous-sound-us')?.fx).toBeUndefined();
      expect(unsettledComposite.nodes.find((n) => n.id === 'scene-1::hey-mercedes-us')?.fx).toBeUndefined();

      const settledComposite = buildCompositeCanvasGraph([dualScene], [], [
        { nodeId: 'scene-1::the-jealous-sound-us', x: 850, y: 1030, fx: 850, fy: 1030 },
        { nodeId: 'scene-1::hey-mercedes-us', x: 1160, y: 970, fx: 1160, fy: 970 },
      ]);
      expect(settledComposite.nodes.find((n) => n.id === 'scene-1::the-jealous-sound-us')?.fx).toBe(850);
      expect(settledComposite.nodes.find((n) => n.id === 'scene-1::hey-mercedes-us')?.fx).toBe(1160);
    });
  });
});
