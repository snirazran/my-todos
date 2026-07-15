import connectMongo from '@/lib/mongoose';
import UserModel, { type UserDoc } from '@/lib/models/User';
import QuestMoveToWebConfigModel, {
  MOVE_TO_WEB_CONFIG_ID,
  type QuestMoveToWebConfigDoc,
} from '@/lib/models/QuestMoveToWebConfig';
import { WEB_APP_URL } from '@/lib/appStores';
import { recordDoubleableClaim } from '@/lib/rewards/adDouble';
import { isPremiumUser } from './engine';
import type { QuestReward } from './types';

export type MoveToWebState = {
  startedAt: string | null;
  claimedAt: string | null;
};

export type MoveToWebView = {
  complete: boolean;
  claimable: boolean;
  reward: QuestReward;
  webUrl: string;
};

export async function loadMoveToWebConfig() {
  return QuestMoveToWebConfigModel.findOne({
    configId: MOVE_TO_WEB_CONFIG_ID,
  }).lean<QuestMoveToWebConfigDoc | null>();
}

// The move-to-web quest owns the cross-platform reward for everyone it was
// started for, so the flat cross-gift must stand down for them — in BOTH
// directions, or they could bank the quest prize on web and the cross-gift
// later on their phone.
export function hasMoveToWebQuest(user: Pick<UserDoc, never>) {
  return !!(user as any)?.quests?.moveToWeb?.startedAt;
}

function readState(user: UserDoc): MoveToWebState {
  const raw = (user as any).quests?.moveToWeb;
  return {
    startedAt: raw?.startedAt ? String(raw.startedAt) : null,
    claimedAt: raw?.claimedAt ? String(raw.claimedAt) : null,
  };
}

async function writeState(userId: string, state: MoveToWebState) {
  await UserModel.updateOne(
    { _id: userId },
    { $set: { 'quests.moveToWeb': state } },
  );
}

// Shows for phone-first users who have never opened the web. The creation gate
// is evaluated once; after that the quest sticks around until it is claimed —
// otherwise it would vanish the moment the user reaches the web and the reward
// would never be claimable.
export async function syncMoveToWeb(args: {
  user: UserDoc;
  config: QuestMoveToWebConfigDoc | null;
}): Promise<MoveToWebView | null> {
  const { user, config } = args;
  if (!config?.isActive || !config.reward) return null;

  const state = readState(user);
  if (state.claimedAt) return null;

  const nativeSeen = !!user.platformsSeen?.native;
  const webSeen = !!user.platformsSeen?.web;

  if (!state.startedAt) {
    if (!nativeSeen || webSeen) return null;
    const next = { startedAt: new Date().toISOString(), claimedAt: null };
    await writeState(String((user as any)._id), next);
  }

  return {
    complete: webSeen,
    claimable: webSeen,
    reward: config.reward,
    webUrl: WEB_APP_URL,
  };
}

export async function claimMoveToWebReward(args: { userId: string }) {
  const { userId } = args;
  await connectMongo();

  const [user, config] = await Promise.all([
    UserModel.findById(userId),
    loadMoveToWebConfig(),
  ]);
  if (!user) throw new Error('User not found');
  if (!config?.isActive || !config.reward) {
    throw new Error('This reward is not available right now');
  }

  const state = readState(user.toObject());
  if (state.claimedAt) throw new Error('Reward already claimed');
  if (!state.startedAt) throw new Error('This quest is not active for you');
  if (!user.platformsSeen?.web) {
    throw new Error('Log in on the web to unlock this reward');
  }

  const multiplier = isPremiumUser(user.toObject()) ? 2 : 1;

  if (!user.wardrobe) {
    user.wardrobe = { equipped: {}, inventory: {}, unseenItems: [], flies: 0 };
  }
  user.wardrobe.inventory = user.wardrobe.inventory ?? {};
  user.wardrobe.unseenItems = user.wardrobe.unseenItems ?? [];
  user.wardrobe.flies = user.wardrobe.flies ?? 0;
  if (!user.wardrobe.backgrounds) {
    user.wardrobe.backgrounds = { equipped: null, inventory: {} };
  }
  user.wardrobe.backgrounds.inventory =
    user.wardrobe.backgrounds.inventory ?? {};

  const summary = {
    fliesGranted: 0,
    flyBalanceBefore: user.wardrobe.flies,
    flyBalanceAfter: user.wardrobe.flies,
    grantedItemIds: [] as string[],
    grantedBackgroundIds: [] as string[],
  };

  const reward = config.reward;
  if (reward.type === 'FLIES') {
    const base =
      reward.amountMode === 'random'
        ? (() => {
            const min = Math.max(1, reward.minAmount ?? 1);
            const max = Math.max(min, reward.maxAmount ?? min);
            return min + Math.floor(Math.random() * (max - min + 1));
          })()
        : reward.amount ?? 0;
    const amount = base * multiplier;
    user.wardrobe.flies += amount;
    summary.fliesGranted += amount;
    summary.flyBalanceAfter = user.wardrobe.flies;
  } else if (reward.type === 'BACKGROUND' && reward.backgroundId) {
    const inv = user.wardrobe.backgrounds.inventory;
    for (let i = 0; i < multiplier; i += 1) {
      inv[reward.backgroundId] = (inv[reward.backgroundId] ?? 0) + 1;
      summary.grantedBackgroundIds.push(reward.backgroundId);
    }
  } else if (reward.itemId) {
    const copies = Math.max(1, reward.amount ?? 1) * multiplier;
    for (let i = 0; i < copies; i += 1) {
      user.wardrobe.inventory[reward.itemId] =
        (user.wardrobe.inventory[reward.itemId] ?? 0) + 1;
      user.wardrobe.unseenItems!.push(reward.itemId);
      summary.grantedItemIds.push(reward.itemId);
    }
  }

  recordDoubleableClaim(user, summary);

  const currentQuests =
    typeof (user as any).quests === 'object' && (user as any).quests
      ? (user as any).quests
      : {};
  (user as any).quests = {
    ...currentQuests,
    moveToWeb: { ...state, claimedAt: new Date().toISOString() },
  };
  user.markModified('quests');
  user.markModified('wardrobe');
  await user.save();

  return summary;
}
