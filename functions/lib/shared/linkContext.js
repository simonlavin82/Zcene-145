"use strict";
/**
 * shared/linkContext.ts
 *
 * Shared directional edge-context sanitization and deterministic fallback resolution
 * ([Rule 23] Topology Parity & [Rule 26] Contextual Tooltips).
 *
 * Every artist-to-artist bullet in <MusicGraph> renders as:
 *   • {Capitalized phrase} {TargetArtistName}
 * Therefore directional link contexts (`forwardContext` / `inverseContext`) must be
 * concise predicate phrases (3–8 words) that omit both endpoint artist names and
 * grammatically lead into `{TargetArtistName}` — never generic "is connected to".
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveFallbackRelationContext = exports.extractNarrativeCoMentionContext = exports.sanitizeDirectionalLinkContext = void 0;
const GENERIC_CONNECTION_PATTERNS = new Set([
    '',
    'is connected to',
    'connected to',
    'connects to',
    'connects with',
    'is connected with',
    'is linked to',
    'linked to',
    'links to',
]);
const TRAILING_CONNECTORS = new Set([
    'with',
    'alongside',
    'by',
    'to',
    'for',
    'of',
    'from',
    'into',
    'onto',
    'through',
    'beside',
    'via',
    'on',
    'in',
    'over',
    'after',
    'before',
    'under',
    'around',
    'across',
    'as',
]);
const escapeRegExp = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const stripMarkdownFormatting = (text) => text
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .trim();
const endsWithConnectorOrTransitiveCue = (phrase) => {
    const words = phrase.trim().split(/\s+/);
    if (words.length === 0)
        return false;
    const lastWord = words[words.length - 1].toLowerCase().replace(/[^a-z]/g, '');
    return TRAILING_CONNECTORS.has(lastWord);
};
/**
 * Sanitizes an LLM-generated `forwardContext` or `inverseContext` phrase so it never:
 *   1. Starts with `{sourceName}` or `{sourceName} and {targetName}`
 *   2. Ends with `{targetName}` (which <MusicGraph> appends automatically)
 *   3. Falls back to generic `"is connected to"` copy
 */
