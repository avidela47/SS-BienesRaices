import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongoose";
import Contract from "@/models/Contract";
import Property from "@/models/Property";
import Person from "@/models/Person";
import Counter from "@/models/Counter";

type ContractInputDTO = {
  propertyId: string;
  ownerId: string;
  tenantPersonId: string;
  startDate: string;
  endDate: string;
  dueDay: number;
  baseRent: number;
  currency: string;
  code?: string;
  actualizacionCada?: number;
  porcentajeActualizacion?: number;
  duracion?: number;
  montoCuota?: number;
  comision?: number;
  expensas?: string;
  otrosGastosImporte?: number;
  otrosGastosDesc?: string;
};

const TENANT_ID = "default";

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "unknown";
}

function pad3(n: number): string {
  return String(n).padStart(3, "0");
}

async function nextContractCode(): Promise<string> {
  const key = "contract:CID";
  const doc = await Counter.findOneAndUpdate(
    { tenantId: TENANT_ID, key },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  ).lean();

  const seq = doc?.seq ?? 1;
  return `CID-${pad3(seq)}`;
}

export async function GET() {
  try {
    await dbConnect();

    const contracts = await Contract.find({ tenantId: TENANT_ID })
      .sort({ createdAt: -1 })
      .populate("propertyId")
      .populate("ownerId")
      .populate("tenantPersonId")
      .lean();

    return NextResponse.json({ ok: true, contracts });
  } catch (err: unknown) {
    return NextResponse.json(
      { ok: false, message: "Failed to fetch contracts", error: getErrorMessage(err) },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    await dbConnect();
    const body: unknown = await req.json();

    const data = body as Partial<ContractInputDTO>;

    if (
      !data.propertyId ||
      !data.ownerId ||
      !data.tenantPersonId ||
      !data.startDate ||
      !data.endDate ||
      !data.dueDay ||
      data.baseRent === undefined
    ) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Missing required fields: propertyId, ownerId, tenantPersonId, startDate, endDate, dueDay, baseRent",
        },
        { status: 400 }
      );
    }

    const property = await Property.findById(data.propertyId).lean();
    if (!property) return NextResponse.json({ ok: false, message: "propertyId not found" }, { status: 400 });
    // Si la propiedad está alquilada (status RENTED o INACTIVE), no permitir
    if (property.status === 'RENTED' || property.status === 'INACTIVE') {
      return NextResponse.json({ ok: false, message: 'Propiedad alquilada' }, { status: 400 });
    }

    const owner = await Person.findById(data.ownerId).lean();
    if (!owner) return NextResponse.json({ ok: false, message: "ownerId not found" }, { status: 400 });
    if (owner.type !== "OWNER")
      return NextResponse.json({ ok: false, message: "ownerId must be OWNER" }, { status: 400 });

    const tenant = await Person.findById(data.tenantPersonId).lean();
    if (!tenant) return NextResponse.json({ ok: false, message: "tenantPersonId not found" }, { status: 400 });
    if (tenant.type !== "TENANT")
      return NextResponse.json({ ok: false, message: "tenantPersonId must be TENANT" }, { status: 400 });

    const dueDay = Number(data.dueDay);
    if (Number.isNaN(dueDay) || dueDay < 1 || dueDay > 28) {
      return NextResponse.json({ ok: false, message: "dueDay must be 1..28" }, { status: 400 });
    }

    const baseRent = Number(data.baseRent);
    if (Number.isNaN(baseRent) || baseRent < 0) {
      return NextResponse.json({ ok: false, message: "baseRent invalid" }, { status: 400 });
    }

    const code =
      data.code && String(data.code).trim()
        ? String(data.code).trim()
        : await nextContractCode();

    const contract = await Contract.create({
      tenantId: TENANT_ID,
      code,
      propertyId: data.propertyId,
      ownerId: data.ownerId,
      tenantPersonId: data.tenantPersonId,
      startDate: new Date(data.startDate),
      endDate: new Date(data.endDate),
      status: "ACTIVE",
      billing: {
        dueDay,
        baseRent,
        currency: data.currency ? String(data.currency).trim() : "ARS",
        actualizacionCada: data.actualizacionCada ? Number(data.actualizacionCada) : 0,
        porcentajeActualizacion: data.porcentajeActualizacion ? Number(data.porcentajeActualizacion) : 0,
        lateFeePolicy: { type: "NONE", value: 0 },
        notes: "",
      },
      duracion: data.duracion ? Number(data.duracion) : 0,
      montoCuota: data.montoCuota ? Number(data.montoCuota) : 0,
      comision: data.comision ? Number(data.comision) : 0,
      expensas: data.expensas || "no",
      otrosGastosImporte: data.otrosGastosImporte ? Number(data.otrosGastosImporte) : 0,
      otrosGastosDesc: data.otrosGastosDesc || "",
      documents: [],
    });

    return NextResponse.json({ ok: true, contractId: contract._id, code: contract.code });
  } catch (err: unknown) {
    return NextResponse.json(
      { ok: false, message: "Failed to create contract", error: getErrorMessage(err) },
      { status: 500 }
    );
  }
}
