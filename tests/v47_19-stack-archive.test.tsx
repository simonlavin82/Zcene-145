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
  LEDGER_PAGE_SIZE,
} from '../components/UsageAnalyticsPage';
import { MyStackDialog } from '../components/SharedModals';
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

  it('3. switches between Token Activity (default) and Stack Archive tabs with archived count badge and preserves activity filter pills', async () => {
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
    expect(screen.getByTestId('stack-archive-tab-count')).toHaveTextContent('3');
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

  it('7. paginates both Token Activity and Stack Archive at 50 rows with incremental Show more expansion', async () => {
    const manyTxs = Array.from({ length: LEDGER_PAGE_SIZE + 12 }, (_, idx) => ({
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

    const manyArchived: StackItem[] = Array.from({ length: LEDGER_PAGE_SIZE + 8 }, (_, idx) => ({
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
    expect(screen.queryByText(`Pre-Flight Artist Lookup: Band ${LEDGER_PAGE_SIZE + 1}`)).not.toBeInTheDocument();
    expect(screen.getByTestId('activity-show-more-btn')).toHaveTextContent('Show more (12 remaining)');

    fireEvent.click(screen.getByTestId('activity-show-more-btn'));
    expect(screen.getByText(`Pre-Flight Artist Lookup: Band ${LEDGER_PAGE_SIZE + 12}`)).toBeInTheDocument();
    expect(screen.queryByTestId('activity-show-more-btn')).not.toBeInTheDocument();

    // Switch to Stack Archive
    fireEvent.click(screen.getByTestId('ledger-tab-stack-archive'));
    expect(screen.getByText('Archived Band 1')).toBeInTheDocument();
    expect(screen.queryByText(`Archived Band ${LEDGER_PAGE_SIZE + 1}`)).not.toBeInTheDocument();
    expect(screen.getByTestId('archive-show-more-btn')).toHaveTextContent('Show more (8 remaining)');

    fireEvent.click(screen.getByTestId('archive-show-more-btn'));
    expect(screen.getByText(`Archived Band ${LEDGER_PAGE_SIZE + 8}`)).toBeInTheDocument();
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
    expect(screen.getByTestId('stack-archive-tab-count')).toHaveTextContent('1');

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

    // 3. Enter Inspect Wallet -> fresh Stack Archive (2)
    const inspectButtons = screen.getAllByRole('button', { name: /Inspect Wallet/i });
    fireEvent.click(inspectButtons[1]);
    expect(await screen.findByTestId('ledger-tab-stack-archive')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId('stack-archive-tab-count')).toHaveTextContent('2');
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
    expect(await screen.findByTestId('stack-archive-tab-count')).toHaveTextContent('2');

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
});
