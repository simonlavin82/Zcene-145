"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.healOrphanedAsset = void 0;
const https_1 = require("firebase-functions/v2/https");
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
const genai_1 = require("@google/genai");
const curatorService_1 = require("./services/curatorService");
const executeCurationPipeline_1 = require("./executeCurationPipeline");
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
const HEAL_ENTITY_SCHEMA = {
    type: genai_1.Type.OBJECT,
    properties: {
        summary: {
            type: genai_1.Type.STRING,
            description: "Rich, engaging 2-3 paragraph biography/history of the artist or record label written in a late-night curator voice. Minimum 50 words."
        },
        details: {
            type: genai_1.Type.OBJECT,
            properties: {
                artist: {
                    type: genai_1.Type.STRING,
                    description: "Canonical professional name of the artist or record label."
                },
                genre: {
                    type: genai_1.Type.STRING,
                    description: "Primary musical genres associated with the artist or label."
                },
                origin: {
                    type: genai_1.Type.STRING,
                    description: "City and/or country of origin (e.g. 'London, UK', 'New York, USA')."
                },
                founded: {
                    type: genai_1.Type.STRING,
                    description: "Year formed or founded (YYYY) or active decade."
                },
                notableArtists: {
                    type: genai_1.Type.ARRAY,
                    items: { type: genai_1.Type.STRING },
                    description: "Key artists associated with or signed to this label (or peer artists for an artist)."
                }
            },
            required: ["artist", "genre", "origin", "founded"]
        },
        discography: {
            type: genai_1.Type.ARRAY,
            items: {
                type: genai_1.Type.OBJECT,
                properties: {
                    albumName: { type: genai_1.Type.STRING },
                    releaseYear: { type: genai_1.Type.STRING }
                },
                required: ["albumName", "releaseYear"]
            },
            description: "Notable defining releases or key catalog albums."
        },
        links: {
            type: genai_1.Type.ARRAY,
            items: {
                type: genai_1.Type.OBJECT,
                properties: {
                    title: { type: genai_1.Type.STRING },
                    url: { type: genai_1.Type.STRING }
                },
                required: ["title", "url"]
            },
            description: "External reference links (e.g., official website, Wikipedia, Discogs search)."
        }
    },
    required: ["summary", "details", "discography"]
};
exports.healOrphanedAsset = (0, https_1.onCall)({
    secrets: ["GEMINI_API_KEY"],
    timeoutSeconds: 60,
    memory: "512MiB",
}, async (request) => {
    const { entityId, entityType = 'artist', displayName, countrySlug } = request.data || {};
    if (!entityId || typeof entityId !== 'string') {
        throw new https_1.HttpsError("invalid-argument", "Missing or invalid entityId parameter");
    }
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new https_1.HttpsError("failed-precondition", "GEMINI_API_KEY is not defined in environment secrets.");
    }
    // [Rule 36] Strict Taxonomy Normalization
    let canonicalId = (0, curatorService_1.normalizeArtistId)(entityId);
    const isLabel = entityType === 'label';
    if (isLabel) {
        canonicalId = (0, curatorService_1.normalizeLabelId)(entityId); // Strips -records, -music, -group, etc.
    }
    const collectionName = isLabel ? 'labels' : 'artists';
    const docRef = db.collection(collectionName).doc(canonicalId);
    try {
        // 1. Check if canonical doc already exists in Tier 1 storage
        const existingSnap = await docRef.get();
        if (existingSnap.exists) {
            const existingData = existingSnap.data();
            if (existingData?.detailsCache) {
                let parsed;
                try {
                    parsed = typeof existingData.detailsCache === 'string'
                        ? JSON.parse(existingData.detailsCache)
                        : existingData.detailsCache;
                }
                catch (e) {
                    parsed = existingData.detailsCache;
                }
                console.log(`[JIT Healer] Entity ${collectionName}/${canonicalId} already exists in Firestore. Returning cached record.`);
                return { success: true, canonicalId, alreadyExisted: true, data: parsed };
            }
        }
        console.log(`[JIT Healer] Initiating lightweight synthesis for ${entityType}: "${canonicalId}" (raw: "${entityId}") using ${curatorService_1.GEMINI_FLASH_MODEL}...`);
        // 2. Synthesize missing entity via Gemini 3.6 Flash (ThinkingLevel.MINIMAL)
        const ai = new genai_1.GoogleGenAI({ apiKey, httpOptions: { timeout: 60000 } });
        const prompt = `Synthesize archival profile data for the ${entityType} "${displayName || canonicalId}" (ID: ${canonicalId}${countrySlug ? `, origin country: ${countrySlug}` : ''}). Provide an authentic, insightful late-night curator breakdown with historical context, notable roster/releases, and scene impact.`;
        const response = await ai.models.generateContent({
            model: curatorService_1.GEMINI_FLASH_MODEL,
            contents: prompt,
            config: {
                systemInstruction: "You are a music archivist and late-night record curator. Return detailed, factual, and scene-accurate profile information for the given musical entity matching the schema. No markdown formatting outside strings. Do NOT use em-dashes.",
                thinkingConfig: { thinkingLevel: genai_1.ThinkingLevel.MINIMAL },
                responseMimeType: "application/json",
                responseSchema: HEAL_ENTITY_SCHEMA
            }
        });
        const jsonText = response.text?.trim() || "";
        if (!jsonText) {
            throw new Error("Empty response returned from Gemini synthesis");
        }
        const cleanedJsonText = (0, curatorService_1.extractCleanJsonString)(jsonText);
        const synthesizedDetails = JSON.parse(cleanedJsonText);
        const cleanTitle = displayName || synthesizedDetails.details?.artist || (0, curatorService_1.titleCaseArtistId)(canonicalId);
        // 3. Persist single canonical document strictly adhering to Tier 1 schema parity
        const canonicalPayload = {
            cacheKey: canonicalId,
            cacheVersion: 4,
            seedArtists: cleanTitle,
            name: cleanTitle,
            detailsCache: synthesizedDetails, // Native Firestore Map, not stringified JSON
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
        console.log(`[JIT Healer] Successfully healed and persisted Tier 1 asset with schema parity: ${collectionName}/${canonicalId}`);
        return {
            success: true,
            canonicalId,
            alreadyExisted: false,
            data: synthesizedDetails
        };
    }
    catch (error) {
        console.error(`[JIT Healer] Error healing entity "${canonicalId}" (${collectionName}):`, error);
        throw new https_1.HttpsError("internal", error.message || "Failed to heal orphaned asset");
    }
});
//# sourceMappingURL=healOrphanedAsset.js.map