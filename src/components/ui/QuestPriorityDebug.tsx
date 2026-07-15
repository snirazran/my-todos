'use client';

import {
  PRIORITY_WEIGHTS,
  type PriorityInput,
  type PriorityResult,
} from '@/lib/quests/priority';
import { useUIStore } from '@/lib/uiStore';

export type PriorityDebugEntry = {
  label: string;
  input: PriorityInput;
  result: PriorityResult;
};

const REASON_EXPLANATIONS: Record<string, string> = {
  expiring: 'resets within 48h and not done',
  neglected: 'no progress for 3+ days',
  'almost-there': '60%+ done',
};

function formatPart(name: string, value: number, weight: number, detail?: string) {
  return `${name}${detail ? ` ${detail}` : ''} ${value.toFixed(2)}×${weight} = ${(
    value * weight
  ).toFixed(3)}`;
}

export function QuestPriorityDebug({
  title,
  entries,
  excluded,
  notes,
}: {
  title: string;
  entries: PriorityDebugEntry[];
  excluded?: { label: string; reason: string }[];
  notes?: string[];
}) {
  const isDebugMode = useUIStore((state) => state.isDebugMode);
  if (!isDebugMode) return null;
  if (entries.length === 0 && !excluded?.length) return null;

  return (
    <div className="rounded-2xl border border-dashed border-violet-500/50 bg-violet-500/[0.06] p-3 text-left font-mono text-[10px] leading-relaxed text-muted-foreground">
      <p className="mb-1.5 font-sans text-[10px] font-black uppercase tracking-[0.14em] text-violet-600 dark:text-violet-400">
        Priority debug · {title}
      </p>
      <ol className="space-y-1.5">
        {entries.map((entry, index) => {
          const { input, result } = entry;
          const remaining = Math.max(1, input.target) - input.progress;
          const flags: string[] = [];
          if (input.placement === 'onboarding') flags.push('pinned first: onboarding');
          if (input.needsFocusTags) flags.push('pushed last: needs a tag');
          return (
            <li
              key={`${entry.label}-${index}`}
              className="rounded-lg bg-background/60 px-2 py-1.5"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-bold text-foreground">
                  #{index + 1} {entry.label}
                </span>
                <span className="shrink-0 font-black text-violet-600 dark:text-violet-400">
                  {result.score.toFixed(3)}
                </span>
              </div>
              <div>
                {formatPart('progress', result.proximity, PRIORITY_WEIGHTS.proximity, `${input.progress}/${input.target}`)}
                {' · '}
                {formatPart('stale', result.staleness, PRIORITY_WEIGHTS.staleness, `${result.staleDays}d`)}
                {' · '}
                {formatPart(
                  'urgent',
                  result.urgency,
                  PRIORITY_WEIGHTS.urgency,
                  result.hoursUntilReset === null
                    ? 'no reset'
                    : `${Math.round(result.hoursUntilReset)}h left`,
                )}
              </div>
              <div>
                {result.reason
                  ? `reason: ${result.reason} (${REASON_EXPLANATIONS[result.reason]})`
                  : 'reason: none'}
                {` · tie-break: ${remaining} to go`}
                {flags.length > 0 ? ` · ${flags.join(' · ')}` : ''}
              </div>
            </li>
          );
        })}
      </ol>
      {excluded && excluded.length > 0 && (
        <div className="mt-1.5">
          {excluded.map((item, index) => (
            <div key={`${item.label}-${index}`}>
              excluded: {item.label} — {item.reason}
            </div>
          ))}
        </div>
      )}
      {notes && notes.length > 0 && (
        <div className="mt-1.5 border-t border-dashed border-violet-500/30 pt-1.5">
          {notes.map((note, index) => (
            <div key={index}>{note}</div>
          ))}
        </div>
      )}
    </div>
  );
}
