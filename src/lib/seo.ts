export const SITE_URL = (
  process.env.NEXT_PUBLIC_APP_URL || 'https://frogress.com'
).replace(/\/+$/, '');

export const SITE_NAME = 'Frogress';
export const SITE_FULL_NAME = 'Frogress: Your To-Do List Pet';
export const SITE_TITLE =
  'Frogress: Your To-Do List Pet — Tasks, Planner, Focus Timer';
export const SITE_DESCRIPTION =
  'Frogress is a to-do list app with a pet frog. Plan your week, run a focus timer, and feed your frog every time you finish a task. Free on web, iOS and Android.';
export const SITE_TAGLINE =
  'Tasks, focus, and a frog who notices when you finish.';

export const SUPPORT_EMAIL = 'help@frogress.com';
export const FOUNDER_NAME = 'Snir Azran';

export const ANDROID_PACKAGE = 'io.frog.tasks';
export const APP_STORE_ID = process.env.NEXT_PUBLIC_APP_STORE_ID?.trim() || '';
export const APP_STORE_LINK =
  process.env.NEXT_PUBLIC_APP_STORE_URL?.trim() ||
  (APP_STORE_ID ? `https://apps.apple.com/app/id${APP_STORE_ID}` : '');
export const PLAY_STORE_LINK =
  process.env.NEXT_PUBLIC_PLAY_STORE_URL?.trim() ||
  `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`;

export const TWITTER_HANDLE = process.env.NEXT_PUBLIC_TWITTER_HANDLE?.trim() || '';

export const GOOGLE_SITE_VERIFICATION =
  process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION?.trim() || '';

export const SOCIAL_PROFILES: string[] = [
  'https://www.instagram.com/getfrogress',
];

export const SITE_KEYWORDS = [
  'to do list app',
  'to do list app with a pet',
  'gamified to do list app',
  'task manager app',
  'daily planner app',
  'weekly planner app',
  'habit tracker app',
  'focus timer app',
  'pomodoro timer app',
  'virtual pet productivity app',
  'task app with rewards',
  'Habitica alternative',
  'Finch alternative',
  'cute to do list app',
  'free to do list app',
  'Frogress',
];

export const APP_FEATURE_LIST = [
  'To-do list with due dates, repeats, tags, notes and subtasks',
  'Weekly and monthly planner with drag-and-drop scheduling',
  'Focus timer with Lock Screen and Dynamic Island support',
  'Two-way Google Calendar and Apple Calendar sync',
  'Daily quests, streaks and weekly Leaps',
  'A pet frog you feed, dress and decorate with earned rewards',
  'Shared buddy tasks with friends',
  'Reminders and push notifications',
];

export const PLUS_PRICING = {
  monthly: { price: '9.99', currency: 'USD', trialDays: 3 },
  yearly: { price: '69.99', currency: 'USD', trialDays: 7 },
} as const;

export const LEGAL_LAST_UPDATED = {
  privacy: 'August 2, 2026',
  terms: 'September 1, 2026',
  refund: 'July 26, 2026',
  support: 'August 30, 2026',
} as const;

export function absoluteUrl(path = '/') {
  return path.startsWith('http') ? path : `${SITE_URL}${path}`;
}

export type PageSeo = {
  title: string;
  description: string;
  path?: string;
};

export function openGraphFor({ title, description, path = '/' }: PageSeo) {
  return {
    type: 'website' as const,
    siteName: SITE_NAME,
    locale: 'en_US',
    title,
    description,
    url: path,
  };
}

export function twitterFor({ title, description }: PageSeo) {
  return {
    card: 'summary_large_image' as const,
    title,
    description,
    ...(TWITTER_HANDLE ? { site: TWITTER_HANDLE, creator: TWITTER_HANDLE } : {}),
  };
}

export function pageMetadata(seo: PageSeo) {
  return {
    title: seo.title,
    description: seo.description,
    alternates: { canonical: seo.path ?? '/' },
    openGraph: openGraphFor(seo),
    twitter: twitterFor(seo),
  };
}

const ORG_ID = `${SITE_URL}/#organization`;
const WEBSITE_ID = `${SITE_URL}/#website`;
const APP_ID = `${SITE_URL}/#app`;

