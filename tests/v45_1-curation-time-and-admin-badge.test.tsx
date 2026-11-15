import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ConsolidatedValidationModal, PreFlightSeed, TokenConfirmationDialog } from '../components/SharedModals';
import { LoadingSpinner } from '../components/Icons';
import GraphPage from '../components/GraphPage';
import { DetailsPanel } from '../components/DetailsPanel';
import { classifyCurationSpeed } from '../services/cacheQualification';
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

    it('classifies multi-scene overarching zine regeneration as "deep" (~3–5 minutes)', () => {
      const speed = classifyCurationSpeed({
        seedCount: 1,
        hasActiveFilters: false,
        routingDecision: 'TOPOLOGY_HIT',
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
});
