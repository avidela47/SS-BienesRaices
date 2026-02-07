import { NextResponse } from "next/server";
import mongoose from "mongoose";

import { dbConnect } from "@/lib/mongoose";
import Document from "@/models/Document";
import { ContractFile, type ContractFileDoc } from "@/models/ContractFile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const TENANT_ID = "default";

/* =========================
   Utils
========================= */

function getErr(err: unknown): string {
  return err instanceof Error ? err.message : "unknown";
}

/* =========================
   Tipos API
========================= */

type ApiDocument = {
  _id: string;
  source: "DOCUMENT" | "CAJA";
  entityType: string;
  entityId?: string;
  originalName: string;
  mimeType: string;
  size: number;
  url: string;
  notes: string;
  docType: string;
  createdAt: Date;
};

/* =========================
   Serializers
========================= */

function serializeDocument(d: {
  _id: mongoose.Types.ObjectId;
  entityType: string;
  entityId?: mongoose.Types.ObjectId;
  originalName: string;
  mimeType: string;
  size: number;
  url: string;
  notes?: string;
  docType?: string;
  createdAt: Date;
}): ApiDocument {
  return {
    _id: String(d._id),
    source: "DOCUMENT",
    entityType: d.entityType,
    entityId: d.entityId ? String(d.entityId) : undefined,
    originalName: d.originalName,
    mimeType: d.mimeType,
    size: d.size,
    url: d.url,
    notes: d.notes ?? "",
    docType: d.docType ?? "OTRO",
    createdAt: d.createdAt,
  };
}

function serializeContractFile(f: ContractFileDoc): ApiDocument {
  return {
    _id: String(f._id),
    source: "CAJA",
    entityType: "CONTRACT",
    entityId: String(f.contractId),
    originalName: f.originalName,
    mimeType: f.mimeType,
    size: f.size,
    url: f.publicPath,
    notes: "Comprobante cargado desde Caja",
    docType: "COMPROBANTE",
    createdAt: f.createdAt,
  };
}

/* =========================
   GET — DOCUMENTACIÓN GLOBAL
========================= */

export async function GET() {
  try {
    await dbConnect();

    const documentsRaw = await Document.find({
      tenantId: TENANT_ID,
    })
      .sort({ createdAt: -1 })
      .lean();

    const cajaFilesRaw = await ContractFile.find({
      tenantId: TENANT_ID,
    })
      .sort({ createdAt: -1 })
      .lean();

    const documents: ApiDocument[] = [
      ...documentsRaw.map((d) => serializeDocument(d)),
      ...cajaFilesRaw.map((f) => serializeContractFile(f as ContractFileDoc)),
    ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    return NextResponse.json({ ok: true, documents });
  } catch (err: unknown) {
    return NextResponse.json(
      { ok: false, message: "Failed to fetch documents", error: getErr(err) },
      { status: 500 }
    );
  }
}
