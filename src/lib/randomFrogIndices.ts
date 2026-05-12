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

export function randomFrogIndices(): FrogIndices {
  return {
    skin: rand(SLOT_MAX.skin),
    hat: rand(SLOT_MAX.hat),
    body: rand(SLOT_MAX.body),
    hand_item: rand(SLOT_MAX.hand_item),
  };
}
