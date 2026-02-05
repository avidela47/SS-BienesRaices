import { IndexValue, type IndexKey } from "@/models/IndexValue";
import { connectDB } from "@/lib/db/connectDB";
import { toISODate } from "@/lib/indices/date";

const BCRA_BASE = "https://api.bcra.gob.ar/estadisticas/v4.0/Monetarias";

/**
 * Fallback base si no hay datos reales cacheados todavía.
 * 1.0009 = 0.09% diario
 * Podés overridearlo por ENV.
 */
const BASE_FALLBACK_FACTOR =
  Number(process.env.INDEX_DAILY_FALLBACK_FACTOR) || 1.0009;

const BCRA_INDEX_MAP: Record<IndexKey, RegExp | null> = {
  ICL: /Índice para Contratos de Locación|ICL/i,
  CER: /Coeficiente de Estabilización de Referencia|CER/i,
  UVA: /Unidad de Valor Adquisitivo|UVA/i,

  IPC: null,
  CASA_PROPIA: null,
  CAC: null,
  IS: null,
  IPIM: null,
};

type BcraVariable = { idVariable: number; descripcion: string };
type BcraRow = { fecha: string; valor: number };

function daysBetweenISO(aISO: string, bISO: string) {
  const a = new Date(aISO + "T00:00:00Z").getTime();
  const b = new Date(bISO + "T00:00:00Z").getTime();
  return Math.max(0, Math.floor((b - a) / (1000 * 60 * 60 * 24)));
}

async function bcraFindVariableId(indexKey: IndexKey): Promise<number> {
  const rx = BCRA_INDEX_MAP[indexKey];
  if (!rx) throw new Error(`Index ${indexKey} not provided by BCRA`);

  const res = await fetch(BCRA_BASE, { cache: "no-store" });
  if (!res.ok) throw new Error(`BCRA list failed: ${res.status}`);

  const data = (await res.json()) as BcraVariable[];
  const found = data.find((x) => rx.test(x.descripcion));
  if (!found?.idVariable) throw new Error(`BCRA variable not found for ${indexKey}`);

  return found.idVariable;
}

export async function bcraSyncRange(indexKey: IndexKey, fromISO: string, toISO: string) {
  await connectDB();

  const id = await bcraFindVariableId(indexKey);
  const url = `${BCRA_BASE}/${id}?desde=${encodeURIComponent(fromISO)}&hasta=${encodeURIComponent(toISO)}`;

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`BCRA values failed: ${res.status}`);

  const data = (await res.json()) as BcraRow[];

  for (const row of data) {
    if (!row?.fecha || typeof row.valor !== "number") continue;

    await IndexValue.updateOne(
      { indexKey, date: row.fecha },
      { $set: { value: row.valor, source: "BCRA" } },
      { upsert: true }
    );
  }
}

async function findNearestCached(indexKey: IndexKey, dateISO: string) {
  await connectDB();
  return IndexValue.findOne({ indexKey, date: { $lte: dateISO } })
    .sort({ date: -1 })
    .lean();
}

/**
 * ✅ Fallback dinámico:
 * Calcula el factor diario desde los últimos 2 valores reales BCRA cacheados.
 *
 * Si hay 2 puntos reales (prev -> last), estima:
 *   monthlyGrowth = last/prev
 *   dailyFactor ~ monthlyGrowth^(1/daysBetween)
 *
 * Si no hay suficientes datos, usa BASE_FALLBACK_FACTOR.
 */
async function computeDynamicDailyFactor(indexKey: IndexKey): Promise<number> {
  await connectDB();

  const lastTwo = await IndexValue.find({ indexKey, source: "BCRA" })
    .sort({ date: -1 })
    .limit(2)
    .lean();

  if (lastTwo.length < 2) return BASE_FALLBACK_FACTOR;

  const last = lastTwo[0];
  const prev = lastTwo[1];

  if (!last?.date || !prev?.date) return BASE_FALLBACK_FACTOR;
  if (typeof last.value !== "number" || typeof prev.value !== "number") return BASE_FALLBACK_FACTOR;
  if (!(last.value > 0) || !(prev.value > 0)) return BASE_FALLBACK_FACTOR;

  const d = daysBetweenISO(prev.date, last.date);
  if (d <= 0) return BASE_FALLBACK_FACTOR;

  const growth = last.value / prev.value;

  // factor diario basado en el tramo real
  const daily = Math.pow(growth, 1 / d);

  // clamp defensivo (evita locuras si viene algo raro)
  if (!Number.isFinite(daily) || daily <= 0.999 || daily >= 1.01) {
    return BASE_FALLBACK_FACTOR;
  }

  return daily;
}

export async function bcraGetValue(indexKey: IndexKey, dateISO: string): Promise<number> {
  await connectDB();

  // 1) exact cache
  const cached = await IndexValue.findOne({ indexKey, date: dateISO }).lean();
  if (cached?.value && typeof cached.value === "number") return cached.value;

  // 2) intentar traer rango alrededor de la fecha
  try {
    const d = new Date(dateISO + "T00:00:00Z");
    const from = new Date(d);
    from.setUTCDate(from.getUTCDate() - 14);

    await bcraSyncRange(indexKey, toISODate(from), dateISO);

    const cached2 = await IndexValue.findOne({ indexKey, date: dateISO }).lean();
    if (cached2?.value && typeof cached2.value === "number") return cached2.value;
  } catch {
    // 3) si BCRA falla: proyectar desde el último valor cacheado (si existe)
    const nearest = await findNearestCached(indexKey, dateISO);
    if (!nearest?.value || typeof nearest.value !== "number" || nearest.value <= 0) {
      // si no hay base, dejamos error explícito (tu warmup/seed lo evita)
      throw new Error(`BCRA fetch failed and no cached base for ${indexKey} @ ${dateISO}`);
    }

    const days = daysBetweenISO(nearest.date, dateISO);
    const factor = await computeDynamicDailyFactor(indexKey);
    return nearest.value * Math.pow(factor, days);
  }

  // 4) si no vino exacto, usar nearest (huecos)
  const nearest = await findNearestCached(indexKey, dateISO);
  if (nearest?.value && typeof nearest.value === "number" && nearest.value > 0) return nearest.value;

  throw new Error(`No BCRA value for ${indexKey} at ${dateISO}`);
}
