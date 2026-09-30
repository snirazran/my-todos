'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, EllipsisVertical, RotateCcw } from 'lucide-react';
import Frog, {
  FROG_TONGUE_MOUTH_OFFSET,
  type FrogHandle,
} from '@/components/ui/frog';
import Fly from '@/components/ui/fly';
import { FrogSpeechBubble } from '@/components/ui/FrogSpeechBubble';
import { Icon } from '@/components/ui/Icon';
import { TimeTag } from '@/components/ui/TimeTag';
import { useFlyJar } from '@/components/marketing/FlyJar';
import { TONGUE_STROKE, useFrogTongue } from '@/hooks/useFrogTongue';

const tags = {
  work: { name: 'Work', color: '#6366f1' },
  home: { name: 'Home', color: '#d97706' },
  health: { name: 'Health', color: '#4d9850' },
} as const;

type HeroTask = {
  id: string;
  label: string;
  time?: string;
  reminder?: boolean;
  tag?: keyof typeof tags;
};

const taskRounds: HeroTask[][] = [
  [
    { id: 'email', label: 'Reply to the email I’ve been avoiding', time: '09:30', tag: 'work' },
    { id: 'laundry', label: 'Put away the clean laundry', tag: 'home' },
    { id: 'dentist', label: 'Book the dentist appointment', time: '15:00', reminder: true, tag: 'health' },
  ],
  [
    { id: 'plants', label: 'Water the plants', tag: 'home' },
    { id: 'stretch', label: 'Stretch for five minutes', time: '12:00', tag: 'health' },
    { id: 'bill', label: 'Pay the phone bill', time: '18:00', reminder: true },
  ],
];

const bellyStates = [
  { label: 'Hungry', pips: 1 },
  { label: 'Peckish', pips: 3 },
  { label: 'Content', pips: 5 },
  { label: 'Full', pips: 6 },
] as const;

const FLY_PX = 40;

