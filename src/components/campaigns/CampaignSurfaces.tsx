'use client';

import React from 'react';
import { X } from 'lucide-react';
import { CampaignRiveArt, type RiveContents, type RiveSignal } from './CampaignRiveArt';
import type { CampaignPayload } from '@/lib/campaigns/types';

export type SurfaceProps = {
  campaign: CampaignPayload;
  onCta: () => void;
  onDismiss: () => void;
  onSignal?: (signal: RiveSignal) => void;
  onRiveContents?: (contents: RiveContents) => void;
};

export function NudgeBannerCard({
  campaign,
  onCta,
  onDismiss,
  onSignal,
  onRiveContents,
}: SurfaceProps) {
  const useRiveArt = campaign.art === 'rive' && !!campaign.riveUrl;
  return (
    <div className="flex items-center gap-3 rounded-[20px] bg-popover p-3 shadow-xl ring-1 ring-border">
      {useRiveArt ? (
        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-2xl">
          <CampaignRiveArt
            url={campaign.riveUrl}
            artboard={campaign.rive.artboard}
            stateMachine={campaign.rive.stateMachine}
            fit={campaign.rive.fit}
            buttons={campaign.rive.buttons}
            onSignal={onSignal}
            onContents={onRiveContents}
            className="h-full w-full"
          />
        </div>
      ) : campaign.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={campaign.imageUrl}
          alt=""
          className="h-12 w-12 shrink-0 rounded-2xl object-cover"
        />
      ) : null}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-black text-foreground">{campaign.copy.headline}</p>
        {campaign.copy.body ? (
          <p className="truncate text-xs font-semibold text-muted-foreground">
            {campaign.copy.body}
          </p>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onCta}
        className="shrink-0 rounded-xl bg-[#4f9149] px-3 py-2 text-xs font-black text-white"
      >
        {campaign.copy.ctaLabel}
      </button>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="shrink-0 rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
