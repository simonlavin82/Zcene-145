const { scrapeImageUrlBackend } = require('../functions/lib/services/curatorService.js');

async function run() {
  console.log('Testing Wu-Tang Clan with "East Coast Hip Hop"');
  let result = await scrapeImageUrlBackend('Wu-Tang Clan', 'artist', 'East Coast Hip Hop', 'Summary');
  console.log('Result:', result);

  console.log('\nTesting Wu-Tang Clan with "" (empty genre) but valid summary');
  result = await scrapeImageUrlBackend('Wu-Tang Clan', 'artist', '', 'They are a legendary hip hop group from Staten Island');
  console.log('Result:', result);

  console.log('\nTesting Jay Z with "Hip Hop"');
  result = await scrapeImageUrlBackend('Jay Z', 'artist', 'Hip Hop', 'Summary');
  console.log('Result:', result);
  
  console.log('\nTesting Jay-Z with "Hip Hop"');
  result = await scrapeImageUrlBackend('Jay-Z', 'artist', 'Hip Hop', 'Summary');
  console.log('Result:', result);
}

run();
