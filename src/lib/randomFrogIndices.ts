export type FrogIndices = {
  skin: number;
  hat: number;
  body: number;
  hand_item: number;
};

const SLOT_MAX = {
  skin: 3,
  hat: 10,
  body: 5,
  hand_item: 5,
} as const;

const rand = (max: number) => Math.floor(Math.random() * (max + 1));

const keyOf = (f: FrogIndices) => `${f.skin}-${f.hat}-${f.body}-${f.hand_item}`;

const TOTAL_COMBOS =
  (SLOT_MAX.skin + 1) *
  (SLOT_MAX.hat + 1) *
  (SLOT_MAX.body + 1) *
  (SLOT_MAX.hand_item + 1);

// Outfits already shown this session. We keep drawing fresh outfits until every
// possible combination has been used, then refresh and start over — so an outfit
// never repeats until all the others have appeared.
const shownFrogKeys = new Set<string>();

function rollFrogIndices(): FrogIndices {
  return {
    skin: rand(SLOT_MAX.skin),
    hat: rand(SLOT_MAX.hat),
    body: rand(SLOT_MAX.body),
    hand_item: rand(SLOT_MAX.hand_item),
  };
}

export function randomFrogIndices(): FrogIndices {
  if (shownFrogKeys.size >= TOTAL_COMBOS) {
    shownFrogKeys.clear();
  }
  let next = rollFrogIndices();
  for (let i = 0; i < 500 && shownFrogKeys.has(keyOf(next)); i += 1) {
    next = rollFrogIndices();
  }
  shownFrogKeys.add(keyOf(next));
  return next;
}
