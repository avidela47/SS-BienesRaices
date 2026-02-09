"use client";

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
  // fallback a root si no está
  const br = safeNumber(b.baseRent, NaN);
  if (Number.isFinite(br)) return br;
  if (isObj(contract)) return safeNumber(contract.montoBase, 0);
  return 0;
}

function getCurrency(contract: unknown): string {
  const b = getBilling(contract);
  const c = safeString(b.currency, "");
  if (c) return c;
  if (isObj(contract)) {
    const cr = safeString(contract.currency, "ARS");
    return cr || "ARS";
  }
  return "ARS";
}

function getCommissionMonthlyPct(contract: unknown): number {
  const b = getBilling(contract);
  const v = safeNumber(b.commissionMonthlyPct, NaN);
  if (Number.isFinite(v)) return v;
  if (isObj(contract)) return safeNumber(contract.commissionMonthlyPct, 0);
  return 0;
}

function getCommissionTotalPct(contract: unknown): number {
  const b = getBilling(contract);
  const v = safeNumber(b.commissionTotalPct, NaN);
  if (Number.isFinite(v)) return v;
  if (isObj(contract)) return safeNumber(contract.commissionTotalPct, 0);
  return 0;
}

type LateFeePolicy = { type: "NONE" | "FIXED" | "PERCENT"; value: number };

function getLateFeePolicy(contract: unknown): LateFeePolicy {
  const b = getBilling(contract);
  const lfpBilling = isObj(b) && isObj(b.lateFeePolicy) ? (b.lateFeePolicy as Record<string, unknown>) : null;

  // fallback root si no está en billing
  const root = isObj(contract) && isObj(contract.lateFeePolicy) ? (contract.lateFeePolicy as Record<string, unknown>) : null;

  const src = lfpBilling || root;

  const type = src && typeof src.type === "string" ? (src.type as LateFeePolicy["type"]) : "NONE";
  const value = src ? safeNumber(src.value, 0) : 0;

  if (type !== "NONE" && type !== "FIXED" && type !== "PERCENT") return { type: "NONE", value: 0 };
  return { type, value };
}

function lateFeeLabel(p: LateFeePolicy) {
  if (p.type === "NONE") return { label: "Sin interés", value: "—" };
  if (p.type === "FIXED") return { label: "Fijo", value: formatARS(p.value) };
  return { label: "Porcentaje", value: `${p.value}%` };
}

type InstallmentRow = {
  _id: string;
  code: string; // period "YYYY-MM"
  contractId: string;
  monthIndex: number;
  dueDate: string; // "YYYY-MM-DD"
  amount: number;
  paidAmount: number;
  status: string;
  lateFeeAccrued?: number;
};

function toInstallmentRow(v: unknown): InstallmentRow {
  const o = isObj(v) ? v : {};
  const late = isObj(o) ? safeNumber(o["lateFeeAccrued"], 0) : 0;

  return {
    _id: safeString(o._id),
    code: safeString(o.code),
    contractId: safeString(o.contractId),
    monthIndex: safeNumber(o.monthIndex, 0),
    dueDate: safeString(o.dueDate),
    amount: safeNumber(o.amount, 0),
    paidAmount: safeNumber(o.paidAmount, 0),
    status: safeString(o.status),
    lateFeeAccrued: late,
  };
}

type Props = { params: { id: string } };

export default function ContractDetailPage({ params }: Props) {
  const id = params.id;

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string>("");
  const [data, setData] = useState<ContractDetailOk | null>(null);

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

    const pendingLeft = installments.filter((x) => x.status === "PENDING").length;
    const isActiveFamily = st === "ACTIVE" || st === "EXPIRING";

    if (isActiveFamily && pendingLeft > 0 && pendingLeft <= 3) return "Por vencer";
    if (st === "ACTIVE") return "Activo";
    if (st === "TERMINATED") return "Rescindido";
    if (st === "ENDED") return "Finalizado";
    if (st === "EXPIRING") return "Activo";
    return st || "—";
  }, [contract, installments]);

  const baseRent = contract ? getBaseRent(contract) : 0;
  const currency = contract ? getCurrency(contract) : "ARS";
  const commissionMonthlyPct = contract ? getCommissionMonthlyPct(contract) : 0;
  const commissionTotalPct = contract ? getCommissionTotalPct(contract) : 0;

  const lateFee = contract ? getLateFeePolicy(contract) : { type: "NONE" as const, value: 0 };
  const lateFeeText = lateFeeLabel(lateFee);

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

      <div className="mt-6 grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="text-xs text-neutral-400">Cuota base</div>
          <div className="text-2xl font-semibold">{formatARS(baseRent)}</div>
          <div className="text-xs text-neutral-500 mt-1">Moneda: {currency}</div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="text-xs text-neutral-400">Mora</div>
          <div className="text-2xl font-semibold">{lateFeeText.label}</div>
          <div className="text-xs text-neutral-500 mt-1">Valor mora: {lateFeeText.value}</div>
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

        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="text-xs text-neutral-400">Facturado</div>
          <div className="text-2xl font-semibold">{formatARS(totals.billed)}</div>
          <div className="text-xs text-neutral-500 mt-1">
            Saldo: {formatARS(totals.balance)}
            <br />
            Pagado: {formatARS(totals.paid)}
          </div>
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

      {/* Cuotas (sin tocar tu flujo de pagos) */}
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
                      disabled={isPaid || remaining <= 0}
                    >
                      Registrar pago
                    </button>

                    {isPartial ? (
                      <button className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-1.5 text-xs text-red-100 hover:bg-red-500/15 transition">
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
    </div>
  );
}
