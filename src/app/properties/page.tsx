"use client";

import Link from "next/link";
import { apiGet } from "@/lib/api";
import type { PropertyDTO, PropertyStatus } from "@/lib/types";
import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import EditPropertyModal from "./EditPropertyModal";

const PropertyModal = dynamic(() => import("./PropertyModal"), { ssr: false });

type ToastState = { message: string; type: "success" | "error" } | null;

function ownerName(owner: PropertyDTO["ownerId"]) {
  if (!owner) return "—";
  return typeof owner === "object" ? owner.fullName : "—";
}

function tenantName(tenant?: PropertyDTO["inquilinoId"]) {
  if (!tenant) return "—";
  return typeof tenant === "object" ? tenant.fullName : "—";
}

function statusLabel(s: PropertyStatus) {
  if (s === "AVAILABLE") return "Disponible";
  if (s === "RENTED") return "Alquilada";
  if (s === "MAINTENANCE") return "Mantenimiento";
  return s;
}

function statusPillClass(s: PropertyStatus) {
  if (s === "AVAILABLE") return "border-emerald-400/30 bg-emerald-400/10 text-emerald-200";
  if (s === "RENTED") return "border-sky-400/30 bg-sky-400/10 text-sky-200";
  return "border-amber-400/30 bg-amber-400/10 text-amber-200";
}

type StatusFilter = "ALL" | PropertyStatus;

function isPropertyStatus(v: string): v is PropertyStatus {
  return v === "AVAILABLE" || v === "RENTED" || v === "MAINTENANCE";
}

type ApiErrorShape = {
  message?: unknown;
  error?: unknown;
  details?: unknown;
};

function asString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

async function safeReadError(res: Response): Promise<string> {
  try {
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      const data = (await res.json()) as ApiErrorShape;

      return (
        asString(data.message) ||
        asString(data.error) ||
        asString(data.details) ||
        `HTTP ${res.status} ${res.statusText}`
      );
    }

    const txt = (await res.text()).trim();
    return txt ? txt : `HTTP ${res.status} ${res.statusText}`;
  } catch {
    return `HTTP ${res.status} ${res.statusText}`;
  }
}

