import Link from 'next/link';
import { ArrowRight, ChevronDown, Monitor, Smartphone } from 'lucide-react';
import { Icon } from '@/components/ui/Icon';
import Fly from '@/components/ui/fly';
import { MarketingThemeToggle } from '@/components/marketing/MarketingThemeToggle';
import { Reveal } from '@/components/marketing/Reveal';
import { MarketingFrogHero } from '@/components/marketing/MarketingFrogHero';
import { MarketingFocusPreview } from '@/components/marketing/MarketingFocusPreview';
import { MarketingPlannerPreview } from '@/components/marketing/MarketingPlannerPreview';
import { MarketingWardrobePreview } from '@/components/marketing/MarketingWardrobePreview';

const navLinks = [
  { href: '#how-it-works', label: 'How it works', visibility: 'hidden sm:inline-flex' },
  { href: '#planner', label: 'Planner', visibility: 'hidden lg:inline-flex' },
  { href: '#rewards', label: 'Rewards', visibility: 'hidden md:inline-flex' },
  { href: '/pricing', label: 'Pricing', visibility: 'hidden md:inline-flex' },
];

const steps = [
  {
    step: '01',
    title: 'Get it out of your head',
    description: 'Add the work thing, the walk, the chore. Give it a day, or park it for later.',
  },
  {
    step: '02',
    title: 'Work through your day',
    description:
      'Tick tasks off as you go, break the big ones down, or start a focus timer when starting is the hard part.',
  },
  {
    step: '03',
    title: 'Spoil your frog',
    description: 'Every finish earns flies. Spend them on outfits, gear, and new ponds.',
  },
] as const;

const supportingFeatures = [
  {
    icon: 'quests' as const,
    title: 'Daily quests',
    description: 'Small goals that refresh every day and pay out in flies and gift boxes.',
  },
  {
    icon: 'repeat' as const,
    title: 'Reminders and repeats',
    description: 'Give a task a time, set it to repeat, and get a nudge when it is due.',
  },
  {
    icon: 'googleCalendar' as const,
    secondIcon: 'appleCalendar' as const,
    title: 'Your calendars',
    description: 'Pull Google or Apple Calendar events into the same plan as your tasks.',
  },
  {
    icon: 'community' as const,
    title: 'Bring a buddy',
    description: 'Share a task, cheer each other on, and see who actually follows through.',
  },
  {
    icon: 'patterns' as const,
    title: 'Your patterns',
    description: 'See when you really get things done, explained in plain English.',
  },
  {
    icon: 'lilyPad' as const,
    title: 'Weekly Leaps',
    description: 'Promise one thing for the week. Clear it and the Leap pays out.',
  },
];

const navLinkClass =
  'items-center rounded-full px-3 py-2 text-sm font-bold text-[#1c4432] transition-colors hover:bg-white/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary dark:text-[#dcefe1] dark:hover:bg-white/10';

const glassButtonClass =
  'border border-[#1c4432]/20 bg-white/85 text-[#153b2b] shadow-sm transition-colors hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary dark:border-white/20 dark:bg-white/10 dark:text-[#e6f3e9] dark:hover:bg-white/20';

const accentClass = 'text-[#166534] dark:text-[#8ee0a2]';
const eyebrowClass = `text-[11px] font-black uppercase tracking-[0.28em] ${accentClass}`;
const darkEyebrowClass = 'text-[11px] font-black uppercase tracking-[0.28em] text-[#b7e39c]';
const headingClass =
  'mt-4 text-balance text-[clamp(1.9rem,4.6vw,3.4rem)] font-black leading-[1.04] tracking-[-0.042em]';
const bodyClass =
  'mt-5 max-w-[50ch] text-pretty text-base font-medium leading-8 text-muted-foreground sm:text-lg';
const darkBodyClass = 'mt-5 max-w-[50ch] text-pretty text-base font-medium leading-8 text-white/80 sm:text-lg';

