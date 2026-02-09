// ✅ Archivo: src/app/dashboard/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import BackButton from "@/app/components/BackButton";

type ApiOk<T> = { ok: true } & T;
type ApiErr = { ok: false; error?: string; message?: string };

type PersonDTO = {
  _id: string;
  code?: string;
  type?: string; // OWNER | TENANT | GUARANTOR
  fullName?: string;
  email?: string;
  phone?: string;
  createdAt?: string;
};

type PropertyDTO = {
  _id: string;
  code?: string;
  status?: "AVAILABLE" | "RENTED" | "MAINTENANCE" | string;
  addressLine?: string;
  unit?: string;
  city?: string;
  createdAt?: string;
};

type PaymentDTO = {
  _id: string;
  date?: string;
  amount?: number;
  method?: string;
  status?: "OK" | "VOID" | string;
  createdAt?: string;
};

type DocumentDTO = {
  _id: string;
  title?: string;
  type?: string;
  entity?: string;
  createdAt?: string;
};

type InstallmentDTO = {
  _id: string;
  period?: string; // YYYY-MM
  amount?: number;
  status?: "PAID" | "PENDING" | string;
  paidAmount?: number;
  dueDate?: string;
  createdAt?: string;
};

type DashboardSummaryResponse =
  | ApiOk<{
      period: string;
      alquilerMensual: { total: number; cobrado: number; pendiente: number; cantidad: number };
    }>
  | ApiErr;

type PeopleResponse = ApiOk<{ people: PersonDTO[] }> | ApiErr;
type PropertiesResponse = ApiOk<{ properties: PropertyDTO[] }> | ApiErr;
type PaymentsResponse = ApiOk<{ payments: PaymentDTO[] }> | ApiErr;
type DocumentsResponse = ApiOk<{ documents: DocumentDTO[] }> | ApiErr;
type InstallmentsResponse = ApiOk<{ installments: InstallmentDTO[] }> | ApiErr;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function getErr(r: unknown, fallback: string) {
  if (!isRecord(r)) return fallback;
  const m = r["message"];
  const e = r["error"];
  if (typeof m === "string" && m.trim()) return m;
  if (typeof e === "string" && e.trim()) return e;
  return fallback;
}

function formatCurrency(value: number, currency = "ARS") {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
}

function formatDateShort(value?: string) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" });
}

