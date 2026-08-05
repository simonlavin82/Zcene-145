import { readFileSync } from 'fs';
const envFile = readFileSync('.env', 'utf-8');
const env = {};
envFile.split('\n').forEach(line => {
  if (line.includes('=')) {
    const [key, val] = line.split('=');
    env[key.trim()] = val.trim();
  }
});
const apiKey = env.GEMINI_API_KEY;

const requestBody = {
  contents: [{ role: 'user', parts: [{ text: `List all distinct musical artists or bands named "Spaced". Return a JSON array of objects with fields: name (string), country (string, country of origin), genre (string, primary genre), activeYears (string, e.g. "1992–2004" or "2010–present").` }] }],
  systemInstruction: { parts: [{ text: `You are a music database disambiguation assistant.
Given an artist or band name, enumerate distinct musical acts that have used this exact name, across all countries, regions, and eras.
Return ONLY acts with genuinely distinct identities (do not list lineup variations).
If there is only one clear act, return exactly one entry.
If there are multiple acts (e.g. obscure local bands sharing the name), list them all up to a maximum of 5.
If you are unsure but know at least one act with this name, return it.
Respond in strict JSON only — no prose, no markdown, no citation markers.` }] },
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
    }
  }
};

fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(requestBody)
}).then(res => res.json()).then(data => console.log(JSON.stringify(data, null, 2))).catch(err => console.error(err));
