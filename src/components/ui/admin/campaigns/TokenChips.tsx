'use client';

import React from 'react';
import { TEXT_TOKENS } from '@/lib/campaigns/tokens';
import { Hint } from './primitives';

export function TokenChips({
  timer = false,
  onInsert,
}: {
  timer?: boolean;
  onInsert: (token: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {TEXT_TOKENS.filter((item) => timer || item.token !== '{time}').map((item) => (
        <Hint key={item.token} text={item.help}>
          <button
            type="button"
            onClick={() => onInsert(item.token)}
            className="rounded-md bg-background px-1.5 py-0.5 font-mono text-[10px] font-black text-muted-foreground ring-1 ring-border transition-colors hover:text-foreground"
          >
            {item.token}
          </button>
        </Hint>
      ))}
    </div>
  );
}

export const appendToken = (text: string | undefined, token: string) => {
  const current = text ?? '';
  return current && !/\s$/.test(current) ? `${current} ${token}` : `${current}${token}`;
};
