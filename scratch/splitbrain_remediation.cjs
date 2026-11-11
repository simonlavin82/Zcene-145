/**
 * Split-Brain Remediation Script — Fix E
 * 
 * Converts orphaned raw-seed-name artist documents (e.g. artists/buggin — created by
 * the misrouted synthesisRationale write-back at processCurationJob.ts L748) into
 * redirectTo pointer documents, matching the established mergeAndCleanupArtists pattern.
 *
 * Safety rails:
 *   - Never deletes any document
 *   - Only overwrites docs confirmed to be 2-field orphan stubs (synthesisRationale + cachedAt only)
 *   - Dry-run mode: node scratch/splitbrain_remediation.cjs --dry-run
 *   - All writes are individual with await + catch per document
 *
 * Aligns with architecture_truth.md Law §6 (no orphaned alias fields).
 */

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const serviceAccount = require('../firebase-service-account.json');

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const DRY_RUN = process.argv.includes('--dry-run');

const KNOWN_COUNTRY_SLUGS = [
  '-united-states', '-united-kingdom', '-global', '-australia', '-canada',
  '-germany', '-france', '-japan', '-sweden', '-italy', '-spain', '-brazil',
  '-mexico', '-netherlands', '-belgium', '-norway', '-finland', '-denmark',
  '-ireland', '-new-zealand', '-poland', '-austria', '-switzerland',
  '-uk', '-usa', '-us', '-gb', '-au', '-ca', '-de', '-fr', '-jp',
  '-se', '-it', '-es', '-br', '-mx', '-nl', '-be', '-no', '-fi',
  '-dk', '-ie', '-nz', '-pl', '-at', '-ch'
];

function hasCountrySuffix(docId) {
  return KNOWN_COUNTRY_SLUGS.some(s => docId.toLowerCase().endsWith(s));
}

async function run() {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`SPLIT-BRAIN REMEDIATION SCRIPT — Fix E`);
  console.log(`Mode: ${DRY_RUN ? '🔍 DRY RUN (no writes)' : '⚡ LIVE EXECUTION'}`);
  console.log(`${'═'.repeat(60)}\n`);

  // Step 1: Scan all artists documents for orphan stubs.
  // Orphan criteria: doc ID has NO country suffix + only synthesisRationale + cachedAt fields.
  console.log('Scanning artists/ collection for orphan stubs...\n');
  const allArtistsSnap = await db.collection('artists').get();

  const orphans = [];
  for (const snap of allArtistsSnap.docs) {
    const docId = snap.id;
    const data = snap.data();
    const fields = Object.keys(data);

    // Must not already be a redirect pointer
    if (data.redirectTo) continue;

    // Must not have a country slug (that would make it a canonical doc)
    if (hasCountrySuffix(docId)) continue;

    // Must be exactly a 2-field stub: synthesisRationale + cachedAt (optionally updatedAt)
    const meaningfulFields = fields.filter(f => !['cachedAt', 'updatedAt'].includes(f));
    const isOrphanStub = (
      meaningfulFields.length === 1 &&
      meaningfulFields[0] === 'synthesisRationale' &&
      !data.detailsCache &&
      !data.graphData &&
      !data.artistId &&
      !data.cacheKey
    );

    if (isOrphanStub) {
      orphans.push({ docId, data, fields });
    }
  }

  console.log(`Found ${orphans.length} orphan stub(s):\n`);
  orphans.forEach(o => console.log(`  → artists/${o.docId}  [fields: ${o.fields.join(', ')}]`));

  if (orphans.length === 0) {
    console.log('\n✅ No orphan stubs found. Database is clean.');
    return;
  }

  console.log('\n');

  let fixed = 0;
  let skipped = 0;
  let errors = 0;

  for (const orphan of orphans) {
    const { docId, data } = orphan;
    console.log(`\nProcessing orphan: artists/${docId}`);

    // Step 2: Find the corresponding canonical slug document.
    // Use the same range query as Column 2 / Fix A dedup logic.
    let canonicalId = null;
    try {
      const dedupSnap = await db.collection('artists')
        .where('artistId', '>=', docId)
        .where('artistId', '<=', `${docId}\uf8ff`)
        .limit(5)
        .get();

      for (const snap of dedupSnap.docs) {
        const snapData = snap.data();
        if (snap.id !== docId && snapData.artistId && snapData.artistId.startsWith(docId)) {
          // Prefer the doc with graphData (most populated canonical record)
          if (snapData.graphData || !canonicalId) {
            canonicalId = snap.id;
          }
          if (snapData.graphData) break;
        }
      }
    } catch (err) {
      console.error(`  ❌ Range query failed for "${docId}":`, err.message);
      errors++;
      continue;
    }

    if (!canonicalId) {
      console.warn(`  ⚠️  No canonical slug doc found for "${docId}". Skipping — manual review required.`);
      skipped++;
      continue;
    }

    console.log(`  Canonical target: artists/${canonicalId}`);

    // Step 3: Optionally merge synthesisRationale into canonical doc if absent there.
    if (data.synthesisRationale) {
      try {
        const canonicalSnap = await db.collection('artists').doc(canonicalId).get();
        if (canonicalSnap.exists) {
          const canonicalData = canonicalSnap.data();
          if (!canonicalData.synthesisRationale) {
            console.log(`  Merging synthesisRationale into artists/${canonicalId} (it was absent)...`);
            if (!DRY_RUN) {
              await db.collection('artists').doc(canonicalId).update({
                synthesisRationale: data.synthesisRationale,
                updatedAt: FieldValue.serverTimestamp()
              });
            }
            console.log(`  ${DRY_RUN ? '[DRY RUN] Would merge' : '✅ Merged'} synthesisRationale → artists/${canonicalId}`);
          } else {
            console.log(`  synthesisRationale already present on artists/${canonicalId} — merge is a no-op.`);
          }
        }
      } catch (mergeErr) {
        console.warn(`  ⚠️  Could not read/merge canonical doc "${canonicalId}":`, mergeErr.message);
      }
    }

    // Step 4: Overwrite orphan with a redirect pointer (same pattern as mergeAndCleanupArtists).
    const redirectPayload = {
      artistId: docId,
      cacheKey: docId,
      redirectTo: canonicalId,
      cacheVersion: 4,
      cachedAt: FieldValue.serverTimestamp()
    };

    console.log(`  ${DRY_RUN ? '[DRY RUN] Would write' : 'Writing'} redirect pointer:`, JSON.stringify({ ...redirectPayload, cachedAt: '<serverTimestamp>' }));

    if (!DRY_RUN) {
      try {
        await db.collection('artists').doc(docId).set(redirectPayload);
        console.log(`  ✅ artists/${docId} → redirectTo: "${canonicalId}"`);
        fixed++;
      } catch (writeErr) {
        console.error(`  ❌ Write failed for "${docId}":`, writeErr.message);
        errors++;
      }
    } else {
      console.log(`  [DRY RUN] No write executed.`);
      fixed++;
    }
  }

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`REMEDIATION COMPLETE`);
  console.log(`  ${DRY_RUN ? 'Would fix' : 'Fixed'}:   ${fixed}`);
  console.log(`  Skipped: ${skipped} (manual review required)`);
  console.log(`  Errors:  ${errors}`);
  console.log(`${'═'.repeat(60)}\n`);
}

run().catch(console.error).finally(() => process.exit(0));
