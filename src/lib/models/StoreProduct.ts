import mongoose, { Schema, type Model } from 'mongoose';
import { REWARD_KINDS, type CampaignRewardGrant } from '@/lib/campaigns/types';

export const STORE_PRODUCT_STORES = ['apple', 'google', 'web', 'all'] as const;
export type StoreProductStore = (typeof STORE_PRODUCT_STORES)[number];

export const STORE_PRODUCT_KINDS = ['consumable', 'non_consumable', 'subscription'] as const;
export type StoreProductKind = (typeof STORE_PRODUCT_KINDS)[number];

export type StoreProductDoc = {
  productId: string;
  label: string;
  store: StoreProductStore;
  kind: StoreProductKind;
  /** Display only — the real price always comes from the store at runtime. */
  priceHint: string;
  flies: number;
  grants: CampaignRewardGrant[];
  offeringId: string;
  packageId: string;
  storeIds: string[];
  appleOfferId: string;
  googleOfferId: string;
  note: string;
  archived: boolean;
  createdAt: Date;
  updatedAt: Date;
};

const GrantSchema = new Schema<CampaignRewardGrant>(
  {
    kind: { type: String, enum: [...REWARD_KINDS], required: true },
    id: { type: String, default: '' },
    amount: { type: Number, default: 1, min: 0 },
  },
  { _id: false },
);

const StoreProductSchema = new Schema<StoreProductDoc>(
  {
    productId: { type: String, required: true, unique: true, index: true },
    label: { type: String, default: '' },
    store: { type: String, enum: [...STORE_PRODUCT_STORES], default: 'all' },
    kind: { type: String, enum: [...STORE_PRODUCT_KINDS], default: 'consumable' },
    priceHint: { type: String, default: '' },
    flies: { type: Number, default: 0, min: 0 },
    grants: { type: [GrantSchema], default: [] },
    offeringId: { type: String, default: '' },
    packageId: { type: String, default: '' },
    storeIds: { type: [String], default: [], index: true },
    appleOfferId: { type: String, default: '' },
    googleOfferId: { type: String, default: '' },
    note: { type: String, default: '' },
    archived: { type: Boolean, default: false },
  },
  { collection: 'storeProducts', timestamps: true },
);

const StoreProductModel: Model<StoreProductDoc> =
  (mongoose.models.StoreProduct as Model<StoreProductDoc>) ||
  mongoose.model<StoreProductDoc>('StoreProduct', StoreProductSchema);

export default StoreProductModel;

export function storeProductGrants(
  product: Pick<StoreProductDoc, 'flies' | 'grants'>,
): CampaignRewardGrant[] {
  const grants = (product.grants ?? []).filter(
    (grant) => grant.kind !== 'plus_days' && grant.amount > 0,
  );
  return product.flies > 0 ? [{ kind: 'flies', amount: product.flies }, ...grants] : grants;
}
