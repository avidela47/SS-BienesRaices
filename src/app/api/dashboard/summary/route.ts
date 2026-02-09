// ✅ Archivo: src/app/api/dashboard/summary/route.ts
import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongoose";
import Installment from "@/models/Installment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const TENANT_ID = "default";

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "unknown";
}

/**
 * Devuelve "YYYY-MM" tomando el huso horario de Argentina
 * para que el mes sea consistente aunque el server esté en UTC.
 */
function getCurrentPeriodAR(now = new Date()): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
  });

  const parts = fmt.formatToParts(now);
  const year = parts.find((p) => p.type === "year")?.value ?? String(now.getUTCFullYear());
  const month = parts.find((p) => p.type === "month")?.value ?? String(now.getUTCMonth() + 1).padStart(2, "0");

  return `${year}-${month}`;
}

type InstallmentLite = {
  amount?: unknown;
  paidAmount?: unknown;
  status?: unknown;
  period?: unknown;
};

function asNumber(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

export async function GET() {
  try {
    await dbConnect();

    const period = getCurrentPeriodAR();

    const installments = (await Installment.find({ tenantId: TENANT_ID, period })
      .select("amount paidAmount status period")
      .lean()) as InstallmentLite[];

    let total = 0;
    let cobrado = 0;

    for (const it of installments) {
      const amount = asNumber(it.amount);
      const paidAmount = asNumber(it.paidAmount);
      const status = asString(it.status);

      total += amount;

      // ✅ Cobrado: si está PAID usamos paidAmount (si viniera 0, caemos al amount)
      // ✅ Si está PENDING, contabilizamos paidAmount por si hay parciales (hoy suele ser 0)
      if (status === "PAID") {
        cobrado += paidAmount > 0 ? paidAmount : amount;
      } else {
        cobrado += paidAmount;
      }
    }

    const pendiente = Math.max(0, total - cobrado);
    const cantidad = installments.length;

    return NextResponse.json({
      ok: true,
      period,
      alquilerMensual: {
        total,
        cobrado,
        pendiente,
        cantidad,
      },
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { ok: false, error: `Failed to build dashboard summary: ${getErrorMessage(err)}` },
      { status: 500 }
    );
  }
}
