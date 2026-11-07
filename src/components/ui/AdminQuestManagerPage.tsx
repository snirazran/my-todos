'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Camera,
  Edit2,
  Compass,
  Medal,
  MessageCircleQuestionMark,
  Plus,
  Trash2,
  Trophy,
  Monitor,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/Icon';
import { AdminLeapManager } from '@/components/ui/AdminLeapManager';
import { AdminSeasonManager } from '@/components/ui/AdminSeasonManager';
import {
  AdminStarterPlanConfigCard,
  StarterTasksEditor,
} from '@/components/ui/AdminStarterPlan';
import type { StarterTaskTemplate } from '@/lib/quests/starterPlan';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { AdminPromptManager } from '@/components/ui/AdminPromptManager';
import {
  AdminPage,
  LoadingBlock,
  Notice,
  SaveBar,
} from '@/components/admin/kit';
import { DailyQuestEditor } from '@/components/admin/quests/DailyQuestEditor';
import { DailyStreakPage } from '@/components/admin/streak/DailyStreakPage';
import { MoveToWebCard } from '@/components/admin/quests/MoveToWebCard';
import { MilestonesPage } from '@/components/admin/quests/MilestonesPage';
import type { AdminRecipe, AdminRecipeSlot } from '@/components/admin/quests/types';
import type {
  QuestReward,
  QuestRewardType,
} from '@/lib/quests/types';
import {
  type QuestRewardCatalogItem,
  RewardTile,
  SweepRewardTile,
  sweepRewardLabel,
  type SweepRewardInfo,
  type SweepRollEntryInfo,
} from './QuestCards';

type MetaRewardItem = QuestRewardCatalogItem;

type AdminSweepConfig = {
  isActive: boolean;
  cleanSweepFlies: number;
  goldenEveryDays: number;
  megaEveryDays: number;
  megaRewards: SweepRewardInfo[];
  standardRoll: SweepRollEntryInfo[];
  goldenRoll: SweepRollEntryInfo[];
  limits: {
    goldenMin: number;
    goldenMax: number;
    megaMax: number;
    maxFlies: number;
  };
};

type AdminCategory = {
  id: string;
  name: string;
  shortLabel: string;
  description: string;
  onboardingSentence?: string;
  coverImageUrl?: string;
  accent: string;
  backgroundFrom: string;
  backgroundTo: string;
  starterTasks?: StarterTaskTemplate[];
};

type CategoryFormState = {
  name: string;
  description: string;
  onboardingSentence: string;
  coverImageUrl?: string;
  starterTasks: StarterTaskTemplate[];
};

const QUEST_TABS = ['daily', 'asks', 'milestones', 'web', 'areas', 'season', 'leap', 'streaks'] as const;
type QuestTab = (typeof QUEST_TABS)[number];

const TAB_COPY: Record<QuestTab, { title: string; subtitle: string; icon: React.ReactNode }> = {
  daily: {
    title: 'Daily quests',
    subtitle: 'The lineup every player gets each day. Finishing all of them is a Clean Sweep.',
    icon: <Icon name="quests" />,
  },
  asks: {
    title: 'Frog asks',
    subtitle: 'The daily question your frog asks. Journals and check-ins stay private; polls show how everyone answered.',
    icon: <MessageCircleQuestionMark />,
  },
  milestones: {
    title: 'Milestones',
    subtitle: 'Lifetime goals that level up: finish 3 tasks, then 10, then 25.',
    icon: <Medal />,
  },
  web: {
    title: 'Try it on the web',
    subtitle: 'The nudge that invites players to open Frogress on a computer.',
    icon: <Monitor />,
  },
  areas: {
    title: 'Focus areas',
    subtitle: 'The areas players pick at onboarding, and the starter plan built from them.',
    icon: <Compass />,
  },
  season: {
    title: 'Season pass',
    subtitle: 'A new pass every month. Plan the name, art and prizes ahead.',
    icon: <Trophy />,
  },
  leap: {
    title: 'Leap',
    subtitle: 'The weekly habit league: hops, lucky drops, weekly goals and the Lily leagues.',
    icon: <Icon name="leap" />,
  },
  streaks: {
    title: 'Daily streak & Lily Pads',
    subtitle: 'The app-wide streak, its goals and payouts, and the Lily Pad that protects every streak.',
    icon: <Icon name="lilyPad" />,
  },
};

type RewardPickerTab = 'flies' | 'shield' | 'item' | 'box' | 'background';

const ALL_REWARD_PICKER_TABS = [
  'flies',
  'shield',
  'item',
  'box',
  'background',
] as const satisfies readonly RewardPickerTab[];
type ConfirmAction =
  | 'save-category'
  | `delete-category:${string}`;

function positiveNumber(value: number | undefined, fallback: number) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

function amountRangeLabel(min: number | undefined, max: number | undefined) {
  const safeMin = positiveNumber(min, 1);
  const safeMax = Math.max(safeMin, positiveNumber(max, safeMin));
  return safeMin === safeMax ? String(safeMax) : `${safeMin}-${safeMax}`;
}

function rewardSummary(
  reward: QuestReward,
  rewardCatalog: Record<string, QuestRewardCatalogItem>,
) {
  if (reward.type === 'FLIES') {
    return reward.amountMode === 'random'
      ? `${amountRangeLabel(reward.minAmount, reward.maxAmount)} flies`
      : `${positiveNumber(reward.amount, 1)} flies`;
  }

  if (reward.type === 'SHIELD') {
    const amount = positiveNumber(reward.amount, 1);
    return amount > 1 ? `${amount} Lily Pads` : 'Lily Pad';
  }

  const lookupId = reward.itemId ?? reward.backgroundId;
  if (lookupId) {
    const name = rewardCatalog[lookupId]?.name ?? lookupId;
    if (reward.type === 'BOX' && reward.amount && reward.amount > 1) {
      return `${name} ×${reward.amount}`;
    }
    return name;
  }

  return reward.type === 'BOX' ? 'Mystery box' : 'Item reward';
}

function rewardKey(reward: QuestReward) {
  if (reward.type === 'FLIES') return 'FLIES';
  if (reward.type === 'SHIELD') return 'SHIELD';
  return `${reward.type}:${reward.itemId ?? reward.backgroundId ?? ''}`;
}

function normalizeRewardList(rewards: QuestReward[]) {
  const flies = rewards
    .filter((reward) => reward.type === 'FLIES')
    .slice(0, 1);
  const shields = rewards
    .filter((reward) => reward.type === 'SHIELD')
    .slice(0, 1);
  const items = rewards.filter((reward) => reward.type === 'ITEM' && reward.itemId);
  const boxes = rewards.filter((reward) => reward.type === 'BOX' && reward.itemId);
  const backgrounds = rewards.filter(
    (reward) => reward.type === 'BACKGROUND' && reward.backgroundId,
  );
  return [...flies, ...shields, ...items, ...boxes, ...backgrounds];
}

