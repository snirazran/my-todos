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
export const APP_STORE_ID =
  process.env.NEXT_PUBLIC_APP_STORE_ID?.trim() || '6762088365';
export const APP_STORE_LINK =
  process.env.NEXT_PUBLIC_APP_STORE_URL?.trim() ||
  (APP_STORE_ID ? `https://apps.apple.com/app/id${APP_STORE_ID}` : '');
export const PLAY_STORE_LINK = process.env.NEXT_PUBLIC_PLAY_STORE_URL?.trim() || '';

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
      'Yes. The to-do list, weekly planner, focus timer, daily quests, streaks and your frog are all free on the web, iPhone and Android. No card needed. Frogress Plus is an optional subscription that adds unlimited quests and tags, double rewards, and Plus-only outfits and backgrounds.',
  },
  {
    question: 'What makes Frogress different from a normal to-do list app?',
    answer:
      'Underneath, Frogress is a real task manager, with due dates, repeats, tags, notes, subtasks, reminders and calendar sync. On top of that, every task you finish earns a fly, and flies feed and dress a pet frog who lives in the app. The list does the work. The frog is why you keep opening it.',
  },
  {
    question: 'What if plain to-do lists never stick for me?',
    answer:
      'Then Frogress was built for you. A plain checklist gives you nothing back when you tick something off, so it slowly stops being worth opening. In Frogress every finish pays out something small you can see: a fly caught, a quest filling up, a hungry frog fed. That’s what brings you back tomorrow.',
  },
  {
    question: 'Do I need an account to try it?',
    answer:
      'No. Start adding tasks and feeding your frog right away. When you’re ready, sign in with Apple, Google or an email link to save your tasks, flies and frog and sync them across your devices.',
  },
  {
    question: 'Does Frogress work on iPhone, Android and the web?',
    answer:
      'Yes. Frogress runs in any modern browser and has apps for iPhone and Android. Sign in with one account and your tasks, flies, streaks and frog stay in sync everywhere.',
  },
  {
    question: 'Can Frogress sync with my calendar?',
    answer:
      'Yes. Google Calendar and Apple Calendar sync both ways. Your events sit beside your tasks in the planner, and changes you make in Frogress show up in your calendar.',
  },
  {
    question: 'How does the focus timer work?',
    answer:
      'Pick one task and start a session. On iPhone the timer shows on your Lock Screen and in the Dynamic Island, and the alarm rings even on silent. Finished sessions pay out flies, so focus time feeds your frog too.',
  },
  {
    question: 'What are flies, and what do I spend them on?',
    answer:
      'Flies are your pay for getting things done. You earn them by finishing tasks and focus sessions, keeping streaks and completing daily quests. Spend them on hats, outfits, held items, gift boxes and whole new ponds for your frog.',
  },
  {
    question: 'What happens to my frog if I take a break?',
    answer:
      'Nothing bad. Your frog gets hungry when tasks pile up and perks up the moment you feed it, and nothing is ever deleted or lost. Come back after a month away and your frog, flies and wardrobe are right where you left them.',
  },
  {
    question: 'Can I use Frogress with a friend?',
    answer:
      'Yes. Add friends with a code and share a buddy task you both need to finish. When it’s done, you each earn bonus flies. You can also see your friends’ streaks and react to their frogs.',
  },
  {
    question: 'Where is my data stored, and can I delete it?',
    answer:
      'Your tasks and account data are stored on our servers so they can sync between your devices, and are covered by our Privacy Policy. You can permanently delete your account and everything in it from the profile panel in the app, or by emailing help@frogress.com.',
  },
];
