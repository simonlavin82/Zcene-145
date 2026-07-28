'use strict';

import fs from 'fs';
import { GoogleGenAI } from '@google/genai';

const fileContent = fs.readFileSync('functions/src/services/curatorService.ts', 'utf8');

const promptMatch = fileContent.match(/export const FETCH_NODE_DETAILS_PROMPT_TEMPLATE = `([\s\S]*?)`;/);
if (!promptMatch) throw new Error("Could not find prompt template");
const FETCH_NODE_DETAILS_PROMPT_TEMPLATE = promptMatch[1];

const imageScraperMatch = fileContent.match(/export const scrapeImageUrlBackend[\s\S]*?const prompt = `([\s\S]*?)`;/);
if (!imageScraperMatch) throw new Error("Could not find image scraper prompt");
const SCRAPE_IMAGE_URL_PROMPT = imageScraperMatch[1];

async function runTest(artistName) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('GEMINI_API_KEY environment variable is not set.');
    process.exit(1);
  }

  const ai = new GoogleGenAI({ apiKey });
  const nodeType = 'artist';

  console.log(`\n================================================================`);
  console.log(` TWO-STEP HYDRATION PIPELINE TEST — ${artistName.toUpperCase()}`);
  console.log(`================================================================\n`);

  console.log('--- STEP 1: Fetching Text Context ---');
  let prompt1 = FETCH_NODE_DETAILS_PROMPT_TEMPLATE
    .replace('{{nodeIdentifier}}', artistName)
    .replace('{{nodeType}}', nodeType)
    .replace('{{seedArtists}}', 'Spaced')
    .replace('{{contextNodes}}', 'End It, Turnstile')
    .replace(/{{currentDate}}/g, 'July 28, 2026')
    .replace(/{{#if originHint}}[\s\S]*?{{\/if}}/g, '');

  let summary = "";
  let genre = "";

  try {
    const response1 = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt1,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });

    const rawText = (response1.text || '').trim();
    let parsed = null;
    try {
      const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
      parsed = JSON.parse(cleaned);
    } catch (parseErr) {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try { parsed = JSON.parse(jsonMatch[0]); } catch (e) {}
      }
    }

    if (parsed) {
      summary = parsed.summary || "";
      genre = parsed.details?.genre || "";
      console.log(`✅ Extracted Context for ${artistName}:`);
      console.log(`Genre: ${genre}`);
      console.log(`Bio Preview: ${summary.slice(0, 100)}...`);
    } else {
      console.error(`❌ Failed to parse JSON from Step 1.`);
      return;
    }
  } catch (err) {
    console.error(`❌ Step 1 API call failed:`, err.message);
    return;
  }

  console.log('\n--- STEP 2: Fetching Image URL using Dedicated Prompt ---');
  let prompt2 = SCRAPE_IMAGE_URL_PROMPT
    .replace(/\$\{type\}/g, nodeType)
    .replace(/\$\{artistName\}/g, artistName)
    .replace(/\$\{genre\}/g, genre)
    .replace(/\$\{summary\}/g, summary);

  try {
    const response2 = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt2,
      config: {
        tools: [{ googleSearch: {} }],
        maxOutputTokens: 200,
      },
    });

    const rawUrlText = (response2.text || '').trim();
    console.log(`LLM Raw Output:\n${rawUrlText}\n`);
    
    if (rawUrlText.toLowerCase().includes('null') && !rawUrlText.includes('http')) {
       console.log("❌ LLM explicitly returned null.");
       return;
    }

    const urlMatch = rawUrlText.match(/https:\/\/[^\s"'<>()\[\]]+/i);
    if (urlMatch) {
      const extractedUrl = urlMatch[0];
      console.log(`Regex Matched URL: ${extractedUrl}`);
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        const imgRes = await fetch(extractedUrl, { 
          method: 'HEAD', 
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
          },
          signal: controller.signal 
        });
        clearTimeout(timeoutId);
        
        if (imgRes.ok) {
          const contentType = imgRes.headers.get('content-type');
          if (contentType && contentType.startsWith('image/')) {
            console.log(`✅ Validated URL: ${extractedUrl} (Content-Type: ${contentType})`);
          } else {
            console.log(`❌ Invalid Content-Type: ${contentType}`);
          }
        } else {
          console.log(`❌ HTTP HEAD failed with status: ${imgRes.status}`);
        }
      } catch (err) {
         console.log(`❌ HTTP HEAD threw error: ${err.message}`);
      }
    } else {
      console.log(`❌ Regex failed to find a URL in output.`);
    }
  } catch (err) {
    console.error(`❌ Step 2 API call failed:`, err.message);
  }
}

async function runAll() {
  await runTest('Scowl');
  await runTest('Spaced');
}
runAll();
