'use client';

import React from 'react';
import { AlertTriangle, CreditCard } from 'lucide-react';
import { FLY_PACKS } from '@/lib/flyPacks';
import { actionIsComplete } from '@/lib/campaigns/review';
import {
  CTA_ACTIONS,
  CTA_ACTION_NEEDS,
  CTA_HELP,
  CTA_LABELS,
  PURCHASING_ACTIONS,
  SIGNAL_ACTION_LABELS,
  type CampaignReward,
  type CtaAction,
  type SignalAction,
} from '@/lib/campaigns/types';
import { Field, Select, TextInput } from './primitives';
import { RewardEditor, type RewardCatalogEntry } from './RewardEditor';
import { StoreProductPicker, type StoreProductRow } from './StoreProductPicker';

export type ActionConfig = {
  action: CtaAction;
  path?: string;
  packId?: string;
  productId?: string;
  reward?: CampaignReward;
};

export type ActionEnv = {
  products: StoreProductRow[];
  productsLoading: boolean;
  catalog: RewardCatalogEntry[];
  registerProduct: (product: {
    productId: string;
    label: string;
    store: StoreProductRow['store'];
    kind: StoreProductRow['kind'];
    priceHint: string;
  }) => Promise<void>;
  archiveProduct: (productId: string) => Promise<void>;
};

/**
 * One control for "what does pressing this do", and the single place that
 * knows which extra setting each answer needs. Every button in the editor —
 * canvas element, banner CTA, Rive signal — routes through it, so an action
 * added to the vocabulary is configurable everywhere at once.
 */
export function ActionPicker({
  config,
  env,
  onChange,
  label = 'Pressing it does',
  /** Rive buttons can also inherit the campaign's main action. */
  allowInherit = false,
  inheritValue,
  onInheritChange,
}: {
  config: ActionConfig;
  env: ActionEnv;
  onChange: (partial: Partial<ActionConfig>) => void;
  label?: string;
  allowInherit?: boolean;
  inheritValue?: SignalAction;
  onInheritChange?: (action: SignalAction) => void;
}) {
  const inheriting = allowInherit && inheritValue === 'cta';
  const need = CTA_ACTION_NEEDS[config.action];
  const complete = actionIsComplete(config.action, config);
  const charges = PURCHASING_ACTIONS.includes(config.action);

  return (
    <div className="space-y-2">
      <Field label={label} help={inheriting ? undefined : CTA_HELP[config.action]}>
        {allowInherit ? (
          <Select
            value={inheritValue ?? 'cta'}
            options={[
              { value: 'cta' as SignalAction, label: SIGNAL_ACTION_LABELS.cta },
              ...CTA_ACTIONS.map((action) => ({
                value: action as SignalAction,
                label: CTA_LABELS[action],
              })),
            ]}
            onChange={(next) => onInheritChange?.(next)}
          />
        ) : (
          <Select
            value={config.action}
            options={CTA_ACTIONS.map((action) => ({
              value: action,
              label: CTA_LABELS[action],
            }))}
            onChange={(action) => onChange({ action })}
          />
        )}
      </Field>

      {inheriting ? (
        <p className="text-[11px] font-medium leading-snug text-muted-foreground">
          Uses whatever the campaign&apos;s main button is set to, so changing it in one place
          changes it everywhere.
        </p>
      ) : (
        <>
          <p className="text-[11px] font-medium leading-snug text-muted-foreground">
            {CTA_HELP[config.action]}
          </p>

          {charges ? (
            <p className="flex items-start gap-1.5 rounded-lg bg-amber-500/10 px-2.5 py-1.5 text-[11px] font-bold text-amber-600 dark:text-amber-400">
              <CreditCard className="mt-px h-3.5 w-3.5 shrink-0" />
              This takes real money. The store&apos;s own confirmation sheet is the only step
              between the tap and the charge, so keep it away from a close button.
            </p>
          ) : null}

          {need === 'path' ? (
            <Field label="Path" hint="An in-app route, e.g. /wardrobe?tab=shop">
              <TextInput
                value={config.path ?? ''}
                placeholder="/wardrobe?tab=shop"
                invalid={!complete}
                onChange={(path) => onChange({ path })}
              />
            </Field>
          ) : null}

          {need === 'pack' ? (
            <Field
              label={config.action === 'buy_pack' ? 'Charge for' : 'Highlight pack'}
              help={
                config.action === 'buy_pack'
                  ? 'The pack the payment sheet opens on.'
                  : 'Optional — scrolls the shop to this pack and marks it.'
              }
            >
              <Select
                value={config.packId ?? ''}
                options={[
                  {
                    value: '',
                    label: config.action === 'buy_pack' ? 'Pick a pack…' : 'No pack',
                  },
                  ...FLY_PACKS.map((pack) => ({
                    value: pack.id as string,
                    label: `${pack.id} · ${pack.amount.toLocaleString()} flies · $${pack.priceUsd}`,
                  })),
                ]}
                onChange={(packId) => onChange({ packId })}
              />
            </Field>
          ) : null}

          {need === 'product' ? (
            <Field label="Charge for" help="Any product id the stores know about.">
              <StoreProductPicker
                value={config.productId ?? ''}
                products={env.products}
                loading={env.productsLoading}
                onChange={(productId) => onChange({ productId })}
                onRegister={env.registerProduct}
                onArchive={env.archiveProduct}
              />
            </Field>
          ) : null}

          {need === 'reward' ? (
            <RewardEditor
              reward={config.reward}
              catalog={env.catalog}
              onChange={(reward) => onChange({ reward })}
            />
          ) : null}

          {!complete ? (
            <p className="flex items-center gap-1.5 text-[11px] font-bold text-red-500">
              <AlertTriangle className="h-3.5 w-3.5" />
              Pressing this would currently do nothing.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
