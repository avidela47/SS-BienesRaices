import { NextResponse } from "next/server";
import path from "path";
import { promises as fs } from "fs";
import { randomUUID } from "crypto";
import mongoose from "mongoose";

import { dbConnect } from "@/lib/mongoose";
import Document, { type DocumentEntityType } from "@/models/Document";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const TENANT_ID = "default";
const UPLOADS_DIR = path.join(process.cwd(), "public", "uploads");

function getErr(err: unknown): string {
  return err instanceof Error ? err.message : "unknown";
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

type LeanDocument = {
  _id?: unknown;
  tenantId?: unknown;
  entityType?: unknown;
  entityId?: unknown;
  personId?: unknown;
  originalName?: unknown;
  storedName?: unknown;
  mimeType?: unknown;
  size?: unknown;
  url?: unknown;
  docType?: unknown;
  notes?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
};

function toIsoDate(v: unknown): string {
  if (!v) return "";
  const d = new Date(v as string | number | Date);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}

// ✅ devolvemos strings para que el front NO reciba ObjectId
function serializeDoc(d: LeanDocument) {
  return {
    ...d,
    _id: d?._id ? String(d._id) : "",
    tenantId: String(d?.tenantId ?? ""),
    entityType: String(d?.entityType ?? ""),
    entityId: d?.entityId ? String(d.entityId) : undefined,
    personId: d?.personId ? String(d.personId) : undefined,
    createdAt: toIsoDate(d?.createdAt),
    updatedAt: toIsoDate(d?.updatedAt),
  };
}

function isValidObjectId(id: string) {
  return mongoose.Types.ObjectId.isValid(id);
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
        {
          ok: false,
          message:
            "entityType inválido (OWNER | TENANT | GUARANTOR | PROPERTY | CONTRACT | PAYMENT | INSTALLMENT | AGENCY)",
        },
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
        return NextResponse.json({ ok: false, message: "entityId es obligatorio para este tipo" }, { status: 400 });
      }

      // ✅ evita castear basura tipo "[object Object]"
      if (!isValidObjectId(effectiveId)) {
        return NextResponse.json({ ok: false, message: "entityId inválido (no es ObjectId)" }, { status: 400 });
      }

      if (personId && !entityId) {
        filter.$or = [{ entityId: effectiveId }, { personId: effectiveId }];
      } else {
        filter.entityId = effectiveId;
      }
    }

    const docsRaw = await Document.find(filter).sort({ createdAt: -1 }).lean();
    const docs = Array.isArray(docsRaw) ? docsRaw.map((d) => serializeDoc(d as LeanDocument)) : [];

    return NextResponse.json({ ok: true, documents: docs });
  } catch (err: unknown) {
    return NextResponse.json(
      { ok: false, message: "Failed to fetch documents", error: getErr(err) },
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
        {
          ok: false,
          message:
            "entityType inválido (OWNER | TENANT | GUARANTOR | PROPERTY | CONTRACT | PAYMENT | INSTALLMENT | AGENCY)",
        },
        { status: 400 }
      );
    }

    const effectiveEntityId = entityTypeRaw === "AGENCY" ? "" : (entityIdRaw || personIdRaw);

    if (entityTypeRaw !== "AGENCY") {
      if (!effectiveEntityId) {
        return NextResponse.json({ ok: false, message: "entityId es obligatorio" }, { status: 400 });
      }
      if (!isValidObjectId(effectiveEntityId)) {
        return NextResponse.json({ ok: false, message: "entityId inválido (no es ObjectId)" }, { status: 400 });
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

    const publicUrl = `/uploads/${storedName}`;

    const doc = await Document.create({
      tenantId: TENANT_ID,
      entityType: entityTypeRaw,
      entityId: entityTypeRaw === "AGENCY" ? undefined : effectiveEntityId,
      personId:
        entityTypeRaw === "AGENCY"
          ? undefined
          : personIdRaw && isValidObjectId(personIdRaw)
            ? personIdRaw
            : undefined,
      originalName,
      storedName,
      mimeType,
      size,
      url: publicUrl,
      notes,
      docType: docType || "OTRO",
    });

    const plain = doc.toObject({ virtuals: false }) as LeanDocument;
    return NextResponse.json({ ok: true, document: serializeDoc(plain) });
  } catch (err: unknown) {
    return NextResponse.json(
      { ok: false, message: "Failed to upload document", error: getErr(err) },
      { status: 500 }
    );
  }
}
