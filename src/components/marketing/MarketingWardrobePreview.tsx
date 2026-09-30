'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Shuffle } from 'lucide-react';
import Frog from '@/components/ui/frog';
import { FrogSnapshot } from '@/components/ui/FrogSnapshot';
import { CATALOG, RARITY_ORDER, type Rarity } from '@/lib/skins/catalog';
import { RARITY_CONFIG } from '@/components/ui/gift-box/constants';
import {
  DEFAULT_BACKGROUND_IMAGES,
  type BackgroundImages,
  type BackgroundItem,
} from '@/hooks/useBackgrounds';
import { cn } from '@/lib/utils';

const WEARABLE_SLOTS = ['skin', 'hat', 'body', 'hand_item'] as const;
type WearableSlot = (typeof WEARABLE_SLOTS)[number];
type Tab = WearableSlot | 'pond';

type Wearable = {
  id: string;
  name: string;
  slot: WearableSlot;
  rarity: Rarity;
  riveIndex: number;
};

const RAIL_LIMIT = 14;
const PAGE_SIZE = 20;

const isWearableSlot = (slot: string): slot is WearableSlot =>
  (WEARABLE_SLOTS as readonly string[]).includes(slot);

const staticWearables: Wearable[] = CATALOG.flatMap((item) =>
  isWearableSlot(item.slot)
    ? [{ id: item.id, name: item.name, slot: item.slot, rarity: item.rarity, riveIndex: item.riveIndex }]
    : [],
);

const rarityRank = (rarity: Rarity) => RARITY_ORDER.indexOf(rarity);

const TABS: { id: Tab; label: string }[] = [
  { id: 'hat', label: 'Hats' },
  { id: 'skin', label: 'Skins' },
  { id: 'body', label: 'Body' },
  { id: 'hand_item', label: 'Held' },
  { id: 'pond', label: 'Ponds' },
];

const START_EQUIPPED: Record<WearableSlot, number> = {
  skin: 3,
  hat: 1,
  body: 0,
  hand_item: 0,
};

const fallbackBackgrounds: BackgroundItem[] = [
  {
    id: 'bg_default',
    name: 'Swamp',
    rarity: 'common',
    priceFlies: 0,
    images: DEFAULT_BACKGROUND_IMAGES,
  },
];

const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });

const railClass =
  'no-scrollbar -mx-3 flex snap-x snap-mandatory scroll-px-3 gap-2 overflow-x-auto px-3 pb-1 sm:-mx-5 sm:scroll-px-5 sm:gap-2.5 sm:px-5';
const railTileClass = 'w-[76px] shrink-0 snap-start sm:w-[84px]';

function PondImage({ src, className }: { src: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    setFailed(false);
    setLoaded(false);
  }, [src]);
  if (failed) {
    return (
      <div
        aria-hidden
        className={cn(
          'bg-[linear-gradient(180deg,#bfe3f5_0%,#dcefd8_55%,#7fb86e_56%,#4f9149_100%)]',
          className,
        )}
      />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      decoding="async"
      className={cn('transition-opacity duration-300', loaded ? 'opacity-100' : 'opacity-0', className)}
      onLoad={() => setLoaded(true)}
      onError={() => setFailed(true)}
    />
  );
}

function ItemTile({
  item,
  selected,
  onSelect,
  className,
}: {
  item: Wearable;
  selected: boolean;
  onSelect: () => void;
  className?: string;
}) {
  const rarity = RARITY_CONFIG[item.rarity];
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={`${item.name}, ${rarity.label}${selected ? ', wearing' : ''}`}
      title={item.name}
      className={cn(
        'relative aspect-square overflow-hidden rounded-2xl border-2 bg-gradient-to-br transition-transform active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4f9149]',
        rarity.gradient,
        selected ? 'border-[#4f9149] ring-2 ring-[#4f9149]/30' : rarity.border,
        className,
      )}
    >
      <span className="absolute inset-0 flex items-center justify-center">
        <FrogSnapshot
          className="shrink-0 -translate-y-1"
          indices={{
            skin: item.slot === 'skin' ? item.riveIndex : 0,
            mood: 0,
            hat: item.slot === 'hat' ? item.riveIndex : 0,
            body: item.slot === 'body' ? item.riveIndex : 0,
            hand_item: item.slot === 'hand_item' ? item.riveIndex : 0,
          }}
          width="125%"
          height="125%"
          visualOffsetY={0}
        />
      </span>
      {selected ? (
        <span className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-[#4f9149] text-white shadow">
          <Check className="h-3 w-3" strokeWidth={4} aria-hidden />
        </span>
      ) : null}
    </button>
  );
}

