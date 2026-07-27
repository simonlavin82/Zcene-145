const assert = require('assert');
const path = require('path');

// Require the compiled curatorService from functions/lib/services/curatorService.js
const curatorServicePath = path.resolve(__dirname, '../functions/lib/services/curatorService.js');
const curatorService = require(curatorServicePath);
const { sanitizeImageUrl, NODE_DETAILS_SCHEMA, FETCH_NODE_DETAILS_PROMPT_TEMPLATE } = curatorService;

console.log('--- Starting Verification: Genre-Flexible Contextual Image Trust Rule ---');

// Test 1: Accept canonical Wikipedia Special:FilePath URL
const wikiUrl = 'https://en.wikipedia.org/wiki/Special:FilePath/Turnstile_live_2022.jpg';
assert.strictEqual(sanitizeImageUrl(wikiUrl), wikiUrl, 'Failed: Should accept valid Wikipedia FilePath URL');
console.log('✔ Passed: Accepts canonical Wikipedia Special:FilePath URL');

// Test 2: Accept Bandcamp CDN image URL (punk / indie genre trust)
const bandcampUrl = 'https://f4.bcbits.com/img/a123456789_10.jpg';
assert.strictEqual(sanitizeImageUrl(bandcampUrl), bandcampUrl, 'Failed: Should accept Bandcamp CDN URL');
console.log('✔ Passed: Accepts Bandcamp CDN image URL');

// Test 3: Accept Discogs CDN image URL
const discogsUrl = 'https://i.discogs.com/abc-123/image.jpeg';
assert.strictEqual(sanitizeImageUrl(discogsUrl), discogsUrl, 'Failed: Should accept Discogs CDN URL');
console.log('✔ Passed: Accepts Discogs CDN image URL');

// Test 4: Accept Spotify CDN image URL
const spotifyUrl = 'https://i.scdn.co/image/ab6761610000e5eb123456789';
assert.strictEqual(sanitizeImageUrl(spotifyUrl), spotifyUrl, 'Failed: Should accept Spotify CDN URL');
console.log('✔ Passed: Accepts Spotify CDN image URL');

// Test 5: Reject template placeholders and invalid strings
assert.strictEqual(sanitizeImageUrl('https://en.wikipedia.org/wiki/Special:FilePath/...'), undefined, 'Failed: Should reject URL ending in ...');
assert.strictEqual(sanitizeImageUrl('https://example.com/image.jpg'), undefined, 'Failed: Should reject example.com placeholder');
assert.strictEqual(sanitizeImageUrl('path/to/image.jpg'), undefined, 'Failed: Should reject relative path/to/ placeholder');
assert.strictEqual(sanitizeImageUrl('https://en.wikipedia.org/wiki/Special:FilePath/'), undefined, 'Failed: Should reject bare Special:FilePath/ root');
console.log('✔ Passed: Rejects all template placeholders and invalid URL strings');

// Test 6: Strip search citations and trailing punctuation from valid URLs
const dirtyUrl = 'https://f4.bcbits.com/img/test.jpg[1](2).;!';
assert.strictEqual(sanitizeImageUrl(dirtyUrl), 'https://f4.bcbits.com/img/test.jpg', 'Failed: Should clean citations and trailing punctuation');
console.log('✔ Passed: Cleanly strips search citations ([1], (2)) and trailing punctuation');

// Test 7: Verify Prompt and Schema contain Dynamic Genre Context and Contextual Image Trust Rule
assert.ok(FETCH_NODE_DETAILS_PROMPT_TEMPLATE.includes('dynamically adapt your search strategy'), 'Prompt missing dynamic genre search instruction');
assert.ok(FETCH_NODE_DETAILS_PROMPT_TEMPLATE.includes('Contextual Image Trust Rule'), 'Prompt missing Contextual Image Trust Rule');
assert.ok(NODE_DETAILS_SCHEMA.properties.imageUrl.description.includes('Contextual Image Trust Rule'), 'Schema imageUrl description missing Contextual Image Trust Rule');
console.log('✔ Passed: Prompts and Schemas enforce Dynamic Genre Context and Contextual Image Trust Rule');

console.log('--- ALL 7 VERIFICATION TESTS PASSED SUCCESSFULLY! ---');
