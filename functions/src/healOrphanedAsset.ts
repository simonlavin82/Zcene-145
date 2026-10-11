import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { GoogleGenAI, Type, ThinkingLevel } from "@google/genai";
import { 
  GEMINI_FLASH_MODEL, 
  normalizeArtistId, 
  normalizeLabelId, 
  titleCaseArtistId,
  extractCleanJsonString
} from "./services/curatorService";

if (getApps().length === 0) {
  initializeApp();
}

const db = getFirestore();
try {
  db.settings({ ignoreUndefinedProperties: true });
} catch (e) {
  // Ignore if already configured
}

const HEAL_ENTITY_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    summary: {
      type: Type.STRING,
      description: "Rich, engaging 2-3 paragraph biography/history of the artist or record label written in a late-night curator voice. Minimum 50 words."
    },
    details: {
      type: Type.OBJECT,
      properties: {
        artist: {
          type: Type.STRING,
          description: "Canonical professional name of the artist or record label."
        },
        genre: {
          type: Type.STRING,
          description: "Primary musical genres associated with the artist or label."
        },
        origin: {
          type: Type.STRING,
          description: "City and/or country of origin (e.g. 'London, UK', 'New York, USA')."
        },
        founded: {
          type: Type.STRING,
          description: "Year formed or founded (YYYY) or active decade."
        },
        notableArtists: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: "Key artists associated with or signed to this label (or peer artists for an artist)."
        }
      },
      required: ["artist", "genre", "origin", "founded"]
    },
    discography: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          albumName: { type: Type.STRING },
          releaseYear: { type: Type.STRING }
        },
        required: ["albumName", "releaseYear"]
      },
      description: "Notable defining releases or key catalog albums."
    },
    links: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          url: { type: Type.STRING }
        },
        required: ["title", "url"]
      },
      description: "External reference links (e.g., official website, Wikipedia, Discogs search)."
    }
  },
  required: ["summary", "details", "discography"]
};

export const healOrphanedAsset = onCall({
  secrets: ["GEMINI_API_KEY"],
  timeoutSeconds: 60,
  memory: "512MiB",
}, async (request) => {
  const { entityId, entityType = 'artist', displayName, countrySlug } = request.data || {};
  if (!entityId || typeof entityId !== 'string') {
    throw new HttpsError("invalid-argument", "Missing or invalid entityId parameter");
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new HttpsError("failed-precondition", "GEMINI_API_KEY is not defined in environment secrets.");
  }

  // [Rule 36] Strict Taxonomy Normalization
  let canonicalId = normalizeArtistId(entityId);
  if (entityType === 'label') {
    canonicalId = normalizeLabelId(entityId); // Strips -records, -music, -group, etc.
  }

  const collectionName = entityType === 'label' ? 'labels' : 'artists';
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
        } catch (e) {
          parsed = existingData.detailsCache;
        }
        console.log(`[JIT Healer] Entity ${collectionName}/${canonicalId} already exists in Firestore. Returning cached record.`);
        return { success: true, canonicalId, alreadyExisted: true, data: parsed };
      }
    }

    console.log(`[JIT Healer] Initiating lightweight synthesis for ${entityType}: "${canonicalId}" (raw: "${entityId}") using ${GEMINI_FLASH_MODEL}...`);

    // 2. Synthesize missing entity via Gemini 3.6 Flash (ThinkingLevel.MINIMAL)
    const ai = new GoogleGenAI({ apiKey, httpOptions: { timeout: 60000 } });
    const prompt = `Synthesize archival profile data for the ${entityType} "${displayName || canonicalId}" (ID: ${canonicalId}${countrySlug ? `, origin country: ${countrySlug}` : ''}). Provide an authentic, insightful late-night curator breakdown with historical context, notable roster/releases, and scene impact.`;

    const response = await ai.models.generateContent({
      model: GEMINI_FLASH_MODEL,
      contents: prompt,
      config: {
        systemInstruction: "You are a music archivist and late-night record curator. Return detailed, factual, and scene-accurate profile information for the given musical entity matching the schema. No markdown formatting outside strings. Do NOT use em-dashes.",
        thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
        responseMimeType: "application/json",
        responseSchema: HEAL_ENTITY_SCHEMA
      }
    });

    const jsonText = response.text?.trim() || "";
    if (!jsonText) {
      throw new Error("Empty response returned from Gemini synthesis");
    }

    const cleanedJsonText = extractCleanJsonString(jsonText);
    const synthesizedDetails = JSON.parse(cleanedJsonText);

    // 3. Persist single canonical document strictly (No legacy stubs / clean slate per Rule 36)
    const canonicalPayload = {
      cacheKey: canonicalId,
      artistId: canonicalId,
      name: displayName || synthesizedDetails.details?.artist || titleCaseArtistId(canonicalId),
      detailsCache: JSON.stringify(synthesizedDetails),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      _healedBy: "JIT_Asset_Healer_V22"
    };

    await docRef.set(canonicalPayload, { merge: true });
    console.log(`[JIT Healer] Successfully healed and persisted Tier 1 asset: ${collectionName}/${canonicalId}`);

    return {
      success: true,
      canonicalId,
      alreadyExisted: false,
      data: synthesizedDetails
    };

  } catch (error: any) {
    console.error(`[JIT Healer] Error healing entity "${canonicalId}" (${collectionName}):`, error);
    throw new HttpsError("internal", error.message || "Failed to heal orphaned asset");
  }
});
