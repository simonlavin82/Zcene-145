/**
 * scripts/backfillSeedImageUrls.cjs
 * 
 * Architecture V29 Migration:
 * Extracts and freezes the seedImageUrls: (string | null)[] array from the
 * project document's isolated snapshot to the project root across all user projects.
 */

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const path = require('path');

const serviceAccountPath = path.resolve(__dirname, '../firebase-service-account.json');
const serviceAccount = require(serviceAccountPath);

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

function normalizeArtistId(name) {
  if (!name) return '';
  return name.toLowerCase()
    .trim()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const KNOWN_COUNTRY_SLUGS = [
  '-united-states', '-united-kingdom', '-global', '-australia', '-canada', '-germany', '-france',
  '-japan', '-sweden', '-italy', '-spain', '-brazil', '-mexico', '-netherlands', '-belgium',
  '-norway', '-finland', '-denmark', '-ireland', '-new-zealand', '-poland', '-austria',
  '-switzerland', '-uk', '-usa', '-us', '-gb', '-au', '-ca', '-de', '-fr', '-jp', '-se', '-it', '-es',
  '-br', '-mx', '-nl', '-be', '-no', '-fi', '-dk', '-ie', '-nz', '-pl', '-at', '-ch',
  '-scotland', '-wales', '-northern-ireland', '-england'
];

function stripCountrySlug(name) {
  let cleanName = name.trim();
  for (const suffix of KNOWN_COUNTRY_SLUGS) {
    if (cleanName.toLowerCase().endsWith(suffix)) {
      cleanName = cleanName.substring(0, cleanName.length - suffix.length);
      break;
    }
  }
  return cleanName;
}

function isEntitySeedMatch(seedNorm, candidateNorm) {
  if (!seedNorm || !candidateNorm) return false;
  const s = stripCountrySlug(normalizeArtistId(seedNorm));
  const c = stripCountrySlug(normalizeArtistId(candidateNorm));
  if (s === c) return true;
  if (s.startsWith(`${c}-`) || c.startsWith(`${s}-`)) return true;
  if (s.includes(`-${c}-`) || s.endsWith(`-${c}`) || c.includes(`-${s}-`) || c.endsWith(`-${s}`)) return true;
  return false;
}

async function backfill() {
  console.log('=== Starting Architecture V29 SeedImageUrls Backfill ===\n');
  const projectSnaps = await db.collectionGroup('projects').get();
  console.log(`Found ${projectSnaps.size} total project documents across all users.\n`);

  let updatedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  for (const doc of projectSnaps.docs) {
    const data = doc.data();
    const docId = doc.id;
    const name = data.name || 'Untitled';
    const seedArtistsStr = data.seedArtists || '';

    if (!seedArtistsStr) {
      skippedCount++;
      continue;
    }

    const seedList = seedArtistsStr.split('::').map(s => s.trim()).filter(Boolean);
    if (seedList.length === 0) {
      skippedCount++;
      continue;
    }

    // Parse internal detailsCache
    let internalCacheMap = null;
    if (data.detailsCache) {
      try {
        const parsed = typeof data.detailsCache === 'string' ? JSON.parse(data.detailsCache) : data.detailsCache;
        if (Array.isArray(parsed)) {
          internalCacheMap = new Map(parsed);
        }
      } catch (e) {}
    }

    // Parse internal graphData
    let graphNodes = [];
    if (data.graphData) {
      try {
        const parsedGraph = typeof data.graphData === 'string' ? JSON.parse(data.graphData) : data.graphData;
        if (parsedGraph && Array.isArray(parsedGraph.nodes)) {
          graphNodes = parsedGraph.nodes;
        }
      } catch (e) {}
    }

    const extractedUrls = [];

    for (let i = 0; i < seedList.length; i++) {
      const seed = seedList[i];
      const seedNorm = normalizeArtistId(seed);
      let foundUrl = null;

      // 1. Check detailsCache
      if (internalCacheMap) {
        // Direct key
        let entry = internalCacheMap.get(seedNorm);
        if (!entry) {
          // Search with slug / fuzzy
          for (const [key, val] of internalCacheMap.entries()) {
            if (isEntitySeedMatch(seedNorm, key) || key === seedNorm || key.startsWith(seedNorm + '-') || seedNorm.startsWith(key + '-')) {
              entry = val;
              break;
            }
          }
        }
        if (entry) {
          const u = entry.imageUrl || entry.details?.imageUrl || null;
          if (u && u !== 'not-found' && typeof u === 'string' && u.trim().length > 0) {
            foundUrl = u.trim();
          }
        }
      }

      // 2. Check explicit legacy seedImageUrl for index 0
      if (!foundUrl && i === 0 && data.seedImageUrl && data.seedImageUrl !== 'not-found' && typeof data.seedImageUrl === 'string' && data.seedImageUrl.trim().length > 0) {
        foundUrl = data.seedImageUrl.trim();
      }

      // 3. Check graphData
      if (!foundUrl && graphNodes.length > 0) {
        const node = graphNodes.find(n => 
          isEntitySeedMatch(seedNorm, n.id) ||
          normalizeArtistId(n.id) === seedNorm ||
          (n.label && n.label.toLowerCase() === seed.toLowerCase())
        );
        if (node && node.imageUrl && node.imageUrl !== 'not-found' && typeof node.imageUrl === 'string' && node.imageUrl.trim().length > 0) {
          foundUrl = node.imageUrl.trim();
        }
      }

      extractedUrls.push(foundUrl);
    }

    const primarySeedImage = extractedUrls.find(u => !!u) || null;

    try {
      await doc.ref.update({
        seedImageUrls: extractedUrls,
        ...(primarySeedImage ? { seedImageUrl: primarySeedImage } : { seedImageUrl: null })
      });
      console.log(`[UPDATED] Project ${docId} ("${name}"):`);
      console.log(`  Seeds: [${seedList.join(', ')}]`);
      console.log(`  seedImageUrls: ${JSON.stringify(extractedUrls)}`);
      console.log(`  seedImageUrl: ${primarySeedImage}`);
      updatedCount++;
    } catch (err) {
      console.error(`[ERROR] Failed to update project ${docId}:`, err.message);
      errorCount++;
    }
  }

  console.log(`\n=== Migration Complete ===`);
  console.log(`Updated: ${updatedCount}`);
  console.log(`Skipped: ${skippedCount}`);
  console.log(`Errors:  ${errorCount}`);
}

backfill().catch(console.error);
