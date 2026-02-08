import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongoose";
import Document from "@/models/Document";

const TENANT_ID = "default";

type ParamsCtx = { params: { id: string } } | { params: Promise<{ id: string }> };

type Body = {
  title?: unknown;
  type?: unknown;
  entity?: unknown;
  entityId?: unknown;
  description?: unknown;
  images?: unknown;
};

function s(v: unknown) {
  return typeof v === "string" ? v : "";
}

function arrStr(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x) => typeof x === "string" && x.trim()).map((x) => String(x));
}

async function getId(context: ParamsCtx): Promise<string> {
  const p = "then" in (context.params as Promise<{ id: string }>) ? await context.params : (context.params as { id: string });
  return String(p.id || "");
}

export async function PUT(req: Request, context: ParamsCtx) {
  await dbConnect();

  const id = await getId(context);
  const body = (await req.json()) as Body;

  const title = s(body.title).trim();
  if (!title) {
    return NextResponse.json({ ok: false, message: "Título es obligatorio" }, { status: 400 });
  }

  const type = s(body.type).trim() || "OTRO";
  const entity = s(body.entity).trim() || "OTRO";
  const entityIdRaw = s(body.entityId).trim();
  const entityId = entityIdRaw ? entityIdRaw : null;

  const description = s(body.description).trim();
  const images = arrStr(body.images);

  const updated = await Document.findOneAndUpdate(
    { _id: id, tenantId: TENANT_ID },
    { title, type, entity, entityId, description, images },
    { new: true }
  ).lean();

  if (!updated) {
    return NextResponse.json({ ok: false, message: "Documento no encontrado" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, document: updated });
}

export async function DELETE(_req: Request, context: ParamsCtx) {
  await dbConnect();

  const id = await getId(context);

  const deleted = await Document.findOneAndDelete({ _id: id, tenantId: TENANT_ID }).lean();
  if (!deleted) {
    return NextResponse.json({ ok: false, message: "Documento no encontrado" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}

