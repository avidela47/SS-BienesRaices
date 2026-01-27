import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongoose";
import Person from "@/models/Person";

const TENANT_ID = "default";

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "unknown";
}

export async function PUT(req: Request, context: { params: { personId: string } }) {
  try {
    await dbConnect();
    const { personId } = await context.params;
    const id = personId;
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

      // ✅ nuevo
      tenantPersonId?: string | null;

      // ✅ compat viejo
      tenantId?: string | null;
    }>;

    const current = await Person.findById(id).lean();
    if (!current) return NextResponse.json({ ok: false, message: "Person not found" }, { status: 404 });

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

    // ✅ relación garante -> inquilino: aceptar tenantPersonId o tenantId
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

      const tenant = await Person.findOne({ _id: raw, tenantId: TENANT_ID, type: "TENANT" }).lean();
      if (!tenant) {
        return NextResponse.json(
          { ok: false, message: "Invalid tenantPersonId: TENANT not found" },
          { status: 400 }
        );
      }

      update.tenantPersonId = raw;
    } else {
      // si deja de ser garante, lo limpiamos
      update.tenantPersonId = null;
    }

    const updated = await Person.findByIdAndUpdate(id, update, { new: true }).lean();
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
    const { personId } = await context.params;
    const id = personId;

    const deleted = await Person.findByIdAndDelete(id).lean();
    if (!deleted) return NextResponse.json({ ok: false, message: "Person not found" }, { status: 404 });

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    return NextResponse.json(
      { ok: false, message: "Failed to delete person", error: getErrorMessage(err) },
      { status: 500 }
    );
  }
}
