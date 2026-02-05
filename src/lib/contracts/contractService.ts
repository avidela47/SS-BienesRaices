import { connectDB } from "@/lib/db/connectDB";
import Contract from "@/models/Contract";

const TENANT_ID = "default";

export type CreateContractInput = {
  code?: string;

  propertyId: string;
  ownerId: string;
  tenantPersonId: string;

  startDate: string; // YYYY-MM-DD
  endDate?: string;  // YYYY-MM-DD (opcional)

  duracionMeses: number;
  montoBase: number;
  dueDay: number;
  currency?: string;

  actualizacionCadaMeses?: number;
  ajustes?: { n: number; percentage: number }[];

  billing?: {
    notes?: string;
    commissionMonthlyPct?: number;
    commissionTotalPct?: number;
  };
};

function isoDateOnly(v: unknown): string {
  const s = String(v ?? "").trim();
  const d = s.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Error(`Fecha inválida: ${s}`);
  return d;
}

function addMonthsISO(startISO: string, months: number) {
  const d = new Date(startISO + "T00:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

function toInt(v: unknown, def = 0) {
  const n = Number(String(v ?? "").trim());
  return Number.isFinite(n) ? Math.floor(n) : def;
}

function toNum(v: unknown, def = 0) {
  const n = Number(String(v ?? "").trim());
  return Number.isFinite(n) ? n : def;
}

export async function createContract(input: CreateContractInput) {
  await connectDB();

  const startDate = isoDateOnly(input.startDate);

  const duracionMeses = toInt(input.duracionMeses, 0);
  if (duracionMeses < 1) throw new Error("duracionMeses debe ser >= 1");

  const endDate = input.endDate ? isoDateOnly(input.endDate) : addMonthsISO(startDate, duracionMeses);

  const montoBase = Math.round(toNum(input.montoBase, 0));
  const dueDay = toInt(input.dueDay, 10);
  if (dueDay < 1 || dueDay > 28) throw new Error("dueDay debe ser 1..28");

  const actualizacionCadaMeses = Math.max(0, toInt(input.actualizacionCadaMeses ?? 0, 0));

  const doc = await Contract.create({
    tenantId: TENANT_ID,
    code: input.code || `CID-${Math.floor(Math.random() * 900 + 100)}`,
    status: "ACTIVE",

    propertyId: input.propertyId,
    ownerId: input.ownerId,
    tenantPersonId: input.tenantPersonId,

    startDate,
    endDate,

    duracionMeses,
    montoBase,
    dueDay,
    currency: (input.currency || "ARS").trim() || "ARS",

    actualizacionCadaMeses,
    ajustes: Array.isArray(input.ajustes) ? input.ajustes : [],

    billing: {
      notes: input.billing?.notes ?? "",
      commissionMonthlyPct: toNum(input.billing?.commissionMonthlyPct ?? 0, 0),
      commissionTotalPct: toNum(input.billing?.commissionTotalPct ?? 0, 0),
    },
  });

  return doc;
}

export async function listContracts() {
  await connectDB();

  // ✅ CLAVE: populate para que el front reciba objetos y no ObjectIds
  const contracts = await Contract.find({ tenantId: TENANT_ID })
    .populate("propertyId")
    .populate("ownerId")
    .populate("tenantPersonId")
    .sort({ createdAt: -1 })
    .lean();

  return contracts;
}
