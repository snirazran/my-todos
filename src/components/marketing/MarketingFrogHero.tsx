'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { Check, EllipsisVertical } from 'lucide-react';
import Frog, {
  FROG_TONGUE_MOUTH_OFFSET,
  type FrogHandle,
} from '@/components/ui/frog';
import Fly from '@/components/ui/fly';
import { FrogSpeechBubble } from '@/components/ui/FrogSpeechBubble';
import { Icon } from '@/components/ui/Icon';
import { TONGUE_STROKE, useFrogTongue } from '@/hooks/useFrogTongue';

const heroTasks = [
  { id: 'email', label: 'Reply to the email I’ve been avoiding', initiallyDone: false },
  { id: 'laundry', label: 'Put away the clean laundry', initiallyDone: false },
  { id: 'dentist', label: 'Book the dentist appointment', initiallyDone: true },
] as const;

const FLY_PX = 40;

export function MarketingFrogHero() {
  const frogRef = useRef<FrogHandle>(null);
  const frogBoxRef = useRef<HTMLDivElement>(null);
  const flyRefs = useRef<Record<string, HTMLElement | null>>({});
  const mainScrollRef = useRef<HTMLElement | null>(null);
  const [frogDressed, setFrogDressed] = useState(false);
  const [doneIds, setDoneIds] = useState<Set<string>>(
    () => new Set(heroTasks.filter((task) => task.initiallyDone).map((task) => task.id)),
  );

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

  const completeTask = (taskId: string) => {
    if (doneIds.has(taskId) || cinematic) return;
    void triggerTongue({
      key: taskId,
      completed: false,
      onPersist: () => {
        setDoneIds((current) => {
          const next = new Set(current);
          next.add(taskId);
          return next;
        });
      },
    });
  };

  const doneCount = doneIds.size;
  const openTasks = heroTasks.length - doneCount;
  const hungerPips = Math.min(6, 3 + doneCount);
  const speech = grab
    ? 'Got it!\nHang on...'
    : doneCount === heroTasks.length
      ? 'All done!\nThat hit the spot.'
      : doneCount > 1
        ? `Nice one!\n${openTasks} fly left.`
        : "Pick a task.\nI'll catch the fly!";

  return (
    <div className="relative mx-auto h-[620px] w-full max-w-[560px] sm:h-[630px] lg:h-[650px]">
      <div className="absolute inset-x-0 -top-2 z-40 flex justify-center">
        <div ref={frogBoxRef} className="relative w-[250px] sm:w-[280px]">
          <FrogSpeechBubble
            rate={0}
            done={doneCount}
            total={heroTasks.length}
            fixedMessage={speech}
            className="!top-20"
          />
          <Image
            src="/skins/common/skin0.webp"
            alt=""
            width={216}
            height={177}
            aria-hidden
            className={`pointer-events-none absolute inset-x-0 bottom-5 z-0 mx-auto h-auto w-[210px] translate-y-[6px] transition-opacity duration-200 sm:w-[230px] ${
              frogDressed ? 'opacity-0' : 'opacity-100'
            }`}
          />
          <Frog
            ref={frogRef}
            className="relative z-10 translate-y-[6px]"
            width="100%"
            height={315}
            visualOffsetY={0}
            mouthOpen={!!grab}
            mouthOffset={FROG_TONGUE_MOUTH_OFFSET}
            indices={{ skin: 0, mood: 0, hat: 0, body: 0, hand_item: 0 }}
            onDressed={() => setFrogDressed(true)}
          />
        </div>
      </div>

      <div className="absolute inset-x-2 top-[237px] z-30 mx-auto flex h-[52px] max-w-[350px] items-center gap-3 rounded-[18px] border border-border/50 bg-card/90 px-4 shadow-lg backdrop-blur-2xl sm:top-[247px]">
        <span className="w-[58px] shrink-0 text-[11px] font-black tracking-wide text-emerald-600 dark:text-emerald-400">
          {doneCount === heroTasks.length ? 'Full' : 'Content'}
        </span>
        <div className="flex flex-1 gap-1">
          {Array.from({ length: 6 }).map((_, index) => (
            <span
              key={index}
              className={`h-3.5 flex-1 rounded-full transition-all duration-500 ${
                index < hungerPips ? 'bg-emerald-500' : 'bg-muted'
              }`}
            />
          ))}
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-0 z-10 rounded-[28px] border border-border/50 bg-muted/70 px-4 pb-5 pt-7 shadow-[0_24px_70px_-24px_rgba(14,55,33,0.45)] dark:bg-background sm:px-6 sm:pb-6 sm:pt-8">
        <div className="mb-3 flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <Icon name="planner" className="h-8 w-8" />
            <span className="text-sm font-black lowercase text-foreground">
              {openTasks === 0
                ? 'all done for today!'
                : `${openTasks} ${openTasks === 1 ? 'fly' : 'flies'} left for today!`}
            </span>
          </div>
          <span className="rounded-full bg-primary/10 px-3 py-1.5 text-[10px] font-black text-primary">
            Today
          </span>
        </div>

        <div className="space-y-2">
          {heroTasks.map((task) => {
            const done = doneIds.has(task.id) || visuallyDone.has(task.id);
            return (
              <button
                key={task.id}
                type="button"
                onClick={() => completeTask(task.id)}
                disabled={done || cinematic}
                className="flex min-h-14 w-full items-center gap-2 rounded-xl border border-transparent bg-card px-2.5 py-2 text-left shadow-[0_1px_2px_rgba(0,0,0,0.12)] transition-[border-color,transform] enabled:cursor-pointer enabled:hover:border-primary/35 enabled:active:scale-[0.99] disabled:cursor-default dark:bg-muted dark:shadow-[0_1px_3px_rgba(0,0,0,0.5)]"
                aria-label={done ? `${task.label}, completed` : `Complete ${task.label}`}
              >
                <EllipsisVertical className="h-4 w-4 shrink-0 text-muted-foreground/40" aria-hidden />
                <span
                  className={`min-w-0 flex-1 text-sm font-semibold ${
                    done
                      ? 'text-muted-foreground line-through decoration-2'
                      : 'text-foreground'
                  }`}
                >
                  {task.label}
                </span>
                <span
                  ref={(element) => {
                    flyRefs.current[task.id] = element;
                  }}
                  className={`relative grid h-10 w-10 shrink-0 place-items-center rounded-full border-2 ${
                    done
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-muted-foreground/20 bg-muted'
                  }`}
                >
                  {done ? (
                    <Check className="h-5 w-5 stroke-[3]" aria-hidden />
                  ) : (
                    <Fly
                      size={31}
                      y={-3}
                      interactive={false}
                      className="relative"
                    />
                  )}
                </span>
              </button>
            );
          })}
        </div>
        <p className="mt-3 text-center text-[10px] font-bold text-muted-foreground">
          Complete an unfinished task to watch your frog catch its fly.
        </p>
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
              vectorEffect="non-scaling-stroke"
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
