import { NextResponse } from "next/server";
import { getIndexValue } from "@/lib/indices/indexService";
import type { IndexKey } from "@/models/IndexValue";

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

type Body = {
  indexKey?: string;
  fromDate?: string;
  toDate?: string;
  amount?: unknown;
};

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Body | null;

  const indexKey = (body?.indexKey || "").trim();
  const fromDate = (body?.fromDate || "").trim();
  const toDate = (body?.toDate || "").trim();
  const amount = Number(body?.amount);

  if (!indexKey || !fromDate || !toDate || !Number.isFinite(amount)) {
    return NextResponse.json(
      { ok: false, error: "indexKey, fromDate, toDate, amount required" },
      { status: 400 }
    );
  }

  try {
    const from = await getIndexValue(indexKey as IndexKey, fromDate);
    const to = await getIndexValue(indexKey as IndexKey, toDate);

    const factor = to.value / from.value;
    const percent = round2((factor - 1) * 100);
    const newAmount = round2(amount * factor);

    return NextResponse.json({
      ok: true,
      indexKey,
      fromDate,
      toDate,
      fromIndex: round2(from.value),
      toIndex: round2(to.value),
      factor: round2(factor),
      percent,
      amount: round2(amount),
      newAmount,
      projected: Boolean(from.projected || to.projected),
      meta: { from, to },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
