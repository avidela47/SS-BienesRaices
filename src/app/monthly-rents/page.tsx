"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useToast } from "@/components/ToastProvider";

type MonthlyRentDTO = {
  _id: string;
  tenantId?: string;

  contractId: string;

  periodYear: number;
  periodMonth: number;

  dueDate: string; // ISO o date string
  amount: number;

  paidAmount: number;

  status: "PENDING" | "PARTIAL" | "PAID" | string;

  createdAt?: string;
  updatedAt?: string;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function pickArray<T>(obj: Record<string, unknown>, key: string): T[] | null {
  const val = obj[key];
  return Array.isArray(val) ? (val as T[]) : null;
}

function extractArray<T>(data: unknown): T[] {
  if (!isRecord(data)) return [];

  const a = pickArray<T>(data, "rents");
  if (a) return a;

  const b = pickArray<T>(data, "items");
  if (b) return b;

  const c = pickArray<T>(data, "rows");
  if (c) return c;

  const d = pickArray<T>(data, "data");
  if (d) return d;

  return [];
}

function formatPeriod(year: number, month: number) {
  const mm = String(month).padStart(2, "0");
  return `${mm}/${year}`;
}

function formatMoney(n: number) {
  return `$ ${Number(n || 0).toLocaleString("es-AR")}`;
}

function formatDate(d: string) {
  if (!d) return "—";
  // Si viene ISO, tomamos la parte yyyy-mm-dd para que sea consistente.
  const iso = String(d);
  const datePart = iso.includes("T") ? iso.split("T")[0] : iso;
  // yyyy-mm-dd -> dd/mm/yyyy
  const m = datePart.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return datePart;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

export default function MonthlyRentsPage() {
  const { show } = useToast();
  const searchParams = useSearchParams();

  const contractId = (searchParams.get("contractId") || "").trim();

  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<MonthlyRentDTO[]>([]);
  const [query, setQuery] = useState("");

  async function loadRents() {
    if (!contractId) {
      setRows([]);
      return;
    }

    try {
      setLoading(true);

      const res = await fetch(`/api/monthly-rents?contractId=${encodeURIComponent(contractId)}`, {
        cache: "no-store",
      });

      const raw: unknown = await res.json();

      if (!res.ok || (isRecord(raw) && raw.ok === false)) {
        const msg =
          isRecord(raw) && (typeof raw.message === "string" || typeof raw.error === "string")
            ? String(raw.message || raw.error)
            : "No se pudieron cargar los alquileres mensuales";
        show(msg);
        setRows([]);
        return;
      }

      const arr = extractArray<MonthlyRentDTO>(raw);
      setRows(Array.isArray(arr) ? arr : []);
    } catch {
      show("Error de red cargando alquiler mensual");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadRents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;

    return rows.filter((r) => {
      const p = formatPeriod(r.periodYear, r.periodMonth).toLowerCase();
      const st = String(r.status || "").toLowerCase();
      const due = formatDate(r.dueDate).toLowerCase();
      return p.includes(q) || st.includes(q) || due.includes(q);
    });
  }, [rows, query]);

  const headerBackBtn = (
    <Link
      href="/contracts"
      title="Volver"
      className="flex items-center justify-center w-10 h-10 rounded-full border border-white/15 bg-white/5 hover:bg-white/10 transition text-lg"
      style={{ boxShadow: "0 0 10px 2px rgba(0,0,0,0.25)" }}
    >
      <span aria-hidden>←</span>
    </Link>
  );

  const headerAddBtn = (
    <button
      title="Agregar (próximo paso: registrar pago)"
      className="flex items-center justify-center w-10 h-10 rounded-full border transition"
      style={{
        cursor: "pointer",
        background: "rgba(0,0,0,0.35)",
        borderColor: "rgba(16,185,129,0.35)",
        boxShadow: "0 0 12px 2px rgba(16,185,129,0.10)",
        color: "#34d399",
        fontSize: 22,
        lineHeight: "22px",
      }}
      onClick={() => show("Siguiente paso: botón + va a abrir el modal de Pago")}
    >
      +
    </button>
  );

  return (
    <main className="min-h-screen px-5 py-8 text-white" style={{ background: "var(--background)" }}>
      <div className="mx-auto max-w-6xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Alquiler mensual</h1>
            <p className="text-sm opacity-70">
              {contractId ? `Contrato: ${contractId}` : "Elegí un contrato para ver sus alquileres mensuales"}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {headerBackBtn}
            {headerAddBtn}
          </div>
        </div>

        <div
          className="mt-5 rounded-2xl border p-4"
          style={{ borderColor: "rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.02)" }}
        >
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por período, vencimiento o estado…"
              className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
              style={{ borderColor: "rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.25)" }}
              disabled={!contractId}
            />

            <button
              onClick={() => void loadRents()}
              disabled={!contractId}
              className="rounded-xl border px-4 py-2 text-sm hover:opacity-90 disabled:opacity-50"
              style={{ borderColor: "rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.03)" }}
            >
              Recargar
            </button>
          </div>

          <div className="mt-4 overflow-hidden rounded-2xl border" style={{ borderColor: "rgba(255,255,255,0.10)" }}>
            <div
              className="grid grid-cols-12 gap-0 px-4 py-3 text-xs uppercase tracking-wide opacity-70"
              style={{ background: "rgba(255,255,255,0.03)" }}
            >
              <div className="col-span-2">Período</div>
              <div className="col-span-2">Vence</div>
              <div className="col-span-2">Monto</div>
              <div className="col-span-2">Pagado</div>
              <div className="col-span-2">Estado</div>
              <div className="col-span-2 text-right">Acc.</div>
            </div>

            <div style={{ background: "rgba(0,0,0,0.15)" }}>
              {!contractId ? (
                <div className="px-4 py-6 text-sm opacity-70">
                  Entrá desde <b>Contratos</b> → <b>Ver</b> para abrir el alquiler mensual del contrato.
                </div>
              ) : loading ? (
                <div className="px-4 py-6 text-sm opacity-70">Cargando…</div>
              ) : filtered.length === 0 ? (
                <div className="px-4 py-6 text-sm opacity-70">No hay alquileres mensuales para este contrato.</div>
              ) : (
                filtered.map((r) => {
                  const estado =
                    r.status === "PAID" ? "Pagado" : r.status === "PARTIAL" ? "Parcial" : "Pendiente";

                  return (
                    <div
                      key={r._id}
                      className="grid grid-cols-12 px-4 py-3 text-sm border-t items-start"
                      style={{ borderColor: "rgba(255,255,255,0.06)" }}
                    >
                      <div className="col-span-2 font-semibold">{formatPeriod(r.periodYear, r.periodMonth)}</div>
                      <div className="col-span-2 opacity-90">{formatDate(r.dueDate)}</div>
                      <div className="col-span-2 opacity-90">{formatMoney(r.amount)}</div>
                      <div className="col-span-2 opacity-90">{formatMoney(r.paidAmount || 0)}</div>
                      <div className="col-span-2 opacity-80">{estado}</div>

                      <div className="col-span-2 text-right">
                        <button
                          className="rounded-lg border border-white/10 px-2 py-1 text-xs hover:opacity-90"
                          style={{ background: "rgba(255,255,255,0.03)" }}
                          onClick={() => show("Acción Pago: lo armamos en el próximo paso")}
                        >
                          Pagar
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
