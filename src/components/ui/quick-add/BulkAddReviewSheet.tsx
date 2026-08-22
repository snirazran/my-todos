'use client';

import {
  type CSSProperties,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Check, ListPlus, Plus, Trash2 } from 'lucide-react';
import { BaseSheet } from '@/components/ui/BaseSheet';
import { cn } from '@/lib/utils';
import { useKeyboardInset } from './useKeyboardInset';
import {
  MAX_BULK_TASKS,
  MAX_TASK_TEXT_LENGTH,
  parseBulkTasks,
} from './bulkTasks';

type DraftTask = { id: number; text: string };

type Props = {
  open: boolean;
  initialTasks: string[];
  initialOmittedCount?: number;
  summary: string[];
  submitting: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (tasks: string[]) => Promise<void>;
};

let nextDraftId = 1;

function createDraft(text = ''): DraftTask {
  return { id: nextDraftId++, text };
}

export default function BulkAddReviewSheet({
  open,
  initialTasks,
  initialOmittedCount = 0,
  summary,
  submitting,
  onOpenChange,
  onConfirm,
}: Props) {
  const [drafts, setDrafts] = useState<DraftTask[]>([]);
  const [omittedCount, setOmittedCount] = useState(0);
  const [error, setError] = useState('');
  const inputRefs = useRef(new Map<number, HTMLInputElement>());
  const { inset: keyboardInset, height: viewportHeight } = useKeyboardInset(open);

  useEffect(() => {
    if (!open) return;
    setDrafts(
      (initialTasks.length > 0 ? initialTasks : ['']).map((text) =>
        createDraft(text),
      ),
    );
    setOmittedCount(initialOmittedCount);
    setError('');
  }, [initialOmittedCount, initialTasks, open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onOpenChange(false);
      }
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        document.getElementById('bulk-add-confirm')?.click();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onOpenChange, open]);

  const validTasks = useMemo(
    () => drafts.map((draft) => draft.text.trim()).filter(Boolean),
    [drafts],
  );
  const tooLongCount = useMemo(
    () => drafts.filter((draft) => draft.text.trim().length > MAX_TASK_TEXT_LENGTH).length,
    [drafts],
  );
  const canAdd = validTasks.length > 0 && tooLongCount === 0 && !submitting;

  const updateDraft = useCallback((id: number, text: string) => {
    setDrafts((current) =>
      current.map((draft) => (draft.id === id ? { ...draft, text } : draft)),
    );
  }, []);

  const removeDraft = useCallback((id: number) => {
    setDrafts((current) => {
      const next = current.filter((draft) => draft.id !== id);
      return next.length > 0 ? next : [createDraft()];
    });
  }, []);

  const addDraft = useCallback(() => {
    if (drafts.length >= MAX_BULK_TASKS) return;
    const draft = createDraft();
    setDrafts([...drafts, draft]);
    window.setTimeout(() => inputRefs.current.get(draft.id)?.focus(), 30);
  }, [drafts]);

  const pasteIntoDraft = useCallback(
    (id: number, event: React.ClipboardEvent<HTMLInputElement>) => {
      const pasted = event.clipboardData.getData('text/plain');
      const parsed = parseBulkTasks(pasted, MAX_BULK_TASKS);
      if (parsed.tasks.length < 2) return;
      event.preventDefault();
      const position = drafts.findIndex((draft) => draft.id === id);
      if (position < 0) return;
      const available = MAX_BULK_TASKS - drafts.length + 1;
      const inserted = parsed.tasks
        .slice(0, available)
        .map((text) => createDraft(text));
      const next = drafts.slice();
      next.splice(position, 1, ...inserted);
      const newlyOmitted = Math.max(0, parsed.tasks.length - inserted.length);
      setDrafts(next);
      setOmittedCount(
        (count) => count + parsed.omittedCount + newlyOmitted,
      );
    },
    [drafts],
  );

  const submit = async () => {
    if (!canAdd) return;
    setError('');
    try {
      await onConfirm(validTasks);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'Could not add these tasks. Please try again.',
      );
    }
  };

  const panelMaxHeight = viewportHeight
    ? `${Math.max(320, viewportHeight - 12)}px`
    : '100dvh';

  return (
    <BaseSheet
      open={open}
      onOpenChange={onOpenChange}
      zIndex={1600}
      bottomInset={keyboardInset}
      closeAriaLabel="Close bulk add"
      panelStyle={
        { '--bulk-panel-max': panelMaxHeight } as CSSProperties
      }
      className="h-[92dvh] max-h-[var(--bulk-panel-max)] bg-background sm:h-auto sm:max-h-[min(var(--bulk-panel-max),82vh,780px)] sm:max-w-2xl"
    >
      {({ bindScroll }) => (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="bulk-add-title"
          className="flex min-h-0 flex-1 flex-col"
        >
          <header className="shrink-0 px-5 pb-4 pt-1 sm:px-7 sm:pb-5 sm:pt-7">
            <div className="flex items-center gap-3 pr-10">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-primary/12 text-primary">
                <ListPlus className="h-5 w-5" strokeWidth={2.6} />
              </span>
              <div className="min-w-0">
                <h2
                  id="bulk-add-title"
                  className="text-xl font-black tracking-tight text-foreground sm:text-2xl"
                >
                  Add multiple tasks
                </h2>
                <p className="mt-0.5 text-sm font-semibold text-muted-foreground">
                  Paste a list or edit each task before adding.
                </p>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {summary.map((item) => (
                <span
                  key={item}
                  className="inline-flex h-8 items-center rounded-full bg-primary/10 px-3 text-xs font-extrabold text-primary"
                >
                  {item}
                </span>
              ))}
            </div>
          </header>

          <div
            ref={bindScroll}
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain border-y border-border/60 bg-muted/25 px-4 py-4 sm:px-7"
          >
            {omittedCount > 0 ? (
              <div className="mb-3 rounded-2xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm font-bold text-amber-700 dark:text-amber-300">
                The limit is {MAX_BULK_TASKS} tasks per batch. {omittedCount}{' '}
                {omittedCount === 1 ? 'extra line was' : 'extra lines were'} not included.
              </div>
            ) : null}

            <div className="flex flex-col gap-2.5">
              {drafts.map((draft, index) => {
                const tooLong = draft.text.trim().length > MAX_TASK_TEXT_LENGTH;
                return (
                  <div
                    key={draft.id}
                    className={cn(
                      'flex items-center gap-2 rounded-2xl border bg-card p-2 shadow-sm transition-colors',
                      tooLong ? 'border-rose-500/60' : 'border-border/70 focus-within:border-primary/50',
                    )}
                  >
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-muted text-xs font-black tabular-nums text-muted-foreground">
                      {index + 1}
                    </span>
                    <div className="relative min-w-0 flex-1">
                      <input
                        ref={(element) => {
                          if (element) inputRefs.current.set(draft.id, element);
                          else inputRefs.current.delete(draft.id);
                        }}
                        value={draft.text}
                        onChange={(event) => updateDraft(draft.id, event.target.value)}
                        onPaste={(event) => pasteIntoDraft(draft.id, event)}
                        placeholder="Task name"
                        disabled={submitting}
                        autoComplete="off"
                        spellCheck={false}
                        className="h-11 w-full bg-transparent px-1 pr-12 text-[16px] font-bold text-foreground outline-none placeholder:text-muted-foreground/45"
                      />
                      {draft.text.length >= 90 ? (
                        <span
                          className={cn(
                            'pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 text-[10px] font-black tabular-nums',
                            tooLong ? 'text-rose-500' : 'text-muted-foreground',
                          )}
                        >
                          {draft.text.length}/{MAX_TASK_TEXT_LENGTH}
                        </span>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      aria-label={`Remove task ${index + 1}`}
                      onClick={() => removeDraft(draft.id)}
                      disabled={submitting}
                      className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-muted-foreground transition-colors active:scale-95 hover:bg-rose-500/10 hover:text-rose-500 disabled:opacity-50"
                    >
                      <Trash2 className="h-4.5 w-4.5" />
                    </button>
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              onClick={addDraft}
              disabled={drafts.length >= MAX_BULK_TASKS || submitting}
              className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-primary/35 bg-primary/5 text-sm font-black text-primary transition-colors active:scale-[0.99] hover:bg-primary/10 disabled:opacity-40"
            >
              <Plus className="h-4 w-4 stroke-[3]" />
              Add another task
            </button>
          </div>

          <footer className="shrink-0 px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-4 sm:px-7 sm:pb-7">
            {tooLongCount > 0 ? (
              <p className="mb-3 text-center text-xs font-bold text-rose-500">
                Shorten {tooLongCount === 1 ? 'the highlighted task' : `${tooLongCount} highlighted tasks`} to {MAX_TASK_TEXT_LENGTH} characters.
              </p>
            ) : null}
            {error ? (
              <p role="alert" className="mb-3 text-center text-sm font-bold text-rose-500">
                {error}
              </p>
            ) : null}
            <button
              id="bulk-add-confirm"
              type="button"
              onClick={submit}
              disabled={!canAdd}
              className="flex h-14 w-full items-center justify-center gap-2 rounded-[22px] bg-[#4f9149] text-[16px] font-black text-white shadow-[0_4px_0_0_#34631f] transition-all active:translate-y-1 active:shadow-none disabled:pointer-events-none disabled:opacity-50 disabled:grayscale sm:h-16 sm:text-[17px]"
            >
              {submitting ? (
                'Adding tasks…'
              ) : (
                <>
                  <Check className="h-5 w-5 stroke-[3]" />
                  Add {validTasks.length || ''}{' '}
                  {validTasks.length === 1 ? 'task' : 'tasks'}
                </>
              )}
            </button>
            <p className="mt-2 hidden text-center text-[11px] font-bold text-muted-foreground sm:block">
              Ctrl/⌘ + Enter to add
            </p>
          </footer>
        </div>
      )}
    </BaseSheet>
  );
}
