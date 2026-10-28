const fnv1aHash = (input: string): string => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
};

const extractCanonicalGraphSignature = (rawGraphData: any): { hasNodes: boolean; signature: string } => {
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
  const canonicalPayload = [
    projectId,
    String(data.status ?? ''),
    String(data.activeJobId ?? ''),
    String(data.seedArtists ?? ''),
    String(data.cacheKey ?? ''),
    fnv1aHash(graphSig),
    fnv1aHash(rawDetails),
    entityIdsSig,
  ].join('::');
  return `${projectId}:${fnv1aHash(canonicalPayload)}`;
};
