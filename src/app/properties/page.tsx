"use client";


import Link from "next/link";
import { apiGet } from "@/lib/api";
import type { PropertyDTO } from "@/lib/types";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
const PropertyModal = dynamic(() => import("./PropertyModal"), { ssr: false });
import EditPropertyModal from "./EditPropertyModal";

export default function Propiedades() {
  const [loading, setLoading] = useState(true);
  const [properties, setProperties] = useState<PropertyDTO[]>([]);
  const [selected, setSelected] = useState<PropertyDTO|null>(null);
  const [editTarget, setEditTarget] = useState<PropertyDTO|null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PropertyDTO|null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const fetchProperties = async () => {
    setLoading(true);
    const res = await apiGet<{ ok: boolean; properties: PropertyDTO[] }>("/api/properties");
    if (res.ok && Array.isArray(res.properties)) {
      setProperties(res.properties);
    }
    setLoading(false);
  };

  useEffect(() => {
    (async () => {
      await fetchProperties();
    })();
  }, []);

  return (
    <div className="max-w-4xl mx-auto py-8">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Link href="/" title="Ir a inicio"
            className="flex items-center justify-center w-9 h-9 rounded-full border border-white/20 bg-white/10 hover:bg-white/20 transition text-xl text-neutral-100 shadow-sm">
            <span>&#8592;</span>
          </Link>
          <h1 className="text-3xl font-bold">Propiedades</h1>
        </div>
        <Link
          href="/properties/new"
          style={{
            border: '1px solid rgba(16, 185, 129, 0.3)',
            background: 'rgba(16, 185, 129, 0.15)',
            color: '#6ee7b7',
            borderRadius: '0.75rem',
            padding: '0.375rem 0.75rem',
            fontSize: '0.75rem',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            boxShadow: 'none',
            textDecoration: 'none',
            cursor: 'pointer'
          }}
        >
          +Alta Propiedad
        </Link>
      </div>
      {/* Listado de propiedades */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-6 text-neutral-300">
        {loading ? (
          <p>Cargando propiedades...</p>
        ) : properties.length === 0 ? (
          <p>No hay propiedades registradas aún.</p>
        ) : (
          <>
            <ul className="divide-y divide-white/10">
              {properties.map((p) => (
                <li key={p._id} className="py-3 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                  <div>
                    <span className="font-bold text-white">{p.code || "(sin código)"}</span>
                    <span className="ml-2">{p.addressLine}</span>
                    {p.unit && <span className="ml-2">(Unidad: {p.unit})</span>}
                    {p.city && <span className="ml-2">{p.city}</span>}
                    {p.province && <span className="ml-2">{p.province}</span>}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-neutral-400">
                    <span>Propietario: {typeof p.ownerId === "object" ? p.ownerId.fullName : p.ownerId}</span>
                    <button
                      className="ml-2 px-2 py-1 rounded-full bg-white/10 hover:bg-white/20 text-white border border-white/20 text-xs transition shadow cursor-pointer"
                      onClick={() => setSelected(p)}
                    >Ver</button>
                    <button
                      className="border border-blue-400 text-white bg-transparent px-2 py-1 rounded-full text-xs hover:bg-blue-400/10 transition cursor-pointer"
                      onClick={() => setEditTarget(p)}
                    >Editar</button>
                    <button
                      className="border border-red-400 text-white bg-transparent px-2 py-1 rounded-full text-xs hover:bg-red-400/10 transition cursor-pointer"
                      onClick={() => setDeleteTarget(p)}
                    >Eliminar</button>
                  </div>
                </li>
              ))}
            </ul>
            {selected && <PropertyModal property={selected} onClose={() => setSelected(null)} />}
            {editTarget && (
              <EditPropertyModal
                key={editTarget._id}
                property={editTarget}
                onClose={() => setEditTarget(null)}
                onSave={async () => {
                  await fetchProperties();
                  setEditTarget(null);
                }}
              />
            )}
            {deleteTarget && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
                <div className="w-full max-w-sm mx-auto rounded-2xl border border-white/15 bg-neutral-900 shadow-xl p-8 relative">
                  <h2 className="text-xl font-bold mb-4 text-white">¿Seguro que deseas eliminar esta propiedad?</h2>
                  <div className="flex gap-4 justify-end mt-6">
                    <button
                      className="px-4 py-2 rounded bg-neutral-700 text-white hover:bg-neutral-800"
                      onClick={() => setDeleteTarget(null)}
                    >Cancelar</button>
                    <button
                      className="px-4 py-2 rounded bg-red-600 text-white hover:bg-red-700"
                      onClick={async () => {
                        setLoading(true);
                        const res = await fetch(`/api/properties/${deleteTarget._id}`, { method: 'DELETE' });
                        if (res.ok) {
                          await fetchProperties();
                          setToast({ message: 'Propiedad eliminada correctamente.', type: 'success' });
                        } else {
                          setToast({ message: 'No se pudo eliminar la propiedad.', type: 'error' });
                        }
                        setLoading(false);
                        setDeleteTarget(null);
                      }}
                    >Eliminar</button>
                  </div>
                </div>
              </div>
            )}
            {toast && (
              <div className={`fixed bottom-8 left-1/2 -translate-x-1/2 px-6 py-3 rounded-xl shadow-lg text-white font-semibold ${toast.type === "success" ? "bg-emerald-600" : "bg-red-600"}`}>
                {toast.message}
                <button className="ml-4 text-white/80" onClick={() => setToast(null)}>✕</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
