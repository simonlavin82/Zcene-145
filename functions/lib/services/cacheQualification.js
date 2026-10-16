"use strict";
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
 *   TOPOLOGY_HIT  → graphData has ≥1 node AND ≥1 edge, synthesisRationale has
 *                   a valid non-empty essay (≥50 chars), AND the seed profile has
 *                   a substantial bio (>50 chars), a genre and an imageUrl.
 *   USABLE_STALE  → graphData is structurally usable (nodes + edges + synthesisRationale)
 *                   but the profile is thin (short bio / missing genre / missing image).
 *                   Option A: still rendered locally for free.
 *   STUB          → Document exists but has no usable topology, is missing
 *                   synthesisRationale, or its graph explicitly belongs to a different seed.
 *   MISS          → No document.
 *
 * Routing rule (V15 Diagram, green dashed "Topology Hit (Cache)" pathway):
 *   isLocallyRenderable(verdict) === true  → Step 4 (Confirm) → Step 7 (Render).
 *   Column 2 (executeCurationPipeline) and Column 3 (worker) MUST NOT be invoked.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.redactSensitive = exports.deriveRoutingDecision = exports.isLocallyRenderable = exports.qualifyCacheEntry = exports.parseGraphField = exports.extractSeedProfile = exports.MIN_RATIONALE_LENGTH = exports.MIN_BIO_LENGTH = void 0;
