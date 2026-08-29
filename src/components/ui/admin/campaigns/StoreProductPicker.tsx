'use client';

import React, { useState } from 'react';
import { CreditCard, Loader2, Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Field, Select, TextInput } from './primitives';

export type StoreProductRow = {
  productId: string;
  label: string;
  store: 'apple' | 'google' | 'web' | 'all';
  kind: 'consumable' | 'non_consumable' | 'subscription';
  priceHint: string;
  note: string;
  source: 'shop' | 'registered';
};

const STORE_LABELS: Record<StoreProductRow['store'], string> = {
  all: 'All stores',
  apple: 'Apple only',
  google: 'Google only',
  web: 'Web only',
};

const KIND_LABELS: Record<StoreProductRow['kind'], string> = {
  consumable: 'Consumable',
  non_consumable: 'One-off unlock',
  subscription: 'Subscription',
};

/**
 * Which product a button charges for.
 *
 * The fly shop's own packs are listed because they are the common case, but the
 * point of this control is the second list: identifiers that exist in App Store
 * Connect or Play and are deliberately not in the shop, so an offer can be
 * priced and launched without shipping a build.
 */
export function StoreProductPicker({
  value,
  products,
  loading,
  onChange,
  onRegister,
  onArchive,
}: {
  value: string;
  products: StoreProductRow[];
  loading: boolean;
  onChange: (productId: string) => void;
  onRegister: (product: {
    productId: string;
    label: string;
    store: StoreProductRow['store'];
    kind: StoreProductRow['kind'];
    priceHint: string;
  }) => Promise<void>;
  onArchive: (productId: string) => Promise<void>;
}) {
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState({
    productId: '',
    label: '',
    store: 'all' as StoreProductRow['store'],
    kind: 'consumable' as StoreProductRow['kind'],
    priceHint: '',
  });

  const shop = products.filter((product) => product.source === 'shop');
  const custom = products.filter((product) => product.source === 'registered');
  const selected = products.find((product) => product.productId === value);
  // A live campaign can point at a product that was later archived; hiding it
  // would silently change what the button charges for.
  const unknown = !!value && !selected;

  const register = async () => {
    if (!draft.productId.trim()) return;
    setBusy(true);
    try {
      await onRegister(draft);
      onChange(draft.productId.trim());
      setDraft({ productId: '', label: '', store: 'all', kind: 'consumable', priceHint: '' });
      setAdding(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <select
        value={unknown ? '__unknown' : value}
        onChange={(event) => onChange(event.target.value === '__none' ? '' : event.target.value)}
        className={cn(
          'h-10 w-full cursor-pointer rounded-xl bg-muted px-3 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-primary',
          unknown && 'ring-2 ring-amber-500',
        )}
      >
        <option value="__none">Pick a product…</option>
        {unknown ? (
          <option value="__unknown">{value} — not in the list any more</option>
        ) : null}
        {shop.length ? (
          <optgroup label="Sold in the fly shop">
            {shop.map((product) => (
              <option key={product.productId} value={product.productId}>
                {product.label} {product.priceHint ? `· ${product.priceHint}` : ''}
              </option>
            ))}
          </optgroup>
        ) : null}
        {custom.length ? (
          <optgroup label="Offer-only products">
            {custom.map((product) => (
              <option key={product.productId} value={product.productId}>
                {product.label} {product.priceHint ? `· ${product.priceHint}` : ''}
              </option>
            ))}
          </optgroup>
        ) : null}
      </select>

      {unknown ? (
        <p className="rounded-lg bg-amber-500/10 px-2.5 py-1.5 text-[11px] font-bold text-amber-600 dark:text-amber-400">
          This button still charges for <span className="font-mono">{value}</span>, which is no
          longer registered. Register it again or pick another product.
        </p>
      ) : null}

      {selected ? (
        <div className="flex items-center gap-2 rounded-lg bg-muted/60 px-2.5 py-1.5">
          <CreditCard className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-mono text-[11px] font-bold">
              {selected.productId}
            </span>
            <span className="block truncate text-[10px] font-bold text-muted-foreground">
              {STORE_LABELS[selected.store]} · {KIND_LABELS[selected.kind]}
              {selected.note ? ` · ${selected.note}` : ''}
            </span>
          </span>
          {selected.source === 'registered' ? (
            <button
              type="button"
              onClick={() => void onArchive(selected.productId)}
              aria-label="Remove from the list"
              className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-500"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
      ) : null}

      {adding ? (
        <div className="space-y-2 rounded-xl bg-muted/60 p-2.5">
          <Field
            label="Product id"
            hint="Exactly as it appears in App Store Connect, Play Console or RevenueCat."
          >
            <TextInput
              value={draft.productId}
              placeholder="io.frog.tasks.offer.starter_bundle"
              onChange={(productId) => setDraft({ ...draft, productId })}
            />
          </Field>
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="Shown as">
              <TextInput
                value={draft.label}
                placeholder="Starter bundle"
                onChange={(label) => setDraft({ ...draft, label })}
              />
            </Field>
            <Field label="Price note" help="Display only — the real price comes from the store.">
              <TextInput
                value={draft.priceHint}
                placeholder="$4.99"
                onChange={(priceHint) => setDraft({ ...draft, priceHint })}
              />
            </Field>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="Available on">
              <Select
                value={draft.store}
                options={(
                  Object.keys(STORE_LABELS) as StoreProductRow['store'][]
                ).map((store) => ({ value: store, label: STORE_LABELS[store] }))}
                onChange={(store) => setDraft({ ...draft, store })}
              />
            </Field>
            <Field label="Type">
              <Select
                value={draft.kind}
                options={(Object.keys(KIND_LABELS) as StoreProductRow['kind'][]).map((kind) => ({
                  value: kind,
                  label: KIND_LABELS[kind],
                }))}
                onChange={(kind) => setDraft({ ...draft, kind })}
              />
            </Field>
          </div>
          <p className="text-[11px] font-medium leading-snug text-muted-foreground">
            Registering only makes the id pickable here. What a purchase is worth is still
            decided by the store webhook, exactly as it is for a shop pack.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void register()}
              disabled={busy || !draft.productId.trim()}
              className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-foreground text-xs font-black text-background disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Add product'}
            </button>
            <button
              type="button"
              onClick={() => setAdding(false)}
              className="h-9 rounded-lg px-3 text-xs font-black text-muted-foreground"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex items-center gap-1 text-[11px] font-black text-primary"
        >
          {loading ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Plus className="h-3 w-3" />
          )}
          Register a product that isn&apos;t in the shop
        </button>
      )}
    </div>
  );
}
