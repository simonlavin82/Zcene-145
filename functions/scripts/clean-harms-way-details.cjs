const path = require('path');
const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const serviceAccount = require('../../firebase-service-account.json');

if (getApps().length === 0) {
  initializeApp({
    credential: cert(serviceAccount),
    projectId: "zcene-production",
  });
}
const db = getFirestore();

const TARGET_USERS = [
  "K3QqtNRg48X7I3C0Zu2PVPzRBSH3",
  "9FBuWDALnNfUAjxV0pRe3RnKwJy1",
];

function sanitizeNotableArtists(artists) {
  if (!Array.isArray(artists)) return [];
  const SENTENCE_PREFIX_REGEX = /^(?:inclusive of|associated with|related to|peers in|features|bands like|including|various|such as|influence of|consisting of|pioneers of|spanning|known for)\b/i;
  const GENERIC_CATEGORY_REGEX = /\b(?:acts|bands|artists|musicians|scene|subgenres?|influences)\b/i;

  return artists
    .filter((item) => typeof item === 'string' && item.trim().length > 0)
    .map(s => s.trim().replace(/[.;!?]+$/, ''))
    .filter(name => {
      if (name.length < 2 || name.length > 35) return false;
      if (name.split(/\s+/).length > 4) return false;
      if (SENTENCE_PREFIX_REGEX.test(name)) return false;
      if (GENERIC_CATEGORY_REGEX.test(name) && !/^(the|a)\s/i.test(name)) return false;
      return true;
    });
}

function cleanSummaryText(summary) {
  if (!summary || typeof summary !== 'string') return summary;
  let text = summary;

  // 1. Consume citations and trailing spaces
  text = text.replace(/\[\s*\d+(?:\s*,\s*\d+)*\s*\][ \t]*/g, '')
             .replace(/\(\s*\d+(?:\s*,\s*\d+)*\s*\)[ \t]*/g, '')
             .replace(/\[\s*(?:cite|citation)[^\]]*\][ \t]*/gi, '')
             .replace(/""/g, '');

  // 2. Unpack clumped single-bullet list (e.g. Vein.fm) with capitalized items
  text = text.replace(
    /(?:^|\n)[ \t]*[•*-][ \t]*(?:\*\*)?(?:Key Characteristics|Key Traits|Key Elements|Stylistic Traits)(?:\*\*)?:?[ \t]*([^\n]+)/i,
    (m, rawTraits) => {
      const cleanTraits = rawTraits
        .replace(/\band\s+/gi, '')
        .split(/[,;]/)
        .map((t) => t.trim().replace(/\.$/, ''))
        .filter((t) => t.length > 2);

      if (cleanTraits.length >= 2) {
        const formattedBullets = cleanTraits
          .map((t) => {
            const capitalized = t.charAt(0).toUpperCase() + t.slice(1);
            return `* ${capitalized}`;
          })
          .join('\n');
        return `\n\nKey stylistic traits include:\n${formattedBullets}`;
      }
      return m;
    }
  );

  // 3. Capitalize list lead-in lines and clean leading spaces on internal lines
  text = text.replace(/(^|\n)[ \t]*(key (?:stylistic|elements|traits|sonic|characteristics|attributes|achievements|label attributes)\b[^\n]*:)/gi, (m, prefix, leadIn) => {
    const capitalized = leadIn.charAt(0).toUpperCase() + leadIn.slice(1);
    return `${prefix}${capitalized}`;
  });

  // Clean any remaining leading spaces on lines before non-bullet prose
  text = text.replace(/(^|\n)[ \t]+([^•*\-\s])/g, '$1$2');

  return text.trim();
}

function sanitizeAlbumName(albumName, notableArtists) {
  if (typeof albumName !== 'string') return '';
  let cleaned = albumName
    .replace(/\[\s*\d+(?:\s*,\s*\d+)*\s*\]/g, '')
    .replace(/\(\s*\d+(?:\s*,\s*\d+)*\s*\)/g, '')
    .replace(/\[\s*(?:cite|citation)[^\]]*\]/gi, '')
    .replace(/""/g, '')
    .trim();

  if (!cleaned) return '';

  if (Array.isArray(notableArtists) && notableArtists.length > 0) {
    for (const rawArtist of notableArtists) {
      if (typeof rawArtist !== 'string' || !rawArtist.trim()) continue;
      const artist = rawArtist.trim();
      const escapedArtist = artist.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const unclosedWrapperRegex = new RegExp(`\\(\\s*${escapedArtist}\\s*$`);
      if (unclosedWrapperRegex.test(cleaned)) {
        cleaned = `${cleaned})`;
        break;
      }
    }
  }

  if (/\(\s*Sunn O\){3}\s*$/i.test(cleaned)) {
    cleaned = `${cleaned})`;
  }

  const openCount = (cleaned.match(/\(/g) || []).length;
  const closeCount = (cleaned.match(/\)/g) || []).length;
  if (openCount > closeCount) {
    cleaned = `${cleaned}${')'.repeat(openCount - closeCount)}`;
  }

  return cleaned.trim();
}

