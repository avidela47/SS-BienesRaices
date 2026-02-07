import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  throw new Error("Missing MONGODB_URI");
}

type Cache = {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
};

declare global {
  var mongooseCache: Cache | undefined;
}

const cache: Cache = global.mongooseCache ?? { conn: null, promise: null };

export async function dbConnect() {
  if (cache.conn) return cache.conn;

  if (!cache.promise) {
    cache.promise = mongoose.connect(MONGODB_URI as string).then((m) => m);

  }

  cache.conn = await cache.promise;
  global.mongooseCache = cache;

  return cache.conn;
}
