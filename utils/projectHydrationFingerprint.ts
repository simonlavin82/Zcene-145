const fnv1aHash = (input: string): string => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
};

export const extractCanonicalGraphSignature = (rawGraphData: any): { hasNodes: boolean; signature: string } => {
  if (!rawGraphData) return { hasNodes: false, signature: '' };
  try {
    const parsed = typeof rawGraphData === 'string' ? JSON.parse(rawGraphData) : rawGraphData;
    const nodes = Array.isArray(parsed?.nodes) ? parsed.nodes : [];
    if (nodes.length === 0) return { hasNodes: false, signature: '' };
    const links = Array.isArray(parsed?.links) ? parsed.links : [];
    const nodeSig = nodes
      .map((n: any) => `${String(n?.id ?? '').trim().toLowerCase()}:${String(n?.type ?? 'artist').trim().toLowerCase()}`)
      .sort()
      .join('|');
    const linkSig = links
      .map((l: any) => {
        const src = typeof l?.source === 'object' ? l?.source?.id : l?.source;
        const tgt = typeof l?.target === 'object' ? l?.target?.id : l?.target;
        return `${String(src ?? '').trim().toLowerCase()}->${String(tgt ?? '').trim().toLowerCase()}`;
      })
      .sort()
      .join('|');
    const rationaleSig = typeof parsed?.synthesisRationale === 'string' ? parsed.synthesisRationale.trim() : '';
    return {
      hasNodes: true,
      signature: `${nodeSig}#${linkSig}#${rationaleSig}`,
    };
  } catch {
    const fallbackStr = typeof rawGraphData === 'string' ? rawGraphData : JSON.stringify(rawGraphData);
    return { hasNodes: false, signature: fallbackStr };
  }
};

export const computeProjectHydrationFingerprint = (
  projectId: string | null | undefined,
  data: Record<string, any> | null | undefined
): string => {
  if (!projectId || !data) return '';
  const { hasNodes, signature: graphSig } = extractCanonicalGraphSignature(data.graphData);
  const rawDetails =
    typeof data.detailsCache === 'string'
      ? data.detailsCache
      : data.detailsCache
        ? JSON.stringify(data.detailsCache)
        : '';
  const entityIdsSig = hasNodes
    ? ''
    : [
        Array.isArray(data.artistIds) ? [...data.artistIds].map(String).sort().join(',') : '',
        Array.isArray(data.labelIds) ? [...data.labelIds].map(String).sort().join(',') : '',
      ].join(';');
  const normalizeZineEntry = (entry: any) => {
    if (typeof entry === 'string') {
      const trimmed = entry.trim();
      return trimmed || null;
    }
    if (entry && typeof entry === 'object' && typeof entry.url === 'string' && entry.url.trim()) {
      const url = entry.url.trim();
      const caption = typeof entry.caption === 'string' ? entry.caption.replace(/\s+/g, ' ').trim().slice(0, 140) : '';
      const blockOffset = entry.blockOffset === 1 ? 1 : undefined;
      if (!caption && blockOffset !== 1) return url;
      return {
        url,
        ...(caption ? { caption } : {}),
        ...(blockOffset === 1 ? { blockOffset: 1 } : {}),
      };
    }
    return null;
  };
  const rawOverarchingImages = Array.isArray(data.overarchingZineImages)
    ? [
        normalizeZineEntry(data.overarchingZineImages[0]),
        normalizeZineEntry(data.overarchingZineImages[1]),
        normalizeZineEntry(data.overarchingZineImages[2]),
      ]
    : [];
  const hasOverarchingImages = rawOverarchingImages.some((entry) => entry !== null);
  const normalizedOverarchingIntro =
    typeof data.overarchingZineIntro === 'string' ? data.overarchingZineIntro.trim() : '';
  const multiSceneSig =
    data.overarchingRationale || data.scenes || data.crossSceneLinks || hasOverarchingImages || normalizedOverarchingIntro
      ? fnv1aHash(
          `${String(data.overarchingRationale ?? '')}|${
            typeof data.scenes === 'string' ? data.scenes : JSON.stringify(data.scenes ?? '')
          }|${
            typeof data.crossSceneLinks === 'string' ? data.crossSceneLinks : JSON.stringify(data.crossSceneLinks ?? '')
          }${hasOverarchingImages ? `|${JSON.stringify(rawOverarchingImages)}` : ''}${
            normalizedOverarchingIntro ? `|${normalizedOverarchingIntro}` : ''
          }`
        )
      : '';
  const canonicalPayload = [
    projectId,
    String(data.status ?? ''),
    String(data.activeJobId ?? ''),
    String(data.seedArtists ?? ''),
    String(data.cacheKey ?? ''),
    fnv1aHash(graphSig),
    fnv1aHash(rawDetails),
    entityIdsSig,
    ...(multiSceneSig ? [multiSceneSig] : []),
  ].join('::');
  return `${projectId}:${fnv1aHash(canonicalPayload)}`;
};

