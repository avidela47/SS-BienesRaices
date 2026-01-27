import { NextResponse } from "next/server";
import path from "path";
import { promises as fs } from "fs";

import { dbConnect } from "@/lib/mongoose";
import Document from "@/models/Document";

export const runtime = "nodejs";

const UPLOADS_DIR = path.join(process.cwd(), "public", "uploads");

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "unknown";
}

export async function DELETE(
  _req: Request,
  { params }: { params: { docId: string } }
) {
  try {
    await dbConnect();

    const docId = params.docId;
    const doc = await Document.findById(docId);

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

    await doc.deleteOne();

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    return NextResponse.json(
      { ok: false, message: "Failed to delete document", error: getErrorMessage(err) },
      { status: 500 }
    );
  }
}
