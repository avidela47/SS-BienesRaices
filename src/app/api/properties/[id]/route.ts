import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { dbConnect } from "@/lib/mongoose";

import Property from "@/models/Property";
import Person from "@/models/Person";

const TENANT_ID = "default";

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "unknown";
}

function isCastObjectIdError(message: string) {
  return message.toLowerCase().includes("cast to objectid failed");
}

function isValidObjectId(v: unknown): v is string {
  return typeof v === "string" && Types.ObjectId.isValid(v);
}

function toDateOrNull(v: unknown): Date | null {
  if (v === null || v === undefined || v === "") return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

type PatchBody = Partial<{
  code: string;
  addressLine: string;
  unit: string;
  city: string;
  province: string;

  status: "AVAILABLE" | "RENTED" | "MAINTENANCE";

  ownerId: string;
  tipo: string;
  foto: string;
  mapa: string;

  inquilinoId: string | null;
  availableFrom: Date | string | null;

  // mantenimiento
  maintenanceNotes: string;
  maintenanceFrom: Date | string | null;
  maintenanceTo: Date | string | null;
}>;

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await dbConnect();

    const { id: rawId } = await params;
    const id = (rawId ?? "").trim();
    const body = (await req.json()) as PatchBody;

    if (!isValidObjectId(id)) {
      return NextResponse.json({ ok: false, message: "No se encontró la propiedad" }, { status: 404 });
    }

    // Estado actual (para reglas)
    const current = await Property.findOne({ _id: id, tenantId: TENANT_ID })
      .select("_id status inquilinoId")
      .lean<{ _id: Types.ObjectId; status?: string; inquilinoId?: Types.ObjectId | null } | null>();

    if (!current) {
      return NextResponse.json({ ok: false, message: "No se encontró la propiedad" }, { status: 404 });
    }

    const currentStatus = (current.status || "AVAILABLE") as "AVAILABLE" | "RENTED" | "MAINTENANCE";

    // Update whitelist
    const update: Record<string, unknown> = {};

    if (typeof body.code === "string") update.code = body.code.trim();
    if (typeof body.addressLine === "string") update.addressLine = body.addressLine.trim();
    if (typeof body.unit === "string") update.unit = body.unit.trim();
    if (typeof body.city === "string") update.city = body.city.trim();
    if (typeof body.province === "string") update.province = body.province.trim();
    if (typeof body.tipo === "string") update.tipo = body.tipo.trim();
    if (typeof body.foto === "string") update.foto = body.foto.trim();
    if (typeof body.mapa === "string") update.mapa = body.mapa.trim();

    // ownerId si viene
    if (body.ownerId !== undefined) {
      if (!isValidObjectId(body.ownerId)) {
        return NextResponse.json({ ok: false, message: "ownerId inválido" }, { status: 400 });
      }

      const owner = await Person.findById(body.ownerId).lean<{ type?: string } | null>();
      if (!owner) return NextResponse.json({ ok: false, message: "ownerId no existe" }, { status: 400 });
      if (owner.type !== "OWNER") {
        return NextResponse.json({ ok: false, message: "ownerId debe ser OWNER" }, { status: 400 });
      }

      update.ownerId = new Types.ObjectId(body.ownerId);
    }

    // mantenimiento campos
    if (body.maintenanceNotes !== undefined) update.maintenanceNotes = String(body.maintenanceNotes ?? "").trim();
    if (body.maintenanceFrom !== undefined) update.maintenanceFrom = toDateOrNull(body.maintenanceFrom);
    if (body.maintenanceTo !== undefined) update.maintenanceTo = toDateOrNull(body.maintenanceTo);

    // ✅ STATUS: respetar lo que viene (AVAILABLE / RENTED / MAINTENANCE)
    if (body.status !== undefined) {
      if (!["AVAILABLE", "RENTED", "MAINTENANCE"].includes(body.status)) {
        return NextResponse.json({ ok: false, message: "status inválido" }, { status: 400 });
      }

      if (body.status === "MAINTENANCE") {
        // entrar a mantenimiento: liberamos inquilino desde properties
        update.status = "MAINTENANCE";
        update.inquilinoId = null;
        update.availableFrom = null;
      } else {
        // AVAILABLE o RENTED: se respeta
        update.status = body.status;
        // si sale de mantenimiento, no tocar inquilinoId acá (lo controla el PATCH de inquilinoId)
      }
    }

    // ✅ inquilinoId (regla: NO se permite si está MAINTENANCE)
    if (body.inquilinoId !== undefined) {
      const effectiveStatus = (update.status ?? currentStatus) as "AVAILABLE" | "RENTED" | "MAINTENANCE";
      if (effectiveStatus === "MAINTENANCE") {
        return NextResponse.json(
          { ok: false, message: "No se puede asignar inquilino mientras está en MANTENIMIENTO" },
          { status: 400 }
        );
      }

      const raw = body.inquilinoId;

      if (raw === null || raw === "") {
        update.inquilinoId = null;
        update.status = "AVAILABLE";
        update.availableFrom = null;
      } else {
        if (!isValidObjectId(raw)) {
          return NextResponse.json({ ok: false, message: "inquilinoId inválido" }, { status: 400 });
        }

        const tenant = await Person.findById(raw).lean<{ type?: string } | null>();
        if (!tenant) return NextResponse.json({ ok: false, message: "inquilinoId no existe" }, { status: 400 });
        if (tenant.type !== "TENANT") {
          return NextResponse.json({ ok: false, message: "inquilinoId debe ser TENANT" }, { status: 400 });
        }

        update.inquilinoId = new Types.ObjectId(raw);
        update.status = "RENTED";
        update.availableFrom = null;
      }
    }

    // availableFrom (si lo usás manualmente)
    if (body.availableFrom !== undefined) {
      update.availableFrom = toDateOrNull(body.availableFrom);
    }

    const property = await Property.findOneAndUpdate(
      { _id: id, tenantId: TENANT_ID },
      { $set: update },
      { new: true }
    )
      .populate({ path: "ownerId", select: "_id code fullName type email phone" })
      .populate({ path: "inquilinoId", select: "_id code fullName type email phone" })
      .lean();

    if (!property) {
      return NextResponse.json({ ok: false, message: "No se encontró la propiedad" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, property });
  } catch (err: unknown) {
    const msg = getErrorMessage(err);
    const status = isCastObjectIdError(msg) ? 404 : 500;

    return NextResponse.json(
      {
        ok: false,
        message: status === 404 ? "No se encontró la propiedad" : "No se pudo editar la propiedad",
        error: msg,
      },
      { status }
    );
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await dbConnect();

    const { id: rawId } = await params;
    const id = (rawId ?? "").trim();
    if (!isValidObjectId(id)) {
      return NextResponse.json({ ok: false, message: "No se encontró la propiedad" }, { status: 404 });
    }

    const result = await Property.deleteOne({ _id: id, tenantId: TENANT_ID });

    if (result.deletedCount === 0) {
      return NextResponse.json({ ok: false, message: "No se encontró la propiedad" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const msg = getErrorMessage(err);
    const status = isCastObjectIdError(msg) ? 404 : 500;

    return NextResponse.json(
      {
        ok: false,
        message: status === 404 ? "No se encontró la propiedad" : "No se pudo eliminar la propiedad",
        error: msg,
      },
      { status }
    );
  }
}
