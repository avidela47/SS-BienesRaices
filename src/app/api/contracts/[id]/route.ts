import { Types } from "mongoose";
import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongoose";

import Contract, { type ContractStatus } from "@/models/Contract";
import Property from "@/models/Property";
import Installment from "@/models/Installment";
import { Payment } from "@/models/Payment";

const TENANT_ID = "default";

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "unknown";
}

function addMonthsSafe(date: Date, months: number): Date {
  const d = new Date(date);
  const day = d.getDate();
  d.setMonth(d.getMonth() + months);
  if (d.getDate() < day) d.setDate(0);
  return d;
}

function lastDayOfMonth(year: number, monthIndex0: number): number {
  return new Date(year, monthIndex0 + 1, 0).getDate();
}

function formatPeriodYYYYMM(date: Date): string {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  return `${y}-${String(m).padStart(2, "0")}`;
}

function buildDueDateForMonth(baseStart: Date, monthOffset: number, dueDay: number): Date {
  const d = new Date(baseStart);
  d.setDate(1);
  d.setMonth(d.getMonth() + monthOffset);

  const year = d.getFullYear();
  const monthIndex0 = d.getMonth();
  const last = lastDayOfMonth(year, monthIndex0);
  const day = Math.min(dueDay, last);

  return new Date(year, monthIndex0, day, 12, 0, 0, 0);
}

function toNumberSafe(v: unknown): number {
  const n = typeof v === "number" ? v : Number(String(v ?? "").trim());
  return Number.isFinite(n) ? n : NaN;
}

function requiredAdjustmentsCount(duracionMeses: number, cadaMeses: number): number {
  if (cadaMeses <= 0) return 0;
  return Math.floor((duracionMeses - 1) / cadaMeses);
}

