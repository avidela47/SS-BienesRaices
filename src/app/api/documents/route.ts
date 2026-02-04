import { NextResponse } from "next/server";
import path from "path";
import { promises as fs } from "fs";
import { randomUUID } from "crypto";

import { dbConnect } from "@/lib/mongoose";
import Document, { type DocumentEntityType } from "@/models/Document";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const TENANT_ID = "default";
const UPLOADS_DIR = path.join(process.cwd(), "public", "uploads");

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "unknown";
}

function isEntityType(x: string): x is DocumentEntityType {
  return (
    x === "OWNER" ||
    x === "TENANT" ||
    x === "GUARANTOR" ||
    x === "PROPERTY" ||
    x === "CONTRACT" ||
    x === "PAYMENT" ||
    x === "INSTALLMENT" ||
    x === "AGENCY"
  );
}

async function ensureUploadsDir() {
  try {
    await fs.mkdir(UPLOADS_DIR, { recursive: true });
  } catch {
    // noop
  }
}

export async function GET(req: Request) {
  try {
    await dbConnect();

    const url = new URL(req.url);
  const entityTypeParam = (url.searchParams.get("entityType") || "").toUpperCase().trim();
  const entityId = (url.searchParams.get("entityId") || "").trim();
  const personId = (url.searchParams.get("personId") || "").trim();

    if (!entityTypeParam || !isEntityType(entityTypeParam)) {
      return NextResponse.json(
        { ok: false, message: "entityType inválido (OWNER | TENANT | GUARANTOR | AGENCY)" },
        { status: 400 }
      );
    }

    const filter: Record<string, unknown> = {
      tenantId: TENANT_ID,
      entityType: entityTypeParam,
    };

    if (entityTypeParam !== "AGENCY") {
      const effectiveId = entityId || personId;
      if (!effectiveId) {
        return NextResponse.json(
          { ok: false, message: "entityId es obligatorio para este tipo" },
          { status: 400 }
        );
      }

      if (personId && !entityId) {
        filter.$or = [{ entityId: effectiveId }, { personId: effectiveId }];
      } else {
        filter.entityId = effectiveId;
      }
    }

    const docs = await Document.find(filter).sort({ createdAt: -1 }).lean();

    return NextResponse.json({ ok: true, documents: docs });
  } catch (err: unknown) {
    return NextResponse.json(
      { ok: false, message: "Failed to fetch documents", error: getErrorMessage(err) },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    await dbConnect();
    await ensureUploadsDir();

    const form = await req.formData();

  const entityTypeRaw = String(form.get("entityType") || "").toUpperCase().trim();
  const entityIdRaw = String(form.get("entityId") || "").trim();
  const personIdRaw = String(form.get("personId") || "").trim();
    const notes = String(form.get("notes") || "").trim();
  const docType = String(form.get("docType") || "").trim();

    if (!entityTypeRaw || !isEntityType(entityTypeRaw)) {
      return NextResponse.json(
        { ok: false, message: "entityType inválido (OWNER | TENANT | GUARANTOR | AGENCY)" },
        { status: 400 }
      );
    }

    if (entityTypeRaw !== "AGENCY") {
      const effectiveId = entityIdRaw || personIdRaw;
      if (!effectiveId) {
        return NextResponse.json({ ok: false, message: "entityId es obligatorio" }, { status: 400 });
      }
    }

    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, message: "Falta archivo (file)" }, { status: 400 });
    }

    const originalName = file.name || "archivo";
    const mimeType = file.type || "application/octet-stream";
    const size = file.size;

    const ext = path.extname(originalName) || "";
    const storedName = `${Date.now()}-${randomUUID()}${ext}`;
    const diskPath = path.join(UPLOADS_DIR, storedName);

    const bytes = await file.arrayBuffer();
    await fs.writeFile(diskPath, Buffer.from(bytes));

    const url = `/uploads/${storedName}`;

    const effectiveEntityId = entityTypeRaw === "AGENCY" ? undefined : entityIdRaw || personIdRaw;

    const doc = await Document.create({
      tenantId: TENANT_ID,
      entityType: entityTypeRaw,
      entityId: effectiveEntityId,
      personId: entityTypeRaw === "AGENCY" ? undefined : personIdRaw || undefined,
      originalName,
      storedName,
      mimeType,
      size,
      url,
      notes,
      docType: docType || "OTRO",
    });

    return NextResponse.json({ ok: true, document: doc });
  } catch (err: unknown) {
    return NextResponse.json(
      { ok: false, message: "Failed to upload document", error: getErrorMessage(err) },
      { status: 500 }
    );
  }
}
