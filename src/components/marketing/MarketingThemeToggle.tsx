'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';

export function MarketingThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const isDark = mounted && resolvedTheme === 'dark';

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      aria-label={mounted ? `Switch to ${isDark ? 'light' : 'dark'} mode` : 'Toggle theme'}
      title={mounted ? `Switch to ${isDark ? 'light' : 'dark'} mode` : 'Toggle theme'}
      className="grid h-10 w-10 place-items-center rounded-full border border-white/70 bg-white/80 text-[#1b4030] shadow-sm backdrop-blur-xl transition-colors hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary dark:border-white/20 dark:bg-white/10 dark:text-[#e6f3e9] dark:hover:bg-white/20"
    >
      {mounted ? (
        isDark ? (
          <Moon className="h-[18px] w-[18px]" aria-hidden />
        ) : (
          <Sun className="h-[18px] w-[18px]" aria-hidden />
        )
      ) : (
        <span className="h-[18px] w-[18px]" aria-hidden />
      )}
    </button>
  );
}