export function MarketingFrogHero() {
  const frogRef = useRef<FrogHandle>(null);
  const frogBoxRef = useRef<HTMLDivElement>(null);
  const flyRefs = useRef<Record<string, HTMLElement | null>>({});
  const mainScrollRef = useRef<HTMLElement | null>(null);
  const { award } = useFlyJar();
  const [frogDressed, setFrogDressed] = useState(false);
  const [round, setRound] = useState(0);
  const [doneIds, setDoneIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    mainScrollRef.current = document.getElementById('main-scroll');
  }, []);

  const {
    vp,
    cinematic,
    grab,
    tipGroupEl,
    tonguePathEl,
    worldGroupEl,
    fxGroupEl,
    triggerTongue,
    visuallyDone,
  } = useFrogTongue({
    frogRef,
    frogBoxRef,
    flyRefs,
    scrollContainerRef: mainScrollRef,
    trackMovingTarget: true,
  });

  const tasks = taskRounds[round % taskRounds.length];

  const completeTask = (taskId: string) => {
    if (doneIds.has(taskId) || cinematic) return;
    void triggerTongue({
      key: taskId,
      completed: false,
      onPersist: () => {
        setDoneIds((current) => new Set(current).add(taskId));
        const box = frogBoxRef.current?.getBoundingClientRect();
        award(
          `hero-${taskId}`,
          1,
          box ? new DOMRect(box.left + box.width / 2 - 20, box.bottom - 150, 40, 40) : null,
        );
      },
    });
  };

  const refill = () => {
    setRound((value) => value + 1);
    setDoneIds(new Set());
  };

  const doneCount = tasks.filter((task) => doneIds.has(task.id)).length;
  const allDone = doneCount === tasks.length;
  const belly = bellyStates[doneCount];
  const hungry = doneCount === 0;
  const speech = grab
    ? 'Mmm!\nGot it.'
    : allDone
      ? 'So full.\nBest list ever.'
      : doneCount === 2
        ? 'One more?\nI saved room.'
        : doneCount === 1
          ? 'Tasty!\nKeep them coming.'
          : "So hungry...\nFinish a task?";

  return (
    <div className="ph-hero-demo relative mx-auto w-full max-w-[460px] pt-[226px] sm:pt-[238px]">
      <div className="absolute inset-x-0 -top-1.5 z-40 flex justify-center sm:top-0">
        <div ref={frogBoxRef} className="relative w-[250px] sm:w-[270px]">
          <FrogSpeechBubble
            rate={0}
            done={doneCount}
            total={tasks.length}
            fixedMessage={speech}
            className="!top-16"
          />
          <Image
            src="/skins/common/skin0.webp"
            alt=""
            width={216}
            height={177}
            aria-hidden
            priority
            className={`pointer-events-none absolute inset-x-0 bottom-5 z-0 mx-auto h-auto w-[210px] translate-y-[6px] transition-opacity duration-200 sm:w-[226px] ${
              frogDressed ? 'opacity-0' : 'opacity-100'
            }`}
          />
          <Frog
            ref={frogRef}
            className="relative z-10 translate-y-[6px]"
            width="100%"
            height={300}
            visualOffsetY={0}
            mouthOpen={!!grab}
            mouthOffset={FROG_TONGUE_MOUTH_OFFSET}
            indices={{ skin: 0, mood: hungry ? 1 : 0, hat: 0, body: 0, hand_item: 0 }}
            onDressed={() => setFrogDressed(true)}
          />
        </div>
      </div>

      <div className="relative z-10 rounded-[28px] bg-background px-1.5 pb-3 pt-5 shadow-[0_6px_0_rgba(15,46,29,0.08),0_30px_60px_-30px_rgba(15,46,29,0.55)] ring-1 ring-[#0f2e1d]/[0.06] dark:shadow-[0_6px_0_rgba(0,0,0,0.3),0_30px_60px_-30px_rgba(0,0,0,0.8)] dark:ring-white/10">
        <div className="mb-2 flex items-center justify-between gap-2 px-2">
          <div className="flex min-w-0 items-center gap-2">
            <Icon name="planner" className="h-7 w-7 shrink-0" />
            <span className="text-sm font-black tracking-tight text-foreground">
              {allDone ? 'All done for today!' : `${tasks.length - doneCount} to do today`}
            </span>
          </div>
          <div
            className="flex shrink-0 items-center gap-2"
            role="img"
            aria-label={`Frog belly: ${belly.label}`}
          >
            <span
              className={`text-[11px] font-black transition-colors ${
                hungry ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'
              }`}
            >
              {belly.label}
            </span>
            <span className="flex gap-[3px]">
              {Array.from({ length: 6 }).map((_, index) => (
                <span
                  key={index}
                  className={`h-3 w-[9px] rounded-full transition-colors duration-500 ${
                    index < belly.pips
                      ? hungry
                        ? 'bg-amber-400'
                        : 'bg-emerald-500'
                      : 'bg-[#0f2e1d]/10 dark:bg-white/10'
                  }`}
                  style={{ transitionDelay: `${index * 60}ms` }}
                />
              ))}
            </span>
          </div>
        </div>

        <ul className="overflow-hidden rounded-[18px] border border-border/50 bg-[hsl(150_12%_94%)] p-1.5 pb-0 shadow-sm dark:bg-background">
          {tasks.map((task, index) => {
            const done = doneIds.has(task.id) || visuallyDone.has(task.id);
            const coach = hungry && !cinematic && index === 0;
            const tag = task.tag ? tags[task.tag] : null;
            return (
              <li
                key={`${round}-${task.id}`}
                className="ph-task-in mb-1.5 rounded-xl shadow-[0_1px_2px_rgba(0,0,0,0.12)] dark:shadow-[0_1px_3px_rgba(0,0,0,0.5)]"
                style={{ animationDelay: `${index * 70}ms` }}
              >
                <button
                  type="button"
                  onClick={() => completeTask(task.id)}
                  disabled={done || cinematic}
                  className="flex w-full items-center gap-1 rounded-xl border border-transparent bg-card px-2.5 py-2.5 text-left transition-[border-color,background-color] duration-200 enabled:cursor-pointer enabled:hover:border-primary/35 disabled:cursor-default dark:bg-muted"
                  aria-label={done ? `${task.label}, done` : `Finish “${task.label}”`}
                >
                  <span
                    aria-hidden
                    className={`-ml-1 flex w-5 shrink-0 items-center justify-center self-stretch ${
                      done ? 'text-muted-foreground/20' : 'text-muted-foreground/40'
                    }`}
                  >
                    <EllipsisVertical className="h-4 w-4" />
                  </span>
                  <span
                    className={`min-w-0 flex-1 transition-opacity duration-200 ${done ? 'opacity-60' : 'opacity-100'}`}
                  >
                    {task.time || tag ? (
                      <span className="mb-1 flex flex-wrap gap-1">
                        {task.time ? (
                          <TimeTag startTime={task.time} reminder={task.reminder} />
                        ) : null}
                        {tag ? (
                          <span
                            className="tag-chip inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] font-bold leading-none shadow-sm"
                            style={
                              {
                                backgroundColor: `${tag.color}20`,
                                borderColor: `${tag.color}40`,
                                '--tag-color': tag.color,
                              } as React.CSSProperties
                            }
                          >
                            {tag.name}
                          </span>
                        ) : null}
                      </span>
                    ) : null}
                    <span
                      className={`block break-words text-[15px] font-semibold leading-snug line-through decoration-2 transition-[color,text-decoration-color] duration-300 ${
                        done
                          ? 'text-muted-foreground decoration-current'
                          : 'text-foreground decoration-transparent'
                      }`}
                    >
                      {task.label}
                    </span>
                  </span>
                  <span className="relative h-11 w-11 shrink-0">
                    {done ? (
                      <span className="absolute inset-0 grid place-items-center">
                        <CheckCircle2 className="ph-check-pop h-9 w-9 text-green-500 drop-shadow-sm" aria-hidden />
                      </span>
                    ) : (
                      <span
                        ref={(element) => {
                          flyRefs.current[task.id] = element;
                        }}
                        className="absolute inset-0 flex items-center justify-center rounded-full border-2 border-muted-foreground/20 bg-muted"
                      >
                        {coach ? (
                          <>
                            <span
                              aria-hidden
                              className="pointer-events-none absolute -inset-0.5 rounded-full ring-[3px] ring-amber-400/90 animate-[demo-glow-breathe_2.4s_ease-in-out_infinite]"
                            />
                            <span
                              aria-hidden
                              className="pointer-events-none absolute -inset-0.5 rounded-full ring-[3px] ring-amber-400 animate-[demo-sonar_2.4s_cubic-bezier(0,0,0.2,1)_infinite] motion-reduce:hidden"
                            />
                          </>
                        ) : null}
                        <Fly size={40} y={-3} interactive={false} />
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        <div className="mt-2 flex min-h-9 items-center justify-center px-2">
          {allDone ? (
            <button
              type="button"
              onClick={refill}
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-[13px] font-black text-[#34631f] transition-colors hover:bg-[#4f9149]/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#4f9149] dark:text-[#9fd98f]"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden />
              Add three more
            </button>
          ) : (
            <p className="text-center text-[12px] font-bold text-muted-foreground">
              Tap a task to feed the frog
            </p>
          )}
        </div>
      </div>

      {grab && (
        <svg
          key={grab.startAt}
          className="pointer-events-none fixed inset-0 z-[200]"
          width={vp.w}
          height={vp.h}
          viewBox={`0 0 ${vp.w} ${vp.h}`}
          preserveAspectRatio="none"
          style={{ width: vp.w, height: vp.h }}
        >
          <defs>
            <linearGradient id="marketing-tongue-gradient" x1="0" y1="0" x2="0" y2="1">
              <stop stopColor="#ff6b6b" />
              <stop offset="1" stopColor="#f43f5e" />
            </linearGradient>
          </defs>
          <g ref={worldGroupEl}>
            <path
              ref={tonguePathEl}
              d="M0 0 L0 0"
              fill="none"
              stroke="url(#marketing-tongue-gradient)"
              strokeWidth={TONGUE_STROKE}
              strokeLinecap="round"
            />
            <g ref={fxGroupEl} />
            <g ref={tipGroupEl} style={{ visibility: 'hidden' }}>
              <circle r={10} fill="transparent" />
              <image
                href="/fly.svg"
                x={-FLY_PX / 2}
                y={-FLY_PX / 2}
                width={FLY_PX}
                height={FLY_PX}
              />
            </g>
          </g>
        </svg>
      )}
    </div>
  );
}
