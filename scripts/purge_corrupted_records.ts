import * as admin from 'firebase-admin';
import * as path from 'path';

// This script expects a service account key at the root of the project
// Make sure to download your service account key and place it at the specified path
const serviceAccountPath = path.resolve(__dirname, '../service-account-key.json');

try {
  const serviceAccount = require(serviceAccountPath);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
} catch (e) {
  console.error("Failed to load service-account-key.json. Please make sure it exists at the root of the project.");
  process.exit(1);
}

const db = admin.firestore();

async function purgeCorruptedRecord(canonicalId: string, baseId: string) {
  try {
    console.log(`Attempting to delete corrupted record: ${canonicalId}`);
    
    const docRef = db.collection('artists').doc(canonicalId);
    const docSnap = await docRef.get();
    
    if (docSnap.exists) {
      await docRef.delete();
      console.log(`✅ Successfully deleted ${canonicalId}`);
    } else {
      console.log(`ℹ️ Record ${canonicalId} not found.`);
    }

    // Check if the bare pointer (e.g. 'radiohead') redirects to the corrupted record
    console.log(`Checking bare pointer record: ${baseId}`);
    const bareRef = db.collection('artists').doc(baseId);
    const bareSnap = await bareRef.get();
    
    if (bareSnap.exists) {
      const bareData = bareSnap.data();
      if (bareData && bareData.redirectTo === canonicalId) {
        // We can either delete it or remove the redirectTo field
        console.log(`⚠️ Bare pointer ${baseId} redirects to corrupted record. Updating...`);
        await bareRef.update({
          redirectTo: admin.firestore.FieldValue.delete()
        });
        console.log(`✅ Removed redirectTo from ${baseId}`);
      } else {
        console.log(`ℹ️ Bare pointer ${baseId} is fine or redirects elsewhere.`);
      }
    }
  } catch (error) {
    console.error("Error purging records:", error);
  }
}

// Execute purge
purgeCorruptedRecord('radiohead-united-states', 'radiohead')
  .then(() => {
    console.log('Purge script finished.');
    process.exit(0);
  });
