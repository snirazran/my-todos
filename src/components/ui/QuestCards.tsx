'use client';

import { Gift, Plus, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ItemDef } from '@/lib/skins/catalog';
import type {
  MacroCategoryDefinition,
  QuestPlacement,
  QuestReward,
  ResolvedQuestLogicBlock,
} from '@/lib/quests/types';
import Fly from './fly';
import Frog from './frog';
import { GiftRive } from './gift-box/GiftBox';

export type QuestRewardCatalogItem = Pick<
  ItemDef,
  'id' | 'name' | 'slot' | 'rarity' | 'riveIndex'
>;

export type QuestTagChip = {
  id: string;
  name: string;
  color: string;
};

export type QuestCardLogicBlock = Pick<
  ResolvedQuestLogicBlock,
  | 'id'
  | 'type'
  | 'subject'
  | 'action'
  | 'target'
  | 'progress'
  | 'tagMode'
  | 'resolvedTagName'
  | 'resolvedTagNames'
> & {
  targetLabel?: string;
  previewTagLabel?: string;
};

type QuestCardData = {
  placement: QuestPlacement;
  categoryId?: MacroCategoryDefinition['id'];
  title: string;
  description: string;
  coverImageUrl?: string;
  rewards: QuestReward[];
  logic: QuestCardLogicBlock[];
  completed: boolean;
  claimable: boolean;
  claimed: boolean;
};

type BaseCardProps = {
  rewardCatalog: Record<string, QuestRewardCatalogItem>;
  isPremium: boolean;
  claiming?: boolean;
  buttonLabel?: string;
  buttonDisabled?: boolean;
  onClaim?: () => void;
};

export function formatQuestObjective(block: QuestCardLogicBlock) {
  const targetLabel =
    block.targetLabel ?? String(Math.max(0, block.target ?? 0));

  if (block.type === 'focus_minutes') {
    return `Focus for ${targetLabel} minutes on tasks`;
  }

  const numericTarget = Math.max(0, block.target ?? 0);
  const subjectLabel =
    block.subject === 'any'
      ? 'tasks / habits'
      : block.subject === 'habit'
        ? numericTarget === 1 && !targetLabel.includes('-')
          ? 'habit'
          : 'habits'
        : numericTarget === 1 && !targetLabel.includes('-')
          ? 'task'
          : 'tasks';

  const actionLabel = block.action === 'add' ? 'Add' : 'Complete';
  return `${actionLabel} ${targetLabel} ${subjectLabel}`;
}

function getTaggedSubjectCopy(block: QuestCardLogicBlock) {
  if (block.type === 'focus_minutes') return 'tasks';

  const subject = block.subject;
  if (subject === 'task') return 'tasks';
  if (subject === 'habit') return 'habits';
  return 'tasks or habits';
}

function getTagScopeMessage(block: QuestCardLogicBlock) {
  const scopedSubject = getTaggedSubjectCopy(block);

  if (block.tagMode === 'focus_category_tags') {
    return `Only ${scopedSubject} with the selected tags count.`;
  }

  if (block.resolvedTagName || block.resolvedTagNames?.length || block.previewTagLabel) {
    return `Only ${scopedSubject} with the shown tag${block.resolvedTagNames?.length && block.resolvedTagNames.length > 1 ? 's' : ''} count.`;
  }

  return null;
}

