"use client";

import BackButton from "@/app/components/BackButton";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useToast } from "@/app/components/ToastProvider";

type ContractStatus = "DRAFT" | "ACTIVE" | "EXPIRING" | "ENDED" | "TERMINATED";

type PersonDTO = {
  _id: string;
  code?: string;
  type: "OWNER" | "TENANT" | "GUARANTOR" | string;
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

type LateFeePolicy = { type: "NONE" | "FIXED" | "PERCENT"; value: number };

type ContractDTO = {
  _id: string;
  code: string;
  status: ContractStatus;

  propertyId: PropertyDTO | string;
  ownerId: PersonDTO | string;
  tenantPersonId: PersonDTO | string;

  startDate: string;
  endDate: string;

  duracionMeses?: number;
  montoBase?: number;
  dueDay?: number;
  currency?: string;

  actualizacionCadaMeses?: number;
  porcentajeActualizacion?: number;
  lateFeePolicy?: LateFeePolicy;

  billing?: {
    dueDay?: number;
    baseRent?: number;
    currency?: string;
    lateFeePolicy?: LateFeePolicy;
    notes?: string;

    actualizacionCadaMeses?: number;
    porcentajeActualizacion?: number;

    commissionMonthlyPct?: number;
    commissionTotalPct?: number;

    recalcFrom?: string; // "YYYY-MM"
  };
};

function toNum(v: unknown): number {
  const n = typeof v === "number" ? v : Number(String(v ?? "").trim());
  return Number.isFinite(n) ? n : NaN;
}

function resolvePersonId(v: PropertyDTO["ownerId"] | PropertyDTO["inquilinoId"]): string {
  if (!v) return "";
  if (typeof v === "string") return v;
  return v._id || "";
}

function CardSection({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
      <div className="px-4 py-3 border-b border-white/10">
        <div className="text-sm font-semibold text-neutral-100">{title}</div>
        {subtitle ? <div className="text-xs text-neutral-400 mt-0.5">{subtitle}</div> : null}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

/* ====== helpers date-only sin timezone ====== */
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

function addMonthsYM(y: number, mo: number, add: number) {
  const idx = y * 12 + (mo - 1) + add;
  const ny = Math.floor(idx / 12);
  const nmo = (idx % 12) + 1;
  return { y: ny, mo: nmo };
}

/**
 * startDate=2026-01-01, cada=3 => 2026-04
 */
function calcRecalcFromPeriod(startDateISO: string, eachMonths: number): string {
  const cada = Math.max(0, Math.floor(Number(eachMonths) || 0));
  const start = String(startDateISO ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return "";
  if (cada <= 0) return start.slice(0, 7);
  const { y, mo } = parseISODateOnly(start);
  const next = addMonthsYM(y, mo, cada);
  return buildYM(next.y, next.mo);
}

export default function ContractNewPage() {
  // Modal cálculo índice de actualización
  const [showCalcModal, setShowCalcModal] = useState(false);
  const [calcIndex, setCalcIndex] = useState("IPC");
  const [calcFrom, setCalcFrom] = useState("");
  const [calcTo, setCalcTo] = useState("");
  const [calcAmount, setCalcAmount] = useState("");
  const [calcPercent, setCalcPercent] = useState("");

  const toast = useToast();
  const sp = useSearchParams();
  const editId = (sp.get("id") || "").trim();
  const isEdit = Boolean(editId);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [titulares, setTitulares] = useState<PersonDTO[]>([]);
  const [inquilinos, setInquilinos] = useState<PersonDTO[]>([]);
  const [propiedades, setPropiedades] = useState<PropertyDTO[]>([]);
  const [contratosActivos, setContratosActivos] = useState<ContractDTO[]>([]);

  type ContractFormState = {
    propiedadId: string;
    titular: string;
    inquilino: string;
    fechaInicio: string;
    fechaFin: string;
    duracion: string;
    diaVencimiento: string;
    valorCuota: string;
    currency: string;

    actualizacionCada: string; // meses
    porcentajeActualizacion: string; // % tramo

    lateFeeType: string;
    lateFeeValue: string;

    notes: string;

    commissionMonthlyPct: string;
    commissionTotalPct: string;
  };

  const blankForm: ContractFormState = {
    propiedadId: "",
    titular: "",
    inquilino: "",
    fechaInicio: "",
    fechaFin: "",
    duracion: "",
    diaVencimiento: "",
    valorCuota: "",
    currency: "ARS",

    actualizacionCada: "",
    porcentajeActualizacion: "",

    lateFeeType: "NONE",
    lateFeeValue: "",

    notes: "",
    commissionMonthlyPct: "",
    commissionTotalPct: "",
  };

  const [form, setForm] = useState(blankForm);

  // ✅ Snapshot de valores cargados desde backend (para detectar qué cambió en edit)
  const originalRef = useRef<{
    startDate: string;
    duracionMeses: number;
    montoBase: number;
    dueDay: number;
    currency: string;
    actualizacionCadaMeses: number;
    porcentajeActualizacion: number;
    lateType: LateFeePolicy["type"];
    lateValue: number;
  } | null>(null);

  const selectedProp = useMemo(() => {
    if (!form.propiedadId) return null;
    return propiedades.find((p) => p._id === form.propiedadId) ?? null;
  }, [form.propiedadId, propiedades]);

  const lockOwner = Boolean(form.propiedadId);
  const lockTenant = Boolean(
    form.propiedadId && selectedProp?.status === "RENTED" && resolvePersonId(selectedProp?.inquilinoId)
  );

  const propiedadesDisponibles = useMemo(() => {
    const conContratoActivo = new Set(
      contratosActivos
        .filter((c) => c.status === "ACTIVE")
        .map((c) => (typeof c.propertyId === "string" ? c.propertyId : c.propertyId?._id))
        .filter(Boolean)
    );

    if (isEdit && selectedProp?._id) conContratoActivo.delete(selectedProp._id);

    return propiedades.filter((p) => !conContratoActivo.has(p._id));
  }, [contratosActivos, propiedades, isEdit, selectedProp?._id]);

  async function loadAll() {
    setError("");
    setLoading(true);
    try {
      const [peopleRes, propsRes, contractsRes] = await Promise.all([
        fetch("/api/people", { cache: "no-store" }),
        fetch("/api/properties", { cache: "no-store" }),
        fetch("/api/contracts", { cache: "no-store" }),
      ]);

      const peopleData = await peopleRes.json();
      const propsData = await propsRes.json();
      const contractsData = await contractsRes.json();

      if (peopleData?.ok && Array.isArray(peopleData.people)) {
        setTitulares(peopleData.people.filter((p: PersonDTO) => p.type === "OWNER"));
        setInquilinos(peopleData.people.filter((p: PersonDTO) => p.type === "TENANT"));
      }

      if (propsData?.ok && Array.isArray(propsData.properties)) {
        setPropiedades(propsData.properties);
      }

      if (contractsData?.ok && Array.isArray(contractsData.contracts)) {
        setContratosActivos(contractsData.contracts);
      }

      if (isEdit) {
        const oneRes = await fetch(`/api/contracts/${editId}`, { cache: "no-store" });
        const oneData = await oneRes.json();

        if (!oneRes.ok || !oneData?.ok || !oneData?.contract) {
          throw new Error(oneData?.message || "No se pudo cargar el contrato para editar");
        }

        const c: ContractDTO = oneData.contract;

        const pid = typeof c.propertyId === "string" ? c.propertyId : c.propertyId?._id || "";
        const ownerId = typeof c.ownerId === "string" ? c.ownerId : c.ownerId?._id || "";
        const tenantId = typeof c.tenantPersonId === "string" ? c.tenantPersonId : c.tenantPersonId?._id || "";

        const baseRent = Number(c.montoBase ?? c.billing?.baseRent ?? 0);
        const dueDay = Number(c.dueDay ?? c.billing?.dueDay ?? 10);
        const currency = String(c.currency ?? c.billing?.currency ?? "ARS");

        const actualizacionCada = Number(c.actualizacionCadaMeses ?? c.billing?.actualizacionCadaMeses ?? 0);
        const pct = Number(c.porcentajeActualizacion ?? c.billing?.porcentajeActualizacion ?? 0);

        const lateType = (c.billing?.lateFeePolicy?.type ?? c.lateFeePolicy?.type ?? "NONE") as LateFeePolicy["type"];
        const lateVal = Number(c.billing?.lateFeePolicy?.value ?? c.lateFeePolicy?.value ?? 0);

        // ✅ snapshot original para decidir recalcFrom en edit
        originalRef.current = {
          startDate: c.startDate ? c.startDate.slice(0, 10) : "",
          duracionMeses: Number(c.duracionMeses ?? 0),
          montoBase: baseRent,
          dueDay,
          currency,
          actualizacionCadaMeses: actualizacionCada,
          porcentajeActualizacion: pct,
          lateType,
          lateValue: lateVal,
        };

        setForm({
          ...blankForm,
          propiedadId: pid,
          titular: ownerId,
          inquilino: tenantId,
          fechaInicio: c.startDate ? c.startDate.slice(0, 10) : "",
          fechaFin: c.endDate ? c.endDate.slice(0, 10) : "",
          duracion: String(c.duracionMeses ?? ""),
          diaVencimiento: String(dueDay ?? ""),
          valorCuota: String(baseRent ?? ""),
          currency: String(currency ?? "ARS"),
          actualizacionCada: String(actualizacionCada || ""),
          porcentajeActualizacion: String(pct || ""),
          lateFeeType: lateType,
          lateFeeValue: String(lateVal || ""),
          notes: String(c.billing?.notes ?? ""),
          commissionMonthlyPct:
            typeof c.billing?.commissionMonthlyPct !== "undefined" ? String(c.billing.commissionMonthlyPct) : "",
          commissionTotalPct:
            typeof c.billing?.commissionTotalPct !== "undefined" ? String(c.billing.commissionTotalPct) : "",
        });
      } else {
        originalRef.current = null;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error cargando datos");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId]);

  function computeRecalcFromForEdit(params: {
    startDate: string;
    duracionMeses: number;
    montoBase: number;
    dueDay: number;
    currency: string;
    actualizacionCadaMeses: number;
    porcentajeActualizacion: number;
    lateType: LateFeePolicy["type"];
    lateValue: number;
  }): string | undefined {
    const orig = originalRef.current;
    if (!orig) return undefined; // no edit

    // cambios estructurales => recalcular desde inicio
    const structuralChanged =
      orig.startDate !== params.startDate ||
      orig.duracionMeses !== params.duracionMeses ||
      orig.montoBase !== params.montoBase ||
      orig.dueDay !== params.dueDay ||
      orig.currency !== params.currency;

    if (structuralChanged) return params.startDate.slice(0, 7);

    // cambios de actualización o mora => recalcular desde próximo tramo
    const updateChanged =
      orig.actualizacionCadaMeses !== params.actualizacionCadaMeses ||
      orig.porcentajeActualizacion !== params.porcentajeActualizacion ||
      orig.lateType !== params.lateType ||
      orig.lateValue !== params.lateValue;

    if (updateChanged) {
      return calcRecalcFromPeriod(params.startDate, params.actualizacionCadaMeses);
    }

    // nada cambió importante => no mandamos recalcFrom
    return undefined;
  }

  async function handleSave() {
    setError("");
    setSaving(true);

    try {
      if (!form.propiedadId || !form.fechaInicio || !form.duracion || !form.diaVencimiento || !form.valorCuota) {
        setError("Completa Propiedad, Inicio, Duración, Día vencimiento y Alquiler base.");
        return;
      }
      if (!form.titular) {
        setError("La propiedad seleccionada no tiene propietario asignado.");
        return;
      }
      if (!form.inquilino) {
        setError("La propiedad seleccionada no tiene inquilino asignado. Cargalo en Propiedades.");
        return;
      }

      const duracionMeses = toNum(form.duracion);
      const montoBaseRaw = toNum(form.valorCuota);
      const dueDay = toNum(form.diaVencimiento);

      if (!Number.isFinite(duracionMeses) || duracionMeses < 1) {
        setError("La duración (meses) debe ser >= 1.");
        return;
      }
      if (!Number.isFinite(montoBaseRaw) || montoBaseRaw < 0) {
        setError("El alquiler base es inválido.");
        return;
      }
      if (!Number.isFinite(dueDay) || dueDay < 1 || dueDay > 28) {
        setError("El día de vencimiento debe ser 1..28.");
        return;
      }

      const montoBase = Math.round(montoBaseRaw);

      const actualizacionCadaMesesRaw = form.actualizacionCada ? toNum(form.actualizacionCada) : 0;
      const actualizacionCadaMeses = Number.isFinite(actualizacionCadaMesesRaw)
        ? Math.max(0, Math.floor(actualizacionCadaMesesRaw))
        : 0;

      const pctRaw = form.porcentajeActualizacion ? toNum(form.porcentajeActualizacion) : 0;
      const porcentajeActualizacion = Number.isFinite(pctRaw) ? pctRaw : 0;

      const lateType = (form.lateFeeType || "NONE") as LateFeePolicy["type"];
      const lateValueRaw = form.lateFeeValue ? toNum(form.lateFeeValue) : 0;
      const lateValue = Number.isFinite(lateValueRaw) ? lateValueRaw : 0;

      // ✅ recalcFrom solo cuando corresponde (NO siempre)
      const recalcFrom = isEdit
        ? computeRecalcFromForEdit({
            startDate: form.fechaInicio,
            duracionMeses,
            montoBase,
            dueDay,
            currency: (form.currency || "ARS").trim() || "ARS",
            actualizacionCadaMeses,
            porcentajeActualizacion,
            lateType,
            lateValue,
          })
        : undefined;

      const payload: any = {
        propertyId: form.propiedadId,
        ownerId: form.titular,
        tenantPersonId: form.inquilino,

        startDate: form.fechaInicio,

        duracionMeses,
        montoBase,
        dueDay,
        currency: (form.currency || "ARS").trim() || "ARS",

        actualizacionCadaMeses,
        porcentajeActualizacion,

        billing: {
          baseRent: montoBase,
          currency: (form.currency || "ARS").trim() || "ARS",
          dueDay,
          lateFeePolicy: { type: lateType, value: lateValue },
          notes: form.notes?.trim() || "Sin notas",

          actualizacionCadaMeses,
          porcentajeActualizacion,

          commissionMonthlyPct:
            form.commissionMonthlyPct !== "" && !isNaN(Number(form.commissionMonthlyPct))
              ? Number(form.commissionMonthlyPct)
              : 0,
          commissionTotalPct:
            form.commissionTotalPct !== "" && !isNaN(Number(form.commissionTotalPct))
              ? Number(form.commissionTotalPct)
              : 0,
        },
      };

      // ✅ solo agregamos recalcFrom si existe
      if (recalcFrom) payload.billing.recalcFrom = recalcFrom;

      console.debug("[CONTRACT-FRONT] payload:", payload);

      const res = await fetch(isEdit ? `/api/contracts/${editId}` : "/api/contracts", {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || data?.message || "No se pudo guardar el contrato");
      }

      toast.show?.(isEdit ? "Contrato actualizado" : "Contrato creado");
      window.location.href = "/contracts";
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error guardando contrato");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="mx-auto max-w-6xl w-full px-6 py-8 text-neutral-300">Cargando…</div>;
  }

  return (
    <div className="mx-auto max-w-6xl w-full px-6 py-8">
      <div className="flex items-start justify-between gap-6 mb-6">
        <div>
          <h1 className="text-3xl font-semibold">{isEdit ? "Editar Contrato" : "Alta de Contrato"}</h1>
          <p className="text-sm text-neutral-400 mt-1">
            Elegís Propiedad y se fija el Titular. El inquilino es editable si está vacío.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <BackButton href="/contracts" />
          <button
            onClick={() => void handleSave()}
            disabled={saving}
            className="rounded-xl border border-emerald-400/30 bg-emerald-500/15 px-5 py-2 text-sm text-white font-semibold shadow hover:brightness-110 transition disabled:opacity-60"
          >
            {saving ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </div>

      {error ? (
        <div className="mb-5 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Col 1 */}
        <CardSection title="Datos principales" subtitle="Propiedad, personas, fechas, vencimiento">
          <div className="grid grid-cols-1 gap-3">
            <div>
              <label className="block mb-1 text-sm font-medium text-neutral-200">Propiedad</label>
              <select
                className="w-full rounded-xl border border-white/10 px-3 py-2 bg-black/40 text-neutral-100 text-sm outline-none focus:border-white/20"
                value={form.propiedadId || ""}
                onChange={(e) => {
                  const propId = e.target.value;

                  if (!propId) {
                    setForm((f) => ({ ...f, propiedadId: "", titular: "", inquilino: "" }));
                    return;
                  }

                  const prop = propiedades.find((p) => p._id === propId);
                  const ownerResolved = prop ? resolvePersonId(prop.ownerId) : "";
                  const tenantResolved = prop && prop.status === "RENTED" ? resolvePersonId(prop.inquilinoId) : "";

                  setForm((f) => ({
                    ...f,
                    propiedadId: propId,
                    titular: ownerResolved || f.titular,
                    inquilino: tenantResolved || f.inquilino,
                  }));
                }}
              >
                <option value="">Seleccionar propiedad...</option>
                {propiedadesDisponibles.map((p) => {
                  const labelBase = `${p.code} — ${p.addressLine}${p.unit ? ` (${p.unit})` : ""}`;
                  return (
                    <option key={p._id} value={p._id}>
                      {labelBase}
                    </option>
                  );
                })}
              </select>
            </div>

            <div>
              <label className="block mb-1 text-sm font-medium text-neutral-200">Titular</label>
              <select
                className="w-full rounded-xl border border-white/10 px-3 py-2 bg-black/40 text-neutral-100 text-sm outline-none focus:border-white/20 disabled:opacity-60"
                value={form.titular}
                disabled={lockOwner}
                onChange={(e) => setForm((f) => ({ ...f, titular: e.target.value }))}
              >
                <option value="">Seleccionar titular...</option>
                {titulares.map((t) => (
                  <option key={t._id} value={t._id}>
                    {t.fullName} {t.code ? `(${t.code})` : ""}
                  </option>
                ))}
              </select>
              {lockOwner ? <div className="mt-1 text-[11px] text-neutral-500">Bloqueado por propiedad.</div> : null}
            </div>

            <div>
              <label className="block mb-1 text-sm font-medium text-neutral-200">Inquilino</label>
              <select
                className="w-full rounded-xl border border-white/10 px-3 py-2 bg-black/40 text-neutral-100 text-sm outline-none focus:border-white/20 disabled:opacity-60"
                value={form.inquilino}
                disabled={lockTenant}
                onChange={(e) => setForm((f) => ({ ...f, inquilino: e.target.value }))}
              >
                <option value="">Seleccionar inquilino...</option>
                {inquilinos.map((i) => (
                  <option key={i._id} value={i._id}>
                    {i.fullName} {i.code ? `(${i.code})` : ""}
                  </option>
                ))}
              </select>
              {lockTenant ? <div className="mt-1 text-[11px] text-neutral-500">Bloqueado por propiedad.</div> : null}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block mb-1 text-sm font-medium text-neutral-200">Fecha inicio</label>
                <input
                  type="date"
                  className="w-full rounded-xl border border-white/10 px-3 py-2 bg-black/40 text-neutral-100 text-sm outline-none focus:border-white/20"
                  value={form.fechaInicio || ""}
                  onChange={(e) => setForm((f) => ({ ...f, fechaInicio: e.target.value }))}
                />
              </div>
              <div>
                <label className="block mb-1 text-sm font-medium text-neutral-200">Duración (meses)</label>
                <input
                  type="number"
                  min="1"
                  className="w-full rounded-xl border border-white/10 px-3 py-2 bg-black/40 text-neutral-100 text-sm outline-none focus:border-white/20"
                  value={form.duracion || ""}
                  onChange={(e) => setForm((f) => ({ ...f, duracion: e.target.value }))}
                />
              </div>
            </div>

            <div>
              <label className="block mb-1 text-sm font-medium text-neutral-200">Día vencimiento (1–28)</label>
              <input
                type="number"
                min="1"
                max="28"
                className="w-full rounded-xl border border-white/10 px-3 py-2 bg-black/40 text-neutral-100 text-sm outline-none focus:border-white/20"
                value={form.diaVencimiento || ""}
                onChange={(e) => setForm((f) => ({ ...f, diaVencimiento: e.target.value }))}
              />
            </div>
          </div>
        </CardSection>

        {/* Col 2 */}
        <CardSection title="Importes" subtitle="Base + moneda + comisiones">
          <div className="grid grid-cols-1 gap-3">
            <div>
              <label className="block mb-1 text-sm font-medium text-neutral-200">Alquiler mensual (base)</label>
              <input
                type="number"
                min="0"
                className="w-full rounded-xl border border-white/10 px-3 py-2 bg-black/40 text-neutral-100 text-sm outline-none focus:border-white/20"
                value={form.valorCuota || ""}
                onChange={(e) => setForm((f) => ({ ...f, valorCuota: e.target.value }))}
              />
            </div>

            <div>
              <label className="block mb-1 text-sm font-medium text-neutral-200">Moneda</label>
              <select
                className="w-full rounded-xl border border-white/10 px-3 py-2 bg-black/40 text-neutral-100 text-sm outline-none focus:border-white/20"
                value={form.currency || "ARS"}
                onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
              >
                <option value="ARS">ARS</option>
                <option value="USD">USD</option>
              </select>
            </div>

            <div>
              <label className="block mb-1 text-sm font-medium text-neutral-200">Comisión inmobiliaria mensual (%)</label>
              <input
                type="number"
                min="0"
                max="100"
                className="w-full rounded-xl border border-white/10 px-3 py-2 bg-black/40 text-neutral-100 text-sm outline-none focus:border-white/20"
                value={form.commissionMonthlyPct || ""}
                onChange={(e) => setForm((f) => ({ ...f, commissionMonthlyPct: e.target.value }))}
                placeholder="Ej: 10"
              />
              <div className="mt-1 text-[11px] text-neutral-500">No se suma al alquiler, se descuenta en liquidación.</div>
            </div>

            <div>
              <label className="block mb-1 text-sm font-medium text-neutral-200">Comisión total por contrato (%)</label>
              <input
                type="number"
                min="0"
                max="100"
                className="w-full rounded-xl border border-white/10 px-3 py-2 bg-black/40 text-neutral-100 text-sm outline-none focus:border-white/20"
                value={form.commissionTotalPct || ""}
                onChange={(e) => setForm((f) => ({ ...f, commissionTotalPct: e.target.value }))}
                placeholder="Ej: 5"
              />
              <div className="mt-1 text-[11px] text-neutral-500">Se descuenta del total del contrato en liquidación.</div>
            </div>
          </div>
        </CardSection>

        {/* Col 3 */}
        <CardSection title="Actualización" subtitle="Cada X meses + % por tramo (manual)">
          <div className="grid grid-cols-1 gap-3">
            <div>
              <label className="block mb-1 text-sm font-medium text-neutral-200">Actualización cada (meses)</label>
              <input
                type="number"
                min="0"
                className="w-full rounded-xl border border-white/10 px-3 py-2 bg-black/40 text-neutral-100 text-sm outline-none focus:border-white/20"
                value={form.actualizacionCada || ""}
                onChange={(e) => setForm((f) => ({ ...f, actualizacionCada: e.target.value }))}
              />
              <div className="mt-1 text-[11px] text-neutral-500">
                0 = sin actualización · En edición solo recalcula desde tramo si cambias índice/mora.
              </div>
            </div>

            <div>
              <label className="block mb-1 text-sm font-medium text-neutral-200">% actualización</label>
              <input
                type="number"
                min="0"
                max="100"
                className="w-full rounded-xl border border-white/10 px-3 py-2 bg-black/40 text-neutral-100 text-sm outline-none focus:border-white/20"
                value={form.porcentajeActualizacion || ""}
                onChange={(e) => setForm((f) => ({ ...f, porcentajeActualizacion: e.target.value }))}
              />

              <div style={{ marginTop: 16, display: "flex", justifyContent: "center" }}>
                <button
                  type="button"
                  style={{
                    background: "#0ea5e9",
                    color: "white",
                    border: "none",
                    borderRadius: "8px",
                    padding: "12px 24px",
                    fontWeight: 600,
                    fontSize: "1rem",
                    cursor: "pointer",
                    width: "100%",
                  }}
                  onClick={() => {
                    setCalcIndex("IPC");
                    setCalcFrom(form.fechaInicio || "");
                    setCalcTo("");
                    setCalcAmount(form.valorCuota || "");
                    setCalcPercent("");
                    setShowCalcModal(true);
                  }}
                >
                  Calcular índice de actualización
                </button>
              </div>

              {showCalcModal && (
                <div
                  style={{
                    position: "fixed",
                    top: 0,
                    left: 0,
                    width: "100vw",
                    height: "100vh",
                    background: "rgba(0,0,0,0.5)",
                    zIndex: 1000,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <div
                    style={{
                      background: "#18181b",
                      borderRadius: 12,
                      padding: 32,
                      minWidth: 340,
                      maxWidth: 400,
                      boxShadow: "0 4px 32px #0008",
                    }}
                  >
                    <h2 style={{ fontWeight: 700, fontSize: 20, marginBottom: 16, color: "#fff" }}>
                      Calcular índice de actualización
                    </h2>

                    <div style={{ marginBottom: 12 }}>
                      <label style={{ color: "#ccc", fontSize: 14 }}>Índice</label>
                      <select
                        value={calcIndex}
                        onChange={(e) => setCalcIndex(e.target.value)}
                        style={{
                          width: "100%",
                          padding: 8,
                          borderRadius: 6,
                          marginTop: 4,
                          background: "#222",
                          color: "#fff",
                          border: "1px solid #444",
                        }}
                      >
                        <option value="IPC">IPC (Índice de Precios al Consumidor)</option>
                        <option value="ICL">ICL (Índice Contratos de Locación)</option>
                        <option value="CER">CER (Coef. Estabilización de Referencia)</option>
                        <option value="CAC">CAC (Cámara Argentina de la Construcción)</option>
                        <option value="UVA">UVA (Unidad de Valor Adquisitivo)</option>
                      </select>
                    </div>

                    <div style={{ marginBottom: 12 }}>
                      <label style={{ color: "#ccc", fontSize: 14 }}>Desde</label>
                      <input
                        type="date"
                        value={calcFrom}
                        onChange={(e) => setCalcFrom(e.target.value)}
                        style={{
                          width: "100%",
                          padding: 8,
                          borderRadius: 6,
                          marginTop: 4,
                          background: "#222",
                          color: "#fff",
                          border: "1px solid #444",
                        }}
                      />
                    </div>

                    <div style={{ marginBottom: 12 }}>
                      <label style={{ color: "#ccc", fontSize: 14 }}>Cantidad de meses</label>
                      <input
                        type="number"
                        min="1"
                        value={calcTo}
                        onChange={(e) => setCalcTo(e.target.value)}
                        style={{
                          width: "120px",
                          padding: 8,
                          borderRadius: 6,
                          marginTop: 4,
                          background: "#222",
                          color: "#fff",
                          border: "1px solid #444",
                        }}
                      />
                    </div>

                    <div style={{ marginBottom: 12 }}>
                      <label style={{ color: "#ccc", fontSize: 14 }}>Monto base</label>
                      <input
                        value={calcAmount}
                        onChange={(e) => setCalcAmount(e.target.value)}
                        style={{ width: "100%", padding: 8, borderRadius: 6, marginTop: 4 }}
                      />
                    </div>

                    <div style={{ marginBottom: 16 }}>
                      <label style={{ color: "#ccc", fontSize: 14 }}>% sugerido</label>
                      <input
                        value={calcPercent}
                        readOnly
                        style={{
                          width: "100%",
                          padding: 8,
                          borderRadius: 6,
                          marginTop: 4,
                          background: "#222",
                          color: "#0ea5e9",
                          fontWeight: 700,
                        }}
                        placeholder="(aquí irá el cálculo)"
                      />
                    </div>

                    <div style={{ marginBottom: 16, display: "flex", justifyContent: "flex-end" }}>
                      <button
                        type="button"
                        style={{
                          padding: "8px 16px",
                          borderRadius: 6,
                          background: "#444",
                          color: "#fff",
                          border: "none",
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                        onClick={async () => {
                          if (!calcFrom || !calcTo || !calcAmount) {
                            setCalcPercent("");
                            return;
                          }
                          const months = parseInt(calcTo, 10);
                          if (!months || months < 1) {
                            setCalcPercent("");
                            return;
                          }

                          const { y, mo, d } = parseISODateOnly(calcFrom);
                          const endYM = addMonthsYM(y, mo, months);
                          const toDate = `${buildYM(endYM.y, endYM.mo)}-${pad2(d)}`;

                          try {
                            const res = await fetch("/api/rents/calculate", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                indexKey: calcIndex,
                                fromDate: calcFrom,
                                toDate,
                                amount: Number(calcAmount),
                              }),
                            });
                            const json = await res.json();
                            if (json && json.ok && typeof json.percent !== "undefined") {
                              setCalcPercent(String(json.percent));
                            } else if (json && json.error) {
                              setCalcPercent("");
                              alert("Error al calcular índice: " + json.error);
                            } else {
                              setCalcPercent("");
                              alert("Error desconocido al calcular índice.");
                            }
                          } catch {
                            setCalcPercent("");
                            alert("Error de red o del servidor al calcular índice.");
                          }
                        }}
                      >
                        Calcular
                      </button>
                    </div>

                    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                      <button
                        onClick={() => setShowCalcModal(false)}
                        style={{
                          padding: "8px 16px",
                          borderRadius: 6,
                          background: "#333",
                          color: "#fff",
                          border: "none",
                          cursor: "pointer",
                        }}
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={() => {
                          setForm((f) => ({ ...f, porcentajeActualizacion: calcPercent }));
                          setShowCalcModal(false);
                        }}
                        style={{
                          padding: "8px 16px",
                          borderRadius: 6,
                          background: "#0ea5e9",
                          color: "#fff",
                          border: "none",
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        Usar este valor
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </CardSection>
      </div>

      {/* Mora y notas */}
      <div className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
        <CardSection title="Mora" subtitle="Interés por mora (opcional)">
          <div className="grid grid-cols-1 gap-3">
            <div>
              <label className="block mb-1 text-sm font-medium text-neutral-200">Tipo</label>
              <select
                className="w-full rounded-xl border border-white/10 px-3 py-2 bg-black/40 text-neutral-100 text-sm outline-none focus:border-white/20"
                value={form.lateFeeType}
                onChange={(e) => setForm((f) => ({ ...f, lateFeeType: e.target.value }))}
              >
                <option value="NONE">Sin interés</option>
                <option value="FIXED">Fijo</option>
                <option value="PERCENT">Porcentaje diario (%)</option>
              </select>
            </div>

            <div>
              <label className="block mb-1 text-sm font-medium text-neutral-200">Valor</label>
              <input
                type="number"
                min="0"
                step="any"
                className="w-full rounded-xl border border-white/10 px-3 py-2 bg-black/40 text-neutral-100 text-sm outline-none focus:border-white/20"
                value={form.lateFeeValue || ""}
                onChange={(e) => setForm((f) => ({ ...f, lateFeeValue: e.target.value }))}
                placeholder={form.lateFeeType === "PERCENT" ? "Ej: 1 (1% diario)" : "Ej: 5000"}
              />
            </div>
          </div>
        </CardSection>

        <div className="lg:col-span-2">
          <CardSection title="Notas" subtitle="Notas de facturación / cláusulas / observaciones">
            <input
              type="text"
              className="w-full rounded-xl border border-white/10 px-3 py-2 bg-black/40 text-neutral-100 text-sm outline-none focus:border-white/20"
              value={form.notes || ""}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Ej: contrato firmado, cláusulas especiales, observaciones…"
            />
          </CardSection>
        </div>
      </div>
    </div>
  );
}
