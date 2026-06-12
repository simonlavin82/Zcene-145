import fs from 'fs';
import { GoogleGenAI } from '@google/genai';

// Manually parse .env to get GEMINI_API_KEY
try {
  const envContent = fs.readFileSync('.env', 'utf8');
  const match = envContent.match(/^GEMINI_API_KEY\s*=\s*([^\r\n#\s]+)/m);
  const apiKey = match ? match[1].trim() : null;

  if (!apiKey) {
    console.error("Error: Could not find GEMINI_API_KEY in your .env file.");
    process.exit(1);
  }

  // Visual warning if the key is still the default placeholder key
  if (apiKey.includes('AIzaSyDHxzVXoMMxxRM9CCCZRH4jyENfKAUWXqU')) {
    console.warn("Warning: You are still using the placeholder API key. Please update it in .env first.");
  }

  console.log("Initializing Gemini API Handshake...");
  console.log(`Using API key: ${apiKey.substring(0, 6)}...${apiKey.substring(apiKey.length - 4)}`);

  const ai = new GoogleGenAI({ apiKey });

  console.log("Sending a test prompt to gemini-2.5-flash...");
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: 'Hello! Please respond with exactly: "Handshake successful! Gemini API is working properly."',
  });

  console.log("\n--- Handshake Response ---");
  console.log(response.text?.trim());
  console.log("--------------------------\n");

} catch (error) {
  console.error("\n--- Handshake Failed ---");
  console.error(error);
  console.error("------------------------\n");
  process.exit(1);
}
