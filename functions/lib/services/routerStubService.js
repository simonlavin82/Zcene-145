"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildDisambiguationSnippet = buildDisambiguationSnippet;
exports.upsertBareRouterStub = upsertBareRouterStub;
const firestore_1 = require("firebase-admin/firestore");
const isoCountries_1 = require("../shared/isoCountries");
const stripMarkdown = (text) => text
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
const isPlaceholderText = (val) => {
    if (!val)
        return true;
    const lower = val.trim().toLowerCase();
    return (!lower ||
        lower === "unknown" ||
        lower === "unknown origin" ||
        lower.startsWith("awaiting deep cut"));
};
/**
 * Produces a concise 1-sentence disambiguation snippet for Evolved Ambiguous Stub radio cards
 * ([Rule 6] & [Rule 17]) so warm homonym collisions always carry descriptive editorial context.
 */
function buildDisambiguationSnippet(meta) {
    if (!meta)
        return undefined;
    if (meta.disambiguationSnippet && !isPlaceholderText(meta.disambiguationSnippet)) {
        const cleaned = stripMarkdown(meta.disambiguationSnippet);
        if (cleaned)
            return cleaned;
    }
    if (meta.summary && !isPlaceholderText(meta.summary)) {
        const cleanedSummary = stripMarkdown(meta.summary);
        const firstSentenceMatch = cleanedSummary.match(/^(.+?[.!?])(?:\s|$)/);
        const sentence = (firstSentenceMatch ? firstSentenceMatch[1] : cleanedSummary).trim();
        if (sentence.length >= 12) {
            return sentence.length > 165 ? `${sentence.slice(0, 162).trim()}...` : sentence;
        }
    }
    const cleanGenre = meta.genre && !isPlaceholderText(meta.genre) ? meta.genre.trim() : "";
    const cleanOrigin = meta.origin && !isPlaceholderText(meta.origin) ? meta.origin.trim() : "";
    if (cleanGenre && cleanOrigin) {
        return `${cleanGenre} act from ${cleanOrigin}.`;
    }
    if (cleanOrigin) {
        return `Musical act from ${cleanOrigin}.`;
    }
    return undefined;
}
/**
 * Root-as-Router & Multi-Tenant Homonym Stub Upserter ([Rule 6], [Rule 10], [Rule 17], [Rule 36]):
 * Mints or upgrades `artists/{bareNormId}` without clobbering existing foreign homonyms, while
 * preserving and backfilling `disambiguationSnippet` on candidate entries.
 */
