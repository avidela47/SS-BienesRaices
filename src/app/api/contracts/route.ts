// src/app/api/contracts/route.ts
import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { dbConnect } from "@/lib/mongoose";

import Contract from "@/models/Contract";
import Property from "@/models/Property";
import Person from "@/models/Person";
import Counter from "@/models/Counter";
import Installment from "@/models/Installment";

const TENANT_ID = "default";

type BillingAdjustmentInput = {
  n: number;
  percentage: number;
};

type ContractCreateDTO_New = {
  propertyId: string;
  ownerId: string;
  tenantPersonId: string;
  startDate: string;

  duracionMeses: number;
  montoBase: number;

  dueDay: number;
  currency?: string;

  actualizacionCadaMeses?: number;
  ajustes?: BillingAdjustmentInput[];

  code?: string;
};

// Formato viejo que venías usando
type ContractCreateDTO_Legacy = {
  propertyId: string;
  ownerId: string;
  tenantPersonId: string;

  startDate: string;
  endDate?: string;

  duracion?: number;
  valorCuota?: number;
  diaVencimiento?: number;

  actualizacionCada?: number;
  porcentajeActualizacion?: number;

  billing?: {
    dueDay?: number;
    baseRent?: number;
    currency?: string;
    lateFeePolicy?: { type?: "NONE" | "FIXED" | "PERCENT"; value?: number };
    notes?: string;
    actualizacionCada?: number;
    porcentajeActualizacion?: number;
  };

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
  const doc = await Counter.findOneAndUpdate({ tenantId: TENANT_ID, key }, { $inc: { seq: 1 } }, { new: true, upsert: true }).lean<{ seq?: number }>();
  const seq = doc?.seq ?? 1;
  return `CID-${pad3(seq)}`;
}

function addMonthsSafe(date: Date, months: number): Date {
  const d = new Date(date);
  const day = d.getDate();
  d.setMonth(d.getMonth() + months);
  if (d.getDate() < day) d.setDate(0);
  return d;
}

function formatPeriodYYYYMM(date: Date): string {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  return `${y}-${String(m).padStart(2, "0")}`;
}

function lastDayOfMonth(year: number, monthIndex0: number): number {
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
  return Math.floor((duracionMeses - 1) / cadaMeses);
}

