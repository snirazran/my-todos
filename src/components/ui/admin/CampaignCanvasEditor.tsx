'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignStartHorizontal,
  ChevronsDown,
  ChevronsUp,
  Copy,
  Eye,
  EyeOff,
  Grid3x3,
  Image as ImageIcon,
  Lock,
  Maximize2,
  Trash2,
  Type,
  Unlock,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { CampaignCanvasView } from '@/components/campaigns/CampaignCanvasView';
import {
  riveSourceKey,
  type RiveContents,
  type RiveSignal,
} from '@/components/campaigns/CampaignRiveArt';
import { ActionPicker, type ActionEnv } from './campaigns/ActionPicker';
import { RiveStudio } from './campaigns/RiveStudio';
import type { RiveLibraryFile } from './campaigns/types';
import {
  ColorInput,
  Field,
  NumberInput,
  Select,
  SegmentedControl,
  Slider,
  TextInput,
  Toggle,
} from './campaigns/primitives';
import {
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
/** Below this, a tap target is smaller than a fingertip on a real phone. */
const TAP_TARGET_MIN = { w: 8, h: 5 };

type Handle = 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w';
type Guide = { axis: 'v' | 'h'; at: number };

const round = (value: number) => Math.round(value * 10) / 10;

const ELEMENT_ICONS: Partial<Record<ElementType, string>> = {
  text: 'T',
  image: '▣',
  rive: '✦',
  button: '⬭',
  text_button: 'a',
  discount: '%',
  timer: '⏱',
  close: '✕',
};

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
 * Every line a dragged element can snap to: the artwork's own edges and
 * centre, plus the edges and centres of everything already placed. Aligning to
 * a sibling is what makes a stack of buttons look designed rather than nudged.
 */
function snapTargets(elements: CampaignElement[], movingId: string) {
  const v = [0, 50, 100];
  const h = [0, 50, 100];
  for (const element of elements) {
    if (element.id === movingId) continue;
    v.push(element.x, element.x + element.w / 2, element.x + element.w);
    h.push(element.y, element.y + element.h / 2, element.y + element.h);
  }
  return { v, h };
}

function snapAxis(
  candidates: number[],
  edges: { lead: number; centre: number; trail: number },
) {
  for (const target of candidates) {
    if (Math.abs(edges.lead - target) < SNAP) return { delta: target - edges.lead, at: target };
    if (Math.abs(edges.centre - target) < SNAP) {
      return { delta: target - edges.centre, at: target };
    }
    if (Math.abs(edges.trail - target) < SNAP) return { delta: target - edges.trail, at: target };
  }
  return null;
}

export function CampaignCanvasEditor({
  campaign,
  canvas,
  selectedId,
  onSelect,
  onChange,
  onSignal,
  onRiveContents,
  riveContents,
  library,
  actionEnv,
  onUploadRive,
  canUpload,
  dark,
}: {
  campaign: CampaignPayload;
  canvas: CampaignCanvas;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onChange: (canvas: CampaignCanvas) => void;
  onSignal?: (signal: RiveSignal) => void;
  onRiveContents?: (contents: RiveContents) => void;
  riveContents: Record<string, RiveContents>;
  library: RiveLibraryFile[];
  actionEnv: ActionEnv;
  onUploadRive?: () => void;
  canUpload?: boolean;
  dark: boolean;
}) {
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [guides, setGuides] = useState<Guide[]>([]);
  const [grid, setGrid] = useState(false);
  const [hidden, setHidden] = useState<string[]>([]);
  const [locked, setLocked] = useState<string[]>([]);
  const [zoom, setZoom] = useState(1);

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

  // The stage scales the artwork down to whatever room the editor column has,
  // so a 720px popup is still fully visible on a laptop.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const measure = () => {
      const available = stage.clientWidth - 32;
      setZoom(Math.min(1, Math.max(0.35, available / canvas.maxWidth)));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [canvas.maxWidth]);

  const startDrag = (
    event: React.PointerEvent,
    element: CampaignElement,
    mode: 'move' | Handle,
  ) => {
    if (locked.includes(element.id)) return;
    event.preventDefault();
    event.stopPropagation();
    onSelect(element.id);

    const rect = surfaceRef.current?.getBoundingClientRect();
    if (!rect) return;

    const startX = event.clientX;
    const startY = event.clientY;
    const origin = { x: element.x, y: element.y, w: element.w, h: element.h };
    const targets = snapTargets(canvas.elements, element.id);
    (event.target as HTMLElement).setPointerCapture?.(event.pointerId);

    const onMove = (move: PointerEvent) => {
      const dx = ((move.clientX - startX) / rect.width) * 100;
      const dy = ((move.clientY - startY) / rect.height) * 100;
      // Holding shift constrains a drag to one axis, the way every design tool
      // does — the difference between nudging a row and wrecking its alignment.
      const lockX = move.shiftKey && Math.abs(dx) < Math.abs(dy);
      const lockY = move.shiftKey && Math.abs(dy) <= Math.abs(dx);

      if (mode !== 'move') {
        let { x, y, w, h } = origin;
        const mx = lockX ? 0 : dx;
        const my = lockY ? 0 : dy;
        if (mode.includes('e')) w = origin.w + mx;
        if (mode.includes('s')) h = origin.h + my;
        if (mode.includes('w')) {
          w = origin.w - mx;
          x = origin.x + mx;
        }
        if (mode.includes('n')) {
          h = origin.h - my;
          y = origin.y + my;
        }
        setGuides([]);
        patch(element.id, clampBox({ x, y, w, h }));
        return;
      }

      let x = origin.x + (lockX ? 0 : dx);
      let y = origin.y + (lockY ? 0 : dy);
      const next: Guide[] = [];

      const vSnap = snapAxis(targets.v, {
        lead: x,
        centre: x + origin.w / 2,
        trail: x + origin.w,
      });
      if (vSnap) {
        x += vSnap.delta;
        next.push({ axis: 'v', at: vSnap.at });
      }

      const hSnap = snapAxis(targets.h, {
        lead: y,
        centre: y + origin.h / 2,
        trail: y + origin.h,
      });
      if (hSnap) {
        y += hSnap.delta;
        next.push({ axis: 'h', at: hSnap.at });
      }

      setGuides(next);
      patch(element.id, clampBox({ x, y, w: origin.w, h: origin.h }));
    };

    const onUp = () => {
      setGuides([]);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const selected = canvas.elements.find((item) => item.id === selectedId) ?? null;

  const duplicate = useCallback(
    (id: string) => {
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
    },
    [canvas, onChange, onSelect],
  );

  const remove = useCallback(
    (id: string) => {
      onChange({ ...canvas, elements: canvas.elements.filter((item) => item.id !== id) });
      if (selectedId === id) onSelect(null);
    },
    [canvas, onChange, onSelect, selectedId],
  );

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (!selected || locked.includes(selected.id)) return;
    // A keystroke aimed at a text field is never a canvas command.
    const target = event.target as HTMLElement;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable) return;

    if (event.key === 'Escape') {
      onSelect(null);
      return;
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      remove(selected.id);
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'd') {
      event.preventDefault();
      duplicate(selected.id);
      return;
    }

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
      selected.id,
      clampBox({
        x: selected.x + move[0],
        y: selected.y + move[1],
        w: selected.w,
        h: selected.h,
      }),
    );
  };

  const visibleCampaign = useMemo(
    () => ({
      ...campaign,
      canvas: {
        ...canvas,
        elements: canvas.elements.filter((element) => !hidden.includes(element.id)),
      },
    }),
    [campaign, canvas, hidden],
  );

  return (
    <div className="space-y-3">
      <div
        ref={stageRef}
        className={cn(
          'relative overflow-hidden rounded-2xl p-4 outline-none',
          dark ? 'dark bg-neutral-900' : 'bg-neutral-800',
        )}
        onKeyDown={onKeyDown}
        onPointerDown={(event) => {
          if (event.target === event.currentTarget) onSelect(null);
        }}
        tabIndex={0}
        role="application"
        aria-label="Popup canvas"
      >
        <div
          className="relative mx-auto"
          style={{ width: canvas.maxWidth * zoom, height: (canvas.maxWidth / (canvas.aspect || 0.75)) * zoom }}
        >
          <div
            ref={surfaceRef}
            className="relative origin-top-left"
            style={{ width: canvas.maxWidth, transform: `scale(${zoom})` }}
          >
            <CampaignCanvasView
              campaign={visibleCampaign}
              editing
              selectedId={selectedId}
              onSelectElement={onSelect}
              onActivate={() => {}}
              onDismiss={() => {}}
              onSignal={onSignal}
              onRiveContents={onRiveContents}
            />

            {grid ? (
              <div
                className="pointer-events-none absolute inset-0 z-[600]"
                style={{
                  backgroundImage:
                    'linear-gradient(to right, rgba(255,255,255,0.14) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.14) 1px, transparent 1px)',
                  backgroundSize: '10% 10%',
                }}
              />
            ) : null}

            {/* Handles sit above the artwork so a drag never lands on a button. */}
            <div className="absolute inset-0">
              {canvas.elements.map((element) => {
                const isLocked = locked.includes(element.id);
                const isHidden = hidden.includes(element.id);
                const isSelected = selectedId === element.id;
                const tiny =
                  isClickableElement(element.type) &&
                  (element.w < TAP_TARGET_MIN.w || element.h < TAP_TARGET_MIN.h);
                return (
                  <div
                    key={element.id}
                    onPointerDown={(event) => startDrag(event, element, 'move')}
                    className={cn(
                      'absolute',
                      isLocked
                        ? 'cursor-not-allowed'
                        : isSelected
                          ? 'cursor-move outline outline-2 outline-primary'
                          : 'cursor-pointer hover:outline hover:outline-1 hover:outline-primary/60',
                      isHidden && 'opacity-30 outline-dashed',
                      tiny && !isSelected && 'outline outline-1 outline-dashed outline-amber-400',
                    )}
                    style={{
                      left: `${element.x}%`,
                      top: `${element.y}%`,
                      width: `${element.w}%`,
                      height: `${element.h}%`,
                      transform: element.rotation
                        ? `rotate(${element.rotation}deg)`
                        : undefined,
                      zIndex: 700 + element.z,
                    }}
                  >
                    {isSelected && !isLocked
                      ? (['nw', 'ne', 'sw', 'se', 'n', 's', 'e', 'w'] as Handle[]).map(
                          (handle) => (
                            <span
                              key={handle}
                              onPointerDown={(event) => startDrag(event, element, handle)}
                              style={handleStyle(handle, zoom)}
                              className="absolute rounded-sm bg-primary ring-2 ring-background"
                            />
                          ),
                        )
                      : null}
                  </div>
                );
              })}
            </div>

            {guides.map((guide, index) =>
              guide.axis === 'v' ? (
                <span
                  key={`v-${guide.at}-${index}`}
                  className="pointer-events-none absolute inset-y-0 z-[999] w-px bg-sky-400"
                  style={{ left: `${guide.at}%` }}
                />
              ) : (
                <span
                  key={`h-${guide.at}-${index}`}
                  className="pointer-events-none absolute inset-x-0 z-[999] h-px bg-sky-400"
                  style={{ top: `${guide.at}%` }}
                />
              ),
            )}
          </div>
        </div>

        <div className="absolute right-3 top-3 flex items-center gap-1">
          <button
            type="button"
            onClick={() => setGrid((value) => !value)}
            title="Toggle grid"
            aria-pressed={grid}
            className={cn(
              'flex h-7 w-7 items-center justify-center rounded-lg text-white/70 transition-colors hover:bg-white/10',
              grid && 'bg-white/20 text-white',
            )}
          >
            <Grid3x3 className="h-3.5 w-3.5" />
          </button>
          <span className="flex h-7 items-center gap-1 rounded-lg bg-black/40 px-2 text-[10px] font-black tabular-nums text-white/70">
            <Maximize2 className="h-3 w-3" />
            {Math.round(zoom * 100)}%
          </span>
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
            className="flex items-center gap-1.5 rounded-lg bg-muted px-2.5 py-1.5 text-[11px] font-black text-muted-foreground transition-colors hover:bg-muted-foreground/15 hover:text-foreground"
          >
            <span className="text-[13px] leading-none">{ELEMENT_ICONS[type] ?? '+'}</span>
            {ELEMENT_LABELS[type]}
          </button>
        ))}
      </div>

      <Layers
        canvas={canvas}
        selectedId={selectedId}
        hidden={hidden}
        locked={locked}
        onSelect={onSelect}
        onChange={onChange}
        onDuplicate={duplicate}
        onRemove={remove}
        onToggleHidden={(id) =>
          setHidden((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]))
        }
        onToggleLocked={(id) =>
          setLocked((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]))
        }
      />

      {selected ? (
        <Inspector
          element={selected}
          campaign={campaign}
          canvas={canvas}
          riveContents={riveContents}
          library={library}
          actionEnv={actionEnv}
          onUploadRive={onUploadRive}
          canUpload={canUpload}
          onPatch={(partial) => patch(selected.id, partial)}
        />
      ) : (
        <p className="rounded-xl bg-muted/50 p-3 text-[11px] font-medium leading-relaxed text-muted-foreground">
          Pick an element to style it. Drag to move, drag a handle to resize, hold shift to keep
          it on one axis, arrow keys to nudge (shift for bigger steps).{' '}
          <span className="font-black">⌫</span> deletes,{' '}
          <span className="font-black">⌘D</span> duplicates.
        </p>
      )}
    </div>
  );
}

