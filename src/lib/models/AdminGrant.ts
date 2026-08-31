import mongoose, { Schema, type Model } from 'mongoose';

export const GRANT_KINDS = ['flies', 'premium', 'item', 'background'] as const;
export type GrantKind = (typeof GRANT_KINDS)[number];

export type GrantStatus = 'applied' | 'failed' | 'reverted';

export interface AdminGrantDoc {
  _id: mongoose.Types.ObjectId;
  requestId: string;
  adminId: string;
  adminEmail: string;
  userId: string;
  userName?: string;
  userEmail?: string;
  kind: GrantKind;
  amount: number;
  itemId?: string;
  itemName?: string;
  reason: string;
  status: GrantStatus;
  error?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  revertedAt?: Date;
  revertedBy?: string;
  revertedByEmail?: string;
  revertResult?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const AdminGrantSchema = new Schema<AdminGrantDoc>(
  {
    requestId: { type: String, required: true },
    adminId: { type: String, required: true },
    adminEmail: { type: String, required: true },
    userId: { type: String, required: true },
    userName: { type: String },
    userEmail: { type: String },
    kind: { type: String, required: true, enum: GRANT_KINDS },
    amount: { type: Number, required: true },
    itemId: { type: String },
    itemName: { type: String },
    reason: { type: String, required: true },
    status: {
      type: String,
      required: true,
      enum: ['applied', 'failed', 'reverted'],
    },
    error: { type: String },
    before: { type: Schema.Types.Mixed },
    after: { type: Schema.Types.Mixed },
    revertedAt: { type: Date },
    revertedBy: { type: String },
    revertedByEmail: { type: String },
    revertResult: { type: Schema.Types.Mixed },
  },
  {
    collection: 'adminGrants',
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
  },
);

AdminGrantSchema.index({ requestId: 1 }, { unique: true });
AdminGrantSchema.index({ userId: 1, createdAt: -1 });
AdminGrantSchema.index({ adminId: 1, createdAt: -1 });
AdminGrantSchema.index({ createdAt: -1 });

if (process.env.NODE_ENV === 'development') {
  delete mongoose.models.AdminGrant;
}

const AdminGrantModel: Model<AdminGrantDoc> =
  (mongoose.models.AdminGrant as Model<AdminGrantDoc>) ||
  mongoose.model<AdminGrantDoc>('AdminGrant', AdminGrantSchema);

export default AdminGrantModel;
