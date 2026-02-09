import { NextResponse } from "next/server";
import { listContracts, createContract } from "@/lib/contracts/contractService";

type LateFeePolicy = { type: "NONE" | "FIXED" | "PERCENT"; value: number };

function genContractCode() {
  const d = new Date();
  const y = String(d.getFullYear());
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `CT-${y}${m}${day}-${rand}`;
}

function toStr(v: unknown) {
  return typeof v === "string" ? v : String(v ?? "");
}

function toNum(v: unknown, def = 0): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : def;
}

function toOptionalNum(v: unknown): number | undefined {
  const n = toNum(v, NaN);
  return Number.isFinite(n) ? n : undefined;
}

function parseLateFeePolicy(v: unknown): LateFeePolicy | undefined {
  if (typeof v !== "object" || v === null) return undefined;
  const o = v as Record<string, unknown>;
  const t = o.type;
  const type: LateFeePolicy["type"] =
    t === "FIXED" || t === "PERCENT" || t === "NONE" ? t : "NONE";
  const value = toNum(o.value, 0);
  return { type, value };
}

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

    const incomingCode = typeof body.code === "string" ? body.code.trim() : "";
    const code = incomingCode || genContractCode();

    const billingIn =
      typeof body.billing === "object" && body.billing !== null
        ? (body.billing as Record<string, unknown>)
        : null;

    const montoBase = toNum(body.montoBase ?? billingIn?.baseRent ?? 0, 0);
    const currencyRaw = (body.currency ?? billingIn?.currency) as unknown;
    const currency =
      (typeof currencyRaw === "string" ? currencyRaw : "ARS").trim() || "ARS";

    const dueDay = toNum(body.dueDay ?? billingIn?.dueDay ?? 10, 10);

    const actualizacionCadaMeses = toOptionalNum(
      body.actualizacionCadaMeses ?? billingIn?.actualizacionCadaMeses
    );

    const porcentajeActualizacion = toOptionalNum(
      body.porcentajeActualizacion ?? billingIn?.porcentajeActualizacion
    );

    const lateFeePolicy =
      parseLateFeePolicy(billingIn?.lateFeePolicy ?? body.lateFeePolicy) ??
      { type: "NONE", value: 0 };

    const contract = await createContract({
      code,

      propertyId: toStr(body.propertyId).trim(),
      ownerId: toStr(body.ownerId).trim(),
      tenantPersonId: toStr(body.tenantPersonId).trim(),

      startDate: toStr(body.startDate).trim(),
      endDate: typeof body.endDate === "string" ? body.endDate : undefined,

      duracionMeses: toNum(body.duracionMeses ?? 0, 0),

      // root (compat)
      montoBase,
      dueDay,
      currency,
      actualizacionCadaMeses,
      porcentajeActualizacion,
      lateFeePolicy,

      ajustes: Array.isArray(body.ajustes)
        ? body.ajustes
            .filter((x): x is Record<string, unknown> => typeof x === "object" && x !== null)
            .map((r) => ({ n: toNum(r.n ?? 0, 0), percentage: toNum(r.percentage ?? 0, 0) }))
        : undefined,

      // billing completo
      billing: {
        baseRent: montoBase,
        currency,
        dueDay,
        actualizacionCadaMeses: actualizacionCadaMeses ?? 0,
        porcentajeActualizacion: porcentajeActualizacion ?? 0,
        lateFeePolicy,
        notes: typeof billingIn?.notes === "string" ? billingIn.notes : "Sin notas",

        commissionMonthlyPct: toOptionalNum(billingIn?.commissionMonthlyPct),
        commissionTotalPct: toOptionalNum(billingIn?.commissionTotalPct),
      },
    });

    return NextResponse.json({ ok: true, contract }, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}

