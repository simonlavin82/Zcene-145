const { GoogleGenAI } = require('@google/genai');

async function main() {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const response = await ai.models.generateContent({
    model: 'gemini-3.5-flash',
    contents: 'Say hello!',
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          message: { type: "STRING" }
        }
      }
    }
  });
  console.log("Usage Metadata:", JSON.stringify(response.usageMetadata, null, 2));
  console.log("Response:", response.text);
}

main().catch(console.error);
