import { GoogleGenAI } from "@google/genai";


const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
    console.error("No API key");
    process.exit(1);
}

const ai = new GoogleGenAI({ apiKey });

const FETCH_NODE_DETAILS_PROMPT_TEMPLATE = `
You are a meticulous music industry database curator ensuring high-fidelity entity profiles.
Analyze the following entity and provide a strict JSON response.
Do NOT include any surrounding prose or markdown formatting like \`\`\`json. Return only the JSON object.

Target Entity: {{nodeIdentifier}} ({{nodeType}})
Contextual Seeds: {{seedArtists}}
Graph Context: {{contextNodes}}
Current Date: {{currentDate}}

If the entity is a label/curator (nodeType: 'label'), omit discography, members, and tourInfo. Return:
{
  "summary": "Comprehensive professional biography. For artists, include their origin, genre, significant achievements, and musical style. Minimum 3 sentences.",
  "details": {
    "genre": "Primary genre(s)",
    "origin": "City, State, Country of origin",
    "founded": "Year founded (string)"
  },
  "recommendationReason": "A 1-2 sentence explanation of why this entity is culturally significant.",
  "youtubeSearchQuery": "A highly specific YouTube search query to find their most popular or representative music video."
}

If the entity is an artist/band (nodeType: 'artist'), you MUST provide:
{
  "summary": "Comprehensive professional biography...",
  "details": {
    "genre": "Primary genre(s)",
    "origin": "City, State, Country of origin",
    "founded": "Year formed (string)",
    "notableArtists": [] // Always empty array for artists
  },
  "discography": [
    { "albumName": "Name", "releaseYear": "YYYY" }
  ],
  "members": ["Member Name 1", "Member Name 2"],
  "tourInfo": "Current tour status or notable recent tours",
  "recommendationReason": "Why they matter...",
  "youtubeSearchQuery": "Highly specific query for official music video"
}
`;

async function testFetch() {
    const prompt = FETCH_NODE_DETAILS_PROMPT_TEMPLATE
        .replace('{{nodeIdentifier}}', 'Turnstile')
        .replace('{{nodeType}}', 'artist')
        .replace('{{seedArtists}}', 'Turnstile')
        .replace('{{contextNodes}}', '')
        .replace(/{{currentDate}}/g, new Date().toISOString());

    console.log("Fetching details for Turnstile...");
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                tools: [{ googleSearch: {} }],
                responseMimeType: 'application/json',
                temperature: 0.4
            }
        });
        
        console.log("--- RAW RESPONSE ---");
        console.log(response.text);
        
        console.log("--- TRY PARSE ---");
        try {
            JSON.parse(response.text);
            console.log("SUCCESS");
        } catch (e) {
            console.error("FAILED PARSE", e);
        }
    } catch (error) {
        console.error("API Error", error);
    }
}

testFetch();
