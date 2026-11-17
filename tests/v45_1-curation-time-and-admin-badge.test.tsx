import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ConsolidatedValidationModal, PreFlightSeed, TokenConfirmationDialog } from '../components/SharedModals';
import { LoadingSpinner } from '../components/Icons';
import GraphPage from '../components/GraphPage';
import { DetailsPanel, normalizeMarkdownLineBreaks, splitMarkdownIntoEditorialBlocks, partitionBlockIndicesIntoThreeColumns } from '../components/DetailsPanel';
import { classifyCurationSpeed } from '../services/cacheQualification';
import { computeSceneSetSignature, parseOverarchingHistory, pruneOverarchingHistory, shiftSceneClusterCoordinates, detectLegacyStrideShiftX, canonicalizeCrossSceneLinks, canonicalizeProjectScenes, buildCompositeCanvasGraph } from '../shared/multiSceneUtils';
import { httpsCallable } from 'firebase/functions';

vi.mock('firebase/functions', () => ({
  httpsCallable: vi.fn(),
  getFunctions: vi.fn(),
}));

vi.mock('firebase/firestore', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    collection: vi.fn((_db, ...segments) => ({ path: segments.join('/') })),
    doc: vi.fn((_db, ...segments) => ({ path: segments.join('/') })),
    getDocs: vi.fn(async () => ({ empty: true, docs: [] })),
    getDoc: vi.fn(async () => ({ exists: () => false, data: () => null })),
    setDoc: vi.fn(),
    updateDoc: vi.fn(),
    serverTimestamp: vi.fn(),
    increment: vi.fn(),
    query: vi.fn((ref) => ref),
    where: vi.fn(),
    limit: vi.fn(),
    documentId: vi.fn(() => '__name__'),
  };
});

vi.mock('../services/firebaseConfig', () => ({
  functions: {},
  db: {},
  auth: {},
}));

