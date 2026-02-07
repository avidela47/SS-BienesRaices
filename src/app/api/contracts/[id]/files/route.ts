import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import path from "path";
import { promises as fs } from "fs";

import { dbConnect } from "@/lib/mongoose";

// ✅ IMPORTANTÍSIMO: registramos modelos referenciados por Contract (evita "Schema hasn't been registered")
import "@/models/Property";

import { ContractFile } from "@/models/ContractFile";
import Contract from "@/models/Contract";
import Document from "@/models/Document";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const TENANT_ID = "default";

function isObjectId(v: string) {
  return mongoose.Types.ObjectId.isValid(v);
}

function sanitizeFileName(name: string) {
  return name.replace(/[^\w.\- ()[\]]+/g, "_").trim();
}

function extFromNameOrMime(originalName: string, mimeType: string) {
  const extFromName = path.extname(originalName || "").toLowerCase();
  if (extFromName) return extFromName;

  if (mimeType === "application/pdf") return ".pdf";
  if (mimeType === "image/png") return ".png";
  if (mimeType === "image/jpeg") return ".jpg";
  return "";
}

function isAllowedMime(mime: string) {
  return mime === "application/pdf" || mime === "image/png" || mime === "image/jpeg";
}

type RouteParams = { id?: string };
type RouteContext = { params: RouteParams } | { params: Promise<RouteParams> };

function isPromise<T>(v: unknown): v is Promise<T> {
  return typeof v === "object" && v !== null && "then" in v && typeof (v as { then?: unknown }).then === "function";
}

async function getParams(ctx: RouteContext): Promise<RouteParams> {
  const p = ctx.params;
  return isPromise<RouteParams>(p) ? await p : p;
}

function ownerIdToString(ownerId: unknown): string {
  if (typeof ownerId === "string") return ownerId;
  if (ownerId && typeof ownerId === "object") {
    const rec = ownerId as Record<string, unknown>;
    const oid = rec["$oid"];
    if (typeof oid === "string") return oid;
    const id = rec["_id"];
    if (typeof id === "string") return id;
    if (id && typeof id === "object") {
      const r2 = id as Record<string, unknown>;
      if (typeof r2["$oid"] === "string") return r2["$oid"] as string;
    }
  }
  return "";
}

export async function GET(_req: NextRequest, ctx: RouteContext) {
  try {
    await dbConnect();
    const params = await getParams(ctx);
    const contractId = String(params.id || "").trim();

    if (!contractId || !isObjectId(contractId)) {
      return NextResponse.json({ ok: false, error: `contractId inválido: "${contractId}"` }, { status: 400 });
    }

    const exists = await Contract.findOne({
      tenantId: TENANT_ID,
      _id: new mongoose.Types.ObjectId(contractId),
    })
      .select("_id")
      .lean();

    if (!exists) {
      return NextResponse.json({ ok: false, error: "Contrato no encontrado" }, { status: 404 });
    }

    const files = await ContractFile.find({
      tenantId: TENANT_ID,
      contractId: new mongoose.Types.ObjectId(contractId),
    })
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json({ ok: true, files }, { status: 200 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest, ctx: RouteContext) {
  try {
    await dbConnect();

    const params = await getParams(ctx);
    const contractId = String(params.id || "").trim();

    if (!contractId || !isObjectId(contractId)) {
      return NextResponse.json({ ok: false, error: `contractId inválido: "${contractId}"` }, { status: 400 });
    }

    // Traemos ownerId para duplicar el documento en Documentación/Propietarios
    const contract = await Contract.findOne({
      tenantId: TENANT_ID,
      _id: new mongoose.Types.ObjectId(contractId),
    })
      .select("_id ownerId")
      .lean();

    if (!contract) {
      return NextResponse.json({ ok: false, error: "Contrato no encontrado" }, { status: 404 });
    }

    const form = await req.formData();

    const file = form.get("file");
    const movementIdRaw = form.get("movementId");
    const uploadedByRaw = form.get("uploadedBy");

    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, error: "file requerido" }, { status: 400 });
    }

    const mimeType = file.type || "application/octet-stream";
    if (!isAllowedMime(mimeType)) {
      return NextResponse.json({ ok: false, error: "Tipo no permitido. Solo PDF/JPG/PNG." }, { status: 400 });
    }

    const originalName = sanitizeFileName(file.name || "archivo");
    const ext = extFromNameOrMime(originalName, mimeType);

    const now = new Date();
    const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(
      2,
      "0"
    )}_${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}${String(
      now.getSeconds()
    ).padStart(2, "0")}`;

    const storedName = `${stamp}_${Math.random().toString(16).slice(2)}${ext || ""}`;

    const dirAbs = path.join(process.cwd(), "public", "uploads", "contracts", contractId);
    await fs.mkdir(dirAbs, { recursive: true });

    const buffer = Buffer.from(await file.arrayBuffer());
    const absPath = path.join(dirAbs, storedName);
    await fs.writeFile(absPath, buffer);

    const publicPath = `/uploads/contracts/${contractId}/${storedName}`;

    let movementId: mongoose.Types.ObjectId | undefined;
    if (typeof movementIdRaw === "string" && movementIdRaw && isObjectId(movementIdRaw)) {
      movementId = new mongoose.Types.ObjectId(movementIdRaw);
    }

    const uploadedBy = typeof uploadedByRaw === "string" && uploadedByRaw.trim() ? uploadedByRaw.trim() : "manual";

    // 1) ContractFile (Caja)
    const cf = await ContractFile.create({
      tenantId: TENANT_ID,
      contractId: new mongoose.Types.ObjectId(contractId),
      movementId,
      originalName,
      storedName,
      mimeType,
      size: buffer.length,
      publicPath,
      uploadedBy,
    });

    // 2) Document (Documentación) - CONTRACT y (si hay ownerId válido) OWNER
    const docsToCreate: Array<{
      tenantId: string;
      entityType: "CONTRACT" | "OWNER";
      entityId: mongoose.Types.ObjectId;
      originalName: string;
      storedName: string;
      mimeType: string;
      size: number;
      url: string;
      docType: string;
      notes: string;
    }> = [];

    docsToCreate.push({
      tenantId: TENANT_ID,
      entityType: "CONTRACT",
      entityId: new mongoose.Types.ObjectId(contractId),
      originalName,
      storedName,
      mimeType,
      size: buffer.length,
      url: publicPath,
      docType: "Recibo pago",
      notes: `Comprobante cargado desde Caja${movementId ? ` (movementId: ${String(movementId)})` : ""}`,
    });

    const ownerStr = ownerIdToString((contract as unknown as { ownerId?: unknown }).ownerId);

    if (ownerStr && isObjectId(ownerStr)) {
      docsToCreate.push({
        tenantId: TENANT_ID,
        entityType: "OWNER",
        entityId: new mongoose.Types.ObjectId(ownerStr),
        originalName,
        storedName,
        mimeType,
        size: buffer.length,
        url: publicPath,
        docType: "Recibo pago",
        notes: `Comprobante cargado desde Caja (Contrato: ${contractId})`,
      });
    }

    // Si falla Documentación no rompemos Caja
    try {
      if (docsToCreate.length > 0) {
        await Document.insertMany(docsToCreate);
      }
    } catch {
      // noop
    }

    return NextResponse.json({ ok: true, file: cf }, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

