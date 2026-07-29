import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const serviceAccountPath = path.resolve(__dirname, '../firebase-service-account.json');

let serviceAccount;
try {
  serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));
} catch (err) {
  console.error(`Failed to read service account key from ${serviceAccountPath}. Make sure the file exists.`);
  process.exit(1);
}

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();

async function clearCollections() {
  console.log('Starting database cleanup...');
  
  const artistsRef = db.collection('artists');
  const labelsRef = db.collection('labels');
  
  try {
    console.log('Deleting "artists" collection and any subcollections...');
    await db.recursiveDelete(artistsRef);
    console.log('Successfully deleted "artists" collection.');
    
    console.log('Deleting "labels" collection and any subcollections...');
    await db.recursiveDelete(labelsRef);
    console.log('Successfully deleted "labels" collection.');
    
    console.log('\nDatabase cleanup completed successfully. We have a fresh state for testing!');
    process.exit(0);
  } catch (error) {
    console.error('Error during database cleanup:', error);
    process.exit(1);
  }
}

clearCollections();
