// One-off migration: marks every existing user as having completed onboarding
// so the new onboarding gate only catches accounts that still owe it.
// Funnel signups (`funnelGift` set) that never finished onboarding are left
// untouched on purpose — the gate routes them into onboarding on their next
// visit, which is the point of the gate.
//
// Run with Node's built-in env loader (Node 20+):
//   node --env-file=.env.local scripts/backfill-onboarding-completed.mjs [--dry-run]

import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('Missing MONGODB_URI environment variable.');
  process.exit(1);
}

const dryRun = process.argv.includes('--dry-run');

async function main() {
  await mongoose.connect(MONGODB_URI, { dbName: 'todoTracker' });
  const users = mongoose.connection.collection('users');

  const filter = {
    onboardingCompleted: { $ne: true },
    funnelGift: null,
  };

  const matched = await users.countDocuments(filter);
  const skipped = await users.countDocuments({
    onboardingCompleted: { $ne: true },
    funnelGift: { $ne: null },
  });
  console.log(`Found ${matched} user(s) to mark as onboarded.`);
  console.log(`Leaving ${skipped} funnel user(s) for the onboarding gate.`);

  if (dryRun) {
    console.log('Dry run — no changes written.');
  } else {
    const result = await users.updateMany(filter, {
      $set: { onboardingCompleted: true },
    });
    console.log(`Modified ${result.modifiedCount} user(s).`);
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
