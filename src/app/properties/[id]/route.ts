import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongoose";
import Property from "@/models/Property";

const TENANT_ID = "default";

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "unknown";
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  try {
    await dbConnect();

    const { id } = params;

    const result = await Property.deleteOne({ _id: id, tenantId: TENANT_ID });
    if (result.deletedCount === 0) {
      return NextResponse.json({ ok: false, message: "No se encontró la propiedad" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    return NextResponse.json(
      { ok: false, message: "No se pudo eliminar la propiedad", error: getErrorMessage(err) },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    await dbConnect();

    const { id } = params;
    const body: unknown = await req.json();

    // whitelist mínima (evita que te metan basura al doc)
    const data = body as Partial<{
      ownerId: string;
      addressLine: string;
      unit: string;
      city: string;
      province: string;
      tipo: string;
      foto: string;
      mapa: string;
      inquilinoId: string | null;
      status: "AVAILABLE" | "RENTED" | "MAINTENANCE";
    }>;

    const update: Record<string, unknown> = {};
    if (typeof data.ownerId === "string") update.ownerId = data.ownerId;
    if (typeof data.addressLine === "string") update.addressLine = data.addressLine.trim();
    if (typeof data.unit === "string") update.unit = data.unit.trim();
    if (typeof data.city === "string") update.city = data.city.trim();
    if (typeof data.province === "string") update.province = data.province.trim();
    if (typeof data.tipo === "string") update.tipo = data.tipo.trim();
    if (typeof data.foto === "string") update.foto = data.foto;
    if (typeof data.mapa === "string") update.mapa = data.mapa;
    if (typeof data.status === "string") update.status = data.status;

    // inquilinoId: permitir setear o limpiar
    if (data.inquilinoId === null || data.inquilinoId === "") update.inquilinoId = undefined;
    if (typeof data.inquilinoId === "string" && data.inquilinoId.trim()) update.inquilinoId = data.inquilinoId;

    const property = await Property.findOneAndUpdate(
      { _id: id, tenantId: TENANT_ID },
      update,
      { new: true }
    )
      .populate("ownerId")
      .populate("inquilinoId")
      .lean();

    if (!property) {
      return NextResponse.json({ ok: false, message: "No se encontró la propiedad" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, property });
  } catch (err: unknown) {
    return NextResponse.json(
      { ok: false, message: "No se pudo editar la propiedad", error: getErrorMessage(err) },
      { status: 500 }
    );
  }
}
