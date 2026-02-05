import { Types } from "mongoose";
import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongoose";

import Contract, { type ContractStatus } from "@/models/Contract";
import Property from "@/models/Property";
import Installment from "@/models/Installment";
import { Payment } from "@/models/Payment";

const TENANT_ID = "default";

/** YYYY-MM-DD estricta */
function isoDateOnly(v: unknown): string {
  const s = String(v ?? "").trim();
  const d = s.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Error(`Fecha inválida: ${s}`);
  return d;
}

function toISODateLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addMonthsISO(startISO: string, months: number): string {
  const d = new Date(startISO + "T00:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

function lastDayOfMonthUTC(year: number, monthIndex0: number): number {
  return new Date(Date.UTC(year, monthIndex0 + 1, 0)).getUTCDate();
}

function formatPeriodYYYYMM_UTC(date: Date): string {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + 1;
  return `${y}-${String(m).padStart(2, "0")}`;
}

function buildDueDateISOForPeriod(startISO: string, monthOffset: number, dueDay: number): string {
  const base = new Date(startISO + "T00:00:00Z");
  base.setUTCDate(1);
  base.setUTCMonth(base.getUTCMonth() + monthOffset);

  const year = base.getUTCFullYear();
  const monthIndex0 = base.getUTCMonth();
  const last = lastDayOfMonthUTC(year, monthIndex0);
  const day = Math.min(dueDay, last);

  const due = new Date(Date.UTC(year, monthIndex0, day, 12, 0, 0));
  return due.toISOString().slice(0, 10);
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

function computeLateFee(
  amount: number,
  dueDateISO: string,
  policy?: { type?: string; value?: number },
  status?: string
): number {
  if (!policy || policy.type === "NONE") return 0;
  if (status === "PAID") return 0;

  const due = startOfDay(new Date(dueDateISO + "T00:00:00"));
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

type ContractLean = {
  _id: Types.ObjectId | string;
  code: string;
  status?: ContractStatus;
  tenantId?: string;

  propertyId?: unknown;
  ownerId?: unknown;
  tenantPersonId?: unknown;

  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD

  duracionMeses?: number;
  montoBase?: number;
  dueDay?: number;

  billing?: {
    lateFeePolicy?: { type?: "NONE" | "FIXED" | "PERCENT"; value?: number };
    baseRent?: number;
    dueDay?: number;
    actualizacionCadaMeses?: number;
    ajustes?: Array<{ n: number; percentage: number }>;
    notes?: string;
    commissionMonthlyPct?: number;
    commissionTotalPct?: number;
  };
};

type InstallmentLean = {
  tenantId?: string;
  contractId?: Types.ObjectId | string;
  period: string;
  dueDate: string; // guardado como string o ISO recortado
  amount?: number;
  status?: "PENDING" | "PAID" | string;
  paidAmount?: number;
};

type PaymentLean = {
  tenantId?: string;
  contractId?: Types.ObjectId | string; // ✅ FIX: ObjectId o string
  date?: Date | string;                // ✅ suele ser Date en mongo
  status?: "OK" | "VOID" | string;
  amount?: number;
};

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** asegura ObjectId para filtros */
function toObjectId(v: unknown): Types.ObjectId | null {
  if (v instanceof Types.ObjectId) return v;
  const s = String(v ?? "");
  return Types.ObjectId.isValid(s) ? new Types.ObjectId(s) : null;
}

async function syncContractStates(): Promise<void> {
  const nowISO = toISODateLocal(new Date());
  const nowPlus3ISO = addMonthsISO(nowISO, 3);

  await Contract.updateMany(
    {
      tenantId: TENANT_ID,
      status: "ACTIVE",
      endDate: { $gt: nowISO, $lte: nowPlus3ISO }, // ✅ strings
    },
    { $set: { status: "EXPIRING" satisfies ContractStatus } }
  );

  const ended = await Contract.find(
    {
      tenantId: TENANT_ID,
      status: { $in: ["ACTIVE", "EXPIRING"] },
      endDate: { $lte: nowISO }, // ✅ strings
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

export async function GET(
  _req: NextRequest,
  ctx: { params: { id: string } } | { params: Promise<{ id: string }> }
) {
  try {
    await dbConnect();
    await syncContractStates();

    const isPromise = <T,>(v: unknown): v is Promise<T> =>
      typeof v === "object" && v !== null && "then" in v && typeof (v as { then: unknown }).then === "function";

    const id = isPromise<{ id: string }>(ctx.params) ? (await ctx.params).id : (ctx.params as { id: string }).id;

    let contract: ContractLean | null = null;

    if (/^[0-9a-fA-F]{24}$/.test(id)) {
      contract = (await Contract.findOne({ tenantId: TENANT_ID, _id: id })
        .populate("propertyId")
        .populate("ownerId")
        .populate("tenantPersonId")
        .lean()) as ContractLean | null;
    }

    if (!contract) {
      contract = (await Contract.findOne({ tenantId: TENANT_ID, code: id })
        .populate("propertyId")
        .populate("ownerId")
        .populate("tenantPersonId")
        .lean()) as ContractLean | null;
    }

    if (!contract) {
      return NextResponse.json({ ok: false, error: "Contrato no encontrado." }, { status: 404 });
    }

    const contractId = String(contract._id);

    const installments = (await Installment.find({
      tenantId: TENANT_ID,
      contractId,
    })
      .sort({ dueDate: 1 })
      .lean()) as InstallmentLean[];

    const lateFeePolicy = contract.billing?.lateFeePolicy ?? { type: "NONE", value: 0 };

    const installmentsWithLateFee = installments.map((it) => ({
      ...it,
      lateFeeAccrued: computeLateFee(
        Number(it.amount) || 0,
        String(it.dueDate).slice(0, 10),
        lateFeePolicy,
        it.status
      ),
    }));

    const payments = (await Payment.find({
      tenantId: TENANT_ID,
      contractId,
    })
      .sort({ date: -1 })
      .lean()) as PaymentLean[];

    const totalDue = installments.reduce((acc, it) => acc + (Number(it.amount) || 0), 0);
    const totalPaidOk = payments.reduce((acc, p) => (p.status === "OK" ? acc + (Number(p.amount) || 0) : acc), 0);

    return NextResponse.json({
      ok: true,
      contract,
      installments: installmentsWithLateFee,
      payments,
      totals: {
        billed: totalDue,
        paid: totalPaidOk,
        balance: totalDue - totalPaidOk,
      },
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { ok: false, error: `Failed to fetch contract detail: ${getErrorMessage(err)}` },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: NextRequest,
  ctx: { params: { id: string } } | { params: Promise<{ id: string }> }
) {
  try {
    await dbConnect();

    const isPromise = <T,>(v: unknown): v is Promise<T> =>
      typeof v === "object" && v !== null && "then" in v && typeof (v as { then: unknown }).then === "function";

    const id = isPromise<{ id: string }>(ctx.params) ? (await ctx.params).id : (ctx.params as { id: string }).id;

    const body = (await req.json()) as Partial<{
      propertyId: string;
      ownerId: string;
      tenantPersonId: string;

      startDate: string; // ✅ STRING
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

      porcentajeActualizacion?: unknown;
    }>;

    if (!body.propertyId || !body.ownerId || !body.tenantPersonId || !body.startDate) {
      return NextResponse.json({ ok: false, message: "Faltan campos obligatorios" }, { status: 400 });
    }

    const duracionMeses = Number(body.duracionMeses ?? 0);
    const montoBase = Number(body.montoBase ?? 0);
    const dueDay = Number(body.dueDay ?? 0);

    if (!duracionMeses || duracionMeses < 1) {
      return NextResponse.json({ ok: false, message: "duracionMeses inválido" }, { status: 400 });
    }
    if (Number.isNaN(montoBase) || montoBase < 0) {
      return NextResponse.json({ ok: false, message: "montoBase inválido" }, { status: 400 });
    }
    if (Number.isNaN(dueDay) || dueDay < 1 || dueDay > 28) {
      return NextResponse.json({ ok: false, message: "dueDay inválido" }, { status: 400 });
    }

    const startDateISO = isoDateOnly(body.startDate);
    const endDateISO = addMonthsISO(startDateISO, duracionMeses);

    const currency = (body.currency ? String(body.currency).trim() : "ARS") || "ARS";
    const actualizacionCadaMeses = Number(body.actualizacionCadaMeses ?? 0);
    const notes = body.billing?.notes ? String(body.billing.notes).trim() : "";

    const contract = await Contract.findOneAndUpdate(
      { tenantId: TENANT_ID, _id: id },
      {
        propertyId: new Types.ObjectId(body.propertyId),
        ownerId: new Types.ObjectId(body.ownerId),
        tenantPersonId: new Types.ObjectId(body.tenantPersonId),

        startDate: startDateISO,
        endDate: endDateISO,

        duracionMeses,
        montoBase: Math.round(montoBase),
        dueDay: Math.round(dueDay),
        currency,

        actualizacionCadaMeses: Number.isFinite(actualizacionCadaMeses) ? actualizacionCadaMeses : 0,

        billing: {
          dueDay: Math.round(dueDay),
          baseRent: Math.round(montoBase),
          currency,
          actualizacionCadaMeses: Number.isFinite(actualizacionCadaMeses) ? actualizacionCadaMeses : 0,
          ajustes: Array.isArray(body.ajustes) ? body.ajustes : [],
          lateFeePolicy: body.billing?.lateFeePolicy ?? { type: "NONE", value: 0 },
          notes: notes || "Sin notas",
          commissionMonthlyPct: Number.isFinite(Number(body.billing?.commissionMonthlyPct))
            ? Number(body.billing?.commissionMonthlyPct)
            : 0,
          commissionTotalPct: Number.isFinite(Number(body.billing?.commissionTotalPct))
            ? Number(body.billing?.commissionTotalPct)
            : 0,
        },
      },
      { new: true }
    );

    if (!contract) {
      return NextResponse.json({ ok: false, message: "Contrato no encontrado" }, { status: 404 });
    }

    // ✅ Regenerar cuotas NO pagadas (usando startDateISO string)
    try {
      const duracion = duracionMeses;
      const baseRent = Math.round(montoBase);
      const dueDayInt = Math.round(dueDay);
      const cada = Number.isFinite(actualizacionCadaMeses) ? actualizacionCadaMeses : 0;

      let ajustes: Array<{ n: number; percentage: number }> = Array.isArray(body.ajustes) ? body.ajustes : [];
      if (!ajustes.length && Array.isArray(body.billing?.ajustes)) ajustes = body.billing!.ajustes!;
      if (!ajustes.length) {
        const pctCompat = toNumberSafe(body.porcentajeActualizacion ?? 0);
        if (cada > 0 && Number.isFinite(pctCompat) && pctCompat > 0) {
          ajustes = buildAjustesCompat(duracion, cada, pctCompat);
        }
      }

      const contractId = String((contract as { _id: Types.ObjectId | string })._id);

      const existing = (await Installment.find({ tenantId: TENANT_ID, contractId }).lean()) as InstallmentLean[];

      const paidPeriods = new Set(
        existing
          .filter((it) => it.status === "PAID" || (it.paidAmount && Number(it.paidAmount) > 0))
          .map((it) => String(it.period))
      );

      await Installment.deleteMany({ tenantId: TENANT_ID, contractId, status: { $ne: "PAID" } });

      type NewInstallment = {
        tenantId: string;
        contractId: string;
        period: string;
        dueDate: string; // ✅ string YYYY-MM-DD
        amount: number;
        lateFeeAccrued: number;
        status: "PENDING";
        paidAmount: number;
        paidAt: null;
        lastReminderAt: null;
      };

      const installmentsToInsert: NewInstallment[] = [];

      let currentAmount = baseRent;
      let adjIndex = 0;

      for (let month = 1; month <= duracion; month += 1) {
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
        const monthDate = new Date(startDateISO + "T00:00:00Z");
        monthDate.setUTCMonth(monthDate.getUTCMonth() + monthOffset);

        const period = formatPeriodYYYYMM_UTC(monthDate);
        if (paidPeriods.has(period)) continue;

        const dueDateISO = buildDueDateISOForPeriod(startDateISO, monthOffset, dueDayInt);

        installmentsToInsert.push({
          tenantId: TENANT_ID,
          contractId,
          period,
          dueDate: dueDateISO,
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

export async function DELETE(
  _req: NextRequest,
  ctx: { params: { id: string } } | { params: Promise<{ id: string }> }
) {
  try {
    await dbConnect();

    const isPromise = <T,>(v: unknown): v is Promise<T> =>
      typeof v === "object" && v !== null && "then" in v && typeof (v as { then: unknown }).then === "function";

    const id = isPromise<{ id: string }>(ctx.params) ? (await ctx.params).id : (ctx.params as { id: string }).id;

    const objectId = Types.ObjectId.isValid(id) ? new Types.ObjectId(id) : id;

    const contract = (await Contract.findOneAndDelete({ _id: objectId, tenantId: TENANT_ID }).lean()) as
      | ({ _id: Types.ObjectId | string; propertyId?: Types.ObjectId | string } & Record<string, unknown>)
      | null;

    if (!contract) {
      return NextResponse.json({ ok: false, message: "Contrato no encontrado" }, { status: 404 });
    }

    const propertyObjectId = toObjectId(contract.propertyId);
    if (!propertyObjectId) {
      // si no es ObjectId válido, igual devolvemos ok (ya borró contrato) pero no tocamos property.
      return NextResponse.json({ ok: true });
    }

    const stillActive = await Contract.exists({
      tenantId: TENANT_ID,
      propertyId: propertyObjectId,
      status: { $in: ["ACTIVE", "EXPIRING"] },
    });

    if (!stillActive) {
      await Property.findByIdAndUpdate(propertyObjectId, {
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

