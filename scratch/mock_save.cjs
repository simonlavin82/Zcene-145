const detailsCache = new Map();
detailsCache.set('spaced-us-usa', { imageUrl: 'url1' });

const primarySaveSeedNorm = 'spaced';
let saveImageDetails = null;

if (primarySaveSeedNorm) {
  saveImageDetails = detailsCache.get(primarySaveSeedNorm) || detailsCache.get('spaced');
  
  if (!saveImageDetails) {
    const fallbackKey = Array.from(detailsCache.keys()).find(k => k.startsWith(primarySaveSeedNorm + '-'));
    if (fallbackKey) {
      saveImageDetails = detailsCache.get(fallbackKey);
    }
  }
}

console.log("saveImageDetails:", saveImageDetails);
