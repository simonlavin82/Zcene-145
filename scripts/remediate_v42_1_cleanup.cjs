/**
 * scripts/remediate_v42_1_cleanup.cjs
 *
 * V42.1 Targeted Firestore Cache Remediation (`zcene-production`):
 *   1. Delete contaminated `labels/genie` (1956 Nashville Rockabilly imprint).
 *   2. Reset `artists/klear-th` cached topology (`graphData: null, hasUniqueSpiderweb: false`)
 *      so the next Klear (Thailand) curation regenerates a clean Thai spiderweb without `paradox-de`,
 *      while strictly preserving its verified Thai `detailsCache`, `synthesisRationale`, and `createdAt`.
 *   3. Backfill `disambiguationSnippet` on the `klear-th` candidate inside `artists/klear`
 *      while preserving `_isStub: true, isAmbiguous: true, redirectTo: null` and both `klear-us` + `klear-th`.
 *   4. Strictly NEVER modify `users/K3QqtNRg48X7I3C0Zu2PVPzRBSH3/projects/jU000m7fGZP3WHahvwzc`
 *      or any `users/{uid}/projects/*` document ([Rule 42] & [Rule 43]).
 *
 * Usage:
 *   node scripts/remediate_v42_1_cleanup.cjs --dry-run
 *   node scripts/remediate_v42_1_cleanup.cjs --execute
 */

const dns = require('dns');
const path = require('path');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const EXECUTE = process.argv.includes('--execute');

