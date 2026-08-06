'use client';

import React, { useCallback, useRef, useState } from 'react';
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  ArrowDown,
  ArrowUp,
  Copy,
  Image as ImageIcon,
  Plus,
  Trash2,
  Type,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { FLY_PACKS } from '@/lib/flyPacks';
import { CampaignCanvasView } from '@/components/campaigns/CampaignCanvasView';
import type { RiveContents, RiveSignal } from '@/components/campaigns/CampaignRiveArt';
import {
  CTA_ACTIONS,
  CTA_LABELS,
  DISCOUNT_STYLES,
  DISCOUNT_STYLE_LABELS,
  ELEMENT_LABELS,
  ELEMENT_TYPES,
  TEXT_ALIGNMENTS,
  TIMER_EXPIRY,
  TIMER_EXPIRY_LABELS,
  TIMER_FORMATS,
  TIMER_FORMAT_LABELS,
  TIMER_MODES,
  TIMER_MODE_LABELS,
  createElement,
  isClickableElement,
  newElementId,
  type CampaignCanvas,
  type CampaignElement,
  type CampaignPayload,
  type CtaAction,
  type DiscountStyle,
  type ElementType,
  type TextAlignment,
  type TimerExpiry,
  type TimerFormat,
  type TimerMode,
} from '@/lib/campaigns/types';

/** How close to a guide (in % of the artwork) counts as a snap. */
const SNAP = 1.2;
/** Smallest an element may be dragged down to, in % of the artwork. */
const MIN_SIZE = 2;

type Guides = { v: boolean; h: boolean };

const round = (value: number) => Math.round(value * 10) / 10;

/**
 * The artwork is the popup, so nothing may leave it. Every drag, resize and
 * nudge goes through here, which is why an element can't be lost off-canvas.
 */
const clampBox = (box: { x: number; y: number; w: number; h: number }) => {
  const w = Math.min(100, Math.max(MIN_SIZE, box.w));
  const h = Math.min(100, Math.max(MIN_SIZE, box.h));
  return {
    x: round(Math.min(100 - w, Math.max(0, box.x))),
    y: round(Math.min(100 - h, Math.max(0, box.y))),
    w: round(w),
    h: round(h),
  };
};

/**
 * The artwork is the canvas: elements are dragged and resized directly on top
 * of the design, and every coordinate is stored as a percentage of the artwork
 * box so the whole composition scales as one piece on any screen.
 */
