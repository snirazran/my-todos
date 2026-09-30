import Image from 'next/image';
import Link from 'next/link';
import { Check, Smartphone } from 'lucide-react';
import { Icon } from '@/components/ui/Icon';
import { MarketingThemeToggle } from '@/components/marketing/MarketingThemeToggle';
import { FlyJarCounter, FlyJarProvider, FlyJarTally } from '@/components/marketing/FlyJar';
import { MarketingFrogHero } from '@/components/marketing/MarketingFrogHero';
import { MarketingFocusPreview } from '@/components/marketing/MarketingFocusPreview';
import { MarketingPlannerPreview } from '@/components/marketing/MarketingPlannerPreview';
import { MarketingWardrobePreview } from '@/components/marketing/MarketingWardrobePreview';
import { MarketingFaq } from '@/components/marketing/MarketingFaq';
import { DEFAULT_BACKGROUND_IMAGES } from '@/lib/backgrounds/constants';
import { HOMEPAGE_FAQ } from '@/lib/seo';

const navLinks = [
  { href: '#how-it-works', label: 'How it works' },
  { href: '#planner', label: 'Features' },
  { href: '#faq', label: 'FAQ' },
  { href: '/pricing', label: 'Pricing' },
];

const steps = [
  {
    pad: '/leap/leap-1.png',
    title: 'Write it down',
    description:
      'Type it the way you’d say it, like “gym tomorrow 7am”. Frogress sets the day and time for you.',
  },
  {
    pad: '/leap/leap-2.png',
    title: 'Get it done',
    description:
      'Tap the fly when you finish. Stuck? Break it into small steps or start a focus timer.',
  },
  {
    pad: '/leap/leap-3.png',
    title: 'Feed your frog',
    description:
      'Every task you finish earns flies. Spend them on outfits, hats and whole new ponds.',
  },
] as const;

const features = [
  {
    icon: 'repeat' as const,
    title: 'Reminders and repeats',
    description: 'Give a task a time and get a nudge when it’s due. Repeat anything daily or weekly.',
  },
  {
    icon: 'googleCalendar' as const,
    secondIcon: 'appleCalendar' as const,
    title: 'Two-way calendar sync',
    description: 'Google and Apple Calendar events sit next to your tasks. Changes sync both ways.',
  },
  {
    icon: 'planner' as const,
    title: 'Steps for big tasks',
    description: 'Break a scary task into small steps and tick them off one at a time.',
  },
  {
    icon: 'quests' as const,
    title: 'Daily quests',
    description: 'Small goals that refresh every day and pay out in flies and gift boxes.',
  },
  {
    icon: 'community' as const,
    title: 'Buddy tasks',
    description: 'Share a task with a friend. Finish it together and you both earn bonus flies.',
  },
  {
    icon: 'lilyPad' as const,
    title: 'Weekly Leaps',
    description: 'Commit to one thing for the week. Clear it and the Leap pays out.',
  },
];

const navLinkClass =
  'hidden items-center rounded-full px-3 py-2 text-sm font-bold text-[#1c4432] transition-colors hover:bg-white/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary dark:text-[#dcefe1] dark:hover:bg-white/10 lg:inline-flex';

const quietButtonClass =
  'border border-[#0f2e1d]/15 bg-white/85 text-[#0f2e1d] shadow-[0_2px_0_rgba(15,46,29,0.1)] transition-colors hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary dark:border-white/20 dark:bg-white/10 dark:text-[#e6f3e9] dark:hover:bg-white/20';

const sectionX = 'mx-auto w-full max-w-6xl px-4 sm:px-8';