const stripMarkdown = (text) =>
  String(text || '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();

async function main() {
  // Fast DNS preflight so sandboxed offline mode fails cleanly in <10ms instead of hanging gRPC
  await dns.promises.lookup('firestore.googleapis.com');

  const saPath = path.resolve(__dirname, '../firebase-service-account.json');
  const serviceAccount = require(saPath);

  initializeApp({
    credential: cert(serviceAccount),
    projectId: 'zcene-production',
  });

  const db = getFirestore();
  console.log(`\n=== V42.1 Targeted Firestore Cleanup (${EXECUTE ? 'EXECUTE MODE' : 'DRY-RUN MODE'}) ===\n`);

  // 0. Read-only snapshot of user project to verify 100% Rule 42/43 immunity
  const projectRef = db.doc('users/K3QqtNRg48X7I3C0Zu2PVPzRBSH3/projects/jU000m7fGZP3WHahvwzc');
  const projectBefore = await projectRef.get();
  const projectUpdatedAtBefore = projectBefore.exists
    ? JSON.stringify(projectBefore.data().updatedAt || projectBefore.updateTime)
    : 'missing';
  console.log(`[Rule 42/43 Immunity Check] Project jU000m7fGZP3WHahvwzc exists=${projectBefore.exists}, updatedAt=${projectUpdatedAtBefore} (READ-ONLY — WILL NOT TOUCH)`);

  // 1. Inspect & delete `labels/genie`
  const genieRef = db.collection('labels').doc('genie');
  const genieSnap = await genieRef.get();
  if (genieSnap.exists) {
    const gData = genieSnap.data();
    console.log(`[1. labels/genie] Found contaminated label doc: origin="${gData?.detailsCache?.details?.origin}", genre="${gData?.detailsCache?.details?.genre}", founded="${gData?.detailsCache?.details?.founded}"`);
    if (EXECUTE) {
      await genieRef.delete();
      console.log(`   -> DELETED labels/genie`);
    } else {
      console.log(`   -> [DRY-RUN] Would delete labels/genie`);
    }
  } else {
    console.log(`[1. labels/genie] Already absent (no-op).`);
  }

  // 2. Inspect & reset topology on `artists/klear-th` (preserve detailsCache!)
  const klearThRef = db.collection('artists').doc('klear-th');
  const klearThSnap = await klearThRef.get();
  let extractedKlearThSnippet = 'Prominent Thai pop rock band formed in Bangkok, known for emotionally resonant stadium rock anthems.';

  if (klearThSnap.exists) {
    const ktData = klearThSnap.data();
    const ktSummary = stripMarkdown(ktData?.detailsCache?.summary || '');
    const firstSentenceMatch = ktSummary.match(/^(.+?[.!?])(?:\s|$)/);
    if (firstSentenceMatch && firstSentenceMatch[1].length >= 15) {
      extractedKlearThSnippet = firstSentenceMatch[1].trim();
    }
    console.log(`[2. artists/klear-th] Found: origin="${ktData?.detailsCache?.details?.origin}", genre="${ktData?.detailsCache?.details?.genre}", hasGraphData=${Boolean(ktData?.graphData)}, hasUniqueSpiderweb=${ktData?.hasUniqueSpiderweb}`);
    if (EXECUTE) {
      await klearThRef.update({
        graphData: null,
        hasUniqueSpiderweb: false,
      });
      console.log(`   -> UPDATED artists/klear-th: { graphData: null, hasUniqueSpiderweb: false } (detailsCache & createdAt preserved intact)`);
    } else {
      console.log(`   -> [DRY-RUN] Would update artists/klear-th with { graphData: null, hasUniqueSpiderweb: false }`);
    }
  } else {
    console.log(`[2. artists/klear-th] Missing! Unexpected.`);
  }

  // 3. Inspect & backfill `disambiguationSnippet` on `klear-th` inside `artists/klear`
  const klearStubRef = db.collection('artists').doc('klear');
  const klearStubSnap = await klearStubRef.get();
  if (klearStubSnap.exists) {
    const ksData = klearStubSnap.data();
    const candidates = Array.isArray(ksData?.candidates) ? ksData.candidates : [];
    const updatedCandidates = candidates.map((c) => {
      if (c && c.id === 'klear-th' && !c.disambiguationSnippet) {
        return {
          ...c,
          disambiguationSnippet: extractedKlearThSnippet,
        };
      }
      return c;
    });

    console.log(`[3. artists/klear] Found stub: _isStub=${ksData?._isStub}, isAmbiguous=${ksData?.isAmbiguous}, candidates=${JSON.stringify(candidates)}`);
    console.log(`   -> Enriched candidates preview: ${JSON.stringify(updatedCandidates)}`);

    if (EXECUTE) {
      await klearStubRef.update({
        _isStub: true,
        isAmbiguous: true,
        redirectTo: null,
        artistId: 'klear',
        cacheKey: 'klear',
        candidates: updatedCandidates,
      });
      console.log(`   -> UPDATED artists/klear candidates with klear-th disambiguationSnippet`);
    } else {
      console.log(`   -> [DRY-RUN] Would update artists/klear candidates with klear-th disambiguationSnippet`);
    }
  } else {
    console.log(`[3. artists/klear] Missing! Unexpected.`);
  }

  // Post-execution verification
  if (EXECUTE) {
    const [genieAfter, klearThAfter, klearStubAfter, projectAfter] = await Promise.all([
      genieRef.get(),
      klearThRef.get(),
      klearStubRef.get(),
      projectRef.get(),
    ]);
    const projectUpdatedAtAfter = projectAfter.exists
      ? JSON.stringify(projectAfter.data().updatedAt || projectAfter.updateTime)
      : 'missing';

    console.log(`\n=== POST-REMEDIATION VERIFICATION ===`);
    console.log(`- labels/genie exists: ${genieAfter.exists} (expected: false)`);
    console.log(`- artists/klear-th graphData: ${klearThAfter.data()?.graphData}, hasUniqueSpiderweb: ${klearThAfter.data()?.hasUniqueSpiderweb}, detailsCache.origin: "${klearThAfter.data()?.detailsCache?.details?.origin}"`);
    console.log(`- artists/klear isAmbiguous: ${klearStubAfter.data()?.isAmbiguous}, candidates:`, klearStubAfter.data()?.candidates);
    console.log(`- Project jU000m7fGZP3WHahvwzc untouched: ${projectUpdatedAtBefore === projectUpdatedAtAfter} (before=${projectUpdatedAtBefore}, after=${projectUpdatedAtAfter})`);
  }
}

main().catch((err) => {
  console.error('CLEANUP ERROR:', err.message || err);
  process.exit(1);
});

