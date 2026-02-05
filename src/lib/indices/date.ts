export function toISODate(d: Date): string {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function parseISODate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) throw new Error(`Invalid date: ${dateStr}`);
  return new Date(Date.UTC(y, m - 1, d));
}

export function startOfMonthISO(dateStr: string): string {
  const [y, m] = dateStr.split("-").slice(0, 2);
  if (!y || !m) throw new Error(`Invalid date: ${dateStr}`);
  return `${y}-${m}-01`;
}
