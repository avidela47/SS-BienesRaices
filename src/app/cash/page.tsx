"use client";

import { useEffect, useMemo, useState } from "react";
import BackButton from "@/app/components/BackButton";
import type { CashMovementDTO } from "@/lib/types";

type Summary = {
  total: number;
  byStatus: Record<string, number>;
  byType: Record<string, number>;
};

const DEFAULT_SUMMARY: Summary = { total: 0, byStatus: {}, byType: {} };

function formatCurrency(value: number, currency = "ARS") {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" });
}

const TYPE_LABELS: Record<string, string> = {
  INCOME: "Ingreso",
  EXPENSE: "Egreso",
  COMMISSION: "Comisión",
  RETENTION: "Retención",
  ADJUSTMENT: "Ajuste",
};

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Pendiente",
  COLLECTED: "Cobrado",
  RETAINED: "Retenido",
  READY_TO_TRANSFER: "Listo para transferir",
  TRANSFERRED: "Transferido",
  VOID: "Anulado",
};

const PARTY_LABELS: Record<string, string> = {
  AGENCY: "Inmobiliaria",
  OWNER: "Propietario",
  TENANT: "Inquilino",
  GUARANTOR: "Garante",
  OTHER: "Otro",
};

export default function CashPage() {
  const [movements, setMovements] = useState<CashMovementDTO[]>([]);
  const [summary, setSummary] = useState<Summary>(DEFAULT_SUMMARY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [manualContractId, setManualContractId] = useState("");
  const [manualType, setManualType] = useState("INCOME");
  const [manualStatus, setManualStatus] = useState("COLLECTED");
  const [manualAmount, setManualAmount] = useState("");
  const [manualSubtype, setManualSubtype] = useState("");
  const [manualPartyType, setManualPartyType] = useState("AGENCY");
  const [manualPartyId, setManualPartyId] = useState("");
  const [manualNotes, setManualNotes] = useState("");
  const [manualSubmitting, setManualSubmitting] = useState(false);
  const [manualMessage, setManualMessage] = useState("");
  const [transferingId, setTransferingId] = useState("");
  const [viewMode, setViewMode] = useState<"summary" | "detail">("summary");

  const filteredQuery = useMemo(() => {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    return params.toString();
  }, [from, to]);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/cash-movements${filteredQuery ? `?${filteredQuery}` : ""}`);
      const data = (await res.json()) as { ok?: boolean; movements?: CashMovementDTO[]; summary?: Summary; error?: string };
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "No se pudo cargar la caja");
      }
      setMovements(data.movements || []);
      setSummary(data.summary || DEFAULT_SUMMARY);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredQuery]);

  const groupedRows = useMemo(() => {
    const groups = new Map<string, CashMovementDTO[]>();
    for (const movement of movements) {
      const key = movement.paymentId || movement._id;
      const current = groups.get(key) || [];
      current.push(movement);
      groups.set(key, current);
    }

    return Array.from(groups.entries()).map(([key, items]) => {
      const sorted = [...items].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      const income = items.filter((m) => m.type === "INCOME").reduce((acc, m) => acc + m.amount, 0);
      const commission = items.filter((m) => m.type === "COMMISSION").reduce((acc, m) => acc + m.amount, 0);
      const expense = items.filter((m) => m.type === "EXPENSE").reduce((acc, m) => acc + m.amount, 0);
      const ownerNetMovement = items.find((m) => m.type === "EXPENSE" && m.subtype === "OWNER_NET");

      return {
        key,
        date: sorted[0]?.date || "",
        contractLabel: sorted[0]?.contractLabel || sorted[0]?.contractId || "",
        propertyLabel: sorted[0]?.propertyLabel || sorted[0]?.propertyId || "",
        income,
        commission,
        expense,
        status: ownerNetMovement?.status || sorted[0]?.status || "",
        transferId: ownerNetMovement?._id,
      };
    });
  }, [movements]);

  async function submitManualMovement() {
    setManualSubmitting(true);
    setManualMessage("");
    try {
      const amount = Number(manualAmount);
      if (!manualContractId || !Number.isFinite(amount) || amount <= 0) {
        throw new Error("Completá contrato y monto válido");
      }

      const res = await fetch("/api/cash-movements/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contractId: manualContractId.trim(),
          type: manualType,
          status: manualStatus,
          amount,
          subtype: manualSubtype.trim(),
          partyType: manualPartyType,
          partyId: manualPartyId.trim() || undefined,
          notes: manualNotes.trim(),
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "No se pudo crear el movimiento");
      }

      setManualMessage("Movimiento creado");
      setManualAmount("");
      setManualSubtype("");
      setManualNotes("");
      await load();
    } catch (err) {
      setManualMessage(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setManualSubmitting(false);
    }
  }

  async function transferMovement(id: string) {
    setTransferingId(id);
    try {
      const res = await fetch(`/api/cash-movements/${id}/transfer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transferredBy: "system" }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "No se pudo transferir");
      }
      await load();
    } catch (err) {
      setManualMessage(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setTransferingId("");
    }
  }

  return (
    <main className="min-h-screen px-5 py-10 text-white" style={{ background: "var(--background)" }}>
      <div className="mx-auto max-w-6xl">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Caja</h1>
            <p className="text-sm mt-1" style={{ color: "var(--benetton-muted)" }}>
              Resumen de caja conectado a movimientos reales.
            </p>
          </div>

          <BackButton />
        </div>

        <div className="mt-6 grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="rounded-2xl border p-4" style={{ borderColor: "var(--benetton-border)", background: "var(--benetton-card)" }}>
            <div className="text-xs uppercase tracking-wide text-white/60">Total caja</div>
            <div className="text-2xl font-semibold mt-2">{formatCurrency(summary.total)}</div>
          </div>

          {[
            { label: "Cobrado", key: "COLLECTED" },
            { label: "Pendiente", key: "PENDING" },
            { label: "Listo a transferir", key: "READY_TO_TRANSFER" },
          ].map((item) => (
            <div
              key={item.key}
              className="rounded-2xl border p-4"
              style={{ borderColor: "var(--benetton-border)", background: "var(--benetton-card)" }}
            >
              <div className="text-xs uppercase tracking-wide text-white/60">{item.label}</div>
              <div className="text-xl font-semibold mt-2">
                {formatCurrency(summary.byStatus[item.key] || 0)}
              </div>
            </div>
          ))}
        </div>

        <div
          className="mt-6 rounded-2xl border p-6"
          style={{ borderColor: "var(--benetton-border)", background: "var(--benetton-card)" }}
        >
          <div className="mb-6 rounded-xl border border-white/10 p-4 bg-white/5">
            <h2 className="text-base font-semibold">Movimiento manual</h2>
            <p className="text-xs text-white/60 mt-1">
              Registrá gastos o ingresos no automáticos (luz, gas, expensas, reparaciones, aportes, etc.).
            </p>

            <div className="mt-3 grid grid-cols-1 md:grid-cols-6 gap-3">
              <div className="md:col-span-2">
                <label className="text-xs text-white/60">Contrato (ID)</label>
                <input
                  value={manualContractId}
                  onChange={(e) => setManualContractId(e.target.value)}
                  className="mt-1 w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-xs text-white outline-none"
                  placeholder="ObjectId del contrato"
                />
              </div>
              <div>
                <label className="text-xs text-white/60">Tipo</label>
                <select
                  value={manualType}
                  onChange={(e) => setManualType(e.target.value)}
                  className="mt-1 w-full rounded-xl bg-black/40 border border-white/10 px-2 py-2 text-xs text-white outline-none"
                >
                  {"INCOME,EXPENSE,COMMISSION,RETENTION,ADJUSTMENT".split(",").map((t) => (
                    <option key={t} value={t}>
                      {TYPE_LABELS[t] || t}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-white/60">Estado</label>
                <select
                  value={manualStatus}
                  onChange={(e) => setManualStatus(e.target.value)}
                  className="mt-1 w-full rounded-xl bg-black/40 border border-white/10 px-2 py-2 text-xs text-white outline-none"
                >
                  {"PENDING,COLLECTED,RETAINED,READY_TO_TRANSFER,TRANSFERRED".split(",").map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABELS[s] || s}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-white/60">Monto</label>
                <input
                  value={manualAmount}
                  onChange={(e) => setManualAmount(e.target.value)}
                  type="number"
                  min="0"
                  className="mt-1 w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-xs text-white outline-none"
                  placeholder="0"
                />
              </div>
              <div>
                <label className="text-xs text-white/60">Subtipo</label>
                <input
                  value={manualSubtype}
                  onChange={(e) => setManualSubtype(e.target.value)}
                  className="mt-1 w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-xs text-white outline-none"
                  placeholder="LUZ / GAS / EXPENSA"
                />
              </div>
              <div>
                <label className="text-xs text-white/60">Imputar a</label>
                <select
                  value={manualPartyType}
                  onChange={(e) => setManualPartyType(e.target.value)}
                  className="mt-1 w-full rounded-xl bg-black/40 border border-white/10 px-2 py-2 text-xs text-white outline-none"
                >
                  {"AGENCY,OWNER,TENANT,GUARANTOR,OTHER".split(",").map((p) => (
                    <option key={p} value={p}>
                      {PARTY_LABELS[p] || p}
                    </option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="text-xs text-white/60">Party ID (opcional)</label>
                <input
                  value={manualPartyId}
                  onChange={(e) => setManualPartyId(e.target.value)}
                  className="mt-1 w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-xs text-white outline-none"
                  placeholder="ObjectId del propietario/garante"
                />
              </div>
              <div className="md:col-span-4">
                <label className="text-xs text-white/60">Notas</label>
                <input
                  value={manualNotes}
                  onChange={(e) => setManualNotes(e.target.value)}
                  className="mt-1 w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-xs text-white outline-none"
                  placeholder="Detalle del gasto o ingreso"
                />
              </div>
            </div>

            <div className="mt-3 flex items-center gap-3">
              <button
                type="button"
                onClick={() => void submitManualMovement()}
                disabled={manualSubmitting}
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs hover:bg-white/10 transition disabled:opacity-60"
              >
                {manualSubmitting ? "Guardando..." : "Guardar movimiento"}
              </button>
              {manualMessage ? (
                <span className={manualMessage === "Movimiento creado" ? "text-emerald-300 text-xs" : "text-red-300 text-xs"}>
                  {manualMessage}
                </span>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-3 justify-between">
            <div>
              <h2 className="text-lg font-semibold">Movimientos</h2>
              <p className="text-xs text-white/60">Filtrá por rango de fechas.</p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setViewMode("summary")}
                className={`rounded-xl border px-3 py-2 text-xs transition ${
                  viewMode === "summary"
                    ? "border-emerald-400/40 bg-emerald-400/10"
                    : "border-white/10 bg-white/5 hover:bg-white/10"
                }`}
              >
                Resumen
              </button>
              <button
                type="button"
                onClick={() => setViewMode("detail")}
                className={`rounded-xl border px-3 py-2 text-xs transition ${
                  viewMode === "detail"
                    ? "border-emerald-400/40 bg-emerald-400/10"
                    : "border-white/10 bg-white/5 hover:bg-white/10"
                }`}
              >
                Detalle
              </button>
            </div>

            <div className="flex flex-wrap gap-2 items-end">
              <div>
                <label className="text-xs text-white/60">Desde</label>
                <input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className="block mt-1 rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-xs text-white outline-none"
                />
              </div>
              <div>
                <label className="text-xs text-white/60">Hasta</label>
                <input
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className="block mt-1 rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-xs text-white outline-none"
                />
              </div>
              <button
                type="button"
                onClick={() => void load()}
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs hover:bg-white/10 transition"
                disabled={loading}
              >
                {loading ? "Actualizando..." : "Actualizar"}
              </button>
            </div>
          </div>

          {error ? (
            <div className="mt-4 text-red-400 text-sm">{error}</div>
          ) : loading ? (
            <div className="mt-4 text-sm text-white/60">Cargando movimientos…</div>
          ) : movements.length === 0 ? (
            <div className="mt-4 text-sm text-white/60">No hay movimientos en este período.</div>
          ) : viewMode === "summary" ? (
            <div className="mt-4 overflow-hidden rounded-xl border border-white/10">
              <div className="grid grid-cols-12 gap-0 px-4 py-3 text-xs uppercase tracking-wide text-neutral-300 bg-white/5">
                <div className="col-span-2">Fecha</div>
                <div className="col-span-2">Contrato</div>
                <div className="col-span-2">Propiedad</div>
                <div className="col-span-2">Ingreso</div>
                <div className="col-span-2">Comisión</div>
                <div className="col-span-1">Egreso/Neto</div>
                <div className="col-span-1 text-right">Acc.</div>
              </div>

              {groupedRows.map((row) => (
                <div key={row.key} className="grid grid-cols-12 px-4 py-3 text-sm border-t border-white/10">
                  <div className="col-span-2 text-white/80">{row.date ? formatDate(row.date) : "—"}</div>
                  <div className="col-span-2 text-white/70 truncate" title={row.contractLabel}>
                    {row.contractLabel || "—"}
                  </div>
                  <div className="col-span-2 text-white/70 truncate" title={row.propertyLabel}>
                    {row.propertyLabel || "—"}
                  </div>
                  <div className="col-span-2 font-semibold">
                    {row.income ? formatCurrency(row.income) : "—"}
                  </div>
                  <div className="col-span-2 text-white/80">
                    {row.commission ? formatCurrency(row.commission) : "—"}
                  </div>
                  <div className="col-span-1 text-white/80">
                    {row.expense ? formatCurrency(row.expense) : "—"}
                  </div>
                  <div className="col-span-1 flex justify-end">
                    {row.status === "READY_TO_TRANSFER" && row.transferId ? (
                      <button
                        type="button"
                        onClick={() => void transferMovement(row.transferId!)}
                        disabled={transferingId === row.transferId}
                        className="rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-2 py-1 text-xs hover:bg-emerald-400/20 disabled:opacity-60"
                      >
                        {transferingId === row.transferId ? "..." : "Transferir"}
                      </button>
                    ) : (
                      <span className="text-xs text-white/40">—</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-4 overflow-hidden rounded-xl border border-white/10">
              <div className="grid grid-cols-15 gap-0 px-4 py-3 text-xs uppercase tracking-wide text-neutral-300 bg-white/5">
                <div className="col-span-2">Fecha</div>
                <div className="col-span-2">Tipo</div>
                <div className="col-span-2">Estado</div>
                <div className="col-span-2">Monto</div>
                <div className="col-span-2">Imputado</div>
                <div className="col-span-2">Contrato</div>
                <div className="col-span-2">Propiedad</div>
                <div className="col-span-1 text-right">Acc.</div>
              </div>

              {movements.map((movement) => (
                <div
                  key={movement._id}
                  className="grid grid-cols-15 px-4 py-3 text-sm border-t border-white/10"
                >
                  <div className="col-span-2 text-white/80">{formatDate(movement.date)}</div>
                  <div className="col-span-2 text-white/90 font-semibold">
                    {TYPE_LABELS[movement.type] || movement.type}
                  </div>
                  <div className="col-span-2 text-white/70">
                    {STATUS_LABELS[movement.status] || movement.status}
                  </div>
                  <div className="col-span-2 font-semibold">
                    {formatCurrency(movement.amount, movement.currency || "ARS")}
                  </div>
                  <div className="col-span-2 text-white/60">
                    {movement.partyType ? PARTY_LABELS[movement.partyType] || movement.partyType : "—"}
                  </div>
                  <div className="col-span-2 text-white/60 truncate" title={movement.contractLabel || movement.contractId}>
                    {movement.contractLabel || movement.contractId}
                  </div>
                  <div className="col-span-2 text-white/60 truncate" title={movement.propertyLabel || movement.propertyId}>
                    {movement.propertyLabel || movement.propertyId}
                  </div>
                  <div className="col-span-1 flex justify-end">
                    {movement.status === "READY_TO_TRANSFER" ? (
                      <button
                        type="button"
                        onClick={() => void transferMovement(movement._id)}
                        disabled={transferingId === movement._id}
                        className="rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-2 py-1 text-xs hover:bg-emerald-400/20 disabled:opacity-60"
                      >
                        {transferingId === movement._id ? "..." : "Transferir"}
                      </button>
                    ) : (
                      <span className="text-xs text-white/40">—</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
