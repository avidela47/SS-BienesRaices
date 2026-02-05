import { NextResponse } from "next/server";
import { manualSetMonthly } from "@/lib/indices/providers/manual";
import type { IndexKey } from "@/models/IndexValue";

type Body = {
  indexKey?: IndexKey;
  date?: string; // YYYY-MM-DD
  value?: number | string;
};

const ALLOWED_MANUAL: IndexKey[] = ["CAC", "CASA_PROPIA"];

function isISODate(s: string) {
  // básico: YYYY-MM-DD
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Body | null;

  const indexKey = body?.indexKey;
  const date = (body?.date || "").trim();
  const value = Number(body?.value);

  if (!indexKey || !date || !Number.isFinite(value)) {
    return NextResponse.json(
      { ok: false, error: "indexKey, date, value required" },
      { status: 400 }
    );
  }

  if (!ALLOWED_MANUAL.includes(indexKey)) {
    return NextResponse.json(
      { ok: false, error: `indexKey must be one of: ${ALLOWED_MANUAL.join(", ")}` },
      { status: 400 }
    );
  }

  if (!isISODate(date)) {
    return NextResponse.json(
      { ok: false, error: "date must be YYYY-MM-DD" },
      { status: 400 }
    );
  }

  await manualSetMonthly(indexKey, date, value);

  return NextResponse.json({ ok: true });
}
