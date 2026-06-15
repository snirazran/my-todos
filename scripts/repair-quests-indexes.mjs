// Diagnose (and optionally repair) slow quests queries.
//
// Symptom: GET /api/quests hangs for minutes but eventually returns correct
// data. Root cause is usually that the `quests` collection accumulated
// duplicate docs (from concurrent syncQuestState inserts), which makes the
// unique indexes fail to build under Mongoose autoIndex. Without those indexes,
// `find({ userId })` falls back to a full collection scan.
//
// This script:
//   1. Prints collection sizes + current indexes for `tasks` and `quests`.
//   2. Runs explain() on the two hot queries and flags COLLSCANs.
//   3. Detects duplicate quest docs for both unique key combos.
//   With --fix it then:
//   4. Deletes duplicates (keeping the most recently updated doc per key).
//   5. Builds the indexes the schemas declare.
//
// Dry run (safe, read-only):
//   node --env-file=.env.local scripts/repair-quests-indexes.mjs
// Apply the repair:
//   node --env-file=.env.local scripts/repair-quests-indexes.mjs --fix

import mongoose from 'mongoose';
import dns from 'node:dns/promises';

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('Missing MONGODB_URI environment variable.');
  process.exit(1);
}

// Match src/lib/mongoose.ts: some networks can't resolve the mongodb+srv SRV
// record via the system resolver, so force Cloudflare's.
dns.setServers(['1.1.1.1']);

const APPLY = process.argv.includes('--fix');

// Unique key combos that must be free of duplicates for the unique indexes to
// build. Keep the newest doc (updatedAt, then createdAt, then _id) per group.
const UNIQUE_KEYS = [
  ['userId', 'templateId', 'windowKey'],
  ['userId', 'questId'],
];

// Indexes the Quest/Task schemas declare (kept in sync with the models).
const QUEST_INDEXES = [
  { key: { userId: 1 } },
  { key: { questId: 1 } },
  { key: { templateId: 1 } },
  { key: { rollKey: 1 } },
  { key: { windowKey: 1 } },
  { key: { expiresAt: 1 } },
  { key: { userId: 1, placement: 1, windowKey: 1 } },
  { key: { userId: 1, templateId: 1, windowKey: 1 }, unique: true },
  { key: { userId: 1, questId: 1 }, unique: true },
];
const TASK_INDEXES = [
  { key: { userId: 1 } },
  { key: { userId: 1, id: 1 } },
  { key: { userId: 1, type: 1, date: 1, order: 1 } },
  { key: { userId: 1, type: 1, dayOfWeek: 1, order: 1 } },
  { key: { userId: 1, type: 1, weekStart: 1, order: 1 } },
];

function planStages(plan, out = []) {
  if (!plan) return out;
  out.push(plan.stage);
  if (plan.inputStage) planStages(plan.inputStage, out);
  (plan.inputStages ?? []).forEach((s) => planStages(s, out));
  return out;
}

async function explainQuery(coll, filter, label) {
  const res = await coll.find(filter).explain('executionStats');
  const stages = planStages(res.queryPlanner?.winningPlan);
  const stats = res.executionStats ?? {};
  const scan = stages.includes('COLLSCAN');
  console.log(`\n  ${label}`);
  console.log(`    plan:            ${stages.join(' <- ') || '(unknown)'}`);
  console.log(`    docs examined:   ${stats.totalDocsExamined}`);
  console.log(`    keys examined:   ${stats.totalKeysExamined}`);
  console.log(`    returned:        ${stats.nReturned}`);
  console.log(`    time (ms):       ${stats.executionTimeMillis}`);
  if (scan) {
    console.log('    >> COLLSCAN — this query is NOT using an index.');
  }
  return scan;
}

async function findDuplicateGroups(coll, keyFields) {
  const groupId = Object.fromEntries(keyFields.map((f) => [f, `$${f}`]));
  return coll
    .aggregate(
      [
        {
          $group: {
            _id: groupId,
            count: { $sum: 1 },
            docs: {
              $push: {
                _id: '$_id',
                updatedAt: '$updatedAt',
                createdAt: '$createdAt',
              },
            },
          },
        },
        { $match: { count: { $gt: 1 } } },
      ],
      { allowDiskUse: true },
    )
    .toArray();
}

function idsToDelete(group) {
  // Keep the freshest doc; delete the rest.
  const sorted = [...group.docs].sort((a, b) => {
    const au = +new Date(a.updatedAt ?? a.createdAt ?? 0);
    const bu = +new Date(b.updatedAt ?? b.createdAt ?? 0);
    if (au !== bu) return bu - au;
    return String(b._id).localeCompare(String(a._id));
  });
  return sorted.slice(1).map((d) => d._id);
}