function normalizeCreatePayload(input: Partial<ContractCreateDTO_New & ContractCreateDTO_Legacy>) {
  const propertyId = input.propertyId ? String(input.propertyId) : "";
  const ownerId = input.ownerId ? String(input.ownerId) : "";
  const tenantPersonId = input.tenantPersonId ? String(input.tenantPersonId) : "";
  const startDateRaw = input.startDate ? String(input.startDate) : "";

  const currency =
    (typeof (input as ContractCreateDTO_New).currency === "string" && (input as ContractCreateDTO_New).currency.trim()) ||
    (typeof input.billing?.currency === "string" && input.billing.currency.trim()) ||
    "ARS";

  // Duración
  const duracionMeses =
    Number((input as ContractCreateDTO_New).duracionMeses) ||
    Number((input as ContractCreateDTO_Legacy).duracion) ||
    0;

  // Monto base
  const montoBase =
    Number((input as ContractCreateDTO_New).montoBase) ||
    Number((input as ContractCreateDTO_Legacy).valorCuota) ||
    Number(input.billing?.baseRent) ||
    0;

  // Due day
  const dueDay =
    Number((input as ContractCreateDTO_New).dueDay) ||
    Number((input as ContractCreateDTO_Legacy).diaVencimiento) ||
    Number(input.billing?.dueDay) ||
    0;

  // Actualización cada
  const actualizacionCadaMeses =
    Number((input as ContractCreateDTO_New).actualizacionCadaMeses ?? 0) ||
    Number((input as ContractCreateDTO_Legacy).actualizacionCada ?? input.billing?.actualizacionCada ?? 0) ||
    0;

  // Porcentaje base (si viene legacy)
  const pctLegacy =
    Number((input as ContractCreateDTO_Legacy).porcentajeActualizacion ?? input.billing?.porcentajeActualizacion ?? 0) || 0;

  // Ajustes: si viene nuevo, lo uso; si no, lo construyo repitiendo pctLegacy
  let ajustes: BillingAdjustmentInput[] = Array.isArray((input as ContractCreateDTO_New).ajustes)
    ? (input as ContractCreateDTO_New).ajustes!.map((a) => ({ n: Number(a.n), percentage: Number(a.percentage) }))
    : [];

  const expected = requiredAdjustmentsCount(duracionMeses, actualizacionCadaMeses);

  if (expected > 0 && ajustes.length === 0 && Number.isFinite(pctLegacy)) {
    ajustes = Array.from({ length: expected }, (_v, i) => ({ n: i + 1, percentage: pctLegacy }));
  }

  return {
    propertyId,
    ownerId,
    tenantPersonId,
    startDateRaw,
    duracionMeses,
    montoBase,
    dueDay,
    currency,
    actualizacionCadaMeses,
    pctLegacy,
    ajustes,
    code: input.code ? String(input.code).trim() : "",
  };
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
    return NextResponse.json({ ok: false, message: "Failed to fetch contracts", error: getErrorMessage(err) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    await dbConnect();

    const raw = (await req.json()) as Partial<ContractCreateDTO_New & ContractCreateDTO_Legacy>;
    const n = normalizeCreatePayload(raw);

    // Validaciones mínimas
    if (!n.propertyId || !n.ownerId || !n.tenantPersonId || !n.startDateRaw) {
      return NextResponse.json(
        { ok: false, message: "Missing required fields: propertyId, ownerId, tenantPersonId, startDate" },
        { status: 400 }
      );
    }

    if (!n.duracionMeses || Number.isNaN(n.duracionMeses) || n.duracionMeses < 1) {
      return NextResponse.json({ ok: false, message: "duracionMeses must be >= 1" }, { status: 400 });
    }

    if (Number.isNaN(n.montoBase) || n.montoBase < 0) {
      return NextResponse.json({ ok: false, message: "montoBase invalid" }, { status: 400 });
    }

    if (Number.isNaN(n.dueDay) || n.dueDay < 1 || n.dueDay > 28) {
      return NextResponse.json({ ok: false, message: "dueDay must be 1..28" }, { status: 400 });
    }

    const startDate = new Date(String(n.startDateRaw));
    if (Number.isNaN(startDate.getTime())) {
      return NextResponse.json({ ok: false, message: "startDate invalid" }, { status: 400 });
    }

    if (Number.isNaN(n.actualizacionCadaMeses) || n.actualizacionCadaMeses < 0) {
      return NextResponse.json({ ok: false, message: "actualizacionCadaMeses invalid" }, { status: 400 });
    }

    // Ajustes manuales
    for (const a of n.ajustes) {
      const nn = Number(a.n);
      const p = Number(a.percentage);
      if (Number.isNaN(nn) || nn < 1 || Number.isNaN(p)) {
        return NextResponse.json({ ok: false, message: "ajustes invalid format (n>=1, percentage number)" }, { status: 400 });
      }
    }

    const expectedAdjustments = requiredAdjustmentsCount(n.duracionMeses, n.actualizacionCadaMeses);
    if (expectedAdjustments > 0 && n.ajustes.length !== expectedAdjustments) {
      return NextResponse.json(
        {
          ok: false,
          message: `Debe cargar ${expectedAdjustments} ajustes (1 por cada actualización). Recibidos: ${n.ajustes.length}.`,
        },
        { status: 400 }
      );
    }

    // Validación de entidades
    const property = await Property.findById(n.propertyId).lean<{ status?: string } | null>();
    if (!property) return NextResponse.json({ ok: false, message: "propertyId not found" }, { status: 400 });

    if (property.status === "RENTED") {
      return NextResponse.json({ ok: false, message: "Propiedad alquilada" }, { status: 400 });
    }

    const owner = await Person.findById(n.ownerId).lean<{ type?: string } | null>();
    if (!owner) return NextResponse.json({ ok: false, message: "ownerId not found" }, { status: 400 });
    if (owner.type !== "OWNER") return NextResponse.json({ ok: false, message: "ownerId must be OWNER" }, { status: 400 });

    const tenant = await Person.findById(n.tenantPersonId).lean<{ type?: string } | null>();
    if (!tenant) return NextResponse.json({ ok: false, message: "tenantPersonId not found" }, { status: 400 });
    if (tenant.type !== "TENANT") return NextResponse.json({ ok: false, message: "tenantPersonId must be TENANT" }, { status: 400 });

    // Código
    const code = n.code ? n.code : await nextContractCode();

    // endDate derivado (duración manda)
    const endDate = addMonthsSafe(startDate, n.duracionMeses);

    const montoBaseRounded = Math.round(n.montoBase);

    // ✅ IMPORTANTE: guardamos con los CAMPOS DEL SCHEMA VIEJO
    const contract = await Contract.create({
      tenantId: TENANT_ID,
      code,
      propertyId: new Types.ObjectId(n.propertyId),
      ownerId: new Types.ObjectId(n.ownerId),
      tenantPersonId: new Types.ObjectId(n.tenantPersonId),

      startDate,
      endDate,

      // legacy fields
      duracion: n.duracionMeses,
      valorCuota: montoBaseRounded,
      diaVencimiento: n.dueDay,

      actualizacionCada: n.actualizacionCadaMeses,
      porcentajeActualizacion: n.pctLegacy,

      status: "ACTIVE",

      billing: {
        dueDay: n.dueDay,
        baseRent: montoBaseRounded,
        currency: n.currency,
        lateFeePolicy: { type: "NONE", value: 0 },
        notes: "",
        actualizacionCada: n.actualizacionCadaMeses,
        porcentajeActualizacion: n.pctLegacy,
        // si tu schema ya incluye ajustes/actualizacionCadaMeses, no molesta; si no, mongoose los ignora (strict)
        actualizacionCadaMeses: n.actualizacionCadaMeses,
        ajustes: n.ajustes,
      },

      documents: [],
    });

    // Bloquear propiedad + asignar inquilino actual
    await Property.findByIdAndUpdate(n.propertyId, {
      status: "RENTED",
      inquilinoId: n.tenantPersonId,
    });

    // ✅ Generar Installments (N meses)
    const installmentsToInsert: Array<{
      tenantId: string;
      contractId: Types.ObjectId;
      period: string;
      dueDate: Date;
      amount: number;
      lateFeeAccrued: number;
      status: "PENDING";
      paidAmount: number;
      paidAt: null;
      lastReminderAt: null;
    }> = [];

    let currentAmount = montoBaseRounded;
    let adjIndex = 0;

    for (let month = 1; month <= n.duracionMeses; month += 1) {
      if (n.actualizacionCadaMeses > 0 && month !== 1) {
        const isAdjustmentMonth = (month - 1) % n.actualizacionCadaMeses === 0;
        if (isAdjustmentMonth) {
          const adj = n.ajustes[adjIndex];
          const pct = adj ? Number(adj.percentage) : 0;
          currentAmount = Math.round(currentAmount * (1 + pct / 100));
          adjIndex += 1;
        }
      }

      const monthOffset = month - 1;
      const monthDate = addMonthsSafe(startDate, monthOffset);
      const period = formatPeriodYYYYMM(monthDate);
      const dueDateComputed = buildDueDateForMonth(startDate, monthOffset, n.dueDay);

      installmentsToInsert.push({
        tenantId: TENANT_ID,
        contractId: contract._id,
        period,
        dueDate: dueDateComputed,
        amount: currentAmount,
        lateFeeAccrued: 0,
        status: "PENDING",
        paidAmount: 0,
        paidAt: null,
        lastReminderAt: null,
      });
    }

    await Installment.insertMany(installmentsToInsert, { ordered: true });

    return NextResponse.json({
      ok: true,
      contractId: contract._id,
      code: contract.code,
      installmentsCreated: installmentsToInsert.length,
    });
  } catch (err: unknown) {
    return NextResponse.json({ ok: false, message: "Failed to create contract", error: getErrorMessage(err) }, { status: 500 });
  }
}
