import mongoose, { Schema, type Model } from 'mongoose';

export interface OAuthCodeDoc {
  _id?: mongoose.Types.ObjectId;
  codeHash: string;
  userId: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  scopes: string[];
  resource: string;
  createdAt: Date;
  expiresAt: Date;
  usedAt?: Date;
}

const OAuthCodeSchema = new Schema<OAuthCodeDoc>(
  {
    codeHash: { type: String, required: true, unique: true },
    userId: { type: String, required: true },
    clientId: { type: String, required: true },
    redirectUri: { type: String, required: true },
    codeChallenge: { type: String, required: true },
    scopes: { type: [String], default: [] },
    resource: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date },
  },
  { collection: 'oauth_codes' },
);

OAuthCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

if (process.env.NODE_ENV === 'development') {
  delete mongoose.models.OAuthCode;
}

const OAuthCodeModel: Model<OAuthCodeDoc> =
  (mongoose.models.OAuthCode as Model<OAuthCodeDoc>) ||
  mongoose.model<OAuthCodeDoc>('OAuthCode', OAuthCodeSchema);

export default OAuthCodeModel;