export function CampaignCanvasEditor({
  campaign,
  canvas,
  selectedId,
  onSelect,
  onChange,
  onSignal,
  onRiveContents,
  dark,
}: {
  campaign: CampaignPayload;
  canvas: CampaignCanvas;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onChange: (canvas: CampaignCanvas) => void;
  onSignal?: (signal: RiveSignal) => void;
  onRiveContents?: (contents: RiveContents) => void;
  dark: boolean;
}) {
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const [guides, setGuides] = useState<Guides>({ v: false, h: false });

  const patch = useCallback(
    (id: string, partial: Partial<CampaignElement>) =>
      onChange({
        ...canvas,
        elements: canvas.elements.map((item) =>
          item.id === id ? { ...item, ...partial } : item,
        ),
      }),
    [canvas, onChange],
  );

  const startDrag = (
    event: React.PointerEvent,
    element: CampaignElement,
    mode: 'move' | 'resize',
  ) => {
    event.preventDefault();
    event.stopPropagation();
    onSelect(element.id);

    const rect = surfaceRef.current?.getBoundingClientRect();
    if (!rect) return;

    const startX = event.clientX;
    const startY = event.clientY;
    const origin = { x: element.x, y: element.y, w: element.w, h: element.h };
    (event.target as HTMLElement).setPointerCapture?.(event.pointerId);

    const onMove = (move: PointerEvent) => {
      const dx = ((move.clientX - startX) / rect.width) * 100;
      const dy = ((move.clientY - startY) / rect.height) * 100;

      if (mode === 'resize') {
        // Growing stops at the artwork's edge rather than spilling past it.
        patch(
          element.id,
          clampBox({
            x: origin.x,
            y: origin.y,
            w: Math.min(100 - origin.x, origin.w + dx),
            h: Math.min(100 - origin.y, origin.h + dy),
          }),
        );
        return;
      }

      let x = origin.x + dx;
      let y = origin.y + dy;
      const next: Guides = { v: false, h: false };

      // Centre snapping is the whole reason a designer trusts this editor.
      if (Math.abs(x + origin.w / 2 - 50) < SNAP) {
        x = 50 - origin.w / 2;
        next.v = true;
      }
      if (Math.abs(y + origin.h / 2 - 50) < SNAP) {
        y = 50 - origin.h / 2;
        next.h = true;
      }
      if (Math.abs(x) < SNAP) x = 0;
      if (Math.abs(x + origin.w - 100) < SNAP) x = 100 - origin.w;
      if (Math.abs(y) < SNAP) y = 0;
      if (Math.abs(y + origin.h - 100) < SNAP) y = 100 - origin.h;

      setGuides(next);
      patch(element.id, clampBox({ x, y, w: origin.w, h: origin.h }));
    };

    const onUp = () => {
      setGuides({ v: false, h: false });
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (!selectedId) return;
    const element = canvas.elements.find((item) => item.id === selectedId);
    if (!element) return;
    const step = event.shiftKey ? 5 : 0.5;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    patch(
      element.id,
      clampBox({ x: element.x + move[0], y: element.y + move[1], w: element.w, h: element.h }),
    );
  };

  const selected = canvas.elements.find((item) => item.id === selectedId) ?? null;

  return (
    <div className="space-y-3">
      <div
        className={cn('rounded-2xl p-4', dark ? 'dark bg-neutral-900' : 'bg-neutral-800')}
        onKeyDown={onKeyDown}
        tabIndex={-1}
      >
        <div className="relative mx-auto flex justify-center">
          <div ref={surfaceRef} className="relative" style={{ width: canvas.maxWidth }}>
            <CampaignCanvasView
              campaign={campaign}
              editing
              selectedId={selectedId}
              onSelectElement={onSelect}
              onActivate={() => {}}
              onDismiss={() => {}}
              onSignal={onSignal}
              onRiveContents={onRiveContents}
            />

            {/* Handles sit above the artwork so a drag never lands on a button. */}
            <div className="absolute inset-0">
              {canvas.elements.map((element) => (
                <div
                  key={element.id}
                  onPointerDown={(event) => startDrag(event, element, 'move')}
                  className={cn(
                    'absolute',
                    selectedId === element.id
                      ? 'cursor-move outline outline-2 outline-primary'
                      : 'cursor-pointer hover:outline hover:outline-1 hover:outline-primary/60',
                  )}
                  style={{
                    left: `${element.x}%`,
                    top: `${element.y}%`,
                    width: `${element.w}%`,
                    height: `${element.h}%`,
                    transform: element.rotation
                      ? `rotate(${element.rotation}deg)`
                      : undefined,
                    zIndex: 500 + element.z,
                  }}
                >
                  {selectedId === element.id ? (
                    <span
                      onPointerDown={(event) => startDrag(event, element, 'resize')}
                      className="absolute -bottom-1.5 -right-1.5 h-3 w-3 cursor-nwse-resize rounded-sm bg-primary ring-2 ring-background"
                    />
                  ) : null}
                </div>
              ))}
            </div>

            {guides.v ? (
              <span className="pointer-events-none absolute inset-y-0 left-1/2 z-[999] w-px bg-sky-400" />
            ) : null}
            {guides.h ? (
              <span className="pointer-events-none absolute inset-x-0 top-1/2 z-[999] h-px bg-sky-400" />
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {ELEMENT_TYPES.map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => {
              const element = createElement(type, canvas.elements.length);
              onChange({ ...canvas, elements: [...canvas.elements, element] });
              onSelect(element.id);
            }}
            className="flex items-center gap-1 rounded-lg bg-muted px-2 py-1 text-[11px] font-black text-muted-foreground transition-colors hover:text-foreground"
          >
            <Plus className="h-3 w-3" />
            {ELEMENT_LABELS[type]}
          </button>
        ))}
      </div>

      <Layers
        canvas={canvas}
        selectedId={selectedId}
        onSelect={onSelect}
        onChange={onChange}
      />

      {selected ? (
        <Inspector
          element={selected}
          campaign={campaign}
          canvas={canvas}
          onPatch={(partial) => patch(selected.id, partial)}
        />
      ) : (
        <p className="rounded-xl bg-muted/50 p-3 text-[11px] font-medium text-muted-foreground">
          Pick an element on the artwork to style it. Drag to move, drag the corner to resize,
          arrow keys to nudge — hold shift for bigger steps.
        </p>
      )}
    </div>
  );
}

