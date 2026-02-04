import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongoose";

import Contract from "@/models/Contract";
import Installment, { type InstallmentDoc } from "@/models/Installment";

const TENANT_ID = "default";

function addMonthsSafe(date: Date, months: number): Date {
  const d = new Date(date);
  const day = d.getDate();
  d.setMonth(d.getMonth() + months);
  if (d.getDate() < day) d.setDate(0);
  return d;
}

function lastDayOfMonth(year: number, monthIndex0: number): number {
  return new Date(year, monthIndex0 + 1, 0).getDate();
}

function formatPeriodYYYYMM(date: Date): string {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  return `${y}-${String(m).padStart(2, "0")}`;
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

function toNumberSafe(v: unknown): number {
  const n = typeof v === "number" ? v : Number(String(v ?? "").trim());
  return Number.isFinite(n) ? n : NaN;
}

function requiredAdjustmentsCount(duracionMeses: number, cadaMeses: number): number {
  if (cadaMeses <= 0) return 0;
  return Math.floor((duracionMeses - 1) / cadaMeses);
}

function buildAjustesCompat(duracionMeses: number, actualizacionCadaMeses: number, porcentajeActualizacion: number) {
  const expected = requiredAdjustmentsCount(duracionMeses, actualizacionCadaMeses);
  if (expected <= 0) return [] as Array<{ n: number; percentage: number }>;
  const pct = Number.isFinite(porcentajeActualizacion) ? porcentajeActualizacion : 0;
  return Array.from({ length: expected }, (_v, i) => ({ n: i + 1, percentage: pct }));
}

export async function GET() {
  try {
    await dbConnect();

    const contracts = await Contract.find({ tenantId: TENANT_ID }).lean();

    type LeanContract = {
      _id: unknown;
      startDate?: string | Date;
      duracionMeses?: number;
      duracion?: number;
      montoBase?: number;
      valorCuota?: number;
      billing?: {
        baseRent?: number;
        dueDay?: number;
        actualizacionCadaMeses?: number;
        ajustes?: Array<{ n: number; percentage: number }>;
      };
      diaVencimiento?: number;
      porcentajeActualizacion?: number;
    };

    const toFix = contracts.filter((c) => {
      const cc = c as LeanContract;
      if (!cc.startDate) return false;
      const sd = new Date(String(cc.startDate));
      // canonical noon in UTC for the same year/month/day
      const canonicalNoonUTC = Date.UTC(sd.getUTCFullYear(), sd.getUTCMonth(), sd.getUTCDate(), 12, 0, 0, 0);
      return sd.getTime() !== canonicalNoonUTC; // needs fixing when timestamps differ
    });

    const results: Array<{ contractId: string; fixed: boolean; message?: string }> = [];

    for (const c of toFix) {
      try {
        const cc = c as LeanContract;
  const original = new Date(String(cc.startDate));
  // set to canonical noon UTC for that date to avoid timezone-driven day shifts
  const sd = new Date(Date.UTC(original.getUTCFullYear(), original.getUTCMonth(), original.getUTCDate(), 12, 0, 0, 0));

        const dur = cc.duracionMeses ?? cc.duracion ?? 0;
        const endDate = new Date(addMonthsSafe(sd, Number(dur)).getTime() - 24 * 60 * 60 * 1000);

        // update contract dates
        await Contract.updateOne({ _id: c._id }, { $set: { startDate: sd, endDate } });

        // regenerate installments similarly to PUT logic
        const baseRent = cc.montoBase || cc.valorCuota || cc.billing?.baseRent || 0;
        const dueDay = cc.billing?.dueDay || cc.diaVencimiento || 1;
        const cada = cc.billing?.actualizacionCadaMeses ?? cc.diaVencimiento ?? 0;
        let ajustes: Array<{ n: number; percentage: number }> = Array.isArray(cc.billing?.ajustes) ? cc.billing!.ajustes! : [];
        if (!ajustes.length) {
          const pctCompat = toNumberSafe(cc.porcentajeActualizacion ?? 0);
          if (cada > 0 && Number.isFinite(pctCompat) && pctCompat > 0) ajustes = buildAjustesCompat(Number(dur), Number(cada), pctCompat);
        }

  const existing = await Installment.find({ tenantId: TENANT_ID, contractId: c._id }).lean();
        const paidPeriods = new Set(
          existing
            .filter((it) => it.status === "PAID" || (it.paidAmount && Number(it.paidAmount) > 0))
            .map((it) => String(it.period))
        );

        await Installment.deleteMany({ tenantId: TENANT_ID, contractId: c._id, status: { $ne: "PAID" } });

        type NewInstallment = {
          tenantId: string;
          contractId: unknown;
          period: string;
          dueDate: Date;
          amount: number;
          lateFeeAccrued: number;
          status: string;
          paidAmount: number;
          paidAt: null | string;
          lastReminderAt: null | string;
        };

        const toInsert: NewInstallment[] = [];
        let currentAmount = Number(baseRent);
        let adjIndex = 0;
        for (let month = 1; month <= Number(dur); month += 1) {
          if (cada > 0 && month !== 1) {
            const isAdjustmentMonth = (month - 1) % Number(cada) === 0;
            if (isAdjustmentMonth) {
              const adj = ajustes[adjIndex];
              const pct = adj ? toNumberSafe(adj.percentage) : 0;
              const pctSafe = Number.isFinite(pct) ? pct : 0;
              currentAmount = Math.round(currentAmount * (1 + pctSafe / 100));
              adjIndex += 1;
            }
          }

          const monthOffset = month - 1;
          const monthDate = addMonthsSafe(sd, monthOffset);
          const period = formatPeriodYYYYMM(monthDate);
          if (paidPeriods.has(period)) continue;
          const dueDateComputed = buildDueDateForMonth(sd, monthOffset, Number(dueDay));

          toInsert.push({
            tenantId: TENANT_ID,
            contractId: c._id,
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

        if (toInsert.length) {
          await Installment.insertMany(toInsert as InstallmentDoc[], { ordered: true });
        }

        results.push({ contractId: String(c._id), fixed: true, message: `Inserted ${toInsert.length} installments` });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        results.push({ contractId: String((c as LeanContract)._id), fixed: false, message: msg });
      }
    }

    return NextResponse.json({ ok: true, totalContracts: contracts.length, fixed: results.length, details: results });
  } catch (err: unknown) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
