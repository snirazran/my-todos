import mongoose, { Schema, type Model } from 'mongoose';

/**
 * Records when a user disconnected an app. Access tokens are self-contained
 * JWTs, so this is what makes a disconnect take effect immediately instead of
 * waiting for the token to expire.
 */
export interface OAuthRevocationDoc {
  _id?: mongoose.Types.ObjectId;
  userId: string;
  clientId: string;
  revokedAt: Date;
}

const OAuthRevocationSchema = new Schema<OAuthRevocationDoc>(
  {
    userId: { type: String, required: true },
    clientId: { type: String, required: true },
    revokedAt: { type: Date, required: true },
  },
  { collection: 'oauth_revocations' },
);

OAuthRevocationSchema.index({ userId: 1, clientId: 1 }, { unique: true });

if (process.env.NODE_ENV === 'development') {
  delete mongoose.models.OAuthRevocation;
}

const OAuthRevocationModel: Model<OAuthRevocationDoc> =
  (mongoose.models.OAuthRevocation as Model<OAuthRevocationDoc>) ||
  mongoose.model<OAuthRevocationDoc>('OAuthRevocation', OAuthRevocationSchema);

export default OAuthRevocationModel;