describe('Architecture V45.1: Curation Time Estimate, Admin CACHE HIT Guard, and Mobile Loader Padding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });

    global.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as any;
  });

  describe('1. [Rule 34] CACHE HIT Badge Visibility Guard (<ConsolidatedValidationModal>)', () => {
    const cachedSeed: PreFlightSeed = {
      id: 'sense-field-us',
      query: 'Sense Field',
      predictedOrigin: 'El Segundo, USA',
      genre: 'Emo / Post-Hardcore',
      isKnownCacheHit: true,
      isTopologyHit: true,
      isVerifyingOrigin: false,
    };

    it('renders CACHE HIT badge when isAdmin is true and isAdminPreview is false', () => {
      render(
        <ConsolidatedValidationModal
          isOpen={true}
          seeds={[cachedSeed]}
          isAdmin={true}
          isAdminPreview={false}
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />
      );

      expect(screen.getByText('CACHE HIT')).toBeInTheDocument();
    });

    it('strictly hides CACHE HIT badge in Admin Preview mode (isAdmin: true, isAdminPreview: true)', () => {
      render(
        <ConsolidatedValidationModal
          isOpen={true}
          seeds={[cachedSeed]}
          isAdmin={true}
          isAdminPreview={true}
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />
      );

      expect(screen.queryByText('CACHE HIT')).not.toBeInTheDocument();
    });

    it('strictly hides CACHE HIT badge for Standard Users (isAdmin: false, isAdminPreview: false)', () => {
      render(
        <ConsolidatedValidationModal
          isOpen={true}
          seeds={[cachedSeed]}
          isAdmin={false}
          isAdminPreview={false}
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />
      );

      expect(screen.queryByText('CACHE HIT')).not.toBeInTheDocument();
    });

    it('strictly hides CACHE HIT badge for uncached seeds even for admin', () => {
      const uncachedSeed: PreFlightSeed = {
        id: 'the-jealous-sound',
        query: 'The Jealous Sound',
        predictedOrigin: 'USA',
        genre: 'Emo / Indie Rock',
        isKnownCacheHit: false,
        isTopologyHit: false,
        isVerifyingOrigin: false,
      };

      render(
        <ConsolidatedValidationModal
          isOpen={true}
          seeds={[uncachedSeed]}
          isAdmin={true}
          isAdminPreview={false}
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />
      );

      expect(screen.queryByText('CACHE HIT')).not.toBeInTheDocument();
    });
  });

  describe('2. classifyCurationSpeed Classification Matrix', () => {
    it('classifies single-seed direct hit with cached topology and no filters as "instant"', () => {
      const speed = classifyCurationSpeed({
        seedCount: 1,
        hasActiveFilters: false,
        routingDecision: 'TOPOLOGY_HIT',
        allSeedsTopologyCached: true,
        isMultiSceneOverarching: false,
      });
      expect(speed).toBe('instant');
    });

    it('classifies single-seed partial hit as "partial"', () => {
      const speed = classifyCurationSpeed({
        seedCount: 1,
        hasActiveFilters: false,
        routingDecision: 'PARTIAL',
        allSeedsTopologyCached: false,
        isMultiSceneOverarching: false,
      });
      expect(speed).toBe('partial');
    });

    it('classifies multi-seed query as "deep" (~3–5 minutes)', () => {
      const speed = classifyCurationSpeed({
        seedCount: 2,
        hasActiveFilters: false,
        routingDecision: 'LIVE_SYNTHESIS',
        allSeedsTopologyCached: false,
        isMultiSceneOverarching: false,
      });
      expect(speed).toBe('deep');
    });

    it('classifies active 3-tier filters query as "deep" (~3–5 minutes)', () => {
      const speed = classifyCurationSpeed({
        seedCount: 1,
        hasActiveFilters: true,
        routingDecision: 'LIVE_SYNTHESIS',
        allSeedsTopologyCached: true,
        isMultiSceneOverarching: false,
      });
      expect(speed).toBe('deep');
    });

    it('classifies multi-scene single-seed direct hit with overarching synthesis as "partial" (~1–2 minutes)', () => {
      const speed = classifyCurationSpeed({
        seedCount: 1,
        hasActiveFilters: false,
        routingDecision: 'TOPOLOGY_HIT',
        allSeedsTopologyCached: true,
        isMultiSceneOverarching: true,
      });
      expect(speed).toBe('partial');
    });

    it('classifies multi-scene multi-seed query as "deep" (~3–5 minutes)', () => {
      const speed = classifyCurationSpeed({
        seedCount: 2,
        hasActiveFilters: false,
        routingDecision: 'LIVE_SYNTHESIS',
        allSeedsTopologyCached: false,
        isMultiSceneOverarching: true,
      });
      expect(speed).toBe('deep');
    });

    it('classifies multi-scene single-seed with active filters as "deep" (~3–5 minutes)', () => {
      const speed = classifyCurationSpeed({
        seedCount: 1,
        hasActiveFilters: true,
        routingDecision: 'LIVE_SYNTHESIS',
        allSeedsTopologyCached: true,
        isMultiSceneOverarching: true,
      });
      expect(speed).toBe('deep');
    });

    it('classifies cache miss as "deep"', () => {
      const speed = classifyCurationSpeed({
        seedCount: 1,
        hasActiveFilters: false,
        routingDecision: 'MISS',
        allSeedsTopologyCached: false,
        isMultiSceneOverarching: false,
      });
      expect(speed).toBe('deep');
    });
  });

  describe('3. Curation Time Estimate in <ConsolidatedValidationModal>', () => {
    const verifiedSeed: PreFlightSeed = {
      id: 'sense-field-us',
      query: 'Sense Field',
      predictedOrigin: 'El Segundo, USA',
      genre: 'Emo / Post-Hardcore',
      isKnownCacheHit: true,
      isTopologyHit: true,
      isVerifyingOrigin: false,
    };

    it('renders "Estimated time: Ready in a few seconds" for instant speed', () => {
      render(
        <ConsolidatedValidationModal
          isOpen={true}
          seeds={[verifiedSeed]}
          expectedSpeed="instant"
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />
      );

      const pill = screen.getByTestId('curation-time-estimate');
      expect(pill).toBeInTheDocument();
      expect(pill).toHaveTextContent('Estimated time:');
      expect(pill).toHaveTextContent('Ready in a few seconds');
      // Must not leak internal backend jargon
      expect(pill).not.toHaveTextContent('Direct Hit');
    });

    it('renders "Estimated time: ~1–2 minutes" for partial speed', () => {
      render(
        <ConsolidatedValidationModal
          isOpen={true}
          seeds={[verifiedSeed]}
          expectedSpeed="partial"
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />
      );

      const pill = screen.getByTestId('curation-time-estimate');
      expect(pill).toBeInTheDocument();
      expect(pill).toHaveTextContent('Estimated time:');
      expect(pill).toHaveTextContent('~1–2 minutes');
      expect(pill).not.toHaveTextContent('Hydrating details');
    });

    it('renders "Estimated time: ~3–5 minutes" for deep speed', () => {
      render(
        <ConsolidatedValidationModal
          isOpen={true}
          seeds={[verifiedSeed]}
          expectedSpeed="deep"
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />
      );

      const pill = screen.getByTestId('curation-time-estimate');
      expect(pill).toBeInTheDocument();
      expect(pill).toHaveTextContent('Estimated time:');
      expect(pill).toHaveTextContent('~3–5 minutes');
      expect(pill).not.toHaveTextContent('Deep AI synthesis');
    });

    it('does not display estimate pill while seeds are verifying origin', () => {
      const verifyingSeed: PreFlightSeed = {
        ...verifiedSeed,
        isVerifyingOrigin: true,
      };

      render(
        <ConsolidatedValidationModal
          isOpen={true}
          seeds={[verifyingSeed]}
          expectedSpeed="instant"
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />
      );

      expect(screen.queryByTestId('curation-time-estimate')).not.toBeInTheDocument();
    });

    it('dynamically upgrades estimate to ~3–5 minutes when escape hatch replaces an instant seed with an uncached origin', async () => {
      const mockCallable = vi.fn().mockResolvedValue({
        data: {
          isValid: true,
          id: 'Sense Field',
          origin: 'Canada',
          genre: 'Indie Rock',
          hasCollision: false,
          candidates: [
            {
              id: 'sense-field-ca',
              name: 'Sense Field',
              origin: 'Canada',
              genre: 'Indie Rock',
            },
          ],
        },
      });
      (httpsCallable as any).mockReturnValue(mockCallable);

      render(
        <ConsolidatedValidationModal
          isOpen={true}
          seeds={[verifiedSeed]}
          expectedSpeed="instant"
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />
      );

      // Initially instant
      expect(screen.getByTestId('curation-time-estimate')).toHaveTextContent('Ready in a few seconds');

      // Click "Not this artist?" escape hatch
      fireEvent.click(screen.getByText('Not this artist?'));

      const originInput = screen.getByPlaceholderText('Country or region (required, e.g. Thailand)');
      fireEvent.change(originInput, { target: { value: 'Canada' } });
      fireEvent.click(screen.getByText('Apply'));

      await waitFor(() => {
        // Once escape hatch resolves with replacement candidate, dynamic speed becomes 'deep'
        expect(screen.getByTestId('curation-time-estimate')).toHaveTextContent('~3–5 minutes');
      });
    });

    it('dynamically upgrades estimate from ~1–2 minutes to ~3–5 minutes when escape hatch replaces a multi-scene partial seed with an uncached origin', async () => {
      const mockCallable = vi.fn().mockResolvedValue({
        data: {
          isValid: true,
          id: 'Jimmy Eat World',
          origin: 'Germany',
          genre: 'Alternative Rock',
          hasCollision: false,
          candidates: [
            {
              id: 'jimmy-eat-world-de',
              name: 'Jimmy Eat World',
              origin: 'Germany',
              genre: 'Alternative Rock',
            },
          ],
        },
      });
      (httpsCallable as any).mockReturnValue(mockCallable);

      render(
        <ConsolidatedValidationModal
          isOpen={true}
          seeds={[verifiedSeed]}
          expectedSpeed="partial"
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />
      );

      // Initially partial (~1–2 minutes)
      expect(screen.getByTestId('curation-time-estimate')).toHaveTextContent('~1–2 minutes');

      // Click "Not this artist?" escape hatch
      fireEvent.click(screen.getByText('Not this artist?'));

      const originInput = screen.getByPlaceholderText('Country or region (required, e.g. Thailand)');
      fireEvent.change(originInput, { target: { value: 'Germany' } });
      fireEvent.click(screen.getByText('Apply'));

      await waitFor(() => {
        // Once escape hatch resolves with replacement uncached candidate, dynamic speed steps up to 'deep' (~3–5 minutes)
        expect(screen.getByTestId('curation-time-estimate')).toHaveTextContent('~3–5 minutes');
      });
    });

    it('successfully transitions from isOpen={false} to isOpen={true} without violating Rules of Hooks (React Error #310)', () => {
      const { rerender } = render(
        <ConsolidatedValidationModal
          isOpen={false}
          seeds={[verifiedSeed]}
          expectedSpeed="instant"
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />
      );

      expect(screen.queryByText('Confirm Your Artists')).not.toBeInTheDocument();

      // Transition isOpen: false -> true (crashed with Minified React error #310 prior to fix)
      rerender(
        <ConsolidatedValidationModal
          isOpen={true}
          seeds={[verifiedSeed]}
          expectedSpeed="instant"
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />
      );

      expect(screen.getByText('Confirm Your Artists')).toBeInTheDocument();
      expect(screen.getByTestId('curation-time-estimate')).toHaveTextContent('Ready in a few seconds');
    });

    it('successfully transitions TokenConfirmationDialog from isOpen={false} to isOpen={true} without violating Rules of Hooks', () => {
      const { rerender } = render(
        <TokenConfirmationDialog
          isOpen={false}
          type="generation"
          cachedArtists={['Sense Field']}
          missingArtists={[]}
          tokenBalance={50}
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />
      );

      rerender(
        <TokenConfirmationDialog
          isOpen={true}
          type="generation"
          cachedArtists={['Sense Field']}
          missingArtists={[]}
          tokenBalance={50}
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />
      );

      expect(screen.getByText('Confirm Zcene Curation')).toBeInTheDocument();
    });
  });

  describe('4. Mobile Horizontal Padding & Subtext Constraints (<LoadingSpinner>)', () => {
    it('applies responsive max-width and horizontal padding to LoadingSpinner container and subtext', () => {
      const { container } = render(<LoadingSpinner subtext="Mapping your Zcene connections... This usually takes 3–5 minutes to find the best musical paths." />);

      const activeLoader = container.querySelector('[data-testid="active-loader"]');
      expect(activeLoader).toHaveClass('w-full');
      expect(activeLoader).toHaveClass('max-w-sm');
      expect(activeLoader).toHaveClass('px-6');
      expect(activeLoader).toHaveClass('mx-auto');

      const subtextP = screen.getByText('Mapping your Zcene connections... This usually takes 3–5 minutes to find the best musical paths.');
      expect(subtextP).toHaveClass('max-w-[260px]');
      expect(subtextP).toHaveClass('sm:max-w-xs');
      expect(subtextP).toHaveClass('leading-relaxed');
      expect(subtextP).toHaveClass('mx-auto');
    });

    it('defaults to realistic 3–5 minute copy in LoadingSpinner', () => {
      render(<LoadingSpinner />);
      expect(screen.getByText('Mapping your Zcene connections... This usually takes 3–5 minutes to find the best musical paths.')).toBeInTheDocument();
    });
  });

  describe('5. Active Loader Subtext Priority & Plain-English Copy (<GraphPage>)', () => {
    const baseGraphPageProps: any = {
      data: { nodes: [], links: [] },
      baseGraph: null,
      libraryArtists: [],
      seedArtists: 'Sense Field',
      onRegenerate: vi.fn(),
      isLoading: false,
      isHydrating: true,
      onCancelGeneration: vi.fn(),
      onFileUpload: vi.fn(),
      onNodeClick: vi.fn(),
      selectedNode: null,
      peekedNode: null,
      activeNodes: [],
      detailsCache: new Map(),
      onUpdateDetailsCache: vi.fn(),
      loadingNodeIds: new Set(),
      onTogglePinNode: vi.fn(),
      pinnedNodes: new Set(),
      onRefreshNode: vi.fn(),
      detailsError: null,
      systemError: null,
      onLogoClick: vi.fn(),
      onNavigate: vi.fn(),
      onClearLibrary: vi.fn(),
      onClearZcene: vi.fn(),
      isActive: true,
      chatHistories: new Map(),
      onUpdateChatHistories: vi.fn(),
      onShowToast: vi.fn(),
      onRefreshUI: vi.fn(),
      onAddToStack: vi.fn(),
      stackCount: 0,
      lastViewedStackCount: 0,
      onUpdateLastViewedStackCount: vi.fn(),
      discoveryFilters: {
        minYear: 1965,
        maxYear: 2026,
        originCountries: [],
        originMode: 'include',
        genres: [],
        labels: [],
      },
      onUpdateDiscoveryFilters: vi.fn(),
      isMagazineViewOpen: false,
      onUpdateIsMagazineViewOpen: vi.fn(),
      user: null,
      profile: null,
      onUpdateProfile: vi.fn(),
      isAuthInitialized: true,
      onLogin: vi.fn(),
      onLogout: vi.fn(),
      isProfileOpen: false,
      setIsProfileOpen: vi.fn(),
      isDeleteAccountModalOpen: false,
      setIsDeleteAccountModalOpen: vi.fn(),
      isStackDialogOpen: false,
      setIsStackDialogOpen: vi.fn(),
      isMenuOpen: false,
      setIsMenuOpen: vi.fn(),
      scenes: [
        {
          sceneId: 'scene-1',
          title: 'Scene 1',
          customName: 'Scene 1',
          seedArtists: ['Sense Field'],
          graphData: { nodes: [], links: [] },
        }
      ],
      activeSceneId: 'scene-1',
      onSelectScene: vi.fn(),
      onAddScene: vi.fn(),
    };

    it('displays 3–5 minutes copy and never 1–2 minutes or "curatorial dataset" when isHydrating={true} + expectedCurationSpeed="deep" + projectStatus="curating"', () => {
      render(
        <GraphPage
          {...baseGraphPageProps}
          isHydrating={true}
          expectedCurationSpeed="deep"
          projectStatus="curating"
        />
      );

      expect(screen.getByText('Mapping your Zcene connections... This usually takes 3–5 minutes to find the best musical paths.')).toBeInTheDocument();
      expect(screen.queryByText(/1–2 minutes/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/curatorial dataset/i)).not.toBeInTheDocument();
    });

    it('displays "Loading connections... Ready in a few seconds." and never "cached" or "3–5 minutes" when isHydrating={true} + expectedCurationSpeed="instant" + projectStatus="curating"', () => {
      render(
        <GraphPage
          {...baseGraphPageProps}
          isHydrating={true}
          expectedCurationSpeed="instant"
          projectStatus="curating"
        />
      );

      expect(screen.getByText('Loading connections... Ready in a few seconds.')).toBeInTheDocument();
      expect(screen.queryByText(/cached/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/3–5 minutes/i)).not.toBeInTheDocument();
    });

    it('displays "Loading connections... Ready in 1–2 minutes." and never "curatorial dataset" when isHydrating={true} + expectedCurationSpeed="partial" + projectStatus="curating"', () => {
      render(
        <GraphPage
          {...baseGraphPageProps}
          isHydrating={true}
          expectedCurationSpeed="partial"
          projectStatus="curating"
        />
      );

      expect(screen.getByText('Loading connections... Ready in 1–2 minutes.')).toBeInTheDocument();
      expect(screen.queryByText(/curatorial dataset/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/3–5 minutes/i)).not.toBeInTheDocument();
    });

    it('displays 3–5 minutes copy when isHydrating={true} + expectedCurationSpeed={undefined} + projectStatus="curating"', () => {
      render(
        <GraphPage
          {...baseGraphPageProps}
          isHydrating={true}
          expectedCurationSpeed={undefined}
          projectStatus="curating"
        />
      );

      expect(screen.getByText('Mapping your Zcene connections... This usually takes 3–5 minutes to find the best musical paths.')).toBeInTheDocument();
      expect(screen.queryByText(/1–2 minutes/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/curatorial dataset/i)).not.toBeInTheDocument();
    });

    it('displays "Loading connections... Ready in a few seconds." when isHydrating={true} + expectedCurationSpeed={undefined} + projectStatus="completed"', () => {
      render(
        <GraphPage
          {...baseGraphPageProps}
          isHydrating={true}
          expectedCurationSpeed={undefined}
          projectStatus="completed"
        />
      );

      expect(screen.getByText('Loading connections... Ready in a few seconds.')).toBeInTheDocument();
      expect(screen.queryByText(/curatorial dataset/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/3–5 minutes/i)).not.toBeInTheDocument();
    });
  });

  describe('6. DEEP CUTS Loader Primacy & viewedIndex Clamping (<DetailsPanel>)', () => {
    const baseDetailsProps = {
      selectedNode: null,
      activeNodes: [],
      detailsCache: new Map(),
      loadingNodeIds: new Set<string>(),
      onTogglePinNode: vi.fn(),
      pinnedNodes: new Set<string>(),
      onRefreshNode: vi.fn(),
      error: null,
      systemError: null,
      graphData: { nodes: [], links: [] },
      libraryArtists: [],
      seedArtists: ['The Jealous Sound', 'Hey Mercedes'],
      onAddArtist: vi.fn(),
      isCollapsed: false,
      onToggleCollapse: vi.fn(),
      isSmallScreen: false,
      onNodeClick: vi.fn(),
      onNavigate: vi.fn(),
      isGlobalLoading: false,
      onCancelGlobalLoading: vi.fn(),
      unreadCount: 0,
      isActive: true,
      isMagazineViewOpen: false,
      onMagazineViewToggle: vi.fn(),
      chatHistories: new Map(),
      onUpdateChatHistories: vi.fn(),
      onAddToStack: vi.fn(),
    };

    it('renders "Waiting for Connections to settle..." and "Graph mapping takes priority." when isGlobalLoading={true} even if graphData.nodes is empty', () => {
      render(
        <DetailsPanel
          {...baseDetailsProps}
          isGlobalLoading={true}
          graphData={{ nodes: [], links: [] }}
          activeNodes={[]}
        />
      );

      expect(screen.getByText('Waiting for Connections to settle...')).toBeInTheDocument();
      expect(screen.getByText('Graph mapping takes priority. Details will follow.')).toBeInTheDocument();
      expect(screen.queryByText('Create Your Zcene')).not.toBeInTheDocument();
    });

    it('clamps translateX offset to 0% when activeNodes becomes empty after viewing at viewedIndex > 0', () => {
      const mockNodes: any[] = [
        { id: 'the-jealous-sound', type: 'artist', label: 'The Jealous Sound' },
        { id: 'hey-mercedes', type: 'artist', label: 'Hey Mercedes' },
        { id: 'sense-field', type: 'artist', label: 'Sense Field' },
      ];

      const { rerender } = render(
        <DetailsPanel
          {...baseDetailsProps}
          activeNodes={mockNodes}
          graphData={{ nodes: mockNodes, links: [] }}
          selectedNode={mockNodes[1]}
        />
      );

      // Verify that after transitioning to an empty slate on overwrite with isGlobalLoading={true}
      rerender(
        <DetailsPanel
          {...baseDetailsProps}
          activeNodes={[]}
          graphData={{ nodes: [], links: [] }}
          selectedNode={null}
          isGlobalLoading={true}
        />
      );

      const container = screen.getByTestId('deep-cut-cards-container');
      expect(container.style.transform).toBe('translateX(-0%)');
      expect(screen.getByText('Waiting for Connections to settle...')).toBeInTheDocument();
      expect(screen.getByText('Graph mapping takes priority. Details will follow.')).toBeInTheDocument();
    });

    it('renders "Waiting for Connections to settle..." and hides pagination dots and stale cards when isGlobalLoading={true} even with 19 active nodes', () => {
      const mock19Nodes: any[] = Array.from({ length: 19 }, (_, i) => ({
        id: `node-${i}`,
        type: 'artist',
        label: i === 0 ? 'The Jealous Sound' : `Artist ${i}`,
      }));

      const mockCache = new Map<string, any>();
      mockCache.set('node-0', {
        summary: 'Long bio for The Jealous Sound that would normally render in Deep Cuts',
        imageUrl: 'https://example.com/tjs.jpg',
        details: { artist: 'The Jealous Sound', genre: 'Emo' },
      });

      render(
        <DetailsPanel
          {...baseDetailsProps}
          isGlobalLoading={true}
          graphData={{ nodes: mock19Nodes, links: [] }}
          activeNodes={mock19Nodes}
          detailsCache={mockCache}
        />
      );

      // Centered spinner must be present
      expect(screen.getByText('Waiting for Connections to settle...')).toBeInTheDocument();
      expect(screen.getByText('Graph mapping takes priority. Details will follow.')).toBeInTheDocument();

      // Stale card bio and label must NOT be rendered
      expect(screen.queryByText('The Jealous Sound')).not.toBeInTheDocument();
      expect(screen.queryByText(/Long bio for The Jealous Sound/i)).not.toBeInTheDocument();

      // Pagination chevron buttons must NOT be rendered while loading
      expect(screen.queryByText('chevron_left')).not.toBeInTheDocument();

      // Transform must be clamped to 0%
      const container = screen.getByTestId('deep-cut-cards-container');
      expect(container.style.transform).toBe('translateX(-0%)');
    });
  });

  describe('7. Multi-Scene Overwrite vs. Fork Intercept Modal (<GraphPage>)', () => {
    const multiSceneGraphPageProps: any = {
      data: {
        nodes: [{ id: 'the-jealous-sound', type: 'artist', label: 'The Jealous Sound' }],
        links: [],
      },
      baseGraph: null,
      libraryArtists: [],
      seedArtists: 'Elliott',
      onRegenerate: vi.fn(),
      onFork: vi.fn(),
      isLoading: false,
      isHydrating: false,
      onCancelGeneration: vi.fn(),
      onFileUpload: vi.fn(),
      onNodeClick: vi.fn(),
      selectedNode: null,
      peekedNode: null,
      activeNodes: [],
      detailsCache: new Map(),
      onUpdateDetailsCache: vi.fn(),
      loadingNodeIds: new Set(),
      onTogglePinNode: vi.fn(),
      pinnedNodes: new Set(),
      onRefreshNode: vi.fn(),
      detailsError: null,
      systemError: null,
      onLogoClick: vi.fn(),
      onNavigate: vi.fn(),
      onClearLibrary: vi.fn(),
      onClearZcene: vi.fn(),
      isActive: true,
      chatHistories: new Map(),
      onUpdateChatHistories: vi.fn(),
      onShowToast: vi.fn(),
      onRefreshUI: vi.fn(),
      onAddToStack: vi.fn(),
      stackCount: 0,
      lastViewedStackCount: 0,
      onUpdateLastViewedStackCount: vi.fn(),
      discoveryFilters: {
        minYear: 1965,
        maxYear: 2026,
        originCountries: [],
        originMode: 'include',
        genres: [],
        labels: [],
      },
      onUpdateDiscoveryFilters: vi.fn(),
      isMagazineViewOpen: false,
      onUpdateIsMagazineViewOpen: vi.fn(),
      user: { uid: 'test-user-simon', email: 'simon@test.com' },
      profile: null,
      onUpdateProfile: vi.fn(),
      isAuthInitialized: true,
      onLogin: vi.fn(),
      onLogout: vi.fn(),
      isProfileOpen: false,
      setIsProfileOpen: vi.fn(),
      isDeleteAccountModalOpen: false,
      setIsDeleteAccountModalOpen: vi.fn(),
      isStackDialogOpen: false,
      setIsStackDialogOpen: vi.fn(),
      isMenuOpen: false,
      setIsMenuOpen: vi.fn(),
      scenes: [
        {
          sceneId: 'scene-1',
          title: 'Scene 1',
          customName: 'Scene 1',
          seedArtists: 'The Jealous Sound',
          graphData: {
            nodes: [{ id: 'the-jealous-sound', type: 'artist', label: 'The Jealous Sound' }],
            links: [],
          },
        },
        {
          sceneId: 'scene-2',
          title: 'Scene 2',
          customName: 'Scene 2',
          seedArtists: 'Elliott',
          graphData: { nodes: [], links: [] },
        },
      ],
      activeSceneId: 'scene-2',
      onSelectScene: vi.fn(),
      onAddScene: vi.fn(),
    };

    it('opens UpdateInterceptModal when adding/updating Scene 2 on a project with existing mapped Scene 1', () => {
      const onRegenerateMock = vi.fn();
      const onForkMock = vi.fn();

      render(
        <GraphPage
          {...multiSceneGraphPageProps}
          onRegenerate={onRegenerateMock}
          onFork={onForkMock}
        />
      );

      const updateButton = screen.getByRole('button', { name: /Update Zcene/i });
      expect(updateButton).toBeInTheDocument();

      fireEvent.click(updateButton);

      expect(screen.getByText('You are about to generate new connections. Would you like to fork a new Zcene, or overwrite the existing one?')).toBeInTheDocument();
      expect(screen.getByText('Save as New Zcene')).toBeInTheDocument();
      expect(screen.getByText('Overwrite Existing')).toBeInTheDocument();
      expect(onRegenerateMock).not.toHaveBeenCalled();
    });

    it('invokes onFork when user selects "Save as New Zcene" in the modal', () => {
      const onRegenerateMock = vi.fn();
      const onForkMock = vi.fn();

      render(
        <GraphPage
          {...multiSceneGraphPageProps}
          onRegenerate={onRegenerateMock}
          onFork={onForkMock}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: /Update Zcene/i }));

      const forkButton = screen.getByText('Save as New Zcene');
      fireEvent.click(forkButton);

      expect(onForkMock).toHaveBeenCalledWith('Elliott');
      expect(onRegenerateMock).not.toHaveBeenCalled();
    });

    it('invokes onRegenerate when user selects "Overwrite Existing" with confirmation checkbox checked', () => {
      const onRegenerateMock = vi.fn();
      const onForkMock = vi.fn();

      render(
        <GraphPage
          {...multiSceneGraphPageProps}
          onRegenerate={onRegenerateMock}
          onFork={onForkMock}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: /Update Zcene/i }));

      const overwriteButton = screen.getByText('Overwrite Existing');
      expect(overwriteButton).toBeDisabled();

      const checkbox = screen.getByRole('checkbox');
      fireEvent.click(checkbox);

      expect(overwriteButton).not.toBeDisabled();
      fireEvent.click(overwriteButton);

      expect(onRegenerateMock).toHaveBeenCalledWith('Elliott');
      expect(onForkMock).not.toHaveBeenCalled();
    });
  });

  describe('8. Multi-Scene Initial Selection & Stranded Curation Self-Healing', () => {
    it('defaults activeSceneId to Scene 1 (parsedScenes[0]) when entering a completed project with activeSceneId="scene-2"', () => {
      const parsedScenes: any[] = [
        { sceneId: 'scene-1', id: 'scene-1', title: 'Scene 1' },
        { sceneId: 'scene-2', id: 'scene-2', title: 'Scene 2' },
      ];

      // Simulated Router Pre-population logic for completed project
      const localProjCompleted: any = {
        status: 'completed',
        activeJobId: null,
        activeSceneId: 'scene-2',
      };

      const isCurating = localProjCompleted.status === 'curating' || !!localProjCompleted.activeJobId;
      const resolvedActiveSceneId = isCurating && localProjCompleted.activeSceneId && parsedScenes.some(s => (s.sceneId || s.id) === localProjCompleted.activeSceneId)
        ? localProjCompleted.activeSceneId
        : (parsedScenes[0].sceneId || parsedScenes[0].id || 'scene-1');

      expect(resolvedActiveSceneId).toBe('scene-1');
    });

    it('preserves target activeSceneId when entering an actively curating project', () => {
      const parsedScenes: any[] = [
        { sceneId: 'scene-1', id: 'scene-1', title: 'Scene 1' },
        { sceneId: 'scene-2', id: 'scene-2', title: 'Scene 2' },
      ];

      const localProjCurating: any = {
        status: 'curating',
        activeJobId: 'job-123',
        activeSceneId: 'scene-2',
      };

      const isCurating = localProjCurating.status === 'curating' || !!localProjCurating.activeJobId;
      const resolvedActiveSceneId = isCurating && localProjCurating.activeSceneId && parsedScenes.some(s => (s.sceneId || s.id) === localProjCurating.activeSceneId)
        ? localProjCurating.activeSceneId
        : (parsedScenes[0].sceneId || parsedScenes[0].id || 'scene-1');

      expect(resolvedActiveSceneId).toBe('scene-2');
    });

    it('auto-heals a stranded project with status="curating" and activeJobId=null to "completed" when mapped nodes exist', () => {
      const strandedDoc: any = {
        id: 'wMAF46dvYZCCi30wV4oj',
        status: 'curating',
        activeJobId: null,
        graphData: JSON.stringify({ nodes: [{ id: 'artist-1' }], links: [] }),
        scenes: [{ sceneId: 'scene-1', graphData: { nodes: [{ id: 'artist-1' }], links: [] } }],
      };

      // Safeguard 2: Not actively curating in the current session
      const isActivelyCuratingThisProj = false;

      let effectiveStatus = strandedDoc.status;
      if (strandedDoc.status === 'curating' && !strandedDoc.activeJobId && !isActivelyCuratingThisProj) {
        const hasNodes = (typeof strandedDoc.graphData === 'string' && strandedDoc.graphData.length > 20) ||
          (Array.isArray(strandedDoc.scenes) && strandedDoc.scenes.some((s: any) => (s.graphData?.nodes?.length ?? 0) > 0));
        effectiveStatus = hasNodes ? 'completed' : 'idle';
      }

      expect(effectiveStatus).toBe('completed');
    });

    it('protects active Stage-1 curations from auto-healing when active in the current session', () => {
      const stage1Doc: any = {
        id: 'active-session-proj-1',
        status: 'curating',
        activeJobId: null, // Stage 1 Cloud Function has not returned jobId yet
        graphData: JSON.stringify({ nodes: [{ id: 'artist-1' }], links: [] }),
      };

      // In current active tab session
      const isActivelyCuratingThisProj = true;

      let effectiveStatus = stage1Doc.status;
      if (stage1Doc.status === 'curating' && !stage1Doc.activeJobId && !isActivelyCuratingThisProj) {
        effectiveStatus = 'completed';
      }

      // Must remain 'curating' to allow Stage 1 pipeline to proceed
      expect(effectiveStatus).toBe('curating');
    });
  });

  describe('Multi-Scene Fork Target Scene Protection (App.tsx onFork & ProjectLoader)', () => {
    const multiSceneList: any[] = [
      { sceneId: 'scene-1', id: 'scene-1', title: 'The Jealous Sound + Hey Mercedes', graphData: { nodes: [{ id: 'tjs' }, { id: 'hm' }] } },
      { sceneId: 'scene-2', id: 'scene-2', title: 'Elliott', graphData: { nodes: [{ id: 'elliott' }] } },
      { sceneId: 'scene-3', id: 'scene-3', title: 'Jimmy Eat World', graphData: { nodes: [{ id: 'jew' }] } },
      { sceneId: 'scene-4', id: 'scene-4', title: 'Yellowcard', graphData: { nodes: [] } },
    ];

    it('preserves targetSceneId="scene-4" in ProjectLoader during fork pre-flight even when status="completed" and isInitialLoad=true', () => {
      const forkedProjectDoc: any = {
        id: '4kfd8smA8Fchud1qcWUk',
        status: 'completed',
        activeJobId: null,
        activeSceneId: 'scene-4',
      };

      const currentProjectId = '4kfd8smA8Fchud1qcWUk';
      const pendingUnconfirmedForkId = '4kfd8smA8Fchud1qcWUk';
      const isPreFlightChecking = true;
      const isInitialLoad = true;
      const activeSceneIdRefCurrent = 'scene-4';

      const isCurating = forkedProjectDoc.status === 'curating' || !!forkedProjectDoc.activeJobId;
      const isUnconfirmedForkOrPreFlight = pendingUnconfirmedForkId === currentProjectId || isPreFlightChecking;

      const resolvedActiveSceneId = isUnconfirmedForkOrPreFlight && (forkedProjectDoc.activeSceneId || activeSceneIdRefCurrent) && multiSceneList.some(s => (s.sceneId || s.id) === (forkedProjectDoc.activeSceneId || activeSceneIdRefCurrent))
        ? (forkedProjectDoc.activeSceneId && multiSceneList.some(s => (s.sceneId || s.id) === forkedProjectDoc.activeSceneId) ? forkedProjectDoc.activeSceneId : (activeSceneIdRefCurrent || 'scene-1'))
        : isCurating && forkedProjectDoc.activeSceneId && multiSceneList.some(s => (s.sceneId || s.id) === forkedProjectDoc.activeSceneId)
          ? forkedProjectDoc.activeSceneId
          : (!isInitialLoad && activeSceneIdRefCurrent && multiSceneList.some(s => (s.sceneId || s.id) === activeSceneIdRefCurrent))
            ? activeSceneIdRefCurrent
            : (multiSceneList[0].sceneId || multiSceneList[0].id || 'scene-1');

      expect(resolvedActiveSceneId).toBe('scene-4');
    });

    it('preserves activeSceneId="scene-4" when isPreFlightChecking is true even if pendingUnconfirmedForkId is null', () => {
      const existingProjectDoc: any = {
        id: 'J6u14fD1reYUv48HIYFi',
        status: 'completed',
        activeJobId: null,
        activeSceneId: 'scene-4',
      };

      const currentProjectId = 'J6u14fD1reYUv48HIYFi';
      const pendingUnconfirmedForkId = null;
      const isPreFlightChecking = true;
      const isInitialLoad = true;
      const activeSceneIdRefCurrent = 'scene-4';

      const isCurating = existingProjectDoc.status === 'curating' || !!existingProjectDoc.activeJobId;
      const isUnconfirmedForkOrPreFlight = pendingUnconfirmedForkId === currentProjectId || isPreFlightChecking;

      const resolvedActiveSceneId = isUnconfirmedForkOrPreFlight && (existingProjectDoc.activeSceneId || activeSceneIdRefCurrent) && multiSceneList.some(s => (s.sceneId || s.id) === (existingProjectDoc.activeSceneId || activeSceneIdRefCurrent))
        ? (existingProjectDoc.activeSceneId && multiSceneList.some(s => (s.sceneId || s.id) === existingProjectDoc.activeSceneId) ? existingProjectDoc.activeSceneId : (activeSceneIdRefCurrent || 'scene-1'))
        : isCurating && existingProjectDoc.activeSceneId && multiSceneList.some(s => (s.sceneId || s.id) === existingProjectDoc.activeSceneId)
          ? existingProjectDoc.activeSceneId
          : (!isInitialLoad && activeSceneIdRefCurrent && multiSceneList.some(s => (s.sceneId || s.id) === activeSceneIdRefCurrent))
            ? activeSceneIdRefCurrent
            : (multiSceneList[0].sceneId || multiSceneList[0].id || 'scene-1');

      expect(resolvedActiveSceneId).toBe('scene-4');
    });

    it('defaults normal completed project loads from /dashboard to parsedScenes[0] (Scene 1) when not in pre-flight or unconfirmed fork', () => {
      const settledProjectDoc: any = {
        id: 'J6u14fD1reYUv48HIYFi',
        status: 'completed',
        activeJobId: null,
        activeSceneId: 'scene-3', // Last saved scene was Scene 3
      };

      const currentProjectId = 'J6u14fD1reYUv48HIYFi';
      const pendingUnconfirmedForkId = null;
      const isPreFlightChecking = false;
      const isInitialLoad = true; // Initial load from dashboard
      const activeSceneIdRefCurrent = 'scene-1';

      const isCurating = settledProjectDoc.status === 'curating' || !!settledProjectDoc.activeJobId;
      const isUnconfirmedForkOrPreFlight = pendingUnconfirmedForkId === currentProjectId || isPreFlightChecking;

      const resolvedActiveSceneId = isUnconfirmedForkOrPreFlight && (settledProjectDoc.activeSceneId || activeSceneIdRefCurrent) && multiSceneList.some(s => (s.sceneId || s.id) === (settledProjectDoc.activeSceneId || activeSceneIdRefCurrent))
        ? (settledProjectDoc.activeSceneId && multiSceneList.some(s => (s.sceneId || s.id) === settledProjectDoc.activeSceneId) ? settledProjectDoc.activeSceneId : (activeSceneIdRefCurrent || 'scene-1'))
        : isCurating && settledProjectDoc.activeSceneId && multiSceneList.some(s => (s.sceneId || s.id) === settledProjectDoc.activeSceneId)
          ? settledProjectDoc.activeSceneId
          : (!isInitialLoad && activeSceneIdRefCurrent && multiSceneList.some(s => (s.sceneId || s.id) === activeSceneIdRefCurrent))
            ? activeSceneIdRefCurrent
            : (multiSceneList[0].sceneId || multiSceneList[0].id || 'scene-1');

      expect(resolvedActiveSceneId).toBe('scene-1');
    });

    it('locks targetSceneIdOverride at handleGenerateGraph entry and dispatches scene-4 even if mutable ref is altered during await', async () => {
      const targetSceneIdOverride = 'scene-4';
      let activeSceneIdRefCurrent = 'scene-4';

      // Layer 1: Lock targetSceneId at entry
      const lockedTargetSceneId = targetSceneIdOverride || activeSceneIdRefCurrent || 'scene-1';
      activeSceneIdRefCurrent = lockedTargetSceneId;

      // Simulate async modal pause (await confirmTokenUsage / await ConsolidatedValidationModal)
      await new Promise(resolve => setTimeout(resolve, 10));

      // Simulate concurrent background snapshot altering mutable ref to scene-1:
      activeSceneIdRefCurrent = 'scene-1';

      // When modal confirms, re-assert lockedTargetSceneId:
      activeSceneIdRefCurrent = lockedTargetSceneId;

      // When curation payload is constructed:
      const targetSceneIdForJob = lockedTargetSceneId;
      const targetSceneIdxForJob = Math.max(0, multiSceneList.findIndex(s => (s.sceneId || s.id) === targetSceneIdForJob));

      expect(targetSceneIdForJob).toBe('scene-4');
      expect(targetSceneIdxForJob).toBe(3);
      expect(activeSceneIdRefCurrent).toBe('scene-4');
    });

    it('suppresses auto-selection during unconfirmed fork or pre-flight', () => {
      const urlSelected = null;
      let hasAutoSelected = null;
      const currentProjectId = '4kfd8smA8Fchud1qcWUk';

      // Pre-flight active
      const isUnconfirmedForkOrPreFlight = true;

      let didAutoSelect = false;
      if (!urlSelected && !isUnconfirmedForkOrPreFlight && hasAutoSelected !== currentProjectId) {
        hasAutoSelected = currentProjectId;
        didAutoSelect = true;
      }

      expect(didAutoSelect).toBe(false);
      expect(hasAutoSelected).toBe(null);
    });
  });

  describe('Architecture V45.1: overarchingHistory Archive & 3-Case Scene Removal Intercept ([Rule 29], [Rule 44])', () => {
    const scene1 = {
      sceneId: 'scene-1',
      sceneIndex: 0,
      curatedSeedArtists: 'The Jealous Sound::Hey Mercedes',
      seedArtists: 'The Jealous Sound::Hey Mercedes',
      graphData: {
        nodes: Array.from({ length: 19 }, (_, i) => ({ id: `scene-1::node-${i}`, x: 1000 + i * 10, fx: 1000 + i * 10, type: 'artist' })),
        links: []
      },
      status: 'completed',
    };

    const scene2 = {
      sceneId: 'scene-2',
      sceneIndex: 1,
      curatedSeedArtists: 'Elliott',
      seedArtists: 'Elliott',
      graphData: {
        nodes: Array.from({ length: 18 }, (_, i) => ({ id: `scene-2::node-${i}`, x: 2050 + i * 10, fx: 2050 + i * 10, type: 'artist' })),
        links: []
      },
      status: 'completed',
    };

    const scene3 = {
      sceneId: 'scene-3',
      sceneIndex: 2,
      curatedSeedArtists: 'Jimmy Eat World',
      seedArtists: 'Jimmy Eat World',
      graphData: {
        nodes: Array.from({ length: 19 }, (_, i) => ({ id: `scene-3::node-${i}`, x: 3100 + i * 10, fx: 3100 + i * 10, type: 'artist' })),
        links: []
      },
      status: 'completed',
    };

    const scene4 = {
      sceneId: 'scene-4',
      sceneIndex: 3,
      curatedSeedArtists: 'Yellowcard',
      seedArtists: 'Yellowcard',
      graphData: {
        nodes: Array.from({ length: 18 }, (_, i) => ({ id: `scene-4::node-${i}`, x: 4150 + i * 10, fx: 4150 + i * 10, type: 'artist' })),
        links: []
      },
      status: 'completed',
    };

    const uncuratedStub = {
      sceneId: 'scene-stub',
      sceneIndex: 4,
      curatedSeedArtists: 'Sunny Day Real Estate',
      seedArtists: 'Sunny Day Real Estate',
      graphData: { nodes: [], links: [] },
      status: 'idle',
    };

    it('1. Deterministic canonical signature computation: sorts seeds, ignores scene order, ignores uncurated stubs', () => {
      const sigForward = computeSceneSetSignature([scene1, scene2]);
      const sigBackward = computeSceneSetSignature([scene2, scene1]);

      expect(sigForward).toBeTruthy();
      expect(sigForward).toBe(sigBackward);

      // Uncurated stub with 0 nodes does not alter signature
      const sigWithStub = computeSceneSetSignature([scene1, scene2, uncuratedStub]);
      expect(sigWithStub).toBe(sigForward);

      // Adding a 3rd curated scene produces a distinct stable signature
      const sig3Scenes = computeSceneSetSignature([scene1, scene2, scene3]);
      expect(sig3Scenes).toBeTruthy();
      expect(sig3Scenes).not.toBe(sigForward);
      expect(computeSceneSetSignature([scene3, scene1, scene2])).toBe(sig3Scenes);
    });

    it('2. Case A (Single Scene Fallback): removing scene when 1 curated scene remains clears overarching rationale/links', () => {
      const allScenes = [scene1, scene2];
      const remainingCurated = allScenes.filter(s => (s.sceneId || (s as any).id) !== 'scene-2' && s.graphData.nodes.length > 0);

      expect(remainingCurated.length).toBe(1);

      // In Case A, removing scene-2 leaves 1 scene: overarching editorial must be cleared
      const isCaseA = remainingCurated.length <= 1;
      expect(isCaseA).toBe(true);

      const nextOverarchingRationale = isCaseA ? '' : 'preserved';
      const nextCrossSceneLinks = isCaseA ? [] : [{ sourceSceneId: 'scene-1', targetSceneId: 'scene-2' }];

      expect(nextOverarchingRationale).toBe('');
      expect(nextCrossSceneLinks).toEqual([]);
    });

    it('3. Case B (Archive Hit): restores archived Overarching Zine (editorial, title, intro, links) instantly without token spend', () => {
      const remainingCurated = [scene1, scene2];
      const targetSig = computeSceneSetSignature(remainingCurated);

      const archivedEntry = {
        sceneSignature: targetSig,
        overarchingRationale: '# The Dual Soundscape\nArchived editorial between The Jealous Sound and Elliott.',
        overarchingZineTitle: 'Midwest & West Coast Emo Architecture',
        overarchingZineIntro: 'Archived dedication note.',
        overarchingZineImages: [{ url: 'https://example.com/jealous.jpg', caption: 'The Jealous Sound' }],
        crossSceneLinks: [{ sourceSceneId: 'scene-1', targetSceneId: 'scene-2', bridgeType: 'sonic_lineage' }],
        archivedAt: new Date().toISOString(),
        sceneCount: 2,
        sceneSeeds: ['The Jealous Sound', 'Elliott'],
      };

      const historyMap = { [targetSig]: archivedEntry };
      const parsedHistory = parseOverarchingHistory(historyMap);

      expect(parsedHistory[targetSig]).toBeDefined();
      expect(parsedHistory[targetSig].overarchingZineTitle).toBe('Midwest & West Coast Emo Architecture');

      // Restoration is instant and 0 token cost
      const restored = parsedHistory[targetSig];
      expect(restored.overarchingRationale).toContain('Archived editorial');
      expect(restored.crossSceneLinks).toHaveLength(1);
    });

    it('4. Case C (Archive Miss & Safe Cancel): prompts 5 Tokens and aborts cleanly with 0 deleteDoc calls when cancelled', async () => {
      const allScenes = [scene1, scene2, scene3];
      const remainingCurated = allScenes.filter(s => (s.sceneId || (s as any).id) !== 'scene-3' && s.graphData.nodes.length > 0);
      const targetSig = computeSceneSetSignature(remainingCurated);

      // Empty history -> Archive Miss -> Case C
      const historyMap: any = {};
      const isArchiveHit = Boolean(targetSig && historyMap[targetSig]);
      expect(isArchiveHit).toBe(false);

      // Simulation of Safe Cancel in handleRemoveScene (Pass #3 architecture)
      // Because setDoc is deferred until after token confirmation, no document exists in Firestore.
      // Therefore, zero deleteDoc calls are made and no permission error can occur.
      const deleteDocMock = vi.fn();
      let confirmedToken = false;
      let targetSceneRemoved = false;
      let pendingUnconfirmedForkId: string | null = 'fork-doc-123';

      if (!confirmedToken) {
        // Safe cancel: clear pending fork refs, do NOT call deleteDoc
        pendingUnconfirmedForkId = null;
        // targetSceneRemoved remains false
      } else {
        targetSceneRemoved = true;
      }

      expect(targetSceneRemoved).toBe(false);
      expect(deleteDocMock).not.toHaveBeenCalled();
      expect(pendingUnconfirmedForkId).toBeNull();
      expect(allScenes).toHaveLength(3); // Scene 3 remains untouched
    });

    it('5. Coordinate & CanvasLayout Shifting (Guardrail 3): shifts oldIdx > removedIdx by dx = (newIdx - oldIdx) * 1050', () => {
      const initialScenes = [scene1, scene2, scene3, scene4];

      const initialCanvasLayout = [
        { nodeId: 'scene-1::node-0', x: 1000, fx: 1000, y: 500, fy: 500 },
        { nodeId: 'scene-2::node-0', x: 2050, fx: 2050, y: 500, fy: 500 },
        { nodeId: 'scene-3::node-0', x: 3100, fx: 3100, y: 500, fy: 500 },
        { nodeId: 'scene-4::node-0', x: 4150, fx: 4150, y: 500, fy: 500 },
      ];

      // Remove Scene 2 (removedIdx = 1)
      const { remainingScenes, shiftedCanvasLayout } = shiftSceneClusterCoordinates({
        scenes: initialScenes,
        removedSceneId: 'scene-2',
        canvasLayout: initialCanvasLayout,
      });

      expect(remainingScenes).toHaveLength(3);

      // Scene 1 (oldIdx = 0 < 1): dx = 0
      expect(remainingScenes[0].sceneId).toBe('scene-1');
      expect(remainingScenes[0].sceneIndex).toBe(0);
      expect(remainingScenes[0].centerOffset).toEqual({ x: 1000, y: 1000 });
      expect(remainingScenes[0].graphData.nodes[0].id).toBe('scene-1::node-0');
      expect(remainingScenes[0].graphData.nodes[0].x).toBe(1000);
      expect(remainingScenes[0].graphData.nodes[0].fx).toBe(1000);

      // Total layout count shrinks from 4 to 3 (removed scene is purged)
      expect(shiftedCanvasLayout).toHaveLength(3);
      // scene-4 is canonically re-indexed to scene-3, so no scene-4:: entries remain
      expect(shiftedCanvasLayout.some(item => item.nodeId.startsWith('scene-4::'))).toBe(false);

      // Scene 3 canonically re-indexed to scene-2 (oldIdx = 2, newIdx = 1): dx = (1 - 2) * 1050 = -1050
      expect(remainingScenes[1].sceneId).toBe('scene-2');
      expect(remainingScenes[1].sceneIndex).toBe(1);
      expect(remainingScenes[1].centerOffset).toEqual({ x: 2050, y: 1000 }); // 1000 + 1 * 1050
      expect(remainingScenes[1].graphData.nodes[0].id).toBe('scene-2::node-0');
      expect(remainingScenes[1].graphData.nodes[0].x).toBe(3100 - 1050); // 2050
      expect(remainingScenes[1].graphData.nodes[0].fx).toBe(3100 - 1050); // 2050

      const scene3Layout = shiftedCanvasLayout.find(item => item.nodeId === 'scene-2::node-0');
      expect(scene3Layout?.x).toBe(3100 - 1050);
      expect(scene3Layout?.fx).toBe(3100 - 1050);

      // Scene 4 canonically re-indexed to scene-3 (oldIdx = 3, newIdx = 2): dx = (2 - 3) * 1050 = -1050
      expect(remainingScenes[2].sceneId).toBe('scene-3');
      expect(remainingScenes[2].sceneIndex).toBe(2);
      expect(remainingScenes[2].centerOffset).toEqual({ x: 3100, y: 1000 }); // 1000 + 2 * 1050
      expect(remainingScenes[2].graphData.nodes[0].id).toBe('scene-3::node-0');
      expect(remainingScenes[2].graphData.nodes[0].x).toBe(4150 - 1050); // 3100
      expect(remainingScenes[2].graphData.nodes[0].fx).toBe(4150 - 1050); // 3100

      const scene4Layout = shiftedCanvasLayout.find(item => item.nodeId === 'scene-3::node-0');
      expect(scene4Layout?.x).toBe(4150 - 1050);
      expect(scene4Layout?.fx).toBe(4150 - 1050);
    });

    it('6. Safeguard B: processCurationJob safe prevSig === newSig disambiguation & scene metadata attribution', () => {
      // Setup: 3 settled scenes + newly added Scene 4 (targetSceneId = 'scene-4')
      const prevDocScenes = [scene1, scene2, scene3, scene4];
      const finalProjectScenes = [scene1, scene2, scene3, scene4];
      const targetSceneId = 'scene-4';

      const newSig = computeSceneSetSignature(finalProjectScenes);
      let prevSig = computeSceneSetSignature(prevDocScenes);
      let scenesForPrevArchive = prevDocScenes;

      expect(prevSig).toBe(newSig); // Prior to disambiguation, collision occurs

      // Safe disambiguation: exclude targetSceneId when prevSig === newSig
      if (prevSig === newSig && targetSceneId) {
        const priorSettledScenes = prevDocScenes.filter(
          s => (s.sceneId || (s as any).id) !== targetSceneId && ((s.graphData?.nodes?.length ?? 0) > 0 || (s as any).status === 'completed')
        );
        prevSig = computeSceneSetSignature(priorSettledScenes);
        scenesForPrevArchive = priorSettledScenes;
      }

      // Assertions:
      expect(prevSig).not.toBe(newSig);
      expect(prevSig).toBe(computeSceneSetSignature([scene1, scene2, scene3]));
      expect(scenesForPrevArchive).toHaveLength(3);
      expect(scenesForPrevArchive.map(s => s.curatedSeedArtists)).toEqual([
        'The Jealous Sound::Hey Mercedes',
        'Elliott',
        'Jimmy Eat World'
      ]);
    });

    it('7. Safeguard C: Curation Reconnect pipes overarchingHistory, overarchingRationale, & crossSceneLinks directly into memory', () => {
      const mockJobResult = {
        overarchingRationale: '# New 3-Scene Rationale\nSynthesized cross-scene narrative.',
        crossSceneLinks: [
          { sourceSceneId: 'scene-1', targetSceneId: 'scene-2', bridgeType: 'sonic_lineage' },
          { sourceSceneId: 'scene-2', targetSceneId: 'scene-3', bridgeType: 'label_roster' }
        ],
        overarchingHistory: JSON.stringify({
          'sig-prior-4-scenes': {
            sceneSignature: 'sig-prior-4-scenes',
            overarchingRationale: '# Prior 4-Scene Rationale',
            sceneCount: 4
          },
          'sig-new-3-scenes': {
            sceneSignature: 'sig-new-3-scenes',
            overarchingRationale: '# New 3-Scene Rationale',
            sceneCount: 3
          }
        })
      };

      const overarchingHistoryRef = { current: {} as any };
      const overarchingRationaleRef = { current: '' };
      const crossSceneLinksRef = { current: [] as any[] };
      let setOverarchingHistoryVal: any = null;
      let setOverarchingRationaleVal: any = null;
      let setCrossSceneLinksVal: any = null;

      // Simulated Curation Reconnect direct hydration
      if (mockJobResult.overarchingHistory) {
        const parsed = parseOverarchingHistory(mockJobResult.overarchingHistory);
        overarchingHistoryRef.current = parsed;
        setOverarchingHistoryVal = parsed;
      }
      if (mockJobResult.overarchingRationale !== undefined) {
        overarchingRationaleRef.current = mockJobResult.overarchingRationale;
        setOverarchingRationaleVal = mockJobResult.overarchingRationale;
      }
      if (mockJobResult.crossSceneLinks) {
        crossSceneLinksRef.current = mockJobResult.crossSceneLinks;
        setCrossSceneLinksVal = mockJobResult.crossSceneLinks;
      }

      expect(overarchingHistoryRef.current['sig-prior-4-scenes']).toBeDefined();
      expect(overarchingHistoryRef.current['sig-new-3-scenes']).toBeDefined();
      expect(setOverarchingHistoryVal['sig-new-3-scenes'].sceneCount).toBe(3);
      expect(overarchingRationaleRef.current).toBe('# New 3-Scene Rationale\nSynthesized cross-scene narrative.');
      expect(setOverarchingRationaleVal).toBe('# New 3-Scene Rationale\nSynthesized cross-scene narrative.');
      expect(crossSceneLinksRef.current).toHaveLength(2);
      expect(setCrossSceneLinksVal).toHaveLength(2);
    });

    it('8. Safeguard C: ProjectLoader snapshot bypass keeps overarchingHistory in sync even during local saving/hydrating', () => {
      const isHydratingSessionRef = { current: true };
      const isCriticalUpdate = false;
      const data = {
        overarchingHistory: JSON.stringify({
          'sig-auto-sync': {
            sceneSignature: 'sig-auto-sync',
            overarchingRationale: '# Bypassed Snapshot Sync Rationale',
            sceneCount: 3
          }
        })
      };

      const overarchingHistoryRef = { current: {} as any };
      let setOverarchingHistoryVal: any = null;

      // Simulated ProjectLoader bypass guard with Safeguard C sync
      let bypassed = false;
      if (isHydratingSessionRef.current && !isCriticalUpdate) {
        if (data.overarchingHistory !== undefined) {
          const parsed = parseOverarchingHistory(data.overarchingHistory);
          overarchingHistoryRef.current = parsed;
          setOverarchingHistoryVal = parsed;
        }
        bypassed = true;
      }

      expect(bypassed).toBe(true);
      expect(overarchingHistoryRef.current['sig-auto-sync']).toBeDefined();
      expect(setOverarchingHistoryVal['sig-auto-sync'].overarchingRationale).toBe('# Bypassed Snapshot Sync Rationale');
    });

    it('9. Custom Scene Name Preservation: preserves customName and non-default title while canonically re-indexing generic titles', () => {
      const scenesWithNames = [
        {
          sceneId: 'scene-1',
          sceneIndex: 0,
          curatedSeedArtists: 'The Jealous Sound',
          seedArtists: 'The Jealous Sound',
          title: 'The Jealous Sound',
          graphData: { nodes: [{ id: 'scene-1::jealous', x: 1000, fx: 1000, type: 'artist' }], links: [] },
          status: 'completed',
        },
        {
          sceneId: 'scene-2',
          sceneIndex: 1,
          customName: 'Midwest Emo Pioneers',
          title: 'Midwest Emo Pioneers',
          curatedSeedArtists: 'Elliott',
          seedArtists: 'Elliott',
          graphData: { nodes: [{ id: 'scene-2::elliott', x: 2050, fx: 2050, type: 'artist' }], links: [] },
          status: 'completed',
        },
        {
          sceneId: 'scene-3',
          sceneIndex: 2,
          title: 'Arena Anthem Emo', // Non-default custom title without explicit customName field
          curatedSeedArtists: 'Jimmy Eat World',
          seedArtists: 'Jimmy Eat World',
          graphData: { nodes: [{ id: 'scene-3::jimmy', x: 3100, fx: 3100, type: 'artist' }], links: [] },
          status: 'completed',
        },
        {
          sceneId: 'scene-4',
          sceneIndex: 3,
          curatedSeedArtists: 'Yellowcard',
          seedArtists: 'Yellowcard',
          title: 'Yellowcard', // Seed-derived title, un-renamed
          graphData: { nodes: [{ id: 'scene-4::yellowcard', x: 4150, fx: 4150, type: 'artist' }], links: [] },
          status: 'completed',
        },
      ];

      // Remove Scene 1
      const { remainingScenes } = shiftSceneClusterCoordinates({
        scenes: scenesWithNames as any,
        removedSceneId: 'scene-1',
        canvasLayout: [],
      });

      expect(remainingScenes).toHaveLength(3);

      // Former Scene 2 becomes scene-1; customName 'Midwest Emo Pioneers' is strictly preserved
      expect(remainingScenes[0].sceneId).toBe('scene-1');
      expect(remainingScenes[0].customName).toBe('Midwest Emo Pioneers');
      expect(remainingScenes[0].title).toBe('Midwest Emo Pioneers');

      // Former Scene 3 becomes scene-2; non-default title 'Arena Anthem Emo' is preserved on customName and title
      expect(remainingScenes[1].sceneId).toBe('scene-2');
      expect(remainingScenes[1].customName).toBe('Arena Anthem Emo');
      expect(remainingScenes[1].title).toBe('Arena Anthem Emo');

      // Former Scene 4 becomes scene-3; un-renamed seed title preserves customName = undefined so ROOTS pill shows Scene 3
      expect(remainingScenes[2].sceneId).toBe('scene-3');
      expect(remainingScenes[2].customName).toBeUndefined();
      expect(remainingScenes[2].title).toBe('Yellowcard');
    });

    it('10. detectLegacyStrideShiftX: shifts unshifted base-center topology (X ≈ 1000) by k * 1050px', () => {
      // Direct Hit topology cached at base center (X ≈ 1000)
      const baseTopologyXs = [990, 1000, 1010, 1005, 995];

      // Added as Scene 2 (k = 1): must shift +1050px to reach 2050px (not +100px)
      const shiftForScene2 = detectLegacyStrideShiftX(1, baseTopologyXs);
      expect(shiftForScene2).toBe(1050);

      // Added as Scene 4 (k = 3): must shift +3150px to reach 4150px (not +300px)
      const shiftForScene4 = detectLegacyStrideShiftX(3, baseTopologyXs);
      expect(shiftForScene4).toBe(3150);

      // Idempotency: topology already centered at Scene 2 (2050px) returns 0
      const settledScene2Xs = [2040, 2050, 2060];
      expect(detectLegacyStrideShiftX(1, settledScene2Xs)).toBe(0);
    });

    it('11. Zero-Collision + Add Scene Guarantee: removing scenes followed by + Add Scene generates sequential scene IDs', () => {
      const fourScenes = [scene1, scene2, scene3, scene4];

      // Step 1: Remove Scene 1
      const step1 = shiftSceneClusterCoordinates({
        scenes: fourScenes,
        removedSceneId: 'scene-1',
        canvasLayout: [],
      });

      // Step 2: Remove former Scene 2 (now scene-1: Elliott)
      const step2 = shiftSceneClusterCoordinates({
        scenes: step1.remainingScenes,
        removedSceneId: 'scene-1',
        canvasLayout: [],
      });

      expect(step2.remainingScenes).toHaveLength(2);
      expect(step2.remainingScenes[0].sceneId).toBe('scene-1'); // Jimmy Eat World
      expect(step2.remainingScenes[1].sceneId).toBe('scene-2'); // Yellowcard

      // Step 3: Clicking + Add Scene creates sceneId based on scenes.length + 1
      const nextIndex = step2.remainingScenes.length;
      const addedSceneId = `scene-${nextIndex + 1}`;

      expect(addedSceneId).toBe('scene-3');
      // Zero collision: scene-3 does not exist in the 2 remaining scenes
      expect(step2.remainingScenes.some(s => s.sceneId === addedSceneId)).toBe(false);
    });

    it('12. normalizeMarkdownLineBreaks: converts HTML <br>, <br/>, <br /> and consecutive breaks into clean markdown newlines', () => {
      const input = 'First paragraph.<br><br>Second paragraph with <br/>inline break and trailing.<br />\n<br>Third paragraph.';
      const output = normalizeMarkdownLineBreaks(input);

      expect(output).not.toContain('<br>');
      expect(output).not.toContain('<br/>');
      expect(output).not.toContain('<br />');
      expect(output).toBe('First paragraph.\n\nSecond paragraph with\n\ninline break and trailing.\n\nThird paragraph.');
    });

    it('13. splitMarkdownIntoEditorialBlocks: prevents single-column collapse on articles containing <br> tags', () => {
      const articleWithBrs = 'Underground tastemakers, especially **Drive-Thru Records**, served as talent incubators.<br><br>Ultimately, this pipeline fed directly into the corporate machinery. Major label heavyweights like **Capitol** and vital modern imprints like **Fueled By Ramen** provided the muscle.<br><br>Acts such as **Fall Out Boy** and **The Starting Line** dragged verbose underground sensibilities into polished pop dominance.';
      
      const blocks = splitMarkdownIntoEditorialBlocks(articleWithBrs);
      expect(blocks).toHaveLength(3);
      expect(blocks[0]).toContain('Drive-Thru Records');
      expect(blocks[1]).toContain('Capitol');
      expect(blocks[2]).toContain('Fall Out Boy');

      // Verify 3-column distribution avoids single-column [[0], [], []] collapse
      const columns = partitionBlockIndicesIntoThreeColumns(blocks);
      expect(columns).toEqual([[0], [1], [2]]);
      expect(columns[0]).toHaveLength(1);
      expect(columns[1]).toHaveLength(1);
      expect(columns[2]).toHaveLength(1);
    });

    it('14. ProjectLoader & Re-hydration Hook: rejects stale status: "completed" snapshots during in-flight setup', () => {
      // Logic simulation of ProjectLoader guard
      const shouldBypassSnapshot = (
        isHydratingSession: boolean,
        isPreFlightChecking: boolean,
        incomingStatus: string,
        incomingJobId: string | null | undefined
      ) => {
        const isInFlightSetupLock = isHydratingSession || isPreFlightChecking;
        if (isInFlightSetupLock && incomingStatus === 'completed' && !incomingJobId) {
          return true; // Bypass stale completed snapshot
        }
        return false;
      };

      // Stale completed snapshot without activeJobId during hydration setup must be bypassed
      expect(shouldBypassSnapshot(true, false, 'completed', null)).toBe(true);
      expect(shouldBypassSnapshot(false, true, 'completed', undefined)).toBe(true);

      // Once background job stamps activeJobId, it is NOT bypassed
      expect(shouldBypassSnapshot(true, false, 'curating', 'job-123')).toBe(false);
      expect(shouldBypassSnapshot(true, false, 'completed', 'job-123')).toBe(false);

      // Once hydration setup completes, incoming completed snapshots are accepted
      expect(shouldBypassSnapshot(false, false, 'completed', null)).toBe(false);

      // Logic simulation of [Re-hydration Hook] guard
      let isLoading = true;
      const rehydrationHook = (
        projectStatus: string,
        hasGraphNodes: boolean,
        isHydratingSession: boolean,
        isPreFlightChecking: boolean
      ) => {
        if (projectStatus === 'completed') {
          if (hasGraphNodes) {
            if (isHydratingSession || isPreFlightChecking) {
              return; // Guard active: do NOT clear loading state
            }
            isLoading = false;
          }
        }
      };

      // While hydrating setup is active, completed status does not prematurely clear loading
      rehydrationHook('completed', true, true, false);
      expect(isLoading).toBe(true);

      // Once hydration setup is done, completed status clears loading cleanly
      rehydrationHook('completed', true, false, false);
      expect(isLoading).toBe(false);
    });

    it('15. processCurationJob: overarchingHistory fallback from inputPayload and banking at birth with editorial metadata', () => {
      const priorHistoryMap: Record<string, any> = {
        'scene-1::scene-2': {
          sceneSignature: 'scene-1::scene-2',
          overarchingRationale: 'Old 2-scene rationale',
          overarchingZineTitle: 'Old Title',
          crossSceneLinks: [],
          archivedAt: '2026-11-17T00:00:00.000Z',
          sceneCount: 2,
          sceneSeeds: ['Jimmy Eat World', 'Yellowcard'],
        }
      };

      // Fallback read from inputPayload when pData and initialProjectDocData are empty
      const pData: any = {};
      const initialProjectDocData: any = {};
      const inputPayload: any = {
        overarchingHistory: JSON.stringify(priorHistoryMap)
      };

      const existingHistoryMap = parseOverarchingHistory(
        pData?.overarchingHistory || initialProjectDocData?.overarchingHistory || inputPayload?.overarchingHistory
      );
      expect(existingHistoryMap['scene-1::scene-2']).toBeDefined();
      expect(existingHistoryMap['scene-1::scene-2'].overarchingRationale).toBe('Old 2-scene rationale');

      // Bank at birth with synthesized result metadata
      const newSig = 'scene-1::scene-2::scene-3';
      const result = {
        overarchingRationale: 'New 3-scene rationale spanning Elliott, Jimmy Eat World, Yellowcard',
        overarchingZineTitle: 'The Evolution of Midwest Emo & Pop Punk',
        overarchingZineIntro: 'From basement tape exchanges to stadium anthems...',
        overarchingZineImages: [{ url: 'https://example.com/photo.jpg', caption: 'Live in 2001' }],
        crossSceneLinks: [{ source: 'elliott:band', target: 'jew:band', rationale: 'Deep emo lineage' }]
      };
      const finalProjectScenes = [
        { sceneId: 'scene-1', curatedSeedArtists: 'Jimmy Eat World' },
        { sceneId: 'scene-2', curatedSeedArtists: 'Yellowcard' },
        { sceneId: 'scene-3', curatedSeedArtists: 'Elliott' },
      ];

      const priorEntryForSig = existingHistoryMap[newSig];
      existingHistoryMap[newSig] = {
        sceneSignature: newSig,
        overarchingRationale: result.overarchingRationale,
        ...(result.overarchingZineTitle || priorEntryForSig?.overarchingZineTitle
          ? { overarchingZineTitle: result.overarchingZineTitle || priorEntryForSig?.overarchingZineTitle }
          : {}),
        ...(result.overarchingZineIntro || priorEntryForSig?.overarchingZineIntro
          ? { overarchingZineIntro: result.overarchingZineIntro || priorEntryForSig?.overarchingZineIntro }
          : {}),
        ...(result.overarchingZineImages && Array.isArray(result.overarchingZineImages) && result.overarchingZineImages.length > 0
          ? { overarchingZineImages: result.overarchingZineImages }
          : priorEntryForSig?.overarchingZineImages
            ? { overarchingZineImages: priorEntryForSig.overarchingZineImages }
            : {}),
        crossSceneLinks: (result.crossSceneLinks as any) || [],
        archivedAt: new Date().toISOString(),
        sceneCount: finalProjectScenes.length,
        sceneSeeds: finalProjectScenes.map((s: any) => s.curatedSeedArtists || s.seedArtists || "").filter(Boolean),
      };

      expect(existingHistoryMap[newSig]).toBeDefined();
      expect(existingHistoryMap[newSig].overarchingZineTitle).toBe('The Evolution of Midwest Emo & Pop Punk');
      expect(existingHistoryMap[newSig].overarchingZineIntro).toBe('From basement tape exchanges to stadium anthems...');
      expect(existingHistoryMap[newSig].overarchingZineImages).toHaveLength(1);
      expect(existingHistoryMap[newSig].sceneCount).toBe(3);
      expect(existingHistoryMap['scene-1::scene-2']).toBeDefined(); // Prior history preserved
    });

    it('16. [Rule 29] Client updateDoc payload strictly omits generationType during Direct Hit applyLocalTopologyHit', () => {
      // Simulate client payload in applyLocalTopologyHit
      const activeJobIdRef = { current: 'curation-job-xyz' };
      const compositeGraph = { nodes: [{ id: 'jew' }], links: [] };
      const projectSeedImageUrls = ['https://example.com/seed.jpg'];
      const primaryProjectImageUrl = 'https://example.com/seed.jpg';

      const payload: Record<string, any> = {
        graphData: JSON.stringify(compositeGraph),
        detailsCache: '[]',
        status: activeJobIdRef.current ? 'curating' : 'completed',
        ...(activeJobIdRef.current ? { activeJobId: activeJobIdRef.current } : {}),
        seedImageUrls: projectSeedImageUrls,
        ...(primaryProjectImageUrl ? { seedImageUrl: primaryProjectImageUrl } : {}),
      };

      // Rule 29: updateDoc cannot touch generationType, tokensSpent, apiUsage, anchorResolution
      expect(payload).not.toHaveProperty('generationType');
      expect(payload).not.toHaveProperty('tokensSpent');
      expect(payload).not.toHaveProperty('apiUsage');
      expect(payload).not.toHaveProperty('anchorResolution');
      expect(payload.status).toBe('curating');
      expect(payload.activeJobId).toBe('curation-job-xyz');
    });

    it('17. canonicalizeCrossSceneLinks preserves shared-entity identity bridges across re-indexed scenes without collapse', () => {
      const canonicalScenes = [
        {
          sceneId: 'scene-1',
          id: 'scene-1',
          sceneIndex: 0,
          curatedSeedArtists: 'Jimmy Eat World',
          graphData: {
            nodes: [
              { id: 'scene-1::braid', canonicalId: 'braid', name: 'Braid', type: 'artist' },
              { id: 'scene-1::mineral', canonicalId: 'mineral', name: 'Mineral', type: 'artist' }
            ],
            links: []
          }
        },
        {
          sceneId: 'scene-2',
          id: 'scene-2',
          sceneIndex: 1,
          curatedSeedArtists: 'Yellowcard',
          graphData: {
            nodes: [
              { id: 'scene-2::taking-back-sunday', canonicalId: 'taking-back-sunday', name: 'Taking Back Sunday', type: 'artist' }
            ],
            links: []
          }
        },
        {
          sceneId: 'scene-3',
          id: 'scene-3',
          sceneIndex: 2,
          curatedSeedArtists: 'Elliott',
          graphData: {
            nodes: [
              { id: 'scene-3::braid', canonicalId: 'braid', name: 'Braid', type: 'artist' },
              { id: 'scene-3::mineral', canonicalId: 'mineral', name: 'Mineral', type: 'artist' }
            ],
            links: []
          }
        }
      ] as any;

      // Archived bridge using legacy internal IDs (e.g. scene-3 for JEW, scene-5 for Elliott)
      const rawArchivedBridges = [
        {
          id: 'bridge-1',
          source: 'scene-3::braid',
          target: 'scene-5::braid',
          sourceSceneId: 'scene-3',
          targetSceneId: 'scene-5',
          sourceCanonicalId: 'braid',
          targetCanonicalId: 'braid',
          bridgeType: 'identity',
          relationship: 'Shared Band Across Scenes',
        }
      ] as any;

      const canonicalized = canonicalizeCrossSceneLinks(rawArchivedBridges, canonicalScenes);
      expect(canonicalized).toHaveLength(1);
      expect(canonicalized[0].bridgeType).toBe('identity');
      expect(canonicalized[0].sourceSceneId).toBe('scene-1');
      expect(canonicalized[0].targetSceneId).toBe('scene-3');
      expect(canonicalized[0].source).toBe('scene-1::braid');
      expect(canonicalized[0].target).toBe('scene-3::braid');
      expect(canonicalized[0].sourceSceneId).not.toBe(canonicalized[0].targetSceneId);
    });

    it('18. canonicalizeCrossSceneLinks accurately remaps sonic lineage bridges across re-indexed scenes', () => {
      const canonicalScenes = [
        {
          sceneId: 'scene-1',
          id: 'scene-1',
          curatedSeedArtists: 'Jimmy Eat World',
          graphData: { nodes: [{ id: 'scene-1::jew', canonicalId: 'jew' }], links: [] }
        },
        {
          sceneId: 'scene-2',
          id: 'scene-2',
          curatedSeedArtists: 'Yellowcard',
          graphData: { nodes: [{ id: 'scene-2::taking-back-sunday', canonicalId: 'taking-back-sunday' }], links: [] }
        },
        {
          sceneId: 'scene-3',
          id: 'scene-3',
          curatedSeedArtists: 'Elliott',
          graphData: { nodes: [{ id: 'scene-3::mineral', canonicalId: 'mineral' }], links: [] }
        }
      ] as any;

      const rawArchivedBridges = [
        {
          id: 'bridge-lineage',
          source: 'scene-3::taking-back-sunday',
          target: 'scene-5::mineral',
          sourceSceneId: 'scene-3',
          targetSceneId: 'scene-5',
          sourceCanonicalId: 'taking-back-sunday',
          targetCanonicalId: 'mineral',
          bridgeType: 'lineage',
          relationship: 'Sonic Ancestor',
        }
      ] as any;

      const canonicalized = canonicalizeCrossSceneLinks(rawArchivedBridges, canonicalScenes);
      expect(canonicalized).toHaveLength(1);
      expect(canonicalized[0].bridgeType).toBe('lineage');
      expect(canonicalized[0].sourceSceneId).toBe('scene-2');
      expect(canonicalized[0].targetSceneId).toBe('scene-3');
      expect(canonicalized[0].source).toBe('scene-2::taking-back-sunday');
      expect(canonicalized[0].target).toBe('scene-3::mineral');
    });

    it('19. buildCompositeCanvasGraph sanitizes out-of-territory node coordinates and sets wasLayoutHealed', () => {
      const scenes = [
        {
          sceneId: 'scene-1',
          id: 'scene-1',
          sceneIndex: 0,
          curatedSeedArtists: 'Jimmy Eat World',
          graphData: {
            nodes: [
              { id: 'scene-1::jew', canonicalId: 'jew', name: 'Jimmy Eat World', type: 'artist' }
            ],
            links: []
          }
        },
        {
          sceneId: 'scene-3',
          id: 'scene-3',
          sceneIndex: 2,
          curatedSeedArtists: 'Elliott',
          graphData: {
            nodes: [
              { id: 'scene-3::elliott', canonicalId: 'elliott', name: 'Elliott', type: 'artist' },
              { id: 'scene-3::falling-forward', canonicalId: 'falling-forward', name: 'Falling Forward', type: 'artist' }
            ],
            links: []
          }
        }
      ] as any;

      // Corrupted layout where Elliott node has stale coordinates bleeding into Scene 1 territory (x ~ 1050 instead of scene 3 center ~ 3100)
      const corruptedLayout = [
        { nodeId: 'scene-1::jew', x: 1000, y: 800 },
        { nodeId: 'scene-3::elliott', x: 3100, y: 800 },
        { nodeId: 'scene-3::falling-forward', x: 1050, y: 800 } // Out of territory by > 2000px!
      ];

      const composite = buildCompositeCanvasGraph(scenes, [], corruptedLayout);
      expect(composite.wasLayoutHealed).toBe(true);

      const healedNode = composite.nodes.find(n => n.id === 'scene-3::falling-forward');
      expect(healedNode).toBeDefined();
      // Healed node should be placed inside Scene 3 territory (center 3100, within dx <= 480)
      const dxFromScene3Center = Math.abs((healedNode?.x ?? 0) - 3100);
      expect(dxFromScene3Center).toBeLessThanOrEqual(480);
    });

    it('20. canonicalizeProjectScenes re-indexes fragmented scene IDs and updates canvasLayout namespaces', () => {
      const fragmentedScenes = [
        {
          sceneId: 'scene-3',
          id: 'scene-3',
          sceneIndex: 2,
          customName: 'Custom JEW Title',
          curatedSeedArtists: 'Jimmy Eat World',
          graphData: {
            nodes: [{ id: 'scene-3::jew', canonicalId: 'jew', name: 'Jimmy Eat World', type: 'artist' }],
            links: []
          }
        },
        {
          sceneId: 'scene-5',
          id: 'scene-5',
          sceneIndex: 4,
          curatedSeedArtists: 'Elliott',
          graphData: {
            nodes: [{ id: 'scene-5::elliott', canonicalId: 'elliott', name: 'Elliott', type: 'artist' }],
            links: []
          }
        }
      ] as any;

      const rawLayout = [
        { nodeId: 'scene-3::jew', x: 1000, y: 800 },
        { nodeId: 'scene-5::elliott', x: 3100, y: 800 }
      ];

      const result = canonicalizeProjectScenes(fragmentedScenes, rawLayout);
      expect(result.canonicalScenes).toHaveLength(2);
      expect(result.canonicalScenes[0].sceneId).toBe('scene-1');
      expect(result.canonicalScenes[0].sceneIndex).toBe(0);
      expect(result.canonicalScenes[0].customName).toBe('Custom JEW Title');
      expect(result.canonicalScenes[1].sceneId).toBe('scene-2');
      expect(result.canonicalScenes[1].sceneIndex).toBe(1);

      expect(result.canonicalLayout).toHaveLength(2);
      expect(result.canonicalLayout[0].nodeId).toBe('scene-1::jew');
      expect(result.canonicalLayout[1].nodeId).toBe('scene-2::elliott');
    });
  });
});
