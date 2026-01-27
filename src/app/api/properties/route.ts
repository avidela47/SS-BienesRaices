import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongoose";
import Property from "@/models/Property";
import Person from "@/models/Person";
import Counter from "@/models/Counter";

const TENANT_ID = "default";

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "unknown";
}

function pad3(n: number): string {
  return String(n).padStart(3, "0");
}

async function nextPropertyCode(): Promise<string> {
  const key = "property:PID";
  const doc = await Counter.findOneAndUpdate(
    { tenantId: TENANT_ID, key },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  ).lean();

  const seq = doc?.seq ?? 1;
  return `PID-${pad3(seq)}`;
}

const ALLOWED_STATUS = ["AVAILABLE", "RENTED", "MAINTENANCE"] as const;
type AllowedStatus = (typeof ALLOWED_STATUS)[number];

export async function GET() {
  try {
    await dbConnect();

    const properties = await Property.find({ tenantId: TENANT_ID })
      .sort({ createdAt: -1 })
      .populate("ownerId")
      .populate("inquilinoId")
      .lean();

    return NextResponse.json({ ok: true, properties });
  } catch (err: unknown) {
    return NextResponse.json(
      { ok: false, message: "Failed to fetch properties", error: getErrorMessage(err) },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    await dbConnect();
    const body: unknown = await req.json();

    const data = body as Partial<{
      addressLine: string;
      unit: string;
      city: string;
      province: string;

      ownerId: string;
      code: string;

      status: AllowedStatus;

      tipo: string;
      foto: string;
      mapa: string;
      inquilinoId: string;
    }>;

    if (!data.addressLine || !data.ownerId) {
      return NextResponse.json(
        { ok: false, message: "Missing required fields: addressLine, ownerId" },
        { status: 400 }
      );
    }

    const owner = await Person.findById(data.ownerId).lean();
    if (!owner) {
      return NextResponse.json({ ok: false, message: "ownerId not found" }, { status: 400 });
    }
    if (owner.type !== "OWNER") {
      return NextResponse.json(
        { ok: false, message: "ownerId must be a person of type OWNER" },
        { status: 400 }
      );
    }

    const code =
      data.code && String(data.code).trim()
        ? String(data.code).trim()
        : await nextPropertyCode();

    const status: AllowedStatus = ALLOWED_STATUS.includes(data.status as AllowedStatus)
      ? (data.status as AllowedStatus)
      : "AVAILABLE";

    const property = await Property.create({
      tenantId: TENANT_ID,
      code,

      addressLine: String(data.addressLine).trim(),
      unit: data.unit ? String(data.unit).trim() : "",
      city: data.city ? String(data.city).trim() : "",
      province: data.province ? String(data.province).trim() : "",

      status,

      ownerId: data.ownerId,

      tipo: data.tipo ? String(data.tipo).trim() : undefined,
      foto: data.foto ? String(data.foto).trim() : undefined,
      mapa: data.mapa ? String(data.mapa).trim() : undefined,
      inquilinoId: data.inquilinoId ? data.inquilinoId : undefined,
    });

    return NextResponse.json({ ok: true, propertyId: property._id, code: property.code });
  } catch (err: unknown) {
    return NextResponse.json(
      { ok: false, message: "Failed to create property", error: getErrorMessage(err) },
      { status: 500 }
    );
  }
}
