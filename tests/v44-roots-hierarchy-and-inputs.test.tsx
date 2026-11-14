import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';
import GraphPage from '../components/GraphPage';
import { InputSizes } from '../components/DesignSystem';
import { searchGlobalArtistSuggestions, clearPrefixSuggestionCache, getPrimaryGenreLabel } from '../services/artistCacheService';

const mockGetDocs = vi.fn();
const mockGetDoc = vi.fn();

vi.mock('firebase/firestore', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    collection: vi.fn((_db, ...segments) => ({ path: segments.join('/') })),
    doc: vi.fn((_db, ...segments) => ({ path: segments.join('/') })),
    getDocs: (...args: any[]) => mockGetDocs(...args),
    getDoc: (...args: any[]) => mockGetDoc(...args),
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

vi.mock('firebase/functions', () => ({
  getFunctions: vi.fn(),
  httpsCallable: vi.fn(),
}));

vi.mock('../services/firebaseConfig', () => ({
  functions: {},
  db: {},
  auth: {},
}));

describe('V44 ROOTS Panel Section Hierarchy & h-10 Input Standardization', () => {
  beforeEach(() => {
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

  const baseProps: any = {
    data: { nodes: [], links: [] },
    baseGraph: null,
    libraryArtists: [
      { name: 'Dashboard Confessional', playCount: 10, dateAdded: new Date() },
      { name: 'Rocking Horse Winner', playCount: 5, dateAdded: new Date() }
    ],
    seedArtists: 'Dashboard Confessional',
    onRegenerate: vi.fn(),
    isLoading: false,
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
        seedArtists: ['Dashboard Confessional'],
        graphData: { nodes: [], links: [] },
      }
    ],
    activeSceneId: 'scene-1',
    onSelectScene: vi.fn(),
    onAddScene: vi.fn(),
  };

  it('renders + Add Scene and Library buttons with exact h-7 Header Utility Button styling', () => {
    render(<GraphPage {...baseProps} />);

    // 1. + Add Scene button
    const addSceneBtn = screen.getByTestId('add-scene-button');
    expect(addSceneBtn).toBeInTheDocument();
    expect(addSceneBtn.className).toContain('h-7');
    expect(addSceneBtn.className).toContain('rounded-xl');
    expect(addSceneBtn.className).toContain('text-[11px]');
    expect(addSceneBtn.className).toContain('leading-none');

    // 2. Library button on the right of ARTISTS header row
    const libraryBtn = screen.getByTitle('Open Music Library');
    expect(libraryBtn).toBeInTheDocument();
    expect(libraryBtn.className).toContain('h-7');
    expect(libraryBtn.className).toContain('rounded-xl');
    expect(libraryBtn.className).toContain('text-[11px]');
    expect(libraryBtn.className).toContain('leading-none');
    expect(libraryBtn).toHaveTextContent('Library');
    expect(libraryBtn).toHaveTextContent('2'); // Badge count from libraryArtists.length
  });

  it('renders Import Library button with h-7 when libraryArtists is empty', () => {
    render(<GraphPage {...baseProps} libraryArtists={[]} />);

    const importBtn = screen.getByTitle('Import Music Library');
    expect(importBtn).toBeInTheDocument();
    expect(importBtn.className).toContain('h-7');
    expect(importBtn.className).toContain('rounded-xl');
    expect(importBtn.className).toContain('text-[11px]');
    expect(importBtn).toHaveTextContent('Import Library');
  });

  it('renders Add artist input and seed row button locked to h-10 (40px)', () => {
    render(<GraphPage {...baseProps} />);

    // 1. Add artist input
    const seedInput = screen.getByTestId('seed-input');
    expect(seedInput).toBeInTheDocument();
    expect(seedInput.className).toContain('h-10');
    expect(seedInput.className).toContain('rounded-xl');

    // 2. Curate + button inside Add artist
    const curateBtn = screen.getByTestId('curate-button');
    expect(curateBtn).toBeInTheDocument();
    expect(curateBtn.className).toContain('w-8');
    expect(curateBtn.className).toContain('h-8');
    expect(curateBtn.className).toContain('rounded-xl');

    // 3. Seed artist item button
    const seedRowBtn = screen.getByText('Dashboard Confessional').closest('button');
    expect(seedRowBtn).toBeInTheDocument();
    expect(seedRowBtn?.className).toContain('h-10');
    expect(seedRowBtn?.className).toContain('rounded-xl');
  });

  it('verifies InputSizes.md in DesignSystem.tsx includes h-10 in base, search, and magazineSearch', () => {
    expect(InputSizes.md.base).toContain('h-10');
    expect(InputSizes.md.search).toContain('h-10');
    expect(InputSizes.md.magazineSearch).toContain('h-10');
  });
});

describe('V44 Blended Library + Global /artists Autocomplete & Deduplication', () => {
  beforeEach(() => {
    clearPrefixSuggestionCache();
    mockGetDocs.mockReset();
    mockGetDocs.mockResolvedValue({ docs: [], size: 0, empty: true });
    mockGetDoc.mockReset();
  });

  const baseProps: any = {
    data: { nodes: [], links: [] },
    baseGraph: null,
    libraryArtists: [],
    seedArtists: 'Dashboard Confessional',
    onRegenerate: vi.fn(),
    isLoading: false,
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
        seedArtists: ['Dashboard Confessional'],
        graphData: { nodes: [], links: [] },
      }
    ],
    activeSceneId: 'scene-1',
    onSelectScene: vi.fn(),
    onAddScene: vi.fn(),
  };

  it('deduplicates case variants of artists in personal library (e.g. Vision of Disorder vs Vision Of Disorder)', async () => {
    const libraryWithDuplicateCases = [
      { name: 'Vision of Disorder', dateAdded: new Date() },
      { name: 'Vision Of Disorder', dateAdded: new Date() },
      { name: 'Eighteen Visions', dateAdded: new Date() },
    ];

    render(<GraphPage {...baseProps} libraryArtists={libraryWithDuplicateCases} />);

    const seedInput = screen.getByTestId('seed-input');
    fireEvent.change(seedInput, { target: { value: 'vis' } });

    await waitFor(() => {
      expect(screen.getByRole('listbox')).toBeInTheDocument();
    });

    // Check options rendered
    const options = screen.getAllByRole('option');
    const optionTexts = options.map(o => o.textContent);

    // Should only have exactly ONE Vision of Disorder row, plus Eighteen Visions
    const vodMatches = optionTexts.filter(t => t?.toLowerCase().includes('vision of disorder'));
    expect(vodMatches).toHaveLength(1);
    expect(optionTexts.some(t => t?.includes('Eighteen Visions'))).toBe(true);
  });

  it('searchGlobalArtistSuggestions deduplicates router stub 25hours + canonical doc 25hours-th into a single suggestion', async () => {
    const mockDocs = [
      {
        id: '25hours',
        data: () => ({
          _isStub: true,
          isAmbiguous: false,
          artistId: '25hours',
          redirectTo: '25hours-th',
          candidates: [
            {
              id: '25hours-th',
              name: '25hours',
              origin: 'Thailand',
              genre: 'Indie Pop',
              disambiguationSnippet: 'Thai indie rock band formed in Bangkok.',
            }
          ]
        })
      },
      {
        id: '25hours-th',
        data: () => ({
          cacheKey: '25hours-th',
          artistId: '25hours',
          seedArtists: '25hours',
          detailsCache: JSON.stringify({
            details: {
              artist: '25hours',
              origin: 'Thailand',
              genre: 'Indie Pop',
            }
          })
        })
      }
    ];

    mockGetDocs.mockResolvedValueOnce({
      docs: mockDocs,
      size: mockDocs.length,
      empty: false,
    });

    const suggestions = await searchGlobalArtistSuggestions('25');

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]).toMatchObject({
      id: '25hours-th',
      canonicalId: '25hours-th',
      name: '25hours',
      origin: 'Thailand',
      genre: 'INDIE POP',
      isStub: true,
      isAmbiguous: false,
    });
  });

  it('getPrimaryGenreLabel extracts uppercase primary genre before / or , and filters out unknowns', () => {
    expect(getPrimaryGenreLabel('Hardcore Punk / Metalcore')).toBe('HARDCORE PUNK');
    expect(getPrimaryGenreLabel('Post-Grunge, Alternative Rock')).toBe('POST-GRUNGE');
    expect(getPrimaryGenreLabel('Pop / Rock')).toBe('POP');
    expect(getPrimaryGenreLabel('Indie')).toBe('INDIE');
    expect(getPrimaryGenreLabel('Unknown')).toBeNull();
    expect(getPrimaryGenreLabel('Unknown Genre')).toBeNull();
    expect(getPrimaryGenreLabel('')).toBeNull();
    expect(getPrimaryGenreLabel(null)).toBeNull();
    expect(getPrimaryGenreLabel(undefined)).toBeNull();
  });

  it('searchGlobalArtistSuggestions deduplicates homonyms by normalized artist name into a single suggestion with primary genre (e.g. Paradox)', async () => {
    const mockDocs = [
      {
        id: 'paradox',
        data: () => ({
          _isStub: true,
          isAmbiguous: true,
          artistId: 'paradox',
          candidates: [
            {
              id: 'paradox-de',
              name: 'Paradox',
              origin: 'Germany',
              genre: 'Thrash Metal',
              disambiguationSnippet: 'Thrash metal band formed in Germany in 1986.',
            },
            {
              id: 'paradox-th',
              name: 'Paradox',
              origin: 'Thailand',
              genre: 'Indie Rock',
              disambiguationSnippet: 'Thai rock band formed in Bangkok in 1996.',
            }
          ]
        })
      },
      {
        id: 'paradox-de',
        data: () => ({
          cacheKey: 'paradox-de',
          artistId: 'paradox',
          detailsCache: JSON.stringify({
            details: {
              artist: 'Paradox',
              origin: 'Germany',
              genre: 'Thrash Metal',
            }
          })
        })
      }
    ];

    mockGetDocs.mockResolvedValueOnce({
      docs: mockDocs,
      size: mockDocs.length,
      empty: false,
    });

    const suggestions = await searchGlobalArtistSuggestions('para');

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].name).toBe('Paradox');
    expect(suggestions[0].genre).toBe('THRASH METAL');
    expect(suggestions[0].origin).toBe('Germany');
  });

  it('allows users with libraryArtists = [] to see Global Archive suggestions when typing into Add artist', async () => {
    const mockDocs = [
      {
        id: '25hours-th',
        data: () => ({
          cacheKey: '25hours-th',
          artistId: '25hours',
          seedArtists: '25hours',
          detailsCache: JSON.stringify({
            details: {
              artist: '25hours',
              origin: 'Thailand',
              genre: 'Indie Pop',
            }
          })
        })
      }
    ];

    mockGetDocs.mockResolvedValue({
      docs: mockDocs,
      size: mockDocs.length,
      empty: false,
    });

    render(<GraphPage {...baseProps} libraryArtists={[]} />);

    const seedInput = screen.getByTestId('seed-input');
    fireEvent.change(seedInput, { target: { value: '25' } });

    await waitFor(() => {
      expect(screen.getByRole('listbox')).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByText('Global Archive')).toBeInTheDocument();
      expect(screen.getByText('25hours')).toBeInTheDocument();
      expect(screen.getByText('INDIE POP')).toBeInTheDocument();
      expect(screen.queryByText('ARCHIVE')).not.toBeInTheDocument();
    });
  });
});
