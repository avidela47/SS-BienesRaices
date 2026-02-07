import { NextResponse } from "next/server";
import { listContracts, createContract } from "@/lib/contracts/contractService";

export async function GET() {
  try {
    const contracts = await listContracts();
    return NextResponse.json({ ok: true, contracts });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    const contract = await createContract({
      code: typeof body.code === "string" ? body.code : undefined,

      propertyId: String(body.propertyId ?? ""),
      ownerId: String(body.ownerId ?? ""),
      tenantPersonId: String(body.tenantPersonId ?? ""),

      startDate: String(body.startDate ?? ""),
      endDate: typeof body.endDate === "string" ? body.endDate : undefined,

      duracionMeses: Number(body.duracionMeses ?? 0),
      montoBase: Number(body.montoBase ?? 0),
      dueDay: Number(body.dueDay ?? 10),
      currency: typeof body.currency === "string" ? body.currency : undefined,

      actualizacionCadaMeses: typeof body.actualizacionCadaMeses === "number" ? body.actualizacionCadaMeses : undefined,
      ajustes: Array.isArray(body.ajustes)
        ? body.ajustes
            .filter((x): x is Record<string, unknown> => typeof x === "object" && x !== null)
            .map((r) => ({ n: Number(r.n ?? 0), percentage: Number(r.percentage ?? 0) }))
        : undefined,

      billing:
        typeof body.billing === "object" && body.billing !== null
          ? (() => {
              const b = body.billing as Record<string, unknown>;
              return {
                notes: typeof b.notes === "string" ? b.notes : undefined,
                commissionMonthlyPct: typeof b.commissionMonthlyPct === "number" ? b.commissionMonthlyPct : undefined,
                commissionTotalPct: typeof b.commissionTotalPct === "number" ? b.commissionTotalPct : undefined,
              };
            })()
          : undefined,
    });

    return NextResponse.json({ ok: true, contract }, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}

