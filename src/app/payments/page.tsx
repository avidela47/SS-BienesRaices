"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { PaymentDTO, PaymentMethod } from "@/lib/types";

type MethodFilter = "ALL" | PaymentMethod;

function formatARS(n: number) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(n);
}

function formatDateTime(isoOrDate: string) {
  const d = new Date(isoOrDate);
  if (Number.isNaN(d.getTime())) return isoOrDate;
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(d);
}

function methodLabel(m: PaymentMethod) {
  switch (m) {
    case "CASH":
      return "Efectivo";
    case "TRANSFER":
      return "Transferencia";
    case "CARD":
      return "Tarjeta";
    case "OTHER":
      return "Otro";
  }
}

export default function PaymentsPage() {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string>("");

  const [payments, setPayments] = useState<PaymentDTO[]>([]);

  // filtros
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [method, setMethod] = useState<MethodFilter>("ALL");
  const [contractContains, setContractContains] = useState("");
  const [referenceContains, setReferenceContains] = useState("");

  // modal editar
  const [editOpen, setEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<PaymentDTO | null>(null);
  const [editAmount, setEditAmount] = useState<number>(0);
  const [editMethod, setEditMethod] = useState<PaymentMethod>("CASH");
  const [editReference, setEditReference] = useState("");
  const [editNotes, setEditNotes] = useState("");

  // modal anular
  const [voidOpen, setVoidOpen] = useState(false);
  const [voidTarget, setVoidTarget] = useState<PaymentDTO | null>(null);
  const [voidReason, setVoidReason] = useState("");

  async function load() {
    setLoading(true);
    setErr("");
    try {
      const res = await fetch("/api/payments", { cache: "no-store" });
  const data = (await res.json()) as { ok: boolean; payments?: PaymentDTO[]; error?: string };

      if (!data.ok) {
        setErr(data.error || "Error");
        setPayments([]);
        return;
      }

      setPayments(data.payments ?? []);
    } catch (e) {
      console.error(e);
      setErr("No se pudo cargar pagos");
      setPayments([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    const f = from.trim();
    const t = to.trim();
    const c = contractContains.trim().toLowerCase();
    const r = referenceContains.trim().toLowerCase();

    const fromDate = f ? new Date(f + "T00:00:00") : null;
    const toDate = t ? new Date(t + "T23:59:59") : null;

    return payments.filter((p) => {
      // método
      if (method !== "ALL" && p.method !== method) return false;

      // contrato contiene
      if (c && !p.contractId.toLowerCase().includes(c)) return false;

      // referencia contiene
      if (r && !(p.reference || "").toLowerCase().includes(r)) return false;

      // fechas
      const d = new Date(p.date);
      if (fromDate && d < fromDate) return false;
      if (toDate && d > toDate) return false;

      return true;
    });
  }, [payments, from, to, method, contractContains, referenceContains]);

  const stats = useMemo(() => {
    const total = filtered.reduce((acc, p) => acc + (p.status === "OK" ? p.amount : 0), 0);
    const methodsCount = filtered
      .filter((p) => p.status === "OK")
      .reduce<Record<string, number>>((acc, p) => {
        acc[p.method] = (acc[p.method] || 0) + 1;
        return acc;
      }, {});
    const topMethod = Object.entries(methodsCount).sort((a, b) => b[1] - a[1])[0];

    return {
      registros: filtered.length,
      totalCobrado: total,
      topMetodos: topMethod ? `${topMethod[0]}: ${topMethod[1]}` : "—",
    };
  }, [filtered]);

  function openEdit(p: PaymentDTO) {
    setEditTarget(p);
    setEditAmount(p.amount);
    setEditMethod(p.method);
    setEditReference(p.reference || "");
    setEditNotes(p.notes || "");
    setEditOpen(true);
  }

  function openVoid(p: PaymentDTO) {
    setVoidTarget(p);
    setVoidReason("");
    setVoidOpen(true);
  }

  async function confirmEdit() {
    if (!editTarget) return;

    setLoading(true);
    setErr("");
    try {
      const res = await fetch(`/api/payments/${editTarget._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: editAmount,
          method: editMethod,
          reference: editReference,
          notes: editNotes,
        }),
      });

      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!data.ok) {
        setErr(data.error || "No se pudo editar");
        return;
      }

      setEditOpen(false);
      setEditTarget(null);
      await load();
    } catch (e) {
      console.error(e);
      setErr("No se pudo editar");
    } finally {
      setLoading(false);
    }
  }

  async function confirmVoid() {
    if (!voidTarget) return;

    setLoading(true);
    setErr("");
    try {
      const res = await fetch(`/api/payments/${voidTarget._id}/void`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: voidReason, voidedBy: "system" }),
      });

      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!data.ok) {
        setErr(data.error || "No se pudo anular");
        return;
      }

      setVoidOpen(false);
      setVoidTarget(null);
      await load();
    } catch (e) {
      console.error(e);
      setErr("No se pudo anular");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl w-full px-6 py-8">
      <div className="flex items-start justify-between gap-6">
        <div>
          <h1 className="text-3xl font-semibold">Pagos</h1>
          <p className="text-sm text-neutral-400 mt-1">
            Registrar y controlar pagos
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/installments"
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm hover:bg-white/10 transition"
          >
            Ir a Cuotas
          </Link>
          <button
            onClick={() => void load()}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm hover:bg-white/10 transition"
            disabled={loading}
          >
            {loading ? "Actualizando..." : "Actualizar"}
          </button>
        </div>
      </div>

      {err ? (
        <div className="mt-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {err}
        </div>
      ) : null}

      {/* Stats */}
      <div className="mt-6 grid grid-cols-4 gap-4">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="text-xs text-neutral-400">REGISTROS</div>
          <div className="text-2xl font-semibold mt-1">{stats.registros}</div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="text-xs text-neutral-400">TOTAL COBRADO</div>
          <div className="text-2xl font-semibold mt-1">{formatARS(stats.totalCobrado)}</div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="text-xs text-neutral-400">TOP MÉTODOS</div>
          <div className="text-2xl font-semibold mt-1">{stats.topMetodos}</div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="text-xs text-neutral-400">ACCIÓN</div>
          <div className="text-2xl font-semibold mt-1">Auditoría simple</div>
        </div>
      </div>

      {/* Filtros */}
      <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
        <div className="px-4 py-3 border-b border-white/10 text-sm font-semibold">Filtros</div>
        <div className="p-4 grid grid-cols-5 gap-4">
          <div>
            <div className="text-xs text-neutral-400 mb-1">DESDE</div>
            <input
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              placeholder="yyyy-mm-dd"
              className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-sm outline-none focus:border-white/20"
            />
          </div>

          <div>
            <div className="text-xs text-neutral-400 mb-1">HASTA</div>
            <input
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="yyyy-mm-dd"
              className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-sm outline-none focus:border-white/20"
            />
          </div>

          <div>
            <div className="text-xs text-neutral-400 mb-1">MÉTODO</div>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value as MethodFilter)}
              className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-sm outline-none focus:border-white/20"
            >
              <option value="ALL">Todos</option>
              <option value="CASH">Efectivo</option>
              <option value="TRANSFER">Transferencia</option>
              <option value="CARD">Tarjeta</option>
              <option value="OTHER">Otro</option>
            </select>
          </div>

          <div>
            <div className="text-xs text-neutral-400 mb-1">CONTRACTID (CONTIENE)</div>
            <input
              value={contractContains}
              onChange={(e) => setContractContains(e.target.value)}
              placeholder="ej: 696cdf..."
              className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-sm outline-none focus:border-white/20"
            />
          </div>

          <div>
            <div className="text-xs text-neutral-400 mb-1">REFERENCIA (CONTIENE)</div>
            <input
              value={referenceContains}
              onChange={(e) => setReferenceContains(e.target.value)}
              placeholder="ej: recibo-0001"
              className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-sm outline-none focus:border-white/20"
            />
          </div>
        </div>
      </div>

      {/* Tabla */}
      <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
        <div className="px-4 py-3 border-b border-white/10 text-sm font-semibold">Pagos ({filtered.length})</div>

        <div className="p-4">
          <div className="rounded-xl border border-white/10 overflow-hidden">
            <div className="grid grid-cols-12 gap-0 bg-white/5 text-xs text-neutral-300 px-4 py-3">
              <div className="col-span-2">Fecha</div>
              <div className="col-span-2">Monto</div>
              <div className="col-span-2">Método</div>
              <div className="col-span-2">Referencia</div>
              <div className="col-span-2">Contrato</div>
              <div className="col-span-1">Cuota</div>
              <div className="col-span-1 text-right">Acciones</div>
            </div>

            {filtered.length === 0 ? (
              <div className="px-4 py-10 text-sm text-neutral-400">Sin resultados.</div>
            ) : (
              filtered.map((p) => (
                <div
                  key={p._id}
                  className="grid grid-cols-12 gap-0 px-4 py-3 border-t border-white/10 text-sm items-center"
                >
                  <div className="col-span-2">
                    <div className="text-neutral-200">{formatDateTime(p.date)}</div>
                    {p.status === "VOID" ? (
                      <div className="text-xs text-red-300 mt-1">
                        ANULADO{p.voidedAt ? ` • ${formatDateTime(p.voidedAt)}` : ""}
                      </div>
                    ) : null}
                  </div>

                  <div className="col-span-2 font-semibold">{formatARS(p.amount)}</div>

                  <div className="col-span-2">{methodLabel(p.method)}</div>

                  <div className="col-span-2">{p.reference || "—"}</div>

                  <div className="col-span-2 text-neutral-300">{p.contractId}</div>

                  <div className="col-span-1">
                    <Link className="text-emerald-300 hover:underline" href={`/installments`}>
                      {p.installmentId.slice(0, 6)}…{p.installmentId.slice(-4)}
                    </Link>
                  </div>

                  <div className="col-span-1 flex justify-end gap-2">
                    <button
                      className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs hover:bg-white/10 transition disabled:opacity-40"
                      onClick={() => openEdit(p)}
                      disabled={loading || p.status === "VOID"}
                      title={p.status === "VOID" ? "No se puede editar un pago anulado" : "Editar"}
                    >
                      Editar
                    </button>

                    <button
                      className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs hover:bg-red-500/15 transition disabled:opacity-40"
                      onClick={() => openVoid(p)}
                      disabled={loading || p.status === "VOID"}
                      title={p.status === "VOID" ? "Ya está anulado" : "Anular"}
                    >
                      Anular
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="mt-3 text-xs text-neutral-500">
            Auditoría: se mantiene `createdBy / createdAt`. Para anulaciones: `voidedBy / voidedAt / voidReason`.
          </div>
        </div>
      </div>

      {/* Modal Editar */}
      {editOpen && editTarget ? (
        <div className="fixed inset-0 z-9998 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-2xl border border-white/10 bg-black/80 shadow-2xl">
            <div className="px-5 py-4 border-b border-white/10">
              <div className="text-lg font-semibold">Editar pago</div>
              <div className="text-sm text-neutral-400 mt-1">
                {formatDateTime(editTarget.date)} — {formatARS(editTarget.amount)} — {editTarget._id}
              </div>
            </div>

            <div className="p-5 grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs text-neutral-400 mb-1">IMPORTE</div>
                <input
                  type="number"
                  value={editAmount}
                  onChange={(e) => setEditAmount(Number(e.target.value))}
                  className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-sm outline-none focus:border-white/20"
                />
              </div>

              <div>
                <div className="text-xs text-neutral-400 mb-1">MÉTODO</div>
                <select
                  value={editMethod}
                  onChange={(e) => setEditMethod(e.target.value as PaymentMethod)}
                  className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-sm outline-none focus:border-white/20"
                >
                  <option value="CASH">Efectivo</option>
                  <option value="TRANSFER">Transferencia</option>
                  <option value="CARD">Tarjeta</option>
                  <option value="OTHER">Otro</option>
                </select>
              </div>

              <div className="col-span-2">
                <div className="text-xs text-neutral-400 mb-1">REFERENCIA (OPCIONAL)</div>
                <input
                  value={editReference}
                  onChange={(e) => setEditReference(e.target.value)}
                  placeholder="ej: recibo-0001 / comprobante"
                  className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-sm outline-none focus:border-white/20"
                />
              </div>

              <div className="col-span-2">
                <div className="text-xs text-neutral-400 mb-1">NOTAS (OPCIONAL)</div>
                <textarea
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="Observaciones..."
                  className="w-full min-h-22.5 rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-sm outline-none focus:border-white/20"
                />
              </div>
            </div>

            <div className="px-5 py-4 border-t border-white/10 flex items-center justify-end gap-3">
              <button
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm hover:bg-white/10 transition"
                onClick={() => {
                  setEditOpen(false);
                  setEditTarget(null);
                }}
              >
                Cancelar
              </button>
              <button
                className="rounded-xl border border-emerald-500/30 bg-emerald-500/15 px-4 py-2 text-sm hover:bg-emerald-500/20 transition"
                onClick={() => void confirmEdit()}
                disabled={loading}
              >
                Confirmar cambios
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Modal Anular */}
      {voidOpen && voidTarget ? (
        <div className="fixed inset-0 z-9998 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-2xl border border-white/10 bg-black/80 shadow-2xl">
            <div className="px-5 py-4 border-b border-white/10">
              <div className="text-lg font-semibold text-red-200">Anular pago</div>
              <div className="text-sm text-neutral-400 mt-1">
                {formatDateTime(voidTarget.date)} — {formatARS(voidTarget.amount)} — {voidTarget._id}
              </div>
            </div>

            <div className="p-5">
              <div className="text-sm text-neutral-300">
                Esto hará un <span className="font-semibold">soft delete</span> (`status: VOID`) y recalculará la cuota
                asociada.
              </div>

              <div className="mt-4">
                <div className="text-xs text-neutral-400 mb-1">MOTIVO (OPCIONAL)</div>
                <input
                  value={voidReason}
                  onChange={(e) => setVoidReason(e.target.value)}
                  placeholder="ej: pago duplicado / error de carga"
                  className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-sm outline-none focus:border-white/20"
                />
              </div>
            </div>

            <div className="px-5 py-4 border-t border-white/10 flex items-center justify-end gap-3">
              <button
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm hover:bg-white/10 transition"
                onClick={() => {
                  setVoidOpen(false);
                  setVoidTarget(null);
                }}
              >
                Cancelar
              </button>
              <button
                className="rounded-xl border border-red-500/30 bg-red-500/15 px-4 py-2 text-sm hover:bg-red-500/20 transition"
                onClick={() => void confirmVoid()}
                disabled={loading}
              >
                Confirmar anulación
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