export function organizationJsonLd() {
  return {
    '@type': 'Organization',
    '@id': ORG_ID,
    name: SITE_NAME,
    alternateName: SITE_FULL_NAME,
    url: SITE_URL,
    email: SUPPORT_EMAIL,
    description: SITE_DESCRIPTION,
    logo: {
      '@type': 'ImageObject',
      url: absoluteUrl('/512x512.png'),
      width: 512,
      height: 512,
      caption: SITE_NAME,
    },
    image: absoluteUrl('/opengraph-image'),
    founder: { '@type': 'Person', name: FOUNDER_NAME },
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'customer support',
      email: SUPPORT_EMAIL,
      availableLanguage: ['English'],
    },
    ...(SOCIAL_PROFILES.length ? { sameAs: SOCIAL_PROFILES } : {}),
  };
}

export function websiteJsonLd() {
  return {
    '@type': 'WebSite',
    '@id': WEBSITE_ID,
    url: SITE_URL,
    name: SITE_NAME,
    alternateName: SITE_FULL_NAME,
    description: SITE_DESCRIPTION,
    publisher: { '@id': ORG_ID },
    inLanguage: 'en-US',
  };
}

function plusOffers() {
  return [
    {
      '@type': 'Offer',
      name: 'Frogress Plus — Monthly',
      price: PLUS_PRICING.monthly.price,
      priceCurrency: PLUS_PRICING.monthly.currency,
      category: 'subscription',
      availability: 'https://schema.org/InStock',
      url: absoluteUrl('/pricing'),
    },
    {
      '@type': 'Offer',
      name: 'Frogress Plus — Yearly',
      price: PLUS_PRICING.yearly.price,
      priceCurrency: PLUS_PRICING.yearly.currency,
      category: 'subscription',
      availability: 'https://schema.org/InStock',
      url: absoluteUrl('/pricing'),
    },
  ];
}

export function softwareApplicationJsonLd() {
  const downloadUrls = [APP_STORE_LINK, PLAY_STORE_LINK].filter(Boolean);

  return {
    '@type': ['SoftwareApplication', 'MobileApplication', 'WebApplication'],
    '@id': APP_ID,
    name: SITE_FULL_NAME,
    alternateName: SITE_NAME,
    url: SITE_URL,
    description: SITE_DESCRIPTION,
    applicationCategory: 'ProductivityApplication',
    applicationSubCategory: 'To-do list and task manager',
    operatingSystem: 'iOS, Android, Web',
    browserRequirements: 'Requires a modern browser with JavaScript enabled.',
    image: absoluteUrl('/opengraph-image'),
    softwareHelp: absoluteUrl('/support'),
    isAccessibleForFree: true,
    inLanguage: 'en-US',
    featureList: APP_FEATURE_LIST,
    publisher: { '@id': ORG_ID },
    offers: [
      {
        '@type': 'Offer',
        name: 'Frogress (free)',
        price: '0',
        priceCurrency: 'USD',
        category: 'free',
        availability: 'https://schema.org/InStock',
        url: SITE_URL,
      },
      ...plusOffers(),
    ],
    ...(downloadUrls.length ? { downloadUrl: downloadUrls } : {}),
    ...(APP_STORE_ID ? { installUrl: APP_STORE_LINK } : {}),
  };
}

export function plusProductJsonLd() {
  return {
    '@type': 'Product',
    '@id': `${SITE_URL}/pricing#plus`,
    name: 'Frogress Plus',
    description:
      'Frogress Plus unlocks unlimited quests and tags, double rewards on quests and tasks, season plus rewards, and Plus-only outfits and backgrounds.',
    brand: { '@id': ORG_ID },
    category: 'Productivity software subscription',
    image: absoluteUrl('/opengraph-image'),
    isRelatedTo: { '@id': APP_ID },
    offers: {
      '@type': 'AggregateOffer',
      lowPrice: PLUS_PRICING.monthly.price,
      highPrice: PLUS_PRICING.yearly.price,
      priceCurrency: 'USD',
      offerCount: 2,
      offers: plusOffers(),
    },
  };
}