export function DailyQuestPresentationCard({
  quest,
  rewardCatalog,
  isPremium,
  claiming = false,
  buttonLabel,
  buttonDisabled,
  onClaim,
}: BaseCardProps & {
  quest: QuestCardData & { placement: 'daily' };
}) {
  return (
    <div className="overflow-hidden rounded-[28px] border border-border/50 bg-card shadow-sm">
      <div className="relative overflow-hidden">
        {quest.coverImageUrl ? (
          <img
            src={quest.coverImageUrl}
            alt={quest.title}
            className="h-[220px] w-full object-cover"
          />
        ) : (
          <div className="h-[220px] w-full bg-[linear-gradient(135deg,#0ea5e9_0%,#2563eb_55%,#0f172a_100%)]" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/28 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/70 to-transparent" />
        <div className="absolute inset-x-0 top-0 flex items-start gap-3 p-4">
          <span className="rounded-full border border-white/20 bg-black/35 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-white backdrop-blur-md">
            Daily
          </span>
        </div>
        <div className="absolute z-10 flex flex-wrap justify-end gap-2 bottom-4 right-4">
          {quest.rewards.map((reward, index) => (
            <RewardTile
              key={`${reward.type}-${reward.itemId ?? reward.amount ?? reward.minAmount ?? index}`}
              reward={reward}
              rewardCatalog={rewardCatalog}
              isPremium={isPremium}
              compact
            />
          ))}
        </div>
        <div className="absolute inset-x-0 bottom-0 z-10 p-4 pr-[116px]">
          <h3 className="text-3xl font-black tracking-tight text-white drop-shadow-[0_4px_18px_rgba(0,0,0,0.45)]">
            {quest.title}
          </h3>
          <p className="mt-1.5 text-sm text-white/90 drop-shadow-[0_2px_10px_rgba(0,0,0,0.45)]">
            {quest.description}
          </p>
        </div>
      </div>

      <div className="px-4 pt-4 pb-4 space-y-4">
        <div className="space-y-3">
          {quest.logic.map((block) => (
            <QuestProgressBlock
              key={block.id}
              block={block}
              completeTone={
                quest.claimed
                  ? 'claimed'
                  : quest.completed
                    ? 'complete'
                    : 'progress'
              }
            />
          ))}
        </div>
        <Button
          onClick={onClaim}
          disabled={(buttonDisabled ?? !quest.claimable) || claiming}
          className="w-full font-black tracking-wide uppercase h-11 rounded-2xl"
        >
          {buttonLabel ?? getQuestButtonLabel(quest, isPremium, claiming)}
        </Button>
      </div>
    </div>
  );
}

export function CategoryQuestPresentationCard({
  quest,
  category,
  rewardCatalog,
  isPremium,
  claiming = false,
  linkedTags,
  onEditTags,
  buttonLabel,
  buttonDisabled,
  onClaim,
}: BaseCardProps & {
  quest: QuestCardData & {
    placement: 'category';
    categoryId: MacroCategoryDefinition['id'];
  };
  category?: MacroCategoryDefinition;
  linkedTags: QuestTagChip[];
  onEditTags?: () => void;
}) {
  return (
    <div className="overflow-hidden rounded-[28px] border border-border/50 bg-card shadow-sm">
      <div className="relative min-h-[310px] overflow-hidden">
        {quest.coverImageUrl ? (
          <img
            src={quest.coverImageUrl}
            alt={quest.title}
            className="h-[250px] w-full object-cover sm:h-[285px]"
          />
        ) : (
          <div
            className="h-[250px] w-full sm:h-[285px]"
            style={{
              background: `linear-gradient(135deg, ${category?.backgroundFrom ?? '#0f172a'}, ${category?.backgroundTo ?? '#1e293b'})`,
            }}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/28 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/70 to-transparent" />
        <div className="absolute inset-x-0 top-0 flex items-start gap-3 p-4">
          <div className="flex items-start gap-2">
            <span className="rounded-full border border-white/20 bg-black/35 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-white backdrop-blur-md">
              {category?.shortLabel ?? category?.name ?? 'Focus'}
            </span>
          </div>
        </div>
        <div className="absolute z-10 flex flex-wrap justify-end gap-2 bottom-4 right-4 sm:bottom-5 sm:right-5">
          {quest.rewards.map((reward, index) => (
            <RewardTile
              key={`${reward.type}-${reward.itemId ?? reward.amount ?? reward.minAmount ?? index}`}
              reward={reward}
              rewardCatalog={rewardCatalog}
              isPremium={isPremium}
              compact
            />
          ))}
        </div>
        <div className="absolute inset-x-0 bottom-0 z-10 p-4 pr-[116px] sm:p-5 sm:pr-[132px]">
          <h3 className="text-3xl font-black tracking-tight text-white drop-shadow-[0_4px_18px_rgba(0,0,0,0.45)] sm:text-4xl">
            {quest.title}
          </h3>
          <p className="mt-1.5 max-w-2xl text-sm text-white/90 drop-shadow-[0_2px_10px_rgba(0,0,0,0.45)] sm:text-base">
            {quest.description}
          </p>
        </div>
      </div>

      <div className="px-4 pt-4 pb-4 space-y-4 sm:px-5 sm:pb-5">
        <div className="space-y-3">
          {quest.logic.map((block) => (
            <div
              key={block.id}
              className="pt-4 border-t border-border/40 first:border-t-0 first:pt-0"
            >
              <QuestProgressBlock block={block} completeTone="focus" />
              {getTagScopeMessage(block) ? (
                <p className="mt-2 text-xs font-medium text-muted-foreground">
                  {getTagScopeMessage(block)}
                </p>
              ) : null}
              <div className="flex flex-wrap items-center gap-2 mt-3">
                {block.tagMode === 'focus_category_tags' ? (
                  <>
                    {linkedTags.length > 0 ? (
                      <>
                        {onEditTags ? (
                          <button
                            type="button"
                            onClick={onEditTags}
                            className="inline-flex items-center justify-center w-8 h-8 transition border rounded-xl border-border/50 bg-background/80 text-muted-foreground hover:bg-muted hover:text-foreground"
                            aria-label="Edit linked tags"
                            title="Edit linked tags"
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        ) : null}
                        {linkedTags.map((tag) => (
                          <QuestTagPill
                            key={`${block.id}-${tag.id}`}
                            tag={tag}
                          />
                        ))}
                      </>
                    ) : onEditTags ? (
                      <button
                        type="button"
                        onClick={onEditTags}
                        className="inline-flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-primary transition hover:bg-primary/15"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Select a tag to start
                      </button>
                    ) : (
                      <PreviewTagHint
                        label={block.previewTagLabel ?? 'Saved focus tags'}
                        color={category?.accent ?? '#22c55e'}
                      />
                    )}
                  </>
                ) : block.resolvedTagNames?.length ? (
                  block.resolvedTagNames.map((tagName, index) => {
                    const matchedTag = linkedTags.find(
                      (tag) => tag.name.toLowerCase() === tagName.toLowerCase(),
                    );
                    return (
                      <QuestTagPill
                        key={`${block.id}-${matchedTag?.id ?? tagName}-${index}`}
                        tag={
                          matchedTag ?? {
                            id: `${block.id}-${tagName}-${index}`,
                            name: tagName,
                            color: category?.accent ?? '#22c55e',
                          }
                        }
                      />
                    );
                  })
                ) : block.resolvedTagName ? (
                  <QuestTagPill
                    tag={{
                      id: `${block.id}-${block.resolvedTagName}`,
                      name: block.resolvedTagName,
                      color: category?.accent ?? '#22c55e',
                    }}
                  />
                ) : block.previewTagLabel ? (
                  <PreviewTagHint
                    label={block.previewTagLabel}
                    color={category?.accent ?? '#22c55e'}
                  />
                ) : null}
              </div>
            </div>
          ))}
        </div>

        <Button
          onClick={onClaim}
          disabled={(buttonDisabled ?? !quest.claimable) || claiming}
          className="w-full font-black tracking-wide uppercase h-11 rounded-2xl"
        >
          {buttonLabel ?? getQuestButtonLabel(quest, isPremium, claiming)}
        </Button>
      </div>
    </div>
  );
}

function QuestProgressBlock({
  block,
  completeTone,
}: {
  block: QuestCardLogicBlock;
  completeTone: 'progress' | 'complete' | 'claimed' | 'focus';
}) {
  const safeTarget = Math.max(1, block.target);
  const width = Math.min(100, (block.progress / safeTarget) * 100);

  return (
    <>
      <div className="flex items-start justify-between gap-3 sm:items-end">
        <p className="text-xl font-black leading-tight text-foreground">
          {formatQuestObjective(block)}
        </p>
        <div className="px-3 py-1 text-sm font-black border rounded-full border-border/50 bg-background/80 text-foreground">
          {Math.min(block.progress, safeTarget)}/
          {block.targetLabel ?? block.target}
        </div>
      </div>
      <div className="h-3 mt-4 overflow-hidden rounded-full bg-muted/80 ring-1 ring-border/40">
        <div
          className={cn(
            'h-full rounded-full transition-all',
            completeTone === 'claimed'
              ? 'bg-[linear-gradient(90deg,#6ee7b7_0%,#34d399_45%,#10b981_100%)]'
              : completeTone === 'complete' || completeTone === 'focus'
                ? 'bg-[linear-gradient(90deg,#34d399_0%,#22c55e_50%,#16a34a_100%)]'
                : 'bg-[linear-gradient(90deg,#7dd3fc_0%,#38bdf8_45%,#0ea5e9_100%)]',
          )}
          style={{ width: `${width}%` }}
        />
      </div>
    </>
  );
}

function QuestTagPill({ tag }: { tag: QuestTagChip }) {
  return (
    <span
      className="inline-flex items-center justify-center rounded-xl border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em]"
      style={{
        backgroundColor: `${tag.color}18`,
        borderColor: `${tag.color}4d`,
        color: tag.color,
      }}
    >
      {tag.name}
    </span>
  );
}

function PreviewTagHint({ label, color }: { label: string; color: string }) {
  return (
    <span
      className="inline-flex items-center justify-center rounded-xl border border-dashed px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em]"
      style={{
        backgroundColor: `${color}12`,
        borderColor: `${color}5c`,
        color,
      }}
    >
      {label}
    </span>
  );
}

export function RewardTile({
  reward,
  rewardCatalog,
  isPremium,
  compact = false,
  className,
}: {
  reward: QuestReward;
  rewardCatalog: Record<string, QuestRewardCatalogItem>;
  isPremium: boolean;
  compact?: boolean;
  className?: string;
}) {
  const item = reward.itemId ? rewardCatalog[reward.itemId] : null;
  const quantityLabel = getRewardQuantityLabel(reward, isPremium);
  const previewIndices = item
    ? {
        skin: item.slot === 'skin' ? item.riveIndex : 0,
        mood: 0,
        hat: item.slot === 'hat' ? item.riveIndex : 0,
        body: item.slot === 'body' ? item.riveIndex : 0,
        hand_item: item.slot === 'hand_item' ? item.riveIndex : 0,
      }
    : null;

  return (
    <div
      className={cn(
        'group relative flex items-center justify-center overflow-visible',
        compact
          ? 'h-16 w-16 rounded-[20px] border border-white/75 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(236,253,245,0.96))] shadow-[0_14px_28px_rgba(15,23,42,0.24)] backdrop-blur-sm'
          : 'h-12 w-12 rounded-xl border border-border/40 bg-muted/30',
        className,
      )}
      title={rewardLabel(reward, rewardCatalog, isPremium)}
    >
      {reward.type === 'FLIES' ? (
        <div className="relative flex items-center justify-center w-full h-full">
          <Fly size={compact ? 30 : 22} y={-1} />
        </div>
      ) : item?.slot === 'container' ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center">
          <div
            className={cn(
              compact
                ? 'h-[118%] w-[118%] drop-shadow-lg'
                : 'h-[120%] w-[120%]',
            )}
          >
            <GiftRive className="w-full h-full" color={item.riveIndex} />
          </div>
        </div>
      ) : previewIndices ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center">
          <Frog
            className={cn(
              'object-contain',
              compact ? 'h-[118%] w-[118%]' : 'h-[120%] w-[120%] translate-y-[8%]',
            )}
            indices={previewIndices}
            width={compact ? 96 : 64}
            height={compact ? 96 : 64}
          />
        </div>
      ) : reward.type === 'BOX' ? (
        <Gift
          className={cn(
            'relative text-primary',
            compact ? 'h-5 w-5' : 'h-4 w-4',
          )}
        />
      ) : (
        <Trophy
          className={cn(
            'relative text-primary',
            compact ? 'h-5 w-5' : 'h-4 w-4',
          )}
        />
      )}

      <div className={cn(
        'absolute z-20 flex justify-center',
        compact ? '-right-1.5 -top-1.5' : '-right-1 -top-1',
      )}>
        <span className={cn(
          'flex items-center justify-center rounded-full border border-white/20 bg-black font-black uppercase tracking-wide text-white',
          compact ? 'min-w-5 px-1.5 py-1 text-[9px]' : 'min-w-4 px-1 py-0.5 text-[8px]',
        )}>
          {quantityLabel}
        </span>
      </div>
    </div>
  );
}

function rewardLabel(
  reward: QuestReward,
  rewardCatalog: Record<string, QuestRewardCatalogItem>,
  isPremium = false,
) {
  if (reward.type === 'FLIES')
    return `${getRewardQuantityLabel(reward, isPremium)} flies`;
  if (reward.itemId) {
    return `${rewardCatalog[reward.itemId]?.name ?? reward.itemId}${isPremium ? ' x2' : ''}`;
  }
  return 'Reward';
}

function getRewardQuantityLabel(reward: QuestReward, isPremium: boolean) {
  if (reward.type === 'FLIES') {
    if (reward.amountMode === 'random') {
      const min = Math.max(1, reward.minAmount ?? 1) * (isPremium ? 2 : 1);
      const max = Math.max(min, reward.maxAmount ?? min) * (isPremium ? 2 : 1);
      return min === max ? String(max) : `${min}-${max}`;
    }

    return String(Math.max(0, (reward.amount ?? 0) * (isPremium ? 2 : 1)));
  }

  const base = reward.amount && reward.amount > 1 ? reward.amount : 1;
  const multiplied = base * (isPremium ? 2 : 1);
  return `x${multiplied}`;
}

function getQuestButtonLabel(
  quest: Pick<QuestCardData, 'claimable' | 'claimed' | 'completed'>,
  isPremium: boolean,
  claiming: boolean,
) {
  if (quest.claimed) return 'Claimed';
  if (claiming) return 'Claiming...';
  if (quest.claimable)
    return isPremium ? 'Claim Double Reward' : 'Claim Reward';
  return 'Keep Going';
}
