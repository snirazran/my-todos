export const FROG_TRAIT_IDS = [
  'curiosity',
  'resilience',
  'compassion',
  'logic',
  'confidence',
  'security',
] as const;

export type FrogTraitId = (typeof FROG_TRAIT_IDS)[number];

export type FrogTraits = Partial<Record<FrogTraitId, number>>;

export type FrogTrait = {
  id: FrogTraitId;
  label: string;
  emoji: string;
  line: string;
  tint: string;
};

export const FROG_TRAITS: FrogTrait[] = [
  {
    id: 'curiosity',
    label: 'Curiosity',
    emoji: '🤔',
    line: "*Ribbit!* So much pond out there to explore. Let's find out what we're great at, together!",
    tint: '#d97706',
  },
  {
    id: 'resilience',
    label: 'Resilience',
    emoji: '😎',
    line: "*Ribbit!* Bad days happen, even to frogs. We'll shake them off and keep going, together!",
    tint: '#6366f1',
  },
  {
    id: 'compassion',
    label: 'Compassion',
    emoji: '😍',
    line: "*Ribbit!* Being kind to yourself counts too. Let's look after each other!",
    tint: '#db2777',
  },
  {
    id: 'logic',
    label: 'Logic',
    emoji: '🧐',
    line: "*Ribbit!* Big things get easier in small pieces. Let's figure them out together!",
    tint: '#0284c7',
  },
  {
    id: 'confidence',
    label: 'Confidence',
    emoji: '🤠',
    line: "*Ribbit!* You can do hard things. I'll be your loudest cheerleader. Well, croaker!",
    tint: '#ea580c',
  },
  {
    id: 'security',
    label: 'Security',
    emoji: '😌',
    line: "*Ribbit!* Whatever happens, you've got a safe spot right here with me.",
    tint: '#059669',
  },
];

export const FROG_TRAIT_ONBOARDING_BOOST = 4.2;

export function isFrogTraitId(value: unknown): value is FrogTraitId {
  return typeof value === 'string' && (FROG_TRAIT_IDS as readonly string[]).includes(value);
}

export function findFrogTrait(id: unknown): FrogTrait | null {
  return FROG_TRAITS.find((trait) => trait.id === id) ?? null;
}

export function startingFrogTraits(picked: FrogTraitId | null): Record<FrogTraitId, number> {
  const traits = {} as Record<FrogTraitId, number>;
  FROG_TRAIT_IDS.forEach((id) => {
    traits[id] = id === picked ? FROG_TRAIT_ONBOARDING_BOOST : 0;
  });
  return traits;
}
