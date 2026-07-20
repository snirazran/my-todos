'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import Fly from '@/components/ui/fly';
import { GiftRive } from '@/components/ui/gift-box/GiftBox';

const questPreviews = [
  {
    id: 'productive',
    area: 'Productivite',
    title: 'Build a focused workday',
    accent: '#6366f1',
    cover: '/api/quests/cover?type=category&id=d8eb461c-da89-4d6c-804b-67991c165cfb',
    objectives: [
      { label: 'Complete 4 Productive tasks', progress: 3, target: 4, reward: '25', rewardType: 'flies' },
      { label: 'Focus for 45 minutes on Productive tasks', progress: 30, target: 45, reward: '1', rewardType: 'gift' },
      { label: 'Add 3 Productive tasks', progress: 2, target: 3, reward: '15', rewardType: 'flies' },
      { label: 'Reach a 3-day streak on a repeating task', progress: 1, target: 3, reward: '1', rewardType: 'gift' },
    ],
  },
  {
    id: 'fitness',
    area: 'Fitness',
    title: 'Keep your body moving',
    accent: '#4d9850',
    cover: '/api/quests/cover?type=category&id=9c6610f1-b92f-4e49-99f2-f986b43f6217',
    objectives: [
      { label: 'Complete 3 Fitness tasks', progress: 2, target: 3, reward: '1', rewardType: 'gift' },
      { label: 'Reach a 3-day streak on a repeating task', progress: 2, target: 3, reward: '40', rewardType: 'flies' },
      { label: 'Focus for 30 minutes on Fitness tasks', progress: 18, target: 30, reward: '25', rewardType: 'flies' },
      { label: 'Add 2 Fitness tasks', progress: 1, target: 2, reward: '1', rewardType: 'gift' },
    ],
  },
  {
    id: 'mindfulness',
    area: 'Mindfulness',
    title: 'Make a little room to breathe',
    accent: '#6366f1',
    cover: '/api/quests/cover?type=category&id=a681ca88-6a60-46a8-935c-8bbaab5158f7',
    objectives: [
      { label: 'Complete 2 Mindfulness tasks', progress: 1, target: 2, reward: '20', rewardType: 'flies' },
      { label: 'Reach a 3-day streak on a repeating task', progress: 2, target: 3, reward: '1', rewardType: 'gift' },
      { label: 'Focus for 20 minutes on Mindfulness tasks', progress: 12, target: 20, reward: '25', rewardType: 'flies' },
      { label: 'Add 3 Mindfulness tasks', progress: 2, target: 3, reward: '1', rewardType: 'gift' },
    ],
  },
] as const;

