"use client";
import type { PropertyDTO } from "@/lib/types";
import Image from "next/image";

function statusLabel(s: PropertyDTO["status"]) {
  if (s === "AVAILABLE") return "Disponible";
  if (s === "RENTED") return "Alquilada";
  if (s === "MAINTENANCE") return "Mantenimiento";
  return s;
}

export default function PropertyModal({ property, onClose }: { property: PropertyDTO; onClose: () => void }) {
  if (!property) return null;

  const owner = typeof property.ownerId === "object" ? property.ownerId.fullName : property.ownerId;
  const tenant = property.inquilinoId
    ? typeof property.inquilinoId === "object"
      ? property.inquilinoId.fullName
      : property.inquilinoId
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="relative w-full max-w-2xl mx-auto rounded-2xl border border-white/15 bg-neutral-900 shadow-xl p-8">
        <button
          className="absolute top-4 right-4 text-neutral-400 hover:text-white text-xl"
          type="button"
          aria-label="Cerrar"
          onClick={onClose}
        >
          {"\u00d7"}
        </button>

        <h2 className="text-2xl font-bold mb-4 text-white flex items-center gap-2">
          {property.code} <span className="text-base font-normal text-neutral-400">{property.tipo || ""}</span>
        </h2>

        <div className="mb-4">
          <div className="text-white font-semibold mb-1">Dirección:</div>
          <div className="text-white/80">
            {property.addressLine}
            {property.unit ? <span> (Unidad: {property.unit})</span> : null}
            {property.city ? <span> — {property.city}</span> : null}
            {property.province ? <span> — {property.province}</span> : null}
          </div>
        </div>

        <div className="mb-4">
          <div className="text-white font-semibold mb-1">Propietario:</div>
          <div className="text-white/80">{owner || "—"}</div>
        </div>

        {tenant ? (
          <div className="mb-4">
            <div className="text-white font-semibold mb-1">Inquilino:</div>
            <div className="text-white/80">{tenant}</div>
          </div>
        ) : null}

        {(property.foto || property.mapa) ? (
          <div className="mb-4 flex flex-col md:flex-row gap-6 items-center justify-center">
            {property.foto ? (
              <div className="flex-1 flex flex-col items-center">
                <div className="text-white font-semibold mb-2">Foto:</div>
                <div className="bg-neutral-800 rounded-lg border border-white/10 p-2 flex items-center justify-center" style={{ width: 340, height: 220 }}>
                  <Image src={property.foto} alt="Foto propiedad" width={320} height={200} className="rounded object-cover" style={{ width: 320, height: 200 }} />
                </div>
              </div>
            ) : null}

            {property.mapa ? (
              <div className="flex-1 flex flex-col items-center">
                <div className="text-white font-semibold mb-2">Mapa:</div>
                <div className="bg-neutral-800 rounded-lg border border-white/10 p-2 flex items-center justify-center" style={{ width: 340, height: 220 }}>
                  <iframe
                    src={property.mapa}
                    title="Mapa propiedad"
                    width="320"
                    height="200"
                    className="rounded object-cover"
                    style={{ border: 0, width: 320, height: 200 }}
                    allowFullScreen
                    loading="lazy"
                  />
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-col gap-1 text-xs text-neutral-400 mt-4">
          <div>
            <b>Estado:</b> {statusLabel(property.status)}
          </div>
          <div><b>Creado:</b> {property.createdAt ? new Date(property.createdAt).toLocaleString() : "-"}</div>
          <div><b>Actualizado:</b> {property.updatedAt ? new Date(property.updatedAt).toLocaleString() : "-"}</div>
        </div>
      </div>
    </div>
  );
}
