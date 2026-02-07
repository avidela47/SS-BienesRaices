import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongoose";
import { CashMovement, type CashMovementStatus, type CashMovementType } from "@/models/CashMovement";

// ✅ REGISTRA MODELOS PARA POPULATE EN ESTE RUNTIME
import "@/models/Property";
import "@/models/Contract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const TENANT_ID = "default";

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "unknown";
}

function parseDateRange(from?: string | null, to?: string | null) {
  if (!from && !to) return undefined;
  const dateFilter: Record<string, Date> = {};
  if (from) dateFilter.$gte = new Date(from + "T00:00:00.000Z");
  if (to) dateFilter.$lte = new Date(to + "T23:59:59.999Z");
  return dateFilter;
}

export async function GET(req: NextRequest) {
  try {
    await dbConnect();

    const { searchParams } = new URL(req.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const status = searchParams.get("status");
    const type = searchParams.get("type");
    const contractId = searchParams.get("contractId");
    const propertyId = searchParams.get("propertyId");
    const ownerId = searchParams.get("ownerId");
    const tenantPersonId = searchParams.get("tenantPersonId");
    const paymentId = searchParams.get("paymentId");

    const q: Record<string, unknown> = { tenantId: TENANT_ID };

    const dateFilter = parseDateRange(from, to);
    if (dateFilter) q.date = dateFilter;

    if (status && status !== "ALL") q.status = status;
    if (type && type !== "ALL") q.type = type;
    if (contractId) q.contractId = contractId;
    if (propertyId) q.propertyId = propertyId;
    if (ownerId) q.ownerId = ownerId;
    if (tenantPersonId) q.tenantPersonId = tenantPersonId;
    if (paymentId) q.paymentId = paymentId;

    const movements = await CashMovement.find(q)
      .sort({ date: -1 })
      .populate("contractId", "code")
      .populate("propertyId", "code addressLine unit city")
      .lean();

    const withDisplay = movements.map((movement) => {
      const contract = movement.contractId as { _id?: unknown; code?: string } | null;
      const property = movement.propertyId as
        | { _id?: unknown; code?: string; addressLine?: string; unit?: string; city?: string }
        | null;

      const contractLabel = contract?.code || (contract?._id ? String(contract._id) : "");
      const addressParts = [property?.addressLine, property?.unit, property?.city].filter(Boolean);
      const propertyLabel = property?.code ? `${property.code} · ${addressParts.join(" ")}` : addressParts.join(" ");

      return {
        ...movement,
        contractLabel,
        propertyLabel,
      };
    });

    const summary = withDisplay.reduce(
      (acc, m) => {
        const amount = typeof m.amount === "number" ? m.amount : 0;
        const st = m.status as CashMovementStatus;
        const tp = m.type as CashMovementType;

        // Total caja = dinero efectivamente ingresado (sin contar pasivos READY_TO_TRANSFER)
        if ((st === "COLLECTED" || st === "RETAINED") && tp !== "EXPENSE") {
          acc.total += amount;
        }

        acc.byStatus[st] = (acc.byStatus[st] || 0) + amount;
        acc.byType[tp] = (acc.byType[tp] || 0) + amount;
        return acc;
      },
      {
        total: 0,
        byStatus: {} as Record<CashMovementStatus, number>,
        byType: {} as Record<CashMovementType, number>,
      }
    );

    return NextResponse.json({ ok: true, movements: withDisplay, summary });
  } catch (err: unknown) {
    return NextResponse.json(
      { ok: false, error: `Failed to fetch cash movements: ${getErrorMessage(err)}` },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    await dbConnect();

    const body = (await req.json().catch(() => ({}))) as Partial<{
      type: CashMovementType;
      subtype?: string;
      status: CashMovementStatus;
      amount: number;
      currency?: string;
      date?: string;
      contractId: string;
      propertyId: string;
      ownerId: string;
      tenantPersonId: string;
      partyType?: "AGENCY" | "OWNER" | "TENANT" | "GUARANTOR" | "OTHER";
      partyId?: string;
      installmentId?: string;
      paymentId?: string;
      notes?: string;
      createdBy?: string;
    }>;

    if (!body.type) return NextResponse.json({ ok: false, error: "type required" }, { status: 400 });
    if (!body.status) return NextResponse.json({ ok: false, error: "status required" }, { status: 400 });
    if (typeof body.amount !== "number" || body.amount <= 0) {
      return NextResponse.json({ ok: false, error: "amount must be > 0" }, { status: 400 });
    }
    if (!body.contractId || !body.propertyId || !body.ownerId || !body.tenantPersonId) {
      return NextResponse.json(
        { ok: false, error: "contractId, propertyId, ownerId, tenantPersonId required" },
        { status: 400 }
      );
    }

    const movement = await CashMovement.create({
      tenantId: TENANT_ID,
      type: body.type,
      subtype: body.subtype || "",
      status: body.status,
      amount: body.amount,
      currency: body.currency || "ARS",
      date: body.date ? new Date(body.date) : new Date(),
      contractId: body.contractId,
      propertyId: body.propertyId,
      ownerId: body.ownerId,
      tenantPersonId: body.tenantPersonId,
      partyType: body.partyType || "AGENCY",
      partyId: body.partyId,
      installmentId: body.installmentId,
      paymentId: body.paymentId,
      notes: body.notes || "",
      createdBy: body.createdBy || "system",
    });

    return NextResponse.json({ ok: true, movement });
  } catch (err: unknown) {
    return NextResponse.json(
      { ok: false, error: `Failed to create cash movement: ${getErrorMessage(err)}` },
      { status: 500 }
    );
  }
}
