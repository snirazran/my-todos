import mongoose, { Schema, type Model } from 'mongoose';

export type ApiTokenKind = 'pat' | 'refresh';

export interface ApiTokenDoc {
  _id?: mongoose.Types.ObjectId;
  userId: string;
  kind: ApiTokenKind;
  tokenHash: string;
  prefix: string;
  name: string;
  scopes: string[];
  clientId?: string;
  resource?: string;
  createdAt: Date;
  lastUsedAt?: Date;
  expiresAt?: Date;
  revokedAt?: Date;
}

const ApiTokenSchema = new Schema<ApiTokenDoc>(
  {
    userId: { type: String, ref: 'User', required: true, index: true },
    kind: { type: String, enum: ['pat', 'refresh'], required: true },
    tokenHash: { type: String, required: true, unique: true },
    prefix: { type: String, required: true },
    name: { type: String, default: '' },
    scopes: { type: [String], default: [] },
    clientId: { type: String },
    resource: { type: String },
    createdAt: { type: Date, default: Date.now },
    lastUsedAt: { type: Date },
    expiresAt: { type: Date },
    revokedAt: { type: Date },
  },
  { collection: 'api_tokens' },
);

ApiTokenSchema.index({ userId: 1, kind: 1, createdAt: -1 });
ApiTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

if (process.env.NODE_ENV === 'development') {
  delete mongoose.models.ApiToken;
}

const ApiTokenModel: Model<ApiTokenDoc> =
  (mongoose.models.ApiToken as Model<ApiTokenDoc>) ||
  mongoose.model<ApiTokenDoc>('ApiToken', ApiTokenSchema);

export default ApiTokenModel;
