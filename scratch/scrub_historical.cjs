const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('../firebase-service-account.json');
const path = require('path');
const fs = require('fs');

// Initialize Firebase Admin
try {
  initializeApp({
    credential: cert(serviceAccount),
    projectId: 'zcene-production'
  });
} catch (e) {
  // Already initialized
}
const db = getFirestore();

// Known mappings to mimic curatorService logic
const KNOWN_COUNTRY_SLUGS = [
  '-united-states', '-united-kingdom', '-global', '-australia', '-canada', '-germany', '-france',
  '-japan', '-sweden', '-italy', '-spain', '-brazil', '-mexico', '-netherlands', '-belgium',
  '-norway', '-finland', '-denmark', '-ireland', '-new-zealand', '-poland', '-austria',
  '-switzerland', '-uk', '-usa', '-us', '-gb', '-au', '-ca', '-de', '-fr', '-jp', '-se', '-it', '-es',
  '-br', '-mx', '-nl', '-be', '-no', '-fi', '-dk', '-ie', '-nz', '-pl', '-at', '-ch',
  '-scotland', '-wales', '-northern-ireland', '-england'
];

function normalizeArtistId(name) {
  if (!name) return "";
  let n = name.trim().toLowerCase();
  n = n.replace(/[^a-z0-9]+/g, '-');
  return n.replace(/^-+|-+$/g, '');
}

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

const COUNTRY_ISO_MAP = {
  'united states': 'us', 'usa': 'us', 'us': 'us',
  'united kingdom': 'gb', 'uk': 'gb', 'england': 'gb', 'great britain': 'gb', 'scotland': 'gb', 'wales': 'gb', 'northern ireland': 'gb',
  'australia': 'au', 'canada': 'ca', 'germany': 'de',
  'france': 'fr', 'japan': 'jp', 'sweden': 'se',
  'italy': 'it', 'spain': 'es', 'brazil': 'br',
  'mexico': 'mx', 'netherlands': 'nl', 'belgium': 'be',
  'norway': 'no', 'finland': 'fi', 'denmark': 'dk',
  'ireland': 'ie', 'new zealand': 'nz', 'poland': 'pl',
  'austria': 'at', 'switzerland': 'ch'
};

function extractCountrySlug(originStr) {
  if (!originStr || typeof originStr !== 'string' || originStr.trim().length === 0) {
    return 'global';
  }
  const parts = originStr.split(',').map(s => s.trim()).filter(Boolean);
  const rawCountry = parts.length > 0 ? parts[parts.length - 1] : originStr;
  const lowerCountry = rawCountry.toLowerCase().trim();
  if (COUNTRY_ISO_MAP[lowerCountry]) {
    return COUNTRY_ISO_MAP[lowerCountry];
  }
  const slug = normalizeArtistId(rawCountry);
  return slug || 'global';
}

const ISO_TO_COUNTRY_MAP = {
  'us': 'United States', 'gb': 'United Kingdom', 'au': 'Australia',
  'ca': 'Canada', 'de': 'Germany', 'fr': 'France', 'jp': 'Japan',
  'se': 'Sweden', 'it': 'Italy', 'es': 'Spain', 'br': 'Brazil',
  'mx': 'Mexico', 'nl': 'Netherlands', 'be': 'Belgium', 'no': 'Norway',
  'fi': 'Finland', 'dk': 'Denmark', 'ie': 'Ireland', 'nz': 'New Zealand',
  'pl': 'Poland', 'at': 'Austria', 'ch': 'Switzerland'
};

