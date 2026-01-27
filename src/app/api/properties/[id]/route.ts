import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongoose";
import Property from "@/models/Property";

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "unknown";
}

function isCastObjectIdError(message: string) {
  return message.toLowerCase().includes("cast to objectid failed");
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    await dbConnect();

    const id = (params?.id ?? "").trim();
    const body = await req.json();

    // ✅ Single-app: no filtramos por tenantId acá
    const property = await Property.findOneAndUpdate({ _id: id }, { ...body }, { new: true }).lean();

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

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    await dbConnect();

    const id = (params?.id ?? "").trim();

    // ✅ Single-app: no filtramos por tenantId acá
    const result = await Property.deleteOne({ _id: id });

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
