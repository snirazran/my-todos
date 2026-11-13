import { BARRIER_QUESTION_PREFIX, STARTER_PROFILE_KEYS } from '@/lib/quests/starterPlan';
import type { UserDoc } from '@/lib/types/UserDoc';

export type PromptAudienceUser = Pick<UserDoc, 'onboardingResponses' | 'focusProfile' | 'ageRange'>;

export type PromptAudienceCategory = { categoryId: string; name: string };

export const PROMPT_AUDIENCE_PREFIXES = [
  'area',
  'barrier',
  'trait',
  'overwhelm',
  'sleep',
  'activity',
  'support',
  'age',
] as const;

export function promptAreaSlug(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function buildPromptAudience(
  user: PromptAudienceUser | null | undefined,
  categories: PromptAudienceCategory[],
): string[] {
  const responses = user?.onboardingResponses ?? {};
  const list = (key: string) => (Array.isArray(responses[key]) ? responses[key] : []);
  const slugById = new Map(
    categories.map((category) => [category.categoryId, promptAreaSlug(category.name ?? '')]),
  );
  const tags = new Set<string>();

  for (const id of [...(user?.focusProfile?.selectedCategoryIds ?? []), ...list('focusAreas')]) {
    const slug = slugById.get(id);
    if (slug) tags.add(`area:${slug}`);
  }
  for (const key of Object.keys(responses)) {
    if (!key.startsWith(BARRIER_QUESTION_PREFIX)) continue;
    for (const value of list(key)) {
      if (value && value !== 'other') tags.add(`barrier:${value}`);
    }
  }
  for (const key of STARTER_PROFILE_KEYS) {
    const value = list(key)[0];
    if (value) tags.add(`${key}:${value}`);
  }
  const trait = list('frogTrait')[0];
  if (trait) tags.add(`trait:${trait}`);
  if (user?.ageRange) tags.add(`age:${user.ageRange}`);

  return Array.from(tags);
}
