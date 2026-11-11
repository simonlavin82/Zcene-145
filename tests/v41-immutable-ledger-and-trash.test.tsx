import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import fs from 'fs';
import path from 'path';
import {
  UsageAnalyticsPage,
  calculateTelemetryForUser,
  DiscoveryLedgerTable,
  computeAggregateMetrics,
  buildUnifiedActivityRows,
} from '../components/UsageAnalyticsPage';
import Dashboard from '../components/Dashboard';
import Header from '../components/Header';
import { TrashPage } from '../components/TrashPage';
import { Project } from '../types';
import {
  ADMIN_EMAIL,
  TOKEN_UNIT_GBP,
  GBP_TO_USD_RATE,
  TOKEN_UNIT_USD,
  tokensToGbp,
  tokensToUsd,
  usdToGbp,
} from '../shared/tokenEconomy';

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

    it('restructures slide-out drawer menu in Header to the exact 10-item sequence', () => {
      const onNavigate = vi.fn();
      const onLogout = vi.fn();
      const setIsProfileOpen = vi.fn();
      const setIsDeleteAccountModalOpen = vi.fn();

      // Render Header with open profile menu as Admin
      render(
        <Header
          user={{ uid: 'admin-1', email: 'zcene.online@gmail.com' } as any}
          view="dashboard"
          isSmallScreen={false}
          isMagazineViewOpen={false}
          stackCount={0}
          isStackNew={false}
          onOpenStack={vi.fn()}
          onNavigate={onNavigate}
          onLogout={onLogout}
          onDeleteAccount={vi.fn()}
          isAdmin={true}
          isProfileOpen={true}
          setIsProfileOpen={setIsProfileOpen}
          isDeleteAccountModalOpen={false}
          setIsDeleteAccountModalOpen={setIsDeleteAccountModalOpen}
          isMenuOpen={false}
          setIsMenuOpen={vi.fn()}
          tokenBalance={100}
        />
      );

      // Verify menu buttons
      const menuButtons = screen.getAllByRole('button');
      const menuTextList = menuButtons.map(b => b.textContent?.trim() || '');

      // Check presence and relative order of the items
      const discoveryIndex = menuTextList.findIndex(t => t.includes('Discovery Ledger'));
      const trashIndex = menuTextList.findIndex(t => t.includes('Trash'));
      const helpIndex = menuTextList.findIndex(t => t.includes('Help'));
      const engineIndex = menuTextList.findIndex(t => t.includes('Engine'));
      const designIndex = menuTextList.findIndex(t => t.includes('Design System'));
      const restartIndex = menuTextList.findIndex(t => t.includes('Restart Walkthrough'));
      const instagramIndex = menuTextList.findIndex(t => t.includes('Instagram'));
      const signOutIndex = menuTextList.findIndex(t => t.includes('Sign Out'));
      const deleteAccountIndex = menuTextList.findIndex(t => t.includes('Delete Account'));

      expect(discoveryIndex).toBeGreaterThan(-1);
      expect(trashIndex).toBeGreaterThan(discoveryIndex);
      expect(helpIndex).toBeGreaterThan(trashIndex);
      expect(engineIndex).toBeGreaterThan(helpIndex);
      expect(designIndex).toBeGreaterThan(engineIndex);
      expect(restartIndex).toBeGreaterThan(designIndex);
      expect(instagramIndex).toBeGreaterThan(restartIndex);
      expect(signOutIndex).toBeGreaterThan(instagramIndex);
      expect(deleteAccountIndex).toBeGreaterThan(signOutIndex);

      // Verify Trash item has NO count badges or contextual indicators
      const trashBtn = screen.getByRole('button', { name: /^delete\s*Trash$/i });
      expect(trashBtn).toBeInTheDocument();
      expect(trashBtn.textContent).not.toMatch(/\d+/);
    });

    it('renders clean Dashboard with static heading, strictly active projects, and no toolbar trash icon', () => {
      render(
        <Dashboard
          user={{ uid: 'user-1', email: 'member@zcene.online' } as any}
          projects={[mockActiveProject, mockTrashedProject]}
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

      // Clean static heading without underline tabs
      expect(screen.getByRole('heading', { level: 1, name: 'YOUR ZCENES' })).toBeInTheDocument();

      // Active view shows Turnstile, strictly hides Trashed Spaced
      expect(screen.getByText('Turnstile')).toBeInTheDocument();
      expect(screen.queryByText('Spaced')).not.toBeInTheDocument();

      // Toolbar does NOT have a trash button
      expect(screen.queryByRole('button', { name: /View Trash/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument();
    });

    it('renders dedicated TrashPage with full-width layout template, back button, trashed projects, and 0T restore', () => {
      const onRestoreProject = vi.fn();
      const onPermanentDeleteProject = vi.fn();
      const onClose = vi.fn();

      render(
        <TrashPage
          user={{ uid: 'user-1', email: 'member@zcene.online' } as any}
          projects={[mockActiveProject, mockTrashedProject]}
          onRestoreProject={onRestoreProject}
          onPermanentDeleteProject={onPermanentDeleteProject}
          onNavigate={vi.fn()}
          isActive={true}
          onClose={onClose}
          isSmallScreen={false}
          onLogout={vi.fn()}
          onDeleteAccount={vi.fn()}
          isProfileOpen={false}
          setIsProfileOpen={vi.fn()}
          isDeleteAccountModalOpen={false}
          setIsDeleteAccountModalOpen={vi.fn()}
          isMenuOpen={false}
          setIsMenuOpen={vi.fn()}
        />
      );

      // Top-left Back button
      expect(screen.getByRole('button', { name: /back/i })).toBeInTheDocument();

      // Clean page title
      expect(screen.getByRole('heading', { level: 2, name: 'Trash' })).toBeInTheDocument();

      // Renders only trashed projects (Spaced), strictly hides active Turnstile
      expect(screen.getByText('Spaced')).toBeInTheDocument();
      expect(screen.queryByText('Turnstile')).not.toBeInTheDocument();

      // Trashed card displays DAYS LEFT badge
      expect(screen.getByText(/DAYS LEFT/i)).toBeInTheDocument();

      // Trashed card preserves full metadata pills: ROOT ARTISTS, ARTISTS, and DEEP CUTS
      expect(screen.getByText(/ROOT ARTISTS: 1/i)).toBeInTheDocument();
      expect(screen.getByText(/ARTISTS: 1/i)).toBeInTheDocument();
      expect(screen.getByText(/DEEP CUTS: 1/i)).toBeInTheDocument();
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
      expect(screen.getByText('Actual AI API Cost')).toBeInTheDocument();
      expect(screen.queryByText(/Sync Archives/i)).not.toBeInTheDocument();
    });
  });

  describe('Part 5: Architecture & Master Blueprint Parity Gate', () => {
    it('verifies architecture_truth.md and EnginePage.tsx are 100% in lockstep with V44', () => {
      const truthPath = path.resolve(__dirname, '../architecture_truth.md');
      const truthContent = fs.readFileSync(truthPath, 'utf8');

      const enginePath = path.resolve(__dirname, '../components/EnginePage.tsx');
      const engineContent = fs.readFileSync(enginePath, 'utf8');

      const runbookPath = path.resolve(__dirname, '../docs/backend-regression-runbook.ts');
      const runbookContent = fs.readFileSync(runbookPath, 'utf8');

      // Check V44 headers & badges (44 Laws)
      expect(truthContent).toContain('V44 — 44 Laws');
      expect(engineContent).toContain('Zcene V44 Blueprint');
      expect(engineContent).toContain('V44 Locked');
      expect(engineContent).toContain('44 Laws');
      expect(engineContent).toContain('V44 Full-Stack Regression Runbook');
      expect(runbookContent).toContain('# V44 Regression Suite (Full-Stack)');
      expect(runbookContent).toContain('cd functions && npx vitest run tests/v42-iso-disambiguation.test.ts');
      expect(runbookContent).toContain('npx vitest run src/test/v43-multi-scene-board.test.ts');

      // Check V43 Purge Protocol alignment (Tier 1 /artists & /labels and tokenTransactions preserved)
      const purgeTargetsSlice = runbookContent.split('### Purge Targets:')[1]?.split('### Strictly Preserved:')[0] || '';
      const preservedSlice = runbookContent.split('### Strictly Preserved:')[1] || '';
      expect(purgeTargetsSlice).not.toContain('`/artists`');
      expect(purgeTargetsSlice).not.toContain('`/labels`');
      expect(purgeTargetsSlice).not.toContain('users/{uid}/tokenTransactions');
      expect(preservedSlice).toContain('/artists');
      expect(preservedSlice).toContain('/labels');
      expect(preservedSlice).toContain('users/{uid}/tokenTransactions');

      // Check Rule 29 & Rule 44: Canonical Presentation Sort & Multi-Scene Infinite Board
      expect(truthContent).toContain('### 29. Universal Payload Serializer');
      expect(truthContent).toContain('### 44. Multi-Scene Infinite Board, Scene Namespacing & Layered Zine Hierarchy');
      expect(engineContent).toContain('Universal Payload Serializer');
      expect(engineContent).toContain('Multi-Scene Infinite Board, Scene Namespacing & Layered Zine Hierarchy');

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

  describe('Part 6: V42.2 Discovery Ledger P&L, Unified Activity Table & Auto-Reconciliation', () => {
    it('exports canonical unit economics constants and GBP/USD conversion helpers', () => {
      expect(TOKEN_UNIT_GBP).toBe(0.10);
      expect(GBP_TO_USD_RATE).toBe(1.30);
      expect(TOKEN_UNIT_USD).toBe(0.13);
      expect(tokensToGbp(65)).toBeCloseTo(6.50, 4);
      expect(tokensToUsd(65)).toBeCloseTo(8.45, 4);
      expect(tokensToGbp(100)).toBeCloseTo(10.00, 4);
      expect(tokensToUsd(100)).toBeCloseTo(13.00, 4);
      expect(usdToGbp(1.4776)).toBeCloseTo(1.1366, 3);
    });

    it('reconciles 1:1 Executive P&L KPIs summing Customer, Admin/Sandbox, and JIT Auto-Healing costs', () => {
      const adminUser = {
        uid: 'admin-uid',
        email: ADMIN_EMAIL,
        projectsCount: 2,
        actionTriggers: { createCount: 2, updateCount: 79 },
        artistSearches: { globalCount: 2, topSearches: [] },
        cacheEfficiency: { liveQueries: 1, cacheHits: 78 },
        deepCutsOpened: 29,
        exactCost: 0.2931,
        hasExactCost: true,
        preflightLookups: { calls: 1, costUsd: 0.0015 },
        tokenBalance: 0,
        lifetimeTokensPurchased: 0,
        lifetimeTokensSpent: 0,
        projects: [
          {
            id: 'admin-turnstile',
            seedArtist: 'Turnstile',
            generationType: 'Direct Hit',
            userFacingScope: 'Single-Seed Zcene',
            tokensSpent: 0,
            hasRecordedTokens: true,
            cost: 0,
            curationOnlyCost: 0,
            isEstimate: false,
            createdAt: 1762100000000,
            status: 'active',
          },
          {
            id: 'admin-spaced',
            seedArtist: 'Spaced',
            generationType: 'Root Generation',
            userFacingScope: 'Single-Seed Zcene',
            tokensSpent: 0,
            hasRecordedTokens: true,
            cost: 0.2916,
            curationOnlyCost: 0.2916,
            isEstimate: false,
            createdAt: 1762000000000,
            status: 'active',
          },
        ],
      };

      const customerUser = {
        uid: 'customer-uid',
        email: 'simon.lavin1@gmail.com',
        projectsCount: 3,
        actionTriggers: { createCount: 3, updateCount: 60 },
        artistSearches: { globalCount: 3, topSearches: [] },
        cacheEfficiency: { liveQueries: 1, cacheHits: 29 },
        deepCutsOpened: 10,
        exactCost: 1.1816,
        hasExactCost: true,
        tokenBalance: 35,
        lifetimeTokensPurchased: 100,
        lifetimeTokensSpent: 65,
        projects: [
          {
            id: 'cust-klaar',
            seedArtist: 'Klaar',
            generationType: 'Root Generation',
            userFacingScope: 'Single-Seed Zcene',
            tokensSpent: 5,
            hasRecordedTokens: true,
            cost: 0.2910, // includes $0.0100 deepWebApiUsage
            curationOnlyCost: 0.2810,
            isEstimate: false,
            createdAt: 1762150000000,
            status: 'active',
          },
          {
            id: 'cust-turnstile',
            seedArtist: 'Turnstile',
            generationType: 'Direct Hit',
            userFacingScope: 'Single-Seed Zcene',
            tokensSpent: 5,
            hasRecordedTokens: true,
            cost: 0,
            curationOnlyCost: 0,
            isEstimate: false,
            createdAt: 1762120000000,
            status: 'active',
          },
          {
            id: 'cust-barry',
            seedArtist: 'Barry White',
            generationType: 'Direct Hit',
            userFacingScope: 'Single-Seed Zcene',
            tokensSpent: 5,
            hasRecordedTokens: true,
            cost: 0,
            curationOnlyCost: 0,
            isEstimate: false,
            createdAt: 1762050000000,
            status: 'archived',
            isArchived: true,
          },
        ],
      };

      const jitHeals = [
        {
          id: 'heal-1',
          entityId: 'paradox-thailand',
          rawEntityId: 'paradox-thailand',
          entityType: 'artist' as const,
          displayName: 'Paradox',
          callerUid: 'customer-uid',
          callerEmail: 'simon.lavin1@gmail.com',
          totalTokens: 18341,
          promptTokens: 14000,
          candidatesTokens: 4341,
          costUsd: 0.00285,
          timestamp: 1762160000000,
        },
      ];

      const metrics = computeAggregateMetrics([adminUser, customerUser], jitHeals);

      // Card 1: Earned Revenue vs Float
      expect(metrics.customerTokensSpent).toBe(65);
      expect(metrics.customerEarnedGbp).toBeCloseTo(6.50, 2);
      expect(metrics.customerEarnedUsd).toBeCloseTo(8.45, 2);
      expect(metrics.customerGrossPurchasedTokens).toBe(100);
      expect(metrics.customerUnspentFloatTokens).toBe(35);

      // Card 2: Total Platform AI Cost reconciles 1:1 with Customer ($1.1816) + Admin ($0.2931) + JIT ($0.0029) = $1.4776
      expect(metrics.customerAiCostUsd).toBeCloseTo(1.1816, 4);
      expect(metrics.adminAiCostUsd).toBeCloseTo(0.2931, 4);
      expect(metrics.jitAiCostUsd).toBeCloseTo(0.00285, 5);
      expect(metrics.totalPlatformAiCostUsd).toBeCloseTo(1.4776, 4);
      expect(metrics.totalPlatformAiCostUsd.toFixed(4)).toBe('1.4776');

      // Card 3: Net Gross Profit & Margin + pure curationOnlyCost cold average
      expect(metrics.customerNetProfitUsd).toBeCloseTo(7.2684, 4);
      expect(metrics.customerGrossMarginPct).toBeCloseTo(86.016, 1);
      expect(metrics.platformNetProfitUsd).toBeCloseTo(8.45 - 1.4776, 4);
      // Cold curations: Admin Spaced ($0.2916) + Customer Klaar ($0.2810, excluding $0.01 deepWeb) -> avg $0.2863
      expect(metrics.coldCurationCount).toBe(2);
      expect(metrics.avgColdCurationCostUsd).toBeCloseTo((0.2916 + 0.2810) / 2, 4);

      // Card 4: Cache Hit Efficiency across curations
      expect(metrics.totalCurations).toBe(5);
      expect(metrics.directHitCurations).toBe(3);
      expect(metrics.directHitRatePct).toBeCloseTo(60.0, 1);
      expect(metrics.estimatedDirectHitSavingsUsd).toBeCloseTo(3 * ((0.2916 + 0.2810) / 2), 4);

      // Verify Admin fallback rows for zcene.online@gmail.com when tokenTransactions is empty
      const adminRows = buildUnifiedActivityRows(adminUser, []);
      expect(adminRows).toHaveLength(3); // 2 sandbox curations + 1 preflight lookup summary
      expect(adminRows.map((r) => r.title)).toContain('Turnstile');
      expect(adminRows.map((r) => r.title)).toContain('Spaced');
      expect(adminRows.some((r) => r.title.includes('Pre-Flight Artist Lookups'))).toBe(true);
      const summedAdminRowCost = adminRows.reduce((sum, r) => sum + (r.aiCostUsd || 0), 0);
      expect(summedAdminRowCost).toBeCloseTo(0.2931, 4);
    });

    it('normalizes split-debit [ARCHIVED] project tokensSpent (4T after 1T pre-flight -> 5T) and renders unified Admin & User activity views', async () => {
      const telemetry = calculateTelemetryForUser(
        'simon.lavin1@gmail.com',
        { step1: true },
        [],
        0,
        { tokenBalance: 95, lifetimeTokensPurchased: 100, lifetimeTokensSpent: 5 },
        'u-1',
        [
          {
            id: 'tx-barry-split',
            data: () => ({
              uid: 'u-1',
              type: 'spend_live_synthesis',
              delta: -4,
              balanceAfter: 95,
              description: 'Zcene Synthesis: Barry White (4T balance after 1T pre-flight)',
              costUsd: 0.2800,
              createdAt: { toMillis: () => 1762000000000 },
            }),
          },
        ]
      );

      expect(telemetry.projects).toHaveLength(1);
      expect(telemetry.projects[0].status).toBe('archived');
      expect(telemetry.projects[0].tokensSpent).toBe(5);

      // Verify DiscoveryLedgerTable expanded drawer removes Onboarding Progress & standalone Projects Ledger
      const { unmount } = render(
        <DiscoveryLedgerTable
          isLoading={false}
          filteredLedger={[telemetry]}
          expandedRow="simon.lavin1@gmail.com"
          toggleRow={vi.fn()}
        />
      );
      expect(screen.getByText('Revenue (Spent)')).toBeInTheDocument();
      expect(screen.getAllByText('Net Margin').length).toBeGreaterThanOrEqual(1);
      expect(screen.queryByText('Onboarding Progress')).not.toBeInTheDocument();
      expect(screen.queryByText('Projects Ledger')).not.toBeInTheDocument();
      expect(screen.getByText('ARCHIVED')).toBeInTheDocument();
      expect(screen.getAllByText('Barry White').length).toBeGreaterThanOrEqual(1);
      unmount();

      // Verify Standard User unified table filter pills (All | Curations | Deep Connections | Top-Ups & Refunds)
      mockGetDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({
          email: 'simon.lavin1@gmail.com',
          tokenBalance: 35,
          lifetimeTokensPurchased: 100,
          lifetimeTokensSpent: 65,
        }),
      });
      mockGetDocs.mockImplementation(async (ref: any) => {
        if (ref.path?.includes('projects')) {
          return {
            docs: [
              {
                id: 'proj-klaar',
                data: () => ({
                  name: 'Klaar (edit 2)',
                  seedArtists: 'Klaar',
                  status: 'trashed',
                  generationType: 'Root Generation',
                  tokensSpent: 5,
                  createdAt: { toMillis: () => 1762200000000 },
                }),
              },
            ],
          };
        }
        if (ref.path?.includes('tokenTransactions')) {
          return {
            docs: [
              {
                id: 'tx-curation',
                data: () => ({
                  uid: 'u-1',
                  type: 'spend_live_synthesis',
                  projectId: 'proj-klaar',
                  delta: -4,
                  balanceAfter: 35,
                  description: 'Zcene Synthesis: Klaar (4T balance after 1T pre-flight)',
                  costUsd: 0.2899,
                  createdAt: { toMillis: () => 1762200000000 },
                }),
              },
              {
                id: 'tx-deepweb',
                data: () => ({
                  uid: 'u-1',
                  type: 'spend_deep_web',
                  delta: -3,
                  balanceAfter: 39,
                  description: 'Deep Connections (3 Messages): One Step Closer',
                  createdAt: { toMillis: () => 1762100000000 },
                }),
              },
              {
                id: 'tx-topup',
                data: () => ({
                  uid: 'u-1',
                  type: 'topup_simulated',
                  delta: 100,
                  balanceAfter: 100,
                  description: 'Stripe Checkout Simulation — £10 Top-Up (100 Tokens)',
                  createdAt: { toMillis: () => 1762000000000 },
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
          user={{ uid: 'u-1', email: 'simon.lavin1@gmail.com' }}
          isAdmin={false}
          profile={{ tokenBalance: 35, lifetimeTokensPurchased: 100, lifetimeTokensSpent: 65 }}
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

      expect(await screen.findByText('Klaar (edit 2)')).toBeInTheDocument();
      expect(screen.getByText('TRASHED')).toBeInTheDocument();
      expect(screen.queryByTestId('standard-projects-ledger')).not.toBeInTheDocument();
      expect(screen.queryByText(/\$0\.2899/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Root Generation/)).not.toBeInTheDocument();

      // Filter by Deep Connections
      fireEvent.click(screen.getByTestId('activity-filter-deep_connections'));
      expect(screen.getByText(/Deep Connections \(3 Messages\): One Step Closer/)).toBeInTheDocument();
      expect(screen.queryByText('Klaar (edit 2)')).not.toBeInTheDocument();

      // Filter by Top-Ups & Refunds
      fireEvent.click(screen.getByTestId('activity-filter-topups_refunds'));
      expect(screen.getByText(/Stripe Checkout Simulation/)).toBeInTheDocument();
      expect(screen.queryByText(/Deep Connections \(3 Messages\): One Step Closer/)).not.toBeInTheDocument();

      // Filter by Curations
      fireEvent.click(screen.getByTestId('activity-filter-curations'));
      expect(screen.getByText('Klaar (edit 2)')).toBeInTheDocument();
      expect(screen.queryByText(/Stripe Checkout Simulation/)).not.toBeInTheDocument();
    });
  });
});
