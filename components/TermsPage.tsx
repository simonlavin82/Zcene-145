import React, { useEffect, useRef } from 'react';
import { View } from '../types';
import { User } from 'firebase/auth';
import Header from './Header';
import { GlobalFooter } from './GlobalFooter';
import { BackButton } from './DesignSystem';
import {
  ZCENE_SUPPORT_EMAIL,
  ZCENE_SUPPORT_MAILTO,
} from '../shared/tokenEconomy';

export interface TermsPageProps {
  onNavigate: (view: View) => void;
  onNavigateMenu?: (path: string) => void;
  isActive?: boolean;
  user?: User | null;
  onLogoClick?: () => void;
  isSmallScreen?: boolean;
  stackCount?: number;
  isStackNew?: boolean;
  onOpenStack?: () => void;
  onLogout?: () => void;
  onDeleteAccount?: () => void;
  isAdmin?: boolean;
  isProfileOpen?: boolean;
  setIsProfileOpen?: (open: boolean) => void;
  isDeleteAccountModalOpen?: boolean;
  setIsDeleteAccountModalOpen?: (open: boolean) => void;
  isMenuOpen?: boolean;
  setIsMenuOpen?: (open: boolean) => void;
  onRestartWalkthrough?: () => void;
  onClose?: () => void;
  tokenBalance?: number;
}

