import { cleanArtistDisplayName } from './services/artistCacheService';

console.log('Test 1 ("End It"):', cleanArtistDisplayName('End It'));
console.log('Test 2 ("end-it-us"):', cleanArtistDisplayName('end-it-us'));
console.log('Test 3 ("the-last-of-us"):', cleanArtistDisplayName('the-last-of-us'));
console.log('Test 4 ("The Last Of Us"):', cleanArtistDisplayName('The Last Of Us'));
console.log('Test 5 ("end-it"):', cleanArtistDisplayName('end-it'));
