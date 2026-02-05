import { IndexValue, type IndexKey } from "@/models/IndexValue";
import { connectDB } from "@/lib/db/connectDB";
import { startOfMonthISO } from "@/lib/indices/date";

export async function manualSetMonthly(indexKey: IndexKey, dateISO: string, value: number) {
  await connectDB();
  const normalized = startOfMonthISO(dateISO);
  await IndexValue.updateOne(
    { indexKey, date: normalized },
    { $set: { value, source: "MANUAL" } },
    { upsert: true }
  );
}

export async function manualGetMonthly(indexKey: IndexKey, dateISO: string): Promise<number> {
  await connectDB();
  const normalized = startOfMonthISO(dateISO);
  const row = await IndexValue.findOne({ indexKey, date: normalized }).lean();
  if (!row) throw new Error(`Missing manual value for ${indexKey} at ${normalized}`);
  return row.value;
}
