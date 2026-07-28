const fs = require('fs');
const path = require('path');
const { GoogleGenAI } = require('@google/genai');

const envPath = path.join(__dirname, '../functions/.env');
if (fs.existsSync(envPath)) {
  const envFile = fs.readFileSync(envPath, 'utf8');
  envFile.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) process.env[match[1].trim()] = match[2].trim().replace(/^"|"$/g, '');
  });
}

async function runTest() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('API key not set.');
    process.exit(1);
  }

  const ai = new GoogleGenAI({ apiKey });
  
  const prompt = `Find a high-quality, direct HTTPS image URL representing the music artist: "Drug Church".
  
Context:
Genre: Post-Hardcore, Alternative Rock
Bio: Drug Church is an American post-hardcore band formed in Albany, New York, in 2011. Known for their aggressive yet melodic sound.

USE GOOGLE SEARCH to find a verified artist photo, album cover, or official logo. 

GENRE-CONTEXTUAL IMAGE SOURCING HIERARCHY (STRICTLY ENFORCED):
▸ Priority 1 — Official Bandcamp artist page: band photo, header banner, or release artwork.
▸ Priority 2 — Discogs artist page: press photo or release cover.
▸ Priority 3 — Wikimedia Commons: if a verified artist photo exists there.

CRITICAL OUTPUT REQUIREMENTS:
1. Provide the direct HTTPS image URL in your response.
2. If you cannot find ANY verified image from the priority sources above, state that no verified image was found.`;

  console.log('\n================================================================');
  console.log(' HTTP VALIDATION DIAGNOSTIC TEST — DRUG CHURCH');
  console.log('================================================================\n');

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: { tools: [{ googleSearch: {} }] }
    });

    const text = response.text?.trim() || '';
    const urlMatch = text.match(/https:\/\/[^\s"'<>()\[\]]+/i);
    
    if (urlMatch) {
      const extractedUrl = urlMatch[0];
      console.log(`🔍 LLM generated URL: ${extractedUrl}`);
      console.log(`⏱️  Pinging URL with HTTP HEAD request (including User-Agent)...`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      try {
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
          console.log(`✅ SUCCESS! URL returned status ${imgRes.status}. Validation passed.`);
        } else {
          console.log(`❌ FAILURE! URL returned status ${imgRes.status}. Link is broken or protected.`);
        }
      } catch (err) {
        console.log(`❌ FAILURE! Fetch aborted or failed: ${err.message}`);
      }
    } else {
      console.log('❌ No URL found in LLM response.\nRaw text:', text);
    }
  } catch (err) {
    console.error('API Error:', err);
  }
}

runTest();