function rewardTypeLabel(type: QuestRewardType) {
  if (type === 'FLIES') return 'Flies';
  if (type === 'BOX') return 'Box';
  if (type === 'BACKGROUND') return 'Background';
  if (type === 'SHIELD') return 'Lily Pad';
  return 'Item';
}

export function AdminQuestManagerPage() {
  const [loading, setLoading] = useState(false);
  const [rewardItems, setRewardItems] = useState<MetaRewardItem[]>([]);
  const [adminCategories, setAdminCategories] = useState<AdminCategory[]>([]);
  const [categoryFileInputRef] = useState<{ current: HTMLInputElement | null }>({ current: null });
  const [result, setResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);

  const router = useRouter();
  const searchParams = useSearchParams();
  const rawTab = searchParams?.get('tab') ?? 'daily';
  const tab: QuestTab = (QUEST_TABS as readonly string[]).indexOf(rawTab) >= 0 ? (rawTab as QuestTab) : 'daily';
  const goTab = (next: QuestTab) => router.replace(`/admin/quests?tab=${next}`, { scroll: false });

  useEffect(() => {
    setResult(null);
  }, [tab]);

  // Category dialog
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [savingCategory, setSavingCategory] = useState(false);
  const [deletingCategoryId, setDeletingCategoryId] = useState<string | null>(null);
  const [editingCategory, setEditingCategory] = useState<AdminCategory | null>(null);
  const [categoryForm, setCategoryForm] = useState<CategoryFormState>({
    name: '',
    description: '',
    onboardingSentence: '',
    coverImageUrl: undefined,
    starterTasks: [],
  });

  // Clean Sweep bonus + Reward Roll tables
  const [sweepConfig, setSweepConfig] = useState<AdminSweepConfig | null>(null);
  const [savingStreak, setSavingStreak] = useState(false);


  // Generated-mode recipe editors (focus ladder + daily roll)
  const [adminRecipes, setAdminRecipes] = useState<AdminRecipe[]>([]);
  const [savedRecipes, setSavedRecipes] = useState<AdminRecipe[]>([]);
  const [savingRecipeId, setSavingRecipeId] = useState<string | null>(null);
  const [resettingRecipeId, setResettingRecipeId] = useState<string | null>(
    null,
  );
  const [recipeRewardTarget, setRecipeRewardTarget] = useState<{
    recipeId: string;
    slotId: string;
    kind: 'rewards' | 'bonus';
  } | null>(null);

  useEffect(() => {
    void loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    setResult(null);
    try {
      const [metaRes, categoriesRes, recipesRes, streakRes] = await Promise.all([
        fetch('/api/admin/quests/meta', { credentials: 'include' }),
        fetch('/api/admin/quests/categories', { credentials: 'include' }),
        fetch('/api/admin/quest-recipes', { credentials: 'include' }),
        fetch('/api/admin/quests/streak', { credentials: 'include' }),
      ]);
      const metaData = await metaRes.json();
      const categoriesData = await categoriesRes.json();
      const recipesData = await recipesRes.json();
      const streakData = await streakRes.json();
      if (!metaRes.ok) {
        throw new Error(metaData.error || 'Could not load quest manager');
      }
      setRewardItems(metaData.rewardsCatalog ?? []);
      setAdminCategories(categoriesData.categories ?? []);
      setAdminRecipes((recipesData.recipes ?? []) as AdminRecipe[]);
      setSavedRecipes((recipesData.recipes ?? []) as AdminRecipe[]);
      if (streakRes.ok && streakData.sweep) setSweepConfig(streakData.sweep);
    } catch (error) {
      setResult({
        type: 'error',
        message: error instanceof Error ? error.message : 'Could not load quest manager',
      });
    } finally {
      setLoading(false);
    }
  };

  const confirmBeforeAction = (action: ConfirmAction) => {
    if (confirmAction !== action) {
      setConfirmAction(action);
      return false;
    }
    setConfirmAction(null);
    return true;
  };

  const openCategoryDialog = (cat?: AdminCategory) => {
    setEditingCategory(cat ?? null);
    setCategoryForm(
      cat
        ? {
            name: cat.name,
            description: cat.description,
            onboardingSentence: cat.onboardingSentence ?? '',
            coverImageUrl: cat.coverImageUrl,
            starterTasks: cat.starterTasks ?? [],
          }
        : {
            name: '',
            description: '',
            onboardingSentence: '',
            coverImageUrl: undefined,
            starterTasks: [],
          },
    );
    setConfirmAction(null);
    setCategoryDialogOpen(true);
  };

  const saveCategory = async () => {
    if (!confirmBeforeAction('save-category')) return;
    setSavingCategory(true);
    try {
      const payload = { ...categoryForm };
      const res = await fetch('/api/admin/quests/categories', {
        method: editingCategory ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(editingCategory ? { id: editingCategory.id, ...payload } : payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not save category');
      await loadData();
      setCategoryDialogOpen(false);
    } catch (error) {
      setResult({ type: 'error', message: error instanceof Error ? error.message : 'Could not save category' });
    } finally {
      setSavingCategory(false);
    }
  };

  const deleteCategory = async (cat: AdminCategory) => {
    const action = `delete-category:${cat.id}` as const;
    if (!confirmBeforeAction(action)) return;
    setDeletingCategoryId(cat.id);
    try {
      const res = await fetch('/api/admin/quests/categories', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id: cat.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not delete category');
      await loadData();
    } catch (error) {
      setResult({ type: 'error', message: error instanceof Error ? error.message : 'Could not delete category' });
    } finally {
      setDeletingCategoryId(null);
    }
  };

  const rewardCatalog = useMemo(
    () => Object.fromEntries(rewardItems.map((reward) => [reward.id, reward])),
    [rewardItems],
  );

  const categorySaveButtonLabel = savingCategory
    ? 'Saving...'
    : confirmAction === 'save-category'
      ? editingCategory
        ? 'Tap Again to Save'
        : 'Tap Again to Create'
      : editingCategory
        ? 'Save Changes'
        : 'Create Category';
  const renderDaily = () => (
    <div className="space-y-6">
      {loading && adminRecipes.length === 0 ? <LoadingBlock rows={2} /> : null}
      {adminRecipes.map((r) => (
        <DailyQuestEditor
          key={r.recipeId}
          recipe={r}
          onChange={(updater) => updateRecipe(r.recipeId, updater)}
          rewardCatalog={rewardCatalog}
          onEditRewards={(slotId, kind) => setRecipeRewardTarget({ recipeId: r.recipeId, slotId, kind })}
          onOpenLibrary={() => goTab('asks')}
          onResetDefault={() => void resetRecipeToDefault(r.recipeId)}
          resetting={resettingRecipeId === r.recipeId}
          afterLineup={renderSweepCard()}
        />
      ))}
      {recipeRewardDialog}
    </div>
  );

  const renderWeb = () => <MoveToWebCard />;

  const renderStreaks = () => <DailyStreakPage />;

  const updateRecipe = (
    recipeId: string,
    updater: (recipe: AdminRecipe) => AdminRecipe,
  ) => {
    setAdminRecipes((prev) =>
      prev.map((r) => (r.recipeId === recipeId ? updater(r) : r)),
    );
  };

  const updateRecipeSlot = (
    recipeId: string,
    slotId: string,
    patch: Partial<AdminRecipeSlot>,
  ) => {
    updateRecipe(recipeId, (r) => ({
      ...r,
      slots: r.slots.map((slot) =>
        slot.id === slotId ? { ...slot, ...patch } : slot,
      ),
    }));
  };

  // Deletes the stored recipe; the reload that follows re-seeds it from
  // recipeDefaults.ts, which is what makes this a reset rather than a delete.
  const resetRecipeToDefault = async (recipeId: string) => {
    setResettingRecipeId(recipeId);
    try {
      const res = await fetch('/api/admin/quest-recipes', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ recipeId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not reset recipe');
      const reloaded = await fetch('/api/admin/quest-recipes', {
        credentials: 'include',
      });
      const reloadedData = await reloaded.json();
      if (!reloaded.ok) {
        throw new Error(reloadedData.error || 'Could not reload recipes');
      }
      setAdminRecipes((reloadedData.recipes ?? []) as AdminRecipe[]);
      setSavedRecipes((reloadedData.recipes ?? []) as AdminRecipe[]);
      setResult({
        type: 'success',
        message: 'Recipe reset to the built-in default',
      });
    } catch (error) {
      setResult({
        type: 'error',
        message:
          error instanceof Error ? error.message : 'Could not reset recipe',
      });
    } finally {
      setResettingRecipeId(null);
    }
  };

  const saveRecipe = async (recipeId: string) => {
    const target = adminRecipes.find((r) => r.recipeId === recipeId);
    if (!target) return;
    setSavingRecipeId(recipeId);
    try {
      const res = await fetch('/api/admin/quest-recipes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(target),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not save recipe');
      if (data.recipe) {
        updateRecipe(recipeId, () => data.recipe as AdminRecipe);
        setSavedRecipes((prev) => prev.map((r) => (r.recipeId === recipeId ? (data.recipe as AdminRecipe) : r)));
      }
      setResult({ type: 'success', message: 'Daily quests saved' });
    } catch (error) {
      setResult({
        type: 'error',
        message:
          error instanceof Error ? error.message : 'Could not save recipe',
      });
    } finally {
      setSavingRecipeId(null);
    }
  };

  const readFileAsDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });

  const recipeRewardDialogSlot = recipeRewardTarget
    ? adminRecipes
        .find((r) => r.recipeId === recipeRewardTarget.recipeId)
        ?.slots.find((slot) => slot.id === recipeRewardTarget.slotId)
    : undefined;
  const recipeRewardDialog = recipeRewardTarget ? (
    <RewardPickerDialog
      open={!!recipeRewardTarget}
      onOpenChange={(isOpen) => {
        if (!isOpen) setRecipeRewardTarget(null);
      }}
      rewards={
        recipeRewardTarget.kind === 'bonus'
          ? (recipeRewardDialogSlot?.bonusRewards ?? []).map((b) => b.reward)
          : recipeRewardDialogSlot?.rewards ?? []
      }
      rewardItems={rewardItems}
      rewardCatalog={rewardCatalog}
      onSave={(rewards) => {
        if (recipeRewardTarget.kind === 'bonus') {
          const previous = recipeRewardDialogSlot?.bonusRewards ?? [];
          updateRecipeSlot(recipeRewardTarget.recipeId, recipeRewardTarget.slotId, {
            bonusRewards: rewards.map((reward, i) => ({
              chance: previous[i]?.chance ?? 1,
              reward,
            })),
          });
        } else {
          updateRecipeSlot(recipeRewardTarget.recipeId, recipeRewardTarget.slotId, {
            rewards: rewards.length > 0 ? rewards : [],
          });
        }
        setRecipeRewardTarget(null);
      }}
    />
  ) : null;

  const saveSweepConfig = async () => {
    if (!sweepConfig) return;
    setSavingStreak(true);
    setResult(null);
    try {
      const res = await fetch('/api/admin/quests/streak', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          isActive: sweepConfig.isActive,
          cleanSweepFlies: sweepConfig.cleanSweepFlies,
          goldenEveryDays: sweepConfig.goldenEveryDays,
          megaEveryDays: sweepConfig.megaEveryDays,
          megaRewards: sweepConfig.megaRewards,
          standardRoll: sweepConfig.standardRoll,
          goldenRoll: sweepConfig.goldenRoll,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not save sweep config');
      setSweepConfig(data.sweep);
      setResult({ type: 'success', message: 'Clean Sweep saved' });
    } catch (error) {
      setResult({
        type: 'error',
        message:
          error instanceof Error ? error.message : 'Could not save sweep config',
      });
    } finally {
      setSavingStreak(false);
    }
  };

  const setSweepTable = (
    key: 'standardRoll' | 'goldenRoll',
    entries: SweepRollEntryInfo[],
  ) => setSweepConfig((prev) => (prev ? { ...prev, [key]: entries } : prev));

  const renderSweepCard = () => {
    if (!sweepConfig) return null;
    return (
      <div className="rounded-[24px] border border-border/70 bg-card shadow-[0_3px_0_0_hsl(var(--border))] px-4 py-3.5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-foreground">
              Clean Sweep &amp; Reward Roll
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Finishing all three daily quests pays the Clean Sweep flies and
              earns one Reward Roll from the table below.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={sweepConfig.isActive}
            onClick={() =>
              setSweepConfig((prev) =>
                prev ? { ...prev, isActive: !prev.isActive } : prev,
              )
            }
            className={cn(
              'relative h-6 w-11 shrink-0 rounded-full transition-colors',
              sweepConfig.isActive ? 'bg-emerald-500' : 'bg-muted',
            )}
          >
            <span
              className={cn(
                'absolute left-0 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
                sweepConfig.isActive ? 'translate-x-[22px]' : 'translate-x-0.5',
              )}
            />
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-end gap-4">
          <label className="block">
            <span className="text-[13px] font-bold tracking-wide text-muted-foreground">
              Clean Sweep flies
            </span>
            <input
              type="number"
              min={0}
              max={sweepConfig.limits.maxFlies}
              value={sweepConfig.cleanSweepFlies}
              onChange={(e) =>
                setSweepConfig((prev) =>
                  prev
                    ? {
                        ...prev,
                        cleanSweepFlies: Math.min(
                          prev.limits.maxFlies,
                          Math.max(0, Math.floor(Number(e.target.value) || 0)),
                        ),
                      }
                    : prev,
                )
              }
              className="mt-1 block h-10 w-24 rounded-xl border border-border/50 bg-background px-3 text-sm font-bold text-foreground"
            />
          </label>
          <Button
            size="sm"
            className="ml-auto rounded-xl font-black"
            onClick={() => void saveSweepConfig()}
            disabled={savingStreak}
          >
            {savingStreak ? 'Saving…' : 'Save sweep'}
          </Button>
        </div>

        <div className="mt-4">
          <SweepTableEditor
            title="Reward roll"
            hint="Rolled once every day all daily quests are finished."
            entries={sweepConfig.standardRoll}
            onChange={(entries) => setSweepTable('standardRoll', entries)}
            rewardItems={rewardItems}
            rewardCatalog={rewardCatalog}
          />
        </div>
      </div>
    );
  };

  const renderAreas = () => (
    <div className="space-y-8">

      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-black text-foreground">Focus areas</p>
            <p className="text-xs text-muted-foreground">
              The areas a user picks at onboarding. They seed the starter plan and the area quests.
            </p>
          </div>
          <Button size="sm" className="rounded-xl" onClick={() => openCategoryDialog()}>
            <Plus className="mr-1 h-4 w-4" />
            Add Area
          </Button>
        </div>

      <div className="space-y-2">
        {adminCategories.map((cat) => {
          const deleteAction = `delete-category:${cat.id}` as const;
          const confirmingDelete = confirmAction === deleteAction;
          const deletingCategory = deletingCategoryId === cat.id;
          return (
            <div key={cat.id} className="group flex items-center gap-4 rounded-[24px] border border-border/70 bg-card shadow-[0_3px_0_0_hsl(var(--border))] px-4 py-3.5 transition hover:border-primary/20 hover:bg-primary/[0.03]">
              <div
                className="h-10 w-10 shrink-0 overflow-hidden rounded-xl bg-muted/40 shadow-sm"
                style={{
                  background: cat.coverImageUrl
                    ? undefined
                    : `linear-gradient(135deg, ${cat.backgroundFrom}, ${cat.backgroundTo})`,
                }}
              >
                {cat.coverImageUrl && (
                  <img src={cat.coverImageUrl} alt="" className="h-full w-full object-cover" />
                )}
              </div>
              <button
                onClick={() => openCategoryDialog(cat)}
                className="min-w-0 flex-1 text-left"
              >
                <p className="truncate text-sm font-bold text-foreground">{cat.name}</p>
                {cat.description && (
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {cat.description}
                  </p>
                )}
              </button>
              <div className={cn(
                'flex shrink-0 items-center gap-1 opacity-100 transition [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100',
                confirmingDelete && 'opacity-100',
              )}>
                <button
                  onClick={() => openCategoryDialog(cat)}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <Edit2 className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => void deleteCategory(cat)}
                  disabled={deletingCategory}
                  title={confirmingDelete ? 'Tap again to delete' : 'Delete category'}
                  className={cn(
                    'flex h-8 items-center justify-center rounded-full text-xs font-bold transition',
                    confirmingDelete || deletingCategory
                      ? 'w-auto bg-red-500/10 px-2 text-red-500'
                      : 'w-8 text-muted-foreground hover:bg-red-500/10 hover:text-red-500',
                    deletingCategory && 'cursor-not-allowed opacity-60',
                  )}
                >
                  {deletingCategory ? (
                    'Deleting...'
                  ) : confirmingDelete ? (
                    'Tap again'
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>
      </div>

      <AdminStarterPlanConfigCard />
    </div>
  );

  // ── Interactive preview-centered quest editor ─────────────────────────────
  const dirtyRecipeIds = adminRecipes
    .filter((recipe) => {
      const saved = savedRecipes.find((item) => item.recipeId === recipe.recipeId);
      return !saved || JSON.stringify(saved) !== JSON.stringify(recipe);
    })
    .map((recipe) => recipe.recipeId);

  const saveDirtyRecipes = async () => {
    for (const recipeId of dirtyRecipeIds) {
      await saveRecipe(recipeId);
    }
  };

  const copy = TAB_COPY[tab];

  return (
    <AdminPage title={copy.title} subtitle={copy.subtitle} icon={copy.icon} wide={tab === 'season'}>
        {result ? (
          <Notice type={result.type} className="mb-5">
            {result.message}
          </Notice>
        ) : null}

        {tab === 'daily' && renderDaily()}
        {tab === 'asks' && <AdminPromptManager />}
        {tab === 'milestones' && <MilestonesPage />}
        {tab === 'web' && renderWeb()}
        {tab === 'season' && <AdminSeasonManager rewardItems={rewardItems} rewardCatalog={rewardCatalog} />}
        {tab === 'areas' && renderAreas()}
        {tab === 'leap' && <AdminLeapManager />}
        {tab === 'streaks' && renderStreaks()}

        <SaveBar
          dirty={tab === 'daily' && dirtyRecipeIds.length > 0}
          saving={savingRecipeId !== null}
          onSave={() => void saveDirtyRecipes()}
          onDiscard={() => setAdminRecipes(savedRecipes)}
          label="Daily quests have unsaved changes"
          saveLabel="Save lineup"
        />

        {/* Category dialog */}
        <Dialog open={categoryDialogOpen} onOpenChange={(open) => { setCategoryDialogOpen(open); if (!open) setConfirmAction(null); }}>
          <DialogContent className="flex max-h-[90vh] max-w-lg flex-col rounded-[32px] p-0 overflow-hidden">
            <div className="shrink-0 border-b border-border/50 bg-card/95 px-6 py-5">
              <DialogHeader>
                <DialogTitle className="text-2xl font-black">
                  {editingCategory ? 'Edit Category' : 'New Category'}
                </DialogTitle>
                <DialogDescription>
                  {editingCategory ? 'Edit the display properties of this category.' : 'Add a new focus category for quest organization.'}
                </DialogDescription>
              </DialogHeader>
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
              <label className="grid gap-2">
                <span className="text-[13px] font-black text-muted-foreground">Name</span>
                <input value={categoryForm.name} onChange={(e) => setCategoryForm((p) => ({ ...p, name: e.target.value }))} placeholder="e.g. Sport" className="h-11 rounded-2xl border border-border bg-background px-4 text-sm outline-none focus:border-primary/30" />
              </label>
              <label className="grid gap-2">
                <span className="text-[13px] font-black text-muted-foreground">Description</span>
                <textarea rows={3} value={categoryForm.description} onChange={(e) => setCategoryForm((p) => ({ ...p, description: e.target.value }))} placeholder="What this category is about." className="rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none focus:border-primary/30" />
              </label>
              <label className="grid gap-2">
                <span className="text-[13px] font-black text-muted-foreground">Onboarding Sentence</span>
                <input
                  value={categoryForm.onboardingSentence}
                  onChange={(e) => setCategoryForm((p) => ({ ...p, onboardingSentence: e.target.value }))}
                  placeholder="e.g. Be more active"
                  className="h-11 rounded-2xl border border-border bg-background px-4 text-sm outline-none focus:border-primary/30"
                />
                <span className="text-[11px] text-muted-foreground">
                  Shown as this area&apos;s label in the user onboarding flow. Falls back to the name if empty.
                </span>
              </label>
              <div className="rounded-2xl border border-border/50 bg-background/70 p-3">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <p className="text-[13px] font-black text-muted-foreground">Category Photo</p>
                  {categoryForm.coverImageUrl && (
                    <button
                      type="button"
                      onClick={() => setCategoryForm((prev) => ({ ...prev, coverImageUrl: undefined }))}
                      className="text-xs font-bold text-muted-foreground transition hover:text-foreground"
                    >
                      Remove
                    </button>
                  )}
                </div>
                <input
                  ref={(el) => { categoryFileInputRef.current = el; }}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    const coverImageUrl = await readFileAsDataUrl(file);
                    setCategoryForm((prev) => ({ ...prev, coverImageUrl }));
                  }}
                />
                <button
                  type="button"
                  onClick={() => categoryFileInputRef.current?.click()}
                  className="relative flex h-32 w-full items-center justify-center overflow-hidden rounded-xl border border-dashed border-border/60 bg-muted/30 text-sm font-bold text-muted-foreground transition hover:border-primary/25 hover:bg-primary/5 hover:text-foreground"
                >
                  {categoryForm.coverImageUrl ? (
                    <>
                      <img src={categoryForm.coverImageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
                      <span className="relative rounded-full bg-black/55 px-3 py-1.5 text-[13px] font-black text-white backdrop-blur-sm">
                        Change Photo
                      </span>
                    </>
                  ) : (
                    <span className="flex items-center gap-2">
                      <Camera className="h-4 w-4" />
                      Add Category Photo
                    </span>
                  )}
                </button>
              </div>
              <StarterTasksEditor
                categoryName={categoryForm.name}
                tasks={categoryForm.starterTasks}
                onChange={(starterTasks) =>
                  setCategoryForm((prev) => ({ ...prev, starterTasks }))
                }
              />
            </div>
            <DialogFooter className="shrink-0 border-t border-border/50 bg-card/95 px-6 py-4 sm:gap-3">
              <Button variant="outline" className="rounded-2xl" onClick={() => { setCategoryDialogOpen(false); setConfirmAction(null); }}>Cancel</Button>
              <Button className="rounded-2xl font-black" onClick={() => void saveCategory()} disabled={savingCategory || !categoryForm.name.trim()}>
                {categorySaveButtonLabel}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
    </AdminPage>
  );
}

type SweepAdderKind = 'FLIES' | 'BOX' | 'ITEM' | 'SHIELD' | 'RARITY_ITEM';

const SWEEP_RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

/**
 * One control for every outcome the roll tables can pay, including the two the
 * catalog cannot describe: a Lily Pad and a guaranteed-rarity draw.
 */
function SweepRewardAdder({
  rewardItems,
  onAdd,
  compact = false,
}: {
  rewardItems: MetaRewardItem[];
  onAdd: (reward: SweepRewardInfo) => void;
  compact?: boolean;
}) {
  const [kind, setKind] = useState<SweepAdderKind>('FLIES');
  const [amount, setAmount] = useState(15);
  const [rarity, setRarity] = useState('epic');
  // '' keeps the outcome a draw of that rarity; an id pins it to one outfit.
  const [rarityItemId, setRarityItemId] = useState('');
  const boxes = rewardItems.filter((item) => item.slot === 'container');
  const items = rewardItems.filter(
    (item) => item.slot !== 'container' && item.slot !== 'background',
  );
  const options = kind === 'BOX' ? boxes : items;
  const rarityOptions = items.filter((item) => item.rarity === rarity);
  const [itemId, setItemId] = useState(boxes[0]?.id ?? '');

  const build = (): SweepRewardInfo | null => {
    if (kind === 'FLIES') {
      const flies = Math.max(1, Math.floor(amount));
      return { type: 'FLIES', amountMode: 'fixed', amount: flies };
    }
    if (kind === 'SHIELD') return { type: 'SHIELD', amount: 1 };
    if (kind === 'RARITY_ITEM') {
      return {
        type: 'RARITY_ITEM',
        rarity,
        amount: 1,
        ...(rarityItemId ? { itemId: rarityItemId } : {}),
      };
    }
    const id = itemId || options[0]?.id;
    if (!id) return null;
    return kind === 'BOX'
      ? { type: 'BOX', itemId: id, amount: 1 }
      : { type: 'ITEM', itemId: id };
  };

  const selectClass =
    'h-8 rounded-lg border border-border/50 bg-background px-2 text-xs font-bold text-foreground';

  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', compact ? 'mt-2' : 'mt-3')}>
      <select
        value={kind}
        onChange={(e) => {
          const next = e.target.value as SweepAdderKind;
          setKind(next);
          if (next === 'BOX') setItemId(boxes[0]?.id ?? '');
          if (next === 'ITEM') setItemId(items[0]?.id ?? '');
        }}
        className={selectClass}
      >
        <option value="FLIES">Flies</option>
        <option value="BOX">Gift box</option>
        <option value="ITEM">Item</option>
        <option value="SHIELD">Lily Pad</option>
        <option value="RARITY_ITEM">Guaranteed rarity</option>
      </select>
      {kind === 'FLIES' && (
        <InlinePillNumber value={amount} onChange={(v) => setAmount(v)} />
      )}
      {(kind === 'BOX' || kind === 'ITEM') && (
        <select
          value={itemId}
          onChange={(e) => setItemId(e.target.value)}
          className={cn(selectClass, 'max-w-[180px]')}
        >
          {options.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      )}
      {kind === 'RARITY_ITEM' && (
        <>
          <select
            value={rarity}
            onChange={(e) => {
              setRarity(e.target.value);
              setRarityItemId('');
            }}
            className={selectClass}
          >
            {SWEEP_RARITIES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
          <select
            value={rarityItemId}
            onChange={(e) => setRarityItemId(e.target.value)}
            className={cn(selectClass, 'max-w-[180px]')}
          >
            <option value="">Random of this rarity</option>
            {rarityOptions.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </>
      )}
      <button
        type="button"
        onClick={() => {
          const reward = build();
          if (reward) onAdd(reward);
        }}
        className="inline-flex items-center gap-1 rounded-full border border-border/50 bg-background px-2.5 py-1 text-xs font-bold text-muted-foreground transition hover:border-primary/30 hover:text-foreground"
      >
        <Plus className="h-3 w-3" />
        Add outcome
      </button>
    </div>
  );
}

/**
 * A roll table: every outcome with the odds it lands at. Chances are entered as
 * percentages and normalised by their sum at draw time, so a table that does
 * not add up to 100 still behaves — the header says what it really adds to.
 */
function SweepTableEditor({
  title,
  hint,
  entries,
  onChange,
  rewardItems,
  rewardCatalog,
  golden = false,
}: {
  title: string;
  hint: string;
  entries: SweepRollEntryInfo[];
  onChange: (entries: SweepRollEntryInfo[]) => void;
  rewardItems: MetaRewardItem[];
  rewardCatalog: Record<string, QuestRewardCatalogItem>;
  golden?: boolean;
}) {
  const total = entries.reduce((sum, entry) => sum + Math.max(0, entry.chance), 0);
  const flyEV = entries.reduce((sum, entry) => {
    if (entry.reward.type !== 'FLIES') return sum;
    const amount = (entry.reward as QuestReward).amount ?? 0;
    return sum + (Math.max(0, entry.chance) / (total || 1)) * amount;
  }, 0);
  const giftEV = entries.reduce(
    (sum, entry) =>
      entry.reward.type === 'FLIES'
        ? sum
        : sum + Math.max(0, entry.chance) / (total || 1),
    0,
  );

  return (
    <div
      className={cn(
        'rounded-xl border px-3 py-3',
        golden
          ? 'border-amber-400/50 bg-amber-50/50 dark:bg-amber-500/5'
          : 'border-border/40 bg-background/60',
      )}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[13px] font-black tracking-wide text-foreground">
          {title}
        </p>
        <p className="text-[11px] font-bold tabular-nums text-muted-foreground">
          EV {Math.round(flyEV)} flies + {(Math.round(giftEV * 100) / 100).toFixed(2)} gifts
        </p>
      </div>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>
      {Math.abs(total - 100) > 0.01 && entries.length > 0 && (
        <p className="mt-1 text-[11px] font-bold text-amber-600 dark:text-amber-400">
          Odds add up to {Math.round(total * 100) / 100}% — they are normalised
          when drawn.
        </p>
      )}

      <div className="mt-2 space-y-1.5">
        {entries.length === 0 && (
          <p className="text-xs text-muted-foreground">No outcomes yet.</p>
        )}
        {entries.map((entry, index) => (
          <div
            key={entry.id || index}
            className="flex items-center gap-2 rounded-lg border border-border/40 bg-card px-2 py-1.5"
          >
            <SweepRewardTile
              reward={entry.reward}
              rewardCatalog={rewardCatalog}
              isPremium={false}
              className="h-9 w-9 shrink-0 rounded-lg"
            />
            {entry.reward.type === 'RARITY_ITEM' ? (
              <select
                value={(entry.reward as { itemId?: string }).itemId ?? ''}
                onChange={(e) =>
                  onChange(
                    entries.map((current, i) =>
                      i === index
                        ? {
                            ...current,
                            reward: {
                              ...(current.reward as {
                                type: 'RARITY_ITEM';
                                rarity: string;
                                amount?: number;
                              }),
                              itemId: e.target.value || undefined,
                            },
                          }
                        : current,
                    ),
                  )
                }
                className="h-8 min-w-0 flex-1 rounded-lg border border-border/50 bg-background px-2 text-xs font-bold text-foreground"
              >
                <option value="">
                  Random{' '}
                  {(entry.reward as { rarity: string }).rarity} outfit
                </option>
                {rewardItems
                  .filter(
                    (item) =>
                      item.slot !== 'container' &&
                      item.slot !== 'background' &&
                      item.rarity ===
                        (entry.reward as { rarity: string }).rarity,
                  )
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
              </select>
            ) : (
              <span className="min-w-0 flex-1 truncate text-xs font-bold text-foreground">
                {sweepRewardLabel(entry.reward, rewardCatalog)}
              </span>
            )}
            <input
              type="number"
              min={0}
              step={0.5}
              value={entry.chance}
              onChange={(e) =>
                onChange(
                  entries.map((current, i) =>
                    i === index
                      ? {
                          ...current,
                          chance: Math.max(
                            0,
                            Math.round((Number(e.target.value) || 0) * 100) / 100,
                          ),
                        }
                      : current,
                  ),
                )
              }
              className="h-8 w-16 rounded-lg border border-border/50 bg-background px-2 text-right text-xs font-bold text-foreground [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
            />
            <span className="text-xs font-bold text-muted-foreground">%</span>
            <button
              type="button"
              onClick={() => onChange(entries.filter((_, i) => i !== index))}
              className="text-muted-foreground transition hover:text-red-500"
              aria-label="Remove outcome"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>

      <SweepRewardAdder
        rewardItems={rewardItems}
        compact
        onAdd={(reward) =>
          onChange([
            ...entries,
            {
              id: `entry-${Date.now()}-${entries.length}`,
              chance: 10,
              reward,
            },
          ])
        }
      />
    </div>
  );
}

function InlinePillNumber({ value, onChange, min = 1, className }: { value: number; onChange: (v: number) => void; min?: number; className?: string }) {
  return (
    <input
      type="number"
      min={min}
      value={String(value)}
      onChange={(e) => onChange(Number(e.target.value) || min)}
      className={cn(
        "h-[30px] w-[52px] rounded-full border border-primary/25 bg-primary/8 px-1 text-center text-[13px] font-bold text-primary outline-none transition hover:bg-primary/15 focus:ring-2 focus:ring-primary/20 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
        className,
      )}
    />
  );
}

function RewardPickerDialog({
  open,
  onOpenChange,
  rewards,
  rewardItems,
  rewardCatalog,
  singleSelect = false,
  maxSelect,
  tabs = ALL_REWARD_PICKER_TABS,
  title,
  description,
  confirmSave = false,
  onRequestConfirmSave,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rewards: QuestReward[];
  rewardItems: MetaRewardItem[];
  rewardCatalog: Record<string, QuestRewardCatalogItem>;
  singleSelect?: boolean;
  /** Cap the selection at N rewards; picking past the cap replaces the oldest. */
  maxSelect?: number;
  /** Narrow the picker to specific kinds — a skin slot only wants outfits. */
  tabs?: readonly RewardPickerTab[];
  title?: string;
  description?: string;
  confirmSave?: boolean;
  onRequestConfirmSave?: () => void;
  onSave: (rewards: QuestReward[]) => void;
}) {
  const selectLimit = singleSelect ? 1 : (maxSelect ?? Infinity);
  const normalizeCapped = (list: QuestReward[]) =>
    Number.isFinite(selectLimit)
      ? normalizeRewardList(list).slice(0, selectLimit)
      : normalizeRewardList(list);
  const [activeTab, setActiveTab] = useState<RewardPickerTab>(
    () => tabs[0] ?? 'flies',
  );
  const [draft, setDraft] = useState<QuestReward[]>(() =>
    normalizeRewardList(rewards),
  );

  useEffect(() => {
    if (!open) return;
    setDraft(normalizeCapped(rewards));
    setActiveTab((current) =>
      tabs.includes(current) ? current : tabs[0] ?? 'flies',
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, rewards, selectLimit]);

  const fliesReward = draft.find((reward) => reward.type === 'FLIES');
  const shieldReward = draft.find((reward) => reward.type === 'SHIELD');
  const itemOptions = rewardItems.filter(
    (item) => item.slot !== 'container' && item.slot !== 'background',
  );
  const boxOptions = rewardItems.filter((item) => item.slot === 'container');
  const backgroundOptions = rewardItems.filter((item) => item.slot === 'background');

  const toggleFliesReward = () => {
    setDraft((current) => {
      const existing = current.find((reward) => reward.type === 'FLIES');
      if (existing) {
        return current.filter((reward) => reward.type !== 'FLIES');
      }
      const next: QuestReward[] = [
        { type: 'FLIES', amountMode: 'fixed', amount: 50 },
        ...current,
      ];
      return Number.isFinite(selectLimit) ? next.slice(0, selectLimit) : next;
    });
  };

  const patchFliesReward = (patch: Partial<QuestReward>) => {
    setDraft((current) =>
      current.map((reward) =>
        reward.type === 'FLIES' ? { ...reward, ...patch } : reward,
      ),
    );
  };

  const toggleShieldReward = () => {
    setDraft((current) => {
      if (current.some((reward) => reward.type === 'SHIELD')) {
        return current.filter((reward) => reward.type !== 'SHIELD');
      }
      const next: QuestReward[] = [
        ...current,
        { type: 'SHIELD', amount: 1, amountMode: 'fixed' },
      ];
      return Number.isFinite(selectLimit)
        ? next.slice(Math.max(0, next.length - selectLimit))
        : next;
    });
  };

  const patchShieldReward = (amount: number) => {
    setDraft((current) =>
      current.map((reward) =>
        reward.type === 'SHIELD' ? { ...reward, amount } : reward,
      ),
    );
  };

  const patchBoxReward = (itemId: string, patch: Partial<QuestReward>) => {
    setDraft((current) =>
      current.map((reward) =>
        reward.type === 'BOX' && reward.itemId === itemId
          ? { ...reward, ...patch }
          : reward,
      ),
    );
  };

  const toggleCatalogReward = (type: 'ITEM' | 'BOX', itemId: string) => {
    setDraft((current) => {
      const exists = current.some(
        (reward) => reward.type === type && reward.itemId === itemId,
      );
      if (exists) {
        return current.filter(
          (reward) => !(reward.type === type && reward.itemId === itemId),
        );
      }
      const next: QuestReward[] = [
        ...current,
        {
          type,
          itemId,
          ...(type === 'BOX' ? { amount: 1, amountMode: 'fixed' as const } : {}),
        },
      ];
      return Number.isFinite(selectLimit)
        ? next.slice(Math.max(0, next.length - selectLimit))
        : next;
    });
  };

  const toggleBackgroundReward = (backgroundId: string) => {
    setDraft((current) => {
      const exists = current.some(
        (reward) => reward.type === 'BACKGROUND' && reward.backgroundId === backgroundId,
      );
      if (exists) {
        return current.filter(
          (reward) => !(reward.type === 'BACKGROUND' && reward.backgroundId === backgroundId),
        );
      }
      const next: QuestReward[] = [
        ...current,
        { type: 'BACKGROUND', backgroundId },
      ];
      return Number.isFinite(selectLimit)
        ? next.slice(Math.max(0, next.length - selectLimit))
        : next;
    });
  };

  const handleSave = () => {
    if (confirmSave && onRequestConfirmSave) {
      onRequestConfirmSave();
      return;
    }
    onSave(normalizeCapped(draft));
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl rounded-[32px] p-0 overflow-hidden">
        <div className="border-b border-border/50 bg-card/95 px-6 py-5">
          <DialogHeader className="mb-0">
            <DialogTitle className="text-2xl font-black">
              {title ?? 'Reward Picker'}
            </DialogTitle>
            <DialogDescription>
              {description ??
                'Select multiple rewards from flies, items, and boxes. Fly and box rewards support amounts. Item rewards grant one copy each.'}
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="max-h-[75vh] overflow-y-auto px-6 py-5">
          <div
            className={cn(
              'mb-5 flex-wrap gap-2',
              tabs.length > 1 ? 'flex' : 'hidden',
            )}
          >
            {tabs.map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={cn(
                  'rounded-2xl border px-4 py-2 text-sm font-black transition',
                  activeTab === tab
                    ? 'border-primary/30 bg-primary/10 text-primary'
                    : 'border-border/50 bg-background text-muted-foreground hover:bg-muted/40 hover:text-foreground',
                )}
              >
                {tab === 'flies'
                  ? 'Flies'
                  : tab === 'shield'
                    ? 'Lily Pads'
                    : tab === 'item'
                      ? 'Items'
                      : tab === 'box'
                        ? 'Boxes'
                        : 'Backgrounds'}
              </button>
            ))}
          </div>

          <div className="mb-6 rounded-[24px] border border-border/50 bg-background/70 p-4">
            <p className="text-[13px] font-black text-muted-foreground">
              Selected Rewards
            </p>
            {draft.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">
                Nothing selected yet.
              </p>
            ) : (
              <div className="mt-3 flex flex-wrap gap-3">
                {draft.map((reward) => (
                  <div
                    key={rewardKey(reward)}
                    className="flex items-center gap-3 rounded-2xl border border-border/50 bg-card px-3 py-2"
                  >
                    <RewardTile
                      reward={reward}
                      rewardCatalog={rewardCatalog}
                      isPremium={false}
                    />
                    <div>
                      <p className="text-sm font-bold text-foreground">
                        {rewardSummary(reward, rewardCatalog)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {rewardTypeLabel(reward.type)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {activeTab === 'shield' ? (
            <div className="space-y-4">
              <button
                type="button"
                onClick={toggleShieldReward}
                className={cn(
                  'flex w-full items-center gap-4 rounded-[26px] border p-4 text-left transition',
                  shieldReward
                    ? 'border-primary/30 bg-primary/10'
                    : 'border-border/50 bg-background/70 hover:bg-muted/40',
                )}
              >
                <RewardTile
                  reward={shieldReward ?? { type: 'SHIELD', amount: 1, amountMode: 'fixed' }}
                  rewardCatalog={rewardCatalog}
                  isPremium={false}
                />
                <div>
                  <p className="text-base font-black text-foreground">Lily Pad</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    A streak shield, drawn from the shared pool — a player at
                    their cap simply keeps the cap.
                  </p>
                </div>
              </button>

              {shieldReward ? (
                <label className="grid gap-2 rounded-[26px] border border-border/50 bg-background/70 p-4">
                  <span className="text-[13px] font-black text-muted-foreground">
                    How many
                  </span>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={shieldReward.amount ?? 1}
                    onChange={(event) =>
                      patchShieldReward(
                        Math.min(
                          10,
                          Math.max(1, Math.floor(Number(event.target.value) || 1)),
                        ),
                      )
                    }
                    className="h-11 w-32 rounded-2xl border border-border bg-background px-4 text-sm font-bold"
                  />
                </label>
              ) : null}
            </div>
          ) : activeTab === 'flies' ? (
            <div className="space-y-4">
              <button
                type="button"
                onClick={toggleFliesReward}
                className={cn(
                  'flex w-full items-center gap-4 rounded-[26px] border p-4 text-left transition',
                  fliesReward
                    ? 'border-primary/30 bg-primary/10'
                    : 'border-border/50 bg-background/70 hover:bg-muted/40',
                )}
              >
                <RewardTile
                  reward={fliesReward ?? { type: 'FLIES', amount: 50, amountMode: 'fixed' }}
                  rewardCatalog={rewardCatalog}
                  isPremium={false}
                />
                <div>
                  <p className="text-base font-black text-foreground">Fly Reward</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {fliesReward
                      ? rewardSummary(fliesReward, rewardCatalog)
                      : 'Add flies as a reward'}
                  </p>
                </div>
              </button>

              {fliesReward ? (
                <div className="grid gap-4 rounded-[26px] border border-border/50 bg-background/70 p-4 md:grid-cols-3">
                  <label className="grid gap-2">
                    <span className="text-[13px] font-black text-muted-foreground">
                      Amount Mode
                    </span>
                    <select
                      value={fliesReward.amountMode ?? 'fixed'}
                      onChange={(event) =>
                        patchFliesReward(
                          event.target.value === 'random'
                            ? {
                                amountMode: 'random',
                                amount: undefined,
                                minAmount: fliesReward.minAmount ?? 25,
                                maxAmount:
                                  fliesReward.maxAmount ??
                                  Math.max(fliesReward.amount ?? 50, 25),
                              }
                            : {
                                amountMode: 'fixed',
                                amount:
                                  fliesReward.amount ??
                                  fliesReward.maxAmount ??
                                  50,
                                minAmount: undefined,
                                maxAmount: undefined,
                              },
                        )
                      }
                      className="h-11 rounded-2xl border border-border bg-background px-4 text-sm"
                    >
                      <option value="fixed">Fixed</option>
                      <option value="random">Random Range</option>
                    </select>
                  </label>

                  {(fliesReward.amountMode ?? 'fixed') === 'fixed' ? (
                    <label className="grid gap-2 md:col-span-2">
                      <span className="text-[13px] font-black text-muted-foreground">
                        Flies Amount
                      </span>
                      <input
                        type="number"
                        min={1}
                        value={String(fliesReward.amount ?? 50)}
                        onChange={(event) =>
                          patchFliesReward({
                            amount: Number(event.target.value) || 1,
                          })
                        }
                        className="h-11 rounded-2xl border border-border bg-background px-4 text-sm"
                      />
                    </label>
                  ) : (
                    <>
                      <label className="grid gap-2">
                        <span className="text-[13px] font-black text-muted-foreground">
                          Min Flies
                        </span>
                        <input
                          type="number"
                          min={1}
                          value={String(fliesReward.minAmount ?? 25)}
                          onChange={(event) =>
                            patchFliesReward({
                              minAmount: Number(event.target.value) || 1,
                            })
                          }
                          className="h-11 rounded-2xl border border-border bg-background px-4 text-sm"
                        />
                      </label>
                      <label className="grid gap-2">
                        <span className="text-[13px] font-black text-muted-foreground">
                          Max Flies
                        </span>
                        <input
                          type="number"
                          min={1}
                          value={String(fliesReward.maxAmount ?? 50)}
                          onChange={(event) =>
                            patchFliesReward({
                              maxAmount: Number(event.target.value) || 1,
                            })
                          }
                          className="h-11 rounded-2xl border border-border bg-background px-4 text-sm"
                        />
                      </label>
                    </>
                  )}
                </div>
              ) : null}
            </div>
          ) : activeTab === 'background' ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {backgroundOptions.map((item) => {
                const selected = draft.some(
                  (reward) =>
                    reward.type === 'BACKGROUND' && reward.backgroundId === item.id,
                );
                return (
                  <button
                    key={`BACKGROUND-${item.id}`}
                    type="button"
                    onClick={() => toggleBackgroundReward(item.id)}
                    className={cn(
                      'flex items-center gap-4 rounded-[24px] border p-4 text-left transition',
                      selected
                        ? 'border-primary/30 bg-primary/10'
                        : 'border-border/50 bg-background/70 hover:bg-muted/40',
                    )}
                  >
                    <RewardTile
                      reward={{ type: 'BACKGROUND', backgroundId: item.id }}
                      rewardCatalog={rewardCatalog}
                      isPremium={false}
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-foreground">
                        {item.name}
                      </p>
                      <p className="mt-1 text-[13px] font-black text-muted-foreground">
                        {item.rarity}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {selected ? 'One background reward' : 'Click to add'}
                      </p>
                    </div>
                  </button>
                );
              })}
              {backgroundOptions.length === 0 && (
                <div className="col-span-full rounded-2xl border border-dashed border-border p-5 text-center text-xs font-bold text-muted-foreground">
                  No backgrounds available.
                </div>
              )}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {(activeTab === 'item' ? itemOptions : boxOptions).map((item) => {
                const rewardType: 'ITEM' | 'BOX' =
                  activeTab === 'item' ? 'ITEM' : 'BOX';
                const selectedReward = draft.find(
                  (reward) =>
                    reward.type === rewardType && reward.itemId === item.id,
                );
                const selected = !!selectedReward;

                return (
                  <div key={`${rewardType}-${item.id}`} className="flex flex-col gap-0">
                    <button
                      type="button"
                      onClick={() => toggleCatalogReward(rewardType, item.id)}
                      className={cn(
                        'flex items-center gap-4 rounded-[24px] border p-4 text-left transition',
                        selected
                          ? 'border-primary/30 bg-primary/10'
                          : 'border-border/50 bg-background/70 hover:bg-muted/40',
                        selected && rewardType === 'BOX' && 'rounded-b-none border-b-0',
                      )}
                    >
                      <RewardTile
                        reward={selectedReward ?? { type: rewardType, itemId: item.id }}
                        rewardCatalog={rewardCatalog}
                        isPremium={false}
                      />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black text-foreground">
                          {item.name}
                        </p>
                        <p className="mt-1 text-[13px] font-black text-muted-foreground">
                          {item.rarity}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {rewardType === 'BOX'
                            ? selected
                              ? `×${selectedReward.amount ?? 1}`
                              : 'Click to add'
                            : selected
                              ? 'One item reward'
                              : 'Click to add'}
                        </p>
                      </div>
                    </button>
                    {selected && rewardType === 'BOX' && (
                      <div
                        className="flex items-center gap-3 rounded-b-[24px] border border-t-0 border-primary/30 bg-primary/5 px-4 py-3"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <span className="text-[13px] font-black text-muted-foreground">
                          Amount
                        </span>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              patchBoxReward(item.id, {
                                amount: Math.max(1, (selectedReward.amount ?? 1) - 1),
                              })
                            }
                            className="flex h-7 w-7 items-center justify-center rounded-full border border-border/50 bg-background text-sm font-bold hover:bg-muted/60 transition"
                          >
                            −
                          </button>
                          <input
                            type="number"
                            min={1}
                            value={String(selectedReward.amount ?? 1)}
                            onChange={(e) =>
                              patchBoxReward(item.id, {
                                amount: Math.max(1, Number(e.target.value) || 1),
                              })
                            }
                            className="h-7 w-12 rounded-lg border border-border bg-background text-center text-sm font-bold"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              patchBoxReward(item.id, {
                                amount: (selectedReward.amount ?? 1) + 1,
                              })
                            }
                            className="flex h-7 w-7 items-center justify-center rounded-full border border-border/50 bg-background text-sm font-bold hover:bg-muted/60 transition"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <DialogFooter className="border-t border-border/50 bg-card/95 px-6 py-4 sm:space-x-0 sm:gap-3">
          <Button
            variant="outline"
            className="rounded-2xl"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            className="rounded-2xl font-black"
            onClick={handleSave}
            disabled={draft.length === 0}
          >
            {confirmSave ? 'Tap Again to Save' : 'Save Rewards'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
