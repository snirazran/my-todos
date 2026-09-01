const LEET_MAP: Record<string, string> = {
  '0': 'o',
  '1': 'i',
  '2': 'z',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '6': 'g',
  '7': 't',
  '8': 'b',
  '9': 'g',
  '@': 'a',
  '$': 's',
  '!': 'i',
  '|': 'i',
  '+': 't',
  '(': 'c',
  '<': 'c',
  '£': 'e',
};

const BLOCKED_SUBSTRINGS = [
  'nigger',
  'nigga',
  'niglet',
  'faggot',
  'fagot',
  'kike',
  'chink',
  'wetback',
  'gook',
  'tranny',
  'shemale',
  'raghead',
  'towelhead',
  'beaner',
  'retard',
  'cunt',
  'whore',
  'slut',
  'bitch',
  'bastard',
  'wanker',
  'twat',
  'nonce',
  'bollock',
  'arsehole',
  'asshole',
  'dickhead',
  'fuck',
  'fvck',
  'phuck',
  'shit',
  'piss',
  'penis',
  'vagina',
  'boobs',
  'titties',
  'blowjob',
  'handjob',
  'deepthroat',
  'cumshot',
  'jizz',
  'dildo',
  'milf',
  'porn',
  'hentai',
  'rapist',
  'raping',
  'pedo',
  'pedophile',
  'paedophile',
  'molester',
  'incest',
  'bestiality',
  'nazi',
  'hitler',
  'swastika',
  'whitepower',
  'heilhitler',
  'killyourself',
  'killurself',
];

const BLOCKED_WORDS = new Set([
  'ass',
  'arse',
  'anus',
  'cock',
  'cocks',
  'dick',
  'dicks',
  'coon',
  'fag',
  'fags',
  'rape',
  'raped',
  'cum',
  'tit',
  'tits',
  'titty',
  'hoe',
  'hoes',
  'sex',
  'kys',
  'stfu',
]);
const ALLOWED_WORDS = new Set([
  'scunthorpe',
  'penistone',
  'shiitake',
  'shitake',
  'shitzu',
  'torpedo',
  'torpedoes',
  'pedometer',
  'gobbledygook',
]);


function mapLeet(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .split('')
    .map((char) => LEET_MAP[char] ?? char)
    .join('');
}

function collapseRuns(value: string) {
  return value.replace(/(.)\1+/g, '$1');
}

export function containsProfanity(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return false;

  const words = mapLeet(value)
    .split(/[^a-z0-9]+/)
    .filter((word) => word && !ALLOWED_WORDS.has(word));
  if (!words.length) return false;

  const compact = words.join('');
  const compactForms = [compact, collapseRuns(compact)];
  if (BLOCKED_SUBSTRINGS.some((term) => compactForms.some((form) => form.includes(term)))) {
    return true;
  }
  if (compactForms.some((form) => BLOCKED_WORDS.has(form))) return true;

  return words.some((word) => BLOCKED_WORDS.has(word) || BLOCKED_WORDS.has(collapseRuns(word)));
}