export function PublicHomepage() {
  return (
    <div data-public-home className="relative z-10 min-h-full bg-background text-foreground">
      <noscript>
        <style>{`[data-reveal]{opacity:1!important;transform:none!important}`}</style>
      </noscript>

      <a
        href="#how-it-works"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-full focus:bg-card focus:px-4 focus:py-2 focus:text-sm focus:font-black focus:shadow-lg"
      >
        Skip to content
      </a>

      <section className="relative isolate">
        <div aria-hidden className="absolute inset-0 -z-30 overflow-hidden">
          <picture aria-hidden className="absolute inset-0 block h-full w-full">
            <source media="(min-width: 1920px)" srcSet="/bg-web-large.webp" />
            <source media="(min-width: 1280px)" srcSet="/bg-web.webp" />
            <source media="(min-width: 768px)" srcSet="/bg-tablet.webp" />
            <img src="/bg-mobile.webp" alt="" className="h-full w-full object-cover object-top" />
          </picture>

          <div
            aria-hidden
            className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(255,255,255,0.94)_0%,rgba(255,255,255,0.86)_30%,rgba(255,255,255,0.5)_55%,rgba(255,255,255,0.12)_78%,rgba(255,255,255,0)_100%)] dark:bg-[linear-gradient(to_bottom,rgba(5,16,11,0.9)_0%,rgba(5,16,11,0.82)_30%,rgba(5,16,11,0.55)_55%,rgba(5,16,11,0.2)_78%,rgba(5,16,11,0)_100%)] lg:bg-[linear-gradient(to_right,rgba(255,255,255,0.97)_0%,rgba(255,255,255,0.94)_26%,rgba(255,255,255,0.74)_44%,rgba(255,255,255,0.34)_62%,rgba(255,255,255,0.08)_82%,rgba(255,255,255,0)_100%)] lg:dark:bg-[linear-gradient(to_right,rgba(5,16,11,0.96)_0%,rgba(5,16,11,0.93)_26%,rgba(5,16,11,0.76)_44%,rgba(5,16,11,0.38)_62%,rgba(5,16,11,0.1)_82%,rgba(5,16,11,0)_100%)]"
          />
          <div
            aria-hidden
            className="absolute inset-x-0 bottom-0 h-56 bg-gradient-to-b from-transparent to-background"
          />
        </div>

        <header className="sticky top-0 z-50 border-b border-white/40 bg-white/70 backdrop-blur-xl dark:border-white/10 dark:bg-[#07140d]/70">
          <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3 px-5 py-3 sm:px-8 lg:px-10">
            <Link
              href="/"
              aria-label="Frogress home"
              className="group relative inline-flex shrink-0 items-center rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="bg-gradient-to-r from-primary via-emerald-500 to-primary bg-clip-text text-2xl font-black tracking-tighter text-transparent transition-all group-hover:opacity-80">
                Frogress
              </span>
            </Link>

            <nav aria-label="Main navigation" className="flex items-center gap-1 sm:gap-2">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`${link.visibility} ${navLinkClass}`}
                >
                  {link.label}
                </Link>
              ))}
              <MarketingThemeToggle />
              <Link
                href="/login"
                className={`rounded-full px-4 py-2.5 text-sm font-black ${glassButtonClass}`}
              >
                Sign in
              </Link>
            </nav>
          </div>
        </header>

        <div className="mx-auto grid w-full max-w-7xl items-center gap-2 px-5 pb-16 pt-8 sm:px-8 sm:pt-12 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] lg:gap-8 lg:px-10 lg:pb-24 lg:pt-14">
          <div className="relative z-20 mx-auto max-w-xl text-center lg:mx-0 lg:text-left">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#1c4432]/15 bg-white/85 px-3.5 py-1.5 text-[11px] font-black uppercase tracking-[0.14em] text-[#1c5231] shadow-sm dark:border-white/20 dark:bg-white/10 dark:text-[#a9df97]">
              <span className="h-2 w-2 rounded-full bg-emerald-600 dark:bg-emerald-400" />
              For brains that need a payoff
            </div>

            <h1 className="mt-6 text-balance text-5xl font-black leading-[0.98] tracking-[-0.055em] text-[#0f2f1e] dark:text-[#f2faf3] sm:text-6xl lg:text-7xl">
              Finish a task. Feed a frog.
            </h1>

            <p className="mx-auto mt-5 max-w-[42ch] text-pretty text-lg font-medium leading-8 text-[#224834] dark:text-[#cfe2d4] lg:mx-0 lg:text-xl lg:leading-9">
              A real planner with something alive at the end of it. Plan your
              week, check things off, and watch your frog catch lunch.
            </p>

            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row lg:justify-start">
              <Link
                href="/welcome"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#1f5526] px-6 py-3 text-sm font-black text-white shadow-lg shadow-[#17451f]/25 transition-transform hover:-translate-y-0.5 hover:bg-[#194720] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#1f5526] active:translate-y-0 dark:bg-[#79bc5a] dark:text-[#102414] dark:hover:bg-[#89ca68]"
              >
                Start with one task
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              <Link
                href="/get-app"
                className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl px-6 py-3 text-sm font-black sm:hidden ${glassButtonClass}`}
              >
                <Smartphone className="h-4 w-4" aria-hidden />
                Download the app
              </Link>
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-[13px] font-bold text-[#2b5140] dark:text-[#b5cbbb] lg:justify-start">
              <span className="inline-flex items-center gap-1.5">
                <Monitor className="h-4 w-4" aria-hidden />
                Web
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Smartphone className="h-4 w-4" aria-hidden />
                iOS &amp; Android
              </span>
              <span>Free to start — no card</span>
            </div>
          </div>

          <MarketingFrogHero />
        </div>

        <div
          aria-hidden
          className="relative z-20 -mb-12 hidden justify-center pb-16 text-[#2b5140] dark:text-[#9fbba7] lg:flex"
        >
          <ChevronDown className="h-5 w-5 animate-bounce motion-reduce:animate-none" />
        </div>
      </section>

      <section
        id="how-it-works"
        className="relative z-10 -mt-8 scroll-mt-20 rounded-t-[36px] border-t border-border/50 bg-background py-16 shadow-[0_-18px_50px_-35px_rgba(14,55,33,0.5)] sm:rounded-t-[48px] sm:py-20 lg:py-24"
      >
        <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">
          <Reveal className="mx-auto max-w-2xl text-center">
            <p className={eyebrowClass}>How it works</p>
            <h2 className={`${headingClass} mx-auto`}>Three moves. That is the whole app.</h2>
            <p className="mx-auto mt-5 max-w-[46ch] text-pretty text-base font-medium leading-8 text-muted-foreground sm:text-lg">
              A real task manager underneath — with a frog who notices when you
              finish.
            </p>
          </Reveal>

          <ol className="mt-14 grid gap-4 md:grid-cols-3">
            {steps.map((item, index) => (
              <li key={item.step} className="h-full">
                <Reveal
                  delay={index * 90}
                  className="relative h-full overflow-hidden rounded-[28px] border border-border/60 bg-card p-6 shadow-sm transition-shadow duration-300 hover:shadow-lg"
                >
                  <div className="flex items-center gap-3">
                    {index === 1 ? (
                      <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full border-2 border-muted-foreground/20 bg-muted">
                        <Fly size={40} y={0} interactive={false} alwaysPlay />
                      </div>
                    ) : (
                      <Icon
                        name={index === 0 ? 'planner' : 'wardrobe'}
                        className="h-12 w-12 shrink-0"
                      />
                    )}
                    <span
                      className={`ml-auto rounded-full bg-[#166534]/10 px-2.5 py-1 text-[11px] font-black tabular-nums dark:bg-[#8ee0a2]/15 ${accentClass}`}
                    >
                      {item.step}
                    </span>
                  </div>
                  <h3 className="mt-5 text-lg font-black">{item.title}</h3>
                  <p className="mt-2 text-sm font-medium leading-6 text-muted-foreground">
                    {item.description}
                  </p>
                </Reveal>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="planner" className="scroll-mt-20 px-3 sm:px-5 lg:px-6">
        <div className="overflow-hidden rounded-[36px] bg-[#153b2b] py-16 text-white sm:rounded-[52px] sm:py-20 lg:py-24">
          <div className="mx-auto grid w-full max-w-7xl grid-cols-[minmax(0,1fr)] items-center gap-12 px-5 sm:px-8 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:px-10">
            <Reveal>
              <p className={darkEyebrowClass}>The weekly planner</p>
              <h2 className={headingClass}>See the whole week. Move it until it works.</h2>
              <p className={darkBodyClass}>
                Drag tasks between days. Add times, tags, and repeats. Park the
                rest in Saved Tasks until you are ready for them.
              </p>
              <p className="mt-4 text-sm font-black text-[#b7e39c]">
                Go on — grab a card and move it.
              </p>
              <Link
                href="/welcome"
                className="mt-7 inline-flex min-h-12 items-center gap-2 rounded-2xl bg-[#b7dd78] px-5 py-3 text-sm font-black text-[#12331f] transition-transform hover:-translate-y-0.5 hover:bg-[#c5e58b] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white active:translate-y-0"
              >
                Plan your first week
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </Reveal>

            <Reveal delay={120}>
              <MarketingPlannerPreview />
            </Reveal>
          </div>
        </div>
      </section>

      <section id="focus" className="scroll-mt-20 py-16 sm:py-20 lg:py-24">
        <div className="mx-auto w-full max-w-7xl px-5 sm:px-8 lg:px-10">
          <Reveal>
            <MarketingFocusPreview />
          </Reveal>
        </div>
      </section>

      <section
        id="rewards"
        className="scroll-mt-20 bg-[#f3f8ef] py-16 dark:bg-[#08190f] sm:py-20 lg:py-24"
      >
        <div className="mx-auto w-full max-w-7xl px-5 sm:px-8 lg:px-10">
          <div className="grid grid-cols-[minmax(0,1fr)] items-center gap-10 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] lg:gap-14">
            <Reveal className="lg:order-2">
              <p className={eyebrowClass}>The payoff</p>
              <h2 className={headingClass}>Progress you can actually look at.</h2>
              <p className={bodyClass}>
                Flies are what finishing pays. Spend them on skins, hats, held
                items, and whole new ponds — then let your friends react to the
                fit.
              </p>
              <p className={`mt-4 text-sm font-black ${accentClass}`}>
                This wardrobe is live. Dress the frog.
              </p>
            </Reveal>

            <Reveal delay={120} className="lg:order-1">
              <MarketingWardrobePreview />
            </Reveal>
          </div>
        </div>
      </section>

      <section className="py-16 sm:py-20 lg:py-24">
        <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">
          <Reveal className="mx-auto max-w-2xl text-center">
            <p className={eyebrowClass}>The rest of it</p>
            <h2 className={`${headingClass} mx-auto`}>
              Everything a to-do list should already do.
            </h2>
          </Reveal>

          <div className="mt-14 grid gap-x-10 gap-y-9 sm:grid-cols-2 lg:grid-cols-3">
            {supportingFeatures.map((feature, index) => (
              <Reveal key={feature.title} delay={(index % 3) * 80}>
                <article className="flex gap-4">
                  <div className="flex shrink-0 items-start">
                    <Icon name={feature.icon} className="h-11 w-11" />
                    {'secondIcon' in feature ? (
                      <Icon name={feature.secondIcon!} className="-ml-1 h-11 w-11" />
                    ) : null}
                  </div>
                  <div>
                    <h3 className="text-base font-black">{feature.title}</h3>
                    <p className="mt-1.5 text-sm font-medium leading-6 text-muted-foreground">
                      {feature.description}
                    </p>
                  </div>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="px-5 pb-16 sm:px-8 sm:pb-20 lg:px-10 lg:pb-24">
        <Reveal className="relative mx-auto flex w-full max-w-7xl flex-col gap-8 overflow-hidden rounded-[34px] bg-[#cfe7a1] px-6 py-14 text-[#153b2b] sm:px-10 md:flex-row md:items-center md:justify-between md:gap-10 lg:gap-14 lg:px-14">
          <div className="relative z-10 min-w-0 max-w-xl">
            <p className="text-[11px] font-black uppercase tracking-[0.28em] text-[#28532c]">
              Start small
            </p>
            <h2 className="mt-4 text-balance text-[clamp(1.9rem,4.6vw,3.4rem)] font-black leading-[1.04] tracking-[-0.042em]">
              Make a little Frogress today.
            </h2>
            <p className="mt-5 max-w-[46ch] text-pretty text-base font-bold leading-7 text-[#2c5340]">
              Got something you have been avoiding? Put it on the list. Your
              frog handles lunch.
            </p>
          </div>
          <div className="relative z-10 flex shrink-0 flex-col gap-3 self-start md:self-center">
            <Link
              href="/welcome"
              className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#153b2b] px-6 py-3 text-sm font-black text-white shadow-lg transition-transform hover:-translate-y-0.5 hover:bg-[#0f3022] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#153b2b] active:translate-y-0 sm:w-auto"
            >
              Start with one task
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <Link
              href="/get-app"
              className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-[#153b2b]/25 bg-white/70 px-6 py-3 text-sm font-black text-[#153b2b] transition-colors hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#153b2b] sm:w-auto"
            >
              <Smartphone className="h-4 w-4" aria-hidden />
              Get it on iOS or Android
            </Link>
          </div>
          <img
            src="/fly.svg"
            alt=""
            className="absolute -bottom-4 left-[58%] h-24 w-24 rotate-12 opacity-20"
          />
        </Reveal>
      </section>

      <footer className="border-t border-border/70 bg-card/40">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-5 py-9 text-xs font-semibold text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-10">
          <div>
            <p className="text-lg font-black tracking-tight text-foreground">Frogress</p>
            <p className="mt-1">Tasks, focus, and a frog who notices when you finish.</p>
          </div>
          <nav aria-label="Legal and support" className="flex flex-wrap gap-x-5 gap-y-3">
            <Link href="/pricing" className="hover:text-foreground hover:underline">
              Pricing
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
            <a href="mailto:help@frogress.com" className="hover:text-foreground hover:underline">
              Contact
            </a>
          </nav>
          <p>© {new Date().getFullYear()} Frogress</p>
        </div>
      </footer>
    </div>
  );
}
