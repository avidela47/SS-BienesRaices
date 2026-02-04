import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { dbConnect } from "@/lib/mongoose";
import Counter from "@/models/Counter";
import Person from "@/models/Person";
import Property from "@/models/Property";

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
  ).lean<{ seq?: number }>();

  const seq = doc?.seq ?? 1;
  return `PID-${pad3(seq)}`;
}

function isValidObjectId(v: unknown): v is string {
  return typeof v === "string" && Types.ObjectId.isValid(v);
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

type CreateBody = {
  code?: string;
  addressLine?: string;
  unit?: string;
  city?: string;
  province?: string;
  tipo?: string;
  foto?: string;
  mapa?: string;
  ownerId?: string;
  inquilinoId?: string | null;
};

export async function POST(req: Request) {
  try {
    await dbConnect();

    const body = (await req.json()) as CreateBody;

    if (!body.addressLine || !String(body.addressLine).trim()) {
      return NextResponse.json({ ok: false, message: "addressLine es obligatorio" }, { status: 400 });
    }

    if (!body.ownerId || !isValidObjectId(body.ownerId)) {
      return NextResponse.json({ ok: false, message: "ownerId inválido" }, { status: 400 });
    }

    const owner = await Person.findById(body.ownerId).lean<{ type?: string } | null>();
    if (!owner) {
      return NextResponse.json({ ok: false, message: "ownerId no existe" }, { status: 400 });
    }
    if (owner.type !== "OWNER") {
      return NextResponse.json({ ok: false, message: "ownerId debe ser OWNER" }, { status: 400 });
    }

    let inquilinoObjectId: Types.ObjectId | null = null;
    if (body.inquilinoId !== undefined && body.inquilinoId !== null && body.inquilinoId !== "") {
      if (!isValidObjectId(body.inquilinoId)) {
        return NextResponse.json({ ok: false, message: "inquilinoId inválido" }, { status: 400 });
      }

      const tenant = await Person.findById(body.inquilinoId).lean<{ type?: string } | null>();
      if (!tenant) {
        return NextResponse.json({ ok: false, message: "inquilinoId no existe" }, { status: 400 });
      }
      if (tenant.type !== "TENANT") {
        return NextResponse.json({ ok: false, message: "inquilinoId debe ser TENANT" }, { status: 400 });
      }

      inquilinoObjectId = new Types.ObjectId(body.inquilinoId);
    }

    const code = body.code && String(body.code).trim() ? String(body.code).trim() : await nextPropertyCode();

    const property = await Property.create({
      tenantId: TENANT_ID,
      code,
      addressLine: String(body.addressLine).trim(),
      unit: body.unit ? String(body.unit).trim() : "",
      city: body.city ? String(body.city).trim() : "",
      province: body.province ? String(body.province).trim() : "",
      ownerId: new Types.ObjectId(body.ownerId),
      tipo: body.tipo ? String(body.tipo).trim() : "",
      foto: body.foto ? String(body.foto).trim() : "",
      mapa: body.mapa ? String(body.mapa).trim() : "",
      inquilinoId: inquilinoObjectId,
      status: inquilinoObjectId ? "RENTED" : "AVAILABLE",
      availableFrom: inquilinoObjectId ? null : null,
    });

    return NextResponse.json({ ok: true, propertyId: property._id, code: property.code });
  } catch (err: unknown) {
    return NextResponse.json(
      { ok: false, message: "Failed to create property", error: getErrorMessage(err) },
      { status: 500 }
    );
  }
}
