'use client';

import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Check } from 'lucide-react';
import { BaseSheet } from '@/components/ui/BaseSheet';
import { cn } from '@/lib/utils';
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

const EDITOR_TEXT =
  'whitespace-pre-wrap break-words py-3 pl-12 pr-4 text-[16px] font-bold leading-[30px]';

type LineState = 'empty' | 'task' | 'long' | 'over' | 'sample';

function editorLines(value: string, sample: boolean) {
  let seen = 0;
  return value.split('\n').map((text) => {
    const task = cleanBulkTaskLine(text);
    let state: LineState = 'empty';
    if (task) {
      seen += 1;
      state = sample
        ? 'sample'
        : seen > MAX_BULK_TASKS
          ? 'over'
          : task.length > MAX_TASK_TEXT_LENGTH
            ? 'long'
            : 'task';
    }
    return { text, state };
  });
}

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-md border border-border/80 bg-card px-1.5 font-sans text-[11px] font-extrabold text-muted-foreground shadow-[0_1px_0_0_hsl(var(--border))]">
      {children}
    </kbd>
  );
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
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [appleKeys, setAppleKeys] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const mirrorRef = useRef<HTMLDivElement | null>(null);
  const { inset: keyboardInset, height: viewportHeight } = useKeyboardInset(open);

  useEffect(() => {
    setAppleKeys(/Mac|iPhone|iPad/.test(navigator.platform));
  }, []);

  useEffect(() => {
    if (!open) return;
    setText(initialTasks.join('\n'));
    setError('');
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
  const sample = text.length === 0;
  const lines = useMemo(
    () => editorLines(sample ? PLACEHOLDER : text, sample),
    [sample, text],
  );

  const longLines = useMemo(() => {
    const numbers: number[] = [];
    lines.forEach((line, index) => {
      if (line.state === 'long') numbers.push(index + 1);
    });
    return numbers;
  }, [lines]);

  const canAdd = tasks.length > 0 && longLines.length === 0 && !submitting;
  const roomLeft = MAX_BULK_TASKS - tasks.length;

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

  const syncMirror = () => {
    const el = textareaRef.current;
    const mirror = mirrorRef.current;
    if (el && mirror) mirror.style.transform = `translateY(${-el.scrollTop}px)`;
  };

  const problem = error
    ? error
    : longLines.length === 1
      ? `Line ${longLines[0]} is over ${MAX_TASK_TEXT_LENGTH} characters — shorten it`
      : longLines.length > 1
        ? `Lines ${longLines.slice(0, 4).join(', ')}${longLines.length > 4 ? '…' : ''} are over ${MAX_TASK_TEXT_LENGTH} characters`
        : null;

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
      className="h-[92dvh] max-h-[var(--bulk-panel-max)] bg-background sm:h-auto sm:max-h-[min(var(--bulk-panel-max),86vh,760px)] sm:max-w-[560px]"
    >
      {() => (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="bulk-add-title"
          className="flex min-h-0 flex-1 flex-col"
        >
          <header className="shrink-0 px-5 pb-3.5 pt-1 sm:px-7 sm:pb-4 sm:pt-7">
            <h2
              id="bulk-add-title"
              className="pr-10 text-[22px] font-black leading-tight tracking-tight text-foreground sm:text-[24px]"
            >
              Add multiple tasks
            </h2>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[14px] font-semibold text-muted-foreground">
              <span>One task per line</span>
              {summary.length > 0 && (
                <span
                  aria-hidden
                  className="h-[3px] w-[3px] rounded-full bg-muted-foreground/40"
                />
              )}
              {summary.map((item) => (
                <span
                  key={item}
                  className="inline-flex h-6 items-center rounded-full bg-primary/10 px-2.5 text-[12px] font-extrabold text-primary"
                >
                  {item}
                </span>
              ))}
            </div>
          </header>

          <div className="flex min-h-0 flex-1 flex-col px-4 sm:flex-none sm:px-7">
            {omittedCount > 0 && (
              <p className="mb-2.5 shrink-0 rounded-xl bg-amber-500/10 px-3.5 py-2.5 text-[13px] font-bold text-amber-700 dark:text-amber-300">
                Only {MAX_BULK_TASKS} fit in one go — {omittedCount}{' '}
                {omittedCount === 1 ? 'line was' : 'lines were'} left out.
              </p>
            )}

            <div className="relative min-h-0 flex-1 overflow-hidden rounded-[20px] border border-border/70 bg-card shadow-[0_1px_2px_rgba(15,23,42,0.05)] transition-[border-color,box-shadow] duration-200 focus-within:border-primary/50 focus-within:shadow-[0_0_0_4px_hsl(var(--primary)/0.12)] sm:min-h-[240px] sm:max-h-[min(48vh,450px)] sm:flex-none">
              <div
                ref={mirrorRef}
                aria-hidden
                className={cn(
                  EDITOR_TEXT,
                  'pointer-events-none select-none text-transparent',
                )}
              >
                {lines.map((line, index) => (
                  <div key={index} className="relative">
                    {line.state === 'long' && (
                      <span className="absolute inset-y-0 -left-2 -right-2 rounded-lg bg-rose-500/10" />
                    )}
                    {line.state !== 'empty' && (
                      <span
                        className={cn(
                          'absolute -left-8 top-[6px] h-[18px] w-[18px] rounded-full border-2 transition-colors duration-200',
                          line.state === 'task' &&
                            'border-primary/50 motion-safe:animate-in motion-safe:zoom-in-50',
                          line.state === 'sample' && 'border-muted-foreground/20',
                          line.state === 'long' && 'border-rose-500/70',
                          line.state === 'over' &&
                            'border-dashed border-muted-foreground/30',
                        )}
                      />
                    )}
                    {line.text || '​'}
                  </div>
                ))}
              </div>

              <textarea
                ref={textareaRef}
                value={text}
                onChange={(event) => setText(event.target.value)}
                onScroll={syncMirror}
                placeholder={PLACEHOLDER}
                aria-label="Tasks, one per line"
                disabled={submitting}
                spellCheck={false}
                autoComplete="off"
                className={cn(
                  EDITOR_TEXT,
                  'no-scrollbar absolute inset-0 h-full w-full resize-none overflow-y-auto bg-transparent text-foreground caret-primary outline-none placeholder:text-muted-foreground/35 disabled:opacity-60',
                )}
              />
            </div>
          </div>

          <footer className="shrink-0 px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-3.5 sm:flex sm:items-center sm:gap-4 sm:px-7 sm:pb-7 sm:pt-5">
            <p
              role={error ? 'alert' : undefined}
              className={cn(
                'min-w-0 text-[13px] font-bold sm:flex-1',
                problem
                  ? 'mb-3 text-center text-rose-500 sm:mb-0 sm:text-left'
                  : 'hidden text-muted-foreground sm:flex sm:items-center sm:gap-1.5',
              )}
            >
              {problem ??
                (roomLeft <= 10 ? (
                  `${roomLeft} more ${roomLeft === 1 ? 'fits' : 'fit'} in this batch`
                ) : (
                  <>
                    <Kbd>{appleKeys ? '⌘' : 'Ctrl'}</Kbd>
                    <Kbd>Enter</Kbd>
                    <span className="ml-0.5">to add</span>
                  </>
                ))}
            </p>
            <button
              id="bulk-add-confirm"
              type="button"
              onClick={submit}
              disabled={!canAdd}
              className="flex h-14 w-full shrink-0 items-center justify-center gap-2 rounded-[20px] bg-[#447d3f] px-6 text-[16px] font-black text-white shadow-[0_4px_0_0_#2c511a] transition-[transform,box-shadow,opacity] active:translate-y-1 active:shadow-none disabled:pointer-events-none disabled:opacity-40 disabled:shadow-none sm:h-12 sm:w-auto sm:min-w-[164px] sm:rounded-2xl sm:text-[15px]"
            >
              {submitting ? (
                'Adding…'
              ) : (
                <>
                  <Check className="h-5 w-5 stroke-[3]" />
                  {tasks.length > 0
                    ? `Add ${tasks.length} ${tasks.length === 1 ? 'task' : 'tasks'}`
                    : 'Add tasks'}
                </>
              )}
            </button>
          </footer>
        </div>
      )}
    </BaseSheet>
  );
}
