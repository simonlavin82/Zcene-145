/**
 * scripts/backfillNotFoundItunes.cjs
 *
 * V47.9 Non-Destructive $0.00 iTunes-Only Backfill Script for Legacy 'not-found' /artists Docs.
 *
 * Safety & Cost Guarantees:
 * - Mandatory --dry-run default. Pass --apply explicitly to mutate Firestore.
 * - Zero Gemini API calls ($0.00 AI cost). Uses compiled Rule 38 v47.9 scrapeImageUrlBackend directly.
 * - Strictly preserves 100% of existing Gemini bios, members, scene circles, links, graphData,
 *   and synthesisRationale — updates ONLY detailsCache.imageUrl, detailsCache.discography,
 *   detailsCache.itunesArtistId, detailsCache.itunesScrapeVersion, and updatedAt in place.
 *
 * Usage:
 *   node scripts/backfillNotFoundItunes.cjs --dry-run --artist=exhibition-us
 *   node scripts/backfillNotFoundItunes.cjs --dry-run --limit=25
 *   node scripts/backfillNotFoundItunes.cjs --apply --artist=exhibition-us
 */

const path = require('path');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

const {
  scrapeImageUrlBackend,
  shouldRunRule38NotFoundUpgrade,
  CURRENT_ITUNES_SCRAPE_VERSION,
} = require(path.resolve(__dirname, '../functions/lib/services/curatorService.js'));
const {
  extractTrailingCountryIso,
  stripCountrySlug,
} = require(path.resolve(__dirname, '../functions/lib/shared/isoCountries.js'));

const args = process.argv.slice(2);
const isApply = args.includes('--apply');
const artistArg = args.find((a) => a.startsWith('--artist='));
const targetArtistSlug = artistArg ? artistArg.slice('--artist='.length).trim().toLowerCase() : null;
const limitArg = args.find((a) => a.startsWith('--limit='));
const maxLimit = limitArg ? Math.max(1, parseInt(limitArg.slice('--limit='.length), 10) || 0) : Infinity;
const delayArg = args.find((a) => a.startsWith('--delay-ms='));
const delayMs = delayArg ? Math.max(0, parseInt(delayArg.slice('--delay-ms='.length), 10) || 3500) : 3500;

const serviceAccountPath = path.resolve(__dirname, '../firebase-service-account.json');
const serviceAccount = require(serviceAccountPath);

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();
db.settings({ ignoreUndefinedProperties: true });

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseDetailsCache(raw) {
  if (!raw) return { profile: null, isPlainObject: false };
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    return { profile: raw, isPlainObject: true };
  }
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return { profile: parsed, isPlainObject: false };
      }
      if (Array.isArray(parsed) && parsed.length > 0) {
        const entry = Array.isArray(parsed[0]) ? parsed[0][1] : parsed[0];
        if (entry && typeof entry === 'object') {
          return { profile: entry, isPlainObject: false };
        }
      }
    } catch {
      return { profile: null, isPlainObject: false };
    }
  }
  return { profile: null, isPlainObject: false };
}

