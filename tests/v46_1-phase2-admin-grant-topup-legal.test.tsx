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

  it('exports Phase 2 flexible top-up presets [50, 100, 150], bounds (min 50), and GBP formatter at £0.10/T', () => {
    expect(TOP_UP_PRESET_QUANTITIES).toEqual([50, 100, 150]);
    expect(MIN_TOP_UP_TOKENS).toBe(50);
    expect(MAX_TOP_UP_TOKENS).toBe(1000);
    expect(ADMIN_GRANT_MAX_TOKENS).toBe(10000);
    expect(formatGbpFromTokens(50)).toBe('£5.00');
    expect(formatGbpFromTokens(100)).toBe('£10.00');
    expect(formatGbpFromTokens(150)).toBe('£15.00');
  });

  it('SimulatedStripeModal supports presets (50, 100, 150), scrollable body, spinnerless input, custom integer validation (min 50), and requires UK/EU waiver before confirm', async () => {
    const mockTopUp = vi.fn().mockResolvedValue({
      data: { success: true, mode: 'simulated', tokenBalance: 85, addedTokens: 75, quantity: 75, amountGbp: 7.5, currency: 'GBP' },
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

    // Scrollable ModalBody prevents CTA clipping on 13-inch laptop viewports
    const modalBody = screen.getByTestId('simulated-stripe-modal-body');
    expect(modalBody).toHaveClass('flex-1', 'min-h-0', 'overflow-y-auto');

    // Preset buttons exist and 100T (£10.00) carries the Popular badge
    expect(screen.getByTestId('topup-preset-50')).toHaveTextContent('£5.00');
    expect(screen.getByTestId('topup-preset-100')).toHaveTextContent('£10.00');
    expect(screen.getByTestId('topup-preset-100')).toHaveTextContent('Popular');
    expect(screen.getByTestId('topup-preset-150')).toHaveTextContent('£15.00');

    // Waiver starts unchecked -> Confirm button disabled
    const waiverCheckbox = screen.getByTestId('stripe-waiver-checkbox') as HTMLInputElement;
    const confirmBtn = screen.getByTestId('stripe-confirm-button');
    expect(waiverCheckbox.checked).toBe(false);
    expect(confirmBtn).toBeDisabled();

    // Terms link opens /terms in a new tab
    const termsLink = screen.getByTestId('stripe-waiver-terms-link');
    expect(termsLink).toHaveAttribute('href', '/terms');
    expect(termsLink).toHaveAttribute('target', '_blank');

    // Custom quantity input strips native number spinners
    const customInput = screen.getByTestId('topup-custom-quantity');
    expect(customInput.className).toContain('[appearance:textfield]');
    expect(customInput.className).toContain('[&::-webkit-inner-spin-button]:appearance-none');
    expect(customInput.className).toContain('[&::-webkit-outer-spin-button]:appearance-none');

    // Custom quantity below min 50 shows validation error and keeps Confirm disabled even when waiver checked
    fireEvent.click(waiverCheckbox);
    expect(waiverCheckbox.checked).toBe(true);
    fireEvent.change(customInput, { target: { value: '49' } });
    expect(screen.getByTestId('topup-quantity-error')).toBeInTheDocument();
    expect(confirmBtn).toBeDisabled();

    // Valid custom integer (75T -> £7.50) enables Confirm and calls simulateStripeTopUpCallable
    fireEvent.change(customInput, { target: { value: '75' } });
    expect(screen.getByTestId('topup-computed-price')).toHaveTextContent('£7.50');
    expect(confirmBtn).not.toBeDisabled();

    fireEvent.click(confirmBtn);
    await waitFor(() => {
      expect(mockTopUp).toHaveBeenCalledWith({ quantity: 75, waiverAccepted: true });
      expect(onSuccess).toHaveBeenCalledWith(85, 75);
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('shows pinned friendly error banner outside scrollable ModalBody when SimulatedStripeModal hits permission-denied', async () => {
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
      const errorBanner = screen.getByTestId('stripe-error-banner');
      expect(errorBanner).toHaveTextContent(/Live card checkout is coming soon/i);
      const modalBody = screen.getByTestId('simulated-stripe-modal-body');
      expect(modalBody.contains(errorBanner)).toBe(false);
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

    const adminGrantAmountInput = screen.getByTestId('admin-grant-amount');
    expect(adminGrantAmountInput.className).toContain('[appearance:textfield]');
    expect(adminGrantAmountInput.className).toContain('[&::-webkit-inner-spin-button]:appearance-none');
    expect(adminGrantAmountInput.className).toContain('[&::-webkit-outer-spin-button]:appearance-none');

    fireEvent.change(screen.getByTestId('admin-grant-email'), { target: { value: 'fan@example.com' } });
    fireEvent.change(adminGrantAmountInput, { target: { value: '20' } });
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

    // Ensure /terms & /help routes are wired in App.tsx and exempted with popstate re-guarding in GlobalWall.tsx
    const appSrc = fs.readFileSync(path.resolve(__dirname, '../App.tsx'), 'utf-8');
    const wallSrc = fs.readFileSync(path.resolve(__dirname, '../components/GlobalWall.tsx'), 'utf-8');
    expect(appSrc).toContain("pathname === '/terms'");
    expect(appSrc).toContain('[View.Terms]: \'/terms\'');
    expect(appSrc).toContain("if (hash && hash.startsWith('#/'))");
    expect(wallSrc).toContain("pathname === '/terms'");
    expect(wallSrc).toContain("pathname === '/help'");
    expect(wallSrc).toContain("window.addEventListener('popstate', syncPathname)");
  });
});
