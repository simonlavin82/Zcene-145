import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Dashboard from '../components/Dashboard';
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

  const renderDashboard = (projects: Project[]) => {
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
        isSmallScreen={false}
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
});
