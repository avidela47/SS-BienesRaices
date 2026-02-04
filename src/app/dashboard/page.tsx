"use client";

import BackButton from "@/app/components/BackButton";

export default function DashboardPage() {
  return (
    <main className="min-h-screen px-5 py-10 text-white" style={{ background: "var(--background)" }}>
      <div className="mx-auto max-w-5xl">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Panel de control</h1>
            <p className="text-sm mt-1" style={{ color: "var(--benetton-muted)" }}>
              Resumen general (en el próximo paso conectamos métricas reales)
            </p>
          </div>

          <BackButton />
        </div>

        <div className="mt-6 rounded-2xl border p-6" style={{ borderColor: "var(--benetton-border)", background: "var(--benetton-card)" }}>
          <p style={{ color: "var(--benetton-muted)" }}>
            Paso siguiente: agrego API <b>/api/dashboard/summary</b> y cards con conteos reales.
          </p>
        </div>
      </div>
    </main>
  );
}

