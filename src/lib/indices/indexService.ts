import type { IndexKey } from "@/models/IndexValue";
import { datosGobArGetMonthly } from "@/lib/indices/providers/datosGobAr";
import { bcraGetValue } from "@/lib/indices/providers/bcra";
import { manualGetMonthly } from "@/lib/indices/providers/manual";
import { IndexValue } from "@/models/IndexValue";
import { connectDB } from "@/lib/db/connectDB";

export type IndexResult = {
  value: number;
  projected: boolean;
  date: string;
  source: "DATOS_GOB_AR" | "BCRA" | "MANUAL" | "PROJECTED";
  projectedFrom?: string;
  monthsProjected?: number;
  daysProjected?: number;
  avgMonthlyFactor?: number;
  avgDailyFactor?: number;
  note?: string;
};

function addDaysISO(dateISO: string, days: number) {
  const d = new Date(dateISO + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function addMonthsISO(dateISO: string, months: number) {
  const d = new Date(dateISO + "T00:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

function monthDiff(aISO: string, bISO: string) {
  const ay = Number(aISO.slice(0, 4));
  const am = Number(aISO.slice(5, 7));
  const by = Number(bISO.slice(0, 4));
  const bm = Number(bISO.slice(5, 7));
  return (by - ay) * 12 + (bm - am);
}

function dayDiff(aISO: string, bISO: string) {
  const a = new Date(aISO + "T00:00:00Z").getTime();
  const b = new Date(bISO + "T00:00:00Z").getTime();
  return Math.round((b - a) / (24 * 60 * 60 * 1000));
}

function monthStartISO(dateISO: string) {
  return dateISO.slice(0, 7) + "-01";
}

type OfficialValue = { value: number; source: "DATOS_GOB_AR" | "BCRA" | "MANUAL" };

async function getOfficialValue(key: IndexKey, dateISO: string): Promise<OfficialValue | null> {
  // BCRA diario (ICL/CER/UVA)
  if (key === "ICL" || key === "CER" || key === "UVA") {
    try {
      const v = await bcraGetValue(key, dateISO);
      if (Number.isFinite(v) && v > 0) return { value: v, source: "BCRA" };
      return null;
    } catch {
      return null; // <- clave: NO romper acá
    }
  }

  // datos.gob.ar mensual
  if (key === "IPC" || key === "IS" || key === "IPIM") {
    const v = await datosGobArGetMonthly(key, dateISO);
    if (typeof v === "number" && Number.isFinite(v) && v > 0) return { value: v, source: "DATOS_GOB_AR" };
    return null;
  }

  // manual mensual
  if (key === "CAC" || key === "CASA_PROPIA") {
    const v = await manualGetMonthly(key, dateISO);
    if (typeof v === "number" && Number.isFinite(v) && v > 0) return { value: v, source: "MANUAL" };
    return null;
  }

  return null;
}

async function findNearestCached(indexKey: IndexKey, dateISO: string): Promise<{ date: string; value: number } | null> {
  await connectDB();
  const row = await IndexValue.findOne({ indexKey, date: { $lte: dateISO } })
    .sort({ date: -1 })
    .lean();

  if (!row?.date || typeof row.value !== "number" || !Number.isFinite(row.value) || row.value <= 0) return null;
  return { date: row.date, value: row.value };
}

/**
 * Mensual (tipo Arquiler): repite el ÚLTIMO mes real
 */
async function projectMonthlyArquiler(key: IndexKey, targetDateISO: string): Promise<IndexResult> {
  const targetMonth = monthStartISO(targetDateISO);
  const history: { date: string; value: number }[] = [];

  let cursor = addMonthsISO(targetMonth, -1);

  for (let i = 0; i < 24 && history.length < 2; i++) {
    const v = await getOfficialValue(key, cursor);
    if (v?.value) history.push({ date: monthStartISO(cursor), value: v.value });
    cursor = addMonthsISO(cursor, -1);
  }

  // si no hay oficiales, intentamos cache manual/mongo (por si guardaste valores)
  if (history.length < 2) {
    const a = await findNearestCached(key, addMonthsISO(targetMonth, -1));
    const b = await findNearestCached(key, addMonthsISO(targetMonth, -2));
    if (a && b) {
      history.push({ date: monthStartISO(b.date), value: b.value });
      history.push({ date: monthStartISO(a.date), value: a.value });
    }
  }

  if (history.length < 2) {
    throw new Error(`No hay historial suficiente para proyectar ${key} (mensual).`);
  }

  history.sort((x, y) => (x.date < y.date ? -1 : 1));
  const prev = history[history.length - 2];
  const last = history[history.length - 1];

  const avgFactor = last.value / prev.value;
  const monthsForward = monthDiff(last.date, targetMonth);

  let projectedValue = last.value;
  for (let i = 0; i < monthsForward; i++) projectedValue *= avgFactor;

  return {
    value: projectedValue,
    projected: true,
    date: targetDateISO,
    source: "PROJECTED",
    projectedFrom: last.date,
    monthsProjected: monthsForward,
    avgMonthlyFactor: avgFactor,
    note: "Proyección mensual: repite último cambio publicado (estilo Arquiler).",
  };
}

/**
 * Diario: si no hay BCRA, proyecta con cache si existe.
 * Si no hay cache, usa un factor diario “sintético” para no romper el modal.
 *
 * Podés ajustar el factor con ENV:
 * INDEX_DAILY_FALLBACK_FACTOR=1.0009
 */
async function projectDailySafe(key: IndexKey, targetDateISO: string): Promise<IndexResult> {
  // 1) si tenemos cache cercano, usamos eso como base
  const base = await findNearestCached(key, addDaysISO(targetDateISO, -1));

  const fallbackFactor =
    Number(process.env.INDEX_DAILY_FALLBACK_FACTOR) ||
    1.0009; // ~0.09% diario (ajustable)

  if (!base) {
    // No hay cache -> inventamos una base neutral para que el sistema no se caiga
    // (esto solo pasa la primera vez, hasta que puedas precargar o el BCRA vuelva)
    const daysProjected = 1;
    return {
      value: 100 * fallbackFactor,
      projected: true,
      date: targetDateISO,
      source: "PROJECTED",
      projectedFrom: addDaysISO(targetDateISO, -daysProjected),
      daysProjected,
      avgDailyFactor: fallbackFactor,
      note: "BCRA no disponible y sin cache. Proyección sintética para no interrumpir el flujo.",
    };
  }

  const daysForward = dayDiff(base.date, targetDateISO);
  let projectedValue = base.value;
  for (let i = 0; i < Math.max(0, daysForward); i++) projectedValue *= fallbackFactor;

  return {
    value: projectedValue,
    projected: true,
    date: targetDateISO,
    source: "PROJECTED",
    projectedFrom: base.date,
    daysProjected: Math.max(0, daysForward),
    avgDailyFactor: fallbackFactor,
    note: "BCRA no disponible. Proyección diaria desde último valor cacheado.",
  };
}

export async function getIndexValue(key: IndexKey, dateISO: string): Promise<IndexResult> {
  const official = await getOfficialValue(key, dateISO);
  if (official) {
    return { value: official.value, projected: false, date: dateISO, source: official.source };
  }

  // diarios (BCRA) -> safe projection
  if (key === "ICL" || key === "CER" || key === "UVA") {
    return projectDailySafe(key, dateISO);
  }

  // mensuales -> arquiler projection
  if (key === "IPC" || key === "IS" || key === "IPIM" || key === "CAC" || key === "CASA_PROPIA") {
    return projectMonthlyArquiler(key, dateISO);
  }

  throw new Error(`Índice no soportado: ${key}`);
}
