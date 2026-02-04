import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongoose";
import Installment from "@/models/Installment";
import Contract from "@/models/Contract";
import { CashMovement } from "@/models/CashMovement";
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

    const prevPaidAmount = installment.paidAmount || 0;
    const prevStatus = installment.status;
    const prevPaidAt = installment.paidAt;

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

    const contract = await Contract.findOne({ tenantId: TENANT_ID, _id: installment.contractId }).lean();
    if (!contract) {
      await Payment.deleteOne({ _id: payment._id });
      installment.paidAmount = prevPaidAmount;
      installment.status = prevStatus;
      installment.paidAt = prevPaidAt || null;
      await installment.save();
      return NextResponse.json({ ok: false, error: "contract not found" }, { status: 400 });
    }

    const currency = contract.billing?.currency || "ARS";
  const commissionMonthlyPctRaw = Number(contract.billing?.commissionMonthlyPct ?? 0);
  const commissionMonthlyPct = Number.isFinite(commissionMonthlyPctRaw) ? Math.min(100, Math.max(0, commissionMonthlyPctRaw)) : 0;
  const commissionAmount = Math.round((data.amount * commissionMonthlyPct) / 100);
  const ownerNetAmount = Math.max(0, data.amount - commissionAmount);

    try {
      await CashMovement.create({
        tenantId: TENANT_ID,
        type: "INCOME",
        subtype: "RENT",
        status: "COLLECTED",
        amount: data.amount,
        currency,
        date: paymentDate,
        contractId: contract._id,
        propertyId: contract.propertyId,
        ownerId: contract.ownerId,
        tenantPersonId: contract.tenantPersonId,
        partyType: "TENANT",
        partyId: contract.tenantPersonId,
        installmentId: installment._id,
        paymentId: payment._id,
        notes: data.notes || "",
        createdBy: "system",
      });

      if (commissionAmount > 0) {
        await CashMovement.create({
          tenantId: TENANT_ID,
          type: "COMMISSION",
          subtype: "AGENCY_FEE",
          status: "COLLECTED",
          amount: commissionAmount,
          currency,
          date: paymentDate,
          contractId: contract._id,
          propertyId: contract.propertyId,
          ownerId: contract.ownerId,
          tenantPersonId: contract.tenantPersonId,
          partyType: "AGENCY",
          installmentId: installment._id,
          paymentId: payment._id,
          notes: data.notes || "",
          createdBy: "system",
        });
      }

      if (ownerNetAmount > 0) {
        await CashMovement.create({
          tenantId: TENANT_ID,
          type: "EXPENSE",
          subtype: "OWNER_NET",
          status: "READY_TO_TRANSFER",
          amount: ownerNetAmount,
          currency,
          date: paymentDate,
          contractId: contract._id,
          propertyId: contract.propertyId,
          ownerId: contract.ownerId,
          tenantPersonId: contract.tenantPersonId,
          partyType: "OWNER",
          partyId: contract.ownerId,
          installmentId: installment._id,
          paymentId: payment._id,
          notes: data.notes || "",
          createdBy: "system",
        });
      }
    } catch (movementError) {
      await CashMovement.updateMany(
        { paymentId: payment._id, status: { $ne: "VOID" } },
        { $set: { status: "VOID", voidedAt: new Date(), voidedBy: "system", voidReason: "rollback" } }
      );
      await Payment.deleteOne({ _id: payment._id });
      installment.paidAmount = prevPaidAmount;
      installment.status = prevStatus;
      installment.paidAt = prevPaidAt || null;
      await installment.save();
      return NextResponse.json(
        { ok: false, error: `Failed to create cash movement: ${getErrorMessage(movementError)}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, payment, installment });
  } catch (err: unknown) {
    return NextResponse.json(
      { ok: false, error: `Failed to create payment: ${getErrorMessage(err)}` },
      { status: 500 }
    );
  }
}
