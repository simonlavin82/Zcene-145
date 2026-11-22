import React from 'react';
import fs from 'fs';
import path from 'path';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SimulatedStripeModal } from '../components/SharedModals';
import { UsageAnalyticsPage } from '../components/UsageAnalyticsPage';
import { TermsPage } from '../components/TermsPage';
import { GlobalFooter } from '../components/GlobalFooter';
import {
  TOP_UP_PRESET_QUANTITIES,
  MIN_TOP_UP_TOKENS,
  MAX_TOP_UP_TOKENS,
  ADMIN_GRANT_MAX_TOKENS,
  formatGbpFromTokens,
  ADMIN_EMAIL,
  ADMIN_UID,
} from '../shared/tokenEconomy';
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
  appCheck: null,
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
  where: vi.fn(),
}));

describe('Phase 2 (v46.1): Admin Token Grant UI, Flexible Simulation Top-Up Modal & Legal Guardrails', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDoc.mockResolvedValue({ exists: () => true, data: () => ({ jitEnabled: true }) });
    mockGetDocs.mockResolvedValue({ docs: [] });
  });

  it('exports Phase 2 flexible top-up presets [5, 10, 25], bounds, and GBP formatter at £0.10/T', () => {
    expect(TOP_UP_PRESET_QUANTITIES).toEqual([5, 10, 25]);
    expect(MIN_TOP_UP_TOKENS).toBe(5);
    expect(MAX_TOP_UP_TOKENS).toBe(1000);
    expect(ADMIN_GRANT_MAX_TOKENS).toBe(10000);
    expect(formatGbpFromTokens(5)).toBe('£0.50');
    expect(formatGbpFromTokens(10)).toBe('£1.00');
    expect(formatGbpFromTokens(25)).toBe('£2.50');
  });

  it('SimulatedStripeModal supports presets (5, 10, 25), custom integer validation (min 5), and requires UK/EU waiver before confirm', async () => {
    const mockTopUp = vi.fn().mockResolvedValue({
      data: { success: true, mode: 'simulated', tokenBalance: 47, addedTokens: 37, quantity: 37, amountGbp: 3.7, currency: 'GBP' },
    });
    mockHttpsCallable.mockReturnValue(mockTopUp);
    const onSuccess = vi.fn();
    const onClose = vi.fn();

    render(
      <SimulatedStripeModal
        isOpen={true}
        currentBalance={10}
        onClose={onClose}
        onSuccess={onSuccess}
      />
    );

    // Preset buttons exist
    expect(screen.getByTestId('topup-preset-5')).toHaveTextContent('£0.50');
    expect(screen.getByTestId('topup-preset-10')).toHaveTextContent('£1.00');
    expect(screen.getByTestId('topup-preset-25')).toHaveTextContent('£2.50');

    // Waiver starts unchecked -> Confirm button disabled
    const waiverCheckbox = screen.getByTestId('stripe-waiver-checkbox') as HTMLInputElement;
    const confirmBtn = screen.getByTestId('stripe-confirm-button');
    expect(waiverCheckbox.checked).toBe(false);
    expect(confirmBtn).toBeDisabled();

    // Terms link opens /terms in a new tab
    const termsLink = screen.getByTestId('stripe-waiver-terms-link');
    expect(termsLink).toHaveAttribute('href', '/terms');
    expect(termsLink).toHaveAttribute('target', '_blank');

    // Custom quantity below min 5 shows validation error and keeps Confirm disabled even when waiver checked
    fireEvent.click(waiverCheckbox);
    expect(waiverCheckbox.checked).toBe(true);
    const customInput = screen.getByTestId('topup-custom-quantity');
    fireEvent.change(customInput, { target: { value: '3' } });
    expect(screen.getByTestId('topup-quantity-error')).toBeInTheDocument();
    expect(confirmBtn).toBeDisabled();

    // Valid custom integer (37T -> £3.70) enables Confirm and calls simulateStripeTopUpCallable
    fireEvent.change(customInput, { target: { value: '37' } });
    expect(screen.getByTestId('topup-computed-price')).toHaveTextContent('£3.70');
    expect(confirmBtn).not.toBeDisabled();

    fireEvent.click(confirmBtn);
    await waitFor(() => {
      expect(mockTopUp).toHaveBeenCalledWith({ quantity: 37, waiverAccepted: true });
      expect(onSuccess).toHaveBeenCalledWith(47, 37);
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('shows friendly message in SimulatedStripeModal when non-admin hits permission-denied in Simulation Mode', async () => {
    mockHttpsCallable.mockReturnValue(
      vi.fn().mockRejectedValue({ code: 'functions/permission-denied', message: 'Simulated token top-ups are disabled.' })
    );

    render(
      <SimulatedStripeModal
        isOpen={true}
        currentBalance={0}
        onClose={vi.fn()}
      />
    );

    fireEvent.click(screen.getByTestId('stripe-waiver-checkbox'));
    fireEvent.click(screen.getByTestId('stripe-confirm-button'));

    await waitFor(() => {
      expect(screen.getByText(/Live card checkout is coming soon/i)).toBeInTheDocument();
    });
  });

  it('renders Admin Token Grant card ONLY for Admins in UsageAnalyticsPage and submits adminGrantTokens', async () => {
    const mockGrant = vi.fn().mockResolvedValue({
      data: {
        success: true,
        targetUid: 'uid-99',
        targetEmail: 'fan@example.com',
        amount: 20,
        tokenBalance: 35,
        reason: 'Goodwill credit',
      },
    });
    mockHttpsCallable.mockReturnValue(mockGrant);

    const { rerender } = render(
      <UsageAnalyticsPage
        onNavigate={vi.fn()}
        isActive={true}
        user={{ uid: ADMIN_UID, email: ADMIN_EMAIL } as any}
        onLogoClick={vi.fn()}
        isSmallScreen={false}
        stackCount={0}
        isStackNew={false}
        onOpenStack={vi.fn()}
        onLogout={vi.fn()}
        onDeleteAccount={vi.fn()}
        isAdmin={true}
        isProfileOpen={false}
        setIsProfileOpen={vi.fn()}
        isDeleteAccountModalOpen={false}
        setIsDeleteAccountModalOpen={vi.fn()}
        isMenuOpen={false}
        setIsMenuOpen={vi.fn()}
      />
    );

    expect(screen.getByTestId('admin-token-grant-card')).toBeInTheDocument();

    fireEvent.change(screen.getByTestId('admin-grant-email'), { target: { value: 'fan@example.com' } });
    fireEvent.change(screen.getByTestId('admin-grant-amount'), { target: { value: '20' } });
    fireEvent.change(screen.getByTestId('admin-grant-reason'), { target: { value: 'Goodwill credit' } });
    fireEvent.click(screen.getByTestId('admin-grant-submit'));

    await waitFor(() => {
      expect(mockHttpsCallable).toHaveBeenCalledWith(expect.anything(), 'adminGrantTokens');
      expect(mockGrant).toHaveBeenCalledWith({
        email: 'fan@example.com',
        amount: 20,
        reason: 'Goodwill credit',
      });
      expect(screen.getByTestId('admin-grant-feedback')).toHaveTextContent('Granted +20T to fan@example.com (New balance: 35T).');
    });

    // Standard user never sees Admin Token Grant card
    rerender(
      <UsageAnalyticsPage
        onNavigate={vi.fn()}
        isActive={true}
        user={{ uid: 'member-1', email: 'member@example.com' } as any}
        onLogoClick={vi.fn()}
        isSmallScreen={false}
        stackCount={0}
        isStackNew={false}
        onOpenStack={vi.fn()}
        onLogout={vi.fn()}
        onDeleteAccount={vi.fn()}
        isAdmin={false}
        isProfileOpen={false}
        setIsProfileOpen={vi.fn()}
        isDeleteAccountModalOpen={false}
        setIsDeleteAccountModalOpen={vi.fn()}
        isMenuOpen={false}
        setIsMenuOpen={vi.fn()}
      />
    );
    expect(screen.queryByTestId('admin-token-grant-card')).not.toBeInTheDocument();
  });

  it('renders TermsPage with UK/EU waiver & 30-day service discontinuation GDPR wind-down clause, linked from GlobalFooter', () => {
    const onNavigate = vi.fn();
    render(<TermsPage onNavigate={onNavigate} />);

    expect(screen.getByTestId('terms-page')).toBeInTheDocument();
    expect(screen.getByTestId('terms-digital-waiver-section')).toHaveTextContent(/14-day statutory right of withdrawal/i);
    expect(screen.getByTestId('terms-discontinuation-section')).toHaveTextContent(/30 days' prior written notice/i);
    expect(screen.getByTestId('terms-discontinuation-section')).toHaveTextContent(/GDPR/i);
    expect(screen.getByTestId('terms-privacy-section')).toHaveTextContent(/support@zcene\.online/i);

    const footerNav = vi.fn();
    render(<GlobalFooter onNavigate={footerNav} />);
    const footerTermsBtn = screen.getAllByTestId('footer-terms-link').pop()!;
    fireEvent.click(footerTermsBtn);
    expect(footerNav).toHaveBeenCalledWith(View.Terms);

    // Ensure /terms route is wired in App.tsx and exempted in GlobalWall.tsx
    const appSrc = fs.readFileSync(path.resolve(__dirname, '../App.tsx'), 'utf-8');
    const wallSrc = fs.readFileSync(path.resolve(__dirname, '../components/GlobalWall.tsx'), 'utf-8');
    expect(appSrc).toContain("pathname === '/terms'");
    expect(appSrc).toContain('[View.Terms]: \'/terms\'');
    expect(wallSrc).toContain("pathname === '/terms'");
  });
});
