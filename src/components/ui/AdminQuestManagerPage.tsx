'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Camera,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Edit2,
  Eye,
  Gift,
  Layers3,
  Pencil,
  Plus,
  ScrollText,
  Sparkles,
  Trash2,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
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
import {
  formatQuestObjective,
  type QuestCardLogicBlock,
  type QuestRewardCatalogItem,
  RewardTile,
} from './QuestCards';

type AdminQuestTemplate = {
  id: string;
  name: string;
  description: string;
  coverImageUrl?: string;
  placement: QuestPlacement;
  categoryId?: string;
  rewards: QuestRewards;
  logic: QuestLogicBlock[];
  visibilityConditions: QuestVisibilityCondition[];
  isActive: boolean;
};

type MetaRewardItem = QuestRewardCatalogItem;
type AdminCategory = {
  id: string;
  name: string;
  shortLabel: string;
  description: string;
  accent: string;
  backgroundFrom: string;
  backgroundTo: string;
  isBuiltIn: boolean;
};

type CategoryFormState = {
  name: string;
  shortLabel: string;
  description: string;
  accent: string;
  backgroundFrom: string;
  backgroundTo: string;
};

type ViewLevel = 'home' | 'daily' | 'focus' | 'category' | 'form';

type FormState = {
  id?: string;
  name: string;
  description: string;
  coverImageUrl?: string;
  placement: QuestPlacement;
  categoryId?: string;
  rewards: QuestRewards;
  logic: QuestLogicBlock[];
  visibilityConditions: QuestVisibilityCondition[];
  isActive: boolean;
};

type RewardPickerTab = 'flies' | 'item' | 'box';
type ConfirmAction =
  | 'save-quest'
  | 'delete-quest'
  | 'save-category'
  | `delete-category:${string}`;

const createReward = (): QuestReward => ({
  type: 'FLIES',
  amountMode: 'fixed',
  amount: 50,
});
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
  placement: 'daily',
  categoryId: undefined,
  rewards: [createReward()],
  logic: [createLogic()],
  visibilityConditions: [],
  isActive: true,
});

const visibilityMetricLabel: Record<QuestVisibilityMetric, string> = {
  daily_tasks_count: 'User tasks today',
  total_habits_count: 'User habits total',
  tags_count: 'User tags count',
};

const visibilityOperatorLabel: Record<QuestVisibilityOperator, string> = {
  gt: 'More than',
  lt: 'Less than',
};

async function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('Could not read image'));
    reader.readAsDataURL(file);
  });
}

function positiveNumber(value: number | undefined, fallback: number) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

function amountRangeLabel(min: number | undefined, max: number | undefined) {
  const safeMin = positiveNumber(min, 1);
  const safeMax = Math.max(safeMin, positiveNumber(max, safeMin));
  return safeMin === safeMax ? String(safeMax) : `${safeMin}-${safeMax}`;
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
    targetLabel: isRandom
      ? amountRangeLabel(block.minAmount, block.maxAmount)
      : String(target),
    resolvedTagName:
      block.tagMode === 'random_user_tag' ? 'Random user tag' : undefined,
    previewTagLabel:
      block.tagMode === 'focus_category_tags'
        ? 'Saved focus tags'
        : block.tagMode === 'random_user_tag'
          ? 'Random user tag'
          : undefined,
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

  if (reward.itemId) {
    const name = rewardCatalog[reward.itemId]?.name ?? reward.itemId;
    if (reward.type === 'BOX' && reward.amount && reward.amount > 1) {
      return `${name} ×${reward.amount}`;
    }
    return name;
  }

  return reward.type === 'BOX' ? 'Mystery box' : 'Item reward';
}

function rewardKey(reward: QuestReward) {
  if (reward.type === 'FLIES') return 'FLIES';
  return `${reward.type}:${reward.itemId ?? ''}`;
}

function normalizeRewardList(rewards: QuestReward[]) {
  const flies = rewards
    .filter((reward) => reward.type === 'FLIES')
    .slice(0, 1);
  const items = rewards.filter((reward) => reward.type === 'ITEM' && reward.itemId);
  const boxes = rewards.filter((reward) => reward.type === 'BOX' && reward.itemId);
  return [...flies, ...items, ...boxes];
}

