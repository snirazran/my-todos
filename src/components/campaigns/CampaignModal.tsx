'use client';

import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useRegisterOpenSheet } from '@/lib/sheetStore';
import { CampaignCanvasView } from './CampaignCanvasView';
import type { CampaignElement, CampaignPayload } from '@/lib/campaigns/types';
import type { RiveSignal } from './CampaignRiveArt';

/**
 * A campaign popup is a dialog, not a sheet: the artwork sits centred over a
 * darkened page, the same on a phone and on the web. Sheets read as "something
 * I opened"; this has to read as "something the app is telling me".
 */
export function CampaignModal({
  campaign,
  onActivate,
  onDismiss,
  onSignal,
}: {
  campaign: CampaignPayload;
  onActivate: (element: CampaignElement) => void;
  onDismiss: () => void;
  onSignal?: (signal: RiveSignal) => void;
}) {
  useRegisterOpenSheet(true);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onDismiss();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDismiss]);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="campaign-modal"
        className="fixed inset-0 z-[1750] flex items-center justify-center px-4 py-[max(env(safe-area-inset-top),1rem)]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
      >
        <div
          className="absolute inset-0 bg-black/70 backdrop-blur-sm"
          onClick={onDismiss}
          aria-hidden
        />
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label={campaign.name}
          className="relative flex max-h-full w-full justify-center"
          initial={{ opacity: 0, scale: 0.92, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 8 }}
          transition={{ type: 'spring', stiffness: 420, damping: 32 }}
        >
          <CampaignCanvasView
            campaign={campaign}
            onActivate={onActivate}
            onDismiss={onDismiss}
            onSignal={onSignal}
          />
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}
