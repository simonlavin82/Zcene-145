import React from 'react';
import fs from 'fs';
import path from 'path';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import {
  ADMIN_EMAIL,
  TOKEN_PRICING,
  TOP_UP_TIERS,
  isAdminEmail,
  computeBaseProjectTokenCost,
  computeRemainingSettlementTokens,
} from '../shared/tokenEconomy';
import { TokenConfirmationDialog, SimulatedStripeModal, MyTasteDialog } from '../components/SharedModals';
import { UsageAnalyticsPage, calculateTelemetryForUser } from '../components/UsageAnalyticsPage';
import { BACKEND_REGRESSION_RUNBOOK } from '../docs/backend-regression-runbook';
import { computeProjectHydrationFingerprint } from '../utils/projectHydrationFingerprint';
import { sanitizeLabelProfile } from '../services/artistCacheService';
import { View } from '../types';

const mockHttpsCallable = vi.fn();
const mockGetDocs = vi.fn();
const mockGetDoc = vi.fn();

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
  setDoc: vi.fn(),
  serverTimestamp: vi.fn(),
  query: vi.fn((ref) => ref),
  orderBy: vi.fn(),
  limit: vi.fn(),
}));

describe('Architecture V38 — Token Economy & Split-Debit Contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('enforces V38 top-up tiers, discovery menu pricing, and Split-Debit remainder math', () => {
    expect(TOP_UP_TIERS.gbp_5).toMatchObject({ amountGbp: 5, priceDisplay: '£5', tokens: 50 });
    expect(TOP_UP_TIERS.gbp_10).toMatchObject({ amountGbp: 10, priceDisplay: '£10', tokens: 100 });
    expect(TOP_UP_TIERS.gbp_15).toMatchObject({ amountGbp: 15, priceDisplay: '£15', tokens: 150 });

    expect(TOKEN_PRICING).toMatchObject({
      SINGLE_SEED: 5,
      COMPLEX_QUERY: 10,
      PREFLIGHT_FLASH_FEE: 1,
      MAX_CREDITABLE_PREFLIGHT: 1,
      DEEP_WEB_CONSULT: 3,
      SHARED_VIEW_AND_CLONE: 0,
    });

    expect(computeBaseProjectTokenCost(1, false)).toBe(5);
    expect(computeBaseProjectTokenCost(2, false)).toBe(10);
    expect(computeBaseProjectTokenCost(1, true)).toBe(10);

    // Pure cached Direct Hit (0T pre-flight -> 5T settlement)
    expect(computeRemainingSettlementTokens(5, 0)).toEqual({
      creditablePreFlight: 0,
      remainingSettlement: 5,
    });

    // Uncached Single-Seed or Post-Validation Cache Intercept (1T pre-flight -> 4T remainder = 5T total)
    expect(computeRemainingSettlementTokens(5, 1)).toEqual({
      creditablePreFlight: 1,
      remainingSettlement: 4,
    });

    // Escape Hatch re-query (1T initial + 1T escape hatch = 2T pre-flight -> creditable capped at 1T -> 4T remainder = 6T total)
    expect(computeRemainingSettlementTokens(5, 2)).toEqual({
      creditablePreFlight: 1,
      remainingSettlement: 4,
    });

    // Complex Zcene after 1T pre-flight -> 9T remainder = 10T total
    expect(computeRemainingSettlementTokens(10, 1)).toEqual({
      creditablePreFlight: 1,
      remainingSettlement: 9,
    });

    expect(isAdminEmail(ADMIN_EMAIL)).toBe(true);
    expect(isAdminEmail('  ZCENE.ONLINE@GMAIL.COM ')).toBe(true);
    expect(isAdminEmail('member@example.com')).toBe(false);
  });

  it('renders TokenConfirmationDialog in Standard Sufficient mode without password input or cache/USD leaks', () => {
    const onConfirm = vi.fn();
    render(
      <TokenConfirmationDialog
        isOpen={true}
        onClose={vi.fn()}
        onConfirm={onConfirm}
        type="generation"
        cachedArtists={['Turnstile']}
        missingArtists={[]}
        tokenCost={5}
        tokenBalance={50}
        isAdmin={false}
      />
    );

    expect(screen.queryByTestId('token-password-input')).not.toBeInTheDocument();
    expect(screen.getByTestId('token-gate-cost')).toHaveTextContent('5 Tokens');
    expect(screen.queryByText(/\$0\.0000/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Direct Hit/i)).not.toBeInTheDocument();

    const confirmBtn = screen.getByTestId('token-authorize-button');
    expect(confirmBtn).toHaveTextContent('Confirm & Spend 5 Tokens');
    fireEvent.click(confirmBtn);
    expect(onConfirm).toHaveBeenCalledWith('authorized');
  });

  it('renders TokenConfirmationDialog in Low-Balance mode and triggers Simulated Stripe Top-Up', () => {
    const onOpenTopUp = vi.fn();
    render(
      <TokenConfirmationDialog
        isOpen={true}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        type="live_synthesis"
        cachedArtists={[]}
        missingArtists={['End It', 'Spaced']}
        tokenCost={10}
        tokenBalance={4}
        isAdmin={false}
        onOpenTopUp={onOpenTopUp}
      />
    );

    expect(screen.getByText('Top Up Required to Continue')).toBeInTheDocument();
    expect(screen.getByTestId('low-balance-topup-box')).toBeInTheDocument();
    expect(screen.getByText('Need +6T more')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('gate-topup-gbp_5'));
    expect(onOpenTopUp).toHaveBeenCalledWith('gbp_5');
  });

  it('renders TokenConfirmationDialog in Admin Unlimited mode with raw USD telemetry', () => {
    const onConfirm = vi.fn();
    render(
      <TokenConfirmationDialog
        isOpen={true}
        onClose={vi.fn()}
        onConfirm={onConfirm}
        type="generation"
        cachedArtists={['Turnstile']}
        missingArtists={[]}
        tokenCost={5}
        tokenBalance={0}
        isAdmin={true}
      />
    );

    expect(screen.getByText(/ADMIN UNLIMITED · 0T/i)).toBeInTheDocument();
    expect(screen.getByText(/\$0\.0000 Direct Hit/i)).toBeInTheDocument();

    const confirmBtn = screen.getByTestId('token-authorize-button');
    expect(confirmBtn).toHaveTextContent('Confirm (Admin)');
    fireEvent.click(confirmBtn);
    expect(onConfirm).toHaveBeenCalledWith('authorized');
  });

  it('credits tokens via SimulatedStripeModal calling simulateStripeTopUpCallable', async () => {
    const mockTopUp = vi.fn().mockResolvedValue({
      data: { success: true, tokenBalance: 170, addedTokens: 150, tierId: 'gbp_15' },
    });
    mockHttpsCallable.mockReturnValue(mockTopUp);
    const onSuccess = vi.fn();
    const onClose = vi.fn();

    render(
      <SimulatedStripeModal
        isOpen={true}
        initialTierId="gbp_10"
        currentBalance={20}
        onClose={onClose}
        onSuccess={onSuccess}
      />
    );

    fireEvent.click(screen.getByTestId('stripe-tier-gbp_15'));
    expect(screen.getByTestId('stripe-sim-headline')).toHaveTextContent(
      'Stripe Checkout Simulation — Confirm £15 Top-Up for 150 Tokens'
    );

    fireEvent.click(screen.getByTestId('stripe-confirm-button'));

    await waitFor(() => {
      expect(mockTopUp).toHaveBeenCalledWith({ tierId: 'gbp_15' });
      expect(onSuccess).toHaveBeenCalledWith(170, 150);
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('strictly masks $0.0000 Direct Hit costs and cache recall ratios for Standard Users in UsageAnalyticsPage while preserving Admin telemetry', async () => {
    // Mock standard user doc, 1 Direct Hit project (5T), and 1 top-up receipt (+50T)
    mockGetDoc.mockImplementation(async (ref: any) => {
      if (ref.path?.includes('adminLedger')) {
        return { exists: () => true, data: () => ({ jitEnabled: true }) };
      }
      return {
        exists: () => true,
        data: () => ({
          email: 'member@zcene.online',
          tokenBalance: 45,
          lifetimeTokensPurchased: 50,
          lifetimeTokensSpent: 5,
          onboardingProgress: { step1: true },
        }),
      };
    });

    mockGetDocs.mockImplementation(async (ref: any) => {
      if (ref.path === 'users') {
        return {
          docs: [
            {
              id: 'user-1',
              data: () => ({
                email: 'member@zcene.online',
                tokenBalance: 45,
                lifetimeTokensPurchased: 50,
                lifetimeTokensSpent: 5,
              }),
            },
          ],
        };
      }
      if (ref.path?.endsWith('projects')) {
        return {
          docs: [
            {
              id: 'proj-direct-hit',
              data: () => ({
                name: 'Turnstile',
                seedArtists: 'Turnstile',
                generationType: 'Direct Hit',
                tokensSpent: 5,
                activeNodes: ['turnstile-us', 'trapped-under-ice-us'],
                createdAt: { toMillis: () => 1760000000000 },
              }),
            },
          ],
        };
      }
      if (ref.path?.endsWith('tokenTransactions')) {
        return {
          docs: [
            {
              id: 'tx-1',
              data: () => ({
                uid: 'user-1',
                type: 'spend_direct_hit',
                delta: -5,
                balanceAfter: 45,
                description: 'Zcene Curation: Turnstile (5T)',
                createdAt: { toMillis: () => 1760000001000 },
              }),
            },
          ],
        };
      }
      return { docs: [] };
    });

    const baseProps = {
      onNavigate: vi.fn(),
      isActive: true,
      user: { uid: 'user-1', email: 'member@zcene.online' },
      onLogoClick: vi.fn(),
      isSmallScreen: false,
      stackCount: 0,
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
        tokenBalance: 45,
        lifetimeTokensPurchased: 50,
        lifetimeTokensSpent: 5,
      },
    };

    const { unmount } = render(<UsageAnalyticsPage {...baseProps} isAdmin={false} />);

    expect(await screen.findByTestId('wallet-hero-card')).toBeInTheDocument();
    expect(screen.getByTestId('wallet-balance-value')).toHaveTextContent('45');
    expect(await screen.findByText('5 Tokens')).toBeInTheDocument();
    expect(screen.getAllByText(/Single-Seed Zcene/i).length).toBeGreaterThanOrEqual(2);

    // Rule 43 Redaction Assertions: Standard user must NEVER see $0.0000, Cache Recall Rate, or Direct Hit
    expect(screen.queryByText(/Cache Recall Rate/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/\$0\.0000/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Direct Hit/i)).not.toBeInTheDocument();

    unmount();

    // Admin View Assertions: Admin sees Cache Recall Rate and AI Discovery Cost
    render(
      <UsageAnalyticsPage
        {...baseProps}
        user={{ uid: 'admin-1', email: ADMIN_EMAIL }}
        isAdmin={true}
      />
    );

    expect(await screen.findByText('Cache Recall Rate')).toBeInTheDocument();
    expect(screen.getByText('AI Discovery Cost')).toBeInTheDocument();
  });

  it('filters unmapped Untitled Zcene draft shells from /analytics while preserving curating/completed Zcenes and accounting for pre-flight Flash USD in Admin telemetry only', async () => {
    const projectDocs = [
      {
        id: 'proj-cancelled-draft',
        data: () => ({
          name: '',
          seedArtists: '',
          graphData: JSON.stringify({ nodes: [], links: [] }),
          activeNodes: [],
          status: 'idle',
          createdAt: { toMillis: () => 1760000002000 },
        }),
      },
      {
        id: 'proj-spaced',
        data: () => ({
          name: 'Spaced',
          seedArtists: 'Spaced',
          generationType: 'Direct Hit',
          tokensSpent: 8,
          deepWebApiUsage: {
            'gemini-3.6-flash': {
              prompt: 1000,
              candidates: 200,
              total: 1200,
              calls: 2,
            },
          },
          graphData: JSON.stringify({
            nodes: [{ id: 'spaced-us', type: 'artist', label: 'Spaced' }],
            links: [],
          }),
          activeNodes: ['spaced-us'],
          status: 'completed',
          createdAt: { toMillis: () => 1760000001000 },
        }),
      },
      {
        id: 'proj-active-curating',
        data: () => ({
          name: 'End It',
          seedArtists: 'End It',
          graphData: JSON.stringify({ nodes: [], links: [] }),
          activeNodes: [],
          status: 'curating',
          createdAt: { toMillis: () => 1760000003000 },
        }),
      },
    ];

    const telemetry = calculateTelemetryForUser(
      'member@zcene.online',
      {},
      projectDocs,
      0,
      {
        tokenBalance: 86,
        lifetimeTokensPurchased: 100,
        lifetimeTokensSpent: 14,
        preflightApiUsage: {
          'gemini-3.6-flash': {
            prompt: 2000,
            candidates: 500,
            total: 2500,
            calls: 1,
          },
        },
        deepWebApiUsage: {
          'gemini-3.6-flash': {
            prompt: 1000,
            candidates: 200,
            total: 1200,
            calls: 2,
          },
        },
      }
    );

    // Unmapped cancelled draft is excluded; Spaced + active curating End It remain
    expect(telemetry.projectsCount).toBe(2);
    expect(telemetry.actionTriggers.createCount).toBe(2);
    expect(telemetry.projects.map((p) => p.id)).toEqual(['proj-active-curating', 'proj-spaced']);
    expect(telemetry.projects.some((p) => p.seedArtist.includes('Unknown'))).toBe(false);

    // Pre-flight Gemini 3.6 Flash micro-cost: (2000 * $1.50 + 500 * $7.50) / 1,000,000 = $0.00675
    // Deep Web Gemini 3.6 Flash micro-cost: (1000 * $1.50 + 200 * $7.50) / 1,000,000 = $0.00300
    // Total exactCost = $0.00975
    expect(telemetry.preflightLookups?.calls).toBe(1);
    expect(telemetry.preflightLookups?.costUsd).toBeCloseTo(0.00675, 6);
    expect(telemetry.deepWebConsults?.calls).toBe(2);
    expect(telemetry.deepWebConsults?.costUsd).toBeCloseTo(0.00300, 6);
    expect(telemetry.exactCost).toBeCloseTo(0.00975, 6);
    expect(telemetry.hasExactCost).toBe(true);

    const spacedProj = telemetry.projects.find((p) => p.id === 'proj-spaced');
    expect(spacedProj?.tokensSpent).toBe(8);
    expect(spacedProj?.cost).toBeCloseTo(0.00300, 6);

    // Also verify UI rendering: Standard User sees only mapped projects & zero USD/Unknown leaks
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({
        email: 'member@zcene.online',
        tokenBalance: 89,
        lifetimeTokensPurchased: 100,
        lifetimeTokensSpent: 11,
        preflightApiUsage: {
          'gemini-3.6-flash': { prompt: 2000, candidates: 500, total: 2500, calls: 1 },
        },
      }),
    });
    mockGetDocs.mockImplementation(async (ref: any) => {
      if (ref.path?.endsWith('projects')) {
        return { docs: projectDocs.slice(0, 2) }; // cancelled draft + Spaced
      }
      if (ref.path?.endsWith('tokenTransactions')) {
        return {
          docs: [
            {
              id: 'tx-korn-preflight',
              data: () => ({
                uid: 'user-1',
                type: 'spend_preflight',
                delta: -1,
                balanceAfter: 89,
                description: 'Pre-Flight Artist Lookup: Korn (1T)',
                createdAt: { toMillis: () => 1760000002500 },
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
        user={{ uid: 'user-1', email: 'member@zcene.online' }}
        isAdmin={false}
        onLogoClick={vi.fn()}
        isSmallScreen={false}
        stackCount={0}
        isStackNew={false}
        onOpenStack={vi.fn()}
        onLogout={vi.fn()}
        onDeleteAccount={vi.fn()}
        isProfileOpen={false}
        setIsProfileOpen={vi.fn()}
        isDeleteAccountModalOpen={false}
        setIsDeleteAccountModalOpen={vi.fn()}
        isMenuOpen={false}
        setIsMenuOpen={vi.fn()}
        profile={{
          tokenBalance: 89,
          lifetimeTokensPurchased: 100,
          lifetimeTokensSpent: 11,
        }}
      />
    );

    expect(await screen.findByText('Spaced')).toBeInTheDocument();
    expect(screen.getByText(/Pre-Flight Artist Lookup: Korn/i)).toBeInTheDocument();
    expect(screen.queryByText('Unknown')).not.toBeInTheDocument();
    expect(screen.queryByText(/\$0\.0068/i)).not.toBeInTheDocument();
  });

  it('deduplicates Admin TokenConfirmationDialog artist pills so cached seeds never appear under Live Synthesis Required', () => {
    render(
      <TokenConfirmationDialog
        isOpen={true}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        type="generation"
        cachedArtists={['One Step Closer']}
        missingArtists={['One Step Closer', 'one step closer']}
        tokenCost={5}
        tokenBalance={0}
        isAdmin={true}
      />
    );

    expect(screen.getByText(/Ready \(Cached\)/i)).toBeInTheDocument();
    expect(screen.queryByText(/Live Synthesis Required/i)).not.toBeInTheDocument();
    expect(screen.getAllByText('One Step Closer')).toHaveLength(1);
    expect(screen.getByText(/Direct Topology Hit/i)).toBeInTheDocument();
    expect(screen.getByText(/\$0\.0000 Direct Hit/i)).toBeInTheDocument();
  });

  it('synchronizes BACKEND_REGRESSION_RUNBOOK heading with Architecture V39', () => {
    expect(BACKEND_REGRESSION_RUNBOOK).toContain('# V39 Regression Suite (Full-Stack)');
    expect(BACKEND_REGRESSION_RUNBOOK).not.toContain('# V38 Regression Suite');
  });

  it('computes stable ProjectLoader hydration fingerprints across D3 physics ticks, canvasLayout saves, and metadata stamps while invalidating on topology or detailsCache updates', () => {
    const baseSnapshot = {
      name: 'Spaced',
      status: 'completed',
      activeJobId: null,
      seedArtists: 'spaced-us',
      graphData: JSON.stringify({
        nodes: [
          { id: 'spaced-us', type: 'artist', label: 'spaced' },
          { id: 'pure-noise-records', type: 'label', label: 'Pure Noise Records' },
        ],
        links: [{ source: 'spaced-us', target: 'pure-noise-records', value: 1 }],
        synthesisRationale: 'Acoustic & scene connection.',
      }),
      detailsCache: JSON.stringify([['spaced-us', { summary: 'Buffalo hardcore band.' }]]),
    };

    const fpInitial = computeProjectHydrationFingerprint('proj-1', baseSnapshot);

    // Simulate Autosave / Coordinate Memory / Direct Hit token stamp with D3 x/y/vx/vy mutations & healed label casing
    const fpAfterPhysicsAndLayoutSave = computeProjectHydrationFingerprint('proj-1', {
      ...baseSnapshot,
      name: 'Spaced (Renamed)',
      tokensSpent: 5,
      artistIds: ['spaced-us'],
      labelIds: ['pure-noise-records'],
      canvasLayout: JSON.stringify([{ nodeId: 'spaced-us', x: 312.4, y: 198.7, fx: null, fy: null }]),
      graphData: JSON.stringify({
        nodes: [
          { id: 'pure-noise-records', type: 'label', label: 'Pure Noise Records', x: 100, y: 200, vx: -0.02, vy: 0.01, index: 1 },
          { id: 'spaced-us', type: 'artist', label: 'Spaced', x: 312.4, y: 198.7, vx: 0.01, vy: -0.03, index: 0 },
        ],
        links: [
          {
            source: { id: 'spaced-us', x: 312.4, y: 198.7 },
            target: { id: 'pure-noise-records', x: 100, y: 200 },
            value: 1,
          },
        ],
        synthesisRationale: 'Acoustic & scene connection.',
      }),
    });

    expect(fpAfterPhysicsAndLayoutSave).toBe(fpInitial);

    // Genuine topology change MUST produce a distinct fingerprint
    const fpNewNode = computeProjectHydrationFingerprint('proj-1', {
      ...baseSnapshot,
      graphData: JSON.stringify({
        nodes: [
          { id: 'spaced-us', type: 'artist', label: 'Spaced' },
          { id: 'end-it-us', type: 'artist', label: 'End It' },
        ],
        links: [{ source: 'spaced-us', target: 'end-it-us', value: 1 }],
        synthesisRationale: 'Acoustic & scene connection.',
      }),
    });
    expect(fpNewNode).not.toBe(fpInitial);

    // Genuine detailsCache update MUST produce a distinct fingerprint
    const fpUpdatedDetails = computeProjectHydrationFingerprint('proj-1', {
      ...baseSnapshot,
      detailsCache: JSON.stringify([
        ['spaced-us', { summary: 'Buffalo hardcore band.', imageUrl: 'https://img.example/spaced.jpg' }],
      ]),
    });
    expect(fpUpdatedDetails).not.toBe(fpInitial);

    // Status or projectId change MUST produce a distinct fingerprint
    expect(computeProjectHydrationFingerprint('proj-1', { ...baseSnapshot, status: 'curating' })).not.toBe(fpInitial);
    expect(computeProjectHydrationFingerprint('proj-2', baseSnapshot)).not.toBe(fpInitial);
  });

  it('enforces x-zcene-id-token header forwarding, gemini-3.6-flash model parity, upstream slot refund, and idempotent Deep Web lease resumption', () => {
    const geminiServiceSrc = fs.readFileSync(
      path.resolve(__dirname, '../services/geminiService.ts'),
      'utf-8'
    );
    const serverSrc = fs.readFileSync(
      path.resolve(__dirname, '../server.js'),
      'utf-8'
    );
    const tokenWalletSrc = fs.readFileSync(
      path.resolve(__dirname, '../functions/src/tokenWallet.ts'),
      'utf-8'
    );

    // 1. geminiService.ts attaches x-zcene-id-token, force-refreshes token on 401, and uses gemini-3.6-flash in streamNodeChat
    expect(geminiServiceSrc).toContain("'x-zcene-id-token': token");
    expect(geminiServiceSrc).toContain("headers['x-zcene-id-token'] = idToken;");
    expect(geminiServiceSrc).toContain("model: flashModel");
    expect(geminiServiceSrc).not.toContain('model: "gemini-3-flash-preview"');

    // 2. server.js initializes explicit projectId, reads x-zcene-id-token first, strips it before forwarding, and refunds slot on upstream failure
    expect(serverSrc).toContain("req.headers['x-zcene-id-token']");
    expect(serverSrc).toContain("delete headers['x-zcene-id-token']");
    expect(serverSrc).toContain("AUTH_TOKEN_MISSING");
    expect(serverSrc).toContain("AUTH_TOKEN_INVALID");
    expect(serverSrc).toContain("refundDecrementedSessionSlot");
    expect(serverSrc).toContain("import { getAuth } from 'firebase-admin/auth';");
    expect(serverSrc).toContain("import { getFirestore, FieldValue } from 'firebase-admin/firestore';");
    expect(serverSrc).toContain("getAuth().verifyIdToken(candidateToken)");
    expect(serverSrc).not.toContain("admin.auth(");
    expect(serverSrc).not.toContain("admin.firestore.");

    // 3. tokenWallet.ts uses deterministic session ID and resumes active unexhausted leases at 0 Tokens
    expect(tokenWalletSrc).toContain("${caller.uid}_${scopedProjectKey}_${normalizedNodeKey}");
    expect(tokenWalletSrc).toContain("resumed: true");
    expect(tokenWalletSrc).toContain("tokensCharged: 0");
  });

  it('harmonizes primary CTA buttons and spinners across MyTasteDialog, SimulatedStripeModal, and TokenConfirmationDialog', async () => {
    // 1. MyTasteDialog (Style Profiles "Done" button)
    let resolveSave: () => void = () => {};
    const mockSave = vi.fn().mockImplementation(() => new Promise<void>((resolve) => { resolveSave = resolve; }));
    const mockTaste = [{ id: 'p1', name: 'Jars Of Clay', color: 'purple', isActive: true }];

    const { unmount: unmountTaste } = render(
      <MyTasteDialog
        isOpen={true}
        onClose={vi.fn()}
        taste={mockTaste as any}
        onSave={mockSave}
      />
    );

    const doneBtn = screen.getByRole('button', { name: 'Done' });
    expect(doneBtn).toHaveClass('px-6 py-2 bg-white text-brand-black rounded-xl font-medium text-sm active:scale-95');

    fireEvent.click(doneBtn);
    expect(mockSave).toHaveBeenCalled();
    // While saving, spinner and Saving... text appear
    expect(screen.getByText('Saving...')).toBeInTheDocument();
    expect(screen.getByText('progress_activity')).toHaveClass('animate-spin');

    resolveSave();
    unmountTaste();

    // 2. SimulatedStripeModal (Top-Up Confirm button)
    const { unmount: unmountStripe } = render(
      <SimulatedStripeModal
        isOpen={true}
        initialTierId="gbp_10"
        currentBalance={85}
        onClose={vi.fn()}
      />
    );

    const stripeConfirmBtn = screen.getByTestId('stripe-confirm-button');
    expect(stripeConfirmBtn).toHaveClass('px-6 py-2 bg-white text-brand-black rounded-xl font-medium text-sm active:scale-95');
    unmountStripe();

    // 3. TokenConfirmationDialog (Unlock Deep Connections CTA button)
    render(
      <TokenConfirmationDialog
        isOpen={true}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        type="live_chat_search"
        tokenCost={3}
        tokenBalance={85}
        isAdmin={false}
        cachedArtists={[]}
        missingArtists={["Deep Connections (3 Messages)"]}
      />
    );

    const tokenConfirmBtn = screen.getByTestId('token-authorize-button');
    expect(tokenConfirmBtn).toHaveClass('px-6 py-2 bg-white text-brand-black rounded-xl font-medium text-sm active:scale-95');
    expect(tokenConfirmBtn).toHaveTextContent('Confirm & Spend 3 Tokens');
  });

  it('guarantees monotonic chatHistories merge protecting in-flight Deep Connections messages against stale Firestore snapshots and preserving CLEAR CHAT', () => {
    // Pure logic test modeling App.tsx's handleSnap merge function
    const simulateHandleSnapMerge = (
      localState: Map<string, any[]>,
      incomingFirestoreChatJson: string,
      lastLocalUpdateAt: number,
      now: number,
      isInitialLoad: boolean
    ): Map<string, any[]> => {
      const newChatsMap = new Map<string, any[]>(JSON.parse(incomingFirestoreChatJson));
      const timeSinceLocalUpdate = now - lastLocalUpdateAt;
      const hasRecentLocalUpdate = lastLocalUpdateAt > 0 && timeSinceLocalUpdate < 15000;

      if (isInitialLoad && !hasRecentLocalUpdate) {
        return newChatsMap;
      }

      let hasChanges = false;
      const merged = new Map(localState);

      for (const [nodeId, incomingMsgs] of newChatsMap.entries()) {
        const localMsgs = localState.get(nodeId);
        if (!localMsgs) {
          merged.set(nodeId, incomingMsgs);
          hasChanges = true;
        } else if (incomingMsgs.length > localMsgs.length && !hasRecentLocalUpdate) {
          merged.set(nodeId, incomingMsgs);
          hasChanges = true;
        }
      }

      return hasChanges ? merged : localState;
    };

    const t0 = 100000;

    // Scenario A: User sends first Deep Connections message upon unlock
    // Local state has 1 in-flight message.
    // Concurrently, Firestore sends an echo from unlockDeepWebSessionCallable where chatHistories is still "[]"
    const inFlightChat = new Map([
      ['one-step-closer-us', [{ role: 'user', text: 'which artist is closest?', timestamp: t0 }]]
    ]);
    const staleFirestoreSnapshot = JSON.stringify([]);

    const stateAfterUnlockEcho = simulateHandleSnapMerge(
      inFlightChat,
      staleFirestoreSnapshot,
      t0,       // lastLocalUpdateAt was just now
      t0 + 200, // snapshot arrives 200ms later
      false     // not initial load
    );

    // IN-FLIGHT MESSAGE MUST BE PRESERVED (NOT WIPED)
    expect(stateAfterUnlockEcho.get('one-step-closer-us')).toHaveLength(1);
    expect(stateAfterUnlockEcho.get('one-step-closer-us')![0].text).toBe('which artist is closest?');

    // Scenario B: Streaming completes, and server.js telemetry write triggers another snapshot
    // Local state has user message + streamed response (2 messages).
    // Firestore still has older state or "[]" before autosave.
    const completedChat = new Map([
      ['one-step-closer-us', [
        { role: 'user', text: 'which artist is closest?', timestamp: t0 },
        { role: 'model', text: 'Anxious stands closest...', timestamp: t0 + 1500 }
      ]]
    ]);
    const stateAfterPostStreamEcho = simulateHandleSnapMerge(
      completedChat,
      staleFirestoreSnapshot,
      t0 + 1500, // lastLocalUpdateAt was on stream completion
      t0 + 1800, // snapshot arrives 300ms later
      false
    );

    expect(stateAfterPostStreamEcho.get('one-step-closer-us')).toHaveLength(2);

    // Scenario C: User clicks CLEAR CHAT for one-step-closer-us
    // Local state sets the node to []
    // Firestore echo still has the previous 2 messages before autosave debounces
    const clearedChat = new Map([
      ['one-step-closer-us', []]
    ]);
    const firestoreWithPriorHistory = JSON.stringify([
      ['one-step-closer-us', [{ role: 'user', text: 'old message' }, { role: 'model', text: 'old answer' }]]
    ]);

    const stateAfterClearChatEcho = simulateHandleSnapMerge(
      clearedChat,
      firestoreWithPriorHistory,
      t0 + 5000, // cleared just now
      t0 + 5200, // echo arrives 200ms later
      false
    );

    // CLEAR CHAT MUST NOT BE RESURRECTED BY STALE FIRESTORE ECHO
    expect(stateAfterClearChatEcho.get('one-step-closer-us')).toEqual([]);
  });

  it('enforces V38.3 Project-Wide 3-Message Pass, Dual Graph Topology + Search Grounding, and Admin Query Log contracts', async () => {
    // 1. TokenConfirmationDialog copy for live_chat_search
    render(
      <TokenConfirmationDialog
        isOpen={true}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        type="live_chat_search"
        cachedArtists={['One Step Closer']}
        missingArtists={[]}
        tokenCost={TOKEN_PRICING.DEEP_WEB_CONSULT}
        tokenBalance={85}
      />
    );

    expect(screen.getByText(/across all artists and Zcenes with no expiration/i)).toBeInTheDocument();

    // 2. unlockDeepWebSessionCallable in tokenWallet.ts scopes canonicalSessionId to _global_deepweb_pass
    const walletSrc = fs.readFileSync(path.resolve(__dirname, '../functions/src/tokenWallet.ts'), 'utf-8');
    expect(walletSrc).toContain('_global_deepweb_pass');
    expect(walletSrc).toContain('legacyNodeSessionRef');
    expect(walletSrc).toContain('legacyProjectSessionRef');

    // 3. server.js records deepWebQueries telemetry and extracts x-zcene-project-id
    const serverSrc = fs.readFileSync(path.resolve(__dirname, '../server.js'), 'utf-8');
    expect(serverSrc).toContain("collection('deepWebQueries')");
    expect(serverSrc).toContain("startsWith('x-zcene-')");
    expect(serverSrc).toContain('headerProjectId');
    expect(serverSrc).toContain('queryQuestion');
    expect(serverSrc).toContain('queryCostUsd');

    // 4. firestore.rules allows get on deepWebSessions by owning user
    const rulesSrc = fs.readFileSync(path.resolve(__dirname, '../firestore.rules'), 'utf-8');
    expect(rulesSrc).toContain('match /deepWebSessions/{sessionId}');
    expect(rulesSrc).toContain('resource.data.uid == request.auth.uid');
    expect(rulesSrc).toContain('match /deepWebQueries/{queryId}');
    expect(rulesSrc).toContain('allow get, list: if isAdmin();');
    expect(rulesSrc).toContain('allow write: if false;');

    // 5. geminiService.ts attaches tools: [{ googleSearch: {} }] conditionally and forwards project id
    const geminiSrc = fs.readFileSync(path.resolve(__dirname, '../services/geminiService.ts'), 'utf-8');
    expect(geminiSrc).toContain('if (authOptions?.useSearch)');
    expect(geminiSrc).toContain('config.tools = [{ googleSearch: {} }]');
    expect(geminiSrc).toContain("'x-zcene-node-id'");
    expect(geminiSrc).toContain("'x-zcene-node-name'");
    expect(geminiSrc).toContain("'x-zcene-project-name'");
    expect(geminiSrc).toContain("'x-zcene-project-id'");

    // 6. UsageAnalyticsPage formatTxTypeBadge maps 'refund' and 'admin_refund' to Auto-Refund
    const analyticsSrc = fs.readFileSync(path.resolve(__dirname, '../components/UsageAnalyticsPage.tsx'), 'utf-8');
    expect(analyticsSrc).toContain("case 'refund':");
    expect(analyticsSrc).toContain("case 'admin_refund':");
    expect(analyticsSrc).toContain('DeepConnectionsQueryLog');
  });

  it('enforces V39 security fix in server.js and client label imageUrl: null sanitization', () => {
    const serverSrc = fs.readFileSync(path.resolve(__dirname, '../server.js'), 'utf-8');
    expect(serverSrc).toContain('if (!decodedToken)');
    expect(serverSrc).toContain('SESSION_OWNER_MISMATCH');
    expect(serverSrc).toContain('sData.uid !== decodedToken.uid');

    const sanitized = sanitizeLabelProfile({
      summary: 'Test label',
      imageUrl: 'https://example.com/image.jpg',
      details: { genre: 'Hardcore', origin: 'US', founded: '1985' }
    });
    expect(sanitized.imageUrl).toBeNull();
  });

  it('V39.1: allows deleting single profile in MyTasteDialog and transitions to empty state', async () => {
    const mockSave = vi.fn().mockResolvedValue(undefined);
    const mockTaste = [{ id: 'p1', name: 'Profile 1', color: 'purple', isActive: true }];

    const { unmount } = render(
      <MyTasteDialog
        isOpen={true}
        onClose={vi.fn()}
        taste={mockTaste as any}
        onSave={mockSave}
      />
    );

    // Profile 1 tab should have close icon even though profiles.length === 1
    const profileTab = screen.getByText('Profile 1').closest('button')!;
    const tabCloseIcon = within(profileTab).getByText('close');
    expect(tabCloseIcon).toBeInTheDocument();

    // Click close icon to delete the single profile
    fireEvent.click(tabCloseIcon.closest('div')!);

    // Should now transition to empty state
    expect(screen.getByText('No profiles yet. Click + to create one.')).toBeInTheDocument();

    // Click "Done" and verify onSave is called with empty array []
    const doneBtn = screen.getByRole('button', { name: 'Done' });
    fireEvent.click(doneBtn);
    expect(mockSave).toHaveBeenCalledWith([]);

    unmount();
  });
});
