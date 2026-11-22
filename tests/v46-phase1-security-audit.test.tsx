import React from 'react';
import fs from 'fs';
import path from 'path';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { translateError } from '../services/errorTranslationLayer';
import { CreateProjectCard } from '../components/CreateProjectCard';
import Dashboard from '../components/Dashboard';
import { Project } from '../types';

vi.mock('../services/firebase', () => ({
  db: {},
  auth: {},
  functions: {},
  appCheck: null,
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: vi.fn(),
  getDocs: vi.fn(),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  onSnapshot: vi.fn(() => () => {}),
  serverTimestamp: vi.fn(),
  query: vi.fn((ref) => ref),
  where: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
}));

const readRepoFile = (relPath: string) =>
  fs.readFileSync(path.resolve(__dirname, '..', relPath), 'utf-8');

describe('Phase 1 Pre-Launch Security Rules, Endpoint Gating, Concurrency UX & App Check Readiness (v46.0)', () => {
  describe('1. firestore.rules Hardening', () => {
    const rulesSrc = readRepoFile('firestore.rules');

    it('strictly blocks client create and update on curationJobs/{jobId}', () => {
      const curationJobsBlock = rulesSrc.slice(
        rulesSrc.indexOf('match /curationJobs/{jobId}'),
        rulesSrc.indexOf('match /curationLocks/{userId}')
      );
      expect(curationJobsBlock).toContain('allow create: if false;');
      expect(curationJobsBlock).toContain('allow update: if false;');
      expect(curationJobsBlock).not.toContain("incoming().status == 'pending'");
      expect(curationJobsBlock).not.toContain("incoming().status == 'cancelled'");
    });

    it('fixes && vs || operator precedence in /artists and /labels update rules so unauthenticated writes are impossible', () => {
      const artistsBlock = rulesSrc.slice(
        rulesSrc.indexOf('match /artists/{cacheKey}'),
        rulesSrc.indexOf('match /labels/{cacheKey}')
      );
      expect(artistsBlock).toMatch(/allow update:\s*if isSignedIn\(\) && \(\s*\(/);

      const labelsBlock = rulesSrc.slice(
        rulesSrc.indexOf('match /labels/{cacheKey}'),
        rulesSrc.indexOf('match /curationJobs/{jobId}')
      );
      expect(labelsBlock).toMatch(/allow update:\s*if isSignedIn\(\) && \(\s*\(/);
    });

    it('enforces client-writable allowlist and lastTopUpAt null guard on users/{userId}', () => {
      expect(rulesSrc).toContain('function clientWritableUserKeys()');
      const usersBlock = rulesSrc.slice(
        rulesSrc.indexOf('match /users/{userId}'),
        rulesSrc.indexOf('match /tokenTransactions/{txId}')
      );
      expect(usersBlock).toContain('incoming().keys().hasOnly([');
      expect(usersBlock).toContain("(!('lastTopUpAt' in incoming()) || incoming().lastTopUpAt == null)");
      expect(usersBlock).toContain('.affectedKeys()');
      expect(usersBlock).toContain('.hasOnly(clientWritableUserKeys())');
    });

    it('protects server-owned telemetry and billing fields on users/{userId}/projects/{projectId}', () => {
      const projectsBlock = rulesSrc.slice(
        rulesSrc.indexOf('match /projects/{projectId}'),
        rulesSrc.indexOf('match /stack/{itemId}')
      );
      expect(projectsBlock).toContain("(!('apiUsage' in incoming()) || incoming().apiUsage == null || isAdmin())");
      expect(projectsBlock).toContain("(!('deepWebApiUsage' in incoming()) || incoming().deepWebApiUsage == null || isAdmin())");
      expect(projectsBlock).toContain("(!('anchorResolution' in incoming()) || incoming().anchorResolution == null || isAdmin())");
      expect(projectsBlock).toContain("(!('generationType' in incoming()) || incoming().generationType == null || isAdmin())");
      expect(projectsBlock).toContain("['tokensSpent', 'apiUsage', 'deepWebApiUsage', 'anchorResolution', 'generationType']");
      expect(projectsBlock).toContain("(!('deepWebApiUsage' in resource.data) || resource.data.deepWebApiUsage == null)");
    });

    it('defines Admin-only curationLocks/{userId} rule with owner/admin get only', () => {
      const locksBlock = rulesSrc.slice(
        rulesSrc.indexOf('match /curationLocks/{userId}'),
        rulesSrc.indexOf('match /adminLedger/system')
      );
      expect(locksBlock).toContain('allow get: if isOwner(userId) || isAdmin();');
      expect(locksBlock).toContain('allow list, write: if false;');
    });
  });

  describe('2. Dev/Unauthenticated Endpoint Gating & Admin Alignment', () => {
    it('gates simulateStripeTopUpCallable behind caller.isAdmin and ALLOW_SIMULATED_TOPUP === "true"', () => {
      const tokenWalletSrc = readRepoFile('functions/src/tokenWallet.ts');
      expect(tokenWalletSrc).toContain('if (!caller.isAdmin || process.env.ALLOW_SIMULATED_TOPUP !== "true")');
      expect(tokenWalletSrc).toContain('Simulated token top-ups are disabled in this environment.');
    });

    it('requires Firebase authentication in healOrphanedAsset', () => {
      const healSrc = readRepoFile('functions/src/healOrphanedAsset.ts');
      expect(healSrc).toContain('requireAuthenticatedCaller(request);');
    });

    it('requires Firebase Bearer auth on POST /api/artist/scrape-video-id and enforces UID + email + email_verified admin check in server.js', () => {
      const serverSrc = readRepoFile('server.js');
      expect(serverSrc).toContain("const ADMIN_UID = '9FBuWDALnNfUAjxV0pRe3RnKwJy1';");
      expect(serverSrc).toContain('decodedToken.uid === ADMIN_UID &&');
      expect(serverSrc).toContain('callerEmail === ADMIN_EMAIL &&');
      expect(serverSrc).toContain('decodedToken.email_verified === true');

      const scrapeIdx = serverSrc.indexOf("app.post('/api/artist/scrape-video-id'");
      const scrapeSlice = serverSrc.slice(scrapeIdx, scrapeIdx + 1400);
      expect(scrapeSlice).toContain('getAuth().verifyIdToken(candidateToken)');
      expect(scrapeSlice).toContain('res.status(401)');
    });
  });

  describe('3. Firebase App Check Readiness (reCAPTCHA Enterprise, Monitor Mode)', () => {
    it('conditionally initializes ReCaptchaEnterpriseProvider in services/firebase.ts before testConnection with Vitest & dev debug-token guards', () => {
      const firebaseSrc = readRepoFile('services/firebase.ts');
      expect(firebaseSrc).toContain("import { initializeAppCheck, ReCaptchaEnterpriseProvider, type AppCheck } from 'firebase/app-check';");
      expect(firebaseSrc).toContain("import.meta.env.MODE === 'test'");
      expect(firebaseSrc).toContain('VITE_RECAPTCHA_SITE_KEY');
      expect(firebaseSrc).toContain('FIREBASE_APPCHECK_DEBUG_TOKEN');
      expect(firebaseSrc).toContain('new ReCaptchaEnterpriseProvider(recaptchaSiteKey)');
      expect(firebaseSrc.indexOf('initializeAppCheck')).toBeLessThan(firebaseSrc.indexOf('testConnection();'));
    });

    it('wires enforceAppCheck (env-driven Monitor Mode default false) into all 7 onCall functions and exports reapStaleCurationJobs', () => {
      const tokenWalletSrc = readRepoFile('functions/src/tokenWallet.ts');
      const pipelineSrc = readRepoFile('functions/src/executeCurationPipeline.ts');
      const healSrc = readRepoFile('functions/src/healOrphanedAsset.ts');
      const betaSrc = readRepoFile('functions/src/verifyBetaPassword.ts');
      const indexSrc = readRepoFile('functions/src/index.ts');
      const reaperSrc = readRepoFile('functions/src/reapStaleCurationJobs.ts');

      expect(tokenWalletSrc).toContain('export const ENFORCE_APP_CHECK = process.env.ENFORCE_APP_CHECK === "true";');
      // 3 onCall functions in tokenWallet.ts
      expect((tokenWalletSrc.match(/enforceAppCheck:\s*ENFORCE_APP_CHECK/g) || []).length).toBe(3);
      // 2 onCall functions in executeCurationPipeline.ts
      expect((pipelineSrc.match(/enforceAppCheck:\s*ENFORCE_APP_CHECK/g) || []).length).toBe(2);
      // 1 onCall function in healOrphanedAsset.ts
      expect((healSrc.match(/enforceAppCheck:\s*ENFORCE_APP_CHECK/g) || []).length).toBe(1);
      // 1 onCall function in verifyBetaPassword.ts
      expect(betaSrc).toContain('enforceAppCheck: process.env.ENFORCE_APP_CHECK === "true"');

      // Scheduled stale-job reaper exported
      expect(reaperSrc).toContain('schedule: "every 5 minutes"');
      expect(reaperSrc).toContain('recoverStaleCurationLock');
      expect(indexSrc).toContain('reapStaleCurationJobs');
    });
  });

  describe('4. Frontend Concurrency Lock UX & Error Translation', () => {
    it('translates ACTIVE_CURATION_IN_PROGRESS before RESOURCE_EXHAUSTED so it never misreports as a 429 rate limit', () => {
      const err = {
        code: 'functions/resource-exhausted',
        message: 'RESOURCE_EXHAUSTED: ACTIVE_CURATION_IN_PROGRESS: You already have a Zcene curating.',
      };
      const translated = translateError(err);
      expect(translated.userFriendlyMessage).toContain('Another Zcene is already curating');
      expect(translated.userFriendlyMessage).not.toContain('Operational limits exceeded');
    });

    it('renders "Curation in Progress — View Active Zcene" on CreateProjectCard and routes click to active project', () => {
      const onCreateProject = vi.fn();
      const onViewActiveCuration = vi.fn();
      const activeProj: Project = {
        id: 'proj-curating-1',
        name: 'Turnstile Scene',
        seedArtists: 'Turnstile',
        status: 'curating',
        activeJobId: 'job-123',
        updatedAt: Date.now(),
      } as any;

      const { rerender } = render(
        <CreateProjectCard
          onCreateProject={onCreateProject}
          activeCuratingProject={activeProj}
          onViewActiveCuration={onViewActiveCuration}
        />
      );

      const lockBtn = screen.getByTestId('create-project-card-curating-lock');
      expect(lockBtn).toHaveTextContent('Curation in Progress — View Active Zcene');
      fireEvent.click(lockBtn);
      expect(onViewActiveCuration).toHaveBeenCalledWith('proj-curating-1');
      expect(onCreateProject).not.toHaveBeenCalled();

      // When no project is curating, restores normal Create New Zcene card
      rerender(
        <CreateProjectCard
          onCreateProject={onCreateProject}
          activeCuratingProject={null}
          onViewActiveCuration={onViewActiveCuration}
        />
      );
      const createBtn = screen.getByTestId('create-project-card');
      expect(createBtn).toHaveTextContent('Create New Zcene');
      fireEvent.click(createBtn);
      expect(onCreateProject).toHaveBeenCalledTimes(1);
    });

    it('shows active-curation lock state in Dashboard and opens active Zcene on click instead of creating a second project', () => {
      const onCreateProject = vi.fn();
      const onSelectProject = vi.fn();
      const curatingProj: Project = {
        id: 'proj-live-99',
        name: 'Fugazi',
        seedArtists: 'Fugazi',
        status: 'curating',
        activeJobId: 'job-live-99',
        updatedAt: Date.now(),
      } as any;

      render(
        <Dashboard
          user={{ uid: 'u1', email: 'member@zcene.online', displayName: 'Member' } as any}
          projects={[curatingProj]}
          stack={[]}
          isStackNew={false}
          onSelectProject={onSelectProject}
          onCreateProject={onCreateProject}
          onDeleteProject={vi.fn()}
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
          activeCuratingProject={curatingProj}
        />
      );

      const lockCard = screen.getByTestId('create-project-card-curating-lock');
      expect(lockCard).toHaveTextContent('Curation in Progress — View Active Zcene');
      fireEvent.click(lockCard);
      expect(onSelectProject).toHaveBeenCalledWith('proj-live-99');
      expect(onCreateProject).not.toHaveBeenCalled();
    });

    it('wires pre-flight 1-at-a-time concurrency guard and 10-minute staleness window in App.tsx', () => {
      const appSrc = readRepoFile('App.tsx');
      expect(appSrc).toContain('export const STALE_CURATION_UI_MS = 10 * 60 * 1000;');
      expect(appSrc).toContain('export function findActiveCuratingProject(');
      expect(appSrc).toContain('const isActiveCurationLock =');
      expect(appSrc).toContain("includes('ACTIVE_CURATION_IN_PROGRESS')");
      expect(appSrc).toContain('activeCuratingProject={activeCuratingProject}');
    });
  });
});
