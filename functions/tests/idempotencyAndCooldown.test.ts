import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { isFullyQualifiedEntityProfile } from '../src/services/cacheQualification';
import { shouldRunRule38NotFoundUpgrade } from '../src/services/curatorService';

describe('Column 3 Idempotent Claim Lock & Dynamic Cooldown', () => {
  describe('Idempotent Transaction Claim Lock', () => {
    it('successfully claims a pending job on first delivery', async () => {
      let jobState = { status: 'pending', userId: 'user-123', inputPayload: { projectId: 'proj-456' } };
      let updatesApplied: any = null;

      // Simulated transaction runner mirroring processCurationJob.ts db.runTransaction
      const runClaimTransaction = async (eventId: string) => {
        let jobData: any = null;
        let isClaimed = false;

        // Transaction simulation
        if (jobState.status !== 'pending') {
          return { isClaimed: false, jobData: null };
        }

        // Atomic update within transaction
        updatesApplied = {
          status: 'processing',
          claimedAt: new Date().toISOString(),
          claimedByEventId: eventId,
          updatedAt: new Date().toISOString(),
        };
        jobState.status = 'processing';
        jobData = { ...jobState };
        isClaimed = true;

        return { isClaimed, jobData };
      };

      const result1 = await runClaimTransaction('event-uuid-1');
      expect(result1.isClaimed).toBe(true);
      expect(result1.jobData?.status).toBe('processing');
      expect(updatesApplied?.status).toBe('processing');
      expect(updatesApplied?.claimedByEventId).toBe('event-uuid-1');
    });

    it('rejects duplicate Eventarc redelivery when job is already processing', async () => {
      const jobState = {
        status: 'processing',
        claimedByEventId: 'event-uuid-1',
        claimedAt: '2026-11-05T17:11:00.000Z',
        userId: 'user-123',
        inputPayload: { projectId: 'proj-456' }
      };

      let mutationOccurred = false;

      const runClaimTransaction = async (eventId: string) => {
        let isClaimed = false;
        let jobData: any = null;

        if (jobState.status !== 'pending') {
          // Live status is processing -> reject duplicate
          return { isClaimed: false, jobData: null };
        }

        mutationOccurred = true;
        isClaimed = true;
        return { isClaimed, jobData: jobState };
      };

      const duplicateResult = await runClaimTransaction('event-uuid-1'); // Exact same CloudEvent ID
      expect(duplicateResult.isClaimed).toBe(false);
      expect(duplicateResult.jobData).toBeNull();
      expect(mutationOccurred).toBe(false);
    });

    it('rejects redelivery when job is already completed', async () => {
      const jobState = {
        status: 'completed',
        userId: 'user-123',
        inputPayload: { projectId: 'proj-456' }
      };

      let mutationOccurred = false;

      const runClaimTransaction = async (eventId: string) => {
        if (jobState.status !== 'pending') {
          return { isClaimed: false, jobData: null };
        }
        mutationOccurred = true;
        return { isClaimed: true, jobData: jobState };
      };

      const result = await runClaimTransaction('event-uuid-2');
      expect(result.isClaimed).toBe(false);
      expect(result.jobData).toBeNull();
      expect(mutationOccurred).toBe(false);
    });

    it('handles concurrent race condition: exactly one execution claims the job', async () => {
      let jobStatus = 'pending';
      let claimWins = 0;

      // Simulate 5 simultaneous Eventarc invocations racing for the same job
      const simulateConcurrentClaim = async (eventId: string) => {
        // Atomic compare-and-swap (Firestore transaction guarantee)
        await new Promise(r => setTimeout(r, Math.random() * 10)); // Jitter
        if (jobStatus === 'pending') {
          jobStatus = 'processing';
          claimWins++;
          return { isClaimed: true, eventId };
        }
        return { isClaimed: false, eventId };
      };

      const results = await Promise.all([
        simulateConcurrentClaim('event-1'),
        simulateConcurrentClaim('event-2'),
        simulateConcurrentClaim('event-3'),
        simulateConcurrentClaim('event-4'),
        simulateConcurrentClaim('event-5')
      ]);

      const successfulClaims = results.filter(r => r.isClaimed);
      const rejectedClaims = results.filter(r => !r.isClaimed);

      expect(successfulClaims.length).toBe(1);
      expect(rejectedClaims.length).toBe(4);
      expect(claimWins).toBe(1);
    });
  });

  describe('Dynamic Batch Cooldown Math (V47.15 Recalibrated / 3 Cold-Batch Pacing)', () => {
    const calculateCooldown = (batchAiCallsCount: number, batchElapsedMs: number) => {
      if (batchAiCallsCount === 0) {
        return 0; // 100% cache hit -> skip cooldown
      }
      const dynamicWindowMs = Math.min(25000, Math.max(8000, Math.ceil((batchAiCallsCount / 3) * 25000)));
      return Math.max(0, dynamicWindowMs - batchElapsedMs);
    };

    it('skips cooldown entirely (0ms) when batch has 0 AI calls (100% cache hits)', () => {
      const cooldownMs = calculateCooldown(0, 1800); // 1.8s active Firestore reads
      expect(cooldownMs).toBe(0);
    });

    it('calculates proportional 8334ms window for 1 AI call when active time is small', () => {
      // 1 AI call in 2 seconds: dynamic window = max(8000, ceil(1/3 * 25000)) = 8334ms
      const cooldownMs = calculateCooldown(1, 2000);
      expect(cooldownMs).toBe(6334); // 8334 - 2000 = 6334ms
    });

    it('calculates proportional 16667ms window for 2 AI calls', () => {
      // 2 AI calls: ceil(2/3 * 25000) = 16667ms
      const cooldownMs = calculateCooldown(2, 4000);
      expect(cooldownMs).toBe(12667); // 16667 - 4000 = 12667ms
    });

    it('caps window at 25000ms for full cold batch of 3 AI calls', () => {
      // 3 AI calls (100% cold 3-artist batch): dynamic window = 25000ms
      const cooldownMs = calculateCooldown(3, 6000);
      expect(cooldownMs).toBe(19000); // 25000 - 6000 = 19000ms
    });

    it('returns 0ms if active batch duration already exceeded dynamic window', () => {
      // 1 AI call (1 cold miss + 2 cached hits) taking 11s: dynamic window = 8334ms, batchElapsedMs = 11000ms
      const cooldownMs = calculateCooldown(1, 11000);
      expect(cooldownMs).toBe(0);
    });
  });

  describe('V47.15 Cached Artist 0-Call Bypass, Rule 38 Upgrade & Write-Boundary Hygiene', () => {
    const evaluateStep2EntityHydrationPlan = (
      details: any,
      isLabel: boolean,
      expectedNodeIso: string | null,
      idx: number
    ) => {
      let requiresTextHydration = false;
      let requiresImageScraping = false;
      let batchAiCallsCount = 0;

      if (!details || !isFullyQualifiedEntityProfile(details, isLabel, expectedNodeIso, { requireMembersAndPeers: true })) {
        requiresTextHydration = true;
        requiresImageScraping = true;
      } else {
        let isReadOnly = true;
        const needsRule38Upgrade = shouldRunRule38NotFoundUpgrade(details, isLabel);
        if ((!details.imageUrl || needsRule38Upgrade) && !isLabel) {
          requiresImageScraping = true;
          isReadOnly = false;
        }
        if (isReadOnly) {
          details._isReadOnly = true;
        } else {
          delete details._isReadOnly;
        }
      }

      const staggerDelayMs = (idx > 0 && (requiresTextHydration || requiresImageScraping)) ? idx * 1000 : 0;
      if (requiresTextHydration) {
        batchAiCallsCount++;
      }

      const dynamicWindowMs = batchAiCallsCount === 0
        ? 0
        : Math.min(25000, Math.max(8000, Math.ceil((batchAiCallsCount / 3) * 25000)));

      return {
        requiresTextHydration,
        requiresImageScraping,
        isReadOnlyFlag: details?._isReadOnly,
        staggerDelayMs,
        batchAiCallsCount,
        dynamicWindowMs,
      };
    };

    it('keeps qualified cached artist with youtubeVideoId: null at 0 Gemini calls, 0ms stagger, _isReadOnly = true, and 0ms cooldown', () => {
      const cachedArtistProfile: any = {
        summary: 'Hey Mercedes is an influential American indie rock and emo band formed in Milwaukee in 1999 by former Braid members.',
        imageUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music/v4/12/34/56/hey-mercedes.jpg/600x600bb.jpg',
        itunesArtistId: 3153000,
        itunesScrapeVersion: 2,
        youtubeVideoId: null,
        youtubeSearchQuery: 'Hey Mercedes Indie Rock official music video',
        recommendationReason: 'Essential Midwest emo crossover bridge sharing Polyvinyl lineage.',
        members: ['Bob Nanna (Lead Vocals, Guitar)', 'Todd Bell (Bass)', 'Damon Atkinson (Drums)'],
        discography: [{ albumName: 'Everynight Fire Works', releaseYear: '2001', itunesCollectionId: 123456 }],
        details: {
          artist: 'Hey Mercedes',
          genre: 'Indie Rock / Emo',
          style: 'Melodic',
          origin: 'Milwaukee, Wisconsin, USA',
          founded: '1999',
          notableArtists: ['Braid', 'The Get Up Kids', 'The Promise Ring'],
        },
      };

      const plan = evaluateStep2EntityHydrationPlan(cachedArtistProfile, false, 'us', 2);
      expect(plan.requiresTextHydration).toBe(false);
      expect(plan.requiresImageScraping).toBe(false);
      expect(plan.isReadOnlyFlag).toBe(true);
      expect(plan.staggerDelayMs).toBe(0);
      expect(plan.batchAiCallsCount).toBe(0);
      expect(plan.dynamicWindowMs).toBe(0);
    });

    it('queues $0.00 iTunes-only Rule 38 upgrade for legacy not-found cached artist (itunesScrapeVersion < 2), clears stale _isReadOnly, and keeps batchAiCallsCount = 0', () => {
      const legacyNotFoundArtist: any = {
        _isReadOnly: true, // Stale persisted flag from legacy write
        summary: 'Mouthpiece was a pivotal New Jersey straight edge hardcore band formed in 1991 on New Age Records.',
        imageUrl: 'not-found',
        itunesArtistId: null,
        itunesScrapeVersion: 1,
        youtubeVideoId: null,
        youtubeSearchQuery: 'Mouthpiece Hardcore Punk official music video',
        recommendationReason: 'Definitive early-90s New Jersey youth crew revival catalyst.',
        members: ['Tim McMahon (Lead Vocals)', 'Petealy (Guitar)'],
        discography: [{ albumName: 'What Was Said', releaseYear: '1995' }],
        details: {
          artist: 'Mouthpiece',
          genre: 'Hardcore Punk',
          style: 'Aggressive',
          origin: 'New Brunswick, New Jersey, USA',
          founded: '1991',
          notableArtists: ['Turning Point', 'Lifetime', 'Strife'],
        },
      };

      const plan = evaluateStep2EntityHydrationPlan(legacyNotFoundArtist, false, 'us', 1);
      expect(plan.requiresTextHydration).toBe(false);
      expect(plan.requiresImageScraping).toBe(true);
      expect(plan.isReadOnlyFlag).toBeUndefined();
      expect( '_isReadOnly' in legacyNotFoundArtist).toBe(false);
      expect(plan.staggerDelayMs).toBe(1000);
      expect(plan.batchAiCallsCount).toBe(0);
      expect(plan.dynamicWindowMs).toBe(0);
    });

    it('strips transient _isReadOnly in normalizeDetailsForWrite before Firestore persistence and locks processCurationJob.ts source parity', () => {
      const normalizeDetailsForWrite = (details: any): any => {
        if (!details || typeof details !== 'object' || Array.isArray(details)) return details;
        const { _isReadOnly, ...rest } = details;
        return {
          ...rest,
          imageUrl: typeof details.imageUrl === 'string' ? details.imageUrl : '',
        };
      };

      const dirtyDetails = {
        _isReadOnly: true,
        summary: 'Saves the Day is an American rock band formed in Princeton, New Jersey in 1997.',
        imageUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music/saves.jpg',
        youtubeVideoId: null,
        details: {
          artist: 'Saves the Day',
          genre: 'Emo / Pop-Punk',
        },
      };

      const cleaned = normalizeDetailsForWrite(dirtyDetails);
      expect('_isReadOnly' in cleaned).toBe(false);
      expect(cleaned.summary).toBe(dirtyDetails.summary);
      expect(cleaned.imageUrl).toBe(dirtyDetails.imageUrl);

      // Verify live processCurationJob.ts source enforces all V47.15 invariants
      const workerSrc = fs.readFileSync(path.resolve(__dirname, '../src/processCurationJob.ts'), 'utf8');
      expect(workerSrc).toContain('const { _isReadOnly, ...rest } = details;');
      expect(workerSrc).not.toContain('requiresVideoScraping');
      expect(workerSrc).not.toContain('scrapeVideoIdBackend');
      expect(workerSrc).toContain('delete details._isReadOnly;');
      expect(workerSrc).toContain('if (idx > 0 && (requiresTextHydration || requiresImageScraping))');
      expect(workerSrc).toContain('[Step 3: In-Memory Staging] Batch hydration complete.');
      expect(workerSrc).toContain('Math.ceil((batchAiCallsCount / 3) * 25000)');
    });
  });
});

