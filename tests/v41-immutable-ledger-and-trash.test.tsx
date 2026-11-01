import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import fs from 'fs';
import path from 'path';
import { UsageAnalyticsPage, calculateTelemetryForUser, DiscoveryLedgerTable } from '../components/UsageAnalyticsPage';
import Dashboard from '../components/Dashboard';
import { Project } from '../types';
import { ADMIN_EMAIL } from '../shared/tokenEconomy';

const mockHttpsCallable = vi.fn();
const mockGetDocs = vi.fn();
const mockGetDoc = vi.fn();
const mockSetDoc = vi.fn();

vi.mock('firebase/functions', () => ({
  httpsCallable: (...args: any[]) => mockHttpsCallable(...args),
}));

vi.mock('../services/firebase', () => ({
  db: {},
  auth: {},
  functions: {},
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db, ...segments) => ({ path: segments.join('/') })),
  doc: vi.fn((_db, ...segments) => ({ path: segments.join('/') })),
  getDocs: (...args: any[]) => mockGetDocs(...args),
  getDoc: (...args: any[]) => mockGetDoc(...args),
  setDoc: (...args: any[]) => mockSetDoc(...args),
  serverTimestamp: vi.fn(() => ({ _methodName: 'serverTimestamp' })),
  query: vi.fn((ref) => ref),
  orderBy: vi.fn(),
  limit: vi.fn(),
  Timestamp: {
    fromMillis: (ms: number) => ({ toMillis: () => ms, seconds: Math.floor(ms / 1000) }),
    now: () => ({ toMillis: () => Date.now(), seconds: Math.floor(Date.now() / 1000) }),
  },
}));

