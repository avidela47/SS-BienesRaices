import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { dbConnect } from "@/lib/mongoose";

import Contract from "@/models/Contract";
import Property from "@/models/Property";
import Person from "@/models/Person";
import Counter from "@/models/Counter";
import MonthlyRent from "@/models/MonthlyRent";

const TENANT_ID = "default";

type BillingAdjustmentInput = {
  n: number;
  percentage: number;
};

type ContractCreateDTO = {
  propertyId: string;
  ownerId: string;
  tenantPersonId: string;

  startDate: string;

  // ✅ manda esto
  duracionMeses: number;

  // ✅ monto base
  montoBase: number;

  // billing
  dueDay: number;
  currency?: string;

  // frecuencia (1/3/6 etc). Si 0, no hay ajustes
  actualizacionCadaMeses?: number;

  // porcentajes manuales (en orden, 1 por cada evento)
  ajustes?: BillingAdjustmentInput[];

  code?: string;
};

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
  ).lean<{ seq?: number }>();

  const seq = doc?.seq ?? 1;
  return `CID-${pad3(seq)}`;
}

function addMonthsSafe(date: Date, months: number): Date {
  const d = new Date(date);
  const day = d.getDate();

  d.setMonth(d.getMonth() + months);

  // si al mover el mes se “corre” por falta de días, ajusta al último día del mes
  if (d.getDate() < day) d.setDate(0);

  return d;
}

function formatPeriodYYYYMM(date: Date): string {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  return `${y}-${String(m).padStart(2, "0")}`;
}

function lastDayOfMonth(year: number, monthIndex0: number): number {
  // day 0 del mes siguiente = último día del mes actual
  return new Date(year, monthIndex0 + 1, 0).getDate();
}

function buildDueDateForMonth(baseStart: Date, monthOffset: number, dueDay: number): Date {
  const d = new Date(baseStart);
  d.setDate(1);
  d.setMonth(d.getMonth() + monthOffset);

  const year = d.getFullYear();
  const monthIndex0 = d.getMonth();
  const last = lastDayOfMonth(year, monthIndex0);
  const day = Math.min(dueDay, last);

  return new Date(year, monthIndex0, day, 12, 0, 0, 0);
}

