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

type LateFeePolicy = { type: "NONE" | "FIXED" | "PERCENT"; value: number };

type ContractBillingDTO = {
  baseRent?: number;
  currency?: string;
  dueDay?: number;

  actualizacionCadaMeses?: number;
  porcentajeActualizacion?: number;

  lateFeePolicy?: LateFeePolicy;
  notes?: string;

  commissionMonthlyPct?: number;
  commissionTotalPct?: number;

  recalcFrom?: string; // "YYYY-MM"
};

type ContractDTO = {
  _id: string;
  code: string;
  status: ContractStatus;

  propertyId: PropertyDTO | string;
  ownerId: PersonDTO | string;
  tenantPersonId: PersonDTO | string;

  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD

  billing?: ContractBillingDTO;

  montoBase?: number;
  duracion?: number;
  duracionMeses?: number;
  valorCuota?: number;
  diaVencimiento?: number;

  // compat si viene en root (evita TS2339)
  dueDay?: number;

  // compat si viene en root
  actualizacionCadaMeses?: number;
  porcentajeActualizacion?: number;
  lateFeePolicy?: LateFeePolicy;

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

/** ✅ lee comisión desde billing o root (SIN any) */
function getPctField(contrato: ContractDTO, field: "commissionMonthlyPct" | "commissionTotalPct"): number {
  const fromBilling = contrato.billing?.[field];
  if (typeof fromBilling === "number" && Number.isFinite(fromBilling)) return fromBilling;

  const fromRoot = contrato[field];
  if (typeof fromRoot === "number" && Number.isFinite(fromRoot)) return fromRoot;

  return 0;
}

/** ✅ date-only (evita UTC shift) */
function dateOnlyLabel(iso?: string) {
  const s = String(iso ?? "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : iso ?? "-";
}

/* ====== schedule sin Date/UTC ====== */
type ScheduleItem = {
  period: string; // "2026-01"
  dueDate: string; // "2026-01-08"
  amount: number;
  status: "PENDING" | "PAID";
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}
function parseISODateOnly(iso: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? "").trim());
  if (!m) throw new Error(`Fecha inválida (YYYY-MM-DD): ${iso}`);
  return { y: Number(m[1]), mo: Number(m[2]), d: Number(m[3]) }; // mo 1..12
}
function buildYM(y: number, mo: number) {
  return `${y}-${pad2(mo)}`;
}
function clampDueDay(day: number) {
  if (!Number.isFinite(day)) return 10;
  return Math.min(28, Math.max(1, Math.floor(day)));
}
function addMonthsYM(y: number, mo: number, add: number) {
  const idx = y * 12 + (mo - 1) + add;
  const ny = Math.floor(idx / 12);
  const nmo = (idx % 12) + 1;
  return { y: ny, mo: nmo };
}
function roundMoney(n: number) {
  return Math.round(n);
}

/**
 * ✅ Cronograma sin timezone
 * ✅ Ajuste por tramos: se aplica cada X meses
 * ✅ porcentaje fijo
 */
export function generateSchedule(params: {
  startDateISO: string; // "2026-01-01"
  months: number;
  baseAmount: number;
  updateEveryMonths: number; // 0 = sin actualización
  updatePercent: number; // ej: 8.78
  dueDay: number; // 1..28
}) {
  const { startDateISO, months, baseAmount, updateEveryMonths, updatePercent } = params;

  const { y: sy, mo: smo } = parseISODateOnly(startDateISO);
  const totalMonths = Math.max(0, Math.floor(Number(months)));
  const dueDay = clampDueDay(params.dueDay);

  const schedule: ScheduleItem[] = [];
  let currentAmount = roundMoney(Number(baseAmount) || 0);

  for (let i = 0; i < totalMonths; i++) {
    const { y, mo } = addMonthsYM(sy, smo, i);

    if (updateEveryMonths > 0 && i > 0 && i % updateEveryMonths === 0) {
      const pct = Number(updatePercent) || 0;
      currentAmount = roundMoney(currentAmount * (1 + pct / 100));
    }

    const period = buildYM(y, mo);
    const dueDate = `${period}-${pad2(dueDay)}`;

    schedule.push({
      period,
      dueDate,
      amount: currentAmount,
      status: "PENDING",
    });
  }

  return schedule;
}

/** ✅ period estable aunque venga vacío desde backend */
function normalizeInstallmentPeriod(i: InstallmentDTO): string {
  const p = String(i.period ?? "").trim();
  if (/^\d{4}-\d{2}$/.test(p)) return p;

  const d = String(i.dueDate ?? "").slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d.slice(0, 7);

  return "";
}

