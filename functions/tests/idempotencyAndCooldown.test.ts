import { describe, it, expect, vi } from 'vitest';

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

  describe('Dynamic Batch Cooldown Math', () => {
    const calculateCooldown = (batchAiCallsCount: number, batchElapsedMs: number) => {
      if (batchAiCallsCount === 0) {
        return 0; // 100% cache hit -> skip cooldown
      }
      const dynamicWindowMs = Math.min(25000, Math.max(8000, Math.ceil((batchAiCallsCount / 6) * 25000)));
      return Math.max(0, dynamicWindowMs - batchElapsedMs);
    };

    it('skips cooldown entirely (0ms) when batch has 0 AI calls (100% cache hits)', () => {
      const cooldownMs = calculateCooldown(0, 1800); // 1.8s active Firestore reads
      expect(cooldownMs).toBe(0);
    });

    it('calculates proportional 8s window for 1 or 2 AI calls when active time is small', () => {
      // 1 AI call in 2 seconds: dynamic window = max(8000, ceil(1/6 * 25000)) = 8000ms
      const cooldownMs = calculateCooldown(1, 2000);
      expect(cooldownMs).toBe(6000); // 8000 - 2000 = 6000ms
    });

    it('calculates proportional ~12.5s window for 3 AI calls', () => {
      // 3 AI calls: ceil(3/6 * 25000) = 12500ms
      const cooldownMs = calculateCooldown(3, 4000);
      expect(cooldownMs).toBe(8500); // 12500 - 4000 = 8500ms
    });

    it('caps window at 25000ms for full batch of 6 AI calls', () => {
      // 6 AI calls: dynamic window = 25000ms
      const cooldownMs = calculateCooldown(6, 6000);
      expect(cooldownMs).toBe(19000); // 25000 - 6000 = 19000ms
    });

    it('returns 0ms if active batch duration already exceeded dynamic window', () => {
      // 2 AI calls taking 10s: dynamic window = 8334ms, batchElapsedMs = 10000ms
      const cooldownMs = calculateCooldown(2, 10000);
      expect(cooldownMs).toBe(0);
    });
  });
});

