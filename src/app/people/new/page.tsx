"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function NewClientPage() {
  const router = useRouter();
  const [type, setType] = useState("OWNER");
  const [nombre, setNombre] = useState("");
  const [apellido, setApellido] = useState("");
  const [dni, setDni] = useState("");
  const [wasp, setWasp] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/people", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          fullName: nombre + " " + apellido,
          dni,
          wasp,
          email,
        }),
      });
      if (!res.ok) throw new Error("Error al guardar cliente");
      router.push("/people");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center py-8">
      <div className="w-full max-w-md bg-neutral-900 border border-neutral-700 rounded-2xl p-8 shadow relative">
        {/* Botón de cerrar (cruz) */}
        <button
          type="button"
          onClick={() => router.push('/people')}
          className="absolute top-4 right-4 text-neutral-400 hover:text-white text-2xl focus:outline-none"
          title="Cerrar"
        >
          ×
        </button>
        <h2 className="text-2xl font-bold mb-6 text-center">Alta de Cliente</h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-sm mb-1">Tipo</label>
            <select
              value={type}
              onChange={e => setType(e.target.value)}
              className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-white/20"
              required
            >
              <option value="OWNER">Propietario</option>
              <option value="TENANT">Inquilino</option>
            </select>
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-sm mb-1">Nombre</label>
              <input
                type="text"
                value={nombre}
                onChange={e => setNombre(e.target.value)}
                className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-white/20"
                required
              />
            </div>
            <div className="flex-1">
              <label className="block text-sm mb-1">Apellido</label>
              <input
                type="text"
                value={apellido}
                onChange={e => setApellido(e.target.value)}
                className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-white/20"
                required
              />
            </div>
          </div>
          <div>
            <label className="block text-sm mb-1">DNI</label>
            <input
              type="text"
              value={dni}
              onChange={e => setDni(e.target.value)}
              className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-white/20"
              required
            />
          </div>
          <div>
            <label className="block text-sm mb-1">WhatsApp</label>
            <input
              type="text"
              value={wasp}
              onChange={e => setWasp(e.target.value)}
              className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-white/20"
              required
            />
          </div>
          <div>
            <label className="block text-sm mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-white/20"
              required
            />
          </div>
          {error && <div className="text-red-400 text-sm text-center">{error}</div>}
          <button
            type="submit"
            style={{
              border: '1px solid rgba(16, 185, 129, 0.3)',
              background: 'rgba(16, 185, 129, 0.15)',
              color: '#6ee7b7',
              borderRadius: '0.75rem',
              padding: '0.375rem 0.75rem',
              fontSize: '0.75rem',
              width: '100%',
              fontWeight: 600,
              cursor: 'pointer'
            }}
            disabled={loading}
          >
            {loading ? "Guardando..." : "Guardar Cliente"}
          </button>
        </form>
      </div>
    </div>
  );
}