export function PublicHomepage() {
  return (
    <FlyJarProvider>
      <div data-public-home className="relative z-10 min-h-full bg-background text-foreground">
        <a
          href="#how-it-works"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-full focus:bg-card focus:px-4 focus:py-2 focus:text-sm focus:font-black focus:shadow-lg"
        >
          Skip to content
        </a>

        <header className="sticky top-0 z-50 border-b border-[#0f2e1d]/[0.06] bg-white/75 backdrop-blur-xl dark:border-white/10 dark:bg-[#07140d]/75">
          <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-2 px-4 py-2.5 sm:px-8 lg:px-10">
            <Link
              href="/"
              aria-label="Frogress home"
              className="group relative inline-flex shrink-0 items-center rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="bg-gradient-to-r from-primary via-emerald-500 to-primary bg-clip-text text-[22px] font-black tracking-tighter text-transparent transition-opacity group-hover:opacity-80 sm:text-2xl">
                Frogress
              </span>
            </Link>

            <nav aria-label="Main navigation" className="flex items-center gap-1.5 sm:gap-2">
              {navLinks.map((link) => (
                <Link key={link.href} href={link.href} className={navLinkClass}>
                  {link.label}
                </Link>
              ))}
              <FlyJarCounter />
              <span className="hidden sm:inline-flex">
                <MarketingThemeToggle />
              </span>
              <Link
                href="/login"
                className={`inline-flex h-10 items-center rounded-full px-4 text-sm font-black ${quietButtonClass}`}
              >
                Sign in
              </Link>
              <Link
                href="/welcome"
                className="hidden h-10 items-center rounded-full bg-[#4f9149] px-4 text-sm font-black text-white shadow-[0_3px_0_#34631f] transition-colors hover:bg-[#57a050] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#34631f] sm:inline-flex"
              >
                Start free
              </Link>
            </nav>
          </div>
        </header>

        <section className="relative isolate -mt-[61px] overflow-hidden pt-[61px]">
          <div aria-hidden className="absolute inset-0 -z-30">
            <picture className="absolute inset-0 block h-full w-full">
              <source media="(min-width: 1920px)" srcSet={DEFAULT_BACKGROUND_IMAGES.webLarge} />
              <source media="(min-width: 1280px)" srcSet={DEFAULT_BACKGROUND_IMAGES.web} />
              <source media="(min-width: 768px)" srcSet={DEFAULT_BACKGROUND_IMAGES.tablet} />
              <img src={DEFAULT_BACKGROUND_IMAGES.mobile} alt="" className="h-full w-full object-cover object-top" />
            </picture>
            <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(246,251,243,0.9)_0%,rgba(246,251,243,0.78)_38%,rgba(246,251,243,0.35)_62%,rgba(246,251,243,0.1)_100%)] dark:bg-[linear-gradient(to_bottom,rgba(5,16,11,0.88)_0%,rgba(5,16,11,0.74)_38%,rgba(5,16,11,0.45)_62%,rgba(5,16,11,0.25)_100%)] lg:bg-[linear-gradient(to_right,rgba(246,251,243,0.94)_0%,rgba(246,251,243,0.86)_30%,rgba(246,251,243,0.5)_50%,rgba(246,251,243,0.08)_72%,rgba(246,251,243,0)_100%)] lg:dark:bg-[linear-gradient(to_right,rgba(5,16,11,0.94)_0%,rgba(5,16,11,0.86)_30%,rgba(5,16,11,0.55)_50%,rgba(5,16,11,0.2)_72%,rgba(5,16,11,0.1)_100%)]" />
          </div>

          <div className="mx-auto grid w-full max-w-7xl items-center gap-10 px-4 pb-20 pt-10 sm:px-8 sm:pt-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)] lg:gap-10 lg:px-10 lg:pb-28 lg:pt-16">
            <div className="relative z-20 mx-auto max-w-xl text-center lg:mx-0 lg:max-w-[620px] lg:text-left xl:max-w-[680px]">
              <h1 className="ph-title ph-rise text-[clamp(3.1rem,13vw,4.75rem)] leading-[0.98] lg:text-[4.6rem] xl:text-[5.2rem]">
                Finish a task.
                <br />
                Feed a frog.
              </h1>

              <p
                className="ph-rise mx-auto mt-7 max-w-[40ch] text-pretty text-[17px] font-medium leading-[1.7] text-[#1d4030] dark:text-[#d3e6d8] sm:text-lg lg:mx-0 lg:text-xl lg:leading-[1.65]"
                style={{ animationDelay: '120ms' }}
              >
                A to-do list and weekly planner with a pet frog who eats every
                task you finish. The list keeps you organised. The frog keeps
                you coming back.
              </p>

              <div
                className="ph-rise mt-9 flex flex-col items-stretch justify-center gap-4 sm:flex-row sm:items-center lg:justify-start"
                style={{ animationDelay: '220ms' }}
              >
                <Link href="/welcome" className="ph-cta">
                  Start with one task
                </Link>
                <Link
                  href="/get-app"
                  className={`inline-flex min-h-14 items-center justify-center gap-2 rounded-[1.25rem] px-6 text-base font-black sm:hidden ${quietButtonClass}`}
                >
                  <Smartphone className="h-4 w-4" aria-hidden />
                  Get the app
                </Link>
              </div>

              <ul
                className="ph-rise mt-7 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[13px] font-bold text-[#23493a] dark:text-[#b5cbbb] lg:justify-start"
                style={{ animationDelay: '300ms' }}
              >
                {['Free on web, iPhone and Android', 'No card needed', 'Try it before you sign up'].map((item) => (
                  <li key={item} className="inline-flex items-center gap-1.5">
                    <Check className="h-4 w-4 text-[#4f9149]" strokeWidth={3} aria-hidden />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div className="ph-fade relative z-10" style={{ animationDelay: '180ms' }}>
              <MarketingFrogHero />
            </div>
          </div>
        </section>

        <section
          id="how-it-works"
          className="relative z-10 -mt-10 scroll-mt-20 rounded-t-[36px] bg-background pb-16 pt-16 shadow-[0_-20px_50px_-35px_rgba(14,55,33,0.55)] sm:rounded-t-[48px] sm:pb-24 sm:pt-20"
        >
          <div className={sectionX}>
            <h2 className="ph-h2 mx-auto max-w-[20ch] text-center">
              Three hops from to-do to done.
            </h2>

            <ol className="relative mt-12 grid gap-10 sm:mt-16 md:grid-cols-3 md:gap-8">
              <svg
                aria-hidden
                className="pointer-events-none absolute left-[16%] right-[16%] top-4 hidden h-16 w-[68%] text-[#4f9149]/40 md:block"
                viewBox="0 0 600 60"
                preserveAspectRatio="none"
                fill="none"
              >
                <path
                  d="M10 50 Q 150 -20 300 50 Q 450 -20 590 50"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeDasharray="2 12"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
              {steps.map((step, index) => (
                <li
                  key={step.title}
                  className="relative grid grid-cols-[88px_minmax(0,1fr)] items-center gap-4 text-left md:grid-cols-1 md:content-start md:justify-items-center md:gap-0 md:text-center"
                >
                  <div className="relative mx-auto h-[88px] w-[88px] md:h-[120px] md:w-[140px]">
                    <Image
                      src={step.pad}
                      alt=""
                      width={500}
                      height={420}
                      className="absolute inset-0 h-full w-full object-contain object-bottom"
                    />
                    <span className="absolute left-0 top-1 grid h-7 w-7 place-items-center rounded-full border-2 border-[#0f2e1d] bg-white text-[13px] font-black tabular-nums text-[#0f2e1d] shadow-[0_2px_0_#0f2e1d] md:left-1 md:top-3 md:h-8 md:w-8 md:text-sm">
                      {index + 1}
                    </span>
                  </div>
                  <div>
                    <h3 className="text-lg font-black md:mt-3">{step.title}</h3>
                    <p className="mt-1.5 max-w-[34ch] text-[15px] font-medium leading-6 text-muted-foreground md:mx-auto">
                      {step.description}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="planner" className="scroll-mt-20 bg-[#eef6ea] py-16 dark:bg-[#0a1b12] sm:py-24">
          <div className="mx-auto grid w-full max-w-7xl grid-cols-[minmax(0,1fr)] items-center gap-10 px-4 sm:px-8 lg:grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)] lg:gap-12 lg:px-10">
            <div className="text-center lg:text-left">
              <h2 className="ph-h2">Plan the whole week. Move things until it fits.</h2>
              <p className="ph-body mx-auto lg:mx-0">
                Drag tasks between days until the week feels doable. Add times,
                tags and repeats, and park the rest in Saved Tasks. Habits earn
                bigger flies as your streak grows.
              </p>
              <p className="mt-6 text-sm font-black text-[#34631f] dark:text-[#9fd98f]">
                Try it: drag a card to another day, or tap a fly.
              </p>
            </div>
            <MarketingPlannerPreview />
          </div>
        </section>

        <section id="features" className="scroll-mt-20 py-16 sm:py-24">
          <div className={sectionX}>
            <div className="rounded-[32px] border border-[#0f2e1d]/[0.07] bg-[#f6faf3] px-5 py-12 dark:border-white/[0.07] dark:bg-white/[0.03] sm:px-10 sm:py-14 lg:px-14">
              <h2 className="ph-h2 mx-auto max-w-[22ch] text-center">
                Everything you’d expect. Plus a few things you wouldn’t.
              </h2>
              <p className="ph-body mx-auto text-center">
                Reminders, repeats and calendar sync on every device, plus
                quests and friends to keep it fun.
              </p>
              <div className="mt-10 grid gap-x-10 gap-y-8 sm:mt-12 sm:grid-cols-2 lg:grid-cols-3">
                {features.map((feature) => (
                  <article key={feature.title} className="flex gap-4">
                    <div className="flex shrink-0 items-start">
                      <Icon name={feature.icon} className="h-11 w-11" />
                      {'secondIcon' in feature ? (
                        <Icon name={feature.secondIcon!} className="-ml-1.5 h-11 w-11" />
                      ) : null}
                    </div>
                    <div>
                      <h3 className="text-base font-black">{feature.title}</h3>
                      <p className="mt-1 text-[15px] font-medium leading-6 text-muted-foreground">
                        {feature.description}
                      </p>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="focus" className="scroll-mt-20 bg-[#eef6ea] py-16 dark:bg-[#0a1b12] sm:py-24">
          <div className={sectionX}>
            <MarketingFocusPreview />
          </div>
        </section>

        <section
          id="rewards"
          className="scroll-mt-20 py-16 sm:py-24"
        >
          <div className={sectionX}>
            <div className="grid grid-cols-[minmax(0,1fr)] items-center gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:gap-16">
              <div className="text-center lg:order-2 lg:text-left">
                <h2 className="ph-h2">Progress you can actually look at.</h2>
                <p className="ph-body mx-auto lg:mx-0">
                  Flies are your pay for getting things done. Spend them on
                  outfits, hats, things to hold and whole new ponds, then show
                  your friends the look.
                </p>
                <p className="mt-6 text-sm font-black text-[#34631f] dark:text-[#9fd98f]">
                  Try it: dress the frog, or hit Shuffle.
                </p>
              </div>
              <div className="lg:order-1">
                <MarketingWardrobePreview />
              </div>
            </div>
          </div>
        </section>

        <section
          id="faq"
          className="scroll-mt-20 bg-[#eef6ea] py-14 dark:bg-[#0a1b12] sm:py-24"
        >
          <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 sm:px-8 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.4fr)] lg:gap-16">
            <div className="text-center lg:sticky lg:top-28 lg:self-start lg:text-left">
              <h2 className="ph-h2">Questions, answered.</h2>
              <p className="ph-body mx-auto text-base lg:mx-0">
                Something else? Read the{' '}
                <Link
                  href="/support"
                  className="font-bold text-foreground underline underline-offset-4 hover:no-underline"
                >
                  support guide
                </Link>{' '}
                or email{' '}
                <a
                  href="mailto:help@frogress.com"
                  className="font-bold text-foreground underline underline-offset-4 hover:no-underline"
                >
                  help@frogress.com
                </a>
                .
              </p>
            </div>

            <MarketingFaq items={HOMEPAGE_FAQ} />
          </div>
        </section>

        <section className="px-2 py-16 sm:px-5 sm:py-24 lg:px-6">
          <div className="relative mx-auto w-full max-w-6xl">
            <div className="relative overflow-hidden rounded-[32px] bg-[#cfe7a1] px-6 pb-12 pt-14 text-center text-[#0f2e1d] shadow-[0_6px_0_#a9cc70] dark:bg-[#1a3a24] dark:text-[#e6f3e9] dark:shadow-[0_6px_0_#0c2014] dark:ring-1 dark:ring-white/[0.06] sm:rounded-[44px] sm:px-12 sm:pt-16 md:text-left lg:px-16">
              <div className="relative z-10 grid items-center gap-8 md:grid-cols-[minmax(0,1fr)_auto] md:gap-12">
                <div className="min-w-0">
                  <h2 className="ph-title text-[clamp(2.4rem,8vw,4rem)] leading-[1.02]">
                    Make a little Frogress today.
                  </h2>
                  <div className="mx-auto max-w-[46ch] md:mx-0">
                    <FlyJarTally />
                  </div>
                </div>
                <div className="flex flex-col items-stretch gap-4 sm:mx-auto sm:w-72 md:mx-0">
                  <Link href="/welcome" className="ph-cta">
                    Start with one task
                  </Link>
                  <Link
                    href="/get-app"
                    className="inline-flex min-h-14 items-center justify-center gap-2 rounded-[1.25rem] border border-[#0f2e1d]/20 bg-white/70 px-6 text-base font-black text-[#0f2e1d] transition-colors hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#0f2e1d] dark:border-white/15 dark:bg-white/10 dark:text-[#e6f3e9] dark:hover:bg-white/15 dark:focus-visible:outline-white"
                  >
                    <Smartphone className="h-4 w-4" aria-hidden />
                    Get the app
                  </Link>
                </div>
              </div>
            </div>
            <Image
              src="/love_frog.png"
              alt=""
              width={968}
              height={556}
              className="pointer-events-none absolute -top-[82px] right-6 z-20 hidden h-auto w-[150px] sm:block lg:right-16 lg:w-[170px] lg:-top-[92px]"
            />
          </div>
        </section>

        <footer className="border-t border-border/70">
          <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-10 text-[13px] font-semibold text-muted-foreground sm:px-8 md:flex-row md:items-center md:justify-between lg:px-10">
            <div>
              <p className="text-lg font-black tracking-tight text-foreground">Frogress</p>
              <p className="mt-1">A to-do list with a frog who notices when you finish.</p>
            </div>
            <nav aria-label="Legal and support" className="flex flex-wrap gap-x-5 gap-y-3">
              <Link href="/pricing" className="hover:text-foreground hover:underline">
                Pricing
              </Link>
              <Link href="/support" className="hover:text-foreground hover:underline">
                Support
              </Link>
              <Link href="/get-app" className="hover:text-foreground hover:underline">
                Get the app
              </Link>
              <Link href="/privacy" className="hover:text-foreground hover:underline">
                Privacy
              </Link>
              <Link href="/terms" className="hover:text-foreground hover:underline">
                Terms
              </Link>
              <Link href="/refund-policy" className="hover:text-foreground hover:underline">
                Refunds
              </Link>
              <a
                href="https://www.instagram.com/getfrogress"
                target="_blank"
                rel="me noopener noreferrer"
                className="hover:text-foreground hover:underline"
              >
                Instagram
              </a>
              <a href="mailto:help@frogress.com" className="hover:text-foreground hover:underline">
                Contact
              </a>
            </nav>
            <p>© {new Date().getFullYear()} Frogress</p>
          </div>
        </footer>
      </div>
    </FlyJarProvider>
  );
}
