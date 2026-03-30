'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  CheckCircle,
  ImagePlus,
  Layers3,
  Plus,
  ScrollText,
  Sparkles,
  Trash2,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type {
  MacroCategoryId,
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

type AdminQuestTemplate = {
  id: string;
  name: string;
  description: string;
  coverImageUrl?: string;
  placement: QuestPlacement;
  categoryId?: MacroCategoryId;
  rewards: QuestRewards;
  logic: QuestLogicBlock[];
  visibilityConditions: QuestVisibilityCondition[];
  isActive: boolean;
};

type MetaRewardItem = { id: string; name: string; slot: string; rarity: string };
type MetaCategory = { id: MacroCategoryId; name: string };

type FormState = {
  id?: string;
  name: string;
  description: string;
  coverImageUrl?: string;
  placement: QuestPlacement;
  categoryId?: MacroCategoryId;
  rewards: QuestRewards;
  logic: QuestLogicBlock[];
  visibilityConditions: QuestVisibilityCondition[];
  isActive: boolean;
};

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

export function AdminQuestManagerPage() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [templates, setTemplates] = useState<AdminQuestTemplate[]>([]);
  const [rewardItems, setRewardItems] = useState<MetaRewardItem[]>([]);
  const [categories, setCategories] = useState<MetaCategory[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [result, setResult] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  useEffect(() => {
    void loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    setResult(null);
    try {
      const [templatesRes, metaRes] = await Promise.all([
        fetch('/api/admin/quests', { credentials: 'include' }),
        fetch('/api/admin/quests/meta', { credentials: 'include' }),
      ]);
      const templatesData = await templatesRes.json();
      const metaData = await metaRes.json();
      if (!templatesRes.ok || !metaRes.ok) {
        throw new Error(templatesData.error || metaData.error || 'Could not load quest manager');
      }
      setTemplates(templatesData.templates ?? []);
      setRewardItems(metaData.rewardsCatalog ?? []);
      setCategories(metaData.categories ?? []);
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
  };

  const updateReward = (index: number, patch: Partial<QuestReward>) => {
    setForm((prev) => ({
      ...prev,
      rewards: prev.rewards.map((reward, rewardIndex) =>
        rewardIndex === index ? { ...reward, ...patch } : reward,
      ),
    }));
  };

  const updateLogic = (id: string, patch: Partial<QuestLogicBlock>) => {
    setForm((prev) => ({
      ...prev,
      logic: prev.logic.map((block) =>
        block.id === id ? { ...block, ...patch } : block,
      ),
    }));
  };

  const updateVisibilityCondition = (
    id: string,
    patch: Partial<QuestVisibilityCondition>,
  ) => {
    setForm((prev) => ({
      ...prev,
      visibilityConditions: prev.visibilityConditions.map((condition) =>
        condition.id === id ? { ...condition, ...patch } : condition,
      ),
    }));
  };

  const saveQuest = async () => {
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

  const categoryLabel = useMemo(
    () =>
      Object.fromEntries(categories.map((category) => [category.id, category.name])),
    [categories],
  );

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl px-4 py-6 md:px-8">
        <div className="mb-6 flex flex-col gap-4 rounded-[32px] border border-border/50 bg-card/80 p-6 shadow-sm lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Link href="/" className="inline-flex items-center gap-2 text-sm font-bold text-muted-foreground transition hover:text-foreground">
              <ArrowLeft className="h-4 w-4" />
              Back
            </Link>
            <div className="mt-4 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/12 text-emerald-600 dark:text-emerald-400">
                <ScrollText className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-3xl font-black tracking-tight text-foreground md:text-4xl">
                  Quest Manager
                </h1>
                <p className="mt-1 max-w-2xl text-sm text-muted-foreground md:text-base">
                  Create app-wide quest templates. Each template defines the rule, reward, and whether it shows in the daily list or a specific category.
                </p>
              </div>
            </div>
          </div>
          <div className="rounded-[24px] border border-border/50 bg-background/80 px-4 py-3 text-sm text-muted-foreground">
            Premium users automatically get double the base reward.
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="rounded-[28px] border border-border/50 bg-card/80 p-4 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-black text-foreground">Templates</p>
                <p className="text-xs text-muted-foreground">Reusable quests for all users.</p>
              </div>
              <Button size="sm" className="rounded-xl" onClick={resetForm}>
                <Plus className="mr-1 h-4 w-4" />
                New
              </Button>
            </div>

            <div className="space-y-2">
              {loading && <div className="rounded-2xl border border-border/50 bg-muted/30 p-4 text-sm text-muted-foreground">Loading quests...</div>}
              {!loading && templates.length === 0 && <div className="rounded-2xl border border-dashed border-border/50 bg-muted/20 p-4 text-sm text-muted-foreground">No quest templates yet.</div>}
              {templates.map((template) => (
                <button
                  key={template.id}
                  onClick={() => startEditing(template)}
                  className={cn(
                    'w-full rounded-2xl border p-4 text-left transition-all',
                    form.id === template.id
                      ? 'border-emerald-500/40 bg-emerald-500/10'
                      : 'border-border/50 bg-background/70 hover:bg-muted/30',
                  )}
                >
                  <p className="truncate text-sm font-black text-foreground">{template.name}</p>
                    <p className="mt-1 text-[11px] font-black uppercase tracking-[0.16em] text-muted-foreground">
                      {template.placement === 'daily'
                        ? 'Daily'
                        : (template.categoryId ? categoryLabel[template.categoryId] : null) ?? 'Category'}
                    </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="rounded-full border border-border/50 bg-card px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-muted-foreground">
                      {template.logic.length} blocks
                    </span>
                    <span className="rounded-full border border-border/50 bg-card px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-muted-foreground">
                      {template.rewards.length} rewards
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </aside>

          <main className="grid gap-6">
            {result && (
              <div className={cn(
                'flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm font-medium',
                result.type === 'success'
                  ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                  : 'border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-400',
              )}>
                {result.type === 'success' ? <CheckCircle className="h-4 w-4 shrink-0" /> : <XCircle className="h-4 w-4 shrink-0" />}
                {result.message}
              </div>
            )}

            <section className="rounded-[28px] border border-border/50 bg-card/80 p-6 shadow-sm">
              <div className="mb-5">
                <p className="text-lg font-black text-foreground">1. Basics</p>
                <p className="text-sm text-muted-foreground">Set where this quest appears and how it should look to the user.</p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-2">
                  <span className="text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">Quest Name</span>
                  <input value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} className="h-12 rounded-2xl border border-border bg-background px-4 text-sm outline-none transition focus:border-primary/30" />
                </label>
                <label className="grid gap-2">
                  <span className="text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">Placement</span>
                  <select value={form.placement} onChange={(event) => setForm((prev) => ({ ...prev, placement: event.target.value as QuestPlacement, categoryId: event.target.value === 'category' ? prev.categoryId : undefined }))} className="h-12 rounded-2xl border border-border bg-background px-4 text-sm outline-none transition focus:border-primary/30">
                    <option value="daily">Daily List</option>
                    <option value="category">Specific Category</option>
                  </select>
                </label>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_240px]">
                <label className="grid gap-2">
                  <span className="text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">Description</span>
                  <textarea rows={3} value={form.description} onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))} className="rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none transition focus:border-primary/30" />
                </label>
                <label className="grid gap-2">
                  <span className="text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">Cover Photo</span>
                  <div className="rounded-[24px] border border-dashed border-border bg-background/70 p-3">
                    {form.coverImageUrl ? <img src={form.coverImageUrl} alt="Quest cover" className="h-28 w-full rounded-2xl object-cover" /> : <div className="flex h-28 flex-col items-center justify-center gap-2 text-center text-muted-foreground"><ImagePlus className="h-6 w-6" /><span className="text-sm font-bold">Upload cover</span></div>}
                    <input type="file" accept="image/*" className="mt-3 block w-full text-xs" onChange={async (event) => {
                      const file = event.target.files?.[0];
                      if (!file) return;
                      const coverImageUrl = await readFileAsDataUrl(file);
                      setForm((prev) => ({ ...prev, coverImageUrl }));
                    }} />
                  </div>
                </label>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-4">
                {form.placement === 'category' && (
                  <label className="grid gap-2">
                    <span className="text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">Category</span>
                    <select value={form.categoryId ?? ''} onChange={(event) => setForm((prev) => ({ ...prev, categoryId: (event.target.value || undefined) as MacroCategoryId | undefined }))} className="h-12 min-w-[220px] rounded-2xl border border-border bg-background px-4 text-sm outline-none transition focus:border-primary/30">
                      <option value="">Select category</option>
                      {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                    </select>
                  </label>
                )}
                <label className="flex items-center gap-3 rounded-2xl border border-border/50 bg-background px-4 py-3">
                  <input type="checkbox" checked={form.isActive} onChange={(event) => setForm((prev) => ({ ...prev, isActive: event.target.checked }))} className="h-4 w-4" />
                  <span className="text-sm font-bold text-foreground">Active template</span>
                </label>
              </div>
            </section>

            <section className="rounded-[28px] border border-border/50 bg-card/80 p-6 shadow-sm">
              <div className="mb-5 flex items-center justify-between gap-3">
                <div>
                  <p className="text-lg font-black text-foreground">2. Conditions</p>
                  <p className="text-sm text-muted-foreground">Build the quest from generic rules that work for every user.</p>
                </div>
                <Button size="sm" variant="outline" className="rounded-xl" onClick={() => setForm((prev) => ({ ...prev, logic: [...prev.logic, createLogic()] }))}>
                  <Layers3 className="mr-1 h-4 w-4" />
                  Add Block
                </Button>
              </div>

              <div className="space-y-4">
                {form.logic.map((block, index) => (
                  <div key={block.id} className="rounded-[24px] border border-border/50 bg-background/70 p-4">
                    <div className="mb-4 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-black text-foreground">Block {index + 1}</p>
                        <p className="text-xs text-muted-foreground">Each block contributes to the total quest target.</p>
                      </div>
                      {form.logic.length > 1 && (
                        <button onClick={() => setForm((prev) => ({ ...prev, logic: prev.logic.filter((entry) => entry.id !== block.id) }))} className="flex h-9 w-9 items-center justify-center rounded-full text-red-500 hover:bg-red-500/10">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>

                    <div className="grid gap-4 md:grid-cols-4">
                      <label className="grid gap-2">
                        <span className="text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">Type</span>
                        <select value={block.type} onChange={(event) => updateLogic(block.id, { type: event.target.value as QuestLogicBlock['type'] })} className="h-11 rounded-2xl border border-border bg-background px-4 text-sm">
                          <option value="count">Count</option>
                          <option value="focus_minutes">Focus Minutes</option>
                        </select>
                      </label>
                      {block.type === 'count' && (
                        <label className="grid gap-2">
                          <span className="text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">Action</span>
                          <select value={block.action ?? 'complete'} onChange={(event) => updateLogic(block.id, { action: event.target.value as QuestLogicBlock['action'] })} className="h-11 rounded-2xl border border-border bg-background px-4 text-sm">
                            <option value="complete">Complete</option>
                            <option value="add">Add</option>
                          </select>
                        </label>
                      )}
                      <label className="grid gap-2">
                        <span className="text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">Subject</span>
                        <select value={block.subject} onChange={(event) => updateLogic(block.id, { subject: event.target.value as QuestSubject })} className="h-11 rounded-2xl border border-border bg-background px-4 text-sm">
                          <option value="task">Tasks</option>
                          <option value="habit">Habits</option>
                          <option value="any">Any</option>
                        </select>
                      </label>
                      <label className="grid gap-2">
                        <span className="text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">Tag Scope</span>
                        <select value={block.tagMode ?? 'ignore'} onChange={(event) => updateLogic(block.id, { tagMode: event.target.value as QuestLogicBlock['tagMode'] })} className="h-11 rounded-2xl border border-border bg-background px-4 text-sm">
                          <option value="ignore">Ignore Tags</option>
                          {form.placement === 'category' && (
                            <option value="focus_category_tags">Focus Category Tags</option>
                          )}
                          <option value="random_user_tag">Random User Tag</option>
                        </select>
                      </label>
                    </div>

                    <div className="mt-4 grid gap-4 md:grid-cols-3">
                      <label className="grid gap-2">
                        <span className="text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">Goal</span>
                        <select value={block.amountMode} onChange={(event) => updateLogic(block.id, event.target.value === 'random' ? { amountMode: 'random', amount: undefined, minAmount: block.minAmount ?? 1, maxAmount: block.maxAmount ?? Math.max(block.amount ?? 3, 1) } : { amountMode: 'fixed', amount: block.amount ?? block.maxAmount ?? 1, minAmount: undefined, maxAmount: undefined })} className="h-11 rounded-2xl border border-border bg-background px-4 text-sm">
                          <option value="fixed">Fixed</option>
                          <option value="random">Random Range</option>
                        </select>
                      </label>

                      {block.amountMode === 'fixed' ? (
                        <label className="grid gap-2">
                          <span className="text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">{block.type === 'focus_minutes' ? 'Minutes' : 'Target'}</span>
                          <input type="number" min={1} value={String(block.amount ?? 1)} onChange={(event) => updateLogic(block.id, { amount: Number(event.target.value) || 1 })} className="h-11 rounded-2xl border border-border bg-background px-4 text-sm" />
                        </label>
                      ) : (
                        <>
                          <label className="grid gap-2">
                            <span className="text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">Min</span>
                            <input type="number" min={1} value={String(block.minAmount ?? 1)} onChange={(event) => updateLogic(block.id, { minAmount: Number(event.target.value) || 1 })} className="h-11 rounded-2xl border border-border bg-background px-4 text-sm" />
                          </label>
                          <label className="grid gap-2">
                            <span className="text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">Max</span>
                            <input type="number" min={1} value={String(block.maxAmount ?? 3)} onChange={(event) => updateLogic(block.id, { maxAmount: Number(event.target.value) || 1 })} className="h-11 rounded-2xl border border-border bg-background px-4 text-sm" />
                          </label>
                        </>
                      )}
                    </div>

                    {block.tagMode === 'random_user_tag' && (
                      <div className="mt-4 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-muted-foreground">
                        This block will pick one of the user&apos;s tags when the quest is created and only count progress on that tag.
                      </div>
                    )}
                    {block.tagMode === 'focus_category_tags' && (
                      <div className="mt-4 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-muted-foreground">
                        This block will only count tasks or habits linked to the user&apos;s saved tags for this focus category.
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-[28px] border border-border/50 bg-card/80 p-6 shadow-sm">
              <div className="mb-5 flex items-center justify-between gap-3">
                <div>
                  <p className="text-lg font-black text-foreground">3. Show Rules</p>
                  <p className="text-sm text-muted-foreground">Control when this quest is allowed to appear for a user.</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-xl"
                  onClick={() =>
                    setForm((prev) => ({
                      ...prev,
                      visibilityConditions: [
                        ...prev.visibilityConditions,
                        createVisibilityCondition(),
                      ],
                    }))
                  }
                >
                  <Plus className="mr-1 h-4 w-4" />
                  Add Rule
                </Button>
              </div>

              {form.visibilityConditions.length === 0 ? (
                <div className="rounded-[24px] border border-dashed border-border/50 bg-background/60 p-4 text-sm text-muted-foreground">
                  No show rules yet. Leave this empty if the quest should be eligible for everyone.
                </div>
              ) : (
                <div className="space-y-3">
                  {form.visibilityConditions.map((condition, index) => (
                    <div
                      key={condition.id}
                      className="rounded-[24px] border border-border/50 bg-background/70 p-4"
                    >
                      <div className="mb-4 flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-black text-foreground">
                            Rule {index + 1}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            All rules must pass before the quest is shown.
                          </p>
                        </div>
                        <button
                          onClick={() =>
                            setForm((prev) => ({
                              ...prev,
                              visibilityConditions: prev.visibilityConditions.filter(
                                (entry) => entry.id !== condition.id,
                              ),
                            }))
                          }
                          className="flex h-9 w-9 items-center justify-center rounded-full text-red-500 hover:bg-red-500/10"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>

                      <div className="grid gap-4 md:grid-cols-3">
                        <label className="grid gap-2">
                          <span className="text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">Metric</span>
                          <select
                            value={condition.metric}
                            onChange={(event) =>
                              updateVisibilityCondition(condition.id, {
                                metric: event.target.value as QuestVisibilityMetric,
                              })
                            }
                            className="h-11 rounded-2xl border border-border bg-background px-4 text-sm"
                          >
                            {Object.entries(visibilityMetricLabel).map(([value, label]) => (
                              <option key={value} value={value}>
                                {label}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label className="grid gap-2">
                          <span className="text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">Operator</span>
                          <select
                            value={condition.operator}
                            onChange={(event) =>
                              updateVisibilityCondition(condition.id, {
                                operator: event.target.value as QuestVisibilityOperator,
                              })
                            }
                            className="h-11 rounded-2xl border border-border bg-background px-4 text-sm"
                          >
                            {Object.entries(visibilityOperatorLabel).map(([value, label]) => (
                              <option key={value} value={value}>
                                {label}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label className="grid gap-2">
                          <span className="text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">Value</span>
                          <input
                            type="number"
                            min={0}
                            value={String(condition.value)}
                            onChange={(event) =>
                              updateVisibilityCondition(condition.id, {
                                value: Number(event.target.value) || 0,
                              })
                            }
                            className="h-11 rounded-2xl border border-border bg-background px-4 text-sm"
                          />
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-[28px] border border-border/50 bg-card/80 p-6 shadow-sm">
              <div className="mb-5">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  <p className="text-lg font-black text-foreground">4. Rewards</p>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">Set the base reward once. Premium users will receive double automatically.</p>
              </div>

              <div className="space-y-3">
                {form.rewards.map((reward, index) => (
                  <div key={index} className="rounded-2xl border border-border/50 bg-background/70 p-4">
                    <div className="grid gap-3 xl:grid-cols-[160px_minmax(0,1fr)_40px]">
                      <label className="grid gap-2">
                        <span className="text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">Type</span>
                        <select
                          value={reward.type}
                          onChange={(event) => {
                            const nextType = event.target.value as QuestRewardType;
                            if (nextType === 'FLIES') {
                              updateReward(index, {
                                type: 'FLIES',
                                amountMode: 'fixed',
                                amount: reward.amount ?? 50,
                                minAmount: undefined,
                                maxAmount: undefined,
                                itemId: undefined,
                              });
                              return;
                            }

                            updateReward(index, {
                              type: nextType,
                              itemId: '',
                              amountMode: undefined,
                              amount: undefined,
                              minAmount: undefined,
                              maxAmount: undefined,
                            });
                          }}
                          className="h-11 rounded-2xl border border-border bg-background px-4 text-sm"
                        >
                          <option value="FLIES">Flies</option>
                          <option value="ITEM">Item</option>
                          <option value="BOX">Box</option>
                        </select>
                      </label>

                      {reward.type === 'FLIES' && (
                        <div className="grid gap-3 xl:grid-cols-3">
                          <label className="grid gap-2">
                            <span className="text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">Amount</span>
                            <select
                              value={reward.amountMode ?? 'fixed'}
                              onChange={(event) =>
                                updateReward(
                                  index,
                                  event.target.value === 'random'
                                    ? {
                                        amountMode: 'random',
                                        amount: undefined,
                                        minAmount: reward.minAmount ?? 25,
                                        maxAmount: reward.maxAmount ?? Math.max(reward.amount ?? 50, 25),
                                      }
                                    : {
                                        amountMode: 'fixed',
                                        amount: reward.amount ?? reward.maxAmount ?? 50,
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

                          {(reward.amountMode ?? 'fixed') === 'fixed' ? (
                            <label className="grid gap-2 xl:col-span-2">
                              <span className="text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">Flies Amount</span>
                              <input
                                type="number"
                                min={1}
                                value={String(reward.amount ?? 50)}
                                onChange={(event) =>
                                  updateReward(index, {
                                    amount: Number(event.target.value) || 1,
                                  })
                                }
                                className="h-11 rounded-2xl border border-border bg-background px-4 text-sm"
                              />
                            </label>
                          ) : (
                            <>
                              <label className="grid gap-2">
                                <span className="text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">Min Flies</span>
                                <input
                                  type="number"
                                  min={1}
                                  value={String(reward.minAmount ?? 25)}
                                  onChange={(event) =>
                                    updateReward(index, {
                                      minAmount: Number(event.target.value) || 1,
                                    })
                                  }
                                  className="h-11 rounded-2xl border border-border bg-background px-4 text-sm"
                                />
                              </label>
                              <label className="grid gap-2">
                                <span className="text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">Max Flies</span>
                                <input
                                  type="number"
                                  min={1}
                                  value={String(reward.maxAmount ?? 50)}
                                  onChange={(event) =>
                                    updateReward(index, {
                                      maxAmount: Number(event.target.value) || 1,
                                    })
                                  }
                                  className="h-11 rounded-2xl border border-border bg-background px-4 text-sm"
                                />
                              </label>
                            </>
                          )}
                        </div>
                      )}
                      {(reward.type === 'ITEM' || reward.type === 'BOX') && <label className="grid gap-2"><span className="text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">{reward.type === 'BOX' ? 'Box Item' : 'Item'}</span><select value={reward.itemId ?? ''} onChange={(event) => updateReward(index, { itemId: event.target.value })} className="h-11 rounded-2xl border border-border bg-background px-4 text-sm"><option value="">Select item</option>{rewardItems.filter((item) => reward.type === 'BOX' ? item.slot === 'container' : item.slot !== 'container').map((item) => <option key={item.id} value={item.id}>{item.name} ({item.rarity})</option>)}</select></label>}

                      <button onClick={() => setForm((prev) => ({ ...prev, rewards: prev.rewards.filter((_, rewardIndex) => rewardIndex !== index) }))} className="flex h-10 w-10 items-center justify-center self-end rounded-full text-red-500 hover:bg-red-500/10 xl:mt-6">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}

                <Button variant="outline" className="rounded-2xl" onClick={() => setForm((prev) => ({ ...prev, rewards: [...prev.rewards, createReward()] }))}>
                  <Plus className="mr-1 h-4 w-4" />
                  Add Reward
                </Button>
              </div>
            </section>

            <div className="sticky bottom-4 z-10 flex flex-col gap-3 rounded-[24px] border border-border/50 bg-background/95 p-4 shadow-lg backdrop-blur md:flex-row md:items-center md:justify-between">
              <div className="text-sm text-muted-foreground">
                {form.id ? 'Editing existing template.' : 'Creating a new template.'}
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                {form.id && <Button variant="destructive" onClick={deleteQuest} disabled={saving} className="rounded-2xl">Delete Quest</Button>}
                <Button variant="outline" onClick={resetForm} disabled={saving} className="rounded-2xl">Reset Form</Button>
                <Button onClick={saveQuest} disabled={saving} className="rounded-2xl font-black">{saving ? 'Saving...' : form.id ? 'Save Changes' : 'Create Quest'}</Button>
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