function safeStr(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function pickLatest<T extends { createdAt?: string; date?: string }>(arr: T[], n: number): T[] {
  const copy = [...arr];
  copy.sort((a, b) => {
    const da = new Date(a.createdAt || a.date || 0).getTime();
    const db = new Date(b.createdAt || b.date || 0).getTime();
    return db - da;
  });
  return copy.slice(0, n);
}

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [people, setPeople] = useState<PersonDTO[]>([]);
  const [properties, setProperties] = useState<PropertyDTO[]>([]);
  const [payments, setPayments] = useState<PaymentDTO[]>([]);
  const [documents, setDocuments] = useState<DocumentDTO[]>([]);
  const [installments, setInstallments] = useState<InstallmentDTO[]>([]);

  const [rentPeriod, setRentPeriod] = useState<string>("");
  const [rentTotal, setRentTotal] = useState<number>(0);
  const [rentPaid, setRentPaid] = useState<number>(0);
  const [rentPending, setRentPending] = useState<number>(0);
  const [rentCount, setRentCount] = useState<number>(0);

  async function loadAll() {
    setLoading(true);
    setErr("");

    try {
      const [
        dashRes,
        peopleRes,
        propertiesRes,
        paymentsRes,
        docsRes,
        instRes,
      ] = await Promise.all([
        fetch("/api/dashboard/summary", { cache: "no-store" }),
        fetch("/api/people", { cache: "no-store" }),
        fetch("/api/properties", { cache: "no-store" }),
        fetch("/api/payments", { cache: "no-store" }),
        fetch("/api/documents", { cache: "no-store" }),
        fetch("/api/installments", { cache: "no-store" }),
      ]);

      const dashJson = (await dashRes.json().catch(() => ({}))) as unknown;
      const peopleJson = (await peopleRes.json().catch(() => ({}))) as unknown;
      const propertiesJson = (await propertiesRes.json().catch(() => ({}))) as unknown;
      const paymentsJson = (await paymentsRes.json().catch(() => ({}))) as unknown;
      const docsJson = (await docsRes.json().catch(() => ({}))) as unknown;
      const instJson = (await instRes.json().catch(() => ({}))) as unknown;

      // dashboard summary
      if (!dashRes.ok || !isRecord(dashJson) || dashJson["ok"] !== true) {
        throw new Error(getErr(dashJson, "No se pudo cargar /api/dashboard/summary"));
      } else {
        const typed = dashJson as DashboardSummaryResponse;
        if ("ok" in typed && typed.ok) {
          setRentPeriod(typed.period);
          setRentTotal(typed.alquilerMensual.total || 0);
          setRentPaid(typed.alquilerMensual.cobrado || 0);
          setRentPending(typed.alquilerMensual.pendiente || 0);
          setRentCount(typed.alquilerMensual.cantidad || 0);
        }
      }

      // people
      if (peopleRes.ok && isRecord(peopleJson) && peopleJson["ok"] === true) {
        const typed = peopleJson as PeopleResponse;
        if ("ok" in typed && typed.ok) setPeople(Array.isArray(typed.people) ? typed.people : []);
      } else {
        setPeople([]);
      }

      // properties
      if (propertiesRes.ok && isRecord(propertiesJson) && propertiesJson["ok"] === true) {
        const typed = propertiesJson as PropertiesResponse;
        if ("ok" in typed && typed.ok) setProperties(Array.isArray(typed.properties) ? typed.properties : []);
      } else {
        setProperties([]);
      }

      // payments
      if (paymentsRes.ok && isRecord(paymentsJson) && paymentsJson["ok"] === true) {
        const typed = paymentsJson as PaymentsResponse;
        if ("ok" in typed && typed.ok) setPayments(Array.isArray(typed.payments) ? typed.payments : []);
      } else {
        setPayments([]);
      }

      // documents
      if (docsRes.ok && isRecord(docsJson) && docsJson["ok"] === true) {
        const typed = docsJson as DocumentsResponse;
        if ("ok" in typed && typed.ok) setDocuments(Array.isArray(typed.documents) ? typed.documents : []);
      } else {
        setDocuments([]);
      }

      // installments (para “pendientes” compactos)
      if (instRes.ok && isRecord(instJson) && instJson["ok"] === true) {
        const typed = instJson as InstallmentsResponse;
        if ("ok" in typed && typed.ok) setInstallments(Array.isArray(typed.installments) ? typed.installments : []);
      } else {
        setInstallments([]);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAll();
  }, []);

  const kpi = useMemo(() => {
    const owners = people.filter((p) => p.type === "OWNER").length;
    const tenants = people.filter((p) => p.type === "TENANT").length;
    const guarantors = people.filter((p) => p.type === "GUARANTOR").length;

    const available = properties.filter((p) => p.status === "AVAILABLE").length;
    const rented = properties.filter((p) => p.status === "RENTED").length;
    const maintenance = properties.filter((p) => p.status === "MAINTENANCE").length;

    const okPayments = payments.filter((p) => p.status === "OK").length;
    const voidPayments = payments.filter((p) => p.status === "VOID").length;

    const pendingInstallments = installments.filter((i) => i.status === "PENDING").length;
    const paidInstallments = installments.filter((i) => i.status === "PAID").length;

    return {
      owners,
      tenants,
      guarantors,
      available,
      rented,
      maintenance,
      okPayments,
      voidPayments,
      docs: documents.length,
      pendingInstallments,
      paidInstallments,
    };
  }, [people, properties, payments, documents, installments]);

  const recentPeople = useMemo(() => pickLatest(people, 5), [people]);
  const recentPayments = useMemo(() => pickLatest(payments, 5), [payments]);
  const recentDocs = useMemo(() => pickLatest(documents, 5), [documents]);

  const pendingInstallments = useMemo(() => {
    const onlyPending = installments.filter((i) => i.status === "PENDING");
    return pickLatest(onlyPending, 6);
  }, [installments]);

  const Card = ({ title, value, hint }: { title: string; value: string; hint?: string }) => (
    <div className="rounded-2xl border p-4" style={{ borderColor: "var(--benetton-border)", background: "var(--benetton-card)" }}>
      <div className="text-xs uppercase tracking-wide text-white/60">{title}</div>
      <div className="text-2xl font-semibold mt-2">{value}</div>
      {hint ? <div className="text-xs mt-2" style={{ color: "var(--benetton-muted)" }}>{hint}</div> : null}
    </div>
  );

  const MiniListCard = ({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) => (
    <div className="rounded-2xl border p-5" style={{ borderColor: "var(--benetton-border)", background: "var(--benetton-card)" }}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-base font-semibold">{title}</div>
          {subtitle ? <div className="text-xs mt-1 text-white/60">{subtitle}</div> : null}
        </div>
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );

  const QuickLink = ({ href, label, desc }: { href: string; label: string; desc?: string }) => (
    <Link
      href={href}
      className="block rounded-xl border border-white/10 bg-white/5 px-4 py-3 hover:bg-white/10 transition"
    >
      <div className="text-sm font-semibold">{label}</div>
      {desc ? <div className="text-xs text-white/60 mt-1">{desc}</div> : null}
    </Link>
  );

  return (
    <main className="min-h-screen px-5 py-10 text-white" style={{ background: "var(--background)" }}>
      <div className="mx-auto max-w-6xl">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Panel de control</h1>
            <p className="text-sm mt-1" style={{ color: "var(--benetton-muted)" }}>
              Resumen operativo: personas, propiedades, pagos, documentos y alquiler mensual.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void loadAll()}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs hover:bg-white/10 transition disabled:opacity-60"
              disabled={loading}
              title="Actualizar panel"
            >
              {loading ? "Actualizando..." : "Actualizar"}
            </button>
            <BackButton />
          </div>
        </div>

        {err ? (
          <div className="mt-6 rounded-2xl border p-5 border-red-500/30 bg-red-500/10">
            <div className="text-sm font-semibold text-red-200">No se pudo cargar el dashboard</div>
            <div className="text-xs mt-2 text-red-100/80">{err}</div>
            <div className="mt-4">
              <button
                type="button"
                onClick={() => void loadAll()}
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs hover:bg-white/10 transition"
              >
                Reintentar
              </button>
            </div>
          </div>
        ) : null}

        {/* KPIs */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card
            title={`Alquiler mensual (${rentPeriod || "—"})`}
            value={loading ? "—" : formatCurrency(rentTotal)}
            hint={loading ? "Cargando…" : `Cobrado ${formatCurrency(rentPaid)} · Pendiente ${formatCurrency(rentPending)} · ${rentCount} cuota(s)`}
          />
          <Card title="Personas" value={loading ? "—" : String(people.length)} hint={`Propietarios ${kpi.owners} · Inquilinos ${kpi.tenants} · Garantes ${kpi.guarantors}`} />
          <Card title="Propiedades" value={loading ? "—" : String(properties.length)} hint={`Disponibles ${kpi.available} · Alquiladas ${kpi.rented} · Mant. ${kpi.maintenance}`} />
          <Card title="Pagos" value={loading ? "—" : String(payments.length)} hint={`OK ${kpi.okPayments} · Anulados ${kpi.voidPayments} · Cuotas pend. ${kpi.pendingInstallments}`} />
        </div>

        {/* Acciones rápidas */}
        <div className="mt-6 rounded-2xl border p-6" style={{ borderColor: "var(--benetton-border)", background: "var(--benetton-card)" }}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">Acciones rápidas</h2>
              <p className="text-xs text-white/60 mt-1">Entradas directas a módulos principales.</p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <QuickLink href="/people" label="Personas" desc="Propietarios · Inquilinos · Garantes" />
            <QuickLink href="/properties" label="Propiedades" desc="Disponibles · Alquiladas · Mantenimiento" />
            <QuickLink href="/contracts" label="Contratos" desc="Altas · Edición · Estado" />
            <QuickLink href="/installments" label="Cuotas" desc="Pendientes · Pagadas · Vencimientos" />
            <QuickLink href="/payments" label="Pagos" desc="Registrados · Anulados · Métodos" />
            <QuickLink href="/cash" label="Caja" desc="Movimientos · Resumen · Control" />
            <QuickLink href="/documents" label="Documentos" desc="Carga y gestión documental" />
          </div>
        </div>

        {/* Listados compactos */}
        <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
          <MiniListCard title="Pendientes" subtitle="Cuotas PENDING (tope 6)">
            {loading ? (
              <div className="text-sm text-white/60">Cargando…</div>
            ) : pendingInstallments.length === 0 ? (
              <div className="text-sm text-white/60">No hay cuotas pendientes.</div>
            ) : (
              <ul className="space-y-2">
                {pendingInstallments.map((i) => (
                  <li key={i._id} className="rounded-xl border border-white/10 bg-black/25 px-3 py-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-semibold">{safeStr(i.period) || "—"}</div>
                      <div className="text-sm">{formatCurrency(typeof i.amount === "number" ? i.amount : 0)}</div>
                    </div>
                    <div className="text-xs text-white/60 mt-1">
                      Vence: {formatDateShort(i.dueDate)} · Estado: {safeStr(i.status) || "—"}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </MiniListCard>

          <MiniListCard title="Últimas personas" subtitle="Altas recientes (tope 5)">
            {loading ? (
              <div className="text-sm text-white/60">Cargando…</div>
            ) : recentPeople.length === 0 ? (
              <div className="text-sm text-white/60">No hay personas cargadas.</div>
            ) : (
              <ul className="space-y-2">
                {recentPeople.map((p) => (
                  <li key={p._id} className="rounded-xl border border-white/10 bg-black/25 px-3 py-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-semibold truncate" title={safeStr(p.fullName)}>
                        {safeStr(p.fullName) || "—"}
                      </div>
                      <div className="text-xs text-white/60">{safeStr(p.type) || "—"}</div>
                    </div>
                    <div className="text-xs text-white/60 mt-1">
                      {safeStr(p.code) ? `${safeStr(p.code)} · ` : ""}
                      {p.createdAt ? `Alta: ${formatDateShort(p.createdAt)}` : "—"}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </MiniListCard>

          <MiniListCard title="Últimos pagos" subtitle="Movimientos recientes (tope 5)">
            {loading ? (
              <div className="text-sm text-white/60">Cargando…</div>
            ) : recentPayments.length === 0 ? (
              <div className="text-sm text-white/60">No hay pagos registrados.</div>
            ) : (
              <ul className="space-y-2">
                {recentPayments.map((p) => (
                  <li key={p._id} className="rounded-xl border border-white/10 bg-black/25 px-3 py-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-semibold">
                        {formatCurrency(typeof p.amount === "number" ? p.amount : 0)}
                      </div>
                      <div className={`text-xs ${p.status === "VOID" ? "text-red-300" : "text-emerald-300"}`}>
                        {safeStr(p.status) || "—"}
                      </div>
                    </div>
                    <div className="text-xs text-white/60 mt-1">
                      {p.date ? `Fecha: ${formatDateShort(p.date)}` : p.createdAt ? `Alta: ${formatDateShort(p.createdAt)}` : "—"}
                      {p.method ? ` · ${safeStr(p.method)}` : ""}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </MiniListCard>
        </div>

        {/* Documentos recientes */}
        <div className="mt-6">
          <div className="rounded-2xl border p-6" style={{ borderColor: "var(--benetton-border)", background: "var(--benetton-card)" }}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">Documentos recientes</h2>
                <p className="text-xs text-white/60 mt-1">Últimas cargas (tope 5).</p>
              </div>
              <Link
                href="/documents"
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs hover:bg-white/10 transition"
              >
                Ver documentos
              </Link>
            </div>

            <div className="mt-4">
              {loading ? (
                <div className="text-sm text-white/60">Cargando…</div>
              ) : recentDocs.length === 0 ? (
                <div className="text-sm text-white/60">No hay documentos cargados.</div>
              ) : (
                <div className="overflow-hidden rounded-xl border border-white/10">
                  <div className="grid grid-cols-12 gap-0 px-4 py-3 text-xs uppercase tracking-wide text-neutral-300 bg-white/5">
                    <div className="col-span-5">Título</div>
                    <div className="col-span-3">Tipo</div>
                    <div className="col-span-2">Entidad</div>
                    <div className="col-span-2">Fecha</div>
                  </div>

                  {recentDocs.map((d) => (
                    <div key={d._id} className="grid grid-cols-12 px-4 py-3 text-sm border-t border-white/10">
                      <div className="col-span-5 text-white/80 truncate" title={safeStr(d.title)}>
                        {safeStr(d.title) || "—"}
                      </div>
                      <div className="col-span-3 text-white/70">{safeStr(d.type) || "—"}</div>
                      <div className="col-span-2 text-white/70">{safeStr(d.entity) || "—"}</div>
                      <div className="col-span-2 text-white/70">{formatDateShort(d.createdAt)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="mt-8 text-xs" style={{ color: "var(--benetton-muted)" }}>
          
        </div>
      </div>
    </main>
  );
}



