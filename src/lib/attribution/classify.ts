export type AcquisitionChannel =
  | 'apple_ads'
  | 'meta_ads'
  | 'tiktok_ads'
  | 'google_ads'
  | 'other_paid'
  | 'referral'
  | 'ai_assistant'
  | 'social'
  | 'search'
  | 'web_referral'
  | 'campaign_link'
  | 'app_store'
  | 'play_store'
  | 'direct';

export type AcquisitionResolver = 'revenuecat' | 'click_id' | 'utm' | 'referral' | 'referrer' | 'none';

export type FirstTouch = {
  at: string;
  landing?: string;
  referrer?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  fbclid?: string;
  ttclid?: string;
  gclid?: string;
  ref?: string;
  friend?: string;
};

export type UserAcquisition = {
  channel: AcquisitionChannel;
  paid: boolean;
  network?: string;
  campaign?: string;
  adGroup?: string;
  keyword?: string;
  ad?: string;
  content?: string;
  referrerHost?: string;
  inviterId?: string;
  platform?: 'web' | 'ios' | 'android' | 'unknown';
  resolvedBy: AcquisitionResolver;
  status: 'pending' | 'final';
  touch?: FirstTouch;
  touchedAt?: Date;
  resolvedAt?: Date;
  rcChecks?: number;
  rcCheckedAt?: Date;
};

export const CHANNEL_LABELS: Record<AcquisitionChannel, string> = {
  apple_ads: 'Apple Ads',
  meta_ads: 'Meta Ads',
  tiktok_ads: 'TikTok Ads',
  google_ads: 'Google Ads',
  other_paid: 'Other paid',
  referral: 'Friend invite',
  ai_assistant: 'AI assistants',
  social: 'Social (organic)',
  search: 'Search (organic)',
  web_referral: 'Other websites',
  campaign_link: 'Tagged links',
  app_store: 'App Store (organic)',
  play_store: 'Play Store (organic)',
  direct: 'Direct / unknown',
};

export const PAID_CHANNELS = new Set<AcquisitionChannel>([
  'apple_ads',
  'meta_ads',
  'tiktok_ads',
  'google_ads',
  'other_paid',
]);

export const SPEND_CHANNELS: Array<{ id: AcquisitionChannel; label: string }> = [
  { id: 'apple_ads', label: 'Apple Ads' },
  { id: 'meta_ads', label: 'Meta Ads' },
  { id: 'tiktok_ads', label: 'TikTok Ads' },
  { id: 'google_ads', label: 'Google Ads' },
  { id: 'other_paid', label: 'Other paid' },
];

const PAID_MEDIUMS = new Set([
  'cpc',
  'ppc',
  'cpm',
  'cpi',
  'paid',
  'paidsocial',
  'paid_social',
  'paid-social',
  'paidsearch',
  'paid_search',
  'ads',
  'ad',
  'display',
  'banner',
]);

const SEARCH_HOSTS = ['google.', 'bing.', 'duckduckgo.', 'yahoo.', 'ecosia.', 'yandex.', 'baidu.', 'brave.', 'startpage.'];
const AI_HOSTS = ['chatgpt.com', 'chat.openai.com', 'openai.com', 'perplexity.ai', 'claude.ai', 'gemini.google.com', 'copilot.microsoft.com', 'you.com', 'phind.com', 'meta.ai', 'grok.com'];
const SOCIAL_HOSTS = ['facebook.', 'fb.', 'instagram.', 'l.instagram', 't.co', 'twitter.', 'x.com', 'tiktok.', 'reddit.', 'linkedin.', 'lnkd.in', 'youtube.', 'youtu.be', 'pinterest.', 'threads.', 'snapchat.', 'discord.', 'telegram.', 'whatsapp.', 'bsky.'];
const INTERNAL_HOSTS = ['frogress', 'localhost'];

export function cleanText(value: unknown, max = 160): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.trim().slice(0, max);
  return text || undefined;
}

