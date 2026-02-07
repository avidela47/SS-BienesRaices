import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongoose";
import Person from "@/models/Person";

const TENANT_ID = "default";

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "unknown";
}

type Params = { id: string };
type Ctx = { params: Params | Promise<Params> };

async function getParams(ctx: Ctx): Promise<Params> {
  return await ctx.params; // ✅ en tu Next params es Promise
}

export async function PUT(req: Request, context: Ctx) {
  try {
    await dbConnect();

    const { id } = await getParams(context);
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

      tenantPersonId?: string | null; // nuevo
      tenantId?: string | null; // compat viejo
    }>;

    // ✅ 1) buscamos multi-tenant
    // ✅ 2) fallback por legacy docs sin tenantId (evita 404 falsos)
    let current = await Person.findOne({ _id: id, tenantId: TENANT_ID }).lean();
    if (!current) current = await Person.findById(id).lean();

    if (!current) {
      return NextResponse.json({ ok: false, message: "Person not found" }, { status: 404 });
    }

    const nextType = String((data.type ?? current.type) as string).toUpperCase();

    const dniVal =
      (data.dni && String(data.dni).trim()) ||
      (data.dniCuit && String(data.dniCuit).trim()) ||
      "";

    const phoneVal =
      (data.wasp && String(data.wasp).trim()) ||
      (data.phone && String(data.phone).trim()) ||
      "";

    const update: Partial<Record<string, unknown>> = {};

    if (data.type) update.type = nextType;
    if (data.fullName) update.fullName = String(data.fullName).trim();

    update.dniCuit = dniVal;
    update.phone = phoneVal;

    if (data.email !== undefined) update.email = data.email ? String(data.email).trim().toLowerCase() : "";
    if (data.address !== undefined) update.address = data.address ? String(data.address).trim() : "";
    if (data.tags !== undefined) update.tags = Array.isArray(data.tags) ? data.tags.map(String) : [];
    if (data.notes !== undefined) update.notes = data.notes ? String(data.notes).trim() : "";
    if (data.code !== undefined) update.code = data.code ? String(data.code).trim() : undefined;

    // ✅ relación garante -> inquilino
    if (nextType === "GUARANTOR") {
      const raw =
        (data.tenantPersonId !== undefined && data.tenantPersonId !== null ? String(data.tenantPersonId).trim() : "") ||
        (data.tenantId !== undefined && data.tenantId !== null ? String(data.tenantId).trim() : "");

      if (!raw) {
        return NextResponse.json(
          { ok: false, message: "tenantPersonId is required for GUARANTOR" },
          { status: 400 }
        );
      }

      const tenant =
        (await Person.findOne({ _id: raw, tenantId: TENANT_ID, type: "TENANT" }).lean()) ||
        (await Person.findOne({ _id: raw, type: "TENANT" }).lean()); // fallback legacy

      if (!tenant) {
        return NextResponse.json(
          { ok: false, message: "Invalid tenantPersonId: TENANT not found" },
          { status: 400 }
        );
      }

      update.tenantPersonId = raw;
    } else {
      update.tenantPersonId = null;
    }

    // ✅ update multi-tenant con fallback legacy
    let updated = await Person.findOneAndUpdate({ _id: id, tenantId: TENANT_ID }, update, { new: true }).lean();
    if (!updated) updated = await Person.findByIdAndUpdate(id, update, { new: true }).lean();

    if (!updated) {
      return NextResponse.json({ ok: false, message: "Person not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, person: updated });
  } catch (err: unknown) {
    return NextResponse.json(
      { ok: false, message: "Failed to update person", error: getErrorMessage(err) },
      { status: 500 }
    );
  }
}

export async function DELETE(_req: Request, context: Ctx) {
  try {
    await dbConnect();

    const { id } = await getParams(context);

    let deleted = await Person.findOneAndDelete({ _id: id, tenantId: TENANT_ID }).lean();
    if (!deleted) deleted = await Person.findByIdAndDelete(id).lean();

    if (!deleted) return NextResponse.json({ ok: false, message: "Person not found" }, { status: 404 });

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    return NextResponse.json(
      { ok: false, message: "Failed to delete person", error: getErrorMessage(err) },
      { status: 500 }
    );
  }
}
