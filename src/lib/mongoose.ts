import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  throw new Error('Invalid/Missing environment variable: "MONGODB_URI"');
}
const MONGO_URI_STR = MONGODB_URI as string;

// Cache the connection across hot reloads in dev
const globalWithMongoose = global as typeof globalThis & {
  mongooseConn?: {
    conn: typeof mongoose | null;
    promise: Promise<typeof mongoose> | null;
  };
};

const cached = globalWithMongoose.mongooseConn ?? {
  conn: null as typeof mongoose | null,
  promise: null as Promise<typeof mongoose> | null,
};

globalWithMongoose.mongooseConn = cached;

export default async function connectMongo() {
  if (cached.conn) return cached.conn;
  if (!cached.promise) {
    cached.promise = mongoose.connect(MONGO_URI_STR, {
      bufferCommands: false,
      dbName: 'todoTracker',
    });
  }
  cached.conn = await cached.promise;
  return cached.conn;
}
