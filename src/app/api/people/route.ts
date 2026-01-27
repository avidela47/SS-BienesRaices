import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongoose";
import Person from "@/models/Person";
import Counter from "@/models/Counter";

const TENANT_ID = "default";

function pad3(n: number) {
  return String(n).padStart(3, "0");
}

function prefixByType(type: string): "OID" | "TID" | "GID" {
  if (type === "OWNER") return "OID";
  if (type === "TENANT") return "TID";
  return "GID";
}

async function nextPersonCode(personType: "OWNER" | "TENANT" | "GUARANTOR") {
  const prefix = prefixByType(personType);
  const key = `person:${prefix}`;

  const doc = await Counter.findOneAndUpdate(
    { tenantId: TENANT_ID, key },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  ).lean();

  return `${prefix}-${pad3(doc?.seq ?? 1)}`;
}

export async function GET(req: Request) {
  await dbConnect();

  const url = new URL(req.url);
  const type = url.searchParams.get("type");

  const filter: { tenantId: string; type?: string } = { tenantId: TENANT_ID };
  if (type) filter.type = String(type).toUpperCase();

  const people = await Person.find(filter).sort({ createdAt: -1 }).lean();
  return NextResponse.json({ ok: true, people });
}

export async function POST(req: Request) {
  await dbConnect();
  const data = await req.json();

  const type = String(data.type || "").toUpperCase();
  if (!type || !["OWNER", "TENANT", "GUARANTOR"].includes(type)) {
    return NextResponse.json({ ok: false, message: "Tipo inválido" }, { status: 400 });
  }
  if (!data.fullName || !String(data.fullName).trim()) {
    return NextResponse.json({ ok: false, message: "fullName es obligatorio" }, { status: 400 });
  }

  // ✅ Para garantes: aceptar tenantPersonId o tenantId (compat)
  const tenantPersonIdRaw =
    (data.tenantPersonId ? String(data.tenantPersonId).trim() : "") ||
    (data.tenantId ? String(data.tenantId).trim() : "");

  if (type === "GUARANTOR") {
    if (!tenantPersonIdRaw) {
      return NextResponse.json({ ok: false, message: "tenantPersonId es obligatorio" }, { status: 400 });
    }

    const tenant = await Person.findOne({
      _id: tenantPersonIdRaw,
      tenantId: TENANT_ID,
      type: "TENANT",
    }).lean();

    if (!tenant) {
      return NextResponse.json({ ok: false, message: "Inquilino inválido (no existe TENANT)" }, { status: 400 });
    }
  }

  const code = await nextPersonCode(type as "OWNER" | "TENANT" | "GUARANTOR");

  // ✅ WhatsApp: guardar en phone
  const phoneVal = String((data.phone ?? data.wasp ?? "") as string).trim();
  const dniVal = String((data.dniCuit ?? data.dni ?? "") as string).trim();

  const created = await Person.create({
    tenantId: TENANT_ID,
    code,
    type,
    fullName: String(data.fullName).trim(),
    dniCuit: dniVal,
    phone: phoneVal,
    email: data.email ? String(data.email).trim() : "",
    address: data.address ? String(data.address).trim() : "",
    notes: data.notes ? String(data.notes).trim() : "",
    tenantPersonId: type === "GUARANTOR" ? tenantPersonIdRaw : null,
  });

  // ✅ devolvemos el doc creado para actualizar UI sin depender del GET
  const person = await Person.findById(created._id).lean();

  return NextResponse.json({
    ok: true,
    personId: created._id,
    code: created.code,
    person,
  });
}
