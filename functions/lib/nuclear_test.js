"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateSeedOriginBackend = void 0;
const genai_1 = require("@google/genai");
const validateSeedOriginBackend = async (artistId) => {
    try {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            throw new Error("GEMINI_API_KEY is not defined in environment secrets.");
        }
        const ai = new genai_1.GoogleGenAI({ apiKey, httpOptions: { timeout: 300000 } });
        const currentModel = "gemini-3.5-flash-lite"; // Phase 2: Origin Validation uses Flash-Lite
        const prompt = `Validate this seed artist: "${artistId}". Is this a real musical entity? Extract its canonical name, country of origin, and primary genre.`;
        const response = await ai.models.generateContent({
            model: currentModel,
            contents: prompt,
            config: {
                systemInstruction: "You are a music data validator. Return ONLY valid JSON matching the schema.",
                temperature: 0.1, // very low temperature for validation
                responseMimeType: "application/json",
            }
        });
        const jsonText = response.text;
        if (!jsonText) {
            throw new Error("Received empty response from Gemini for origin validation.");
        }
        const cleanedJsonText = jsonText.replace(/```json/g, "").replace(/```/g, "").trim();
        const data = JSON.parse(cleanedJsonText);
        return data;
    }
    catch (err) {
        console.error(`[validateSeedOriginBackend] Failed to validate seed ${artistId}:`, err);
        throw err;
    }
};
exports.validateSeedOriginBackend = validateSeedOriginBackend;
async function run() {
    console.log("Starting Nuclear Option Bypass Test...");
    console.log("GEMINI_API_KEY:", process.env.GEMINI_API_KEY ? "Loaded" : "Missing");
    try {
        const result = await (0, exports.validateSeedOriginBackend)("snapcase");
        console.log("\n✅ SUCCESS! Raw JSON Response:");
        console.log(JSON.stringify(result, null, 2));
    }
    catch (error) {
        console.error("\n❌ CRASH! Exact Error Trace:");
        console.error(error);
    }
}
run();
//# sourceMappingURL=nuclear_test.js.map