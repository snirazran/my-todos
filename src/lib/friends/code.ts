import { randomInt } from 'crypto';
import UserModel from '@/lib/models/User';
import FriendshipModel, { type FriendshipSource } from '@/lib/models/Friendship';

const FRIEND_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateFriendCode(length = 10) {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += FRIEND_CODE_ALPHABET[randomInt(0, FRIEND_CODE_ALPHABET.length)];
  }
  return out;
}

export function normalizeFriendCode(code: string) {
  return code.trim().toUpperCase();
}

export async function ensureFriendCode(userId: string): Promise<string> {
  const existing = await UserModel.findById(userId).select('friendCode').lean();
  if (existing?.friendCode) return existing.friendCode;

  for (let i = 0; i < 8; i++) {
    const code = generateFriendCode();
    try {
      await UserModel.updateOne(
        { _id: userId, friendCode: { $exists: false } },
        { $set: { friendCode: code } },
      );
      const after = await UserModel.findById(userId).select('friendCode').lean();
      if (after?.friendCode) return after.friendCode;
    } catch {
      // Likely a unique-index collision — try another code.
    }
  }
  throw new Error('Could not allocate a friend code');
}

export function friendshipKey(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

export async function areFriends(a: string, b: string): Promise<boolean> {
  const [userA, userB] = friendshipKey(a, b);
  const doc = await FriendshipModel.exists({ userA, userB });
  return !!doc;
}

export async function createFriendship(
  a: string,
  b: string,
  source: FriendshipSource,
): Promise<void> {
  if (a === b) return;
  const [userA, userB] = friendshipKey(a, b);
  await FriendshipModel.updateOne(
    { userA, userB },
    { $setOnInsert: { userA, userB, source, createdAt: new Date() } },
    { upsert: true },
  );
}
