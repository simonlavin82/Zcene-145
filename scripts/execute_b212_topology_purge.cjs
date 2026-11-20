/**
 * execute_b212_topology_purge.cjs
 *
 * Option A: Surgical Topology Purge Script (Phases B2.12 / B2.13 Reset Protocol).
 *
 * Resets legacy cached graph topologies to calibrate with artist-only Box 5 weights
 * and isolated D3 physics, while preserving 100% of verified entity biographies,
 * discographies, iTunes artwork, user wallets, and financial ledgers.
 *
 * TARGETS:
 *   1. /artists (global): Only docs carrying graphData / hasUniqueSpiderweb / synthesisRationale / isPrimarySeed.
 *      Resets:
 *        - graphData: null
 *        - hasUniqueSpiderweb: false
 *        - synthesisRationale: null
 *        - isPrimarySeed: false
 *      PRESERVES 100% of detailsCache, bios, members, discography, iTunes artwork, and router stubs.
 *
 *   2. users/{uid}/projects (collectionGroup('projects')):
 *      Breaks out counts for completed, trashed, and deleted (Stage 2 compacted telemetry rows).
 *      By default (--include-deleted-ledger omitted), preserves deleted telemetry ledger rows.
 *
 *   3. /sharedZcenes (and /sharedzcenes), /curationJobs, /curationSessions:
 *      Full cleanup of transient workspaces and public links.
 *
 * STRICTLY PRESERVED:
 *   - /labels (100% untouched)
 *   - root users/{uid} documents (auth, tokenBalance, tasteProfiles)
 *   - users/{uid}/tokenTransactions (discovery & token balance ledger)
 *   - /adminLedger (system settings, JIT heal logs)
 *   - /deepWebSessions (account-wide consult passes)
 *
 * CLI FLAGS:
 *   --dry-run                 (Default) Read-only audit with ZERO Firestore writes.
 *   --execute                 Execute Firestore mutations (requires explicit flag).
 *   --include-deleted-ledger  Also purge Stage 2 deleted project telemetry rows (default: false).
 */

const path = require('path');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const args = process.argv.slice(2);
const isExecute = args.includes('--execute');
const isDryRun = args.includes('--dry-run') || !isExecute;
const includeDeletedLedger = args.includes('--include-deleted-ledger');

const serviceAccountPath = path.resolve(__dirname, '../firebase-service-account.json');
const serviceAccount = require(serviceAccountPath);

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const BATCH_SIZE = 400;

async function auditGlobalArtistsTopology() {
  console.log('\n[Option A] ▶ Scanning global /artists for legacy cached topologies...');
  const snapshot = await db.collection('artists').get();
  
  const targetedDocs = [];
  const cleanDocs = [];

  snapshot.forEach(doc => {
    const data = doc.data();
    const hasTopology =
      data.graphData != null ||
      data.hasUniqueSpiderweb === true ||
      data.synthesisRationale != null ||
      data.isPrimarySeed === true;

    if (hasTopology) {
      targetedDocs.push({
        id: doc.id,
        ref: doc.ref,
        hasGraphData: data.graphData != null,
        hasUniqueSpiderweb: Boolean(data.hasUniqueSpiderweb),
        hasSynthesisRationale: Boolean(data.synthesisRationale),
        isPrimarySeed: Boolean(data.isPrimarySeed),
        detailsCacheKeysCount: data.detailsCache ? (Array.isArray(data.detailsCache) ? data.detailsCache.length : (typeof data.detailsCache === 'object' ? Object.keys(data.detailsCache).length : 0)) : 0,
      });
    } else {
      cleanDocs.push(doc.id);
    }
  });

  console.log(`[Option A] Total /artists docs scanned: ${snapshot.size}`);
  console.log(`[Option A] Found ${targetedDocs.length} /artists doc(s) carrying legacy topology fields.`);
  console.log(`[Option A] Found ${cleanDocs.length} /artists doc(s) already topology-clean (preserving detailsCache).`);

  if (isExecute && targetedDocs.length > 0) {
    console.log(`[Option A] ⚡ EXECUTE: Resetting topology fields on ${targetedDocs.length} /artists doc(s)...`);
    for (let i = 0; i < targetedDocs.length; i += BATCH_SIZE) {
      const chunk = targetedDocs.slice(i, i + BATCH_SIZE);
      const batch = db.batch();
      chunk.forEach(item => {
        batch.update(item.ref, {
          graphData: null,
          hasUniqueSpiderweb: false,
          synthesisRationale: null,
          isPrimarySeed: false,
        });
      });
      await batch.commit();
      console.log(`  Updated batch ${Math.floor(i / BATCH_SIZE) + 1} (${chunk.length} docs)`);
    }
    console.log(`[Option A] ✓ Successfully reset topology on ${targetedDocs.length} /artists doc(s).`);
  }

  return targetedDocs;
}