async function main() {
  await mongoose.connect(MONGODB_URI, { dbName: 'todoTracker' });
  const db = mongoose.connection.db;
  const quests = db.collection('quests');
  const tasks = db.collection('tasks');

  console.log(`Mode: ${APPLY ? 'FIX (will modify data)' : 'DRY RUN (read-only)'}`);

  // 1. Sizes + current indexes
  const [questCount, taskCount] = await Promise.all([
    quests.estimatedDocumentCount(),
    tasks.estimatedDocumentCount(),
  ]);
  console.log(`\nCollections:`);
  console.log(`  quests: ${questCount} docs`);
  console.log(`  tasks:  ${taskCount} docs`);

  const questIdx = await quests.indexes();
  const taskIdx = await tasks.indexes();
  console.log(`\nExisting quests indexes: ${questIdx.map((i) => i.name).join(', ')}`);
  console.log(`Existing tasks indexes:  ${taskIdx.map((i) => i.name).join(', ')}`);

  const hasUniqueQuestId = questIdx.some((i) => i.name === 'userId_1_questId_1');
  const hasUniqueTemplate = questIdx.some(
    (i) => i.name === 'userId_1_templateId_1_windowKey_1',
  );
  if (!hasUniqueQuestId || !hasUniqueTemplate) {
    console.log(
      '\n  >> One or both unique quest indexes are MISSING — consistent with a failed autoIndex build.',
    );
  }

  // 2. explain() on the hot queries, using the user with the most quest docs.
  const topUser = await quests
    .aggregate([{ $group: { _id: '$userId', n: { $sum: 1 } } }, { $sort: { n: -1 } }, { $limit: 1 }])
    .toArray();
  const sampleUserId = topUser[0]?._id;
  console.log(
    `\nExplain (sample userId = ${sampleUserId ?? 'n/a'}, ${topUser[0]?.n ?? 0} quest docs):`,
  );
  if (sampleUserId) {
    await explainQuery(quests, { userId: sampleUserId }, 'quests.find({ userId })');
    await explainQuery(
      tasks,
      { userId: sampleUserId, deletedAt: { $exists: false } },
      'tasks.find({ userId, deletedAt:{$exists:false} })',
    );
  }

  // 3. Duplicate detection
  console.log('\nDuplicate quest docs by unique key:');
  const toDelete = new Set();
  for (const keyFields of UNIQUE_KEYS) {
    const groups = await findDuplicateGroups(quests, keyFields);
    const extra = groups.reduce((sum, g) => sum + (g.count - 1), 0);
    console.log(
      `  { ${keyFields.join(', ')} }: ${groups.length} duplicated key(s), ${extra} extra doc(s)`,
    );
    for (const g of groups) idsToDelete(g).forEach((id) => toDelete.add(String(id)));
  }
  console.log(`  -> ${toDelete.size} unique doc(s) would be removed.`);

  if (!APPLY) {
    console.log('\nDry run complete. Re-run with --fix to remove duplicates and build indexes.');
    await mongoose.disconnect();
    return;
  }

  // 4. Delete duplicates (re-resolve ids from ObjectId values)
  if (toDelete.size > 0) {
    const ids = [];
    for (const keyFields of UNIQUE_KEYS) {
      const groups = await findDuplicateGroups(quests, keyFields);
      for (const g of groups) idsToDelete(g).forEach((id) => ids.push(id));
    }
    const res = await quests.deleteMany({ _id: { $in: ids } });
    console.log(`\nDeleted ${res.deletedCount} duplicate quest doc(s).`);
  } else {
    console.log('\nNo duplicates to delete.');
  }

  // 5. Build indexes
  console.log('\nBuilding indexes...');
  for (const spec of QUEST_INDEXES) {
    await quests.createIndex(spec.key, spec.unique ? { unique: true } : {});
  }
  for (const spec of TASK_INDEXES) {
    await tasks.createIndex(spec.key);
  }
  console.log('Indexes built.');

  console.log('\nVerifying query plans after repair:');
  if (sampleUserId) {
    await explainQuery(quests, { userId: sampleUserId }, 'quests.find({ userId })');
    await explainQuery(
      tasks,
      { userId: sampleUserId, deletedAt: { $exists: false } },
      'tasks.find({ userId, deletedAt:{$exists:false} })',
    );
  }

  await mongoose.disconnect();
  console.log('\nDone.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
