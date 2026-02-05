import mongoose from "mongoose";

let isConnected = false;

export async function connectDB() {
  if (isConnected) return;

  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is missing");

  await mongoose.connect(uri, {
    dbName: process.env.MONGODB_DBNAME || undefined,
  });

  isConnected = true;
}
