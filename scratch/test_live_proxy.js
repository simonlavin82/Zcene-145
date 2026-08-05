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

fetch(`https://zcene.online/api/gemini/v1beta/models/gemini-2.5-flash:generateContent`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-goog-api-key': 'backend-proxy-key' },
  body: JSON.stringify(requestBody)
}).then(async res => {
  console.log('Status:', res.status);
  const text = await res.text();
  console.log('Response:', text.substring(0, 500));
}).catch(err => console.error(err));
