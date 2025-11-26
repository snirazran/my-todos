import mongoose, { Schema, type Model } from 'mongoose';
import type { UserSkins, UserWardrobe } from '@/lib/types/UserDoc';

export interface UserDoc {
  _id?: mongoose.Types.ObjectId;
  name: string;
  email: string;
  passwordHash: string;
  createdAt: Date;
  wardrobe?: UserWardrobe;
  skins?: UserSkins;
}

const UserSchema = new Schema<UserDoc>(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, lowercase: true, index: true },
    passwordHash: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
    wardrobe: { type: Schema.Types.Mixed },
    skins: { type: Schema.Types.Mixed },
  },
  { collection: 'users' }
);

UserSchema.index({ email: 1 });

const UserModel: Model<UserDoc> =
  (mongoose.models.User as Model<UserDoc>) ||
  mongoose.model<UserDoc>('User', UserSchema);

export default UserModel;