export default function Propiedades() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [properties, setProperties] = useState<PropertyDTO[]>([]);
  const [error, setError] = useState<string>("");

  const [selected, setSelected] = useState<PropertyDTO | null>(null);
  const [editTarget, setEditTarget] = useState<PropertyDTO | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PropertyDTO | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [toast, setToast] = useState<ToastState>(null);

  const [q, setQ] = useState("");
  const [status, setStatus] = useState<StatusFilter>("ALL");

  const fetchProperties = async (mode: "initial" | "refresh" = "refresh") => {
    if (mode === "initial") setLoading(true);
    else setRefreshing(true);

    setError("");
    try {
      const res = await apiGet<{
        ok: boolean;
        properties: PropertyDTO[];
        message?: string;
        error?: string;
      }>("/api/properties");

      if (res.ok && Array.isArray(res.properties)) {
        setProperties(res.properties);
      } else {
        setProperties([]);
        setError(res.message || res.error || "No se pudieron cargar las propiedades.");
      }
    } catch (e) {
      setProperties([]);
      setError(e instanceof Error ? e.message : "Error cargando propiedades.");
    } finally {
      if (mode === "initial") setLoading(false);
      else setRefreshing(false);
    }
  };

  useEffect(() => {
    void fetchProperties("initial");
  }, []);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return properties.filter((p) => {
      if (status !== "ALL" && p.status !== status) return false;
      if (!t) return true;

      const hay = [
        p.code,
        p.addressLine,
        p.unit,
        p.city,
        p.province,
        p.status,
        ownerName(p.ownerId),
        tenantName(p.inquilinoId),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return hay.includes(t);
    });
  }, [properties, q, status]);

  const kpis = useMemo(() => {
    const total = filtered.length;
    const available = filtered.filter((p) => p.status === "AVAILABLE").length;
    const rented = filtered.filter((p) => p.status === "RENTED").length;
    const maintenance = filtered.filter((p) => p.status === "MAINTENANCE").length;
    return { total, available, rented, maintenance };
  }, [filtered]);

  return (
    <div className="max-w-6xl mx-auto py-8 px-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            title="Ir a inicio"
            className="flex items-center justify-center w-10 h-10 rounded-full border border-white/15 bg-white/5 hover:bg-white/10 transition text-xl text-neutral-100"
          >
            <span>←</span>
          </Link>

          <div>
            <h1 className="text-3xl font-bold text-white">Propiedades</h1>
            <p className="text-sm text-white/60 mt-1">
              Gestión de propiedades con propietario, inquilino y estado.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => void fetchProperties("refresh")}
            className="px-3 py-2 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 text-white text-sm"
            disabled={loading || refreshing}
          >
            {refreshing ? "Actualizando..." : "Actualizar"}
          </button>

          <Link
            href="/properties/new"
            className="px-3 py-2 rounded-xl border border-emerald-400/30 bg-emerald-400/10 hover:bg-emerald-400/15 text-emerald-200 text-sm font-semibold"
          >
            + Alta Propiedad
          </Link>
        </div>
      </div>

      {/* Error */}
      {error ? (
        <div className="mb-4 rounded-xl border border-amber-400/30 bg-amber-400/10 text-amber-100 px-4 py-3 text-sm">
          {error}
        </div>
      ) : null}

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="text-xs text-white/60">Total</div>
          <div className="text-2xl font-extrabold text-white mt-1">{kpis.total}</div>
        </div>
        <div className="rounded-2xl border border-emerald-400/15 bg-emerald-400/5 p-4">
          <div className="text-xs text-white/60">Disponibles</div>
          <div className="text-2xl font-extrabold text-white mt-1">{kpis.available}</div>
        </div>
        <div className="rounded-2xl border border-sky-400/15 bg-sky-400/5 p-4">
          <div className="text-xs text-white/60">Alquiladas</div>
          <div className="text-2xl font-extrabold text-white mt-1">{kpis.rented}</div>
        </div>
        <div className="rounded-2xl border border-amber-400/15 bg-amber-400/5 p-4">
          <div className="text-xs text-white/60">Mantenimiento</div>
          <div className="text-2xl font-extrabold text-white mt-1">{kpis.maintenance}</div>
        </div>
      </div>

      {/* Filtros */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-4 mb-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="md:col-span-2">
            <div className="text-xs text-white/60 mb-1">Buscar</div>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Código, dirección, propietario, inquilino…"
              className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-white outline-none focus:ring-2 focus:ring-emerald-400/30"
            />
          </div>

          <div>
            <div className="text-xs text-white/60 mb-1">Estado</div>
            <select
              value={status}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "ALL") setStatus("ALL");
                else if (isPropertyStatus(v)) setStatus(v);
                else setStatus("ALL");
              }}
              className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-white outline-none focus:ring-2 focus:ring-emerald-400/30"
            >
              <option value="ALL">Todos</option>
              <option value="AVAILABLE">Disponible</option>
              <option value="RENTED">Alquilada</option>
              <option value="MAINTENANCE">Mantenimiento</option>
            </select>
          </div>
        </div>
      </div>

      {/* Tabla */}
      <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
        <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
          <div className="text-sm font-semibold text-white">Listado</div>
          <div className="text-xs text-white/60">{filtered.length} items</div>
        </div>

        <div className="overflow-x-auto">
          <div className="min-w-245">
            <div className="grid grid-cols-[140px_1fr_170px_220px_220px_130px] gap-0 px-4 py-2 text-xs text-white/70 bg-white/4">
              <div>Código</div>
              <div>Dirección</div>
              <div>Estado</div>
              <div>Propietario</div>
              <div>Inquilino</div>
              <div className="text-right">Acciones</div>
            </div>

            {loading ? (
              <div className="px-4 py-6 text-sm text-white/70">Cargando propiedades...</div>
            ) : filtered.length === 0 ? (
              <div className="px-4 py-6 text-sm text-white/70">No hay propiedades registradas aún.</div>
            ) : (
              filtered.map((p) => (
                <div
                  key={p._id}
                  className="grid grid-cols-[140px_1fr_170px_220px_220px_130px] px-4 py-3 border-t border-white/10 items-center"
                >
                  <div>
                    <div className="text-white font-extrabold">{p.code || "(sin código)"}</div>
                    <div className="text-xs text-white/60">{p.province || "—"}</div>
                  </div>

                  <div>
                    <div className="text-white font-semibold">{p.addressLine}</div>
                    <div className="text-xs text-white/60">
                      {[p.unit, p.city].filter(Boolean).join(" • ") || "—"}
                    </div>
                  </div>

                  <div>
                    <span
                      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold border ${statusPillClass(
                        p.status
                      )}`}
                    >
                      {statusLabel(p.status)}
                    </span>
                  </div>

                  <div className="text-sm text-white/85">{ownerName(p.ownerId)}</div>

                  <div className="text-sm text-white/85">{p.inquilinoId ? tenantName(p.inquilinoId) : "—"}</div>

                  <div className="flex items-center justify-end gap-2">
                    <button
                      className="px-3 py-1.5 rounded-full border border-white/15 bg-white/5 hover:bg-white/10 text-white text-xs"
                      onClick={() => setSelected(p)}
                    >
                      Ver
                    </button>
                    <button
                      className="px-3 py-1.5 rounded-full border border-sky-400/30 bg-sky-400/10 hover:bg-sky-400/15 text-white text-xs"
                      onClick={() => setEditTarget(p)}
                    >
                      Editar
                    </button>
                    <button
                      className="px-3 py-1.5 rounded-full border border-red-400/30 bg-red-400/10 hover:bg-red-400/15 text-white text-xs"
                      onClick={() => setDeleteTarget(p)}
                    >
                      Eliminar
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {selected && <PropertyModal property={selected} onClose={() => setSelected(null)} />}

        {editTarget && (
          <EditPropertyModal
            key={editTarget._id}
            property={editTarget}
            onClose={() => setEditTarget(null)}
            onSave={(updated) => {
              setProperties((prev) => prev.map((x) => (x._id === updated._id ? updated : x)));
              setEditTarget(null);
            }}
          />
        )}

        {/* Confirm Delete */}
        {deleteTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
            <div className="w-full max-w-sm rounded-2xl border border-white/15 bg-neutral-900 shadow-xl p-6">
              <h2 className="text-lg font-bold text-white">Eliminar propiedad</h2>
              <p className="text-sm text-white/70 mt-2">
                ¿Seguro que querés eliminar <b>{deleteTarget.code || "esta propiedad"}</b>?
              </p>

              <div className="flex justify-end gap-2 mt-6">
                <button
                  className="px-4 py-2 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 text-white"
                  onClick={() => setDeleteTarget(null)}
                  disabled={deleting}
                >
                  Cancelar
                </button>

                <button
                  className="px-4 py-2 rounded-xl border border-red-400/30 bg-red-400/10 hover:bg-red-400/15 text-white disabled:opacity-60 disabled:cursor-not-allowed"
                  disabled={deleting}
                  onClick={async () => {
                    if (!deleteTarget) return;
                    setDeleting(true);

                    const id = deleteTarget._id;
                    const prev = properties;

                    // Optimista: lo saco ya de la lista
                    setProperties((p) => p.filter((x) => x._id !== id));

                    try {
                      const res = await fetch(`/api/properties/${id}`, { method: "DELETE" });

                      if (!res.ok) {
                        const msg = await safeReadError(res);
                        // Revertimos si falla
                        setProperties(prev);
                        setToast({ message: msg || "No se pudo eliminar la propiedad.", type: "error" });
                      } else {
                        setToast({ message: "Propiedad eliminada correctamente.", type: "success" });
                      }
                    } catch (e) {
                      setProperties(prev);
                      setToast({
                        message: e instanceof Error ? e.message : "Error de red eliminando la propiedad.",
                        type: "error",
                      });
                    } finally {
                      setDeleting(false);
                      setDeleteTarget(null);
                    }
                  }}
                >
                  {deleting ? "Eliminando..." : "Eliminar"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Toast */}
        {toast && (
          <div
            className={`fixed bottom-8 left-1/2 -translate-x-1/2 px-6 py-3 rounded-xl shadow-lg text-white font-semibold ${
              toast.type === "success" ? "bg-emerald-600" : "bg-red-600"
            }`}
          >
            {toast.message}
            <button className="ml-4 text-white/80" onClick={() => setToast(null)}>
              ✕
            </button>
          </div>
        )}
      </div>
    </div>
  );
}