export function normalizeKey(value: string | undefined | null) {
  return (value ?? '')
    .toLowerCase()
    .replace(/^["'+[]+/, '')
    .replace(/["'\]]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function hostOf(value: string | undefined) {
  if (!value) return undefined;
  try {
    return new URL(value).hostname.replace(/^www\./, '') || undefined;
  } catch {
    return undefined;
  }
}

function hostMatches(host: string, list: string[]) {
  return list.some((entry) => host === entry || host.startsWith(entry) || host.includes(`.${entry}`) || host.endsWith(entry));
}

function networkChannel(source: string): AcquisitionChannel | null {
  if (source === 'asa' || /(apple|searchads|search_ads)/.test(source)) return 'apple_ads';
  if (/(facebook|^fb$|^fb[_-]|instagram|^ig$|meta)/.test(source)) return 'meta_ads';
  if (/tiktok/.test(source)) return 'tiktok_ads';
  if (/(google|adwords|youtube)/.test(source)) return 'google_ads';
  return null;
}

export function classifyTouch(
  touch: FirstTouch | undefined,
  platform: UserAcquisition['platform'],
): Omit<UserAcquisition, 'status' | 'touch' | 'touchedAt' | 'resolvedAt'> {
  const source = normalizeKey(touch?.utm_source);
  const medium = normalizeKey(touch?.utm_medium);
  const referrerHost = hostOf(touch?.referrer);
  const base = {
    platform,
    campaign: cleanText(touch?.utm_campaign),
    content: cleanText(touch?.utm_content),
    keyword: cleanText(touch?.utm_term),
    referrerHost,
  };

  if (touch?.ttclid) {
    return { ...base, channel: 'tiktok_ads', paid: true, network: 'TikTok', resolvedBy: 'click_id' };
  }
  if (touch?.gclid) {
    return { ...base, channel: 'google_ads', paid: true, network: 'Google', resolvedBy: 'click_id' };
  }

  const paidMedium = PAID_MEDIUMS.has(medium) || medium.includes('paid');
  if (source && paidMedium) {
    const channel = networkChannel(source) ?? 'other_paid';
    return { ...base, channel, paid: true, network: touch?.utm_source, resolvedBy: 'utm' };
  }
  if (touch?.fbclid && paidMedium) {
    return { ...base, channel: 'meta_ads', paid: true, network: 'Meta', resolvedBy: 'click_id' };
  }

  if (touch?.ref) {
    return { ...base, channel: 'referral', paid: false, network: 'invite', resolvedBy: 'referral' };
  }
  if (touch?.friend) {
    return { ...base, channel: 'referral', paid: false, network: 'friend link', resolvedBy: 'referral' };
  }

  if (source) {
    const network = networkChannel(source);
    const channel: AcquisitionChannel = /(chatgpt|openai|perplexity|claude|gemini|copilot)/.test(source)
      ? 'ai_assistant'
      : network === 'meta_ads' || network === 'tiktok_ads' || /(twitter|reddit|linkedin|threads|pinterest|discord)/.test(source)
        ? 'social'
        : 'campaign_link';
    return { ...base, channel, paid: false, network: touch?.utm_source, resolvedBy: 'utm' };
  }

  if (touch?.fbclid) {
    return { ...base, channel: 'social', paid: false, network: 'Facebook', resolvedBy: 'click_id' };
  }

  if (referrerHost && !hostMatches(referrerHost, INTERNAL_HOSTS)) {
    if (hostMatches(referrerHost, AI_HOSTS)) {
      return { ...base, channel: 'ai_assistant', paid: false, network: referrerHost, resolvedBy: 'referrer' };
    }
    if (hostMatches(referrerHost, SEARCH_HOSTS)) {
      return { ...base, channel: 'search', paid: false, network: referrerHost, resolvedBy: 'referrer' };
    }
    if (hostMatches(referrerHost, SOCIAL_HOSTS)) {
      return { ...base, channel: 'social', paid: false, network: referrerHost, resolvedBy: 'referrer' };
    }
    return { ...base, channel: 'web_referral', paid: false, network: referrerHost, resolvedBy: 'referrer' };
  }

  if (platform === 'ios') {
    return { ...base, channel: 'app_store', paid: false, resolvedBy: 'none' };
  }
  if (platform === 'android') {
    return { ...base, channel: 'play_store', paid: false, resolvedBy: 'none' };
  }
  return { ...base, channel: 'direct', paid: false, resolvedBy: 'none' };
}

export function sanitizeTouch(raw: unknown): FirstTouch | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const input = raw as Record<string, unknown>;
  const at = cleanText(input.at, 40);
  if (!at || Number.isNaN(Date.parse(at))) return undefined;
  const touch: FirstTouch = { at };
  const keys: Array<keyof FirstTouch> = [
    'landing',
    'referrer',
    'utm_source',
    'utm_medium',
    'utm_campaign',
    'utm_content',
    'utm_term',
    'fbclid',
    'ttclid',
    'gclid',
    'ref',
    'friend',
  ];
  for (const key of keys) {
    const value = cleanText(input[key], key === 'referrer' || key === 'landing' ? 300 : 200);
    if (value) touch[key] = value;
  }
  return touch;
}
