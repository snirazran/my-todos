'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CampaignRiveArt, type RiveContents, type RiveSignal } from './CampaignRiveArt';
import {
  isClickableElement,
  type CampaignElement,
  type CampaignPayload,
  type TimerFormat,
} from '@/lib/campaigns/types';

export type ElementActivation = {
  element: CampaignElement;
};

const TIMER_START_KEY = 'frogress.campaigns.timerStart';

/** When this user's per-user countdown began, so a reload can't reset the offer. */
function timerStartedAt(campaignId: string, elementId: string) {
  const key = `${TIMER_START_KEY}.${campaignId}.${elementId}`;
  try {
    const stored = Number(window.localStorage.getItem(key));
    if (stored > 0) return stored;
    const now = Date.now();
    window.localStorage.setItem(key, String(now));
    return now;
  } catch {
    return Date.now();
  }
}

function formatRemaining(ms: number, format: TimerFormat) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');

  if (format === 'dhm') {
    if (days > 0) return `${days}d ${hours}h ${minutes}m`;
    return `${hours}h ${minutes}m`;
  }
  if (format === 'ms') return `${pad(minutes + hours * 60 + days * 1440)}:${pad(seconds)}`;
  return `${pad(hours + days * 24)}:${pad(minutes)}:${pad(seconds)}`;
}

/**
 * The popup as its designer drew it: one piece of artwork with elements placed
 * on top, every position and size expressed as a percentage of the artwork box.
 *
 * The box carries `container-type: size`, so `cqw` units let type and spacing
 * scale with the art instead of the viewport — the popup is the same
 * composition on a small phone and a desktop.
 */
export function CampaignCanvasView({
  campaign,
  onActivate,
  onDismiss,
  onSignal,
  onRiveContents,
  selectedId,
  onSelectElement,
  editing = false,
}: {
  campaign: CampaignPayload;
  /** A button or hit area was pressed. */
  onActivate: (element: CampaignElement) => void;
  onDismiss: () => void;
  onSignal?: (signal: RiveSignal) => void;
  onRiveContents?: (contents: RiveContents) => void;
  selectedId?: string | null;
  onSelectElement?: (id: string) => void;
  editing?: boolean;
}) {
  const { canvas } = campaign;
  const elements = useMemo(
    () => [...canvas.elements].sort((a, b) => a.z - b.z),
    [canvas.elements],
  );

  const [hiddenIds, setHiddenIds] = useState<string[]>([]);

  return (
    <div
      // The artwork is the popup, so it also clips it: nothing can paint
      // outside the design, whatever the stored coordinates say.
      className="relative w-full overflow-hidden"
      style={{
        maxWidth: canvas.maxWidth,
        aspectRatio: String(canvas.aspect || 0.75),
        containerType: 'size',
      }}
    >
      {campaign.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={campaign.imageUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-contain"
          draggable={false}
        />
      ) : (
        <div className="absolute inset-0 rounded-[24px] bg-popover" />
      )}

      {elements.map((element) => {
        if (hiddenIds.includes(element.id)) return null;
        return (
          <ElementView
            key={element.id}
            campaign={campaign}
            element={element}
            editing={editing}
            selected={selectedId === element.id}
            onSelect={onSelectElement}
            onActivate={onActivate}
            onDismiss={onDismiss}
            onSignal={onSignal}
            onRiveContents={onRiveContents}
            onExpire={(mode) => {
              if (mode === 'hide') setHiddenIds((ids) => [...ids, element.id]);
              if (mode === 'close') onDismiss();
            }}
          />
        );
      })}
    </div>
  );
}

