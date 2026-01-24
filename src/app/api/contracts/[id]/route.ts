import { Types } from "mongoose";
import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongoose";

import Contract from "@/models/Contract";
import Installment from "@/models/Installment";
import { Payment } from "@/models/Payment";

const TENANT_ID = "default";

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "unknown";
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

// GET: Detalle de contrato
export async function GET(
  _req: NextRequest,
  ctx: { params: { id: string } } | { params: Promise<{ id: string }> }
) {
  try {
    await dbConnect();

    // Soportar params como Promise (Next.js 14+)
  let id: string;
    function isPromise<T>(v: unknown): v is Promise<T> {
      return (
        typeof v === "object" &&
        v !== null &&
        "then" in v &&
        typeof (v as { then: unknown }).then === "function"
      );
    }
    if (isPromise<{ id: string }>(ctx.params)) {
      const resolved = await ctx.params;
      id = resolved.id;
    } else {
      id = (ctx.params as { id: string }).id;
    }

    // Buscar por _id o por code (ambos únicos por tenant)
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
      return NextResponse.json(
        { ok: false, error: "Contrato no encontrado." },
        { status: 404 }
      );
    }

    const installments = await Installment.find({
      tenantId: TENANT_ID,
      contractId: id,
    })
      .sort({ dueDate: 1 })
      .lean();

    const payments = await Payment.find({
      tenantId: TENANT_ID,
      contractId: id,
    })
      .sort({ date: -1 })
      .lean();

    const totalDue = installments.reduce(
      (acc: number, it: { amount?: number }) => acc + (Number(it.amount) || 0),
      0
    );

    const totalPaidOk = payments.reduce((acc: number, p: { status?: string; amount?: number }) => {
      if (p.status === "OK") return acc + (Number(p.amount) || 0);
      return acc;
    }, 0);

    const totalPaidVoid = payments.reduce((acc: number, p: { status?: string; amount?: number }) => {
      if (p.status === "VOID") return acc + (Number(p.amount) || 0);
      return acc;
    }, 0);

    const paidInstallments = installments.reduce(
      (acc: number, it: { status?: string }) => acc + (it.status === "PAID" ? 1 : 0),
      0
    );
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
      installments,
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

// PUT: Editar contrato
export async function PUT(req: NextRequest, ctx: { params: { id: string } }) {
  try {
    await dbConnect();
    const { id } = ctx.params;
    const body = await req.json();

    const contract = await Contract.findOneAndUpdate(
      { tenantId: TENANT_ID, _id: id },
      {
        ...body,
        billing: {
          dueDay: body.diaVencimiento ? Number(body.diaVencimiento) : 1,
          baseRent: body.valorCuota ? Number(body.valorCuota) : 0,
          currency: "ARS",
          actualizacionCada: body.actualizacionCada ? Number(body.actualizacionCada) : 0,
          porcentajeActualizacion: body.porcentajeActualizacion ? Number(body.porcentajeActualizacion) : 0,
          lateFeePolicy: { type: "NONE", value: 0 },
          notes: "",
        },
        duracion: body.duracion ? Number(body.duracion) : 0,
        montoCuota: body.montoCuota ? Number(body.montoCuota) : 0,
        comision: body.comision ? Number(body.comision) : 0,
        expensas: body.expensas || "no",
        otrosGastosImporte: body.otrosGastosImporte ? Number(body.otrosGastosImporte) : 0,
        otrosGastosDesc: body.otrosGastosDesc || "",
      },
      { new: true }
    );
    if (!contract) {
      return NextResponse.json(
        { ok: false, message: "Contrato no encontrado" },
        { status: 404 }
      );
    }
    return NextResponse.json({ ok: true, contract });
  } catch (err: unknown) {
    return NextResponse.json(
      { ok: false, message: "Failed to update contract", error: getErrorMessage(err) },
      { status: 500 }
    );
  }
}

// DELETE: Eliminar contrato
export async function DELETE(_req: NextRequest, ctx: { params: { id: string } }) {
  console.log('DELETE contrato: id recibido =', ctx.params.id);
  try {
    await dbConnect();
    // Soportar params como Promise (Next.js 14+)
    let id: string;
    function isPromise<T>(v: unknown): v is Promise<T> {
      return (
        typeof v === "object" &&
        v !== null &&
        "then" in v &&
        typeof (v as { then: unknown }).then === "function"
      );
    }
    if (isPromise<{ id: string }>(ctx.params)) {
      const resolved = await ctx.params;
      id = resolved.id;
    } else {
      id = (ctx.params as { id: string }).id;
    }
    const objectId = Types.ObjectId.isValid(id) ? new Types.ObjectId(id) : id;
    const contract = await Contract.findOneAndDelete({
      _id: objectId,
    });
    console.log('DELETE contrato: id recibido =', id);
    console.log('Resultado búsqueda contract:', contract);
    console.log('Resultado búsqueda contract:', contract);
    if (!contract) {
      return NextResponse.json(
        { ok: false, message: "Contrato no encontrado" },
        { status: 404 }
      );
    }
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    return NextResponse.json(
      { ok: false, message: "Failed to delete contract", error: getErrorMessage(err) },
      { status: 500 }
    );
  }
}
