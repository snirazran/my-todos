import type {
  CampaignAssetRef,
  CampaignCanvas,
  CampaignCaps,
  CampaignCopy,
  CampaignCta,
  CampaignArtKind,
  CampaignOffer,
  CampaignRive,
  CampaignStatus,
  CampaignTargeting,
  CampaignTemplate,
  CampaignTier,
  CampaignTriggerRule,
} from '@/lib/campaigns/types';

/** A campaign as the editor holds it: the stored document plus the resolved
 *  asset URLs the admin API returns alongside it. */
export type CampaignRow = {
  id: string;
  name: string;
  template: CampaignTemplate;
  tier: CampaignTier;
  status: CampaignStatus;
  priority: number;
  art: CampaignArtKind;
  copy: CampaignCopy;
  cta: CampaignCta;
  offer: CampaignOffer;
  rive: CampaignRive;
  canvas: CampaignCanvas;
  assets: CampaignAssetRef[];
  triggers: CampaignTriggerRule[];
  targeting: CampaignTargeting;
  caps: CampaignCaps;
  startAt: string | null;
  endAt: string | null;
  imageUrl: string;
  /** The uploaded .riv, ignored while a library path is set. */
  riveUploadUrl: string;
};

export type CampaignStats = {
  _id: string;
  impressions: number;
  clicks: number;
  dismissals: number;
  conversions: number;
  reach: number;
};

export type ElementStat = { campaignId: string; elementId: string; clicks: number };

export type ExplainRow = {
  id: string;
  name: string;
  eligible: boolean;
  reason: string;
  impressions: number;
  dismissals: number;
  converted: boolean;
};

export type RiveLibraryFile = {
  path: string;
  name: string;
  sizeKb: number;
};