exports.MIN_BIO_LENGTH = 50;
exports.MIN_RATIONALE_LENGTH = 50;
const simpleNormalize = (value) => (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['’]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
const safeParse = (field) => {
    if (field === undefined || field === null || field === '')
        return null;
    try {
        let parsed = typeof field === 'string' ? JSON.parse(field) : field;
        // Double-stringified payloads
        if (typeof parsed === 'string')
            parsed = JSON.parse(parsed);
        return parsed;
    }
    catch {
        return null;
    }
};
/**
 * Extracts the seed's profile object from any of the historical detailsCache
 * shapes: plain object, `[{...}]`, or Map-entries `[[key, {...}], ...]`.
 * When `seedId` is supplied, a matching Map-entry key is preferred.
 */
const extractSeedProfile = (detailsCacheField, seedId) => {
    const parsed = safeParse(detailsCacheField);
    if (!parsed)
        return null;
    if (Array.isArray(parsed)) {
        if (parsed.length === 0)
            return null;
        if (Array.isArray(parsed[0])) {
            if (seedId) {
                const target = simpleNormalize(seedId);
                const match = parsed.find((entry) => Array.isArray(entry) && simpleNormalize(String(entry[0] ?? '')) === target);
                if (match && match[1])
                    return match[1];
            }
            return parsed[0][1] ?? null;
        }
        return parsed[0] ?? null;
    }
    return typeof parsed === 'object' ? parsed : null;
};
exports.extractSeedProfile = extractSeedProfile;
const parseGraphField = (graphField) => {
    const parsed = safeParse(graphField);
    if (!parsed || typeof parsed !== 'object')
        return null;
    const nodes = Array.isArray(parsed.nodes) ? parsed.nodes : [];
    const links = Array.isArray(parsed.links) ? parsed.links : [];
    return { ...parsed, nodes, links };
};
exports.parseGraphField = parseGraphField;
/**
 * Qualifies a raw Firestore `artists/{id}` (or `labels/{id}`) document.
 */
const qualifyCacheEntry = (data, seedId) => {
    if (!data) {
        return { verdict: 'MISS', isStructurallyUsable: false, isFullyQualified: false, missing: ['document'] };
    }
    const missing = [];
    // ── 1. Structural topology & Roots Breakdown ──────────────────────────────
    const graph = (0, exports.parseGraphField)(data.graphData);
    const hasNodes = !!graph && graph.nodes.length > 0;
    const hasEdges = !!graph && graph.links.length > 0;
    if (!hasNodes)
        missing.push('nodes');
    if (!hasEdges)
        missing.push('edges');
    // Architecture V29 Read Gate: Direct Hit strictly requires non-empty synthesisRationale (>= 50 chars)
    const rawRationale = (typeof data.synthesisRationale === 'string' && data.synthesisRationale) ||
        (graph && typeof graph.synthesisRationale === 'string' && graph.synthesisRationale) ||
        '';
    const hasRationale = typeof rawRationale === 'string' && rawRationale.trim().length >= exports.MIN_RATIONALE_LENGTH;
    if (!hasRationale)
        missing.push('synthesisRationale');
    const isStructurallyUsable = hasNodes && hasEdges && hasRationale;
    // ── 2. Seed profile (bio / genre / image) ─────────────────────────────────
    const profile = (0, exports.extractSeedProfile)(data.detailsCache, seedId || data.artistId || data.cacheKey);
    const bio = profile?.summary || profile?.bio || profile?.description || profile?.text || '';
    const genreRaw = profile?.details?.genre || profile?.genre || data?.details?.genre || '';
    const genre = Array.isArray(genreRaw) ? genreRaw.join(', ') : genreRaw;
    const imageUrl = profile?.imageUrl || profile?.image || '';
    const hasBio = typeof bio === 'string' && bio.trim().length > exports.MIN_BIO_LENGTH && !bio.toLowerCase().includes('sandbox mock');
    const hasGenre = typeof genre === 'string' && genre.trim().length > 0 && genre.trim().toLowerCase() !== 'unknown';
    const hasImage = typeof imageUrl === 'string' && imageUrl.trim().length > 0;
    if (!hasBio)
        missing.push('bio');
    if (!hasGenre)
        missing.push('genre');
    if (!hasImage)
        missing.push('imageUrl');
    const isFullyQualified = isStructurallyUsable && hasBio && hasGenre && hasImage;
    let verdict;
    if (isFullyQualified)
        verdict = 'TOPOLOGY_HIT';
    else if (isStructurallyUsable)
        verdict = 'USABLE_STALE';
    else
        verdict = 'STUB';
    return { verdict, isStructurallyUsable, isFullyQualified, missing };
};
exports.qualifyCacheEntry = qualifyCacheEntry;
/** Option A: anything structurally usable is rendered locally at zero cost. */
const isLocallyRenderable = (verdict) => verdict === 'TOPOLOGY_HIT' || verdict === 'USABLE_STALE';
exports.isLocallyRenderable = isLocallyRenderable;
const deriveRoutingDecision = (verdicts, isLiveSynthesis) => {
    if (isLiveSynthesis)
        return 'LIVE_SYNTHESIS';
    if (verdicts.length === 0)
        return 'MISS';
    const renderable = verdicts.filter(exports.isLocallyRenderable).length;
    if (renderable === verdicts.length)
        return 'TOPOLOGY_HIT';
    if (renderable > 0)
        return 'PARTIAL';
    return 'MISS';
};
exports.deriveRoutingDecision = deriveRoutingDecision;
/** Recursively strips secrets from a payload before it is written to logs. */
const SENSITIVE_KEYS = new Set(['password', 'apiKey', 'api_key', 'token', 'secret', 'authorization']);
const redactSensitive = (value, depth = 0) => {
    if (depth > 6 || value === null || typeof value !== 'object')
        return value;
    if (Array.isArray(value))
        return value.map(v => (0, exports.redactSensitive)(v, depth + 1));
    const out = {};
    for (const [k, v] of Object.entries(value)) {
        out[k] = SENSITIVE_KEYS.has(k) || SENSITIVE_KEYS.has(k.toLowerCase())
            ? (v ? '[REDACTED]' : v)
            : (0, exports.redactSensitive)(v, depth + 1);
    }
    return out;
};
exports.redactSensitive = redactSensitive;
//# sourceMappingURL=cacheQualification.js.map