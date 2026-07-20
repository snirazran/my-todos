import Link from 'next/link';
import {
  ArrowRight,
  Monitor,
  Smartphone,
} from 'lucide-react';
import { Icon } from '@/components/ui/Icon';
import Fly from '@/components/ui/fly';
import { MarketingFrogHero } from '@/components/marketing/MarketingFrogHero';
import { MarketingFocusPreview } from '@/components/marketing/MarketingFocusPreview';
import { MarketingPlannerPreview } from '@/components/marketing/MarketingPlannerPreview';
import { MarketingQuestPreview } from '@/components/marketing/MarketingQuestPreview';
import { MarketingWardrobePreview } from '@/components/marketing/MarketingWardrobePreview';

const supportingFeatures = [
  {
    icon: 'community' as const,
    title: 'Bring a buddy',
    description: 'Share tasks, send a little encouragement, and see each other follow through.',
  },
  {
    icon: 'googleCalendar' as const,
    secondIcon: 'appleCalendar' as const,
    title: 'Your calendars, if you want them',
    description: 'Bring Google Calendar or Apple Calendar events into the same plan as your tasks.',
  },
];

export function PublicHomepage() {
  return (
    <div data-public-home className="relative z-10 min-h-full bg-background text-foreground">
      <section className="relative isolate overflow-hidden">
        <picture aria-hidden className="absolute inset-0 -z-20 block h-full w-full">
          <source media="(min-width: 1920px)" srcSet="/bg-web-large.webp" />
          <source media="(min-width: 1280px)" srcSet="/bg-web.webp" />
          <source media="(min-width: 768px)" srcSet="/bg-tablet.webp" />
          <img src="/bg-mobile.webp" alt="" className="h-full w-full object-cover object-top" />
        </picture>
        <div
          aria-hidden
          className="absolute inset-0 -z-10 bg-gradient-to-b from-white/20 via-white/5 to-background dark:from-[#07140d]/15 dark:via-[#07140d]/20 dark:to-background"
        />

        <header className="mx-auto flex w-full max-w-7xl items-center justify-between px-5 py-5 sm:px-8 lg:px-10">
          <Link
            href="/"
            aria-label="Frogress home"
            className="group flex items-center gap-2 rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
          >
            <span className="text-2xl font-black tracking-tighter text-transparent bg-gradient-to-r from-[#245f2c] via-emerald-600 to-[#245f2c] bg-clip-text dark:from-[#b5e697] dark:via-emerald-300 dark:to-[#b5e697]">
              Frogress
            </span>
            <img
              src="/fly.svg"
              alt=""
              className="h-7 w-7 -translate-y-1 transition-transform group-hover:-translate-y-2 group-hover:rotate-6"
            />
          </Link>

          <nav aria-label="Main navigation" className="flex items-center gap-2 sm:gap-5">
            <Link
              href="#how-it-works"
              className="hidden text-sm font-bold text-[#244b38] underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary dark:text-[#d9eadd] sm:inline"
            >
              How it works
            </Link>
            <Link
              href="#planner"
              className="hidden text-sm font-bold text-[#244b38] underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary dark:text-[#d9eadd] md:inline"
            >
              Planner
            </Link>
            <Link
              href="#features"
              className="hidden text-sm font-bold text-[#244b38] underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary dark:text-[#d9eadd] lg:inline"
            >
              Rewards
            </Link>
            <Link
              href="/pricing"
              className="hidden text-sm font-bold text-[#244b38] underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary dark:text-[#d9eadd] md:inline"
            >
              Pricing
            </Link>
            <Link
              href="/login"
              className="rounded-full border border-white/70 bg-card/75 px-4 py-2.5 text-sm font-black text-foreground shadow-sm backdrop-blur-xl transition-colors hover:bg-card focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary dark:border-white/15"
            >
              Sign in
            </Link>
          </nav>
        </header>

        <div className="mx-auto grid w-full max-w-7xl items-center gap-2 px-5 pb-20 pt-7 sm:px-8 sm:pt-12 lg:grid-cols-[0.92fr_1.08fr] lg:gap-8 lg:px-10 lg:pb-28 lg:pt-16">
          <div className="relative z-20 mx-auto max-w-xl text-center lg:mx-0 lg:text-left">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/70 bg-card/70 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-[#2e6338] shadow-sm backdrop-blur-xl dark:border-white/15 dark:text-[#a9df97]">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              For brains that need a little payoff
            </div>
            <h1 className="mt-6 text-balance text-5xl font-black leading-[0.98] tracking-[-0.055em] text-[#163a29] drop-shadow-[0_1px_0_rgba(255,255,255,0.5)] dark:text-[#f0f8f1] dark:drop-shadow-none sm:text-6xl lg:text-7xl">
              Finish a task. Feed a frog.
            </h1>
            <p className="mx-auto mt-6 max-w-[65ch] text-pretty text-base font-semibold leading-7 text-[#315844] lg:mx-0 lg:text-lg lg:leading-8 dark:text-[#c5d8ca]">
              Frogress is a to-do list for people who need more than another
              checkbox. Plan your week, focus on one thing, and watch your frog
              catch lunch when you get it done.
            </p>

            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row lg:justify-start">
              <Link
                href="/welcome"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#245f2c] px-6 py-3 text-sm font-black text-white shadow-lg shadow-[#17451f]/25 transition-transform hover:-translate-y-0.5 hover:bg-[#1f5526] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#245f2c] active:translate-y-0 dark:bg-[#79bc5a] dark:text-[#102414] dark:hover:bg-[#89ca68]"
              >
                Start with one task
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              <Link
                href="/try"
                className="hidden min-h-12 items-center justify-center rounded-2xl border border-white/80 bg-card/70 px-6 py-3 text-sm font-black text-foreground shadow-sm backdrop-blur-xl transition-colors hover:bg-card focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary dark:border-white/15 sm:inline-flex"
              >
                Try the frog catch
              </Link>
              <Link
                href="/get-app"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-white/80 bg-card/70 px-6 py-3 text-sm font-black text-foreground shadow-sm backdrop-blur-xl transition-colors hover:bg-card focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary dark:border-white/15 sm:hidden"
              >
                <Smartphone className="h-4 w-4" aria-hidden />
                Download the app
              </Link>
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs font-bold text-[#3d604e] lg:justify-start dark:text-[#a8bcad]">
              <span className="inline-flex items-center gap-1.5">
                <Monitor className="h-4 w-4" aria-hidden />
                Full web app
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Smartphone className="h-4 w-4" aria-hidden />
                iOS &amp; Android
              </span>
              <span>Free to start</span>
            </div>
          </div>

          <MarketingFrogHero />
        </div>
      </section>

      <section
        id="how-it-works"
        className="relative -mt-8 rounded-t-[36px] border-t border-border/50 bg-background py-20 shadow-[0_-18px_50px_-35px_rgba(14,55,33,0.5)] sm:rounded-t-[48px] lg:py-28"
      >
        <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-primary">
              One task. One reward.
            </p>
            <h2 className="mt-3 text-balance text-3xl font-black tracking-tight sm:text-5xl">
              Your checkbox has a frog attached.
            </h2>
            <p className="mx-auto mt-4 max-w-[65ch] text-pretty text-sm font-medium leading-7 text-muted-foreground sm:text-base">
              You still get a proper task manager. Your frog makes finishing
              something feel better than watching a box change color.
            </p>
          </div>

          <div className="mt-12 grid gap-4 md:grid-cols-3">
            <article className="relative overflow-hidden rounded-[28px] border border-border/60 bg-card p-6 shadow-sm">
              <span className="absolute right-5 top-4 font-display text-6xl text-primary/10">1</span>
              <Icon name="planner" className="h-12 w-12" />
              <h3 className="mt-5 text-lg font-black">Get it out of your head</h3>
              <p className="mt-2 text-sm font-medium leading-6 text-muted-foreground">
                Add the work thing, the walk, the call, or the chore. Give it a
                day now, or save it until you are ready.
              </p>
            </article>

            <article className="relative overflow-hidden rounded-[28px] border border-border/60 bg-card p-6 shadow-sm">
              <span className="absolute right-5 top-4 font-display text-6xl text-primary/10">2</span>
              <div className="grid h-12 w-12 place-items-center rounded-full border-2 border-muted-foreground/20 bg-muted">
                <Fly size={40} y={0} interactive={false} alwaysPlay />
              </div>
              <h3 className="mt-5 text-lg font-black">Do one thing</h3>
              <p className="mt-2 text-sm font-medium leading-6 text-muted-foreground">
                Check it off—or put it on a focus timer when starting is the
                hard part. Your frog hunts while you work.
              </p>
            </article>

            <article className="relative overflow-hidden rounded-[28px] border border-border/60 bg-card p-6 shadow-sm">
              <span className="absolute right-5 top-4 font-display text-6xl text-primary/10">3</span>
              <Icon name="wardrobe" className="h-12 w-12" />
              <h3 className="mt-5 text-lg font-black">Your frog gets lunch</h3>
              <p className="mt-2 text-sm font-medium leading-6 text-muted-foreground">
                Finished tasks keep your frog fed and earn flies. Quests turn
                those ordinary wins into gifts, skins, and new ponds.
              </p>
            </article>
          </div>
        </div>
      </section>

      <section id="planner" className="overflow-hidden bg-[#153b2b] py-20 text-white lg:py-28">
        <div className="mx-auto grid w-full max-w-7xl items-center gap-12 px-5 sm:px-8 lg:grid-cols-[0.8fr_1.2fr] lg:px-10">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[#a9db8f]">
              A visual weekly planner
            </p>
            <h2 className="mt-3 text-balance text-3xl font-black tracking-tight sm:text-5xl">
              See the whole week. Move it until it works.
            </h2>
            <p className="mt-5 max-w-[65ch] text-pretty text-sm font-medium leading-7 text-white/70 sm:text-base">
              Turn a crowded list into a week you can actually follow. Drag
              tasks between days, add times, tags, and repeats, and leave the
              rest in Saved Tasks. When plans change, reshape your week in
              seconds—on web or mobile.
            </p>
            <Link
              href="/welcome"
              className="mt-7 inline-flex items-center gap-2 rounded-2xl bg-[#b7dd78] px-5 py-3 text-sm font-black text-[#153b2b] transition-transform hover:-translate-y-0.5 hover:bg-[#c5e58b] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white active:translate-y-0"
            >
              Plan your first week
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>

          <MarketingPlannerPreview />
        </div>
      </section>

      <section id="features" className="py-20 lg:py-28">
        <div className="mx-auto w-full max-w-7xl px-5 sm:px-8 lg:px-10">
          <div className="grid items-center gap-10 lg:grid-cols-[1.2fr_0.8fr] lg:gap-14">
            <div className="lg:order-2">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-primary">
                Rewards you can make your own
              </p>
              <h2 className="mt-3 text-balance text-3xl font-black tracking-tight sm:text-5xl">
                Make your progress look like yours.
              </h2>
              <p className="mt-4 max-w-[65ch] text-pretty text-sm font-medium leading-7 text-muted-foreground sm:text-base">
                Use the flies and gifts you earn to unlock skins, gear, and pond
                backgrounds. Mix them your way and give every finished task
                something fun to build toward.
              </p>
            </div>

            <div className="lg:order-1">
              <MarketingWardrobePreview />
            </div>
          </div>

          <div className="mt-20 grid items-center gap-10 lg:mt-28 lg:grid-cols-[0.8fr_1.2fr] lg:gap-14">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-primary">
                Rewards built around your priorities
              </p>
              <h2 className="mt-3 text-balance text-3xl font-black tracking-tight sm:text-5xl">
                Grow the parts of life you care about.
              </h2>
              <p className="mt-4 max-w-[65ch] text-pretty text-sm font-medium leading-7 text-muted-foreground sm:text-base">
                Choose the Areas you want to move forward—like work, fitness,
                mindfulness, or home. Each one gets its own quest. The tasks
                and focused minutes improving your life fill objectives and
                unlock rewards as you go.
              </p>
            </div>

            <MarketingQuestPreview />
          </div>
        </div>
      </section>

      <section id="focus" className="scroll-mt-6 pb-20 lg:pb-28">
        <div className="mx-auto w-full max-w-7xl px-5 sm:px-8 lg:px-10">
          <MarketingFocusPreview />
        </div>
      </section>

      <section className="pb-20 lg:pb-28">
        <div className="mx-auto w-full max-w-7xl px-5 sm:px-8 lg:px-10">
          <div className="grid border-y border-border/70 md:grid-cols-2">
            {supportingFeatures.map((feature, index) => (
              <article
                key={feature.title}
                className={`flex gap-4 py-7 md:px-6 lg:py-9 ${
                  index < supportingFeatures.length - 1 ? 'border-b md:border-b-0 md:border-r' : ''
                } border-border/70`}
              >
                <div className="flex shrink-0 items-center">
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
            ))}
          </div>
        </div>
      </section>

      <section className="px-5 pb-20 sm:px-8 lg:px-10 lg:pb-28">
        <div className="relative mx-auto flex w-full max-w-7xl flex-col gap-8 overflow-hidden rounded-[34px] bg-[#cfe7a1] px-6 py-12 text-[#153b2b] sm:px-10 md:flex-row md:items-center md:justify-between md:gap-10 lg:gap-14 lg:px-14 lg:py-14">
          <div className="relative z-10 min-w-0 max-w-xl">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[#397a3b]">Start small</p>
            <h2 className="mt-3 text-balance text-3xl font-black tracking-tight sm:text-5xl">
              Make a little Frogress today.
            </h2>
            <p className="mt-4 max-w-[55ch] text-pretty text-sm font-bold leading-6 text-[#3d604e]">
              Got one thing you have been avoiding? Put it on the list. Your frog will handle lunch.
            </p>
          </div>
          <Link
            href="/welcome"
            className="relative z-10 inline-flex min-h-12 w-full shrink-0 items-center justify-center gap-2 self-start rounded-2xl bg-[#153b2b] px-6 py-3 text-sm font-black text-white shadow-lg transition-transform hover:-translate-y-0.5 hover:bg-[#0f3022] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#153b2b] active:translate-y-0 sm:w-auto md:self-center"
          >
            Start with one task
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
          <img src="/fly.svg" alt="" className="absolute -bottom-4 left-[58%] h-24 w-24 rotate-12 opacity-20" />
        </div>
      </section>

      <footer className="border-t border-border/70 bg-card/40">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-5 py-9 text-xs font-semibold text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-10">
          <div>
            <p className="text-lg font-black tracking-tight text-foreground">Frogress</p>
            <p className="mt-1">Tasks, focus, and a frog who notices when you finish.</p>
          </div>
          <nav aria-label="Legal and support" className="flex flex-wrap gap-x-5 gap-y-3">
            <Link href="/pricing" className="hover:text-foreground hover:underline">Pricing</Link>
            <Link href="/privacy" className="hover:text-foreground hover:underline">Privacy</Link>
            <Link href="/terms" className="hover:text-foreground hover:underline">Terms</Link>
            <Link href="/refund-policy" className="hover:text-foreground hover:underline">Refunds</Link>
            <a href="mailto:support@frogress.com" className="hover:text-foreground hover:underline">Contact</a>
          </nav>
          <p>© {new Date().getFullYear()} Frogress</p>
        </div>
      </footer>
    </div>
  );
}