export const TermsPage: React.FC<TermsPageProps> = ({
  onNavigate,
  onNavigateMenu,
  isActive = true,
  user = null,
  onLogoClick,
  isSmallScreen = false,
  stackCount = 0,
  isStackNew = false,
  onOpenStack = () => {},
  onLogout = () => {},
  onDeleteAccount = () => {},
  isAdmin = false,
  isProfileOpen = false,
  setIsProfileOpen = () => {},
  isDeleteAccountModalOpen = false,
  setIsDeleteAccountModalOpen = () => {},
  isMenuOpen = false,
  setIsMenuOpen = () => {},
  onRestartWalkthrough,
  onClose,
  tokenBalance = 0,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isActive && containerRef.current && typeof containerRef.current.scrollTo === 'function') {
      containerRef.current.scrollTo(0, 0);
    }
  }, [isActive]);

  return (
    <div
      ref={containerRef}
      data-testid="terms-page"
      className="h-screen w-screen bg-background-dark text-zinc-200 font-sans overflow-y-auto overflow-x-hidden flex flex-col"
    >
      <Header
        user={user}
        onLogoClick={onLogoClick || (() => onNavigate(View.Home))}
        isSmallScreen={isSmallScreen}
        stackCount={stackCount}
        isStackNew={isStackNew}
        onOpenStack={onOpenStack}
        onNavigate={onNavigateMenu || ((p) => onNavigate(p as View))}
        onLogout={onLogout}
        onDeleteAccount={onDeleteAccount}
        isAdmin={isAdmin}
        isProfileOpen={isProfileOpen}
        setIsProfileOpen={setIsProfileOpen}
        isDeleteAccountModalOpen={isDeleteAccountModalOpen}
        setIsDeleteAccountModalOpen={setIsDeleteAccountModalOpen}
        isMenuOpen={isMenuOpen}
        setIsMenuOpen={setIsMenuOpen}
        onRestartWalkthrough={onRestartWalkthrough}
        tokenBalance={tokenBalance}
      />

      <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-10 flex-grow">
        <div className="max-w-3xl mx-auto space-y-10">
          <div className="pt-4">
            <BackButton
              onClose={onClose}
              onNavigate={onNavigateMenu || onNavigate}
              fallbackView={user ? View.Dashboard : View.Home}
            />
          </div>

          <header className="border-b border-zinc-800 pb-6 space-y-2">
            <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-primary font-semibold">
              Legal & Digital Goods Policy
            </span>
            <h1 className="text-3xl sm:text-4xl font-medium text-white tracking-tight">
              Terms of Service &amp; Privacy
            </h1>
            <p className="text-xs font-mono text-zinc-500">
              Last updated: November 2026 · Contact: {ZCENE_SUPPORT_EMAIL}
            </p>
          </header>

          <section className="space-y-3" data-testid="terms-digital-waiver-section">
            <h2 className="text-xl font-medium text-white">
              1. Pay-As-You-Go Digital Tokens &amp; UK/EU Immediate Delivery Waiver
            </h2>
            <p className="text-sm text-zinc-400 leading-relaxed">
              Zcene operates on a pay-as-you-go prepaid token model with no recurring subscriptions. Purchased digital tokens are credited immediately to your authenticated Zcene wallet upon checkout confirmation.
            </p>
            <p className="text-sm text-zinc-400 leading-relaxed">
              In accordance with the UK Consumer Contracts (Information, Cancellation and Additional Charges) Regulations 2013 and EU Consumer Rights Directive (Article 16(m)), by ticking the checkout waiver checkbox you expressly request immediate digital delivery of tokens and acknowledge that you waive your 14-day statutory right of withdrawal once the tokens are credited to your account. Tokens that have been spent on completed curations, artist lookups, or Deep Connections sessions are non-refundable.
            </p>
          </section>

          <section className="space-y-3" data-testid="terms-refund-guarantee-section">
            <h2 className="text-xl font-medium text-white">
              2. Automated System-Error Refund Guarantee
            </h2>
            <p className="text-sm text-zinc-400 leading-relaxed">
              If a curation pipeline fails due to an AI generation failure, backend timeout, or system error before delivering a completed Zcene, spent settlement tokens are refunded automatically back to your wallet balance and recorded in your immutable Discovery Ledger. If you believe an error was not refunded automatically, email{' '}
              <a href={ZCENE_SUPPORT_MAILTO} className="text-primary hover:underline font-mono">
                {ZCENE_SUPPORT_EMAIL}
              </a>{' '}
              with your account email and project title for manual review.
            </p>
          </section>

          <section className="space-y-3" data-testid="terms-discontinuation-section">
            <h2 className="text-xl font-medium text-white">
              3. 30-Day Service Discontinuation &amp; GDPR Wind-Down Clause
            </h2>
            <p className="text-sm text-zinc-400 leading-relaxed">
              Zcene is an independent music discovery service. Should we ever decide to permanently discontinue the service, we commit to providing at least <strong className="text-zinc-200">30 days&apos; prior written notice</strong> via your registered Google Sign-In email address and a prominent in-app banner.
            </p>
            <p className="text-sm text-zinc-400 leading-relaxed">
              During the 30-day wind-down period, you may continue spending any remaining tokens, request a pro-rata refund of unused purchased tokens by emailing{' '}
              <a href={ZCENE_SUPPORT_MAILTO} className="text-primary hover:underline font-mono">
                {ZCENE_SUPPORT_EMAIL}
              </a>
              , or delete your account directly. Upon completion of the 30-day wind-down window, all personal account data (including email addresses, saved workspaces, and session records) will be permanently erased in full compliance with UK GDPR and EU GDPR Article 17 (Right to Erasure), save for minimal anonymised financial records required by statutory tax law.
            </p>
          </section>

          <section className="space-y-3" data-testid="terms-privacy-section">
            <h2 className="text-xl font-medium text-white">
              4. Account Data, Privacy &amp; Self-Service Deletion
            </h2>
            <p className="text-sm text-zinc-400 leading-relaxed">
              We collect only the Google Sign-In email address and profile display name necessary to authenticate your account, persist your private Zcene workspaces, and maintain your immutable token wallet ledger. We do not sell personal data or display third-party advertising. You may decline optional Google Analytics telemetry via the consent banner and may permanently delete your account at any time from your Profile menu (recent Google re-authentication is verified for your security).
            </p>
            <p className="text-sm text-zinc-400 leading-relaxed">
              Voluntary self-service account deletion permanently erases your Google login link, profile, Zcenes, Zines, saved Stack, Style profiles, shared links, and personal query records in accordance with UK GDPR and EU GDPR Article 17. Any remaining unused token balance or active Deep Connections pass is permanently forfeited and non-refundable upon voluntary deletion. Minimal anonymised aggregate billing totals (containing zero personal data) are retained exclusively for statutory tax and accounting compliance.
            </p>
            <p className="text-sm text-zinc-400 leading-relaxed">
              For privacy inquiries, GDPR data requests, or billing support, contact{' '}
              <a href={ZCENE_SUPPORT_MAILTO} className="text-primary hover:underline font-mono">
                {ZCENE_SUPPORT_EMAIL}
              </a>.
            </p>
          </section>
        </div>
      </main>

      <GlobalFooter onNavigate={onNavigate} isAdmin={isAdmin} currentView={View.Terms} />
    </div>
  );
};

export default TermsPage;
