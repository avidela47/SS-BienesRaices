"use client";

import { useEffect, useMemo, useState } from "react";
import type { PropertyDTO } from "@/lib/types";
import Image from "next/image";

type PersonLite = { _id: string; fullName: string; type: string };
type AppPropertyStatus = "AVAILABLE" | "RENTED" | "MAINTENANCE";

function normalizeStatus(v: unknown): AppPropertyStatus {
  const s = typeof v === "string" ? v : "";
  if (s === "AVAILABLE" || s === "RENTED" || s === "MAINTENANCE") return s;
  if (s === "OCCUPIED") return "RENTED";
  if (s === "INACTIVE") return "MAINTENANCE";
  return "AVAILABLE";
}

export default function EditPropertyModal({
  property,
  onClose,
  onSave,
}: {
  property: PropertyDTO;
  onClose: () => void;
  onSave: (updated: PropertyDTO) => void;
}) {
  const [propietarios, setPropietarios] = useState<{ _id: string; fullName: string }[]>([]);

  const initialStatus = useMemo(
    () => normalizeStatus((property as unknown as { status?: unknown })?.status),
    [property]
  );

  const [form, setForm] = useState(() => ({
    propietario: typeof property.ownerId === "object" ? property.ownerId._id : (property.ownerId ?? ""),
    ubicacion: property.addressLine ?? "",
    tipo: property.tipo ?? "",
    foto: property.foto ?? "",
    mapa: property.mapa ?? "",
    status: initialStatus as AppPropertyStatus,
  }));

  useEffect(() => {
    fetch("/api/people?type=OWNER")
      .then((res) => res.json())
      .then((data) => {
        const people: PersonLite[] = Array.isArray(data?.people) ? data.people : [];
        setPropietarios(people.map((p) => ({ _id: p._id, fullName: p.fullName })));
      })
      .catch(() => setPropietarios([]));
  }, []);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function readError(res: Response): Promise<string> {
    try {
      const ct = res.headers.get("content-type") || "";
      if (ct.includes("application/json")) {
        const data = (await res.json()) as { message?: string; error?: string };
        return data.message || data.error || `HTTP ${res.status} ${res.statusText}`;
      }
      const txt = (await res.text()).trim();
      return txt ? txt : `HTTP ${res.status} ${res.statusText}`;
    } catch {
      return `HTTP ${res.status} ${res.statusText}`;
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev: ProgressEvent<FileReader>) => {
      const result = ev.target?.result;
      setForm((f) => ({ ...f, foto: typeof result === "string" ? result : "" }));
    };
    reader.readAsDataURL(file);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const payload: Record<string, unknown> = {
        ownerId: form.propietario,
        addressLine: form.ubicacion,
        tipo: form.tipo,
        foto: form.foto,
        mapa: form.mapa,
        status: form.status, // ✅ ACÁ controlás mantenimiento
      };

      const res = await fetch(`/api/properties/${property._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const updated = await res.json();
        onSave((updated?.property as PropertyDTO) ?? property);
        onClose();
      } else {
        const msg = await readError(res);
        setError(msg || "No se pudo actualizar la propiedad");
      }
    } catch {
      setError("Error inesperado");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-md mx-auto rounded-2xl border border-white/15 bg-neutral-900 shadow-xl p-8 relative text-white max-h-[90vh] overflow-y-auto">
        <button
          className="absolute top-4 right-4 text-neutral-400 hover:text-white text-xl cursor-pointer"
          type="button"
          aria-label="Cerrar"
          onClick={onClose}
        >
          &times;
        </button>

        <h1 className="text-2xl font-bold text-center mb-6">Editar Propiedad</h1>

        <form className="grid grid-cols-1 md:grid-cols-2 gap-6" onSubmit={handleSubmit}>
          <div className="md:col-span-2">
            <label className="block mb-1 font-medium">Propietario</label>
            <select
              name="propietario"
              value={form.propietario}
              onChange={handleChange}
              required
              className="w-full rounded-xl border border-white/10 px-3 py-2 bg-black/20 text-white outline-none focus:outline-none focus:ring-0 cursor-pointer"
            >
              <option value="">Seleccionar...</option>
              {propietarios.map((p) => (
                <option key={p._id} value={p._id}>
                  {p.fullName}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block mb-1 font-medium">Tipo</label>
            <select
              name="tipo"
              value={form.tipo}
              onChange={handleChange}
              required
              className="w-full rounded-xl border border-white/10 px-3 py-2 bg-black/20 text-white outline-none focus:outline-none focus:ring-0 cursor-pointer"
            >
              <option value="">Seleccionar...</option>
              {["Departamento", "Casa", "Local", "Duplex"].map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block mb-1 font-medium">Estado</label>
            <select
              name="status"
              value={form.status}
              onChange={handleChange}
              className="w-full rounded-xl border border-white/10 px-3 py-2 bg-black/20 text-white outline-none focus:outline-none focus:ring-0 cursor-pointer"
            >
              <option value="AVAILABLE">Disponible</option>
              <option value="RENTED">Alquilada</option>
              <option value="MAINTENANCE">Mantenimiento</option>
            </select>

            <div className="text-xs text-white/60 mt-2">
              {form.status === "MAINTENANCE"
                ? "En mantenimiento: no debería alquilarse."
                : form.status === "RENTED"
                ? "Alquilada: por ahora manual (luego lo define el contrato)."
                : "Disponible para alquilar."}
            </div>
          </div>

          <div className="md:col-span-2">
            <label className="block mb-1 font-medium">Ubicación</label>
            <input
              name="ubicacion"
              value={form.ubicacion}
              onChange={handleChange}
              required
              className="w-full rounded-xl border border-white/10 px-3 py-2 bg-black/20 text-white outline-none focus:outline-none focus:ring-0"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block mb-1 font-medium">Mapa (URL)</label>
            <input
              name="mapa"
              value={form.mapa}
              onChange={handleChange}
              className="w-full rounded-xl border border-white/10 px-3 py-2 bg-black/20 text-white outline-none focus:outline-none focus:ring-0"
              placeholder="https://maps.google.com/..."
            />
          </div>

          <div className="md:col-span-2">
            <label className="block mb-1 font-medium">Foto</label>
            <input type="file" accept="image/*" onChange={handleFile} className="w-full cursor-pointer" />
            {form.foto ? (
              <Image
                src={form.foto}
                alt="Foto propiedad"
                width={320}
                height={200}
                className="mt-2 rounded-lg object-cover border border-white/10 w-full max-h-48"
              />
            ) : null}
          </div>

          <div className="md:col-span-2">
            <button
              type="submit"
              className="w-full rounded-xl px-4 py-2 text-sm text-white font-semibold shadow disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
              style={{ background: "var(--benetton-green)", color: "#05110A" }}
              disabled={loading}
            >
              {loading ? "Guardando..." : "Guardar cambios"}
            </button>

            {error ? <div className="text-red-400 mt-2 text-sm">{error}</div> : null}
          </div>
        </form>
      </div>
    </div>
  );
}


