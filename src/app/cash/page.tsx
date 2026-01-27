"use client";

import Link from "next/link";

export default function CashPage() {
  return (
    <main className="min-h-screen px-5 py-10 text-white" style={{ background: "var(--background)" }}>
      <div className="mx-auto max-w-5xl">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Caja</h1>
            <p className="text-sm mt-1" style={{ color: "var(--benetton-muted)" }}>
              Resumen de caja (en el futuro lo conectamos a pagos/egresos si querés)
            </p>
          </div>

          <Link
            href="/"
            className="rounded-xl border px-4 py-2 text-sm hover:opacity-90"
            style={{ borderColor: "var(--benetton-border)", background: "rgba(255,255,255,0.03)" }}
          >
            ← Volver
          </Link>
        </div>

        <div className="mt-6 rounded-2xl border p-6" style={{ borderColor: "var(--benetton-border)", background: "var(--benetton-card)" }}>
          <p style={{ color: "var(--benetton-muted)" }}>
            Si ya tenías “Caja” armada de otra forma, la reubicamos sin perder nada. Esta pantalla es placeholder para evitar 404.
          </p>
        </div>
      </div>
    </main>
  );
}
