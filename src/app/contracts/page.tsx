"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useToast } from "@/app/components/ToastProvider";

type ContractStatus = "DRAFT" | "ACTIVE" | "EXPIRING" | "ENDED" | "TERMINATED";

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
  status?: string;
  ownerId?: PersonDTO | string;
  inquilinoId?: PersonDTO | string | null;
};

type ContractDTO = {
  _id: string;
  tenantId: string;
  code: string;

  propertyId: PropertyDTO | string;
  ownerId: PersonDTO | string;
  tenantPersonId: PersonDTO | string;

  startDate: string;
  endDate: string;
  status: ContractStatus;

  billing: {
    dueDay: number;
    baseRent: number;
    currency: string;
    lateFeePolicy: { type: "NONE" | "FIXED" | "PERCENT"; value: number };
    notes: string;
    actualizacionCada?: number;
    porcentajeActualizacion?: number;
  };

  createdAt: string;
  updatedAt: string;
};

type ContractsListResponse =
  | { ok: true; contracts: ContractDTO[] }
  | { ok: false; error?: string; message?: string };

type StatusFilter = "ALL" | ContractStatus;

type InstallmentSim = {
  periodo: string;
  vencimiento: string;
  monto: number;
  estado: string;
  pagado: boolean;
  pago: string;
};

function formatARS(n: number) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(n);
}