export function MarketingWardrobePreview() {
  const [tab, setTab] = useState<Tab>('hat');
  const [expanded, setExpanded] = useState(false);
  const [shown, setShown] = useState(PAGE_SIZE);
  const [wearables, setWearables] = useState<Wearable[]>(staticWearables);
  const [equipped, setEquipped] = useState<Record<WearableSlot, number>>(START_EQUIPPED);
  const [lastTried, setLastTried] = useState<Wearable | null>(null);
  const [sceneIndex, setSceneIndex] = useState(0);
  const [backgrounds, setBackgrounds] = useState<BackgroundItem[]>(fallbackBackgrounds);
  const railRef = useRef<HTMLDivElement>(null);

  const scene = backgrounds[sceneIndex] ?? backgrounds[0];
  const sceneSrc = scene.images.mobile || scene.images.tablet || scene.images.web;

  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/skins/catalog', { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: { items?: Array<Omit<Wearable, 'slot'> & { slot: string }> } | null) => {
        const live = payload?.items?.filter((item): item is Wearable => isWearableSlot(item.slot));
        if (live?.length) setWearables(live);
      })
      .catch(() => undefined);

    void fetch('/api/backgrounds', { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then(
        (
          payload: {
            catalog?: Array<{
              id: string;
              name: string;
              rarity: BackgroundItem['rarity'];
              priceFlies: number;
              images?: Partial<BackgroundImages>;
            }>;
          } | null,
        ) => {
          const catalog = payload?.catalog
            ?.filter((item) => item.images?.mobile)
            .map((item) => ({
              id: item.id,
              name: item.name,
              rarity: item.rarity,
              priceFlies: item.priceFlies,
              images: {
                mobile: item.images?.mobile ?? DEFAULT_BACKGROUND_IMAGES.mobile,
                tablet:
                  item.images?.tablet ?? item.images?.mobile ?? DEFAULT_BACKGROUND_IMAGES.tablet,
                web: item.images?.web ?? item.images?.mobile ?? DEFAULT_BACKGROUND_IMAGES.web,
                webLarge:
                  item.images?.webLarge ??
                  item.images?.web ??
                  item.images?.mobile ??
                  DEFAULT_BACKGROUND_IMAGES.webLarge,
              },
            }));
          if (catalog?.length) {
            setBackgrounds(catalog);
            setSceneIndex(0);
          }
        },
      )
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  const bySlot = useMemo(() => {
    const groups: Record<WearableSlot, Wearable[]> = { skin: [], hat: [], body: [], hand_item: [] };
    for (const item of wearables) groups[item.slot].push(item);
    for (const slot of WEARABLE_SLOTS) {
      groups[slot].sort(
        (a, b) => rarityRank(b.rarity) - rarityRank(a.rarity) || a.riveIndex - b.riveIndex,
      );
    }
    return groups;
  }, [wearables]);

  const lookLabel = useMemo(() => {
    const looks = WEARABLE_SLOTS.reduce((total, slot) => total * (bySlot[slot].length + 1), 1);
    return compact.format(looks);
  }, [bySlot]);

  const countFor = (id: Tab) => (id === 'pond' ? backgrounds.length : bySlot[id].length);
  const items = tab === 'pond' ? [] : bySlot[tab];
  const total = countFor(tab);
  const canExpand = total > 4;

  const selectTab = (next: Tab) => {
    setTab(next);
    setExpanded(false);
    setShown(PAGE_SIZE);
    railRef.current?.scrollTo({ left: 0 });
  };

  const equip = (item: Wearable) => {
    const wearing = equipped[item.slot] === item.riveIndex;
    setEquipped((current) => ({ ...current, [item.slot]: wearing ? 0 : item.riveIndex }));
    setLastTried(wearing ? null : item);
  };

  const shuffle = () => {
    const next = { ...START_EQUIPPED };
    let highlight: Wearable | null = null;
    for (const slot of WEARABLE_SLOTS) {
      const options = bySlot[slot];
      const roll = Math.floor(Math.random() * (options.length + 1));
      const pick = roll === 0 ? null : options[roll - 1];
      next[slot] = pick ? pick.riveIndex : 0;
      if (pick && (!highlight || rarityRank(pick.rarity) > rarityRank(highlight.rarity))) {
        highlight = pick;
      }
    }
    setEquipped(next);
    setLastTried(highlight);
    setSceneIndex(Math.floor(Math.random() * backgrounds.length));
  };

  const tried = lastTried ? RARITY_CONFIG[lastTried.rarity] : null;

  return (
    <div className="isolate overflow-hidden rounded-[30px] bg-card shadow-[0_6px_0_rgba(15,46,29,0.08),0_40px_70px_-35px_rgba(15,46,29,0.45)] ring-1 ring-[#0f2e1d]/[0.06] dark:ring-white/[0.08]">
      <div className="relative h-[290px] sm:h-[330px]">
        <div className="absolute inset-0 overflow-hidden bg-[#a9d6ec]">
          <PondImage
            key={sceneSrc}
            src={sceneSrc}
            className="absolute inset-0 h-full w-full object-cover object-center"
          />
          <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-black/15 via-transparent to-black/20" />
        </div>

        <div className="absolute inset-x-3 top-3 z-40 flex items-start justify-between gap-2">
          <span className="rounded-2xl bg-black/35 px-3 py-1.5 text-white backdrop-blur-md">
            <span className="block text-[15px] font-black leading-tight tabular-nums">{lookLabel}</span>
            <span className="block text-[10px] font-bold leading-tight text-white/80">possible looks</span>
          </span>
          <button
            type="button"
            onClick={shuffle}
            className="group inline-flex h-10 items-center gap-2 rounded-full bg-white px-4 text-[13px] font-black text-[#1f5526] shadow-[0_3px_0_rgba(15,46,29,0.25)] transition-transform hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white active:translate-y-0.5 active:shadow-none"
          >
            <Shuffle
              className="h-4 w-4 transition-transform duration-500 group-hover:rotate-180"
              aria-hidden
            />
            Shuffle
          </button>
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-[6px] z-50 flex justify-center sm:-bottom-4">
          <div className="relative h-[260px] w-[235px] sm:h-[290px] sm:w-[260px]">
            <Frog
              className="absolute inset-x-0 bottom-[-22px] z-10"
              width="100%"
              height={300}
              visualOffsetY={0}
              indices={{ mood: 0, ...equipped }}
              ignoreIdlePause
            />
          </div>
        </div>
      </div>

      <div className="relative z-40 -mt-5 rounded-t-[26px] bg-card px-3 pb-4 pt-4 sm:px-5 sm:pb-5">
        <div
          role="tablist"
          aria-label="Wardrobe category"
          className="grid grid-cols-5 gap-1 rounded-2xl bg-muted p-1"
        >
          {TABS.map((item) => {
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => selectTab(item.id)}
                className={cn(
                  'flex min-h-11 flex-col items-center justify-center rounded-xl px-1 text-[13px] font-black leading-tight transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#4f9149]',
                  active
                    ? 'bg-card text-foreground shadow-[0_2px_0_rgba(15,46,29,0.12)]'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {item.label}
                <span className={cn('text-[10px] font-bold tabular-nums', active ? 'text-[#4f9149]' : 'opacity-70')}>
                  {countFor(item.id)}
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-3 flex min-h-8 items-center justify-between gap-3 px-1">
          <p className="min-w-0 truncate text-[13px] font-black text-foreground" aria-live="polite">
            {lastTried && tried && tab !== 'pond' ? (
              <>
                {lastTried.name} <span className={cn('font-bold', tried.text)}>{tried.label}</span>
              </>
            ) : (
              <span className="font-bold text-muted-foreground">
                {tab === 'pond' ? 'Tap a pond to move in' : 'Tap to try it on'}
              </span>
            )}
          </p>
          {canExpand ? (
            <button
              type="button"
              onClick={() => {
                setExpanded((value) => !value);
                setShown(PAGE_SIZE);
              }}
              aria-expanded={expanded}
              className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full px-2.5 text-[12px] font-black text-[#34631f] transition-colors hover:bg-[#4f9149]/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#4f9149] dark:text-[#9fd98f]"
            >
              {expanded ? 'Show less' : `See all ${total}`}
              <ChevronDown
                className={cn('h-3.5 w-3.5 transition-transform duration-200', expanded ? 'rotate-180' : '-rotate-90')}
                aria-hidden
              />
            </button>
          ) : null}
        </div>

        <div className="mt-2">
          {tab === 'pond' ? (
            <div
              key={expanded ? 'pond-grid' : 'pond-rail'}
              className={expanded ? 'grid grid-cols-4 gap-1.5 sm:grid-cols-6 sm:gap-2.5' : railClass}
              aria-label="Ponds"
            >
              {backgrounds.map((background, index) => {
                const selected = index === sceneIndex;
                return (
                  <button
                    key={background.id}
                    type="button"
                    onClick={() => setSceneIndex(index)}
                    aria-pressed={selected}
                    aria-label={background.name}
                    className={cn(
                      'group relative aspect-square overflow-hidden rounded-2xl bg-muted ring-2 transition-transform active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4f9149]',
                      !expanded && railTileClass,
                      selected ? 'ring-[#4f9149]' : 'ring-transparent hover:ring-[#4f9149]/40',
                    )}
                  >
                    <PondImage
                      src={background.images.mobile}
                      className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                    <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/60 to-transparent px-1.5 pb-1 pt-4 text-left text-[10px] font-black text-white sm:text-[11px]">
                      {background.name}
                    </span>
                    {selected ? (
                      <span className="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full bg-[#4f9149] text-white shadow">
                        <Check className="h-3 w-3" strokeWidth={4} aria-hidden />
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          ) : expanded ? (
            <div key={`${tab}-grid`}>
              <div className="grid grid-cols-5 gap-1.5 sm:grid-cols-6 sm:gap-2.5" aria-label="All items">
                {items.slice(0, shown).map((item) => (
                  <ItemTile
                    key={item.id}
                    item={item}
                    selected={equipped[item.slot] === item.riveIndex}
                    onSelect={() => equip(item)}
                    className="rounded-xl sm:rounded-2xl"
                  />
                ))}
              </div>
              {shown < items.length ? (
                <button
                  type="button"
                  onClick={() => setShown((value) => value + PAGE_SIZE)}
                  className="mt-3 flex h-11 w-full items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-[#4f9149]/40 text-[13px] font-black text-[#34631f] transition-colors hover:bg-[#4f9149]/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#4f9149] dark:text-[#9fd98f]"
                >
                  Show {Math.min(PAGE_SIZE, items.length - shown)} more
                  <ChevronDown className="h-4 w-4" aria-hidden />
                </button>
              ) : null}
            </div>
          ) : (
            <div key={`${tab}-rail`} ref={railRef} className={railClass} aria-label="Items">
              {items.slice(0, RAIL_LIMIT).map((item) => (
                <ItemTile
                  key={item.id}
                  item={item}
                  selected={equipped[item.slot] === item.riveIndex}
                  onSelect={() => equip(item)}
                  className={railTileClass}
                />
              ))}
              {items.length > RAIL_LIMIT ? (
                <button
                  type="button"
                  onClick={() => setExpanded(true)}
                  className={cn(
                    'grid aspect-square place-items-center rounded-2xl border-2 border-dashed border-[#4f9149]/40 text-center text-[12px] font-black leading-tight text-[#34631f] transition-colors hover:bg-[#4f9149]/5 dark:text-[#9fd98f]',
                    railTileClass,
                  )}
                >
                  <span>
                    +{items.length - RAIL_LIMIT}
                    <br />
                    more
                  </span>
                </button>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
