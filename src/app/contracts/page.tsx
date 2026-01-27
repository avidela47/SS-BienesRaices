"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useToast } from "@/app/components/ToastProvider";

type ContractStatus = "DRAFT" | "ACTIVE" | "EXPIRING" | "ENDED" | "TERMINATED";

type PropertyDTO = {
  _id: string;
  code: string;
  addressLine: string;
  unit?: string;
  city?: string;
  province?: string;
  status?: string;
  ownerId?: PersonDTO | string;
  inquilinoId?: PersonDTO | string;
};

type PersonDTO = {
  _id: string;
  code?: string;
  type: "OWNER" | "TENANT" | string;
  fullName: string;
  email?: string;
  phone?: string;
};

type ContractDTO = {
  duracion?: number;
  // Para compatibilidad y mapeo flexible en edición
  valorCuota?: number;
  diaVencimiento?: number;
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

  // Para compatibilidad y mapeo flexible en edición
  actualizacionCada?: number;
  porcentajeActualizacion?: number;

  montoCuota?: number;
  comision?: number;
  expensas?: string;
  otrosGastosImporte?: number;
  otrosGastosDesc?: string;

  createdAt: string;
  updatedAt: string;
};

type ContractsListResponse =
  | { ok: true; contracts: ContractDTO[] }
  | { ok: false; error?: string; message?: string };

type StatusFilter = "ALL" | ContractStatus;

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

type InstallmentSim = {
  periodo: string;
  vencimiento: string;
  monto: number;
  estado: string;
  pagado: boolean;
  pago: string;
};

