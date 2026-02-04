import { NextResponse } from "next/server";
import path from "path";
import { promises as fs } from "fs";

import { dbConnect } from "@/lib/mongoose";
import Document from "@/models/Document";
import mongoose from "mongoose";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const UPLOADS_DIR = path.join(process.cwd(), "public", "uploads");

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "unknown";
}

export async function DELETE(
  _req: Request,
  context: { params: { docId: string } } | { params: Promise<{ docId: string }> }
) {
  try {
    await dbConnect();

    const params = await context.params;
    const docId = params?.docId;

    if (!docId || !mongoose.Types.ObjectId.isValid(docId)) {
      return NextResponse.json({ ok: false, message: "ID de documento inválido" }, { status: 400 });
    }

    const doc = await Document.findByIdAndDelete(docId);

    if (!doc) {
      return NextResponse.json({ ok: false, message: "Documento no encontrado" }, { status: 404 });
    }

    // Borramos archivo físico (si existe)
    try {
      const diskPath = path.join(UPLOADS_DIR, doc.storedName);
      await fs.unlink(diskPath);
    } catch {
      // si no existe, no frenamos
    }

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    return NextResponse.json(
      { ok: false, message: "Failed to delete document", error: getErrorMessage(err) },
      { status: 500 }
    );
  }
}
