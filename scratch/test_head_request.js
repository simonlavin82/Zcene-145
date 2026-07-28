import fetch from 'node-fetch'; // if needed, but native fetch exists in Node 18+
import { GoogleGenAI } from '@google/genai';
import fs from 'fs';

const fileContent = fs.readFileSync('functions/src/services/curatorService.ts', 'utf8');

const imageScraperMatch = fileContent.match(/export const scrapeImageUrlBackend[\s\S]*?const prompt = `([\s\S]*?)`;/);
if (!imageScraperMatch) throw new Error("Could not find image scraper prompt");
const SCRAPE_IMAGE_URL_PROMPT = imageScraperMatch[1];

async function runTest() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('API key not set.');
    process.exit(1);
  }

  const ai = new GoogleGenAI({ apiKey });
  const artistName = 'Drug Church';
  const nodeType = 'artist';
  const genre = 'Post-Hardcore, Alternative Rock';
  const summary = 'Drug Church is an American post-hardcore band formed in Albany, New York, in 2011. Known for their aggressive yet melodic sound.';

  console.log('\n================================================================');
  console.log(' HTTP VALIDATION DIAGNOSTIC TEST — DRUG CHURCH');
  console.log('================================================================\n');

  let prompt = SCRAPE_IMAGE_URL_PROMPT
    .replace(/\$\{type\}/g, nodeType)
    .replace(/\$\{artistName\}/g, artistName)
    .replace(/\$\{genre\}/g, genre)
    .replace(/\$\{summary\}/g, summary);

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        maxOutputTokens: 200,
      }
    });

    const text = response.text?.trim() || '';
    if (text.toLowerCase().includes('null') && !text.includes('http')) {
      console.log('❌ LLM returned null or no valid URL.');
      return;
    }
    
    // Extract the first HTTPS URL from the response
    const urlMatch = text.match(/https:\/\/[^\s"'<>()\[\]]+/i);
    console.log('RAW LLM TEXT:', text); if (urlMatch) {
      const extractedUrl = urlMatch[0];
      console.log(`🔍 LLM generated URL: ${extractedUrl}`);
      console.log(`⏱️  Pinging URL with HTTP HEAD request...`);
      
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        const imgRes = await fetch(extractedUrl, { method: 'HEAD', signal: controller.signal });
        clearTimeout(timeoutId);
        
        if (imgRes.ok) {
          console.log(`✅ SUCCESS! URL returned status ${imgRes.status}. Validation passed.`);
        } else {
          console.log(`❌ FAILURE! URL returned status ${imgRes.status}. Link is broken or protected.`);
        }
      } catch (fetchErr) {
        console.log(`❌ FAILURE! HTTP Request aborted or failed: ${fetchErr.message}`);
      }
    } else {
      console.log('❌ No URL found in LLM response.');
    }
  } catch (err) {
    console.error('❌ Step 2 API call failed:');
  }
}

runTest();
