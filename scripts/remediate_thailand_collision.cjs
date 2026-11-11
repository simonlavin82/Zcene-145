/**
 * scripts/remediate_thailand_collision.cjs
 *
 * V42 Firestore Remediation: *-thailand Slugging & Homonym Collision Cleanup
 *
 * Usage:
 *   node scripts/remediate_thailand_collision.cjs --dry-run   (default; read-only inspection)
 *   node scripts/remediate_thailand_collision.cjs --execute   (executes atomic remediation)
 *
 * Rules Enforced:
 *   1. Purges contaminated artists/klear-thailand and resets artists/klear so Klear can be freshly curated as klear-th.
 *   2. Migrates verified Thai peers (*-thailand -> *-th, updating cacheKey and artistId while strictly preserving createdAt and expireAt)
 *      and deletes any *-thailand peer whose details.origin was homonym-contaminated.
 *   3. Ensures artists/paradox is structured as an Evolved Ambiguous Stub (_isStub: true, isAmbiguous: true, redirectTo: null, candidates: [...])
 *      containing both paradox-de and paradox-th, while unambiguous migrated Thai peers point redirectTo to their new {bare}-th doc.
 *   4. Leaves users/K3QqtNRg48X7I3C0Zu2PVPzRBSH3/projects/GXDWhsnJFqmNyEQNJegJ 100% untouched (Rules 42 & 43).
 */

const path = require('path');
const dns = require('dns');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

const serviceAccountPath = path.resolve(__dirname, '../firebase-service-account.json');
const serviceAccount = require(serviceAccountPath);

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const EXECUTE = process.argv.includes('--execute');
const PROTECTED_PROJECT_PATH = 'users/K3QqtNRg48X7I3C0Zu2PVPzRBSH3/projects/GXDWhsnJFqmNyEQNJegJ';

const THAI_ORIGIN_RE = /\b(thailand|bangkok|chiang\s*mai|nonthaburi|pathum\s*thani|khon\s*kaen|phuket|hat\s*yai|chonburi|nakhon|ubon|udon|rayong|thai)\b/i;
const FOREIGN_ORIGIN_RE = /\b(usa|united states|u\.s\.a\.|buffalo|new york|california|los angeles|chicago|texas|florida|uk|united kingdom|england|london|scotland|wales|germany|w[üu]rzburg|bavaria|berlin|croatia|pore[čc]|japan|tokyo|australia|canada|sweden|france|italy|brazil|south korea|indonesia|malaysia)\b/i;

function isVerifiedThaiArtistDoc(docId, data) {
  if (!data || data._isStub) return { ok: false, reason: 'stub_or_empty' };
  if (docId === 'klear-thailand') {
    return { ok: false, reason: 'explicit_case_study_contaminated_seed' };
  }
  const profile = data?.detailsCache || null;
  const details = profile?.details || data?.details || null;
  if (!profile || !details || typeof details !== 'object') {
    return { ok: false, reason: 'missing_detailsCache' };
  }
  const origin = String(details.origin || profile.origin || '').trim();
  const bio = String(profile.summary || profile.bio || profile.description || details.bio || '').trim();
  if (!origin) {
    return { ok: false, reason: 'empty_origin' };
  }
  if (FOREIGN_ORIGIN_RE.test(origin)) {
    return { ok: false, reason: `foreign_homonym_origin (${origin})` };
  }
  if (!THAI_ORIGIN_RE.test(origin)) {
    return { ok: false, reason: `non_thai_origin (${origin})` };
  }
  if (!bio || bio.length <= 50) {
    return { ok: false, reason: `insufficient_bio (len=${bio.length})` };
  }
  return { ok: true, reason: `verified_thai (${origin}, bioLen=${bio.length})` };
}

function rewriteGraphThailandIds(graphData) {
  if (!graphData || typeof graphData !== 'object') return graphData;
  const cloned = JSON.parse(JSON.stringify(graphData));
  const mapId = (id) => (typeof id === 'string' && id.endsWith('-thailand') ? id.replace(/-thailand$/, '-th') : id);
  if (Array.isArray(cloned.nodes)) {
    cloned.nodes = cloned.nodes.map((n) => ({
      ...n,
      id: mapId(n.id),
    }));
  }
  if (Array.isArray(cloned.links)) {
    cloned.links = cloned.links.map((l) => ({
      ...l,
      source: typeof l.source === 'object' && l.source !== null ? { ...l.source, id: mapId(l.source.id) } : mapId(l.source),
      target: typeof l.target === 'object' && l.target !== null ? { ...l.target, id: mapId(l.target.id) } : mapId(l.target),
    }));
  }
  return cloned;
}

