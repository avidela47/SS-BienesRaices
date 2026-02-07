import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { dbConnect } from "@/lib/mongoose";
import Person from "@/models/Person";

const TENANT_ID = "default";

type PersonType = "OWNER" | "TENANT" | "GUARANTOR";

function isPersonType(v: string): v is PersonType {
  return v === "OWNER" || v === "TENANT" || v === "GUARANTOR";
}

function isValidObjectId(v: unknown): v is string {
  return typeof v === "string" && Types.ObjectId.isValid(v);
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "unknown";
}

type UpdateBody = Partial<{
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

  tenantPersonId?: string | null; // nuevo
  tenantId?: string | null; // compat viejo
}>;

export async function PUT(req: Request, context: { params: { personId: string } }) {
  try {
    await dbConnect();

    const id = String(context.params.personId || "").trim();
    if (!isValidObjectId(id)) {
      return NextResponse.json({ ok: false, message: "Person not found" }, { status: 404 });
    }

    const data = (await req.json()) as UpdateBody;

    const current = await Person.findOne({ _id: new Types.ObjectId(id), tenantId: TENANT_ID }).lean();
    if (!current) return NextResponse.json({ ok: false, message: "Person not found" }, { status: 404 });

    const nextTypeRaw = String(data.type ?? current.type ?? "").toUpperCase();
    if (!isPersonType(nextTypeRaw)) {
      return NextResponse.json({ ok: false, message: "Tipo inválido" }, { status: 400 });
    }

    const update: Record<string, unknown> = {};

    if (data.type !== undefined) update.type = nextTypeRaw;
    if (data.fullName !== undefined) update.fullName = String(data.fullName ?? "").trim();

    const dniVal =
      (data.dni && String(data.dni).trim()) ||
      (data.dniCuit && String(data.dniCuit).trim()) ||
      "";
    update.dniCuit = dniVal;

    const phoneVal =
      (data.wasp && String(data.wasp).trim()) ||
      (data.phone && String(data.phone).trim()) ||
      "";
    update.phone = phoneVal;

    if (data.email !== undefined) update.email = data.email ? String(data.email).trim().toLowerCase() : "";
    if (data.address !== undefined) update.address = data.address ? String(data.address).trim() : "";
    if (data.tags !== undefined) update.tags = Array.isArray(data.tags) ? data.tags.map(String) : [];
    if (data.notes !== undefined) update.notes = data.notes ? String(data.notes).trim() : "";
    if (data.code !== undefined) update.code = data.code ? String(data.code).trim() : undefined;

    // ✅ relación garante -> inquilino
    if (nextTypeRaw === "GUARANTOR") {
      const raw =
        (data.tenantPersonId !== undefined && data.tenantPersonId !== null ? String(data.tenantPersonId).trim() : "") ||
        (data.tenantId !== undefined && data.tenantId !== null ? String(data.tenantId).trim() : "");

      if (!raw) {
        return NextResponse.json({ ok: false, message: "tenantPersonId is required for GUARANTOR" }, { status: 400 });
      }
      if (!isValidObjectId(raw)) {
        return NextResponse.json({ ok: false, message: "tenantPersonId inválido" }, { status: 400 });
      }

      const tenant = await Person.findOne({
        _id: new Types.ObjectId(raw),
        tenantId: TENANT_ID,
        type: "TENANT",
      }).lean();

      if (!tenant) {
        return NextResponse.json({ ok: false, message: "Invalid tenantPersonId: TENANT not found" }, { status: 400 });
      }

      update.tenantPersonId = new Types.ObjectId(raw);
    } else {
      update.tenantPersonId = null;
    }

    const updated = await Person.findOneAndUpdate(
      { _id: new Types.ObjectId(id), tenantId: TENANT_ID },
      { $set: update },
      { new: true }
    ).lean();

    if (!updated) return NextResponse.json({ ok: false, message: "Person not found" }, { status: 404 });
    return NextResponse.json({ ok: true, person: updated });
  } catch (err: unknown) {
    return NextResponse.json(
      { ok: false, message: "Failed to update person", error: getErrorMessage(err) },
      { status: 500 }
    );
  }
}

export async function DELETE(_req: Request, context: { params: { personId: string } }) {
  try {
    await dbConnect();

    const id = String(context.params.personId || "").trim();
    if (!isValidObjectId(id)) {
      return NextResponse.json({ ok: false, message: "Person not found" }, { status: 404 });
    }

    const deleted = await Person.findOneAndDelete({ _id: new Types.ObjectId(id), tenantId: TENANT_ID }).lean();
    if (!deleted) return NextResponse.json({ ok: false, message: "Person not found" }, { status: 404 });

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    return NextResponse.json(
      { ok: false, message: "Failed to delete person", error: getErrorMessage(err) },
      { status: 500 }
    );
  }
}
