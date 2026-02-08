import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongoose";
import Document from "@/models/Document";

const TENANT_ID = "default";

type CreateBody = {
  title?: unknown;
  type?: unknown;
  entity?: unknown;
  entityId?: unknown;
  description?: unknown;
  images?: unknown;
};

function s(v: unknown) {
  return typeof v === "string" ? v.trim() : "";
}
function sarr(v: unknown) {
  if (!Array.isArray(v)) return [];
  return v.filter((x) => typeof x === "string" && x.trim()).map((x) => x.trim());
}

export async function GET() {
  await dbConnect();

  const documents = await Document.find({ tenantId: TENANT_ID }).sort({ createdAt: -1 }).lean();
  return NextResponse.json({ ok: true, documents });
}

export async function POST(req: Request) {
  await dbConnect();
  const body = (await req.json()) as CreateBody;

  const title = s(body.title);
  if (!title) {
    return NextResponse.json({ ok: false, message: "title es obligatorio" }, { status: 400 });
  }

  const type = s(body.type) || "OTRO";
  const entity = s(body.entity) || "OTHER";
  const entityId = s(body.entityId) || null;
  const description = s(body.description);
  const images = sarr(body.images);

  const created = await Document.create({
    tenantId: TENANT_ID,
    title,
    type,
    entity,
    entityId,
    description,
    images,
    status: "ACTIVE",
  });

  const document = await Document.findById(created._id).lean();
  return NextResponse.json({ ok: true, document });
}
