import { Types } from "mongoose";
import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongoose";

import Contract from "@/models/Contract";
import Property from "@/models/Property";
import Installment from "@/models/Installment";
import { Payment } from "@/models/Payment";

const TENANT_ID = "default";

/* =========================
   TIPOS
========================= */

type RouteParams = { id: string };
type ParamsCtx = { params?: RouteParams | Promise<RouteParams> };

type LateFeePolicy = { type: "NONE" | "FIXED" | "PERCENT"; value: number };

type UpdateBody = {
  propertyId: string;
  ownerId: string;
  tenantPersonId: string;

  startDate: string; // YYYY-MM-DD
  duracionMeses: number;
  montoBase: number;
  dueDay: number;
  currency?: string;

  actualizacionCadaMeses?: number;

  billing?: {
    porcentajeActualizacion?: number | string;
    lateFeePolicy?: LateFeePolicy;
    notes?: string;
    commissionMonthlyPct?: number | string;
    commissionTotalPct?: number | string;
    recalcFrom?: string; // "YYYY-MM"
  };
};

type InstallmentLean = {
  _id: Types.ObjectId;
  tenantId: string;
  contractId: Types.ObjectId;
  period: string; // "YYYY-MM"
  dueDate: Date;
  amount: number;
  lateFeeAccrued?: number;
  status: "PENDING" | "PAID" | "OVERDUE" | "PARTIAL" | "REFINANCED";
  paidAmount?: number;
  paidAt?: Date | null;
};

type PaymentLean = {
  tenantId: string;
  contractId: string;
  status: "OK" | "VOID";
  amount: number;
};

/* =========================
   HELPERS
========================= */

async function resolveParams(params: RouteParams | Promise<RouteParams> | undefined): Promise<RouteParams> {
  if (!params) throw new Error("params no definidos");
  if (params instanceof Promise) return await params;
  return params;
}

function isoDateOnly(v: unknown): string {
  const s = String(v ?? "").trim();
  const d = s.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Error(`Fecha inválida: ${s}`);
  return d;
}

function addMonthsDateOnly(startISO: string, months: number): string {
  const [y, m, d] = startISO.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setMonth(date.getMonth() + months);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(
    2,
    "0"
  )}`;
}

function buildDueDateISO(startISO: string, offset: number, dueDay: number): string {
  const [y, m] = startISO.split("-").map(Number);
  const base = new Date(y, m - 1, 1);
  base.setMonth(base.getMonth() + offset);

  const lastDay = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
  const day = Math.min(Math.max(1, dueDay), lastDay);

  return `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function dateOnlyToLocalNoonDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

function dateToDateOnlyLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function safeNum(v: unknown, def = 0): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : def;
}

function parseLateFeePolicy(v: unknown): LateFeePolicy {
  if (typeof v !== "object" || v === null) return { type: "NONE", value: 0 };
  const o = v as Record<string, unknown>;
  const t = typeof o.type === "string" ? o.type : "NONE";
  const type: LateFeePolicy["type"] = t === "FIXED" || t === "PERCENT" || t === "NONE" ? t : "NONE";
  const value = safeNum(o.value, 0);
  return { type, value };
}

function isValidPeriod(p: unknown): p is string {
  return typeof p === "string" && /^\d{4}-\d{2}$/.test(p);
}

