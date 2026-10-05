/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Unified Cache Qualification Contract (V15 — Single Source of Truth)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * This module is the ONE definition of a "Topology Hit" shared by the React
 * frontend (App.tsx) and the Cloud Functions backend (executeCurationPipeline).
 *
 * The functions build copies this file verbatim into `functions/src/services/`
 * (see `functions/package.json` → build script), so it MUST remain:
 *   - dependency-free (no imports),
 *   - pure (no Firestore / React / Node APIs).
 *
 * Relaxed Standard (authorised contract):
 *   TOPOLOGY_HIT  → graphData has ≥1 node AND ≥1 edge, AND the seed profile has
 *                   a substantial bio (>50 chars), a genre and an imageUrl.
 *                   Legacy `[Single-Seed Analysis]` rationale stubs do NOT
 *                   disqualify an entry.
 *   USABLE_STALE  → graphData is structurally usable (nodes + edges) but the
 *                   profile is thin (short bio / missing genre / missing image).
 *                   Option A: still rendered locally for free.
 *   STUB          → Document exists but has no usable topology (or its graph
 *                   explicitly belongs to a different seed).
 *   MISS          → No document.
 *
 * Routing rule (V15 Diagram, green dashed "Topology Hit (Cache)" pathway):
 *   isLocallyRenderable(verdict) === true  → Step 4 (Confirm) → Step 7 (Render).
 *   Column 2 (executeCurationPipeline) and Column 3 (worker) MUST NOT be invoked.
 */

export type CacheVerdict = 'TOPOLOGY_HIT' | 'USABLE_STALE' | 'STUB' | 'MISS';

export interface CacheQualification {
  verdict: CacheVerdict;
  /** graphData has nodes + edges and belongs to this seed. */
  isStructurallyUsable: boolean;
  /** Meets the full relaxed standard (TOPOLOGY_HIT). */
  isFullyQualified: boolean;
  /** Human-readable reasons the entry fell short of TOPOLOGY_HIT. */
  missing: string[];
}

export const MIN_BIO_LENGTH = 50;

