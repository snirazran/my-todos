'use client';

import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CreditCard,
  Crown,
  Loader2,
  Package,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { REWARD_KINDS, type CampaignRewardGrant } from '@/lib/campaigns/types';
import {
  OFFER_KIND_LABELS,
  OFFER_STORE_LABELS,
  describeGrants,
  type OfferCatalogPackage,
  type OfferProductInput,
  type OfferProductKind,
  type OfferProductRow,
  type OfferProductsResponse,
  type OfferStore,
} from '@/lib/campaigns/offerProducts';
import { Field, Select, TextInput } from './primitives';
import { RewardEditor, type RewardCatalogEntry } from './RewardEditor';

export type OfferEnv = {
  products: OfferProductRow[];
  catalog: OfferProductsResponse['catalog'] | null;
  loading: boolean;
  rewardCatalog: RewardCatalogEntry[];
  refresh: () => Promise<void>;
  save: (input: OfferProductInput) => Promise<string | null>;
  archive: (ref: string) => Promise<void>;
};

const COVERED_STORES: OfferStore[] = ['app_store', 'play_store', 'paddle'];
const BUNDLE_KINDS = REWARD_KINDS.filter((kind) => kind !== 'plus_days');

type Draft = OfferProductInput & { kind: OfferProductKind; title: string };

export function StoreCoverage({ stores }: { stores: OfferStore[] }) {
  if (!stores.length) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {COVERED_STORES.map((store) => {
        const sold = stores.includes(store);
        return (
          <span
            key={store}
            title={sold ? `Sold on ${OFFER_STORE_LABELS[store]}` : `Not sold on ${OFFER_STORE_LABELS[store]} yet`}
            className={cn(
              'flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-black',
              sold
                ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                : 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
            )}
          >
            {sold ? <Check className="h-2.5 w-2.5" /> : <X className="h-2.5 w-2.5" />}
            {OFFER_STORE_LABELS[store]}
          </span>
        );
      })}
    </span>
  );
}

function KindIcon({ kind }: { kind: OfferProductKind }) {
  return kind === 'subscription' ? (
    <Crown className="h-4 w-4 text-amber-500" />
  ) : (
    <Package className="h-4 w-4 text-muted-foreground" />
  );
}

function contentsLine(row: Pick<OfferProductRow, 'kind' | 'grants'>, nameOf: (grant: CampaignRewardGrant) => string | undefined) {
  const extras = describeGrants(row.grants, nameOf);
  if (row.kind === 'subscription') return extras ? `Plus subscription + ${extras}` : 'Plus subscription';
  return extras || 'Delivers nothing yet';
}

function ProductRow({
  row,
  nameOf,
  active,
  onClick,
}: {
  row: OfferProductRow;
  nameOf: (grant: CampaignRewardGrant) => string | undefined;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors',
        active ? 'bg-primary/10 ring-1 ring-primary' : 'hover:bg-background',
      )}
    >
      <KindIcon kind={row.kind} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-black">{row.label}</span>
        <span className="block truncate text-[10px] font-bold text-muted-foreground">
          {contentsLine(row, nameOf)}
        </span>
      </span>
      <StoreCoverage stores={row.stores} />
    </button>
  );
}

