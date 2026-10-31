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
exports.sanitizeDiscoveryFilters = exports.hasActiveDiscoveryFilters = exports.hasActiveTier3Filters = exports.hasActiveTier2Filters = exports.sanitizeAnchorLabelInput = exports.V30_ERA_MAX = exports.getDynamicEraMax = exports.SCENE_MATURITY_BUFFER_YEARS = exports.V30_ERA_MIN = exports.redactSensitive = exports.deriveRoutingDecision = exports.isLocallyRenderable = exports.qualifyCacheEntry = exports.isFullyQualifiedEntityProfile = exports.parseGraphField = exports.extractSeedProfile = exports.MIN_RATIONALE_LENGTH = exports.MIN_BIO_LENGTH = void 0;
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
 * Architecture V33 (Rule 8 & Rule 40) — Unified Entity Profile Qualification Gate.
 *
 * Enforces that a cached or newly hydrated entity profile (`detailsCache`) is complete
 * and free of prose-fallback degradation before being accepted as a Read Hit or written
 * to global `/artists` or `/labels`:
 *   1. Valid summary (> 50 chars, no mock/placeholder text).
 *   2. Non-empty details.genre, details.origin, and details.founded.
 *   3. Authentic recommendationReason (non-empty for artists, and never containing
 *      "Synthesised from live cultural archives").
 *   4. For artists (!isLabel):
 *      - Array.isArray(profile.discography) (honest empty arrays [] are fully qualified for unindexed underground artists)
 *      - Non-empty imageUrl string (either a verified https:// URL or the terminal
 *        "not-found" monogram state after a real 4-tier scrape;
 *        only undefined/null/"" means image scraping has not run).
 */
const isFullyQualifiedEntityProfile = (profile, isLabel = false) => {
    if (!profile || typeof profile !== 'object' || Array.isArray(profile))
        return false;
    if (profile._isStub === true || profile.redirectTo)
        return false;
    const bio = String(profile.summary || profile.bio || profile.description || profile.text || '').trim();
    const bioLower = bio.toLowerCase();
    const hasValidBio = bio.length > exports.MIN_BIO_LENGTH &&
        bio !== 'Imported from Apple Music library.' &&
        !bioLower.includes('sandbox mock') &&
        !bioLower.includes('mock bio') &&
        !bioLower.includes('awaiting deep cut analysis');
    if (!hasValidBio)
        return false;
    const isInvalidMeta = (val) => {
        if (val === undefined || val === null)
            return true;
        const str = (Array.isArray(val) ? val.join(', ') : String(val)).trim().toLowerCase();
        return str.length === 0 || str === 'unknown' || str === 'n/a' || str === 'none' || str === 'not available';
    };
    const genreRaw = profile.details?.genre ?? profile.genre;
    const originRaw = profile.details?.origin ?? profile.origin;
    const foundedRaw = profile.details?.founded ?? profile.founded;
    if (isInvalidMeta(genreRaw) || isInvalidMeta(originRaw) || isInvalidMeta(foundedRaw)) {
        return false;
    }
    const recReason = String(profile.recommendationReason ?? '').trim();
    if (recReason.toLowerCase().includes('synthesised from live cultural archives')) {
        return false;
    }
    if (!isLabel && recReason.length === 0) {
        return false;
    }
    if (!isLabel) {
        const styleRaw = profile.details?.style ?? profile.style;
        if (isInvalidMeta(styleRaw)) {
            return false;
        }
        if (!Array.isArray(profile.discography)) {
            return false;
        }
        const imageUrl = typeof profile.imageUrl === 'string'
            ? profile.imageUrl.trim()
            : (typeof profile.image === 'string' ? profile.image.trim() : '');
        if (imageUrl.length === 0) {
            return false;
        }
    }
    return true;
};
exports.isFullyQualifiedEntityProfile = isFullyQualifiedEntityProfile;
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
    // ── 2. Seed profile (bio / genre / style / image / V33 anti-pollution checks) ─────
    const profile = (0, exports.extractSeedProfile)(data.detailsCache, seedId || data.artistId || data.cacheKey);
    const isLabel = !!data?.labelId;
    const bio = profile?.summary || profile?.bio || profile?.description || profile?.text || '';
    const genreRaw = profile?.details?.genre || profile?.genre || data?.details?.genre || '';
    const genre = Array.isArray(genreRaw) ? genreRaw.join(', ') : genreRaw;
    const styleRaw = profile?.details?.style || profile?.style || data?.details?.style || '';
    const style = Array.isArray(styleRaw) ? styleRaw.join(', ') : styleRaw;
    const imageUrl = profile?.imageUrl || profile?.image || '';
    const recReason = String(profile?.recommendationReason || '').trim();
    const isProseFallback = recReason.toLowerCase().includes('synthesised from live cultural archives');
    const hasInvalidDiscography = !isLabel && profile?.discography !== undefined && !Array.isArray(profile.discography);
    const hasBio = typeof bio === 'string' && bio.trim().length > exports.MIN_BIO_LENGTH && !bio.toLowerCase().includes('sandbox mock') && !isProseFallback;
    const hasGenre = typeof genre === 'string' && genre.trim().length > 0 && genre.trim().toLowerCase() !== 'unknown';
    const hasStyle = isLabel || (typeof style === 'string' && style.trim().length > 0 && style.trim().toLowerCase() !== 'unknown');
    const hasImage = isLabel || (typeof imageUrl === 'string' && imageUrl.trim().length > 0);
    if (!hasBio)
        missing.push('bio');
    if (!hasGenre)
        missing.push('genre');
    if (!hasStyle)
        missing.push('style');
    if (!hasImage)
        missing.push('imageUrl');
    if (isProseFallback)
        missing.push('recommendationReason');
    if (hasInvalidDiscography)
        missing.push('discography');
    const isFullyQualified = isStructurallyUsable && hasBio && hasGenre && hasStyle && hasImage && !isProseFallback && !hasInvalidDiscography;
    let verdict;
    if (isFullyQualified)
        verdict = 'TOPOLOGY_HIT';
    else if (isStructurallyUsable && !isProseFallback && !hasInvalidDiscography)
        verdict = 'USABLE_STALE';
    else
        verdict = 'STUB';
    return { verdict, isStructurallyUsable: isStructurallyUsable && !isProseFallback && !hasInvalidDiscography, isFullyQualified, missing };
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
/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Architecture V30 — 3-Tier Anchor Qualification & Sanitization Contract
 * ─────────────────────────────────────────────────────────────────────────────
 */
