import { useState, useEffect } from "react";
import type { PropertyDTO } from "@/lib/types";
import Image from "next/image";

export default function EditPropertyModal({ property, onClose, onSave }: { property: PropertyDTO; onClose: () => void; onSave: (updated: PropertyDTO) => void }) {
  const [propietarios, setPropietarios] = useState<{ _id: string; fullName: string }[]>([]);
  const [form, setForm] = useState(() => ({
    propietario: typeof property.ownerId === "object" ? property.ownerId._id : property.ownerId ?? "",
    ubicacion: property.addressLine ?? "",
    tipo: property.tipo ?? "",
    foto: property.foto ?? "",
    mapa: property.mapa ?? "",
    inquilino: typeof property.inquilinoId === "object" ? property.inquilinoId._id : property.inquilinoId ?? ""
  }));

  const [inquilinos, setInquilinos] = useState<{ _id: string; fullName: string }[]>([]);

  // Cargar inquilinos al montar el modal
  useEffect(() => {
    fetch("/api/people")
      .then(res => res.json())
      .then(data => {
        let people: { _id: string; fullName: string; type: string }[] = [];
        if (Array.isArray(data.people)) {
          people = data.people;
        } else if (Array.isArray(data)) {
          people = data;
        }
        setPropietarios(people.filter(p => p.type === "OWNER"));
        setInquilinos(people.filter(p => p.type === "TENANT"));
      });
  }, []);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev: ProgressEvent<FileReader>) => {
        const result = ev.target?.result;
        setForm(f => ({ ...f, foto: typeof result === "string" ? result : "" }));
      };
      reader.readAsDataURL(file);
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const payload = {
        ownerId: form.propietario,
        addressLine: form.ubicacion,
        tipo: form.tipo,
        foto: form.foto,
        mapa: form.mapa,
        inquilinoId: form.inquilino || undefined
      };
      const res = await fetch(`/api/properties/${property._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        const updated = await res.json();
        onSave(updated.property ?? property);
        onClose();
      } else {
        setError("No se pudo actualizar la propiedad");
      }
    } catch {
      setError("Error inesperado");
    }
    setLoading(false);
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-md mx-auto rounded-2xl border border-white/15 bg-neutral-900 shadow-xl p-8 relative">
        <button
          className="absolute top-4 right-4 text-neutral-400 hover:text-white text-xl"
          type="button"
          aria-label="Cerrar"
          onClick={onClose}
        >
          &times;
        </button>
        <h1 className="text-2xl font-bold text-center mb-6">Editar Propiedad</h1>
        <form className="grid grid-cols-1 md:grid-cols-2 gap-6" onSubmit={handleSubmit}>
          <div>
            <label className="block mb-1 font-medium">Propietario</label>
            <select name="propietario" value={form.propietario} onChange={handleChange} required className="w-full rounded border px-3 py-2 bg-neutral-800 text-white">
              <option value="">Seleccionar...</option>
              {propietarios.map(p => (
                <option key={p._id} value={p._id}>{p.fullName}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block mb-1 font-medium">Tipo</label>
            <select name="tipo" value={form.tipo} onChange={handleChange} required className="w-full rounded border px-3 py-2 bg-neutral-800 text-white">
              <option value="">Seleccionar...</option>
              {['Departamento', 'Casa', 'Local', 'Duplex'].map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block mb-1 font-medium">Ubicación</label>
            <input name="ubicacion" value={form.ubicacion} onChange={handleChange} required className="w-full rounded border px-3 py-2 bg-neutral-800 text-white" />
          </div>
          <div>
            <label className="block mb-1 font-medium">Mapa (URL)</label>
            <input name="mapa" value={form.mapa} onChange={handleChange} className="w-full rounded border px-3 py-2 bg-neutral-800 text-white" placeholder="https://maps.google.com/..." />
          </div>
          <div>
            <label className="block mb-1 font-medium">Foto</label>
            <input type="file" accept="image/*" onChange={handleFile} className="w-full" />
            {form.foto && <Image src={form.foto} alt="Foto propiedad" width={200} height={120} className="mt-2 rounded" />}
          </div>
          <div>
            <label className="block mb-1 font-medium">Inquilino</label>
            <select name="inquilino" value={form.inquilino} onChange={handleChange} className="w-full rounded border px-3 py-2 bg-neutral-800 text-white">
              <option value="">Sin inquilino</option>
              {inquilinos.map(p => (
                <option key={p._id} value={p._id}>{p.fullName}</option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <button
              type="submit"
              className="btn-benetton-green w-full rounded-xl px-4 py-2 text-sm font-semibold shadow mt-4"
              style={{ fontWeight: 400 }}
              disabled={loading}
            >
              Guardar cambios
            </button>
            {error && <div className="text-red-400 mt-2 text-sm">{error}</div>}
          </div>
        </form>
      </div>
    </div>
  );
}