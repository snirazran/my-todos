'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Camera,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Clock,
  Edit2,
  Eye,
  Flame,
  Footprints,
  Gift,
  Layers3,
  Monitor,
  CalendarDays,
  Pencil,
  Plus,
  RotateCcw,
  ScrollText,
  Trash2,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/Icon';
import { AdminPactManager } from '@/components/ui/AdminPactManager';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { QUEST_METRIC_COPY } from '@/lib/quests/metricLabels';
import type { LoginStreakReward } from '@/lib/streak/types';
import type {
  QuestLogicBlock,
  QuestPlacement,
  QuestReward,
  QuestRewardType,
  QuestRewards,
  QuestSubject,
  QuestVisibilityCondition,
  QuestVisibilityMetric,
  QuestVisibilityOperator,
} from '@/lib/quests/types';
import { SEASON_REWARDS_PER_LANE } from '@/lib/quests/types';
import {
  formatQuestObjective,
  type QuestCardLogicBlock,
  type QuestRewardCatalogItem,
  RewardTile,
  SweepRewardTile,
  sweepRewardLabel,
  type SweepRewardInfo,
  type SweepRollEntryInfo,
} from './QuestCards';

type AdminQuestTemplate = {
  id: string;
  name: string;
  description: string;
  coverImageUrl?: string;
  placement: QuestPlacement;
  logic: QuestLogicBlock[];
  visibilityConditions: QuestVisibilityCondition[];
  isActive: boolean;
  createdAt?: string;
};

type SeasonSizeKey = 'mobile' | 'tablet' | 'web' | 'webLarge';
type SeasonImages = Record<SeasonSizeKey, string>;

type AdminQuestSeason = {
  id: string;
  name: string;
  images: SeasonImages;
  startsAt: string;
  endsAt: string;
  dailyTargetFlies: number;
  dayRewards: Array<{
    day: number;
    freeRewards: QuestRewards;
    premiumRewards: QuestRewards;
    rewards?: QuestRewards;
  }>;
  isActive: boolean;
};

const emptySeasonImages = (): SeasonImages => ({
  mobile: '',
  tablet: '',
  web: '',
  webLarge: '',
});

const SEASON_SIZE_FIELDS: {
  key: SeasonSizeKey;
  label: string;
  hint: string;
}[] = [
  { key: 'mobile', label: 'Mobile', hint: 'default (<768px)' },
  { key: 'tablet', label: 'Tablet', hint: '≥768px' },
  { key: 'web', label: 'Web', hint: '≥1280px' },
  { key: 'webLarge', label: 'Web Large', hint: '≥1920px' },
];

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

type AdminLoginStreakTier = {
  days: number;
  rewards: LoginStreakReward[];
};

type AdminLoginStreakConfig = {
  isActive: boolean;
  saverMinStreak: number;
  goalTiers: AdminLoginStreakTier[];
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
};

type CategoryFormState = {
  name: string;
  description: string;
  onboardingSentence: string;
  coverImageUrl?: string;
};

type AdminRecipePoolEntryStreak = {
  streakDaysMin?: number;
  streakDaysMax?: number;
};

type AdminRecipePoolEntry = AdminRecipePoolEntryStreak & {
  id: string;
  type:
    | 'count'
    | 'focus_minutes'
    | 'metric_count'
    | 'distinct_days'
    | 'deep_session';
  action?: 'complete' | 'add';
  metricKey?: string;
  sessionMinutes?: number;
  requiresFollowThrough?: boolean;
  beforeHour?: number;
  minTarget: number;
  maxTarget: number;
  weight: number;
};

type AdminRecipeBonusReward = {
  chance: number;
  reward: QuestReward;
};

type AdminRecipeSlot = {
  id: string;
  pool: AdminRecipePoolEntry[];
  rewards: QuestReward[];
  bonusRewards?: AdminRecipeBonusReward[];
};

type AdminRecipe = {
  recipeId: string;
  name: string;
  isActive: boolean;
  coverImageUrl?: string;
  slots: AdminRecipeSlot[];
};

type AdminShieldConfig = {
  isActive: boolean;
  priceFlies: number;
  twoPackPriceFlies: number;
  capFree: number;
  capPlus: number;
  plusMonthlyGrant: number;
  rescueCooldownDays: number;
  offerCooldownDays: number;
  offerMinStreak: number;
  earnEveryPactWeeks: number;
  limits: { capMin: number; capMax: number };
};

type ViewLevel =
  | 'home'
  | 'daily'
  | 'onboarding'
  | 'streaks'
  | 'shields'
  | 'pact'
  | 'moveToWeb'
  | 'season'
  | 'form';

type FormState = {
  id?: string;
  name: string;
  description: string;
  coverImageUrl?: string;
  placement: QuestPlacement;
  logic: QuestLogicBlock[];
  visibilityConditions: QuestVisibilityCondition[];
  isActive: boolean;
};

type SeasonFormState = {
  id?: string;
  name: string;
  images: SeasonImages;
  startsAt: string;
  endsAt: string;
  dailyTargetFlies: number;
  dayCount: number;
  dayRewards: Array<{
    day: number;
    freeRewards: QuestRewards;
    premiumRewards: QuestRewards;
  }>;
  isActive: boolean;
};

type SeasonRewardPickerTarget = {
  day: number;
  tier: 'free' | 'premium';
};

type RewardPickerTab = 'flies' | 'item' | 'box' | 'background';
type ConfirmAction =
  | 'save-quest'
  | 'save-season'
  | 'delete-quest'
  | 'save-category'
  | `delete-category:${string}`;

const createLogic = (): QuestLogicBlock => ({
  id: crypto.randomUUID(),
  type: 'count',
  subject: 'task',
  action: 'complete',
  amountMode: 'fixed',
  amount: 3,
  minAmount: undefined,
  maxAmount: undefined,
  tagMode: 'ignore',
});
const createVisibilityCondition = (): QuestVisibilityCondition => ({
  id: crypto.randomUUID(),
  metric: 'daily_tasks_count',
  operator: 'gt',
  value: 0,
});

const emptyForm = (): FormState => ({
  name: '',
  description: '',
  coverImageUrl: undefined,
  placement: 'onboarding',
  logic: [createLogic()],
  visibilityConditions: [],
  isActive: true,
});

const emptySeasonForm = (): SeasonFormState => {
  const now = new Date();
  const end = new Date(now.getTime() + 7 * 86_400_000);
  const startsAt = toDateTimeLocalValue(now);
  const endsAt = toDateTimeLocalValue(end);
  const dayCount = getSeasonDayCountFromLocalValues(startsAt, endsAt);
  return {
    name: '',
    images: emptySeasonImages(),
    startsAt,
    endsAt,
    dailyTargetFlies: 3,
    dayCount,
    dayRewards: buildSeasonDayRewards([], dayCount),
    isActive: true,
  };
};

function positiveNumber(value: number | undefined, fallback: number) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

function amountRangeLabel(min: number | undefined, max: number | undefined) {
  const safeMin = positiveNumber(min, 1);
  const safeMax = Math.max(safeMin, positiveNumber(max, safeMin));
  return safeMin === safeMax ? String(safeMax) : `${safeMin}-${safeMax}`;
}

function toDateTimeLocalValue(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function isoToDateTimeLocalValue(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return toDateTimeLocalValue(date);
}

function isoFromDateTimeLocalValue(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : value;
}

function getSeasonDayCountFromLocalValues(startsAt: string, endsAt: string) {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  if (
    !Number.isFinite(start.getTime()) ||
    !Number.isFinite(end.getTime()) ||
    end <= start
  ) {
    return 1;
  }
  return Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86_400_000));
}

function buildDefaultSeasonDayReward(
  day: number,
): SeasonFormState['dayRewards'][number] {
  return {
    day,
    freeRewards: [{ type: 'FLIES', amountMode: 'fixed', amount: 50 }],
    premiumRewards: [{ type: 'FLIES', amountMode: 'fixed', amount: 100 }],
  };
}

function buildSeasonDayRewards(
  existingRewards: SeasonFormState['dayRewards'],
  dayCount: number,
) {
  return Array.from({ length: dayCount }, (_, index) => {
    const day = index + 1;
    return (
      existingRewards.find((entry) => entry.day === day) ??
      buildDefaultSeasonDayReward(day)
    );
  });
}

function buildPreviewLogicBlock(block: QuestLogicBlock): QuestCardLogicBlock {
  const isRandom = block.amountMode === 'random';
  const target = isRandom
    ? Math.max(
        positiveNumber(block.minAmount, 1),
        positiveNumber(block.maxAmount, positiveNumber(block.minAmount, 1)),
      )
    : positiveNumber(block.amount, 1);

  return {
    id: block.id,
    type: block.type,
    subject: block.subject,
    action: block.action,
    target,
    progress: 0,
    tagMode: block.tagMode,
    metricKey: block.metricKey,
    targetLabel: isRandom
      ? amountRangeLabel(block.minAmount, block.maxAmount)
      : String(target),
    resolvedTagName:
      block.tagMode === 'random_user_tag' ? 'Random user tag' : undefined,
    previewTagLabel:
      block.tagMode === 'random_user_tag' ? 'Random user tag' : undefined,
    rewards: block.rewards,
  };
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
  return `${reward.type}:${reward.itemId ?? reward.backgroundId ?? ''}`;
}

function normalizeRewardList(rewards: QuestReward[]) {
  const flies = rewards
    .filter((reward) => reward.type === 'FLIES')
    .slice(0, 1);
  const items = rewards.filter((reward) => reward.type === 'ITEM' && reward.itemId);
  const boxes = rewards.filter((reward) => reward.type === 'BOX' && reward.itemId);
  const backgrounds = rewards.filter(
    (reward) => reward.type === 'BACKGROUND' && reward.backgroundId,
  );
  return [...flies, ...items, ...boxes, ...backgrounds];
}

function normalizeSeasonLaneRewards(rewards: QuestReward[]) {
  return normalizeRewardList(rewards).slice(0, SEASON_REWARDS_PER_LANE);
}

function rewardTypeLabel(type: QuestRewardType) {
  if (type === 'FLIES') return 'Flies';
  if (type === 'BOX') return 'Box';
  if (type === 'BACKGROUND') return 'Background';
  return 'Item';
}

