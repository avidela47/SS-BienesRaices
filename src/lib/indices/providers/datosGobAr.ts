import type { IndexKey } from "@/models/IndexValue";

const SERIES_API = "https://apis.datos.gob.ar/series/api/series/";

type SeriesRow = [string, number | null];

type SeriesApiResponse = {
  data?: unknown;
  count?: number;
  meta?: unknown;
  params?: unknown;
};

function isTupleRow(v: unknown): v is SeriesRow {
  return (
    Array.isArray(v) &&
    v.length === 2 &&
    typeof v[0] === "string" &&
    (v[1] === null || typeof v[1] === "number")
  );
}

function parseRows(json: SeriesApiResponse): SeriesRow[] {
  const d = json.data;

  // Formato A: { data: [ ["YYYY-MM", v], ... ] }
  if (Array.isArray(d) && d.every(isTupleRow)) return d as SeriesRow[];

  // Formato B: { data: [ { data: [ ["YYYY-MM", v], ... ] } ] }
  if (Array.isArray(d) && d.length > 0) {
    const first = d[0];
    if (typeof first === "object" && first !== null) {
      const nested = (first as { data?: unknown }).data;
      if (Array.isArray(nested) && nested.every(isTupleRow)) return nested as SeriesRow[];
    }
  }

  return [];
}

async function fetchJson(url: string): Promise<SeriesApiResponse> {
  const res = await fetch(url, {
    cache: "no-store",
    headers: { Accept: "application/json" },
    redirect: "follow",
  });

  const contentType = res.headers.get("content-type") || "";
  const text = await res.text();

  if (!res.ok) {
    throw new Error(`datos.gob.ar status ${res.status}. Body: ${text.slice(0, 200)}`);
  }
  if (!contentType.includes("application/json")) {
    throw new Error(`datos.gob.ar no devolvió JSON (content-type=${contentType}). URL: ${res.url}`);
  }

  try {
    return JSON.parse(text) as SeriesApiResponse;
  } catch {
    throw new Error(`datos.gob.ar JSON inválido. Body: ${text.slice(0, 200)}`);
  }
}

function toMonthKey(dateISO: string) {
  // "2026-01-01" => "2026-01"
  return dateISO.slice(0, 7);
}

function yearOf(dateISO: string) {
  return dateISO.slice(0, 4);
}

/**
 * ⚠️ Necesitás setear tus IDs reales en .env:
 * SERIES_ID_IPC, SERIES_ID_IS, SERIES_ID_IPIM
 *
 * Si IPC te funciona con el default viejo, ok. Pero lo ideal es .env.
 */
const SERIES_IDS: Partial<Record<IndexKey, string>> = {
  IPC: process.env.SERIES_ID_IPC || "148.3_INIVELNAL_DICI_M_26",
  IS: process.env.SERIES_ID_IS,
  IPIM: process.env.SERIES_ID_IPIM,
};

export async function datosGobArGetMonthly(indexKey: IndexKey, dateISO: string): Promise<number | null> {
  if (indexKey !== "IPC" && indexKey !== "IS" && indexKey !== "IPIM") return null;

  const id = SERIES_IDS[indexKey];
  if (!id) return null;

  const y = yearOf(dateISO);

  // pedimos el año completo (evita vacíos por exact match)
  const url =
    `${SERIES_API}?ids=${encodeURIComponent(id)}` +
    `&start_date=${y}-01-01&end_date=${y}-12-31&format=json`;

  const json = await fetchJson(url);
  const rows = parseRows(json);
  if (!rows.length) return null;

  const target = toMonthKey(dateISO);
  const found = rows.find(([p]) => (p.length >= 7 ? p.slice(0, 7) : p) === target);
  const value = found?.[1];

  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;

  return null;
}
