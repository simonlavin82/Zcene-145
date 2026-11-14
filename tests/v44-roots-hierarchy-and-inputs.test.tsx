import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';
import GraphPage from '../components/GraphPage';
import { InputSizes } from '../components/DesignSystem';

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