exports.V30_ERA_MIN = 1965;
/**
 * Rolling Scene Maturity Buffer (N - 2):
 * Dynamically calculates the upper founded era bound based on the current calendar year.
 */
exports.SCENE_MATURITY_BUFFER_YEARS = 2;
const getDynamicEraMax = (now = new Date()) => {
    return now.getFullYear() - exports.SCENE_MATURITY_BUFFER_YEARS;
};
exports.getDynamicEraMax = getDynamicEraMax;
exports.V30_ERA_MAX = (0, exports.getDynamicEraMax)();
/**
 * Sanitizes a user-provided or combobox-created Level 3 Anchor Label string.
 * Strips control characters, quotes, structural delimiters, and prompt-injection
 * patterns while preserving valid label display names (capped at 60 chars).
 */
const sanitizeAnchorLabelInput = (raw) => {
    if (typeof raw !== 'string')
        return '';
    let cleaned = raw
        // Strip control chars and prompt-breaking punctuation
        .replace(/[\r\n\t"`';:{}[\]<>|\\!]/g, ' ')
        // Strip common prompt injection directives
        .replace(/\b(ignore\s+(all\s+)?(previous|prior)\s+instructions?|system\s+prompt|you\s+are\s+now|disregard\s+all)\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
    if (cleaned.length > 60) {
        cleaned = cleaned.substring(0, 60).trim();
    }
    return cleaned;
};
exports.sanitizeAnchorLabelInput = sanitizeAnchorLabelInput;
/**
 * Evaluates whether Level 2 Hard Spatial & Temporal Guardrails are active.
 * Note: Resting at full outer bounds (<= 1965 and >= dynamic horizon simultaneously) is treated as unfiltered.
 * Moving either thumb inward (e.g. 1965-1975 or 1990-2024) is treated as an active Level 2 filter.
 *
 * Horizon Normalization:
 * Any `foundedBefore >= V30_ERA_MAX` is resting at the rolling maturity horizon (unfiltered ceiling).
 * Any `foundedAfter <= V30_ERA_MIN` is resting at the historical floor (unfiltered floor).
 * This eliminates the "New Year's Day Cache Invalidation" trap and neutralizes legacy stored 2026 data.
 */
const hasActiveTier2Filters = (filters) => {
    if (!filters || typeof filters !== 'object')
        return false;
    const afterRaw = filters.foundedAfter !== undefined && filters.foundedAfter !== null && filters.foundedAfter !== ''
        ? Number(filters.foundedAfter)
        : undefined;
    const beforeRaw = filters.foundedBefore !== undefined && filters.foundedBefore !== null && filters.foundedBefore !== ''
        ? Number(filters.foundedBefore)
        : undefined;
    const afterNum = (afterRaw !== undefined && !isNaN(afterRaw) && afterRaw > 0) ? afterRaw : undefined;
    const beforeNum = (beforeRaw !== undefined && !isNaN(beforeRaw) && beforeRaw > 0) ? beforeRaw : undefined;
    // An upper bound at or above the active horizon is resting at max (unfiltered upper bound)
    const isUpperResting = beforeNum === undefined || beforeNum >= exports.V30_ERA_MAX;
    // A lower bound at or below V30_ERA_MIN is resting at min (unfiltered lower bound)
    const isLowerResting = afterNum === undefined || afterNum <= exports.V30_ERA_MIN;
    const hasEra = !(isUpperResting && isLowerResting);
    const hasIncOrigins = Array.isArray(filters.includeOrigins) &&
        filters.includeOrigins.some((s) => typeof s === 'string' && s.trim().length > 0);
    const hasExcOrigins = Array.isArray(filters.excludeOrigins) &&
        filters.excludeOrigins.some((s) => typeof s === 'string' && s.trim().length > 0);
    return hasEra || hasIncOrigins || hasExcOrigins;
};
exports.hasActiveTier2Filters = hasActiveTier2Filters;
/**
 * Evaluates whether Level 3 Soft Scene Gravity anchors (Canonical Genres or Anchor Labels) are active.
 */
const hasActiveTier3Filters = (filters) => {
    if (!filters || typeof filters !== 'object')
        return false;
    const hasGenres = Array.isArray(filters.includeGenres) &&
        filters.includeGenres.some((s) => typeof s === 'string' && s.trim().length > 0);
    const hasLabels = Array.isArray(filters.anchorLabels) &&
        filters.anchorLabels.some((s) => typeof s === 'string' && (0, exports.sanitizeAnchorLabelInput)(s).length > 0);
    return hasGenres || hasLabels;
};
exports.hasActiveTier3Filters = hasActiveTier3Filters;
/**
 * Single Source of Truth for whether a DiscoveryFilters payload has any active
 * Level 2 or Level 3 constraints. Immune to the "Empty Array" Complex Generation Trap
 * (`{ includeGenres: [], anchorLabels: [] }` -> false) and legacy `additionalInstructions`.
 */
const hasActiveDiscoveryFilters = (filters) => {
    return (0, exports.hasActiveTier2Filters)(filters) || (0, exports.hasActiveTier3Filters)(filters);
};
exports.hasActiveDiscoveryFilters = hasActiveDiscoveryFilters;
/**
 * Produces a sanitized, canonical V30 DiscoveryFilters object:
 * - Strips legacy `additionalInstructions`
 * - Drops empty arrays
 * - Normalizes resting outer slider bounds (<= 1965 or >= V30_ERA_MAX) to undefined
 * - Swaps inverted year bounds and enforces mutual exclusion on includeOrigins/excludeOrigins
 * - Sanitizes `anchorLabels` via `sanitizeAnchorLabelInput`
 */
const sanitizeDiscoveryFilters = (filters) => {
    if (!filters || typeof filters !== 'object')
        return {};
    const out = {};
    const afterRaw = filters.foundedAfter !== undefined && filters.foundedAfter !== null && filters.foundedAfter !== ''
        ? Number(filters.foundedAfter)
        : undefined;
    const beforeRaw = filters.foundedBefore !== undefined && filters.foundedBefore !== null && filters.foundedBefore !== ''
        ? Number(filters.foundedBefore)
        : undefined;
    let afterNum = (afterRaw !== undefined && !isNaN(afterRaw) && afterRaw > 0) ? afterRaw : undefined;
    let beforeNum = (beforeRaw !== undefined && !isNaN(beforeRaw) && beforeRaw > 0) ? beforeRaw : undefined;
    if (afterNum !== undefined && beforeNum !== undefined && afterNum > beforeNum) {
        const tmp = afterNum;
        afterNum = beforeNum;
        beforeNum = tmp;
    }
    // Horizon Normalization:
    // Any beforeNum >= V30_ERA_MAX rests at the rolling horizon -> normalize to undefined.
    // Any afterNum <= V30_ERA_MIN rests at the historical origin -> normalize to undefined.
    if (beforeNum !== undefined && beforeNum >= exports.V30_ERA_MAX) {
        beforeNum = undefined;
    }
    if (afterNum !== undefined && afterNum <= exports.V30_ERA_MIN) {
        afterNum = undefined;
    }
    if (afterNum !== undefined)
        out.foundedAfter = afterNum;
    if (beforeNum !== undefined)
        out.foundedBefore = beforeNum;
    if (Array.isArray(filters.includeOrigins)) {
        const clean = filters.includeOrigins.map((s) => typeof s === 'string' ? s.trim() : '').filter(Boolean);
        if (clean.length > 0)
            out.includeOrigins = clean;
    }
    if (!out.includeOrigins && Array.isArray(filters.excludeOrigins)) {
        const clean = filters.excludeOrigins.map((s) => typeof s === 'string' ? s.trim() : '').filter(Boolean);
        if (clean.length > 0)
            out.excludeOrigins = clean;
    }
    if (Array.isArray(filters.includeGenres)) {
        const clean = filters.includeGenres.map((s) => typeof s === 'string' ? s.trim() : '').filter(Boolean);
        if (clean.length > 0)
            out.includeGenres = clean;
    }
    if (Array.isArray(filters.anchorLabels)) {
        const clean = filters.anchorLabels.map((s) => (0, exports.sanitizeAnchorLabelInput)(s)).filter(Boolean);
        if (clean.length > 0)
            out.anchorLabels = clean;
    }
    return out;
};
exports.sanitizeDiscoveryFilters = sanitizeDiscoveryFilters;
//# sourceMappingURL=cacheQualification.js.map