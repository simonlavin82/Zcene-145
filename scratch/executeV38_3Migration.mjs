import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import fs from 'fs';
import path from 'path';

const serviceAccountPath = path.resolve('firebase-service-account.json');
if (!fs.existsSync(serviceAccountPath)) {
  console.error("Missing firebase-service-account.json");
  process.exit(1);
}

const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

const app = initializeApp({
  credential: cert(serviceAccount),
  projectId: serviceAccount.project_id || 'zcene-production',
});

const db = getFirestore(app);

async function runMigration() {
  const uid = 'K3QqtNRg48X7I3C0Zu2PVPzRBSH3';
  const email = 'simon.lavin1@gmail.com';
  const projectId = 'lysLGOD7AlpNn985YKng';
  const projectName = 'One Step Closer';
  const nodeId = 'one-step-closer-us';
  const nodeName = 'One Step Closer';

  console.log(`Starting V38.3 Migration for ${email} (${uid})...`);

  // 1. Migrate active One Step Closer session to project-wide pass
  const projectPassId = `${uid}_${projectId}_deepweb_pass`;
  const legacyNodeSessionId = `${uid}_${projectId}_${nodeId}`;

  const passRef = db.collection('deepWebSessions').doc(projectPassId);
  const legacyRef = db.collection('deepWebSessions').doc(legacyNodeSessionId);

  const expireAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await passRef.set({
    sessionId: projectPassId,
    uid,
    isAdmin: false,
    projectId,
    projectName,
    lastNodeId: nodeId,
    lastNodeName: nodeName,
    remainingMessages: 2,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    expireAt: Timestamp.fromDate(expireAt),
  });
  console.log(`✓ Created/Migrated project-wide pass: ${projectPassId} with remainingMessages: 2`);

  // Delete legacy node session doc if it exists
  const legacySnap = await legacyRef.get();
  if (legacySnap.exists) {
    await legacyRef.delete();
    console.log(`✓ Deleted legacy node session: ${legacyNodeSessionId}`);
  }

  // 2. Update refund receipt 0adXZbCt9dhcktmpWxYQ to 'refund_pipeline_error'
  const receiptRef = db.collection('users').doc(uid).collection('tokenTransactions').doc('0adXZbCt9dhcktmpWxYQ');
  const receiptSnap = await receiptRef.get();
  if (receiptSnap.exists) {
    await receiptRef.update({
      type: 'refund_pipeline_error',
      updatedAt: FieldValue.serverTimestamp(),
    });
    console.log(`✓ Updated refund receipt 0adXZbCt9dhcktmpWxYQ type to 'refund_pipeline_error'`);
  } else {
    console.warn(`! Receipt 0adXZbCt9dhcktmpWxYQ not found`);
  }

  // 3. Seed recent One Step Closer question into deepWebQueries
  const queriesRef = db.collection('users').doc(uid).collection('deepWebQueries');
  const seededQueryRef = queriesRef.doc();
  await seededQueryRef.set({
    id: seededQueryRef.id,
    uid,
    userEmail: email,
    projectId,
    projectName,
    nodeId,
    nodeName,
    question: "which artist would you say is the closest one to one step closer?",
    model: 'gemini-3.6-flash',
    promptTokens: 2350,
    candidatesTokens: 120,
    totalTokens: 2470,
    costUsd: 0.0057,
    timestamp: FieldValue.serverTimestamp(),
  });
  console.log(`✓ Seeded recent query into users/${uid}/deepWebQueries/${seededQueryRef.id}`);

  console.log('Migration complete!');
}

runMigration().catch(err => {
  console.error("Migration failed:", err);
  process.exit(1);
});