export type Crumb = { name: string; path: string };

export function breadcrumbJsonLd(crumbs: Crumb[]) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((crumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: crumb.name,
      item: absoluteUrl(crumb.path),
    })),
  };
}

export type FaqItem = { question: string; answer: string };

export function faqJsonLd(items: readonly FaqItem[]) {
  return {
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: item.answer },
    })),
  };
}

export function graph(...nodes: Record<string, unknown>[]) {
  return { '@context': 'https://schema.org', '@graph': nodes };
}

export const HOMEPAGE_FAQ: readonly FaqItem[] = [
  {
    question: 'Is Frogress free?',
    answer:
      'Yes. The to-do list, weekly planner, focus timer, daily quests, streaks and your frog are all free on web, iOS and Android, with no card required. Frogress Plus is an optional subscription that adds unlimited quests and tags, double rewards, and Plus-only outfits and backgrounds.',
  },
  {
    question: 'What makes Frogress different from a normal to-do list app?',
    answer:
      'Underneath, Frogress is a real task manager: due dates, repeats, tags, notes, subtasks, reminders and calendar sync. On top of that, every task you finish earns a fly, and flies feed and dress a pet frog that lives in the app. The list does the work; the frog is the reason you keep opening it.',
  },
  {
    question: 'How is Frogress different from Habitica or Finch?',
    answer:
      'Habitica turns your habits into an RPG with parties, stats and boss fights. Finch is built around self-care check-ins and journaling. Frogress keeps a plain, fast to-do list and planner at the centre and puts a single pet frog on top of it — no combat, no character sheet, and nothing is taken away when you miss a day.',
  },
  {
    question: 'What if plain to-do lists never stick for me?',
    answer:
      'That is exactly who Frogress is built for. A plain checklist gives you nothing back when you tick something off, so the list slowly stops being worth opening. In Frogress, every finish pays out something small and visible — a fly caught, a quest ticking over, a hungry frog fed — so the app is worth returning to tomorrow.',
  },
  {
    question: 'Do I need an account to try it?',
    answer:
      'No. You can start adding tasks and feeding your frog right away. Signing in with Apple, Google or an email link saves your tasks, flies and frog so they sync across devices and are never lost.',
  },
  {
    question: 'Does Frogress work on iPhone, Android and the web?',
    answer:
      'Yes. Frogress runs in any modern browser and has native iOS and Android apps. They all share one account, so tasks, flies, streaks and your frog stay in sync on every device you sign in on.',
  },
  {
    question: 'Can Frogress sync with my calendar?',
    answer:
      'Yes. Google Calendar and Apple Calendar sync two ways, so your events sit beside your tasks in the planner and changes you make in Frogress flow back to your calendar.',
  },
  {
    question: 'How does the focus timer work?',
    answer:
      'Pick one task and start a session. On iPhone the timer runs on the Lock Screen and in the Dynamic Island, and the end-of-session alarm rings even in Silent mode. Finished sessions pay out flies, so focused time counts towards your frog as well.',
  },
  {
    question: 'What are flies, and what do I spend them on?',
    answer:
      'Flies are what finishing pays. You earn them by completing tasks, finishing focus sessions, keeping streaks and claiming daily quests. You spend them on hats, outfits, held items, gift boxes and whole new ponds for your frog.',
  },
  {
    question: 'Does my frog die if I stop using the app?',
    answer:
      'Never. Your frog gets hungry when tasks pile up and cheers up when you feed it, but nothing is ever deleted, lost or killed off. Come back after a month away and your frog, your flies and your wardrobe are all still there.',
  },
  {
    question: 'Can I use Frogress with a friend?',
    answer:
      'Yes. Add friends with a code, share a buddy task you both have to finish, and you each earn bonus flies when it is done. You can also see your friends’ streaks and react to their frogs.',
  },
  {
    question: 'Where is my data stored, and can I delete it?',
    answer:
      'Your tasks and account data are stored on our servers so they can sync between your devices, and are covered by our Privacy Policy. You can permanently delete your account and everything in it from the profile panel inside the app, or by emailing help@frogress.com.',
  },
];
