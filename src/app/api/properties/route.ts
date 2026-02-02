import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongoose";
import Property from "@/models/Property";

const TENANT_ID = "default";

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "unknown";
}

export async function GET() {
  try {
    await dbConnect();

    const properties = await Property.find({ tenantId: TENANT_ID })
      .sort({ createdAt: -1 })
      .populate({ path: "ownerId", select: "_id code fullName type email phone" })
      .populate({ path: "inquilinoId", select: "_id code fullName type email phone" })
      .lean();

    return NextResponse.json({ ok: true, properties });
  } catch (err: unknown) {
    return NextResponse.json(
      { ok: false, message: "Failed to fetch properties", error: getErrorMessage(err) },
      { status: 500 }
    );
  }
}
