import mongoose, { Schema, type Model } from 'mongoose';

export interface OAuthClientDoc {
  _id?: mongoose.Types.ObjectId;
  clientId: string;
  clientName: string;
  redirectUris: string[];
  /** cimd = metadata fetched from the client_id URL, dcr = legacy self-registration. */
  source: 'cimd' | 'dcr';
  logoUri?: string;
  clientUri?: string;
  createdAt: Date;
  refreshedAt: Date;
  expiresAt?: Date;
}

const OAuthClientSchema = new Schema<OAuthClientDoc>(
  {
    clientId: { type: String, required: true, unique: true },
    clientName: { type: String, default: '' },
    redirectUris: { type: [String], default: [] },
    source: { type: String, enum: ['cimd', 'dcr'], required: true },
    logoUri: { type: String },
    clientUri: { type: String },
    createdAt: { type: Date, default: Date.now },
    refreshedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date },
  },
  { collection: 'oauth_clients' },
);

OAuthClientSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

if (process.env.NODE_ENV === 'development') {
  delete mongoose.models.OAuthClient;
}

const OAuthClientModel: Model<OAuthClientDoc> =
  (mongoose.models.OAuthClient as Model<OAuthClientDoc>) ||
  mongoose.model<OAuthClientDoc>('OAuthClient', OAuthClientSchema);

export default OAuthClientModel;
