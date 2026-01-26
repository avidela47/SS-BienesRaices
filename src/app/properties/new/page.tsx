"use client";

import { useState, useEffect } from "react";
import { useToast } from "@/app/components/ToastProvider";
import { apiPost } from "@/lib/api";
// import Link from "next/link";
import Image from "next/image";

// Simulación de fetch de personas (propietario e inquilino)
import type { PersonDTO } from "@/lib/types";
async function fetchPeople(): Promise<PersonDTO[]> {
  const res = await fetch("/api/people");
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : (data.people ?? []);
}

const tipos = ["Departamento", "Casa", "Local", "Duplex"];

export default function NuevaPropiedad() {
  const toast = useToast();
  const [propietarios, setPropietarios] = useState<PersonDTO[]>([]);
  const [inquilinos, setInquilinos] = useState<PersonDTO[]>([]);
  const [form, setForm] = useState<{
    propietario: string;
    ubicacion: string;
    tipo: string;
    foto: string;
    mapa: string;
    inquilino: string;
  }>({
    propietario: "",
    ubicacion: "",
    tipo: "",
    foto: "",
    mapa: "",
    inquilino: ""
  });

  useEffect(() => {
    fetchPeople().then(data => {
      setPropietarios(data.filter(p => p.type === 'OWNER'));
      setInquilinos(data.filter(p => p.type === 'TENANT'));
    });
  }, []);

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
    try {
      const res = await apiPost<{ ok: boolean; propertyId?: string; code?: string; message?: string }>("/api/properties", {
        addressLine: form.ubicacion,
        ownerId: form.propietario,
        tipo: form.tipo,
        foto: form.foto,
        mapa: form.mapa,
        inquilinoId: form.inquilino || undefined,
      });
      if (res.ok) {
        toast.show("Propiedad creada con éxito");
        setTimeout(() => {
          window.location.href = "/properties";
        }, 1200);
      } else {
        toast.show(res.message || "Error al crear la propiedad");
      }
    } catch (err: unknown) {
      let msg = "Error inesperado";
      if (err && typeof err === "object" && "message" in err && typeof (err as { message?: unknown }).message === "string") {
        msg = (err as { message: string }).message;
      }
      toast.show(msg);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-md mx-auto rounded-2xl border border-white/15 bg-neutral-900 shadow-xl p-8 relative">
        <button
          className="absolute top-4 right-4 text-neutral-400 hover:text-white text-xl"
          type="button"
          aria-label="Cerrar"
          onClick={() => window.history.back()}
        >
          &times;
        </button>
        <h1 className="text-2xl font-bold text-center mb-6">Alta de Propiedad</h1>
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
              {tipos.map(t => (
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
            >
              Crear Propiedad
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
