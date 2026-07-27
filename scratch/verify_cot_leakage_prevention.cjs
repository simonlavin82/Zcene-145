const assert = require('assert');

// Ported functions for standalone verification
const extractCleanJsonString = (rawText) => {
  if (!rawText || typeof rawText !== 'string') return "";
  let text = rawText.trim();
  if (!text) return "";

  const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (match && match[1]) {
    text = match[1].trim();
  } else {
    text = text.replace(/^```(?:json)?\n?/i, '').replace(/```$/i, '').trim();
  }

  const startIdx = text.search(/[{[]/);
  if (startIdx === -1) return text;
  text = text.substring(startIdx);

  let stack = [];
  let inString = false;
  let escaped = false;
  let endIdx = -1;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (char === '{' || char === '[') {
        stack.push(char);
      } else if (char === '}' || char === ']') {
        if (stack.length > 0) {
          const last = stack[stack.length - 1];
          if ((char === '}' && last === '{') || (char === ']' && last === '[')) {
            stack.pop();
            if (stack.length === 0) {
              endIdx = i;
              break;
            }
          }
        }
      }
    }
  }

  if (endIdx !== -1) {
    text = text.substring(0, endIdx + 1);
  }

  return text.trim();
};

const sanitizeBioText = (rawText) => {
  if (!rawText || typeof rawText !== 'string') return '';
  let text = rawText.trim();
  const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (match && match[1]) {
    text = match[1].trim();
  } else {
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  }
  if (text.startsWith('{') || text.startsWith('[')) {
    const summaryMatch = text.match(/["'](?:summary|bio|description|text)["']\s*:\s*["']([\s\S]*?)["']\s*(?:,\s*["']|\}|$)/i);
    if (summaryMatch && summaryMatch[1]) {
      text = summaryMatch[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\').trim();
    }
  }
  let prevText;
  do {
    prevText = text;
    text = text.replace(/^(?:I have confirmed|I will manually check|I will check|I need to check|I need to get|To answer your request|For the YouTube video|Here is the JSON|Here are the details|Here is the information|Note: Some details|Based on the search)[^.\n]*[.\n]+\s*/ig, '').trim();
  } while (text !== prevText && text.length > 0);
  text = text.replace(/\\n\*/g, '\n• ').replace(/\\n-/g, '\n• ').replace(/\\n\n/g, '\n\n');
  text = text.replace(/\[\d+\]/g, '').replace(/\(\d+\)/g, '').trim();
  return text;
};

console.log("--- Starting CoT Leakage & JSON Wrapper Prevention Tests ---");

// Test 1: Spaced Mock - CoT Reasoning Preamble + JSON Codeblock + Trailing Citation
const mockSpacedResponse = `
I have confirmed the French Wikipedia page for "Spaced (groupe)" exists. I will manually check this page for an image and its Special:FilePath URL. For the YouTube video, multiple search results point to "SPACED on Audiotree Live".
\`\`\`json
{
  "summary": "Spaced is an American hardcore punk band from Buffalo, New York.",
  "details": {
    "artist": "Spaced",
    "genre": "Hardcore Punk",
    "origin": "Buffalo, NY",
    "founded": "2020",
    "notableArtists": []
  },
  "youtubeVideoId": "dQw4w9WgXcQ"
}
\`\`\`
Note: Verified via Audiotree Live [1].
`;

const cleanedSpaced = extractCleanJsonString(mockSpacedResponse);
console.log("Test 1 Cleaned Output:\n", cleanedSpaced);
const parsedSpaced = JSON.parse(cleanedSpaced);
assert.strictEqual(parsedSpaced.summary, "Spaced is an American hardcore punk band from Buffalo, New York.");
assert.strictEqual(parsedSpaced.youtubeVideoId, "dQw4w9WgXcQ");
console.log("✅ Test 1 Passed: Spaced CoT preamble stripped and valid JSON extracted!\n");

// Test 2: Turnstile Mock - Unparsed JSON Wrapper in Prose Fallback
const mockTurnstileResponse = `{ "summary": "Turnstile is a dynamic American rock band from Baltimore, Maryland, formed in 2010.", "details": { "genre": "Hardcore" } }`;
const rescuedTurnstileBio = sanitizeBioText(mockTurnstileResponse);
console.log("Test 2 Rescued Bio Output:\n", rescuedTurnstileBio);
assert.strictEqual(rescuedTurnstileBio, "Turnstile is a dynamic American rock band from Baltimore, Maryland, formed in 2010.");
console.log("✅ Test 2 Passed: Turnstile JSON syntax wrapper stripped, extracting clean bio!\n");

// Test 3: Anti-Leakage Guard - Rejecting Unparsed Wrapper in Prose Fallback
let threwGuardError = false;
try {
  const rawProse = sanitizeBioText(`{ "invalid": "json without summary key" }`);
  if (rawProse.startsWith('{') || rawProse.startsWith('[') || rawProse.includes('":') || rawProse.includes('": ')) {
    throw new Error("Invalid data format from details service (unparsed JSON wrapper).");
  }
} catch (e) {
  threwGuardError = true;
  console.log("Test 3 Threw Expected Guard Error:\n", e.message);
}
assert.strictEqual(threwGuardError, true);
console.log("✅ Test 3 Passed: Anti-Leakage Guard rejects unparsed JSON wrappers in prose fallback!\n");

// Test 4: Pure CoT Reasoning Rejection
const mockPureCoT = `I have confirmed that Turnstile is a band. I need to check Wikipedia for details. Here are the details for the band.`;
const cleanedPureCoT = sanitizeBioText(mockPureCoT);
console.log("Test 4 Cleaned Pure CoT Output:\n", cleanedPureCoT);
assert.strictEqual(cleanedPureCoT.length < 40, true, "Pure CoT string should be stripped below 40 chars threshold!");
console.log("✅ Test 4 Passed: Pure CoT reasoning stripped below prose fallback threshold!\n");

console.log("🎉 ALL TESTS PASSED! Defense-in-depth architecture verified.");
