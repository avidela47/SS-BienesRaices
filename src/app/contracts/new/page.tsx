"use client";

import BackButton from "@/app/components/BackButton";
import { useEffect, useMemo, useState } from "react";
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
  ajustes?: { n: number; percentage: number }[];
  lateFeePolicy?: { type: "NONE" | "FIXED" | "PERCENT"; value: number };

  billing?: {
    dueDay?: number;
    baseRent?: number;
    currency?: string;
    lateFeePolicy?: { type: "NONE" | "FIXED" | "PERCENT"; value: number };
    notes?: string;
    actualizacionCada?: number;
    actualizacionCadaMeses?: number;
    porcentajeActualizacion?: number;
    ajustes?: { n: number; percentage: number }[];
    commissionMonthlyPct: "",
    commissionTotalPct: "",
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

function expectedAdjustmentsCount(duracionMeses: number, cadaMeses: number): number {
  if (!Number.isFinite(duracionMeses) || duracionMeses < 1) return 0;
  if (!Number.isFinite(cadaMeses) || cadaMeses <= 0) return 0;
  return Math.floor((duracionMeses - 1) / cadaMeses);
}

function buildAjustes(duracionMeses: number, actualizacionCadaMeses: number, pct: number) {
  const count = expectedAdjustmentsCount(duracionMeses, actualizacionCadaMeses);
  if (count <= 0) return [];
  const safePct = Number.isFinite(pct) ? pct : 0;
  return Array.from({ length: count }, (_v, i) => ({ n: i + 1, percentage: safePct }));
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

export default function ContractNewPage() {
  const toast = useToast();
  // const router = useRouter(); // Eliminado: no se usa
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
    actualizacionCada: string;
    porcentajeActualizacion: string;
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

  const selectedProp = useMemo(() => {
    if (!form.propiedadId) return null;
    return propiedades.find((p) => p._id === form.propiedadId) ?? null;
  }, [form.propiedadId, propiedades]);

  const lockOwner = Boolean(form.propiedadId);
  const lockTenant = Boolean(
    form.propiedadId &&
      selectedProp?.status === "RENTED" &&
      resolvePersonId(selectedProp?.inquilinoId)
  );

  const propiedadesDisponibles = useMemo(() => {
    const conContratoActivo = new Set(
      contratosActivos
        .filter((c) => c.status === "ACTIVE")
        .map((c) => (typeof c.propertyId === "string" ? c.propertyId : c.propertyId?._id))
        .filter(Boolean)
    );

    // ✅ si estoy editando, tengo que permitir la propiedad del contrato
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

      // ✅ si estoy editando, cargo el contrato y precargo el form
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

        const baseRent = c.montoBase ?? c.billing?.baseRent ?? 0;
        const dueDay = c.dueDay ?? c.billing?.dueDay ?? 10;
        const currency = c.currency ?? c.billing?.currency ?? "ARS";

        const actualizacionCada =
          c.actualizacionCadaMeses ?? c.billing?.actualizacionCadaMeses ?? c.billing?.actualizacionCada ?? 0;
        const pct = c.ajustes?.[0]?.percentage ?? c.billing?.ajustes?.[0]?.percentage ?? c.billing?.porcentajeActualizacion ?? 0;

  const lateType = c.billing?.lateFeePolicy?.type ?? c.lateFeePolicy?.type ?? "NONE";
  const lateVal = c.billing?.lateFeePolicy?.value ?? c.lateFeePolicy?.value ?? 0;

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
          commissionMonthlyPct: typeof c.billing?.commissionMonthlyPct !== "undefined" ? String(c.billing.commissionMonthlyPct) : "",
          commissionTotalPct: typeof c.billing?.commissionTotalPct !== "undefined" ? String(c.billing.commissionTotalPct) : "",
        });
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

  async function handleSave() {
    setError("");
    setSaving(true);

    try {
      // Validaciones UI
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
      const montoBase = toNum(form.valorCuota);
      const dueDay = toNum(form.diaVencimiento);

      if (!Number.isFinite(duracionMeses) || duracionMeses < 1) {
        setError("La duración (meses) debe ser >= 1.");
        return;
      }
      if (!Number.isFinite(montoBase) || montoBase < 0) {
        setError("El alquiler base es inválido.");
        return;
      }
      if (!Number.isFinite(dueDay) || dueDay < 1 || dueDay > 28) {
        setError("El día de vencimiento debe ser 1..28.");
        return;
      }

      const actualizacionCadaMesesRaw = form.actualizacionCada ? toNum(form.actualizacionCada) : 0;
      const actualizacionCadaMeses = Number.isFinite(actualizacionCadaMesesRaw)
        ? Math.max(0, Math.floor(actualizacionCadaMesesRaw))
        : 0;

      const pct = form.porcentajeActualizacion ? toNum(form.porcentajeActualizacion) : 0;
      const ajustes = actualizacionCadaMeses > 0 ? buildAjustes(duracionMeses, actualizacionCadaMeses, pct) : [];

      const payload = {
        propertyId: form.propiedadId,
        ownerId: form.titular,
        tenantPersonId: form.inquilino,
        startDate: form.fechaInicio,

        duracionMeses,
        montoBase: Math.round(montoBase),
        dueDay,
        currency: (form.currency || "ARS").trim() || "ARS",

        actualizacionCadaMeses,
        ajustes,

        billing: {
          lateFeePolicy: {
            type: (form.lateFeeType || "NONE") as "NONE" | "FIXED" | "PERCENT",
            value: form.lateFeeValue ? toNum(form.lateFeeValue) : 0,
          },
          notes: form.notes?.trim() || "Sin notas",
          commissionMonthlyPct: form.commissionMonthlyPct !== "" && !isNaN(Number(form.commissionMonthlyPct)) ? Number(form.commissionMonthlyPct) : 0,
          commissionTotalPct: form.commissionTotalPct !== "" && !isNaN(Number(form.commissionTotalPct)) ? Number(form.commissionTotalPct) : 0,
        },
      };

      // Debug: mostrar payload en consola antes de enviar
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
          <h1 className="text-3xl font-semibold">
            {isEdit ? "Editar Contrato" : "Alta de Contrato"}
          </h1>
          <p className="text-sm text-neutral-400 mt-1">Elegís Propiedad y se fija el Titular. El inquilino es editable si está vacío.</p>
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
                  const tenantResolved =
                    prop && prop.status === "RENTED" ? resolvePersonId(prop.inquilinoId) : "";

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
        <CardSection title="Actualización" subtitle="Cada X meses + % fijo">
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
              <div className="mt-1 text-[11px] text-neutral-500">0 = sin actualización</div>
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
            </div>
          </div>
        </CardSection>
      </div>

      {/* Mora y notas (abajo, en una fila más limpia) */}
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
