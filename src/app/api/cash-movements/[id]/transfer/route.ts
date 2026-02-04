import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongoose";
import { CashMovement } from "@/models/CashMovement";

type TransferBody = {
  transferredBy?: string;
  reference?: string;
};

export async function POST(req: NextRequest, ctx: { params: { id: string } }) {
  try {
    await dbConnect();

    const id = ctx.params.id;
    const body = (await req.json().catch(() => ({}))) as TransferBody;

    const movement = await CashMovement.findById(id);
    if (!movement) {
      return NextResponse.json({ ok: false, error: "Movimiento no encontrado" }, { status: 404 });
    }

    if (movement.status === "TRANSFERRED") {
      return NextResponse.json({ ok: true, movement });
    }

    if (movement.status !== "READY_TO_TRANSFER") {
      return NextResponse.json({ ok: false, error: "Movimiento no está listo para transferir" }, { status: 400 });
    }

    movement.status = "TRANSFERRED";
    movement.transferredAt = new Date();
    movement.transferredBy = (body.transferredBy || "system").trim() || "system";
    movement.transferRef = (body.reference || "").trim();

    await movement.save();

    return NextResponse.json({ ok: true, movement });
  } catch (err) {
    console.error("POST /api/cash-movements/[id]/transfer error:", err);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}
