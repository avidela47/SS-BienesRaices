import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongoose";
import { Payment } from "@/models/Payment";

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