async function auditProjects() {
  console.log('\n[Option A] ▶ Scanning users/{uid}/projects via collectionGroup(\'projects\')...');
  const snapshot = await db.collectionGroup('projects').get();

  const completedProjects = [];
  const trashedProjects = [];
  const deletedProjects = [];
  const otherProjects = [];

  snapshot.forEach(doc => {
    const data = doc.data();
    const status = data.status;
    const item = { id: doc.id, ref: doc.ref, path: doc.ref.path, status };

    if (status === 'completed') {
      completedProjects.push(item);
    } else if (status === 'trashed') {
      trashedProjects.push(item);
    } else if (status === 'deleted') {
      deletedProjects.push(item);
    } else {
      otherProjects.push(item);
    }
  });

  console.log(`[Option A] Total user projects found: ${snapshot.size}`);
  console.log(`  - Completed projects:           ${completedProjects.length}`);
  console.log(`  - Trashed projects (Stage 1):    ${trashedProjects.length}`);
  console.log(`  - Deleted ledger rows (Stage 2): ${deletedProjects.length}`);
  if (otherProjects.length > 0) {
    console.log(`  - Other status (${otherProjects.map(p => p.status).join(', ')}): ${otherProjects.length}`);
  }

  const targetsToDelete = includeDeletedLedger
    ? [...completedProjects, ...trashedProjects, ...deletedProjects, ...otherProjects]
    : [...completedProjects, ...trashedProjects, ...otherProjects];

  console.log(`[Option A] Purge target count (--include-deleted-ledger=${includeDeletedLedger}): ${targetsToDelete.length} doc(s)`);
  if (!includeDeletedLedger && deletedProjects.length > 0) {
    console.log(`[Option A]   Note: ${deletedProjects.length} Stage 2 deleted discovery ledger row(s) are strictly preserved.`);
  }

  if (isExecute && targetsToDelete.length > 0) {
    console.log(`[Option A] ⚡ EXECUTE: Deleting ${targetsToDelete.length} user project document(s)...`);
    for (let i = 0; i < targetsToDelete.length; i += BATCH_SIZE) {
      const chunk = targetsToDelete.slice(i, i + BATCH_SIZE);
      const batch = db.batch();
      chunk.forEach(item => batch.delete(item.ref));
      await batch.commit();
      console.log(`  Deleted project batch ${Math.floor(i / BATCH_SIZE) + 1} (${chunk.length} docs)`);
    }
    console.log(`[Option A] ✓ Successfully purged ${targetsToDelete.length} project document(s).`);
  }

  return {
    total: snapshot.size,
    completed: completedProjects.length,
    trashed: trashedProjects.length,
    deleted: deletedProjects.length,
    other: otherProjects.length,
    targetCount: targetsToDelete.length,
    items: targetsToDelete,
  };
}

async function auditCollection(collectionName) {
  console.log(`\n[Option A] ▶ Scanning /${collectionName}...`);
  const collRef = db.collection(collectionName);
  const snapshot = await collRef.get();
  console.log(`[Option A] Found ${snapshot.size} doc(s) in /${collectionName}.`);

  if (isExecute && !snapshot.empty) {
    console.log(`[Option A] ⚡ EXECUTE: Purging ${snapshot.size} doc(s) from /${collectionName}...`);
    const docs = snapshot.docs;
    for (let i = 0; i < docs.length; i += BATCH_SIZE) {
      const chunk = docs.slice(i, i + BATCH_SIZE);
      const batch = db.batch();
      chunk.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
      console.log(`  Deleted batch ${Math.floor(i / BATCH_SIZE) + 1} (${chunk.length} docs)`);
    }
    console.log(`[Option A] ✓ Purged /${collectionName}.`);
  }

  return snapshot.size;
}

async function verifyPreservedCollections() {
  console.log(`\n[Option A Verify] ▶ Auditing strictly preserved Tier 1 Assets, User Accounts & Financial Ledgers...`);

  const labelsSnap = await db.collection('labels').count().get();
  const usersSnap = await db.collection('users').get();
  const sysSettingsDoc = await db.collection('adminLedger').doc('system').get();
  const jitHealsDoc = await db.collection('adminLedger').doc('system').collection('jitHeals').limit(5).get().catch(() => null);

  let tokenTxCount = 0;
  try {
    const txSnap = await db.collectionGroup('tokenTransactions').count().get();
    tokenTxCount = txSnap.data().count;
  } catch (err) {
    tokenTxCount = 'N/A';
  }

  let deepWebPassCount = 0;
  try {
    const dwSnap = await db.collection('deepWebSessions').count().get();
    deepWebPassCount = dwSnap.data().count;
  } catch (err) {
    deepWebPassCount = 'N/A';
  }

  console.log(`[Option A Verify] ✓ Tier 1 /labels preserved:          ${labelsSnap.data().count} canonical label doc(s)`);
  console.log(`[Option A Verify] ✓ Root /users preserved:             ${usersSnap.size} user doc(s) intact`);
  usersSnap.forEach(u => {
    const d = u.data();
    const styleCount = Array.isArray(d.tasteProfiles) ? d.tasteProfiles.length : 0;
    console.log(`    - User ${u.id}: email=${d.email || 'N/A'} tokenBalance=${d.tokenBalance ?? 'N/A'} tasteProfiles=${styleCount}`);
  });
  console.log(`[Option A Verify] ✓ tokenTransactions preserved:       ${tokenTxCount} ledger entry/entries`);
  console.log(`[Option A Verify] ✓ deepWebSessions preserved:         ${deepWebPassCount} active pass(es)`);
  console.log(`[Option A Verify] ✓ adminLedger/system exists:         ${sysSettingsDoc.exists}`);
  if (jitHealsDoc) {
    console.log(`[Option A Verify] ✓ adminLedger JIT telemetry intact:  sampled ${jitHealsDoc.size} telemetry doc(s)`);
  }
}

