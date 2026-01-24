import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongoose";
import Installment from "@/models/Installment";
import { Payment } from "@/models/Payment";

const TENANT_ID = "default";

type PaymentMethod = "CASH" | "TRANSFER" | "MP" | "OTHER";

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "unknown";
}

export async function POST(req: Request) {
  try {
    await dbConnect();

    const body: unknown = await req.json();
    const data = body as Partial<{
      installmentId: string;
      amount: number;
      method: PaymentMethod;
      reference?: string;
      notes?: string;
      date?: string; // ISO opcional
    }>;

    if (!data.installmentId) {
      return NextResponse.json({ ok: false, message: "installmentId required" }, { status: 400 });
    }
    if (typeof data.amount !== "number" || data.amount <= 0) {
      return NextResponse.json({ ok: false, message: "amount must be > 0" }, { status: 400 });
    }
    if (!data.method) {
      return NextResponse.json({ ok: false, message: "method required" }, { status: 400 });
    }

    const inst = await Installment.findOne({ _id: data.installmentId, tenantId: TENANT_ID });
    if (!inst) {
      return NextResponse.json({ ok: false, message: "installment not found" }, { status: 400 });
    }

    const paymentDate = data.date ? new Date(data.date) : new Date();

    // Crear pago
    await Payment.create({
      tenantId: TENANT_ID,
      contractId: inst.contractId,
      installmentId: inst._id,
      date: paymentDate,
      amount: data.amount,
      method: data.method,
      reference: data.reference || "",
      notes: data.notes || "",
      createdBy: "system",
    });

    // Actualizar cuota
    const newPaid = (inst.paidAmount || 0) + data.amount;

    if (newPaid >= inst.amount) {
      inst.paidAmount = inst.amount;
      inst.status = "PAID";
      inst.paidAt = paymentDate;
    } else {
      inst.paidAmount = newPaid;
      inst.status = "PARTIAL";
      inst.paidAt = null;
    }

    await inst.save();

    return NextResponse.json({ ok: true, installment: inst });
  } catch (err: unknown) {
    return NextResponse.json(
      { ok: false, message: "Failed to pay installment", error: getErrorMessage(err) },
      { status: 500 }
    );
  }
}
