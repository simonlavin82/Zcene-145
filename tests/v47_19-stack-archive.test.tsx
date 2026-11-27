import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import fs from 'fs';
import path from 'path';
import {
  UsageAnalyticsPage,
  DiscoveryLedgerTable,
  partitionStackItems,
  filterAndSortArchivedStack,
  ACTIVITY_PAGE_SIZE,
  ARCHIVE_PAGE_SIZE,
  ADMIN_LOG_PAGE_SIZE,
} from '../components/UsageAnalyticsPage';
import { MyStackDialog, SimulatedStripeModal } from '../components/SharedModals';
import Header from '../components/Header';
import { StackItem } from '../types';
import { ADMIN_EMAIL, ADMIN_UID } from '../shared/tokenEconomy';

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
  where: vi.fn(),
  Timestamp: {
    fromMillis: (ms: number) => ({ toMillis: () => ms, seconds: Math.floor(ms / 1000) }),
    now: () => ({ toMillis: () => Date.now(), seconds: Math.floor(Date.now() / 1000) }),
  },
}));

const makeBaseAnalyticsProps = (overrides: Record<string, any> = {}) => ({
  onNavigate: vi.fn(),
  isActive: true,
  user: { uid: 'u-member-1', email: 'member@zcene.online' },
  isAdmin: false,
  onLogoClick: vi.fn(),
  stackCount: 2,
  isStackNew: false,
  onOpenStack: vi.fn(),
  onLogout: vi.fn(),
  onDeleteAccount: vi.fn(),
  isProfileOpen: false,
  setIsProfileOpen: vi.fn(),
  isDeleteAccountModalOpen: false,
  setIsDeleteAccountModalOpen: vi.fn(),
  isMenuOpen: false,
  setIsMenuOpen: vi.fn(),
  profile: {
    tokenBalance: 69,
    lifetimeTokensPurchased: 500,
    lifetimeTokensSpent: 441,
  },
  ...overrides,
});

const sampleArchivedStack: StackItem[] = [
  {
    id: 'buggin-us',
    docId: 'buggin-us_projA',
    displayName: 'Buggin',
    type: 'artist',
    dateSaved: 1762000000000,
    archivedAt: 1762500000000,
    status: 'archived',
    discoveredVia: 'Spaced',
    link: 'https://bandcamp.com/search?q=Buggin', // Legacy doc backward compatibility
  },
  {
    id: 'stereolab-gb',
    docId: 'stereolab-gb_projB',
    displayName: 'Stereolab',
    type: 'artist',
    dateSaved: 1761500000000,
    archivedAt: 1762900000000,
    status: 'archived',
    discoveredVia: 'Spare Snare + Mogwai',
  },
  {
    id: 'dischord-records',
    docId: 'dischord-records_projC',
    displayName: 'Dischord Records',
    type: 'label',
    dateSaved: 1761000000000,
    archivedAt: 1762100000000,
    status: 'archived',
    discoveredVia: 'Fugazi',
  },
];

