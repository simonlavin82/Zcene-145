import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Dashboard from '../components/Dashboard';
import { ToolbarSearch } from '../components/DesignSystem';
import { Project } from '../types';

// Mock dependencies
vi.mock('../services/firebase', () => ({
  db: {},
  auth: {},
  functions: {},
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db, ...segments) => ({ path: segments.join('/') })),
  doc: vi.fn((_db, ...segments) => ({ path: segments.join('/') })),
  getDocs: vi.fn(),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  serverTimestamp: vi.fn(() => ({ _methodName: 'serverTimestamp' })),
  query: vi.fn((ref) => ref),
  orderBy: vi.fn(),
  limit: vi.fn(),
}));

const mockUser = { uid: 'user-123', email: 'test@zcene.online' } as any;

const createMockProject = (overrides: Partial<Project>): Project => ({
  id: 'proj-' + Math.random().toString(36).slice(2, 9),
  name: 'Default Project',
  seedArtists: 'Default Seed',
  activeNodes: [],
  status: 'completed',
  createdAt: 1700000000000,
  updatedAt: 1700000000000,
  ...overrides,
});

describe('Architecture V45: Dashboard Search Parity (Artist & Label Nodes, Multi-Scene Descriptors)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderDashboard = (projects: Project[], isSmallScreen = false) => {
    return render(
      <Dashboard
        user={mockUser}
        projects={projects}
        stack={[]}
        isStackNew={false}
        onSelectProject={vi.fn()}
        onCreateProject={vi.fn()}
        onDeleteProject={vi.fn()}
        onTrashProject={vi.fn()}
        onRestoreProject={vi.fn()}
        onPermanentDeleteProject={vi.fn()}
        onLogoClick={vi.fn()}
        onLogout={vi.fn()}
        onDeleteAccount={vi.fn()}
        isProfileOpen={false}
        setIsProfileOpen={vi.fn()}
        isDeleteAccountModalOpen={false}
        setIsDeleteAccountModalOpen={vi.fn()}
        isSmallScreen={isSmallScreen}
        onOpenStack={vi.fn()}
        onNavigate={vi.fn()}
        isMenuOpen={false}
        setIsMenuOpen={vi.fn()}
      />
    );
  };

  it('1. Matches Record Label nodes in single-scene projects (legacy graphData)', () => {
    const singleSceneProject = createMockProject({
      id: 'proj-single-label',
      name: 'Hardcore Project',
      seedArtists: 'Bane',
      graphData: JSON.stringify({
        nodes: [
          { id: 'bane-us', label: 'Bane', type: 'artist' },
          { id: 'equal-vision', label: 'Equal Vision Records', type: 'label' }
        ],
        links: []
      })
    });

    renderDashboard([singleSceneProject]);

    const searchInput = screen.getByPlaceholderText('Find in zcenes...');
    fireEvent.change(searchInput, { target: { value: 'equal vision' } });

    expect(screen.getByText('Hardcore Project')).toBeInTheDocument();
    expect(screen.queryByText(/No Zcenes found matching/i)).not.toBeInTheDocument();
  });

  it('2. Matches Record Label nodes in multi-scene projects (The Hope Conspiracy with Trustkill)', () => {
    const hopeConspiracyProject = createMockProject({
      id: 'xslHJWvjHPIqmnuwjSHa',
      name: 'The Hope Conspiracy',
      seedArtists: 'The Hope Conspiracy',
      scenes: [
        {
          sceneId: 'scene-1',
          sceneIndex: 0,
          title: 'The Hope Conspiracy',
          seedArtists: 'The Hope Conspiracy',
          seedIds: ['the-hope-conspiracy-us'],
          graphData: {
            nodes: [
              { id: 'scene-1::the-hope-conspiracy-us', canonicalId: 'the-hope-conspiracy-us', label: 'The Hope Conspiracy', type: 'artist' },
              { id: 'scene-1::converge-us', canonicalId: 'converge-us', label: 'Converge', type: 'artist' },
              { id: 'scene-1::trustkill', canonicalId: 'trustkill', label: 'Trustkill', type: 'label' }
            ],
            links: []
          },
          synthesisRationale: '',
          centerOffset: { x: 1000, y: 1000 },
          status: 'ready',
          updatedAt: Date.now()
        } as any
      ]
    });

    renderDashboard([hopeConspiracyProject]);

    const searchInput = screen.getByPlaceholderText('Find in zcenes...');
    fireEvent.change(searchInput, { target: { value: 'trust' } });

    expect(screen.getByText('The Hope Conspiracy')).toBeInTheDocument();
    expect(screen.queryByText(/No Zcenes found matching/i)).not.toBeInTheDocument();
  });

  it('3. Preserves Artist node search matching (Regression Guard for Converge)', () => {
    const hopeConspiracyProject = createMockProject({
      id: 'xslHJWvjHPIqmnuwjSHa',
      name: 'The Hope Conspiracy',
      seedArtists: 'The Hope Conspiracy',
      scenes: [
        {
          sceneId: 'scene-1',
          sceneIndex: 0,
          title: 'The Hope Conspiracy',
          seedArtists: 'The Hope Conspiracy',
          seedIds: ['the-hope-conspiracy-us'],
          graphData: {
            nodes: [
              { id: 'scene-1::the-hope-conspiracy-us', canonicalId: 'the-hope-conspiracy-us', label: 'The Hope Conspiracy', type: 'artist' },
              { id: 'scene-1::converge-us', canonicalId: 'converge-us', label: 'Converge', type: 'artist' },
              { id: 'scene-1::trustkill', canonicalId: 'trustkill', label: 'Trustkill', type: 'label' }
            ],
            links: []
          },
          synthesisRationale: '',
          centerOffset: { x: 1000, y: 1000 },
          status: 'ready',
          updatedAt: Date.now()
        } as any
      ]
    });

    renderDashboard([hopeConspiracyProject]);

    const searchInput = screen.getByPlaceholderText('Find in zcenes...');
    fireEvent.change(searchInput, { target: { value: 'converge' } });

    expect(screen.getByText('The Hope Conspiracy')).toBeInTheDocument();
    expect(screen.queryByText(/No Zcenes found matching/i)).not.toBeInTheDocument();
  });

  it('4. Matches custom scene names and multi-scene descriptors', () => {
    const multiSceneProject = createMockProject({
      id: 'proj-custom-scene',
      name: 'New England Hardcore',
      seedArtists: 'Have Heart',
      scenes: [
        {
          sceneId: 'scene-1',
          sceneIndex: 0,
          title: 'Bridge Nine Era',
          customName: 'Boston Straight Edge 90s',
          seedArtists: 'Have Heart',
          seedIds: ['have-heart-us'],
          graphData: {
            nodes: [
              { id: 'scene-1::have-heart-us', canonicalId: 'have-heart-us', label: 'Have Heart', type: 'artist' }
            ],
            links: []
          },
          synthesisRationale: '',
          centerOffset: { x: 1000, y: 1000 },
          status: 'ready',
          updatedAt: Date.now()
        } as any
      ]
    });

    renderDashboard([multiSceneProject]);

    const searchInput = screen.getByPlaceholderText('Find in zcenes...');
    // Querying customName substring
    fireEvent.change(searchInput, { target: { value: 'straight edge' } });
    expect(screen.getByText('New England Hardcore')).toBeInTheDocument();

    // Querying scene title substring
    fireEvent.change(searchInput, { target: { value: 'bridge nine' } });
    expect(screen.getByText('New England Hardcore')).toBeInTheDocument();
  });

  it('5. Matches decoupled / compacted projects via project.labelIds and project.artistIds', () => {
    const decoupledProject = createMockProject({
      id: 'proj-decoupled',
      name: 'Decoupled Archive',
      seedArtists: 'American Nightmare',
      graphData: null,
      scenes: null,
      artistIds: ['american-nightmare-us'],
      labelIds: ['deathwish-inc', 'bridge-nine-records']
    });

    renderDashboard([decoupledProject]);

    const searchInput = screen.getByPlaceholderText('Find in zcenes...');
    fireEvent.change(searchInput, { target: { value: 'deathwish' } });

    expect(screen.getByText('Decoupled Archive')).toBeInTheDocument();
    expect(screen.queryByText(/No Zcenes found matching/i)).not.toBeInTheDocument();
  });

  it('6. Does not falsely match non-entity nodes (e.g., genre nodes)', () => {
    const genreOnlyProject = createMockProject({
      id: 'proj-genre-only',
      name: 'Generic Sound',
      seedArtists: 'Unknown Band',
      graphData: JSON.stringify({
        nodes: [
          { id: 'genre-metalcore', label: 'Metalcore', type: 'genre' },
          { id: 'country-us', label: 'United States', type: 'country' }
        ],
        links: []
      })
    });

    renderDashboard([genreOnlyProject]);

    const searchInput = screen.getByPlaceholderText('Find in zcenes...');
    fireEvent.change(searchInput, { target: { value: 'metalcore' } });

    // Should NOT match as a node name because genre is not an entity node
    expect(screen.queryByText('Generic Sound')).not.toBeInTheDocument();
    expect(screen.getByText(/No Zcenes found matching/i)).toBeInTheDocument();
  });

  it('7. Handles case-insensitivity, whitespace trimming, and empty search restoration', () => {
    const project = createMockProject({
      id: 'proj-whitespace-test',
      name: 'Spaced Project',
      seedArtists: 'Spaced',
      graphData: JSON.stringify({
        nodes: [
          { id: 'spaced-us', label: 'Spaced', type: 'artist' },
          { id: 'new-morality-zine', label: 'New Morality Zine', type: 'label' }
        ],
        links: []
      })
    });

    renderDashboard([project]);

    const searchInput = screen.getByPlaceholderText('Find in zcenes...');

    // Uppercase with surrounding whitespace
    fireEvent.change(searchInput, { target: { value: '   NEW MORALITY   ' } });
    expect(screen.getByText('Spaced Project')).toBeInTheDocument();

    // Query non-matching string
    fireEvent.change(searchInput, { target: { value: 'nonexistent-string' } });
    expect(screen.queryByText('Spaced Project')).not.toBeInTheDocument();
    expect(screen.getByText(/No Zcenes found matching/i)).toBeInTheDocument();

    // Clear search returns project
    fireEvent.change(searchInput, { target: { value: '' } });
    expect(screen.getByText('Spaced Project')).toBeInTheDocument();
  });

  it('8. Desktop renders always-open inline Void search input (h-[38px], bg-zinc-950) and clears on Escape', () => {
    const project = createMockProject({ id: 'proj-inline', name: 'Mouthpiece', seedArtists: 'Mouthpiece' });
    renderDashboard([project], false);

    expect(screen.queryByTestId('dashboard-search-trigger')).not.toBeInTheDocument();
    const searchInput = screen.getByPlaceholderText('Find in zcenes...');
    expect(searchInput).toBeInTheDocument();
    expect(searchInput.className).toContain('bg-zinc-950');
    expect(searchInput.className).toContain('h-[38px]');
    expect(searchInput.className).toContain('pr-3');
    // Desktop inline container inherits ToolbarSearch optimum 256px cap (max-w-64) with flex shrink guardrails
    expect(searchInput.parentElement?.className).toContain('max-w-64');
    expect(searchInput.parentElement?.className).toContain('flex-1');
    expect(searchInput.parentElement?.className).toContain('min-w-0');
    expect(searchInput.parentElement?.className).not.toContain('max-w-md');
    expect(searchInput.parentElement?.className).not.toContain('max-w-sm');

    fireEvent.change(searchInput, { target: { value: 'zzzz-no-match' } });
    expect(searchInput.className).toContain('pr-10');
    expect(screen.getByText(/No Zcenes found matching/i)).toBeInTheDocument();

    fireEvent.keyDown(searchInput, { key: 'Escape' });
    expect((searchInput as HTMLInputElement).value).toBe('');
    expect(screen.getByText('Mouthpiece')).toBeInTheDocument();
  });

  it('9. Mobile collapses to icon trigger, synchronously focuses full-width takeover via flushSync, marks siblings inert, and preserves open state on blur when query is active', () => {
    const project = createMockProject({ id: 'proj-mobile', name: 'Mouthpiece', seedArtists: 'Mouthpiece' });
    renderDashboard([project], true);

    // Collapsed by default: single trigger, zero search inputs mounted
    const trigger = screen.getByTestId('dashboard-search-trigger');
    expect(trigger).toBeInTheDocument();
    expect(trigger.className).toContain('w-[38px]');
    expect(trigger.className).toContain('h-[38px]');
    expect(screen.queryByPlaceholderText('Find in zcenes...')).not.toBeInTheDocument();

    // Tap opens takeover synchronously and focuses input inside user gesture
    fireEvent.click(trigger);
    const overlay = screen.getByTestId('dashboard-search-overlay');
    expect(overlay.className).toContain('absolute');
    expect(overlay.className).toContain('inset-0');
    const searchInput = screen.getByPlaceholderText('Find in zcenes...');
    expect(document.activeElement).toBe(searchInput);

    // Sibling controls (ViewToggle group & toolbar + Create button) are marked inert while takeover is open
    const sortToggleWrapper = screen.getByRole('button', { name: 'Sort by Recent', hidden: true }).closest('[inert]');
    expect(sortToggleWrapper).not.toBeNull();
    const toolbarCreateBtn = screen.getByRole('button', { name: /^add\s*create$/i, hidden: true });
    expect(toolbarCreateBtn.parentElement?.hasAttribute('inert')).toBe(true);

    // Blur while empty collapses back to trigger
    fireEvent.blur(searchInput);
    expect(screen.queryByPlaceholderText('Find in zcenes...')).not.toBeInTheDocument();
    expect(screen.getByTestId('dashboard-search-trigger')).toBeInTheDocument();

    // Re-open, type query, blur -> MUST stay open so active filter is never invisible
    fireEvent.click(screen.getByTestId('dashboard-search-trigger'));
    const activeInput = screen.getByPlaceholderText('Find in zcenes...');
    fireEvent.change(activeInput, { target: { value: 'no-match-xyz' } });
    fireEvent.blur(activeInput);
    expect(screen.getByTestId('dashboard-search-overlay')).toBeInTheDocument();

    // Clicking empty-state "Clear Search" clears query AND closes mobile takeover
    const emptyClearBtn = screen.getByText('Clear Search').closest('button')!;
    fireEvent.click(emptyClearBtn);
    expect(screen.queryByTestId('dashboard-search-overlay')).not.toBeInTheDocument();
    expect(screen.getByTestId('dashboard-search-trigger')).toBeInTheDocument();
    expect(screen.getByText('Mouthpiece')).toBeInTheDocument();
  });

  it('10. Mobile clear/close X clears non-empty query keeping focus, closes when empty, and renders active dot when collapsed with query', () => {
    const project = createMockProject({ id: 'proj-x', name: 'Spaced', seedArtists: 'Spaced' });
    const { unmount } = renderDashboard([project], true);

    fireEvent.click(screen.getByTestId('dashboard-search-trigger'));
    const input = screen.getByPlaceholderText('Find in zcenes...');
    fireEvent.change(input, { target: { value: 'Spaced' } });

    // First X click clears text and keeps input open + focused
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect((input as HTMLInputElement).value).toBe('');
    expect(document.activeElement).toBe(input);
    expect(screen.getByTestId('dashboard-search-overlay')).toBeInTheDocument();

    // Second X click (when empty) closes the takeover
    fireEvent.click(screen.getByRole('button', { name: 'Close search' }));
    expect(screen.queryByTestId('dashboard-search-overlay')).not.toBeInTheDocument();
    unmount();

    // Collapsed ToolbarSearch with active query displays unmistakable bg-primary indicator dot
    render(
      <ToolbarSearch
        value="Fugazi"
        onChange={vi.fn()}
        placeholder="Find in zcenes..."
        isMobile={true}
        isMobileOpen={false}
        onMobileOpenChange={vi.fn()}
        size="control"
        triggerTestId="collapsed-active-trigger"
      />
    );
    const activeTrigger = screen.getByTestId('collapsed-active-trigger');
    expect(activeTrigger.className).toContain('border-primary/70');
    expect(activeTrigger.className).toContain('text-primary');
    expect(screen.getByTestId('toolbar-search-active-dot')).toBeInTheDocument();

    // Verify ToolbarSearch desktop width strategies: optimum (default 256px), full, and custom (cascade-safe)
    const { unmount: unmountWidths } = render(
      <>
        <ToolbarSearch value="" onChange={vi.fn()} placeholder="Optimum" isMobile={false} inputTestId="ts-width-optimum" />
        <ToolbarSearch value="" onChange={vi.fn()} placeholder="Full" isMobile={false} width="full" inputTestId="ts-width-full" />
        <ToolbarSearch value="" onChange={vi.fn()} placeholder="Custom" isMobile={false} width="custom" className="w-full max-w-48" inputTestId="ts-width-custom" />
      </>
    );
    expect(screen.getByTestId('ts-width-optimum').parentElement?.className).toContain('max-w-64');
    expect(screen.getByTestId('ts-width-full').parentElement?.className).toContain('w-full');
    expect(screen.getByTestId('ts-width-full').parentElement?.className).not.toContain('max-w-64');
    expect(screen.getByTestId('ts-width-custom').parentElement?.className).toContain('max-w-48');
    expect(screen.getByTestId('ts-width-custom').parentElement?.className).not.toContain('max-w-64');
    unmountWidths();
  });
});
