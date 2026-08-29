import mongoose, { Schema, type Model } from 'mongoose';

export const STORE_PRODUCT_STORES = ['apple', 'google', 'web', 'all'] as const;
export type StoreProductStore = (typeof STORE_PRODUCT_STORES)[number];

export const STORE_PRODUCT_KINDS = ['consumable', 'non_consumable', 'subscription'] as const;
export type StoreProductKind = (typeof STORE_PRODUCT_KINDS)[number];

/**
 * A product identifier this app can charge for that the fly shop does not
 * sell — the offer-only SKUs a campaign exists to put in front of someone.
 *
 * The shop's own packs are compiled in (`FLY_PACKS`) because they are load
 * bearing; these are registered by an admin, so an offer can be launched
 * without a deploy. Nothing here grants anything: what a purchase is worth is
 * decided by the store webhook, exactly as it is for a shop pack.
 */
export type StoreProductDoc = {
  productId: string;
  label: string;
  store: StoreProductStore;
  kind: StoreProductKind;
  /** Display only — the real price always comes from the store at runtime. */
  priceHint: string;
  note: string;
  archived: boolean;
  createdAt: Date;
  updatedAt: Date;
};

const StoreProductSchema = new Schema<StoreProductDoc>(
  {
    productId: { type: String, required: true, unique: true, index: true },
    label: { type: String, default: '' },
    store: { type: String, enum: [...STORE_PRODUCT_STORES], default: 'all' },
    kind: { type: String, enum: [...STORE_PRODUCT_KINDS], default: 'consumable' },
    priceHint: { type: String, default: '' },
    note: { type: String, default: '' },
    archived: { type: Boolean, default: false },
  },
  { collection: 'storeProducts', timestamps: true },
);

const StoreProductModel: Model<StoreProductDoc> =
  (mongoose.models.StoreProduct as Model<StoreProductDoc>) ||
  mongoose.model<StoreProductDoc>('StoreProduct', StoreProductSchema);

export default StoreProductModel;
