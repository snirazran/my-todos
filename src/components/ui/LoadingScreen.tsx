'use client';

import Image from 'next/image';
import { useLayoutEffect } from 'react';
import { useUIStore } from '@/lib/uiStore';

interface LoadingScreenProps {
  message?: string;
  fullscreen?: boolean;
  subtext?: string;
}

function HomeLoaderIcon() {
  return (
    <div className="relative flex h-44 w-44 items-center justify-center">
      <Image
        src="/icons/Home.svg"
        alt=""
        width={168}
        height={168}
        priority
        aria-hidden
        className="relative h-[168px] w-[168px]"
      />
    </div>
  );
}

function CurvedLoadingText({ message }: { message: string }) {
  return (
    <svg
      aria-label={message}
      role="img"
      viewBox="0 0 220 34"
      className="-mt-6 h-8 w-[220px] overflow-visible text-foreground"
    >
      <path id="loading-text-arc" d="M 36 12 Q 110 28 184 12" fill="none" />
      <text
        fill="currentColor"
        fontSize="20"
        fontWeight="800"
        textAnchor="middle"
        style={{
          fontFamily:
            '"Arial Rounded MT Bold", "Avenir Next Rounded", ui-rounded, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        }}
      >
        <textPath href="#loading-text-arc" startOffset="50%">
          {message}
        </textPath>
      </text>
    </svg>
  );
}

export function LoadingScreen({
  message = 'Frog Task',
  subtext = '',
  fullscreen = true,
}: LoadingScreenProps) {
  const setLoadingScreenVisible = useUIStore((state) => state.setLoadingScreenVisible);

  useLayoutEffect(() => {
    if (!fullscreen) return;

    setLoadingScreenVisible(true);
    return () => setLoadingScreenVisible(false);
  }, [fullscreen, setLoadingScreenVisible]);

  return (
    <div
      className={`overflow-hidden ${
        fullscreen ? 'fixed inset-0 z-40 flex items-center justify-center' : 'py-12 flex items-center justify-center'
      }`}
    >
      <div className="absolute inset-0 bg-background" />
      
      <div className="relative flex w-full -translate-y-12 items-center justify-center px-4">
        <div className="flex flex-col items-center gap-0">
          <HomeLoaderIcon />
          <div className="text-center space-y-1">
            <CurvedLoadingText message={message} />
            {subtext ? (
              <p className="text-sm font-medium text-muted-foreground">
                {subtext}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

export function InlineSpinner({ label }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
      <span className="w-4 h-4 rounded-full border-2 border-muted-foreground/70 border-t-transparent animate-spin" />
      {label && <span>{label}</span>}
    </span>
  );
}
