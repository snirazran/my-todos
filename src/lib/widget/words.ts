'use client';

/**
 * The word of the day that sits in the bottom-left of the large widget.
 *
 * Presets rather than a fetch: the widget extension has no network and no
 * session, so anything it shows has to arrive inside the snapshot the webview
 * writes. A fixed list also means the word never changes mid-day, which would
 * spend a WidgetKit reload to reword a decoration.
 *
 * Terms are real dictionary words, chosen to be short enough to fit one line at
 * 13pt and odd enough to be worth reading twice.
 */

export type WidgetWord = {
  term: string;
  meaning: string;
};

export const WIDGET_WORDS: WidgetWord[] = [
  { term: 'Robustious', meaning: 'rough, rude, or boisterous.' },
  { term: 'Petrichor', meaning: 'the smell of rain on dry earth.' },
  { term: 'Sonder', meaning: 'sensing every stranger has a full life.' },
  { term: 'Eucatastrophe', meaning: 'a sudden turn to a happy ending.' },
  { term: 'Apricity', meaning: 'the warmth of the sun in winter.' },
  { term: 'Dilettante', meaning: 'a dabbler who never quite commits.' },
  { term: 'Gumption', meaning: 'the nerve to actually start.' },
  { term: 'Halcyon', meaning: 'calm, peaceful, golden in memory.' },
  { term: 'Lollygag', meaning: 'to dawdle when you know better.' },
  { term: 'Mudlark', meaning: 'one who scavenges riverbanks for treasure.' },
  { term: 'Numinous', meaning: 'awe at something far larger than you.' },
  { term: 'Obstreperous', meaning: 'noisily and stubbornly defiant.' },
  { term: 'Quiddity', meaning: 'the essence that makes a thing itself.' },
  { term: 'Rumbustious', meaning: 'cheerfully out of control.' },
  { term: 'Serendipity', meaning: 'finding something good by accident.' },
  { term: 'Susurrus', meaning: 'a soft whispering or rustling.' },
  { term: 'Tarradiddle', meaning: 'a small, harmless lie.' },
  { term: 'Ultracrepidarian', meaning: 'opinionated well past your expertise.' },
  { term: 'Vellichor', meaning: 'the wistfulness of old bookshops.' },
  { term: 'Wabi-sabi', meaning: 'beauty in the worn and imperfect.' },
  { term: 'Zephyr', meaning: 'a soft, gentle breeze.' },
  { term: 'Absquatulate', meaning: 'to leave abruptly and without notice.' },
  { term: 'Bumbershoot', meaning: 'an umbrella.' },
  { term: 'Cattywampus', meaning: 'askew, crooked, all wrong.' },
  { term: 'Defenestrate', meaning: 'to throw someone out of a window.' },
  { term: 'Ephemeral', meaning: 'lasting only a moment.' },
  { term: 'Flapdoodle', meaning: 'nonsense spoken with confidence.' },
  { term: 'Gallivant', meaning: 'to roam about in search of fun.' },
  { term: 'Hiraeth', meaning: 'homesickness for a home you never had.' },
  { term: 'Ineffable', meaning: 'too great to put into words.' },
  { term: 'Jentacular', meaning: 'having to do with breakfast.' },
  { term: 'Kerfuffle', meaning: 'a fuss over something small.' },
  { term: 'Limerence', meaning: 'the helpless early stage of a crush.' },
  { term: 'Meraki', meaning: 'doing a thing with your whole soul.' },
  { term: 'Nudiustertian', meaning: 'of the day before yesterday.' },
  { term: 'Opsimath', meaning: 'someone who starts learning late.' },
  { term: 'Pandiculation', meaning: 'the full-body stretch on waking.' },
  { term: 'Quotidian', meaning: 'ordinary, daily, unremarkable.' },
  { term: 'Sillage', meaning: 'the trace a scent leaves behind.' },
  { term: 'Snollygoster', meaning: 'a shrewd person with no principles.' },
  { term: 'Taradiddle', meaning: 'pretentious nonsense.' },
  { term: 'Ulotrichous', meaning: 'having very curly hair.' },
  { term: 'Velleity', meaning: 'a wish too faint to act on.' },
  { term: 'Widdershins', meaning: 'counterclockwise; the wrong way round.' },
  { term: 'Yonderly', meaning: 'absent-minded, somewhere far off.' },
  { term: 'Zenzizenzizenzic', meaning: 'a number raised to the eighth power.' },
];

/**
 * Days since the epoch, in the user's timezone — the same rotation clock the
 * art uses, so both turn over together at local midnight.
 */
export function dayIndex(day: string): number {
  const parsed = Date.parse(`${day}T00:00:00Z`);
  if (Number.isNaN(parsed)) return 0;
  return Math.floor(parsed / 86_400_000);
}

/**
 * Walks the list one word per day instead of hashing to a random slot: a hash
 * repeats and skips, and a user who sees the same word twice in a week reads
 * the feature as broken.
 */
export function wordForDay(day: string): WidgetWord {
  const index = dayIndex(day) % WIDGET_WORDS.length;
  return WIDGET_WORDS[(index + WIDGET_WORDS.length) % WIDGET_WORDS.length];
}
