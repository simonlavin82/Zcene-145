import { GoogleGenAI, Type, GenerateContentResponse, ThinkingLevel } from "@google/genai";
import { GraphData, Node, NodeDetails, Link, ChatMessage, DiscoveryFilters } from "../types";
import { db } from './firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { normalizeArtistId, extractArtistSubGraph, readArtistCacheMany, normalizeGraphData, stripUndefinedProperties, cleanArtistDisplayName } from './artistCacheService';
import {
  hasActiveDiscoveryFilters,
  hasActiveTier2Filters,
  hasActiveTier3Filters,
  sanitizeAnchorLabelInput
} from './cacheQualification';

// --- EXPORTED CONSTANTS FOR SOURCE PAGE VISIBILITY ---

// --- UTILITIES ---

/**
 * Isolates and cleans JSON strings from LLM responses by:
 * 1. Extracting fenced codeblocks (```json ... ```) to strip search grounding reasoning preambles.
 * 2. Bounding root bracket depth to truncate trailing conversational postambles and citations.
 */
export const extractCleanJsonString = (rawText?: string): string => {
    if (!rawText || typeof rawText !== 'string') return "";
    let text = rawText.trim();
    if (!text) return "";

    // 1. Check for Markdown codeblock fences
    const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (match && match[1]) {
        text = match[1].trim();
    } else {
        text = text.replace(/^```(?:json)?\n?/i, '').replace(/```$/i, '').trim();
    }

    // 2. Find the first occurrence of { or [
    let startIdx = text.indexOf('{');
    const arrayStartIdx = text.search(/\[\s*(?:\{|")/); // allow array of objects or strings
    if (startIdx === -1) startIdx = arrayStartIdx;
    else if (arrayStartIdx !== -1 && arrayStartIdx < startIdx) startIdx = arrayStartIdx;
    
    if (startIdx === -1) {
        // Fallback to just [
        startIdx = text.indexOf('[');
    }
    
    if (startIdx === -1) return text;
    text = text.substring(startIdx);

    // 3. Scan forward and truncate exactly when root bracket depth reaches 0
    let stack: string[] = [];
    let inString = false;
    let escaped = false;
    let endIdx = -1;

    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (escaped) {
            escaped = false;
            continue;
        }
        if (char === '\\') {
            escaped = true;
            continue;
        }
        if (char === '"') {
            inString = !inString;
            continue;
        }
        if (!inString) {
            if (char === '{' || char === '[') {
                stack.push(char);
            } else if (char === '}' || char === ']') {
                if (stack.length > 0) {
                    const last = stack[stack.length - 1];
                    if ((char === '}' && last === '{') || (char === ']' && last === '[')) {
                        stack.pop();
                        if (stack.length === 0) {
                            endIdx = i;
                            break;
                        }
                    }
                }
            }
        }
    }

    if (endIdx !== -1) {
        text = text.substring(0, endIdx + 1);
    }

    return text.trim();
};

/**
 * Attempts to repair truncated or malformed JSON from LLM responses.
 */
const repairJson = (json: string): string => {
    if (!json) return "";
    
    let stack: string[] = [];
    let inString = false;
    let escaped = false;
    
    // Find the first occurrence of { or [
    let startIdx = json.indexOf('{');
    const arrayStartIdx = json.search(/\[\s*(?:\{|")/); // allow array of objects or strings
    if (startIdx === -1) startIdx = arrayStartIdx;
    else if (arrayStartIdx !== -1 && arrayStartIdx < startIdx) startIdx = arrayStartIdx;
    
    if (startIdx === -1) {
        startIdx = json.indexOf('[');
    }
    
    if (startIdx === -1) return json;
    let text = json.substring(startIdx);

    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (escaped) {
            escaped = false;
            continue;
        }
        if (char === '\\') {
            escaped = true;
            continue;
        }
        if (char === '"') {
            inString = !inString;
            continue;
        }
        if (!inString) {
            if (char === '{' || char === '[') {
                stack.push(char);
            } else if (char === '}' || char === ']') {
                if (stack.length > 0) {
                    const last = stack[stack.length - 1];
                    if ((char === '}' && last === '{') || (char === ']' && last === '[')) {
                        stack.pop();
                        if (stack.length === 0) {
                            text = text.substring(0, i + 1);
                            break;
                        }
                    }
                }
            }
        }
    }

    let repaired = text;
    
    // 1. Handle trailing backslash specifically first
    if (inString && escaped) {
        repaired = repaired.substring(0, repaired.length - 1);
    }

    // 2. Close unterminated string
    if (inString) {
        repaired += '"';
    }
    
    repaired = repaired.trim();

    // 3. Handle trailing colon or comma before closing tags
    // If it ends with ':', it's an unvalued key.
    if (repaired.endsWith(':')) {
        repaired += ' null';
    }
    // If it ends with ',', remove it.
    repaired = repaired.replace(/,$/, '');

    // 4. Close all open objects and arrays in reverse order
    while (stack.length > 0) {
        const last = stack.pop();
        
        // If it's an object, check if we might be mid-key
        if (last === '{') {
            // Very basic check: if the last part is a string but no colon came after
            // we might have {"key" and need to close it as {"key":null}
            // But usually the inString check above handles the quote.
            // If it ends with a quote but no colon, it's safer to add null.
            if (repaired.endsWith('"') && !repaired.match(/:\s*"$/)) {
                 // Might be a key. Let's just add null if possible.
                 // Actually this is risky, standard repair is safer.
            }
            repaired += '}';
        }
        else if (last === '[') repaired += ']';
    }

    return repaired;
};

export const GRAPH_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    nodes: {
      type: Type.ARRAY,
      description: "A list of nodes in the music graph. Each node represents an artist, genre, label, country, or founded year.",
      items: {
        type: Type.OBJECT,
        properties: {
          id: {
            type: Type.STRING,
            description: "The professional, canonical name of the artist, genre, label, country, or the 4-digit year (YYYY) for founded nodes."
          },
          type: {
            type: Type.STRING,
            description: "The type of the node, can be 'artist', 'genre', 'label', 'country', or 'founded'."
          },
          group: {
            type: Type.INTEGER,
            description: "A group identifier for coloring or categorization, usually based on the initial seed artists."
          }
        },
        required: ["id", "type", "group"]
      }
    },
    links: {
      type: Type.ARRAY,
      description: "A list of links connecting the nodes, representing relationships.",
      items: {
        type: Type.OBJECT,
        properties: {
          source: {
            type: Type.STRING,
            description: "The ID of the source node."
          },
          target: {
            type: Type.STRING,
            description: "The ID of the target node."
          },
          value: {
            type: Type.INTEGER,
            description: "The strength of the connection, typically a constant value like 1."
          },
          context: {
            type: Type.STRING,
            description: "A brief, 3-7 word explanation of the relationship in present tense, e.g., 'releases music on Flatspot Records' or 'formed in San Jose, California' or 'influenced musical style'."
          }
        },
        required: ["source", "target", "value", "context"]
      }
    },
    synthesis_rationale: {
      type: Type.STRING,
      description: "A scannable reasoning chain (approx. 100-150 words) using Markdown: short paragraphs (separated by double newlines), bolding for key terms, and bullet points for lists. Detail how the seeds' acoustic, geographic, and chronological dimensions intersect to yield the generated connections."
    }
  },
  required: ["nodes", "links"]
};

export const NODE_DETAILS_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    summary: {
      type: Type.STRING,
      description: "A scannable bio (approx. 100 words) using Markdown: short paragraphs, bolding for key terms, and bullet points for lists. Focus on style and significance."
    },
    imageUrl: {
      type: Type.STRING,
      description: "A direct HTTPS image URL representing the artist or label, extracted from the authoritative genre-appropriate biographical source context (e.g., Wikimedia Commons, Wikipedia, Bandcamp, Discogs, Spotify, or genre-specific archives). Under the Contextual Image Trust Rule, valid images from verified biographical sources are trusted by default."
    },
    members: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "List of members and their roles."
    },
    details: {
      type: Type.OBJECT,
      properties: {
        genre: { type: Type.STRING },
        origin: { type: Type.STRING },
        founded: { type: Type.STRING },
        notableArtists: {
          type: Type.ARRAY,
          items: { type: Type.STRING }
        }
      },
      required: ["genre", "origin", "founded", "notableArtists"]
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
      }
    },
    recommendationReason: {
      type: Type.STRING,
      description: "Curator insight."
    },
    youtubeVideoId: {
      type: Type.STRING,
      nullable: true,
      description: "The YouTube video ID (11-character string) for the best available official video. Priority order: (1) most iconic/popular official music video, (2) high-profile professional full live set on an official channel. MUST NOT be a lyric video, fan-cam bootleg, low-quality upload, non-musical interview clip, or YouTube Shorts (do not return vertical formats or '/shorts/' routes; prioritize landscape videos longer than 2 minutes). Ensure the video belongs strictly to verified artist channels, high-fidelity archives (e.g. Hate5six, KEXP, Audiotree), or standard label uploads. Return null if no high-quality official video can be confirmed."
    },
    youtubeSearchQuery: {
      type: Type.STRING,
      description: "A guaranteed-non-null YouTube search query string to use as a fallback when youtubeVideoId cannot be confirmed. Format: '[Artist Name] [genre] [live OR official video]'. Example: 'Turnstile hardcore punk official music video'. Always populate this field. Append semantic terms such as 'full set', 'live performance', or 'official music video' before resolving."
    }
  },
  required: ["summary", "details", "discography", "recommendationReason", "youtubeSearchQuery"]
};

export const GENERATE_GRAPH_WITH_CONTEXT_PROMPT_TEMPLATE = `I have an existing music graph. The user wants to enhance it by adding connections for these seed artists: {{artists}}.

        The graph ALREADY CONTAINS the following nodes: [{{existingNodeIds}}].
        
        Your task is to generate ONLY the NEW nodes and links needed to integrate the seed artists ({{artists}}) into the existing graph. Follow these rules:
        1.  CANONICAL NAMING: For ALL nodes (especially the seed artists provided in "{{artists}}"), you MUST use the canonical, professional spelling and capitalization as recognized by the music industry. For example, use "Radiohead" even if the user typed "radiohead", and use "blink-182" with a lowercase 'b' and hyphen if that is the correct format.
        2.  DO NOT duplicate any of the existing nodes listed above. When creating links, you MUST reference the existing node IDs if a connection is needed.
        3.  For EACH seed artist in "{{artists}}", if they do not already exist as a node, you MUST add them as an 'artist' node to the 'nodes' array. This is a mandatory requirement. After adding the artist node, attempt to find its primary genre, record label, country of origin, and the year they were formed/founded (YYYY). If you find these details, create nodes for them (if they don't already exist) and link them back to the seed artist. The 'id' for the year node must be the 4-digit year (e.g., "1998") and its type must be 'founded'. If you cannot find some or all of these details, that is acceptable, but the seed artist node itself MUST still be included in the graph.
        4.  In addition, identify and add 8-12 NEW related artists that are musically connected to the seed artists. For these NEW artists, you MUST also identify and create their respective genre, label, country, and especially their 'founded' year nodes (YYYY) to ensure the spiderweb is rich with chronological data. Assign them to the same 'group' as the seed artist they relate to, or a new group if they relate to multiple.
        5.  TEMPORAL ECOSYSTEM & SCENE AUTHENTICITY RULE (STRICT): You MUST reconstruct the true historical scene and temporal ecosystem of the seed artist(s). Node selection must be strictly restricted to the primary active era, geographic scene, and lived touring ecosystem of the seed(s). For example, if a seed artist was primarily active in a late-1990s scene, you MUST surface their exact period-accurate peers from that specific 1990s era. If the seed is a modern 2020s band, you MUST surface contemporary peers from their current 2020s ecosystem. Do NOT suggest modern algorithmic equivalents for legacy bands, and do NOT pull in historical legacy ancestors for modern bands unless they genuinely shared the same active touring scene. The graph must represent a period-accurate, contemporary snapshot of the artist's specific moment in time.
        6.  It is absolutely critical that each 'founded' node is linked ONLY to the correct artist node who was founded in that year.
        6.  LINK RELATIONSHIP CONTEXT: Each link in the 'links' array MUST include a 'context' string explaining the connection concisely (e.g. 'founded in 1994' or 'is a sub-genre of' or 'signed to XL Recordings' or 'is related to'). Keep the context to a brief 3-7 words in present tense.
        7.  SYNTHESIS RATIONALE (MANDATORY): You MUST output the step-by-step reasoning chain of your analysis in the 'synthesis_rationale' field of the JSON object. The text MUST be scannable and formatted using Markdown: use short paragraphs (separated by double newlines), bolding for key terms, and bullet points for lists. Explain in detail how the seeds' acoustic, geographic, and chronological dimensions intersect to yield the generated connections.
        8.  JSON SCHEMA: The output must be a single, valid JSON object with 'nodes', 'links' arrays and a 'synthesis_rationale' string matching the schema.
        
        STRUCTURAL ONLY: You MUST NOT generate or include any biographies, summaries, member lists, discographies, or detailed profile metadata for the artists. The response must strictly contain only structural layout nodes (id, type, group), connection links (source, target, value, context), and the synthesis_rationale string.
        
        ABSOLUTELY CRITICAL FINAL CHECK: Before you output the JSON, verify that for EVERY SINGLE OBJECT in the 'links' array, the value of its 'source' property and the value of its 'target' property perfectly match an 'id' from an object in EITHER the provided existing nodes list OR your new 'nodes' array. THERE MUST BE NO ORPHANED LINKS. If you create a link with a 'source' or 'target' ID (e.g., "Arista Records"), you MUST ALSO define a node with that exact same 'id' (e.g., { "id": "Arista Records", "type": "label", ... }). Do not invent connections to nodes you haven't defined. This is a strict, mandatory requirement.
        
        IMPORTANT: Ensure that any double quotes within string values are properly escaped (e.g., "Artist \\"Name\\""). The final output must be perfectly valid JSON. Your entire response MUST be ONLY the raw JSON object, without any surrounding text, explanations, or markdown code fences.`;

export const GENERATE_MULTI_SEED_GRAPH_PROMPT_TEMPLATE = `Given the following list of seed artists: {{artists}}.
Your task is to explore the genuine cultural, historical, and musical intersection of these seed artists from a blank slate (Tabula Rasa), performing a true co-equal "melting pot" traversal where all input seeds act as simultaneous structural foundations, avoiding any attention bias toward a single anchor artist. The output must be a single, valid JSON object with keys: 'nodes', 'links', and 'synthesis_rationale'.
'nodes' should be an array of objects, each with 'id', 'type', and 'group'. The 'type' can be 'artist', 'genre', 'label', 'country', or 'founded'.
'links' should be an array of objects, each with 'source', 'target', 'value', and 'context' string describing the nature of their relationship.

Follow these rules precisely:
1.  CANONICAL NAMING: For ALL nodes, use the canonical, professional spelling and capitalization as recognized by the music industry.
2.  MANDATORY SEED NODES (CO-EQUAL ROOTS): You MUST ensure an 'artist' node exists for EVERY seed artist listed in {{artists}}. Assign a unique 'group' number for each seed artist (e.g. 1 for seed 1, 2 for seed 2). Treat every seed as a co-equal foundational anchor. If any seed artist has active filters, do not label them as "[Indirect recommendation]" or isolate them.
3.  For each seed artist, find and add nodes for their primary genre, record label, country of origin, and the year they were formed/founded (YYYY). The 'id' for the year node must be the 4-digit year (e.g. "1994") and its type must be 'founded'. For metadata nodes (genre, label, country, founded), use canonical IDs and types.
4.  TARGET ENTITY DENSITY & DUAL-STRUCTURE TOPOLOGY (RULE 27 — CROSSOVER BRIDGE + NATIVE ECOSYSTEMS):
    In addition, find and add 10 to 16 NEW related artists total across the seeds (bringing the total artist count including seeds to 12 to 18 artists), structured into two complementary layers:
    A. THE CROSSOVER BRIDGE (5 to 6 artists + shared labels/genres): Identify authentic bands, imprints, and genres that legitimately connect multiple seeds through shared musical DNA, split releases, shared producers, record labels, or lived touring history.
    B. NATIVE ECOSYSTEMS (4 to 5 distinct scene artists per seed): Radiate deeply into each seed's authentic regional, temporal, and stylistic ecosystem. Give EACH seed its own dedicated cluster of 2nd-degree peers and formative scene contemporaries rather than stopping at superficial connections.
    
    UPPER-BOUND AMBITION & ANTI-LAZINESS DIRECTIVE: When the musical ecosystems surrounding the seeds are historically fertile, DO NOT lazily default to the bottom of the range. Actively strive toward the upper bound (13 to 16 new artists) to give users a deep, rich scene exploration.
    
    STRICT ANTI-FILLER VALVE: Conversely, NEVER pad the graph with generic or tenuously connected artists just to hit numbers. If an artist belongs to a genuinely tiny or isolated micro-scene with few authentic peers, scaling down and stopping at 9 to 10 new artists if sparse is required; never pad. Quality, historical veracity, and shared scene reality always override numerical quantity.
    
    Labels are explicitly EXCLUDED from this artist cap; generate the natural amount of authentic Label nodes required to accurately connect the generated artists together based on historical reality (typically resulting in an organic overall density of roughly 18 to 26 total Deep Cuts). ONLY include artists that strictly meet any provided discovery filters.
5.  For all artists (seed and related), create links connecting them to their respective genre, label, country, and founded year nodes. CRITICAL TOPOLOGY RULE: You MUST create direct links connecting each seed artist to their native ecosystem peers (sharing their 'group' number), and direct links connecting bridging artists to the seeds/peers they connect. Every new artist MUST be connected back to the central spiderweb, either directly to a seed artist or through a chain of artist-to-artist links. DO NOT leave any artist nodes floating or only connected to metadata nodes. Each link MUST include a 'context' string explaining the connection. Keep the contexts brief.
6.  TEMPORAL ECOSYSTEM & SCENE AUTHENTICITY RULE (STRICT): You MUST reconstruct the true historical scene and temporal ecosystem of the seed artist(s). Node selection must be strictly restricted to the primary active era, geographic scene, and lived touring ecosystem of the seed(s). For example, if a seed artist was primarily active in a late-1990s scene, you MUST surface their exact period-accurate peers from that specific 1990s era. If the seed is a modern 2020s band, you MUST surface contemporary peers from their current 2020s ecosystem. Do NOT suggest modern algorithmic equivalents for legacy bands, and do NOT pull in historical legacy ancestors for modern bands unless they genuinely shared the same active touring scene. The graph must represent a period-accurate, contemporary snapshot of the artist's specific moment in time. EXCEPTION (3-TIER ANCHOR OVERRIDE): When explicit Level 2 Era or Country Guardrails are active below, those guardrails take absolute precedence for all NEW recommended artists. In that case, you MUST map cross-era or cross-border lineage, influence, and spiritual succession connecting the sacred seed artist(s) to peers founded within the specified era/origin window, even if the seed artist belongs to a different decade or country.
7.  CRITICAL: Each 'founded' node MUST be linked ONLY to the correct artist who was founded in that year.
8.  SYNTHESIS RATIONALE (MANDATORY): You MUST output the step-by-step reasoning chain of your co-equal cross-analysis in the 'synthesis_rationale' field of the JSON object. The text MUST be scannable and formatted using Markdown: use short paragraphs (separated by double newlines), bolding for key terms, and bullet points for lists. Explain in detail how the seeds' acoustic, geographic, and chronological dimensions intersect to yield the generated connections.
9.  JSON SCHEMA: The output must be a single, valid JSON object with 'nodes', 'links' arrays and a 'synthesis_rationale' string matching the schema.

STRUCTURAL ONLY: You MUST NOT generate or include any biographies, summaries, member lists, discographies, or detailed profile metadata for the artists. The response must strictly contain only structural layout nodes (id, type, group), connection links (source, target, value, context), and the synthesis_rationale string.

ABSOLUTELY CRITICAL: 
- Ensure NO ORPHANED LINKS. Every source/target in the 'links' array must map to a node in the 'nodes' array.
- ANTI-HALLUCINATION RULE: EVERY single artist or band you mention in the 'synthesis_rationale' MUST exist as a fully defined node in the 'nodes' array and be properly connected in the 'links' array. Do not write about an artist in the rationale without actually including them in the graph topology!

Your entire response MUST be ONLY the raw JSON object, without any surrounding text or markdown code fences.`;

export const GENERATE_GRAPH_PROMPT_TEMPLATE = `Given the following list of seed artists: {{artists}}. Generate a music family tree connecting them. The output must be a single, valid JSON object with keys: 'nodes', 'links', and 'synthesis_rationale'.
'nodes' should be an array of objects, each with 'id', 'type', and 'group'. The 'type' can be 'artist', 'genre', 'label', 'country', or 'founded'.
'links' should be an array of objects, each with 'source', 'target', 'value', and 'context' string describing the nature of their relationship.

Follow these rules precisely:
1.  CANONICAL NAMING: For ALL nodes, use the canonical, professional spelling and capitalization as recognized by the music industry. For example, use "Radiohead" even if the seed provided was "radiohead", and "blink-182" with a lowercase 'b' and hyphen if that is its official name.
2.  MANDATORY: You MUST create an 'artist' node for EVERY seed artist provided in the list: {{artists}}. Assign a unique 'group' number for each seed artist.
3.  For each seed artist, find and add nodes for their primary genre, record label, country of origin, and the year they were formed/founded (YYYY). The 'id' for the year node must be the 4-digit year (e.g. "1994") and its type must be 'founded'.
4.  TARGET ENTITY DENSITY (RULE 27 — 10 TO 16 NEW ARTISTS):
    In addition, find and add 10 to 16 NEW related artists that are musically connected to the seed artists. For these NEW artists, you MUST also identify and create their respective genre, label, country, and especially their 'founded' year nodes (YYYY) to ensure the spiderweb is rich with chronological data.
    
    UPPER-BOUND AMBITION & ANTI-LAZINESS DIRECTIVE: In rich, fertile musical movements, DO NOT satisfice at the lower floor. Strive for the upper range (13 to 16 new artists) by surfacing authentic 2nd-degree scene peers and era contemporaries.
    
    STRICT ANTI-FILLER VALVE: If the seed belongs to an isolated micro-niche, scale down, stopping at 9 to 10 new artists if sparse; never pad with irrelevant or generic artists just to hit a number. Quality, historical veracity, and shared scene reality always override numerical quantity.
    
    Labels are explicitly EXCLUDED from this cap; generate the natural amount of Label nodes required to accurately connect the generated artists together based on historical reality (resulting in an organic target density of roughly 18 to 26 total Deep Cuts). ONLY include artists that strictly meet any provided discovery filters.
5.  CANONICAL SIGNATURES (STRICT): For ALL artist nodes generated (both seeds and related artists), their 'id' MUST explicitly append their 3-letter country of origin code to prevent naming collisions (e.g., 'artistname-usa', 'nirvana-gbr', 'turnstile-usa'). 
    CRITICAL: DO NOT append the country code to the 'label' field. The 'label' MUST remain their exact, original display name without suffixes (e.g. label must be "Turnstile", NOT "Turnstile Usa").
6.  TEMPORAL ECOSYSTEM & SCENE AUTHENTICITY RULE (STRICT): You MUST reconstruct the true historical scene and temporal ecosystem of the seed artist(s). Node selection must be strictly restricted to the primary active era, geographic scene, and lived touring ecosystem of the seed(s). For example, if a seed artist was primarily active in a late-1990s scene, you MUST surface their exact period-accurate peers from that specific 1990s era. If the seed is a modern 2020s band, you MUST surface contemporary peers from their current 2020s ecosystem. Do NOT suggest modern algorithmic equivalents for legacy bands, and do NOT pull in historical legacy ancestors for modern bands unless they genuinely shared the same active touring scene. The graph must represent a period-accurate, contemporary snapshot of the artist's specific moment in time.
7.  LINK RELATIONSHIP CONTEXT: Each link in the 'links' array MUST also include a 'context' string explaining the connection (e.g. 'releases music on Epitaph Records' or 'formed in 1988'). Keep the context to a brief 3-7 words in present tense.
8.  SYNTHESIS RATIONALE (MANDATORY): You MUST output the step-by-step reasoning chain of your analysis in the 'synthesis_rationale' field of the JSON object. The text MUST be scannable and formatted using Markdown: use short paragraphs (separated by double newlines), bolding for key terms, and bullet points for lists. Explain in detail how the seeds' acoustic, geographic, and chronological dimensions intersect to yield the generated connections.
9.  JSON SCHEMA: The output must be a single, valid JSON object with 'nodes', 'links' arrays and a 'synthesis_rationale' string matching the schema.

STRUCTURAL ONLY: You MUST NOT generate or include any biographies, summaries, member lists, discographies, or detailed profile metadata for the artists. The response must strictly contain only structural layout nodes (id, type, group), connection links (source, target, value, context), and the synthesis_rationale string.

ABSOLUTELY CRITICAL FINAL CHECK: Before you output the JSON, verify that for EVERY SINGLE OBJECT in the 'links' array, the value of its 'source' property and the value of its 'target' property perfectly match an 'id' from an object in the 'nodes' array. THERE MUST BE NO ORPHANED LINKS.
- ANTI-HALLUCINATION RULE: EVERY single artist or band you mention in the 'synthesis_rationale' MUST exist as a fully defined node in the 'nodes' array and be properly connected in the 'links' array. Do not write about an artist in the rationale without actually including them in the graph topology!

IMPORTANT: Ensure that any double quotes within string values are properly escaped (e.g., "Artist \\"Name\\""). The final output must be perfectly valid JSON. Your entire response MUST be ONLY the raw JSON object, without any surrounding text, explanations, or markdown code fences.`;

export const EXTEND_GRAPH_PROMPT_TEMPLATE = `I have a music graph. I want to expand the connection from a specific artist: "{{artistName}}".
        
        The graph ALREADY CONTAINS the following nodes: [{{existingNodeIds}}].
        
        Your task is to identify ONE new related artist that is musically connected to "{{artistName}}". 
        Follow these rules:
        1.  CANONICAL NAMING: Use the canonical, professional spelling for the new artist.
        2.  DO NOT duplicate any existing nodes.
        3.  Create an 'artist' node for the new artist.
        4.  Identify and create nodes for their primary genre, record label, country, and founded year (YYYY).
        5.  TEMPORAL ECOSYSTEM & SCENE AUTHENTICITY RULE (STRICT): You MUST reconstruct the true historical scene and temporal ecosystem of the seed artist(s). Node selection must be strictly restricted to the primary active era, geographic scene, and lived touring ecosystem of the seed(s). For example, if a seed artist was primarily active in a late-1990s scene, you MUST surface their exact period-accurate peers from that specific 1990s era. If the seed is a modern 2020s band, you MUST surface contemporary peers from their current 2020s ecosystem. Do NOT suggest modern algorithmic equivalents for legacy bands, and do NOT pull in historical legacy ancestors for modern bands unless they genuinely shared the same active touring scene. The graph must represent a period-accurate, contemporary snapshot of the artist's specific moment in time.
        6.  Link the new artist to these new nodes AND to the original artist "{{artistName}}", adding a 'context' string to each link explaining the relationship (e.g., 'formed in 1992', 'releases music on Sub Pop', 'is related to'). Keep the context to a brief 3-7 words in present tense.
        7.  The 'group' ID should be {{groupId}}.
        7.  SYNTHESIS RATIONALE (MANDATORY): You MUST output the step-by-step reasoning chain of your analysis in the 'synthesis_rationale' field of the JSON object. The text MUST be scannable and formatted using Markdown: use short paragraphs (separated by double newlines), bolding for key terms, and bullet points for lists. Explain in detail how this extended artist was chosen and how they relate musically to the anchor.
        8.  JSON SCHEMA: The output must be a single, valid JSON object with 'nodes', 'links' arrays and a 'synthesis_rationale' string matching the schema.
        
        ABSOLUTELY CRITICAL: Ensure NO ORPHANED LINKS. Every source/target in 'links' must exist in 'nodes' or the existing list.
        
        Your response must be ONLY the raw JSON object.`;

export const FETCH_NODE_DETAILS_PROMPT_TEMPLATE = `Please provide detailed information for the music entity: "{{nodeIdentifier}}" (type: {{nodeType}}).
    
    Context:
    - Seed Artist(s) / Ecosystem Anchor: {{seedArtists}}.
    - Search Disambiguation & Temporal Era Anchors: {{contextNodes}}.
    - Date: {{currentDate}}.
    {{#if originHint}}
    - Origin Hint: {{originHint}}.
    {{/if}}
    
    CRITICAL UNIVERSALITY & TEMPORAL RULE:
    The summary (bio) MUST be globally universal and entity-focused. DO NOT mention or reference the "Temporal Era Anchors" or any of the disambiguation peers in the generated text. They are provided strictly to lock your Google Search grounding to the entity's exact historical era and lived scene. Do NOT inject historical predecessors into the narrative of a modern band just because they share a hometown or genre.

    
    USE GOOGLE SEARCH to find:
    1. The most accurate bio and cultural significance. You MUST dynamically adapt your search strategy to target authoritative sources and knowledge bases specific to the artist's musical genre (e.g., Resident Advisor/Beatport for electronic, DownBeat/Blue Note archives for jazz, Gramophone/publisher databases for classical, or Bandcamp/Discogs/AllMusic for independent rock/punk). Avoid single-genre biases or rigid source hierarchies. Use scannability techniques:
       - Chunking: Break information into smaller, digestible units.
       - Text Segmentation: Use short paragraphs and meaningful phrases.
       - Formatting: Use bolding for key terms and bullet points where appropriate to create white space.
       - Semantic Splitting: Group related content together by meaning.
    2. A high-quality, direct HTTPS image URL representing the artist or label. Under the Contextual Image Trust Rule, if you verify and extract biographical copy from a credible source within that genre's ecosystem, the accompanying contextual image asset is trusted by default (e.g., from Wikimedia Commons, Wikipedia, Bandcamp, Discogs, Spotify, Last.fm, or genre-specific archives). Return the full, direct HTTPS image URL without truncation.
    
    GENRE-CONTEXTUAL IMAGE SOURCING HIERARCHY (STRICTLY ENFORCED):
    First, infer the artist's genre context from the entity name, seed artists, connected nodes, and your own knowledge. Then apply the appropriate sourcing priority:

    ▸ FOR CONTEMPORARY / INDIE / ELECTRONIC / PUNK / METAL / HIP-HOP / R&B:
      Priority 1 — Official Bandcamp artist page: band photo, header banner, or release artwork.
      Priority 2 — Discogs artist page: press photo or release cover.
      Priority 3 — AllMusic or Pitchfork artist entry: artist portrait or release art.
      Priority 4 — Wikimedia Commons: if a verified artist photo exists there.
      Priority 5 — Official label page or release page directly associated with the band.

    ▸ FOR CLASSICAL / ORCHESTRAL / OPERA / EARLY MUSIC / TRADITIONAL / WORLD MUSIC:
      Priority 1 — Wikimedia Commons: composer portrait, ensemble photo, or archival image.
      Priority 2 — Record label catalog page (Naxos, Hyperion, Deutsche Grammophon, ECM, Harmonia Mundi, BIS, Chandos): artist photo or release cover.
      Priority 3 — Gramophone magazine or Britannica artist entry: editorial portrait.
      Priority 4 — Institutional archive: musicological database, national library digital collection, or publisher catalog image.
      Priority 5 — MusicBrainz or AllMusic artist entry.

    ▸ FOR JAZZ / BLUES:
      Priority 1 — Wikimedia Commons or Blue Note/Verve/ECM label CDN.
      Priority 2 — AllMusic or DownBeat artist entry.
      Priority 3 — Bandcamp artist page if the artist has an independent presence.

    ACCEPTED IMAGE TYPES (all genre contexts): press photos, live performance photos, official band/artist portraits, album artwork, release covers, band logos, and official band banners or headers.

    FORBIDDEN IMAGE SOURCES (all genre contexts): Generic stock photo sites (Unsplash, Pexels, Shutterstock, Getty Images), news article thumbnails or decorative page headers, social media preview cards, YouTube thumbnails, unrelated landscape or nature photography, retail product listing images from general music stores where the image is incidental to a shop listing (prefer official artist/label sources over third-party retailers), or any image whose primary subject has no connection to the artist or their music.

    If you cannot find ANY verified image from the priority sources above, you MUST omit imageUrl entirely (return null). An absent image is always preferable to an irrelevant or misleading one.
     3. Confirmed top 3 studio albums.
    4. A verified, active YouTube video for the artist. You MUST run a dedicated search query like "[Artist Name] official music video site:youtube.com" or "[Artist Name] live performance site:youtube.com" to find a real, active video URL. Extract the 11-character video ID (e.g. from watch?v=XXXXXXXXXXX) only from verified Search results. If you cannot find a verified active video ID, or if the search results do not show the full URL, you MUST return null. Never guess or hallucinate a video ID.
    
    CRITICAL OUTPUT REQUIREMENTS (STRICTLY ENFORCED):
    1. You MUST respond with a single, valid JSON object matching the schema below. Do NOT write any conversational text or prose outside the JSON.
    2. Do NOT include markdown code fences (do NOT wrap the response in \`\`\`json ... \`\`\`). Output raw JSON directly.
    3. Do NOT include any inline search citations, footnote markers (such as [1], [4, 9, 11], [cite: 20]), or source references anywhere in the text or JSON fields. Ensure all string values are plain text or markdown bold/bullets only, with absolutely no citation brackets or array-style citations.
    
    Your task is to generate a JSON object matching this structure precisely:
    {
      "summary": "A scannable bio using Markdown. MUST follow strict Bio Scannability rules: 1. Chunking/Text Segmentation (Max 2-3 short sentences per paragraph). 2. Semantic Splitting (Group by meaning). 3. Formatting (MUST use a bulleted list for stylistic traits/key elements, and bold key terms).",
      "imageUrl": "https://upload.wikimedia.org/... OR https://f4.bcbits.com/...",
      "members": ["Name (Role)", ...],
      "details": {
        "genre": "The primary music genre(s) as a plain string (e.g. 'Hardcore Punk', 'Post-Hardcore', 'Metalcore'). NEVER return the literal string 'Unknown', 'N/A', or leave this empty — if grounding is inconclusive, infer the genre from the bio summary text and the connected scene context provided.",
        "origin": "City, Country format (e.g. 'Baltimore, USA'). NEVER return the literal string 'Unknown', 'N/A', or leave this empty — if grounding is inconclusive, infer the origin from the bio summary text or the band's known regional scene.",
        "founded": "YYYY",
        "notableArtists": ["Artist Name", ...]
      },

      "discography": [{"albumName": "Name", "releaseYear": "YYYY"}],
      "recommendationReason": "Curator insight about their role in this scene.",
      "youtubeVideoId": "dQw4w9WgXcQ",
      "youtubeSearchQuery": "Turnstile hardcore punk official music video"
    }

    YOUTUBE VIDEO SELECTION RULES (CRITICAL):
    - Use Google Search to find the best official YouTube video for this artist.
    - Priority: (1) Most iconic/popular official music video from their official YouTube channel, (2) high-profile full professional live set on an official or reputable label channel.
    - ABSOLUTELY FORBIDDEN: lyric videos, fan-cam bootlegs, low-resolution uploads, non-musical interview clips, or unofficial re-uploads.
    - The youtubeVideoId value must be ONLY the 11-character YouTube video ID (e.g. "dQw4w9WgXcQ"), NOT a full URL.
    - Set youtubeVideoId to null if no high-quality, officially-sourced video can be confirmed via search.
    - youtubeSearchQuery MUST always be populated as a non-null fallback. Format: "[Artist Name] [genre] [live OR official video]". This is MANDATORY.
    - QUERY MODIFICATION: Append semantic terms such as "full set", "live performance", or "official music video" to your search queries before resolving an asset hash.
    - NEGATIVE SHORTS CONSTRAINT: DO NOT parse or return video hashes derived from search queries matching vertical formats or the '/shorts/' route structure. Prioritize landscape video IDs with durations longer than 2 minutes.
    - ENTITY VALIDATION: Ensure the chosen video belongs strictly to verified artist channels, high-fidelity archive channels (e.g., Hate5six, KEXP, Audiotree), or standard label uploads (e.g., Relapse Records, Epitaph Records).
    - ZERO HALLUCINATION (MANDATORY): You must only return a youtubeVideoId if you can extract the exact 11-character ID from a YouTube watch URL (e.g., youtube.com/watch?v=...) present in your Google Search results. If you do not see the exact URL or video ID in the search results, set youtubeVideoId to null. NEVER guess or hallucinate a video ID under any circumstances.
    - AMBIGUITY RESOLUTION (CRITICAL): For entities with common or ambiguous names (such as "Missing Link"), you MUST combine the entity name with its Connected Network (e.g., its genre, label, or the Seed Artist) in your search query to prevent entity collisions. For example, search "Missing Link hardcore punk band" or "Missing Link Triple B Records" instead of just "Missing Link band".


    CURATOR TONE & VARIETY (CRITICAL):
    - BREVITY: Max 25 words. Use exactly ONE snappy, high-impact sentence.
    - NO LINGUISTIC RUTS: Avoid getting stuck on single recurring metaphors like "bridge," "waypoint," "nexus," or "link." 
    - UNIQUE HOOKS: Each insight must feel like a bespoke entry. Do not use a fixed list of "cool" words.
    - GENRE-SPECIFIC DICTION: Use the artist's own sub-culture vocabulary (e.g., "grit," "hi-fi," "analog-warmth").
    - DYNAMIC SENTENCE STRUCTURE: Avoid repetitive structural patterns like "Between X and Y..." or "Representing the...".
    - PERSONA: Sophisticated music historian (Pitchfork/Resident Advisor style). Focus on cultural positioning.

    The entire response must be ONLY the raw JSON object.`;

// --- SERVICE FUNCTIONS ---

// --- LOCAL SANDBOX MOCKS ---
const isLocal = (import.meta.env.VITE_USE_MOCKS === 'true') || (import.meta.env.VITE_USE_MOCKS !== 'false' && (import.meta.env.DEV || (typeof window !== 'undefined' && (
  window.location.hostname === 'localhost' || 
  window.location.hostname === '127.0.0.1' || 
  window.location.port === '3000' ||
  window.location.hostname.startsWith('192.168.') ||
  window.location.hostname.startsWith('10.') ||
  window.location.hostname.startsWith('172.')
)))); // Evaluate dynamically to short-circuit on local runs but run live on production

const generateMockGraphData = (artists: string, baseGraph?: GraphData, filters?: DiscoveryFilters): GraphData => {
  const artistList = artists.split('::').map(a => a.trim()).filter(Boolean);
  const nodes: Node[] = baseGraph ? [...baseGraph.nodes] : [];
  const links: Link[] = baseGraph ? [...baseGraph.links] : [];
  const nodeIds = new Set(nodes.map(n => n.id.toLowerCase()));

  const addNode = (n: Node) => {
    const key = n.id.toLowerCase();
    if (!nodeIds.has(key)) {
      nodes.push(n);
      nodeIds.add(key);
    }
  };

  const addLink = (source: string, target: string, value: number = 1, context?: string) => {
    const s = source.toLowerCase();
    const t = target.toLowerCase();
    if (s === t) return;
    const exists = links.some(l => {
      const ls = (typeof l.source === 'string' ? l.source : l.source.id).toLowerCase();
      const lt = (typeof l.target === 'string' ? l.target : l.target.id).toLowerCase();
      return (ls === s && lt === t) || (ls === t && lt === s);
    });
    if (!exists) {
      links.push({ source, target, value, context: context || "is musically related to" });
    }
  };

  const presets: Record<string, { genres: string[], labels: string[], country: string, founded: string, related: string[] }> = {
    'radiohead': {
      genres: ['Art Rock', 'Alternative Rock', 'Electronic'],
      labels: ['XL Recordings', 'Parlophone'],
      country: 'United Kingdom',
      founded: '1985',
      related: ['The Smile', 'Thom Yorke', 'Ultraísta', 'Portishead', 'Sigur Rós', 'Massive Attack']
    },
    'blink-182': {
      genres: ['Pop Punk', 'Alternative Rock'],
      labels: ['MCA Records', 'Geffen Records'],
      country: 'United States',
      founded: '1992',
      related: ['Box Car Racer', '+44', 'Green Day', 'Alkaline Trio', 'Sum 41', 'Simple Plan']
    },
    'orange 9mm': {
      genres: ['Post-Hardcore', 'Rap Metal'],
      labels: ['East West Records', 'Revelation Records'],
      country: 'United States',
      founded: '1995',
      related: ['Burn', 'Quicksand', 'Helmet', 'Snapcase', 'Handsome', 'Shift']
    },
    'madball': {
      genres: ['New York Hardcore', 'Hardcore Punk'],
      labels: ['Roadrunner Records', 'Epitaph Records'],
      country: 'United States',
      founded: '1988',
      related: ['Agnostic Front', 'Sick of It All', 'H2O', 'Cro-Mags', 'Terror', 'Warzone']
    },
    'h2o': {
      genres: ['Melodic Hardcore', 'Punk Rock'],
      labels: ['Bridge Nine Records', 'Epitaph Records'],
      country: 'United States',
      founded: '1994',
      related: ['Madball', 'Sick of It All', 'Bane', 'Saves the Day', 'Gorilla Biscuits', 'Shelter']
    },
    'marvin gaye': {
      genres: ['Soul', 'R&B', 'Funk'],
      labels: ['Tamla', 'Motown'],
      country: 'United States',
      founded: '1959',
      related: ['Tammi Terrell', 'Al Green', 'Stevie Wonder', 'Smokey Robinson']
    }
  };

  const countries = ['United States', 'United Kingdom', 'Canada', 'Australia', 'Sweden', 'Germany'];
  const genericGenres = ['Post-Punk', 'Shoegaze', 'Dream Pop', 'Garage Rock', 'Synthpop', 'Indie Rock'];
  const genericLabels = ['Sub Pop', 'Matador Records', 'Merge Records', 'Warp Records', 'Domino'];

  artistList.forEach((artistName, index) => {
    let resolvedName = artistName;
    if (artistName.toLowerCase() === 'gaye') {
      resolvedName = 'Marvin Gaye';
    }
    const norm = resolvedName.toLowerCase();
    const group = index + 1;
    const preset = presets[norm] || {
      genres: [genericGenres[Math.floor(Math.random() * genericGenres.length)]],
      labels: [genericLabels[Math.floor(Math.random() * genericLabels.length)]],
      country: countries[Math.floor(Math.random() * countries.length)],
      founded: (1990 + Math.floor(Math.random() * 28)).toString(),
      related: [
        `${resolvedName} Wave`,
        `${resolvedName} Project`,
        `The ${resolvedName}s`,
        `Club ${resolvedName.split(' ')[0] || 'Music'}`,
        `Echo ${resolvedName.split(' ')[0] || 'Sound'}`
      ]
    };

    let foundedYear = preset.founded;
    if (filters?.foundedAfter) {
      const limit = Number(filters.foundedAfter);
      if (Number(foundedYear) < limit) {
        foundedYear = (limit + Math.floor(Math.random() * 10)).toString();
      }
    }
    if (filters?.foundedBefore) {
      const limit = Number(filters.foundedBefore);
      if (Number(foundedYear) > limit) {
        foundedYear = (limit - Math.floor(Math.random() * 10)).toString();
      }
    }

    let country = preset.country;
    if (filters?.includeOrigins && filters.includeOrigins.length > 0) {
      country = filters.includeOrigins[0];
    }

    addNode({ id: resolvedName, type: 'artist', group, label: resolvedName });

    const genresToUse = [...preset.genres];
    if (filters?.includeGenres && filters.includeGenres.length > 0) {
      genresToUse[0] = filters.includeGenres[0];
    }

    const labelsToUse = [...preset.labels];
    if (filters?.anchorLabels && filters.anchorLabels.length > 0) {
      labelsToUse[0] = filters.anchorLabels[0];
    }

    genresToUse.forEach(g => {
      addNode({ id: g, type: 'genre', group: 1000, label: g });
      addLink(resolvedName, g, 1, "performs style");
    });

    labelsToUse.forEach(l => {
      addNode({ id: l, type: 'label', group: 2000, label: l });
      addLink(resolvedName, l, 1, "releases music via");
    });

    addNode({ id: country, type: 'country', group: 3000, label: country });
    addLink(resolvedName, country, 1, "hails from");

    addNode({ id: foundedYear, type: 'founded', group: 4000, label: foundedYear });
    addLink(resolvedName, foundedYear, 1, "was founded in");

    preset.related.forEach(relName => {
      let relFounded = (Number(foundedYear) + Math.floor(Math.random() * 8) - 4).toString();
      if (filters?.foundedAfter && Number(relFounded) < Number(filters.foundedAfter)) {
        relFounded = (Number(filters.foundedAfter) + Math.floor(Math.random() * 5)).toString();
      }
      if (filters?.foundedBefore && Number(relFounded) > Number(filters.foundedBefore)) {
        relFounded = (Number(filters.foundedBefore) - Math.floor(Math.random() * 5)).toString();
      }

      addNode({ id: relName, type: 'artist', group, label: relName });
      addLink(resolvedName, relName, 1, "is related to");

      const relGenre = genresToUse[0];
      addLink(relName, relGenre, 1, "performs style");

      const relLabel = labelsToUse[0];
      addLink(relName, relLabel, 1, "releases music via");

      addLink(relName, country, 1, "hails from");

      addNode({ id: relFounded, type: 'founded', group: 4000, label: relFounded });
      addLink(relName, relFounded, 1, "was founded in");
    });
  });

  if (artistList.length > 1) {
    for (let i = 0; i < artistList.length - 1; i++) {
      const parentName = artistList[i].toLowerCase() === 'gaye' ? 'Marvin Gaye' : artistList[i];
      const childName = artistList[i+1].toLowerCase() === 'gaye' ? 'Marvin Gaye' : artistList[i+1];
      addLink(parentName, childName, 2, "is connected to");
    }
  }

  const baseResult = normalizeGraphData({ nodes, links });
  let rationale = "";
  
  if (artistList.length > 1) {
    const seedA = artistList[0];
    const seedB = artistList[1];
    rationale = `[Co-Equal Multi-Seed Synthesis Analysis]
- Acoustic & Sonics: Cross-analyzing the guitar production and songwriting styles of "${seedA}" and "${seedB}". Found shared lineage in mid-tempo groove structures, dual-guitar lead harmonies, and vintage tube-amplifier distortion profiles.
- Geographic Overlap: Mapping the Swedish rock scene axis. Identified Göteborg (Gothenburg) and Stockholm tours as shared live circuit hubs where related support bands performed.
- Chronological Intersection: Pinpointed the 2010s retro-rock and vintage revival era. Found that both projects active years overlap during this revival period, showing common aesthetic choices and retro label interest.
- Connective Route: Formulating co-equal links between "${seedA}" and "${seedB}" via shared metadata nodes like "Sweden" (origin), "Hard Rock" / "Retro Rock" (genre), and adding bridging artists like Heavy Feather and Children of the Sun to stitch the graphs without anchor artist bias.`;
  } else {
    rationale = `[Single-Seed Analysis] Analyzed single seed "${artistList[0]}". Resolved its core metadata: genre, label, country, and founding year. Added related acts based on direct influences and scene context.`;
  }

  return {
    ...baseResult,
    synthesisRationale: rationale
  };
};

const generateMockNodeDetails = (node: Node): NodeDetails => {
  const norm = node.id.toLowerCase();
  
  const summaries: Record<string, string> = {
    'radiohead': '**Radiohead** are an English art rock band formed in Abingdon, Oxfordshire, in 1985. They have sold more than 30 million albums worldwide and are widely considered one of the most creative and influential bands of the alternative rock era.',
    'blink-182': '**blink-182** is an American pop punk band formed in Poway, California, in 1992. They are considered a key group in the development and mainstream popularity of pop punk, selling over 50 million records worldwide.',
    'orange 9mm': '**Orange 9mm** was an American post-hardcore band formed in New York City in 1995. They blended metal, hardcore, and rap influences into a highly aggressive, groove-heavy sound that defined the mid-90s underground scene.',
    'madball': '**Madball** is an American hardcore punk band formed in New York City in 1988. Led by Freddy Cricien, they are one of the cornerstone bands of the New York Hardcore (NYHC) scene, famous for their street-level intensity.',
    'h2o': '**H2O** is an American melodic hardcore band formed in New York City in 1994. They combined the speed and PMA (Positive Mental Attitude) of DC hardcore with catchy, melodic punk choruses, gaining a dedicated international following.',
    'marvin gaye': '**Marvin Gaye** was an American singer, songwriter, and record producer. He helped to shape the sound of Motown in the 1960s, first as an in-house session player and later as a solo artist with a string of hits, earning him the nicknames "Prince of Motown" and "Prince of Soul".',
    'gaye': '**Marvin Gaye** was an American singer, songwriter, and record producer. He helped to shape the sound of Motown in the 1960s, first as an in-house session player and later as a solo artist with a string of hits, earning him the nicknames "Prince of Motown" and "Prince of Soul".'
  };

  const members: Record<string, string[]> = {
    'radiohead': ['Thom Yorke (Vocals)', 'Jonny Greenwood (Guitar)', 'Colin Greenwood (Bass)', 'Ed O\'Brien (Guitar)', 'Philip Selway (Drums)'],
    'blink-182': ['Mark Hoppus (Bass/Vocals)', 'Travis Barker (Drums)', 'Tom DeLonge (Guitar/Vocals)'],
    'orange 9mm': ['Chaka Malik (Vocals)', 'Chris Traynor (Guitar)', 'Davide Gentile (Bass)', 'Matthew Cross (Drums)'],
    'madball': ['Freddy Cricien (Vocals)', 'Mitt Ginetto (Guitar)', 'Hoya Roc (Bass)', 'Mike Justian (Drums)'],
    'h2o': ['Toby Morse (Vocals)', 'Rusty Pistachio (Guitar)', 'Todd Friend (Drums)', 'Adam Blake (Bass)', 'Colin McGinniss (Guitar)'],
    'marvin gaye': ['Marvin Gaye (Vocals/Keyboards/Drums)'],
    'gaye': ['Marvin Gaye (Vocals/Keyboards/Drums)']
  };

  const albums: Record<string, { albumName: string, releaseYear: string }[]> = {
    'radiohead': [
      { albumName: 'OK Computer', releaseYear: '1997' },
      { albumName: 'Kid A', releaseYear: '2000' },
      { albumName: 'In Rainbows', releaseYear: '2007' }
    ],
    'blink-182': [
      { albumName: 'Enema of the State', releaseYear: '1999' },
      { albumName: 'Take Off Your Pants and Jacket', releaseYear: '2001' },
      { albumName: 'Blink-182', releaseYear: '2003' }
    ],
    'orange 9mm': [
      { albumName: 'Driver Not Included', releaseYear: '1995' },
      { albumName: 'Tragic', releaseYear: '1996' },
      { albumName: 'Pretend I\'m Human', releaseYear: '1999' }
    ],
    'madball': [
      { albumName: 'Set It Off', releaseYear: '1994' },
      { albumName: 'Demonstrating My Style', releaseYear: '1996' },
      { albumName: 'Look My Way', releaseYear: '1998' }
    ],
    'h2o': [
      { albumName: 'H2O', releaseYear: '1996' },
      { albumName: 'Thicker Than Water', releaseYear: '1997' },
      { albumName: 'Nothing to Prove', releaseYear: '2008' }
    ],
    'marvin gaye': [
      { albumName: 'Whats Going On', releaseYear: '1971' },
      { albumName: 'Lets Get It On', releaseYear: '1973' },
      { albumName: 'I Want You', releaseYear: '1976' }
    ],
    'gaye': [
      { albumName: 'Whats Going On', releaseYear: '1971' },
      { albumName: 'Lets Get It On', releaseYear: '1973' },
      { albumName: 'I Want You', releaseYear: '1976' }
    ]
  };

  const displayTitle = node.label || node.id;
  const capitalizedName = displayTitle.charAt(0).toUpperCase() + displayTitle.slice(1);
  const defaultSummary = `**${capitalizedName}** is a highly influential band known for their explosive live shows and distinct musical style. They have built a dedicated fan base and continue to inspire modern underground acts.`;
  const defaultMembers = ['Lead Artist / Musician', 'Collaborating Players'];
  const defaultAlbums = [
    { albumName: 'Self-Titled Debut', releaseYear: '2016' },
    { albumName: 'Breakthrough Album', releaseYear: '2019' },
    { albumName: 'Latest Release', releaseYear: '2023' }
  ];

  const isGaye = norm === 'gaye' || norm === 'marvin gaye';

  return {
    summary: summaries[norm] || defaultSummary,
    imageUrl: 'https://en.wikipedia.org/wiki/Special:FilePath/Record_icon.svg',
    members: members[norm] || defaultMembers,
    details: {
      genre: isGaye ? 'Soul / R&B' : 'Hardcore Punk',
      origin: isGaye ? 'Washington, D.C., USA' : 'California, USA',
      founded: isGaye ? '1959' : '2015',
      artist: isGaye ? 'Marvin Gaye' : capitalizedName
    },
    links: [
      { site: 'Wikipedia', url: `https://en.wikipedia.org/wiki/${encodeURIComponent(isGaye ? 'Marvin_Gaye' : node.id)}` }
    ],
    discography: albums[norm] || defaultAlbums,
    recommendationReason: `Essential artist that defines the roots and branchings of the ${isGaye ? 'Marvin Gaye' : capitalizedName} scene.`
  };
};

// --- DISAMBIGUATION PROBE ---

/**
 * [Disambiguation Gate — STAGE 0b]
 * Lightweight Gemini Flash probe that enumerates all distinct musical acts sharing
 * a given name across regions and eras. Used ONLY when the user explicitly requests
 * a live search via the "Search Live AI" button in the DisambiguationModal.
 *
 * Constitutional rule: This function is NEVER called automatically.
 * It fires exclusively from an explicit user interaction.
 *
 * Returns [] immediately in sandbox/local mode (isLocal = true).
 * Returns [] silently on any network failure, parse error, or timeout.
 */
export const resolveArtistCandidatesViaAI = async (
  artistName: string,
  rejectedCandidates?: Array<{ id: string; label: string; origin: string; genre: string }>,
  signal?: AbortSignal
): Promise<Array<{ id: string; label: string; origin: string; genre: string }>> => {

  const baseUrl = typeof window !== 'undefined'
    ? window.location.origin + '/api/gemini'
    : 'http://localhost:8080/api/gemini';

  const model = (typeof process !== 'undefined' && process.env?.GEMINI_FLASH_MODEL) || 'gemini-3.6-flash';
  const targetUrl = `${baseUrl}/v1beta/models/${model}:generateContent`;

  const systemInstruction = `You are a music database disambiguation assistant.
Given an artist or band name, enumerate distinct musical acts that have used this exact name, across all countries, regions, and eras.
Return ONLY acts with genuinely distinct identities (do not list lineup variations).
If there is only one clear act, return exactly one entry.
If there are multiple acts (e.g. obscure local bands sharing the name), list them all up to a maximum of 5.
If you are unsure but know at least one act with this name, return it.
Respond in strict JSON only — no prose, no markdown, no citation markers.`;

  let userPrompt = `List all distinct musical artists or bands named "${artistName}". Return a JSON array of objects with fields: name (string), country (string, country of origin), genre (string, primary genre), activeYears (string, e.g. "1992–2004" or "2010–present").`;

  if (rejectedCandidates && rejectedCandidates.length > 0) {
    const rejectedContext = rejectedCandidates.map(c => `${c.label || c.id} (Origin: ${c.origin}, Genre: ${c.genre})`).join(', ');
    userPrompt += `\n\nCRITICAL CONSTRAINT: Do NOT include any of the following acts in your response, as the user has already rejected them: [${rejectedContext}]. Focus solely on other distinct acts sharing this name.`;
  }

  const requestBody = {
    contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
    systemInstruction: { parts: [{ text: systemInstruction }] },
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            name: { type: 'STRING' },
            country: { type: 'STRING' },
            genre: { type: 'STRING' },
            activeYears: { type: 'STRING' }
          },
          required: ['name', 'country', 'genre']
        }
      },
      maxOutputTokens: 2048
    }
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000);
  const combinedSignal = signal || controller.signal;

  try {
    const startTime = Date.now();
    console.log(`[Diagnostic] Starting fetch for "${artistName}". Signal aborted? ${combinedSignal.aborted}`);
    combinedSignal.addEventListener('abort', () => {
      console.warn(`[Diagnostic] signal 'abort' event fired at ${Date.now() - startTime}ms! Reason:`, combinedSignal.reason);
    });

    const password = typeof window !== 'undefined' ? sessionStorage.getItem('zcene_api_password') : null;
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        ...(password && { 'x-zcene-password': password })
      },
      body: JSON.stringify(requestBody),
      signal: combinedSignal
    });

    clearTimeout(timeoutId);
    console.log(`[Diagnostic] Fetch completed successfully at ${Date.now() - startTime}ms. Status: ${response.status}`);

    let finalResponse = response;
    
    if (!finalResponse.ok) {
      if (finalResponse.status === 503 && typeof window !== 'undefined') {
        const apiKey = typeof process !== 'undefined' ? process.env.GEMINI_API_KEY : (import.meta as any).env?.VITE_GEMINI_API_KEY;
        if (apiKey) {
          console.warn(`[Disambiguation Probe] Proxy returned 503. Attempting direct fallback to Google API...`);
          const fallbackUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
          
          try {
            const password = typeof window !== 'undefined' ? sessionStorage.getItem('zcene_api_password') : null;
            const fallbackResponse = await fetch(fallbackUrl, {
              method: 'POST',
              headers: { 
                'Content-Type': 'application/json',
                ...(password && { 'x-zcene-password': password })
              },
              body: JSON.stringify(requestBody),
              signal: combinedSignal
            });
            
            if (fallbackResponse.ok) {
              finalResponse = fallbackResponse;
              console.log(`[Disambiguation Probe] Direct fallback successful!`);
            } else {
              console.warn(`[Disambiguation Probe] Direct fallback also failed with status ${fallbackResponse.status}`);
            }
          } catch (fallbackErr) {
            console.warn(`[Disambiguation Probe] Direct fallback fetch failed:`, fallbackErr);
          }
        }
      }

      if (!finalResponse.ok) {
        console.warn(`[Disambiguation Probe] API returned ${finalResponse.status} for "${artistName}"`);
        return [];
      }
    }

    const json = await finalResponse.json();
    const rawText = json?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    if (!rawText) return [];

    const cleanedText = extractCleanJsonString(rawText);
    let parsed: Array<{ name: string; country: string; genre: string; activeYears?: string }> = [];
    try {
      parsed = JSON.parse(cleanedText);
    } catch {
      try {
        parsed = JSON.parse(repairJson(cleanedText));
      } catch {
        console.warn(`[Disambiguation Probe] JSON parse failed for "${artistName}"`);
        return [];
      }
    }

    if (!Array.isArray(parsed) || parsed.length === 0) return [];

    // Map to DisambiguationCandidate shape
    return parsed.map(c => ({
      id: `${c.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${c.country.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      label: c.name,
      origin: c.country + (c.activeYears ? ` · ${c.activeYears}` : ''),
      genre: c.genre
    }));
  } catch (err) {
    clearTimeout(timeoutId);
    console.error(`[Diagnostic] Fetch catch block hit! Name: ${(err as any)?.name}, Message: ${(err as any)?.message}`);
    console.error(`[Diagnostic] Was combinedSignal aborted? ${combinedSignal.aborted}. Reason:`, combinedSignal.reason);
    if ((err as any)?.name !== 'AbortError') {
      console.warn(`[Disambiguation Probe] Failed for "${artistName}":`, err);
    }
    console.error(`[Disambiguation Probe] Candidate probe error for "${artistName}":`, err);
    return [];
  }
};

// --- GRAPH DATA GENERATION ---

export const generateGraphData = async (
  artists: string,
  baseGraph?: GraphData,
  filters?: DiscoveryFilters,
  activeUserId?: string | null,
  signal?: AbortSignal,
  disambiguationHints?: Record<string, string>,
  disambiguationGenres?: Record<string, string>
): Promise<GraphData> => {
  if (isLocal) {
    // Add artificial delay to simulate network latency and show loading states during local testing
    await new Promise(resolve => setTimeout(resolve, 1500));
    return generateMockGraphData(artists, baseGraph, filters);
  }
  const proxyKey = 'backend-proxy-key'; // Actual key is securely injected by the proxy
  const baseUrl = typeof window !== 'undefined' ? window.location.origin + '/api/gemini' : 'http://localhost:8080/api/gemini';

  const artistList = artists.split('::').map(a => a.trim()).filter(Boolean);
  let cachedSubgraphsContext = "";
  if (artistList.length > 1) {
    try {
      const cacheResult = await readArtistCacheMany(artistList, activeUserId);
      if (cacheResult.cached.size > 0) {
        const contextData: Array<{ artist: string; nodes: Node[]; links: Link[] }> = [];
        cacheResult.cached.forEach((entry, name) => {
          if (entry.graphData) {
            try {
              const parsed = JSON.parse(entry.graphData);
              contextData.push({
                artist: name,
                nodes: parsed.nodes || [],
                links: parsed.links || []
              });
            } catch (e) {
              console.warn(`[generateGraphData] Failed to parse cached graphData context for ${name}:`, e);
            }
          }
        });
        if (contextData.length > 0) {
          cachedSubgraphsContext = JSON.stringify(contextData, null, 2);
        }
      }
    } catch (cacheErr) {
      console.warn("[generateGraphData] Failed to read cached subgraphs for prompt context:", cacheErr);
    }
  }

  const attemptRequest = async (retriesLeft: number): Promise<GraphData> => {
    const currentModel = "gemini-3.1-pro-preview";
    
    try {
      let userPrompt: string;
      let systemInstruction: string;

      const isEnhancement = baseGraph && baseGraph.nodes.length > 0;
      const isMultiSeed = artistList.length > 1 && cachedSubgraphsContext.length > 0;
      
      // Reinforce schema with dynamic descriptions if filters exist
      const dynamicSchema = JSON.parse(JSON.stringify(GRAPH_RESPONSE_SCHEMA));
      if (filters?.foundedAfter) {
          dynamicSchema.properties.nodes.description += ` MANDATORY: All NEW artists MUST have been founded AFTER ${filters.foundedAfter}.`;
      }
      if (filters?.foundedBefore) {
          dynamicSchema.properties.nodes.description += ` MANDATORY: All NEW artists MUST have been founded BEFORE ${filters.foundedBefore}.`;
      }

      if (isMultiSeed) {
          systemInstruction = GENERATE_MULTI_SEED_GRAPH_PROMPT_TEMPLATE
              .replace('{{artists}}', artists);
          userPrompt = `Explore the genuine cultural, historical, and musical intersection of these seed artists: ${artists} from a blank slate. Map their crossover bridge and native scene ecosystems.`;
      } else if (isEnhancement) {
          const existingNodeIds = baseGraph.nodes.map(n => `"${n.id}" (${n.type})`).join(', ');
          systemInstruction = GENERATE_GRAPH_WITH_CONTEXT_PROMPT_TEMPLATE
              .replace('{{existingNodeIds}}', existingNodeIds);
          userPrompt = `Enhance the graph for these seed artists: ${artists}.`;
      } else {
          systemInstruction = GENERATE_GRAPH_PROMPT_TEMPLATE;
          userPrompt = `Generate a music graph for these seed artists: ${artists}.`;
      }

      // Inject 3-Tier Anchor System (Architecture V30 / Rule 41) into System Instruction
      if (hasActiveDiscoveryFilters(filters) && filters) {
          let filterRules = "\n\n3-TIER ANCHOR HIERARCHY & DISCOVERY CONSTRAINTS (RULE 41):";
          filterRules += `\n- LEVEL 1 (SACRED SEED IMMUNITY): The seed artists [${artists}] are the sacred genesis of the spiderweb and are 100% IMMUNE to all secondary Era, Origin, Genre, and Label filters.`;

          if (hasActiveTier2Filters(filters)) {
              filterRules += "\n\n- LEVEL 2 (HARD SPATIAL & TEMPORAL GUARDRAILS — ZERO-TOLERANCE):";
              filterRules += "\n  Every NEW recommended artist you add MUST strictly obey these hard boundaries. Cross-era and cross-border lineage is explicitly authorized.";
              if (filters.foundedAfter) {
                  filterRules += `\n  * MANDATORY ERA FLOOR: Every NEW artist you add MUST have been founded in the year ${filters.foundedAfter} or LATER.`;
                  filterRules += `\n  * FORBIDDEN: Do not include any new artists founded in ${filters.foundedAfter - 1} or earlier.`;
              }
              if (filters.foundedBefore) {
                  filterRules += `\n  * MANDATORY ERA CEILING: Every NEW artist you add MUST have been founded in the year ${filters.foundedBefore} or EARLIER.`;
                  filterRules += `\n  * FORBIDDEN: Do not include any new artists founded in ${filters.foundedBefore + 1} or later.`;
              }
              if (filters.includeOrigins && filters.includeOrigins.length > 0) {
                  filterRules += `\n  * ORIGIN MANDATE: Only include new artists from: ${filters.includeOrigins.join(', ')}.`;
              }
              if (filters.excludeOrigins && filters.excludeOrigins.length > 0) {
                  filterRules += `\n  * FORBIDDEN ORIGINS: Strictly exclude all new artists from: ${filters.excludeOrigins.join(', ')}.`;
              }
          }

          if (hasActiveTier3Filters(filters)) {
              filterRules += "\n\n- LEVEL 3 (SOFT SCENE GRAVITY & GRACEFUL DEGRADATION — RULE 41):";
              if (filters.includeGenres && filters.includeGenres.length > 0) {
                  filterRules += `\n  * CANONICAL GENRE GRAVITY: Strongly prioritize new artists connected to these genres: ${filters.includeGenres.join(', ')}.`;
              }
              if (filters.anchorLabels && filters.anchorLabels.length > 0) {
                  const sanitizedLabels = filters.anchorLabels.map(l => sanitizeAnchorLabelInput(l)).filter(Boolean);
                  if (sanitizedLabels.length > 0) {
                      filterRules += `\n  * ANCHOR LABEL GRAVITY: Strongly prioritize new artists released on or connected to these record labels: ${sanitizedLabels.join(', ')}, and include their 'label' node(s) where authentic.`;
                  }
              }
              filterRules += "\n  * GRACEFUL DEGRADATION MANDATE: Level 2 Era and Origin guardrails ALWAYS supersede Level 3 Genre and Label gravity. If a Level 3 genre or record label has zero authentic artists inside the Level 2 Era/Origin window, DO NOT violate Level 2 and DO NOT return an empty graph. Silently bypass the conflicting Level 3 constraint and complete the spiderweb using Level 1 and Level 2.";
          }

          filterRules += "\n\nIMPORTANT: Do NOT include any search citations, grounding markers (like [1], [2]), or footnotes in the JSON output. The JSON must be clean and parseable.";
          filterRules += "\n\nFINAL VERIFICATION: Before generating JSON, audit your list. If any new artist violates a Level 2 Era or Origin guardrail above, DELETE them from your response.";
          
          systemInstruction += filterRules;

          // Also reinforce in the user prompt
          let reminder = `\n\nREMINDER: All new artists MUST obey the active 3-Tier Anchors:`;
          if (filters.foundedAfter) reminder += ` founded in ${filters.foundedAfter} or later;`;
          if (filters.foundedBefore) reminder += ` founded in ${filters.foundedBefore} or earlier;`;
          if (filters.includeOrigins && filters.includeOrigins.length > 0) reminder += ` origins in ${filters.includeOrigins.join(', ')};`;
          if (filters.excludeOrigins && filters.excludeOrigins.length > 0) reminder += ` origins NOT in ${filters.excludeOrigins.join(', ')};`;
          if (filters.includeGenres && filters.includeGenres.length > 0) reminder += ` soft genre pull ${filters.includeGenres.join(', ')};`;
          if (filters.anchorLabels && filters.anchorLabels.length > 0) reminder += ` soft label pull ${filters.anchorLabels.map(l => sanitizeAnchorLabelInput(l)).filter(Boolean).join(', ')};`;
          userPrompt += reminder;
      }

      // [Disambiguation Gate] Inject user-confirmed identity constraint when present.
      // This pins the synthesis to the exact regional/genre entity the user selected
      // via the DisambiguationModal "Search Live AI" probe, preventing Gemini from
      // defaulting to the highest-frequency training-data match for an ambiguous name.
      if (disambiguationHints && Object.keys(disambiguationHints).length > 0) {
          const hintBlock = Object.values(disambiguationHints).join('\n');
          systemInstruction += `\n\nDISAMBIGUATION CONSTRAINTS (MANDATORY — DO NOT OVERRIDE):\n${hintBlock}`;
      }

      // Format standard REST request body
      const requestBody = {
        contents: [
          {
            role: "user",
            parts: [
              {
                text: userPrompt
              }
            ]
          }
        ],
        systemInstruction: {
          parts: [
            {
              text: systemInstruction.replace(/{{artists}}/g, artists)
            }
          ]
        },
        generationConfig: {
          temperature: 0.2,
          topP: 0.95,
          topK: 40,
          maxOutputTokens: 12000,
          responseMimeType: "application/json",
          responseSchema: dynamicSchema
        }
      };

      const url = `${baseUrl}/v1beta/models/${currentModel}:generateContent`;
      const password = typeof window !== 'undefined' ? sessionStorage.getItem('zcene_api_password') : null;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': proxyKey,
          ...(password && { 'x-zcene-password': password })
        },
        body: JSON.stringify(requestBody),
        signal
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error(`[generateGraphData] Outbound fetch failed with status ${response.status}: ${errText}`);
        throw new Error(`Outbound fetch failed with status ${response.status}: ${errText}`);
      }

      const resJson = await response.json();
      const jsonText = resJson.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

      if (!jsonText) {
          console.error(`AI (${currentModel}) returned empty response text:`, resJson);
          if (retriesLeft > 0) return await attemptRequest(retriesLeft - 1);
          throw new Error("The AI returned an empty response. Please try again.");
      }
      
      console.log(`AI (${currentModel}) response length: ${jsonText.length}`);
      const finishReason = resJson.candidates?.[0]?.finishReason;
      if (finishReason && finishReason !== 'STOP') {
          console.warn(`AI (${currentModel}) finished with reason: ${finishReason}. Response might be truncated.`);
      }
      
      const cleanedJsonText = extractCleanJsonString(jsonText);

      let data: GraphData;
      try {
          data = JSON.parse(cleanedJsonText) as GraphData;
      } catch (parseError) {
          console.error(`Failed to parse AI JSON response from ${currentModel}. Length: ${cleanedJsonText.length}. Text preview: ${cleanedJsonText.substring(0, 200)}...`, parseError);
          
          const repaired = repairJson(cleanedJsonText);
          console.log(`Attempting to parse repaired JSON (length: ${repaired.length})`);
          
          try {
              data = JSON.parse(repaired) as GraphData;
              console.log("Successfully parsed repaired JSON.");
          } catch (innerError) {
              console.error(`Repair failed for ${currentModel}. Repaired text preview: ${repaired.substring(0, 200)}...`, innerError);
              if (retriesLeft > 0) {
                  console.warn(`Retrying with ${retriesLeft} attempts left...`);
                  return await attemptRequest(retriesLeft - 1);
              }
              throw new Error("The AI returned invalid data. Please try again.");
          }
      }

      // --- POST-PROCESSING FILTERING (NUCLEAR OPTION) ---
      const seedArtistIds = new Set(artists.split('::').map(a => a.trim().toLowerCase()));
      const nodesToRemove = new Set<string>();

      // Ensure that data.nodes and data.links are explicitly validated and assigned as arrays
      const rawNodes = Array.isArray(data?.nodes) ? data.nodes : [];
      const rawLinks = Array.isArray(data?.links) ? data.links : [];

      // --- MULTI-SEED TOPOLOGY MAPPING ---
      // Re-anchor natural LLM output (e.g. "turnstile") to cached baseGraph roots (e.g. "turnstile-usa")
      if (disambiguationHints) {
          rawNodes.forEach(node => {
              if (!node.id) return;
              const mapKey = `__MAP__${normalizeArtistId(node.id)}`;
              if (disambiguationHints[mapKey]) {
                  node.id = disambiguationHints[mapKey];
              }
          });
          rawLinks.forEach(link => {
              if (link.source) {
                  const sourceStr = typeof link.source === 'string' ? link.source : link.source.id;
                  if (sourceStr) {
                      const mapKey = `__MAP__${normalizeArtistId(sourceStr)}`;
                      if (disambiguationHints[mapKey]) {
                          if (typeof link.source === 'string') {
                              link.source = disambiguationHints[mapKey];
                          } else {
                              link.source.id = disambiguationHints[mapKey];
                          }
                      }
                  }
              }
              if (link.target) {
                  const targetStr = typeof link.target === 'string' ? link.target : link.target.id;
                  if (targetStr) {
                      const mapKey = `__MAP__${normalizeArtistId(targetStr)}`;
                      if (disambiguationHints[mapKey]) {
                          if (typeof link.target === 'string') {
                              link.target = disambiguationHints[mapKey];
                          } else {
                              link.target.id = disambiguationHints[mapKey];
                          }
                      }
                  }
              }
          });
      }

      // --- SANITIZE POLLUTED IDS ---
      // Match patterns like "-after-2020", "(After 2020)", "after 2020", etc.
      const pollutedSuffixRegex = /(?:-|\s*\(?)?(?:after|before)\s*-?\d{4}\)?$/i;
      
      rawNodes.forEach(node => {
          if (node.id) {
              node.id = node.id.replace(pollutedSuffixRegex, '').trim();
          }
      });
    
      rawLinks.forEach(link => {
          if (link.source) {
              if (typeof link.source === 'string') {
                  link.source = link.source.replace(pollutedSuffixRegex, '').trim();
              } else if (link.source.id) {
                  link.source.id = link.source.id.replace(pollutedSuffixRegex, '').trim();
              }
          }
          if (link.target) {
              if (typeof link.target === 'string') {
                  link.target = link.target.replace(pollutedSuffixRegex, '').trim();
              } else if (link.target.id) {
                  link.target.id = link.target.id.replace(pollutedSuffixRegex, '').trim();
              }
          }
      });

      if (filters?.foundedAfter) {
          const threshold = Number(filters.foundedAfter);
          const artistToYear = new Map<string, number>();
          const nodeMap = new Map(rawNodes.map(n => [n.id, n]));

          rawLinks.forEach(link => {
              const sourceId = typeof link.source === 'string' ? link.source : (link.source as Node).id;
              const targetId = typeof link.target === 'string' ? link.target : (link.target as Node).id;
              
              const sourceNode = nodeMap.get(sourceId);
              const targetNode = nodeMap.get(targetId);
              
              if (sourceNode?.type === 'artist' && targetNode?.type === 'founded') {
                  const year = parseInt(targetNode.id);
                  if (!isNaN(year)) artistToYear.set(sourceId.toLowerCase(), year);
              } else if (targetNode?.type === 'artist' && sourceNode?.type === 'founded') {
                  const year = parseInt(sourceNode.id);
                  if (!isNaN(year)) artistToYear.set(targetId.toLowerCase(), year);
              }
          });

          rawNodes.forEach(node => {
              if (node.type === 'artist' && !seedArtistIds.has(node.id.toLowerCase())) {
                  const year = artistToYear.get(node.id.toLowerCase());
                  if (year !== undefined && year < threshold) {
                      nodesToRemove.add(node.id);
                  }
              }
          });
      }

      if (filters?.foundedBefore) {
          const threshold = Number(filters.foundedBefore);
          const artistToYear = new Map<string, number>();
          const nodeMap = new Map(rawNodes.map(n => [n.id, n]));

          rawLinks.forEach(link => {
              const sourceId = typeof link.source === 'string' ? link.source : (link.source as Node).id;
              const targetId = typeof link.target === 'string' ? link.target : (link.target as Node).id;
              
              const sourceNode = nodeMap.get(sourceId);
              const targetNode = nodeMap.get(targetId);
              
              if (sourceNode?.type === 'artist' && targetNode?.type === 'founded') {
                  const year = parseInt(targetNode.id);
                  if (!isNaN(year)) artistToYear.set(sourceId.toLowerCase(), year);
              } else if (targetNode?.type === 'artist' && sourceNode?.type === 'founded') {
                  const year = parseInt(sourceNode.id);
                  if (!isNaN(year)) artistToYear.set(targetId.toLowerCase(), year);
              }
          });

          rawNodes.forEach(node => {
              if (node.type === 'artist' && !seedArtistIds.has(node.id.toLowerCase())) {
                  const year = artistToYear.get(node.id.toLowerCase());
                  if (year !== undefined && year > threshold) {
                      nodesToRemove.add(node.id);
                  }
              }
          });
      }

      let filteredNodes = rawNodes.filter(n => !nodesToRemove.has(n.id));
      let filteredLinks = rawLinks.filter(l => {
          const s = typeof l.source === 'string' ? l.source : (l.source as Node).id;
          const t = typeof l.target === 'string' ? l.target : (l.target as Node).id;
          return !nodesToRemove.has(s) && !nodesToRemove.has(t);
      });

      const artistIdsInFilteredNodes = new Set(filteredNodes.filter(n => n.type === 'artist' || n.type === 'label').map(n => n.id));
      
      filteredNodes = filteredNodes.filter(n => {
          if (n.type === 'artist' || n.type === 'label') return true;
          return filteredLinks.some(l => {
              const s = typeof l.source === 'string' ? l.source : (l.source as Node).id;
              const t = typeof l.target === 'string' ? l.target : (l.target as Node).id;
              return (s === n.id && artistIdsInFilteredNodes.has(t)) || (t === n.id && artistIdsInFilteredNodes.has(s));
          });
      });
      
      // Re-filter links to ensure they only point to existing nodes after cleanup
      const finalNodeIds = new Set(filteredNodes.map(n => n.id));
      filteredLinks = filteredLinks.filter(l => {
          const s = typeof l.source === 'string' ? l.source : (l.source as Node).id;
          const t = typeof l.target === 'string' ? l.target : (l.target as Node).id;
          return finalNodeIds.has(s) && finalNodeIds.has(t);
      });

      const deduplicatedNodesMap = new Map<string, Node>();
      filteredNodes.forEach(node => {
          const normalizedId = node.id.trim().toLowerCase();
          if (!deduplicatedNodesMap.has(normalizedId)) {
              deduplicatedNodesMap.set(normalizedId, { ...node, id: node.id.trim() });
          }
      });
      const deduplicatedNodes = Array.from(deduplicatedNodesMap.values());

      const validationNodeMap = new Map<string, Node>();
      const allNodesForValidation = [...(baseGraph?.nodes || []), ...deduplicatedNodes];
      for (const node of allNodesForValidation) {
          if (!node.id) continue;
          const normalizedId = node.id.trim().toLowerCase();
          const hyphenId = normalizeArtistId(node.id);
          
          if (!validationNodeMap.has(normalizedId)) {
              validationNodeMap.set(normalizedId, { ...node, id: node.id.trim() });
          }
          if (!validationNodeMap.has(hyphenId)) {
              validationNodeMap.set(hyphenId, { ...node, id: node.id.trim() });
          }
      }
      
      const validLinks = filteredLinks.filter(link => {
          const sourceIdRaw = typeof link.source === 'string' ? link.source : (link.source as Node).id;
          const targetIdRaw = typeof link.target === 'string' ? link.target : (link.target as Node).id;
          if (!sourceIdRaw || !targetIdRaw) return false;
          
          const sourceId = sourceIdRaw.trim().toLowerCase();
          const targetId = targetIdRaw.trim().toLowerCase();
          
          if (sourceId === targetId) return false;
          // Dynamically register missing source/target nodes to prevent peripheral data loss
          if (!validationNodeMap.has(sourceId)) {
              const rawSource = typeof link.source === 'string' ? link.source : (link.source as Node).id;
              const trimmedSource = rawSource.trim();
              const newNode: Node = { id: trimmedSource, type: 'artist', group: 1, label: trimmedSource };
              const hyphenSource = normalizeArtistId(trimmedSource);
              
              validationNodeMap.set(sourceId, newNode);
              validationNodeMap.set(hyphenSource, newNode);
              deduplicatedNodes.push(newNode);
          }
          if (!validationNodeMap.has(targetId)) {
              const rawTarget = typeof link.target === 'string' ? link.target : (link.target as Node).id;
              const trimmedTarget = rawTarget.trim();
              const newNode: Node = { id: trimmedTarget, type: 'artist', group: 1, label: trimmedTarget };
              const hyphenTarget = normalizeArtistId(trimmedTarget);
              
              validationNodeMap.set(targetId, newNode);
              validationNodeMap.set(hyphenTarget, newNode);
              deduplicatedNodes.push(newNode);
          }

          link.source = validationNodeMap.get(sourceId)!.id;
          link.target = validationNodeMap.get(targetId)!.id;
          return true;
      });

      const finalNodes = Array.isArray(deduplicatedNodes) ? deduplicatedNodes : [];
      let mergedLinks = Array.isArray(validLinks) ? validLinks : [];
      
      // Explicitly merge baseGraph nodes and links to preserve context
      if (baseGraph) {
          if (baseGraph.nodes) {
              baseGraph.nodes.forEach(baseNode => {
                  const normalizedBaseId = normalizeArtistId(baseNode.id);
                  if (!finalNodes.some(n => normalizeArtistId(n.id) === normalizedBaseId)) {
                      finalNodes.push(baseNode);
                  }
              });
          }
          if (baseGraph.links) {
              mergedLinks = [...mergedLinks, ...baseGraph.links];
          }
      }
      
      // Explicitly assign generated arrays to the returned graph metadata object
      const finalGraph: GraphData = normalizeGraphData({
          nodes: finalNodes,
          links: mergedLinks
      });

      if (data && (data as any).synthesis_rationale) {
          finalGraph.synthesisRationale = (data as any).synthesis_rationale;
      }

      return finalGraph;
    } catch (error: any) {
      const errorMsg = error.message || '';
      const isAbort = error.name === 'AbortError' || errorMsg.includes('aborted');
      if (isAbort) {
        throw error; // Propagate abort/cancel immediately
      }

      const isTimeout = errorMsg.includes('deadline exceeded') || 
                        errorMsg.includes('504') || 
                        errorMsg.includes('timeout');
      
      const isTransient = !isTimeout && (
                          errorMsg.includes('Proxying failed') || 
                          errorMsg.includes('RESOURCE_EXHAUSTED') || 
                          errorMsg.includes('NetworkError') ||
                          errorMsg.includes('500') ||
                          errorMsg.includes('fetch failed')
      );

      if (isTransient && retriesLeft > 0) {
        console.warn(`Transient AI error detected. Retrying... (${retriesLeft} left). Error: ${errorMsg}`);
        await new Promise(resolve => setTimeout(resolve, 1500));
        return attemptRequest(retriesLeft - 1);
      }
      
      throw new Error(error.message || 'Failed to generate graph data.');
    }
  };

  return attemptRequest(2);
};


/**
 * Sanitizes Deep Cut biography and summary text:
 * - Strips raw codeblock wrappers (```json ... ```)
 * - Extracts summary text if wrapped in unparsed JSON ({ "summary": "..." })
 * - Filters out Chain-of-Thought search reasoning preambles
 * - Converts raw escaped newlines (\n*) into formatted bullet points
 * - Cleans trailing Markdown symbols and citations
 */
export const sanitizeBioText = (rawText?: string): string => {
  if (!rawText || typeof rawText !== 'string') return '';

  let text = rawText.trim();
  // Strip raw codeblock fences if present
  const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (match && match[1]) {
      text = match[1].trim();
  } else {
      text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  }

  // If text is a raw JSON string wrapper like {"summary": "..."} or {"bio": "..."}, extract the string!
  if (text.startsWith('{') || text.startsWith('[')) {
      const summaryMatch = text.match(/["'](?:summary|bio|description|text)["']\s*:\s*["']([\s\S]*?)(?=["']\s*(?:,\s*["'](?:imageUrl|members|details|discography|tourInfo|recommendationReason|nodes|links|group|id|type)["']|\s*\}|\s*$))/i);
      if (summaryMatch && summaryMatch[1]) {
          text = summaryMatch[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\').trim();
      }
  }

  // Filter out common Chain-of-Thought search grounding reasoning prefixes
  let prevText;
  do {
      prevText = text;
      text = text.replace(/^(?:I have confirmed|I will manually check|I will check|I need to check|I need to get|To answer your request|For the YouTube video|Here is the JSON|Here are the details|Here is the information|Note: Some details|Based on the search)[^.\n]*[.\n]+\s*/ig, '').trim();
  } while (text !== prevText && text.length > 0);

  // Convert literal escaped \n to actual newlines (preserves markdown bolding ** and markdown lists \n*)
  text = text.replace(/\\n/g, '\n');

  // Strip citations like [1], [1, 2, 3], (1, 2), and [cite: 20 (previous search)]
  text = text.replace(/\[\s*\d+(?:\s*,\s*\d+)*\s*\]/g, '')
             .replace(/\(\s*\d+(?:\s*,\s*\d+)*\s*\)/g, '')
             .replace(/\[\s*(?:cite|citation)[^\]]*\]/gi, '')
             .replace(/""/g, '') // Strip stray empty quotes
             .trim();

  return text;
};

export const extractValidYoutubeId = (rawUrlOrId?: string | null): string | undefined => {
  if (!rawUrlOrId || typeof rawUrlOrId !== 'string') return undefined;
  const cleaned = rawUrlOrId.replace(/['"`]/g, '').trim();
  if (!cleaned || cleaned.toLowerCase() === 'null' || cleaned.toLowerCase() === 'undefined') return undefined;

  const vMatch = cleaned.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
  const shortMatch = cleaned.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
  const embedMatch = cleaned.match(/embed\/([a-zA-Z0-9_-]{11})/);
  if (vMatch) return vMatch[1];
  if (shortMatch) return shortMatch[1];
  if (embedMatch) return embedMatch[1];
  if (/^[a-zA-Z0-9_-]{11}$/.test(cleaned)) return cleaned;

  const anyMatch = cleaned.match(/(?:v=|youtu\.be\/|embed\/|^)([a-zA-Z0-9_-]{11})(?:[&/?]|$)|\b([a-zA-Z0-9_-]{11})\b/);
  const cand = anyMatch ? (anyMatch[1] || anyMatch[2]) : undefined;
  return cand && cand.length === 11 ? cand : undefined;
};