function handleStyle(handle: Handle, zoom: number): React.CSSProperties {
  // Handles keep their on-screen size whatever the stage is scaled to.
  const size = 10 / zoom;
  const offset = -size / 2;
  const base: React.CSSProperties = {
    width: size,
    height: size,
    cursor: `${handle}-resize`,
  };
  const mid = `calc(50% - ${size / 2}px)`;
  switch (handle) {
    case 'nw':
      return { ...base, left: offset, top: offset, cursor: 'nwse-resize' };
    case 'ne':
      return { ...base, right: offset, top: offset, cursor: 'nesw-resize' };
    case 'sw':
      return { ...base, left: offset, bottom: offset, cursor: 'nesw-resize' };
    case 'se':
      return { ...base, right: offset, bottom: offset, cursor: 'nwse-resize' };
    case 'n':
      return { ...base, left: mid, top: offset, cursor: 'ns-resize' };
    case 's':
      return { ...base, left: mid, bottom: offset, cursor: 'ns-resize' };
    case 'e':
      return { ...base, right: offset, top: mid, cursor: 'ew-resize' };
    default:
      return { ...base, left: offset, top: mid, cursor: 'ew-resize' };
  }
}

function Layers({
  canvas,
  selectedId,
  hidden,
  locked,
  onSelect,
  onChange,
  onDuplicate,
  onRemove,
  onToggleHidden,
  onToggleLocked,
}: {
  canvas: CampaignCanvas;
  selectedId: string | null;
  hidden: string[];
  locked: string[];
  onSelect: (id: string | null) => void;
  onChange: (canvas: CampaignCanvas) => void;
  onDuplicate: (id: string) => void;
  onRemove: (id: string) => void;
  onToggleHidden: (id: string) => void;
  onToggleLocked: (id: string) => void;
}) {
  const ordered = [...canvas.elements].sort((a, b) => b.z - a.z);

  /**
   * Re-stacking swaps depth with the neighbour rather than nudging a number,
   * so "bring forward" always moves exactly one step even when two elements
   * were saved at the same depth.
   */
  const restack = (id: string, direction: 1 | -1) => {
    const index = ordered.findIndex((item) => item.id === id);
    const neighbour = ordered[direction === 1 ? index - 1 : index + 1];
    if (!neighbour) return;
    const next = ordered.map((item, position) => ({ ...item, z: ordered.length - position }));
    const a = next.findIndex((item) => item.id === id);
    const b = next.findIndex((item) => item.id === neighbour.id);
    [next[a].z, next[b].z] = [next[b].z, next[a].z];
    onChange({ ...canvas, elements: next });
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
      <p className="px-1 text-[11px] font-black uppercase tracking-wide text-muted-foreground">
        Layers · front to back
      </p>
      {ordered.map((element) => {
        const isHidden = hidden.includes(element.id);
        const isLocked = locked.includes(element.id);
        return (
          <div
            key={element.id}
            className={cn(
              'flex items-center gap-1 rounded-lg bg-background px-2 py-1.5 ring-1 transition-colors',
              selectedId === element.id ? 'ring-2 ring-primary' : 'ring-border',
            )}
          >
            <span className="w-4 shrink-0 text-center text-[12px] leading-none text-muted-foreground">
              {ELEMENT_ICONS[element.type] ?? '•'}
            </span>
            <button
              type="button"
              onClick={() => onSelect(element.id)}
              className="min-w-0 flex-1 truncate text-left text-xs font-black"
            >
              {element.label || ELEMENT_LABELS[element.type]}
              <span className="ml-1.5 font-bold text-muted-foreground">
                {ELEMENT_LABELS[element.type]}
              </span>
            </button>
            <LayerButton
              label={isHidden ? 'Show' : 'Hide in the editor'}
              onClick={() => onToggleHidden(element.id)}
            >
              {isHidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </LayerButton>
            <LayerButton
              label={isLocked ? 'Unlock' : 'Lock position'}
              onClick={() => onToggleLocked(element.id)}
            >
              {isLocked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
            </LayerButton>
            <LayerButton label="Bring forward" onClick={() => restack(element.id, 1)}>
              <ChevronsUp className="h-3.5 w-3.5" />
            </LayerButton>
            <LayerButton label="Send back" onClick={() => restack(element.id, -1)}>
              <ChevronsDown className="h-3.5 w-3.5" />
            </LayerButton>
            <LayerButton label="Duplicate" onClick={() => onDuplicate(element.id)}>
              <Copy className="h-3.5 w-3.5" />
            </LayerButton>
            <LayerButton label="Delete" danger onClick={() => onRemove(element.id)}>
              <Trash2 className="h-3.5 w-3.5" />
            </LayerButton>
          </div>
        );
      })}
    </div>
  );
}

function LayerButton({
  label,
  onClick,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        'rounded-md p-1 text-muted-foreground transition-colors',
        danger ? 'hover:bg-red-500/10 hover:text-red-500' : 'hover:bg-muted hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}

function Inspector({
  element,
  campaign,
  canvas,
  riveContents,
  library,
  actionEnv,
  onUploadRive,
  canUpload,
  onPatch,
}: {
  element: CampaignElement;
  campaign: CampaignPayload;
  canvas: CampaignCanvas;
  riveContents: Record<string, RiveContents>;
  library: RiveLibraryFile[];
  actionEnv: ActionEnv;
  onUploadRive?: () => void;
  canUpload?: boolean;
  onPatch: (partial: Partial<CampaignElement>) => void;
}) {
  const isText = ['text', 'button', 'text_button', 'discount', 'timer', 'close'].includes(
    element.type,
  );
  const imageAssets = campaign.assets.filter((asset) => asset.kind === 'image');
  const riveAssets = campaign.assets.filter((asset) => asset.kind === 'rive');
  const riveUrl =
    element.libraryPath ||
    riveAssets.find((asset) => asset.id === element.assetId)?.url ||
    '';
  const ownContents =
    riveContents[riveSourceKey(riveUrl, element.artboard, element.stateMachine)] ?? null;
  const tiny =
    isClickableElement(element.type) &&
    (element.w < TAP_TARGET_MIN.w || element.h < TAP_TARGET_MIN.h);

  return (
    <div className="space-y-3 rounded-xl bg-muted/50 p-3">
      <div className="flex items-center gap-2">
        <TextInput
          value={element.label}
          placeholder={ELEMENT_LABELS[element.type]}
          onChange={(label) => onPatch({ label })}
        />
        <span className="shrink-0 rounded-md bg-background px-2 py-1.5 text-[11px] font-black text-muted-foreground">
          {ELEMENT_LABELS[element.type]}
        </span>
      </div>
      <p className="text-[10px] font-bold text-muted-foreground">
        Reported in stats as <span className="font-mono">{element.id}</span>
      </p>

      <div className="grid grid-cols-4 gap-2">
        <Field label="X %">
          <NumberInput
            value={element.x}
            step={0.5}
            onChange={(x) => onPatch(clampBox({ ...element, x: x ?? 0 }))}
          />
        </Field>
        <Field label="Y %">
          <NumberInput
            value={element.y}
            step={0.5}
            onChange={(y) => onPatch(clampBox({ ...element, y: y ?? 0 }))}
          />
        </Field>
        <Field label="W %">
          <NumberInput
            value={element.w}
            step={0.5}
            onChange={(w) => onPatch(clampBox({ ...element, w: w ?? MIN_SIZE }))}
          />
        </Field>
        <Field label="H %">
          <NumberInput
            value={element.h}
            step={0.5}
            onChange={(h) => onPatch(clampBox({ ...element, h: h ?? MIN_SIZE }))}
          />
        </Field>
      </div>

      {tiny ? (
        <button
          type="button"
          onClick={() =>
            onPatch(
              clampBox({
                ...element,
                w: Math.max(element.w, TAP_TARGET_MIN.w),
                h: Math.max(element.h, TAP_TARGET_MIN.h),
              }),
            )
          }
          className="w-full rounded-lg bg-amber-500/10 px-2.5 py-1.5 text-left text-[11px] font-bold text-amber-600 dark:text-amber-400"
        >
          Smaller than a fingertip on a phone — tap to grow it to a usable size.
        </button>
      ) : null}

      <div className="flex flex-wrap items-center gap-1.5">
        <AlignButton
          label="Centre across"
          icon={<AlignCenterVertical className="h-3.5 w-3.5" />}
          onClick={() => onPatch({ x: round(50 - element.w / 2) })}
        />
        <AlignButton
          label="Centre down"
          icon={<AlignCenterHorizontal className="h-3.5 w-3.5" />}
          onClick={() => onPatch({ y: round(50 - element.h / 2) })}
        />
        <AlignButton
          label="Top"
          icon={<AlignStartHorizontal className="h-3.5 w-3.5" />}
          onClick={() => onPatch({ y: 0 })}
        />
        <AlignButton
          label="Bottom"
          icon={<AlignEndHorizontal className="h-3.5 w-3.5" />}
          onClick={() => onPatch({ y: round(100 - element.h) })}
        />
        <AlignButton
          label="Full width"
          icon={<span className="text-[11px] leading-none">↔</span>}
          onClick={() => onPatch({ x: 0, w: 100 })}
        />
      </div>

      <Slider
        label="Rotation"
        value={element.rotation}
        min={-45}
        max={45}
        suffix="°"
        onChange={(rotation) => onPatch({ rotation })}
      />

      {isText ? (
        <>
          <Field
            label={element.type === 'timer' ? 'Text' : 'Text'}
            hint={
              element.type === 'timer'
                ? '{time} is replaced by the countdown.'
                : undefined
            }
          >
            <TextInput
              value={element.text ?? ''}
              onChange={(text) => onPatch({ text })}
              placeholder={element.type === 'timer' ? 'Ends in {time}' : 'Your text'}
            />
          </Field>

          <div className="grid grid-cols-2 gap-2">
            <Slider
              label="Size"
              value={element.fontSize ?? 6}
              min={1}
              max={20}
              step={0.25}
              suffix="%"
              help="A percentage of the popup's width, so type scales with the artwork."
              onChange={(fontSize) => onPatch({ fontSize })}
            />
            <Slider
              label="Weight"
              value={element.fontWeight ?? 900}
              min={100}
              max={900}
              step={100}
              onChange={(fontWeight) => onPatch({ fontWeight })}
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Slider
              label="Line height"
              value={element.lineHeight ?? 1.15}
              min={0.7}
              max={2.5}
              step={0.05}
              onChange={(lineHeight) => onPatch({ lineHeight })}
            />
            <Slider
              label="Letter spacing"
              value={element.letterSpacing ?? 0}
              min={-0.1}
              max={0.5}
              step={0.01}
              suffix="em"
              onChange={(letterSpacing) => onPatch({ letterSpacing })}
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <ColorInput
              label="Text"
              value={element.color ?? '#ffffff'}
              onChange={(color) => onPatch({ color })}
            />
            <SegmentedControl
              size="sm"
              value={element.align ?? 'center'}
              options={TEXT_ALIGNMENTS.map((align) => ({
                value: align as TextAlignment,
                label: align === 'left' ? '⇤' : align === 'right' ? '⇥' : '⇔',
                title: align,
              }))}
              onChange={(align) => onPatch({ align })}
            />
            <Toggle
              checked={!!element.uppercase}
              label="Caps"
              onChange={(uppercase) => onPatch({ uppercase })}
            />
            <Toggle
              checked={!!element.italic}
              label="Italic"
              onChange={(italic) => onPatch({ italic })}
            />
          </div>
        </>
      ) : null}

      {element.type === 'discount' ? (
        <Field label="Decoration">
          <Select
            value={element.discountStyle ?? 'strike'}
            options={DISCOUNT_STYLES.map((style) => ({
              value: style as DiscountStyle,
              label: DISCOUNT_STYLE_LABELS[style],
            }))}
            onChange={(discountStyle) => onPatch({ discountStyle })}
          />
        </Field>
      ) : null}

      {element.type === 'timer' ? (
        <div className="space-y-2">
          <Field label="Counts down">
            <Select
              value={element.timerMode ?? 'per_user'}
              options={TIMER_MODES.map((mode) => ({
                value: mode as TimerMode,
                label: TIMER_MODE_LABELS[mode],
              }))}
              onChange={(timerMode) => onPatch({ timerMode })}
            />
          </Field>
          {element.timerMode !== 'schedule' ? (
            <Field
              label="Length"
              hint="Starts the first time this user sees the popup, and survives a reload."
            >
              <NumberInput
                value={element.timerMinutes ?? 30}
                min={1}
                suffix="min"
                onChange={(timerMinutes) => onPatch({ timerMinutes: timerMinutes ?? 30 })}
              />
            </Field>
          ) : (
            <p className="rounded-lg bg-muted/60 px-2.5 py-1.5 text-[11px] font-bold text-muted-foreground">
              Uses the campaign&apos;s end date, under Rules.
            </p>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Field label="Format">
              <Select
                value={element.timerFormat ?? 'hms'}
                options={TIMER_FORMATS.map((format) => ({
                  value: format as TimerFormat,
                  label: TIMER_FORMAT_LABELS[format],
                }))}
                onChange={(timerFormat) => onPatch({ timerFormat })}
              />
            </Field>
            <Field label="At zero">
              <Select
                value={element.timerExpiry ?? 'freeze'}
                options={TIMER_EXPIRY.map((expiry) => ({
                  value: expiry as TimerExpiry,
                  label: TIMER_EXPIRY_LABELS[expiry],
                }))}
                onChange={(timerExpiry) => onPatch({ timerExpiry })}
              />
            </Field>
          </div>
        </div>
      ) : null}

      {isClickableElement(element.type) ? (
        <ActionPicker
          config={{ ...element, action: element.action ?? 'dismiss' }}
          env={actionEnv}
          onChange={(partial) => onPatch(partial)}
        />
      ) : null}

      {element.type === 'image' ? (
        <div className="space-y-2">
          <Field label="Image">
            <Select
              value={element.assetId ?? ''}
              options={[
                { value: '', label: 'Pick an upload…' },
                ...imageAssets.map((asset) => ({
                  value: asset.id,
                  label: asset.name || asset.id,
                })),
              ]}
              onChange={(assetId) => onPatch({ assetId })}
            />
          </Field>
          <Field label="Fit">
            <Select
              value={element.fit ?? 'contain'}
              options={[
                { value: 'contain' as const, label: 'Contain — whole image fits' },
                { value: 'cover' as const, label: 'Cover — fills and crops' },
              ]}
              onChange={(fit) => onPatch({ fit })}
            />
          </Field>
        </div>
      ) : null}

      {element.type === 'rive' ? (
        <div className="space-y-2">
          <RiveStudio
            spec={element}
            contents={ownContents}
            library={library}
            assets={riveAssets}
            canUpload={canUpload}
            onUploadRive={onUploadRive}
            onPatch={(partial) => onPatch(partial)}
          />
          <Field label="Fit">
            <Select
              value={element.fit ?? 'contain'}
              options={[
                { value: 'contain' as const, label: 'Contain — whole animation fits' },
                { value: 'cover' as const, label: 'Cover — fills and crops' },
              ]}
              onChange={(fit) => onPatch({ fit })}
            />
          </Field>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <ColorInput
          label="Fill"
          value={element.background || ''}
          onChange={(background) => onPatch({ background })}
          allowClear
          onClear={() => onPatch({ background: '' })}
        />
        <Slider
          label="Corner"
          value={element.radius ?? 0}
          min={0}
          max={30}
          step={0.5}
          suffix="%"
          onChange={(radius) => onPatch({ radius })}
        />
        <Toggle
          checked={!!element.shadow}
          label="Shadow"
          onChange={(shadow) => onPatch({ shadow })}
        />
        <Slider
          label="Opacity"
          value={element.opacity ?? 100}
          min={0}
          max={100}
          suffix="%"
          onChange={(opacity) => onPatch({ opacity })}
        />
      </div>

      <p className="text-[10px] font-medium leading-snug text-muted-foreground">
        A button with no fill is an invisible tap target — draw the button into your artwork and
        put a transparent one on top of it. The popup is at most{' '}
        {Math.round(canvas.maxWidth)}px wide, and every size here is a percentage of that, so the
        whole composition scales as one piece.
      </p>
    </div>
  );
}

function AlignButton({
  label,
  icon,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className="flex items-center gap-1 rounded-lg bg-background px-2 py-1.5 text-[11px] font-black text-muted-foreground transition-colors hover:text-foreground"
    >
      {icon}
      {label}
    </button>
  );
}

/** Uploads for the artwork itself and for anything placed on top of it. */
export function CanvasAssets({
  campaign,
  canUpload,
  canvas = true,
  uploading,
  onUpload,
  onDeleteAsset,
}: {
  campaign: CampaignPayload;
  canUpload: boolean;
  /** A banner has one small image and nothing to place on it. */
  canvas?: boolean;
  uploading?: string | null;
  onUpload: (file: File, kind: 'background' | 'asset' | 'rive') => void;
  onDeleteAsset: (assetId: string) => void;
}) {
  const backgroundRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const riveRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

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
          Save the campaign first — artwork is stored against its id.
        </p>
      ) : null}

      <div
        onDragOver={(event) => {
          if (!canUpload) return;
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          if (!canUpload) return;
          event.preventDefault();
          setDragging(false);
          const file = event.dataTransfer.files?.[0];
          if (!file) return;
          onUpload(file, file.name.toLowerCase().endsWith('.riv') ? 'rive' : 'background');
        }}
        className={cn(
          'flex items-center gap-3 rounded-2xl border-2 border-dashed p-3 transition-colors',
          dragging ? 'border-primary bg-primary/5' : 'border-border',
        )}
      >
        {campaign.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={campaign.imageUrl}
            alt=""
            className="h-16 w-16 shrink-0 rounded-xl bg-neutral-800 object-contain ring-1 ring-border"
          />
        ) : (
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
            <ImageIcon className="h-6 w-6" />
          </span>
        )}
        {pick(backgroundRef, 'background')}
        <div className="min-w-0 flex-1">
          <button
            type="button"
            disabled={!canUpload || uploading === 'background'}
            onClick={() => backgroundRef.current?.click()}
            className="h-10 rounded-xl bg-foreground px-4 text-sm font-black text-background disabled:opacity-50"
          >
            {uploading === 'background'
              ? 'Uploading…'
              : campaign.imageUrl
                ? 'Replace artwork'
                : canvas
                  ? 'Upload popup artwork'
                  : 'Upload image'}
          </button>
          <p className="mt-1 text-[11px] font-medium text-muted-foreground">
            {canvas
              ? 'Or drop a PNG here. The popup takes the shape of whatever you upload.'
              : 'A small square image shown beside the banner text.'}
          </p>
        </div>
      </div>

      {!canvas ? null : (
        <>
          <div className="flex gap-2">
            {pick(imageRef, 'asset')}
            {pick(riveRef, 'rive')}
            <button
              type="button"
              disabled={!canUpload || uploading === 'asset'}
              onClick={() => imageRef.current?.click()}
              className="flex h-9 items-center gap-1.5 rounded-lg bg-muted px-3 text-[11px] font-black disabled:opacity-50"
            >
              <ImageIcon className="h-3.5 w-3.5" />
              {uploading === 'asset' ? 'Uploading…' : 'Add a PNG'}
            </button>
            <button
              type="button"
              disabled={!canUpload || uploading === 'rive'}
              onClick={() => riveRef.current?.click()}
              className="flex h-9 items-center gap-1.5 rounded-lg bg-muted px-3 text-[11px] font-black disabled:opacity-50"
            >
              <Type className="h-3.5 w-3.5" />
              {uploading === 'rive' ? 'Uploading…' : 'Add a .riv'}
            </button>
          </div>

          {campaign.assets.length ? (
            <div className="space-y-1">
              {campaign.assets.map((asset) => (
                <div
                  key={asset.id}
                  className="flex items-center gap-2 rounded-lg bg-background px-2 py-1.5 ring-1 ring-border"
                >
                  <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-black uppercase text-muted-foreground">
                    {asset.kind}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs font-bold">{asset.name}</span>
                  <button
                    type="button"
                    onClick={() => onDeleteAsset(asset.id)}
                    aria-label="Delete asset"
                    className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-500"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
