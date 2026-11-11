const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const serviceAccount = require('../firebase-service-account.json');

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();

// Helper functions similar to app
const normalizeArtistId = (id) => {
  if (!id) return "";
  return id.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
};

const extractCountrySlug = (originStr) => {
  if (!originStr || typeof originStr !== 'string' || originStr.trim().length === 0) return 'global';
  const parts = originStr.split(',').map(s => s.trim()).filter(Boolean);
  const rawCountry = parts.length > 0 ? parts[parts.length - 1] : originStr;
  return normalizeArtistId(rawCountry) || 'global';
};

const buildCompositeCacheKey = (artistId, filters) => {
  // Simplified for test
  return artistId;
};

// Mock Data
const mockAliasId = "scowl";
const mockCanonicalId = "scowl-usa"; // Assume origin is USA
const mockDetailsCache = {
  summary: "Scowl stands out in the contemporary hardcore scene...",
  details: {
    artist: "Scowl",
    genre: "Hardcore Punk",
    origin: "Santa Cruz, CA, USA"
  }
};
const mockGraphData = {
  nodes: [{ id: "scowl", label: "Scowl", type: "artist" }],
  links: []
};

async function runDiagnostic() {
  console.log("=== PHASE A: Clean Slate Setup ===");
  await db.collection('artists').doc(mockAliasId).delete();
  await db.collection('artists').doc(mockCanonicalId).delete();
  console.log(`Deleted ${mockAliasId} and ${mockCanonicalId}.`);

  console.log("\n=== PHASE B: Backend Simulation (Write) ===");
  // Backend canonical creation
  const recDocRef = db.collection('artists').doc(mockCanonicalId);
  await recDocRef.set({
    cacheKey: mockCanonicalId,
    artistId: mockAliasId,
    seedArtists: "Scowl",
    graphData: null,
    detailsCache: mockDetailsCache,
    filters: null,
    cacheVersion: 4,
    cachedAt: FieldValue.serverTimestamp(),
    isDeep: true,
  });
  console.log(`Backend wrote canonical: ${mockCanonicalId}`);

  // Backend alias pointer creation
  const bareArtistIdRef = db.collection('artists').doc(mockAliasId);
  const bareSnap = await bareArtistIdRef.get();
  const barePayload = {
    cacheKey: mockAliasId,
    artistId: mockAliasId,
    seedArtists: "Scowl",
    cacheVersion: 4,
    cachedAt: FieldValue.serverTimestamp(),
    redirectTo: mockCanonicalId
  };
  if (!bareSnap.exists) {
    await bareArtistIdRef.set(barePayload);
    console.log(`Backend wrote pure stub to: ${mockAliasId}`);
  }

  const snapAfterBackend = await db.collection('artists').doc(mockAliasId).get();
  console.log(`[Assertion B] Does ${mockAliasId} have detailsCache? ${!!snapAfterBackend.data().detailsCache}`);

  console.log("\n=== PHASE C: Frontend Simulation (Write) ===");
  // Simulate writeArtistCacheMany logic on 'scowl'
  const node = mockGraphData.nodes[0];
  const name = node.label || node.id;
  const normalizedNodeId = normalizeArtistId(node.id);
  const artistDetails = mockDetailsCache;
  const countryNorm = extractCountrySlug(artistDetails.details.origin);
  const disambiguatedCanonicalId = normalizedNodeId.endsWith(`-${countryNorm}`) ? normalizedNodeId : `${normalizedNodeId}-${countryNorm}`;
  const compositeCanonicalId = buildCompositeCacheKey(disambiguatedCanonicalId);
  
  const canonicalDocRef = db.collection('artists').doc(compositeCanonicalId);
  const canonicalSnap = await canonicalDocRef.get();
  const existing = canonicalSnap.exists ? canonicalSnap.data() : null;

  if (existing && existing.redirectTo) {
    console.log(`[Frontend Simulation] Skipping canonical update for "${compositeCanonicalId}" because it is a redirect alias to ${existing.redirectTo}.`);
  } else {
    // Recommendation write-back
    const updatePayload = {
      detailsCache: artistDetails,
      cachedAt: FieldValue.serverTimestamp(),
      cacheVersion: 4,
      artistId: normalizedNodeId,
      cacheKey: compositeCanonicalId,
      isDeep: true,
    };
    if (canonicalSnap.exists) {
      await canonicalDocRef.update(updatePayload);
    } else {
      await canonicalDocRef.set(updatePayload);
    }
    console.log(`[Frontend Simulation] Wrote detailsCache for canonical doc: ${compositeCanonicalId}`);
  }

  // Bare root alias pointer protection & legacy healing
  const frontendBareRef = db.collection('artists').doc(normalizedNodeId);
  const frontendBareSnap = await frontendBareRef.get();
  const bareData = frontendBareSnap.exists ? frontendBareSnap.data() : null;

  if (!frontendBareSnap.exists || (bareData && !bareData.redirectTo && frontendBareSnap.id !== compositeCanonicalId)) {
    await frontendBareRef.set({
      cacheKey: normalizedNodeId,
      artistId: normalizedNodeId,
      seedArtists: name,
      cacheVersion: 4,
      cachedAt: FieldValue.serverTimestamp(),
      redirectTo: compositeCanonicalId
    });
    console.log(`[Frontend Simulation] Created/Healed Bare Alias Pointer Stub: ${normalizedNodeId} -> ${compositeCanonicalId}`);
  }

  const snapAfterFrontend = await db.collection('artists').doc(mockAliasId).get();
  console.log(`[Assertion C] Does ${mockAliasId} have detailsCache? ${!!snapAfterFrontend.data().detailsCache}`);
  if (snapAfterFrontend.data().detailsCache) {
    console.warn(`=> Bloat identified! ${mockAliasId} is bloated.`);
  } else {
    console.log(`=> No bloat. ${mockAliasId} is a pure stub.`);
  }

  console.log("\n=== PHASE D: Hydration Simulation (Cold-Start Read) ===");
  // Simulate batchHydrateDetailsCache logic in App.tsx
  const simpleId = normalizeArtistId(node.id);
  const connectedCountries = []; // no connected countries in basic mock graph
  
  let cacheId = simpleId;
  if (connectedCountries.length > 0) {
    const countryNorm = normalizeArtistId(connectedCountries[0]);
    if (countryNorm) cacheId = simpleId.endsWith(`-${countryNorm}`) ? simpleId : `${simpleId}-${countryNorm}`;
  }
  console.log(`[Hydration] Hydrating for simpleId: "${simpleId}", cacheId: "${cacheId}"`);
  
  let entitySnap = await db.collection('artists').doc(cacheId).get();
  if (entitySnap.exists) {
    const data = entitySnap.data();
    if (data.redirectTo) {
      console.log(`[Hydration] Following redirect from ${cacheId} -> ${data.redirectTo}`);
      entitySnap = await db.collection('artists').doc(data.redirectTo).get();
    }
  }

  if (!entitySnap.exists) {
    console.log(`[Hydration] Entity doc does not exist.`);
  } else {
    const data = entitySnap.data();
    if (data.detailsCache) {
      console.log(`[Hydration] Successfully hydrated detailsCache from global doc: ${entitySnap.id}`);
      // Now, in App.tsx, the results are stored in a map:
      // results.set(node.id, payload)
      // results.set(simpleId, payload)
      const memKeys = [node.id, node.id.toLowerCase(), simpleId];
      if (cacheId !== simpleId) memKeys.push(cacheId);
      console.log(`[Hydration] detailsCache saved in React memory state under keys: ${memKeys.join(', ')}`);
      
      // Now, simulate UI lookup
      const uiLookupKey = mockCanonicalId; // Let's say the new graph has id = 'scowl-usa'
      console.log(`[UI Render] The D3 graph renders node ID: "${uiLookupKey}".`);
      if (memKeys.includes(uiLookupKey)) {
         console.log(`[UI Render] SUCCESS! Found details in local memory for key "${uiLookupKey}". No Synthesis Required.`);
      } else {
         console.log(`[UI Render] MISS! "${uiLookupKey}" not found in local memory keys. Falling back to fetching globalDoc. UI shows Synthesis Required.`);
      }
    } else {
      console.log(`[Hydration] No detailsCache found in doc: ${entitySnap.id}`);
    }
  }

}

runDiagnostic().catch(console.error);