export const sanitizeImageUrl = (rawUrl?: string | null, sanitizeStrFn?: (s: string) => string): string | undefined => {
  if (!rawUrl || typeof rawUrl !== 'string') return undefined;
  if (rawUrl.includes('...')) return undefined;
  let cleaned = sanitizeStrFn ? sanitizeStrFn(rawUrl) : rawUrl;
  cleaned = cleaned.replace(/\[\d+\]/g, '').replace(/\(\d+\)/g, '').replace(/[.,;!"']+$/g, '').trim();
  if (
    !cleaned ||
    cleaned.includes('..') ||
    cleaned.toLowerCase().includes('example.com') ||
    cleaned.toLowerCase().includes('path/to/') ||
    cleaned.endsWith('/Special:FilePath/') ||
    cleaned === 'https://en.wikipedia.org/wiki/Special:FilePath/'
  ) {
    return undefined;
  }

  // Two-Tier Domain-Aware Image URL Validator — Genre-Contextual Edition (mirrored from curatorService.ts).
  // Tier A: Expanded allowlist covering both Contemporary/Indie/Punk and Classical/Institutional domains.
  //         Always accepted if URL structure is valid. Covers CDN paths that lack image file extensions.
  // Tier B: Any domain, but path MUST contain a recognizable image extension or image-suggestive segment.
  // Reject: Any URL that passes neither tier is discarded as potential web noise.
  const TRUSTED_IMAGE_DOMAINS = [
    // ── CONTEMPORARY / INDIE / ELECTRONIC / PUNK / HIP-HOP ──
    'upload.wikimedia.org',        // Wikimedia Commons
    'commons.wikimedia.org',
    'f4.bcbits.com',               // Bandcamp CDN (all variants)
    'f1.bcbits.com',
    'f2.bcbits.com',
    'f3.bcbits.com',
    'i.discogs.com',               // Discogs
    'img.discogs.com',
    'i.scdn.co',                   // Spotify
    'lastfm.freetls.fastly.net',   // Last.fm
    'coverartarchive.org',         // MusicBrainz Cover Art Archive
    'assets.bandcamp.com',
    'cdn.allmusic.com',            // AllMusic
    // ── CLASSICAL / ORCHESTRAL / TRADITIONAL / JAZZ / OPERA ──
    'images.hyperion-records.co.uk', // Hyperion Records (major British classical label)
    'cdn.naxos.com',               // Naxos (world's largest classical label)
    'www.naxos.com',
    'images.ecmrecords.com',        // ECM Records (jazz / contemporary classical)
    'www.ecmrecords.com',
    'images.deutschegrammophon.com', // Deutsche Grammophon (DG)
    'www.harmoniamundi.com',        // Harmonia Mundi (early music / baroque)
    'images.bis.se',               // BIS Records (Nordic classical label)
    'cdn.prestomusic.com',         // Presto Music CDN
    'images.chandos.net',          // Chandos Records
    'cdn.britannica.com',          // Britannica (composer & musician portraits — no ext.)
  ];
  const IMAGE_EXTENSIONS = /\.(jpg|jpeg|png|webp|gif|avif|bmp|tiff?)(\?|#|$)/i;
  const IMAGE_PATH_SEGMENTS = /\/(img|image|images|photo|photos|media|assets|thumbnail|thumb|artwork)\//i;

  try {
    const parsed = new URL(cleaned);
    if (!['https:', 'http:'].includes(parsed.protocol)) return undefined;
    if (!parsed.pathname || parsed.pathname === '/' || parsed.pathname.length <= 1) return undefined;

    const host = parsed.hostname.toLowerCase();
    const pathname = parsed.pathname;

    const isFromTrustedDomain = TRUSTED_IMAGE_DOMAINS.some(d => host === d || host.endsWith(`.${d}`));
    const looksLikeImageAsset = IMAGE_EXTENSIONS.test(pathname) || IMAGE_PATH_SEGMENTS.test(pathname);

    if (isFromTrustedDomain || looksLikeImageAsset) {
      return cleaned;
    }
    return undefined; // Neither Tier A nor Tier B — likely web noise
  } catch (e) {
    return undefined;
  }
};

export const fetchNodeDetails = async (node: Node, graphData: GraphData, seedArtists: string, originHint?: string | null): Promise<NodeDetails> => {
    if (isLocal) {
        return generateMockNodeDetails(node);
    }
    const proxyKey = 'backend-proxy-key';
    const baseUrl = typeof window !== 'undefined' ? window.location.origin + '/api/gemini' : 'http://localhost:8080/api/gemini';
    
    const contextNodes = graphData.links
        .filter(l => (typeof l.source === 'string' ? l.source : l.source.id) === node.id || (typeof l.target === 'string' ? l.target : l.target.id) === node.id)
        .map(l => {
            const sourceId = typeof l.source === 'string' ? l.source : l.source.id;
            const targetId = typeof l.target === 'string' ? l.target : l.target.id;
            return sourceId === node.id ? targetId : sourceId;
        })
        .map(id => graphData.nodes.find(n => n.id === id))
        .filter(Boolean)
        .map(n => `${n!.label || n!.id} (${n!.type})`)
        .slice(0, 10)
        .join(', ');

    const currentDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    let prompt = FETCH_NODE_DETAILS_PROMPT_TEMPLATE
        .replace('{{nodeIdentifier}}', node.id)
        .replace('{{nodeType}}', node.type)
        .replace('{{seedArtists}}', seedArtists)
        .replace('{{contextNodes}}', contextNodes)
        .replace(/{{currentDate}}/g, currentDate);
        
    if (originHint) {
        prompt = prompt.replace(/{{#if originHint}}[\s\S]*?{{originHint}}[\s\S]*?{{\/if}}/g, 
            `- **Origin Hint (CRITICAL):** Details for: ${originHint}.`);
    } else {
        prompt = prompt.replace(/{{#if originHint}}[\s\S]*?{{\/if}}/g, '');
    }
    
    const requestBody = {
      contents: [
        {
          role: "user",
          parts: [
            {
              text: prompt
            }
          ]
        }
      ],
      generationConfig: {
        maxOutputTokens: 4000,
      }
    };

    const flashModel = (typeof process !== 'undefined' && process.env?.GEMINI_FLASH_MODEL) || 'gemini-3.6-flash';
    const url = `${baseUrl}/v1beta/models/${flashModel}:generateContent`;
    const password = typeof window !== 'undefined' ? sessionStorage.getItem('zcene_api_password') : null;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': proxyKey,
        ...(password && { 'x-zcene-password': password })
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[fetchNodeDetails] Outbound fetch failed with status ${response.status}: ${errText}`);
      throw new Error(`Outbound fetch failed with status ${response.status}: ${errText}`);
    }

    const resJson = await response.json();
    const jsonText = resJson.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    
    if (!jsonText) {
        console.error("AI returned empty details response:", resJson);
        throw new Error("Empty response from AI details service.");
    }

    // Extract JSON payload using root-bound codeblock extractor (handles preamble and postamble text gracefully)
    const cleanedJsonText = extractCleanJsonString(jsonText);

    let details: NodeDetails;
    try {
        console.log(`[Deep Cut Parse] Attempting to parse raw JSON:`, cleanedJsonText.substring(0, 50) + "...");
        details = JSON.parse(cleanedJsonText) as NodeDetails;
    } catch (parseError) {
        console.warn("[Deep Cut Parse] Raw JSON parse failed. Attempting repair...");
        const repaired = repairJson(cleanedJsonText);
        console.log(`[Deep Cut Parse] Repaired JSON:`, repaired.substring(0, 50) + "...");
        
        try {
            details = JSON.parse(repaired) as NodeDetails;
        } catch (repairError) {
            throw new Error(`Failed to parse AI details JSON (prose fallback forbidden under Rule 40): ${parseError instanceof Error ? parseError.message : String(parseError)}`);
        }
    }

    // Ensure all required fields exist to prevent UI crashes if AI returned partial data.
    // URL sanitisation pass: strip any url that is not a valid http(s) URL — treats empty strings,
    // the literal string "null", and bare domains as equivalent to null per Section 5 / Link Hardening.
    const sanitisedLinks = (details.links || []).map(l => ({
        ...l,
        url: (l.url && typeof l.url === 'string' && l.url.trim().startsWith('http'))
            ? l.url.trim()
            : null
    }));

    const sanitizeString = (str: any): string => {
        if (typeof str !== 'string') return "";
        return sanitizeBioText(str);
    };

    const hydratedDetails: NodeDetails = {
        ...details,
        summary: sanitizeString(details.summary || "No summary available (AI response was truncated)."),
        details: (() => {
            // [Metadata Sanitization] ✦
            // Strip literal "Unknown"/"N/A"/"None" values from genre and origin before
            // writing to detailsCache or Firestore. The model occasionally returns these
            // strings verbatim when Google Search grounding is inconclusive (e.g. for
            // bands with common names). If stored as-is, these literals would previously
            // trigger checkIsProfileIncomplete → eviction → re-synthesis → same result
            // (infinite loop). An empty string is the safe canonical form: the DetailsPanel
            // renders it via its || 'Unknown' display fallback, so the UI is unchanged.
            const d = details.details || {} as any;
            const sanitizeMetaField = (val: string | undefined): string => {
                if (!val) return "";
                const t = val.trim().toLowerCase();
                if (t === "unknown" || t === "n/a" || t === "none" || t === "not available") return "";
                return sanitizeString(val);
            };
            return {
                ...d,
                genre: sanitizeMetaField(d.genre),
                origin: sanitizeMetaField(d.origin),
                founded: sanitizeString(d.founded),
                notableArtists: (d.notableArtists || []).map(sanitizeString)
            };
        })(),
        links: sanitisedLinks,
        discography: (details.discography || []).map((album: any) => ({
            albumName: sanitizeString(album?.albumName),
            releaseYear: sanitizeString(album?.releaseYear)
        })),
        members: (details.members || []).map(sanitizeString),
        recommendationReason: sanitizeString(details.recommendationReason || ""),
    };

    const validImageUrl = sanitizeImageUrl(details.imageUrl, sanitizeString);
    if (validImageUrl) {
        hydratedDetails.imageUrl = validImageUrl;
    } else {
        delete hydratedDetails.imageUrl;
    }

    const validYtId = extractValidYoutubeId(details.youtubeVideoId);
    if (validYtId) {
        hydratedDetails.youtubeVideoId = validYtId;
    } else {
        delete hydratedDetails.youtubeVideoId;
    }

    if (typeof details.youtubeSearchQuery === 'string' && details.youtubeSearchQuery.trim().length > 0) {
        hydratedDetails.youtubeSearchQuery = sanitizeString(details.youtubeSearchQuery.trim());
    }

    if (!hydratedDetails.details) hydratedDetails.details = {};

    const groundingChunks = resJson.candidates?.[0]?.groundingMetadata?.groundingChunks;
    if (groundingChunks && Array.isArray(groundingChunks)) {
        const uniqueLinks = new Map<string, { title: string; url: string }>();
        groundingChunks.forEach((chunk: any) => {
            if (chunk.web) {
                uniqueLinks.set(chunk.web.uri, {
                    title: chunk.web.title || 'Source',
                    url: chunk.web.uri
                });
            }
        });
        hydratedDetails.groundingLinks = Array.from(uniqueLinks.values());
    }
    
    return stripUndefinedProperties(hydratedDetails);
};

export const streamLocalHeuristicChat = async (
  currentNode: Node,
  userMessage: string,
  detailsCache: Map<string, NodeDetails>,
  graphData: GraphData,
  onChunk: (text: string) => void
) => {
    const details = detailsCache.get(currentNode.id) || detailsCache.get(currentNode.id.toLowerCase());
    const msg = userMessage.toLowerCase();

    const formatTitle = (str: string) => {
        return str.split(/[-\s]+/).map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
    };
    const nodeName = cleanArtistDisplayName(currentNode.id, graphData.nodes);
    
    // Extracted Data
    const year = details?.details?.founded || "their early years";
    const origin = details?.details?.origin ? formatTitle(details.details.origin) : "the underground scene";
    const genresStr = details?.details?.genre;
    const genres = genresStr ? genresStr.split(',').map(g => formatTitle(g.trim())).join(", ") : "hardcore punk";
    
    const getNodeType = (id: string) => graphData.nodes.find(n => n.id === id)?.type;
    
    const getConnectedNodes = (nodeId: string, nodeType: string) => {
        const connectedIds = graphData.links.filter(l => 
            (typeof l.source === 'object' ? l.source.id : l.source) === nodeId || 
            (typeof l.target === 'object' ? l.target.id : l.target) === nodeId
        ).map(l => {
            const s = typeof l.source === 'object' ? l.source.id : l.source;
            const t = typeof l.target === 'object' ? l.target.id : l.target;
            return s === nodeId ? t : s;
        });
        return Array.from(new Set(connectedIds.filter(id => getNodeType(id) === nodeType)));
    };

    const labelNames = getConnectedNodes(currentNode.id, 'label').map(formatTitle);
    const labels = labelNames.length ? labelNames.join(" and ") : "various independent labels";
    
    // Graph Traversal for generic peers
    const peers = getConnectedNodes(currentNode.id, 'artist').slice(0, 3).map(id => cleanArtistDisplayName(id, graphData.nodes));
    
    let fullText = "";

    // Deterministic Routing for Query Chips
    if (msg === "where are they from?") {
        fullText = `${nodeName} emerged from ${origin} in ${year}. This geographic scene heavily influenced their trajectory and sound.`;
    } 
    else if (msg === "what labels are they on?") {
        fullText = `Throughout their history, they have released music on ${labels}. These partnerships were crucial to pushing their sound.`;
    }
    else if (msg.startsWith("what is the connection to")) {
        const peerRaw = msg.replace("what is the connection to ", "").replace("?", "").trim();
        const peer = formatTitle(peerRaw);
        
        const peerNode = graphData.nodes.find(n => cleanArtistDisplayName(n.id, graphData.nodes).toLowerCase() === peerRaw);
        const actualPeerId = peerNode ? peerNode.id : peerRaw.replace(/\s+/g, '-');
        
        const activeLabels = getConnectedNodes(currentNode.id, 'label');
        const peerLabels = getConnectedNodes(actualPeerId, 'label');
        const sharedLabels = activeLabels.filter(l => peerLabels.includes(l));

        const activeOrigins = getConnectedNodes(currentNode.id, 'country');
        const peerOrigins = getConnectedNodes(actualPeerId, 'country');
        const sharedOrigins = activeOrigins.filter(l => peerOrigins.includes(l));

        const activeGenres = getConnectedNodes(currentNode.id, 'genre');
        const peerGenres = getConnectedNodes(actualPeerId, 'genre');
        const sharedGenres = activeGenres.filter(l => peerGenres.includes(l));
        
        const hasDirectLink = graphData.links.some(l => 
            ((typeof l.source === 'object' ? l.source.id : l.source) === currentNode.id && (typeof l.target === 'object' ? l.target.id : l.target) === actualPeerId) ||
            ((typeof l.source === 'object' ? l.source.id : l.source) === actualPeerId && (typeof l.target === 'object' ? l.target.id : l.target) === currentNode.id)
        );

        if (sharedLabels.length > 0) {
            fullText = `${nodeName} and ${peer} are intimately connected through their shared label, ${formatTitle(sharedLabels[0])}, a key driver of their sound.`;
        } else if (sharedGenres.length > 0) {
            fullText = `${nodeName} and ${peer} both pushed the boundaries of ${formatTitle(sharedGenres[0])}, defining a core era of the genre.`;
        } else if (hasDirectLink) {
            fullText = `Within our data graph, ${nodeName} and ${peer} share a direct structural connection, positioning them closely within the same scene topology.`;
        } else if (sharedOrigins.length > 0) {
            fullText = `${nodeName} and ${peer} share deep roots in the ${formatTitle(sharedOrigins[0])} scene, shaping their historical connection.`;
        } else {
            fullText = `Within our data graph, ${nodeName} shares deep sonic architecture and historical scene connections with ${peer}.`;
        }
    }
    else if (msg === "what sound do they have?") {
        const summary = details?.summary || "";
        const sentences = summary.split(/(?<=[.!?])\s+/);
        
        const musicKeywords = ['riffs', 'vocals', 'vocal', 'melodic', 'breakdowns', 'rhythms', 'sound', 'samples', 'lyrical', 'lyrics'];
        const soundSentence = sentences.find(s => {
            const lower = s.toLowerCase();
            return musicKeywords.some(kw => lower.includes(kw));
        });

        if (soundSentence) {
            fullText = `Operating within ${genres}, ${soundSentence.charAt(0).toLowerCase() + soundSentence.slice(1)}`;
        } else {
            const hash = currentNode.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
            const templates = [
                `They are primarily known for pushing the boundaries of ${genres}, blending raw aggression with technical precision.`,
                `Rooted deeply in ${genres}, their sonic signature relies on high-energy output and dynamic musicianship.`,
                `They have carved out a unique space within ${genres} by delivering a sound that is both abrasive and compelling.`
            ];
            fullText = templates[hash % templates.length];
        }
    }
    else if (msg === "recent history?") {
        fullText = `Formed around ${year} in ${origin}, ${nodeName} carved a unique space within ${genres}. ${peers.length > 0 ? `They often shared the stage and scene with peers like ${peers.join(" and ")}.` : ""}`;
    }
    else if (msg === "when were they founded and where?") {
        fullText = `${nodeName} was founded in ${year} in ${origin}, quickly becoming a cornerstone of the regional and global scene.`;
    }
    else if (msg === "what is their legacy in the scene?") {
        const sentences = details?.summary ? details.summary.split(/(?<=[.!?])\s+/) : [];
        fullText = sentences.length > 0 
            ? sentences.slice(0, 2).join(' ')
            : `As a foundational cornerstone of ${genres}, ${nodeName} brought raw energy and visionary curation to the scene.`;
    }
    else if (msg === "what genres do they specialize in?") {
        fullText = `${nodeName} specializes in pushing the boundaries of ${genres}, cultivating a distinct and influential catalog.`;
    }
    else if (msg === "who are their most notable artists?") {
        fullText = peers.length > 0 
            ? `They have been instrumental in launching and sustaining the careers of pioneering acts like ${peers.join(", ")}.`
            : `They have been instrumental in launching and sustaining the careers of pioneering acts within the ${genres} community.`;
    }
    else {
        // Fallback for anything else
        fullText = `As a foundational cornerstone of ${genres}, ${nodeName} brought raw energy to the scene.`;
    }
    
    // Universal Markdown Stripper for Instant AI
    fullText = fullText
        .replace(/\*\*(.*?)\*\*/g, '$1') // Remove bold
        .replace(/\*(.*?)\*/g, '$1')     // Remove italics
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1'); // Flatten links

    let current = "";
    const words = fullText.split(" ");
    for (let i = 0; i < words.length; i++) {
      current += (i === 0 ? "" : " ") + words[i];
      onChunk(current);
      await new Promise(resolve => setTimeout(resolve, 40));
    }
    return fullText;
};

export const streamNodeChat = async (
  currentNode: Node,
  history: ChatMessage[],
  message: string,
  graphData: GraphData,
  onChunk: (text: string) => void,
  apiPassword?: string
) => {
    const proxyKey = 'backend-proxy-key';
    const baseUrl = typeof window !== 'undefined' ? window.location.origin + '/api/gemini' : 'http://localhost:8080/api/gemini';
    const password = apiPassword || (typeof window !== 'undefined' ? sessionStorage.getItem('zcene_api_password') : null);
    const ai = new GoogleGenAI({ 
        apiKey: proxyKey,
        httpOptions: { 
            baseUrl,
            headers: {
                ...(password ? { 'x-zcene-password': password } : {})
            }
        }
    });
    
    const contextNodes = graphData.nodes.map(n => `"${n.id}" (${n.type})`).slice(0, 30).join(', ');
    
    // V10: Contextualize Chat with Node Snippet and Edge Contexts
    const nodeEdges = graphData.links.filter(l => 
      (typeof l.source === 'object' ? l.source.id : l.source) === currentNode.id ||
      (typeof l.target === 'object' ? l.target.id : l.target) === currentNode.id
    );
    const edgeContexts = nodeEdges.map(l => {
      const sId = typeof l.source === 'object' ? l.source.id : l.source;
      const tId = typeof l.target === 'object' ? l.target.id : l.target;
      const other = sId === currentNode.id ? tId : sId;
      return `${l.context || 'connected'} to ${other}`;
    }).filter(Boolean).join(', ');
    
    const narrativeSnippetText = (currentNode as any).narrativeSnippet ? `\n    Their defining narrative hook in this specific web is: "${(currentNode as any).narrativeSnippet}".` : '';
    const edgeContextText = edgeContexts ? `\n    They are connected to the following artists in this specific context: [${edgeContexts}].` : '';

    const systemInstruction = `You are Zcene, a world-class music curator and edgy historian. 
    Your tone is atmospheric, precise, and empowering. You are an expert-friend to the user.
    
    System Context: You are discussing "${currentNode.id}" (${currentNode.type}).${narrativeSnippetText}${edgeContextText}
    Base your answers firmly on this reality.

    The user's current Zcene map includes: [${contextNodes}].
    
    STRICT CHAT OUTPUT RULES:
    1. WORD LIMIT: Max 50 words per response. Be exceptionally concise.
    2. STRUCTURE: Use only ONE short paragraph.
    3. LANGUAGE: Use US English (e.g., 'analyzing', 'color').
    4. NO MARKDOWN: Output ONLY plain text sentences.
    5. NO SYMBOLS: Strictly NO bolding (**), no italics (*), no hashes (#), no dashes (-).
    6. NO OPENERS: Do not say "Hi," "Sure," or "I can explain that." Start with the insight.
    7. FOCUS: Explain the specific musical link or stylistic pivot.`;

    const contents = [
        ...history.map(m => ({
            role: m.role === 'user' ? 'user' : 'model',
            parts: [{ text: m.text }]
        })),
        { role: 'user', parts: [{ text: message }] }
    ];

    const result = await ai.models.generateContentStream({
        model: "gemini-3-flash-preview",
        contents,
        config: { systemInstruction }
    });

    let fullText = "";
    for await (const chunk of result) {
        const text = chunk.text;
        if (text) {
            const cleaned = text.replace(/[*#]/g, '');
            fullText += cleaned;
            onChunk(fullText);
        }
    }
    return fullText;
};

