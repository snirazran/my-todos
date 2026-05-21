import InviteConfigModel, {
  type InviteConfigDoc,
} from '@/lib/models/InviteConfig';

export async function ensureInviteConfig(): Promise<InviteConfigDoc> {
  const existing = await InviteConfigModel.findOne({ key: 'singleton' });
  if (existing) return existing;
  return InviteConfigModel.create({
    key: 'singleton',
    headline: 'Share FrogTask, get rewards!',
    subheading: 'Invite a friend to gift them a skin and earn rewards for yourself!',
    rewards: [
      { tier: 1, label: '1st friend', description: '', itemId: null, flies: 100, imageUrl: '', rewards: [{ type: 'FLIES', amountMode: 'fixed', amount: 100 }] },
      { tier: 2, label: '2nd friend', description: '', itemId: null, flies: 250, imageUrl: '', rewards: [{ type: 'FLIES', amountMode: 'fixed', amount: 250 }] },
      { tier: 3, label: '3rd friend', description: '', itemId: null, flies: 500, imageUrl: '', rewards: [{ type: 'FLIES', amountMode: 'fixed', amount: 500 }] },
    ],
    giftOptions: [],
    shareTitle: 'Come join me on FrogTask!',
    shareMessage: 'I have a gift for you on FrogTask. Tap the link to claim it!',
    updatedAt: new Date(),
  });
}
