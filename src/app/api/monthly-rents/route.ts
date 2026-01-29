import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongoose";
import MonthlyRent from "@/models/MonthlyRent";

const DEFAULT_TENANT_ID = "default";

export async function GET(req: Request) {
  try {
    await dbConnect();

    const { searchParams } = new URL(req.url);
    const contractId = searchParams.get("contractId");

    if (!contractId) {
      return NextResponse.json({ ok: false, message: "contractId requerido" }, { status: 400 });
    }

    const rents = await MonthlyRent.find({
      tenantId: DEFAULT_TENANT_ID,
      contractId,
    }).sort({ periodYear: 1, periodMonth: 1 });

    return NextResponse.json({ ok: true, rents });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
