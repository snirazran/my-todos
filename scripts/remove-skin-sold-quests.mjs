// Strips the retired `skin_sold` objective from everything that still carries
// it, so no user is left holding an objective that can never be completed now
// that selling is gone:
//   quest_templates  - the Explorer onboarding template's "sell-skin" block
//   quest_recipes    - the daily roll pool entry
//   quests           - unclaimed rolled quests, with target/progress recomputed
//   questCounters    - stored skin_sold counts
//
// Always backs up every matching document to a JSON file before writing.
// Claimed quests are left untouched: they are finished, so nobody is stuck.
//
// Dry run:  node --env-file=.env.local scripts/remove-skin-sold-quests.mjs
// Apply:    node --env-file=.env.local scripts/remove-skin-sold-quests.mjs --fix

import fs from 'node:fs/promises';
import path from 'node:path';
import mongoose from 'mongoose';
import dns from 'node:dns/promises';

const METRIC = 'skin_sold';

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

const hasMetric = (block) => block?.metricKey === METRIC;

async function main() {
  // Matches src/lib/mongoose.ts — the URI carries no database, so without this
  // the script silently operates on "test".
  await mongoose.connect(MONGODB_URI, { dbName: 'todoTracker' });
  const db = mongoose.connection.db;
  console.log(`database: ${db.databaseName}\n`);

  const templates = db.collection('quest_templates');
  const recipes = db.collection('quest_recipes');
  const quests = db.collection('quests');
  const counters = db.collection('questCounters');

  const templateDocs = (await templates.find({}).toArray()).filter((doc) =>
    (doc.logic ?? []).some(hasMetric),
  );
  const recipeDocs = (await recipes.find({}).toArray()).filter((doc) =>
    (doc.slots ?? []).some((slot) => (slot.pool ?? []).some(hasMetric)),
  );
  const questDocs = (
    await quests.find({ claimedAt: null }).toArray()
  ).filter((doc) => (doc.logic ?? []).some(hasMetric));
  const counterCount = await counters.countDocuments({ metric: METRIC });

  console.log(`quest_templates with a ${METRIC} objective: ${templateDocs.length}`);
  for (const doc of templateDocs) {
    console.log(`  templateId=${doc.templateId} placement=${doc.placement} blocks=${doc.logic.length}`);
  }
  console.log(`quest_recipes with a ${METRIC} pool entry: ${recipeDocs.length}`);
  for (const doc of recipeDocs) {
    console.log(`  recipeId=${doc.recipeId} slots=${doc.slots.length}`);
  }
  console.log(`unclaimed quests with a ${METRIC} objective: ${questDocs.length}`);
  console.log(`questCounters rows for ${METRIC}: ${counterCount}`);

  if (
    templateDocs.length === 0 &&
    recipeDocs.length === 0 &&
    questDocs.length === 0 &&
    counterCount === 0
  ) {
    console.log('\nNothing to change.');
    await mongoose.disconnect();
    return;
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(backupDir, `skin-sold-backup-${stamp}.json`);
  await fs.writeFile(
    backupPath,
    JSON.stringify(
      {
        quest_templates: templateDocs,
        quest_recipes: recipeDocs,
        quests: questDocs,
        questCounters: await counters.find({ metric: METRIC }).toArray(),
      },
      null,
      2,
    ),
    'utf8',
  );
  console.log(`\nBacked up matching documents to:\n  ${backupPath}`);

  if (!apply) {
    console.log('\nDry run. Re-run with --fix to write.');
    await mongoose.disconnect();
    return;
  }

  for (const doc of templateDocs) {
    await templates.updateOne(
      { _id: doc._id },
      { $set: { logic: doc.logic.filter((block) => !hasMetric(block)) } },
    );
  }
  console.log(`\nUpdated ${templateDocs.length} quest template(s).`);

  for (const doc of recipeDocs) {
    const slots = doc.slots.map((slot) => ({
      ...slot,
      pool: (slot.pool ?? []).filter((entry) => !hasMetric(entry)),
    }));
    await recipes.updateOne({ _id: doc._id }, { $set: { slots } });
  }
  console.log(`Updated ${recipeDocs.length} quest recipe(s).`);

  for (const doc of questDocs) {
    const removedIds = new Set(
      doc.logic.filter(hasMetric).map((block) => block.id),
    );
    const logic = doc.logic.filter((block) => !hasMetric(block));
    const target = logic.reduce((sum, block) => sum + (block.target ?? 0), 0);
    const progress = logic.reduce(
      (sum, block) => sum + Math.min(block.progress ?? 0, block.target ?? 0),
      0,
    );
    const completed = target > 0 && progress >= target;
    await quests.updateOne(
      { _id: doc._id },
      {
        $set: {
          logic,
          target,
          progress,
          completedAt: completed ? (doc.completedAt ?? new Date()) : null,
          claimedObjectiveIds: (doc.claimedObjectiveIds ?? []).filter(
            (id) => !removedIds.has(id),
          ),
        },
      },
    );
  }
  console.log(`Updated ${questDocs.length} rolled quest(s).`);

  const deleted = await counters.deleteMany({ metric: METRIC });
  console.log(`Deleted ${deleted.deletedCount} quest counter row(s).`);

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