function ElementView({
  campaign,
  element,
  editing,
  selected,
  onSelect,
  onActivate,
  onDismiss,
  onSignal,
  onRiveContents,
  onExpire,
}: {
  campaign: CampaignPayload;
  element: CampaignElement;
  editing: boolean;
  selected: boolean;
  onSelect?: (id: string) => void;
  onActivate: (element: CampaignElement) => void;
  onDismiss: () => void;
  onSignal?: (signal: RiveSignal) => void;
  onRiveContents?: (contents: RiveContents) => void;
  onExpire: (mode: 'hide' | 'close') => void;
}) {
  const box: React.CSSProperties = {
    position: 'absolute',
    left: `${element.x}%`,
    top: `${element.y}%`,
    width: `${element.w}%`,
    height: `${element.h}%`,
    transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined,
    opacity: (element.opacity ?? 100) / 100,
    zIndex: element.z + 1,
  };

  const textStyle: React.CSSProperties = {
    fontSize: `${element.fontSize ?? 6}cqw`,
    fontWeight: element.fontWeight ?? 900,
    color: element.color || '#ffffff',
    lineHeight: element.lineHeight ?? 1.15,
    letterSpacing: `${element.letterSpacing ?? 0}em`,
    textTransform: element.uppercase ? 'uppercase' : undefined,
    fontStyle: element.italic ? 'italic' : undefined,
    textAlign: element.align ?? 'center',
  };

  const surface: React.CSSProperties = {
    background: element.background || undefined,
    borderRadius: `${element.radius ?? 0}cqw`,
    boxShadow: element.shadow ? '0 6px 18px rgba(0,0,0,0.28)' : undefined,
    border:
      element.borderWidth && element.borderColor
        ? `${element.borderWidth}px solid ${element.borderColor}`
        : undefined,
  };

  const justify =
    element.align === 'left'
      ? 'flex-start'
      : element.align === 'right'
        ? 'flex-end'
        : 'center';

  const clickable = isClickableElement(element.type);

  const select = (event: React.MouseEvent) => {
    if (!editing || !onSelect) return false;
    event.preventDefault();
    event.stopPropagation();
    onSelect(element.id);
    return true;
  };

  const activate = (event: React.MouseEvent) => {
    if (select(event)) return;
    if (element.type === 'close') {
      onActivate(element);
      onDismiss();
      return;
    }
    onActivate(element);
  };

  const content = () => {
    switch (element.type) {
      case 'image': {
        const asset = campaign.assets.find((a) => a.id === element.assetId);
        if (!asset) return null;
        return (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={asset.url}
            alt=""
            draggable={false}
            className="h-full w-full"
            style={{ objectFit: element.fit ?? 'contain' }}
          />
        );
      }
      case 'rive': {
        const asset = campaign.assets.find((a) => a.id === element.assetId);
        if (!asset) return null;
        return (
          <CampaignRiveArt
            url={asset.url}
            artboard={element.artboard}
            stateMachine={element.stateMachine}
            fit={element.fit ?? 'contain'}
            buttons={campaign.rive.buttons}
            onSignal={onSignal}
            onContents={onRiveContents}
            className="h-full w-full"
          />
        );
      }
      case 'timer':
        return (
          <TimerText
            campaign={campaign}
            element={element}
            style={textStyle}
            onExpire={onExpire}
          />
        );
      case 'discount':
        return <DiscountText element={element} style={textStyle} />;
      case 'close':
        return element.text ? (
          <span style={textStyle}>{element.text}</span>
        ) : (
          <X style={{ width: '60%', height: '60%', color: element.color || '#fff' }} />
        );
      default:
        return <span style={textStyle}>{element.text}</span>;
    }
  };

  return (
    <div
      style={{ ...box, ...surface }}
      onClick={clickable || editing ? activate : undefined}
      role={clickable && !editing ? 'button' : undefined}
      aria-label={clickable && !editing ? element.label || element.text : undefined}
      className={cn(
        'flex items-center overflow-hidden',
        clickable && !editing && 'cursor-pointer transition-transform active:scale-[0.97]',
        editing && 'cursor-move',
        editing && selected && 'outline outline-2 outline-offset-2 outline-primary',
        editing && !selected && 'hover:outline hover:outline-1 hover:outline-primary/50',
      )}
    >
      <div className="flex h-full w-full items-center" style={{ justifyContent: justify }}>
        {content()}
      </div>
    </div>
  );
}

function DiscountText({
  element,
  style,
}: {
  element: CampaignElement;
  style: React.CSSProperties;
}) {
  const discountStyle = element.discountStyle ?? 'strike';
  return (
    <span className="relative inline-block" style={style}>
      {element.text}
      {discountStyle === 'strike' ? (
        <span
          className="pointer-events-none absolute left-0 top-1/2 h-[0.09em] w-full -translate-y-1/2"
          style={{ background: element.color || '#fff' }}
        />
      ) : null}
      {discountStyle === 'slash' ? (
        <span
          className="pointer-events-none absolute left-0 top-1/2 h-[0.09em] w-[112%] origin-center -translate-x-[6%] -translate-y-1/2 rotate-[-14deg]"
          style={{ background: element.color || '#fff' }}
        />
      ) : null}
    </span>
  );
}

function TimerText({
  campaign,
  element,
  style,
  onExpire,
}: {
  campaign: CampaignPayload;
  element: CampaignElement;
  style: React.CSSProperties;
  onExpire: (mode: 'hide' | 'close') => void;
}) {
  const [now, setNow] = useState(() => Date.now());

  const endsAt = useMemo(() => {
    if (element.timerMode === 'schedule') {
      return campaign.endAt ? new Date(campaign.endAt).getTime() : 0;
    }
    if (typeof window === 'undefined') return 0;
    return (
      timerStartedAt(campaign.id, element.id) + (element.timerMinutes ?? 30) * 60_000
    );
  }, [campaign.endAt, campaign.id, element.id, element.timerMinutes, element.timerMode]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const remaining = endsAt ? endsAt - now : 0;

  useEffect(() => {
    if (!endsAt || remaining > 0) return;
    const expiry = element.timerExpiry ?? 'freeze';
    if (expiry !== 'freeze') onExpire(expiry);
  }, [endsAt, remaining, element.timerExpiry, onExpire]);

  const time = formatRemaining(Math.max(0, remaining), element.timerFormat ?? 'hms');
  const template = element.text || '{time}';

  return <span style={style}>{template.replace('{time}', time)}</span>;
}
