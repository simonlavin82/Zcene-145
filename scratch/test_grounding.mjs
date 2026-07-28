import { GoogleGenAI } from '@google/genai';

async function run() {
  const apiKey = process.env.GEMINI_API_KEY;
  const ai = new GoogleGenAI({ apiKey });
  
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: 'Find a photo of the hardcore band Scowl.',
    config: {
      tools: [{ googleSearch: {} }]
    }
  });

  console.log("Text:", response.text);
  console.log("Grounding Metadata:", JSON.stringify(response.candidates?.[0]?.groundingMetadata, null, 2));
}
run();