function rewardTypeLabel(type: QuestRewardType) {
  if (type === 'FLIES') return 'Flies';
  if (type === 'BOX') return 'Box';
  return 'Item';
}

export function AdminQuestManagerPage() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [templates, setTemplates] = useState<AdminQuestTemplate[]>([]);
  const [rewardItems, setRewardItems] = useState<MetaRewardItem[]>([]);
  const [adminCategories, setAdminCategories] = useState<AdminCategory[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [rewardPickerOpen, setRewardPickerOpen] = useState(false);
  const [conditionsPopupOpen, setConditionsPopupOpen] = useState(false);
  const [availabilityPopupOpen, setAvailabilityPopupOpen] = useState(false);
  const [coverFileInputRef] = useState<{ current: HTMLInputElement | null }>({ current: null });
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingDesc, setEditingDesc] = useState(false);
  const [result, setResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);

  // Navigation
  const [view, setView] = useState<ViewLevel>('home');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);

  // Category dialog
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [savingCategory, setSavingCategory] = useState(false);
  const [deletingCategoryId, setDeletingCategoryId] = useState<string | null>(null);
  const [editingCategory, setEditingCategory] = useState<AdminCategory | null>(null);
  const [categoryForm, setCategoryForm] = useState<CategoryFormState>({
    name: '',
    shortLabel: '',
    description: '',
    accent: '#6366f1',
    backgroundFrom: '#1e1b4b',
    backgroundTo: '#312e81',
  });

  useEffect(() => {
    void loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    setResult(null);
    try {
      const [templatesRes, metaRes, categoriesRes] = await Promise.all([
        fetch('/api/admin/quests', { credentials: 'include' }),
        fetch('/api/admin/quests/meta', { credentials: 'include' }),
        fetch('/api/admin/quests/categories', { credentials: 'include' }),
      ]);
      const templatesData = await templatesRes.json();
      const metaData = await metaRes.json();
      const categoriesData = await categoriesRes.json();
      if (!templatesRes.ok || !metaRes.ok) {
        throw new Error(templatesData.error || metaData.error || 'Could not load quest manager');
      }
      setTemplates(templatesData.templates ?? []);
      setRewardItems(metaData.rewardsCatalog ?? []);
      setAdminCategories(categoriesData.categories ?? []);
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
      categoryId: template.categoryId,
      rewards: template.rewards.map((reward) => ({ ...reward })),
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
      if (view === 'form') setView(form.placement === 'daily' ? 'daily' : 'category');
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
        ? { name: cat.name, shortLabel: cat.shortLabel, description: cat.description, accent: cat.accent, backgroundFrom: cat.backgroundFrom, backgroundTo: cat.backgroundTo }
        : { name: '', shortLabel: '', description: '', accent: '#6366f1', backgroundFrom: '#1e1b4b', backgroundTo: '#312e81' },
    );
    setConfirmAction(null);
    setCategoryDialogOpen(true);
  };

  const saveCategory = async () => {
    if (!confirmBeforeAction('save-category')) return;
    setSavingCategory(true);
    try {
      const res = await fetch('/api/admin/quests/categories', {
        method: editingCategory ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(editingCategory ? { id: editingCategory.id, ...categoryForm } : categoryForm),
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

  const adminCategoryMap = useMemo(
    () => Object.fromEntries(adminCategories.map((c) => [c.id, c])),
    [adminCategories],
  );

  const rewardCatalog = useMemo(
    () => Object.fromEntries(rewardItems.map((reward) => [reward.id, reward])),
    [rewardItems],
  );

  const previewLogic = useMemo(() => form.logic.map(buildPreviewLogicBlock), [form.logic]);



  const selectedCategory = selectedCategoryId ? adminCategoryMap[selectedCategoryId] : null;
  const formCategory = form.categoryId ? adminCategoryMap[form.categoryId] : null;
  const formPlacementLabel =
    form.placement === 'daily'
      ? 'Daily'
      : formCategory?.name ?? selectedCategory?.name ?? 'Focus';
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
  const categorySaveButtonLabel = savingCategory
    ? 'Saving...'
    : confirmAction === 'save-category'
      ? editingCategory
        ? 'Tap Again to Save'
        : 'Tap Again to Create'
      : editingCategory
        ? 'Save Changes'
        : 'Create Category';
  const dailyTemplates = templates.filter((t) => t.placement === 'daily');
  const categoryTemplates = templates.filter(
    (t) => t.placement === 'category' && t.categoryId === selectedCategoryId,
  );

  const navigateToQuestForm = (template?: AdminQuestTemplate, placementOverride?: QuestPlacement, categoryIdOverride?: string) => {
    if (template) {
      startEditing(template);
    } else {
      const newForm = emptyForm();
      newForm.placement = placementOverride ?? 'daily';
      newForm.categoryId = categoryIdOverride;
      setForm(newForm);
      setResult(null);
    }
    setView('form');
  };

  // ── Home view ────────────────────────────────────────────────────────────
  const renderHome = () => (
    <div className="grid gap-4 sm:grid-cols-2">
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
        <p className="mt-1 text-sm text-muted-foreground">Quests that appear for all users each day.</p>
        <p className="mt-4 text-3xl font-black text-foreground">{dailyTemplates.length}</p>
        <p className="text-xs text-muted-foreground">template{dailyTemplates.length !== 1 ? 's' : ''}</p>
      </button>

      <button
        onClick={() => setView('focus')}
        className="group rounded-2xl border border-border/40 bg-card/60 p-6 text-left transition hover:border-emerald-500/25 hover:bg-emerald-500/[0.04]"
      >
        <div className="flex items-center justify-between">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <Sparkles className="h-6 w-6" />
          </div>
          <ChevronRight className="h-5 w-5 text-muted-foreground/30 transition group-hover:translate-x-0.5 group-hover:text-muted-foreground" />
        </div>
        <p className="mt-5 text-lg font-black text-foreground">Focus Quests</p>
        <p className="mt-1 text-sm text-muted-foreground">Quests organized by focus category.</p>
        <p className="mt-4 text-3xl font-black text-foreground">{adminCategories.length}</p>
        <p className="text-xs text-muted-foreground">categor{adminCategories.length !== 1 ? 'ies' : 'y'}</p>
      </button>
    </div>
  );

  // ── Quest list (shared by Daily and Category views) ───────────────────────
  const renderQuestList = (questTemplates: AdminQuestTemplate[], placement: QuestPlacement, catId?: string) => (
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
              <span className="text-border">·</span>
              <span>{template.rewards.length} reward{template.rewards.length !== 1 ? 's' : ''}</span>
              {template.visibilityConditions.length > 0 && (
                <>
                  <span className="text-border">·</span>
                  <span>{template.visibilityConditions.length} condition{template.visibilityConditions.length !== 1 ? 's' : ''}</span>
                </>
              )}
            </div>
          </div>

          {/* Reward tiles */}
          {template.rewards.length > 0 && (
            <div className="hidden shrink-0 items-center gap-2 sm:flex">
              {template.rewards.slice(0, 3).map((reward, i) => (
                <RewardTile
                  key={`${reward.type}-${reward.itemId ?? i}`}
                  reward={reward}
                  rewardCatalog={rewardCatalog}
                  isPremium={false}
                  compact
                  className="shadow-none"
                />
              ))}
              {template.rewards.length > 3 && (
                <span className="text-sm font-black text-muted-foreground">+{template.rewards.length - 3}</span>
              )}
            </div>
          )}

          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/40 transition group-hover:text-muted-foreground" />
        </button>
      ))}
    </div>
  );

  // ── Daily view ────────────────────────────────────────────────────────────
  const renderDaily = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <Button size="sm" className="rounded-xl" onClick={() => navigateToQuestForm(undefined, 'daily')}>
          <Plus className="mr-1 h-4 w-4" />
          Add Quest
        </Button>
      </div>
      {renderQuestList(dailyTemplates, 'daily')}
    </div>
  );

  // ── Focus categories view ─────────────────────────────────────────────────
  const renderFocus = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <Button size="sm" className="rounded-xl" onClick={() => openCategoryDialog()}>
          <Plus className="mr-1 h-4 w-4" />
          Add Category
        </Button>
      </div>

      <div className="space-y-2">
        {adminCategories.map((cat) => {
          const questCount = templates.filter((t) => t.placement === 'category' && t.categoryId === cat.id).length;
          const deleteAction = `delete-category:${cat.id}` as const;
          const confirmingDelete = confirmAction === deleteAction;
          const deletingCategory = deletingCategoryId === cat.id;
          return (
            <div key={cat.id} className="group flex items-center gap-4 rounded-2xl border border-border/40 bg-card/60 px-4 py-3.5 transition hover:border-primary/20 hover:bg-primary/[0.03]">
              <div
                className="h-10 w-10 shrink-0 rounded-xl shadow-sm"
                style={{ background: `linear-gradient(135deg, ${cat.backgroundFrom}, ${cat.backgroundTo})` }}
              />
              <button
                onClick={() => { setSelectedCategoryId(cat.id); setView('category'); }}
                className="min-w-0 flex-1 text-left"
              >
                <p className="truncate text-sm font-bold text-foreground">{cat.name}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {questCount} quest{questCount !== 1 ? 's' : ''}{cat.description ? ` · ${cat.description}` : ''}
                </p>
              </button>
              <div className={cn(
                'flex shrink-0 items-center gap-1 opacity-0 transition group-hover:opacity-100',
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
  );

  // ── Category quests view ──────────────────────────────────────────────────
  const renderCategory = () => {
    if (!selectedCategory) return null;
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-end">
          <Button size="sm" className="rounded-xl" onClick={() => navigateToQuestForm(undefined, 'category', selectedCategoryId ?? undefined)}>
            <Plus className="mr-1 h-4 w-4" />
            Add Quest
          </Button>
        </div>
        {renderQuestList(categoryTemplates, 'category', selectedCategoryId ?? undefined)}
      </div>
    );
  };

  // ── Interactive preview-centered quest editor ─────────────────────────────
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
            <span className="rounded-full border border-white/20 bg-black/35 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-white backdrop-blur-md">
              {formPlacementLabel}
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

          {/* Rewards + add button */}
          <button
            type="button"
            onClick={() => setRewardPickerOpen(true)}
            className="absolute z-20 flex cursor-pointer flex-wrap items-center justify-end gap-2 bottom-4 right-4"
          >
            {form.rewards.map((reward, index) => (
              <RewardTile
                key={`${reward.type}-${reward.itemId ?? reward.amount ?? reward.minAmount ?? index}`}
                reward={reward}
                rewardCatalog={rewardCatalog}
                isPremium={false}
                compact
              />
            ))}
            <span className="flex h-9 w-9 items-center justify-center rounded-full border border-white/25 bg-black/40 text-white/80 backdrop-blur-sm transition hover:bg-black/60 hover:text-white">
              <Plus className="h-4 w-4" />
            </span>
          </button>

          {/* Title and description */}
          <div className="absolute inset-x-0 bottom-0 z-10 p-4 pr-[116px]">
            {editingTitle ? (
              <input
                autoFocus
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                onBlur={() => setEditingTitle(false)}
                onKeyDown={(e) => e.key === 'Enter' && setEditingTitle(false)}
                placeholder="Quest title..."
                className="w-full bg-transparent text-3xl font-black tracking-tight text-white placeholder-white/50 outline-none drop-shadow-[0_4px_18px_rgba(0,0,0,0.45)]"
              />
            ) : (
              <button type="button" onClick={() => setEditingTitle(true)} className="group/title flex w-full items-start gap-2 text-left">
                <h3 className="text-3xl font-black tracking-tight text-white drop-shadow-[0_4px_18px_rgba(0,0,0,0.45)]">
                  {form.name || <span className="text-white/50">Quest title...</span>}
                </h3>
                <Pencil className="mt-2 h-3.5 w-3.5 shrink-0 text-white/0 transition group-hover/title:text-white/70" />
              </button>
            )}
            {editingDesc ? (
              <input
                autoFocus
                value={form.description}
                onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                onBlur={() => setEditingDesc(false)}
                onKeyDown={(e) => e.key === 'Enter' && setEditingDesc(false)}
                placeholder="Quest description..."
                className="mt-1.5 w-full bg-transparent text-sm text-white/90 placeholder-white/40 outline-none drop-shadow-[0_2px_10px_rgba(0,0,0,0.45)]"
              />
            ) : (
              <button type="button" onClick={() => setEditingDesc(true)} className="group/desc mt-1.5 flex w-full items-start gap-2 text-left">
                <p className="text-sm text-white/90 drop-shadow-[0_2px_10px_rgba(0,0,0,0.45)]">
                  {form.description || <span className="text-white/40">Quest description...</span>}
                </p>
                <Pencil className="mt-0.5 h-3 w-3 shrink-0 text-white/0 transition group-hover/desc:text-white/70" />
              </button>
            )}
          </div>
        </div>

        {/* ── Conditions / progress blocks - clickable ── */}
        <div className="px-4 pt-4 pb-4 space-y-4">
          <button
            type="button"
            onClick={() => setConditionsPopupOpen(true)}
            className="group/cond w-full text-left"
          >
            <div className="space-y-3">
              {previewLogic.length > 0 ? (
                previewLogic.map((block) => (
                  <div key={block.id}>
                    <div className="flex items-start justify-between gap-3 sm:items-end">
                      <p className="text-xl font-black leading-tight text-foreground">
                        {formatQuestObjective(block)}
                      </p>
                      <div className="px-3 py-1 text-sm font-black border rounded-full border-border/50 bg-background/80 text-foreground">
                        0/{block.targetLabel ?? block.target}
                      </div>
                    </div>
                    <div className="h-3 mt-4 overflow-hidden rounded-full bg-muted/80 ring-1 ring-border/40">
                      <div className="h-full rounded-full bg-[linear-gradient(90deg,#7dd3fc_0%,#38bdf8_45%,#0ea5e9_100%)]" style={{ width: '0%' }} />
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-border/50 bg-background/60 px-4 py-5 text-center text-sm text-muted-foreground">
                  <Layers3 className="mx-auto mb-2 h-5 w-5" />
                  Click to add conditions
                </div>
              )}
            </div>
            <div className="mt-3 flex items-center justify-center gap-1.5 rounded-xl py-1.5 text-xs font-bold text-muted-foreground opacity-0 transition group-hover/cond:opacity-100">
              <Pencil className="h-3 w-3" />
              Edit conditions
            </div>
          </button>

          {/* Action buttons row */}
          <div className="flex items-center gap-2 pt-1">
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
        <Button size="sm" variant="outline" onClick={() => { resetForm(); setView(form.placement === 'daily' ? 'daily' : 'category'); }} disabled={saving} className="rounded-xl">Cancel</Button>
        <Button size="sm" onClick={saveQuest} disabled={saving} className="rounded-xl font-black">{questSaveButtonLabel}</Button>
      </div>

      {/* Popups */}
      <RewardPickerDialog
        open={rewardPickerOpen}
        onOpenChange={setRewardPickerOpen}
        rewards={form.rewards}
        rewardItems={rewardItems}
        rewardCatalog={rewardCatalog}
        onSave={(rewards) => setForm((prev) => ({ ...prev, rewards: normalizeRewardList(rewards) }))}
      />

      <ConditionsEditorDialog
        open={conditionsPopupOpen}
        onOpenChange={setConditionsPopupOpen}
        logic={form.logic}
        placement={form.placement}
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
    view === 'home' ? null :
    view === 'daily' ? 'Quest Manager' :
    view === 'focus' ? 'Quest Manager' :
    view === 'category' ? 'Focus Quests' :
    form.placement === 'daily' ? 'Daily Quests' : selectedCategory?.name ?? 'Focus Quests';

  const handleBack = () => {
    if (view === 'daily' || view === 'focus') setView('home');
    else if (view === 'category') setView('focus');
    else if (view === 'form') setView(form.placement === 'daily' ? 'daily' : 'category');
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
            {view === 'focus' && 'Focus Quests'}
            {view === 'category' && (selectedCategory?.name ?? 'Category')}
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
                {view === 'focus' && renderFocus()}
                {view === 'category' && renderCategory()}
              </>
            )}
          </>
        )}

        {/* Category dialog */}
        <Dialog open={categoryDialogOpen} onOpenChange={(open) => { setCategoryDialogOpen(open); if (!open) setConfirmAction(null); }}>
          <DialogContent className="max-w-lg rounded-[32px] p-0 overflow-hidden">
            <div className="border-b border-border/50 bg-card/95 px-6 py-5">
              <DialogHeader>
                <DialogTitle className="text-2xl font-black">
                  {editingCategory ? 'Edit Category' : 'New Category'}
                </DialogTitle>
                <DialogDescription>
                  {editingCategory ? 'Edit the display properties of this category.' : 'Add a new focus category for quest organization.'}
                </DialogDescription>
              </DialogHeader>
            </div>
            <div className="space-y-4 px-6 py-5">
              <label className="grid gap-2">
                <span className="text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">Name</span>
                <input value={categoryForm.name} onChange={(e) => setCategoryForm((p) => ({ ...p, name: e.target.value }))} placeholder="e.g. Sport" className="h-11 rounded-2xl border border-border bg-background px-4 text-sm outline-none focus:border-primary/30" />
              </label>
              <label className="grid gap-2">
                <span className="text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">Short Label</span>
                <input value={categoryForm.shortLabel} onChange={(e) => setCategoryForm((p) => ({ ...p, shortLabel: e.target.value }))} placeholder="e.g. Move" className="h-11 rounded-2xl border border-border bg-background px-4 text-sm outline-none focus:border-primary/30" />
              </label>
              <label className="grid gap-2">
                <span className="text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">Description</span>
                <textarea rows={3} value={categoryForm.description} onChange={(e) => setCategoryForm((p) => ({ ...p, description: e.target.value }))} placeholder="What this category is about." className="rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none focus:border-primary/30" />
              </label>
              <div className="grid grid-cols-3 gap-3">
                <label className="grid gap-2">
                  <span className="text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">Accent</span>
                  <div className="flex items-center gap-2 rounded-2xl border border-border bg-background px-3 py-2">
                    <input type="color" value={categoryForm.accent} onChange={(e) => setCategoryForm((p) => ({ ...p, accent: e.target.value }))} className="h-7 w-7 cursor-pointer rounded-lg border-0 bg-transparent p-0" />
                    <span className="text-xs text-muted-foreground">{categoryForm.accent}</span>
                  </div>
                </label>
                <label className="grid gap-2">
                  <span className="text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">From</span>
                  <div className="flex items-center gap-2 rounded-2xl border border-border bg-background px-3 py-2">
                    <input type="color" value={categoryForm.backgroundFrom} onChange={(e) => setCategoryForm((p) => ({ ...p, backgroundFrom: e.target.value }))} className="h-7 w-7 cursor-pointer rounded-lg border-0 bg-transparent p-0" />
                    <span className="text-xs text-muted-foreground">{categoryForm.backgroundFrom}</span>
                  </div>
                </label>
                <label className="grid gap-2">
                  <span className="text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">To</span>
                  <div className="flex items-center gap-2 rounded-2xl border border-border bg-background px-3 py-2">
                    <input type="color" value={categoryForm.backgroundTo} onChange={(e) => setCategoryForm((p) => ({ ...p, backgroundTo: e.target.value }))} className="h-7 w-7 cursor-pointer rounded-lg border-0 bg-transparent p-0" />
                    <span className="text-xs text-muted-foreground">{categoryForm.backgroundTo}</span>
                  </div>
                </label>
              </div>
              <div className="rounded-2xl border border-border/50 bg-background/70 p-3">
                <p className="mb-2 text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">Preview</p>
                <div className="h-12 rounded-xl" style={{ background: `linear-gradient(135deg, ${categoryForm.backgroundFrom}, ${categoryForm.backgroundTo})` }} />
              </div>
            </div>
            <DialogFooter className="border-t border-border/50 bg-card/95 px-6 py-4 sm:gap-3">
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

function ConditionsEditorDialog({
  open,
  onOpenChange,
  logic,
  placement,
  onUpdate,
  onAdd,
  onRemove,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  logic: QuestLogicBlock[];
  placement: QuestPlacement;
  onUpdate: (id: string, patch: Partial<QuestLogicBlock>) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
}) {
  const word = "text-[13px] font-medium text-foreground";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-lg !rounded-[28px] !p-0 overflow-hidden">
        <DialogHeader className="sr-only">
          <DialogTitle>Conditions</DialogTitle>
          <DialogDescription>What the user needs to do.</DialogDescription>
        </DialogHeader>

        <div className="px-5 pt-5 pb-1">
          <p className="text-base font-black text-foreground">What does the user need to do?</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Each goal reads as a sentence. The user must complete all of them.</p>
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-5 py-3 space-y-3">
          {logic.map((block, index) => (
            <div key={block.id} className="rounded-2xl border border-border/50 bg-muted/30 px-4 py-3.5">
              {/* Delete row */}
              <div className="mb-2.5 flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">Goal {index + 1}</span>
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
                    <option value="habit">habits</option>
                    <option value="any">tasks or habits</option>
                  </InlinePillSelect>

                  {block.tagMode !== 'ignore' && (
                    <span className={word}>
                      tagged with {block.tagMode === 'focus_category_tags' ? 'their focus tags' : 'a random tag'}
                    </span>
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

              {/* Bottom options row */}
              <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-border/30 pt-2.5">
                <button
                  type="button"
                  onClick={() => onUpdate(block.id, block.type === 'count' ? { type: 'focus_minutes', subject: 'task', action: undefined } : { type: 'count', subject: 'task', action: 'complete' })}
                  className="inline-flex items-center gap-1 rounded-full border border-border/50 bg-background px-2.5 py-1 text-[11px] font-bold text-muted-foreground transition hover:border-primary/30 hover:text-foreground"
                >
                  {block.type === 'count' ? 'Switch to focus time' : 'Switch to count'}
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
                    onClick={() => onUpdate(block.id, { tagMode: block.tagMode === 'ignore' ? (placement === 'category' ? 'focus_category_tags' : 'random_user_tag') : 'ignore' })}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-bold transition",
                      block.tagMode !== 'ignore' ? 'border-primary/25 bg-primary/8 text-primary hover:bg-primary/15' : 'border-border/50 bg-background text-muted-foreground hover:border-primary/30 hover:text-foreground',
                    )}
                  >
                    {block.tagMode !== 'ignore' ? 'Tag filter on' : 'Add tag filter'}
                  </button>
                )}
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={onAdd}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-border/50 py-3 text-xs font-bold text-muted-foreground transition hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
          >
            <Plus className="h-3.5 w-3.5" />
            Add another goal
          </button>
        </div>

        <div className="border-t border-border/40 px-5 py-3 text-right">
          <Button size="sm" className="rounded-xl font-bold" onClick={() => onOpenChange(false)}>Done</Button>
        </div>
      </DialogContent>
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
                      <option value="total_habits_count">total habits</option>
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
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rewards: QuestReward[];
  rewardItems: MetaRewardItem[];
  rewardCatalog: Record<string, QuestRewardCatalogItem>;
  onSave: (rewards: QuestReward[]) => void;
}) {
  const [activeTab, setActiveTab] = useState<RewardPickerTab>('flies');
  const [draft, setDraft] = useState<QuestReward[]>(() =>
    normalizeRewardList(rewards),
  );

  useEffect(() => {
    if (!open) return;
    setDraft(normalizeRewardList(rewards));
  }, [open, rewards]);

  const fliesReward = draft.find((reward) => reward.type === 'FLIES');
  const itemOptions = rewardItems.filter((item) => item.slot !== 'container');
  const boxOptions = rewardItems.filter((item) => item.slot === 'container');

  const toggleFliesReward = () => {
    setDraft((current) => {
      const existing = current.find((reward) => reward.type === 'FLIES');
      if (existing) {
        return current.filter((reward) => reward.type !== 'FLIES');
      }
      return [{ type: 'FLIES', amountMode: 'fixed', amount: 50 }, ...current];
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
      return [...current, { type, itemId, ...(type === 'BOX' ? { amount: 1, amountMode: 'fixed' as const } : {}) }];
    });
  };

  const handleSave = () => {
    onSave(normalizeRewardList(draft));
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
            {(['flies', 'item', 'box'] as const).map((tab) => (
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
                {tab === 'flies' ? 'Flies' : tab === 'item' ? 'Items' : 'Boxes'}
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
            Save Rewards
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