/** Which product a button charges for. */
export function StoreProductPicker({
  value,
  env,
  onChange,
  allowShop = true,
  allowNone = false,
}: {
  value: string;
  env: OfferEnv;
  onChange: (ref: string) => void;
  allowShop?: boolean;
  allowNone?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const nameOf = useMemo(() => {
    const names = new Map(env.rewardCatalog.map((entry) => [`${entry.kind}:${entry.id}`, entry.name]));
    return (grant: CampaignRewardGrant) => names.get(`${grant.kind}:${grant.id}`);
  }, [env.rewardCatalog]);

  const selected = env.products.find((row) => row.ref === value);
  const unknown = !!value && !selected && !env.loading;
  const offers = env.products.filter((row) => row.source === 'registered');
  const shop = env.products.filter((row) => row.source === 'shop');
  const fresh = (env.catalog?.packages ?? []).filter((pkg) => !pkg.inUse);
  const connected = !!env.catalog?.configured && !env.catalog.error;

  const pick = (ref: string) => {
    onChange(ref);
    setOpen(false);
  };

  const startFromPackage = (pkg: OfferCatalogPackage) =>
    setDraft({
      title: `Set up "${pkg.packageName}"`,
      offeringId: pkg.offeringId,
      packageId: pkg.packageId,
      label: pkg.packageName,
      kind: pkg.kind,
      grants: [],
    });

  const startEdit = (row: OfferProductRow) =>
    setDraft({
      title: `Edit "${row.label}"`,
      ref: row.ref,
      offeringId: row.offeringId,
      packageId: row.packageId,
      label: row.label,
      kind: row.kind,
      grants: row.grants,
      appleOfferId: row.appleOfferId,
      googleOfferId: row.googleOfferId,
    });

  const startLegacy = () =>
    setDraft({ title: 'Register a store product id', ref: '', label: '', kind: 'consumable', grants: [] });

  const submit = async () => {
    if (!draft) return;
    setBusy(true);
    try {
      const ref = await env.save(draft);
      if (ref) {
        setDraft(null);
        pick(ref);
      }
    } finally {
      setBusy(false);
    }
  };

  const refresh = async () => {
    setRefreshing(true);
    try {
      await env.refresh();
    } finally {
      setRefreshing(false);
    }
  };

  if (draft) {
    return (
      <OfferForm
        draft={draft}
        busy={busy}
        catalog={env.rewardCatalog}
        onChange={setDraft}
        onSubmit={() => void submit()}
        onCancel={() => setDraft(null)}
      />
    );
  }

  return (
    <div className="space-y-2">
      {selected ? (
        <div className="space-y-1.5 rounded-xl bg-muted/60 p-2.5">
          <div className="flex items-center gap-2">
            <KindIcon kind={selected.kind} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-black">{selected.label}</span>
              <span className="block truncate text-[10px] font-bold text-muted-foreground">
                {OFFER_KIND_LABELS[selected.kind]} · {contentsLine(selected, nameOf)}
              </span>
            </span>
            {selected.source === 'registered' ? (
              <button
                type="button"
                onClick={() => startEdit(selected)}
                aria-label="Edit what it delivers"
                className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
          <StoreCoverage stores={selected.stores} />
          {selected.missing ? (
            <p className="text-[11px] font-bold text-red-500">
              This package is gone from RevenueCat — the button can&apos;t charge for it.
            </p>
          ) : null}
          {selected.kind === 'subscription' && (selected.appleOfferId || selected.googleOfferId) ? (
            <p className="text-[10px] font-bold text-muted-foreground">
              Discount at checkout:{' '}
              {[
                selected.appleOfferId ? `iOS "${selected.appleOfferId}"` : '',
                selected.googleOfferId ? `Android "${selected.googleOfferId}"` : '',
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          ) : null}
        </div>
      ) : null}

      {unknown ? (
        <p className="flex items-start gap-1.5 rounded-lg bg-amber-500/10 px-2.5 py-1.5 text-[11px] font-bold text-amber-600 dark:text-amber-400">
          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
          <span>
            Still set to <span className="font-mono">{value}</span>, which is no longer set up.
            Pick another product.
          </span>
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          className="flex h-8 items-center gap-1.5 rounded-lg bg-foreground px-3 text-[11px] font-black text-background"
        >
          <CreditCard className="h-3.5 w-3.5" />
          {open ? 'Close' : selected ? 'Change product' : 'Choose a product'}
        </button>
        {allowNone && value ? (
          <button
            type="button"
            onClick={() => onChange('')}
            className="h-8 rounded-lg px-2.5 text-[11px] font-black text-muted-foreground hover:text-foreground"
          >
            Clear
          </button>
        ) : null}
      </div>

      {open ? (
        <div className="space-y-2.5 rounded-xl bg-muted/60 p-2">
          {env.loading ? (
            <div className="flex h-16 items-center justify-center">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : null}

          {offers.length ? (
            <Section title="Your offers">
              {offers.map((row) => (
                <div key={row.ref} className="flex items-center gap-1">
                  <div className="min-w-0 flex-1">
                    <ProductRow row={row} nameOf={nameOf} active={row.ref === value} onClick={() => pick(row.ref)} />
                  </div>
                  <button
                    type="button"
                    onClick={() => void env.archive(row.ref)}
                    aria-label={`Remove ${row.label}`}
                    title="Remove from this list — purchases already made still deliver"
                    className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-500"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </Section>
          ) : null}

          {connected && fresh.length ? (
            <Section title="New in RevenueCat — set up to use">
              {fresh.map((pkg) => (
                <button
                  key={`${pkg.offeringId}/${pkg.packageId}`}
                  type="button"
                  onClick={() => startFromPackage(pkg)}
                  className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-background"
                >
                  <KindIcon kind={pkg.kind} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-black">{pkg.packageName}</span>
                    <span className="block truncate text-[10px] font-bold text-muted-foreground">
                      {OFFER_KIND_LABELS[pkg.kind]} · offering &quot;{pkg.offeringName}&quot;
                    </span>
                  </span>
                  <StoreCoverage stores={pkg.stores} />
                  <span className="flex shrink-0 items-center gap-0.5 rounded-lg bg-primary px-2 py-1 text-[10px] font-black text-primary-foreground">
                    <Plus className="h-3 w-3" />
                    Set up
                  </span>
                </button>
              ))}
            </Section>
          ) : null}

          {allowShop && shop.length ? (
            <Section title="Fly shop packs">
              {shop.map((row) => (
                <ProductRow key={row.ref} row={row} nameOf={nameOf} active={row.ref === value} onClick={() => pick(row.ref)} />
              ))}
            </Section>
          ) : null}

          {env.catalog && !env.catalog.configured ? (
            <p className="rounded-lg bg-amber-500/10 px-2.5 py-2 text-[11px] font-bold leading-snug text-amber-600 dark:text-amber-400">
              RevenueCat isn&apos;t connected, so its products can&apos;t be listed. Add a v2
              secret key with read access to the project configuration as{' '}
              <span className="font-mono">REVENUECAT_V2_SECRET_KEY</span> on the server.
            </p>
          ) : null}
          {env.catalog?.error ? (
            <p className="rounded-lg bg-red-500/10 px-2.5 py-2 text-[11px] font-bold text-red-500">
              RevenueCat: {env.catalog.error}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-2 px-1">
            <button
              type="button"
              onClick={() => void refresh()}
              className="flex items-center gap-1 text-[11px] font-black text-primary"
            >
              <RefreshCw className={cn('h-3 w-3', refreshing && 'animate-spin')} />
              Refresh from RevenueCat
            </button>
            {!connected ? (
              <button
                type="button"
                onClick={startLegacy}
                className="flex items-center gap-1 text-[11px] font-black text-muted-foreground hover:text-foreground"
              >
                <Plus className="h-3 w-3" />
                Register by store product id
              </button>
            ) : null}
          </div>

          <HowToAddProduct />
        </div>
      ) : null}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <p className="px-1 text-[10px] font-black uppercase tracking-wide text-muted-foreground">{title}</p>
      {children}
    </div>
  );
}

function HowToAddProduct() {
  return (
    <details className="rounded-lg bg-background px-2.5 py-2 text-[11px] font-medium leading-snug text-muted-foreground">
      <summary className="cursor-pointer font-black text-foreground">How to add something new to sell</summary>
      <ol className="mt-1.5 list-decimal space-y-1 pl-4">
        <li>
          Create it in each store: App Store Connect, Google Play Console and Paddle. A bundle is a
          one-time (consumable) product; a Plus offer is a new subscription in the same subscription
          group as Plus.
        </li>
        <li>
          For a discounted Plus, give that subscription an introductory offer — App Store
          &quot;Introductory offer&quot; (pay up front or pay as you go), a Play offer on the base
          plan, a discounted first period on the Paddle price. Eligible people get it automatically.
        </li>
        <li>
          In RevenueCat, import each store&apos;s product, then add a package for it to an offering
          (e.g. one called <span className="font-mono">offers</span>) with every store&apos;s product
          attached.
        </li>
        <li>Come back, tap Refresh, and set up the package from the list above.</li>
      </ol>
    </details>
  );
}

function OfferForm({
  draft,
  busy,
  catalog,
  onChange,
  onSubmit,
  onCancel,
}: {
  draft: Draft;
  busy: boolean;
  catalog: RewardCatalogEntry[];
  onChange: (draft: Draft) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const subscription = draft.kind === 'subscription';
  const legacy = !draft.offeringId && draft.ref !== undefined && !draft.packageId;
  const canSave =
    !!draft.label.trim() &&
    (subscription || draft.grants.length > 0) &&
    (!legacy || !!draft.ref?.trim());

  return (
    <div className="space-y-2.5 rounded-xl bg-muted/60 p-2.5">
      <p className="text-xs font-black">{draft.title}</p>

      {legacy ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <Field label="Store product id" hint="Exactly as App Store Connect or Play Console shows it.">
            <TextInput
              value={draft.ref ?? ''}
              placeholder="io.frog.tasks.offer.starter"
              onChange={(ref) => onChange({ ...draft, ref })}
            />
          </Field>
          <Field label="Type">
            <Select
              value={draft.kind}
              options={(Object.keys(OFFER_KIND_LABELS) as OfferProductKind[]).map((kind) => ({
                value: kind,
                label: OFFER_KIND_LABELS[kind],
              }))}
              onChange={(kind) => onChange({ ...draft, kind })}
            />
          </Field>
        </div>
      ) : null}

      <Field label="Name" help="Only admins see this — the popup's own artwork names it for users.">
        <TextInput
          value={draft.label}
          placeholder={subscription ? 'Plus — 50% off first year' : 'Starter bundle'}
          onChange={(label) => onChange({ ...draft, label })}
        />
      </Field>

      {subscription ? (
        <p className="rounded-lg bg-amber-500/10 px-2.5 py-2 text-[11px] font-bold leading-snug text-amber-700 dark:text-amber-400">
          Buying this starts a real Plus subscription. Its discount comes from the store: an
          introductory offer on the product applies by itself to anyone eligible, and the popup
          shows that discounted price with <span className="font-mono">{'{price}'}</span> and the
          renewal price with <span className="font-mono">{'{regular_price}'}</span>.
        </p>
      ) : null}

      <RewardEditor
        reward={{ grants: draft.grants, limit: 'once' }}
        catalog={catalog}
        kinds={BUNDLE_KINDS}
        showLimit={false}
        title={subscription ? 'Bonus when the first payment goes through' : 'Buying it delivers'}
        emptyText={
          subscription
            ? 'Nothing extra — just the subscription.'
            : 'Nothing yet. Add flies, items or backgrounds.'
        }
        onChange={(reward) => onChange({ ...draft, grants: reward.grants })}
      />

      {subscription ? (
        <p className="text-[10px] font-medium leading-snug text-muted-foreground">
          Bonus items land once, when the first paid period starts — never during a free trial, so a
          cancelled trial doesn&apos;t keep them. Plus days can&apos;t be added here: they would
          expire, which paid content isn&apos;t allowed to do.
        </p>
      ) : (
        <p className="text-[10px] font-medium leading-snug text-muted-foreground">
          Delivered by the purchase webhook once the store confirms payment. Plus days are
          deliberately not offered: paid items must not expire. Sell Plus as a subscription
          instead.
        </p>
      )}

      {subscription ? (
        <div className="space-y-2 rounded-lg bg-background p-2.5">
          <p className="text-[11px] font-black">Targeted discount (optional)</p>
          <p className="text-[10px] font-medium leading-snug text-muted-foreground">
            For people the introductory offer doesn&apos;t reach — lapsed or past subscribers. Leave
            blank to rely on the introductory offer alone.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <Field
              label="iOS promotional offer id"
              help="App Store Connect → the subscription → Promotional Offers. Needs the In-App Purchase key uploaded to RevenueCat. Only people who have subscribed before can redeem it."
            >
              <TextInput
                value={draft.appleOfferId ?? ''}
                placeholder="plus_winback_50"
                onChange={(appleOfferId) => onChange({ ...draft, appleOfferId })}
              />
            </Field>
            <Field
              label="Google Play offer id"
              help="Play Console → the subscription → base plan → Offers. Tag it rc-ignore-offer so the normal paywall never picks it by itself."
            >
              <TextInput
                value={draft.googleOfferId ?? ''}
                placeholder="winback-50"
                onChange={(googleOfferId) => onChange({ ...draft, googleOfferId })}
              />
            </Field>
          </div>
        </div>
      ) : null}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onSubmit}
          disabled={busy || !canSave}
          className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-foreground text-xs font-black text-background disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Save and use'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="h-9 rounded-lg px-3 text-xs font-black text-muted-foreground"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
