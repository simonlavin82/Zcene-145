const path = require('path');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

// Initialize Firebase Admin
const serviceAccountPath = path.resolve(__dirname, '../firebase-service-account.json');
const serviceAccount = require(serviceAccountPath);

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

// --- Replication of curatorService.ts Logic ---

const GENERIC_ALBUM_TITLES = new Set([
  'demo', 'demos', 'live', 'ep', 'single', 'greatest hits', 'the best of',
  'best of', 'singles', 'compilation', 'untitled', 'self titled', 'rarities',
  'b sides', 'anthology', 'remixes', 'acoustic', 'unplugged', 'split'
]);

const ALBUM_STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'in', 'on', 'at', 'to', 'for', 'with', 'by', 'from',
  'vol', 'volume', 'part', 'pt', 'ep', 'lp', 'live', 'deluxe', 'edition', 'remaster', 'remastered',
  'version', 'bonus', 'track', 'tracks'
]);

const extractDistinctiveTokens = (title) => {
  return (title || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length >= 3 && !ALBUM_STOPWORDS.has(word));
};

const normalizeAlbumTitle = (title) => {
  return (title || '')
    .toLowerCase()
    .replace(/\s*[\(\[][^\)\]]*[\)\]]/g, '')       // Strips (Deluxe Edition), [Remastered], etc.
    .replace(/\s+-\s+(ep|single)$/i, '')            // Strips " - EP", " - Single"
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]/g, '')                      // Strips punctuation and spaces
    .trim();
};

const hasQualifyingDescriptor = (title) => {
  return /\b(demo|demos|ep|live|single|session|sessions|split|tape)\b/i.test(title) ||
         /\([^\)]*(demo|ep|live|split|single)[^\)]*\)/i.test(title) ||
         /\[[^\]]*(demo|ep|live|split|single)[^\]]*\]/i.test(title);
};

const titlesMatchFuzzyDetailed = (itunesTitle, zceneTitle, itunesYear, zceneYear) => {
  const normItunes = normalizeAlbumTitle(itunesTitle);
  const normZcene = normalizeAlbumTitle(zceneTitle);
  const details = {
    normItunes,
    normZcene,
    exactNormMatch: false,
    exactYearMatch: false,
    yearMatch: false,
    substringMatch: false,
    prefixMatch: false,
    tokenOverlapMatch: false,
    sharedTokens: [],
    matched: false,
    reasons: []
  };

  if (!normItunes || !normZcene) {
    details.reasons.push('One of the normalized titles is empty.');
    return details;
  }

  // 1. Exact normalized match
  if (normItunes === normZcene) {
    details.exactNormMatch = true;
    details.matched = true;
    details.reasons.push('Exact normalized match.');
    return details;
  }

  // Release year correlation checks
  const exactYearMatch = (itunesYear && zceneYear) ? itunesYear === zceneYear : false;
  const yearMatch = (itunesYear && zceneYear) ? Math.abs(itunesYear - zceneYear) <= 1 : false;
  details.exactYearMatch = exactYearMatch;
  details.yearMatch = yearMatch;

  // 2. Substring containment
  if (normItunes.length >= 8 && normZcene.length >= 8) {
    if (!itunesYear || !zceneYear || yearMatch) {
      if (normItunes.includes(normZcene) || normZcene.includes(normItunes)) {
        details.substringMatch = true;
        details.matched = true;
        details.reasons.push('Substring containment match (with yearMatch or unstated years).');
        return details;
      }
    } else {
      details.reasons.push(`Substring match blocked: year mismatch (|${itunesYear} - ${zceneYear}| > 1).`);
    }
  }

  // 3. Prefix match
  const minPrefixLen = yearMatch ? 6 : 10;
  if (normItunes.length >= minPrefixLen && normZcene.length >= minPrefixLen) {
    const pLen = Math.min(normItunes.length, normZcene.length, 12);
    if (normItunes.slice(0, pLen) === normZcene.slice(0, pLen)) {
      details.prefixMatch = true;
      details.matched = true;
      details.reasons.push(`Prefix match satisfied (first ${pLen} chars match).`);
      return details;
    }
  }

  // 4. Distinctive token overlap
  const itunesTokens = extractDistinctiveTokens(itunesTitle);
  const zceneTokens = extractDistinctiveTokens(zceneTitle);
  const sharedTokens = itunesTokens.filter(t => zceneTokens.includes(t));
  details.sharedTokens = sharedTokens;
  details.itunesTokens = itunesTokens;
  details.zceneTokens = zceneTokens;

  if (exactYearMatch) {
    if (sharedTokens.length >= 2) {
      details.tokenOverlapMatch = true;
      details.matched = true;
      details.reasons.push('Token overlap (>= 2 distinctive tokens) with exactYearMatch.');
      return details;
    }
    if (sharedTokens.length >= 1 && sharedTokens.some(t => t.length >= 6)) {
      details.tokenOverlapMatch = true;
      details.matched = true;
      details.reasons.push('Token overlap (>= 1 token >= 6 chars) with exactYearMatch.');
      return details;
    }
  } else {
    if (sharedTokens.length > 0) {
      details.reasons.push(`Shared token(s) [${sharedTokens.join(', ')}] found, but rejected because exactYearMatch is false (iTunes: ${itunesYear}, Zcene: ${zceneYear}).`);
    }
  }

  details.reasons.push('No matching rule satisfied.');
  return details;
};