function formatDiscogSummary(discog) {
  if (!Array.isArray(discog) || discog.length === 0) return '[]';
  return '[' + discog.map((d) => `${d.albumName} (${d.releaseYear || '?'}${d.itunesCollectionId ? ` #${d.itunesCollectionId}` : ''})`).join(', ') + ']';
}

async function run() {
  console.log('=================================================================');
  console.log(`Rule 38 v47.9 Non-Destructive iTunes-Only Backfill (${isApply ? 'APPLY MODE' : 'DRY-RUN MODE — NO WRITES'})`);
  console.log(`Target: ${targetArtistSlug ? `artists/${targetArtistSlug}` : 'all eligible /artists docs'} | Limit: ${Number.isFinite(maxLimit) ? maxLimit : 'none'} | Pacing: ${delayMs}ms`);
  console.log('=================================================================\n');

  let docs = [];
  if (targetArtistSlug) {
    const snap = await db.collection('artists').doc(targetArtistSlug).get();
    if (!snap.exists) {
      console.error(`Document artists/${targetArtistSlug} does not exist.`);
      process.exit(1);
    }
    docs = [snap];
  } else {
    const snap = await db.collection('artists').get();
    docs = snap.docs;
  }

  let scanned = 0;
  let eligible = 0;
  let upgraded = 0;
  let stillNotFound = 0;
  let skipped = 0;
  let errors = 0;

  for (const docSnap of docs) {
    if (eligible >= maxLimit) break;
    scanned++;

    const docId = docSnap.id;
    const data = docSnap.data();

    if (!data || data._isStub === true || Boolean(data.redirectTo)) {
      skipped++;
      if (targetArtistSlug) {
        console.log(`[SKIP] ${docId}: stub or redirectTo (${data?.redirectTo || 'stub'})`);
      }
      continue;
    }

    const { profile, isPlainObject } = parseDetailsCache(data.detailsCache);
    if (!profile) {
      skipped++;
      if (targetArtistSlug) {
        console.log(`[SKIP] ${docId}: missing or unparseable detailsCache`);
      }
      continue;
    }

    const existingScrapeVersion = Number(profile.itunesScrapeVersion) || 0;
    const existingImageUrl = typeof profile.imageUrl === 'string' ? profile.imageUrl.trim() : '';

    if (existingScrapeVersion >= CURRENT_ITUNES_SCRAPE_VERSION) {
      skipped++;
      if (targetArtistSlug) {
        console.log(`[SKIP] ${docId}: already stamped itunesScrapeVersion=${existingScrapeVersion}`);
      }
      continue;
    }

    if (existingImageUrl && existingImageUrl !== 'not-found') {
      skipped++;
      if (targetArtistSlug) {
        console.log(`[SKIP] ${docId}: already has verified imageUrl (${existingImageUrl})`);
      }
      continue;
    }

    const probeProfile = existingImageUrl
      ? profile
      : { ...profile, imageUrl: 'not-found' };
    if (!shouldRunRule38NotFoundUpgrade(probeProfile, false)) {
      skipped++;
      if (targetArtistSlug) {
        console.log(`[SKIP] ${docId}: failed Rule 38 upgrade eligibility (requires qualifying discography or valid founded year)`);
      }
      continue;
    }

    eligible++;
    if (eligible > 1 && delayMs > 0) {
      await sleep(delayMs);
    }

    const artistName =
      (profile.details && profile.details.artist) ||
      data.name ||
      data.seedArtists ||
      stripCountrySlug(docId);
    const genre = (profile.details && profile.details.genre) || '';
    const summary = profile.summary || '';
    const origin = (profile.details && profile.details.origin) || '';
    const foundedYear = (profile.details && profile.details.founded) || undefined;
    const countryIso = extractTrailingCountryIso(docId);
    const existingDiscog = Array.isArray(profile.discography) ? profile.discography : [];

    console.log(`\n--- [${eligible}] artists/${docId} ("${artistName}") ---`);
    console.log(`  META:   genre="${genre}" | origin="${origin}" | founded="${foundedYear || ''}" | iso="${countryIso || 'none'}"`);
    console.log(`  BEFORE: imageUrl=${JSON.stringify(existingImageUrl || '')} | itunesArtistId=${JSON.stringify(profile.itunesArtistId ?? null)} | itunesScrapeVersion=${existingScrapeVersion}`);
    console.log(`          discography=${formatDiscogSummary(existingDiscog)}`);
    console.log(`          preserved: bioLen=${summary.length}, members=${Array.isArray(profile.members) ? profile.members.length : 0}, hasGraphData=${Boolean(data.graphData)}`);

    try {
      const result = await scrapeImageUrlBackend(
        artistName,
        'artist',
        genre,
        summary,
        origin,
        existingDiscog,
        countryIso,
        foundedYear
      );

      const nextImageUrl = result && result.imageUrl ? result.imageUrl : 'not-found';
      const nextDiscog = result && result.imageUrl && Array.isArray(result.reconciledDiscography)
        ? result.reconciledDiscography
        : [];
      const nextArtistId = result && result.imageUrl && result.itunesArtistId
        ? result.itunesArtistId
        : null;

      if (nextImageUrl !== 'not-found') {
        upgraded++;
      } else {
        stillNotFound++;
      }

      console.log(`  AFTER:  imageUrl=${JSON.stringify(nextImageUrl)} | itunesArtistId=${JSON.stringify(nextArtistId)} | itunesScrapeVersion=${CURRENT_ITUNES_SCRAPE_VERSION}`);
      console.log(`          discography=${formatDiscogSummary(nextDiscog)}`);

      if (isApply) {
        if (isPlainObject) {
          await docSnap.ref.update({
            'detailsCache.imageUrl': nextImageUrl,
            'detailsCache.discography': nextDiscog,
            'detailsCache.itunesArtistId': nextArtistId,
            'detailsCache.itunesScrapeVersion': CURRENT_ITUNES_SCRAPE_VERSION,
            updatedAt: FieldValue.serverTimestamp(),
          });
        } else {
          const updatedProfile = {
            ...profile,
            imageUrl: nextImageUrl,
            discography: nextDiscog,
            itunesArtistId: nextArtistId,
            itunesScrapeVersion: CURRENT_ITUNES_SCRAPE_VERSION,
          };
          await docSnap.ref.update({
            detailsCache: updatedProfile,
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
        console.log(`  WRITE:  ✅ Updated artists/${docId} in place (100% of existing Gemini fields & topology preserved).`);
      } else {
        console.log(`  WRITE:  (dry-run — skipped; pass --apply to write)`);
      }
    } catch (err) {
      errors++;
      console.error(`  ERROR:  Failed scraping ${docId}:`, err.message || err);
    }
  }

  console.log('\n=================================================================');
  console.log(`SUMMARY (${isApply ? 'APPLIED' : 'DRY-RUN'}): scanned=${scanned} | eligible=${eligible} | upgraded=${upgraded} | stillNotFound=${stillNotFound} | skipped=${skipped} | errors=${errors}`);
  console.log('=================================================================');
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[backfillNotFoundItunes] Fatal error:', err);
    process.exit(1);
  });