function buildAjustesCompat(duracionMeses: number, actualizacionCadaMeses: number, porcentajeActualizacion: number) {
  const expected = requiredAdjustmentsCount(duracionMeses, actualizacionCadaMeses);
  if (expected <= 0) return [] as Array<{ n: number; percentage: number }>;
  const pct = Number.isFinite(porcentajeActualizacion) ? porcentajeActualizacion : 0;
  return Array.from({ length: expected }, (_v, i) => ({ n: i + 1, percentage: pct }));
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function computeLateFee(amount: number, dueDate: Date, policy?: { type?: string; value?: number }, status?: string): number {
  if (!policy || policy.type === "NONE") return 0;
  if (status === "PAID") return 0;

  const due = startOfDay(dueDate);
  const today = startOfDay(new Date());

  if (today <= due) return 0;

  const msPerDay = 24 * 60 * 60 * 1000;
  const daysLate = Math.max(0, Math.floor((today.getTime() - due.getTime()) / msPerDay));
  if (!daysLate) return 0;

  if (policy.type === "FIXED") return Math.round((Number(policy.value) || 0) * daysLate);
  if (policy.type === "PERCENT") {
    const pct = Number(policy.value) || 0;
    return Math.round(amount * (pct / 100) * daysLate);
  }

  return 0;
}

async function syncContractStates(): Promise<void> {
  const now = new Date();
  const nowPlus3 = addMonthsSafe(now, 3);

  await Contract.updateMany(
    {
      tenantId: TENANT_ID,
      status: "ACTIVE",
      endDate: { $gt: now, $lte: nowPlus3 },
    },
    { $set: { status: "EXPIRING" satisfies ContractStatus } }
  );

  const ended = await Contract.find(
    {
      tenantId: TENANT_ID,
      status: { $in: ["ACTIVE", "EXPIRING"] },
      endDate: { $lte: now },
    },
    { _id: 1, propertyId: 1 }
  ).lean<Array<{ _id: Types.ObjectId; propertyId: Types.ObjectId }>>();

  if (ended.length > 0) {
    await Contract.updateMany(
      { tenantId: TENANT_ID, _id: { $in: ended.map((x) => x._id) } },
      { $set: { status: "ENDED" satisfies ContractStatus } }
    );

    for (const c of ended) {
      const stillActive = await Contract.exists({
        tenantId: TENANT_ID,
        propertyId: c.propertyId,
        status: { $in: ["ACTIVE", "EXPIRING"] },
      });

      if (!stillActive) {
        await Property.findByIdAndUpdate(c.propertyId, {
          status: "AVAILABLE",
          inquilinoId: null,
          availableFrom: null,
        });
      }
    }
  }
}

type Totals = {
  installmentsCount: number;
  paymentsCount: number;
  totalDue: number;
  totalPaidOk: number;
  totalPaidVoid: number;
  balance: number;
  paidInstallments: number;
  pendingInstallments: number;
};

export async function GET(
  _req: NextRequest,
  ctx: { params: { id: string } } | { params: Promise<{ id: string }> }
) {
  try {
    await dbConnect();

    // ✅ Sync estados antes de responder
    await syncContractStates();

    let id: string;
    function isPromise<T>(v: unknown): v is Promise<T> {
      return typeof v === "object" && v !== null && "then" in v && typeof (v as { then: unknown }).then === "function";
    }
    if (isPromise<{ id: string }>(ctx.params)) {
      const resolved = await ctx.params;
      id = resolved.id;
    } else {
      id = (ctx.params as { id: string }).id;
    }

    let contract = null;
    if (/^[0-9a-fA-F]{24}$/.test(id)) {
      contract = await Contract.findOne({ tenantId: TENANT_ID, _id: id })
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

    if (!contract) {
      return NextResponse.json({ ok: false, error: "Contrato no encontrado." }, { status: 404 });
    }

    const installments = await Installment.find({
      tenantId: TENANT_ID,
      contractId: id,
    })
      .sort({ dueDate: 1 })
      .lean();

    const lateFeePolicy = contract?.billing?.lateFeePolicy ?? { type: "NONE", value: 0 };
    const installmentsWithLateFee = installments.map((it) => ({
      ...it,
      lateFeeAccrued: computeLateFee(Number(it.amount) || 0, new Date(it.dueDate), lateFeePolicy, it.status),
    }));

    const payments = await Payment.find({
      tenantId: TENANT_ID,
      contractId: id,
    })
      .sort({ date: -1 })
      .lean();

    const totalDue = installments.reduce((acc: number, it: { amount?: number }) => acc + (Number(it.amount) || 0), 0);

    const totalPaidOk = payments.reduce((acc: number, p: { status?: string; amount?: number }) => {
      if (p.status === "OK") return acc + (Number(p.amount) || 0);
      return acc;
    }, 0);

    const totalPaidVoid = payments.reduce((acc: number, p: { status?: string; amount?: number }) => {
      if (p.status === "VOID") return acc + (Number(p.amount) || 0);
      return acc;
    }, 0);

    const paidInstallments = installments.reduce((acc: number, it: { status?: string }) => acc + (it.status === "PAID" ? 1 : 0), 0);
    const pendingInstallments = installments.length - paidInstallments;

    const totals: Totals = {
      installmentsCount: installments.length,
      paymentsCount: payments.length,
      totalDue,
      totalPaidOk,
      totalPaidVoid,
      balance: totalDue - totalPaidOk,
      paidInstallments,
      pendingInstallments,
    };

    const mappedTotals = {
      billed: totals.totalDue,
      paid: totals.totalPaidOk,
      balance: totals.balance,
    };

    return NextResponse.json({
      ok: true,
      contract,
  installments: installmentsWithLateFee,
      payments,
      totals: mappedTotals,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { ok: false, error: `Failed to fetch contract detail: ${getErrorMessage(err)}` },
      { status: 500 }
    );
  }
}

// PUT y DELETE los dejo como estaban (sin tocar lógica ahora)
export async function PUT(
  req: NextRequest,
  ctx: { params: { id: string } } | { params: Promise<{ id: string }> }
) {
  try {
    await dbConnect();
    let id: string;
    function isPromise<T>(v: unknown): v is Promise<T> {
      return typeof v === "object" && v !== null && "then" in v && typeof (v as { then: unknown }).then === "function";
    }
    if (isPromise<{ id: string }>(ctx.params)) {
      const resolved = await ctx.params;
      id = resolved.id;
    } else {
      id = (ctx.params as { id: string }).id;
    }

    const body = (await req.json()) as Partial<{
      propertyId: string;
      ownerId: string;
      tenantPersonId: string;
      startDate: string;
      duracionMeses: number;
      montoBase: number;
      dueDay: number;
      currency: string;
      actualizacionCadaMeses: number;
      ajustes: Array<{ n: number; percentage: number }>;
      billing?: {
        lateFeePolicy?: { type: "NONE" | "FIXED" | "PERCENT"; value: number };
        ajustes?: Array<{ n: number; percentage: number }>;
        notes?: string;
        commissionMonthlyPct?: number | string;
        commissionTotalPct?: number | string;
      };
    }>;

    const duracionMeses = Number(body.duracionMeses ?? 0);
    const montoBase = Number(body.montoBase ?? 0);
    const dueDay = Number(body.dueDay ?? 0);

    if (!body.propertyId || !body.ownerId || !body.tenantPersonId || !body.startDate) {
      return NextResponse.json({ ok: false, message: "Faltan campos obligatorios" }, { status: 400 });
    }
    if (!duracionMeses || duracionMeses < 1) {
      return NextResponse.json({ ok: false, message: "duracionMeses inválido" }, { status: 400 });
    }
    if (Number.isNaN(montoBase) || montoBase < 0) {
      return NextResponse.json({ ok: false, message: "montoBase inválido" }, { status: 400 });
    }
    if (Number.isNaN(dueDay) || dueDay < 1 || dueDay > 28) {
      return NextResponse.json({ ok: false, message: "dueDay inválido" }, { status: 400 });
    }

    const startDate = new Date(body.startDate);
    // Normalizar a mediodía para evitar desplazamientos por zona horaria al guardar
    startDate.setHours(12, 0, 0, 0);
    if (Number.isNaN(startDate.getTime())) {
      return NextResponse.json({ ok: false, message: "startDate inválido" }, { status: 400 });
    }
    // endDate = startDate + duracionMeses - 1 día
    const endDate = new Date(addMonthsSafe(startDate, duracionMeses).getTime() - 24 * 60 * 60 * 1000);
    const currency = (body.currency ? String(body.currency).trim() : "ARS") || "ARS";
    const actualizacionCadaMeses = Number(body.actualizacionCadaMeses ?? 0);
    const notes = body.billing?.notes ? String(body.billing.notes).trim() : "";

  // Debug: log incoming billing commission values for PUT
  console.log("[CONTRACT-PUT] billing incoming:", body.billing?.commissionMonthlyPct, body.billing?.commissionTotalPct);

  const contract = await Contract.findOneAndUpdate(
      { tenantId: TENANT_ID, _id: id },
      {
        propertyId: new Types.ObjectId(body.propertyId),
        ownerId: new Types.ObjectId(body.ownerId),
        tenantPersonId: new Types.ObjectId(body.tenantPersonId),
        startDate,
        endDate,
        duracionMeses,
        montoBase: Math.round(montoBase),
        duracion: duracionMeses,
        valorCuota: Math.round(montoBase),
        diaVencimiento: Math.round(dueDay),
        actualizacionCada: Number.isFinite(actualizacionCadaMeses) ? actualizacionCadaMeses : 0,
        billing: {
          dueDay: Math.round(dueDay),
          baseRent: Math.round(montoBase),
          currency,
          actualizacionCadaMeses: Number.isFinite(actualizacionCadaMeses) ? actualizacionCadaMeses : 0,
          ajustes: Array.isArray(body.ajustes) ? body.ajustes : [],
          lateFeePolicy: body.billing?.lateFeePolicy ?? { type: "NONE", value: 0 },
          notes: notes || "Sin notas",
          commissionMonthlyPct: Number.isFinite(Number(body.billing?.commissionMonthlyPct)) ? Number(body.billing?.commissionMonthlyPct) : 0,
          commissionTotalPct: Number.isFinite(Number(body.billing?.commissionTotalPct)) ? Number(body.billing?.commissionTotalPct) : 0,
        },
      },
      { new: true }
    );

    if (!contract) {
      return NextResponse.json({ ok: false, message: "Contrato no encontrado" }, { status: 404 });
    }

    // --- Regenerar cuotas pendientes si cambió la parametría relevante ---
    try {
      const c = contract as unknown as {
        duracionMeses?: number;
        duracion?: number;
        montoBase?: number;
        valorCuota?: number;
        billing?: { baseRent?: number; dueDay?: number; actualizacionCadaMeses?: number };
        startDate?: string | Date;
        _id?: unknown;
      };

      const duracion = Number.isFinite(Number(duracionMeses)) && duracionMeses > 0 ? duracionMeses : c.duracionMeses ?? c.duracion ?? 0;
      const baseRent = Math.round(montoBase) || c.montoBase || c.valorCuota || (c.billing && c.billing.baseRent) || 0;
      const dueDayInt = Math.round(dueDay) || (c.billing && c.billing.dueDay) || 1;
      const cada = Number.isFinite(Number(actualizacionCadaMeses)) ? actualizacionCadaMeses : c.billing?.actualizacionCadaMeses ?? 0;

      // obtener ajustes: preferimos body.ajustes -> body.billing.ajustes -> compat
      let ajustes: Array<{ n: number; percentage: number }> = Array.isArray(body.ajustes) ? (body.ajustes as Array<{ n: number; percentage: number }>) : [];
      if (!ajustes.length && Array.isArray(body.billing?.ajustes)) ajustes = body.billing!.ajustes as Array<{ n: number; percentage: number }>;
      if (!ajustes.length) {
        const pctCompat = toNumberSafe((body as unknown as { porcentajeActualizacion?: unknown }).porcentajeActualizacion ?? 0);
        if (cada > 0 && Number.isFinite(pctCompat) && pctCompat > 0) ajustes = buildAjustesCompat(duracion, cada, pctCompat);
      }

      // Obtener cuotas existentes y conservar las ya pagadas
      const existing = await Installment.find({ tenantId: TENANT_ID, contractId: contract._id }).lean();
      // Considerar como "protegidas" las cuotas ya pagadas o parcialmente pagadas (paidAmount>0)
      const paidPeriods = new Set(
        existing
          .filter((it) => it.status === "PAID" || (it.paidAmount && Number(it.paidAmount) > 0))
          .map((it) => String(it.period))
      );

      // Borrar cuotas no pagadas (pendientes/otras)
      await Installment.deleteMany({ tenantId: TENANT_ID, contractId: contract._id, status: { $ne: "PAID" } });

      // Generar nuevas cuotas para los periodos que no están pagados
      type NewInstallment = {
        tenantId: string;
        contractId: unknown;
        period: string;
        dueDate: Date;
        amount: number;
        lateFeeAccrued: number;
        status: string;
        paidAmount: number;
        paidAt: null | string;
        lastReminderAt: null | string;
      };

      const installmentsToInsert: NewInstallment[] = [];
      let currentAmount = baseRent;
      let adjIndex = 0;
      for (let month = 1; month <= (duracion || 0); month += 1) {
        if (cada > 0 && month !== 1) {
          const isAdjustmentMonth = (month - 1) % cada === 0;
          if (isAdjustmentMonth) {
            const adj = ajustes[adjIndex];
            const pct = adj ? toNumberSafe(adj.percentage) : 0;
            const pctSafe = Number.isFinite(pct) ? pct : 0;

            currentAmount = Math.round(currentAmount * (1 + pctSafe / 100));
            adjIndex += 1;
          }
        }

        const monthOffset = month - 1;
        const monthDate = addMonthsSafe(new Date(String(c.startDate)), monthOffset);
        const period = formatPeriodYYYYMM(monthDate);

        if (paidPeriods.has(period)) continue; // no sobrescribir cuotas pagadas

        const dueDateComputed = buildDueDateForMonth(new Date(String(c.startDate)), monthOffset, dueDayInt);

        installmentsToInsert.push({
          tenantId: TENANT_ID,
          contractId: contract._id,
          period,
          dueDate: dueDateComputed,
          amount: currentAmount,
          lateFeeAccrued: 0,
          status: "PENDING",
          paidAmount: 0,
          paidAt: null,
          lastReminderAt: null,
        });
      }

      if (installmentsToInsert.length) {
        await Installment.insertMany(installmentsToInsert, { ordered: true });
        console.log("[CONTRACT-PUT] Regeneradas cuotas (no pagadas):", installmentsToInsert.length, "contractId=", String(contract._id));
      }
    } catch (e) {
      console.error("[CONTRACT-PUT] Error regenerando cuotas:", e);
    }

    return NextResponse.json({ ok: true, contract });
  } catch (err: unknown) {
    return NextResponse.json(
      { ok: false, message: "Failed to update contract", error: getErrorMessage(err) },
      { status: 500 }
    );
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: { id: string } }) {
  try {
    await dbConnect();

    let id: string;
    function isPromise<T>(v: unknown): v is Promise<T> {
      return typeof v === "object" && v !== null && "then" in v && typeof (v as { then: unknown }).then === "function";
    }
    if (isPromise<{ id: string }>(ctx.params)) {
      const resolved = await ctx.params;
      id = resolved.id;
    } else {
      id = (ctx.params as { id: string }).id;
    }

    const objectId = Types.ObjectId.isValid(id) ? new Types.ObjectId(id) : id;

    const contract = await Contract.findOneAndDelete({ _id: objectId, tenantId: TENANT_ID });
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
    return NextResponse.json(
      { ok: false, message: "Failed to delete contract", error: getErrorMessage(err) },
      { status: 500 }
    );
  }
}