function pruneGraph(graphData, protectedSeeds, docPath, dryRun = true) {
  if (!graphData || !graphData.nodes || !graphData.links) return { modified: false };
  
  const originalNodeCount = graphData.nodes.length;
  const originalLinkCount = graphData.links.length;

  const validNodeIds = new Set(graphData.nodes.map(n => n.id));
  const connectedNodeIds = new Set();
  
  graphData.links.forEach(link => {
    const sId = typeof link.source === 'string' ? link.source : link.source.id;
    const tId = typeof link.target === 'string' ? link.target : link.target.id;
    if (validNodeIds.has(sId) && validNodeIds.has(tId)) {
      connectedNodeIds.add(sId);
      connectedNodeIds.add(tId);
    }
  });

  const protectedSeedIds = new Set();
  protectedSeeds.forEach(seed => {
    protectedSeedIds.add(seed);
    protectedSeedIds.add(normalizeArtistId(seed));
  });

  graphData.nodes = graphData.nodes.filter(node => {
    if (node.type === 'country') {
      let isRequired = false;
      for (const n of graphData.nodes) {
        if (n.type === 'artist' || n.type === 'label') {
          if (n.origin) {
            const canonSlug = extractCountrySlug(n.origin);
            if (canonSlug !== 'global') {
              const canonCountryName = ISO_TO_COUNTRY_MAP[canonSlug] || canonSlug;
              if (normalizeArtistId(canonCountryName) === node.id) {
                isRequired = true;
                break;
              }
            }
          }
        }
      }
      if (!isRequired) {
        return false;
      }
    }
    return connectedNodeIds.has(node.id) || protectedSeedIds.has(node.id);
  });

  const prunedNodeCount = originalNodeCount - graphData.nodes.length;

  const finalValidNodes = new Set(graphData.nodes.map(n => n.id));
  graphData.links = graphData.links.filter(link => {
    const sId = typeof link.source === 'string' ? link.source : link.source.id;
    const tId = typeof link.target === 'string' ? link.target : link.target.id;
    return finalValidNodes.has(sId) && finalValidNodes.has(tId);
  });

  const prunedLinkCount = originalLinkCount - graphData.links.length;

  if (prunedNodeCount > 0 || prunedLinkCount > 0) {
    if (dryRun) {
      console.log(`[DRY RUN] Would prune ${prunedNodeCount} nodes and ${prunedLinkCount} links in ${docPath}`);
    } else {
      console.log(`[COMMITTED] Pruned ${prunedNodeCount} nodes and ${prunedLinkCount} links in ${docPath}`);
    }
    return { modified: true, graphData };
  }
  return { modified: false };
}

async function runCleanup(dryRun = true) {
  console.log(`Starting historical scrub (dryRun=${dryRun})...`);
  let modifiedProjects = 0;
  let modifiedArtists = 0;

  // 1. Projects
  const usersSnap = await db.collection('users').get();
  for (const userDoc of usersSnap.docs) {
    const projectsSnap = await userDoc.ref.collection('projects').get();
    for (const projectDoc of projectsSnap.docs) {
      const data = projectDoc.data();
      if (data.graphData) {
        let graphData;
        try {
          graphData = typeof data.graphData === 'string' ? JSON.parse(data.graphData) : data.graphData;
        } catch (e) { continue; }
        
        let seeds = [];
        if (data.artists) {
          seeds = data.artists.split('::').map(s => s.trim());
        }
        
        const result = pruneGraph(graphData, seeds, `users/${userDoc.id}/projects/${projectDoc.id}`, dryRun);
        if (result.modified && !dryRun) {
          await projectDoc.ref.update({
            graphData: JSON.stringify(result.graphData)
          });
          modifiedProjects++;
        } else if (result.modified && dryRun) {
          modifiedProjects++;
        }
      }
    }
  }

  // 2. Artists
  const artistsSnap = await db.collection('artists').get();
  for (const artistDoc of artistsSnap.docs) {
    const data = artistDoc.data();
    if (data.graphData) {
      let graphData;
      try {
        graphData = typeof data.graphData === 'string' ? JSON.parse(data.graphData) : data.graphData;
      } catch (e) { continue; }
      
      const result = pruneGraph(graphData, [artistDoc.id], `artists/${artistDoc.id}`, dryRun);
      if (result.modified && !dryRun) {
        await artistDoc.ref.update({
          graphData: JSON.stringify(result.graphData)
        });
        modifiedArtists++;
      } else if (result.modified && dryRun) {
        modifiedArtists++;
      }
    }
  }

  console.log(`Finished. Projects to modify: ${modifiedProjects}. Artists to modify: ${modifiedArtists}`);
}

const isDryRun = !process.argv.includes('--commit');
runCleanup(isDryRun).catch(console.error);
