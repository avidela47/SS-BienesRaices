
"use client";

function getCommissionMonthlyPct(contract: unknown): number {
  const b = getBilling(contract);
  return safeNumber(b.commissionMonthlyPct, 0);
}

function getCommissionTotalPct(contract: unknown): number {
  const b = getBilling(contract);
  return safeNumber(b.commissionTotalPct, 0);
}

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Totals = { billed: number; paid: number; balance: number };

type ContractDetailOk = {
  ok: true;
  contract: unknown;
  installments: unknown[];
  payments: unknown[];
  totals: Totals;
};

type ContractDetailErr = { ok: false; error: string; detail?: string };

type ContractDetailResponse = ContractDetailOk | ContractDetailErr;

function formatARS(n: number) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(n);
}

function safeNumber(v: unknown, fallback = 0): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

function safeString(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function getCode(v: unknown): string {
  if (isObj(v) && typeof v.code === "string") return v.code;
  return "";
}

function getFullName(v: unknown): string {
  if (isObj(v) && typeof v.fullName === "string") return v.fullName;
  return "";
}

function getAddressLine(v: unknown): string {
  if (isObj(v) && typeof v.addressLine === "string") return v.addressLine;
  return "";
}

function getUnit(v: unknown): string {
  if (isObj(v) && typeof v.unit === "string") return v.unit;
  return "";
}

function getCity(v: unknown): string {
  if (isObj(v) && typeof v.city === "string") return v.city;
  return "";
}

function getProvince(v: unknown): string {
  if (isObj(v) && typeof v.province === "string") return v.province;
  return "";
}

function getStatus(v: unknown): string {
  if (isObj(v) && typeof v.status === "string") return v.status;
  return "";
}

function getBilling(v: unknown): Record<string, unknown> {
  if (isObj(v) && isObj(v.billing)) return v.billing;
  return {};
}

function getBaseRent(contract: unknown): number {
  const b = getBilling(contract);
  return safeNumber(b.baseRent, 0);
}

function getCurrency(contract: unknown): string {
  const b = getBilling(contract);
  const c = safeString(b.currency, "ARS");
  return c || "ARS";
}

type InstallmentRow = {
  _id: string;
  code: string;
  contractId: string;
  monthIndex: number;
  dueDate: string;
  amount: number;
  paidAmount: number;
  status: string;
};

function toInstallmentRow(v: unknown): InstallmentRow {
  const o = isObj(v) ? v : {};
  return {
    _id: safeString(o._id),
    code: safeString(o.code),
    contractId: safeString(o.contractId),
    monthIndex: safeNumber(o.monthIndex, 0),
    dueDate: safeString(o.dueDate),
    amount: safeNumber(o.amount, 0),
    paidAmount: safeNumber(o.paidAmount, 0),
    status: safeString(o.status),
  };
}

type Props = { params: { id: string } };

export default function ContractDetailPage({ params }: Props) {
  const id = params.id;

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string>("");
  const [data, setData] = useState<ContractDetailOk | null>(null);

  // Modal pago
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentInstallmentId, setPaymentInstallmentId] = useState<string>("");
  const [paymentAmount, setPaymentAmount] = useState<string>("");
  const [paymentNotes, setPaymentNotes] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<string>("cash");
  const [savingPayment, setSavingPayment] = useState(false);
  const [paymentError, setPaymentError] = useState<string>("");

  // Modal anular pago parcial
  const [showUndoPartialModal, setShowUndoPartialModal] = useState(false);
  const [undoInstallmentId, setUndoInstallmentId] = useState<string>("");
  const [undoSaving, setUndoSaving] = useState(false);
  const [undoError, setUndoError] = useState<string>("");

  async function load() {
    setLoading(true);
    setErr("");
    try {
      const res = await fetch(`/api/contracts/${id}`, { cache: "no-store" });
      const json = (await res.json()) as ContractDetailResponse;

      if (!json.ok) {
        setData(null);
        setErr(json.error || "Error");
        return;
      }

      setData(json);
    } catch (e) {
      console.error(e);
      setData(null);
      setErr("No se pudo cargar el contrato");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const contract = data?.contract ?? null;

  const installments = useMemo(() => {
    const raw = data?.installments ?? [];
    return raw.map(toInstallmentRow).sort((a, b) => a.monthIndex - b.monthIndex);
  }, [data]);

  const totals = useMemo<Totals>(() => {
    if (data?.totals) return data.totals;
    const billed = installments.reduce((acc, it) => acc + (Number.isFinite(it.amount) ? it.amount : 0), 0);
    const paid = installments.reduce((acc, it) => acc + (Number.isFinite(it.paidAmount) ? it.paidAmount : 0), 0);
    return { billed, paid, balance: billed - paid };
  }, [data, installments]);

  function openPayModal(installmentId: string, suggestedAmount: number) {
    setPaymentError("");
    setPaymentInstallmentId(installmentId);
    setPaymentAmount(String(suggestedAmount));
    setPaymentNotes("");
    setPaymentMethod("cash");
    setShowPaymentModal(true);
  }

  function openUndoPartialModal(installmentId: string) {
    setUndoError("");
    setUndoInstallmentId(installmentId);
    setShowUndoPartialModal(true);
  }

  async function confirmPayment() {
    setPaymentError("");
    setSavingPayment(true);
    try {
      if (!paymentInstallmentId) throw new Error("Falta cuota");
      const amt = Number(paymentAmount);
      if (!Number.isFinite(amt) || amt <= 0) throw new Error("Monto inválido");

      const res = await fetch(`/api/installments/${paymentInstallmentId}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: amt, method: paymentMethod, notes: paymentNotes }),
      });

      const json = (await res.json()) as { ok?: boolean; error?: string; message?: string };
      if (!res.ok || !json?.ok) throw new Error(json?.message || json?.error || "No se pudo registrar el pago");

      setShowPaymentModal(false);
      await load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error";
      setPaymentError(msg);
    } finally {
      setSavingPayment(false);
    }
  }

  async function confirmUndoPartial() {
    setUndoError("");
    setUndoSaving(true);
    try {
      if (!undoInstallmentId) throw new Error("Falta cuota");

      const res = await fetch(`/api/installments/${undoInstallmentId}/undo-partial`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const json = (await res.json()) as { ok?: boolean; error?: string; message?: string };
      if (!res.ok || !json?.ok) throw new Error(json?.message || json?.error || "No se pudo anular el pago parcial");

      setShowUndoPartialModal(false);
      await load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error";
      setUndoError(msg);
    } finally {
      setUndoSaving(false);
    }
  }

  const property = useMemo(() => {
    if (!contract) return null;
    if (isObj(contract) && "propertyId" in contract) return (contract as Record<string, unknown>).propertyId;
    return null;
  }, [contract]);

  const owner = useMemo(() => {
    if (!contract) return null;
    if (isObj(contract) && "ownerId" in contract) return (contract as Record<string, unknown>).ownerId;
    return null;
  }, [contract]);

  const tenant = useMemo(() => {
    if (!contract) return null;
    if (isObj(contract) && "tenantPersonId" in contract) return (contract as Record<string, unknown>).tenantPersonId;
    return null;
  }, [contract]);

  const headerTitle = useMemo(() => {
    const code = contract ? getCode(contract) : "";
    return code ? `Contrato ${code}` : "Detalle de contrato";
  }, [contract]);

  const propLine = useMemo(() => {
    if (!property) return "—";
    const code = getCode(property);
    const addr = getAddressLine(property);
    const unit = getUnit(property);
    const city = getCity(property);
    const prov = getProvince(property);

    const first = [code, addr].filter(Boolean).join(" - ");
    const second = [unit ? `Unidad ${unit}` : "", [city, prov].filter(Boolean).join(", ")].filter(Boolean).join(" · ");
    return [first, second].filter(Boolean).join(" — ");
  }, [property]);

  const statusLabel = useMemo(() => {
    const st = contract ? getStatus(contract) : "";
    return st || "—";
  }, [contract]);

  const baseRent = contract ? getBaseRent(contract) : 0;
  const currency = contract ? getCurrency(contract) : "ARS";
  const commissionMonthlyPct = contract ? getCommissionMonthlyPct(contract) : 0;
  const commissionTotalPct = contract ? getCommissionTotalPct(contract) : 0;

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl w-full px-6 py-8">
        <div className="text-sm text-neutral-400">Cargando…</div>
      </div>
    );
  }

  if (err) {
    return (
      <div className="mx-auto max-w-6xl w-full px-6 py-8">
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-100">{err}</div>
        <div className="mt-4">
          <Link href="/contracts" className="text-sm underline text-neutral-200">
            Volver a contratos
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl w-full px-6 py-8">
      <div className="flex items-start justify-between gap-6">
        <div>
          <h1 className="text-3xl font-semibold flex items-center gap-2">
            <Link
              href="/contracts"
              title="Volver"
              className="inline-flex items-center justify-center w-10 h-10 rounded-full border border-white/20 bg-white/10 hover:bg-white/20 transition text-xl text-neutral-100 shadow-sm mr-1"
            >
              <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            {headerTitle}
          </h1>
          <div className="mt-1 text-sm text-neutral-400">{propLine}</div>
        </div>

        <div className="text-right">
          <div className="text-xs text-neutral-400">Estado</div>
          <div className="text-sm text-neutral-100">{statusLabel}</div>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="text-xs text-neutral-400">Cuota base</div>
          <div className="text-2xl font-semibold">{formatARS(baseRent)}</div>
          <div className="text-xs text-neutral-500 mt-1">Moneda: {currency}</div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="text-xs text-neutral-400">Comisión mensual (%)</div>
          <div className="text-2xl font-semibold">{commissionMonthlyPct || 0}%</div>
          <div className="text-xs text-neutral-500 mt-1">Se descuenta en liquidación mensual</div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="text-xs text-neutral-400">Comisión total contrato (%)</div>
          <div className="text-2xl font-semibold">{commissionTotalPct || 0}%</div>
          <div className="text-xs text-neutral-500 mt-1">Se descuenta del total del contrato</div>
        </div>

        {/* % actualización visual + botón */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="text-xs text-neutral-400">% actualización</div>
          <div className="text-2xl font-semibold">{/* Aquí deberías mostrar el valor real si lo tienes */}—</div>
          <div style={{ marginTop: 8 }}>
            <button type="button" className="btn btn-outline-primary" style={{ width: '100%' }}>
              Calcular % sugerido
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="text-xs text-neutral-400">Facturado</div>
          <div className="text-2xl font-semibold">{formatARS(totals.billed)}</div>
          <div className="text-xs text-neutral-500 mt-1">Saldo: {formatARS(totals.balance)}<br />Pagado: {formatARS(totals.paid)}</div>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="text-xs text-neutral-400">Titular</div>
          <div className="text-lg font-semibold">{owner ? getFullName(owner) : "—"}</div>
          <div className="text-xs text-neutral-500">Código: {owner ? getCode(owner) : "—"}</div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="text-xs text-neutral-400">Inquilino</div>
          <div className="text-lg font-semibold">{tenant ? getFullName(tenant) : "—"}</div>
          <div className="text-xs text-neutral-500">Código: {tenant ? getCode(tenant) : "—"}</div>
        </div>
      </div>

      {/* Cuotas */}
      <div className="mt-6 overflow-hidden rounded-2xl border border-white/10 bg-white/5">
        <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-neutral-100">Cuotas</div>
            <div className="text-xs text-neutral-400">Pagos parciales soportados</div>
          </div>
        </div>

        {installments.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-neutral-400">Sin cuotas</div>
        ) : (
          <div className="divide-y divide-white/10">
            {installments.map((it) => {
              const remaining = Math.max(0, it.amount - it.paidAmount);
              const isPaid = it.status === "PAID";
              const isPartial = it.status === "PARTIAL";
              const badge =
                it.status === "PAID"
                  ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-200"
                  : it.status === "PARTIAL"
                  ? "border-amber-500/30 bg-amber-500/15 text-amber-200"
                  : "border-white/10 bg-white/5 text-neutral-200";

              return (
                <div key={it._id} className="grid grid-cols-12 gap-2 px-4 py-3 items-center">
                  <div className="col-span-3">
                    <div className="text-sm text-neutral-100">{it.code || `Cuota ${it.monthIndex + 1}`}</div>
                    <div className="text-xs text-neutral-400">Vence: {it.dueDate || "—"}</div>
                  </div>

                  <div className="col-span-3">
                    <div className="text-sm text-neutral-100">{formatARS(it.amount)}</div>
                    <div className="text-xs text-neutral-400">
                      Pagado: {formatARS(it.paidAmount)} · Restante: {formatARS(remaining)}
                    </div>
                  </div>

                  <div className="col-span-2">
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] ${badge}`}>
                      {it.status}
                    </span>
                  </div>

                  <div className="col-span-4 flex justify-end gap-2">
                    <button
                      className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs hover:bg-white/10 transition disabled:opacity-50"
                      onClick={() => openPayModal(it._id, remaining)}
                      disabled={isPaid || remaining <= 0}
                    >
                      Registrar pago
                    </button>

                    {isPartial ? (
                      <button
                        className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-1.5 text-xs text-red-100 hover:bg-red-500/15 transition"
                        onClick={() => openUndoPartialModal(it._id)}
                      >
                        Anular parcial
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal Pago */}
      {showPaymentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-neutral-950 p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-lg font-semibold">Registrar pago</div>
                <div className="text-xs text-neutral-400">Se aplicará sobre la cuota seleccionada.</div>
              </div>
              <button
                onClick={() => setShowPaymentModal(false)}
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-sm hover:bg-white/10 transition"
              >
                Cerrar
              </button>
            </div>

            {paymentError ? (
              <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-100">{paymentError}</div>
            ) : null}

            <div className="mt-4 space-y-3">
              <div>
                <label className="block mb-1 text-sm font-medium">Monto</label>
                <input
                  className="w-full rounded border px-2 py-1 bg-neutral-800 text-black text-sm"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  placeholder="0"
                  type="number"
                  min="0"
                />
              </div>

              <div>
                <label className="block mb-1 text-sm font-medium">Método</label>
                <select
                  className="w-full rounded border px-2 py-1 bg-neutral-800 text-black text-sm"
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                >
                  <option value="cash">Efectivo</option>
                  <option value="transfer">Transferencia</option>
                  <option value="mp">Mercado Pago</option>
                  <option value="other">Otro</option>
                </select>
              </div>

              <div>
                <label className="block mb-1 text-sm font-medium">Notas</label>
                <input
                  className="w-full rounded border px-2 py-1 bg-neutral-800 text-black text-sm"
                  value={paymentNotes}
                  onChange={(e) => setPaymentNotes(e.target.value)}
                  placeholder="Opcional"
                />
              </div>

              <div className="flex items-center justify-end gap-2 mt-4">
                <button
                  onClick={() => setShowPaymentModal(false)}
                  className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm hover:bg-white/10 transition"
                  disabled={savingPayment}
                >
                  Cancelar
                </button>
                <button
                  onClick={() => void confirmPayment()}
                  className="rounded-xl border border-emerald-500/20 bg-emerald-500/15 px-4 py-2 text-sm text-emerald-100 hover:bg-emerald-500/20 transition disabled:opacity-60"
                  disabled={savingPayment}
                >
                  {savingPayment ? "Guardando..." : "Confirmar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Anular parcial */}
      {showUndoPartialModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-neutral-950 p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-lg font-semibold">Anular pago parcial</div>
                <div className="text-xs text-neutral-400">Volverá la cuota a PENDING y se limpiará el pago aplicado.</div>
              </div>
              <button
                onClick={() => setShowUndoPartialModal(false)}
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-sm hover:bg-white/10 transition"
              >
                Cerrar
              </button>
            </div>

            {undoError ? (
              <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-100">{undoError}</div>
            ) : null}

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                onClick={() => setShowUndoPartialModal(false)}
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm hover:bg-white/10 transition"
                disabled={undoSaving}
              >
                Cancelar
              </button>
              <button
                onClick={() => void confirmUndoPartial()}
                className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-2 text-sm text-red-100 hover:bg-red-500/15 transition disabled:opacity-60"
                disabled={undoSaving}
              >
                {undoSaving ? "Procesando..." : "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
