import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongoose";
import Property from "@/models/Property";

const TENANT_ID = "default";

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "unknown";
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    await dbConnect();
  const { id } = await params;
  const result = await Property.deleteOne({ _id: id });
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
  const { id } = await params;
    const body = await req.json();
    const update = { ...body };
    const property = await Property.findOneAndUpdate(
      { _id: id, tenantId: TENANT_ID },
      update,
      { new: true }
    ).lean();
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
