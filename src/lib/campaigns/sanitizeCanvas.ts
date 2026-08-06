import {
  CTA_ACTIONS,
  DISCOUNT_STYLES,
  ELEMENT_TYPES,
  TEXT_ALIGNMENTS,
  TIMER_EXPIRY,
  TIMER_FORMATS,
  TIMER_MODES,
  type CampaignCanvas,
  type CampaignElement,
  type CtaAction,
  type DiscountStyle,
  type ElementType,
  type TextAlignment,
  type TimerExpiry,
  type TimerFormat,
  type TimerMode,
} from '@/lib/campaigns/types';

const num = (value: unknown): number | undefined => {
  if (value === '' || value == null) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
};

const clamp = (value: number | undefined, min: number, max: number, fallback: number) =>
  Math.min(max, Math.max(min, value ?? fallback));

const oneOf = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(value as T) ? (value as T) : fallback;

const str = (value: unknown, max: number) =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

/** Colours are written into inline styles, so only literal colour syntax is kept. */
const color = (value: unknown) => {
  const raw = str(value, 32);
  if (!raw) return '';
  return /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%/]+\)|hsla?\([\d\s.,%/]+\)|transparent)$/i.test(raw)
    ? raw
    : '';
};

/**
 * Canvas geometry comes from a drag-and-drop editor, so every number is bounded
 * to the artwork box and every free-text field is length-capped. Nothing here
 * is ever rendered as markup.
 */
export function sanitizeCanvas(raw: Record<string, unknown>): CampaignCanvas {
  const elements = Array.isArray(raw.elements) ? raw.elements : [];
  const seen = new Set<string>();

  return {
    aspect: clamp(num(raw.aspect), 0.3, 3, 0.75),
    maxWidth: clamp(num(raw.maxWidth), 240, 720, 380),
    elements: elements.slice(0, 40).flatMap((entry, index): CampaignElement[] => {
      const item = (entry ?? {}) as Record<string, unknown>;
      const type = item.type as ElementType;
      if (!ELEMENT_TYPES.includes(type)) return [];

      let id = str(item.id, 40) || `${type}_${Math.random().toString(36).slice(2, 8)}`;
      while (seen.has(id)) id = `${id}_${index}`;
      seen.add(id);

      // Geometry is clamped to the artwork: an element that escaped the canvas
      // would be unreachable in the app and invisible to whoever built it.
      const w = clamp(num(item.w), 2, 100, 40);
      const h = clamp(num(item.h), 2, 100, 10);

      return [
        {
          id,
          type,
          x: clamp(num(item.x), 0, 100 - w, 0),
          y: clamp(num(item.y), 0, 100 - h, 0),
          w,
          h,
          rotation: clamp(num(item.rotation), -180, 180, 0),
          z: clamp(num(item.z), 0, 999, index),
          label: str(item.label, 40),
          text: str(item.text, 200),
          fontSize: clamp(num(item.fontSize), 0.5, 40, 6),
          fontWeight: clamp(num(item.fontWeight), 100, 900, 900),
          color: color(item.color) || '#ffffff',
          align: oneOf<TextAlignment>(item.align, TEXT_ALIGNMENTS, 'center'),
          lineHeight: clamp(num(item.lineHeight), 0.7, 3, 1.15),
          letterSpacing: clamp(num(item.letterSpacing), -0.2, 1, 0),
          uppercase: item.uppercase === true,
          italic: item.italic === true,
          background: color(item.background),
          radius: clamp(num(item.radius), 0, 999, 0),
          shadow: item.shadow === true,
          borderColor: color(item.borderColor),
          borderWidth: clamp(num(item.borderWidth), 0, 12, 0),
          action: oneOf<CtaAction>(item.action, CTA_ACTIONS, 'dismiss'),
          path: str(item.path, 200),
          packId: str(item.packId, 40),
          assetId: str(item.assetId, 40),
          fit: oneOf(item.fit, ['contain', 'cover'] as const, 'contain'),
          artboard: str(item.artboard, 80),
          stateMachine: str(item.stateMachine, 80),
          discountStyle: oneOf<DiscountStyle>(item.discountStyle, DISCOUNT_STYLES, 'strike'),
          timerMode: oneOf<TimerMode>(item.timerMode, TIMER_MODES, 'per_user'),
          timerMinutes: clamp(num(item.timerMinutes), 1, 43200, 30),
          timerFormat: oneOf<TimerFormat>(item.timerFormat, TIMER_FORMATS, 'hms'),
          timerExpiry: oneOf<TimerExpiry>(item.timerExpiry, TIMER_EXPIRY, 'freeze'),
          opacity: clamp(num(item.opacity), 0, 100, 100),
        },
      ];
    }),
  };
}