export default function ContractsPage() {
  // Estado para el modal de confirmación de borrado
  const [deleteModal, setDeleteModal] = useState<{ open: boolean; contrato: ContractDTO | null }>({ open: false, contrato: null });
  // Estados principales
  const toast = useToast();
  const [showAltaModal, setShowAltaModal] = useState(false);
  const [nuevoContrato, setNuevoContrato] = useState({
    duracion: '',
    titular: '',
    inquilino: '',
    valorCuota: '',
    actualizacionCada: '',
    porcentajeActualizacion: '',
    montoCuota: '',
    comision: '',
    expensas: 'no',
    otrosGastosImporte: '',
    otrosGastosDesc: '',
    propiedadId: '',
    fechaInicio: '',
    fechaFin: '',
    diaVencimiento: '',
    // Campos adicionales del modelo backend
    currency: '',
    lateFeeType: '',
    lateFeeValue: '',
    notes: '',
    documents: [],
  });
  const [err, setErr] = useState('');
  const [contracts, setContracts] = useState<ContractDTO[]>([]);
  const [editContrato, setEditContrato] = useState<ContractDTO | null>(null);

  const [guardando, setGuardando] = useState(false);
  const [errorAlta, setErrorAlta] = useState('');
  // Listas de personas y propiedades
  const [titulares, setTitulares] = useState<PersonDTO[]>([]);
  const [inquilinos, setInquilinos] = useState<PersonDTO[]>([]);
  const [propiedades, setPropiedades] = useState<PropertyDTO[]>([]);

  // cuotas simuladas
  const [cuotasModal, setCuotasModal] = useState<{ open: boolean; cuotas: (InstallmentSim & { montoConMora: number })[]; contrato: ContractDTO | null }>({ open: false, cuotas: [], contrato: null });
  // filtros
  // Genera cuotas simuladas según la duración y fechas del contrato
  function generarCuotasSimuladas(contrato: ContractDTO): (InstallmentSim & { montoConMora: number })[] {
    const cuotas: (InstallmentSim & { montoConMora: number })[] = [];
    const duracion = Number(contrato.duracion) || 0;
    const baseRent = contrato.valorCuota || contrato.billing?.baseRent || 0;
    const actualizacionCada = Number(contrato.actualizacionCada ?? contrato.billing?.actualizacionCada) || 0;
    const porcentajeActualizacion = Number(contrato.porcentajeActualizacion ?? contrato.billing?.porcentajeActualizacion) || 0;
    const lateFeeType = contrato.billing?.lateFeePolicy?.type;
    const lateFeeValue = Number(contrato.billing?.lateFeePolicy?.value) || 0;
    const startDate = contrato.startDate ? new Date(contrato.startDate) : null;
    if (!duracion || !startDate) return [];
    let montoActual = baseRent;
    for (let i = 0; i < duracion; i++) {
      // Aplica actualización si corresponde
      if (actualizacionCada > 0 && porcentajeActualizacion > 0 && i > 0 && i % actualizacionCada === 0) {
        montoActual = montoActual + (montoActual * porcentajeActualizacion / 100);
      }
      const fechaVenc = new Date(startDate);
      fechaVenc.setMonth(fechaVenc.getMonth() + i);
      const periodo = `${fechaVenc.getMonth() + 1}/${fechaVenc.getFullYear()}`;
      const vencimiento = fechaVenc.toISOString().slice(0, 10);
      // Calcular mora si está vencida
      let montoConMora = montoActual;
      const hoy = new Date();
      const fechaVencSinHora = new Date(fechaVenc.getFullYear(), fechaVenc.getMonth(), fechaVenc.getDate());
      if (lateFeeType === 'PERCENT' && lateFeeValue > 0 && hoy > fechaVencSinHora) {
        // Días de atraso
        const diffMs = hoy.getTime() - fechaVencSinHora.getTime();
        const diasAtraso = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        montoConMora = montoActual * Math.pow(1 + lateFeeValue / 100, diasAtraso);
      }
      cuotas.push({
        periodo,
        vencimiento,
        monto: montoActual,
        montoConMora,
        estado: 'Pendiente',
        pagado: false,
        pago: '-',
      });
    }
    return cuotas;
  }
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<StatusFilter>("ALL");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  async function load() {
    setErr("");
    try {
      const res = await fetch("/api/contracts", { cache: "no-store" });
      const data = (await res.json()) as ContractsListResponse;

      if (!data.ok) {
        setContracts([]);
        const msg = "error" in data && data.error ? data.error : "message" in data && data.message ? data.message : "Error";
        setErr(msg);
        return;
      }

      setContracts(data.contracts ?? []);
    } catch (e) {
      console.error(e);
      setContracts([]);
      setErr("No se pudo cargar contratos");
    } finally {
      // setLoading(false); // eliminado
    }
  }

  useEffect(() => {
    void load();
    // Cargar titulares e inquilinos
    fetch('/api/people')
      .then(r => r.json())
      .then((data) => {
        if (data && data.ok && Array.isArray(data.people)) {
          setTitulares(data.people.filter((p: PersonDTO) => p.type === 'OWNER'));
          setInquilinos(data.people.filter((p: PersonDTO) => p.type === 'TENANT'));
        }
      });
    // Cargar propiedades
    fetch('/api/properties')
      .then(r => r.json())
      .then((data) => {
        if (data && data.ok && Array.isArray(data.properties)) {
          setPropiedades(data.properties);
          // Mostrar en consola para depuración
          console.log('PROPIEDADES:', (data.properties as PropertyDTO[]).map((p: PropertyDTO) => ({ code: p.code, status: p.status })));
        }
      });
  }, []);

  const filtered = useMemo(() => {
    return contracts.filter((c) => {
      // Filtro por estado
      if (status !== "ALL" && c.status !== status) return false;
      // Filtro por fechas (si aplica)
      if (from && c.startDate < from) return false;
      if (to && c.endDate > to) return false;

      // Filtro por texto
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
    const sumaBase = filtered.reduce((acc, c) => acc + (Number.isFinite(c.billing?.baseRent) ? c.billing.baseRent : 0), 0);

    return {
      total,
      activos,
      sumaBase,
    };
  }, [filtered]);

  return (
    <div className="mx-auto max-w-6xl w-full px-6 py-8">
      <div className="flex items-start justify-between gap-6">
        <div>
          <h1 className="text-3xl font-semibold flex items-center gap-2">
            <Link href="/" title="Volver al inicio" className="inline-flex items-center justify-center w-10 h-10 rounded-full border border-white/20 bg-white/10 hover:bg-white/20 transition text-xl text-neutral-100 shadow-sm mr-1">
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
            <button
              onClick={() => {
                setEditContrato(null);
                setShowAltaModal(true);
                setNuevoContrato({
                  duracion: '',
                  titular: '',
                  inquilino: '',
                  valorCuota: '',
                  actualizacionCada: '',
                  porcentajeActualizacion: '',
                  montoCuota: '',
                  comision: '',
                  expensas: 'no',
                  otrosGastosImporte: '',
                  otrosGastosDesc: '',
                  propiedadId: '',
                  fechaInicio: '',
                  fechaFin: '',
                  diaVencimiento: '',
                  currency: '',
                  lateFeeType: '',
                  lateFeeValue: '',
                  notes: '',
                  documents: [],
                });
              }}
              className="rounded-xl border bg-green-600 px-4 py-2 text-sm text-white font-semibold shadow hover:brightness-110 transition cursor-pointer"
              type="button"
            >
              +Alta Contrato
            </button>
        </div>
      {/* Modal de alta de contrato */}
      {showAltaModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div
            className="mx-auto rounded-2xl border border-white/10 bg-neutral-800 shadow-2xl py-4 px-2 sm:px-8 relative"
            style={{ width: '100%', maxWidth: 1300, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', boxSizing: 'border-box', maxHeight: '90vh', overflowY: 'auto' }}
          >
            <button
              className="absolute top-4 right-4 w-9 h-9 flex items-center justify-center rounded-full bg-neutral-700 hover:bg-red-500 transition text-white shadow cursor-pointer border border-white/10"
              type="button"
              aria-label="Cerrar"
              onClick={() => setShowAltaModal(false)}
              title="Cerrar"
            >
              <svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M7 11H15" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                <path d="M11 7V15" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </button>
            <form
              className="w-full"
              style={{ width: '100%' }}
              autoComplete="off"
              onSubmit={async e => {
                e.preventDefault();
                setGuardando(true);
                try {
                  // Construir objeto para backend (siempre con billing)
                  const contractPayload = {
                    propertyId: nuevoContrato.propiedadId,
                    ownerId: nuevoContrato.titular,
                    tenantPersonId: nuevoContrato.inquilino,
                    startDate: nuevoContrato.fechaInicio,
                    endDate: nuevoContrato.fechaFin,
                    duracion: nuevoContrato.duracion ? Number(nuevoContrato.duracion) : undefined,
                    comision: nuevoContrato.comision ? Number(nuevoContrato.comision) : undefined,
                    expensas: nuevoContrato.expensas,
                    otrosGastosImporte: nuevoContrato.otrosGastosImporte ? Number(nuevoContrato.otrosGastosImporte) : undefined,
                    otrosGastosDesc: nuevoContrato.otrosGastosDesc,
                    dueDay: nuevoContrato.diaVencimiento ? Number(nuevoContrato.diaVencimiento) : undefined,
                    baseRent: nuevoContrato.valorCuota ? Number(nuevoContrato.valorCuota) : undefined,
                    billing: {
                      dueDay: nuevoContrato.diaVencimiento ? Number(nuevoContrato.diaVencimiento) : undefined,
                      baseRent: nuevoContrato.valorCuota ? Number(nuevoContrato.valorCuota) : undefined,
                      currency: nuevoContrato.currency,
                      lateFeePolicy: {
                        type: nuevoContrato.lateFeeType || 'NONE',
                        value: nuevoContrato.lateFeeValue ? Number(nuevoContrato.lateFeeValue) : 0,
                      },
                      notes: nuevoContrato.notes,
                      actualizacionCada: nuevoContrato.actualizacionCada ? Number(nuevoContrato.actualizacionCada) : undefined,
                      porcentajeActualizacion: nuevoContrato.porcentajeActualizacion ? Number(nuevoContrato.porcentajeActualizacion) : undefined,
                    },
                  };
                  let res, data;
                  if (editContrato) {
                    res = await fetch(`/api/contracts/${editContrato._id}`, {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(contractPayload),
                    });
                    data = await res.json();
                    if (!data.ok) throw new Error(data.message || 'Error al editar contrato');
                  } else {
                    res = await fetch('/api/contracts', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(contractPayload),
                    });
                    data = await res.json();
                    if (!data.ok) throw new Error(data.message || 'Error al crear contrato');
                  }
                  setShowAltaModal(false);
                  await load();
                } catch (err) {
                  setErrorAlta(err instanceof Error ? err.message : 'Error');
                } finally {
                  setGuardando(false);
                }
              }}
            >
              <div className="grid grid-cols-1 md:grid-cols-6 gap-x-6 gap-y-4 w-full">
                <div className="col-span-full mb-2">
                  <h2 className="text-xl font-bold text-green-400">
                    {editContrato ? `Editar contrato ${editContrato.code}` : 'Alta de Contrato'}
                  </h2>
                </div>
                {/* Fila 1: N° Contrato, Propiedad, Duración */}
                <div>
                  <label className="block mb-1 font-medium">N° Contrato</label>
                  <input type="text" value="(auto)" disabled className="w-full rounded border px-2 py-1 bg-neutral-800 text-white opacity-70 text-sm" />
                </div>
                <div>
                  <label className="block mb-1 font-medium">Propiedad</label>
                  <select
                    className="w-full rounded border px-2 py-1 bg-neutral-800 text-black text-sm"
                    value={nuevoContrato.propiedadId || ''}
                    onChange={e => {
                      const propId = e.target.value;
                      const prop = propiedades.find(p => p._id === propId);
                      setNuevoContrato(n => {
                        let titular = n.titular;
                        let inquilino = n.inquilino;
                        if (!titular && prop?.ownerId && typeof prop.ownerId === 'object' && (prop.ownerId as PersonDTO)._id) {
                          titular = (prop.ownerId as PersonDTO)._id;
                        }
                        if (!inquilino && prop?.inquilinoId && typeof prop.inquilinoId === 'object' && (prop.inquilinoId as PersonDTO)._id) {
                          inquilino = (prop.inquilinoId as PersonDTO)._id;
                        }
                        return {
                          ...n,
                          propiedadId: propId,
                          titular,
                          inquilino,
                        };
                      });
                    }}
                  >
                    {(() => {
                      const propiedadesConContratoActivo = new Set(
                        contracts
                          .filter(c => c.status === "ACTIVE")
                          .map(c => {
                            if (typeof c.propertyId === "string") return c.propertyId;
                            return c.propertyId?._id;
                          })
                          .filter(Boolean)
                      );
                      return [
                        <option value="" key="empty">Seleccionar propiedad...</option>,
                        ...propiedades
                          .filter((p: PropertyDTO) => !propiedadesConContratoActivo.has(p._id))
                          .map((p: PropertyDTO) => {
                            const labelBase = `${p.code} - ${p.addressLine}${p.unit ? ` (${p.unit})` : ""}`;
                            return (
                              <option
                                key={p._id}
                                value={p._id}
                              >
                                {labelBase}
                              </option>
                            );
                          })
                      ];
                    })()}
                  </select>
                </div>
                <div>
                  <label className="block mb-1 font-medium">Duración (meses)</label>
                  <input type="number" min="1" className="w-full rounded border px-2 py-1 bg-neutral-800 text-black text-sm" placeholder="24"
                    value={nuevoContrato.duracion}
                    onChange={e => setNuevoContrato(n => ({ ...n, duracion: e.target.value }))}
                  />
                </div>
                {/* Fila 2: Fechas y vencimiento */}
                <div>
                  <label className="block mb-1 font-medium">Fecha inicio</label>
                  <input type="date" className="w-full rounded border px-2 py-1 bg-neutral-800 text-black text-sm"
                    value={nuevoContrato.fechaInicio || ''}
                    onChange={e => setNuevoContrato(n => ({ ...n, fechaInicio: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block mb-1 font-medium">Fecha fin</label>
                  <input type="date" className="w-full rounded border px-2 py-1 bg-neutral-800 text-black text-sm"
                    value={nuevoContrato.fechaFin || ''}
                    onChange={e => setNuevoContrato(n => ({ ...n, fechaFin: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block mb-1 font-medium">Día de vencimiento</label>
                  <input type="number" min="1" max="28" className="w-full rounded border px-2 py-1 bg-neutral-800 text-black text-sm" placeholder="Ej: 10"
                    value={nuevoContrato.diaVencimiento || ''}
                    onChange={e => setNuevoContrato(n => ({ ...n, diaVencimiento: e.target.value }))}
                  />
                </div>
                {/* Fila 3: Personas */}
                <div>
                  <label className="block mb-1 font-medium">Titular</label>
                  <select className="w-full rounded border px-2 py-1 bg-neutral-800 text-black text-sm"
                    value={nuevoContrato.titular}
                    onChange={e => setNuevoContrato(n => ({ ...n, titular: e.target.value }))}
                  >
                    <option value="">Seleccionar titular...</option>
                    {titulares.map(t => (
                      <option key={t._id} value={t._id}>{t.fullName} {t.code ? `(${t.code})` : ''}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block mb-1 font-medium">Inquilino</label>
                  <select className="w-full rounded border px-2 py-1 bg-neutral-800 text-black text-sm"
                    value={nuevoContrato.inquilino}
                    onChange={e => setNuevoContrato(n => ({ ...n, inquilino: e.target.value }))}
                  >
                    <option value="">Seleccionar inquilino...</option>
                    {inquilinos.map(i => (
                      <option key={i._id} value={i._id}>{i.fullName} {i.code ? `(${i.code})` : ''}</option>
                    ))}
                  </select>
                </div>
                <div></div>
                {/* Fila 4: Valores y actualización */}
                <div>
                  <label className="block mb-1 font-medium">Valor cuota</label>
                  <input type="number" min="0" className="w-full rounded border px-2 py-1 bg-neutral-800 text-black text-sm" placeholder="Monto en ARS"
                    value={nuevoContrato.valorCuota}
                    onChange={e => {
                      const valor = e.target.value;
                      setNuevoContrato(n => {
                        const porcentaje = parseFloat(n.porcentajeActualizacion) || 0;
                        const base = parseFloat(valor) || 0;
                        const montoCuota = (base + (base * porcentaje / 100)).toFixed(2);
                        return { ...n, valorCuota: valor, montoCuota };
                      });
                    }}
                  />
                </div>
                <div>
                  <label className="block mb-1 font-medium">Actualización cada (meses)</label>
                  <input type="number" min="1" className="w-full rounded border px-2 py-1 bg-neutral-800 text-black text-sm" placeholder="Ej: 6"
                    value={nuevoContrato.actualizacionCada}
                    onChange={e => setNuevoContrato(n => ({ ...n, actualizacionCada: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block mb-1 font-medium">% de actualización</label>
                  <input type="number" min="0" max="100" className="w-full rounded border px-2 py-1 bg-neutral-800 text-black text-sm" placeholder="Ej: 20"
                    value={nuevoContrato.porcentajeActualizacion}
                    onChange={e => {
                      const porcentaje = e.target.value;
                      setNuevoContrato(n => {
                        const base = parseFloat(n.valorCuota) || 0;
                        const montoCuota = (base + (base * (parseFloat(porcentaje) || 0) / 100)).toFixed(2);
                        return { ...n, porcentajeActualizacion: porcentaje, montoCuota };
                      });
                    }}
                  />
                </div>
                {/* Fila 5: Monto cuota, comisión, expensas */}
                <div>
                  <label className="block mb-1 font-medium">Monto cuota a pagar</label>
                  <input
                    type="text"
                    value={(() => {
                      const base = parseFloat(nuevoContrato.valorCuota) || 0;
                      return base > 0 ? base.toFixed(2) : '-';
                    })()}
                    disabled
                    className="w-full rounded border px-2 py-1 bg-neutral-800 text-white opacity-70 text-sm"
                  />
                </div>
                <div>
                  <label className="block mb-1 font-medium">Comisión inmobiliaria (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    className="w-full rounded border px-2 py-1 bg-neutral-800 text-black text-sm"
                    placeholder="Ej: 5"
                    value={nuevoContrato.comision}
                    onChange={e => setNuevoContrato(n => ({ ...n, comision: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block mb-1 font-medium">Monto comisión inmobiliaria</label>
                  <input
                    type="text"
                    value={(() => {
                      const base = parseFloat(nuevoContrato.valorCuota) || 0;
                      const comision = parseFloat(nuevoContrato.comision) || 0;
                      if (base > 0 && comision > 0) {
                        return (base * comision / 100).toFixed(2);
                      }
                      return '-';
                    })()}
                    disabled
                    className="w-full rounded border px-2 py-1 bg-neutral-800 text-white opacity-70 text-sm"
                  />
                </div>
                <div>
                  <label className="block mb-1 font-medium">Expensas</label>
                  <select className="w-full rounded border px-2 py-1 bg-neutral-800 text-black text-sm"
                    value={nuevoContrato.expensas}
                    onChange={e => setNuevoContrato(n => ({ ...n, expensas: e.target.value }))}
                  >
                    <option value="no">No</option>
                    <option value="si">Sí</option>
                  </select>
                </div>
                {/* Fila 6: Gastos y facturación */}
                <div>
                  <label className="block mb-1 font-medium">Otros gastos (importe)</label>
                  <input type="number" min="0" className="w-full rounded border px-2 py-1 bg-neutral-800 text-black text-sm" placeholder="Importe"
                    value={nuevoContrato.otrosGastosImporte}
                    onChange={e => setNuevoContrato(n => ({ ...n, otrosGastosImporte: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block mb-1 font-medium">Detalle de gasto</label>
                  <input type="text" className="w-full rounded border px-2 py-1 bg-neutral-800 text-black text-sm" placeholder="Descripción"
                    value={nuevoContrato.otrosGastosDesc}
                    onChange={e => setNuevoContrato(n => ({ ...n, otrosGastosDesc: e.target.value }))}
                  />
                </div>
                <div></div>
                {/* Fila 7: Facturación avanzada */}
                <div>
                  <label className="block mb-1 font-medium">Moneda</label>
                  <select
                    className="w-full rounded border px-2 py-1 bg-neutral-800 text-black text-sm"
                    value={nuevoContrato.currency}
                    onChange={e => setNuevoContrato(n => ({ ...n, currency: e.target.value }))}
                  >
                    <option value="">Seleccionar moneda...</option>
                    <option value="ARS">ARS</option>
                    <option value="USD">USD</option>
                  </select>
                </div>
                <div>
                  <label className="block mb-1 font-medium">Tipo de interés por mora</label>
                  <select className="w-full rounded border px-2 py-1 bg-neutral-800 text-black text-sm"
                    value={nuevoContrato.lateFeeType}
                    onChange={e => setNuevoContrato(n => ({ ...n, lateFeeType: e.target.value }))}
                  >
                    <option value="">Sin interés</option>
                    <option value="FIXED">Fijo</option>
                    <option value="PERCENT">Porcentaje diario (%)</option>
                  </select>
                </div>
                <div>
                  <label className="block mb-1 font-medium">
                    Valor interés por mora
                  </label>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min="0"
                      step="any"
                      className="w-full rounded border px-2 py-1 bg-neutral-800 text-black text-sm"
                      placeholder={'Ej: 1 para 1% diario'}
                      value={nuevoContrato.lateFeeValue}
                      onChange={e => setNuevoContrato(n => ({ ...n, lateFeeValue: e.target.value }))}
                    />
                    {nuevoContrato.lateFeeType === 'PERCENT' && <span className="text-neutral-300">%</span>}
                  </div>
                </div>
                {/* Fila 8: Notas */}
                <div className="col-span-full">
                  <label className="block mb-1 font-medium">Notas de facturación</label>
                  <input type="text" className="w-full rounded border px-2 py-1 bg-neutral-800 text-black text-sm" placeholder="Notas"
                    value={nuevoContrato.notes}
                    onChange={e => setNuevoContrato(n => ({ ...n, notes: e.target.value }))}
                  />
                </div>
                {errorAlta && (
                  <div className="col-span-full text-red-400 text-sm mt-2">{errorAlta}</div>
                )}
              </div>
            </form>
            <div className="w-full flex justify-center mt-6">
              <button
                type="button"
                className="rounded-xl px-6 py-2 text-white font-semibold shadow bg-green-600 hover:brightness-110 text-base disabled:opacity-60"
                disabled={guardando}
                onClick={async () => {
                  setErrorAlta('');
                  setGuardando(true);
                  // Validación básica
                  if (!nuevoContrato.titular || !nuevoContrato.inquilino || !nuevoContrato.duracion || !nuevoContrato.valorCuota || !nuevoContrato.propiedadId || !nuevoContrato.fechaInicio || !nuevoContrato.fechaFin || !nuevoContrato.diaVencimiento) {
                    setErrorAlta('Completa todos los campos obligatorios.');
                    setGuardando(false);
                    return;
                  }
                  try {
                    // Construir objeto para backend (siempre con billing)
                    const contractPayload = {
                      propertyId: nuevoContrato.propiedadId,
                      ownerId: nuevoContrato.titular,
                      tenantPersonId: nuevoContrato.inquilino,
                      startDate: nuevoContrato.fechaInicio,
                      endDate: nuevoContrato.fechaFin,
                      duracion: nuevoContrato.duracion ? Number(nuevoContrato.duracion) : undefined,
                      comision: nuevoContrato.comision ? Number(nuevoContrato.comision) : undefined,
                      expensas: nuevoContrato.expensas,
                      otrosGastosImporte: nuevoContrato.otrosGastosImporte ? Number(nuevoContrato.otrosGastosImporte) : undefined,
                      otrosGastosDesc: nuevoContrato.otrosGastosDesc,
                      dueDay: nuevoContrato.diaVencimiento ? Number(nuevoContrato.diaVencimiento) : undefined,
                      baseRent: nuevoContrato.valorCuota ? Number(nuevoContrato.valorCuota) : undefined,
                      billing: {
                        dueDay: nuevoContrato.diaVencimiento ? Number(nuevoContrato.diaVencimiento) : undefined,
                        baseRent: nuevoContrato.valorCuota ? Number(nuevoContrato.valorCuota) : undefined,
                        currency: nuevoContrato.currency,
                        lateFeePolicy: {
                          type: nuevoContrato.lateFeeType || 'NONE',
                          value: nuevoContrato.lateFeeValue ? Number(nuevoContrato.lateFeeValue) : 0,
                        },
                        notes: nuevoContrato.notes,
                        actualizacionCada: nuevoContrato.actualizacionCada ? Number(nuevoContrato.actualizacionCada) : undefined,
                        porcentajeActualizacion: nuevoContrato.porcentajeActualizacion ? Number(nuevoContrato.porcentajeActualizacion) : undefined,
                      },
                    };
                    let res, data;
                    if (editContrato) {
                      res = await fetch(`/api/contracts/${editContrato._id}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(contractPayload),
                      });
                      data = await res.json();
                      if (!data.ok) throw new Error(data.message || 'Error al editar contrato');
                    } else {
                      res = await fetch('/api/contracts', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(contractPayload),
                      });
                      data = await res.json();
                      if (!data.ok) throw new Error(data.message || 'Error al crear contrato');
                    }
                    setShowAltaModal(false);
                    setNuevoContrato({
                      duracion: '',
                      titular: '',
                      inquilino: '',
                      valorCuota: '',
                      actualizacionCada: '',
                      porcentajeActualizacion: '',
                      montoCuota: '',
                      comision: '',
                      expensas: 'no',
                      otrosGastosImporte: '',
                      otrosGastosDesc: '',
                      propiedadId: '',
                      fechaInicio: '',
                      fechaFin: '',
                      diaVencimiento: '',
                      currency: '',
                      lateFeeType: '',
                      lateFeeValue: '',
                      notes: '',
                      documents: [],
                    });
                    await load();
                  } catch (err) {
                    setErrorAlta(err instanceof Error ? err.message : 'No se pudo guardar el contrato');
                  } finally {
                    setGuardando(false);
                  }
                }}
              >
                {guardando ? 'Guardando...' : 'Guardar Contrato'}
              </button>
            </div>
          </div>
        </div>
      )}
      </div>

      {err ? (
        <div className="mt-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {err}
        </div>
      ) : null}

      {/* Stats */}
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

      {/* Filtros */}
      <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
        <div className="px-4 py-3 border-b border-white/10 text-sm font-semibold">Filtros</div>
        <div className="p-4 grid grid-cols-4 gap-4">
          <div className="col-span-2">
            <div className="text-xs text-neutral-400 mb-1">BÚSQUEDA (código, dirección, owner/tenant, email, etc.)</div>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Ej: CID-001, PID-001, Propietario Demo, Bv. Demo..."
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
        <div className="px-4 py-3 border-b border-white/10 text-sm font-semibold">
          Contratos ({filtered.length})
        </div>

        <div className="p-4">
          <div className="rounded-xl border border-white/10 overflow-hidden">
            <div className="grid grid-cols-12 gap-0 bg-white/5 text-xs text-neutral-300 px-4 py-3">
              <div className="col-span-1">Estado</div>
              <div className="col-span-2">Código</div>
              <div className="col-span-4 pr-0!">Propiedad</div>
              <div className="col-span-2 pl-0!">Propietario</div>
              <div className="col-span-1">Inquilino</div>
              <div className="col-span-1 text-right">Acción</div>
            </div>

            {filtered.length === 0 ? (
              <div className="px-4 py-10 text-sm text-neutral-400">Sin resultados.</div>
            ) : (
              filtered.map((c) => {
                const p = getProperty(c);
                const o = getOwner(c);
                const t = getTenant(c);
                const badge = statusBadge(c.status);
                const propLine = p
                  ? `${p.addressLine}${p.unit ? `, ${p.unit}` : ""}`
                  : safeText(c.propertyId);
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
                    <div className="col-span-4 pr-0!">
                      <div className="text-neutral-200">{propLine || "—"}</div>
                    </div>
                    <div className="col-span-2 pl-0!">
                      <div className="text-neutral-200">{o?.fullName || "—"}</div>
                    </div>
                    <div className="col-span-1">
                      <div className="text-neutral-200">{t?.fullName || "—"}</div>
                    </div>
                    <div className="col-span-1 flex justify-end w-full gap-2">
                      <div className="flex w-full gap-2 justify-start">
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
      {/* Modal de información de contrato al tocar Ver */}
      {cuotasModal.open && cuotasModal.contrato && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="mx-auto rounded-2xl border border-white/10 bg-neutral-800 shadow-2xl py-6 px-8 relative flex flex-col items-center" style={{ maxWidth: 400, minWidth: 0 }}>
            <button
              className="absolute top-4 right-4 w-9 h-9 flex items-center justify-center rounded-full bg-neutral-700 hover:bg-red-500 transition text-white shadow cursor-pointer border border-white/10"
              type="button"
              aria-label="Cerrar"
              onClick={() => setCuotasModal({ open: false, cuotas: [], contrato: null })}
              title="Cerrar"
            >
              <svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M7 11H15" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                <path d="M11 7V15" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </button>
            <h2 className="text-xl font-bold text-green-400 mb-4">Contrato {cuotasModal.contrato.code}</h2>
            <div className="w-full flex flex-col gap-2 text-sm text-neutral-200">
              <div><span className="font-semibold text-neutral-400">Estado:</span> {statusBadge(cuotasModal.contrato.status).label}</div>
              <div><span className="font-semibold text-neutral-400">Propiedad:</span> {(() => {
                const p = getProperty(cuotasModal.contrato);
                return p ? `${p.code} - ${p.addressLine}${p.unit ? ` (${p.unit})` : ''}` : safeText(cuotasModal.contrato.propertyId);
              })()}</div>
              <div><span className="font-semibold text-neutral-400">Titular:</span> {(() => {
                const o = getOwner(cuotasModal.contrato);
                return o ? `${o.fullName}${o.code ? ` (${o.code})` : ''}` : '';
              })()}</div>
              <div><span className="font-semibold text-neutral-400">Inquilino:</span> {(() => {
                const t = getTenant(cuotasModal.contrato);
                return t ? `${t.fullName}${t.code ? ` (${t.code})` : ''}` : '';
              })()}</div>
              <div><span className="font-semibold text-neutral-400">Fecha inicio:</span> {cuotasModal.contrato.startDate ? cuotasModal.contrato.startDate.slice(0,10) : '-'}</div>
              <div><span className="font-semibold text-neutral-400">Fecha fin:</span> {cuotasModal.contrato.endDate ? cuotasModal.contrato.endDate.slice(0,10) : '-'}</div>
              <div><span className="font-semibold text-neutral-400">Valor cuota:</span> {formatARS(cuotasModal.contrato.valorCuota ?? cuotasModal.contrato.billing?.baseRent ?? 0)}</div>
              <div><span className="font-semibold text-neutral-400">Duración:</span> {cuotasModal.contrato.duracion} meses</div>
              <div><span className="font-semibold text-neutral-400">Día de vencimiento:</span> {cuotasModal.contrato.diaVencimiento ?? cuotasModal.contrato.billing?.dueDay ?? '-'}</div>
            </div>
          </div>
        </div>
      )}
                        <button
                          className="rounded-xl border border-blue-500/30 bg-blue-500/10 px-3 py-1.5 text-xs text-blue-300 hover:bg-blue-500/20 transition whitespace-nowrap"
                          title="Editar"
                          onClick={() => {
                            setEditContrato(c);
                            setShowAltaModal(true);
                            setNuevoContrato({
                              duracion: (c.duracion ?? '').toString(),
                              titular: typeof c.ownerId === 'string' ? c.ownerId : c.ownerId?._id || '',
                              inquilino: typeof c.tenantPersonId === 'string' ? c.tenantPersonId : c.tenantPersonId?._id || '',
                              valorCuota: (c.valorCuota ?? c.billing?.baseRent ?? '').toString(),
                              actualizacionCada: (c.actualizacionCada ?? c.billing?.actualizacionCada ?? '').toString(),
                              porcentajeActualizacion: (c.porcentajeActualizacion ?? c.billing?.porcentajeActualizacion ?? '').toString(),
                              montoCuota: (c.montoCuota ?? '').toString(),
                              comision: (c.comision ?? '').toString(),
                              expensas: c.expensas ?? 'no',
                              otrosGastosImporte: (c.otrosGastosImporte ?? '').toString(),
                              otrosGastosDesc: c.otrosGastosDesc ?? '',
                              propiedadId: typeof c.propertyId === 'string' ? c.propertyId : c.propertyId?._id || '',
                              fechaInicio: c.startDate ? c.startDate.slice(0, 10) : '',
                              fechaFin: c.endDate ? c.endDate.slice(0, 10) : '',
                              diaVencimiento: (c.diaVencimiento ?? c.billing?.dueDay ?? '').toString(),
                              // Campos adicionales de billing
                              currency: c.billing?.currency ?? '',
                              lateFeeType: c.billing?.lateFeePolicy?.type ?? '',
                              lateFeeValue: c.billing?.lateFeePolicy?.value?.toString() ?? '',
                              notes: c.billing?.notes ?? '',
                              documents: [],
                            });
                          }}
                        >
                          Editar
                        </button>
                        <button
                          className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs text-red-300 hover:bg-red-500/20 transition whitespace-nowrap"
                          title="Borrar"
                          onClick={() => setDeleteModal({ open: true, contrato: c })}
                        >
                          Borrar
                        </button>
      {/* Modal de confirmación de borrado */}
      {deleteModal.open && deleteModal.contrato && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="mx-auto rounded-2xl border border-red-500/30 bg-neutral-900 shadow-2xl py-6 px-6 relative flex flex-col items-center" style={{ maxWidth: 400 }}>
            <h2 className="text-xl font-bold text-red-400 mb-4">¿Eliminar contrato?</h2>
            <div className="text-neutral-200 mb-4 text-center">
              Se eliminará el contrato <span className="font-bold text-red-300">{deleteModal.contrato.code}</span>.<br />Esta acción no se puede deshacer.
            </div>
            <div className="flex gap-4 mt-2">
              <button
                className="rounded-xl px-5 py-2 text-white font-semibold shadow bg-red-600 hover:brightness-110 text-base"
                onClick={async () => {
                  if (toast.show) toast.show(`Eliminando contrato ${deleteModal.contrato?.code}...`);
                  try {
                    const res = await fetch(`/api/contracts/${String(deleteModal.contrato?._id)}`, { method: 'DELETE' });
                    const data = await res.json();
                    if (!data.ok) {
                      if (toast.show) toast.show(data.message || 'No se pudo eliminar el contrato');
                      setDeleteModal({ open: false, contrato: null });
                      return;
                    }
                    if (toast.show) toast.show('Contrato eliminado correctamente');
                    setDeleteModal({ open: false, contrato: null });
                    await load();
                  } catch {
                    if (toast.show) toast.show('Error eliminando contrato');
                    setDeleteModal({ open: false, contrato: null });
                  }
                }}
              >
                Eliminar
              </button>
              <button
                className="rounded-xl px-5 py-2 text-white font-semibold shadow bg-neutral-700 hover:brightness-110 text-base"
                onClick={() => setDeleteModal({ open: false, contrato: null })}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