export function MarketingQuestPreview() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const activeQuest = questPreviews[activeIndex];

  useEffect(() => {
    questPreviews.forEach((quest) => {
      const image = new window.Image();
      image.src = quest.cover;
    });
    const interval = window.setInterval(
      () => {
        setDirection(1);
        setActiveIndex((index) => (index + 1) % questPreviews.length);
      },
      4600,
    );
    return () => window.clearInterval(interval);
  }, []);

  const showQuest = (index: number) => {
    if (index === activeIndex) return;
    setDirection(index > activeIndex ? 1 : -1);
    setActiveIndex(index);
  };

  return (
    <div className="rounded-[30px] border border-border/60 bg-card p-5 shadow-xl shadow-emerald-950/10 sm:p-7">
      <div className="overflow-hidden rounded-[22px] border border-border/50 bg-card shadow-sm">
        <div className="relative h-[150px] overflow-hidden bg-[#153b2b]">
        <AnimatePresence initial={false}>
          <motion.div
            key={activeQuest.id}
            initial={{ x: `${direction * 100}%` }}
            animate={{ x: '0%' }}
            exit={{ x: `${direction * -100}%` }}
            transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-0 overflow-hidden"
          >
            <Image
              src={activeQuest.cover}
              alt={`${activeQuest.area} focus area`}
              fill
              unoptimized
              sizes="(min-width: 1024px) 45vw, 100vw"
              className="object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/5 to-black/65" />
            <div className="absolute inset-x-4 bottom-3 text-white">
              <p className="font-display text-2xl uppercase leading-none tracking-wide drop-shadow-[0_2px_0_rgba(15,23,42,0.9)]">
                {activeQuest.area}
              </p>
              <p className="mt-1 text-xs font-black text-white/85">{activeQuest.title}</p>
            </div>
          </motion.div>
        </AnimatePresence>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-black uppercase tracking-[0.14em] text-muted-foreground">Counting tasks tagged</span>
            <span
              className="rounded-lg border px-2 py-1 text-[9px] font-black uppercase"
              style={{ color: activeQuest.accent, borderColor: `${activeQuest.accent}55`, backgroundColor: `${activeQuest.accent}18` }}
            >
              {activeQuest.area}
            </span>
          </div>
          <div className="flex items-center gap-1">
            {activeQuest.objectives.map((objective, index) => (
              <span
                key={objective.label}
                className={`h-1.5 w-4 rounded-full ${index === 0 ? '' : 'bg-muted'}`}
                style={index === 0 ? { backgroundColor: activeQuest.accent } : undefined}
              />
            ))}
            <span className="ml-1 text-[9px] font-black text-muted-foreground">
              0 / {activeQuest.objectives.length} done
            </span>
          </div>
        </div>
      </div>

      <div className="mt-3 flex justify-end gap-1.5" aria-label="Preview an area quest">
          {questPreviews.map((quest, index) => (
            <button
              key={quest.id}
              type="button"
              aria-label={`Show ${quest.area} quest`}
              aria-pressed={index === activeIndex}
              onClick={() => showQuest(index)}
              className={`h-2 rounded-full transition-all ${index === activeIndex ? 'w-7' : 'w-2 bg-muted'}`}
              style={index === activeIndex ? { backgroundColor: quest.accent } : undefined}
            />
          ))}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={activeQuest.id}
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -12 }}
          transition={{ duration: 0.22 }}
          className="mt-6 space-y-2.5"
        >
          {activeQuest.objectives.map((objective) => {
            const percent = Math.min(100, (objective.progress / objective.target) * 100);
            return (
              <div key={objective.label} className="rounded-2xl border border-border/60 bg-muted/35 px-3 py-2.5 shadow-sm sm:px-4">
                <div className="flex items-center gap-3">
                  <div className="relative grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-border/50 bg-card shadow-sm">
                    {objective.rewardType === 'flies' ? (
                      <>
                        <Fly
                          size={38}
                          y={-2}
                          interactive={false}
                          alwaysPlay
                          oversample={1.25}
                        />
                        <span className="absolute -bottom-1 -right-1 rounded-md bg-foreground px-1.5 py-0.5 text-[8px] font-black text-background">
                          +{objective.reward}
                        </span>
                      </>
                    ) : (
                      <>
                        <div className="h-[54px] w-[54px]">
                          <GiftRive
                            className="h-full w-full"
                            color={0}
                            paused={false}
                            animation="box_shake"
                          />
                        </div>
                        <span className="absolute -bottom-1 -right-1 rounded-md bg-foreground px-1.5 py-0.5 text-[8px] font-black text-background">
                          ×{objective.reward}
                        </span>
                      </>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-black leading-snug">{objective.label}</p>
                    <div className="mt-2 flex items-center gap-2">
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full transition-[width] duration-500"
                          style={{ width: `${percent}%`, backgroundColor: activeQuest.accent }}
                        />
                      </div>
                      <span className="text-[10px] font-black tabular-nums text-muted-foreground">
                        {objective.progress}/{objective.target}
                      </span>
                    </div>
                  </div>
                  <span className="hidden rounded-xl border border-border/60 bg-card px-2.5 py-1.5 text-[9px] font-black text-muted-foreground sm:inline">
                    Show me
                  </span>
                </div>
              </div>
            );
          })}
        </motion.div>
      </AnimatePresence>

    </div>
  );
}