function cleanProfile(key, profile, isLabel = false) {
  if (!profile || typeof profile !== 'object') return { profile, changed: false };
  let changed = false;
  const updated = JSON.parse(JSON.stringify(profile));

  // 1. Summary sanitization
  if (updated.summary && typeof updated.summary === 'string') {
    const cleaned = cleanSummaryText(updated.summary);
    if (cleaned !== updated.summary) {
      updated.summary = cleaned;
      changed = true;
    }
  }

  // 2. Vein.fm hallucinated member removal (Josh Scogin)
  const isVein = key.toLowerCase().includes('vein-fm') || (updated.details?.artist || '').toLowerCase().includes('vein.fm');
  if (isVein && Array.isArray(updated.members)) {
    const origLen = updated.members.length;
    updated.members = updated.members.filter(m => !m.toLowerCase().includes('josh scogin'));
    if (updated.members.length !== origLen) {
      changed = true;
    }
  }

  // 3. notableArtists sanitization
  if (updated.details && Array.isArray(updated.details.notableArtists)) {
    const originalList = updated.details.notableArtists;
    let sanitized = sanitizeNotableArtists(originalList);

    const isKnockedLoose = key.toLowerCase().includes('knocked-loose') || (updated.details?.artist || '').toLowerCase().includes('knocked loose');
    if (isKnockedLoose && sanitized.length === 0) {
      sanitized = ["Jesus Piece", "Code Orange", "Kublai Khan TX", "Varials"];
    }

    if (JSON.stringify(sanitized) !== JSON.stringify(originalList)) {
      updated.details.notableArtists = sanitized;
      changed = true;
    }
  }

  // 4. Systemic Label imageUrl: null enforcement
  if (isLabel) {
    if (updated.imageUrl !== null) {
      updated.imageUrl = null;
      changed = true;
    }
    if (updated.details && 'imageUrl' in updated.details && updated.details.imageUrl !== null) {
      updated.details.imageUrl = null;
      changed = true;
    }
  }

  // 5. Discography normalization & parenthesis balancing
  if (Array.isArray(updated.discography)) {
    const notable = updated.details?.notableArtists;
    const origDisc = JSON.stringify(updated.discography);
    updated.discography = updated.discography.map(item => {
      if (!item || typeof item !== 'object') return item;
      return {
        ...item,
        albumName: sanitizeAlbumName(item.albumName, notable),
        releaseYear: typeof item.releaseYear === 'string' ? item.releaseYear.trim() : String(item.releaseYear || '')
      };
    });
    if (JSON.stringify(updated.discography) !== origDisc) {
      changed = true;
    }
  }

  return { profile: updated, changed };
}

