// Removes the stored focus (non-daily) quest recipe so the current seed in
// src/lib/quests/recipeDefaults.ts is written on the next quest sync.
//
// Always backs up every matching document to a JSON file before deleting.
// Rolled quests are unaffected: their logic is frozen on the quest document.
//
// Dry run:  node --env-file=.env.local scripts/reset-focus-quest-recipe.mjs
// Apply:    node --env-file=.env.local scripts/reset-focus-quest-recipe.mjs --fix

import fs from 'node:fs/promises';
import path from 'node:path';
import mongoose from 'mongoose';
import dns from 'node:dns/promises';

// Which connection string to use. Defaults to the dev one; pass
// --env MONGODB_URI_PROD to act on production.
const uriVar = process.argv.includes('--env')
  ? process.argv[process.argv.indexOf('--env') + 1]
  : 'MONGODB_URI';
const MONGODB_URI = process.env[uriVar];
if (!MONGODB_URI) {
  console.error(`Missing ${uriVar} environment variable.`);
  process.exit(1);
}
console.log(`connection: ${uriVar}`);

dns.setServers(['1.1.1.1']);

const apply = process.argv.includes('--fix');
const backupDir = process.argv.includes('--backup-dir')
  ? process.argv[process.argv.indexOf('--backup-dir') + 1]
  : process.cwd();

async function main() {
  // Matches src/lib/mongoose.ts — the URI carries no database, so without this
  // the script silently operates on "test".
  await mongoose.connect(MONGODB_URI, { dbName: 'todoTracker' });
  console.log(`database: ${mongoose.connection.db.databaseName}\n`);
  const collection = mongoose.connection.db.collection('quest_recipes');

  const all = await collection.find({}).toArray();
  const targets = all.filter((doc) => (doc.placement ?? 'category') !== 'daily');

  console.log(`quest_recipes documents: ${all.length}`);
  for (const doc of all) {
    const isTarget = targets.some((t) => String(t._id) === String(doc._id));
    console.log(
      `  ${isTarget ? 'DELETE' : 'keep  '}  recipeId=${doc.recipeId}  placement=${
        doc.placement ?? 'category'
      }  name=${JSON.stringify(doc.name)}  slots=${doc.slots?.length ?? 0}  active=${doc.isActive}`,
    );
  }

  if (targets.length === 0) {
    console.log('\nNothing to delete.');
    await mongoose.disconnect();
    return;
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(
    backupDir,
    `quest-recipes-backup-${stamp}.json`,
  );
  await fs.writeFile(backupPath, JSON.stringify(targets, null, 2), 'utf8');
  console.log(`\nBacked up ${targets.length} document(s) to:\n  ${backupPath}`);

  if (!apply) {
    console.log('\nDry run. Re-run with --fix to delete.');
    await mongoose.disconnect();
    return;
  }

  const result = await collection.deleteMany({
    _id: { $in: targets.map((doc) => doc._id) },
  });
  console.log(`\nDeleted ${result.deletedCount} document(s).`);
  console.log(
    'The next quest sync reseeds the focus ladder from recipeDefaults.ts.',
  );
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
