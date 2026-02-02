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

type ContractCreateDTO = {
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

  // legacy (por compat)
  duracion?: number;
  valorCuota?: number;
  diaVencimiento?: number;
  actualizacionCada?: number;
  porcentajeActualizacion?: number;

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

function toNumberSafe(v: unknown): number {
  const n = typeof v === "number" ? v : Number(String(v ?? "").trim());
  return Number.isFinite(n) ? n : NaN;
}

// Si no mandan ajustes pero mandan porcentajeActualizacion, generamos la lista por compat
function buildAjustesCompat(duracionMeses: number, actualizacionCadaMeses: number, porcentajeActualizacion: number): BillingAdjustmentInput[] {
  const expected = requiredAdjustmentsCount(duracionMeses, actualizacionCadaMeses);
  if (expected <= 0) return [];
  const pct = Number.isFinite(porcentajeActualizacion) ? porcentajeActualizacion : 0;
  return Array.from({ length: expected }, (_v, i) => ({ n: i + 1, percentage: pct }));
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

    const raw = (await req.json()) as Partial<ContractCreateDTO>;

    // ✅ required base fields
    if (!raw.propertyId || !raw.ownerId || !raw.tenantPersonId || !raw.startDate) {
      return NextResponse.json(
        { ok: false, message: "Missing required fields: propertyId, ownerId, tenantPersonId, startDate" },
        { status: 400 }
      );
    }

    // ✅ compat: aceptamos nuevos y viejos nombres
    const duracionMeses = toNumberSafe(raw.duracionMeses ?? raw.duracion);
    const montoBase = toNumberSafe(raw.montoBase ?? raw.valorCuota ?? (raw as unknown as { billing?: { baseRent?: unknown } })?.billing?.baseRent);
    const dueDay = toNumberSafe(raw.dueDay ?? raw.diaVencimiento ?? (raw as unknown as { billing?: { dueDay?: unknown } })?.billing?.dueDay);

    if (!duracionMeses || Number.isNaN(duracionMeses) || duracionMeses < 1) {
      return NextResponse.json({ ok: false, message: "duracionMeses must be >= 1" }, { status: 400 });
    }
    if (Number.isNaN(montoBase) || montoBase < 0) {
      return NextResponse.json({ ok: false, message: "montoBase invalid" }, { status: 400 });
    }
    if (Number.isNaN(dueDay) || dueDay < 1 || dueDay > 28) {
      return NextResponse.json({ ok: false, message: "dueDay must be 1..28" }, { status: 400 });
    }

    const startDate = new Date(String(raw.startDate));
    if (Number.isNaN(startDate.getTime())) {
      return NextResponse.json({ ok: false, message: "startDate invalid" }, { status: 400 });
    }

    const actualizacionCadaMeses = toNumberSafe(raw.actualizacionCadaMeses ?? raw.actualizacionCada ?? 0);
    if (Number.isNaN(actualizacionCadaMeses) || actualizacionCadaMeses < 0) {
      return NextResponse.json({ ok: false, message: "actualizacionCadaMeses invalid" }, { status: 400 });
    }

    const currency = (raw.currency ? String(raw.currency).trim() : "ARS") || "ARS";

    // Ajustes manuales (nuevo) o compat (viejo)
    let ajustes: BillingAdjustmentInput[] = Array.isArray(raw.ajustes) ? raw.ajustes : [];
    if (!ajustes.length) {
      const pctCompat = toNumberSafe(raw.porcentajeActualizacion ?? 0);
      if (actualizacionCadaMeses > 0 && Number.isFinite(pctCompat) && pctCompat > 0) {
        ajustes = buildAjustesCompat(duracionMeses, actualizacionCadaMeses, pctCompat);
      }
    }

    // validar formato ajustes
    for (const a of ajustes) {
      const n = toNumberSafe(a.n);
      const p = toNumberSafe(a.percentage);
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
    const property = await Property.findById(raw.propertyId).lean<{ status?: string } | null>();
    if (!property) return NextResponse.json({ ok: false, message: "propertyId not found" }, { status: 400 });

    if (property.status === "RENTED") {
      return NextResponse.json({ ok: false, message: "Propiedad alquilada" }, { status: 400 });
    }

    const owner = await Person.findById(raw.ownerId).lean<{ type?: string } | null>();
    if (!owner) return NextResponse.json({ ok: false, message: "ownerId not found" }, { status: 400 });
    if (owner.type !== "OWNER") return NextResponse.json({ ok: false, message: "ownerId must be OWNER" }, { status: 400 });

    const tenant = await Person.findById(raw.tenantPersonId).lean<{ type?: string } | null>();
    if (!tenant) return NextResponse.json({ ok: false, message: "tenantPersonId not found" }, { status: 400 });
    if (tenant.type !== "TENANT") return NextResponse.json({ ok: false, message: "tenantPersonId must be TENANT" }, { status: 400 });

    // Código
    const code = raw.code && String(raw.code).trim() ? String(raw.code).trim() : await nextContractCode();

    // endDate derivado (duracion manda)
    const endDate = addMonthsSafe(startDate, duracionMeses);

    const montoBaseInt = Math.round(montoBase);
    const dueDayInt = Math.round(dueDay);

    // ✅ Crear contrato (doble compat: root + billing)
    const contract = await Contract.create({
      tenantId: TENANT_ID,
      code,
      propertyId: new Types.ObjectId(raw.propertyId),
      ownerId: new Types.ObjectId(raw.ownerId),
      tenantPersonId: new Types.ObjectId(raw.tenantPersonId),
      startDate,
      endDate,

      // ✅ nuevos
      duracionMeses,
      montoBase: montoBaseInt,

      // ✅ legacy por si tu schema viejo lo usa
      duracion: duracionMeses,
      valorCuota: montoBaseInt,
      diaVencimiento: dueDayInt,
      actualizacionCada: actualizacionCadaMeses,

      status: "ACTIVE",
      billing: {
        // ✅ compat con muchos schemas
        dueDay: dueDayInt,
        baseRent: montoBaseInt,

        currency,
        actualizacionCadaMeses,
        ajustes,
        lateFeePolicy: { type: "NONE", value: 0 },
        notes: "",
      },
      documents: [],
    });

    // Bloquear propiedad + asignar inquilino actual
    await Property.findByIdAndUpdate(raw.propertyId, {
      status: "RENTED",
      inquilinoId: raw.tenantPersonId,
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

    let currentAmount = montoBaseInt;
    let adjIndex = 0;

    for (let month = 1; month <= duracionMeses; month += 1) {
      if (actualizacionCadaMeses > 0 && month !== 1) {
        const isAdjustmentMonth = (month - 1) % actualizacionCadaMeses === 0;
        if (isAdjustmentMonth) {
          const adj = ajustes[adjIndex];
          const pct = adj ? toNumberSafe(adj.percentage) : 0;
          const pctSafe = Number.isFinite(pct) ? pct : 0;

          currentAmount = Math.round(currentAmount * (1 + pctSafe / 100));
          adjIndex += 1;
        }
      }

      const monthOffset = month - 1;
      const monthDate = addMonthsSafe(startDate, monthOffset);
      const period = formatPeriodYYYYMM(monthDate);
      const dueDateComputed = buildDueDateForMonth(startDate, monthOffset, dueDayInt);

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
    return NextResponse.json(
      { ok: false, message: "Failed to create contract", error: getErrorMessage(err) },
      { status: 500 }
    );
  }
}
