export function parseISODateLocal(iso: string): Date {
  // iso esperado: "YYYY-MM-DD"
  const [y, m, d] = iso.split("-").map((n) => Number(n));
  return new Date(y, (m || 1) - 1, d || 1); // LOCAL (sin UTC shift)
}

export function formatISODateLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
