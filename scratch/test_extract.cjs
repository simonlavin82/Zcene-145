const { extractArtistSubGraph, normalizeArtistId } = require('./functions/lib/services/curatorService.js');

const finalGraph = {
  nodes: [
    { id: 'spaced-us', label: 'Spaced', type: 'artist' },
    { id: 'scowl-us-usa', label: 'Scowl', type: 'artist' }
  ],
  links: [
    { source: 'spaced-us', target: 'scowl-us-usa' }
  ]
};

const extracted = extractArtistSubGraph('spaced-us', finalGraph, ['spaced-us']);
console.log(JSON.stringify(extracted, null, 2));
