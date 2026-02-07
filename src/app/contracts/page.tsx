"use client";

import Link from "next/link";
import BackButton from "@/app/components/BackButton";
import { useEffect, useMemo, useState } from "react";
import { useToast } from "@/app/components/ToastProvider";

type ContractStatus = "DRAFT" | "ACTIVE" | "EXPIRING" | "ENDED" | "TERMINATED";
type StatusFilter = "ALL" | ContractStatus;

type PersonDTO = {
  _id: string;
  code?: string;
  type: "OWNER" | "TENANT" | string;
  fullName: string;
  email?: string;
  phone?: string;
};

type PropertyDTO = {
  _id: string;
  code: string;
  addressLine: string;
  unit?: string;
  city?: string;
  province?: string;
};

type InstallmentStatus = "PENDING" | "PAID" | "OVERDUE" | "PARTIAL" | "REFINANCED";

type InstallmentDTO = {
  _id: string;
  contractId: string;
  period: string;
  dueDate: string;
  amount: number;
  lateFeeAccrued?: number;
  status: InstallmentStatus;
  paidAmount?: number;
  paidAt?: string | null;
};

type ContractBillingDTO = {
  baseRent?: number;
  currency?: string;
  dueDay?: number;
  actualizacionCadaMeses?: number;
  ajustes?: { n: number; percentage: number }[];
  lateFeePolicy?: { type: "NONE" | "FIXED" | "PERCENT"; value: number };
  notes?: string;

  // ✅ campos reales que usa la UI
  commissionMonthlyPct?: number;
  commissionTotalPct?: number;
};

type ContractDTO = {
  _id: string;
  code: string;
  status: ContractStatus;

  propertyId: PropertyDTO | string;
  ownerId: PersonDTO | string;
  tenantPersonId: PersonDTO | string;

  startDate: string;
  endDate: string;

  billing?: ContractBillingDTO;

  montoBase?: number;
  duracion?: number;
  duracionMeses?: number;
  valorCuota?: number;
  diaVencimiento?: number;

  // compat si viene en root
  actualizacionCadaMeses?: number;
  ajustes?: { n: number; percentage: number }[];
  lateFeePolicy?: { type: "NONE" | "FIXED" | "PERCENT"; value: number };

  commissionMonthlyPct?: number;
  commissionTotalPct?: number;

  createdAt: string;
  updatedAt: string;
};

type ContractsListResponse =
  | { ok: true; contracts: ContractDTO[] }
  | { ok: false; error?: string; message?: string };

function safeText(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function getProperty(c: ContractDTO): PropertyDTO | null {
  return typeof c.propertyId === "string" ? null : c.propertyId;
}

function getOwner(c: ContractDTO): PersonDTO | null {
  return typeof c.ownerId === "string" ? null : c.ownerId;
}

function getTenant(c: ContractDTO): PersonDTO | null {
  return typeof c.tenantPersonId === "string" ? null : c.tenantPersonId;
}

function statusBadge(status: ContractStatus) {
  switch (status) {
    case "ACTIVE":
      return { label: "Activo", cls: "border-emerald-500/30 bg-emerald-500/15 text-emerald-200" };
    case "DRAFT":
      return { label: "Borrador", cls: "border-white/10 bg-white/5 text-neutral-200" };
    case "EXPIRING":
      return { label: "Por vencer", cls: "border-amber-500/30 bg-amber-500/15 text-amber-200" };
    case "ENDED":
      return { label: "Finalizado", cls: "border-neutral-500/30 bg-neutral-500/10 text-neutral-200" };
    case "TERMINATED":
      return { label: "Rescindido", cls: "border-red-500/30 bg-red-500/10 text-red-200" };
  }
}

function formatARS(n: number) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(n);
}

type InstallmentSim = {
  periodo: string;
  vencimiento: string;
  monto: number;
  montoConMora: number;
  estado: string;
  pagado: boolean;
  pago: string;
};

function installmentStatusLabel(status: InstallmentStatus): string {
  switch (status) {
    case "PAID":
      return "Pagada";
    case "OVERDUE":
      return "Vencida";
    case "PARTIAL":
      return "Parcial";
    case "REFINANCED":
      return "Refinanciada";
    default:
      return "Pendiente";
  }
}