/** ✅ merge completo schedule + server installments */
function mergeInstallmentsWithSchedule(params: {
  contract: ContractDTO;
  serverInstallments: InstallmentDTO[];
}): InstallmentSim[] {
  const { contract, serverInstallments } = params;

  const duracion = Number(contract.duracionMeses ?? contract.duracion) || 0;
  const startISO = String(contract.startDate ?? "").slice(0, 10);
  if (!duracion || !/^\d{4}-\d{2}-\d{2}$/.test(startISO)) return [];

  const baseRent = Number(contract.valorCuota ?? contract.billing?.baseRent ?? contract.montoBase ?? 0);
  const dueDay = Number(contract.diaVencimiento ?? contract.billing?.dueDay ?? contract.dueDay ?? 10);
  const cada = Number(contract.actualizacionCadaMeses ?? contract.billing?.actualizacionCadaMeses ?? 0) || 0;
  const pct = Number(contract.porcentajeActualizacion ?? contract.billing?.porcentajeActualizacion ?? 0) || 0;

  const schedule = generateSchedule({
    startDateISO: startISO,
    months: duracion,
    baseAmount: baseRent,
    updateEveryMonths: cada,
    updatePercent: pct,
    dueDay,
  });

  const byPeriod = new Map<string, InstallmentDTO>();
  for (const it of serverInstallments) {
    const per = normalizeInstallmentPeriod(it);
    if (per) byPeriod.set(per, it);
  }

  return schedule.map((s) => {
    const it = byPeriod.get(s.period);

    if (it) {
      const late = Number(it.lateFeeAccrued || 0);
      const amt = Number(it.amount || 0);
      return {
        periodo: s.period,
        vencimiento: it.dueDate ? it.dueDate.slice(0, 10) : s.dueDate,
        monto: amt,
        montoConMora: amt + late,
        estado: installmentStatusLabel(it.status),
        pagado: it.status === "PAID",
        pago: it.paidAt ? it.paidAt.slice(0, 10) : "-",
      };
    }

    return {
      periodo: s.period,
      vencimiento: s.dueDate,
      monto: s.amount,
      montoConMora: s.amount,
      estado: "Pendiente",
      pagado: false,
      pago: "-",
    };
  });
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

      const cuotasMerged = mergeInstallmentsWithSchedule({
        contract: serverContract,
        serverInstallments: installmentsRaw,
      });

      setViewModal({
        open: true,
        contrato: serverContract,
        cuotas: cuotasMerged,
      });
    } catch (e) {
      toast.show?.(e instanceof Error ? e.message : "No se pudieron cargar cuotas");

      const cuotasMerged = mergeInstallmentsWithSchedule({
        contract: contrato,
        serverInstallments: [],
      });

      setViewModal({ open: true, contrato, cuotas: cuotasMerged });
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
                    {dateOnlyLabel(viewModal.contrato.startDate)}
                  </div>
                  <div>
                    <span className="font-semibold text-neutral-400">Fin:</span>{" "}
                    {dateOnlyLabel(viewModal.contrato.endDate)}
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
                        viewModal.contrato.actualizacionCadaMeses ?? viewModal.contrato.billing?.actualizacionCadaMeses ?? 0;

                      return cada > 0 ? `${cada} meses` : "Sin";
                    })()}
                  </div>

                  <div>
                    <span className="font-semibold text-neutral-400">% actualización:</span>{" "}
                    {(() => {
                      const pct =
                        viewModal.contrato.porcentajeActualizacion ?? viewModal.contrato.billing?.porcentajeActualizacion ?? 0;
                      return Number(pct || 0);
                    })()}
                    %
                  </div>

                  <div>
                    <span className="font-semibold text-neutral-400">Mora:</span>{" "}
                    {(() => {
                      const type =
                        viewModal.contrato.billing?.lateFeePolicy?.type ?? viewModal.contrato.lateFeePolicy?.type ?? "NONE";
                      return moraLabel(type);
                    })()}
                  </div>

                  <div>
                    <span className="font-semibold text-neutral-400">Valor mora:</span>{" "}
                    {(() => {
                      const type =
                        viewModal.contrato.billing?.lateFeePolicy?.type ?? viewModal.contrato.lateFeePolicy?.type ?? "NONE";
                      const value =
                        viewModal.contrato.billing?.lateFeePolicy?.value ?? viewModal.contrato.lateFeePolicy?.value ?? 0;

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
                            <div>{c.periodo || "—"}</div>
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