function Layers({
  canvas,
  selectedId,
  onSelect,
  onChange,
}: {
  canvas: CampaignCanvas;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onChange: (canvas: CampaignCanvas) => void;
}) {
  const ordered = [...canvas.elements].sort((a, b) => b.z - a.z);

  const setZ = (id: string, direction: 1 | -1) => {
    const element = canvas.elements.find((item) => item.id === id);
    if (!element) return;
    onChange({
      ...canvas,
      elements: canvas.elements.map((item) =>
        item.id === id ? { ...item, z: Math.max(0, item.z + direction) } : item,
      ),
    });
  };

  const duplicate = (id: string) => {
    const element = canvas.elements.find((item) => item.id === id);
    if (!element) return;
    const copy: CampaignElement = {
      ...element,
      id: newElementId(element.type),
      ...clampBox({ x: element.x + 3, y: element.y + 3, w: element.w, h: element.h }),
      z: canvas.elements.length,
      label: `${element.label} copy`,
    };
    onChange({ ...canvas, elements: [...canvas.elements, copy] });
    onSelect(copy.id);
  };

  const remove = (id: string) => {
    onChange({ ...canvas, elements: canvas.elements.filter((item) => item.id !== id) });
    if (selectedId === id) onSelect(null);
  };

  if (!ordered.length) {
    return (
      <p className="rounded-xl bg-muted/50 p-3 text-[11px] font-medium text-muted-foreground">
        Nothing on the artwork yet — add a button, some text or a timer above.
      </p>
    );
  }

  return (
    <div className="space-y-1">
      {ordered.map((element) => (
        <div
          key={element.id}
          className={cn(
            'flex items-center gap-2 rounded-lg bg-background px-2 py-1.5 ring-1 transition-colors',
            selectedId === element.id ? 'ring-2 ring-primary' : 'ring-border',
          )}
        >
          <button
            type="button"
            onClick={() => onSelect(element.id)}
            className="flex-1 truncate text-left text-xs font-black"
          >
            {element.label || ELEMENT_LABELS[element.type]}
            <span className="ml-1.5 font-bold text-muted-foreground">
              {ELEMENT_LABELS[element.type]}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setZ(element.id, 1)}
            aria-label="Bring forward"
            className="rounded-md p-1 text-muted-foreground hover:bg-muted"
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setZ(element.id, -1)}
            aria-label="Send back"
            className="rounded-md p-1 text-muted-foreground hover:bg-muted"
          >
            <ArrowDown className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => duplicate(element.id)}
            aria-label="Duplicate"
            className="rounded-md p-1 text-muted-foreground hover:bg-muted"
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => remove(element.id)}
            aria-label="Delete"
            className="rounded-md p-1 text-muted-foreground hover:bg-red-500/10 hover:text-red-500"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}

