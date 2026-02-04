import { NextResponse, type NextRequest } from "next/server";
import { dbConnect } from "@/lib/mongoose";
import { Payment } from "@/models/Payment";
import Installment from "@/models/Installment";
import { CashMovement } from "@/models/CashMovement";

type VoidBody = {
  reason?: string;
  voidedBy?: string;
};

export async function POST(req: NextRequest, ctx: { params: { id: string } }) {
  try {
  await dbConnect();

    const id = ctx.params.id;
    const body = (await req.json().catch(() => ({}))) as VoidBody;

    const payment = await Payment.findById(id);
    if (!payment) return NextResponse.json({ ok: false, error: "Pago no encontrado" }, { status: 404 });

    if (payment.status === "VOID") {
      return NextResponse.json({ ok: true, payment }, { status: 200 });
    }

    // 1) Marcar el pago como VOID (soft delete)
    payment.status = "VOID";
    payment.voidedAt = new Date();
    payment.voidedBy = (body.voidedBy || "system").trim() || "system";
    payment.voidReason = (body.reason || "").trim();
    await payment.save();

  // 2) Recalcular la cuota (installment) con pagos OK
    const installmentId = payment.installmentId?.toString();
    if (!installmentId) {
      return NextResponse.json({ ok: true, payment, warning: "Pago sin installmentId" }, { status: 200 });
    }

    const installment = await Installment.findById(installmentId);
    if (!installment) {
      return NextResponse.json({ ok: true, payment, warning: "Cuota no encontrada" }, { status: 200 });
    }

    const okPayments = await Payment.find({
      installmentId: installment._id,
      tenantId: installment.tenantId,
      status: "OK",
    }).sort({ date: 1 });

    const paidSum = okPayments.reduce((acc: number, p) => acc + (typeof p.amount === "number" ? p.amount : 0), 0);

    const isPaid = paidSum >= installment.amount;

    installment.paidAmount = paidSum;
    installment.status = isPaid ? "PAID" : "PENDING";
    installment.paidAt = isPaid ? okPayments[okPayments.length - 1]?.date ?? new Date() : null;

    await installment.save();

    // 3) Anular movimientos de caja asociados
    await CashMovement.updateMany(
      { paymentId: payment._id, status: { $ne: "VOID" } },
      {
        $set: {
          status: "VOID",
          voidedAt: new Date(),
          voidedBy: (body.voidedBy || "system").trim() || "system",
          voidReason: (body.reason || "").trim(),
        },
      }
    );

    return NextResponse.json({ ok: true, payment, installment });
  } catch (e) {
    console.error("POST /api/payments/[id]/void error:", e);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}
