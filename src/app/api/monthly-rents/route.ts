import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    {
      ok: false,
      error: "Monthly rents está deprecado. Usá /installments para cuotas reales.",
    },
    { status: 410 }
  );
}
