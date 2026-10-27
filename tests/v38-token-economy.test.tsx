import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import {
  ADMIN_EMAIL,
  TOKEN_PRICING,
  TOP_UP_TIERS,
  isAdminEmail,
  computeBaseProjectTokenCost,
  computeRemainingSettlementTokens,
} from '../shared/tokenEconomy';
import { TokenConfirmationDialog, SimulatedStripeModal } from '../components/SharedModals';
import { UsageAnalyticsPage } from '../components/UsageAnalyticsPage';
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
});