const simpleNormalize = (value: string): string =>
  (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['’]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const safeParse = (field: any): any => {
  if (field === undefined || field === null || field === '') return null;
  try {
    let parsed = typeof field === 'string' ? JSON.parse(field) : field;
    // Double-stringified payloads
    if (typeof parsed === 'string') parsed = JSON.parse(parsed);
    return parsed;
  } catch {
    return null;
  }
};

/**
 * Extracts the seed's profile object from any of the historical detailsCache
 * shapes: plain object, `[{...}]`, or Map-entries `[[key, {...}], ...]`.
 * When `seedId` is supplied, a matching Map-entry key is preferred.
 */
export const extractSeedProfile = (detailsCacheField: any, seedId?: string): any => {
  const parsed = safeParse(detailsCacheField);
  if (!parsed) return null;
  if (Array.isArray(parsed)) {
    if (parsed.length === 0) return null;
    if (Array.isArray(parsed[0])) {
      if (seedId) {
        const target = simpleNormalize(seedId);
        const match = parsed.find((entry: any) => Array.isArray(entry) && simpleNormalize(String(entry[0] ?? '')) === target);
        if (match && match[1]) return match[1];
      }
      return parsed[0][1] ?? null;
    }
    return parsed[0] ?? null;
  }
  return typeof parsed === 'object' ? parsed : null;
};

export const parseGraphField = (graphField: any): { nodes: any[]; links: any[] } | null => {
  const parsed = safeParse(graphField);
  if (!parsed || typeof parsed !== 'object') return null;
  const nodes = Array.isArray(parsed.nodes) ? parsed.nodes : [];
  const links = Array.isArray(parsed.links) ? parsed.links : [];
  return { ...parsed, nodes, links };
};

/**
 * Qualifies a raw Firestore `artists/{id}` (or `labels/{id}`) document.
 */
export const qualifyCacheEntry = (data: any, seedId?: string): CacheQualification => {
  if (!data) {
    return { verdict: 'MISS', isStructurallyUsable: false, isFullyQualified: false, missing: ['document'] };
  }

  const missing: string[] = [];

  // ── 1. Structural topology ────────────────────────────────────────────────
  const graph = parseGraphField(data.graphData);
  const hasNodes = !!graph && graph.nodes.length > 0;
  const hasEdges = !!graph && graph.links.length > 0;
  
  if (!hasNodes) missing.push('nodes');
  if (!hasEdges) missing.push('edges');

  const isStructurallyUsable = hasNodes && hasEdges;

  // ── 2. Seed profile (bio / genre / image) ─────────────────────────────────
  const profile = extractSeedProfile(data.detailsCache, seedId || data.artistId || data.cacheKey);
  const bio = profile?.summary || profile?.bio || profile?.description || profile?.text || '';
  const genreRaw = profile?.details?.genre || profile?.genre || data?.details?.genre || '';
  const genre = Array.isArray(genreRaw) ? genreRaw.join(', ') : genreRaw;
  const imageUrl = profile?.imageUrl || profile?.image || '';

  const hasBio = typeof bio === 'string' && bio.trim().length > MIN_BIO_LENGTH && !bio.toLowerCase().includes('sandbox mock');
  const hasGenre = typeof genre === 'string' && genre.trim().length > 0 && genre.trim().toLowerCase() !== 'unknown';
  const hasImage = typeof imageUrl === 'string' && imageUrl.trim().length > 0;
  if (!hasBio) missing.push('bio');
  if (!hasGenre) missing.push('genre');
  if (!hasImage) missing.push('imageUrl');

  const isFullyQualified = isStructurallyUsable && hasBio && hasGenre && hasImage;

  let verdict: CacheVerdict;
  if (isFullyQualified) verdict = 'TOPOLOGY_HIT';
  else if (isStructurallyUsable) verdict = 'USABLE_STALE';
  else verdict = 'STUB';

  return { verdict, isStructurallyUsable, isFullyQualified, missing };
};

/** Option A: anything structurally usable is rendered locally at zero cost. */
export const isLocallyRenderable = (verdict: CacheVerdict | undefined | null): boolean =>
  verdict === 'TOPOLOGY_HIT' || verdict === 'USABLE_STALE';

/**
 * Routing decision computed once per generation request in the pre-flight phase.
 *   TOPOLOGY_HIT   → local hydration only (V15 Step 7). Column 2 is forbidden.
 *   PARTIAL        → some seeds renderable, others need generation (multi-seed).
 *   MISS           → generation required.
 *   LIVE_SYNTHESIS → multi-seed / filtered synthesis (always Column 2).
 */
export type RoutingDecision = 'TOPOLOGY_HIT' | 'PARTIAL' | 'MISS' | 'LIVE_SYNTHESIS';

export const deriveRoutingDecision = (verdicts: CacheVerdict[], isLiveSynthesis: boolean): RoutingDecision => {
  if (isLiveSynthesis) return 'LIVE_SYNTHESIS';
  if (verdicts.length === 0) return 'MISS';
  const renderable = verdicts.filter(isLocallyRenderable).length;
  if (renderable === verdicts.length) return 'TOPOLOGY_HIT';
  if (renderable > 0) return 'PARTIAL';
  return 'MISS';
};

/** Recursively strips secrets from a payload before it is written to logs. */
const SENSITIVE_KEYS = new Set(['password', 'apiKey', 'api_key', 'token', 'secret', 'authorization']);
export const redactSensitive = (value: any, depth: number = 0): any => {
  if (depth > 6 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(v => redactSensitive(v, depth + 1));
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = SENSITIVE_KEYS.has(k) || SENSITIVE_KEYS.has(k.toLowerCase())
      ? (v ? '[REDACTED]' : v)
      : redactSensitive(v, depth + 1);
  }
  return out;
};
