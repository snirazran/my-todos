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

// Remember the last outfit so two consecutive rolls never produce the same one.
let lastFrogKey: string | null = null;

function rollFrogIndices(): FrogIndices {
  return {
    skin: rand(SLOT_MAX.skin),
    hat: rand(SLOT_MAX.hat),
    body: rand(SLOT_MAX.body),
    hand_item: rand(SLOT_MAX.hand_item),
  };
}

export function randomFrogIndices(): FrogIndices {
  let next = rollFrogIndices();
  for (let i = 0; i < 12 && keyOf(next) === lastFrogKey; i += 1) {
    next = rollFrogIndices();
  }
  lastFrogKey = keyOf(next);
  return next;
}
