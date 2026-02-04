"use client";

import Link from "next/link";

export default function MonthlyRentsPage() {
  return (
    <main className="min-h-screen px-5 py-8 text-white" style={{ background: "var(--background)" }}>
      <div className="mx-auto max-w-4xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Alquiler mensual (deprecado)</h1>
            <p className="text-sm opacity-70">Este módulo fue reemplazado por Cuotas reales.</p>
          </div>

          <Link
            href="/installments"
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm hover:bg-white/10 transition"
          >
            Ir a Cuotas
          </Link>
        </div>

        <div
          className="mt-6 rounded-2xl border p-5"
          style={{ borderColor: "rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.02)" }}
        >
          <p className="text-sm opacity-80">
            Para ver y gestionar los alquileres mensuales, usá el módulo <b>Cuotas</b>. Ahí están las cuotas reales
            generadas por contrato, con pagos y estados actualizados.
          </p>
        </div>
      </div>
    </main>
  );
}
