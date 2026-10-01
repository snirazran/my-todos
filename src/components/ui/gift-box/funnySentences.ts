export const FUNNY_SENTENCES = [
  'Please be a hat. Please be a hat.',
  'Untying the bow with my tongue...',
  'No peeking. Okay, one peek.',
  'Hopefully not socks...',
  'Consulting the pond oracle...',
  'Calculating maximum drip...',
  'Fit check incoming...',
  'Rattle, rattle... promising.',
  'Something sparkly in here...',
  'Drumroll, but with tiny feet...',
  'Ribbit-ing suspense...',
  'Wrapping paper: defeated.',
  'Rolling the lily pad dice...',
  'This one feels heavy...',
  'Warming up the runway...',
  'Croak if you’re excited!',
  'Polishing the rarity glow...',
  'Do frogs wear hats? Yes.',
  'Holding my breath. Gills? No.',
  'Main character energy loading...',
];

export function pickFunnySentence(previous?: string) {
  const pool = FUNNY_SENTENCES.filter((line) => line !== previous);
  return pool[Math.floor(Math.random() * pool.length)];
}