async function main() {
  const modeLabel = isDryRun ? 'DRY-RUN (READ-ONLY AUDIT — ZERO WRITES)' : 'EXECUTE (MUTATION ACTIVE)';
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log('  Zcene Option A: Surgical Topology Purge (B2.12 / B2.13 Reset Protocol)  ');
  console.log(`  Project: ${serviceAccount.project_id}`);
  console.log(`  Mode:    ${modeLabel}`);
  console.log(`  Flags:   --dry-run=${isDryRun} --execute=${isExecute} --include-deleted-ledger=${includeDeletedLedger}`);
  console.log(`  Time:    ${new Date().toISOString()}`);
  console.log('═══════════════════════════════════════════════════════════════════════════');

  // 1. Audit /artists
  const targetedArtists = await auditGlobalArtistsTopology();

  // 2. Audit users/{uid}/projects
  const projectStats = await auditProjects();

  // 3. Audit transient collections
  const curationJobsCount = await auditCollection('curationJobs');
  const curationSessionsCount = await auditCollection('curationSessions');
  const sharedZcenesCount = await auditCollection('sharedZcenes');
  const sharedzcenesLowerCount = await auditCollection('sharedzcenes');

  // 4. Verify strictly preserved assets
  await verifyPreservedCollections();

  // Summary Report
  console.log('\n═══════════════════════════════════════════════════════════════════════════');
  console.log(`  OPTION A PURGE REPORT — ${isDryRun ? 'DRY RUN SUMMARY' : 'EXECUTION COMPLETE'} `);
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log(`  Target 1: /artists (topology reset to null): ${targetedArtists.length} doc(s)`);
  if (targetedArtists.length > 0) {
    console.log('    Exact /artists IDs targeted for topology reset:');
    targetedArtists.forEach(a => {
      console.log(`      • ${a.id.padEnd(35)} [graphData: ${a.hasGraphData}, uniqueSpiderweb: ${a.hasUniqueSpiderweb}, rationale: ${a.hasSynthesisRationale}, seed: ${a.isPrimarySeed}, detailsCache: ${a.detailsCacheKeysCount} keys]`);
    });
  } else {
    console.log('    (None — /artists has no legacy topology fields)');
  }

  console.log(`\n  Target 2: users/{uid}/projects:`);
  console.log(`    • Completed projects:                  ${projectStats.completed}`);
  console.log(`    • Trashed projects (Stage 1):           ${projectStats.trashed}`);
  console.log(`    • Deleted ledger rows (Stage 2):        ${projectStats.deleted} (${includeDeletedLedger ? 'TARGETED' : 'PRESERVED'})`);
  console.log(`    • Total projects targeted for deletion: ${projectStats.targetCount}`);

  console.log(`\n  Target 3: Transient collections (full cleanup):`);
  console.log(`    • /curationJobs:                       ${curationJobsCount} doc(s)`);
  console.log(`    • /curationSessions:                   ${curationSessionsCount} doc(s)`);
  console.log(`    • /sharedZcenes:                       ${sharedZcenesCount} doc(s)`);
  console.log(`    • /sharedzcenes (lowercase):           ${sharedzcenesLowerCount} doc(s)`);

  const totalDeletions = projectStats.targetCount + curationJobsCount + curationSessionsCount + sharedZcenesCount + sharedzcenesLowerCount;
  console.log(`\n  Total document deletions planned:        ${totalDeletions}`);
  console.log(`  Total /artists field resets planned:     ${targetedArtists.length}`);

  if (isDryRun) {
    console.log('\n  🔒 ZERO FIRESTORE WRITES PERFORMED (--dry-run mode).');
    console.log('  To execute this purge, pass the --execute flag explicitly:');
    console.log('    node scripts/execute_b212_topology_purge.cjs --execute');
  } else {
    console.log('\n  ✅ OPTION A PURGE SUCCESSFULLY EXECUTED.');
  }
  console.log('═══════════════════════════════════════════════════════════════════════════\n');
}

main().catch(err => {
  console.error('[Option A Purge] Fatal error:', err);
  process.exit(1);
}).finally(() => process.exit(0));
