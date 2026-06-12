import { GoogleGenAI } from '@google/genai';

globalThis.fetch = async (url, options) => {
  const headersObj = {};
  const headers = new Headers(options.headers);
  headers.forEach((value, key) => {
    headersObj[key] = value;
  });

  console.log('--- SDK Request Details ---');
  console.log('URL:', url);
  console.log('Headers:', JSON.stringify(headersObj, null, 2));
  return {
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => ({})
  };
};

const ai = new GoogleGenAI({
  apiKey: 'client-side-proxy-key',
  httpOptions: { baseUrl: 'http://localhost:3000/api/gemini' }
});

try {
  await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: 'Hello',
  });
} catch (e) {}