async function main() {
  console.log('================================================================');
  console.log('  DIAGNOSTIC: Anklebiter (anklebiter-us) Discography Mismatch    ');
  console.log('================================================================\n');

  // 1. Fetch Firestore Document
  console.log('[Step 1] Fetching artists/anklebiter-us from Firestore...');
  const docRef = db.collection('artists').doc('anklebiter-us');
  const snap = await docRef.get();

  if (!snap.exists) {
    console.error('❌ Document artists/anklebiter-us does NOT exist in Firestore!');
    process.exit(1);
  }

  const artistData = snap.data();
  const detailsCache = artistData.detailsCache || {};
  const detailsObj = detailsCache.details || artistData.details || {};
  const zceneDiscography = detailsCache.discography || artistData.discography || [];

  console.log('✓ Found document.');
  console.log(`  Artist Name: ${detailsObj.artist || 'Unknown'}`);
  console.log(`  Genre:       ${detailsObj.genre || 'Unknown'}`);
  console.log(`  Style:       ${detailsObj.style || 'Unknown'}`);
  console.log(`  Image URL:   ${detailsCache.imageUrl || artistData.imageUrl || 'None'}`);
  console.log(`  Discography Count: ${zceneDiscography.length}\n`);
  console.log('--- LLM-Generated Discography (Firestore) ---');
  zceneDiscography.forEach((item, idx) => {
    console.log(`  [${idx + 1}] "${item.albumName}" (${item.releaseYear || 'No Year'})`);
  });

  // Filter valid Zcene albums as verifyCandidateDiscography does
  const cleanArtistName = 'Anklebiter';
  const normArtist = cleanArtistName.toLowerCase().replace(/[^a-z0-9]/g, '');
  const validZceneAlbums = [];
  const discardedZceneAlbums = [];

  for (const item of zceneDiscography) {
    const raw = item.albumName || '';
    const norm = normalizeAlbumTitle(raw);
    const parsedYear = item.releaseYear ? parseInt(item.releaseYear, 10) : undefined;
    const year = (parsedYear && !isNaN(parsedYear)) ? parsedYear : undefined;

    if (norm.length < 3) {
      discardedZceneAlbums.push({ raw, reason: 'norm.length < 3' });
      continue;
    }
    if (GENERIC_ALBUM_TITLES.has(raw.toLowerCase().trim())) {
      discardedZceneAlbums.push({ raw, reason: 'GENERIC_ALBUM_TITLES match' });
      continue;
    }
    if (norm === normArtist && !hasQualifyingDescriptor(raw)) {
      discardedZceneAlbums.push({ raw, reason: 'Self-titled bare album (norm === normArtist)' });
      continue;
    }
    validZceneAlbums.push({ raw, norm, year });
  }

  console.log('\n--- Zcene Candidate Qualification ---');
  console.log(`  Retained for matching (${validZceneAlbums.length}):`);
  validZceneAlbums.forEach(a => console.log(`    ✓ "${a.raw}" (norm: "${a.norm}", year: ${a.year})`));
  if (discardedZceneAlbums.length > 0) {
    console.log(`  Discarded from matching (${discardedZceneAlbums.length}):`);
    discardedZceneAlbums.forEach(d => console.log(`    ✗ "${d.raw}" -> Reason: ${d.reason}`));
  }

  // 2. Fetch iTunes API for ID 1627565861
  const artistId = '1627565861';
  console.log(`\n[Step 2] Fetching iTunes albums for Artist ID ${artistId}...`);
  const itunesUrl = `https://itunes.apple.com/lookup?id=${artistId}&entity=album&limit=200`;
  const res = await fetch(itunesUrl);
  const data = await res.json();

  const itunesAlbums = (data.results || []).filter(
    r => r.wrapperType === 'collection' && String(r.artistId) === String(artistId)
  );

  console.log(`✓ Fetched ${itunesAlbums.length} album collections from iTunes.\n`);
  console.log('--- Actual iTunes Discography ---');
  itunesAlbums.forEach((alb, idx) => {
    const albYear = alb.releaseDate ? new Date(alb.releaseDate).getFullYear() : undefined;
    console.log(`  [${idx + 1}] "${alb.collectionName}" (Release Date: ${alb.releaseDate || 'N/A'}, Year: ${albYear})`);
  });

  // Filter iTunes albums as verifyCandidateDiscography does
  const validItunesAlbums = [];
  const discardedItunesAlbums = [];

  for (const alb of itunesAlbums) {
    const albTitle = alb.collectionName || '';
    const normItunes = normalizeAlbumTitle(albTitle);
    const albYear = alb.releaseDate ? new Date(alb.releaseDate).getFullYear() : undefined;

    if (normItunes.length < 3) {
      discardedItunesAlbums.push({ title: albTitle, reason: 'norm.length < 3' });
      continue;
    }
    if (GENERIC_ALBUM_TITLES.has(albTitle.toLowerCase().trim())) {
      discardedItunesAlbums.push({ title: albTitle, reason: 'GENERIC_ALBUM_TITLES match' });
      continue;
    }
    if (normItunes === normArtist && !hasQualifyingDescriptor(albTitle)) {
      discardedItunesAlbums.push({ title: albTitle, reason: 'Self-titled bare album on iTunes' });
      continue;
    }
    validItunesAlbums.push({ raw: albTitle, norm: normItunes, year: albYear, date: alb.releaseDate });
  }

  console.log('\n--- iTunes Candidate Qualification ---');
  console.log(`  Retained for matching (${validItunesAlbums.length}):`);
  validItunesAlbums.forEach(a => console.log(`    ✓ "${a.raw}" (norm: "${a.norm}", year: ${a.year})`));
  if (discardedItunesAlbums.length > 0) {
    console.log(`  Discarded from matching (${discardedItunesAlbums.length}):`);
    discardedItunesAlbums.forEach(d => console.log(`    ✗ "${d.title}" -> Reason: ${d.reason}`));
  }

  // 3. Side-by-Side Comparison & titlesMatchFuzzy Evaluation
  console.log('\n================================================================');
  console.log('  [Step 3] Side-by-Side Matching Matrix Evaluation               ');
  console.log('================================================================\n');

  let totalMatches = 0;

  for (let z = 0; z < validZceneAlbums.length; z++) {
    const zcene = validZceneAlbums[z];
    console.log(`----------------------------------------------------------------`);
    console.log(`▶ Evaluating Zcene Album [${z + 1}]: "${zcene.raw}" (Year: ${zcene.year}, Norm: "${zcene.norm}")`);
    console.log(`----------------------------------------------------------------`);

    for (let i = 0; i < validItunesAlbums.length; i++) {
      const itunes = validItunesAlbums[i];
      const result = titlesMatchFuzzyDetailed(itunes.raw, zcene.raw, itunes.year, zcene.year);

      console.log(`  vs iTunes [${i + 1}]: "${itunes.raw}" (Year: ${itunes.year}, Norm: "${itunes.norm}")`);
      console.log(`     → Match Result: ${result.matched ? '✅ MATCH' : '❌ NO MATCH'}`);
      console.log(`     → Analysis:`);
      console.log(`        - Exact Norm:      ${result.exactNormMatch} ("${itunes.norm}" === "${zcene.norm}")`);
      console.log(`        - Exact Year:      ${result.exactYearMatch} (iTunes: ${itunes.year}, Zcene: ${zcene.year})`);
      console.log(`        - Year +/- 1:      ${result.yearMatch}`);
      console.log(`        - Substring:       ${result.substringMatch}`);
      console.log(`        - Prefix:          ${result.prefixMatch}`);
      console.log(`        - Shared Tokens:   [${result.sharedTokens ? result.sharedTokens.join(', ') : ''}] (iTunes tokens: [${result.itunesTokens ? result.itunesTokens.join(', ') : ''}], Zcene tokens: [${result.zceneTokens ? result.zceneTokens.join(', ') : ''}])`);
      console.log(`        - Token Overlap:   ${result.tokenOverlapMatch}`);
      console.log(`        - Engine Log:      ${result.reasons.join(' | ')}`);
      console.log('');

      if (result.matched) totalMatches++;
    }
  }

  console.log('================================================================');
  console.log(`  FINAL VERIFICATION VERDICT: ${totalMatches} total match(es) found.`);
  console.log('================================================================\n');
}

main().catch(err => {
  console.error('Fatal diagnostic error:', err);
  process.exit(1);
}).finally(() => process.exit(0));