function buildCandidateFromDoc(canonicalId, data, fallbackMeta = {}) {
  const details = data?.detailsCache?.details || data?.details || {};
  return {
    id: canonicalId,
    name: String(details.artist || data?.name || fallbackMeta.name || canonicalId.replace(/-[a-z]{2}$/, '')).trim(),
    origin: String(details.origin || fallbackMeta.origin || 'Unknown').trim(),
    genre: String(details.genre || fallbackMeta.genre || 'Rock').trim(),
  };
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log(`  Zcene V42 *-thailand Remediation (${EXECUTE ? 'LIVE EXECUTE MODE' : 'DRY-RUN INSPECTION MODE'})`);
  console.log(`  Project: ${serviceAccount.project_id}`);
  console.log(`  Timestamp: ${new Date().toISOString()}`);
  console.log('═══════════════════════════════════════════════════════════════════════\n');

  // Fail-fast network reachability check before gRPC client loops
  await dns.promises.lookup('firestore.googleapis.com');

  // 1. Read-only verification of protected user project (Rules 42 & 43)
  const protectedSnapBefore = await db.doc(PROTECTED_PROJECT_PATH).get();
  const protectedUpdateTimeBefore = protectedSnapBefore.updateTime ? protectedSnapBefore.updateTime.toMillis() : null;
  console.log(`[Safety Check] Protected user project "${PROTECTED_PROJECT_PATH}": exists=${protectedSnapBefore.exists}, updateTime=${protectedSnapBefore.updateTime ? protectedSnapBefore.updateTime.toDate().toISOString() : 'N/A'} (WILL NOT BE TOUCHED)\n`);

  // 2. Scan all documents in /artists to identify *-thailand docs, bare stubs referencing *-thailand, and related homonyms
  console.log('[Scan] Fetching /artists collection metadata...');
  const allArtistsSnap = await db.collection('artists').get();
  console.log(`[Scan] Total documents in /artists: ${allArtistsSnap.size}\n`);

  const docsById = new Map();
  allArtistsSnap.docs.forEach((doc) => {
    docsById.set(doc.id, doc);
  });

  const thailandDocs = [];
  const otherFullCountrySuffixDocs = [];
  const KNOWN_NON_ISO_COUNTRY_SUFFIXES = [
    '-scotland', '-england', '-wales', '-ireland', '-germany', '-france', '-japan',
    '-indonesia', '-philippines', '-malaysia', '-singapore', '-taiwan', '-vietnam',
    '-australia', '-canada', '-brazil', '-mexico', '-argentina', '-sweden', '-norway',
    '-finland', '-denmark', '-italy', '-spain', '-poland', '-russia', '-korea', '-china', '-india'
  ];

  for (const [id, docSnap] of docsById.entries()) {
    if (id.endsWith('-thailand')) {
      thailandDocs.push(docSnap);
    } else if (KNOWN_NON_ISO_COUNTRY_SUFFIXES.some((sfx) => id.endsWith(sfx))) {
      otherFullCountrySuffixDocs.push(id);
    }
  }

  // Also check if any bare stubs reference *-thailand even if the *-thailand doc was already missing
  const bareIdsSet = new Set(['klear', 'paradox']);
  for (const docSnap of thailandDocs) {
    bareIdsSet.add(docSnap.id.replace(/-thailand$/, ''));
  }
  for (const [id, docSnap] of docsById.entries()) {
    const d = docSnap.data() || {};
    if (typeof d.redirectTo === 'string' && d.redirectTo.endsWith('-thailand')) {
      bareIdsSet.add(id);
    }
    if (Array.isArray(d.candidates) && d.candidates.some((c) => typeof c?.id === 'string' && c.id.endsWith('-thailand'))) {
      bareIdsSet.add(id);
    }
  }

  console.log(`[Scan] Found ${thailandDocs.length} *-thailand document(s):`);
  for (const docSnap of thailandDocs) {
    const d = docSnap.data() || {};
    const prof = d?.detailsCache || {};
    const det = prof?.details || {};
    const disco = Array.isArray(prof?.discography) ? prof.discography : [];
    const firstAlbum = disco[0] ? `${disco[0].title || ''} (${disco[0].year || ''})` : 'none';
    const verdict = isVerifiedThaiArtistDoc(docSnap.id, d);
    console.log(`  • ${docSnap.id}`);
    console.log(`      artist="${det.artist || ''}" | origin="${det.origin || ''}" | genre="${det.genre || ''}" | founded="${det.founded || ''}"`);
    console.log(`      summaryPreview="${String(prof.summary || '').slice(0, 85)}..."`);
    console.log(`      itunesArtistId="${prof.itunesArtistId || d.itunesArtistId || ''}" | imageUrl="${String(prof.imageUrl || '').slice(0, 60)}" | disco[0]="${firstAlbum}"`);
    console.log(`      artistId="${d.artistId || ''}" | cacheKey="${d.cacheKey || ''}" | _isStub=${Boolean(d._isStub)} | hasCreatedAt=${Boolean(d.createdAt)} | hasExpireAt=${Boolean(d.expireAt)}`);
    console.log(`      verdict => ${verdict.ok ? 'MIGRATE -> ' + docSnap.id.replace(/-thailand$/, '-th') + ' [' + verdict.reason + ']' : 'PURGE (' + verdict.reason + ')'}`);
  }

  if (otherFullCountrySuffixDocs.length > 0) {
    console.log(`\n[Diagnostic] Other non-2-letter country-word IDs detected in /artists (${otherFullCountrySuffixDocs.length}): ${otherFullCountrySuffixDocs.join(', ')}`);
  } else {
    console.log(`\n[Diagnostic] Zero other non-2-letter country-word IDs found in /artists.`);
  }

  // 3. Build deterministic action plan
  const migrations = []; // { fromId, toId, payload }
  const deletions = new Set(); // docIds to delete
  const stubUpdates = []; // { docId, payload, summary }

  // Map of bareId -> resulting valid 2-letter canonical docs { id, data }
  const postMigrationCanonicalsByBare = new Map();

  for (const bareId of bareIdsSet) {
    const existingTwoLetterCanonicals = [];
    for (const [id, docSnap] of docsById.entries()) {
      if (id === `${bareId}-thailand`) continue;
      if (id.startsWith(`${bareId}-`) && /-[a-z]{2}$/.test(id)) {
        const barePart = id.slice(0, -3);
        if (barePart === bareId) {
          existingTwoLetterCanonicals.push({ id, data: docSnap.data() || {} });
        }
      }
    }
    postMigrationCanonicalsByBare.set(bareId, existingTwoLetterCanonicals);
  }

  for (const docSnap of thailandDocs) {
    const fromId = docSnap.id;
    const bareId = fromId.replace(/-thailand$/, '');
    const toId = `${bareId}-th`;
    const data = docSnap.data() || {};
    const verdict = isVerifiedThaiArtistDoc(fromId, data);

    if (verdict.ok) {
      const migratedPayload = {
        ...data,
        cacheKey: toId,
        artistId: bareId,
        updatedAt: FieldValue.serverTimestamp(),
      };
      if (migratedPayload.graphData) {
        migratedPayload.graphData = rewriteGraphThailandIds(migratedPayload.graphData);
      }
      // Explicitly preserve createdAt and expireAt from original doc
      if (data.createdAt !== undefined) migratedPayload.createdAt = data.createdAt;
      if (data.expireAt !== undefined) migratedPayload.expireAt = data.expireAt;

      migrations.push({ fromId, toId, bareId, payload: migratedPayload, origin: data?.detailsCache?.details?.origin });
      deletions.add(fromId);

      const list = postMigrationCanonicalsByBare.get(bareId) || [];
      const filtered = list.filter((entry) => entry.id !== toId);
      filtered.push({ id: toId, data: migratedPayload });
      postMigrationCanonicalsByBare.set(bareId, filtered);
    } else {
      deletions.add(fromId);
    }
  }

  // 4. Reconcile bare stubs for all affected bareIds
  console.log('\n[Router Stub Audit] Inspecting bare router stubs and homonym siblings:');
  for (const bareId of Array.from(bareIdsSet).sort()) {
    const bareSnap = docsById.get(bareId);
    const bareData = bareSnap ? bareSnap.data() : null;
    const canonicalList = (postMigrationCanonicalsByBare.get(bareId) || []).sort((a, b) => a.id.localeCompare(b.id));

    console.log(`  • artists/${bareId}: exists=${Boolean(bareSnap)} | current=${bareData ? JSON.stringify({ _isStub: bareData._isStub, isAmbiguous: bareData.isAmbiguous, redirectTo: bareData.redirectTo, candidatesCount: Array.isArray(bareData.candidates) ? bareData.candidates.length : 0 }) : 'NONE'} | valid2LetterSiblings=[${canonicalList.map((c) => c.id).join(', ')}]`);

    if (bareId === 'klear') {
      // Explicit Case Study Requirement: Reset artists/klear so Klear can be freshly curated as klear-th
      if (bareSnap && canonicalList.length === 0) {
        deletions.add('klear');
        console.log(`      plan => DELETE artists/klear (reset bare stub so Klear curates cleanly as klear-th)`);
      } else if (canonicalList.length > 0) {
        // If another valid canonical doc exists (e.g. klear-us), ensure no -thailand pointer remains
        const only = canonicalList[0];
        const cand = buildCandidateFromDoc(only.id, only.data);
        stubUpdates.push({
          docId: 'klear',
          summary: `Sanitize artists/klear -> ${only.id}`,
          payload: {
            _isStub: true,
            isAmbiguous: false,
            redirectTo: only.id,
            cacheKey: 'klear',
            artistId: 'klear',
            cacheVersion: 4,
            candidates: [cand],
            updatedAt: FieldValue.serverTimestamp(),
          },
        });
      }
      continue;
    }

    if (bareId === 'paradox') {
      // Explicit Requirement: Evolved Ambiguous Stub (_isStub: true, isAmbiguous: true, redirectTo: null, candidates: [...])
      // containing BOTH paradox-de and paradox-th
      const deEntry = canonicalList.find((c) => c.id === 'paradox-de');
      const thEntry = canonicalList.find((c) => c.id === 'paradox-th');

      const candidatesMap = new Map();
      // Preserve any existing valid 2-letter candidates (excluding *-thailand)
      if (Array.isArray(bareData?.candidates)) {
        for (const c of bareData.candidates) {
          if (c && typeof c.id === 'string' && /-[a-z]{2}$/.test(c.id) && !c.id.endsWith('-thailand')) {
            candidatesMap.set(c.id, {
              id: c.id,
              name: c.name || 'Paradox',
              origin: c.origin || 'Unknown',
              genre: c.genre || 'Rock',
            });
          }
        }
      }
      candidatesMap.set(
        'paradox-de',
        deEntry
          ? buildCandidateFromDoc('paradox-de', deEntry.data, { name: 'Paradox', origin: 'Würzburg, Germany', genre: 'Thrash Metal' })
          : (candidatesMap.get('paradox-de') || { id: 'paradox-de', name: 'Paradox', origin: 'Germany', genre: 'Thrash Metal' })
      );
      candidatesMap.set(
        'paradox-th',
        thEntry
          ? buildCandidateFromDoc('paradox-th', thEntry.data, { name: 'Paradox', origin: 'Bangkok, Thailand', genre: 'Alternative Rock' })
          : { id: 'paradox-th', name: 'Paradox', origin: 'Bangkok, Thailand', genre: 'Alternative Rock' }
      );

      const finalCandidates = Array.from(candidatesMap.values());
      stubUpdates.push({
        docId: 'paradox',
        summary: `Evolved Ambiguous Stub with candidates [${finalCandidates.map((c) => c.id).join(', ')}]`,
        payload: {
          _isStub: true,
          isAmbiguous: true,
          redirectTo: null,
          cacheKey: 'paradox',
          artistId: 'paradox',
          cacheVersion: 4,
          candidates: finalCandidates,
          updatedAt: FieldValue.serverTimestamp(),
        },
      });
      console.log(`      plan => UPSERT Evolved Ambiguous Stub artists/paradox (${finalCandidates.map((c) => `${c.id} [${c.origin}]`).join(' + ')})`);
      continue;
    }

    // Other affected bare IDs
    if (canonicalList.length === 1) {
      const target = canonicalList[0];
      const cand = buildCandidateFromDoc(target.id, target.data, { origin: 'Thailand' });
      stubUpdates.push({
        docId: bareId,
        summary: `Single-pointer stub -> ${target.id}`,
        payload: {
          _isStub: true,
          isAmbiguous: false,
          redirectTo: target.id,
          cacheKey: bareId,
          artistId: bareId,
          cacheVersion: 4,
          candidates: [cand],
          updatedAt: FieldValue.serverTimestamp(),
        },
      });
      console.log(`      plan => UPSERT single-pointer stub artists/${bareId} -> ${target.id}`);
    } else if (canonicalList.length > 1) {
      const finalCandidates = canonicalList.map((c) => buildCandidateFromDoc(c.id, c.data));
      stubUpdates.push({
        docId: bareId,
        summary: `Evolved Ambiguous Stub [${finalCandidates.map((c) => c.id).join(', ')}]`,
        payload: {
          _isStub: true,
          isAmbiguous: true,
          redirectTo: null,
          cacheKey: bareId,
          artistId: bareId,
          cacheVersion: 4,
          candidates: finalCandidates,
          updatedAt: FieldValue.serverTimestamp(),
        },
      });
      console.log(`      plan => UPSERT Evolved Ambiguous Stub artists/${bareId} -> [${finalCandidates.map((c) => c.id).join(', ')}]`);
    } else if (bareSnap) {
      // Zero valid canonical docs left; if bare doc is a stub pointing to -thailand, delete it
      if (bareData?._isStub) {
        deletions.add(bareId);
        console.log(`      plan => DELETE dangling stub artists/${bareId}`);
      }
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════════════════');
  console.log('  REMEDIATION SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log(`  • Verified Thai peers to migrate (*-thailand -> *-th): ${migrations.length}`);
  migrations.forEach((m) => console.log(`      [MIGRATE] artists/${m.fromId} -> artists/${m.toId} (origin="${m.origin}")`));
  console.log(`  • Router stubs to upsert:                              ${stubUpdates.length}`);
  stubUpdates.forEach((s) => console.log(`      [STUB]    artists/${s.docId}: ${s.summary}`));
  console.log(`  • Contaminated / legacy documents to delete:           ${deletions.size}`);
  Array.from(deletions).sort().forEach((id) => console.log(`      [DELETE]  artists/${id}`));
  console.log('═══════════════════════════════════════════════════════════════════════\n');

  if (!EXECUTE) {
    console.log('[Dry-Run Complete] Zero writes performed. Re-run with --execute to apply.');
    return;
  }

  console.log('[Execute] Committing atomic Firestore batch...');
  const batch = db.batch();

  for (const m of migrations) {
    const targetRef = db.collection('artists').doc(m.toId);
    batch.set(targetRef, m.payload, { merge: false });
  }

  for (const s of stubUpdates) {
    const stubRef = db.collection('artists').doc(s.docId);
    batch.set(stubRef, s.payload, { merge: false });
  }

  for (const delId of deletions) {
    // Safety guard: never delete a doc we are simultaneously writing
    if (migrations.some((m) => m.toId === delId)) continue;
    if (stubUpdates.some((s) => s.docId === delId)) continue;
    batch.delete(db.collection('artists').doc(delId));
  }

  await batch.commit();
  console.log('[Execute] ✓ Batch committed successfully.\n');

  // Post-execution verification
  const remainingThailand = await db.collection('artists').get();
  const leftoverThailandIds = remainingThailand.docs.map((d) => d.id).filter((id) => id.endsWith('-thailand'));
  console.log(`[Verify] Remaining *-thailand docs in /artists: ${leftoverThailandIds.length}`);

  const klearCheck = await db.collection('artists').doc('klear').get();
  const klearThailandCheck = await db.collection('artists').doc('klear-thailand').get();
  console.log(`[Verify] artists/klear exists=${klearCheck.exists} | artists/klear-thailand exists=${klearThailandCheck.exists}`);

  const paradoxCheck = await db.collection('artists').doc('paradox').get();
  console.log(`[Verify] artists/paradox payload: ${JSON.stringify(paradoxCheck.data(), null, 2)}`);

  const protectedSnapAfter = await db.doc(PROTECTED_PROJECT_PATH).get();
  const protectedUpdateTimeAfter = protectedSnapAfter.updateTime ? protectedSnapAfter.updateTime.toMillis() : null;
  console.log(`[Verify] Protected project "${PROTECTED_PROJECT_PATH}" untouched: exists=${protectedSnapAfter.exists}, updateTimeUnchanged=${protectedUpdateTimeBefore === protectedUpdateTimeAfter}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[Remediation] Fatal error:', err);
    process.exit(1);
  });