async function cleanUserProjects(userId, labelSet) {
  console.log(`\n--- Inspecting Projects for user: ${userId} ---`);
  const projectsRef = db.collection(`users/${userId}/projects`);
  const snapshot = await projectsRef.get();
  console.log(`Found ${snapshot.docs.length} projects for user ${userId}.`);

  let updatedCount = 0;
  for (const doc of snapshot.docs) {
    const pData = doc.data();
    let cache = pData.detailsCache;
    if (!cache) continue;

    const isString = typeof cache === 'string';
    let cacheObj = cache;
    if (isString) {
      try {
        cacheObj = JSON.parse(cache);
      } catch (e) {
        console.warn(`[Project ${doc.id}] Failed to parse detailsCache JSON string`);
        continue;
      }
    }

    let projectChanged = false;
    let newCache;

    const checkIsLabel = (key, val) => {
      const k = String(key || '').toLowerCase();
      if (labelSet && (labelSet.has(k) || labelSet.has(k.replace(/(?:-(?:records|recordings|music|company|entertainment|group|productions|inc|ltd))+$/, '')))) {
        return true;
      }
      if (val?.type === 'label' || val?.details?.type === 'label') return true;
      if (k.includes('records') || k.includes('recordings')) return true;
      if (val?.details && val.details.style === undefined && Array.isArray(val.details.notableArtists)) return true;
      return false;
    };

    if (Array.isArray(cacheObj)) {
      newCache = cacheObj.map(([k, v]) => {
        const isLabel = checkIsLabel(k, v);
        const { profile, changed } = cleanProfile(k, v, isLabel);
        if (changed) {
          projectChanged = true;
          console.log(`  [Project ${doc.id}] Modified cache entry: ${k} (isLabel: ${isLabel})`);
        }
        return [k, profile];
      });
    } else if (cacheObj && typeof cacheObj === 'object') {
      newCache = {};
      for (const [k, v] of Object.entries(cacheObj)) {
        const isLabel = checkIsLabel(k, v);
        const { profile, changed } = cleanProfile(k, v, isLabel);
        if (changed) {
          projectChanged = true;
          console.log(`  [Project ${doc.id}] Modified cache entry: ${k} (isLabel: ${isLabel})`);
        }
        newCache[k] = profile;
      }
    }

    if (projectChanged && newCache) {
      await doc.ref.update({
        detailsCache: isString ? JSON.stringify(newCache) : newCache,
        updatedAt: FieldValue.serverTimestamp(),
      });
      console.log(`✅ Updated project: users/${userId}/projects/${doc.id} (${pData.name || pData.title || 'Untitled'})`);
      updatedCount++;
    }
  }
  return updatedCount;
}

async function cleanCollection(collectionName) {
  console.log(`\n--- Inspecting /${collectionName} collection ---`);
  const colRef = db.collection(collectionName);
  const snapshot = await colRef.get();
  console.log(`Found ${snapshot.docs.length} documents in /${collectionName}.`);

  const isLabelCollection = collectionName === 'labels';
  let updatedCount = 0;
  let skippedStubs = 0;

  for (const doc of snapshot.docs) {
    const data = doc.data();
    if (data._isStub === true && !data.detailsCache) {
      skippedStubs++;
      continue;
    }

    let cache = data.detailsCache;
    if (!cache) continue;

    const isString = typeof cache === 'string';
    let cacheObj = cache;
    if (isString) {
      try {
        cacheObj = JSON.parse(cache);
      } catch (e) {
        console.warn(`[${collectionName}/${doc.id}] Failed to parse detailsCache JSON string`);
        continue;
      }
    }

    const { profile, changed } = cleanProfile(doc.id, cacheObj, isLabelCollection);
    const rootNeedsImageNull = isLabelCollection && data.imageUrl !== null && data.imageUrl !== undefined;

    if (changed || rootNeedsImageNull) {
      const updateData = {
        detailsCache: isString ? JSON.stringify(profile) : profile,
        updatedAt: FieldValue.serverTimestamp(),
      };
      if (isLabelCollection) {
        updateData.imageUrl = null;
      }
      await doc.ref.update(updateData);
      console.log(`✅ Updated ${collectionName}/${doc.id}${rootNeedsImageNull ? ' (enforced root imageUrl: null)' : ''}`);
      updatedCount++;
    }
  }

  console.log(`/${collectionName} Summary: ${snapshot.docs.length} inspected, ${skippedStubs} stubs skipped, ${updatedCount} updated.`);
  return updatedCount;
}

async function main() {
  console.log("===============================================================");
  console.log("EXECUTING COMPREHENSIVE FIRESTORE SANITIZATION & CACHE CLEANUP");
  console.log("===============================================================");

  // Pre-load all label IDs for cross-referencing project cache entries
  const labelDocs = await db.collection('labels').get();
  const labelSet = new Set(labelDocs.docs.map(d => d.id.toLowerCase()));
  console.log(`Loaded ${labelSet.size} canonical label IDs into memory.`);

  let totalProjectsUpdated = 0;
  for (const uid of TARGET_USERS) {
    totalProjectsUpdated += await cleanUserProjects(uid, labelSet);
  }

  const artistsUpdated = await cleanCollection('artists');
  const labelsUpdated = await cleanCollection('labels');

  console.log("\n===============================================================");
  console.log("FINAL CLEANUP SUMMARY");
  console.log(`- User Projects Updated: ${totalProjectsUpdated}`);
  console.log(`- /artists Documents Updated: ${artistsUpdated}`);
  console.log(`- /labels Documents Updated: ${labelsUpdated}`);
  console.log("===============================================================");
}

main().then(() => {
  console.log("Admin cleanup script completed successfully.");
  process.exit(0);
}).catch((err) => {
  console.error("Cleanup script failed:", err);
  process.exit(1);
});

