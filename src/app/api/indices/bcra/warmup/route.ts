import { NextResponse } from "next/server";
import { bcraSyncRange } from "@/lib/indices/providers/bcra";
import type { IndexKey } from "@/models/IndexValue";

function toISODate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function parseDays(url: URL) {
  const raw = url.searchParams.get("days");
  const n = raw ? Number(raw) : 120;
  if (!Number.isFinite(n) || n < 1) return 120;
  return Math.min(Math.floor(n), 3650); // max 10 años por seguridad
}

function parseKeys(url: URL): IndexKey[] {
  const raw = (url.searchParams.get("keys") || "").trim();
  const allowed: IndexKey[] = ["ICL", "CER", "UVA"];
  if (!raw) return allowed;

  const req = raw
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

  const keys = req.filter((k) => allowed.includes(k as IndexKey)) as IndexKey[];
  return keys.length ? keys : allowed;
}

/**
 * GET /api/indices/bcra/warmup?days=120&keys=ICL,CER,UVA
 * - days: cantidad de días hacia atrás a cachear (default 120)
 * - keys: lista separada por coma (default ICL,CER,UVA)
 */
export async function GET(req: Request) {
  const url = new URL(req.url);

  const days = parseDays(url);
  const keys = parseKeys(url);

  // Rango: desde (hoy - days) hasta hoy
  const to = new Date();
  const from = new Date();
  from.setUTCDate(from.getUTCDate() - days);

  const fromISO = toISODate(from);
  const toISO = toISODate(to);

  const results: Array<{ indexKey: IndexKey; ok: boolean; error?: string }> = [];

  for (const indexKey of keys) {
    try {
      await bcraSyncRange(indexKey, fromISO, toISO);
      results.push({ indexKey, ok: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ indexKey, ok: false, error: msg });
    }
  }

  const okCount = results.filter((r) => r.ok).length;

  return NextResponse.json({
    ok: okCount === results.length,
    range: { from: fromISO, to: toISO, days },
    keys,
    results,
    note:
      "Esto solo precarga cache en Mongo. Si BCRA no responde desde tu entorno, te va a quedar ok=false para ese índice.",
  });
}