const sanitizeDirectionalLinkContext = (rawPhrase, sourceLabel, targetLabel) => {
    if (!rawPhrase || typeof rawPhrase !== 'string')
        return '';
    let cleaned = stripMarkdownFormatting(rawPhrase)
        .replace(/^[\s•\-–—"'“”‘’]+/, '')
        .replace(/[\s.;,:!?"'“”‘’]+$/, '')
        .replace(/\s+/g, ' ')
        .trim();
    if (!cleaned)
        return '';
    if (GENERIC_CONNECTION_PATTERNS.has(cleaned.toLowerCase()))
        return '';
    const src = sourceLabel?.trim();
    const tgt = targetLabel?.trim();
    let strippedJointSubject = false;
    if (src && tgt) {
        const jointForward = new RegExp(`^(?:${escapeRegExp(src)}\\s+(?:and|&)\\s+${escapeRegExp(tgt)}|${escapeRegExp(tgt)}\\s+(?:and|&)\\s+${escapeRegExp(src)})\\s+`, 'i');
        if (jointForward.test(cleaned)) {
            cleaned = cleaned.replace(jointForward, '').trim();
            strippedJointSubject = true;
        }
    }
    if (src) {
        const leadingSrc = new RegExp(`^${escapeRegExp(src)}\\s+`, 'i');
        cleaned = cleaned.replace(leadingSrc, '').trim();
    }
    if (tgt) {
        const trailingTgt = new RegExp(`\\s+${escapeRegExp(tgt)}$`, 'i');
        if (trailingTgt.test(cleaned)) {
            cleaned = cleaned.replace(trailingTgt, '').trim();
        }
    }
    cleaned = cleaned.replace(/[\s.;,:!?]+$/, '').trim();
    if (!cleaned || GENERIC_CONNECTION_PATTERNS.has(cleaned.toLowerCase()))
        return '';
    if (strippedJointSubject) {
        // Keep only the first concise clause if a comma/semicolon follows
        const firstClause = cleaned.split(/[,;]/)[0].trim();
        if (firstClause.length >= 6) {
            cleaned = firstClause;
        }
        if (!endsWithConnectorOrTransitiveCue(cleaned)) {
            cleaned = `${cleaned} alongside`;
        }
    }
    return cleaned;
};
exports.sanitizeDirectionalLinkContext = sanitizeDirectionalLinkContext;
const getEndpointId = (ep) => typeof ep === 'string' ? ep : ep?.id || '';
/**
 * Extracts a concise directional predicate from `synthesisRationale` if both artists
 * are co-cited in the same narrative sentence or bullet (e.g.
 * "• **Lomosonic** and **Labanoon** kept the explosive live energy alive, merging...").
 */
const extractNarrativeCoMentionContext = (synthesisRationale, sourceLabel, targetLabel) => {
    if (!synthesisRationale || !sourceLabel?.trim() || !targetLabel?.trim())
        return '';
    const src = sourceLabel.trim();
    const tgt = targetLabel.trim();
    const srcEsc = escapeRegExp(src);
    const tgtEsc = escapeRegExp(tgt);
    const srcRe = new RegExp(`\\b${srcEsc}\\b`, 'i');
    const tgtRe = new RegExp(`\\b${tgtEsc}\\b`, 'i');
    const lines = synthesisRationale
        .split(/\n+/)
        .flatMap(line => line.split(/(?<=[.!?])\s+/));
    for (const rawSegment of lines) {
        const segment = stripMarkdownFormatting(rawSegment)
            .replace(/^[\s•*+\-–—\d.)]+/, '')
            .trim();
        if (!segment)
            continue;
        if (!srcRe.test(segment) || !tgtRe.test(segment))
            continue;
        // Case A: "{Source} and {Target} <predicate>[, ...]" (or reversed order)
        const pairLeadRe = new RegExp(`^(?:even\\s+acts\\s+like\\s+|acts\\s+like\\s+|bands\\s+like\\s+|peers\\s+like\\s+|artists\\s+like\\s+)?(?:${srcEsc}\\s+(?:and|&)\\s+${tgtEsc}|${tgtEsc}\\s+(?:and|&)\\s+${srcEsc})\\s+([^,;.!?]+)`, 'i');
        const pairMatch = segment.match(pairLeadRe);
        if (pairMatch && pairMatch[1]) {
            let predicate = pairMatch[1].trim().replace(/[\s.;,:!?]+$/, '');
            const wordCount = predicate.split(/\s+/).filter(Boolean).length;
            if (wordCount >= 2 && wordCount <= 9) {
                if (!endsWithConnectorOrTransitiveCue(predicate)) {
                    predicate = `${predicate} alongside`;
                }
                return predicate;
            }
        }
        // Case B: "{Source} <predicate> {Target}" inside a concise clause
        const directBetweenRe = new RegExp(`\\b${srcEsc}\\s+([a-z][^,;.!?]{2,55}?)\\s+${tgtEsc}\\b`, 'i');
        const betweenMatch = segment.match(directBetweenRe);
        if (betweenMatch && betweenMatch[1]) {
            const candidate = (0, exports.sanitizeDirectionalLinkContext)(betweenMatch[1], src, tgt);
            const wordCount = candidate.split(/\s+/).filter(Boolean).length;
            if (candidate && wordCount >= 1 && wordCount <= 8 && !/^(?:and|or|&)$/i.test(candidate)) {
                return candidate;
            }
        }
        return 'highlighted in this scene alongside';
    }
    return '';
};
exports.extractNarrativeCoMentionContext = extractNarrativeCoMentionContext;
/**
 * Resolves a specific, non-generic relationship phrase when `forwardContext` / `inverseContext`
 * are absent on an edge:
 *   1. Sanitized legacy `link.context` (if non-generic)
 *   2. Shared Record Label node ("shares the {Label} roster with")
 *   3. Narrative co-mention in `synthesisRationale` (exact editorial predicate or scene co-citation)
 *   4. Shared Genre / Country ecosystem petals ("shares the {Country} {Genre} scene with")
 *   5. Specific lineage fallback ("shares scene lineage with") — never "is connected to"
 */
const resolveFallbackRelationContext = (params) => {
    const { sourceNode, targetNode, allNodes = [], allLinks = [], synthesisRationale, legacyLinkContext, } = params;
    const sourceLabel = sourceNode.label || sourceNode.id;
    const targetLabel = targetNode.label || targetNode.id;
    // 1. Legacy single-string link.context if non-generic
    const fromLegacy = (0, exports.sanitizeDirectionalLinkContext)(legacyLinkContext, sourceLabel, targetLabel);
    if (fromLegacy)
        return fromLegacy;
    let sharedLabel = null;
    let sharedGenre = null;
    let sharedCountry = null;
    if (allNodes.length > 0 && allLinks.length > 0) {
        const nodeById = new Map();
        for (const n of allNodes) {
            if (n?.id)
                nodeById.set(n.id.toLowerCase(), n);
        }
        const getNeighborsOf = (entityId) => {
            const lower = entityId.toLowerCase();
            const set = new Set();
            for (const l of allLinks) {
                const s = getEndpointId(l.source).toLowerCase();
                const t = getEndpointId(l.target).toLowerCase();
                if (s === lower && t !== lower)
                    set.add(t);
                else if (t === lower && s !== lower)
                    set.add(s);
            }
            return set;
        };
        const srcNeighbors = getNeighborsOf(sourceNode.id);
        const tgtNeighbors = getNeighborsOf(targetNode.id);
        for (const nId of srcNeighbors) {
            if (!tgtNeighbors.has(nId))
                continue;
            const petal = nodeById.get(nId);
            if (!petal)
                continue;
            const pType = (petal.type || '').toLowerCase();
            const pName = (petal.label || petal.id || '').trim();
            if (!pName)
                continue;
            if (pType === 'label' && !sharedLabel)
                sharedLabel = pName;
            else if (pType === 'genre' && !sharedGenre)
                sharedGenre = pName;
            else if (pType === 'country' && !sharedCountry)
                sharedCountry = pName;
        }
    }
    // 2. Shared Record Label
    if (sharedLabel) {
        return `shares the ${sharedLabel} roster with`;
    }
    // 3. Editorial narrative co-mention (matches Magazine View bullets)
    const fromNarrative = (0, exports.extractNarrativeCoMentionContext)(synthesisRationale, sourceLabel, targetLabel);
    if (fromNarrative)
        return fromNarrative;
    // 4. Shared Genre / Country scene petals
    if (sharedCountry && sharedGenre) {
        return `shares the ${sharedCountry} ${sharedGenre} scene with`;
    }
    if (sharedGenre) {
        return `shares ${sharedGenre} lineage with`;
    }
    if (sharedCountry) {
        return `emerged in the ${sharedCountry} scene alongside`;
    }
    return 'shares scene lineage with';
};
exports.resolveFallbackRelationContext = resolveFallbackRelationContext;
//# sourceMappingURL=linkContext.js.map