'use client';

import { createContext, useCallback, useContext } from 'react';
import {
  EMPTY_TOKEN_VALUES,
  fillTokens,
  textPriceRef,
  type CampaignTokenValues,
} from '@/lib/campaigns/tokens';
import type { CampaignOffer, CtaAction, RiveInputValue } from '@/lib/campaigns/types';

export const CampaignTokensContext = createContext<CampaignTokenValues>(EMPTY_TOKEN_VALUES);

export function useTokenFill(
  campaign: { offer: CampaignOffer },
  owner: { action?: CtaAction; packId?: string; productId?: string } | null,
) {
  const values = useContext(CampaignTokensContext);
  const priceRef = textPriceRef(owner, campaign);
  const compareRef = campaign.offer.compareRef ?? '';
  return useCallback(
    (text: string | undefined) => fillTokens(text ?? '', values, priceRef, compareRef),
    [compareRef, priceRef, values],
  );
}

export const fillRiveInputs = (
  inputs: RiveInputValue[] | undefined,
  fill: (text: string) => string,
) =>
  inputs?.map((input) =>
    typeof input.value === 'string' ? { ...input, value: fill(input.value) } : input,
  );
