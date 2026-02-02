"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useToast } from "@/app/components/ToastProvider";

type PersonDTO = {
  _id: string;
  type: "OWNER" | "TENANT" | string;
  fullName: string;
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

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
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

  const [titulares, setTitulares] = useState<PersonDTO[]>([]);
  const [inquilinos, setInquilinos] = useState<PersonDTO[]>([]);
  const [propiedades, setPropiedades] = useState<PropertyDTO[]>([]);

  const [guardando, setGuardando] = useState(false);
  const [errorAlta, setErrorAlta] = useState("");

  const [form, setForm] = useState({
    propiedadId: "",
    titular: "",
    inquilino: "",
    fechaInicio: "",
    duracion: "",
    diaVencimiento: "",
    valorCuota: "",
    currency: "ARS",
    actualizacionCada: "",
    porcentajeActualizacion: "",
  });

  useEffect(() => {
    fetch("/api/people")
      .then((r) => r.json())
      .then((data) => {
        if (data?.ok && Array.isArray(data.people)) {
          setTitulares(data.people.filter((p: PersonDTO) => p.type === "OWNER"));
          setInquilinos(data.people.filter((p: PersonDTO) => p.type === "TENANT"));
        }
      })
      .catch(() => {
        setTitulares([]);
        setInquilinos([]);
      });

    fetch("/api/properties")
      .then((r) => r.json())
      .then((data) => {
        if (data?.ok && Array.isArray(data.properties)) {
          setPropiedades(data.properties);
        }
      })
      .catch(() => setPropiedades([]));
  }, []);

  const selectedProp = useMemo(() => {
    if (!form.propiedadId) return null;
    return propiedades.find((p) => p._id === form.propiedadId) ?? null;
  }, [form.propiedadId, propiedades]);

  const lockPeople = Boolean(form.propiedadId);

  async function guardar() {
    setErrorAlta("");
    setGuardando(true);

    try {
      if (!form.propiedadId || !form.fechaInicio || !form.duracion || !form.diaVencimiento || !form.valorCuota) {
        setErrorAlta("Completa todos los campos obligatorios.");
        return;
      }

      if (!form.titular) {
        setErrorAlta("La propiedad seleccionada no tiene propietario asignado.");
        return;
      }

      if (!form.inquilino) {
        setErrorAlta("La propiedad seleccionada no tiene inquilino asignado. Cargalo en Propiedades.");
        return;
      }

      const duracionMeses = toNum(form.duracion);
      const montoBase = toNum(form.valorCuota);
      const dueDay = toNum(form.diaVencimiento);

      const cadaRaw = form.actualizacionCada ? toNum(form.actualizacionCada) : 0;
      const actualizacionCadaMeses = Number.isFinite(cadaRaw) ? Math.max(0, Math.floor(cadaRaw)) : 0;
      const pct = form.porcentajeActualizacion ? toNum(form.porcentajeActualizacion) : 0;

      if (!Number.isFinite(duracionMeses) || duracionMeses < 1) {
        setErrorAlta("Duración inválida (>=1).");
        return;
      }
      if (!Number.isFinite(montoBase) || montoBase < 0) {
        setErrorAlta("Monto base inválido.");
        return;
      }
      if (!Number.isFinite(dueDay) || dueDay < 1 || dueDay > 28) {
        setErrorAlta("Día de vencimiento debe ser 1..28.");
        return;
      }

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
      };

      const res = await fetch("/api/contracts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = (await res.json()) as { ok?: boolean; message?: string };

      if (!data.ok) {
        throw new Error(data.message || "No se pudo crear el contrato");
      }

      toast.show?.("Contrato creado OK");
      // volver a listado
      window.location.href = "/contracts";
    } catch (e) {
      setErrorAlta(e instanceof Error ? e.message : "Error creando contrato");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl w-full px-6 py-8">
      <div className="flex items-start justify-between gap-6">
        <div>
          <h1 className="text-3xl font-semibold flex items-center gap-2">
            <Link
              href="/contracts"
              title="Volver a contratos"
              className="inline-flex items-center justify-center w-10 h-10 rounded-full border border-white/20 bg-white/10 hover:bg-white/20 transition text-xl text-neutral-100 shadow-sm mr-1"
            >
              <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            Alta de Contrato
          </h1>
          <div className="text-xs text-neutral-400 mt-1">
            Elegís Propiedad y se fijan Titular/Inquilino (bloqueados).
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => void guardar()}
            className="rounded-xl border bg-green-600 px-4 py-2 text-sm text-white font-semibold shadow hover:brightness-110 transition disabled:opacity-60"
            disabled={guardando}
            type="button"
          >
            {guardando ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card title="Datos principales" subtitle="Propiedad, personas, fechas, vencimiento">
          <div className="grid gap-3">
            <div>
              <label className="block mb-1 text-sm font-medium text-neutral-200">Propiedad</label>
              <select
                className="w-full rounded-xl border border-white/10 px-3 py-2 bg-black/40 text-neutral-100 text-sm outline-none focus:border-white/20"
                value={form.propiedadId}
                onChange={(e) => {
                  const propId = e.target.value;

                  if (!propId) {
                    setForm((f) => ({ ...f, propiedadId: "", titular: "", inquilino: "" }));
                    return;
                  }

                  const prop = propiedades.find((p) => p._id === propId);
                  const ownerResolved = prop ? resolvePersonId(prop.ownerId) : "";
                  const tenantResolved = prop ? resolvePersonId(prop.inquilinoId) : "";

                  setForm((f) => ({
                    ...f,
                    propiedadId: propId,
                    titular: ownerResolved,
                    inquilino: tenantResolved,
                  }));
                }}
              >
                <option value="">Seleccionar propiedad...</option>
                {propiedades.map((p) => (
                  <option key={p._id} value={p._id}>
                    {p.code} - {p.addressLine}{p.unit ? ` (${p.unit})` : ""}
                  </option>
                ))}
              </select>

              {selectedProp ? (
                <div className="mt-2 text-xs text-neutral-400">
                  <div>
                    <span className="text-neutral-500">Owner:</span>{" "}
                    {resolvePersonId(selectedProp.ownerId) || "—"}
                  </div>
                  <div>
                    <span className="text-neutral-500">Inquilino:</span>{" "}
                    {resolvePersonId(selectedProp.inquilinoId) || "— (sin inquilino)"}
                  </div>
                </div>
              ) : null}
            </div>

            <div>
              <label className="block mb-1 text-sm font-medium text-neutral-200">Titular</label>
              <select
                className="w-full rounded-xl border border-white/10 px-3 py-2 bg-black/40 text-neutral-100 text-sm outline-none focus:border-white/20 disabled:opacity-60"
                value={form.titular}
                disabled={lockPeople}
                onChange={(e) => setForm((f) => ({ ...f, titular: e.target.value }))}
              >
                <option value="">Seleccionar titular...</option>
                {titulares.map((t) => (
                  <option key={t._id} value={t._id}>
                    {t.fullName}
                  </option>
                ))}
              </select>
              {lockPeople ? <div className="mt-1 text-[11px] text-neutral-500">Bloqueado por propiedad.</div> : null}
            </div>

            <div>
              <label className="block mb-1 text-sm font-medium text-neutral-200">Inquilino</label>
              <select
                className="w-full rounded-xl border border-white/10 px-3 py-2 bg-black/40 text-neutral-100 text-sm outline-none focus:border-white/20 disabled:opacity-60"
                value={form.inquilino}
                disabled={lockPeople}
                onChange={(e) => setForm((f) => ({ ...f, inquilino: e.target.value }))}
              >
                <option value="">Seleccionar inquilino...</option>
                {inquilinos.map((i) => (
                  <option key={i._id} value={i._id}>
                    {i.fullName}
                  </option>
                ))}
              </select>
              {lockPeople ? <div className="mt-1 text-[11px] text-neutral-500">Bloqueado por propiedad.</div> : null}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block mb-1 text-sm font-medium text-neutral-200">Fecha inicio</label>
                <input
                  type="date"
                  className="w-full rounded-xl border border-white/10 px-3 py-2 bg-black/40 text-neutral-100 text-sm outline-none focus:border-white/20"
                  value={form.fechaInicio}
                  onChange={(e) => setForm((f) => ({ ...f, fechaInicio: e.target.value }))}
                />
              </div>
              <div>
                <label className="block mb-1 text-sm font-medium text-neutral-200">Duración (meses)</label>
                <input
                  type="number"
                  min={1}
                  className="w-full rounded-xl border border-white/10 px-3 py-2 bg-black/40 text-neutral-100 text-sm outline-none focus:border-white/20"
                  value={form.duracion}
                  onChange={(e) => setForm((f) => ({ ...f, duracion: e.target.value }))}
                />
              </div>
            </div>

            <div>
              <label className="block mb-1 text-sm font-medium text-neutral-200">Día vencimiento</label>
              <input
                type="number"
                min={1}
                max={28}
                className="w-full rounded-xl border border-white/10 px-3 py-2 bg-black/40 text-neutral-100 text-sm outline-none focus:border-white/20"
                value={form.diaVencimiento}
                onChange={(e) => setForm((f) => ({ ...f, diaVencimiento: e.target.value }))}
              />
            </div>
          </div>
        </Card>

        <Card title="Importes" subtitle="Base + moneda">
          <div className="grid gap-3">
            <div>
              <label className="block mb-1 text-sm font-medium text-neutral-200">Alquiler mensual (base)</label>
              <input
                type="number"
                min={0}
                className="w-full rounded-xl border border-white/10 px-3 py-2 bg-black/40 text-neutral-100 text-sm outline-none focus:border-white/20"
                value={form.valorCuota}
                onChange={(e) => setForm((f) => ({ ...f, valorCuota: e.target.value }))}
              />
            </div>

            <div>
              <label className="block mb-1 text-sm font-medium text-neutral-200">Moneda</label>
              <select
                className="w-full rounded-xl border border-white/10 px-3 py-2 bg-black/40 text-neutral-100 text-sm outline-none focus:border-white/20"
                value={form.currency}
                onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
              >
                <option value="ARS">ARS</option>
                <option value="USD">USD</option>
              </select>
            </div>
          </div>
        </Card>

        <Card title="Actualización" subtitle="Cada X meses, % fijo">
          <div className="grid gap-3">
            <div>
              <label className="block mb-1 text-sm font-medium text-neutral-200">Actualización cada (meses)</label>
              <input
                type="number"
                min={0}
                className="w-full rounded-xl border border-white/10 px-3 py-2 bg-black/40 text-neutral-100 text-sm outline-none focus:border-white/20"
                value={form.actualizacionCada}
                onChange={(e) => setForm((f) => ({ ...f, actualizacionCada: e.target.value }))}
              />
              <div className="mt-1 text-[11px] text-neutral-500">0 = sin actualización</div>
            </div>

            <div>
              <label className="block mb-1 text-sm font-medium text-neutral-200">% actualización</label>
              <input
                type="number"
                min={0}
                max={100}
                className="w-full rounded-xl border border-white/10 px-3 py-2 bg-black/40 text-neutral-100 text-sm outline-none focus:border-white/20"
                value={form.porcentajeActualizacion}
                onChange={(e) => setForm((f) => ({ ...f, porcentajeActualizacion: e.target.value }))}
              />
            </div>

            {errorAlta ? (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                {errorAlta}
              </div>
            ) : null}
          </div>
        </Card>
      </div>
    </div>
  );
}
