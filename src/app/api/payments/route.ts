import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongoose";
import Installment from "@/models/Installment";
import { Payment, type PaymentMethod } from "@/models/Payment";

const TENANT_ID = "default";

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "unknown";
}

export async function GET(req: NextRequest) {
  try {
    await dbConnect();

    const { searchParams } = new URL(req.url);

    // filtros opcionales (no obligatorios)
    const from = searchParams.get("from"); // YYYY-MM-DD
    const to = searchParams.get("to"); // YYYY-MM-DD
    const method = searchParams.get("method"); // CASH | TRANSFER | CARD | OTHER
    const contractId = searchParams.get("contractId"); // ObjectId string
    const reference = searchParams.get("reference"); // contiene

    const q: Record<string, unknown> = { tenantId: TENANT_ID };

    // fechas
    if (from || to) {
      const dateFilter: Record<string, Date> = {};
      if (from) dateFilter.$gte = new Date(from + "T00:00:00.000Z");
      if (to) dateFilter.$lte = new Date(to + "T23:59:59.999Z");
      q.date = dateFilter;
    }

    // método
    if (method && method !== "ALL") {
      q.method = method;
    }

    // contrato
    if (contractId) {
      q.contractId = contractId;
    }

    // referencia contiene (case-insensitive)
    if (reference) {
      q.reference = { $regex: reference, $options: "i" };
    }

    const payments = await Payment.find(q).sort({ date: -1 }).lean();

    return NextResponse.json({ ok: true, payments });
  } catch (err: unknown) {
    return NextResponse.json(
      { ok: false, error: `Failed to fetch payments: ${getErrorMessage(err)}` },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
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
      return NextResponse.json({ ok: false, error: "installmentId required" }, { status: 400 });
    }
    if (typeof data.amount !== "number" || data.amount <= 0) {
      return NextResponse.json({ ok: false, error: "amount must be > 0" }, { status: 400 });
    }
    if (!data.method) {
      return NextResponse.json({ ok: false, error: "method required" }, { status: 400 });
    }

    const installment = await Installment.findOne({ _id: data.installmentId, tenantId: TENANT_ID });
    if (!installment) {
      return NextResponse.json({ ok: false, error: "installment not found" }, { status: 400 });
    }

    const paymentDate = data.date ? new Date(data.date) : new Date();

    const payment = await Payment.create({
      tenantId: TENANT_ID,
      contractId: installment.contractId,
      installmentId: installment._id,
      date: paymentDate,
      amount: data.amount,
      method: data.method,
      reference: data.reference || "",
      notes: data.notes || "",
      createdBy: "system",
    });

    const newPaid = (installment.paidAmount || 0) + data.amount;

    if (newPaid >= installment.amount) {
      installment.paidAmount = installment.amount;
      installment.status = "PAID";
      installment.paidAt = paymentDate;
    } else {
      installment.paidAmount = newPaid;
      installment.status = "PARTIAL";
      installment.paidAt = null;
    }

    await installment.save();

    return NextResponse.json({ ok: true, payment, installment });
  } catch (err: unknown) {
    return NextResponse.json(
      { ok: false, error: `Failed to create payment: ${getErrorMessage(err)}` },
      { status: 500 }
    );
  }
}
