import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { dbConnect } from "@/lib/mongoose";
import Person from "@/models/Person";
import Counter from "@/models/Counter";

const TENANT_ID = "default";

type PersonType = "OWNER" | "TENANT" | "GUARANTOR";

function pad3(n: number) {
  return String(n).padStart(3, "0");
}

function isPersonType(v: string): v is PersonType {
  return v === "OWNER" || v === "TENANT" || v === "GUARANTOR";
}

function prefixByType(type: PersonType): "OID" | "TID" | "GID" {
  if (type === "OWNER") return "OID";
  if (type === "TENANT") return "TID";
  return "GID";
}

function isValidObjectId(v: unknown): v is string {
  return typeof v === "string" && Types.ObjectId.isValid(v);
}

async function nextPersonCode(personType: PersonType) {
  const prefix = prefixByType(personType);
  const key = `person:${prefix}`;

  const doc = await Counter.findOneAndUpdate(
    { tenantId: TENANT_ID, key },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  ).lean<{ seq?: number }>();

  return `${prefix}-${pad3(doc?.seq ?? 1)}`;
}

type PersonLean = {
  _id: Types.ObjectId;
  tenantId: string;
  code: string;
  type: PersonType;
  fullName: string;
  dniCuit?: string;
  email?: string;
  phone?: string;
  address?: string;
  tags?: string[];
  notes?: string;
  tenantPersonId?: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
};

export async function GET(req: Request) {
  try {
    await dbConnect();

    const url = new URL(req.url);
    const typeRaw = (url.searchParams.get("type") || "").toUpperCase();
    const tenantPersonId = url.searchParams.get("tenantPersonId"); // para garantes de un inquilino

    const filter: Record<string, unknown> = { tenantId: TENANT_ID };

    if (typeRaw) {
      if (!isPersonType(typeRaw)) {
        return NextResponse.json({ ok: false, message: "type inválido" }, { status: 400 });
      }
      filter.type = typeRaw;
    }

    if (tenantPersonId) {
      if (!isValidObjectId(tenantPersonId)) {
        return NextResponse.json({ ok: false, message: "tenantPersonId inválido" }, { status: 400 });
      }
      filter.tenantPersonId = new Types.ObjectId(tenantPersonId);
    }

    const people = await Person.find(filter).sort({ createdAt: -1 }).lean<PersonLean[]>();
    return NextResponse.json({ ok: true, people });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, message: "Failed to fetch people", error: msg }, { status: 500 });
  }
}

type CreateBody = {
  type?: unknown;
  fullName?: unknown;
  dni?: unknown;
  dniCuit?: unknown;
  wasp?: unknown;
  phone?: unknown;
  email?: unknown;
  address?: unknown;
  notes?: unknown;
  tags?: unknown;

  tenantPersonId?: unknown; // nuevo
  tenantId?: unknown; // compat viejo
};

export async function POST(req: Request) {
  try {
    await dbConnect();
    const data = (await req.json()) as CreateBody;

    const type = String(data.type || "").toUpperCase();
    if (!isPersonType(type)) {
      return NextResponse.json({ ok: false, message: "Tipo inválido" }, { status: 400 });
    }

    const fullName = String(data.fullName || "").trim();
    if (!fullName) {
      return NextResponse.json({ ok: false, message: "fullName es obligatorio" }, { status: 400 });
    }

    const dniVal = String((data.dniCuit ?? data.dni ?? "") as string).trim();
    const phoneVal = String((data.phone ?? data.wasp ?? "") as string).trim();
    const emailVal = data.email ? String(data.email).trim().toLowerCase() : "";
    const addressVal = data.address ? String(data.address).trim() : "";
    const notesVal = data.notes ? String(data.notes).trim() : "";
    const tagsVal = Array.isArray(data.tags) ? data.tags.map((x) => String(x)) : [];

    const tenantPersonIdRaw =
      (data.tenantPersonId ? String(data.tenantPersonId).trim() : "") ||
      (data.tenantId ? String(data.tenantId).trim() : "");

    // ✅ GARANTE: debe apuntar a un TENANT real
    let tenantPersonObjectId: Types.ObjectId | null = null;
    if (type === "GUARANTOR") {
      if (!tenantPersonIdRaw) {
        return NextResponse.json({ ok: false, message: "tenantPersonId es obligatorio" }, { status: 400 });
      }
      if (!isValidObjectId(tenantPersonIdRaw)) {
        return NextResponse.json({ ok: false, message: "tenantPersonId inválido" }, { status: 400 });
      }

      const tenant = await Person.findOne({
        _id: new Types.ObjectId(tenantPersonIdRaw),
        tenantId: TENANT_ID,
        type: "TENANT",
      }).lean();

      if (!tenant) {
        return NextResponse.json({ ok: false, message: "Inquilino inválido (no existe TENANT)" }, { status: 400 });
      }

      tenantPersonObjectId = new Types.ObjectId(tenantPersonIdRaw);
    }

    const code = await nextPersonCode(type);

    const created = await Person.create({
      tenantId: TENANT_ID,
      code,
      type,
      fullName,
      dniCuit: dniVal,
      phone: phoneVal,
      email: emailVal,
      address: addressVal,
      notes: notesVal,
      tags: tagsVal,
      tenantPersonId: tenantPersonObjectId, // null si no es garante
    });

    const person = await Person.findById(created._id).lean<PersonLean | null>();

    return NextResponse.json({
      ok: true,
      personId: created._id,
      code: created.code,
      person,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, message: "Failed to create person", error: msg }, { status: 500 });
  }
}
