import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { GoogleGenAI, Type, ThinkingLevel } from "@google/genai";
import { 
  GEMINI_FLASH_MODEL, 
  normalizeArtistId, 
  normalizeLabelId, 
  titleCaseArtistId,
  extractCleanJsonString,
  scrapeImageUrlBackend
} from "./services/curatorService";
import { stripCountrySlug } from "./executeCurationPipeline";

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
      description: "A scannable bio (approx. 100-150 words) using Markdown: short paragraphs (2-3 short sentences), bolding for key terms, and bullet points where appropriate for lists/hallmarks. Written in an authentic, vivid late-night record curator voice focusing on sonic style, scene lineage, and countercultural significance."
    },
    recommendationReason: {
      type: Type.STRING,
      description: "A 1-2 sentence curator insight explaining why this artist or label matters to their genre and musical era, focusing strictly on intrinsic artistic contributions."
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
  const isLabel = entityType === 'label';
  if (isLabel) {
    canonicalId = normalizeLabelId(entityId); // Strips -records, -music, -group, etc.
  }

  const collectionName = isLabel ? 'labels' : 'artists';
  const docRef = db.collection(collectionName).doc(canonicalId);

  try {
    // 1. [Rule 8 & 37] Cache Qualification Gate: Reject and overwrite stubs or incomplete payloads
    const existingSnap = await docRef.get();
    if (existingSnap.exists) {
      const existingData = existingSnap.data();
      const isStub = existingData?._isStub === true || !!existingData?.redirectTo;
      let cachedDetails: any = null;
      if (existingData?.detailsCache) {
        try {
          cachedDetails = typeof existingData.detailsCache === 'string'
            ? JSON.parse(existingData.detailsCache)
            : existingData.detailsCache;
        } catch (e) {
          cachedDetails = existingData.detailsCache;
        }
      }

      // Rule 8 Qualification Gate: Must have bio > 50 chars, genre, and (for artists) valid non-empty imageUrl
      const hasSubstantialBio = typeof cachedDetails?.summary === 'string' && cachedDetails.summary.length > 50;
      const hasGenre = !!cachedDetails?.details?.genre;
      const hasValidMedia = isLabel || (typeof cachedDetails?.imageUrl === 'string' && cachedDetails.imageUrl.length > 0 && cachedDetails.imageUrl !== 'not-found');

      if (!isStub && hasSubstantialBio && hasGenre && hasValidMedia) {
        console.log(`[JIT Healer] Complete Tier 1 cache hit for ${collectionName}/${canonicalId}. Bypassing.`);
        return { success: true, canonicalId, alreadyExisted: true, data: cachedDetails };
      }

      console.log(`[JIT Healer] Existing doc ${collectionName}/${canonicalId} failed qualification gate (isStub: ${isStub}, hasMedia: ${hasValidMedia}). Overwriting with full synthesis...`);
    }

    console.log(`[JIT Healer] Initiating full-parity synthesis for ${entityType}: "${canonicalId}" (raw: "${entityId}") using ${GEMINI_FLASH_MODEL}...`);

    // 2. Synthesize missing entity via Gemini 3.6 Flash (ThinkingLevel.MINIMAL) with Rule 24 late-night curator persona
    const ai = new GoogleGenAI({ apiKey, httpOptions: { timeout: 60000 } });
    const prompt = `Synthesize archival profile data for the ${entityType} "${displayName || canonicalId}" (ID: ${canonicalId}${countrySlug ? `, origin country: ${countrySlug}` : ''}). Provide an authentic, insightful late-night curator breakdown with historical context, notable roster/releases, and scene impact.`;

    const response = await ai.models.generateContent({
      model: GEMINI_FLASH_MODEL,
      contents: prompt,
      config: {
        systemInstruction: "You are a late-night record curator — the kind of person who pulls an obscure 7\" from a crate at 2am and traces exactly why it matters. Your tone is knowledgeable, vivid, and deeply immersed in musical history and counterculture scenes. Return detailed, factual, and scene-accurate profile information for the given musical entity matching the schema. No markdown formatting outside strings. NEGATIVE CONSTRAINT: NEVER use em-dashes (—) or long hyphens for dramatic effect or clause separation. Use standard editorial punctuation.",
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

    const cleanTitle = displayName || synthesizedDetails.details?.artist || titleCaseArtistId(canonicalId);

    // 3. [Rule 8 & 37] Rich Media Scraping Integration
    let scrapedImageUrl: string | null = null;
    if (!isLabel) {
      const searchArtistName = cleanTitle;
      const genre = synthesizedDetails.details?.genre || "";
      const summary = synthesizedDetails.summary || "";
      const origin = synthesizedDetails.details?.origin || countrySlug || "";

      try {
        scrapedImageUrl = await scrapeImageUrlBackend(
          searchArtistName,
          'artist',
          genre,
          summary,
          origin
        );
      } catch (scrapeErr: any) {
        console.warn(`[JIT Healer] Image scraper error for "${searchArtistName}":`, scrapeErr.message);
      }
      synthesizedDetails.imageUrl = scrapedImageUrl || 'not-found';
    } else {
      synthesizedDetails.imageUrl = null;
    }

    // 4. Persist single canonical document strictly adhering to Tier 1 schema parity
    const canonicalPayload: Record<string, any> = {
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
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      _healedBy: "JIT_Asset_Healer_V22"
    };

    // Apply entity-specific root IDs:
    if (isLabel) {
      canonicalPayload.labelId = canonicalId; // strictly labelId on labels
    } else {
      canonicalPayload.artistId = stripCountrySlug(canonicalId); // strictly artistId on artists
    }

    await docRef.set(canonicalPayload, { merge: true });
    console.log(`[JIT Healer] Successfully healed and persisted complete Tier 1 asset with schema parity: ${collectionName}/${canonicalId} (image: ${synthesizedDetails.imageUrl})`);

    // 4. Record Telemetry Receipt in Admin Ledger (Phase 3)
    const promptTokens = response.usageMetadata?.promptTokenCount || 0;
    const candidatesTokens = response.usageMetadata?.candidatesTokenCount || 0;
    const totalTokens = response.usageMetadata?.totalTokenCount || (promptTokens + candidatesTokens);

    const INPUT_RATE_PER_MILLION = 0.10;
    const OUTPUT_RATE_PER_MILLION = 0.40;
    const costUsd = Number(
      (
        (promptTokens * (INPUT_RATE_PER_MILLION / 1_000_000)) + 
        (candidatesTokens * (OUTPUT_RATE_PER_MILLION / 1_000_000))
      ).toFixed(6)
    );

    try {
      const receiptPayload = {
        timestamp: FieldValue.serverTimestamp(),
        entityId: canonicalId,
        rawEntityId: entityId,
        entityType,
        displayName: cleanTitle,
        callerUid: request.auth?.uid || 'anonymous',
        callerEmail: request.auth?.token?.email || 'guest@zcene.online',
        model: GEMINI_FLASH_MODEL,
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
    } catch (telemetryErr: any) {
      console.warn(`[JIT Healer Telemetry] Failed to record receipt for ${canonicalId}:`, telemetryErr.message);
    }

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
