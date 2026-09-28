'use client';

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const KEYBOARD_MIN_INSET = 80;

function isTextField(el: EventTarget | null): el is HTMLInputElement | HTMLTextAreaElement {
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
}

function useTextFieldFocused() {
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    const onFocusIn = (event: FocusEvent) => {
      if (isTextField(event.target)) setFocused(true);
    };
    const onFocusOut = (event: FocusEvent) => {
      if (isTextField(event.target) && !isTextField(event.relatedTarget)) setFocused(false);
    };
    setFocused(isTextField(document.activeElement));
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    return () => {
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
    };
  }, []);

  return focused;
}

export function useOnboardingKeyboardInset() {
  const focused = useTextFieldFocused();
  const [inset, setInset] = useState(0);

  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    if (!focused || !vv) {
      setInset(0);
      return;
    }
    const update = () => {
      const layoutHeight = document.documentElement.clientHeight;
      const next = Math.max(0, Math.round(layoutHeight - (vv.height + vv.offsetTop)));
      setInset(next >= KEYBOARD_MIN_INSET ? next : 0);
    };
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, [focused]);

  return inset;
}

type FooterProps = {
  children: ReactNode;
  hint?: ReactNode;
  className?: string;
};

export function OnboardingFooter({ children, hint, className }: FooterProps) {
  const footerRef = useRef<HTMLDivElement>(null);
  const inset = useOnboardingKeyboardInset();
  const keyboardOpen = inset > 0;

  useLayoutEffect(() => {
    if (!keyboardOpen) return;
    const footer = footerRef.current;
    const field = document.activeElement;
    if (!footer || !isTextField(field)) return;
    const scroller = footer.closest('main');
    if (!scroller) return;
    const frame = requestAnimationFrame(() => {
      const overlap =
        field.getBoundingClientRect().bottom - (footer.getBoundingClientRect().top - 12);
      if (overlap > 0) scroller.scrollBy({ top: overlap, behavior: 'smooth' });
    });
    return () => cancelAnimationFrame(frame);
  }, [keyboardOpen, inset]);

  return (
    <>
      <div
        ref={footerRef}
        style={keyboardOpen ? { bottom: inset } : undefined}
        className={cn(
          'sticky bottom-0 z-30 -mx-5 mt-3 flex flex-col items-center gap-2 bg-background px-5 pt-3 md:mx-0 md:px-0',
          keyboardOpen
            ? 'pb-3'
            : 'pb-[calc(1.75rem+env(safe-area-inset-bottom))] md:pb-10',
          className,
        )}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-full h-6 bg-gradient-to-t from-background to-transparent"
        />
        {hint && !keyboardOpen ? (
          <p className="text-center text-[13px] font-bold text-muted-foreground">{hint}</p>
        ) : null}
        {children}
      </div>
      {keyboardOpen ? <div aria-hidden style={{ height: inset }} className="shrink-0" /> : null}
    </>
  );
}

type ButtonProps = {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'primary' | 'secondary' | 'ghost';
  type?: 'button' | 'submit';
  className?: string;
};

export function OnboardingButton({
  children,
  onClick,
  disabled,
  loading,
  variant = 'primary',
  type = 'button',
  className,
}: ButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      onMouseDown={(event) => {
        if (isTextField(document.activeElement)) event.preventDefault();
      }}
      className={cn(
        'relative flex w-full select-none items-center justify-center gap-2 font-black tracking-tight transition-all duration-150 [-webkit-tap-highlight-color:transparent] md:w-80',
        'focus-visible:outline-none focus-visible:ring-4',
        variant === 'primary' &&
          'h-14 rounded-2xl bg-[#4f9149] text-[17px] text-white shadow-[0_4px_0_0_#34631f] ring-1 ring-[#34631f]/40 focus-visible:ring-[#4f9149]/40 active:translate-y-1 active:shadow-none [@media(hover:hover)]:hover:brightness-110',
        variant === 'primary' &&
          'disabled:translate-y-0 disabled:bg-muted disabled:text-muted-foreground disabled:shadow-[0_4px_0_0_rgba(0,0,0,0.08)] disabled:ring-0',
        variant === 'secondary' &&
          'h-14 rounded-2xl border border-border bg-card text-base text-muted-foreground shadow-[0_4px_0_0_rgba(0,0,0,0.10)] focus-visible:ring-primary/20 active:translate-y-1 active:shadow-none disabled:opacity-60 [@media(hover:hover)]:hover:bg-accent',
        variant === 'ghost' &&
          'h-11 rounded-xl text-sm text-muted-foreground focus-visible:ring-primary/20 active:scale-[0.98] disabled:opacity-60 [@media(hover:hover)]:hover:text-foreground',
        (disabled || loading) && 'cursor-not-allowed',
        className,
      )}
    >
      {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : children}
    </button>
  );
}