function Inspector({
  element,
  campaign,
  canvas,
  onPatch,
}: {
  element: CampaignElement;
  campaign: CampaignPayload;
  canvas: CampaignCanvas;
  onPatch: (partial: Partial<CampaignElement>) => void;
}) {
  const isText = ['text', 'button', 'text_button', 'discount', 'timer', 'close'].includes(
    element.type,
  );
  const isAsset = element.type === 'image' || element.type === 'rive';
  const assets = campaign.assets.filter((asset) =>
    element.type === 'rive' ? asset.kind === 'rive' : asset.kind === 'image',
  );

  return (
    <div className="space-y-3 rounded-xl bg-muted/50 p-3">
      <div className="flex items-center gap-2">
        <input
          value={element.label}
          onChange={(e) => onPatch({ label: e.target.value })}
          placeholder={ELEMENT_LABELS[element.type]}
          className="input flex-1"
        />
        <span className="rounded-md bg-background px-2 py-1 text-[10px] font-black uppercase tracking-wider text-muted-foreground">
          {ELEMENT_LABELS[element.type]}
        </span>
      </div>
      <p className="text-[10px] font-bold text-muted-foreground">
        Analytics id: <span className="font-mono">{element.id}</span>
      </p>

      <div className="grid grid-cols-4 gap-2">
        <Num
          label="X %"
          value={element.x}
          onChange={(x) => onPatch(clampBox({ ...element, x }))}
        />
        <Num
          label="Y %"
          value={element.y}
          onChange={(y) => onPatch(clampBox({ ...element, y }))}
        />
        <Num
          label="W %"
          value={element.w}
          onChange={(w) => onPatch(clampBox({ ...element, w }))}
        />
        <Num
          label="H %"
          value={element.h}
          onChange={(h) => onPatch(clampBox({ ...element, h }))}
        />
      </div>

      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => onPatch({ x: 50 - element.w / 2 })}
          className="flex items-center gap-1 rounded-lg bg-background px-2 py-1.5 text-[11px] font-black"
        >
          <AlignCenterVertical className="h-3.5 w-3.5" />
          Centre across
        </button>
        <button
          type="button"
          onClick={() => onPatch({ y: 50 - element.h / 2 })}
          className="flex items-center gap-1 rounded-lg bg-background px-2 py-1.5 text-[11px] font-black"
        >
          <AlignCenterHorizontal className="h-3.5 w-3.5" />
          Centre down
        </button>
        <Range
          label="Rotation"
          value={element.rotation}
          min={-45}
          max={45}
          suffix="°"
          onChange={(rotation) => onPatch({ rotation })}
        />
      </div>

      {isText ? (
        <>
          <label className="block">
            <span className="mb-0.5 block text-[11px] font-bold text-muted-foreground">
              {element.type === 'timer' ? 'Text — {time} is the countdown' : 'Text'}
            </span>
            <input
              value={element.text ?? ''}
              onChange={(e) => onPatch({ text: e.target.value })}
              className="input"
            />
          </label>

          <div className="grid grid-cols-2 gap-2">
            <Range
              label="Size"
              value={element.fontSize ?? 6}
              min={1}
              max={20}
              step={0.25}
              suffix="%"
              onChange={(fontSize) => onPatch({ fontSize })}
            />
            <Range
              label="Weight"
              value={element.fontWeight ?? 900}
              min={100}
              max={900}
              step={100}
              onChange={(fontWeight) => onPatch({ fontWeight })}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Color
              label="Text"
              value={element.color ?? '#ffffff'}
              onChange={(color) => onPatch({ color })}
            />
            <div className="flex rounded-lg bg-background p-0.5">
              {TEXT_ALIGNMENTS.map((align) => (
                <button
                  key={align}
                  type="button"
                  onClick={() => onPatch({ align: align as TextAlignment })}
                  className={cn(
                    'rounded-md px-2 py-1 text-[11px] font-black capitalize',
                    element.align === align
                      ? 'bg-foreground text-background'
                      : 'text-muted-foreground',
                  )}
                >
                  {align}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground">
              <input
                type="checkbox"
                checked={!!element.uppercase}
                onChange={(e) => onPatch({ uppercase: e.target.checked })}
              />
              Caps
            </label>
            <label className="flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground">
              <input
                type="checkbox"
                checked={!!element.italic}
                onChange={(e) => onPatch({ italic: e.target.checked })}
              />
              Italic
            </label>
          </div>
        </>
      ) : null}

      {element.type === 'discount' ? (
        <label className="block">
          <span className="mb-0.5 block text-[11px] font-bold text-muted-foreground">
            Decoration
          </span>
          <select
            value={element.discountStyle ?? 'strike'}
            onChange={(e) => onPatch({ discountStyle: e.target.value as DiscountStyle })}
            className="input"
          >
            {DISCOUNT_STYLES.map((style) => (
              <option key={style} value={style}>
                {DISCOUNT_STYLE_LABELS[style]}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {element.type === 'timer' ? (
        <div className="space-y-2">
          <label className="block">
            <span className="mb-0.5 block text-[11px] font-bold text-muted-foreground">
              Counts down
            </span>
            <select
              value={element.timerMode ?? 'per_user'}
              onChange={(e) => onPatch({ timerMode: e.target.value as TimerMode })}
              className="input"
            >
              {TIMER_MODES.map((mode) => (
                <option key={mode} value={mode}>
                  {TIMER_MODE_LABELS[mode]}
                </option>
              ))}
            </select>
          </label>
          {element.timerMode !== 'schedule' ? (
            <Num
              label="Minutes"
              value={element.timerMinutes ?? 30}
              onChange={(timerMinutes) => onPatch({ timerMinutes })}
            />
          ) : null}
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="mb-0.5 block text-[11px] font-bold text-muted-foreground">
                Format
              </span>
              <select
                value={element.timerFormat ?? 'hms'}
                onChange={(e) => onPatch({ timerFormat: e.target.value as TimerFormat })}
                className="input"
              >
                {TIMER_FORMATS.map((format) => (
                  <option key={format} value={format}>
                    {TIMER_FORMAT_LABELS[format]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-0.5 block text-[11px] font-bold text-muted-foreground">
                At zero
              </span>
              <select
                value={element.timerExpiry ?? 'freeze'}
                onChange={(e) => onPatch({ timerExpiry: e.target.value as TimerExpiry })}
                className="input"
              >
                {TIMER_EXPIRY.map((expiry) => (
                  <option key={expiry} value={expiry}>
                    {TIMER_EXPIRY_LABELS[expiry]}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      ) : null}

      {isClickableElement(element.type) ? (
        <div className="space-y-2">
          <label className="block">
            <span className="mb-0.5 block text-[11px] font-bold text-muted-foreground">
              Pressing it does
            </span>
            <select
              value={element.action ?? 'dismiss'}
              onChange={(e) => onPatch({ action: e.target.value as CtaAction })}
              className="input"
            >
              {CTA_ACTIONS.map((action) => (
                <option key={action} value={action}>
                  {CTA_LABELS[action]}
                </option>
              ))}
            </select>
          </label>
          {element.action === 'navigate' ? (
            <input
              value={element.path ?? ''}
              onChange={(e) => onPatch({ path: e.target.value })}
              placeholder="/wardrobe?tab=shop"
              className="input"
            />
          ) : null}
          {element.action === 'open_fly_shop' ? (
            <select
              value={element.packId ?? ''}
              onChange={(e) => onPatch({ packId: e.target.value })}
              className="input"
            >
              <option value="">No pack</option>
              {FLY_PACKS.map((pack) => (
                <option key={pack.id} value={pack.id}>
                  {pack.id} · {pack.amount.toLocaleString()} flies
                </option>
              ))}
            </select>
          ) : null}
        </div>
      ) : null}

      {isAsset ? (
        <div className="space-y-2">
          <label className="block">
            <span className="mb-0.5 block text-[11px] font-bold text-muted-foreground">
              File
            </span>
            <select
              value={element.assetId ?? ''}
              onChange={(e) => onPatch({ assetId: e.target.value })}
              className="input"
            >
              <option value="">Pick an upload…</option>
              {assets.map((asset) => (
                <option key={asset.id} value={asset.id}>
                  {asset.name || asset.id}
                </option>
              ))}
            </select>
          </label>
          {element.type === 'rive' ? (
            <div className="grid grid-cols-2 gap-2">
              <input
                value={element.artboard ?? ''}
                onChange={(e) => onPatch({ artboard: e.target.value })}
                placeholder="artboard"
                className="input"
              />
              <input
                value={element.stateMachine ?? ''}
                onChange={(e) => onPatch({ stateMachine: e.target.value })}
                placeholder="state machine"
                className="input"
              />
            </div>
          ) : null}
          <label className="block">
            <span className="mb-0.5 block text-[11px] font-bold text-muted-foreground">
              Fit
            </span>
            <select
              value={element.fit ?? 'contain'}
              onChange={(e) => onPatch({ fit: e.target.value as 'contain' | 'cover' })}
              className="input"
            >
              <option value="contain">Contain</option>
              <option value="cover">Cover</option>
            </select>
          </label>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Color
          label="Fill"
          value={element.background || 'transparent'}
          onChange={(background) => onPatch({ background })}
          allowClear
          onClear={() => onPatch({ background: '' })}
        />
        <Range
          label="Corner"
          value={element.radius ?? 0}
          min={0}
          max={30}
          step={0.5}
          suffix="%"
          onChange={(radius) => onPatch({ radius })}
        />
        <label className="flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground">
          <input
            type="checkbox"
            checked={!!element.shadow}
            onChange={(e) => onPatch({ shadow: e.target.checked })}
          />
          Shadow
        </label>
        <Range
          label="Opacity"
          value={element.opacity ?? 100}
          min={0}
          max={100}
          suffix="%"
          onChange={(opacity) => onPatch({ opacity })}
        />
      </div>

      <p className="text-[10px] font-medium text-muted-foreground">
        Tip: a button with no fill is an invisible tap target — draw the button in your artwork
        and put a transparent one on top of it. Canvas is {Math.round(canvas.maxWidth)}px wide at
        most, and text sizes are a percentage of that, so everything scales together.
      </p>
    </div>
  );
}

function Num({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className="mb-0.5 block text-[10px] font-black uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <input
        type="number"
        value={Math.round(value * 10) / 10}
        step={0.5}
        onChange={(e) => onChange(Number(e.target.value))}
        className="input"
      />
    </label>
  );
}

function Range({
  label,
  value,
  min,
  max,
  step = 1,
  suffix = '',
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block min-w-[7rem] flex-1">
      <span className="mb-0.5 flex items-center justify-between text-[11px] font-bold text-muted-foreground">
        {label}
        <span className="tabular-nums">
          {Math.round(value * 10) / 10}
          {suffix}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full"
      />
    </label>
  );
}

function Color({
  label,
  value,
  onChange,
  allowClear,
  onClear,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  allowClear?: boolean;
  onClear?: () => void;
}) {
  const safe = /^#[0-9a-f]{6}$/i.test(value) ? value : '#ffffff';
  return (
    <span className="flex items-center gap-1.5">
      <span className="text-[11px] font-bold text-muted-foreground">{label}</span>
      <input
        type="color"
        value={safe}
        onChange={(e) => onChange(e.target.value)}
        className="h-7 w-9 cursor-pointer rounded-md border border-border bg-transparent"
      />
      {allowClear ? (
        <button
          type="button"
          onClick={onClear}
          className="rounded-md bg-background px-1.5 py-1 text-[10px] font-black text-muted-foreground"
        >
          none
        </button>
      ) : null}
    </span>
  );
}

/** Uploads for the artwork itself and for anything placed on top of it. */
export function CanvasAssets({
  campaign,
  canUpload,
  canvas = true,
  onUpload,
  onDeleteAsset,
}: {
  campaign: CampaignPayload;
  canUpload: boolean;
  /** A banner has one small image and nothing to place on it. */
  canvas?: boolean;
  onUpload: (file: File, kind: 'background' | 'asset' | 'rive') => void;
  onDeleteAsset: (assetId: string) => void;
}) {
  const backgroundRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const riveRef = useRef<HTMLInputElement>(null);

  const pick = (
    ref: React.RefObject<HTMLInputElement | null>,
    kind: 'background' | 'asset' | 'rive',
  ) => (
    <input
      ref={ref}
      type="file"
      accept={kind === 'rive' ? '.riv' : 'image/*'}
      hidden
      onChange={(event) => {
        const file = event.target.files?.[0];
        if (file) onUpload(file, kind);
        event.target.value = '';
      }}
    />
  );

  return (
    <div className="space-y-3">
      {!canUpload ? (
        <p className="rounded-xl bg-amber-500/10 px-3 py-2 text-[11px] font-bold text-amber-600 dark:text-amber-400">
          Save the campaign first, then upload its artwork.
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        {campaign.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={campaign.imageUrl}
            alt=""
            className="h-16 w-16 rounded-xl bg-neutral-800 object-contain ring-1 ring-border"
          />
        ) : null}
        {pick(backgroundRef, 'background')}
        <button
          type="button"
          disabled={!canUpload}
          onClick={() => backgroundRef.current?.click()}
          className="h-10 rounded-xl bg-foreground px-4 text-sm font-black text-background disabled:opacity-50"
        >
          {campaign.imageUrl
            ? 'Replace artwork'
            : canvas
              ? 'Upload popup artwork'
              : 'Upload image'}
        </button>
      </div>

      {!canvas ? null : (
      <div className="flex gap-2">
        {pick(imageRef, 'asset')}
        {pick(riveRef, 'rive')}
        <button
          type="button"
          disabled={!canUpload}
          onClick={() => imageRef.current?.click()}
          className="flex h-9 items-center gap-1.5 rounded-lg bg-muted px-3 text-[11px] font-black disabled:opacity-50"
        >
          <ImageIcon className="h-3.5 w-3.5" />
          Add PNG
        </button>
        <button
          type="button"
          disabled={!canUpload}
          onClick={() => riveRef.current?.click()}
          className="flex h-9 items-center gap-1.5 rounded-lg bg-muted px-3 text-[11px] font-black disabled:opacity-50"
        >
          <Type className="h-3.5 w-3.5" />
          Add .riv
        </button>
      </div>
      )}

      {canvas && campaign.assets.length ? (
        <div className="space-y-1">
          {campaign.assets.map((asset) => (
            <div
              key={asset.id}
              className="flex items-center gap-2 rounded-lg bg-background px-2 py-1.5 ring-1 ring-border"
            >
              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-black uppercase text-muted-foreground">
                {asset.kind}
              </span>
              <span className="min-w-0 flex-1 truncate text-xs font-bold">{asset.name}</span>
              <button
                type="button"
                onClick={() => onDeleteAsset(asset.id)}
                aria-label="Delete asset"
                className="rounded-md p-1 text-muted-foreground hover:bg-red-500/10 hover:text-red-500"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
