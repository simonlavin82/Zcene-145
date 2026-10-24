"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.healOrphanedAsset = void 0;
const https_1 = require("firebase-functions/v2/https");
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
const genai_1 = require("@google/genai");
const curatorService_1 = require("./services/curatorService");
const executeCurationPipeline_1 = require("./executeCurationPipeline");
const cacheQualification_1 = require("./services/cacheQualification");
if ((0, app_1.getApps)().length === 0) {
    (0, app_1.initializeApp)();
}
const db = (0, firestore_1.getFirestore)();
try {
    db.settings({ ignoreUndefinedProperties: true });
}
catch (e) {
    // Ignore if already configured
}
exports.healOrphanedAsset = (0, https_1.onCall)({
    secrets: ["GEMINI_API_KEY"],
    timeoutSeconds: 60,
    memory: "512MiB",
}, async (request) => {
    const { entityId, entityType = 'artist', displayName, countrySlug, projectId, projectName } = request.data || {};
    if (!entityId || typeof entityId !== 'string') {
        throw new https_1.HttpsError("invalid-argument", "Missing or invalid entityId parameter");
    }
    // Master Kill Switch: Read global settings from adminLedger/system
    const systemSettingsRef = db.collection('adminLedger').doc('system');
    const systemSnap = await systemSettingsRef.get();
    if (systemSnap.exists && systemSnap.data()?.jitEnabled === false) {
        console.warn(`[JIT Healer] Blocked by master kill switch: jitEnabled is FALSE`);
        throw new https_1.HttpsError("unavailable", "JIT Healing is disabled.");
    }
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new https_1.HttpsError("failed-precondition", "GEMINI_API_KEY is not defined in environment secrets.");
    }
    // [Rule 36] Strict Taxonomy Normalization
    let canonicalId = (0, curatorService_1.normalizeArtistId)(entityId);
    const isLabel = entityType === 'label';
    if (isLabel) {
        canonicalId = (0, curatorService_1.normalizeLabelId)(entityId); // Strips -records, -music, -group, etc. (preserves -media)
        if (displayName) {
            const displayNorm = (0, curatorService_1.normalizeLabelId)(displayName);
            if (displayNorm && (displayNorm === 'century-media' || displayNorm.startsWith(canonicalId + '-'))) {
                canonicalId = displayNorm;
            }
        }
        if (canonicalId === 'century') {
            canonicalId = 'century-media';
        }
    }
    const collectionName = isLabel ? 'labels' : 'artists';
    let docRef = db.collection(collectionName).doc(canonicalId);
    try {
        // 1. [Rule 8, 37 & 40] Cache Qualification Gate: Reject and overwrite stubs or prose-fallback payloads
        const existingSnap = await docRef.get();
        if (existingSnap.exists) {
            const existingData = existingSnap.data();
            if (existingData?._isStub && existingData?.isAmbiguous) {
                console.warn(`[JIT Healer] ${collectionName}/${canonicalId} is an ambiguous routing stub. Refusing to synthesize.`);
                throw new https_1.HttpsError('failed-precondition', `Cannot synthesize ambiguous routing stub: ${canonicalId}`);
            }
            const isStub = existingData?._isStub === true || !!existingData?.redirectTo;
            let cachedDetails = null;
            if (existingData?.detailsCache) {
                try {
                    cachedDetails = typeof existingData.detailsCache === 'string'
                        ? JSON.parse(existingData.detailsCache)
                        : existingData.detailsCache;
                }
                catch (e) {
                    cachedDetails = existingData.detailsCache;
                }
            }
            if (!isStub && (0, cacheQualification_1.isFullyQualifiedEntityProfile)(cachedDetails, isLabel)) {
                console.log(`[JIT Healer] Complete Tier 1 cache hit for ${collectionName}/${canonicalId}. Bypassing.`);
                return { success: true, canonicalId, alreadyExisted: true, data: cachedDetails };
            }
            console.log(`[JIT Healer] Existing doc ${collectionName}/${canonicalId} failed V33 qualification gate (isStub: ${isStub}). Overwriting with full synthesis...`);
        }
        // 2. Global Auto-Kill Circuit Breaker: Count platform-wide receipts logged in rolling 24 hours
        const twentyFourHoursAgoMs = Date.now() - 24 * 60 * 60 * 1000;
        const recentHealsSnap = await db
            .collection('adminLedger')
            .doc('system')
            .collection('jitHeals')
            .where('healedAtMs', '>=', twentyFourHoursAgoMs)
            .count()
            .get();
        const totalRecentHeals = recentHealsSnap.data().count;
        if (totalRecentHeals >= 100) {
            console.error(`[JIT Circuit Breaker] TRIP TRIGGERED: ${totalRecentHeals} heals in last 24h (threshold: 100). Auto-disabling JIT...`);
            await systemSettingsRef.set({
                jitEnabled: false,
                disabledReason: `Auto-killed: 24h threshold exceeded (${totalRecentHeals} heals)`,
                trippedAt: firestore_1.FieldValue.serverTimestamp(),
                lastTripCount: totalRecentHeals
            }, { merge: true });
            throw new https_1.HttpsError("resource-exhausted", "JIT Circuit Breaker tripped: Global limit reached.");
        }
        console.log(`[JIT Healer] Initiating full-parity synthesis for ${entityType}: "${canonicalId}" (raw: "${entityId}") using ${curatorService_1.GEMINI_FLASH_MODEL}...`);
        // 2. Synthesize missing entity via Gemini 3.6 Flash (ThinkingLevel.LOW) with exact Column 3 prompt and schema parity
        const ai = new genai_1.GoogleGenAI({ apiKey, httpOptions: { timeout: 60000 } });
        const cleanSearchName = displayName || (0, curatorService_1.titleCaseArtistId)((0, executeCurationPipeline_1.stripCountrySlug)(canonicalId));
        const currentDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
        const originHint = countrySlug
            ? (countrySlug.toUpperCase() === 'US' ? 'United States' : countrySlug.toUpperCase() === 'GB' ? 'United Kingdom' : countrySlug.toUpperCase())
            : null;
        let prompt = curatorService_1.FETCH_NODE_DETAILS_PROMPT_TEMPLATE
            .replace('{{nodeIdentifier}}', cleanSearchName)
            .replace('{{nodeType}}', entityType)
            .replace('{{contextNodes}}', '')
            .replace(/{{currentDate}}/g, currentDate);
        if (originHint) {
            prompt = prompt.replace(/{{#if originHint}}[\s\S]*?{{originHint}}[\s\S]*?{{\/if}}/g, `- **Origin Hint (CRITICAL):** Details for: ${originHint}.`);
        }
        else {
            prompt = prompt.replace(/{{#if originHint}}[\s\S]*?{{\/if}}/g, '');
        }
        const response = await ai.models.generateContent({
            model: curatorService_1.GEMINI_FLASH_MODEL,
            contents: prompt,
            config: {
                systemInstruction: "You are a late-night record curator — the kind of person who pulls an obscure 7\" from a crate at 2am and traces exactly why it matters. Your tone is knowledgeable, vivid, and deeply immersed in musical history and counterculture scenes. Return detailed, factual, and scene-accurate profile information for the given musical entity matching the schema. No markdown formatting outside strings. NEGATIVE CONSTRAINT: NEVER use em-dashes (—) or long hyphens for dramatic effect or clause separation. Use standard editorial punctuation.",
                thinkingConfig: { thinkingLevel: genai_1.ThinkingLevel.LOW },
                responseMimeType: "application/json",
                responseSchema: curatorService_1.NODE_DETAILS_SCHEMA
            }
        });
        const jsonText = response.text?.trim() || "";
        if (!jsonText) {
            throw new Error("Empty response returned from Gemini synthesis");
        }
        const cleanedJsonText = (0, curatorService_1.extractCleanJsonString)(jsonText);
        const synthesizedDetails = JSON.parse(cleanedJsonText);
        if (!synthesizedDetails.details) {
            synthesizedDetails.details = {};
        }
        // Guarantee human-readable artist display name in payload
        const cleanTitle = (synthesizedDetails.details.artist || cleanSearchName).trim();
        synthesizedDetails.details.artist = cleanTitle;
        if (isLabel) {
            const synthesizedLabelId = (0, curatorService_1.normalizeLabelId)(cleanTitle);
            if (synthesizedLabelId && (canonicalId === 'century' || synthesizedLabelId === 'century-media' || synthesizedLabelId.startsWith(canonicalId + '-'))) {
                canonicalId = synthesizedLabelId;
                docRef = db.collection(collectionName).doc(canonicalId);
            }
        }
        // 3. [Rule 8 & 37] Rich Media Scraping Integration with exact Column 3 fuzzy matching parity
        let scrapedImageUrl = null;
        if (!isLabel) {
            const searchArtistName = cleanTitle;
            const genre = synthesizedDetails.details?.genre || "";
            const summary = synthesizedDetails.summary || "";
            const origin = synthesizedDetails.details?.origin || (countrySlug ? countrySlug.toUpperCase() : "");
            try {
                scrapedImageUrl = await (0, curatorService_1.scrapeImageUrlBackend)(searchArtistName, 'artist', genre, summary, origin, synthesizedDetails.discography || []);
            }
            catch (scrapeErr) {
                console.warn(`[JIT Healer] Image scraper error for "${searchArtistName}":`, scrapeErr.message);
            }
            synthesizedDetails.imageUrl = scrapedImageUrl || 'not-found';
        }
        else {
            synthesizedDetails.imageUrl = null;
        }
        // 4. [Rule 40] Write Gate Guard: verify profile is fully qualified before persisting
        if (!(0, cacheQualification_1.isFullyQualifiedEntityProfile)(synthesizedDetails, isLabel)) {
            throw new https_1.HttpsError("internal", `[Rule 40 Write Gate] Synthesized profile for "${cleanTitle}" (${canonicalId}) failed isFullyQualifiedEntityProfile validation.`);
        }
        // 5. Persist single canonical document strictly adhering to Tier 1 schema parity
        const canonicalPayload = {
            cacheKey: canonicalId,
            cacheVersion: 4,
            seedArtists: cleanTitle,
            name: cleanTitle,
            detailsCache: synthesizedDetails, // Native Firestore Map with scraped imageUrl
            graphData: null,
            filters: null,
            synthesisRationale: null,
            isDeep: true,
            isPrimarySeed: false,
            hasUniqueSpiderweb: false,
            createdAt: firestore_1.FieldValue.serverTimestamp(),
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
            _healedBy: "JIT_Asset_Healer_V22"
        };
        // Apply entity-specific root IDs:
        if (isLabel) {
            canonicalPayload.labelId = canonicalId; // strictly labelId on labels
        }
        else {
            canonicalPayload.artistId = (0, executeCurationPipeline_1.stripCountrySlug)(canonicalId); // strictly artistId on artists
        }
        await docRef.set(canonicalPayload, { merge: true });
        console.log(`[JIT Healer] Successfully healed and persisted complete Tier 1 asset with schema parity: ${collectionName}/${canonicalId} (image: ${synthesizedDetails.imageUrl})`);
        // 4. Record Telemetry Receipt in Admin Ledger (Phase 3)
        const promptTokens = response.usageMetadata?.promptTokenCount || 0;
        const candidatesTokens = response.usageMetadata?.candidatesTokenCount || 0;
        const totalTokens = response.usageMetadata?.totalTokenCount || (promptTokens + candidatesTokens);
        const INPUT_RATE_PER_MILLION = 0.10;
        const OUTPUT_RATE_PER_MILLION = 0.40;
        const costUsd = Number(((promptTokens * (INPUT_RATE_PER_MILLION / 1_000_000)) +
            (candidatesTokens * (OUTPUT_RATE_PER_MILLION / 1_000_000))).toFixed(6));
        try {
            const receiptPayload = {
                timestamp: firestore_1.FieldValue.serverTimestamp(),
                entityId: canonicalId,
                rawEntityId: entityId,
                entityType,
                displayName: cleanTitle,
                callerUid: request.auth?.uid || 'anonymous',
                callerEmail: request.auth?.token?.email || 'guest@zcene.online',
                projectId: typeof projectId === 'string' && projectId.trim() ? projectId.trim() : null,
                projectName: typeof projectName === 'string' && projectName.trim() ? projectName.trim() : null,
                model: curatorService_1.GEMINI_FLASH_MODEL,
                promptTokens,
                candidatesTokens,
                totalTokens,
                costUsd,
                healedAtMs: Date.now()
            };
            await db
                .collection('adminLedger')
                .doc('system')
                .collection('jitHeals')
                .add(receiptPayload);
            console.log(`[JIT Healer Telemetry] Recorded receipt for ${canonicalId} (${totalTokens} tokens, $${costUsd})`);
        }
        catch (telemetryErr) {
            console.warn(`[JIT Healer Telemetry] Failed to record receipt for ${canonicalId}:`, telemetryErr.message);
        }
        return {
            success: true,
            canonicalId,
            alreadyExisted: false,
            data: synthesizedDetails
        };
    }
    catch (error) {
        if (error instanceof https_1.HttpsError) {
            throw error;
        }
        console.error(`[JIT Healer] Error healing entity "${canonicalId}" (${collectionName}):`, error);
        throw new https_1.HttpsError("internal", error.message || "Failed to heal orphaned asset");
    }
});
//# sourceMappingURL=healOrphanedAsset.js.map