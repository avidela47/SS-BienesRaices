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

type ParamsCtx = {
  params?: RouteParams | Promise<RouteParams>;
};

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
  ajustes?: Array<{ n: number; percentage: number }>;

  billing?: {
    lateFeePolicy?: { type: "NONE" | "FIXED" | "PERCENT"; value: number };
    notes?: string;
    commissionMonthlyPct?: number | string;
    commissionTotalPct?: number | string;
  };
};

type InstallmentLean = {
  tenantId: string;
  contractId: string;
  period: string;
  dueDate: string;
  amount: number;
  status: "PENDING" | "PAID";
  paidAmount: number;
};

type PaymentLean = {
  tenantId: string;
  contractId: string;
  status: "OK" | "VOID";
  amount: number;
};

/* =========================
   HELPERS (SIN any)
========================= */

async function resolveParams(
  params: RouteParams | Promise<RouteParams> | undefined
): Promise<RouteParams> {
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

// ✅ LOCAL DATE ONLY (evita UTC shift Argentina)
function addMonthsDateOnly(startISO: string, months: number): string {
  const [y, m, d] = startISO.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setMonth(date.getMonth() + months);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;
}

function buildDueDate(startISO: string, offset: number, dueDay: number): string {
  const [y, m] = startISO.split("-").map(Number);
  const base = new Date(y, m - 1, 1);
  base.setMonth(base.getMonth() + offset);

  const lastDay = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
  const day = Math.min(dueDay, lastDay);

  return `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/* =========================
   GET
========================= */

export async function GET(_req: NextRequest, ctx: ParamsCtx) {
  try {
    await dbConnect();
    const { id } = await resolveParams(ctx.params);

    let contract = null;

    if (Types.ObjectId.isValid(id)) {
      contract = await Contract.findOne({
        tenantId: TENANT_ID,
        _id: new Types.ObjectId(id),
      })
        .populate("propertyId")
        .populate("ownerId")
        .populate("tenantPersonId")
        .lean();
    }

    if (!contract) {
      contract = await Contract.findOne({
        tenantId: TENANT_ID,
        code: id,
      })
        .populate("propertyId")
        .populate("ownerId")
        .populate("tenantPersonId")
        .lean();
    }

    if (!contract) {
      return NextResponse.json({ ok: false, message: "Contrato no encontrado" }, { status: 404 });
    }

    const contractId = String(contract._id);

    const installments = (await Installment.find({
      tenantId: TENANT_ID,
      contractId,
    })
      .sort({ period: 1 })
      .lean()) as InstallmentLean[];

    const paymentsRaw = await Payment.find({
      tenantId: TENANT_ID,
      contractId: new Types.ObjectId(contractId),
    }).lean();

    const payments: PaymentLean[] = paymentsRaw.map((p) => ({
      tenantId: String(p.tenantId),
      contractId: String(p.contractId),
      status: p.status,
      amount: p.amount,
    }));

    return NextResponse.json({ ok: true, contract, installments, payments });
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
    const endDate = addMonthsDateOnly(startDate, Number(body.duracionMeses || 0));

    const contract = await Contract.findOneAndUpdate(
      { tenantId: TENANT_ID, _id: new Types.ObjectId(id) },
      {
        propertyId: new Types.ObjectId(body.propertyId),
        ownerId: new Types.ObjectId(body.ownerId),
        tenantPersonId: new Types.ObjectId(body.tenantPersonId),

        startDate,
        endDate,
        duracionMeses: Number(body.duracionMeses || 0),
        montoBase: Math.round(Number(body.montoBase || 0)),
        dueDay: Number(body.dueDay || 10),
        currency: (body.currency ?? "ARS").trim() || "ARS",

        billing: {
          dueDay: Number(body.dueDay || 10),
          baseRent: Math.round(Number(body.montoBase || 0)),
          actualizacionCadaMeses: Number(body.actualizacionCadaMeses ?? 0),
          lateFeePolicy: body.billing?.lateFeePolicy ?? { type: "NONE", value: 0 },
          notes: body.billing?.notes ?? "",
          commissionMonthlyPct: Number(body.billing?.commissionMonthlyPct ?? 0),
          commissionTotalPct: Number(body.billing?.commissionTotalPct ?? 0),
        },
      },
      { new: true }
    );

    if (!contract) {
      return NextResponse.json({ ok: false, message: "Contrato no encontrado" }, { status: 404 });
    }

    const contractId = String(contract._id);

    // 🔥 BORRAR cuotas NO pagadas
    await Installment.deleteMany({
      tenantId: TENANT_ID,
      contractId,
      status: { $ne: "PAID" },
    });

    // ✅ REGENERAR cuotas
    const installments: InstallmentLean[] = [];
    const [sy, sm] = startDate.split("-").map(Number);

    for (let i = 0; i < Number(body.duracionMeses || 0); i++) {
      const d = new Date(sy, sm - 1, 1);
      d.setMonth(d.getMonth() + i);

      const period = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

      installments.push({
        tenantId: TENANT_ID,
        contractId,
        period,
        dueDate: buildDueDate(startDate, i, Number(body.dueDay || 10)),
        amount: Math.round(Number(body.montoBase || 0)),
        status: "PENDING",
        paidAmount: 0,
      });
    }

    if (installments.length) {
      await Installment.insertMany(installments);
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