export function AdminQuestManagerPage() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [templates, setTemplates] = useState<AdminQuestTemplate[]>([]);
  const [seasons, setSeasons] = useState<AdminQuestSeason[]>([]);
  const [rewardItems, setRewardItems] = useState<MetaRewardItem[]>([]);
  const [adminCategories, setAdminCategories] = useState<AdminCategory[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [seasonForm, setSeasonForm] = useState<SeasonFormState>(
    emptySeasonForm,
  );
  const [seasonRewardPickerTarget, setSeasonRewardPickerTarget] =
    useState<SeasonRewardPickerTarget | null>(null);
  const [confirmSeasonPrizeSave, setConfirmSeasonPrizeSave] = useState(false);
  const [conditionsPopupOpen, setConditionsPopupOpen] = useState(false);
  const [availabilityPopupOpen, setAvailabilityPopupOpen] = useState(false);
  const [coverFileInputRef] = useState<{ current: HTMLInputElement | null }>({ current: null });
  const [categoryFileInputRef] = useState<{ current: HTMLInputElement | null }>({ current: null });
  const [editingTitle, setEditingTitle] = useState(false);
  const [result, setResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);

  // Navigation
  const [view, setView] = useState<ViewLevel>('home');

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
  });

  // Clean Sweep bonus + Reward Roll tables
  const [sweepConfig, setSweepConfig] = useState<AdminSweepConfig | null>(null);
  const [savingStreak, setSavingStreak] = useState(false);

  // Automatic monthly season config
  const [seasonAutoConfig, setSeasonAutoConfig] = useState<{
    isActive: boolean;
    dailyTargetFlies: number;
    limits: { min: number; max: number };
  } | null>(null);
  const [savingSeasonAuto, setSavingSeasonAuto] = useState(false);

  // Move to web config
  const [moveToWebConfig, setMoveToWebConfig] = useState<{
    isActive: boolean;
    reward: QuestReward | null;
  } | null>(null);
  const [savingMoveToWeb, setSavingMoveToWeb] = useState(false);
  const [moveToWebRewardPickerOpen, setMoveToWebRewardPickerOpen] =
    useState(false);

  // Login streak (app-entry) config
  const [loginStreakConfig, setLoginStreakConfig] =
    useState<AdminLoginStreakConfig | null>(null);
  const [savingLoginStreak, setSavingLoginStreak] = useState(false);

  // Lily Pad (shield) economy — one pool shared by every protected streak
  const [shieldConfig, setShieldConfig] = useState<AdminShieldConfig | null>(
    null,
  );
  const [savingShields, setSavingShields] = useState(false);
  const [loginRewardTarget, setLoginRewardTarget] = useState<{
    list: 'goalTiers';
    days: number;
  } | null>(null);

  // Generated-mode recipe editors (focus ladder + daily roll)
  const [adminRecipes, setAdminRecipes] = useState<AdminRecipe[]>([]);
  const [openRecipeId, setOpenRecipeId] = useState<string | null>(null);
  const [savingRecipeId, setSavingRecipeId] = useState<string | null>(null);
  const [resettingRecipeId, setResettingRecipeId] = useState<string | null>(
    null,
  );
  const [confirmResetRecipeId, setConfirmResetRecipeId] = useState<
    string | null
  >(null);
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
      const [templatesRes, metaRes, categoriesRes, seasonsRes, recipesRes, streakRes, loginStreakRes, moveToWebRes, seasonAutoRes, shieldsRes] = await Promise.all([
        fetch('/api/admin/quests', { credentials: 'include' }),
        fetch('/api/admin/quests/meta', { credentials: 'include' }),
        fetch('/api/admin/quests/categories', { credentials: 'include' }),
        fetch('/api/admin/quests/seasons', { credentials: 'include' }),
        fetch('/api/admin/quest-recipes', { credentials: 'include' }),
        fetch('/api/admin/quests/streak', { credentials: 'include' }),
        fetch('/api/admin/streak/login', { credentials: 'include' }),
        fetch('/api/admin/quests/move-to-web', { credentials: 'include' }),
        fetch('/api/admin/quests/seasons/auto', { credentials: 'include' }),
        fetch('/api/admin/shields', { credentials: 'include' }),
      ]);
      const templatesData = await templatesRes.json();
      const metaData = await metaRes.json();
      const categoriesData = await categoriesRes.json();
      const seasonsData = await seasonsRes.json();
      const recipesData = await recipesRes.json();
      const streakData = await streakRes.json();
      if (!templatesRes.ok || !metaRes.ok || !seasonsRes.ok) {
        throw new Error(
          templatesData.error ||
            metaData.error ||
            seasonsData.error ||
            'Could not load quest manager',
        );
      }
      setTemplates(templatesData.templates ?? []);
      setSeasons(seasonsData.seasons ?? []);
      setRewardItems(metaData.rewardsCatalog ?? []);
      setAdminCategories(categoriesData.categories ?? []);
      setAdminRecipes((recipesData.recipes ?? []) as AdminRecipe[]);
      if (streakRes.ok && streakData.sweep) setSweepConfig(streakData.sweep);
      const loginStreakData = await loginStreakRes.json();
      if (loginStreakRes.ok && loginStreakData.loginStreak) {
        setLoginStreakConfig(loginStreakData.loginStreak);
      }
      const moveToWebData = await moveToWebRes.json();
      if (moveToWebRes.ok && moveToWebData.moveToWeb) {
        setMoveToWebConfig(moveToWebData.moveToWeb);
      }
      const seasonAutoData = await seasonAutoRes.json();
      if (seasonAutoRes.ok && seasonAutoData.seasonAuto) {
        setSeasonAutoConfig(seasonAutoData.seasonAuto);
      }
      const shieldsData = await shieldsRes.json();
      if (shieldsRes.ok && shieldsData.shields) {
        setShieldConfig(shieldsData.shields);
      }
    } catch (error) {
      setResult({
        type: 'error',
        message: error instanceof Error ? error.message : 'Could not load quest manager',
      });
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setForm(emptyForm());
    setResult(null);
    setConfirmAction(null);
  };

  const startEditing = (template: AdminQuestTemplate) => {
    setForm({
      id: template.id,
      name: template.name,
      description: template.description,
      coverImageUrl: template.coverImageUrl,
      placement: template.placement,
      logic: template.logic.map((block) => ({ ...block })),
      visibilityConditions: (template.visibilityConditions ?? []).map((condition) => ({
        ...condition,
      })),
      isActive: template.isActive,
    });
    setResult(null);
    setConfirmAction(null);
  };

  const confirmBeforeAction = (action: ConfirmAction) => {
    if (confirmAction !== action) {
      setConfirmAction(action);
      return false;
    }
    setConfirmAction(null);
    return true;
  };

  const updateLogic = (id: string, patch: Partial<QuestLogicBlock>) => {
    setForm((prev) => ({
      ...prev,
      logic: prev.logic.map((block) =>
        block.id === id ? { ...block, ...patch } : block,
      ),
    }));
  };

  const updateVisibilityCondition = (id: string, patch: Partial<QuestVisibilityCondition>) => {
    setForm((prev) => ({
      ...prev,
      visibilityConditions: prev.visibilityConditions.map((condition) =>
        condition.id === id ? { ...condition, ...patch } : condition,
      ),
    }));
  };

  const saveQuest = async () => {
    if (!confirmBeforeAction('save-quest')) return;
    setSaving(true);
    setResult(null);
    try {
      const res = await fetch('/api/admin/quests', {
        method: form.id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id: form.id, ...form }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not save quest');
      await loadData();
      if (data.template) startEditing(data.template);
      setResult({ type: 'success', message: form.id ? 'Quest updated' : 'Quest created' });
    } catch (error) {
      setResult({
        type: 'error',
        message: error instanceof Error ? error.message : 'Could not save quest',
      });
    } finally {
      setSaving(false);
    }
  };

  const deleteQuest = async () => {
    if (!form.id) return;
    if (!confirmBeforeAction('delete-quest')) return;
    setSaving(true);
    setResult(null);
    try {
      const res = await fetch('/api/admin/quests', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id: form.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not delete quest');
      await loadData();
      resetForm();
      if (view === 'form') setView('onboarding');
      setResult({ type: 'success', message: 'Quest deleted' });
    } catch (error) {
      setResult({
        type: 'error',
        message: error instanceof Error ? error.message : 'Could not delete quest',
      });
    } finally {
      setSaving(false);
    }
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
          }
        : {
            name: '',
            description: '',
            onboardingSentence: '',
            coverImageUrl: undefined,
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

  const previewLogic = useMemo(() => form.logic.map(buildPreviewLogicBlock), [form.logic]);



  const formTimeLabel = 'One-time';
  const questSaveButtonLabel = saving
    ? 'Saving...'
    : confirmAction === 'save-quest'
      ? form.id
        ? 'Tap Again to Save'
        : 'Tap Again to Create'
      : form.id
        ? 'Save Changes'
        : 'Create Quest';
  const questDeleteButtonLabel =
    confirmAction === 'delete-quest' ? 'Tap Again to Delete' : 'Delete';
  const seasonSaveButtonLabel = saving
    ? 'Saving...'
    : confirmAction === 'save-season'
      ? seasonForm.id
        ? 'Tap Again to Save'
        : 'Tap Again to Create'
      : seasonForm.id
        ? 'Save Season'
        : 'Create Season';
  const dailyRecipeSlotCount = adminRecipes.reduce(
    (sum, recipe) => sum + recipe.slots.length,
    0,
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
  const onboardingTemplates = templates
    .filter((t) => t.placement === 'onboarding')
    .sort(
      (a, b) =>
        new Date(a.createdAt ?? 0).getTime() -
        new Date(b.createdAt ?? 0).getTime(),
    );
  const navigateToQuestForm = (template?: AdminQuestTemplate) => {
    if (template) {
      startEditing(template);
    } else {
      const newForm = emptyForm();
      newForm.placement = 'onboarding';
      setForm(newForm);
      setResult(null);
    }
    setView('form');
  };

  const setSeasonDateField = (field: 'startsAt' | 'endsAt', value: string) => {
    setSeasonForm((prev) => {
      const startsAt = field === 'startsAt' ? value : prev.startsAt;
      const endsAt = field === 'endsAt' ? value : prev.endsAt;
      const dayCount = getSeasonDayCountFromLocalValues(startsAt, endsAt);
      return {
        ...prev,
        [field]: value,
        dayCount,
        dayRewards: buildSeasonDayRewards(prev.dayRewards, dayCount),
      };
    });
  };

  const startEditingSeason = (season?: AdminQuestSeason) => {
    if (!season) {
      setSeasonForm(emptySeasonForm());
      setView('season');
      return;
    }
    const startsAt = isoToDateTimeLocalValue(season.startsAt);
    const endsAt = isoToDateTimeLocalValue(season.endsAt);
    const dayCount = getSeasonDayCountFromLocalValues(startsAt, endsAt);
    const dayRewards = buildSeasonDayRewards(
      season.dayRewards.map((entry) => ({
        day: entry.day,
        freeRewards: normalizeRewardList(entry.freeRewards ?? entry.rewards ?? []),
        premiumRewards: normalizeRewardList(entry.premiumRewards ?? []),
      })),
      dayCount,
    );

    setSeasonForm({
      id: season.id,
      name: season.name,
      images: { ...emptySeasonImages(), ...(season.images ?? {}) },
      startsAt,
      endsAt,
      dailyTargetFlies: season.dailyTargetFlies,
      dayCount,
      dayRewards,
      isActive: season.isActive,
    });
    setResult(null);
    setConfirmAction(null);
    setView('season');
  };

  const uploadSeasonImage = async (size: SeasonSizeKey, file: File) => {
    if (!seasonForm.id) {
      setResult({
        type: 'error',
        message: 'Save the season first, then upload images.',
      });
      return;
    }
    setSaving(true);
    setResult(null);
    try {
      const form = new FormData();
      form.set('id', seasonForm.id);
      form.set('size', size);
      form.set('file', file);
      const res = await fetch('/api/admin/quests/seasons/upload', {
        method: 'POST',
        credentials: 'include',
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      setSeasonForm((prev) => ({
        ...prev,
        images: { ...prev.images, [size]: data.url },
      }));
      await loadData();
      setResult({ type: 'success', message: `${size} image uploaded` });
    } catch (error) {
      setResult({
        type: 'error',
        message: error instanceof Error ? error.message : 'Upload failed',
      });
    } finally {
      setSaving(false);
    }
  };

  const removeSeasonImage = async (size: SeasonSizeKey) => {
    if (!seasonForm.id) return;
    setSaving(true);
    setResult(null);
    try {
      const res = await fetch('/api/admin/quests/seasons/upload', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id: seasonForm.id, size }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Remove failed');
      setSeasonForm((prev) => ({
        ...prev,
        images: { ...prev.images, [size]: '' },
      }));
      await loadData();
      setResult({ type: 'success', message: `${size} image removed` });
    } catch (error) {
      setResult({
        type: 'error',
        message: error instanceof Error ? error.message : 'Remove failed',
      });
    } finally {
      setSaving(false);
    }
  };

  const saveSeason = async () => {
    if (!confirmBeforeAction('save-season')) return;
    setSaving(true);
    setResult(null);
    try {
      const res = await fetch('/api/admin/quests/seasons', {
        method: seasonForm.id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          ...seasonForm,
          startsAt: isoFromDateTimeLocalValue(seasonForm.startsAt),
          endsAt: isoFromDateTimeLocalValue(seasonForm.endsAt),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not save season');
      await loadData();
      if (data.season) startEditingSeason(data.season);
      setResult({
        type: 'success',
        message: seasonForm.id ? 'Season updated' : 'Season created',
      });
    } catch (error) {
      setResult({
        type: 'error',
        message: error instanceof Error ? error.message : 'Could not save season',
      });
    } finally {
      setSaving(false);
    }
  };

  const deleteSeason = async () => {
    if (!seasonForm.id) return;
    setSaving(true);
    setResult(null);
    try {
      const res = await fetch('/api/admin/quests/seasons', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id: seasonForm.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not delete season');
      await loadData();
      setSeasonForm(emptySeasonForm());
      setView('home');
      setResult({ type: 'success', message: 'Season deleted' });
    } catch (error) {
      setResult({
        type: 'error',
        message: error instanceof Error ? error.message : 'Could not delete season',
      });
    } finally {
      setSaving(false);
    }
  };

  // ── Home view ────────────────────────────────────────────────────────────
  const renderHome = () => (
    <div className="grid gap-4 lg:grid-cols-3">
      <button
        onClick={() => setView('daily')}
        className="group rounded-2xl border border-border/40 bg-card/60 p-6 text-left transition hover:border-blue-500/25 hover:bg-blue-500/[0.04]"
      >
        <div className="flex items-center justify-between">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
            <ScrollText className="h-6 w-6" />
          </div>
          <ChevronRight className="h-5 w-5 text-muted-foreground/30 transition group-hover:translate-x-0.5 group-hover:text-muted-foreground" />
        </div>
        <p className="mt-5 text-lg font-black text-foreground">Daily Quests</p>
        <p className="mt-1 text-sm text-muted-foreground">Rolled for every user each day from the recipe.</p>
        <p className="mt-4 text-3xl font-black text-foreground">{dailyRecipeSlotCount}</p>
        <p className="text-xs text-muted-foreground">recipe slot{dailyRecipeSlotCount !== 1 ? 's' : ''}</p>
      </button>

      <button
        onClick={() => setView('onboarding')}
        className="group rounded-2xl border border-border/40 bg-card/60 p-6 text-left transition hover:border-violet-500/25 hover:bg-violet-500/[0.04]"
      >
        <div className="flex items-center justify-between">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-500/10 text-violet-600 dark:text-violet-400">
            <Footprints className="h-6 w-6" />
          </div>
          <ChevronRight className="h-5 w-5 text-muted-foreground/30 transition group-hover:translate-x-0.5 group-hover:text-muted-foreground" />
        </div>
        <p className="mt-5 text-lg font-black text-foreground">Onboarding</p>
        <p className="mt-1 text-sm text-muted-foreground">One-time quests new users play through in order.</p>
        <p className="mt-4 text-3xl font-black text-foreground">{onboardingTemplates.length}</p>
        <p className="text-xs text-muted-foreground">quest{onboardingTemplates.length !== 1 ? 's' : ''}</p>
      </button>

      <button
        onClick={() => setView('streaks')}
        className="group rounded-2xl border border-border/40 bg-card/60 p-6 text-left transition hover:border-orange-500/25 hover:bg-orange-500/[0.04]"
      >
        <div className="flex items-center justify-between">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-500/10 text-orange-600 dark:text-orange-400">
            <Flame className="h-6 w-6" />
          </div>
          <ChevronRight className="h-5 w-5 text-muted-foreground/30 transition group-hover:translate-x-0.5 group-hover:text-muted-foreground" />
        </div>
        <p className="mt-5 text-lg font-black text-foreground">Streak Manager</p>
        <p className="mt-1 text-sm text-muted-foreground">Login streak commitments and goal prizes.</p>
        <p className="mt-4 text-3xl font-black text-foreground">
          {loginStreakConfig ? (loginStreakConfig.isActive ? 'On' : 'Off') : '–'}
        </p>
        <p className="text-xs text-muted-foreground">login streak</p>
      </button>

      <button
        onClick={() => setView('shields')}
        className="group rounded-2xl border border-border/40 bg-card/60 p-6 text-left transition hover:border-emerald-500/25 hover:bg-emerald-500/[0.04]"
      >
        <div className="flex items-center justify-between">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10">
            <Icon name="lilyPad" className="h-6 w-6" />
          </div>
          <ChevronRight className="h-5 w-5 text-muted-foreground/30 transition group-hover:translate-x-0.5 group-hover:text-muted-foreground" />
        </div>
        <p className="mt-5 text-lg font-black text-foreground">Shields</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Lily Pad price, caps, cooldowns and how often the offer may appear.
        </p>
        <p className="mt-4 text-3xl font-black text-foreground">
          {shieldConfig ? shieldConfig.priceFlies.toLocaleString() : '–'}
        </p>
        <p className="text-xs text-muted-foreground">flies each</p>
      </button>

      <button
        onClick={() => setView('pact')}
        className="group rounded-2xl border border-border/40 bg-card/60 p-6 text-left transition hover:border-teal-500/25 hover:bg-teal-500/[0.04]"
      >
        <div className="flex items-center justify-between">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-500/10 text-teal-600 dark:text-teal-400">
            <CalendarDays className="h-6 w-6" />
          </div>
          <ChevronRight className="h-5 w-5 text-muted-foreground/30 transition group-hover:translate-x-0.5 group-hover:text-muted-foreground" />
        </div>
        <p className="mt-5 text-lg font-black text-foreground">Weekly Pact</p>
        <p className="mt-1 text-sm text-muted-foreground">One area a week, written into the user&apos;s real task list.</p>
        <p className="mt-4 text-3xl font-black text-foreground">{adminCategories.length}</p>
        <p className="text-xs text-muted-foreground">
          focus area{adminCategories.length !== 1 ? 's' : ''} · ideas, rewards, shields
        </p>
      </button>

      <button
        onClick={() => setView('moveToWeb')}
        className="group rounded-2xl border border-border/40 bg-card/60 p-6 text-left transition hover:border-sky-500/25 hover:bg-sky-500/[0.04]"
      >
        <div className="flex items-center justify-between">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-500/10 text-sky-600 dark:text-sky-400">
            <Monitor className="h-6 w-6" />
          </div>
          <ChevronRight className="h-5 w-5 text-muted-foreground/30 transition group-hover:translate-x-0.5 group-hover:text-muted-foreground" />
        </div>
        <p className="mt-5 text-lg font-black text-foreground">Move to Web</p>
        <p className="mt-1 text-sm text-muted-foreground">Nudge phone-only users to log in on the web.</p>
        <p className="mt-4 text-3xl font-black text-foreground">
          {moveToWebConfig ? (moveToWebConfig.isActive ? 'On' : 'Off') : '–'}
        </p>
        <p className="text-xs text-muted-foreground">move to web</p>
      </button>

      <button
        onClick={() => startEditingSeason(seasons[0])}
        className="group rounded-2xl border border-border/40 bg-card/60 p-6 text-left transition hover:border-amber-500/25 hover:bg-amber-500/[0.04]"
      >
        <div className="flex items-center justify-between">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
            <Gift className="h-6 w-6" />
          </div>
          <ChevronRight className="h-5 w-5 text-muted-foreground/30 transition group-hover:translate-x-0.5 group-hover:text-muted-foreground" />
        </div>
        <p className="mt-5 text-lg font-black text-foreground">Season</p>
        <p className="mt-1 text-sm text-muted-foreground">Configure the banner, timer, daily goal, and day prizes.</p>
        <p className="mt-4 text-3xl font-black text-foreground">{seasons.length}</p>
        <p className="text-xs text-muted-foreground">season{seasons.length !== 1 ? 's' : ''}</p>
      </button>
    </div>
  );

  // ── Quest list (shared by Daily and Category views) ───────────────────────
  const renderQuestList = (questTemplates: AdminQuestTemplate[]) => (
    <div className="space-y-2">
      {loading && <div className="rounded-2xl bg-muted/30 p-4 text-sm text-muted-foreground">Loading...</div>}
      {!loading && questTemplates.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border/40 py-10 text-center text-sm text-muted-foreground">
          No quests yet. Add one to get started.
        </div>
      )}
      {questTemplates.map((template) => (
        <button
          key={template.id}
          onClick={() => navigateToQuestForm(template)}
          className="group flex w-full items-center gap-5 rounded-2xl border border-border/40 bg-card/60 p-4 text-left transition hover:border-primary/20 hover:bg-primary/[0.03]"
        >
          {/* Cover thumbnail */}
          <div className="h-20 w-28 shrink-0 overflow-hidden rounded-xl bg-muted/40">
            {template.coverImageUrl ? (
              <img src={template.coverImageUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full bg-[linear-gradient(135deg,#0ea5e9_0%,#2563eb_55%,#0f172a_100%)]" />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2.5">
              <p className="truncate text-sm font-bold text-foreground">{template.name}</p>
              <span className={cn(
                'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.14em]',
                template.isActive
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                  : 'bg-muted text-muted-foreground',
              )}>
                {template.isActive ? 'Active' : 'Paused'}
              </span>
            </div>
            {template.description && (
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{template.description}</p>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
              <span>{template.logic.length} block{template.logic.length !== 1 ? 's' : ''}</span>
              {template.visibilityConditions.length > 0 && (
                <>
                  <span className="text-border">·</span>
                  <span>{template.visibilityConditions.length} condition{template.visibilityConditions.length !== 1 ? 's' : ''}</span>
                </>
              )}
            </div>
          </div>

          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/40 transition group-hover:text-muted-foreground" />
        </button>
      ))}
    </div>
  );

  // ── Daily view ────────────────────────────────────────────────────────────
  const renderDaily = () => (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Every user gets one daily quest rolled from this recipe — one objective
        per slot, easiest first.
      </p>
      {adminRecipes.map(renderRecipeCard)}
      {recipeRewardDialog}
      {renderSweepCard()}
    </div>
  );

  // ── Onboarding quests view ────────────────────────────────────────────────
  const renderOnboarding = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          New users see one quest at a time, oldest first. The next quest
          appears once every reward in the previous one is claimed.
        </p>
        <Button size="sm" className="rounded-xl" onClick={() => navigateToQuestForm()}>
          <Plus className="mr-1 h-4 w-4" />
          Add Quest
        </Button>
      </div>
      {renderQuestList(onboardingTemplates)}
    </div>
  );

  // ── Streak manager view ───────────────────────────────────────────────────
  const renderStreaks = () => (
    <div className="space-y-4">
      {loading && !loginStreakConfig && (
        <div className="rounded-2xl bg-muted/30 p-4 text-sm text-muted-foreground">Loading...</div>
      )}
      {renderLoginStreakCard()}
    </div>
  );

  const saveShieldConfig = async () => {
    if (!shieldConfig) return;
    setSavingShields(true);
    setResult(null);
    try {
      const res = await fetch('/api/admin/shields', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(shieldConfig),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not save shields');
      setShieldConfig(data.shields);
      setResult({ type: 'success', message: 'Shields saved' });
    } catch (error) {
      setResult({
        type: 'error',
        message:
          error instanceof Error ? error.message : 'Could not save shields',
      });
    } finally {
      setSavingShields(false);
    }
  };

  const shieldField = (
    label: string,
    field: keyof Omit<AdminShieldConfig, 'isActive' | 'limits'>,
    hint: string,
    min: number,
    max: number,
  ) => (
    <label key={field} className="block">
      <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <input
        type="number"
        min={min}
        max={max}
        value={shieldConfig?.[field] ?? 0}
        onChange={(e) =>
          setShieldConfig((prev) =>
            prev
              ? {
                  ...prev,
                  [field]: Math.min(
                    max,
                    Math.max(min, Math.floor(Number(e.target.value) || 0)),
                  ),
                }
              : prev,
          )
        }
        className="mt-1 block h-10 w-28 rounded-xl border border-border/50 bg-background px-3 text-sm font-bold text-foreground"
      />
      <span className="mt-1 block max-w-[15rem] text-[11px] leading-snug text-muted-foreground">
        {hint}
      </span>
    </label>
  );

  const renderShields = () => {
    if (!shieldConfig) {
      return (
        <div className="rounded-2xl bg-muted/30 p-4 text-sm text-muted-foreground">
          Loading...
        </div>
      );
    }
    const capMin = shieldConfig.limits?.capMin ?? 1;
    const capMax = shieldConfig.limits?.capMax ?? 5;
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-border/40 bg-card/60 px-4 py-3.5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-foreground">
                Lily Pad (one shield, every streak)
              </p>
              <p className="mt-0.5 max-w-2xl text-xs text-muted-foreground">
                Auto-consumes on a miss — never equipped, never armed. Protects
                the login streak and the weekly pact. It is not sold in the
                shop: the only place to buy one is the offer that appears when a
                user holds none and has something on the line.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={shieldConfig.isActive}
              onClick={() =>
                setShieldConfig((prev) =>
                  prev ? { ...prev, isActive: !prev.isActive } : prev,
                )
              }
              className={cn(
                'relative h-6 w-11 shrink-0 rounded-full transition-colors',
                shieldConfig.isActive ? 'bg-emerald-500' : 'bg-muted',
              )}
            >
              <span
                className={cn(
                  'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
                  shieldConfig.isActive
                    ? 'translate-x-[22px]'
                    : 'translate-x-0.5',
                )}
              />
            </button>
          </div>

          <p className="mt-5 text-[11px] font-black uppercase tracking-wide text-muted-foreground">
            Price
          </p>
          <div className="mt-2 flex flex-wrap items-start gap-5">
            {shieldField(
              'Price (flies)',
              'priceFlies',
              'What one costs in the offer.',
              1,
              100000,
            )}
            {shieldField(
              'Two-pack (flies)',
              'twoPackPriceFlies',
              'Only shown when there is room for two.',
              1,
              200000,
            )}
          </div>

          <p className="mt-5 text-[11px] font-black uppercase tracking-wide text-muted-foreground">
            Holding
          </p>
          <div className="mt-2 flex flex-wrap items-start gap-5">
            {shieldField(
              'Cap — free',
              'capFree',
              'Most a free user can hold at once.',
              capMin,
              capMax,
            )}
            {shieldField(
              'Cap — Plus',
              'capPlus',
              'Most a Plus user can hold at once.',
              capMin,
              capMax,
            )}
            {shieldField(
              'Plus monthly grant',
              'plusMonthlyGrant',
              'Free ones handed to Plus each calendar month. 0 turns it off.',
              0,
              capMax,
            )}
            {shieldField(
              'Earn every N pact weeks',
              'earnEveryPactWeeks',
              'Kept weeks that hand one back. 0 (the default) turns it off — the pact milestones issue Lily Pads now, and against this cap a second faucet oversupplies.',
              0,
              52,
            )}
          </div>

          <p className="mt-5 text-[11px] font-black uppercase tracking-wide text-muted-foreground">
            Rescue limit
          </p>
          <div className="mt-2 flex flex-wrap items-start gap-5">
            {shieldField(
              'Rescue cooldown (days)',
              'rescueCooldownDays',
              'Max one rescue per system per this many days. A streak that cannot break stops motivating.',
              0,
              365,
            )}
          </div>

          <p className="mt-5 text-[11px] font-black uppercase tracking-wide text-muted-foreground">
            Offer popup
          </p>
          <div className="mt-2 flex flex-wrap items-start gap-5">
            {shieldField(
              'Offer cooldown (days)',
              'offerCooldownDays',
              'Minimum gap between auto-shows. Doubles after each dismissal, up to 4×.',
              1,
              365,
            )}
            {shieldField(
              'Offer min streak',
              'offerMinStreak',
              'Nothing at stake below this — the popup stays away.',
              1,
              365,
            )}
          </div>

          <div className="mt-5 flex">
            <Button
              size="sm"
              className="ml-auto rounded-xl font-black"
              onClick={() => void saveShieldConfig()}
              disabled={savingShields}
            >
              {savingShields ? 'Saving…' : 'Save shields'}
            </Button>
          </div>
        </div>
      </div>
    );
  };

  const renderMoveToWeb = () => (
    <div className="space-y-4">
      {loading && !moveToWebConfig && (
        <div className="rounded-2xl bg-muted/30 p-4 text-sm text-muted-foreground">Loading...</div>
      )}
      {renderMoveToWebCard()}
    </div>
  );

  // ── Focus categories view ─────────────────────────────────────────────────
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

  const updateRecipePoolEntry = (
    recipeId: string,
    slotId: string,
    entryId: string,
    patch: Partial<AdminRecipePoolEntry>,
  ) => {
    updateRecipe(recipeId, (r) => ({
      ...r,
      slots: r.slots.map((slot) =>
        slot.id === slotId
          ? {
              ...slot,
              pool: slot.pool.map((entry) =>
                entry.id === entryId ? { ...entry, ...patch } : entry,
              ),
            }
          : slot,
      ),
    }));
  };

  const addRecipePoolEntry = (recipeId: string, slotId: string) => {
    const entry: AdminRecipePoolEntry = {
      id: crypto.randomUUID(),
      type: 'count',
      action: 'complete',
      minTarget: 3,
      maxTarget: 5,
      weight: 1,
    };
    updateRecipe(recipeId, (r) => ({
      ...r,
      slots: r.slots.map((slot) =>
        slot.id === slotId ? { ...slot, pool: [...slot.pool, entry] } : slot,
      ),
    }));
  };

  const removeRecipePoolEntry = (
    recipeId: string,
    slotId: string,
    entryId: string,
  ) => {
    updateRecipe(recipeId, (r) => ({
      ...r,
      slots: r.slots.map((slot) =>
        slot.id === slotId
          ? { ...slot, pool: slot.pool.filter((e) => e.id !== entryId) }
          : slot,
      ),
    }));
  };

  const updateRecipeBonusChance = (
    recipeId: string,
    slotId: string,
    index: number,
    percent: number,
  ) => {
    const chance = Math.min(100, Math.max(1, Math.round(percent))) / 100;
    updateRecipe(recipeId, (r) => ({
      ...r,
      slots: r.slots.map((slot) =>
        slot.id === slotId
          ? {
              ...slot,
              bonusRewards: (slot.bonusRewards ?? []).map((bonus, bi) =>
                bi === index ? { ...bonus, chance } : bonus,
              ),
            }
          : slot,
      ),
    }));
  };

  const addRecipeSlot = (recipeId: string) => {
    updateRecipe(recipeId, (r) => ({
      ...r,
      slots: [
        ...r.slots,
        {
          id: crypto.randomUUID(),
          pool: [
            {
              id: crypto.randomUUID(),
              type: 'count',
              action: 'complete',
              minTarget: 5,
              maxTarget: 8,
              weight: 1,
            },
          ],
          rewards: [
            {
              type: 'FLIES',
              amountMode: 'random',
              minAmount: 10,
              maxAmount: 15,
            },
          ],
        },
      ],
    }));
  };

  const removeRecipeSlot = (recipeId: string, slotId: string) => {
    updateRecipe(recipeId, (r) => ({
      ...r,
      slots: r.slots.filter((slot) => slot.id !== slotId),
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
      setConfirmResetRecipeId(null);
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
      }
      setResult({ type: 'success', message: 'Recipe saved' });
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

  const handleRecipeCoverFile = async (
    recipeId: string,
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const dataUrl = await readFileAsDataUrl(file);
    updateRecipe(recipeId, (prev) => ({ ...prev, coverImageUrl: dataUrl }));
  };

  const renderRecipeCard = (r: AdminRecipe) => {
    const open = openRecipeId === r.recipeId;
    return (
      <div key={r.recipeId} className="rounded-2xl border border-border/40 bg-card/60">
        <button
          type="button"
          onClick={() => setOpenRecipeId(open ? null : r.recipeId)}
          className="flex w-full items-center gap-3 px-4 py-3.5 text-left"
        >
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 text-sm font-bold text-foreground">
              Generated daily quest
              <span className={cn(
                'rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-wide',
                r.isActive
                  ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                  : 'border-border/50 bg-muted/40 text-muted-foreground',
              )}>
                {r.isActive ? 'On' : 'Off'}
              </span>
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {`One quest · ${r.slots.length} objectives, easiest first`}
            </p>
          </div>
          <span className="text-xs font-bold text-muted-foreground">{open ? 'Hide' : 'Edit'}</span>
        </button>

        {open && (
          <div className="space-y-3 border-t border-border/30 px-4 py-4">
            <button
                  type="button"
                  onClick={() => updateRecipe(r.recipeId, (prev) => ({ ...prev, isActive: !prev.isActive }))}
                  className={cn(
                    'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold transition',
                    r.isActive
                      ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                      : 'border-border/50 bg-background text-muted-foreground hover:border-primary/30',
                  )}
                >
                  {r.isActive ? 'Generated daily quest on' : 'Generated daily quest off'}
                </button>
                <label className="grid gap-1.5">
                  <span className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">Quest title</span>
                  <input
                    value={r.name}
                    onChange={(e) => updateRecipe(r.recipeId, (prev) => ({ ...prev, name: e.target.value }))}
                    className="h-10 w-full max-w-xs rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary/30"
                  />
                </label>
                <div className="grid gap-1.5">
                  <span className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">Cover image</span>
                  <div className="flex items-center gap-3">
                    <div className="h-14 w-24 overflow-hidden rounded-xl border border-border/50 bg-muted/40">
                      {r.coverImageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={r.coverImageUrl} alt="" className="h-full w-full object-cover" />
                      ) : null}
                    </div>
                    <label className="cursor-pointer rounded-full border border-border/50 bg-background px-3 py-1.5 text-[11px] font-bold text-muted-foreground transition hover:border-primary/30 hover:text-foreground">
                      {r.coverImageUrl ? 'Change' : 'Upload'}
                      <input type="file" accept="image/*" className="hidden" onChange={(e) => void handleRecipeCoverFile(r.recipeId, e)} />
                    </label>
                    {r.coverImageUrl && (
                      <button
                        type="button"
                        onClick={() => updateRecipe(r.recipeId, (prev) => ({ ...prev, coverImageUrl: undefined }))}
                        className="text-[11px] font-bold text-red-500/80 hover:text-red-500"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>

            {r.slots.map((slot, slotIndex) => (
              <div key={slot.id} className="rounded-2xl border border-border/50 bg-muted/30 px-4 py-3.5">
                <div className="mb-2.5 flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                    Objective {slotIndex + 1}{slotIndex === 0 ? ' · easiest' : slotIndex === r.slots.length - 1 ? ' · hardest' : ''}
                  </span>
                  {r.slots.length > 1 && (
                    <button onClick={() => removeRecipeSlot(r.recipeId, slot.id)} className="rounded-lg p-1 text-muted-foreground/60 transition hover:bg-red-500/10 hover:text-red-500">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>

                <div className="space-y-2">
                  {slot.pool.map((entry) => {
                    const isStreakEntry =
                      entry.type === 'metric_count' &&
                      !!entry.metricKey?.startsWith('task_streak');
                    return (
                    <div key={entry.id} className="flex flex-wrap items-center gap-x-1.5 gap-y-2 leading-[30px]">
                      <InlinePillSelect
                        value={entry.type}
                        onChange={(v) =>
                          updateRecipePoolEntry(r.recipeId, slot.id, entry.id, {
                            type: v as AdminRecipePoolEntry['type'],
                            action: v === 'count' ? entry.action ?? 'complete' : undefined,
                            metricKey: v === 'metric_count' ? entry.metricKey ?? 'trade_completed' : undefined,
                            sessionMinutes: v === 'deep_session' ? entry.sessionMinutes ?? 25 : undefined,
                            requiresFollowThrough: v === 'count' ? entry.requiresFollowThrough : undefined,
                            beforeHour: v === 'count' ? entry.beforeHour : undefined,
                          })
                        }
                      >
                        <option value="count">Tasks</option>
                        <option value="focus_minutes">Focus minutes</option>
                        <option value="distinct_days">Days shown up</option>
                        <option value="deep_session">Unbroken sessions</option>
                        <option value="metric_count">App action</option>
                      </InlinePillSelect>
                      {entry.type === 'count' && (
                        <InlinePillSelect
                          value={entry.action ?? 'complete'}
                          onChange={(v) =>
                            updateRecipePoolEntry(r.recipeId, slot.id, entry.id, {
                              action: v as 'complete' | 'add',
                              requiresFollowThrough: v === 'add' ? entry.requiresFollowThrough : undefined,
                              beforeHour: v === 'complete' ? entry.beforeHour : undefined,
                            })
                          }
                        >
                          <option value="complete">complete</option>
                          <option value="add">add</option>
                        </InlinePillSelect>
                      )}
                      {entry.type === 'count' && entry.action === 'add' && (
                        <button
                          type="button"
                          onClick={() =>
                            updateRecipePoolEntry(r.recipeId, slot.id, entry.id, {
                              requiresFollowThrough: !entry.requiresFollowThrough,
                            })
                          }
                          className={cn(
                            'rounded-full border px-2 py-0.5 text-[11px] font-bold transition',
                            entry.requiresFollowThrough
                              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                              : 'border-border/50 bg-background text-muted-foreground hover:text-foreground',
                          )}
                        >
                          {entry.requiresFollowThrough ? '+ finish them' : 'add only'}
                        </button>
                      )}
                      {entry.type === 'count' && (entry.action ?? 'complete') === 'complete' && (
                        <>
                          <span className="text-sm font-medium text-muted-foreground">· before hour</span>
                          <InlinePillNumber
                            value={entry.beforeHour ?? 0}
                            onChange={(v) =>
                              updateRecipePoolEntry(r.recipeId, slot.id, entry.id, {
                                beforeHour: v >= 1 && v <= 23 ? v : undefined,
                              })
                            }
                          />
                          <span className="text-sm font-medium text-muted-foreground">
                            {entry.beforeHour ? '' : '(0 = any time)'}
                          </span>
                        </>
                      )}
                      {entry.type === 'deep_session' && (
                        <>
                          <span className="text-sm font-medium text-muted-foreground">· of</span>
                          <InlinePillNumber
                            value={entry.sessionMinutes ?? 25}
                            onChange={(v) => updateRecipePoolEntry(r.recipeId, slot.id, entry.id, { sessionMinutes: v })}
                          />
                          <span className="text-sm font-medium text-muted-foreground">min each,</span>
                        </>
                      )}
                      {entry.type === 'metric_count' && (
                        <InlinePillSelect
                          value={entry.metricKey?.startsWith('task_streak') ? 'task_streak_3' : entry.metricKey ?? 'trade_completed'}
                          onChange={(v) =>
                            updateRecipePoolEntry(r.recipeId, slot.id, entry.id, {
                              metricKey: v,
                              ...(v === 'task_streak_3'
                                ? {
                                    streakDaysMin: entry.streakDaysMin ?? 3,
                                    streakDaysMax: entry.streakDaysMax ?? entry.streakDaysMin ?? 3,
                                  }
                                : { streakDaysMin: undefined, streakDaysMax: undefined }),
                            })
                          }
                        >
                          {Object.entries(QUEST_METRIC_COPY).map(([key, copy]) => (
                            <option key={key} value={key}>{copy.adminLabel}</option>
                          ))}
                        </InlinePillSelect>
                      )}
                      {isStreakEntry && (
                        <>
                          <span className="text-sm font-medium text-muted-foreground">· streak length</span>
                          <InlinePillNumber value={entry.streakDaysMin ?? 3} onChange={(v) => updateRecipePoolEntry(r.recipeId, slot.id, entry.id, { streakDaysMin: v })} />
                          <span className="text-sm font-medium text-muted-foreground">to</span>
                          <InlinePillNumber value={entry.streakDaysMax ?? entry.streakDaysMin ?? 3} onChange={(v) => updateRecipePoolEntry(r.recipeId, slot.id, entry.id, { streakDaysMax: v })} />
                          <span className="text-sm font-medium text-muted-foreground">days, on</span>
                        </>
                      )}
                      <InlinePillNumber value={entry.minTarget} onChange={(v) => updateRecipePoolEntry(r.recipeId, slot.id, entry.id, { minTarget: v })} />
                      <span className="text-sm font-medium text-muted-foreground">to</span>
                      <InlinePillNumber value={entry.maxTarget} onChange={(v) => updateRecipePoolEntry(r.recipeId, slot.id, entry.id, { maxTarget: v })} />
                      {isStreakEntry && (
                        <span className="text-sm font-medium text-muted-foreground">repeating tasks</span>
                      )}
                      <span className="text-sm font-medium text-muted-foreground">· weight</span>
                      <InlinePillNumber value={entry.weight} onChange={(v) => updateRecipePoolEntry(r.recipeId, slot.id, entry.id, { weight: v })} />
                      {slot.pool.length > 1 && (
                        <button onClick={() => removeRecipePoolEntry(r.recipeId, slot.id, entry.id)} className="rounded-lg p-1 text-muted-foreground/60 transition hover:bg-red-500/10 hover:text-red-500">
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                    );
                  })}
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-border/30 pt-2.5">
                  <button
                    type="button"
                    onClick={() => addRecipePoolEntry(r.recipeId, slot.id)}
                    className="inline-flex items-center gap-1 rounded-full border border-border/50 bg-background px-2.5 py-1 text-[11px] font-bold text-muted-foreground transition hover:border-primary/30 hover:text-foreground"
                  >
                    <Plus className="h-3 w-3" />
                    Pool option
                  </button>
                  <button
                    type="button"
                    onClick={() => setRecipeRewardTarget({ recipeId: r.recipeId, slotId: slot.id, kind: 'rewards' })}
                    className="inline-flex items-center gap-1 rounded-full border border-emerald-500/25 bg-emerald-500/8 px-2.5 py-1 text-[11px] font-bold text-emerald-600 transition hover:bg-emerald-500/15 dark:text-emerald-400"
                  >
                    <Gift className="h-3 w-3" />
                    Reward
                  </button>
                  {slot.rewards.length > 1 && (
                    <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                      rolls one of
                    </span>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {slot.rewards.map((reward, ri) => (
                      <RewardTile
                        key={`${reward.type}-${reward.itemId ?? reward.amount ?? ri}`}
                        reward={reward}
                        rewardCatalog={rewardCatalog}
                        isPremium={false}
                      />
                    ))}
                  </div>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-2">
                  <button
                    type="button"
                    onClick={() => setRecipeRewardTarget({ recipeId: r.recipeId, slotId: slot.id, kind: 'bonus' })}
                    className="inline-flex items-center gap-1 rounded-full border border-amber-500/25 bg-amber-500/8 px-2.5 py-1 text-[11px] font-bold text-amber-600 transition hover:bg-amber-500/15 dark:text-amber-400"
                  >
                    <Gift className="h-3 w-3" />
                    Bonus
                  </button>
                  {(slot.bonusRewards?.length ?? 0) > 0 ? (
                    (slot.bonusRewards ?? []).map((bonus, bi) => (
                      <div key={bi} className="flex items-center gap-1.5 leading-[30px]">
                        <RewardTile
                          reward={bonus.reward}
                          rewardCatalog={rewardCatalog}
                          isPremium={false}
                        />
                        <InlinePillNumber
                          value={Math.round(bonus.chance * 100)}
                          onChange={(v) =>
                            updateRecipeBonusChance(r.recipeId, slot.id, bi, v)
                          }
                        />
                        <span className="text-sm font-medium text-muted-foreground">% chance</span>
                      </div>
                    ))
                  ) : (
                    <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                      lands on top of the reward, at its own odds
                    </span>
                  )}
                </div>
              </div>
            ))}

            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => addRecipeSlot(r.recipeId)}
                className="inline-flex items-center gap-1 rounded-full border border-border/50 bg-background px-3 py-1.5 text-xs font-bold text-muted-foreground transition hover:border-primary/30 hover:text-foreground"
              >
                <Plus className="h-3.5 w-3.5" />
                Add objective
              </button>
              <div className="flex items-center gap-2">
                {confirmResetRecipeId === r.recipeId ? (
                  <>
                    <span className="text-xs font-bold text-red-500">
                      Discard these objectives?
                    </span>
                    <button
                      type="button"
                      onClick={() => setConfirmResetRecipeId(null)}
                      className="rounded-xl border border-border/50 bg-background px-3 py-1.5 text-xs font-bold text-muted-foreground transition hover:text-foreground"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => void resetRecipeToDefault(r.recipeId)}
                      disabled={resettingRecipeId === r.recipeId}
                      className="rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-xs font-black text-red-500 transition hover:bg-red-500/20 disabled:opacity-60"
                    >
                      {resettingRecipeId === r.recipeId
                        ? 'Resetting…'
                        : 'Reset to default'}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmResetRecipeId(r.recipeId)}
                    className="inline-flex items-center gap-1 rounded-xl border border-border/50 bg-background px-3 py-1.5 text-xs font-bold text-muted-foreground transition hover:border-red-500/30 hover:text-red-500"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Reset to default
                  </button>
                )}
                <Button size="sm" className="rounded-xl font-black" onClick={() => void saveRecipe(r.recipeId)} disabled={savingRecipeId === r.recipeId}>
                  {savingRecipeId === r.recipeId ? 'Saving…' : 'Save recipe'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

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
      <div className="rounded-2xl border border-border/40 bg-card/60 px-4 py-3.5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-foreground">
              Clean Sweep &amp; Reward Roll
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Finishing all three daily quests pays the Clean Sweep flies and
              earns one Reward Roll. Every Nth sweep day in a row rolls the
              golden table instead, and the mega bonus lands on top of that.
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
                'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
                sweepConfig.isActive ? 'translate-x-[22px]' : 'translate-x-0.5',
              )}
            />
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-end gap-4">
          <label className="block">
            <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
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
          <label className="block">
            <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              Golden roll every
            </span>
            <input
              type="number"
              min={sweepConfig.limits.goldenMin}
              max={sweepConfig.limits.goldenMax}
              value={sweepConfig.goldenEveryDays}
              onChange={(e) =>
                setSweepConfig((prev) =>
                  prev
                    ? {
                        ...prev,
                        goldenEveryDays: Math.min(
                          prev.limits.goldenMax,
                          Math.max(
                            prev.limits.goldenMin,
                            Math.floor(Number(e.target.value) || prev.limits.goldenMin),
                          ),
                        ),
                      }
                    : prev,
                )
              }
              className="mt-1 block h-10 w-24 rounded-xl border border-border/50 bg-background px-3 text-sm font-bold text-foreground"
            />
            <span className="mt-1 block text-[10px] text-muted-foreground">
              sweep days in a row
            </span>
          </label>
          <label className="block">
            <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              Mega bonus every
            </span>
            <input
              type="number"
              min={0}
              max={sweepConfig.limits.megaMax}
              value={sweepConfig.megaEveryDays}
              onChange={(e) =>
                setSweepConfig((prev) =>
                  prev
                    ? {
                        ...prev,
                        megaEveryDays: Math.min(
                          prev.limits.megaMax,
                          Math.max(0, Math.floor(Number(e.target.value) || 0)),
                        ),
                      }
                    : prev,
                )
              }
              className="mt-1 block h-10 w-24 rounded-xl border border-border/50 bg-background px-3 text-sm font-bold text-foreground"
            />
            <span className="mt-1 block text-[10px] text-muted-foreground">
              sweep days · 0 = off
            </span>
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

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <SweepTableEditor
            title="Standard roll"
            hint="Rolled on every Clean Sweep day."
            entries={sweepConfig.standardRoll}
            onChange={(entries) => setSweepTable('standardRoll', entries)}
            rewardItems={rewardItems}
            rewardCatalog={rewardCatalog}
          />
          <SweepTableEditor
            title="Golden roll"
            hint={`Replaces the standard roll every ${sweepConfig.goldenEveryDays} sweep days in a row.`}
            entries={sweepConfig.goldenRoll}
            onChange={(entries) => setSweepTable('goldenRoll', entries)}
            rewardItems={rewardItems}
            rewardCatalog={rewardCatalog}
            golden
          />
        </div>

        <div className="mt-4 rounded-xl border border-amber-400/40 bg-amber-50/60 px-3 py-3 dark:bg-amber-500/5">
          <p className="text-[11px] font-black uppercase tracking-wide text-amber-700 dark:text-amber-300">
            Mega bonus
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {sweepConfig.megaEveryDays > 0
              ? `Granted on top of the golden roll every ${sweepConfig.megaEveryDays} sweep days in a row.`
              : 'Off — set a cadence above to use it.'}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {sweepConfig.megaRewards.map((reward, index) => (
              <div
                key={index}
                className="flex items-center gap-1.5 rounded-full border border-border/50 bg-background py-1 pl-1 pr-2"
              >
                <SweepRewardTile
                  reward={reward}
                  rewardCatalog={rewardCatalog}
                  isPremium={false}
                  className="h-8 w-8 rounded-lg"
                />
                <span className="text-xs font-bold text-foreground">
                  {sweepRewardLabel(reward, rewardCatalog)}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setSweepConfig((prev) =>
                      prev
                        ? {
                            ...prev,
                            megaRewards: prev.megaRewards.filter(
                              (_, i) => i !== index,
                            ),
                          }
                        : prev,
                    )
                  }
                  className="text-muted-foreground transition hover:text-red-500"
                  aria-label="Remove mega reward"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
          <SweepRewardAdder
            rewardItems={rewardItems}
            onAdd={(reward) =>
              setSweepConfig((prev) =>
                prev
                  ? { ...prev, megaRewards: [...prev.megaRewards, reward] }
                  : prev,
              )
            }
          />
        </div>
      </div>
    );
  };

  const saveMoveToWebConfig = async () => {
    if (!moveToWebConfig) return;
    setSavingMoveToWeb(true);
    setResult(null);
    try {
      const res = await fetch('/api/admin/quests/move-to-web', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          isActive: moveToWebConfig.isActive,
          reward: moveToWebConfig.reward,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not save move to web');
      setMoveToWebConfig(data.moveToWeb);
      setResult({ type: 'success', message: 'Move to web saved' });
    } catch (error) {
      setResult({
        type: 'error',
        message:
          error instanceof Error ? error.message : 'Could not save move to web',
      });
    } finally {
      setSavingMoveToWeb(false);
    }
  };

  const renderMoveToWebCard = () => {
    if (!moveToWebConfig) return null;
    return (
      <div className="rounded-2xl border border-border/40 bg-card/60 px-4 py-3.5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-foreground">Move to web</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Shows under the daily quests for users who play on their phone but
              have never opened the web. They complete it by logging in on the
              web, then claim the prize below. It never appears as “up next”.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={moveToWebConfig.isActive}
            onClick={() =>
              setMoveToWebConfig((prev) =>
                prev ? { ...prev, isActive: !prev.isActive } : prev,
              )
            }
            className={cn(
              'relative h-6 w-11 shrink-0 rounded-full transition-colors',
              moveToWebConfig.isActive ? 'bg-emerald-500' : 'bg-muted',
            )}
          >
            <span
              className={cn(
                'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
                moveToWebConfig.isActive
                  ? 'translate-x-[22px]'
                  : 'translate-x-0.5',
              )}
            />
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-end gap-4">
          <div className="min-w-0 flex-1">
            <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              Prize (every user gets this one)
            </span>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              {moveToWebConfig.reward ? (
                <RewardTile
                  reward={moveToWebConfig.reward}
                  rewardCatalog={rewardCatalog}
                  isPremium={false}
                />
              ) : (
                <span className="text-xs text-muted-foreground">
                  No prize yet.
                </span>
              )}
              <button
                type="button"
                onClick={() => setMoveToWebRewardPickerOpen(true)}
                className="inline-flex items-center gap-1 rounded-full border border-border/50 bg-background px-3 py-1.5 text-xs font-bold text-muted-foreground transition hover:border-primary/30 hover:text-foreground"
              >
                <Pencil className="h-3 w-3" />
                {moveToWebConfig.reward ? 'Change prize' : 'Pick prize'}
              </button>
            </div>
          </div>

          <Button
            size="sm"
            className="rounded-xl font-black"
            onClick={() => void saveMoveToWebConfig()}
            disabled={savingMoveToWeb}
          >
            {savingMoveToWeb ? 'Saving…' : 'Save move to web'}
          </Button>
        </div>

        <RewardPickerDialog
          open={moveToWebRewardPickerOpen}
          onOpenChange={setMoveToWebRewardPickerOpen}
          rewards={moveToWebConfig.reward ? [moveToWebConfig.reward] : []}
          rewardItems={rewardItems}
          rewardCatalog={rewardCatalog}
          singleSelect
          onSave={(rewards) => {
            setMoveToWebConfig((prev) =>
              prev ? { ...prev, reward: rewards[0] ?? null } : prev,
            );
            setMoveToWebRewardPickerOpen(false);
          }}
        />
      </div>
    );
  };

  const saveLoginStreakConfig = async () => {
    if (!loginStreakConfig) return;
    setSavingLoginStreak(true);
    setResult(null);
    try {
      const res = await fetch('/api/admin/streak/login', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          isActive: loginStreakConfig.isActive,
          saverMinStreak: loginStreakConfig.saverMinStreak,
          goalTiers: loginStreakConfig.goalTiers,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not save login streak');
      setLoginStreakConfig(data.loginStreak);
      setResult({ type: 'success', message: 'Login streak saved' });
    } catch (error) {
      setResult({
        type: 'error',
        message:
          error instanceof Error ? error.message : 'Could not save login streak',
      });
    } finally {
      setSavingLoginStreak(false);
    }
  };

  const isShieldReward = (reward: LoginStreakReward) =>
    reward.type === 'SHIELD' || (reward.type as string) === 'STREAK_FREEZE';
  const loginQuestRewards = (rewards: LoginStreakReward[]) =>
    rewards.filter((r) => !isShieldReward(r)) as QuestReward[];
  const loginShieldCount = (rewards: LoginStreakReward[]) =>
    rewards.reduce(
      (sum, r) => (isShieldReward(r) ? sum + ((r as any).amount ?? 1) : sum),
      0,
    );
  const setLoginTier = (
    list: 'goalTiers',
    days: number,
    updater: (tier: AdminLoginStreakTier) => AdminLoginStreakTier | null,
  ) => {
    setLoginStreakConfig((prev) => {
      if (!prev) return prev;
      const tiers = prev[list]
        .map((tier) => (tier.days === days ? updater(tier) : tier))
        .filter(Boolean) as AdminLoginStreakTier[];
      return { ...prev, [list]: tiers };
    });
  };
  const mergeLoginRewards = (quest: QuestReward[], shields: number) => [
    ...quest,
    ...(shields > 0
      ? [{ type: 'SHIELD', amount: shields } as LoginStreakReward]
      : []),
  ];

  const renderLoginTierList = (
    list: 'goalTiers',
    tiers: AdminLoginStreakTier[],
  ) => (
    <div className="mt-2 space-y-2">
      {tiers.map((tier) => (
        <div
          key={tier.days}
          className="flex flex-wrap items-center gap-2 rounded-xl border border-border/40 bg-background px-3 py-2"
        >
          <span className="w-16 text-sm font-black text-foreground">
            {tier.days}d
          </span>
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
            {loginQuestRewards(tier.rewards).map((reward, ri) => (
              <RewardTile
                key={`${reward.type}-${reward.itemId ?? reward.backgroundId ?? reward.amount ?? ri}`}
                reward={reward}
                rewardCatalog={rewardCatalog}
                isPremium={false}
              />
            ))}
            {loginShieldCount(tier.rewards) > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-black text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400">
                <Icon name="lilyPad" className="h-3.5 w-3.5" />×
                {loginShieldCount(tier.rewards)}
              </span>
            )}
            <button
              type="button"
              onClick={() => setLoginRewardTarget({ list, days: tier.days })}
              className="inline-flex items-center gap-1 rounded-full border border-border/50 bg-background px-2.5 py-1 text-xs font-bold text-muted-foreground transition hover:border-primary/30 hover:text-foreground"
            >
              <Pencil className="h-3 w-3" />
              Prizes
            </button>
          </div>
          <label className="flex items-center gap-1 text-xs font-bold text-muted-foreground">
            <Icon name="lilyPad" label="Lily Pads" className="h-4 w-4" />
            <input
              type="number"
              min={0}
              max={3}
              value={loginShieldCount(tier.rewards)}
              onChange={(e) => {
                const shields = Math.min(
                  3,
                  Math.max(0, Math.floor(Number(e.target.value) || 0)),
                );
                setLoginTier(list, tier.days, (t) => ({
                  ...t,
                  rewards: mergeLoginRewards(loginQuestRewards(t.rewards), shields),
                }));
              }}
              className="h-8 w-14 rounded-lg border border-border/50 bg-background px-2 text-sm font-bold text-foreground"
            />
          </label>
        </div>
      ))}
    </div>
  );

  const renderLoginStreakCard = () => {
    if (!loginStreakConfig) return null;
    const targetTier = loginRewardTarget
      ? loginStreakConfig[loginRewardTarget.list].find(
          (t) => t.days === loginRewardTarget.days,
        )
      : null;
    return (
      <div className="rounded-2xl border border-border/40 bg-card/60 px-4 py-3.5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-foreground">
              Login streak (app entry)
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Opening the app daily grows the streak. Commitments grant the
              prizes below. Missed days are covered by Lily Pads, tuned under
              Shields.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={loginStreakConfig.isActive}
            onClick={() =>
              setLoginStreakConfig((prev) =>
                prev ? { ...prev, isActive: !prev.isActive } : prev,
              )
            }
            className={cn(
              'relative h-6 w-11 shrink-0 rounded-full transition-colors',
              loginStreakConfig.isActive ? 'bg-emerald-500' : 'bg-muted',
            )}
          >
            <span
              className={cn(
                'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
                loginStreakConfig.isActive
                  ? 'translate-x-[22px]'
                  : 'translate-x-0.5',
              )}
            />
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-end gap-4">
          <label className="block">
            <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              Saver push min streak
            </span>
            <input
              type="number"
              min={1}
              max={10}
              value={loginStreakConfig.saverMinStreak}
              onChange={(e) =>
                setLoginStreakConfig((prev) =>
                  prev
                    ? {
                        ...prev,
                        saverMinStreak: Math.min(
                          10,
                          Math.max(1, Math.floor(Number(e.target.value) || 1)),
                        ),
                      }
                    : prev,
                )
              }
              className="mt-1 block h-10 w-20 rounded-xl border border-border/50 bg-background px-3 text-sm font-bold text-foreground"
            />
          </label>
          <Button
            size="sm"
            className="ml-auto rounded-xl font-black"
            onClick={() => void saveLoginStreakConfig()}
            disabled={savingLoginStreak}
          >
            {savingLoginStreak ? 'Saving…' : 'Save login streak'}
          </Button>
        </div>

        <div className="mt-4">
          <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            Commitment goals
          </span>
          {renderLoginTierList('goalTiers', loginStreakConfig.goalTiers)}
        </div>

        {loginRewardTarget && targetTier && (
          <RewardPickerDialog
            open
            onOpenChange={(isOpen) => {
              if (!isOpen) setLoginRewardTarget(null);
            }}
            rewards={loginQuestRewards(targetTier.rewards)}
            rewardItems={rewardItems}
            rewardCatalog={rewardCatalog}
            onSave={(rewards) => {
              setLoginTier(loginRewardTarget.list, loginRewardTarget.days, (t) => ({
                ...t,
                rewards: mergeLoginRewards(rewards, loginShieldCount(t.rewards)),
              }));
              setLoginRewardTarget(null);
            }}
          />
        )}
      </div>
    );
  };

  // Focus areas and the weekly pact are one screen: an area only exists so a
  // pact can be made in it, so authoring them apart invited them to drift.
  const renderPact = () => (
    <div className="space-y-8">
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-black text-foreground">Focus areas</p>
            <p className="text-xs text-muted-foreground">
              The areas a user picks between each week.
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
            <div key={cat.id} className="group flex items-center gap-4 rounded-2xl border border-border/40 bg-card/60 px-4 py-3.5 transition hover:border-primary/20 hover:bg-primary/[0.03]">
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

      <AdminPactManager />
    </div>
  );

  // ── Interactive preview-centered quest editor ─────────────────────────────
  const saveSeasonAutoConfig = async () => {
    if (!seasonAutoConfig) return;
    setSavingSeasonAuto(true);
    setResult(null);
    try {
      const res = await fetch('/api/admin/quests/seasons/auto', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          isActive: seasonAutoConfig.isActive,
          dailyTargetFlies: seasonAutoConfig.dailyTargetFlies,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not save automatic seasons');
      setSeasonAutoConfig(data.seasonAuto);
      setResult({ type: 'success', message: 'Automatic seasons saved' });
    } catch (error) {
      setResult({
        type: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Could not save automatic seasons',
      });
    } finally {
      setSavingSeasonAuto(false);
    }
  };

  const renderSeasonAutoCard = () => {
    if (!seasonAutoConfig) return null;
    return (
      <div className="rounded-2xl border border-border/40 bg-card/60 px-4 py-3.5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-foreground">
              Automatic monthly seasons
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Every calendar month gets its own season with the standard prize
              ladder — gifts every 5th day, a finale on the last day. This takes
              over the dates and prizes, switching off any season you made by
              hand. You can still edit each month&apos;s prizes after it starts.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={seasonAutoConfig.isActive}
            onClick={() =>
              setSeasonAutoConfig((prev) =>
                prev ? { ...prev, isActive: !prev.isActive } : prev,
              )
            }
            className={cn(
              'relative h-6 w-11 shrink-0 rounded-full transition-colors',
              seasonAutoConfig.isActive ? 'bg-emerald-500' : 'bg-muted',
            )}
          >
            <span
              className={cn(
                'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
                seasonAutoConfig.isActive
                  ? 'translate-x-[22px]'
                  : 'translate-x-0.5',
              )}
            />
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-end gap-4">
          <label className="block">
            <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              Daily target (flies)
            </span>
            <input
              type="number"
              min={seasonAutoConfig.limits.min}
              max={seasonAutoConfig.limits.max}
              value={seasonAutoConfig.dailyTargetFlies}
              onChange={(e) =>
                setSeasonAutoConfig((prev) =>
                  prev
                    ? {
                        ...prev,
                        dailyTargetFlies: Math.min(
                          prev.limits.max,
                          Math.max(
                            prev.limits.min,
                            Math.floor(Number(e.target.value) || prev.limits.min),
                          ),
                        ),
                      }
                    : prev,
                )
              }
              className="mt-1 block h-10 w-28 rounded-xl border border-border/50 bg-background px-3 text-sm font-bold text-foreground"
            />
            <span className="mt-1 block text-[10px] text-muted-foreground">
              {seasonAutoConfig.limits.min}–{seasonAutoConfig.limits.max} flies
            </span>
          </label>

          <div className="min-w-0 flex-1" />

          <Button
            size="sm"
            className="rounded-xl font-black"
            onClick={() => void saveSeasonAutoConfig()}
            disabled={savingSeasonAuto}
          >
            {savingSeasonAuto ? 'Saving…' : 'Save automatic seasons'}
          </Button>
        </div>
      </div>
    );
  };

  const renderSeason = () => {
    const selectedDayRewards =
      seasonRewardPickerTarget === null
        ? []
        : seasonRewardPickerTarget.tier === 'free'
          ? seasonForm.dayRewards.find(
              (entry) => entry.day === seasonRewardPickerTarget.day,
            )?.freeRewards ?? []
          : seasonForm.dayRewards.find(
              (entry) => entry.day === seasonRewardPickerTarget.day,
            )?.premiumRewards ?? [];

    return (
      <div className="mx-auto w-full max-w-3xl space-y-5">
        {result && (
          <div
            className={cn(
              'flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium',
              result.type === 'success'
                ? 'bg-emerald-500/8 text-emerald-600 dark:text-emerald-400'
                : 'bg-red-500/8 text-red-600 dark:text-red-400',
            )}
          >
            {result.type === 'success' ? (
              <CheckCircle className="h-4 w-4 shrink-0" />
            ) : (
              <XCircle className="h-4 w-4 shrink-0" />
            )}
            {result.message}
          </div>
        )}

        {renderSeasonAutoCard()}

        <div className="overflow-hidden rounded-[28px] border border-border/50 bg-card shadow-sm">
          <div className="relative h-[260px] overflow-hidden">
            {(() => {
              const preview =
                seasonForm.images.web ||
                seasonForm.images.webLarge ||
                seasonForm.images.tablet ||
                seasonForm.images.mobile;
              return preview ? (
                <img
                  src={preview}
                  alt="Season cover"
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="h-full w-full bg-[linear-gradient(135deg,#f59e0b_0%,#10b981_55%,#0f766e_100%)]" />
              );
            })()}
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/25 to-transparent" />
            <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between gap-3 p-4">
              <span className="rounded-full border border-white/20 bg-black/35 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.16em] text-white backdrop-blur-md">
                {seasonForm.dayCount} days
              </span>
              <span className="rounded-full bg-black/50 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-white/80 backdrop-blur-sm">
                Upload images below
              </span>
            </div>
            <div className="absolute inset-x-0 bottom-0 z-10 p-5">
              <input
                value={seasonForm.name}
                onChange={(event) =>
                  setSeasonForm((prev) => ({ ...prev, name: event.target.value }))
                }
                placeholder="Season name..."
                className="w-full bg-transparent text-4xl font-black tracking-tight text-white placeholder-white/50 outline-none drop-shadow-[0_4px_18px_rgba(0,0,0,0.45)]"
              />
              <p className="mt-2 text-sm font-bold uppercase tracking-[0.16em] text-white/75">
                Unlock Day 1
              </p>
            </div>
          </div>

          <div className="grid gap-4 p-4 md:grid-cols-2">
            <label className="grid gap-2">
              <span className="text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">
                Starts At
              </span>
              <input
                type="datetime-local"
                value={seasonForm.startsAt}
                onChange={(event) =>
                  setSeasonDateField('startsAt', event.target.value)
                }
                className="h-11 rounded-2xl border border-border bg-background px-4 text-sm"
              />
            </label>
            <label className="grid gap-2">
              <span className="text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">
                Ends At
              </span>
              <input
                type="datetime-local"
                value={seasonForm.endsAt}
                onChange={(event) =>
                  setSeasonDateField('endsAt', event.target.value)
                }
                className="h-11 rounded-2xl border border-border bg-background px-4 text-sm"
              />
            </label>
            <label className="grid gap-2">
              <span className="text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">
                Goal Flies Per Day
              </span>
              <input
                type="number"
                min={1}
                value={seasonForm.dailyTargetFlies}
                onChange={(event) =>
                  setSeasonForm((prev) => ({
                    ...prev,
                    dailyTargetFlies: Math.max(1, Number(event.target.value) || 1),
                  }))
                }
                className="h-11 rounded-2xl border border-border bg-background px-4 text-sm"
              />
            </label>
            <label className="grid gap-2">
              <span className="text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">
                Event Days
              </span>
              <div className="flex h-11 items-center rounded-2xl border border-border bg-muted/40 px-4 text-sm font-bold text-foreground">
                {seasonForm.dayCount}
              </div>
            </label>
            <label className="flex items-center gap-2 rounded-2xl border border-border/50 bg-background/80 px-4 py-3 text-sm font-bold text-muted-foreground md:col-span-2">
              <input
                type="checkbox"
                checked={seasonForm.isActive}
                onChange={(event) =>
                  setSeasonForm((prev) => ({ ...prev, isActive: event.target.checked }))
                }
                className="h-4 w-4"
              />
              Active season
            </label>
          </div>
        </div>

        <div className="rounded-[28px] border border-border/50 bg-card p-4 shadow-sm">
          <div className="mb-4">
            <h2 className="text-lg font-black text-foreground">Backgrounds</h2>
            <p className="text-xs text-muted-foreground">
              Upload an image per screen size. {seasonForm.id ? '' : 'Save the season first, then upload.'}
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {SEASON_SIZE_FIELDS.map((field) => (
              <SeasonImageUploader
                key={field.key}
                label={field.label}
                hint={field.hint}
                value={seasonForm.images[field.key]}
                disabled={!seasonForm.id || saving}
                onPick={(file) => uploadSeasonImage(field.key, file)}
                onRemove={() => removeSeasonImage(field.key)}
              />
            ))}
          </div>
        </div>

        <div className="rounded-[28px] border border-border/50 bg-card p-4 shadow-sm">
          <div className="mb-4">
            <h2 className="text-lg font-black text-foreground">Day Prizes</h2>
            <p className="text-xs text-muted-foreground">
              Pick the reward shown for each event day.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {seasonForm.dayRewards.map((entry) => (
              <div
                key={entry.day}
                className="rounded-2xl border border-border/50 bg-background/70 p-3"
              >
                <div className="mb-3 flex items-center gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-sm font-black text-primary">
                    D{entry.day}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-black text-foreground">
                      Day {entry.day}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Free + premium prizes
                    </p>
                  </div>
                </div>
                <div className="grid gap-2">
                  {(['free', 'premium'] as const).map((tier) => {
                    const rewards =
                      tier === 'free' ? entry.freeRewards : entry.premiumRewards;
                    return (
                      <button
                        key={`${entry.day}-${tier}`}
                        type="button"
                        onClick={() =>
                          setSeasonRewardPickerTarget({ day: entry.day, tier })
                        }
                        className="flex items-center gap-2 rounded-xl border border-border/40 bg-card px-3 py-2 text-left transition hover:border-primary/30 hover:bg-primary/5"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-black uppercase tracking-[0.14em] text-muted-foreground">
                            {tier === 'free' ? 'Free' : 'Premium'}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {rewards.length === 0
                              ? 'No reward'
                              : `${rewards.length} reward${rewards.length > 1 ? 's' : ''}`}
                          </p>
                        </div>
                        <div className="flex shrink-0 -space-x-2">
                          {rewards.slice(0, SEASON_REWARDS_PER_LANE).map((reward, index) => (
                            <RewardTile
                              key={`${entry.day}-${tier}-${reward.type}-${reward.itemId ?? reward.amount ?? index}`}
                              reward={reward}
                              rewardCatalog={rewardCatalog}
                              isPremium={false}
                              className="h-10 w-10 rounded-xl border-background"
                            />
                          ))}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-[24px] border border-border/50 bg-background/95 px-4 py-3 shadow-lg backdrop-blur">
          <p className="flex-1 text-sm text-muted-foreground">
            {seasonForm.id ? 'Editing existing season.' : 'Creating a new season.'}
          </p>
          {seasonForm.id && (
            <Button size="sm" variant="destructive" onClick={deleteSeason} disabled={saving} className="rounded-xl">
              Delete
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => setView('home')} disabled={saving} className="rounded-xl">
            Cancel
          </Button>
          <Button size="sm" onClick={saveSeason} disabled={saving} className="rounded-xl font-black">
            {seasonSaveButtonLabel}
          </Button>
        </div>

        <RewardPickerDialog
          open={seasonRewardPickerTarget !== null}
          onOpenChange={(open) => {
            if (!open) {
              setSeasonRewardPickerTarget(null);
              setConfirmSeasonPrizeSave(false);
            }
          }}
          rewards={selectedDayRewards}
          rewardItems={rewardItems}
          rewardCatalog={rewardCatalog}
          maxSelect={SEASON_REWARDS_PER_LANE}
          confirmSave={confirmSeasonPrizeSave}
          onRequestConfirmSave={() => setConfirmSeasonPrizeSave(true)}
          onSave={(rewards) => {
            if (seasonRewardPickerTarget === null) return;
            const nextRewards = normalizeSeasonLaneRewards(rewards);
            setSeasonForm((prev) => ({
              ...prev,
              dayRewards: prev.dayRewards.map((entry) =>
                entry.day === seasonRewardPickerTarget.day
                  ? {
                      ...entry,
                      [seasonRewardPickerTarget.tier === 'free'
                        ? 'freeRewards'
                        : 'premiumRewards']: nextRewards,
                    }
                  : entry,
                ),
            }));
            setConfirmSeasonPrizeSave(false);
          }}
        />
      </div>
    );
  };

  const renderForm = () => (
    <div className="mx-auto w-full max-w-xl space-y-6">
      {result && (
        <div className={cn(
          'flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium',
          result.type === 'success'
            ? 'bg-emerald-500/8 text-emerald-600 dark:text-emerald-400'
            : 'bg-red-500/8 text-red-600 dark:text-red-400',
        )}>
          {result.type === 'success' ? <CheckCircle className="h-4 w-4 shrink-0" /> : <XCircle className="h-4 w-4 shrink-0" />}
          {result.message}
        </div>
      )}

      {/* Interactive quest card */}
      <div className="overflow-hidden rounded-[28px] border border-border/50 bg-card shadow-sm">
        {/* ── Cover photo area ── */}
        <div className="relative overflow-hidden">
          {/* Photo background (visual only) */}
          {form.coverImageUrl ? (
            <img src={form.coverImageUrl} alt="Quest cover" className="h-[220px] w-full object-cover" />
          ) : (
            <div className="h-[220px] w-full bg-[linear-gradient(135deg,#0ea5e9_0%,#2563eb_55%,#0f172a_100%)]" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/28 to-transparent pointer-events-none" />

          <input
            ref={(el) => { coverFileInputRef.current = el; }}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              const coverImageUrl = await readFileAsDataUrl(file);
              setForm((prev) => ({ ...prev, coverImageUrl }));
            }}
          />

          {/* Top bar: badge + cover actions */}
          <div className="absolute inset-x-0 top-0 z-20 flex items-start justify-between p-4">
            <span className="inline-flex h-7 items-center justify-center gap-1.5 rounded-full border border-white/20 bg-black/35 px-3 text-[11px] font-black uppercase leading-none tracking-[0.18em] text-white backdrop-blur-md">
              <Clock className="h-3 w-3 shrink-0" />
              <span className="leading-none">{formTimeLabel}</span>
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => coverFileInputRef.current?.click()}
                className="flex items-center gap-1.5 rounded-full bg-black/50 px-3 py-1.5 text-xs font-bold text-white/90 backdrop-blur-sm transition hover:bg-black/70"
              >
                <Camera className="h-3.5 w-3.5" />
                {form.coverImageUrl ? 'Change' : 'Add photo'}
              </button>
              {form.coverImageUrl && (
                <button
                  type="button"
                  onClick={() => setForm((prev) => ({ ...prev, coverImageUrl: undefined }))}
                  className="flex items-center gap-1.5 rounded-full bg-black/50 px-3 py-1.5 text-xs font-bold text-white/90 backdrop-blur-sm transition hover:bg-black/70"
                >
                  <XCircle className="h-3.5 w-3.5" />
                  Remove
                </button>
              )}
            </div>
          </div>

          {/* Internal name (admin-only, not shown to users) */}
          <div className="absolute inset-x-0 bottom-0 z-10 px-4 pb-3">
            {editingTitle ? (
              <input
                autoFocus
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                onBlur={() => setEditingTitle(false)}
                onKeyDown={(e) => e.key === 'Enter' && setEditingTitle(false)}
                placeholder="Internal name (admin only)"
                className="w-full rounded-md bg-black/40 px-2 py-1 text-xs font-bold tracking-tight text-white placeholder-white/50 outline-none ring-1 ring-white/20 backdrop-blur-sm"
              />
            ) : (
              <button
                type="button"
                onClick={() => setEditingTitle(true)}
                className="group/title inline-flex max-w-full items-center gap-1.5 rounded-md bg-black/35 px-2 py-1 text-left text-xs font-bold tracking-tight text-white/85 ring-1 ring-white/15 backdrop-blur-sm transition hover:bg-black/50"
                title="Internal name — not shown to players"
              >
                <span className="truncate">
                  {form.name || <span className="text-white/50">Internal name…</span>}
                </span>
                <Pencil className="h-3 w-3 shrink-0 text-white/60 transition group-hover/title:text-white" />
              </button>
            )}
          </div>
        </div>

        {/* ── Objectives / progress blocks - clickable ── */}
        <div className="px-4 pt-4 pb-4 space-y-4">
          <button
            type="button"
            onClick={() => setConditionsPopupOpen(true)}
            className="group/cond w-full text-left"
          >
            <div>
              {previewLogic.length > 0 ? (
                previewLogic.map((block, i) => (
                  <div key={block.id} className={cn('py-3', i < previewLogic.length - 1 && 'border-b border-border/20')}>
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[14px] font-black leading-snug text-foreground">
                        {formatQuestObjective(block)}
                      </p>
                      <span className="shrink-0 text-[12px] font-black tabular-nums text-muted-foreground">
                        0/{block.targetLabel ?? block.target}
                      </span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted/50">
                      <div className="h-full rounded-full bg-red-400 dark:bg-red-500" style={{ width: '0%' }} />
                    </div>
                    {(block.rewards?.length ?? 0) > 0 && (
                      <div className="mt-2 flex items-center gap-2">
                        <div className="flex flex-wrap gap-1.5">
                          {block.rewards!.map((r, ri) => (
                            <RewardTile key={`${r.type}-${r.itemId ?? r.amount ?? ri}`} reward={r} rewardCatalog={rewardCatalog} isPremium={false} />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-border/50 bg-background/60 px-4 py-5 text-center text-sm text-muted-foreground">
                  <Layers3 className="mx-auto mb-2 h-5 w-5" />
                  Click to add objectives
                </div>
              )}
            </div>
            <div className="mt-3 flex items-center justify-center gap-1.5 rounded-xl py-1.5 text-xs font-bold text-muted-foreground opacity-0 transition group-hover/cond:opacity-100">
              <Pencil className="h-3 w-3" />
              Edit objectives
            </div>
          </button>

          {/* Action buttons row */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => setAvailabilityPopupOpen(true)}
              className={cn(
                'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition hover:bg-muted/60',
                form.visibilityConditions.length > 0
                  ? 'border-primary/30 bg-primary/10 text-primary'
                  : 'border-border/50 bg-background/80 text-muted-foreground',
              )}
            >
              <Eye className="h-3 w-3" />
              {form.visibilityConditions.length > 0
                ? `${form.visibilityConditions.length} rule${form.visibilityConditions.length > 1 ? 's' : ''}`
                : 'Availability'}
            </button>
            <label className="ml-auto flex cursor-pointer items-center gap-2 rounded-full border border-border/50 bg-background/80 px-3 py-1.5 text-xs font-bold text-muted-foreground transition hover:bg-muted/60">
              <input type="checkbox" checked={form.isActive} onChange={(event) => setForm((prev) => ({ ...prev, isActive: event.target.checked }))} className="h-3 w-3" />
              Active
            </label>
          </div>
        </div>
      </div>

      {/* Save / Cancel / Delete bar */}
      <div className="flex items-center gap-3 rounded-[24px] border border-border/50 bg-background/95 px-4 py-3 shadow-lg backdrop-blur">
        <p className="flex-1 text-sm text-muted-foreground">{form.id ? 'Editing existing template.' : 'Creating a new template.'}</p>
        {form.id && <Button size="sm" variant="destructive" onClick={deleteQuest} disabled={saving} className="rounded-xl">{questDeleteButtonLabel}</Button>}
        <Button size="sm" variant="outline" onClick={() => { resetForm(); setView('onboarding'); }} disabled={saving} className="rounded-xl">Cancel</Button>
        <Button size="sm" onClick={saveQuest} disabled={saving} className="rounded-xl font-black">{questSaveButtonLabel}</Button>
      </div>

      {/* Popups */}
      <ObjectivesEditorDialog
        open={conditionsPopupOpen}
        onOpenChange={setConditionsPopupOpen}
        logic={form.logic}
        placement={form.placement}
        rewardItems={rewardItems}
        rewardCatalog={rewardCatalog}
        onUpdate={updateLogic}
        onAdd={() => setForm((prev) => ({ ...prev, logic: [...prev.logic, createLogic()] }))}
        onRemove={(id) => setForm((prev) => ({ ...prev, logic: prev.logic.filter((b) => b.id !== id) }))}
      />

      <AvailabilityEditorDialog
        open={availabilityPopupOpen}
        onOpenChange={setAvailabilityPopupOpen}
        conditions={form.visibilityConditions}
        onUpdate={updateVisibilityCondition}
        onAdd={() => setForm((prev) => ({ ...prev, visibilityConditions: [...prev.visibilityConditions, createVisibilityCondition()] }))}
        onRemove={(id) => setForm((prev) => ({ ...prev, visibilityConditions: prev.visibilityConditions.filter((c) => c.id !== id) }))}
      />
    </div>
  );

  // ── Back button label ─────────────────────────────────────────────────────
  const backLabel =
    view === 'home' ? null : view === 'form' ? 'Onboarding' : 'Quest Manager';

  const handleBack = () => {
    setView(view === 'form' ? 'onboarding' : 'home');
  };


  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-[1600px] px-4 py-6 md:px-8">
        {/* Header */}
        <div className="mb-8 flex items-center gap-4">
          {backLabel ? (
            <button onClick={handleBack} className="flex h-9 w-9 items-center justify-center rounded-full border border-border/50 bg-card text-muted-foreground shadow-sm transition hover:bg-muted hover:text-foreground">
              <ArrowLeft className="h-4 w-4" />
            </button>
          ) : (
            <Link href="/" className="flex h-9 w-9 items-center justify-center rounded-full border border-border/50 bg-card text-muted-foreground shadow-sm transition hover:bg-muted hover:text-foreground">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          )}
          <h1 className="text-2xl font-black tracking-tight text-foreground">
            {view === 'home' && 'Quest Manager'}
            {view === 'daily' && 'Daily Quests'}
            {view === 'pact' && 'Weekly Pact'}
            {view === 'onboarding' && 'Onboarding Quests'}
            {view === 'streaks' && 'Streak Manager'}
            {view === 'shields' && 'Shields'}
            {view === 'moveToWeb' && 'Move to Web'}
            {view === 'season' && 'Season'}
            {view === 'form' && (form.id ? 'Edit Quest' : 'New Quest')}
          </h1>
        </div>

        {/* Global result message */}
        {result && view !== 'form' && (
          <div className={cn(
            'mb-6 flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium',
            result.type === 'success'
              ? 'bg-emerald-500/8 text-emerald-600 dark:text-emerald-400'
              : 'bg-red-500/8 text-red-600 dark:text-red-400',
          )}>
            {result.type === 'success' ? <CheckCircle className="h-4 w-4 shrink-0" /> : <XCircle className="h-4 w-4 shrink-0" />}
            {result.message}
          </div>
        )}

        {/* Content */}
        {view === 'form' ? (
          renderForm()
        ) : (
          <>
            {loading && view === 'home' ? (
              <div className="py-12 text-center text-sm text-muted-foreground">Loading...</div>
            ) : (
              <>
                {view === 'home' && renderHome()}
                {view === 'daily' && renderDaily()}
                {view === 'onboarding' && renderOnboarding()}
                {view === 'streaks' && renderStreaks()}
                {view === 'shields' && renderShields()}
                {view === 'pact' && renderPact()}
                {view === 'moveToWeb' && renderMoveToWeb()}
                {view === 'season' && renderSeason()}
              </>
            )}
          </>
        )}

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
                <span className="text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">Name</span>
                <input value={categoryForm.name} onChange={(e) => setCategoryForm((p) => ({ ...p, name: e.target.value }))} placeholder="e.g. Sport" className="h-11 rounded-2xl border border-border bg-background px-4 text-sm outline-none focus:border-primary/30" />
              </label>
              <label className="grid gap-2">
                <span className="text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">Description</span>
                <textarea rows={3} value={categoryForm.description} onChange={(e) => setCategoryForm((p) => ({ ...p, description: e.target.value }))} placeholder="What this category is about." className="rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none focus:border-primary/30" />
              </label>
              <label className="grid gap-2">
                <span className="text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">Onboarding Sentence</span>
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
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">Category Photo</p>
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
                      <span className="relative rounded-full bg-black/55 px-3 py-1.5 text-xs font-black uppercase tracking-[0.14em] text-white backdrop-blur-sm">
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
            </div>
            <DialogFooter className="shrink-0 border-t border-border/50 bg-card/95 px-6 py-4 sm:gap-3">
              <Button variant="outline" className="rounded-2xl" onClick={() => { setCategoryDialogOpen(false); setConfirmAction(null); }}>Cancel</Button>
              <Button className="rounded-2xl font-black" onClick={() => void saveCategory()} disabled={savingCategory || !categoryForm.name.trim()}>
                {categorySaveButtonLabel}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

function InlinePillSelect({ value, onChange, children, className }: { value: string; onChange: (value: string) => void; children: React.ReactNode; className?: string }) {
  return (
    <span className="relative inline-flex">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "h-[30px] cursor-pointer appearance-none rounded-full border border-primary/25 bg-primary/8 pl-2.5 pr-7 text-[13px] font-bold text-primary outline-none transition hover:bg-primary/15 focus:ring-2 focus:ring-primary/20",
          className,
        )}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-primary/60" />
    </span>
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
        <p className="text-[11px] font-black uppercase tracking-wide text-foreground">
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

function ObjectivesEditorDialog({
  open,
  onOpenChange,
  logic,
  placement,
  rewardItems,
  rewardCatalog,
  onUpdate,
  onAdd,
  onRemove,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  logic: QuestLogicBlock[];
  placement: QuestPlacement;
  rewardItems: MetaRewardItem[];
  rewardCatalog: Record<string, QuestRewardCatalogItem>;
  onUpdate: (id: string, patch: Partial<QuestLogicBlock>) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
}) {
  const word = "text-[13px] font-medium text-foreground";
  const [rewardPickerForBlockId, setRewardPickerForBlockId] = useState<string | null>(null);
  const rewardPickerBlock = rewardPickerForBlockId ? logic.find((b) => b.id === rewardPickerForBlockId) : null;
  const allHaveRewards = logic.length > 0 && logic.every((b) => (b.rewards?.length ?? 0) > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-lg !rounded-[28px] !p-0 overflow-hidden">
        <DialogHeader className="sr-only">
          <DialogTitle>Objectives</DialogTitle>
          <DialogDescription>What the user needs to do.</DialogDescription>
        </DialogHeader>

        <div className="px-5 pt-5 pb-1">
          <p className="text-base font-black text-foreground">Quest Objectives</p>
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-5 py-3 space-y-3">
          {logic.map((block, index) => (
            <div key={block.id} className="rounded-2xl border border-border/50 bg-muted/30 px-4 py-3.5">
              {/* Delete row */}
              <div className="mb-2.5 flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">Objective {index + 1}</span>
                {logic.length > 1 && (
                  <button onClick={() => onRemove(block.id)} className="rounded-lg p-1 text-muted-foreground/60 transition hover:bg-red-500/10 hover:text-red-500">
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </div>

              {/* Sentence builder */}
              {block.type === 'count' ? (
                <div className="flex flex-wrap items-center gap-x-1.5 gap-y-2 leading-[30px]">
                  <InlinePillSelect value={block.action ?? 'complete'} onChange={(v) => onUpdate(block.id, { action: v as QuestLogicBlock['action'] })}>
                    <option value="complete">Complete</option>
                    <option value="add">Add</option>
                  </InlinePillSelect>

                  {block.amountMode === 'fixed' ? (
                    <InlinePillNumber value={block.amount ?? 1} onChange={(v) => onUpdate(block.id, { amount: v })} />
                  ) : (
                    <>
                      <InlinePillNumber value={block.minAmount ?? 1} onChange={(v) => onUpdate(block.id, { minAmount: v })} />
                      <span className={word}>to</span>
                      <InlinePillNumber value={block.maxAmount ?? 3} onChange={(v) => onUpdate(block.id, { maxAmount: v })} />
                    </>
                  )}

                  <InlinePillSelect value={block.subject} onChange={(v) => onUpdate(block.id, { subject: v as QuestSubject })}>
                    <option value="task">tasks</option>
                    <option value="any">any task</option>
                  </InlinePillSelect>

                  {block.tagMode !== 'ignore' && (
                    <span className={word}>tagged with a random tag</span>
                  )}
                </div>
              ) : block.type === 'metric_count' ? (
                <div className="flex flex-wrap items-center gap-x-1.5 gap-y-2 leading-[30px]">
                  <InlinePillSelect
                    value={block.metricKey ?? 'trade_completed'}
                    onChange={(v) => onUpdate(block.id, { metricKey: v })}
                  >
                    {Object.entries(QUEST_METRIC_COPY).map(([key, copy]) => (
                      <option key={key} value={key}>
                        {copy.adminLabel}
                      </option>
                    ))}
                  </InlinePillSelect>
                  <span className={word}>×</span>
                  {block.amountMode === 'fixed' ? (
                    <InlinePillNumber value={block.amount ?? 1} onChange={(v) => onUpdate(block.id, { amount: v })} />
                  ) : (
                    <>
                      <InlinePillNumber value={block.minAmount ?? 1} onChange={(v) => onUpdate(block.id, { minAmount: v })} />
                      <span className={word}>to</span>
                      <InlinePillNumber value={block.maxAmount ?? 3} onChange={(v) => onUpdate(block.id, { maxAmount: v })} />
                    </>
                  )}
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-x-1.5 gap-y-2 leading-[30px]">
                  <span className={word}>Focus on tasks for</span>
                  {block.amountMode === 'fixed' ? (
                    <InlinePillNumber value={block.amount ?? 1} onChange={(v) => onUpdate(block.id, { amount: v })} />
                  ) : (
                    <>
                      <InlinePillNumber value={block.minAmount ?? 1} onChange={(v) => onUpdate(block.id, { minAmount: v })} />
                      <span className={word}>to</span>
                      <InlinePillNumber value={block.maxAmount ?? 3} onChange={(v) => onUpdate(block.id, { maxAmount: v })} />
                    </>
                  )}
                  <span className={word}>minutes</span>
                </div>
              )}

              {placement === 'onboarding' && (
                <input
                  value={block.helpText ?? ''}
                  onChange={(e) =>
                    onUpdate(block.id, { helpText: e.target.value || undefined })
                  }
                  placeholder="Help tip shown behind the ? on this objective (optional)"
                  className="mt-2.5 h-9 w-full rounded-xl border border-border/50 bg-background px-3 text-xs text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-primary/30"
                />
              )}

              {/* Objective rewards */}
              {(block.rewards?.length ?? 0) > 0 && (
                <button
                  type="button"
                  onClick={() => setRewardPickerForBlockId(block.id)}
                  className="mt-2.5 flex w-full items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-left transition hover:bg-emerald-500/10"
                >
                  <span className="text-[10px] font-black uppercase tracking-[0.14em] text-emerald-600 dark:text-emerald-400 shrink-0">Reward</span>
                  <div className="flex flex-wrap gap-2">
                    {block.rewards!.map((reward, ri) => (
                      <RewardTile
                        key={`${reward.type}-${reward.itemId ?? reward.amount ?? ri}`}
                        reward={reward}
                        rewardCatalog={rewardCatalog}
                        isPremium={false}
                      />
                    ))}
                  </div>
                  <Pencil className="ml-auto h-3 w-3 shrink-0 text-emerald-600/40 dark:text-emerald-400/40" />
                </button>
              )}

              {/* Bottom options row */}
              <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-border/30 pt-2.5">
                <button
                  type="button"
                  onClick={() =>
                    onUpdate(
                      block.id,
                      block.type === 'count'
                        ? { type: 'focus_minutes', subject: 'task', action: undefined, metricKey: undefined }
                        : block.type === 'focus_minutes'
                          ? { type: 'metric_count', subject: 'task', action: undefined, metricKey: 'trade_completed', tagMode: 'ignore' }
                          : { type: 'count', subject: 'task', action: 'complete', metricKey: undefined, tagMode: 'ignore' as const },
                    )
                  }
                  className="inline-flex items-center gap-1 rounded-full border border-border/50 bg-background px-2.5 py-1 text-[11px] font-bold text-muted-foreground transition hover:border-primary/30 hover:text-foreground"
                >
                  {block.type === 'count'
                    ? 'Switch to focus time'
                    : block.type === 'focus_minutes'
                      ? 'Switch to app action'
                      : 'Switch to count'}
                </button>
                <button
                  type="button"
                  onClick={() => onUpdate(block.id, block.amountMode === 'fixed' ? { amountMode: 'random', amount: undefined, minAmount: block.minAmount ?? 1, maxAmount: block.maxAmount ?? Math.max(block.amount ?? 3, 1) } : { amountMode: 'fixed', amount: block.amount ?? block.maxAmount ?? 1, minAmount: undefined, maxAmount: undefined })}
                  className="inline-flex items-center gap-1 rounded-full border border-border/50 bg-background px-2.5 py-1 text-[11px] font-bold text-muted-foreground transition hover:border-primary/30 hover:text-foreground"
                >
                  {block.amountMode === 'fixed' ? 'Use random range' : 'Use fixed amount'}
                </button>
                {block.type === 'count' && (
                  <button
                    type="button"
                    onClick={() => onUpdate(block.id, { tagMode: block.tagMode === 'ignore' ? 'random_user_tag' : 'ignore' })}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-bold transition",
                      block.tagMode !== 'ignore' ? 'border-primary/25 bg-primary/8 text-primary hover:bg-primary/15' : 'border-border/50 bg-background text-muted-foreground hover:border-primary/30 hover:text-foreground',
                    )}
                  >
                    {block.tagMode !== 'ignore' ? 'Tag filter on' : 'Add tag filter'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setRewardPickerForBlockId(block.id)}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-bold transition",
                    (block.rewards?.length ?? 0) > 0
                      ? 'border-emerald-500/25 bg-emerald-500/8 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/15'
                      : 'border-border/50 bg-background text-muted-foreground hover:border-emerald-500/30 hover:text-emerald-600 dark:hover:text-emerald-400',
                  )}
                >
                  <Gift className="h-3 w-3" />
                  {(block.rewards?.length ?? 0) > 0 ? 'Edit reward' : 'Add reward'}
                </button>
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={onAdd}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-border/50 py-3 text-xs font-bold text-muted-foreground transition hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
          >
            <Plus className="h-3.5 w-3.5" />
            Add another objective
          </button>
        </div>

        <div className="border-t border-border/40 px-5 py-3 flex items-center justify-between gap-3">
          {!allHaveRewards && (
            <p className="text-xs font-medium text-red-500">Every objective needs a reward.</p>
          )}
          <div className="ml-auto">
            <Button size="sm" className="rounded-xl font-bold" onClick={() => onOpenChange(false)} disabled={!allHaveRewards}>Done</Button>
          </div>
        </div>
      </DialogContent>

      {rewardPickerBlock && (
        <RewardPickerDialog
          open={!!rewardPickerForBlockId}
          onOpenChange={(isOpen) => { if (!isOpen) setRewardPickerForBlockId(null); }}
          rewards={rewardPickerBlock.rewards ?? []}
          rewardItems={rewardItems}
          rewardCatalog={rewardCatalog}
          maxSelect={2}
          onSave={(rewards) => {
            const next = normalizeRewardList(rewards).slice(0, 2);
            onUpdate(rewardPickerForBlockId!, {
              rewards: next.length > 0 ? next : undefined,
            });
            setRewardPickerForBlockId(null);
          }}
        />
      )}
    </Dialog>
  );
}

function AvailabilityEditorDialog({
  open,
  onOpenChange,
  conditions,
  onUpdate,
  onAdd,
  onRemove,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conditions: QuestVisibilityCondition[];
  onUpdate: (id: string, patch: Partial<QuestVisibilityCondition>) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-lg !rounded-[28px] !p-0 overflow-hidden">
        <DialogHeader className="sr-only">
          <DialogTitle>Availability</DialogTitle>
          <DialogDescription>Control when this quest can appear.</DialogDescription>
        </DialogHeader>

        <div className="px-5 pt-5 pb-1">
          <p className="text-base font-black text-foreground">Who can see this quest?</p>
          <p className="mt-0.5 text-xs text-muted-foreground">All rules must pass before the quest appears for a user.</p>
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-5 py-3 space-y-3">
          {conditions.length === 0 ? (
            <div className="rounded-2xl border border-border/50 bg-muted/30 px-4 py-6 text-center">
              <p className="text-sm font-bold text-foreground">Everyone</p>
              <p className="mt-1 text-xs text-muted-foreground">No restrictions. Add a rule below to limit visibility.</p>
            </div>
          ) : (
            conditions.map((condition) => (
              <div key={condition.id} className="rounded-2xl border border-border/50 bg-muted/30 px-4 py-3.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-x-1.5 gap-y-2 leading-[30px]">
                    <span className="text-[13px] font-medium text-foreground">Only show when</span>
                    <InlinePillSelect value={condition.metric} onChange={(v) => onUpdate(condition.id, { metric: v as QuestVisibilityMetric })}>
                      <option value="daily_tasks_count">tasks today</option>
                      <option value="tags_count">tags count</option>
                    </InlinePillSelect>
                    <span className="text-[13px] font-medium text-foreground">is</span>
                    <InlinePillSelect value={condition.operator} onChange={(v) => onUpdate(condition.id, { operator: v as QuestVisibilityOperator })}>
                      <option value="gt">more than</option>
                      <option value="lt">less than</option>
                    </InlinePillSelect>
                    <InlinePillNumber value={condition.value} onChange={(v) => onUpdate(condition.id, { value: v })} min={0} />
                  </div>
                  <button onClick={() => onRemove(condition.id)} className="mt-0.5 shrink-0 rounded-lg p-1 text-muted-foreground/60 transition hover:bg-red-500/10 hover:text-red-500">
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
            ))
          )}

          <button
            type="button"
            onClick={onAdd}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-border/50 py-3 text-xs font-bold text-muted-foreground transition hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
          >
            <Plus className="h-3.5 w-3.5" />
            Add rule
          </button>
        </div>

        <div className="border-t border-border/40 px-5 py-3 text-right">
          <Button size="sm" className="rounded-xl font-bold" onClick={() => onOpenChange(false)}>Done</Button>
        </div>
      </DialogContent>
    </Dialog>
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
  confirmSave?: boolean;
  onRequestConfirmSave?: () => void;
  onSave: (rewards: QuestReward[]) => void;
}) {
  const selectLimit = singleSelect ? 1 : (maxSelect ?? Infinity);
  const normalizeCapped = (list: QuestReward[]) =>
    Number.isFinite(selectLimit)
      ? normalizeRewardList(list).slice(0, selectLimit)
      : normalizeRewardList(list);
  const [activeTab, setActiveTab] = useState<RewardPickerTab>('flies');
  const [draft, setDraft] = useState<QuestReward[]>(() =>
    normalizeRewardList(rewards),
  );

  useEffect(() => {
    if (!open) return;
    setDraft(normalizeCapped(rewards));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, rewards, selectLimit]);

  const fliesReward = draft.find((reward) => reward.type === 'FLIES');
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
              Reward Picker
            </DialogTitle>
            <DialogDescription>
              Select multiple rewards from flies, items, and boxes. Fly and box rewards support amounts. Item rewards grant one copy each.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="max-h-[75vh] overflow-y-auto px-6 py-5">
          <div className="mb-5 flex flex-wrap gap-2">
            {(['flies', 'item', 'box', 'background'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={cn(
                  'rounded-2xl border px-4 py-2 text-sm font-black uppercase tracking-[0.16em] transition',
                  activeTab === tab
                    ? 'border-primary/30 bg-primary/10 text-primary'
                    : 'border-border/50 bg-background text-muted-foreground hover:bg-muted/40 hover:text-foreground',
                )}
              >
                {tab === 'flies'
                  ? 'Flies'
                  : tab === 'item'
                    ? 'Items'
                    : tab === 'box'
                      ? 'Boxes'
                      : 'Backgrounds'}
              </button>
            ))}
          </div>

          <div className="mb-6 rounded-[24px] border border-border/50 bg-background/70 p-4">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">
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

          {activeTab === 'flies' ? (
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
                    <span className="text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">
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
                      <span className="text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">
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
                        <span className="text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">
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
                        <span className="text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">
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
                      <p className="mt-1 text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">
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
                        <p className="mt-1 text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">
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
                        <span className="text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">
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

function SeasonImageUploader({
  label,
  hint,
  value,
  disabled,
  onPick,
  onRemove,
}: {
  label: string;
  hint: string;
  value: string;
  disabled: boolean;
  onPick: (file: File) => void;
  onRemove: () => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  return (
    <div className="rounded-2xl border border-border/60 bg-background/60 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs font-black uppercase tracking-[0.14em] text-muted-foreground">
          {label}
        </span>
        <span className="text-[10px] font-medium text-muted-foreground/70">
          {hint}
        </span>
      </div>
      <div className="flex items-stretch gap-2">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted text-[10px] text-muted-foreground">
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="opacity-60">empty</span>
          )}
        </div>
        <div className="flex flex-1 flex-col gap-1.5">
          <button
            type="button"
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
            className="h-9 w-full rounded-xl bg-primary/10 px-3 text-xs font-black text-primary transition hover:bg-primary/20 disabled:opacity-60"
          >
            {value ? 'Replace' : 'Upload image'}
          </button>
          {value && (
            <button
              type="button"
              disabled={disabled}
              onClick={onRemove}
              className="h-7 w-full rounded-lg bg-red-500/10 text-[11px] font-bold text-red-600 transition hover:bg-red-500/20 disabled:opacity-60 dark:text-red-400"
            >
              Remove
            </button>
          )}
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onPick(file);
          if (event.target) event.target.value = '';
        }}
      />
    </div>
  );
}
