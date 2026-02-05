export type ScheduleItem = {
  period: string; // "2026-01"
  dueDate: string; // "2026-01-08"
  amount: number;
  status: "PENDING" | "PAID";
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function parseISODateOnly(iso: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? "").trim());
  if (!m) throw new Error(`Fecha inválida (YYYY-MM-DD): ${iso}`);
  return { y: Number(m[1]), mo: Number(m[2]), d: Number(m[3]) }; // mo 1..12
}

function buildYM(y: number, mo: number) {
  return `${y}-${pad2(mo)}`;
}

function clampDueDay(day: number) {
  // En alquileres es 1..28 para evitar meses cortos
  if (!Number.isFinite(day)) return 10;
  return Math.min(28, Math.max(1, Math.floor(day)));
}

function addMonthsYM(y: number, mo: number, add: number) {
  const idx = (y * 12 + (mo - 1)) + add;
  const ny = Math.floor(idx / 12);
  const nmo = (idx % 12) + 1;
  return { y: ny, mo: nmo };
}

function roundMoney(n: number) {
  return Math.round(n);
}

/**
 * ✅ Genera cronograma empezando SIEMPRE desde startDate del contrato.
 * ✅ Sin Date/UTC => cero corrimientos por timezone.
 * ✅ period = "YYYY-MM"
 * ✅ dueDate = "YYYY-MM-DD" (día fijo 1..28)
 */
export function generateSchedule(params: {
  startDateISO: string; // "2026-01-01"
  months: number; // duración total
  baseAmount: number;
  updateEveryMonths: number; // 0 = sin actualización
  updatePercent: number; // ej: 8.78
  dueDay: number; // 1..28
}) {
  const { startDateISO, months, baseAmount, updateEveryMonths, updatePercent } = params;

  const { y: sy, mo: smo } = parseISODateOnly(startDateISO);
  const totalMonths = Math.max(0, Math.floor(Number(months)));
  const dueDay = clampDueDay(params.dueDay);

  const schedule: ScheduleItem[] = [];
  let currentAmount = roundMoney(Number(baseAmount) || 0);

  for (let i = 0; i < totalMonths; i++) {
    // Período = start + i meses (en términos calendario)
    const { y, mo } = addMonthsYM(sy, smo, i);

    // Ajuste cada X meses
    if (updateEveryMonths > 0 && i > 0 && i % updateEveryMonths === 0) {
      const pct = Number(updatePercent) || 0;
      currentAmount = roundMoney(currentAmount * (1 + pct / 100));
    }

    const period = buildYM(y, mo);
    const dueDate = `${period}-${pad2(dueDay)}`;

    schedule.push({
      period,
      dueDate,
      amount: currentAmount,
      status: "PENDING",
    });
  }

  return schedule;
}