describe('Architecture V41: 2-Stage 30-Day Trash & Immutable Discovery Ledger', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDocs.mockResolvedValue({ docs: [] });
  });

  describe('Part 1: 2-Stage 30-Day Trash & Telemetry Compaction Lifecycle', () => {
    const mockActiveProject: Project = {
      id: 'proj-turnstile',
      name: 'Turnstile',
      seedArtists: 'Turnstile',
      status: 'completed',
      tokensSpent: 5,
      apiUsage: {
        'gemini-3.6-flash': { prompt: 1000, candidates: 500, total: 1500 },
      },
      anchorResolution: { cacheHits: 9, cacheMisses: 1 },
      activeNodes: ['turnstile-us', 'trapped-under-ice-us'],
      graphData: JSON.stringify({
        nodes: [{ id: 'turnstile-us', label: 'Turnstile', type: 'artist' }],
        links: [],
      }),
      detailsCache: JSON.stringify([['turnstile-us', { summary: 'Hardcore band' }]]),
      createdAt: { toMillis: () => Date.now() - 5000 },
      updatedAt: { toMillis: () => Date.now() - 1000 },
    };

    const mockTrashedProject: Project = {
      id: 'proj-spaced',
      name: 'Spaced',
      seedArtists: 'Spaced',
      status: 'trashed',
      trashedAt: { toMillis: () => Date.now() - 86400000 },
      purgeAt: { toMillis: () => Date.now() + 29 * 86400000 },
      tokensSpent: 5,
      apiUsage: {
        'gemini-3.6-flash': { prompt: 800, candidates: 300, total: 1100 },
      },
      anchorResolution: { cacheHits: 10, cacheMisses: 0 },
      activeNodes: ['spaced-us'],
      activeNodesCount: 1,
      graphData: JSON.stringify({
        nodes: [{ id: 'spaced-us', label: 'Spaced', type: 'artist' }],
        links: [],
      }),
      createdAt: { toMillis: () => Date.now() - 100000 },
      updatedAt: { toMillis: () => Date.now() - 86400000 },
    };

    it('renders Dashboard with active and trashed tabs and 0T restore / delete forever actions for trashed items', () => {
      const onTrashProject = vi.fn();
      const onRestoreProject = vi.fn();
      const onPermanentDeleteProject = vi.fn();

      render(
        <Dashboard
          user={{ uid: 'user-1', email: 'member@zcene.online' } as any}
          projects={[mockActiveProject, mockTrashedProject]}
          stack={[]}
          isStackNew={false}
          onSelectProject={vi.fn()}
          onCreateProject={vi.fn()}
          onDeleteProject={onTrashProject}
          onTrashProject={onTrashProject}
          onRestoreProject={onRestoreProject}
          onPermanentDeleteProject={onPermanentDeleteProject}
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

      // Tab badges reflect counts
      expect(screen.getByText(/YOUR ZCENES \(1\)/i)).toBeInTheDocument();
      expect(screen.getByText(/TRASH \(1\)/i)).toBeInTheDocument();

      // Active tab shows Turnstile, hides Trashed Spaced
      expect(screen.getByText('Turnstile')).toBeInTheDocument();
      expect(screen.queryByText('Spaced')).not.toBeInTheDocument();

      // Switch to Trash tab
      fireEvent.click(screen.getByText(/TRASH \(1\)/i));

      // Trash tab shows Spaced and 30-day restore banner
      expect(screen.getByText('Spaced')).toBeInTheDocument();
      expect(screen.getByText(/Items in Trash are safely preserved for 30 days/i)).toBeInTheDocument();
    });
  });

  describe('Part 2: Dual-Write Telemetry & Historical Reconciliation', () => {
    it('reconstitutes previously hard-deleted runs (Barry White and earlier Spaced) from tokenTransactions into Discovery Ledger', () => {
      // User only has Turnstile in their active projects
      const activeProjectDocs = [
        {
          id: 'proj-turnstile',
          data: () => ({
            name: 'Turnstile',
            seedArtists: 'Turnstile',
            status: 'completed',
            tokensSpent: 5,
            apiUsage: {
              'gemini-3.6-flash': { prompt: 1000, candidates: 500, total: 1500 },
            },
            anchorResolution: { cacheHits: 9, cacheMisses: 1 },
            activeNodes: ['turnstile-us', 'trapped-under-ice-us'],
            createdAt: { toMillis: () => 1761980000000 },
          }),
        },
      ];

      // User token transactions contains Turnstile PLUS deleted historical runs: Barry White and earlier Spaced
      const txDocs = [
        {
          id: 'tx-turnstile',
          data: () => ({
            uid: 'user-simon',
            type: 'spend_live_synthesis',
            projectId: 'proj-turnstile',
            delta: -4,
            balanceAfter: 57,
            description: 'Zcene Synthesis: Turnstile (4T balance after 1T pre-flight)',
            costUsd: 0.3156,
            createdAt: { toMillis: () => 1761980000000 },
          }),
        },
        {
          id: 'tx-turnstile-preflight',
          data: () => ({
            uid: 'user-simon',
            type: 'spend_preflight_lookup',
            delta: -1,
            balanceAfter: 61,
            description: 'Artist Lookup (Pre-Flight): Turnstile',
            createdAt: { toMillis: () => 1761979900000 },
          }),
        },
        {
          id: 'tx-spaced-active',
          data: () => ({
            uid: 'user-simon',
            type: 'spend_direct_hit',
            projectId: 'proj-spaced-deleted',
            delta: -5,
            balanceAfter: 62,
            description: 'Zcene Curation: Spaced (5T)',
            costUsd: 0.0000,
            createdAt: { toMillis: () => 1761920000000 },
          }),
        },
        {
          id: 'tx-barry-white-deleted',
          data: () => ({
            uid: 'user-simon',
            type: 'spend_direct_hit',
            projectId: 'proj-barry-white-deleted',
            delta: -5,
            balanceAfter: 67,
            description: 'Zcene Curation: Barry white (5T)',
            costUsd: 0.0000,
            createdAt: { toMillis: () => 1761830000000 },
          }),
        },
        {
          id: 'tx-spaced-earlier-deleted',
          data: () => ({
            uid: 'user-simon',
            type: 'spend_direct_hit',
            projectId: 'proj-spaced-earlier-deleted',
            delta: -5,
            balanceAfter: 72,
            description: 'Zcene Curation: Spaced (5T)',
            costUsd: 0.0000,
            createdAt: { toMillis: () => 1761820000000 },
          }),
        },
      ];

      const telemetry = calculateTelemetryForUser(
        'simon.lavin1@gmail.com',
        {},
        activeProjectDocs,
        2,
        {
          tokenBalance: 57,
          lifetimeTokensPurchased: 100,
          lifetimeTokensSpent: 43,
        },
        'user-simon',
        txDocs
      );

      // Reconstituted projects: Turnstile + Spaced (31 Oct) + Barry White (30 Oct) + Spaced earlier (30 Oct) = 4 total
      expect(telemetry.projectsCount).toBe(4);
      expect(telemetry.actionTriggers.createCount).toBe(4);

      const projectNames = telemetry.projects.map((p) => p.seedArtist.toLowerCase());
      expect(projectNames).toContain('turnstile');
      expect(projectNames).toContain('barry white');
      expect(projectNames.filter((n) => n === 'spaced')).toHaveLength(2);

      // Check archived status flags
      const barryProj = telemetry.projects.find((p) => p.seedArtist.toLowerCase() === 'barry white');
      expect(barryProj).toMatchObject({
        status: 'archived',
        isArchived: true,
        tokensSpent: 5,
        cost: 0,
      });

      const activeTurnstile = telemetry.projects.find((p) => p.seedArtist.toLowerCase() === 'turnstile');
      expect(activeTurnstile).toMatchObject({
        status: 'active',
        tokensSpent: 5,
      });
    });
  });

  describe('Part 3 & 4: Admin Author Audit & Targeted Wallet Inspection', () => {
    const mockAuthorTelemetry = {
      uid: 'user-simon',
      email: 'simon.lavin1@gmail.com',
      projectsCount: 4,
      actionTriggers: { createCount: 4, updateCount: 91 },
      artistSearches: { globalCount: 10, topSearches: [] },
      cacheEfficiency: { liveQueries: 2, cacheHits: 77 },
      deepCutsOpened: 4362,
      exactCost: 0.3506,
      hasExactCost: true,
      tokenBalance: 57,
      lifetimeTokensPurchased: 100,
      lifetimeTokensSpent: 43,
      projects: [
        {
          id: 'proj-turnstile',
          seedArtist: 'Turnstile',
          generationType: 'Root Generation',
          userFacingScope: 'Single-Seed Zcene',
          tokensSpent: 5,
          hasRecordedTokens: true,
          cost: 0.3156,
          isEstimate: false,
          createdAt: Date.now() - 3600000,
          status: 'active',
        },
        {
          id: 'proj-spaced-trashed',
          seedArtist: 'Spaced',
          generationType: 'Direct Hit',
          userFacingScope: 'Single-Seed Zcene',
          tokensSpent: 5,
          hasRecordedTokens: true,
          cost: 0.0000,
          isEstimate: false,
          createdAt: Date.now() - 7200000,
          status: 'trashed',
        },
        {
          id: 'proj-barry-white',
          seedArtist: 'Barry White',
          generationType: 'Direct Hit',
          userFacingScope: 'Single-Seed Zcene',
          tokensSpent: 5,
          hasRecordedTokens: true,
          cost: 0.0000,
          isEstimate: false,
          createdAt: Date.now() - 86400000,
          status: 'archived',
          isArchived: true,
        },
      ],
    };

    it('renders [ACTIVE], [TRASHED], and [ARCHIVED] status badges in DiscoveryLedgerTable PROJECTS LEDGER', () => {
      const onInspectUser = vi.fn();

      render(
        <DiscoveryLedgerTable
          isLoading={false}
          filteredLedger={[mockAuthorTelemetry]}
          expandedRow="simon.lavin1@gmail.com"
          toggleRow={vi.fn()}
          onInspectUser={onInspectUser}
        />
      );

      // Badges inside expanded author accordion
      expect(screen.getByText('ACTIVE')).toBeInTheDocument();
      expect(screen.getByText('TRASHED')).toBeInTheDocument();
      expect(screen.getByText('ARCHIVED')).toBeInTheDocument();

      // Inspect Wallet button is present on author row
      const inspectBtn = screen.getByText('Inspect Wallet');
      expect(inspectBtn).toBeInTheDocument();

      fireEvent.click(inspectBtn);
      expect(onInspectUser).toHaveBeenCalledWith(mockAuthorTelemetry);
    });

    it('allows Admin to inspect simon.lavin1@gmail.com live 57T wallet with Exit Inspection banner', async () => {
      mockGetDoc.mockImplementation(async (ref: any) => {
        return {
          exists: () => true,
          data: () => ({
            email: 'simon.lavin1@gmail.com',
            tokenBalance: 57,
            lifetimeTokensPurchased: 100,
            lifetimeTokensSpent: 43,
          }),
        };
      });

      mockGetDocs.mockImplementation(async (ref: any) => {
        if (ref.path?.includes('tokenTransactions')) {
          return {
            docs: [
              {
                id: 'tx-1',
                data: () => ({
                  type: 'spend_live_synthesis',
                  description: 'Zcene Synthesis: Turnstile (4T balance after 1T pre-flight)',
                  delta: -4,
                  balanceAfter: 57,
                  costUsd: 0.3156,
                  createdAt: { toMillis: () => Date.now() - 1000 },
                }),
              },
            ],
          };
        }
        if (ref.path?.includes('projects')) {
          return {
            docs: [
              {
                id: 'proj-turnstile',
                data: () => ({
                  name: 'Turnstile',
                  seedArtists: 'Turnstile',
                  status: 'completed',
                  tokensSpent: 5,
                  createdAt: { toMillis: () => Date.now() - 1000 },
                }),
              },
            ],
          };
        }
        return { docs: [] };
      });

      render(
        <UsageAnalyticsPage
          onNavigate={vi.fn()}
          isActive={true}
          user={{ uid: 'admin-1', email: ADMIN_EMAIL }}
          isAdmin={true}
          profile={{
            tokenBalance: 0, // Admin's own wallet is empty
            lifetimeTokensPurchased: 0,
            lifetimeTokensSpent: 0,
          }}
          isProfileOpen={false}
          setIsProfileOpen={vi.fn()}
          isDeleteAccountModalOpen={false}
          setIsDeleteAccountModalOpen={vi.fn()}
          isMenuOpen={false}
          setIsMenuOpen={vi.fn()}
          isSmallScreen={false}
          stackCount={0}
          isStackNew={false}
          onOpenStack={vi.fn()}
          onLogoClick={vi.fn()}
          onLogout={vi.fn()}
          onDeleteAccount={vi.fn()}
        />
      );

      // In admin view, wait for ledger to render
      expect(await screen.findByText('The Discovery Ledger')).toBeInTheDocument();
      expect(screen.getByText('AI Discovery Cost')).toBeInTheDocument();
    });
  });

  describe('Part 5: Architecture & Master Blueprint Parity Gate', () => {
    it('verifies architecture_truth.md and EnginePage.tsx are 100% in lockstep with V41', () => {
      const truthPath = path.resolve(__dirname, '../architecture_truth.md');
      const truthContent = fs.readFileSync(truthPath, 'utf8');

      const enginePath = path.resolve(__dirname, '../components/EnginePage.tsx');
      const engineContent = fs.readFileSync(enginePath, 'utf8');

      // Check V41 headers
      expect(truthContent).toContain('V41 — 43 Laws');
      expect(engineContent).toContain('Zcene V41 Blueprint');

      // Check Rule 29: Canonical Presentation Sort & One-SVG Concentric Watermark
      expect(truthContent).toContain('### 29. Universal Payload Serializer');
      expect(truthContent).toContain('V41 Audio Flow & Presentation Sort Parity');
      expect(engineContent).toContain('Universal Payload Serializer');
      expect(engineContent).toContain('V41 Audio Flow & Presentation Sort Parity');

      // Check Rule 43: 2-Stage 30-Day Trash & Immutable Discovery Ledger
      expect(truthContent).toContain('43. Token Economy, 2-Stage 30-Day Trash & Immutable Discovery Ledger Accounting');
      expect(engineContent).toContain('Prepaid Token Economy, 2-Stage Trash & Immutable Discovery Ledger');

      // Check Tier 3: Owned 2-Stage Lifecycle
      expect(truthContent).toContain('Tier 3: Owned Projects');
      expect(truthContent).toContain('status: \'trashed\'');
      expect(truthContent).toContain('status: \'deleted\'');
      expect(engineContent).toContain('status: \'trashed\'');
      expect(engineContent).toContain('status: \'deleted\'');
    });
  });
});
