import React from 'react';
import { render, screen, fireEvent, waitFor, act, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom';
import {
  buildCompositeCanvasGraph,
  resolveSceneNodeOverlaps,
  parseProjectScenes,
  normalizeProjectScene,
  createEmptyProjectScene,
} from '../../shared/multiSceneUtils';

// ── Shared Hoisted Test State ──
const { harness, mockState, authListeners, callableHandlers, callableCalls, createMockFirestore } = await vi.hoisted(async () => {
  const { StatefulFirestoreHarness, createFirestoreModuleMock } = await import('./helpers/statefulFirestoreHarness');
  const h = new StatefulFirestoreHarness();
  return {
    harness: h,
    createMockFirestore: () => createFirestoreModuleMock(h),
    mockState: {
      currentMockUser: {
        uid: 'pub-demo-uid',
        email: 'pubdemo@zcene.online',
        displayName: 'Pub Demo User',
        photoURL: null,
        getIdToken: vi.fn().mockResolvedValue('mock-id-token'),
      } as any,
    },
    authListeners: new Set<(u: any) => void>(),
    callableHandlers: new Map<string, (payload: any) => Promise<{ data: any }>>(),
    callableCalls: [] as Array<{ name: string; payload: any }>,
  };
});

vi.mock('firebase/firestore', () => createMockFirestore());

vi.mock('../../services/firebase', () => ({
  db: {},
  functions: {},
  auth: {
    get currentUser() {
      return mockState.currentMockUser;
    },
  },
  signInWithGoogle: vi.fn(),
  logout: vi.fn(),
  onAuthStateChanged: (_auth: any, cb: (u: any) => void) => {
    authListeners.add(cb);
    queueMicrotask(() => {
      if (authListeners.has(cb)) cb(mockState.currentMockUser);
    });
    return () => {
      authListeners.delete(cb);
    };
  },
  OperationType: {
    CREATE: 'create',
    UPDATE: 'update',
    DELETE: 'delete',
    LIST: 'list',
    GET: 'get',
    WRITE: 'write',
  },
  handleFirestoreError: vi.fn((err: any) => {
    throw err;
  }),
}));

vi.mock('firebase/functions', () => ({
  getFunctions: vi.fn(() => ({})),
  httpsCallable: vi.fn((_fns: any, name: string) => {
    return async (payload: any) => {
      callableCalls.push({ name, payload });
      const handler = callableHandlers.get(name);
      if (!handler) {
        throw new Error(`[Test Mock] Unhandled httpsCallable: ${name}`);
      }
      return handler(payload);
    };
  }),
}));

vi.mock('lottie-react', () => ({
  default: () => null,
  Lottie: () => null,
}));

vi.mock('../../components/GlobalWall', () => ({
  default: ({ children }: any) => <>{children}</>,
  isBetaUnlocked: () => true,
}));

import App from '../../App';

// ── Fixture Builders ──
const UID = 'pub-demo-uid';

function makeArtistDetails(name: string, origin: string, genre: string, founded: string, label: string) {
  return {
    summary: `${name} is a foundational ${genre} act formed in ${origin} in ${founded}, known for shaping the regional underground sound and releasing influential records on ${label}.`,
    details: {
      artist: name,
      origin,
      genre,
      style: 'Lo-Fi',
      founded,
      label,
      notableArtists: ['The Delgados', 'Arab Strap'],
    },
    members: [`${name} Frontperson (Vocals, Guitar)`],
    discography: [{ albumName: `${name} Debut LP`, releaseYear: founded }],
    recommendationReason: `Anchor artist from the ${origin} ${genre} underground.`,
    imageUrl: `https://example.com/${name.toLowerCase().replace(/\s+/g, '-')}.jpg`,
    itunesArtistId: 123456,
  };
}

function makeScene1SpareSnare() {
  const nodes = [
    { id: 'spare-snare-gb', canonicalId: 'spare-snare-gb', label: 'Spare Snare', type: 'artist', isSeed: true, isSceneSeed: true },
    { id: 'the-delgados-gb', canonicalId: 'the-delgados-gb', label: 'The Delgados', type: 'artist' },
    { id: 'arab-strap-gb', canonicalId: 'arab-strap-gb', label: 'Arab Strap', type: 'artist' },
    { id: 'chemikal-underground', canonicalId: 'chemikal-underground', label: 'Chemikal Underground', type: 'label' },
    { id: 'indie-rock', canonicalId: 'indie-rock', label: 'Indie Rock', type: 'genre' },
    { id: 'united-kingdom', canonicalId: 'united-kingdom', label: 'United Kingdom', type: 'country' },
    { id: '1992', canonicalId: '1992', label: '1992', type: 'founded' },
  ];
  const links = [
    { source: 'spare-snare-gb', target: 'the-delgados-gb', weight: 0.9, forwardContext: 'shared Scottish DIY lineage with' },
    { source: 'spare-snare-gb', target: 'arab-strap-gb', weight: 0.8, forwardContext: 'shared lo-fi Scottish scene with' },
    { source: 'the-delgados-gb', target: 'chemikal-underground', weight: 0.7 },
    { source: 'arab-strap-gb', target: 'chemikal-underground', weight: 0.7 },
    { source: 'spare-snare-gb', target: 'indie-rock', weight: 0.8 },
    { source: 'spare-snare-gb', target: 'united-kingdom', weight: 0.2 },
    { source: 'spare-snare-gb', target: '1992', weight: 0.1 },
  ];
  return {
    id: 'scene-1',
    sceneId: 'scene-1',
    sceneIndex: 0,
    title: 'Spare Snare',
    name: 'Spare Snare',
    seedArtists: 'Spare Snare',
    curatedSeedArtists: 'Spare Snare',
    seedIds: ['spare-snare-gb'],
    seedArtistIds: ['spare-snare-gb'],
    discoveryFilters: {},
    curatedDiscoveryFilters: {},
    graphData: { nodes, links },
    synthesisRationale: 'Spare Snare forged Scottish four-track lo-fi indie rock in Dundee.',
    artistSnippets: { 'spare-snare-gb': 'Dundee four-track lo-fi pioneers.' },
    centerOffset: { x: 1000, y: 1000 },
    status: 'ready',
  };
}

function makeScene2Mogwai() {
  const nodes = [
    { id: 'mogwai-gb', canonicalId: 'mogwai-gb', label: 'Mogwai', type: 'artist', isSeed: true, isSceneSeed: true },
    { id: 'the-delgados-gb', canonicalId: 'the-delgados-gb', label: 'The Delgados', type: 'artist' },
    { id: 'tortoise-us', canonicalId: 'tortoise-us', label: 'Tortoise', type: 'artist' },
    { id: 'chemikal-underground', canonicalId: 'chemikal-underground', label: 'Chemikal Underground', type: 'label' },
    { id: 'post-rock', canonicalId: 'post-rock', label: 'Post-Rock', type: 'genre' },
    { id: '1995', canonicalId: '1995', label: '1995', type: 'founded' },
  ];
  const links = [
    { source: 'mogwai-gb', target: 'the-delgados-gb', weight: 0.85, forwardContext: 'emerged alongside Glasgow peers' },
    { source: 'mogwai-gb', target: 'tortoise-us', weight: 0.75, forwardContext: 'shared instrumental post-rock DNA with' },
    { source: 'mogwai-gb', target: 'chemikal-underground', weight: 0.7 },
    { source: 'the-delgados-gb', target: 'chemikal-underground', weight: 0.7 },
    { source: 'mogwai-gb', target: 'post-rock', weight: 0.8 },
    { source: 'mogwai-gb', target: '1995', weight: 0.1 },
  ];
  return {
    id: 'scene-2',
    sceneId: 'scene-2',
    sceneIndex: 1,
    title: 'Mogwai',
    name: 'Mogwai',
    seedArtists: 'Mogwai',
    curatedSeedArtists: 'Mogwai',
    seedIds: ['mogwai-gb'],
    seedArtistIds: ['mogwai-gb'],
    discoveryFilters: {},
    curatedDiscoveryFilters: {},
    graphData: { nodes, links },
    synthesisRationale: 'Mogwai reshaped instrumental post-rock from Glasgow.',
    artistSnippets: { 'mogwai-gb': 'Glasgow quiet-loud instrumental architects.' },
    centerOffset: { x: 2050, y: 1000 },
    status: 'ready',
  };
}

function makeDetailsCacheEntries() {
  return [
    ['spare-snare-gb', makeArtistDetails('Spare Snare', 'Dundee, United Kingdom', 'Indie Rock', '1992', 'Chute')],
    ['mogwai-gb', makeArtistDetails('Mogwai', 'Glasgow, United Kingdom', 'Post-Rock', '1995', 'Chemikal Underground')],
    ['the-delgados-gb', makeArtistDetails('The Delgados', 'Motherwell, United Kingdom', 'Indie Rock', '1994', 'Chemikal Underground')],
    ['arab-strap-gb', makeArtistDetails('Arab Strap', 'Falkirk, United Kingdom', 'Indie Rock', '1995', 'Chemikal Underground')],
    ['tortoise-us', makeArtistDetails('Tortoise', 'Chicago, USA', 'Post-Rock', '1990', 'Thrill Jockey')],
    ['chemikal-underground', {
      summary: 'Chemikal Underground is the foundational Glasgow independent record label founded by The Delgados in 1994.',
      details: { origin: 'Glasgow, United Kingdom', genre: 'Indie Rock', founded: '1994', notableArtists: ['Mogwai', 'Arab Strap'] },
      discography: [{ albumName: 'Mogwai Young Team', releaseYear: '1997' }],
      recommendationReason: 'Glasgow indie powerhouse.',
      imageUrl: null,
    }],
  ];
}

function makeSettledTwoSceneProject(options: { legacyBridges?: boolean; status?: string; overarchingHistory?: Record<string, any> } = {}) {
  const s1 = normalizeProjectScene(makeScene1SpareSnare() as any, 0);
  const s2 = normalizeProjectScene(makeScene2Mogwai() as any, 1);
  const baseBridges = [
    {
      id: 'scene-1::the-delgados-gb--scene-2::the-delgados-gb',
      sourceSceneId: 'scene-1',
      targetSceneId: 'scene-2',
      fromSceneId: 'scene-1',
      toSceneId: 'scene-2',
      sourceNodeId: 'scene-1::the-delgados-gb',
      targetNodeId: 'scene-2::the-delgados-gb',
      fromNodeId: 'the-delgados-gb',
      toNodeId: 'the-delgados-gb',
      sourceCanonicalId: 'the-delgados-gb',
      targetCanonicalId: 'the-delgados-gb',
      bridgeType: 'identity',
      forwardContext: 'bridges both constellations as a shared anchor with',
      inverseContext: 'bridges both constellations as a shared anchor with',
      weight: 1,
      ...(options.legacyBridges ? { source: 'scene-1::the-delgados-gb', target: 'scene-2::the-delgados-gb' } : {}),
    },
  ];
  const composite = buildCompositeCanvasGraph([s1 as any, s2 as any], baseBridges as any, []);
  const canvasLayout = composite.nodes.map((n: any) => ({
    nodeId: n.id,
    x: Math.round((n.x ?? 1000) * 100) / 100,
    y: Math.round((n.y ?? 1000) * 100) / 100,
    fx: Math.round((n.x ?? 1000) * 100) / 100,
    fy: Math.round((n.y ?? 1000) * 100) / 100,
  }));

  return {
    name: 'Spare Snare + Mogwai',
    seedArtists: 'Spare Snare::Mogwai',
    seedArtistIds: ['spare-snare-gb', 'mogwai-gb'],
    seedImageUrls: ['https://example.com/spare-snare.jpg', 'https://example.com/mogwai.jpg'],
    seedImageUrl: 'https://example.com/spare-snare.jpg',
    status: options.status ?? 'completed',
    activeJobId: null,
    activeSceneId: 'scene-1',
    sceneCount: 2,
    schemaVersion: 43,
    authorId: UID,
    scenes: JSON.stringify([s1, s2]),
    graphData: JSON.stringify(composite),
    canvasLayout: JSON.stringify(canvasLayout),
    crossSceneLinks: JSON.stringify(baseBridges),
    overarchingRationale: 'Scottish DIY lo-fi and Glasgow post-rock converged around Chemikal Underground.',
    overarchingZineTitle: '',
    overarchingZineIntro: '',
    overarchingZineImages: [],
    pinnedNodes: [],
    chatHistories: '[]',
    discoveryFilters: '{}',
    lastViewedStackCount: 0,
    isMagazineViewOpen: false,
    supportsLabelDeepCuts: true,
    ...(options.overarchingHistory ? { overarchingHistory: JSON.stringify(options.overarchingHistory) } : {}),
    detailsCache: JSON.stringify(makeDetailsCacheEntries()),
    activeNodes: ['spare-snare-gb', 'the-delgados-gb', 'arab-strap-gb', 'mogwai-gb', 'tortoise-us', 'chemikal-underground'],
    updatedAt: { toDate: () => new Date(Date.now()), toMillis: () => Date.now(), seconds: Math.floor(Date.now() / 1000) },
    createdAt: { toDate: () => new Date(Date.now() - 60000), toMillis: () => Date.now() - 60000, seconds: Math.floor((Date.now() - 60000) / 1000) },
  };
}

function makeSettledSingleSceneProject() {
  const s1 = normalizeProjectScene(makeScene1SpareSnare() as any, 0);
  const composite = buildCompositeCanvasGraph([s1 as any], [], []);
  const canvasLayout = composite.nodes.map((n: any) => ({
    nodeId: n.id,
    x: Math.round((n.x ?? 1000) * 100) / 100,
    y: Math.round((n.y ?? 1000) * 100) / 100,
    fx: Math.round((n.x ?? 1000) * 100) / 100,
    fy: Math.round((n.y ?? 1000) * 100) / 100,
  }));
  return {
    name: 'Spare Snare',
    seedArtists: 'Spare Snare',
    seedArtistIds: ['spare-snare-gb'],
    seedImageUrls: ['https://example.com/spare-snare.jpg'],
    seedImageUrl: 'https://example.com/spare-snare.jpg',
    status: 'completed',
    activeJobId: null,
    activeSceneId: 'scene-1',
    sceneCount: 1,
    schemaVersion: 43,
    authorId: UID,
    scenes: JSON.stringify([s1]),
    graphData: JSON.stringify(composite),
    canvasLayout: JSON.stringify(canvasLayout),
    crossSceneLinks: JSON.stringify([]),
    overarchingRationale: '',
    detailsCache: JSON.stringify(makeDetailsCacheEntries()),
    activeNodes: ['spare-snare-gb', 'the-delgados-gb', 'arab-strap-gb', 'chemikal-underground'],
    updatedAt: { toDate: () => new Date(Date.now()), toMillis: () => Date.now(), seconds: Math.floor(Date.now() / 1000) },
    createdAt: { toDate: () => new Date(Date.now() - 60000), toMillis: () => Date.now() - 60000, seconds: Math.floor((Date.now() - 60000) / 1000) },
  };
}

function seedUserProfile(balance = 100) {
  harness.seedDoc(`users/${UID}`, {
    email: 'pubdemo@zcene.online',
    displayName: 'Pub Demo User',
    tokenBalance: balance,
    lifetimeTokensPurchased: balance,
    lifetimeTokensSpent: 0,
    libraryArtists: '[]',
  });
}

function seedGlobalArtistProfiles() {
  for (const [id, details] of makeDetailsCacheEntries()) {
    const col = id === 'chemikal-underground' ? 'labels' : 'artists';
    harness.seedDoc(`${col}/${id}`, {
      artistId: id,
      detailsCache: details,
      cacheVersion: 4,
      isDeep: true,
    });
  }
}

function setViewportMode(isMobile: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: isMobile ? query.includes('max-width') : false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

async function flushMicrotasks(rounds = 6) {
  for (let i = 0; i < rounds; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

async function waitForSync<T>(fn: () => T, maxSteps = 20): Promise<T> {
  let lastErr: any;
  for (let i = 0; i < maxSteps; i++) {
    try {
      return fn();
    } catch (e) {
      lastErr = e;
      await act(async () => {
        await Promise.resolve();
        await vi.advanceTimersByTimeAsync(50);
      });
    }
  }
  throw lastErr;
}

describe('V45.7 Stateful Closed-Loop "Pub Demo" Integration Journeys', { timeout: 15000 }, () => {
  beforeEach(() => {
    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'],
    });
    harness.reset();
    authListeners.clear();
    callableHandlers.clear();
    callableCalls.length = 0;
    localStorage.clear();
    sessionStorage.clear();
    window.history.replaceState({}, '', '/');

    mockState.currentMockUser = {
      uid: UID,
      email: 'pubdemo@zcene.online',
      displayName: 'Pub Demo User',
      photoURL: null,
      getIdToken: vi.fn().mockResolvedValue('mock-id-token'),
    };

    setViewportMode(false);

    // Stub SVG layout primitives for real D3 MusicGraph in jsdom
    if (typeof SVGElement !== 'undefined') {
      (SVGElement.prototype as any).getBBox = () => ({ x: 0, y: 0, width: 100, height: 24 });
      (SVGElement.prototype as any).getComputedTextLength = () => 60;
    }
    Element.prototype.scrollTo = vi.fn() as any;
    window.scrollTo = vi.fn() as any;
    // Prevent jsdom's setTimeout-backed requestAnimationFrame from spinning 60fps D3 frames during fake timer advances
    window.requestAnimationFrame = vi.fn(() => 0) as any;
    window.cancelAnimationFrame = vi.fn() as any;
    Element.prototype.getBoundingClientRect = vi.fn(() => ({
      width: 1000,
      height: 700,
      top: 0,
      left: 0,
      right: 1000,
      bottom: 700,
      x: 0,
      y: 0,
      toJSON: () => { },
    })) as any;

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ playable: true, results: [] }),
    }) as any;

    // Default pre-flight validator callable
    callableHandlers.set('validateSeedOriginCallable', async (payload: any) => {
      const q = String(payload?.artistName || payload?.query || '').trim();
      const norm = q.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const isMogwai = norm.includes('mogwai');
      const isJealous = norm.includes('jealous');
      const canonicalId = isMogwai ? 'mogwai-gb' : isJealous ? 'the-jealous-sound-us' : `${norm}-gb`;
      const origin = isMogwai ? 'Glasgow, United Kingdom' : isJealous ? 'Los Angeles, USA' : 'Dundee, United Kingdom';
      const genre = isMogwai ? 'Post-Rock' : isJealous ? 'Emo / Indie Rock' : 'Indie Rock';
      return {
        data: {
          isValid: true,
          isAmbiguous: false,
          canonicalId,
          displayName: q,
          origin,
          genre,
          candidates: [
            {
              id: canonicalId,
              name: q,
              origin,
              genre,
              disambiguationHint: `${origin} · ${genre}`,
            },
          ],
        },
      };
    });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    harness.reset();
    authListeners.clear();
    localStorage.clear();
    sessionStorage.clear();
    window.history.replaceState({}, '', '/');
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // JOURNEY 1: Zero-Write Read-Only & Infinite-Loop Circuit Breaker
  // ═══════════════════════════════════════════════════════════════════════════
  it('Journey 1A: Read-only load of clean 2-scene project performs 0 Firestore writes over 15s + Legend toggles + Scene 1 <-> Scene 2 switch', async () => {
    seedUserProfile(100);
    seedGlobalArtistProfiles();
    const projId = 'proj-clean-2scene';
    const projPath = `users/${UID}/projects/${projId}`;
    harness.seedDoc(projPath, makeSettledTwoSceneProject({ legacyBridges: false }));

    window.history.replaceState({}, '', `/p/${projId}`);
    render(<App />);

    await flushMicrotasks(10);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    await flushMicrotasks(6);

    // Switch Scene 1 -> Scene 2 -> Scene 1
    const scene2Btns = screen.queryAllByRole('button', { name: /Scene 2/i });
    if (scene2Btns.length > 0) {
      fireEvent.click(scene2Btns[0]);
      await flushMicrotasks(4);
    }
    const scene1Btns = screen.queryAllByRole('button', { name: /Scene 1/i });
    if (scene1Btns.length > 0) {
      fireEvent.click(scene1Btns[0]);
      await flushMicrotasks(4);
    }

    // Toggle Legend filter button if visible
    const labelFilterBtns = screen.queryAllByRole('button', { name: /^Label$/i });
    if (labelFilterBtns.length > 0) {
      fireEvent.click(labelFilterBtns[0]);
      await flushMicrotasks(4);
      fireEvent.click(labelFilterBtns[0]);
    }

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    await flushMicrotasks(6);

    expect(harness.writeCountByDoc.get(projPath) || 0).toBe(0);
    expect(harness.snapshotDeliveriesByDoc.get(projPath) || 0).toBeLessThanOrEqual(3);

    // Verify both scene roots retained isSceneSeed integrity in stored doc
    const stored = harness.getRawDoc(projPath)!;
    const storedScenes = parseProjectScenes(stored.scenes);
    expect(storedScenes).toHaveLength(2);
    expect(storedScenes[0].graphData?.nodes.find((n: any) => n.id.includes('spare-snare'))?.isSceneSeed).toBe(true);
    expect(storedScenes[1].graphData?.nodes.find((n: any) => n.id.includes('mogwai'))?.isSceneSeed).toBe(true);
  });

  it('Journey 1B: Legacy bridges with transient source/target keys do NOT trigger infinite write/snapshot loop (<= 1 bounded write, <= 3 snapshots)', async () => {
    seedUserProfile(100);
    seedGlobalArtistProfiles();
    const projId = 'proj-legacy-bridges';
    const projPath = `users/${UID}/projects/${projId}`;
    harness.seedDoc(projPath, makeSettledTwoSceneProject({ legacyBridges: true }));

    window.history.replaceState({}, '', `/p/${projId}`);
    render(<App />);

    await flushMicrotasks(10);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    await flushMicrotasks(6);

    expect(harness.writeCountByDoc.get(projPath) || 0).toBeLessThanOrEqual(1);
    expect(harness.snapshotDeliveriesByDoc.get(projPath) || 0).toBeLessThanOrEqual(3);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // JOURNEY 2: The Pub Fork Journey (+ Add Scene -> Wait 5s -> Save as New Zcene)
  // ═══════════════════════════════════════════════════════════════════════════
  it('Journey 2: Mobile + Add Scene -> Wait 5s -> Save as New Zcene keeps original project sceneCount=1 and completes fork with updated title and zero Mapping... badge', async () => {
    setViewportMode(true); // Mobile viewport
    seedUserProfile(100);
    seedGlobalArtistProfiles();
    const origId = 'proj-orig-spare';
    const origPath = `users/${UID}/projects/${origId}`;
    harness.seedDoc(origPath, makeSettledSingleSceneProject());

    let capturedForkProjId: string | null = null;
    callableHandlers.set('executeCurationPipeline', async (payload: any) => {
      capturedForkProjId = payload.projectId;
      const jobId = payload.jobId || 'job-fork-mogwai';
      harness.serverWrite(`curationJobs/${jobId}`, {
        status: 'pending',
        projectId: payload.projectId,
        targetSceneId: payload.targetSceneId || 'scene-2',
      });
      return {
        data: {
          activeJobId: jobId,
          graphData: payload.baseGraph || { nodes: [], links: [] },
        },
      };
    });

    window.history.replaceState({}, '', `/p/${origId}`);
    render(<App />);
    await flushMicrotasks(10);

    // Switch to ROOTS tab on mobile if needed
    const rootsTabs = screen.queryAllByRole('button', { name: /^Roots/i });
    if (rootsTabs.length > 0) {
      fireEvent.click(rootsTabs[0]);
      await flushMicrotasks(4);
    }

    // Click + Add Scene
    const addSceneBtn = await waitForSync(() => screen.getAllByTestId('add-scene-button')[0]);
    fireEvent.click(addSceneBtn);
    await flushMicrotasks(4);

    // Type "Mogwai" into Add artist input and commit
    const artistInput = screen.getAllByPlaceholderText(/Add artist/i)[0];
    fireEvent.change(artistInput, { target: { value: 'Mogwai' } });
    fireEvent.keyDown(artistInput, { key: 'Enter', code: 'Enter' });
    await flushMicrotasks(4);

    // Wait 5s so the 3s Autosave timer fires on proj-orig
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    await flushMicrotasks(6);

    // CRITICAL ASSERTION 1: Original project must NOT be polluted by draft Scene 2
    const origAfterWait = harness.getRawDoc(origPath)!;
    const origScenesAfterWait = parseProjectScenes(origAfterWait.scenes);
    expect(origAfterWait.sceneCount).toBe(1);
    expect(origScenesAfterWait).toHaveLength(1);
    expect(origScenesAfterWait[0].seedArtists).toBe('Spare Snare');

    // Click Update Zcene -> Save as New Zcene
    const updateBtn = screen.getAllByRole('button', { name: /Update Zcene/i })[0];
    fireEvent.click(updateBtn);
    await flushMicrotasks(4);

    const forkBtn = await waitForSync(() => screen.getAllByRole('button', { name: /Save as New Zcene/i })[0]);
    fireEvent.click(forkBtn);
    await flushMicrotasks(6);

    // Confirm Token Spend modal
    const confirmSpendBtn = await waitForSync(() => screen.getAllByRole('button', { name: /Confirm & Spend|Confirm \(Admin\)/i })[0]);
    fireEvent.click(confirmSpendBtn);
    await flushMicrotasks(8);

    // Confirm Artist Validation modal
    const confirmGenBtn = await waitForSync(() => {
      const btn = screen.getAllByRole('button', { name: /Confirm & Generate/i })[0];
      expect(btn).not.toBeDisabled();
      return btn;
    });
    fireEvent.click(confirmGenBtn);
    await flushMicrotasks(10);

    expect(capturedForkProjId).toBeTruthy();
    expect(capturedForkProjId).not.toBe(origId);

    const forkPath = `users/${UID}/projects/${capturedForkProjId}`;
    // Verify forked doc was created with updated title (NOT stale "Spare Snare")
    const forkDuringCuration = harness.getRawDoc(forkPath)!;
    expect(forkDuringCuration.name).toBe('Spare Snare + Mogwai');
    expect(forkDuringCuration.status).toBe('curating');

    // Simulate background worker transitioning pending -> processing -> completed
    const jobId = forkDuringCuration.activeJobId || 'job-fork-mogwai';
    harness.serverWrite(`curationJobs/${jobId}`, { status: 'processing' });
    await flushMicrotasks(4);

    const completedForkData = makeSettledTwoSceneProject({ legacyBridges: false });
    harness.serverWrite(forkPath, completedForkData);
    harness.serverWrite(`curationJobs/${jobId}`, { status: 'completed' });
    await flushMicrotasks(10);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    await flushMicrotasks(6);

    const finalFork = harness.getRawDoc(forkPath)!;
    expect(finalFork.status).toBe('completed');
    expect(finalFork.name).toBe('Spare Snare + Mogwai');
    expect(finalFork.sceneCount).toBe(2);

    // Navigate to Dashboard and verify zero Mapping... badge
    window.history.pushState({}, '', '/dashboard');
    window.dispatchEvent(new PopStateEvent('popstate'));
    await flushMicrotasks(8);

    expect(screen.queryByText(/Mapping\.\.\./i)).not.toBeInTheDocument();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // JOURNEY 3: Overwrite Existing & Post-Curation Scene Switch Hygiene
  // ═══════════════════════════════════════════════════════════════════════════
  it('Journey 3: Overwrite Existing updates title to "Spare Snare + Mogwai", preserves Scene 1 seedIds & layout, and leaves Update Zcene clean on tab switches', async () => {
    seedUserProfile(100);
    seedGlobalArtistProfiles();
    const projId = 'proj-overwrite';
    const projPath = `users/${UID}/projects/${projId}`;
    const initialDoc = makeSettledSingleSceneProject();
    const initialLayout = JSON.parse(initialDoc.canvasLayout);
    harness.seedDoc(projPath, initialDoc);

    let activeJobId = 'job-overwrite-1';
    callableHandlers.set('executeCurationPipeline', async (payload: any) => {
      activeJobId = payload.jobId || activeJobId;
      harness.serverWrite(`curationJobs/${activeJobId}`, {
        status: 'pending',
        projectId: projId,
        targetSceneId: 'scene-2',
      });
      return {
        data: {
          activeJobId,
          graphData: payload.baseGraph || { nodes: [], links: [] },
        },
      };
    });

    window.history.replaceState({}, '', `/p/${projId}`);
    render(<App />);
    await flushMicrotasks(10);

    // + Add Scene -> Mogwai
    fireEvent.click(await waitForSync(() => screen.getAllByTestId('add-scene-button')[0]));
    await flushMicrotasks(4);

    const artistInput = screen.getAllByPlaceholderText(/Add artist/i)[0];
    fireEvent.change(artistInput, { target: { value: 'Mogwai' } });
    fireEvent.keyDown(artistInput, { key: 'Enter', code: 'Enter' });
    await flushMicrotasks(4);

    // Update Zcene -> Overwrite Existing
    fireEvent.click(screen.getAllByRole('button', { name: /Update Zcene/i })[0]);
    await flushMicrotasks(4);
    fireEvent.click(await waitForSync(() => screen.getAllByRole('button', { name: /Overwrite Existing/i })[0]));
    await flushMicrotasks(6);

    fireEvent.click(await waitForSync(() => screen.getAllByRole('button', { name: /Confirm & Spend|Confirm \(Admin\)/i })[0]));
    await flushMicrotasks(8);

    const confirmGenBtn = await waitForSync(() => {
      const btn = screen.getAllByRole('button', { name: /Confirm & Generate/i })[0];
      expect(btn).not.toBeDisabled();
      return btn;
    });
    fireEvent.click(confirmGenBtn);
    await flushMicrotasks(10);

    // Verify project title updated automatically to "Spare Snare + Mogwai"
    const duringDoc = harness.getRawDoc(projPath)!;
    expect(duringDoc.name).toBe('Spare Snare + Mogwai');

    // Simulate job completion preserving Scene 1 layout
    const completedData = makeSettledTwoSceneProject({ legacyBridges: false });
    const mergedLayout = [
      ...initialLayout,
      ...JSON.parse(completedData.canvasLayout).filter((r: any) => r.nodeId.startsWith('scene-2::')),
    ];
    harness.serverWrite(projPath, {
      ...completedData,
      canvasLayout: JSON.stringify(mergedLayout),
    });
    harness.serverWrite(`curationJobs/${activeJobId}`, { status: 'completed' });
    await flushMicrotasks(10);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6_000);
    });
    await flushMicrotasks(6);

    // Switch Scene 1 -> Scene 2 -> Scene 1
    fireEvent.click(await waitForSync(() => screen.getAllByRole('button', { name: /Scene 2/i })[0]));
    await flushMicrotasks(4);
    fireEvent.click(await waitForSync(() => screen.getAllByRole('button', { name: /Scene 1/i })[0]));
    await flushMicrotasks(4);

    // Verify Scene 1 kept its original seedIds and frozen coordinates
    const finalDoc = harness.getRawDoc(projPath)!;
    const finalScenes = parseProjectScenes(finalDoc.scenes);
    expect(finalDoc.name).toBe('Spare Snare + Mogwai');
    expect(finalScenes[0].seedIds).toEqual(['spare-snare-gb']);
    const finalLayout = JSON.parse(finalDoc.canvasLayout);
    const spareSnareCoord = finalLayout.find((r: any) => r.nodeId === 'scene-1::spare-snare-gb');
    expect(spareSnareCoord.x).toBe(1000);
    expect(spareSnareCoord.y).toBe(1000);

    // Update Zcene button must be disabled (no false dirty badge)
    const updateAfter = screen.getAllByRole('button', { name: /Update Zcene/i })[0];
    expect(updateAfter).toBeDisabled();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // JOURNEY 4: Flaky Mobile / Pub Network Drop & Background Recovery
  // ═══════════════════════════════════════════════════════════════════════════
  it('Journey 4: Client callable rejection mid-curation does not downgrade populated project to idle, and stranded idle projects self-heal to completed', async () => {
    setViewportMode(true);
    seedUserProfile(100);
    seedGlobalArtistProfiles();

    // Part A: Pre-seeded stranded idle project with populated scenes self-heals via Projects Listener + ProjectLoader
    const strandedId = 'proj-stranded-idle';
    const strandedPath = `users/${UID}/projects/${strandedId}`;
    harness.seedDoc(strandedPath, makeSettledTwoSceneProject({ status: 'idle' }));

    window.history.replaceState({}, '', '/dashboard');
    const { unmount } = render(<App />);
    await flushMicrotasks(10);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_500);
    });
    await flushMicrotasks(6);

    expect(harness.getRawDoc(strandedPath)!.status).toBe('completed');
    expect(screen.queryByText(/Mapping\.\.\./i)).not.toBeInTheDocument();
    unmount();

    // Part B: Flaky 5G drop rejects executeCurationPipeline while background job still completes
    const flakyId = 'proj-flaky-5g';
    const flakyPath = `users/${UID}/projects/${flakyId}`;
    harness.seedDoc(flakyPath, makeSettledSingleSceneProject());

    callableHandlers.set('executeCurationPipeline', async () => {
      await new Promise((r) => setTimeout(r, 2_000));
      throw new Error('network-request-failed');
    });

    window.history.replaceState({}, '', `/p/${flakyId}`);
    render(<App />);
    await flushMicrotasks(10);

    const rootsTabs = screen.queryAllByRole('button', { name: /^Roots/i });
    if (rootsTabs.length > 0) {
      fireEvent.click(rootsTabs[0]);
      await flushMicrotasks(4);
    }

    fireEvent.click(await waitForSync(() => screen.getAllByTestId('add-scene-button')[0]));
    await flushMicrotasks(4);
    const artistInput = screen.getAllByPlaceholderText(/Add artist/i)[0];
    fireEvent.change(artistInput, { target: { value: 'Mogwai' } });
    fireEvent.keyDown(artistInput, { key: 'Enter', code: 'Enter' });
    await flushMicrotasks(4);

    fireEvent.click(screen.getAllByRole('button', { name: /Update Zcene/i })[0]);
    await flushMicrotasks(4);
    fireEvent.click(await waitForSync(() => screen.getAllByRole('button', { name: /Overwrite Existing/i })[0]));
    await flushMicrotasks(6);
    fireEvent.click(await waitForSync(() => screen.getAllByRole('button', { name: /Confirm & Spend|Confirm \(Admin\)/i })[0]));
    await flushMicrotasks(8);
    const confirmGenBtn = await waitForSync(() => {
      const btn = screen.getAllByRole('button', { name: /Confirm & Generate/i })[0];
      expect(btn).not.toBeDisabled();
      return btn;
    });
    fireEvent.click(confirmGenBtn);

    // Advance 2.5s so callable rejects with simulated mobile network drop
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_500);
    });
    await flushMicrotasks(8);

    // Client catch block must NOT downgrade populated project to 'idle'
    expect(harness.getRawDoc(flakyPath)!.status).not.toBe('idle');

    // Background job finishes at t=4s
    harness.serverWrite(flakyPath, makeSettledTwoSceneProject({ status: 'completed' }));
    await flushMicrotasks(8);

    expect(harness.getRawDoc(flakyPath)!.status).toBe('completed');
    expect(parseProjectScenes(harness.getRawDoc(flakyPath)!.scenes)).toHaveLength(2);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // JOURNEY 5: Cross-Project Isolation & State Reset
  // ═══════════════════════════════════════════════════════════════════════════
  it('Journey 5: Creating Project B after viewing multi-scene Project A leaks zero overarchingHistory, crossSceneLinks, or scenes', async () => {
    seedUserProfile(100);
    seedGlobalArtistProfiles();

    const projAId = 'proj-a-korn';
    const projAPath = `users/${UID}/projects/${projAId}`;
    harness.seedDoc(
      projAPath,
      makeSettledTwoSceneProject({
        overarchingHistory: {
          'mogwai+spare-snare': {
            sceneSignature: 'mogwai+spare-snare',
            overarchingRationale: 'LEAKED PROJECT A ESSAY',
            crossSceneLinks: [],
            archivedAt: '2026-11-20T10:00:00.000Z',
            sceneCount: 2,
            sceneSeeds: ['Spare Snare', 'Mogwai'],
          },
        },
      })
    );

    let capturedProjectBPayload: any = null;
    callableHandlers.set('executeCurationPipeline', async (payload: any) => {
      capturedProjectBPayload = payload;
      return {
        data: {
          activeJobId: 'job-proj-b',
          graphData: { nodes: [], links: [] },
        },
      };
    });

    // 1. Load Project A first
    window.history.replaceState({}, '', `/p/${projAId}`);
    render(<App />);
    await flushMicrotasks(10);

    // 2. Navigate to Dashboard
    window.history.pushState({}, '', '/dashboard');
    window.dispatchEvent(new PopStateEvent('popstate'));
    await flushMicrotasks(8);

    // 3. Click + Create for Project B
    const createBtn = await waitForSync(() => screen.getAllByRole('button', { name: /Create/i })[0]);
    fireEvent.click(createBtn);
    await flushMicrotasks(8);

    // 4. Enter "The Jealous Sound" and trigger curation
    const artistInput = await waitForSync(() => screen.getAllByPlaceholderText(/Add artist/i)[0]);
    fireEvent.change(artistInput, { target: { value: 'The Jealous Sound' } });
    fireEvent.keyDown(artistInput, { key: 'Enter', code: 'Enter' });
    await flushMicrotasks(4);

    fireEvent.click(screen.getAllByRole('button', { name: /Create Zcene/i })[0]);
    await flushMicrotasks(6);
    fireEvent.click(await waitForSync(() => screen.getAllByRole('button', { name: /Confirm & Spend|Confirm \(Admin\)/i })[0]));
    await flushMicrotasks(8);
    const confirmGenBtn = await waitForSync(() => {
      const btn = screen.getAllByRole('button', { name: /Confirm & Generate/i })[0];
      expect(btn).not.toBeDisabled();
      return btn;
    });
    fireEvent.click(confirmGenBtn);
    await flushMicrotasks(10);

    expect(capturedProjectBPayload).toBeTruthy();
    // Zero leaked overarchingHistory from Project A
    const sentHistory = capturedProjectBPayload.overarchingHistory;
    if (sentHistory) {
      const parsed = typeof sentHistory === 'string' ? JSON.parse(sentHistory) : sentHistory;
      expect(Object.keys(parsed)).toHaveLength(0);
    }
    // Only 1 scene ("The Jealous Sound"), zero scenes from Project A
    expect(capturedProjectBPayload.scenes).toHaveLength(1);
    expect(JSON.stringify(capturedProjectBPayload.scenes)).not.toContain('Spare Snare');
    expect(JSON.stringify(capturedProjectBPayload.scenes)).not.toContain('Mogwai');

    // Verify Project B's Firestore doc also has zero leaked state
    const projBDoc = harness.getRawDoc(`users/${UID}/projects/${capturedProjectBPayload.projectId}`)!;
    expect(projBDoc).toBeTruthy();
    expect(projBDoc.overarchingHistory).toBeUndefined();
    expect(JSON.stringify(projBDoc.scenes || '')).not.toContain('Spare Snare');
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // JOURNEY 6: Real-World Dense & Wide-Label Physics Stress Gate
  // ═══════════════════════════════════════════════════════════════════════════
  it('Journey 6: Dense 55-node, 24+ char wide-label, dual-root, and 3-scene fixtures achieve 0 AABB overlaps, 0 territory escapes, and 2-pass reload idempotency', () => {
    const getBox = (n: any) => {
      const textWidth = Math.max(30, (n.label || n.id).length * 7.5);
      const isSeed = Boolean(n.isSeed || n.isSceneSeed);
      const r = isSeed ? 18 : (n.type === 'artist' ? 16 : 14);
      return { hx: Math.max(r, textWidth / 2) + 10 + (isSeed ? 6 : 0), hy: 30 };
    };

    const assertZeroOverlapsAndTerritory = (nodes: any[], label: string) => {
      for (const n of nodes) {
        const sIdx = typeof n.sceneIndex === 'number' ? n.sceneIndex : 0;
        const cx = 1000 + sIdx * 1050;
        const cy = 1000;
        expect(Math.abs(n.x - cx), `${label}: ${n.id} escaped X`).toBeLessThanOrEqual(480.5);
        expect(Math.abs(n.y - cy), `${label}: ${n.id} escaped Y`).toBeLessThanOrEqual(750.5);
      }
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i];
          const b = nodes[j];
          if (a.sceneIndex !== b.sceneIndex) continue;
          if ((a.isSeed || a.isSceneSeed) && (b.isSeed || b.isSceneSeed)) continue;
          const boxA = getBox(a);
          const boxB = getBox(b);
          const ox = boxA.hx + boxB.hx - Math.abs(b.x - a.x);
          const oy = boxA.hy + boxB.hy - Math.abs(b.y - a.y);
          expect(ox > 0.5 && oy > 0.5, `${label}: overlap between ${a.id} and ${b.id} (ox=${ox.toFixed(1)}, oy=${oy.toFixed(1)})`).toBe(false);
        }
      }
    };

    // Fixture A: 55-node dense scene with 24+ char wide labels
    const wideLabels = [
      'Domino Recording Company',
      'Temporary Residence Ltd.',
      'Polyvinyl Record Co.',
      'Chemikal Underground',
      'Tupelo Recording Company',
    ];
    const denseNodes: any[] = [
      { id: 'root-gb', canonicalId: 'root-gb', label: 'Mogwai', type: 'artist', isSeed: true, isSceneSeed: true },
    ];
    const denseLinks: any[] = [];
    for (let i = 0; i < 20; i++) {
      const aid = `peer-${i}-gb`;
      denseNodes.push({ id: aid, canonicalId: aid, label: `Peer Artist ${i}`, type: 'artist' });
      denseLinks.push({ source: 'root-gb', target: aid, weight: 0.4 + (i % 5) * 0.1 });
      const lid = `label-${i}`;
      const lName = wideLabels[i % wideLabels.length] + (i >= wideLabels.length ? ` ${i}` : '');
      denseNodes.push({ id: lid, canonicalId: lid, label: lName, type: 'label' });
      denseLinks.push({ source: aid, target: lid, weight: 0.7 });
      if (i < 14) {
        const yid = `199${i % 10}-${i}`;
        denseNodes.push({ id: yid, canonicalId: yid, label: `${1988 + i}`, type: 'founded' });
        denseLinks.push({ source: aid, target: yid, weight: 0.1 });
      }
    }
    expect(denseNodes.length).toBe(55);

    const denseScene: any = {
      ...createEmptyProjectScene(0),
      sceneId: 'scene-1',
      seedArtists: 'Mogwai',
      curatedSeedArtists: 'Mogwai',
      graphData: { nodes: denseNodes, links: denseLinks },
    };

    // Fixture B: Dual-root centered constellation
    const dualScene: any = {
      ...createEmptyProjectScene(0),
      sceneId: 'scene-1',
      seedArtists: 'The Jealous Sound::Hey Mercedes',
      curatedSeedArtists: 'The Jealous Sound::Hey Mercedes',
      graphData: {
        nodes: [
          { id: 'the-jealous-sound-us', canonicalId: 'the-jealous-sound-us', label: 'The Jealous Sound', type: 'artist', isSeed: true, isSceneSeed: true },
          { id: 'hey-mercedes-us', canonicalId: 'hey-mercedes-us', label: 'Hey Mercedes', type: 'artist', isSeed: true, isSceneSeed: true },
          { id: 'knapsack-us', canonicalId: 'knapsack-us', label: 'Knapsack', type: 'artist' },
          { id: 'braid-us', canonicalId: 'braid-us', label: 'Braid', type: 'artist' },
          { id: 'polyvinyl', canonicalId: 'polyvinyl', label: 'Polyvinyl Record Co.', type: 'label' },
          { id: 'vagrant', canonicalId: 'vagrant', label: 'Vagrant', type: 'label' },
          { id: 'midwest-emo', canonicalId: 'midwest-emo', label: 'Midwest Emo', type: 'genre' },
        ],
        links: [
          { source: 'the-jealous-sound-us', target: 'hey-mercedes-us', weight: 0.95 },
          { source: 'the-jealous-sound-us', target: 'knapsack-us', weight: 0.9 },
          { source: 'hey-mercedes-us', target: 'braid-us', weight: 0.9 },
          { source: 'hey-mercedes-us', target: 'polyvinyl', weight: 0.7 },
          { source: 'the-jealous-sound-us', target: 'vagrant', weight: 0.7 },
          { source: 'braid-us', target: 'midwest-emo', weight: 0.8 },
        ],
      },
    };

    // Fixture C: 3-scene infinite board
    const s3: any = {
      ...makeScene2Mogwai(),
      id: 'scene-3',
      sceneId: 'scene-3',
      sceneIndex: 2,
      centerOffset: { x: 3100, y: 1000 },
    };

    const fixtures: Array<{ name: string; scenes: any[] }> = [
      { name: '55-node dense + wide labels', scenes: [denseScene] },
      { name: 'Dual-root constellation', scenes: [dualScene] },
      { name: '3-scene infinite board', scenes: [makeScene1SpareSnare(), makeScene2Mogwai(), s3] },
    ];

    for (const fx of fixtures) {
      // Pass 1
      const pass1 = buildCompositeCanvasGraph(fx.scenes, [], []);
      resolveSceneNodeOverlaps(pass1.nodes, pass1.links);
      assertZeroOverlapsAndTerritory(pass1.nodes, `${fx.name} (Pass 1)`);

      // Serialize Pass 1 as savedLayout and run Pass 2 (reload)
      const savedLayout = pass1.nodes.map((n: any) => ({
        nodeId: n.id,
        x: Math.round(n.x * 100) / 100,
        y: Math.round(n.y * 100) / 100,
        fx: Math.round(n.x * 100) / 100,
        fy: Math.round(n.y * 100) / 100,
      }));
      const pass2 = buildCompositeCanvasGraph(fx.scenes, [], savedLayout);
      assertZeroOverlapsAndTerritory(pass2.nodes, `${fx.name} (Pass 2)`);

      // 2-Pass Idempotency: 0 pinned nodes shift > 0.01px on reload
      const savedById = new Map(savedLayout.map((r: any) => [r.nodeId, r]));
      for (const n of pass2.nodes) {
        const prev = savedById.get(n.id)!;
        expect(Math.abs((n.x ?? 0) - prev.x), `${fx.name}: ${n.id} X shifted on reload`).toBeLessThanOrEqual(0.01);
        expect(Math.abs((n.y ?? 0) - prev.y), `${fx.name}: ${n.id} Y shifted on reload`).toBeLessThanOrEqual(0.01);
      }
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // JOURNEY 7: Guest Share Link (/z/:id) Multi-Scene Load & Zero-Write Guarantee
  // ═══════════════════════════════════════════════════════════════════════════
  it('Journey 7: Unauthenticated guest loading /z/share-1 hydrates both scenes with preserved coordinates, 0 Firestore writes, and zero JIT calls', async () => {
    mockState.currentMockUser = null; // Unauthenticated guest
    const shareId = 'share-1';
    const shareDoc = makeSettledTwoSceneProject({ legacyBridges: false });
    harness.seedDoc(`sharedZcenes/${shareId}`, shareDoc);

    window.history.replaceState({}, '', `/z/${shareId}`);
    render(<App />);

    await flushMicrotasks(10);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    await flushMicrotasks(6);

    // Zero Firestore writes of any kind as guest
    expect(harness.totalClientWrites()).toBe(0);
    // Zero JIT healing calls
    expect(callableCalls.filter((c) => c.name === 'healOrphanedAsset')).toHaveLength(0);
    // Both scenes hydrated in DOM
    expect(screen.getByText(/Spare Snare \+ Mogwai/i)).toBeInTheDocument();
  });
});
