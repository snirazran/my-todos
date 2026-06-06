// One-off migration: removes discontinued onboarding answers from every user's
// `onboardingResponses`.
//   "Energy & Creativity": sleepDuration, wakeEase, dayActivity
//   "How's Life":          overwhelmedFrequency, supportCircle, routineHappiness
//
// Run with Node's built-in env loader (Node 20+):
//   node --env-file=.env.local scripts/remove-discontinued-onboarding-responses.mjs

import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('Missing MONGODB_URI environment variable.');
  process.exit(1);
}

const KEYS = [
  'sleepDuration',
  'wakeEase',
  'dayActivity',
  'overwhelmedFrequency',
  'supportCircle',
  'routineHappiness',
];

async function main() {
  await mongoose.connect(MONGODB_URI, { dbName: 'todoTracker' });
  const users = mongoose.connection.collection('users');

  const unset = Object.fromEntries(
    KEYS.map((key) => [`onboardingResponses.${key}`, '']),
  );
  const filter = {
    $or: KEYS.map((key) => ({ [`onboardingResponses.${key}`]: { $exists: true } })),
  };

  const matched = await users.countDocuments(filter);
  console.log(`Found ${matched} user(s) with discontinued onboarding responses.`);

  const result = await users.updateMany(filter, { $unset: unset });
  console.log(`Modified ${result.modifiedCount} user(s).`);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
