import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongoose";
import Installment from "@/models/Installment";

const TENANT_ID = "default";

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "unknown";
}

export async function GET() {
  try {
    await dbConnect();

    const installments = await Installment.find({ tenantId: TENANT_ID })
      .sort({ dueDate: 1 })
      .lean();

    return NextResponse.json({ ok: true, installments });
  } catch (err: unknown) {
    return NextResponse.json(
      { ok: false, message: "Failed to fetch installments", error: getErrorMessage(err) },
      { status: 500 }
    );
  }
}
