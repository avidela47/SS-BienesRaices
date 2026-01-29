import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongoose";
import MonthlyRent from "@/models/MonthlyRent";

export async function POST(req: Request) {
  try {
    await dbConnect();

    const { monthlyRentId, amountPaid } = await req.json();

    if (!monthlyRentId || !amountPaid) {
      return NextResponse.json({ ok: false, message: "Datos incompletos" }, { status: 400 });
    }

    const rent = await MonthlyRent.findById(monthlyRentId);
    if (!rent) {
      return NextResponse.json({ ok: false, message: "Cuota no encontrada" }, { status: 404 });
    }

    rent.paidAmount += Number(amountPaid);

    if (rent.paidAmount <= 0) rent.status = "PENDING";
    else if (rent.paidAmount < rent.amount) rent.status = "PARTIAL";
    else rent.status = "PAID";

    await rent.save();

    return NextResponse.json({ ok: true, rent });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
