export type ScheduleItem = {
  period: string; // "2026-01"
  dueDate: string; // "2026-01-08"
  amount: number;
  status: "PENDING" | "PAID";
};

function addMonthsUTC(date: Date, n: number) {
  const d = new Date(date);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d;
}

function toISO(d: Date) {
  return d.toISOString().slice(0, 10);
}

function ym(d: Date) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * ✅ Genera cronograma empezando SIEMPRE desde startDate del contrato.
 * Nunca crea meses anteriores al inicio.
 */
export function generateSchedule(params: {
  startDateISO: string; // "2026-01-01"
  months: number; // duración total
  baseAmount: number;
  updateEveryMonths: number; // 0 = sin actualización
  updatePercent: number; // ej: 8.78
  dueDay: number; // 1..28
}) {
  const { startDateISO, months, baseAmount, updateEveryMonths, updatePercent, dueDay } = params;

  const start = new Date(startDateISO + "T00:00:00Z");
  const schedule: ScheduleItem[] = [];

  let currentAmount = Math.round(baseAmount);

  for (let i = 0; i < months; i++) {
    const periodDate = addMonthsUTC(start, i);

    // ✅ Nunca permitir períodos anteriores al inicio del contrato
    if (periodDate < start) continue;

    // ✅ Actualiza cada X meses (si updateEveryMonths > 0)
    if (updateEveryMonths > 0 && i > 0 && i % updateEveryMonths === 0) {
      currentAmount = Math.round(currentAmount * (1 + updatePercent / 100));
    }

    // Vencimiento: mismo mes del período, día dueDay
    const due = new Date(periodDate);
    due.setUTCDate(dueDay);

    schedule.push({
      period: ym(periodDate),
      dueDate: toISO(due),
      amount: currentAmount,
      status: "PENDING",
    });
  }

  return schedule;
}
