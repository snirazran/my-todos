'use client';

import {
  type CSSProperties,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Check, ListPlus } from 'lucide-react';
import { BaseSheet } from '@/components/ui/BaseSheet';
import { useKeyboardInset } from './useKeyboardInset';
import {
  MAX_BULK_TASKS,
  MAX_TASK_TEXT_LENGTH,
  cleanBulkTaskLine,
  parseBulkTasks,
} from './bulkTasks';

type Props = {
  open: boolean;
  initialTasks: string[];
  initialOmittedCount?: number;
  summary: string[];
  submitting: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (tasks: string[]) => Promise<void>;
};

const PLACEHOLDER = ['Buy milk', 'Call the dentist', 'Renew passport'].join(
  '\n',
);

export default function BulkAddReviewSheet({
  open,
  initialTasks,
  initialOmittedCount = 0,
  summary,
  submitting,
  onOpenChange,
  onConfirm,
}: Props) {
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const { inset: keyboardInset, height: viewportHeight } = useKeyboardInset(open);

  useEffect(() => {
    if (!open) return;
    setText(initialTasks.join('\n'));
    setError('');
    // Land the caret at the end so a pasted list is ready to be extended.
    window.setTimeout(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }, 60);
  }, [initialTasks, open]);

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

  const parsed = useMemo(() => parseBulkTasks(text, MAX_BULK_TASKS), [text]);
  const tasks = parsed.tasks;
  const omittedCount = parsed.omittedCount + initialOmittedCount;

  // Reported by line number rather than highlighted: in a single textarea there
  // is no row to outline, so the message has to say which line to look at.
  const longLines = useMemo(() => {
    const numbers: number[] = [];
    text.split(/\r?\n/).forEach((line, index) => {
      if (cleanBulkTaskLine(line).length > MAX_TASK_TEXT_LENGTH) {
        numbers.push(index + 1);
      }
    });
    return numbers;
  }, [text]);

  const canAdd = tasks.length > 0 && longLines.length === 0 && !submitting;

  const submit = async () => {
    if (!canAdd) return;
    setError('');
    try {
      await onConfirm(tasks);
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
      panelStyle={{ '--bulk-panel-max': panelMaxHeight } as CSSProperties}
      className="h-[92dvh] max-h-[var(--bulk-panel-max)] bg-background sm:h-auto sm:max-h-[min(var(--bulk-panel-max),82vh,780px)] sm:max-w-2xl"
    >
      {() => (
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
                  One task per line
                </p>
              </div>
            </div>

            {summary.length > 0 && (
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
            )}
          </header>

          {/* One textarea rather than a row per task: Enter starts the next
              task, paste splits itself, and deleting is just deleting a line —
              no button press per task, and no empty sheet to stare at. */}
          <div className="flex min-h-0 flex-1 flex-col border-y border-border/60 bg-muted/25 px-4 py-4 sm:px-7">
            {omittedCount > 0 && (
              <div className="mb-3 shrink-0 rounded-2xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm font-bold text-amber-700 dark:text-amber-300">
                The limit is {MAX_BULK_TASKS} tasks per batch. {omittedCount}{' '}
                {omittedCount === 1 ? 'extra line was' : 'extra lines were'} not
                included.
              </div>
            )}

            <textarea
              ref={textareaRef}
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder={PLACEHOLDER}
              disabled={submitting}
              spellCheck={false}
              autoComplete="off"
              className="min-h-0 w-full flex-1 resize-none overflow-y-auto rounded-2xl border border-border/70 bg-card px-4 py-3.5 text-[16px] font-bold leading-[30px] text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground/40 focus:border-primary/50 disabled:opacity-60"
            />

            <div className="mt-2.5 flex shrink-0 items-center justify-between gap-3">
              <p className="text-xs font-bold text-muted-foreground">
                {tasks.length === 0
                  ? 'Type or paste your list'
                  : `${tasks.length} ${tasks.length === 1 ? 'task' : 'tasks'}`}
              </p>
              {tasks.length > 0 && (
                <p className="text-xs font-bold tabular-nums text-muted-foreground/70">
                  {MAX_BULK_TASKS - tasks.length} left
                </p>
              )}
            </div>
          </div>

          <footer className="shrink-0 px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-4 sm:px-7 sm:pb-7">
            {longLines.length > 0 && (
              <p className="mb-3 text-center text-xs font-bold text-rose-500">
                {longLines.length === 1
                  ? `Line ${longLines[0]} is over ${MAX_TASK_TEXT_LENGTH} characters — shorten it.`
                  : `Lines ${longLines.slice(0, 4).join(', ')}${longLines.length > 4 ? '…' : ''} are over ${MAX_TASK_TEXT_LENGTH} characters — shorten them.`}
              </p>
            )}
            {error && (
              <p
                role="alert"
                className="mb-3 text-center text-sm font-bold text-rose-500"
              >
                {error}
              </p>
            )}
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
                  Add {tasks.length || ''}{' '}
                  {tasks.length === 1 ? 'task' : 'tasks'}
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
