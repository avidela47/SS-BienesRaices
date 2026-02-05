import { NextResponse } from "next/server";
import { IndexValue } from "@/models/IndexValue";
import { connectDB } from "@/lib/db/connectDB";

// 🔹 Valores base reales aproximados (sirven como ancla)
const SEED_VALUES = [
  { indexKey: "ICL", date: "2025-12-01", value: 1000 },
  { indexKey: "CER", date: "2025-12-01", value: 1000 },
  { indexKey: "UVA", date: "2025-12-01", value: 1000 },
];

export async function GET() {
  await connectDB();

  for (const row of SEED_VALUES) {
    await IndexValue.updateOne(
      { indexKey: row.indexKey, date: row.date },
      { $set: { value: row.value, source: "SEED" } },
      { upsert: true }
    );
  }

  return NextResponse.json({ ok: true, message: "Indices seeded" });
}