describe('V47.19 Stack Archive, Two-Tab Discovery Ledger & Legacy Link Housekeeping', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({
        email: 'member@zcene.online',
        tokenBalance: 69,
        lifetimeTokensPurchased: 500,
        lifetimeTokensSpent: 441,
      }),
    });
    mockGetDocs.mockResolvedValue({ docs: [] });
  });

  it('1. partitions legacy stack docs (missing status) as active and archived docs separately, sorting archived newest-archived-first', () => {
    const mixed: StackItem[] = [
      { id: 'exhibition-us', docId: 'exhibition-us_p1', displayName: 'Exhibition', type: 'artist', dateSaved: 1762000000000 }, // legacy no status
      { id: 'lung-leg-gb', docId: 'lung-leg-gb_p2', displayName: 'Lung Leg', type: 'artist', dateSaved: 1762100000000, status: 'active' },
      ...sampleArchivedStack,
    ];

    const { active, archived } = partitionStackItems(mixed);
    expect(active.map(i => i.id)).toEqual(['exhibition-us', 'lung-leg-gb']);
    expect(archived).toHaveLength(3);

    const sorted = filterAndSortArchivedStack(archived, '');
    expect(sorted.map(i => i.displayName)).toEqual(['Stereolab', 'Buggin', 'Dischord Records']);

    const byVia = filterAndSortArchivedStack(archived, 'spare snare');
    expect(byVia.map(i => i.displayName)).toEqual(['Stereolab']);

    const byArtist = filterAndSortArchivedStack(archived, 'buggin');
    expect(byArtist.map(i => i.displayName)).toEqual(['Buggin']);
  });

  it('2. MyStackDialog renders neutral archive button (Move to Stack Archive) instead of red delete icon and preserves provenance', () => {
    const onRemove = vi.fn();
    render(
      <MyStackDialog
        isOpen={true}
        onClose={vi.fn()}
        stack={[
          {
            id: 'buggin-us',
            docId: 'buggin-us_projA',
            displayName: 'Buggin',
            type: 'artist',
            dateSaved: 1762000000000,
            discoveredVia: 'Spaced',
          },
        ]}
        onRemove={onRemove}
        onView={vi.fn()}
        onAddArtist={vi.fn()}
        seedArtists={[]}
      />
    );

    expect(screen.getByText('My Stack (1)')).toBeInTheDocument();
    expect(screen.getByText('Buggin')).toBeInTheDocument();
    expect(screen.getByText(/via Spaced/)).toBeInTheDocument();

    const archiveBtn = screen.getByTitle('Move to Stack Archive');
    expect(archiveBtn).toHaveTextContent('archive');
    expect(archiveBtn.className).not.toContain('text-red-400');

    fireEvent.click(archiveBtn);
    expect(onRemove).toHaveBeenCalledWith('buggin-us_projA');
  });

  it('3. switches between Token Activity (default) and Stack Archive tabs with clean labels (no tab count badge) and preserves activity filter pills', async () => {
    render(
      <UsageAnalyticsPage
        {...makeBaseAnalyticsProps({
          archivedStack: sampleArchivedStack,
        })}
      />
    );

    expect(await screen.findByTestId('token-transactions-ledger')).toBeInTheDocument();
    expect(screen.getByTestId('ledger-tab-activity')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('ledger-tab-stack-archive')).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByTestId('ledger-tab-stack-archive')).toHaveTextContent('Stack Archive');
    expect(screen.queryByTestId('stack-archive-tab-count')).not.toBeInTheDocument();
    expect(screen.getByTestId('activity-filter-all')).toBeInTheDocument();
    expect(screen.queryByTestId('stack-archive-ledger')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('ledger-tab-stack-archive'));

    expect(screen.getByTestId('stack-archive-ledger')).toBeInTheDocument();
    expect(screen.getByTestId('ledger-tab-stack-archive')).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByTestId('token-transactions-ledger')).not.toBeInTheDocument();
    expect(screen.getByTestId('stack-archive-desktop-table')).toBeInTheDocument();
    expect(screen.getByText('Stereolab')).toBeInTheDocument();
    expect(screen.getByText('Buggin')).toBeInTheDocument();
    expect(screen.getByText('Dischord Records')).toBeInTheDocument();
    expect(screen.getByText('Spare Snare + Mogwai')).toBeInTheDocument();
  });

  it('4. filters Stack Archive instantaneously via ToolbarSearch by displayName and discoveredVia on desktop, with empty/clear states', async () => {
    render(
      <UsageAnalyticsPage
        {...makeBaseAnalyticsProps({
          archivedStack: sampleArchivedStack,
          isSmallScreen: false,
        })}
      />
    );

    await screen.findByTestId('token-transactions-ledger');
    fireEvent.click(screen.getByTestId('ledger-tab-stack-archive'));

    const searchInput = screen.getByTestId('archive-search-input');
    expect(searchInput).toHaveAttribute('placeholder', 'Find in archive...');
    expect(searchInput.parentElement?.className).toContain('max-w-64');
    expect(searchInput.parentElement?.className).toContain('flex-1');
    expect(searchInput.parentElement?.className).toContain('min-w-0');
    expect(searchInput.parentElement?.className).not.toContain('md:w-72');

    fireEvent.change(searchInput, { target: { value: 'Spaced' } });
    expect(screen.getByText('Buggin')).toBeInTheDocument();
    expect(screen.queryByText('Stereolab')).not.toBeInTheDocument();

    fireEvent.change(searchInput, { target: { value: 'nonexistent-band' } });
    expect(screen.getByTestId('stack-archive-no-matches')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('archive-clear-search-btn'));
    expect(screen.getByText('Stereolab')).toBeInTheDocument();
    expect(screen.getByText('Buggin')).toBeInTheDocument();
  });

  it('5. renders single-branch mobile cards at < 768px (isSmallScreen=true) with ToolbarSearch takeover and zero duplicate desktop table nodes', async () => {
    render(
      <UsageAnalyticsPage
        {...makeBaseAnalyticsProps({
          archivedStack: sampleArchivedStack,
          isSmallScreen: true,
        })}
      />
    );

    await screen.findByTestId('token-transactions-ledger');
    fireEvent.click(screen.getByTestId('ledger-tab-stack-archive'));

    // Single-branch render: mobile card list present, desktop table NOT mounted
    expect(screen.getByTestId('stack-archive-mobile-list')).toBeInTheDocument();
    expect(screen.queryByTestId('stack-archive-desktop-table')).not.toBeInTheDocument();
    expect(screen.getAllByText('Buggin')).toHaveLength(1);

    // Collapsed ToolbarSearch trigger opens in-place overlay
    const trigger = screen.getByTestId('archive-search-trigger');
    fireEvent.click(trigger);

    expect(screen.getByTestId('archive-search-overlay')).toBeInTheDocument();
    const mobileInput = screen.getByTestId('archive-search-input');
    fireEvent.change(mobileInput, { target: { value: 'Fugazi' } });
    expect(screen.getByText('Dischord Records')).toBeInTheDocument();
    expect(screen.queryByText('Buggin')).not.toBeInTheDocument();
  });

  it('6. invokes Restore to Stack and guards Permanent Delete behind confirmation modal (Cancel aborts, Delete Forever executes)', async () => {
    const onRestoreStackItem = vi.fn().mockResolvedValue(undefined);
    const onPermanentDeleteStackItem = vi.fn().mockResolvedValue(undefined);

    render(
      <UsageAnalyticsPage
        {...makeBaseAnalyticsProps({
          archivedStack: sampleArchivedStack,
          onRestoreStackItem,
          onPermanentDeleteStackItem,
        })}
      />
    );

    await screen.findByTestId('token-transactions-ledger');
    fireEvent.click(screen.getByTestId('ledger-tab-stack-archive'));

    // Restore
    fireEvent.click(screen.getByTestId('archive-restore-buggin-us_projA'));
    await waitFor(() => {
      expect(onRestoreStackItem).toHaveBeenCalledWith('buggin-us_projA');
    });

    // Permanent delete guardrail: Cancel aborts
    fireEvent.click(screen.getByTestId('archive-delete-stereolab-gb_projB'));
    expect(screen.getByTestId('stack-archive-delete-modal')).toBeInTheDocument();
    expect(screen.getByText(/Permanently Delete Discovery\?/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByTestId('stack-archive-delete-modal')).not.toBeInTheDocument();
    expect(onPermanentDeleteStackItem).not.toHaveBeenCalled();

    // Permanent delete confirm
    fireEvent.click(screen.getByTestId('archive-delete-stereolab-gb_projB'));
    fireEvent.click(screen.getByTestId('stack-archive-confirm-delete-btn'));

    await waitFor(() => {
      expect(onPermanentDeleteStackItem).toHaveBeenCalledWith('stereolab-gb_projB');
    });
    await waitFor(() => {
      expect(screen.queryByTestId('stack-archive-delete-modal')).not.toBeInTheDocument();
    });
  });

  it('7. paginates Token Activity at 10 rows and Stack Archive at 20 rows with incremental Show more expansion', async () => {
    expect(ACTIVITY_PAGE_SIZE).toBe(10);
    expect(ARCHIVE_PAGE_SIZE).toBe(20);

    const manyTxs = Array.from({ length: ACTIVITY_PAGE_SIZE + 14 }, (_, idx) => ({
      id: `tx_${idx}`,
      data: () => ({
        uid: 'u-member-1',
        type: 'spend_preflight',
        delta: -1,
        balanceAfter: 100 - idx,
        description: `Pre-Flight Artist Lookup: Band ${idx + 1}`,
        createdAt: { toMillis: () => 1763000000000 - idx * 1000 },
      }),
    }));

    mockGetDocs.mockImplementation(async (ref: any) => {
      if (ref?.path?.endsWith('tokenTransactions')) return { docs: manyTxs };
      return { docs: [] };
    });

    const manyArchived: StackItem[] = Array.from({ length: ARCHIVE_PAGE_SIZE + 8 }, (_, idx) => ({
      id: `band-${idx}`,
      docId: `band-${idx}_proj`,
      displayName: `Archived Band ${idx + 1}`,
      type: 'artist',
      dateSaved: 1762000000000 - idx * 1000,
      archivedAt: 1763000000000 - idx * 1000,
      status: 'archived',
      discoveredVia: 'Spaced',
    }));

    render(
      <UsageAnalyticsPage
        {...makeBaseAnalyticsProps({
          archivedStack: manyArchived,
        })}
      />
    );

    expect(await screen.findByText('Pre-Flight Artist Lookup: Band 1')).toBeInTheDocument();
    expect(screen.queryByText(`Pre-Flight Artist Lookup: Band ${ACTIVITY_PAGE_SIZE + 1}`)).not.toBeInTheDocument();
    expect(screen.getByTestId('activity-show-more-btn')).toHaveTextContent('Show more (14 remaining)');

    // First Show more expands 10 -> 20
    fireEvent.click(screen.getByTestId('activity-show-more-btn'));
    expect(screen.getByText(`Pre-Flight Artist Lookup: Band ${ACTIVITY_PAGE_SIZE * 2}`)).toBeInTheDocument();
    expect(screen.queryByText(`Pre-Flight Artist Lookup: Band ${ACTIVITY_PAGE_SIZE * 2 + 1}`)).not.toBeInTheDocument();
    expect(screen.getByTestId('activity-show-more-btn')).toHaveTextContent('Show more (4 remaining)');

    // Second Show more expands 20 -> 24 and clears button
    fireEvent.click(screen.getByTestId('activity-show-more-btn'));
    expect(screen.getByText(`Pre-Flight Artist Lookup: Band ${ACTIVITY_PAGE_SIZE + 14}`)).toBeInTheDocument();
    expect(screen.queryByTestId('activity-show-more-btn')).not.toBeInTheDocument();

    // Switch to Stack Archive (20 rows initial -> +8 remaining)
    fireEvent.click(screen.getByTestId('ledger-tab-stack-archive'));
    expect(screen.getByText('Archived Band 1')).toBeInTheDocument();
    expect(screen.queryByText(`Archived Band ${ARCHIVE_PAGE_SIZE + 1}`)).not.toBeInTheDocument();
    expect(screen.getByTestId('archive-show-more-btn')).toHaveTextContent('Show more (8 remaining)');

    fireEvent.click(screen.getByTestId('archive-show-more-btn'));
    expect(screen.getByText(`Archived Band ${ARCHIVE_PAGE_SIZE + 8}`)).toBeInTheDocument();
    expect(screen.queryByTestId('archive-show-more-btn')).not.toBeInTheDocument();
  });

  it('8. Admin Control Room displays live own-row Stack counts with 0 reads, lazy-fetches other author Stack on expand (cached), and shows Read-Only Stack Archive in Inspect Wallet without Admin bleed', async () => {
    const customerUid = 'uid-customer-1';
    const customerEmail = 'simon.lavin1@gmail.com';
    let customerStackReads = 0;

    mockGetDoc.mockImplementation(async (ref: any) => {
      if (ref?.path === 'adminLedger/system') {
        return { exists: () => true, data: () => ({ jitEnabled: true }) };
      }
      if (ref?.path === `users/${customerUid}`) {
        return {
          exists: () => true,
          data: () => ({
            email: customerEmail,
            tokenBalance: 69,
            lifetimeTokensPurchased: 500,
            lifetimeTokensSpent: 441,
          }),
        };
      }
      return { exists: () => false, data: () => ({}) };
    });

    mockGetDocs.mockImplementation(async (ref: any) => {
      if (ref?.path === 'users') {
        return {
          docs: [
            {
              id: ADMIN_UID,
              data: () => ({
                email: ADMIN_EMAIL,
                tokenBalance: 0,
                lifetimeTokensPurchased: 0,
                lifetimeTokensSpent: 0,
              }),
            },
            {
              id: customerUid,
              data: () => ({
                email: customerEmail,
                tokenBalance: 69,
                lifetimeTokensPurchased: 500,
                lifetimeTokensSpent: 441,
              }),
            },
          ],
        };
      }
      if (ref?.path === `users/${customerUid}/stack`) {
        customerStackReads += 1;
        return {
          docs: [
            {
              id: 'customer-active-1',
              data: () => ({
                id: 'turnstile-us',
                displayName: 'Turnstile',
                type: 'artist',
                dateSaved: 1762000000000,
                discoveredVia: 'Trapped Under Ice',
              }),
            },
            {
              id: 'customer-archived-1',
              data: () => ({
                id: 'fiddlehead-us',
                displayName: 'Fiddlehead',
                type: 'artist',
                dateSaved: 1761000000000,
                archivedAt: 1762800000000,
                status: 'archived',
                discoveredVia: 'Have Heart',
              }),
            },
          ],
        };
      }
      return { docs: [] };
    });

    const adminOwnArchived: StackItem[] = [
      {
        id: 'admin-secret-band',
        docId: 'admin-secret-band_p1',
        displayName: 'Admin Private Band',
        type: 'artist',
        dateSaved: 1761000000000,
        archivedAt: 1762900000000,
        status: 'archived',
        discoveredVia: 'Admin Sandbox',
      },
    ];

    render(
      <UsageAnalyticsPage
        {...makeBaseAnalyticsProps({
          user: { uid: ADMIN_UID, email: ADMIN_EMAIL },
          isAdmin: true,
          stackCount: 4,
          archivedStack: adminOwnArchived,
        })}
      />
    );

    // Wait for Admin table to load — zero stack reads should have happened on initial load
    expect(await screen.findByText(customerEmail)).toBeInTheDocument();
    expect(customerStackReads).toBe(0);

    // Expand Admin's own row: renders live props (4 active · 1 archived) with 0 Firestore reads
    fireEvent.click(screen.getByText(ADMIN_EMAIL));
    expect(screen.getByTestId(`author-stack-counts-${ADMIN_UID}`)).toHaveTextContent('4 active · 1 archived');
    expect(customerStackReads).toBe(0);

    // Expand customer row: triggers lazy single fetch (1 active · 1 archived)
    fireEvent.click(screen.getByText(customerEmail));
    await waitFor(() => {
      expect(screen.getByTestId(`author-stack-counts-${customerUid}`)).toHaveTextContent('1 active · 1 archived');
    });
    expect(customerStackReads).toBe(1);

    // Click Inspect Wallet on customer: performs fresh stack read (total reads = 2; initial Admin load remained 0)
    const inspectButtons = screen.getAllByRole('button', { name: /Inspect Wallet/i });
    fireEvent.click(inspectButtons[1]);

    expect(await screen.findByTestId('ledger-tab-stack-archive')).toBeInTheDocument();
    await waitFor(() => {
      expect(customerStackReads).toBe(2);
    });
    expect(screen.queryByTestId('stack-archive-tab-count')).not.toBeInTheDocument();

    // Switch to Stack Archive in Read-Only Admin Preview
    fireEvent.click(screen.getByTestId('ledger-tab-stack-archive'));
    expect(screen.getByTestId('stack-archive-readonly-badge')).toHaveTextContent('Read-Only Inspection');
    expect(screen.getByText('Fiddlehead')).toBeInTheDocument();
    expect(screen.getByText('Have Heart')).toBeInTheDocument();
    // Zero Admin stack bleed and zero mutation controls
    expect(screen.queryByText('Admin Private Band')).not.toBeInTheDocument();
    expect(screen.queryByTestId('archive-restore-customer-archived-1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('archive-delete-customer-archived-1')).not.toBeInTheDocument();
  });

  it('9. DesignSystem DiscoveryLedgerTable renders cleanly when getAuthorStackCounts is omitted (zero Firestore stack reads on mock rows)', () => {
    render(
      <DiscoveryLedgerTable
        isLoading={false}
        expandedRow="curator.alpha@zcene.online"
        toggleRow={vi.fn()}
        filteredLedger={[
          {
            email: 'curator.alpha@zcene.online',
            projectsCount: 3,
            actionTriggers: { createCount: 3, updateCount: 12 },
            artistSearches: { globalCount: 6, topSearches: [] },
            cacheEfficiency: { liveQueries: 3, cacheHits: 9 },
            deepCutsOpened: 8,
            exactCost: 0.42,
            hasExactCost: true,
            tokenBalance: 40,
            lifetimeTokensPurchased: 100,
            lifetimeTokensSpent: 60,
            projects: [],
          },
        ]}
      />
    );

    expect(screen.getByText('curator.alpha@zcene.online')).toBeInTheDocument();
    expect(screen.queryByText('My Stack:')).not.toBeInTheDocument();
    expect(mockGetDocs).not.toHaveBeenCalled();
  });

  it('10. locks firestore.rules Admin read-only stack visibility + optional field guards and removes legacy link writes while preserving Deep Cuts Bandcamp links', () => {
    const rulesSrc = fs.readFileSync(path.resolve(__dirname, '../firestore.rules'), 'utf-8');
    const appSrc = fs.readFileSync(path.resolve(__dirname, '../App.tsx'), 'utf-8');
    const detailsSrc = fs.readFileSync(path.resolve(__dirname, '../components/DetailsPanel.tsx'), 'utf-8');

    const validStackBlock = rulesSrc.slice(
      rulesSrc.indexOf('function isValidStackItem(data)'),
      rulesSrc.indexOf('function isValidSession(data)')
    );
    expect(validStackBlock).toContain("(!('link' in data) || data.link is string)");
    expect(validStackBlock).toContain("(!('displayName' in data) || data.displayName == null || data.displayName is string)");
    expect(validStackBlock).toContain("(!('docId' in data) || data.docId is string)");
    expect(validStackBlock).toContain("(!('status' in data) || data.status in ['active', 'archived'])");
    expect(validStackBlock).toContain("(!('archivedAt' in data) || data.archivedAt == null || data.archivedAt is number || data.archivedAt is timestamp)");

    const stackMatchBlock = rulesSrc.slice(
      rulesSrc.indexOf('match /stack/{itemId}'),
      rulesSrc.indexOf('match /userSession/{sessionId}')
    );
    expect(stackMatchBlock).toContain('allow get: if isOwner(userId) || isAdmin();');
    expect(stackMatchBlock).toContain('allow list: if isOwner(userId) || isAdmin();');
    expect(stackMatchBlock).toContain('allow create: if isOwner(userId) &&');
    expect(stackMatchBlock).toContain('allow update: if isOwner(userId) &&');
    expect(stackMatchBlock).toContain('allow delete: if isOwner(userId) || isAdmin();');

    // Legacy link writes removed from My Stack
    const addToStackSlice = appSrc.slice(
      appSrc.indexOf('const handleAddToStack ='),
      appSrc.indexOf('const handleArchiveStackItem =')
    );
    expect(addToStackSlice).not.toContain('link:');
    expect(addToStackSlice).toContain("status: 'active'");
    expect(addToStackSlice).toContain('stripSceneNamespace(node.canonicalId || node.id)');

    // Deep Cuts Bandcamp links remain completely intact
    expect(detailsSrc).toContain('https://bandcamp.com/search?q=');
    expect(detailsSrc).not.toContain('onAddToStack(node, links.purchase');
  });

  it('11. refreshes Stack counts on row re-expand & Inspect Wallet, clears authorStackCache on auth switch, and discards stale in-flight stack resolutions', async () => {
    const customerUid = 'uid-simon-live';
    const customerEmail = 'simon.lavin1@gmail.com';
    let stackPhase: 'initial' | 'updated' = 'initial';
    let holdFirstSlowResolve: ((val: any) => void) | null = null;
    let shouldHoldNextStackFetch = false;

    const initialStackDocs = Array.from({ length: 6 }, (_, idx) => ({
      id: `active_${idx}`,
      data: () => ({
        id: `artist-${idx}`,
        displayName: `Artist ${idx}`,
        type: 'artist',
        dateSaved: 1762000000000 + idx,
        discoveredVia: 'Spaced',
      }),
    }));

    const updatedStackDocs = [
      ...Array.from({ length: 3 }, (_, idx) => ({
        id: `active_${idx}`,
        data: () => ({
          id: `artist-${idx}`,
          displayName: `Artist ${idx}`,
          type: 'artist',
          dateSaved: 1762000000000 + idx,
          discoveredVia: 'Spaced',
        }),
      })),
      {
        id: 'arch_1',
        data: () => ({
          id: 'buggin-us',
          displayName: 'Buggin',
          type: 'artist',
          dateSaved: 1762000000000,
          archivedAt: 1762900000000,
          status: 'archived',
          discoveredVia: 'Spaced',
        }),
      },
      {
        id: 'arch_2',
        data: () => ({
          id: 'exhibition-us',
          displayName: 'Exhibition',
          type: 'artist',
          dateSaved: 1762000000001,
          archivedAt: 1762950000000,
          status: 'archived',
          discoveredVia: 'Spaced',
        }),
      },
    ];

    mockGetDoc.mockImplementation(async (ref: any) => {
      if (ref?.path === 'adminLedger/system') {
        return { exists: () => true, data: () => ({ jitEnabled: true }) };
      }
      if (ref?.path === `users/${customerUid}`) {
        return {
          exists: () => true,
          data: () => ({
            email: customerEmail,
            tokenBalance: 69,
            lifetimeTokensPurchased: 500,
            lifetimeTokensSpent: 441,
          }),
        };
      }
      return { exists: () => false, data: () => ({}) };
    });

    mockGetDocs.mockImplementation(async (ref: any) => {
      if (ref?.path === 'users') {
        return {
          docs: [
            {
              id: ADMIN_UID,
              data: () => ({ email: ADMIN_EMAIL, tokenBalance: 0, lifetimeTokensPurchased: 0, lifetimeTokensSpent: 0 }),
            },
            {
              id: customerUid,
              data: () => ({ email: customerEmail, tokenBalance: 69, lifetimeTokensPurchased: 500, lifetimeTokensSpent: 441 }),
            },
          ],
        };
      }
      if (ref?.path === `users/${customerUid}/stack`) {
        if (shouldHoldNextStackFetch) {
          shouldHoldNextStackFetch = false;
          return new Promise((resolve) => {
            holdFirstSlowResolve = resolve;
          });
        }
        return { docs: stackPhase === 'initial' ? initialStackDocs : updatedStackDocs };
      }
      return { docs: [] };
    });

    const adminProps = makeBaseAnalyticsProps({
      user: { uid: ADMIN_UID, email: ADMIN_EMAIL },
      isAdmin: true,
      stackCount: 0,
      archivedStack: [],
    });

    const { rerender } = render(<UsageAnalyticsPage {...adminProps} />);

    // 1. Expand customer row initially -> 6 active · 0 archived
    expect(await screen.findByText(customerEmail)).toBeInTheDocument();
    fireEvent.click(screen.getByText(customerEmail));
    await waitFor(() => {
      expect(screen.getByTestId(`author-stack-counts-${customerUid}`)).toHaveTextContent('6 active · 0 archived');
    });

    // 2. Customer mutates stack out-of-band (3 active · 2 archived); collapse & re-expand fetches fresh counts
    stackPhase = 'updated';
    fireEvent.click(screen.getByText(customerEmail)); // collapse
    fireEvent.click(screen.getByText(customerEmail)); // re-expand (forceRefresh)
    await waitFor(() => {
      expect(screen.getByTestId(`author-stack-counts-${customerUid}`)).toHaveTextContent('3 active · 2 archived');
    });

    // 3. Enter Inspect Wallet -> fresh Stack Archive (2 archived items: Buggin & Exhibition)
    const inspectButtons = screen.getAllByRole('button', { name: /Inspect Wallet/i });
    fireEvent.click(inspectButtons[1]);
    expect(await screen.findByTestId('ledger-tab-stack-archive')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('ledger-tab-stack-archive'));
    await waitFor(() => {
      expect(screen.getByText('Buggin')).toBeInTheDocument();
      expect(screen.getByText('Exhibition')).toBeInTheDocument();
    });

    // Exit back to Admin and start a slow in-flight expand fetch that will resolve stale 6/0 AFTER an account switch
    fireEvent.click(screen.getByRole('button', { name: /Exit Inspection/i }));
    expect(await screen.findByText(customerEmail)).toBeInTheDocument();
    fireEvent.click(screen.getByText(customerEmail)); // collapse previously expanded row
    shouldHoldNextStackFetch = true;
    fireEvent.click(screen.getByText(customerEmail)); // re-expand triggers slow in-flight request
    await waitFor(() => {
      expect(holdFirstSlowResolve).not.toBeNull();
    });

    // 4. Switch auth account: Admin -> Customer -> back to Admin (clears cache & bumps authSessionEpochRef)
    rerender(
      <UsageAnalyticsPage
        {...makeBaseAnalyticsProps({
          user: { uid: customerUid, email: customerEmail },
          isAdmin: false,
          stackCount: 3,
          archivedStack: updatedStackDocs.slice(3).map((d) => ({ ...(d.data() as StackItem), docId: d.id })),
        })}
      />
    );
    expect(await screen.findByTestId('ledger-tab-stack-archive')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('ledger-tab-stack-archive'));
    expect(await screen.findByText('Buggin')).toBeInTheDocument();
    expect(screen.getByText('Exhibition')).toBeInTheDocument();

    // Resolve the stale in-flight request from the prior Admin session with old 6/0 data — must be discarded
    holdFirstSlowResolve!({ docs: initialStackDocs });

    // Switch back to Admin and expand customer row -> must fetch fresh 3 active · 2 archived (never stale 6/0)
    rerender(<UsageAnalyticsPage {...adminProps} />);
    expect(await screen.findByText(customerEmail)).toBeInTheDocument();
    fireEvent.click(screen.getByText(customerEmail));
    await waitFor(() => {
      expect(screen.getByTestId(`author-stack-counts-${customerUid}`)).toHaveTextContent('3 active · 2 archived');
    });
  });

  it('12. MyStackDialog renders plain left-aligned Stack Archive text link with no count indicator alongside Cancel/Done, raises Toast to z-[10000], and fixes DesignSystem raw markdown', () => {
    const onOpenStackArchive = vi.fn();
    render(
      <MyStackDialog
        isOpen={true}
        onClose={vi.fn()}
        stack={[]}
        onRemove={vi.fn()}
        onView={vi.fn()}
        onAddArtist={vi.fn()}
        seedArtists={[]}
        onOpenStackArchive={onOpenStackArchive}
      />
    );

    const archiveLink = screen.getByTestId('my-stack-archive-link');
    expect(archiveLink).toHaveTextContent('Stack Archive');
    expect(screen.queryByTestId('my-stack-archive-count')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument();

    fireEvent.click(archiveLink);
    expect(onOpenStackArchive).toHaveBeenCalledTimes(1);

    // Toast z-index floats above MyStackDialog (z-[2000]) and mobile Zine (z-[9999])
    const appSrc = fs.readFileSync(path.resolve(__dirname, '../App.tsx'), 'utf-8');
    const toastBlock = appSrc.slice(appSrc.indexOf('const Toast:'), appSrc.indexOf('const Toast:') + 650);
    expect(toastBlock).toContain('z-[10000]');
    expect(appSrc).toContain('(prev?.nonce ?? 0) + 1');

    // DesignSystem.tsx has no raw markdown **rounded-lg (8px)** string
    const dsSrc = fs.readFileSync(path.resolve(__dirname, '../components/DesignSystem.tsx'), 'utf-8');
    expect(dsSrc).not.toContain('**rounded-lg (8px)**');
    expect(dsSrc).toContain('z-[10000]');
  });

  it('13. requestedLedgerTab deep-links straight to Stack Archive with smooth anchor scroll (never on normal load or manual tab clicks) for both Standard Users and Admins', async () => {
    const onRestoreStackItem = vi.fn().mockResolvedValue(undefined);
    const onPermanentDeleteStackItem = vi.fn().mockResolvedValue(undefined);
    const originalScrollIntoView = Element.prototype.scrollIntoView;
    const scrollIntoViewMock = vi.fn();
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      configurable: true,
      writable: true,
      value: scrollIntoViewMock,
    });

    try {
      // Part A: Standard User transitioning from inactive (/dashboard) -> active (/analytics) with requestedLedgerTab
      const standardProps = makeBaseAnalyticsProps({
        isActive: false,
        archivedStack: sampleArchivedStack,
        onRestoreStackItem,
        onPermanentDeleteStackItem,
        requestedLedgerTab: null,
      });
      const { rerender, unmount } = render(<UsageAnalyticsPage {...standardProps} />);
      expect(scrollIntoViewMock).not.toHaveBeenCalled();

      // Normal visit to /analytics (no requestedLedgerTab) must NOT call scrollIntoView
      rerender(<UsageAnalyticsPage {...standardProps} isActive={true} />);
      expect(await screen.findByTestId('token-transactions-ledger')).toBeInTheDocument();
      expect(screen.getByTestId('ledger-tab-activity')).toHaveAttribute('aria-selected', 'true');
      await new Promise((r) => setTimeout(r, 30));
      expect(scrollIntoViewMock).not.toHaveBeenCalled();

      // Manual tab toggles must NOT trigger deep-link scrollIntoView
      fireEvent.click(screen.getByTestId('ledger-tab-stack-archive'));
      expect(screen.getByTestId('stack-archive-ledger')).toBeInTheDocument();
      fireEvent.click(screen.getByTestId('ledger-tab-activity'));
      expect(screen.getByTestId('token-transactions-ledger')).toBeInTheDocument();
      await new Promise((r) => setTimeout(r, 30));
      expect(scrollIntoViewMock).not.toHaveBeenCalled();

      // Navigate away (isActive=false), then deep-link back (isActive=true + requestedLedgerTab) -> smooth scroll fires once
      rerender(<UsageAnalyticsPage {...standardProps} isActive={false} />);
      rerender(
        <UsageAnalyticsPage
          {...standardProps}
          isActive={true}
          requestedLedgerTab={{ tab: 'stack_archive', nonce: 1 }}
        />
      );

      expect(await screen.findByTestId('stack-archive-ledger')).toBeInTheDocument();
      expect(screen.getByTestId('ledger-tab-stack-archive')).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByText('Buggin')).toBeInTheDocument();
      await waitFor(() => {
        expect(scrollIntoViewMock).toHaveBeenCalledTimes(1);
        expect(scrollIntoViewMock).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
      });

      // Already on /analytics -> manual click to Token Activity + new nonce deep-link -> switches & smooth scrolls again
      fireEvent.click(screen.getByTestId('ledger-tab-activity'));
      expect(screen.getByTestId('token-transactions-ledger')).toBeInTheDocument();

      rerender(
        <UsageAnalyticsPage
          {...standardProps}
          isActive={true}
          requestedLedgerTab={{ tab: 'stack_archive', nonce: 2 }}
        />
      );
      expect(await screen.findByTestId('stack-archive-ledger')).toBeInTheDocument();
      await waitFor(() => {
        expect(scrollIntoViewMock).toHaveBeenCalledTimes(2);
      });
      unmount();

      // Part B: Admin inspecting a customer -> requestedLedgerTab exits customer inspection, opens Admin's own interactive Stack Archive, and smooth scrolls
      scrollIntoViewMock.mockClear();
      const customerUid = 'uid-cust-preview';
      const customerEmail = 'simon.lavin1@gmail.com';
      mockGetDoc.mockImplementation(async (ref: any) => {
        if (ref?.path === 'adminLedger/system') return { exists: () => true, data: () => ({ jitEnabled: true }) };
        return { exists: () => true, data: () => ({ email: ref?.path?.includes(ADMIN_UID) ? ADMIN_EMAIL : customerEmail, tokenBalance: 0 }) };
      });
      mockGetDocs.mockImplementation(async (ref: any) => {
        if (ref?.path === 'users') {
          return {
            docs: [
              { id: ADMIN_UID, data: () => ({ email: ADMIN_EMAIL, tokenBalance: 0 }) },
              { id: customerUid, data: () => ({ email: customerEmail, tokenBalance: 69 }) },
            ],
          };
        }
        if (ref?.path === `users/${customerUid}/stack`) {
          return {
            docs: [
              {
                id: 'cust_arch_1',
                data: () => ({ id: 'fiddlehead-us', displayName: 'Fiddlehead', type: 'artist', dateSaved: 1762000000000, archivedAt: 1762500000000, status: 'archived', discoveredVia: 'Have Heart' }),
              },
            ],
          };
        }
        return { docs: [] };
      });

      const adminOwnArchived: StackItem[] = [
        {
          id: 'admin-archived-band',
          docId: 'admin-archived-band_p1',
          displayName: 'Admin Own Discovery',
          type: 'artist',
          dateSaved: 1762000000000,
          archivedAt: 1762900000000,
          status: 'archived',
          discoveredVia: 'Spaced',
        },
      ];

      const adminProps = makeBaseAnalyticsProps({
        user: { uid: ADMIN_UID, email: ADMIN_EMAIL },
        isAdmin: true,
        stackCount: 2,
        archivedStack: adminOwnArchived,
        onRestoreStackItem,
        onPermanentDeleteStackItem,
        requestedLedgerTab: null,
      });

      const { rerender: rerenderAdmin } = render(<UsageAnalyticsPage {...adminProps} />);
      expect(await screen.findByText(customerEmail)).toBeInTheDocument();

      // First enter customer Inspect Wallet
      const inspectBtns = screen.getAllByRole('button', { name: /Inspect Wallet/i });
      fireEvent.click(inspectBtns[1]);
      expect(await screen.findByTestId('ledger-tab-stack-archive')).toBeInTheDocument();
      fireEvent.click(screen.getByTestId('ledger-tab-stack-archive'));
      expect(await screen.findByTestId('stack-archive-readonly-badge')).toBeInTheDocument();
      expect(screen.getByText('Fiddlehead')).toBeInTheDocument();
      expect(scrollIntoViewMock).not.toHaveBeenCalled();

      // Now deep-link from Admin's MyStackDialog -> exits customer inspection, opens Admin's own interactive Stack Archive, and smooth scrolls
      rerenderAdmin(
        <UsageAnalyticsPage
          {...adminProps}
          requestedLedgerTab={{ tab: 'stack_archive', nonce: 1 }}
        />
      );

      expect(await screen.findByText('Admin Own Discovery')).toBeInTheDocument();
      expect(screen.queryByText('Fiddlehead')).not.toBeInTheDocument();
      expect(screen.queryByTestId('stack-archive-readonly-badge')).not.toBeInTheDocument();
      expect(screen.getByTestId('archive-restore-admin-archived-band_p1')).toBeInTheDocument();
      expect(screen.getByTestId('archive-delete-admin-archived-band_p1')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Return to Admin View/i })).toBeInTheDocument();
      await waitFor(() => {
        expect(scrollIntoViewMock).toHaveBeenCalledTimes(1);
        expect(scrollIntoViewMock).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
      });
    } finally {
      Object.defineProperty(Element.prototype, 'scrollIntoView', {
        configurable: true,
        writable: true,
        value: originalScrollIntoView,
      });
    }
  });

  it('14. renders compact Wallet Hero with Option A runway (plural, low-balance amber nudges, Admin 0T bypass), single + Top Up CTA hidden in read-only inspection, and relocated support strip', async () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    try {
      // Standard User at 49T -> ~9 Single-Root Zcenes, + Top Up CTA visible, relocated support strip inside Token Activity
      const { rerender, unmount } = render(
        <UsageAnalyticsPage
          {...makeBaseAnalyticsProps({
            profile: { tokenBalance: 49, lifetimeTokensPurchased: 500, lifetimeTokensSpent: 461 },
          })}
        />
      );

      expect(await screen.findByTestId('wallet-hero-card')).toBeInTheDocument();
      expect(screen.getByTestId('wallet-balance-value')).toHaveTextContent('49');
      expect(screen.getByTestId('wallet-runway-line')).toHaveTextContent('~9 Single-Root Zcenes');
      expect(screen.getByTestId('wallet-runway-line').className).toContain('text-zinc-400');

      // Removed legacy hero clutter
      expect(screen.queryByText('Available Discovery Balance')).not.toBeInTheDocument();
      expect(screen.queryByText('Token Juice Reserve')).not.toBeInTheDocument();
      expect(screen.queryByTestId('analytics-topup-gbp_5')).not.toBeInTheDocument();
      expect(screen.queryByTestId('analytics-topup-gbp_10')).not.toBeInTheDocument();
      expect(screen.queryByTestId('analytics-topup-gbp_15')).not.toBeInTheDocument();

      // Single Primary White + Top Up CTA dispatches open-topup-modal
      const topUpBtn = screen.getByTestId('analytics-topup-btn');
      expect(topUpBtn).toHaveTextContent('+ Top Up');
      expect(topUpBtn.className).toContain('bg-white');
      expect(topUpBtn.className).toContain('text-brand-black');
      fireEvent.click(topUpBtn);
      expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'open-topup-modal' }));

      // Support strip lives inside Token Activity, NOT inside wallet-hero-card
      const supportStrip = screen.getByTestId('ledger-support-strip');
      expect(screen.getByTestId('token-transactions-ledger').contains(supportStrip)).toBe(true);
      expect(screen.getByTestId('wallet-hero-card').contains(supportStrip)).toBe(false);

      // Low balance 5-9T -> singular amber nudge
      rerender(
        <UsageAnalyticsPage
          {...makeBaseAnalyticsProps({
            profile: { tokenBalance: 7, lifetimeTokensPurchased: 50, lifetimeTokensSpent: 43 },
          })}
        />
      );
      expect(screen.getByTestId('wallet-runway-line')).toHaveTextContent('Low balance · ~1 Single-Root Zcene left');
      expect(screen.getByTestId('wallet-runway-line').className).toContain('text-amber-400');

      // Low balance 0-4T -> amber top-up nudge
      rerender(
        <UsageAnalyticsPage
          {...makeBaseAnalyticsProps({
            profile: { tokenBalance: 4, lifetimeTokensPurchased: 50, lifetimeTokensSpent: 46 },
          })}
        />
      );
      expect(screen.getByTestId('wallet-runway-line')).toHaveTextContent('Low balance · Top up to curate new Zcenes');
      expect(screen.getByTestId('wallet-runway-line').className).toContain('text-amber-400');
      unmount();

      // Admin personal ledger (0T) -> neutral bypass copy + NO + Top Up button
      mockGetDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({ email: ADMIN_EMAIL, tokenBalance: 0, lifetimeTokensPurchased: 0, lifetimeTokensSpent: 0 }),
      });
      const { unmount: unmountAdmin } = render(
        <UsageAnalyticsPage
          {...makeBaseAnalyticsProps({
            user: { uid: ADMIN_UID, email: ADMIN_EMAIL },
            isAdmin: true,
            profile: { tokenBalance: 0, lifetimeTokensPurchased: 0, lifetimeTokensSpent: 0 },
            requestedLedgerTab: { tab: 'activity', nonce: 1 },
          })}
        />
      );
      expect(await screen.findByTestId('wallet-hero-card')).toBeInTheDocument();
      expect(screen.getByTestId('wallet-runway-line')).toHaveTextContent('Admin 0T Bypass · Unlimited curations');
      expect(screen.getByTestId('wallet-runway-line').className).toContain('text-zinc-400');
      expect(screen.queryByTestId('analytics-topup-btn')).not.toBeInTheDocument();
      unmountAdmin();

      // Admin inspecting a customer's wallet (isInspectingOtherUser=true) -> customer runway visible, + Top Up strictly hidden
      const custUid = 'uid-cust-readonly';
      const custEmail = 'simon.lavin1@gmail.com';
      mockGetDoc.mockImplementation(async (ref: any) => {
        if (ref?.path === 'adminLedger/system') return { exists: () => true, data: () => ({ jitEnabled: true }) };
        return { exists: () => true, data: () => ({ email: custEmail, tokenBalance: 69, lifetimeTokensPurchased: 500, lifetimeTokensSpent: 431 }) };
      });
      mockGetDocs.mockImplementation(async (ref: any) => {
        if (ref?.path === 'users') {
          return {
            docs: [
              { id: ADMIN_UID, data: () => ({ email: ADMIN_EMAIL, tokenBalance: 0 }) },
              { id: custUid, data: () => ({ email: custEmail, tokenBalance: 69, lifetimeTokensPurchased: 500, lifetimeTokensSpent: 431 }) },
            ],
          };
        }
        return { docs: [] };
      });

      render(
        <UsageAnalyticsPage
          {...makeBaseAnalyticsProps({
            user: { uid: ADMIN_UID, email: ADMIN_EMAIL },
            isAdmin: true,
          })}
        />
      );
      expect(await screen.findByText(custEmail)).toBeInTheDocument();
      fireEvent.click(screen.getAllByRole('button', { name: /Inspect Wallet/i })[1]);
      expect(await screen.findByTestId('wallet-hero-card')).toBeInTheDocument();
      expect(screen.getByTestId('wallet-runway-line')).toHaveTextContent('~13 Single-Root Zcenes');
      expect(screen.queryByTestId('analytics-topup-btn')).not.toBeInTheDocument();
    } finally {
      dispatchSpy.mockRestore();
    }
  });

  it('15. renders single-branch mobile Token Activity cards at < 768px (isSmallScreen=true) with flex-wrap filter pills and zero duplicate desktop table nodes', async () => {
    mockGetDocs.mockImplementation(async (ref: any) => {
      if (ref?.path?.endsWith('projects')) {
        return {
          docs: [
            {
              id: 'proj-madball',
              data: () => ({
                name: 'Madball & Radiohead',
                seedArtists: 'Madball::Radiohead',
                status: 'completed',
                tokensSpent: 10,
                isComplexProject: true,
                createdAt: { toMillis: () => 1763000000000 },
              }),
            },
          ],
        };
      }
      if (ref?.path?.endsWith('tokenTransactions')) {
        return {
          docs: [
            {
              id: 'tx-madball-settlement',
              data: () => ({
                uid: 'u-member-1',
                type: 'spend_live_synthesis',
                projectId: 'proj-madball',
                delta: -9,
                balanceAfter: 59,
                description: 'Zcene Synthesis: Madball & Radiohead (9T balance after 1T pre-flight)',
                createdAt: { toMillis: () => 1763000001000 },
              }),
            },
          ],
        };
      }
      return { docs: [] };
    });

    render(
      <UsageAnalyticsPage
        {...makeBaseAnalyticsProps({
          isSmallScreen: true,
        })}
      />
    );

    expect(await screen.findByTestId('token-activity-mobile-list')).toBeInTheDocument();
    expect(screen.queryByTestId('token-activity-desktop-table')).not.toBeInTheDocument();
    expect(screen.getAllByText('Madball & Radiohead')).toHaveLength(1);
    expect(screen.getByText('-9 T')).toBeInTheDocument();
    expect(screen.getByText('Bal: 59 T')).toBeInTheDocument();
    expect(screen.getByText('9T settlement after 1T pre-flight')).toBeInTheDocument();

    // Filter pills wrap cleanly instead of clipping horizontally off-screen
    const filterPillBar = screen.getByTestId('activity-filter-pills');
    expect(filterPillBar.className).toContain('flex-wrap');
    expect(filterPillBar.className).not.toContain('flex-nowrap');
    expect(filterPillBar.className).not.toContain('overflow-x-auto');
  });

  it('16. SimulatedStripeModal renders responsive split footer with Token Activity link (disabled while processing) and requestedLedgerTab deep-links to Token Activity with smooth scroll', async () => {
    let resolveTopUp: ((val: any) => void) | null = null;
    mockHttpsCallable.mockReturnValue(
      vi.fn().mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveTopUp = resolve;
          })
      )
    );
    const onOpenTokenActivity = vi.fn();

    const { unmount } = render(
      <SimulatedStripeModal
        isOpen={true}
        currentBalance={49}
        onClose={vi.fn()}
        onOpenTokenActivity={onOpenTokenActivity}
      />
    );

    const modalContainer = screen.getByTestId('simulated-stripe-modal');
    expect(modalContainer.className).toContain('sm:max-w-[480px]');

    const activityLink = screen.getByTestId('stripe-token-activity-link');
    expect(activityLink).toHaveTextContent('Token Activity');
    expect(activityLink).not.toBeDisabled();
    fireEvent.click(activityLink);
    expect(onOpenTokenActivity).toHaveBeenCalledTimes(1);

    // Trigger in-flight top-up -> Token Activity link becomes disabled
    fireEvent.click(screen.getByTestId('stripe-waiver-checkbox'));
    fireEvent.click(screen.getByTestId('stripe-confirm-button'));
    expect(activityLink).toBeDisabled();
    resolveTopUp!({ data: { tokenBalance: 149, addedTokens: 100 } });
    await waitFor(() => {
      expect(activityLink).not.toBeDisabled();
    });
    unmount();

    // Verify requestedLedgerTab={{ tab: 'activity', nonce }} switches from Stack Archive back to Token Activity & smooth scrolls
    const originalScrollIntoView = Element.prototype.scrollIntoView;
    const scrollIntoViewMock = vi.fn();
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      configurable: true,
      writable: true,
      value: scrollIntoViewMock,
    });
    try {
      const baseProps = makeBaseAnalyticsProps({
        isActive: true,
        archivedStack: sampleArchivedStack,
        requestedLedgerTab: null,
      });
      const { rerender } = render(<UsageAnalyticsPage {...baseProps} />);
      expect(await screen.findByTestId('token-transactions-ledger')).toBeInTheDocument();

      fireEvent.click(screen.getByTestId('ledger-tab-stack-archive'));
      expect(screen.getByTestId('stack-archive-ledger')).toBeInTheDocument();

      rerender(<UsageAnalyticsPage {...baseProps} requestedLedgerTab={{ tab: 'activity', nonce: 1 }} />);
      expect(await screen.findByTestId('token-transactions-ledger')).toBeInTheDocument();
      expect(screen.getByTestId('ledger-tab-activity')).toHaveAttribute('aria-selected', 'true');
      await waitFor(() => {
        expect(scrollIntoViewMock).toHaveBeenCalledTimes(1);
        expect(scrollIntoViewMock).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
      });
    } finally {
      Object.defineProperty(Element.prototype, 'scrollIntoView', {
        configurable: true,
        writable: true,
        value: originalScrollIntoView,
      });
    }
  });

  it('17. locks w-60 non-wrapping profile dropdown across Header & HomePage (149T/9999T) and aligns DesignSystem.tsx living specs', () => {
    const { rerender } = render(
      <Header
        user={{ uid: 'u-1', email: 'simon.lavin1@gmail.com' } as any}
        onLogoClick={vi.fn()}
        view="dashboard"
        isSmallScreen={true}
        isMagazineViewOpen={false}
        stackCount={0}
        isStackNew={false}
        onOpenStack={vi.fn()}
        onNavigate={vi.fn()}
        onLogout={vi.fn()}
        onDeleteAccount={vi.fn()}
        isAdmin={false}
        isProfileOpen={true}
        setIsProfileOpen={vi.fn()}
        isDeleteAccountModalOpen={false}
        setIsDeleteAccountModalOpen={vi.fn()}
        isMenuOpen={false}
        setIsMenuOpen={vi.fn()}
        tokenBalance={149}
      />
    );

    const dropdown = screen.getByTestId('header-profile-dropdown');
    expect(dropdown.className).toContain('w-60');
    expect(dropdown.className).not.toContain('w-56');

    const topUpBtn = screen.getByTestId('profile-topup-btn');
    const topUpBadge = screen.getByTestId('profile-topup-badge');
    expect(topUpBtn.className).toContain('whitespace-nowrap');
    expect(topUpBadge).toHaveTextContent('149T');
    expect(topUpBadge.className).toContain('whitespace-nowrap');
    expect(topUpBadge.className).toContain('shrink-0');

    rerender(
      <Header
        user={{ uid: 'u-1', email: 'simon.lavin1@gmail.com' } as any}
        onLogoClick={vi.fn()}
        view="dashboard"
        isSmallScreen={false}
        isMagazineViewOpen={false}
        stackCount={0}
        isStackNew={false}
        onOpenStack={vi.fn()}
        onNavigate={vi.fn()}
        onLogout={vi.fn()}
        onDeleteAccount={vi.fn()}
        isAdmin={false}
        isProfileOpen={true}
        setIsProfileOpen={vi.fn()}
        isDeleteAccountModalOpen={false}
        setIsDeleteAccountModalOpen={vi.fn()}
        isMenuOpen={false}
        setIsMenuOpen={vi.fn()}
        tokenBalance={9999}
      />
    );
    expect(screen.getByTestId('profile-topup-badge')).toHaveTextContent('9999T');

    // HomePage profile dropdown parity & DesignSystem living spec parity
    const homeSrc = fs.readFileSync(path.resolve(__dirname, '../components/HomePage.tsx'), 'utf-8');
    expect(homeSrc).toContain('data-testid="homepage-profile-dropdown"');
    expect(homeSrc).toContain('w-60 z-20');

    const dsSrc = fs.readFileSync(path.resolve(__dirname, '../components/DesignSystem.tsx'), 'utf-8');
    expect(dsSrc).toContain('w-60 overflow-hidden rounded-xl border border-white/10 bg-brand-black p-1.5');
    expect(dsSrc).toContain('Single-Line + Right-Badge Guardrail');
    expect(dsSrc).toContain('Compact Wallet Summary Strip');
    expect(dsSrc).toContain('Responsive Ledger Mobile Card Anatomy');
    expect(dsSrc).toContain('sm:max-w-[480px]');
  });

  it('18. SimulatedStripeModal uses concise Confirm CTA and single-row 375px split footer mirroring MyStackDialog', () => {
    render(
      <SimulatedStripeModal
        isOpen={true}
        currentBalance={49}
        onClose={vi.fn()}
        onOpenTokenActivity={vi.fn()}
      />
    );

    const confirmBtn = screen.getByTestId('stripe-confirm-button');
    expect(confirmBtn).toHaveTextContent('Confirm');
    expect(confirmBtn.textContent?.trim()).toBe('Confirm');
    expect(confirmBtn).toHaveClass('px-6', 'py-2', 'bg-white', 'text-brand-black', 'rounded-xl', 'font-medium', 'text-sm');

    const activityLink = screen.getByTestId('stripe-token-activity-link');
    const footerRow = activityLink.parentElement!;
    expect(footerRow.className).toContain('flex');
    expect(footerRow.className).toContain('items-center');
    expect(footerRow.className).toContain('justify-between');
    expect(footerRow.className).not.toContain('flex-col');
  });

  it('19. renders single-branch mobile DiscoveryLedgerTable cards at < 768px with expanded Curation Actions, Top Artist Discoveries, shared receipt cards, and 10-row nested activity pagination', () => {
    expect(ADMIN_LOG_PAGE_SIZE).toBe(10);

    const manyAuthorTxs = Array.from({ length: ADMIN_LOG_PAGE_SIZE + 5 }, (_, idx) => ({
      id: `admin_tx_${idx}`,
      type: 'spend_preflight',
      delta: -1,
      balanceAfter: 100 - idx,
      description: `Admin Mobile Receipt ${idx + 1}`,
      costUsd: 0.0015,
      createdAt: { toMillis: () => 1763000000000 - idx * 1000 },
    }));

    const authorRow = {
      uid: 'uid-cust-mobile',
      email: 'simon.lavin1@gmail.com',
      projectsCount: 63,
      actionTriggers: { createCount: 63, updateCount: 120 },
      artistSearches: {
        globalCount: 30,
        topSearches: [{ artistName: 'The Murder City Devils', count: 9 }],
      },
      cacheEfficiency: { liveQueries: 10, cacheHits: 20 },
      deepCutsOpened: 42,
      exactCost: 9.5937,
      hasExactCost: true,
      tokenBalance: 149,
      lifetimeTokensPurchased: 600,
      lifetimeTokensSpent: 461,
      projects: [],
      transactions: manyAuthorTxs,
    };

    const onInspectUser = vi.fn();
    render(
      <DiscoveryLedgerTable
        isLoading={false}
        filteredLedger={[authorRow]}
        expandedRow="simon.lavin1@gmail.com"
        toggleRow={vi.fn()}
        onInspectUser={onInspectUser}
        isSmallScreen={true}
      />
    );

    // Single-branch render: mobile card list present, desktop table absent
    expect(screen.getByTestId('admin-authors-mobile-list')).toBeInTheDocument();
    expect(screen.queryByTestId('admin-authors-desktop-table')).not.toBeInTheDocument();
    expect(screen.getAllByText('simon.lavin1@gmail.com')).toHaveLength(1);

    // Inspect Wallet button works cleanly on mobile card
    fireEvent.click(screen.getByRole('button', { name: /Inspect Wallet/i }));
    expect(onInspectUser).toHaveBeenCalledWith(authorRow);

    // Expanded Curation Actions & Top Artist Discoveries visible inside mobile card
    expect(screen.getByText('Curation Actions')).toBeInTheDocument();
    expect(screen.getByText('The Murder City Devils')).toBeInTheDocument();

    // Nested author activity uses shared mobile receipt cards & paginates at 10 rows
    expect(screen.getByTestId('admin-author-activity-mobile-list')).toBeInTheDocument();
    expect(screen.queryByTestId('admin-author-activity-desktop-table')).not.toBeInTheDocument();
    expect(screen.getByText('Admin Mobile Receipt 1')).toBeInTheDocument();
    expect(screen.queryByText(`Admin Mobile Receipt ${ADMIN_LOG_PAGE_SIZE + 1}`)).not.toBeInTheDocument();
    expect(screen.getByTestId('admin-author-activity-show-more-btn')).toHaveTextContent('Show more (5 remaining)');

    fireEvent.click(screen.getByTestId('admin-author-activity-show-more-btn'));
    expect(screen.getByText(`Admin Mobile Receipt ${ADMIN_LOG_PAGE_SIZE + 5}`)).toBeInTheDocument();
    expect(screen.queryByTestId('admin-author-activity-show-more-btn')).not.toBeInTheDocument();
  });

  it('20. renders 375px mobile JIT & Failed Curation cards with 10-row pagination, edge-safe InfoTooltips, ToolbarSearch author filter, and DesignSystem spec parity', async () => {
    const manyHeals = Array.from({ length: ADMIN_LOG_PAGE_SIZE + 4 }, (_, idx) => ({
      id: `heal_${idx}`,
      data: () => ({
        entityId: `band-${idx}-us`,
        rawEntityId: `band-${idx}`,
        entityType: 'artist',
        displayName: `Healed Band ${idx + 1}`,
        callerUid: 'u-1',
        callerEmail: 'simon.lavin1@gmail.com',
        projectName: 'Hardcore Mix',
        totalTokens: 2500,
        promptTokens: 2000,
        candidatesTokens: 500,
        costUsd: 0.00045,
        timestamp: 1763000000000 - idx * 1000,
      }),
    }));

    const manyFailures = Array.from({ length: ADMIN_LOG_PAGE_SIZE + 3 }, (_, idx) => ({
      id: `fail_${idx}`,
      data: () => ({
        source: idx % 2 === 0 ? 'stale_reaper' : 'column2_error',
        uid: 'u-1',
        userEmail: 'simon.lavin1@gmail.com',
        projectId: `p_${idx}`,
        projectName: `Failed Zcene ${idx + 1}`,
        tokensRefunded: 5,
        isFullRefund: true,
        reason: `Timeout ${idx + 1}`,
        errorMessage: 'Upstream aborted',
        sunkTotalTokens: 1200,
        sunkCostUsd: 0.0123,
        timestamp: 1763000000000 - idx * 1000,
      }),
    }));

    mockGetDoc.mockResolvedValue({ exists: () => true, data: () => ({ jitEnabled: true }) });
    mockGetDocs.mockImplementation(async (ref: any) => {
      if (ref?.path === 'users') {
        return {
          docs: [
            { id: ADMIN_UID, data: () => ({ email: ADMIN_EMAIL, tokenBalance: 0 }) },
            { id: 'u-cust', data: () => ({ email: 'simon.lavin1@gmail.com', tokenBalance: 149, lifetimeTokensPurchased: 600, lifetimeTokensSpent: 461 }) },
          ],
        };
      }
      if (ref?.path === 'adminLedger/system/jitHeals') return { docs: manyHeals };
      if (ref?.path === 'adminLedger/system/curationFailures') return { docs: manyFailures };
      return { docs: [] };
    });

    const { container } = render(
      <UsageAnalyticsPage
        {...makeBaseAnalyticsProps({
          user: { uid: ADMIN_UID, email: ADMIN_EMAIL },
          isAdmin: true,
          isSmallScreen: true,
        })}
      />
    );

    // JIT mobile single-branch cards + 10-row pagination
    expect(await screen.findByTestId('jit-heals-mobile-list')).toBeInTheDocument();
    expect(screen.queryByTestId('jit-heals-desktop-table')).not.toBeInTheDocument();
    expect(screen.getByText('Healed Band 1')).toBeInTheDocument();
    expect(screen.queryByText(`Healed Band ${ADMIN_LOG_PAGE_SIZE + 1}`)).not.toBeInTheDocument();
    expect(screen.getByTestId('jit-show-more-btn')).toHaveTextContent('Show more (4 remaining)');
    fireEvent.click(screen.getByTestId('jit-show-more-btn'));
    expect(screen.getByText(`Healed Band ${ADMIN_LOG_PAGE_SIZE + 4}`)).toBeInTheDocument();
    expect(screen.queryByTestId('jit-show-more-btn')).not.toBeInTheDocument();

    // Failed & Auto-Refunded Curations mobile single-branch cards + 10-row pagination
    expect(screen.getByTestId('curation-failures-mobile-list')).toBeInTheDocument();
    expect(screen.queryByTestId('curation-failures-desktop-table')).not.toBeInTheDocument();
    expect(screen.getByText('Failed Zcene 1')).toBeInTheDocument();
    expect(screen.queryByText(`Failed Zcene ${ADMIN_LOG_PAGE_SIZE + 1}`)).not.toBeInTheDocument();
    expect(screen.getByTestId('curation-failures-show-more-btn')).toHaveTextContent('Show more (3 remaining)');
    fireEvent.click(screen.getByTestId('curation-failures-show-more-btn'));
    expect(screen.getByText(`Failed Zcene ${ADMIN_LOG_PAGE_SIZE + 3}`)).toBeInTheDocument();
    expect(screen.queryByTestId('curation-failures-show-more-btn')).not.toBeInTheDocument();

    // Edge-safe InfoTooltip alignment: 4 KPI card tooltips + 2 Admin section header tooltips all right-aligned inward
    const tooltips = Array.from(container.querySelectorAll('[role="tooltip"]')) as HTMLElement[];
    expect(tooltips.filter((el) => el.getAttribute('data-align') === 'right')).toHaveLength(6);
    expect(tooltips.filter((el) => el.getAttribute('data-align') === 'left')).toHaveLength(0);

    // Runtime viewport clamping guard (375px screen, 16px edge gutter): clamps left & right overflows without double-shifting and resets to 0 when in-bounds
    const origInnerWidth = window.innerWidth;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 375 });
    try {
      const failuresTooltip = tooltips[5];
      const failuresWrapper = failuresTooltip.parentElement as HTMLElement;
      const failuresBtn = failuresWrapper.querySelector('button') as HTMLButtonElement;
      const makeRect = (left: number, right: number): DOMRect =>
        ({ left, right, width: right - left, top: 100, bottom: 180, height: 80, x: left, y: 100, toJSON: () => ({}) } as DOMRect);

      // Dynamic mock faithfully reflects real browser layout where getBoundingClientRect shifts by committed style.transform
      let failuresNaturalLeft = -29;
      vi.spyOn(failuresTooltip, 'getBoundingClientRect').mockImplementation(() => {
        const applied = Number(failuresTooltip.dataset.appliedShift || 0);
        return makeRect(failuresNaturalLeft + applied, failuresNaturalLeft + 192 + applied);
      });
      // Simulate back-to-back mobile tap events: must clamp once to +45px (never double-shift)
      fireEvent.mouseEnter(failuresWrapper);
      fireEvent.focus(failuresBtn);
      fireEvent.click(failuresBtn);
      expect(failuresTooltip.style.transform).toBe('translateX(45px)');
      expect(failuresTooltip.getAttribute('data-applied-shift')).toBe('45');

      const jitTooltip = tooltips[4];
      const jitWrapper = jitTooltip.parentElement as HTMLElement;
      const jitBtn = jitWrapper.querySelector('button') as HTMLButtonElement;
      let jitNaturalLeft = 260;
      vi.spyOn(jitTooltip, 'getBoundingClientRect').mockImplementation(() => {
        const applied = Number(jitTooltip.dataset.appliedShift || 0);
        return makeRect(jitNaturalLeft + applied, jitNaturalLeft + 192 + applied);
      });
      fireEvent.focus(jitBtn);
      expect(jitTooltip.style.transform).toBe('translateX(-93px)');
      expect(jitTooltip.getAttribute('data-applied-shift')).toBe('-93');

      // When viewport/layout has room (naturalLeft=100, naturalRight=292 inside [16, 359]), shift resets cleanly to 0
      jitNaturalLeft = 100;
      fireEvent.mouseEnter(jitWrapper);
      expect(jitTooltip.style.transform).toBe('');
      expect(jitTooltip.getAttribute('data-applied-shift')).toBe('0');
    } finally {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: origInnerWidth });
    }

    // ToolbarSearch author filter sits inside Author P&L header (width="wide" -> sm:w-80), filters mobile author cards, and clears via built-in Clear button
    expect(screen.getByText('Author P&L')).toBeInTheDocument();
    const authorSearch = screen.getByTestId('admin-author-search-input');
    expect(authorSearch).toHaveAttribute('placeholder', 'Search by Author identity...');
    expect(authorSearch.parentElement?.className).toContain('sm:w-80');
    fireEvent.change(authorSearch, { target: { value: 'simon.lavin1' } });
    expect(screen.getByTestId('admin-author-card-u-cust')).toBeInTheDocument();
    expect(screen.queryByTestId(`admin-author-card-${ADMIN_UID}`)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(screen.getByTestId(`admin-author-card-${ADMIN_UID}`)).toBeInTheDocument();

    // DesignSystem.tsx documents living components, single-row Confirm split footer, InfoTooltip align="right"/"left", Admin mobile cards, and ad-free V47.20 parity
    const dsSrc = fs.readFileSync(path.resolve(__dirname, '../components/DesignSystem.tsx'), 'utf-8');
    expect(dsSrc).toContain('InfoTooltip align=&quot;right&quot;');
    expect(dsSrc).toContain('Failed &amp; Auto-Refunded Curations');
    expect(dsSrc).toContain('Progressive Pagination:');
    expect(dsSrc).toContain('INACTIVE · FUTURE USE');
    expect(dsSrc).toContain('<DashboardProjectCard');
    expect(dsSrc).toContain('<ArtistVerificationCard');
    expect(dsSrc).toContain('<DisambiguationRadio');
    expect(dsSrc).toContain('<ModalFooterLink');
    expect(dsSrc).toContain('<ProjectMobileListCard');
    expect(dsSrc).toContain('auto_stories');
    expect(dsSrc).toContain('picture_as_pdf');
    expect(dsSrc).toContain('visibility_off');
    expect(dsSrc).not.toContain('RootsBreakdownButton');
    expect(dsSrc).not.toContain('Ad Space');
    expect(dsSrc).not.toContain('Fixed Footer Ad');
    expect(dsSrc).not.toContain('Organic View');
    expect(dsSrc).not.toContain('Cluster View');
    expect(dsSrc).not.toContain('Roots Breakdown');
    expect(dsSrc).not.toContain('shopping_bag');
    expect(dsSrc).not.toContain('**18px**');
  });
});
