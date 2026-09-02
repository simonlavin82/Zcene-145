import { db } from '../firebase.js'; // Adjust path if needed
import { getArtistDocWithRedirect } from '../services/artistCacheService.js';

async function main() {
  try {
    const snap = await getArtistDocWithRedirect('b-fachada');
    if (snap.exists()) {
      const data = snap.data();
      console.log(JSON.stringify(data, null, 2));
    } else {
      console.log('Doc not found');
    }
  } catch (e) {
    console.error(e);
  }
}

main();
