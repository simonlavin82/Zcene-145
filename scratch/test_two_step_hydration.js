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

async function runTest() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('GEMINI_API_KEY environment variable is not set.');
    process.exit(1);
  }

  const ai = new GoogleGenAI({ apiKey });
  const artistName = 'Gel';
  const nodeType = 'artist';
  const seedArtists = 'Spaced';
  const contextNodes = 'Scowl, End It, Turnstile';

  console.log('\n================================================================');
  console.log(' TWO-STEP HYDRATION PIPELINE TEST — GEL');
  console.log('================================================================\n');

  console.log('--- STEP 1: Fetching Text Context ---');
  let prompt1 = FETCH_NODE_DETAILS_PROMPT_TEMPLATE
    .replace('{{nodeIdentifier}}', artistName)
    .replace('{{nodeType}}', nodeType)
    .replace('{{seedArtists}}', seedArtists)
    .replace('{{contextNodes}}', contextNodes)
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
      console.error(`❌ Failed to parse JSON from Step 1. Raw text length: ${rawText.length}`);
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

    const rawUrl = (response2.text || '').trim();
    if (rawUrl && rawUrl.toLowerCase() !== 'null') {
      console.log(`✅ Dedicated Image Scraper found URL for ${artistName}:`);
      console.log(`URL: ${rawUrl}`);
    } else {
      console.log(`❌ Dedicated Image Scraper returned null or empty.`);
    }
  } catch (err) {
    console.error(`❌ Step 2 API call failed:`, err.message);
  }
}

runTest();
