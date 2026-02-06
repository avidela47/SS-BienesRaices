export function isDateOnly(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

/**
 * Convierte cualquier fecha (ISO o Date) al formato que espera <input type="date">: "YYYY-MM-DD"
 * IMPORTANTÍSIMO: usa UTC para no correrse en -03.
 */
export function toDateInputValue(value: unknown): string {
  if (!value) return "";
  if (isDateOnly(value)) return value;

  if (value instanceof Date) {
    if (isNaN(value.getTime())) return "";
    const y = value.getUTCFullYear();
    const m = pad2(value.getUTCMonth() + 1);
    const d = pad2(value.getUTCDate());
    return `${y}-${m}-${d}`;
  }

  if (typeof value === "string") {
    const d = new Date(value);
    if (isNaN(d.getTime())) return "";
    const y = d.getUTCFullYear();
    const m = pad2(d.getUTCMonth() + 1);
    const day = pad2(d.getUTCDate());
    return `${y}-${m}-${day}`;
  }

  return "";
}

/**
 * Lo que se guarda en el estado del form y lo que se manda al backend:
 * siempre "YYYY-MM-DD" (o "" si vacío).
 */
export function fromDateInputValue(value: unknown): string {
  if (typeof value !== "string") return "";
  const v = value.trim();
  if (!v) return "";
  if (!isDateOnly(v)) return ""; // evita mandar basura
  return v;
}