function moraLabel(type: "NONE" | "FIXED" | "PERCENT"): string {
  if (type === "FIXED") return "Fija";
  if (type === "PERCENT") return "Porcentaje";
  return "Sin interés";
}

/** ✅ lee comisión desde billing o root, sin ts-expect-error */
function getPctField(contrato: ContractDTO, field: "commissionMonthlyPct" | "commissionTotalPct"): number {
  const fromBilling = contrato.billing?.[field];
  if (typeof fromBilling === "number" && Number.isFinite(fromBilling)) return fromBilling;

  const fromRoot = contrato[field];
  if (typeof fromRoot === "number" && Number.isFinite(fromRoot)) return fromRoot;

  return 0;
}

export default function ContractsPage() {
  const toast = useToast();

  const [err, setErr] = useState("");
  const [contracts, setContracts] = useState<ContractDTO[]>([]);

  const [q, setQ] = useState("");
  const [status, setStatus] = useState<StatusFilter>("ALL");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const [viewModal, setViewModal] = useState<{ open: boolean; contrato: ContractDTO | null; cuotas: InstallmentSim[] }>(
    { open: false, contrato: null, cuotas: [] }
  );
  const [viewLoading, setViewLoading] = useState(false);

  const [deleteModal, setDeleteModal] = useState<{ open: boolean; contrato: ContractDTO | null }>({
    open: false,
    contrato: null,
  });

  async function load(opts?: { cancelled?: () => boolean }) {
    setErr("");
    try {
      const res = await fetch("/api/contracts", { cache: "no-store" });
      const data = (await res.json()) as ContractsListResponse;

      if (opts?.cancelled?.()) return;

      if (!data.ok) {
        setContracts([]);
        const msg =
          "error" in data && data.error
            ? data.error
            : "message" in data && data.message
              ? data.message
              : "Error";
        setErr(msg);
        return;
      }

      setContracts(data.contracts ?? []);
    } catch (e) {
      console.error(e);
      if (opts?.cancelled?.()) return;
      setContracts([]);
      setErr("No se pudo cargar contratos");
    }
  }

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      await load({ cancelled: () => cancelled });
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  function generarCuotasSimuladas(contrato: ContractDTO): InstallmentSim[] {
    const duracion = Number(contrato.duracionMeses ?? contrato.duracion) || 0;
    const baseRent = Number(contrato.valorCuota ?? contrato.billing?.baseRent ?? contrato.montoBase ?? 0);
    if (!duracion || !contrato.startDate) return [];

    const startDate = new Date(contrato.startDate);
    if (Number.isNaN(startDate.getTime())) return [];
    startDate.setHours(12, 0, 0, 0);

    const cuotas: InstallmentSim[] = [];
    for (let i = 0; i < duracion; i++) {
      const fechaVenc = new Date(startDate);
      fechaVenc.setMonth(fechaVenc.getMonth() + i);

      const periodo = `${fechaVenc.getFullYear()}-${String(fechaVenc.getMonth() + 1).padStart(2, "0")}`;
      const vencimiento = fechaVenc.toISOString().slice(0, 10);

      cuotas.push({
        periodo,
        vencimiento,
        monto: baseRent,
        montoConMora: baseRent,
        estado: "Pendiente",
        pagado: false,
        pago: "-",
      });
    }
    return cuotas;
  }

  async function openViewModal(contrato: ContractDTO) {
    setViewModal({ open: true, contrato, cuotas: [] });
    setViewLoading(true);

    try {
      const res = await fetch(`/api/contracts/${contrato._id}`, { cache: "no-store" });
      const data = (await res.json()) as {
        ok?: boolean;
        contract?: ContractDTO;
        installments?: InstallmentDTO[];
        error?: string;
      };

      if (!res.ok || !data?.ok || !data.contract) throw new Error(data?.error || "No se pudo cargar detalle del contrato");

      const serverContract = data.contract;
      const installmentsRaw: InstallmentDTO[] = Array.isArray(data.installments) ? data.installments : [];

      const cuotas = installmentsRaw.map<InstallmentSim>((i) => {
        const late = Number(i.lateFeeAccrued || 0);
        return {
          periodo: i.period,
          vencimiento: i.dueDate ? i.dueDate.slice(0, 10) : "-",
          monto: i.amount,
          montoConMora: i.amount + late,
          estado: installmentStatusLabel(i.status),
          pagado: i.status === "PAID",
          pago: i.paidAt ? i.paidAt.slice(0, 10) : "-",
        };
      });

      setViewModal({
        open: true,
        contrato: serverContract,
        cuotas: cuotas.length ? cuotas : generarCuotasSimuladas(serverContract),
      });
    } catch (e) {
      toast.show?.(e instanceof Error ? e.message : "No se pudieron cargar cuotas");
      setViewModal({ open: true, contrato, cuotas: generarCuotasSimuladas(contrato) });
    } finally {
      setViewLoading(false);
    }
  }

  const filtered = useMemo(() => {
    return contracts.filter((c) => {
      if (status !== "ALL" && c.status !== status) return false;
      if (from && c.startDate < from) return false;
      if (to && c.endDate > to) return false;

      const p = getProperty(c);
      const o = getOwner(c);
      const t = getTenant(c);

      const hay = [
        c.code,
        c._id,
        p?.code || "",
        p?.addressLine || "",
        p?.unit || "",
        p?.city || "",
        p?.province || "",
        o?.fullName || "",
        o?.code || "",
        o?.email || "",
        o?.phone || "",
        t?.fullName || "",
        t?.code || "",
        t?.email || "",
        t?.phone || "",
        c.status,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return hay.includes(q.toLowerCase());
    });
  }, [contracts, q, status, from, to]);

  const stats = useMemo(() => {
    const activos = filtered.filter((c) => c.status === "ACTIVE").length;
    const total = filtered.length;
    const sumaBase = filtered.reduce((acc, c) => acc + (Number(c.billing?.baseRent) || Number(c.montoBase) || 0), 0);
    return { total, activos, sumaBase };
  }, [filtered]);

  return (
    <main className="min-h-screen px-5 py-8 text-white" style={{ background: "var(--background)" }}>
      <div className="mx-auto max-w-6xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold">Contratos</h1>
            <p className="text-sm opacity-70">Listado y gestión de contratos</p>
          </div>

          <div className="flex items-center gap-2">
            <BackButton />
            <Link
              href="/contracts/new"
              title="Nuevo contrato"
              aria-label="Nuevo contrato"
              className="flex items-center justify-center w-10 h-10 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 transition text-lg font-semibold"
              style={{ color: "var(--benetton-green)" }}
            >
              +
            </Link>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href="/installments"
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm hover:bg-white/10 transition"
          >
            Ir a Alquiler mensual
          </Link>
          <Link
            href="/payments"
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm hover:bg-white/10 transition"
          >
            Ir a Pagos
          </Link>
        </div>

        {err ? (
          <div className="mt-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {err}
          </div>
        ) : null}

        <div className="mt-6 grid grid-cols-3 gap-4">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="text-xs text-neutral-400">CONTRATOS</div>
            <div className="text-2xl font-semibold mt-1">{stats.total}</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="text-xs text-neutral-400">ACTIVOS</div>
            <div className="text-2xl font-semibold mt-1">{stats.activos}</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="text-xs text-neutral-400">SUMA BASE (FILTRADOS)</div>
            <div className="text-2xl font-semibold mt-1">{formatARS(stats.sumaBase)}</div>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
          <div className="px-5 py-4 border-b border-white/10 text-sm font-semibold">Filtros</div>
          <div className="px-5 py-4 grid grid-cols-1 sm:grid-cols-6 gap-4">
            <div className="sm:col-span-3">
              <div className="text-xs text-white/50 mb-2">BÚSQUEDA</div>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Código, dirección, propietario, inquilino..."
                className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-white/10"
              />
            </div>

            <div className="sm:col-span-1">
              <div className="text-xs text-white/50 mb-2">ESTADO</div>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as StatusFilter)}
                className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-white/10"
              >
                <option value="ALL">Todos</option>
                <option value="ACTIVE">Activo</option>
                <option value="DRAFT">Borrador</option>
                <option value="EXPIRING">Por vencer</option>
                <option value="ENDED">Finalizado</option>
                <option value="TERMINATED">Rescindido</option>
              </select>
            </div>

            <div className="sm:col-span-2 grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs text-white/50 mb-2">DESDE</div>
                <input
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  placeholder="yyyy-mm-dd"
                  className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-white/10"
                />
              </div>
              <div>
                <div className="text-xs text-white/50 mb-2">HASTA</div>
                <input
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  placeholder="yyyy-mm-dd"
                  className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-white/10"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Tabla */}
        <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
          <div className="px-5 py-4 border-b border-white/10 text-sm font-semibold">Contratos ({filtered.length})</div>

          <div className="p-4">
            <div className="rounded-xl border border-white/10 overflow-hidden">
              <div className="grid grid-cols-12 gap-0 bg-white/5 text-xs text-neutral-300 px-4 py-3">
                <div className="col-span-1">Estado</div>
                <div className="col-span-2">Código</div>
                <div className="col-span-4">Propiedad</div>
                <div className="col-span-2 -ml-6">Propietario</div>
                <div className="col-span-1 -ml-6">Inquilino</div>
                <div className="col-span-2 text-right">Acción</div>
              </div>

              {filtered.length === 0 ? (
                <div className="px-4 py-10 text-sm text-neutral-400">Sin resultados.</div>
              ) : (
                filtered.map((c) => {
                  const p = getProperty(c);
                  const o = getOwner(c);
                  const t = getTenant(c);
                  const badge = statusBadge(c.status);
                  const propLine = p ? `${p.addressLine}${p.unit ? `, ${p.unit}` : ""}` : safeText(c.propertyId);

                  return (
                    <div
                      key={c._id}
                      className="grid grid-cols-12 gap-0 px-4 py-3 border-t border-white/10 text-sm items-center"
                    >
                      <div className="col-span-1">
                        <span className={`inline-flex items-center rounded-xl border px-2.5 py-1 text-xs ${badge.cls}`}>
                          {badge.label}
                        </span>
                      </div>

                      <div className="col-span-2">
                        <div className="text-neutral-200 font-semibold">{c.code}</div>
                      </div>

                      <div className="col-span-4">
                        <div className="text-neutral-200">{propLine || "—"}</div>
                      </div>

                      <div className="col-span-2 -ml-6">
                        <div className="text-neutral-200">{o?.fullName || "—"}</div>
                      </div>

                      <div className="col-span-1 -ml-6">
                        <div className="text-neutral-200">{t?.fullName || "—"}</div>
                      </div>

                      <div className="col-span-2 flex justify-end w-full gap-2">
                        <button
                          className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs hover:bg-white/10 transition whitespace-nowrap"
                          title="Ver"
                          onClick={() => void openViewModal(c)}
                        >
                          Ver
                        </button>

                        <Link
                          href={`/contracts/new?id=${c._id}`}
                          className="rounded-xl border border-blue-500/30 bg-blue-500/10 px-3 py-1.5 text-xs text-blue-300 hover:bg-blue-500/20 transition whitespace-nowrap"
                          title="Editar"
                        >
                          Editar
                        </Link>

                        <button
                          className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs text-red-300 hover:bg-red-500/20 transition whitespace-nowrap"
                          title="Borrar"
                          onClick={() => setDeleteModal({ open: true, contrato: c })}
                        >
                          Borrar
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Modal VER */}
        {viewModal.open && viewModal.contrato ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
            <div className="mx-auto rounded-2xl border border-white/10 bg-neutral-900 shadow-2xl py-6 px-8 relative w-full max-w-5xl max-h-[85vh] overflow-y-auto">
              <button
                className="absolute top-4 right-4 w-9 h-9 flex items-center justify-center rounded-full bg-neutral-800 hover:bg-neutral-700 transition text-white border border-white/10"
                type="button"
                aria-label="Cerrar"
                onClick={() => setViewModal({ open: false, contrato: null, cuotas: [] })}
                title="Cerrar"
              >
                ✕
              </button>

              <h2 className="text-xl font-bold text-green-400 mb-4">Contrato {viewModal.contrato.code}</h2>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-neutral-200 space-y-2">
                  <div>
                    <span className="font-semibold text-neutral-400">Estado:</span>{" "}
                    {statusBadge(viewModal.contrato.status).label}
                  </div>
                  <div>
                    <span className="font-semibold text-neutral-400">Propietario:</span>{" "}
                    {getOwner(viewModal.contrato)?.fullName || "—"}
                  </div>
                  <div>
                    <span className="font-semibold text-neutral-400">Inquilino:</span>{" "}
                    {getTenant(viewModal.contrato)?.fullName || "—"}
                  </div>
                  <div>
                    <span className="font-semibold text-neutral-400">Inicio:</span>{" "}
                    {(() => {
                      if (!viewModal.contrato.startDate) return "-";
                      const d = new Date(viewModal.contrato.startDate);
                      if (isNaN(d.getTime())) return String(viewModal.contrato.startDate);
                      return d.toLocaleDateString("es-AR", { timeZone: "UTC" });
                    })()}
                  </div>
                  <div>
                    <span className="font-semibold text-neutral-400">Fin:</span>{" "}
                    {(() => {
                      if (!viewModal.contrato.endDate) return "-";
                      const d = new Date(viewModal.contrato.endDate);
                      if (isNaN(d.getTime())) return String(viewModal.contrato.endDate);
                      return d.toLocaleDateString("es-AR", { timeZone: "UTC" });
                    })()}
                  </div>
                  <div>
                    <span className="font-semibold text-neutral-400">Base:</span>{" "}
                    {formatARS(
                      Number(
                        viewModal.contrato.valorCuota ??
                          viewModal.contrato.billing?.baseRent ??
                          viewModal.contrato.montoBase ??
                          0
                      )
                    )}
                  </div>
                  <div>
                    <span className="font-semibold text-neutral-400">Actualización:</span>{" "}
                    {(() => {
                      const cada =
                        viewModal.contrato.actualizacionCadaMeses ??
                        viewModal.contrato.billing?.actualizacionCadaMeses ??
                        0;

                      const hasAdjustments =
                        (viewModal.contrato.ajustes?.length ?? 0) > 0 ||
                        (viewModal.contrato.billing?.ajustes?.length ?? 0) > 0;

                      return hasAdjustments ? `${cada} meses` : "Sin";
                    })()}
                  </div>
                  <div>
                    <span className="font-semibold text-neutral-400">% actualización:</span>{" "}
                    {(() => {
                      const a1 = viewModal.contrato.ajustes?.[0]?.percentage;
                      const a2 = viewModal.contrato.billing?.ajustes?.[0]?.percentage;
                      return Number(a1 ?? a2 ?? 0);
                    })()}
                    %
                  </div>
                  <div>
                    <span className="font-semibold text-neutral-400">Mora:</span>{" "}
                    {(() => {
                      const type =
                        viewModal.contrato.lateFeePolicy?.type ??
                        viewModal.contrato.billing?.lateFeePolicy?.type ??
                        "NONE";
                      return moraLabel(type);
                    })()}
                  </div>
                  <div>
                    <span className="font-semibold text-neutral-400">Valor mora:</span>{" "}
                    {(() => {
                      const type =
                        viewModal.contrato.lateFeePolicy?.type ??
                        viewModal.contrato.billing?.lateFeePolicy?.type ??
                        "NONE";
                      const value =
                        viewModal.contrato.lateFeePolicy?.value ??
                        viewModal.contrato.billing?.lateFeePolicy?.value ??
                        0;
                      if (type === "PERCENT") return `${value}%`;
                      if (type === "FIXED") return formatARS(Number(value));
                      return "—";
                    })()}
                  </div>

                  <div>
                    <span className="font-semibold text-neutral-400">Comisión mensual:</span>{" "}
                    {(() => {
                      const pct = getPctField(viewModal.contrato, "commissionMonthlyPct");
                      const base = Number(
                        viewModal.contrato.valorCuota ??
                          viewModal.contrato.billing?.baseRent ??
                          viewModal.contrato.montoBase ??
                          0
                      );
                      const monto = Math.round((base * pct) / 100);
                      return `${pct}% ($${monto.toLocaleString("es-AR")})`;
                    })()}
                  </div>
                  <div>
                    <span className="font-semibold text-neutral-400">Comisión total:</span>{" "}
                    {(() => {
                      const pct = getPctField(viewModal.contrato, "commissionTotalPct");
                      const base = Number(
                        viewModal.contrato.valorCuota ??
                          viewModal.contrato.billing?.baseRent ??
                          viewModal.contrato.montoBase ??
                          0
                      );
                      const meses = Number(viewModal.contrato.duracionMeses ?? viewModal.contrato.duracion ?? 0);
                      const monto = Math.round((base * meses * pct) / 100);
                      return `${pct}% ($${monto.toLocaleString("es-AR")})`;
                    })()}
                  </div>

                  <div className="pt-2">
                    <Link
                      href="/documentation"
                      className="inline-flex items-center rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs hover:bg-white/10 transition"
                    >
                      Ir a documentación
                    </Link>
                  </div>
                </div>

                <div className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
                  <div className="px-3 py-2 text-xs text-neutral-300 border-b border-white/10">Alquiler a pagar</div>
                  {viewLoading ? (
                    <div className="px-3 py-4 text-sm text-neutral-400">Cargando cuotas...</div>
                  ) : (
                    <>
                      <div className="grid grid-cols-4 gap-2 px-3 py-2 text-xs text-neutral-400">
                        <div>Periodo</div>
                        <div>Vence</div>
                        <div>Importe</div>
                        <div>Estado</div>
                      </div>
                      <div className="divide-y divide-white/10">
                        {viewModal.cuotas.map((c, idx) => (
                          <div
                            key={`${c.periodo}-${idx}`}
                            className="grid grid-cols-4 gap-2 px-3 py-2 text-xs text-neutral-200"
                          >
                            <div>{c.periodo}</div>
                            <div>{c.vencimiento}</div>
                            <div>{formatARS(c.montoConMora)}</div>
                            <div>{c.estado}</div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {/* Modal BORRAR */}
        {deleteModal.open && deleteModal.contrato ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
            <div className="mx-auto rounded-2xl border border-red-500/30 bg-neutral-900 shadow-2xl py-6 px-6 relative flex flex-col items-center w-full max-w-md">
              <h2 className="text-xl font-bold text-red-400 mb-4">¿Eliminar contrato?</h2>
              <div className="text-neutral-200 mb-4 text-center">
                Se eliminará el contrato <span className="font-bold text-red-300">{deleteModal.contrato.code}</span>.
                <br />
                Esta acción no se puede deshacer.
              </div>
              <div className="flex gap-4 mt-2">
                <button
                  className="rounded-xl px-5 py-2 text-white font-semibold shadow bg-red-600 hover:brightness-110 text-base"
                  onClick={() => {
                    void (async () => {
                      try {
                        const res = await fetch(`/api/contracts/${String(deleteModal.contrato?._id)}`, {
                          method: "DELETE",
                        });
                        const data = (await res.json()) as { ok?: boolean; message?: string };
                        if (!data.ok) {
                          toast.show?.(data.message || "No se pudo eliminar el contrato");
                          setDeleteModal({ open: false, contrato: null });
                          return;
                        }
                        toast.show?.("Contrato eliminado correctamente");
                        setDeleteModal({ open: false, contrato: null });
                        await load();
                      } catch {
                        toast.show?.("Error eliminando contrato");
                        setDeleteModal({ open: false, contrato: null });
                      }
                    })();
                  }}
                >
                  Eliminar
                </button>
                <button
                  className="rounded-xl px-5 py-2 text-white font-semibold shadow bg-neutral-800 hover:bg-neutral-700 text-base border border-white/10"
                  onClick={() => setDeleteModal({ open: false, contrato: null })}
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}
