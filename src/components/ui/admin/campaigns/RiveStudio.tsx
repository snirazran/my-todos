'use client';

import React, { useMemo, useState } from 'react';
import {
  Activity,
  Film,
  Layers as LayersIcon,
  Loader2,
  Plus,
  Repeat,
  Sliders,
  Upload,
  X,
  Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { RiveContents } from '@/components/campaigns/CampaignRiveArt';
import {
  DEFAULT_TICKER,
  RIVE_INPUT_TARGET_LABELS,
  type RiveInputInfo,
  type RiveInputValue,
  type RiveTicker,
} from '@/lib/campaigns/types';
import type { RiveLibraryFile } from './types';
import {
  ColorInput,
  Field,
  NumberInput,
  Select,
  TextInput,
  Toggle,
  inputClass,
} from './primitives';

type RiveSpec = {
  libraryPath?: string;
  assetId?: string;
  artboard?: string;
  stateMachine?: string;
  inputs?: RiveInputValue[];
  tickers?: RiveTicker[];
};

const TYPE_BADGE: Record<string, string> = {
  number: 'bg-sky-500/15 text-sky-600 dark:text-sky-400',
  boolean: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  string: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  enum: 'bg-violet-500/15 text-violet-600 dark:text-violet-400',
  color: 'bg-pink-500/15 text-pink-600 dark:text-pink-400',
  trigger: 'bg-orange-500/15 text-orange-600 dark:text-orange-400',
};

/**
 * Everything about one animation in one place: which file, which artboard,
 * what its values are set to, and which of its triggers should keep firing.
 *
 * The lists here are read off the loaded file rather than typed, which is the
 * difference between "add a frog that breathes and wears a hat" being two
 * clicks and being a guess at property names that fails silently.
 */
export function RiveStudio({
  spec,
  contents,
  library,
  assets,
  onPatch,
  onUploadRive,
  canUpload,
}: {
  spec: RiveSpec;
  /** What the preview learned by actually loading the file. */
  contents: RiveContents | null;
  library: RiveLibraryFile[];
  assets: { id: string; name: string }[];
  onPatch: (partial: RiveSpec) => void;
  onUploadRive?: () => void;
  canUpload?: boolean;
}) {
  const [tab, setTab] = useState<'source' | 'values' | 'loops'>('source');

  const artboards = contents?.artboards ?? [];
  const discovered = contents?.inputs ?? [];
  const board =
    artboards.find((item) => item.name === spec.artboard) ?? artboards[0] ?? null;

  const inputs = spec.inputs ?? [];
  const tickers = spec.tickers ?? [];

  const triggers = useMemo(
    () => discovered.filter((input) => input.type === 'trigger'),
    [discovered],
  );
  const settable = useMemo(
    () => discovered.filter((input) => input.type !== 'trigger'),
    [discovered],
  );

  const usingLibrary = !!spec.libraryPath;
  const hasSource = usingLibrary || !!spec.assetId;

  const addInput = (info: RiveInputInfo) => {
    if (inputs.some((input) => input.name === info.name && input.target === info.target)) return;
    onPatch({
      inputs: [
        ...inputs,
        {
          name: info.name,
          type: info.type,
          target: info.target,
          value:
            info.type === 'boolean'
              ? false
              : info.type === 'number'
                ? 0
                : info.type === 'enum'
                  ? (info.options?.[0] ?? '')
                  : info.type === 'color'
                    ? '#ffffff'
                    : '',
        },
      ],
    });
  };

  const addTicker = (info: RiveInputInfo) => {
    if (tickers.some((ticker) => ticker.name === info.name && ticker.target === info.target)) {
      return;
    }
    onPatch({
      tickers: [...tickers, { name: info.name, target: info.target, ...DEFAULT_TICKER }],
    });
  };

  return (
    <div className="space-y-3 rounded-xl bg-background p-3 ring-1 ring-border">
      <div className="flex items-center gap-2">
        <Zap className="h-4 w-4 text-violet-500" />
        <p className="flex-1 text-[12px] font-black uppercase tracking-wide text-muted-foreground">
          Animation
        </p>
        <div className="flex rounded-lg bg-muted p-0.5">
          {(
            [
              ['source', 'File', LayersIcon],
              ['values', 'Values', Sliders],
              ['loops', 'Loops', Repeat],
            ] as const
          ).map(([key, label, Icon]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={cn(
                'flex h-7 items-center gap-1 rounded-md px-2 text-[11px] font-black transition-colors',
                tab === key
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className="h-3 w-3" />
              {label}
              {key === 'values' && inputs.length ? ` ${inputs.length}` : ''}
              {key === 'loops' && tickers.length ? ` ${tickers.length}` : ''}
            </button>
          ))}
        </div>
      </div>

      {tab === 'source' ? (
        <div className="space-y-2.5">
          <Field
            label="Use an animation from the app"
            help="Files already shipping in public/. Reusing one means the popup animates the same frog the app does, and stays in step when the file is updated."
          >
            <Select
              value={spec.libraryPath ?? ''}
              options={[
                { value: '', label: assets.length ? 'Use an upload instead…' : 'Pick a file…' },
                ...library.map((file) => ({
                  value: file.path,
                  label: `${file.path}${file.sizeKb ? ` · ${file.sizeKb} KB` : ''}`,
                })),
              ]}
              onChange={(libraryPath) =>
                // Switching files invalidates every name picked from the old
                // one, so the settings are cleared rather than left dangling.
                onPatch({
                  libraryPath,
                  artboard: '',
                  stateMachine: '',
                  inputs: [],
                  tickers: [],
                })
              }
            />
          </Field>

          {!usingLibrary ? (
            <Field label="Or an uploaded .riv">
              <div className="flex gap-2">
                <Select
                  className="flex-1"
                  value={spec.assetId ?? ''}
                  options={[
                    { value: '', label: 'Pick an upload…' },
                    ...assets.map((asset) => ({ value: asset.id, label: asset.name || asset.id })),
                  ]}
                  onChange={(assetId) =>
                    onPatch({ assetId, artboard: '', stateMachine: '', inputs: [], tickers: [] })
                  }
                />
                {onUploadRive ? (
                  <button
                    type="button"
                    onClick={onUploadRive}
                    disabled={!canUpload}
                    className="flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-muted px-3 text-[11px] font-black disabled:opacity-50"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    Upload
                  </button>
                ) : null}
              </div>
            </Field>
          ) : null}

          {hasSource ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <Field label="Artboard">
                <Select
                  value={spec.artboard ?? ''}
                  options={[
                    { value: '', label: artboards.length ? 'Default' : 'Loading…' },
                    ...artboards.map((item) => ({ value: item.name, label: item.name })),
                  ]}
                  onChange={(artboard) => onPatch({ artboard, stateMachine: '' })}
                />
              </Field>
              <Field label="State machine">
                <Select
                  value={spec.stateMachine ?? ''}
                  options={[
                    { value: '', label: board?.stateMachines.length ? 'Default' : 'Loading…' },
                    ...(board?.stateMachines ?? []).map((name) => ({ value: name, label: name })),
                  ]}
                  onChange={(stateMachine) => onPatch({ stateMachine })}
                />
              </Field>
            </div>
          ) : (
            <p className="rounded-lg bg-muted/60 px-2.5 py-2 text-[11px] font-bold text-muted-foreground">
              Pick a file and the artboards, state machines, timelines and inputs below fill in
              from the file itself.
            </p>
          )}

          {hasSource && !contents ? (
            <p className="flex items-center gap-1.5 rounded-lg bg-muted/60 px-2.5 py-2 text-[11px] font-bold text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Loading the file in the preview to read what it offers…
            </p>
          ) : null}

          {board?.animations.length ? (
            <div className="rounded-lg bg-muted/60 p-2.5">
              <p className="mb-1 flex items-center gap-1.5 text-[11px] font-black text-muted-foreground">
                <Film className="h-3 w-3" />
                Timelines in {board.name}
              </p>
              <p className="text-[11px] font-semibold leading-relaxed text-muted-foreground">
                {board.animations.join(' · ')}
              </p>
              <p className="mt-1 text-[10px] font-medium leading-snug text-muted-foreground">
                A timeline plays from the state machine. To run one on a beat, put its trigger
                under Loops.
              </p>
            </div>
          ) : null}
        </div>
      ) : null}

      {tab === 'values' ? (
        <div className="space-y-2.5">
          <p className="text-[11px] font-medium leading-snug text-muted-foreground">
            Values written into the file when the popup opens — the hat, the skin, a mood. Set
            one and the preview updates as you drag.
          </p>

          {inputs.length ? (
            <div className="space-y-1.5">
              {inputs.map((input, index) => {
                const info = discovered.find(
                  (item) => item.name === input.name && item.target === input.target,
                );
                return (
                  <div key={`${input.target}:${input.name}`} className="rounded-lg bg-muted/60 p-2">
                    <div className="mb-1.5 flex items-center gap-1.5">
                      <span className="min-w-0 flex-1 truncate font-mono text-[11px] font-bold">
                        {input.name}
                      </span>
                      <span
                        className={cn(
                          'shrink-0 rounded px-1.5 py-0.5 text-[9px] font-black uppercase',
                          TYPE_BADGE[input.type] ?? 'bg-muted text-muted-foreground',
                        )}
                      >
                        {input.type}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          onPatch({ inputs: inputs.filter((_, i) => i !== index) })
                        }
                        aria-label="Remove"
                        className="rounded p-1 text-muted-foreground hover:bg-background hover:text-foreground"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                    <ValueControl
                      input={input}
                      options={info?.options}
                      onChange={(value) =>
                        onPatch({
                          inputs: inputs.map((item, i) =>
                            i === index ? { ...item, value } : item,
                          ),
                        })
                      }
                    />
                  </div>
                );
              })}
            </div>
          ) : null}

          <InputCatalog
            title={settable.length ? 'Add a value from the file' : ''}
            entries={settable}
            used={inputs.map((input) => `${input.target}:${input.name}`)}
            onPick={addInput}
            emptyHint={
              !hasSource
                ? 'Pick a file first.'
                : !contents
                  ? 'Reading the file in the preview…'
                  : 'This file exposes no data-bind properties or state machine inputs.'
            }
          />
        </div>
      ) : null}

      {tab === 'loops' ? (
        <div className="space-y-2.5">
          <p className="text-[11px] font-medium leading-snug text-muted-foreground">
            A trigger fired over and over, which is how a one-shot timeline becomes an idle — a
            breath every few seconds, a blink, a wing flap.
          </p>

          {tickers.length ? (
            <div className="space-y-1.5">
              {tickers.map((ticker, index) => {
                const patch = (partial: Partial<RiveTicker>) =>
                  onPatch({
                    tickers: tickers.map((item, i) =>
                      i === index ? { ...item, ...partial } : item,
                    ),
                  });
                return (
                  <div
                    key={`${ticker.target}:${ticker.name}`}
                    className="space-y-2 rounded-lg bg-muted/60 p-2"
                  >
                    <div className="flex items-center gap-1.5">
                      <Activity className="h-3.5 w-3.5 shrink-0 text-orange-500" />
                      <span className="min-w-0 flex-1 truncate font-mono text-[11px] font-bold">
                        {ticker.name}
                      </span>
                      <span className="shrink-0 rounded bg-background px-1.5 py-0.5 text-[9px] font-black uppercase text-muted-foreground">
                        {RIVE_INPUT_TARGET_LABELS[ticker.target]}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          onPatch({ tickers: tickers.filter((_, i) => i !== index) })
                        }
                        aria-label="Remove"
                        className="rounded p-1 text-muted-foreground hover:bg-background hover:text-foreground"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Field label="Every">
                        <NumberInput
                          value={ticker.everyMs}
                          min={250}
                          step={100}
                          suffix="ms"
                          onChange={(everyMs) => patch({ everyMs: everyMs ?? 3000 })}
                        />
                      </Field>
                      <Field
                        label="Vary by"
                        help="A random extra up to this, so the loop never reads as a metronome."
                      >
                        <NumberInput
                          value={ticker.jitterMs}
                          min={0}
                          step={50}
                          suffix="ms"
                          onChange={(jitterMs) => patch({ jitterMs: jitterMs ?? 0 })}
                        />
                      </Field>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <Toggle
                        checked={ticker.onShow}
                        label="Fire on open"
                        help="Otherwise the first beat waits a full interval, which reads as a stall."
                        onChange={(onShow) => patch({ onShow })}
                      />
                      <span className="text-[10px] font-bold tabular-nums text-muted-foreground">
                        ≈ {(60000 / Math.max(250, ticker.everyMs + ticker.jitterMs / 2)).toFixed(1)}
                        /min
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}

          <InputCatalog
            title={triggers.length ? 'Loop a trigger from the file' : ''}
            entries={triggers}
            used={tickers.map((ticker) => `${ticker.target}:${ticker.name}`)}
            onPick={addTicker}
            emptyHint={
              !hasSource
                ? 'Pick a file first.'
                : !contents
                  ? 'Reading the file in the preview…'
                  : 'No triggers in this file — add one below by name if you know it.'
            }
          />

          <ManualTrigger
            onAdd={(name, target) =>
              onPatch({ tickers: [...tickers, { name, target, ...DEFAULT_TICKER }] })
            }
          />
        </div>
      ) : null}
    </div>
  );
}

function ValueControl({
  input,
  options,
  onChange,
}: {
  input: RiveInputValue;
  options?: string[];
  onChange: (value: number | boolean | string) => void;
}) {
  if (input.type === 'boolean') {
    return (
      <Toggle
        checked={input.value === true || input.value === 'true'}
        label={input.value ? 'On' : 'Off'}
        onChange={onChange}
      />
    );
  }
  if (input.type === 'number') {
    return (
      <NumberInput
        value={Number(input.value) || 0}
        step={1}
        onChange={(value) => onChange(value ?? 0)}
      />
    );
  }
  if (input.type === 'color') {
    return (
      <ColorInput
        label="Colour"
        value={String(input.value ?? '#ffffff')}
        onChange={onChange}
      />
    );
  }
  if (input.type === 'enum' && options?.length) {
    return (
      <Select
        value={String(input.value ?? options[0])}
        options={options.map((option) => ({ value: option, label: option }))}
        onChange={onChange}
      />
    );
  }
  return (
    <TextInput value={String(input.value ?? '')} onChange={onChange} placeholder="value" />
  );
}

function InputCatalog({
  title,
  entries,
  used,
  onPick,
  emptyHint,
}: {
  title: string;
  entries: RiveInputInfo[];
  used: string[];
  onPick: (info: RiveInputInfo) => void;
  emptyHint: string;
}) {
  const [query, setQuery] = useState('');
  const filtered = entries.filter(
    (entry) => !query || entry.name.toLowerCase().includes(query.toLowerCase()),
  );

  if (!entries.length) {
    return (
      <p className="rounded-lg bg-muted/60 px-2.5 py-2 text-[11px] font-bold text-muted-foreground">
        {emptyHint}
      </p>
    );
  }

  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-black uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      {entries.length > 8 ? (
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter…"
          className={cn(inputClass, 'h-8 text-xs')}
        />
      ) : null}
      <div className="flex max-h-40 flex-wrap gap-1 overflow-y-auto">
        {filtered.map((entry) => {
          const key = `${entry.target}:${entry.name}`;
          const already = used.includes(key);
          return (
            <button
              key={key}
              type="button"
              disabled={already}
              onClick={() => onPick(entry)}
              title={`${entry.name} · ${RIVE_INPUT_TARGET_LABELS[entry.target]}`}
              className={cn(
                'flex items-center gap-1 rounded-lg px-2 py-1 font-mono text-[10px] font-bold transition-colors',
                already
                  ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                  : 'bg-muted text-muted-foreground hover:bg-muted-foreground/20 hover:text-foreground',
              )}
            >
              {already ? null : <Plus className="h-2.5 w-2.5" />}
              {entry.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Data-bind triggers can't always be enumerated, so a name can still be typed. */
function ManualTrigger({
  onAdd,
}: {
  onAdd: (name: string, target: RiveInputValue['target']) => void;
}) {
  const [name, setName] = useState('');
  const [target, setTarget] = useState<RiveInputValue['target']>('databind');

  return (
    <div className="flex gap-1.5">
      <input
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="or type a trigger name"
        className={cn(inputClass, 'h-9 flex-1 text-xs')}
      />
      <Select
        className="h-9 w-32 text-xs"
        value={target}
        options={[
          { value: 'databind' as const, label: 'Data bind' },
          { value: 'statemachine' as const, label: 'State machine' },
        ]}
        onChange={setTarget}
      />
      <button
        type="button"
        disabled={!name.trim()}
        onClick={() => {
          onAdd(name.trim(), target);
          setName('');
        }}
        className="h-9 shrink-0 rounded-xl bg-muted px-3 text-[11px] font-black disabled:opacity-50"
      >
        Add
      </button>
    </div>
  );
}
