// src/app/api/payments/[id]/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { Types } from "mongoose";
import { dbConnect } from "@/lib/mongoose";
import { Payment } from "@/models/Payment";
import Installment from "@/models/Installment";

const TENANT_ID = "default";

type PatchBody = {
  amount?: number | string;
  method?: "CASH" | "TRANSFER" | "CARD" | "OTHER";
  reference?: string;
  notes?: string;
};

type ParamsCtx =
  | { params: { id: string } }
  | { params: Promise<{ id: string }> };

function num(v: unknown, def = 0): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : def;
}

function getErr(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

async function getId(ctx: ParamsCtx): Promise<string> {
  // ✅ Next puede entregar params como Promise
  const p = "then" in ctx.params ? await ctx.params : ctx.params;
  return String(p?.id ?? "").trim();
}

/**
 * PATCH /api/payments/:id
 * Edita pago y recalcula el installment asociado.
 */
export async function PATCH(req: NextRequest, ctx: ParamsCtx) {
  try {
    await dbConnect();

    const id = await getId(ctx);
    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ ok: false, error: "ID inválido" }, { status: 400 });
    }

    const body = (await req.json()) as PatchBody;

    const payment = await Payment.findOne({ tenantId: TENANT_ID, _id: new Types.ObjectId(id) });
    if (!payment) {
      return NextResponse.json({ ok: false, error: "Pago no encontrado" }, { status: 404 });
    }

    // update fields
    if (body.amount !== undefined) {
      const a = num(body.amount, NaN);
      if (!Number.isFinite(a) || a <= 0) {
        return NextResponse.json({ ok: false, error: "amount inválido" }, { status: 400 });
      }
      payment.amount = a;
    }
    if (body.method) payment.method = body.method;
    if (body.reference !== undefined) payment.reference = String(body.reference || "");
    if (body.notes !== undefined) payment.notes = String(body.notes || "");

    await payment.save();

    // Recalcular installment (paidAmount + status)
    const installmentId = String(payment.installmentId ?? "");
    if (Types.ObjectId.isValid(installmentId)) {
      const inst = await Installment.findOne({ tenantId: TENANT_ID, _id: new Types.ObjectId(installmentId) });
      if (inst) {
        const pays = await Payment.find({
          tenantId: TENANT_ID,
          installmentId: new Types.ObjectId(installmentId),
          status: { $ne: "VOID" },
        }).lean();

        const paidAmount = pays.reduce((acc, p) => acc + num((p as { amount?: unknown }).amount, 0), 0);
        inst.paidAmount = paidAmount;

        if (paidAmount <= 0) inst.status = "PENDING";
        else if (paidAmount >= (inst.amount || 0)) inst.status = "PAID";
        else inst.status = "PARTIAL";

        inst.paidAt = inst.status === "PAID" ? new Date() : null;
        await inst.save();
      }
    }

    return NextResponse.json({ ok: true, payment });
  } catch (err: unknown) {
    return NextResponse.json({ ok: false, error: getErr(err) }, { status: 500 });
  }
}

/**
 * DELETE /api/payments/:id
 * Soft delete (VOID) y recalcula el installment asociado.
 *
 * Nota: tu UI hoy usa DELETE directo, y manda body con {reason, voidedBy}.
 * Next soporta body en DELETE, lo leemos opcional.
 */
export async function DELETE(req: NextRequest, ctx: ParamsCtx) {
  try {
    await dbConnect();

    const id = await getId(ctx);
    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ ok: false, error: "ID inválido" }, { status: 400 });
    }

    const payment = await Payment.findOne({ tenantId: TENANT_ID, _id: new Types.ObjectId(id) });
    if (!payment) {
      return NextResponse.json({ ok: false, error: "Pago no encontrado" }, { status: 404 });
    }

    // body opcional (para motivo)
    let voidReason = "";
    let voidedBy = "system";
    try {
      const b = (await req.json()) as { reason?: string; voidedBy?: string };
      if (b?.reason) voidReason = String(b.reason);
      if (b?.voidedBy) voidedBy = String(b.voidedBy);
    } catch {
      // si no hay body, no pasa nada
    }

    // Soft delete
    payment.status = "VOID";
    payment.voidedAt = new Date();
    payment.voidedBy = voidedBy;
    payment.voidReason = voidReason;
    await payment.save();

    // Recalcular installment
    const installmentId = String(payment.installmentId ?? "");
    if (Types.ObjectId.isValid(installmentId)) {
      const inst = await Installment.findOne({ tenantId: TENANT_ID, _id: new Types.ObjectId(installmentId) });
      if (inst) {
        const pays = await Payment.find({
          tenantId: TENANT_ID,
          installmentId: new Types.ObjectId(installmentId),
          status: { $ne: "VOID" },
        }).lean();

        const paidAmount = pays.reduce((acc, p) => acc + num((p as { amount?: unknown }).amount, 0), 0);
        inst.paidAmount = paidAmount;

        if (paidAmount <= 0) inst.status = "PENDING";
        else if (paidAmount >= (inst.amount || 0)) inst.status = "PAID";
        else inst.status = "PARTIAL";

        inst.paidAt = inst.status === "PAID" ? new Date() : null;
        await inst.save();
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    return NextResponse.json({ ok: false, error: getErr(err) }, { status: 500 });
  }
}

