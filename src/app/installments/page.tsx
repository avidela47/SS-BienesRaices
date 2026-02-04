// src/app/installments/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import BackButton from "@/app/components/BackButton";
import { useSearchParams, useRouter } from "next/navigation";
import type { ApiError, ApiOk, InstallmentDTO, PaymentDTO, PaymentMethod } from "@/lib/types";
import { useToast } from "@/components/ToastProvider";

type InstallmentsApi = ApiOk<InstallmentDTO[]> & { installments: InstallmentDTO[] };
type PaymentsApi = ApiOk<PaymentDTO[]> & { payments: PaymentDTO[] };
type ContractsApi = ApiOk<Array<{ _id: string; code?: string }>> & { contracts: Array<{ _id: string; code?: string }> };

function formatMoneyARS(n: number): string {
  return n.toLocaleString("es-AR", { style: "currency", currency: "ARS" });
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("es-AR");
}

function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

const METHOD_LABEL: Record<PaymentMethod, string> = {
  CASH: "Efectivo",
  TRANSFER: "Transferencia",
  CARD: "Tarjeta",
  OTHER: "Otro",
};

export default function InstallmentsPage() {
  const { show } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const focusId = searchParams.get("focus");

  const [loading, setLoading] = useState<boolean>(true);
  const [installments, setInstallments] = useState<InstallmentDTO[]>([]);
  const [payments, setPayments] = useState<PaymentDTO[]>([]);
  const [contracts, setContracts] = useState<Array<{ _id: string; code?: string }>>([]);

  // Filtros
  const [q, setQ] = useState<string>("");
  const [status, setStatus] = useState<"ALL" | "PENDING" | "PAID" | "OVERDUE" | "PARTIAL">("ALL");
  const [periodFrom, setPeriodFrom] = useState<string>(""); // YYYY-MM
  const [periodTo, setPeriodTo] = useState<string>(""); // YYYY-MM
  const [contractFilter, setContractFilter] = useState<string>("ALL");

  // Modal pago
  const [payOpen, setPayOpen] = useState<boolean>(false);
  const [payTarget, setPayTarget] = useState<InstallmentDTO | null>(null);
  const [payAmount, setPayAmount] = useState<string>("0");
  const [payMethod, setPayMethod] = useState<PaymentMethod>("CASH");
  const [payRef, setPayRef] = useState<string>("");
  const [payNotes, setPayNotes] = useState<string>("");
  const [paySubmitting, setPaySubmitting] = useState<boolean>(false);

  async function loadAll(): Promise<void> {
    setLoading(true);
    try {
      const [iRes, pRes, cRes] = await Promise.all([
        fetch("/api/installments", { cache: "no-store" }),
        fetch("/api/payments", { cache: "no-store" }),
        fetch("/api/contracts", { cache: "no-store" }),
      ]);

      const iJson = (await iRes.json()) as InstallmentsApi | ApiError;
  const pJson = (await pRes.json()) as PaymentsApi | ApiError;
  const cJson = (await cRes.json()) as ContractsApi | ApiError;

      if (!iRes.ok || !("ok" in iJson) || iJson.ok !== true) {
        const err = (iJson as ApiError).error || "Error cargando alquiler mensual";
        throw new Error(err);
      }

      if (!pRes.ok || !("ok" in pJson) || pJson.ok !== true) {
        setPayments([]);
      } else {
        setPayments(pJson.payments ?? []);
      }

      if (!cRes.ok || !("ok" in cJson) || cJson.ok !== true) {
        setContracts([]);
      } else {
        setContracts(cJson.contracts ?? []);
      }

      setInstallments(iJson.installments ?? []);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error inesperado";
      show(msg);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto seleccionar contrato solo si hay focus o si existe un único contrato
  useEffect(() => {
    if (contractFilter !== "ALL") return;

    if (focusId) {
      const focused = installments.find((it) => it._id === focusId);
      if (focused) {
        setContractFilter(focused.contractId);
        return;
      }
    }

    if (contracts.length === 1) {
      setContractFilter(contracts[0]._id);
    }
  }, [contracts, contractFilter, focusId, installments]);

  // Focus scroll + highlight
  useEffect(() => {
    if (!focusId) return;
    const el = document.querySelector(`[data-id="${focusId}"]`);
    if (!el) return;

    el.scrollIntoView({ behavior: "smooth", block: "center" });

    el.classList.add("animate-pulse");
    const t = window.setTimeout(() => el.classList.remove("animate-pulse"), 1200);

    return () => window.clearTimeout(t);
  }, [focusId, installments]);

  const visibleInstallments = useMemo(() => {
    if (!contracts.length) return installments;
    const ids = new Set(contracts.map((c) => c._id));
    return installments.filter((it) => ids.has(it.contractId));
  }, [contracts, installments]);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();

    return visibleInstallments.filter((it) => {
  if (status !== "ALL" && it.status !== status) return false;
      if (periodFrom && it.period < periodFrom) return false;
      if (periodTo && it.period > periodTo) return false;
  if (contractFilter !== "ALL" && it.contractId !== contractFilter) return false;

      if (!qq) return true;

      const hay =
        it.period.toLowerCase().includes(qq) ||
        it._id.toLowerCase().includes(qq) ||
        it.contractId.toLowerCase().includes(qq) ||
        String(it.amount).includes(qq);

      return hay;
    });
  }, [visibleInstallments, q, status, periodFrom, periodTo, contractFilter]);

  const contractCodeById = useMemo(() => {
    return contracts.reduce<Record<string, string>>((acc, c) => {
      acc[c._id] = c.code || c._id;
      return acc;
    }, {});
  }, [contracts]);

  const stats = useMemo(() => {
    const base = filtered;
    const total = base.length;
    const paid = base.filter((x) => x.status === "PAID").length;
    const pending = base.filter((x) => x.status === "PENDING").length;
    const partial = base.filter((x) => x.status === "PARTIAL").length;
    const overdue = base.filter((x) => x.status === "OVERDUE").length;
  const active = pending + partial + overdue;

    const pendingAmount = base
      .filter((x) => x.status !== "PAID")
      .reduce((acc, x) => acc + (x.amount - (x.paidAmount || 0)), 0);

    return { total, paid, pending, partial, overdue, active, pendingAmount };
  }, [filtered]);

  function openPayModal(it: InstallmentDTO): void {
    setPayTarget(it);
    setPayAmount(String(it.amount - (it.paidAmount || 0)));
    setPayMethod("CASH");
    setPayRef("");
    setPayNotes("");
    setPayOpen(true);
  }

  function closePayModal(): void {
    if (paySubmitting) return;
    setPayOpen(false);
    setPayTarget(null);
  }

  async function submitPayment(): Promise<void> {
    if (!payTarget) return;

    const amountNum = Number(payAmount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      show("Importe inválido.");
      return;
    }

    setPaySubmitting(true);
    try {
      const res = await fetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          installmentId: payTarget._id,
          amount: amountNum,
          method: payMethod,
          reference: payRef.trim() ? payRef.trim() : undefined,
          notes: payNotes.trim() ? payNotes.trim() : undefined,
        }),
      });

      const json = (await res.json()) as ApiOk<PaymentDTO> | ApiError;

      if (!res.ok || json.ok !== true) {
        const err = (json as ApiError).error || "No se pudo registrar el pago.";
        throw new Error(err);
      }

      show("Pago registrado correctamente.");
      closePayModal();
      await loadAll();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error inesperado";
      show(msg);
    } finally {
      setPaySubmitting(false);
    }
  }

  return (
    <main className="min-h-screen px-5 py-8 text-white" style={{ background: "var(--background)" }}>
      <div className="mx-auto max-w-6xl">
        {/* Header (como tu ejemplo) */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold">Alquiler mensual</h1>
            <p className="text-sm opacity-70">Listado y gestión del alquiler mensual</p>
          </div>

          {/* Acciones arriba derecha, pero visualmente son las “circulares” como en todas las páginas */}
          <div className="flex items-center gap-2">
            <BackButton onClick={() => router.back()} />
          </div>
        </div>

        {/* Stats */}
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-6 gap-4">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="text-xs text-white/50">TOTAL (FILTRADO)</div>
            <div className="mt-1 text-2xl font-semibold">{stats.total}</div>
            <div className="mt-1 text-[11px] text-white/40">Según filtros</div>
          </div>
          <div className="rounded-2xl border border-indigo-500/20 bg-white/5 p-4">
            <div className="text-xs text-white/50">ACTIVAS</div>
            <div className="mt-1 text-2xl font-semibold">{stats.active}</div>
          </div>
          <div className="rounded-2xl border border-emerald-500/20 bg-white/5 p-4">
            <div className="text-xs text-white/50">PAGADAS</div>
            <div className="mt-1 text-2xl font-semibold">{stats.paid}</div>
          </div>
          <div className="rounded-2xl border border-sky-500/20 bg-white/5 p-4">
            <div className="text-xs text-white/50">PENDIENTES</div>
            <div className="mt-1 text-2xl font-semibold">{stats.pending}</div>
          </div>
          <div className="rounded-2xl border border-amber-500/20 bg-white/5 p-4">
            <div className="text-xs text-white/50">PARCIALES</div>
            <div className="mt-1 text-2xl font-semibold">{stats.partial}</div>
          </div>
          <div className="rounded-2xl border border-red-500/20 bg-white/5 p-4">
            <div className="text-xs text-white/50">VENCIDAS</div>
            <div className="mt-1 text-2xl font-semibold">{stats.overdue}</div>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="text-xs text-white/50">SALDO PENDIENTE (APROX.)</div>
          <div className="mt-1 text-2xl font-semibold">{formatMoneyARS(stats.pendingAmount)}</div>
        </div>

        {/* Filters */}
        <div className="mt-6 rounded-2xl border border-white/10 bg-white/5">
          <div className="border-b border-white/10 px-5 py-4">
            <div className="text-sm font-semibold">Filtros</div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-6 gap-4 px-5 py-4">
            <div>
              <div className="mb-2 text-xs text-white/50">BUSCAR</div>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="periodo, contrato, id, monto..."
                className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-white/10"
              />
            </div>

            <div>
              <div className="mb-2 text-xs text-white/50">ESTADO</div>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as typeof status)}
                className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-white/10"
              >
                <option value="ALL">Todos</option>
                <option value="PENDING">Pendiente</option>
                <option value="PARTIAL">Parcial</option>
                <option value="PAID">Pagada</option>
                <option value="OVERDUE">Vencida</option>
              </select>
            </div>

            <div>
              <div className="mb-2 text-xs text-white/50">CONTRATO</div>
              <select
                value={contractFilter}
                onChange={(e) => setContractFilter(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-white/10"
              >
                <option value="ALL">Todos</option>
                {contracts.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.code ?? c._id}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="mb-2 text-xs text-white/50">PERIODO DESDE</div>
              <input
                value={periodFrom}
                onChange={(e) => setPeriodFrom(e.target.value)}
                placeholder="YYYY-MM"
                className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-white/10"
              />
            </div>

            <div>
              <div className="mb-2 text-xs text-white/50">PERIODO HASTA</div>
              <input
                value={periodTo}
                onChange={(e) => setPeriodTo(e.target.value)}
                placeholder="YYYY-MM"
                className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-white/10"
              />
            </div>

            <div className="flex items-end justify-end gap-2">
              <button
                onClick={() => {
                  setQ("");
                  setStatus("ALL");
                  setPeriodFrom("");
                  setPeriodTo("");
                  setContractFilter("ALL");
                }}
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm hover:bg-white/10"
              >
                Limpiar
              </button>
              <button
                onClick={() => void loadAll()}
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm hover:bg-white/10"
              >
                Refrescar
              </button>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="mt-6 rounded-2xl border border-white/10 bg-white/5">
          <div className="border-b border-white/10 px-5 py-4">
            <div className="text-sm font-semibold">Alquiler mensual ({filtered.length})</div>
          </div>

          <div className="p-4">
            <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/30">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-white/10 text-white/60">
                  <tr>
                    <th className="px-4 py-3">Estado</th>
                    <th className="px-4 py-3">Período</th>
                    <th className="px-4 py-3">Vence</th>
                    <th className="px-4 py-3">Monto</th>
                    <th className="px-4 py-3">Contrato</th>
                    <th className="px-4 py-3">Pago</th>
                    <th className="px-4 py-3">Saldo</th>
                    <th className="px-4 py-3 text-right">Acciones</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-white/5">
                  {loading ? (
                    <tr>
                      <td className="px-4 py-6 text-white/60" colSpan={8}>
                        Cargando...
                      </td>
                    </tr>
                  ) : filtered.length === 0 ? (
                    <tr>
                      <td className="px-4 py-6 text-white/60" colSpan={8}>
                        No hay alquiler mensual.
                      </td>
                    </tr>
                  ) : (
                    filtered.map((row) => {
                      const isFocused = !!focusId && row._id === focusId;

                      const badgeClass =
                        row.status === "PAID"
                          ? "border-emerald-500/30 text-emerald-200 bg-emerald-500/10"
                          : row.status === "OVERDUE"
                          ? "border-red-500/30 text-red-200 bg-red-500/10"
                          : row.status === "PARTIAL"
                          ? "border-amber-500/30 text-amber-200 bg-amber-500/10"
                          : "border-sky-500/30 text-sky-200 bg-sky-500/10";

                      const statusLabel =
                        row.status === "PAID"
                          ? "PAGADA"
                          : row.status === "OVERDUE"
                          ? "VENCIDA"
                          : row.status === "PARTIAL"
                          ? "PARCIAL"
                          : "PENDIENTE";

                      const lastPayment = payments
                        .filter((p) => p.installmentId === row._id)
                        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];

                      return (
                        <tr
                          key={row._id}
                          data-id={row._id}
                          className={cx(
                            "hover:bg-white/5",
                            isFocused && "bg-emerald-500/10 ring-1 ring-emerald-400/30"
                          )}
                        >
                          <td className="px-4 py-3">
                            <span className={cx("inline-flex rounded-full border px-3 py-1 text-xs", badgeClass)}>
                              {statusLabel}
                            </span>
                          </td>

                          <td className="px-4 py-3 text-white/80">{row.period}</td>
                          <td className="px-4 py-3 text-white/80">{formatDate(row.dueDate)}</td>
                          <td className="px-4 py-3 text-white/80">{formatMoneyARS(row.amount)}</td>

                          <td className="px-4 py-3 text-white/80">
                            {contractCodeById[row.contractId] ?? row.contractId}
                          </td>

                          <td className="px-4 py-3 text-white/70">
                            {lastPayment ? (
                              <div className="text-xs space-y-0.5">
                                <div className="text-white/80">{formatMoneyARS(lastPayment.amount)}</div>
                                <div className="text-white/50">
                                  {METHOD_LABEL[lastPayment.method]}
                                  {lastPayment.reference ? ` — ${lastPayment.reference}` : ""}
                                </div>
                              </div>
                            ) : (
                              <span className="text-white/40">-</span>
                            )}
                          </td>

                          <td className="px-4 py-3 text-white/70">
                            {row.status !== "PAID"
                              ? formatMoneyARS(Math.max(0, row.amount - (row.paidAmount || 0)))
                              : "—"}
                          </td>

                          <td className="px-4 py-3 text-right">
                            {row.status === "PAID" ? (
                              <button
                                disabled
                                className="cursor-not-allowed rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs text-white/40"
                              >
                                Pagada
                              </button>
                            ) : (
                              <button
                                onClick={() => openPayModal(row)}
                                className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-2 text-xs text-emerald-200 hover:bg-emerald-500/15"
                              >
                                Registrar pago
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

          </div>
        </div>
      </div>

      {/* Modal pago */}
      {payOpen && payTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-2xl border border-white/10 bg-black/80 shadow-2xl">
            <div className="border-b border-white/10 px-6 py-5">
              <div className="text-xl font-semibold">Registrar pago</div>
              <div className="mt-1 text-sm text-white/60">
                {payTarget.period} — {formatMoneyARS(payTarget.amount)}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 px-6 py-5">
              <div>
                <div className="mb-2 text-xs text-white/50">IMPORTE</div>
                <input
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-white/10"
                />
              </div>

              <div>
                <div className="mb-2 text-xs text-white/50">MÉTODO</div>
                <select
                  value={payMethod}
                  onChange={(e) => setPayMethod(e.target.value as PaymentMethod)}
                  className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-white/10"
                >
                  <option value="CASH">Efectivo</option>
                  <option value="TRANSFER">Transferencia</option>
                  <option value="CARD">Tarjeta</option>
                  <option value="OTHER">Otro</option>
                </select>
              </div>

              <div className="sm:col-span-2">
                <div className="mb-2 text-xs text-white/50">REFERENCIA (OPCIONAL)</div>
                <input
                  value={payRef}
                  onChange={(e) => setPayRef(e.target.value)}
                  placeholder="ej: recibo-0001 / comprobante"
                  className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-white/10"
                />
              </div>

              <div className="sm:col-span-2">
                <div className="mb-2 text-xs text-white/50">NOTAS (OPCIONAL)</div>
                <textarea
                  value={payNotes}
                  onChange={(e) => setPayNotes(e.target.value)}
                  placeholder="Observaciones..."
                  rows={4}
                  className="w-full resize-none rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-white/10"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-white/10 px-6 py-4">
              <button
                onClick={closePayModal}
                disabled={paySubmitting}
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm hover:bg-white/10 disabled:opacity-50"
              >
                Cancelar
              </button>

              <button
                onClick={() => void submitPayment()}
                disabled={paySubmitting}
                className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-200 hover:bg-emerald-500/15 disabled:opacity-50"
              >
                {paySubmitting ? "Confirmando..." : "Confirmar pago"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}


