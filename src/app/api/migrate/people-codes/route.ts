import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongoose";
import Property from "@/models/Property";
import Counter from "@/models/Counter";

const TENANT_ID = "default";

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "unknown";
}

function pad3(n: number): string {
  return String(n).padStart(3, "0");
}

async function nextPropertyCode(): Promise<string> {
  const key = "property:PID";
  const doc = await Counter.findOneAndUpdate(
    { tenantId: TENANT_ID, key },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  ).lean();

  const seq = doc?.seq ?? 1;
  return `PID-${pad3(seq)}`;
}

export async function POST() {
  try {
    await dbConnect();

    const withoutCode = await Property.find({
      tenantId: TENANT_ID,
      $or: [{ code: { $exists: false } }, { code: "" }, { code: null }],
    }).sort({ createdAt: 1 });

    let updated = 0;

    for (const p of withoutCode) {
      const code = await nextPropertyCode();
      await Property.updateOne({ _id: p._id }, { $set: { code } });
      updated++;
    }

    return NextResponse.json({ ok: true, updated });
  } catch (err: unknown) {
    return NextResponse.json(
      { ok: false, message: "Migration failed", error: getErrorMessage(err) },
      { status: 500 }
    );
  }
}


