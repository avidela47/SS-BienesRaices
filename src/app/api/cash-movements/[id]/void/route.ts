import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongoose";
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

    const movement = await CashMovement.findById(id);
    if (!movement) {
      return NextResponse.json({ ok: false, error: "Movimiento no encontrado" }, { status: 404 });
    }

    if (movement.status === "VOID") {
      return NextResponse.json({ ok: true, movement });
    }

    movement.status = "VOID";
    movement.voidedAt = new Date();
    movement.voidedBy = (body.voidedBy || "system").trim() || "system";
    movement.voidReason = (body.reason || "").trim();

    await movement.save();

    return NextResponse.json({ ok: true, movement });
  } catch (err) {
    console.error("POST /api/cash-movements/[id]/void error:", err);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}
