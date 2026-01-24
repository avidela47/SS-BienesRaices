import { NextResponse, type NextRequest } from "next/server";
import connectDB from "@/lib/mongoose";
import { Payment, type PaymentMethod } from "@/models/Payment";

type PatchBody = {
  amount?: number;
  method?: PaymentMethod;
  reference?: string;
  notes?: string;
};

export async function PATCH(req: NextRequest, ctx: { params: { id: string } }) {
  try {
    await connectDB();

    const id = ctx.params.id;
    const body = (await req.json()) as PatchBody;

    const patch: Partial<PatchBody> = {};

    if (typeof body.amount === "number") {
      if (body.amount < 0) return NextResponse.json({ ok: false, error: "amount inválido" }, { status: 400 });
      patch.amount = body.amount;
    }
    if (typeof body.method === "string") patch.method = body.method;
    if (typeof body.reference === "string") patch.reference = body.reference;
    if (typeof body.notes === "string") patch.notes = body.notes;

    // No permitir editar pagos anulados
    const payment = await Payment.findById(id);
    if (!payment) return NextResponse.json({ ok: false, error: "Pago no encontrado" }, { status: 404 });
    if (payment.status === "VOID")
      return NextResponse.json({ ok: false, error: "No se puede editar un pago anulado" }, { status: 409 });

    const updated = await Payment.findByIdAndUpdate(id, patch, { new: true });

    return NextResponse.json({ ok: true, payment: updated });
  } catch (e) {
    console.error("PATCH /api/payments/[id] error:", e);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}
