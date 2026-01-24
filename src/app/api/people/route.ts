import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongoose";
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

function prefixByType(type: string): "OID" | "TID" | "GID" {
  if (type === "OWNER") return "OID";
  if (type === "TENANT") return "TID";
  return "GID";
}

async function nextPersonCode(personType: "OWNER" | "TENANT" | "GUARANTOR"): Promise<string> {
  const prefix = prefixByType(personType);
  const key = `person:${prefix}`;

  const doc = await Counter.findOneAndUpdate(
    { tenantId: TENANT_ID, key },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  ).lean();

  const seq = doc?.seq ?? 1;
  return `${prefix}-${pad3(seq)}`;
}

export async function GET() {
  try {
    await dbConnect();

    const people = await Person.find({ tenantId: TENANT_ID })
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json({ ok: true, people });
  } catch (err: unknown) {
    return NextResponse.json(
      { ok: false, message: "Failed to fetch people", error: getErrorMessage(err) },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    await dbConnect();
    const body: unknown = await req.json();

    const data = body as Partial<{
      type: string;
      fullName: string;
      dni?: string;
      dniCuit?: string;
      wasp?: string;
      phone?: string;
      email?: string;
      address?: string;
      tags?: string[];
      notes?: string;
      code?: string;
    }>;

    if (!data.type || !data.fullName) {
      return NextResponse.json(
        { ok: false, message: "Missing required fields: type, fullName" },
        { status: 400 }
      );
    }

    const type = String(data.type).toUpperCase();
    if (!["OWNER", "TENANT", "GUARANTOR"].includes(type)) {
      return NextResponse.json(
        { ok: false, message: "Invalid type. Use OWNER | TENANT | GUARANTOR" },
        { status: 400 }
      );
    }

    // Si no mandan code, generamos automático.
    const code = data.code && String(data.code).trim()
      ? String(data.code).trim()
      : await nextPersonCode(type as "OWNER" | "TENANT" | "GUARANTOR");

    // Mapeo correcto de campos para guardar en Mongo
    const dniVal = (data.dni && String(data.dni).trim()) || (data.dniCuit && String(data.dniCuit).trim()) || "";
    const phoneVal = (data.wasp && String(data.wasp).trim()) || (data.phone && String(data.phone).trim()) || "";

    const person = await Person.create({
      tenantId: TENANT_ID,
      code,
      type,
      fullName: String(data.fullName).trim(),
      dniCuit: dniVal,
      email: data.email ? String(data.email).trim().toLowerCase() : "",
      phone: phoneVal,
      address: data.address ? String(data.address).trim() : "",
      tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
      notes: data.notes ? String(data.notes).trim() : "",
    });

    return NextResponse.json({ ok: true, personId: person._id, code: person.code });
  } catch (err: unknown) {
    return NextResponse.json(
      { ok: false, message: "Failed to create person", error: getErrorMessage(err) },
      { status: 500 }
    );
  }
}

