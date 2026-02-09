import { Types } from "mongoose";
import Contract from "@/models/Contract";
import { dbConnect } from "@/lib/mongoose";

const TENANT_ID = "default";

export type LateFeePolicy = { type: "NONE" | "FIXED" | "PERCENT"; value: number };

export type CreateContractInput = {
  code?: string;

  propertyId: string;
  ownerId: string;
  tenantPersonId: string;

  startDate: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD (opcional)

  duracionMeses: number;

  montoBase: number;
  dueDay: number;
  currency?: string;

  actualizacionCadaMeses?: number;
  porcentajeActualizacion?: number;
  lateFeePolicy?: LateFeePolicy;

  ajustes?: { n: number; percentage: number }[];

  billing?: {
    baseRent?: number;
    currency?: string;
    dueDay?: number;

    actualizacionCadaMeses?: number;
    porcentajeActualizacion?: number;

    lateFeePolicy?: LateFeePolicy;

    notes?: string;
    commissionMonthlyPct?: number;
    commissionTotalPct?: number;

    recalcFrom?: string; // (solo para PUT)
  };
};

function isoDateOnly(v: unknown): string {
  const s = String(v ?? "").trim();
  const d = s.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Error(`Fecha inválida: ${s}`);
  return d;
}

// LOCAL (sin UTC) para evitar 2026-01-01 => 2025-12-31
function addMonthsDateOnly(startISO: string, months: number): string {
  const [y, m, d] = startISO.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setMonth(date.getMonth() + months);

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(
    2,
    "0"
  )}`;
}

function toInt(v: unknown, def = 0) {
  const n = Number(String(v ?? "").trim());
  return Number.isFinite(n) ? Math.floor(n) : def;
}

function toNum(v: unknown, def = 0) {
  const n = Number(String(v ?? "").trim());
  return Number.isFinite(n) ? n : def;
}

function mustObjectId(id: string, field: string) {
  const s = String(id ?? "").trim();
  if (!Types.ObjectId.isValid(s)) throw new Error(`${field} inválido`);
  return new Types.ObjectId(s);
}

function normalizeLateFeePolicy(v: unknown): LateFeePolicy {
  if (!v || typeof v !== "object") return { type: "NONE", value: 0 };
  const o = v as Record<string, unknown>;
  const t = o.type;
  const type: LateFeePolicy["type"] = t === "FIXED" || t === "PERCENT" || t === "NONE" ? t : "NONE";
  const value = toNum(o.value ?? 0, 0);
  return { type, value };
}

export async function createContract(input: CreateContractInput) {
  await dbConnect();

  const startDate = isoDateOnly(input.startDate);

  const duracionMeses = toInt(input.duracionMeses, 0);
  if (duracionMeses < 1) throw new Error("duracionMeses debe ser >= 1");

  const endDate = input.endDate ? isoDateOnly(input.endDate) : addMonthsDateOnly(startDate, duracionMeses);

  const montoBase = Math.round(toNum(input.montoBase, 0));
  const dueDay = toInt(input.dueDay, 10);
  if (dueDay < 1 || dueDay > 28) throw new Error("dueDay debe ser 1..28");

  const currency = (input.currency || "ARS").trim() || "ARS";

  const actualizacionCadaMeses = Math.max(0, toInt(input.actualizacionCadaMeses ?? input.billing?.actualizacionCadaMeses ?? 0, 0));
  const porcentajeActualizacion = toNum(input.porcentajeActualizacion ?? input.billing?.porcentajeActualizacion ?? 0, 0);

  const lateFeePolicy = normalizeLateFeePolicy(input.lateFeePolicy ?? input.billing?.lateFeePolicy);

  const billingBaseRent = Math.round(toNum(input.billing?.baseRent ?? montoBase, montoBase));
  const billingCurrency = (input.billing?.currency || currency).trim() || currency;
  const billingDueDay = toInt(input.billing?.dueDay ?? dueDay, dueDay);

  const doc = await Contract.create({
    tenantId: TENANT_ID,
    code: (input.code?.trim() || "") ? input.code!.trim() : `CT-${Math.floor(Math.random() * 900 + 100)}`,
    status: "ACTIVE",

    propertyId: mustObjectId(input.propertyId, "propertyId"),
    ownerId: mustObjectId(input.ownerId, "ownerId"),
    tenantPersonId: mustObjectId(input.tenantPersonId, "tenantPersonId"),

    startDate,
    endDate,

    duracionMeses,
    montoBase,
    dueDay,
    currency,

    actualizacionCadaMeses,
    porcentajeActualizacion,
    lateFeePolicy,

    ajustes: Array.isArray(input.ajustes) ? input.ajustes : [],

    billing: {
      baseRent: billingBaseRent,
      currency: billingCurrency,
      dueDay: billingDueDay,

      actualizacionCadaMeses,
      porcentajeActualizacion,

      lateFeePolicy,

      notes: input.billing?.notes ?? "",
      commissionMonthlyPct: toNum(input.billing?.commissionMonthlyPct ?? 0, 0),
      commissionTotalPct: toNum(input.billing?.commissionTotalPct ?? 0, 0),

      // recalcFrom NO en create (solo update)
    },
  });

  return doc;
}

export async function listContracts() {
  await dbConnect();

  const contracts = await Contract.find({ tenantId: TENANT_ID })
    .populate("propertyId")
    .populate("ownerId")
    .populate("tenantPersonId")
    .sort({ createdAt: -1 })
    .lean();

  return contracts;
}