function periodFromStart(startISO: string, offsetMonths: number): string {
  const [y, m] = startISO.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  d.setMonth(d.getMonth() + offsetMonths);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function amountByTramo(base: number, pct: number, actualCada: number, monthIndex0: number): number {
  const n = Math.max(0, Math.floor(actualCada));
  if (n <= 0) return Math.round(base);

  const tramoIndex = Math.floor(monthIndex0 / n);
  const factor = Math.pow(1 + pct / 100, tramoIndex);
  return Math.round(base * factor);
}

/* =========================
   GET
========================= */

export async function GET(_req: NextRequest, ctx: ParamsCtx) {
  try {
    await dbConnect();
    const { id } = await resolveParams(ctx.params);

    let contract: unknown = null;

    if (Types.ObjectId.isValid(id)) {
      contract = await Contract.findOne({ tenantId: TENANT_ID, _id: new Types.ObjectId(id) })
        .populate("propertyId")
        .populate("ownerId")
        .populate("tenantPersonId")
        .lean();
    }

    if (!contract) {
      contract = await Contract.findOne({ tenantId: TENANT_ID, code: id })
        .populate("propertyId")
        .populate("ownerId")
        .populate("tenantPersonId")
        .lean();
    }

    if (!contract || typeof contract !== "object" || contract === null) {
      return NextResponse.json({ ok: false, message: "Contrato no encontrado" }, { status: 404 });
    }

    const contractId = String((contract as Record<string, unknown>)._id);

    const installmentsRaw = (await Installment.find({
      tenantId: TENANT_ID,
      contractId: new Types.ObjectId(contractId),
    })
      .sort({ period: 1 })
      .lean()) as unknown[];

    // ✅ DEVUELVO fields que tu UI espera: period, dueDate, amount, status, paidAt...
    const installments = (installmentsRaw as InstallmentLean[]).map((it) => ({
      _id: String(it._id),
      contractId,
      period: String(it.period),
      dueDate: it.dueDate ? dateToDateOnlyLocal(new Date(it.dueDate)) : "",
      amount: safeNum(it.amount, 0),
      lateFeeAccrued: safeNum(it.lateFeeAccrued, 0),
      status: it.status,
      paidAmount: safeNum(it.paidAmount, 0),
      paidAt: it.paidAt ? dateToDateOnlyLocal(new Date(it.paidAt)) : null,
    }));

    const paymentsRaw = await Payment.find({
      tenantId: TENANT_ID,
      contractId: new Types.ObjectId(contractId),
    }).lean();

    const payments: PaymentLean[] = (paymentsRaw as Array<Record<string, unknown>>).map((p) => ({
      tenantId: String(p.tenantId),
      contractId: String(p.contractId),
      status: (p.status as "OK" | "VOID") ?? "OK",
      amount: safeNum(p.amount, 0),
    }));

    const billed = installments.reduce((acc, x) => acc + (Number.isFinite(x.amount) ? x.amount : 0), 0);
    const paid = installments.reduce((acc, x) => acc + (Number.isFinite(x.paidAmount) ? x.paidAmount : 0), 0);
    const totals = { billed, paid, balance: billed - paid };

    return NextResponse.json({ ok: true, contract, installments, payments, totals });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

/* =========================
   PUT (EDITAR CONTRATO)
========================= */

export async function PUT(req: NextRequest, ctx: ParamsCtx) {
  try {
    await dbConnect();
    const { id } = await resolveParams(ctx.params);

    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ ok: false, message: "ID inválido" }, { status: 400 });
    }

    const body = (await req.json()) as UpdateBody;

    const startDate = isoDateOnly(body.startDate);
    const duracionMeses = Math.max(0, Math.floor(safeNum(body.duracionMeses, 0)));
    const endDate = addMonthsDateOnly(startDate, duracionMeses);

    const montoBase = Math.round(safeNum(body.montoBase, 0));
    const dueDay = Math.max(1, Math.min(28, Math.floor(safeNum(body.dueDay, 10))));
    const currency = String(body.currency ?? "ARS").trim() || "ARS";

    const actualizacionCadaMeses = Math.max(0, Math.floor(safeNum(body.actualizacionCadaMeses, 0)));

    const pctIndex = safeNum(body.billing?.porcentajeActualizacion, 0);
    const lateFeePolicy = parseLateFeePolicy(body.billing?.lateFeePolicy);

    const recalcFrom = body.billing?.recalcFrom;
    const recalcFromPeriod = isValidPeriod(recalcFrom) ? recalcFrom : null;

    const contract = await Contract.findOneAndUpdate(
      { tenantId: TENANT_ID, _id: new Types.ObjectId(id) },
      {
        propertyId: new Types.ObjectId(body.propertyId),
        ownerId: new Types.ObjectId(body.ownerId),
        tenantPersonId: new Types.ObjectId(body.tenantPersonId),

        startDate,
        endDate,
        duracionMeses,
        montoBase,
        dueDay,
        currency,

        actualizacionCadaMeses,

        billing: {
          dueDay,
          baseRent: montoBase,
          currency,
          actualizacionCadaMeses,
          porcentajeActualizacion: pctIndex,
          lateFeePolicy,
          notes: body.billing?.notes ?? "",
          commissionMonthlyPct: safeNum(body.billing?.commissionMonthlyPct, 0),
          commissionTotalPct: safeNum(body.billing?.commissionTotalPct, 0),
        },
      },
      { new: true }
    );

    if (!contract) {
      return NextResponse.json({ ok: false, message: "Contrato no encontrado" }, { status: 404 });
    }

    const contractId = String(contract._id);

    const fromPeriod = recalcFromPeriod ?? periodFromStart(startDate, 0);

    await Installment.deleteMany({
      tenantId: TENANT_ID,
      contractId: new Types.ObjectId(contractId),
      status: { $ne: "PAID" },
      period: { $gte: fromPeriod },
    });

    const docsToInsert: Array<{
      tenantId: string;
      contractId: Types.ObjectId;
      period: string;
      dueDate: Date;
      amount: number;
      lateFeeAccrued: number;
      status: "PENDING";
      paidAmount: number;
      paidAt: null;
    }> = [];

    for (let i = 0; i < duracionMeses; i++) {
      const period = periodFromStart(startDate, i);
      if (period < fromPeriod) continue;

      const dueISO = buildDueDateISO(startDate, i, dueDay);
      const amount = amountByTramo(montoBase, pctIndex, actualizacionCadaMeses, i);

      docsToInsert.push({
        tenantId: TENANT_ID,
        contractId: new Types.ObjectId(contractId),
        period,
        dueDate: dateOnlyToLocalNoonDate(dueISO),
        amount,
        lateFeeAccrued: 0,
        status: "PENDING",
        paidAmount: 0,
        paidAt: null,
      });
    }

    if (docsToInsert.length) {
      await Installment.insertMany(docsToInsert);
    }

    return NextResponse.json({ ok: true, contract });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

/* =========================
   DELETE
========================= */

export async function DELETE(_req: NextRequest, ctx: ParamsCtx) {
  try {
    await dbConnect();
    const { id } = await resolveParams(ctx.params);

    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ ok: false, message: "ID inválido" }, { status: 400 });
    }

    const contract = await Contract.findOneAndDelete({
      tenantId: TENANT_ID,
      _id: new Types.ObjectId(id),
    });

    if (!contract) {
      return NextResponse.json({ ok: false, message: "Contrato no encontrado" }, { status: 404 });
    }

    const stillActive = await Contract.exists({
      tenantId: TENANT_ID,
      propertyId: contract.propertyId,
      status: { $in: ["ACTIVE", "EXPIRING"] },
    });

    if (!stillActive) {
      await Property.findByIdAndUpdate(contract.propertyId, {
        status: "AVAILABLE",
        inquilinoId: null,
        availableFrom: null,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

