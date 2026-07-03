// One-off: removes the retired Rive override system's remote data.
// Deletes the `riveAssets` Mongo collection and the `rive-assets/` +
// `rive-backups/` folders in Firebase Storage.
//
// Run AFTER deploying the static-only Rive code, never before — the old
// deployed code still reads these records.
//
//   node scripts/cleanup-rive-firebase.mjs            # dry run
//   node scripts/cleanup-rive-firebase.mjs --delete   # actually delete

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import admin from 'firebase-admin';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

for (const envFile of ['.env.local', '.env']) {
  try {
    for (const line of readFileSync(path.join(root, envFile), 'utf8').split('\n')) {
      const m = line.match(/^\s*([\w.]+)\s*=\s*(.*)\s*$/);
      if (m && process.env[m[1]] === undefined) {
        process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
      }
    }
  } catch {}
}

const DELETE = process.argv.includes('--delete');

function credential() {
  const {
    FIREBASE_SERVICE_ACCOUNT_JSON_BASE64,
    NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    FIREBASE_CLIENT_EMAIL,
    FIREBASE_PRIVATE_KEY,
  } = process.env;
  if (FIREBASE_SERVICE_ACCOUNT_JSON_BASE64) {
    return admin.credential.cert(
      JSON.parse(Buffer.from(FIREBASE_SERVICE_ACCOUNT_JSON_BASE64, 'base64').toString('utf8')),
    );
  }
  return admin.credential.cert({
    projectId: NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    clientEmail: FIREBASE_CLIENT_EMAIL,
    privateKey: FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  });
}

admin.initializeApp({
  credential: credential(),
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
});

const bucket = admin.storage().bucket();

for (const prefix of ['rive-assets/', 'rive-backups/']) {
  const [files] = await bucket.getFiles({ prefix });
  console.log(`${prefix}: ${files.length} file(s)`);
  for (const f of files) console.log(`  ${f.name}`);
  if (DELETE && files.length) {
    await Promise.all(files.map((f) => f.delete()));
    console.log(`  deleted`);
  }
}

await mongoose.connect(process.env.MONGODB_URI);
const collection = mongoose.connection.db.collection('riveAssets');
const count = await collection.countDocuments();
console.log(`riveAssets collection: ${count} record(s)`);
if (DELETE && count) {
  await collection.drop();
  console.log('  dropped');
}
await mongoose.disconnect();

if (!DELETE) console.log('\nDry run only. Re-run with --delete to remove.');
