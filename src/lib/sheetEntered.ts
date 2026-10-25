'use client';

import { createContext, useCallback, useContext, useState } from 'react';

export const SheetEnteredContext = createContext(true);

export const useSheetEntered = () => useContext(SheetEnteredContext);

export function useEntrance(open: boolean) {
  const [entered, setEntered] = useState(false);
  const [seenOpen, setSeenOpen] = useState(open);
  if (open !== seenOpen) {
    setSeenOpen(open);
    setEntered(false);
  }
  const markEntered = useCallback(() => setEntered(true), []);
  return { entered, markEntered };
}