function safeText(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function getProperty(c: ContractDTO): PropertyDTO | null {
  if (typeof c.propertyId === "string") return null;
  return c.propertyId;
}

function getOwner(c: ContractDTO): PersonDTO | null {
  if (typeof c.ownerId === "string") return null;
  return c.ownerId;
}

function getTenant(c: ContractDTO): PersonDTO | null {
  if (typeof c.tenantPersonId === "string") return null;
  return c.tenantPersonId;
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

export default function ContractsPage() {
  const toast = useToast();

  const [err, setErr] = useState("");
  const [contracts, setContracts] = useState<ContractDTO[]>([]);

  const [deleteModal, setDeleteModal] = useState<{ open: boolean; contrato: ContractDTO | null }>({
    open: false,
    contrato: null,
  });

  const [cuotasModal, setCuotasModal] = useState<{
    open: boolean;
    cuotas: (InstallmentSim & { montoConMora: number })[];
    contrato: ContractDTO | null;
  }>({
    open: false,
    cuotas: [],
    contrato: null,
  });

  function generarCuotasSimuladas(contrato: ContractDTO): (InstallmentSim & { montoConMora: number })[] {
    const cuotas: (InstallmentSim & { montoConMora: number })[] = [];
    const duracion = 0; // (si querés simular acá, necesitamos duracionMeses real en el DTO de lista)
    const baseRent = contrato.billing?.baseRent || 0;
    const lateFeeType = contrato.billing?.lateFeePolicy?.type;
    const lateFeeValue = Number(contrato.billing?.lateFeePolicy?.value) || 0;
    const startDate = contrato.startDate ? new Date(contrato.startDate) : null;
    if (!duracion || !startDate) return [];

      const montoActual = baseRent;

    for (let i = 0; i < duracion; i++) {
      const fechaVenc = new Date(startDate);
      fechaVenc.setMonth(fechaVenc.getMonth() + i);

      const periodo = `${fechaVenc.getMonth() + 1}/${fechaVenc.getFullYear()}`;
      const vencimiento = fechaVenc.toISOString().slice(0, 10);

      let montoConMora = montoActual;
      const hoy = new Date();
      const fechaVencSinHora = new Date(fechaVenc.getFullYear(), fechaVenc.getMonth(), fechaVenc.getDate());

      if (lateFeeType === "PERCENT" && lateFeeValue > 0 && hoy > fechaVencSinHora) {
        const diffMs = hoy.getTime() - fechaVencSinHora.getTime();
        const diasAtraso = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        montoConMora = montoActual * Math.pow(1 + lateFeeValue / 100, diasAtraso);
      }

      cuotas.push({
        periodo,
        vencimiento,
        monto: montoActual,
        montoConMora,
        estado: "Pendiente",
        pagado: false,
        pago: "-",
      });
    }
    return cuotas;
  }

  async function load() {
    setErr("");
    try {
      const res = await fetch("/api/contracts", { cache: "no-store" });
      const data = (await res.json()) as ContractsListResponse;

      if (!data.ok) {
        setContracts([]);
        const msg = ("error" in data && data.error) || ("message" in data && data.message) || "Error";
        setErr(msg);
        return;
      }

      setContracts(data.contracts ?? []);
    } catch (e) {
      console.error(e);
      setContracts([]);
      setErr("No se pudo cargar contratos");
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, []);

  const [q, setQ] = useState("");
  const [status, setStatus] = useState<StatusFilter>("ALL");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

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
    const sumaBase = filtered.reduce(
      (acc, c) => acc + (Number.isFinite(c.billing?.baseRent) ? c.billing.baseRent : 0),
      0
    );
    return { total, activos, sumaBase };
  }, [filtered]);

  return (
    <div className="mx-auto max-w-6xl w-full px-6 py-8">
      <div className="flex items-start justify-between gap-6">
        <div>
          <h1 className="text-3xl font-semibold flex items-center gap-2">
            <Link
              href="/"
              title="Volver al inicio"
              className="inline-flex items-center justify-center w-10 h-10 rounded-full border border-white/20 bg-white/10 hover:bg-white/20 transition text-xl text-neutral-100 shadow-sm mr-1"
            >
              <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            Contratos
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/installments"
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm hover:bg-white/10 transition"
          >
            Ir a Cuotas
          </Link>
          <Link
            href="/payments"
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm hover:bg-white/10 transition"
          >
            Ir a Pagos
          </Link>

          {/* ✅ ÚNICO botón de alta: siempre va a /contracts/new */}
          <Link
            href="/contracts/new"
            className="rounded-xl border border-emerald-500/30 bg-emerald-500/15 px-4 py-2 text-sm text-emerald-200 font-semibold shadow hover:brightness-110 transition cursor-pointer"
          >
            + Alta Contrato
          </Link>
        </div>
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
        <div className="px-4 py-3 border-b border-white/10 text-sm font-semibold">Filtros</div>
        <div className="p-4 grid grid-cols-4 gap-4">
          <div className="col-span-2">
            <div className="text-xs text-neutral-400 mb-1">BÚSQUEDA</div>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Código, dirección, propietario, inquilino..."
              className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-sm outline-none focus:border-white/20"
            />
          </div>

          <div>
            <div className="text-xs text-neutral-400 mb-1">ESTADO</div>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as StatusFilter)}
              className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-sm outline-none focus:border-white/20"
            >
              <option value="ALL">Todos</option>
              <option value="ACTIVE">Activo</option>
              <option value="DRAFT">Borrador</option>
              <option value="EXPIRING">Por vencer</option>
              <option value="ENDED">Finalizado</option>
              <option value="TERMINATED">Rescindido</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
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
          </div>
        </div>
      </div>

      {/* Tabla */}
      <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
        <div className="px-4 py-3 border-b border-white/10 text-sm font-semibold">Contratos ({filtered.length})</div>

        <div className="p-4">
          <div className="rounded-xl border border-white/10 overflow-hidden">
            <div className="grid grid-cols-12 gap-0 bg-white/5 text-xs text-neutral-300 px-4 py-3">
              <div className="col-span-1">Estado</div>
              <div className="col-span-2">Código</div>
              <div className="col-span-4 pr-0!">Propiedad</div>
              <div className="col-span-2 pl-0!">Propietario</div>
              <div className="col-span-1">Inquilino</div>
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
                  <div key={c._id} className="grid grid-cols-12 gap-0 px-4 py-3 border-t border-white/10 text-sm items-center">
                    <div className="col-span-1">
                      <span className={`inline-flex items-center rounded-xl border px-2.5 py-1 text-xs ${badge.cls}`}>
                        {badge.label}
                      </span>
                    </div>

                    <div className="col-span-2">
                      <div className="text-neutral-200 font-semibold">{c.code}</div>
                    </div>

                    <div className="col-span-4 pr-0!">
                      <div className="text-neutral-200">{propLine || "—"}</div>
                    </div>

                    <div className="col-span-2 pl-0!">
                      <div className="text-neutral-200">{o?.fullName || "—"}</div>
                    </div>

                    <div className="col-span-1">
                      <div className="text-neutral-200">{t?.fullName || "—"}</div>
                    </div>

                    <div className="col-span-2 flex justify-end w-full gap-2">
                      <button
                        className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs hover:bg-white/10 transition whitespace-nowrap"
                        title="Ver"
                        onClick={() => {
                          setCuotasModal({
                            open: true,
                            cuotas: generarCuotasSimuladas(c),
                            contrato: c,
                          });
                        }}
                      >
                        Ver
                      </button>

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
      {cuotasModal.open && cuotasModal.contrato ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div
            className="mx-auto rounded-2xl border border-white/10 bg-neutral-900 shadow-2xl py-6 px-8 relative flex flex-col items-center"
            style={{ maxWidth: 520, minWidth: 0 }}
          >
            <button
              className="absolute top-4 right-4 w-9 h-9 flex items-center justify-center rounded-full bg-neutral-800 hover:bg-red-500 transition text-white shadow cursor-pointer border border-white/10"
              type="button"
              aria-label="Cerrar"
              onClick={() => setCuotasModal({ open: false, cuotas: [], contrato: null })}
              title="Cerrar"
            >
              ✕
            </button>

            <h2 className="text-xl font-bold text-emerald-400 mb-4">Contrato {cuotasModal.contrato.code}</h2>

            <div className="w-full flex flex-col gap-2 text-sm text-neutral-200">
              <div>
                <span className="font-semibold text-neutral-400">Estado:</span> {statusBadge(cuotasModal.contrato.status).label}
              </div>
              <div>
                <span className="font-semibold text-neutral-400">Propiedad:</span>{" "}
                {(() => {
                  const pp = getProperty(cuotasModal.contrato);
                  return pp ? `${pp.code} - ${pp.addressLine}${pp.unit ? ` (${pp.unit})` : ""}` : safeText(cuotasModal.contrato.propertyId);
                })()}
              </div>
              <div>
                <span className="font-semibold text-neutral-400">Titular:</span>{" "}
                {(() => {
                  const oo = getOwner(cuotasModal.contrato);
                  return oo ? `${oo.fullName}${oo.code ? ` (${oo.code})` : ""}` : "—";
                })()}
              </div>
              <div>
                <span className="font-semibold text-neutral-400">Inquilino:</span>{" "}
                {(() => {
                  const tt = getTenant(cuotasModal.contrato);
                  return tt ? `${tt.fullName}${tt.code ? ` (${tt.code})` : ""}` : "—";
                })()}
              </div>
              <div>
                <span className="font-semibold text-neutral-400">Fecha inicio:</span>{" "}
                {cuotasModal.contrato.startDate ? cuotasModal.contrato.startDate.slice(0, 10) : "-"}
              </div>
              <div>
                <span className="font-semibold text-neutral-400">Fecha fin:</span>{" "}
                {cuotasModal.contrato.endDate ? cuotasModal.contrato.endDate.slice(0, 10) : "-"}
              </div>
              <div>
                <span className="font-semibold text-neutral-400">Valor alquiler:</span>{" "}
                {formatARS(cuotasModal.contrato.billing?.baseRent ?? 0)}
              </div>
              <div>
                <span className="font-semibold text-neutral-400">Día vencimiento:</span>{" "}
                {cuotasModal.contrato.billing?.dueDay ?? "-"}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Modal BORRAR */}
      {deleteModal.open && deleteModal.contrato ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div
            className="mx-auto rounded-2xl border border-red-500/30 bg-neutral-900 shadow-2xl py-6 px-6 relative flex flex-col items-center"
            style={{ maxWidth: 420 }}
          >
            <h2 className="text-xl font-bold text-red-400 mb-4">¿Eliminar contrato?</h2>
            <div className="text-neutral-200 mb-4 text-center">
              Se eliminará el contrato{" "}
              <span className="font-bold text-red-300">{deleteModal.contrato.code}</span>.
              <br />
              Esta acción no se puede deshacer.
            </div>
            <div className="flex gap-4 mt-2">
              <button
                className="rounded-xl px-5 py-2 text-white font-semibold shadow bg-red-600 hover:brightness-110 text-base"
                onClick={async () => {
                  if (toast.show) toast.show(`Eliminando contrato ${deleteModal.contrato?.code}...`);
                  try {
                    const res = await fetch(`/api/contracts/${String(deleteModal.contrato?._id)}`, { method: "DELETE" });
                    const data = (await res.json()) as { ok?: boolean; message?: string };
                    if (!data.ok) {
                      if (toast.show) toast.show(data.message || "No se pudo eliminar el contrato");
                      setDeleteModal({ open: false, contrato: null });
                      return;
                    }
                    if (toast.show) toast.show("Contrato eliminado correctamente");
                    setDeleteModal({ open: false, contrato: null });
                    await load();
                  } catch {
                    if (toast.show) toast.show("Error eliminando contrato");
                    setDeleteModal({ open: false, contrato: null });
                  }
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
  );
}