async function upsertBareRouterStub(db, bareNormId, targetCanonicalId, candidateMeta) {
    if (!bareNormId || bareNormId === targetCanonicalId)
        return;
    const stubDocRef = db.collection("artists").doc(bareNormId);
    const stubSnap = await stubDocRef.get();
    const existingData = stubSnap.exists ? stubSnap.data() : null;
    // Never clobber a non-stub full entity profile at bareNormId (e.g. 'global' legacy doc)
    if (existingData &&
        !existingData._isStub &&
        !existingData.redirectTo &&
        !existingData.isAmbiguous &&
        existingData.detailsCache) {
        return;
    }
    const matchedInputCandidate = Array.isArray(candidateMeta?.candidates)
        ? candidateMeta.candidates.find((c) => c?.id === targetCanonicalId) ||
            (candidateMeta.candidates.length === 1 ? candidateMeta.candidates[0] : null)
        : null;
    const resolvedOrigin = (candidateMeta?.origin && !isPlaceholderText(candidateMeta.origin)
        ? candidateMeta.origin
        : matchedInputCandidate?.origin) || "Unknown";
    const resolvedGenre = (candidateMeta?.genre && !isPlaceholderText(candidateMeta.genre)
        ? candidateMeta.genre
        : matchedInputCandidate?.genre) || "Unknown";
    const snippet = buildDisambiguationSnippet({
        disambiguationSnippet: candidateMeta?.disambiguationSnippet || matchedInputCandidate?.disambiguationSnippet,
        summary: candidateMeta?.summary,
        genre: resolvedGenre,
        origin: resolvedOrigin,
    });
    const newCandidate = {
        id: targetCanonicalId,
        name: candidateMeta?.name || matchedInputCandidate?.name || bareNormId,
        origin: resolvedOrigin,
        genre: resolvedGenre,
        ...(snippet ? { disambiguationSnippet: snippet } : {}),
    };
    // Case 1: Already an Evolved Ambiguous Stub — append new homonym OR backfill missing metadata/snippet on existing entry
    if (existingData?._isStub && existingData?.isAmbiguous) {
        const existingCandidates = Array.isArray(existingData.candidates)
            ? existingData.candidates
            : [];
        const existingIdx = existingCandidates.findIndex((c) => c?.id === targetCanonicalId);
        if (existingIdx === -1) {
            await stubDocRef.set({
                _isStub: true,
                isAmbiguous: true,
                redirectTo: null,
                artistId: bareNormId,
                cacheKey: bareNormId,
                candidates: [...existingCandidates, newCandidate],
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
            }, { merge: true });
            console.log(`[RouterStub] Appended homonym ${targetCanonicalId} to ambiguous stub ${bareNormId}`);
        }
        else {
            const prev = existingCandidates[existingIdx] || {};
            const needsEnrichment = (!prev.disambiguationSnippet && newCandidate.disambiguationSnippet) ||
                (isPlaceholderText(prev.origin) && !isPlaceholderText(newCandidate.origin)) ||
                (isPlaceholderText(prev.genre) && !isPlaceholderText(newCandidate.genre));
            if (needsEnrichment) {
                const updatedCandidates = [...existingCandidates];
                updatedCandidates[existingIdx] = {
                    ...prev,
                    name: prev.name || newCandidate.name,
                    origin: !isPlaceholderText(prev.origin) ? prev.origin : newCandidate.origin,
                    genre: !isPlaceholderText(prev.genre) ? prev.genre : newCandidate.genre,
                    ...(prev.disambiguationSnippet
                        ? { disambiguationSnippet: prev.disambiguationSnippet }
                        : newCandidate.disambiguationSnippet
                            ? { disambiguationSnippet: newCandidate.disambiguationSnippet }
                            : {}),
                };
                await stubDocRef.set({
                    _isStub: true,
                    isAmbiguous: true,
                    redirectTo: null,
                    artistId: bareNormId,
                    cacheKey: bareNormId,
                    candidates: updatedCandidates,
                    updatedAt: firestore_1.FieldValue.serverTimestamp(),
                }, { merge: true });
                console.log(`[RouterStub] Backfilled disambiguation metadata for ${targetCanonicalId} on ${bareNormId}`);
            }
        }
        return;
    }
    // Case 2: Existing single-pointer stub pointing to a DIFFERENT valid 2-letter ISO homonym -> Upgrade to Evolved Ambiguous Stub
    const existingRedirect = typeof existingData?.redirectTo === "string" ? existingData.redirectTo : null;
    const existingRedirectIso = existingRedirect ? (0, isoCountries_1.extractTrailingCountryIso)(existingRedirect) : null;
    const targetIso = (0, isoCountries_1.extractTrailingCountryIso)(targetCanonicalId);
    const isExistingValidTwoLetterCanonical = Boolean(existingRedirect &&
        existingRedirectIso &&
        /-[a-z]{2}$/i.test(existingRedirect) &&
        !existingRedirect.endsWith("-uk"));
    if (existingData?._isStub &&
        isExistingValidTwoLetterCanonical &&
        existingRedirect !== targetCanonicalId &&
        targetIso &&
        !(0, isoCountries_1.areCountryIsosCompatible)(existingRedirectIso, targetIso)) {
        const fallbackPrevOrigin = (existingRedirectIso && isoCountries_1.ISO_TO_COUNTRY_NAME[existingRedirectIso]) ||
            existingRedirectIso.toUpperCase();
        const prevCandidatesRaw = Array.isArray(existingData.candidates) && existingData.candidates.length > 0
            ? existingData.candidates
            : [
                {
                    id: existingRedirect,
                    name: candidateMeta?.name || bareNormId,
                    origin: fallbackPrevOrigin,
                    genre: "Unknown",
                },
            ];
        const prevCandidates = prevCandidatesRaw.map((c) => {
            if (c?.disambiguationSnippet)
                return c;
            const synth = buildDisambiguationSnippet({
                genre: c?.genre,
                origin: c?.origin,
            });
            return synth ? { ...c, disambiguationSnippet: synth } : c;
        });
        const merged = prevCandidates.some((c) => c?.id === targetCanonicalId)
            ? prevCandidates
            : [...prevCandidates, newCandidate];
        await stubDocRef.set({
            _isStub: true,
            isAmbiguous: true,
            redirectTo: null,
            artistId: bareNormId,
            cacheKey: bareNormId,
            candidates: merged,
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        }, { merge: true });
        console.log(`[RouterStub] Upgraded bare stub ${bareNormId} to Evolved Ambiguous Stub (${existingRedirect} + ${targetCanonicalId})`);
        return;
    }
    // Case 3: Single-pointer router stub (mint or enrich existing same-target stub)
    const existingSingleCand = Array.isArray(existingData?.candidates)
        ? existingData.candidates.find((c) => c?.id === targetCanonicalId)
        : null;
    const mergedCandidate = {
        ...newCandidate,
        origin: !isPlaceholderText(newCandidate.origin)
            ? newCandidate.origin
            : existingSingleCand?.origin || "Unknown",
        genre: !isPlaceholderText(newCandidate.genre)
            ? newCandidate.genre
            : existingSingleCand?.genre || "Unknown",
        ...(newCandidate.disambiguationSnippet
            ? { disambiguationSnippet: newCandidate.disambiguationSnippet }
            : existingSingleCand?.disambiguationSnippet
                ? { disambiguationSnippet: existingSingleCand.disambiguationSnippet }
                : {}),
    };
    await stubDocRef.set({
        _isStub: true,
        isAmbiguous: false,
        redirectTo: targetCanonicalId,
        artistId: bareNormId,
        cacheKey: bareNormId,
        candidates: [mergedCandidate],
        cachedAt: firestore_1.FieldValue.serverTimestamp(),
    }, { merge: true });
    console.log(`[RouterStub] Synchronously upserted bare stub forwarder: ${bareNormId} -> ${targetCanonicalId}`);
}
//# sourceMappingURL=routerStubService.js.map