import type {
  CampaignRiveButton,
  CtaAction,
  RiveSignalSource,
} from '@/lib/campaigns/types';

export type ResolvedSignal = {
  button: CampaignRiveButton;
  /** `cta` resolved against the campaign's own button. */
  action: CtaAction;
  path?: string;
  packId?: string;
  closes: boolean;
};

type SignalCampaign = {
  cta: { action: CtaAction; path?: string };
  offer: { packId?: string };
  rive: { buttons: CampaignRiveButton[] };
};

/**
 * What a signal fired from inside a Rive file should do, if anything.
 *
 * Unmapped signals resolve to null on purpose: a file is free to fire whatever
 * it likes for its own animation states, and only the names an admin mapped
 * are allowed to reach into the app.
 */
export function resolveRiveSignal(
  campaign: SignalCampaign,
  signal: { name: string; source: RiveSignalSource },
): ResolvedSignal | null {
  const button = campaign.rive.buttons.find(
    (candidate) => candidate.signal === signal.name && candidate.source === signal.source,
  );
  if (!button) return null;

  const action = button.action === 'cta' ? campaign.cta.action : button.action;
  return {
    button,
    action,
    path: button.action === 'cta' ? campaign.cta.path : button.path || campaign.cta.path,
    packId: button.action === 'cta' ? campaign.offer.packId : button.packId || campaign.offer.packId,
    closes: button.action === 'cta' ? true : button.closes,
  };
}