function requiredAdjustmentsCount(duracionMeses: number, cadaMeses: number): number {
  if (cadaMeses <= 0) return 0;
  // mes 1..N, la primera actualización aplica en mes = cadaMeses + 1
  // cantidad de eventos = floor((N-1)/cadaMeses)
  return Math.floor((duracionMeses - 1) / cadaMeses);
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

    const data = (await req.json()) as Partial<ContractCreateDTO>;

    // Validaciones mínimas
    if (
      !data.propertyId ||
      !data.ownerId ||
      !data.tenantPersonId ||
      !data.startDate
    ) {
      return NextResponse.json(
        { ok: false, message: "Missing required fields: propertyId, ownerId, tenantPersonId, startDate" },
        { status: 400 }
      );
    }

    const duracionMeses = Number(data.duracionMeses);
    if (!duracionMeses || Number.isNaN(duracionMeses) || duracionMeses < 1) {
      return NextResponse.json(
        { ok: false, message: "duracionMeses must be >= 1" },
        { status: 400 }
      );
    }

    const montoBase = Number(data.montoBase);
    if (Number.isNaN(montoBase) || montoBase < 0) {
      return NextResponse.json(
        { ok: false, message: "montoBase invalid" },
        { status: 400 }
      );
    }

    const dueDay = Number(data.dueDay);
    if (Number.isNaN(dueDay) || dueDay < 1 || dueDay > 28) {
      return NextResponse.json(
        { ok: false, message: "dueDay must be 1..28" },
        { status: 400 }
      );
    }

    const startDate = new Date(String(data.startDate));
    if (Number.isNaN(startDate.getTime())) {
      return NextResponse.json(
        { ok: false, message: "startDate invalid" },
        { status: 400 }
      );
    }

    const actualizacionCadaMeses = Number(data.actualizacionCadaMeses ?? 0);
    if (Number.isNaN(actualizacionCadaMeses) || actualizacionCadaMeses < 0) {
      return NextResponse.json(
        { ok: false, message: "actualizacionCadaMeses invalid" },
        { status: 400 }
      );
    }

    // Ajustes manuales
    const ajustes: BillingAdjustmentInput[] = Array.isArray(data.ajustes) ? data.ajustes : [];
    for (const a of ajustes) {
      const n = Number(a.n);
      const p = Number(a.percentage);
      if (Number.isNaN(n) || n < 1 || Number.isNaN(p)) {
        return NextResponse.json(
          { ok: false, message: "ajustes invalid format (n>=1, percentage number)" },
          { status: 400 }
        );
      }
    }

    // Cantidad de eventos esperados según duración y frecuencia
    const expectedAdjustments = requiredAdjustmentsCount(duracionMeses, actualizacionCadaMeses);

    if (expectedAdjustments > 0 && ajustes.length !== expectedAdjustments) {
      return NextResponse.json(
        {
          ok: false,
          message: `Debe cargar ${expectedAdjustments} ajustes (1 por cada actualización). Recibidos: ${ajustes.length}.`,
        },
        { status: 400 }
      );
    }

    // Validación de entidades
    const property = await Property.findById(data.propertyId).lean<{ status?: string } | null>();
    if (!property) {
      return NextResponse.json({ ok: false, message: "propertyId not found" }, { status: 400 });
    }
    if (property.status === "RENTED" || property.status === "INACTIVE") {
      return NextResponse.json({ ok: false, message: "Propiedad alquilada" }, { status: 400 });
    }

    const owner = await Person.findById(data.ownerId).lean<{ type?: string } | null>();
    if (!owner) return NextResponse.json({ ok: false, message: "ownerId not found" }, { status: 400 });
    if (owner.type !== "OWNER") {
      return NextResponse.json({ ok: false, message: "ownerId must be OWNER" }, { status: 400 });
    }

    const tenant = await Person.findById(data.tenantPersonId).lean<{ type?: string } | null>();
    if (!tenant) return NextResponse.json({ ok: false, message: "tenantPersonId not found" }, { status: 400 });
    if (tenant.type !== "TENANT") {
      return NextResponse.json({ ok: false, message: "tenantPersonId must be TENANT" }, { status: 400 });
    }

    // Código
    const code = data.code && String(data.code).trim() ? String(data.code).trim() : await nextContractCode();

    // endDate derivado
    const endDate = addMonthsSafe(startDate, duracionMeses);

    // Crear contrato
    const contract = await Contract.create({
      tenantId: TENANT_ID,
      code,
      propertyId: new Types.ObjectId(data.propertyId),
      ownerId: new Types.ObjectId(data.ownerId),
      tenantPersonId: new Types.ObjectId(data.tenantPersonId),
      startDate,
      endDate,
      duracionMeses,
      montoBase: Math.round(montoBase),
      status: "ACTIVE",
      billing: {
        dueDay,
        currency: data.currency ? String(data.currency).trim() : "ARS",
        actualizacionCadaMeses,
        ajustes,
        lateFeePolicy: { type: "NONE", value: 0 },
        notes: "",
      },
      documents: [],
    });

    // Bloquear propiedad + asignar inquilino
    await Property.findByIdAndUpdate(data.propertyId, {
      status: "RENTED",
      inquilinoId: data.tenantPersonId,
    });

    // ✅ Generar MonthlyRents (N meses)
    const rentsToInsert: Array<{
      tenantId: string;
      contractId: Types.ObjectId;
      propertyId: Types.ObjectId;
      ownerId: Types.ObjectId;
      tenantPersonId: Types.ObjectId;
      period: string;
      dueDate: Date;
      amount: number;
      status: "PENDING";
      paidAt: null;
      notes: string;
    }> = [];

    let currentAmount = Math.round(montoBase);
    let adjIndex = 0;

    for (let month = 1; month <= duracionMeses; month += 1) {
      // Si corresponde inicio de un nuevo tramo (mes 4,7,10... para cada=3)
      if (actualizacionCadaMeses > 0 && month !== 1) {
        const isAdjustmentMonth = (month - 1) % actualizacionCadaMeses === 0;
        if (isAdjustmentMonth) {
          const adj = ajustes[adjIndex];
          const pct = adj ? Number(adj.percentage) : 0;
          currentAmount = Math.round(currentAmount * (1 + pct / 100));
          adjIndex += 1;
        }
      }

      const monthOffset = month - 1;
      const monthDate = addMonthsSafe(startDate, monthOffset);
      const period = formatPeriodYYYYMM(monthDate);
      const dueDateComputed = buildDueDateForMonth(startDate, monthOffset, dueDay);

      rentsToInsert.push({
        tenantId: TENANT_ID,
        contractId: contract._id,
        propertyId: new Types.ObjectId(data.propertyId),
        ownerId: new Types.ObjectId(data.ownerId),
        tenantPersonId: new Types.ObjectId(data.tenantPersonId),
        period,
        dueDate: dueDateComputed,
        amount: currentAmount,
        status: "PENDING",
        paidAt: null,
        notes: "",
      });
    }

    await MonthlyRent.insertMany(rentsToInsert, { ordered: true });

    return NextResponse.json({
      ok: true,
      contractId: contract._id,
      code: contract.code,
      monthlyRentsCreated: rentsToInsert.length,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { ok: false, message: "Failed to create contract", error: getErrorMessage(err) },
      { status: 500 }
    );
  }
}
