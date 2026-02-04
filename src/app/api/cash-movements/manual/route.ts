import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongoose";
import Contract from "@/models/Contract";
import { CashMovement } from "@/models/CashMovement";

const TENANT_ID = "default";

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "unknown";
}

export async function POST(req: NextRequest) {
  try {
    await dbConnect();

    const body = (await req.json().catch(() => ({}))) as Partial<{
      contractId: string;
      type: "INCOME" | "EXPENSE" | "COMMISSION" | "RETENTION" | "ADJUSTMENT";
      subtype?: string;
      status: "PENDING" | "COLLECTED" | "RETAINED" | "READY_TO_TRANSFER" | "TRANSFERRED" | "VOID";
      amount: number;
      currency?: string;
      date?: string;
      partyType?: "AGENCY" | "OWNER" | "TENANT" | "GUARANTOR" | "OTHER";
      partyId?: string;
      notes?: string;
      createdBy?: string;
    }>;

    if (!body.contractId) {
      return NextResponse.json({ ok: false, error: "contractId required" }, { status: 400 });
    }
    if (!body.type) {
      return NextResponse.json({ ok: false, error: "type required" }, { status: 400 });
    }
    if (!body.status) {
      return NextResponse.json({ ok: false, error: "status required" }, { status: 400 });
    }
    if (typeof body.amount !== "number" || body.amount <= 0) {
      return NextResponse.json({ ok: false, error: "amount must be > 0" }, { status: 400 });
    }

    const contract = await Contract.findOne({ tenantId: TENANT_ID, _id: body.contractId }).lean();
    if (!contract) {
      return NextResponse.json({ ok: false, error: "contract not found" }, { status: 404 });
    }

    const partyType = body.partyType || "AGENCY";
    const partyId =
      body.partyId ||
      (partyType === "OWNER"
        ? String(contract.ownerId)
        : partyType === "TENANT"
          ? String(contract.tenantPersonId)
          : undefined);

    const movement = await CashMovement.create({
      tenantId: TENANT_ID,
      type: body.type,
      subtype: body.subtype || "",
      status: body.status,
      amount: body.amount,
      currency: body.currency || contract.billing?.currency || "ARS",
      date: body.date ? new Date(body.date) : new Date(),
      contractId: contract._id,
      propertyId: contract.propertyId,
      ownerId: contract.ownerId,
      tenantPersonId: contract.tenantPersonId,
      partyType,
      partyId,
      notes: body.notes || "",
      createdBy: body.createdBy || "system",
    });

    return NextResponse.json({ ok: true, movement });
  } catch (err: unknown) {
    return NextResponse.json(
      { ok: false, error: `Failed to create manual cash movement: ${getErrorMessage(err)}` },
      { status: 500 }
    );
  }
}
