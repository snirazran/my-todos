import mongoose, { Schema, type Model } from 'mongoose';

export interface ServerHeartbeatDoc {
  _id?: mongoose.Types.ObjectId;
  key: string;
  beatAt: Date;
}

const ServerHeartbeatSchema = new Schema<ServerHeartbeatDoc>(
  {
    key: { type: String, required: true, unique: true, index: true },
    beatAt: { type: Date, required: true },
  },
  { collection: 'serverHeartbeats' },
);

if (process.env.NODE_ENV === 'development') {
  delete mongoose.models.ServerHeartbeat;
}

const ServerHeartbeatModel: Model<ServerHeartbeatDoc> =
  (mongoose.models.ServerHeartbeat as Model<ServerHeartbeatDoc>) ||
  mongoose.model<ServerHeartbeatDoc>('ServerHeartbeat', ServerHeartbeatSchema);

export default ServerHeartbeatModel;
