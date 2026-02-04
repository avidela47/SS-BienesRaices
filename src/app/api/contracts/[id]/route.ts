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
      billing?: { lateFeePolicy?: { type: "NONE" | "FIXED" | "PERCENT"; value: number }; notes?: string };
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
    if (Number.isNaN(startDate.getTime())) {
      return NextResponse.json({ ok: false, message: "startDate inválido" }, { status: 400 });
    }

    const endDate = addMonthsSafe(startDate, duracionMeses);
    const currency = (body.currency ? String(body.currency).trim() : "ARS") || "ARS";
    const actualizacionCadaMeses = Number(body.actualizacionCadaMeses ?? 0);
    const notes = body.billing?.notes ? String(body.billing.notes).trim() : "";

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
        },
      },
      { new: true }
    );

    if (!contract) {
      return NextResponse.json({ ok: false, message: "Contrato no encontrado" }, { status: 404 });
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
