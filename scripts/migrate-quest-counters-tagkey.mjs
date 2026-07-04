// One-time migration for the questCounters tag dimension.
//
// The unique index used to be {userId, metric, dateKey}; counters are now also
// split by tagKey (sorted tag ids of the source task) so focus quests can count
// only their own tags. This script drops the old unique index, backfills
// tagKey/tagIds on legacy rows, and builds the new unique index.
//
// Dry run:  node --env-file=.env.local scripts/migrate-quest-counters-tagkey.mjs
// Apply:    node --env-file=.env.local scripts/migrate-quest-counters-tagkey.mjs --fix

import mongoose from 'mongoose';
import dns from 'node:dns/promises';

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('Missing MONGODB_URI environment variable.');
  process.exit(1);
}

dns.setServers(['1.1.1.1']);
const APPLY = process.argv.includes('--fix');

await mongoose.connect(MONGODB_URI);
const coll = mongoose.connection.db.collection('questCounters');

const indexes = await coll.indexes();
console.log('Current indexes:');
for (const idx of indexes) {
  console.log(`  ${idx.name}: ${JSON.stringify(idx.key)}${idx.unique ? ' (unique)' : ''}`);
}

const legacy = indexes.find(
  (idx) =>
    idx.unique &&
    JSON.stringify(idx.key) === JSON.stringify({ userId: 1, metric: 1, dateKey: 1 }),
);
const missingTagKey = await coll.countDocuments({ tagKey: { $exists: false } });
console.log(`\nLegacy unique index present: ${legacy ? `yes (${legacy.name})` : 'no'}`);
console.log(`Rows without tagKey: ${missingTagKey}`);

if (!APPLY) {
  console.log('\nDry run only. Re-run with --fix to apply.');
  process.exit(0);
}

if (legacy) {
  await coll.dropIndex(legacy.name);
  console.log(`Dropped ${legacy.name}`);
}
if (missingTagKey > 0) {
  const res = await coll.updateMany(
    { tagKey: { $exists: false } },
    { $set: { tagKey: '', tagIds: [] } },
  );
  console.log(`Backfilled tagKey on ${res.modifiedCount} rows`);
}
await coll.createIndex(
  { userId: 1, metric: 1, dateKey: 1, tagKey: 1 },
  { unique: true },
);
console.log('Created unique index {userId, metric, dateKey, tagKey}');

await mongoose.disconnect();
console.log('Done.');
