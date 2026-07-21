import { GoogleGenAI } from '@google/genai';

globalThis.fetch = async (url, options) => {
  console.log('--- NATIVE SDK Request ---');
  console.log('URL:', url);
  console.log('Body:', options.body);
  return { ok: true, status: 200, headers: new Headers({ 'content-type': 'application/json' }), json: async () => ({}) };
};

const ai = new GoogleGenAI({ apiKey: 'my-native-key' });
try { await ai.models.generateContent({ 
  model: 'gemini-2.5-flash', 
  contents: 'Hello',
  config: { tools: [{ googleSearch: {} }] }
}); } catch(e){}