export const computeAutosaveDocSnapshot = (data: any): string => {
  if (!data) return '';
  const { signature: graphSig } = extractCanonicalGraphSignature(data.graphData);

  const normalizeJson = (val: any, fallback: string = '') => {
    if (val === undefined || val === null) return fallback;
    if (typeof val === 'string') {
      try {
        return JSON.stringify(JSON.parse(val));
      } catch {
        return val;
      }
    }
    return JSON.stringify(val);
  };

  const activeNodes = Array.isArray(data.activeNodes) ? [...data.activeNodes].map(String).sort() : [];
  const pinnedNodes = Array.isArray(data.pinnedNodes) ? [...data.pinnedNodes].map(String).sort() : [];
  const rawSeedImageUrls = Array.isArray(data.seedImageUrls)
    ? data.seedImageUrls.map((u: any) => (typeof u === 'string' && u.trim() ? u.trim() : null))
    : [];
  const seedImageUrls = rawSeedImageUrls.some(Boolean) ? rawSeedImageUrls : [];
  const normalizeSnapshotZineEntry = (entry: any) => {
    if (typeof entry === 'string') {
      const trimmed = entry.trim();
      return trimmed || null;
    }
    if (entry && typeof entry === 'object' && typeof entry.url === 'string' && entry.url.trim()) {
      const url = entry.url.trim();
      const caption = typeof entry.caption === 'string' ? entry.caption.replace(/\s+/g, ' ').trim().slice(0, 140) : '';
      const blockOffset = entry.blockOffset === 1 ? 1 : undefined;
      if (!caption && blockOffset !== 1) return url;
      return {
        url,
        ...(caption ? { caption } : {}),
        ...(blockOffset === 1 ? { blockOffset: 1 } : {}),
      };
    }
    return null;
  };
  const rawOverarchingZineImages = Array.isArray(data.overarchingZineImages)
    ? [
        normalizeSnapshotZineEntry(data.overarchingZineImages[0]),
        normalizeSnapshotZineEntry(data.overarchingZineImages[1]),
        normalizeSnapshotZineEntry(data.overarchingZineImages[2]),
      ]
    : [];
  const overarchingZineImages = rawOverarchingZineImages.some((entry) => entry !== null)
    ? rawOverarchingZineImages
    : [];
  const overarchingZineIntro =
    typeof data.overarchingZineIntro === 'string' ? data.overarchingZineIntro.trim() : '';

  return JSON.stringify({
    name: data.name || '',
    seedArtists: data.seedArtists || '',
    seedImageUrl: typeof data.seedImageUrl === 'string' ? data.seedImageUrl.trim() : '',
    seedImageUrls,
    scenes: normalizeJson(data.scenes, '[]'),
    overarchingRationale: data.overarchingRationale || '',
    overarchingZineIntro,
    overarchingZineImages,
    crossSceneLinks: normalizeJson(data.crossSceneLinks, '[]'),
    discoveryFilters: normalizeJson(data.discoveryFilters, '{}'),
    activeNodes,
    pinnedNodes,
    chatHistories: normalizeJson(data.chatHistories, '[]'),
    lastViewedStackCount: data.lastViewedStackCount || 0,
    graphSig,
  });
};
