"use client";

import { useEffect, useMemo, useState } from "react";
import React from "react";
import Link from "next/link";
import BackButton from "@/app/components/BackButton";

// Modal simple reutilizable
function Modal({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-neutral-900 border border-neutral-700 rounded-2xl p-8 min-w-85 max-w-full relative">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-neutral-400 hover:text-white text-xl"
        >
          ×
        </button>
        {children}
      </div>
    </div>
  );
}

type PersonType = "OWNER" | "TENANT" | "GUARANTOR" | string;

type PersonDTO = {
  _id: string;
  code?: string;
  type: PersonType;
  fullName: string;
  nombre?: string;
  apellido?: string;
  dni?: string;
  dniCuit?: string;
  wasp?: string;
  email?: string;
  phone?: string;
  address?: string;
  tags?: string[];
  notes?: string;
};

type PeopleListResponse =
  | { ok: true; people: PersonDTO[] }
  | { ok: false; error?: string; message?: string };

type TypeFilter = "ALL" | "OWNER" | "TENANT";

function errorMessageFromResponse(r: PeopleListResponse): string {
  if (r.ok) return "";
  if (typeof r.error === "string" && r.error.trim()) return r.error;
  if (typeof r.message === "string" && r.message.trim()) return r.message;
  return "Error";
}

export default function PeoplePage() {
  // Paginación
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 5;

  // Estado para modal de edición
  const [editClient, setEditClient] = useState<PersonDTO | null>(null);
  const [nombre, setNombre] = useState("");
  const [apellido, setApellido] = useState("");
  const [dni, setDni] = useState("");
  const [wasp, setWasp] = useState("");
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [, setLoading] = useState(false);
  const [err, setErr] = useState<string>("");
  const [people, setPeople] = useState<PersonDTO[]>([]);

  // filtros
  const [q, setQ] = useState("");
  const [type, setType] = useState<TypeFilter>("ALL");

  async function load() {
    setLoading(true);
    setErr("");
    try {
      const res = await fetch("/api/people", { cache: "no-store" });
      const data = (await res.json()) as PeopleListResponse;

      if (!data.ok) {
        setPeople([]);
        setErr(errorMessageFromResponse(data));
        return;
      }

      // ✅ IMPORTANTE: /people es SOLO Propietarios + Inquilinos (no Garantes)
      const list = Array.isArray(data.people) ? data.people : [];
      const onlyOwnersTenants = list.filter((p) => p.type !== "GUARANTOR");

      setPeople(onlyOwnersTenants);
      setCurrentPage(1);
    } catch (e) {
      console.error(e);
      setPeople([]);
      setErr("No se pudo cargar clientes");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    const text = q.trim().toLowerCase();
    return people.filter((p) => {
      if (type !== "ALL" && p.type !== type) return false;
      if (!text) return true;
      const hay = [p.code, p._id, p.fullName, p.email, p.phone, p.wasp, p.type]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(text);
    });
  }, [people, q, type]);

  // Calcular paginación
  const totalPages = Math.ceil(filtered.length / pageSize);
  const paginated = filtered.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  // Handlers para editar/eliminar
  function handleOpenEdit(client: PersonDTO) {
    setEditClient(client);

    setNombre(
      client.nombre !== undefined && client.nombre !== null
        ? client.nombre
        : client.fullName?.split(" ")[0] ?? ""
    );
    setApellido(
      client.apellido !== undefined && client.apellido !== null
        ? client.apellido
        : client.fullName?.split(" ")[1] ?? ""
    );

    setDni(
      client.dni && client.dni.trim() !== ""
        ? client.dni
        : client.dniCuit && client.dniCuit.trim() !== ""
          ? client.dniCuit
          : ""
    );

    setWasp(
      client.wasp && client.wasp.trim() !== ""
        ? client.wasp
        : client.phone && client.phone.trim() !== ""
          ? client.phone
          : ""
    );

    setEditError("");
    setDeleteConfirm(false);
  }

  function handleCloseEdit() {
    setEditClient(null);
    setEditError("");
    setDeleteConfirm(false);
  }

  async function handleSaveEdit() {
    if (!editClient) return;
    setEditLoading(true);
    setEditError("");
    try {
      const updated = {
        type: editClient.type,
        fullName: `${nombre} ${apellido}`.trim(),
        dni,
        dniCuit: dni,
        wasp,
        phone: wasp,
        email: editClient.email || "",
        address: editClient.address || "",
        tags: editClient.tags || [],
        notes: editClient.notes || "",
        code: editClient.code || "",
      };

      const res = await fetch(`/api/people/${editClient._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updated),
      });

      if (!res.ok) throw new Error("Error al guardar cambios");
      await load();
      handleCloseEdit();
    } catch (e: unknown) {
      setEditError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setEditLoading(false);
    }
  }

  async function handleDelete() {
    if (!editClient) return;
    setDeleteLoading(true);
    setEditError("");
    try {
      const res = await fetch(`/api/people/${editClient._id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Error al eliminar cliente");
      await load();
      handleCloseEdit();
    } catch (e: unknown) {
      setEditError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setDeleteLoading(false);
    }
  }

  return (
    <main className="min-h-screen px-5 py-8 text-white" style={{ background: "var(--background)" }}>
      <div className="mx-auto max-w-6xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold">Clientes</h1>
            <p className="text-sm opacity-70">Listado y gestión de clientes</p>
          </div>

          <div className="flex items-center gap-2">
            <BackButton />
            <Link
              href="/people/new"
              title="Nuevo cliente"
              aria-label="Nuevo cliente"
              className="flex items-center justify-center w-10 h-10 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 transition text-lg font-semibold"
              style={{ color: "var(--benetton-green)" }}
            >
              +
            </Link>
          </div>
        </div>

      {err ? (
        <div className="mt-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {err}
        </div>
      ) : null}

        {/* Filtros */}
        <div className="mt-6 rounded-2xl border border-white/10 bg-white/5">
          <div className="border-b border-white/10 px-5 py-4">
            <div className="text-sm font-semibold">Filtros</div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-6 gap-4 px-5 py-4">
            <div className="sm:col-span-4">
              <div className="mb-2 text-xs text-white/50">
                BÚSQUEDA (nombre, código, email, etc.)
              </div>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Ej: PID-001, Juan Pérez, demo@correo.com..."
                className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-white/10"
              />
            </div>

            <div className="sm:col-span-2">
              <div className="mb-2 text-xs text-white/50">TIPO</div>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as TypeFilter)}
                className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-white/10"
              >
                <option value="ALL">Todos</option>
                <option value="OWNER">Propietario</option>
                <option value="TENANT">Inquilino</option>
              </select>
            </div>
          </div>
        </div>

        {/* Tabla */}
        <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
          <div className="px-5 py-4 border-b border-white/10 text-sm font-semibold">
            Clientes ({filtered.length})
          </div>

          <div className="p-4">
            <div className="rounded-xl border border-white/10 overflow-hidden">
              <div className="grid grid-cols-7 gap-0 bg-white/5 text-xs text-neutral-300 px-4 py-3">
              <div className="col-span-2">Nombre</div>
              <div className="col-span-1">Código</div>
              <div className="col-span-1">Tipo</div>
              <div className="col-span-1">WhatsApp</div>
              <div className="col-span-1">Email</div>
              <div className="col-span-1 text-right">Acción</div>
            </div>

            {filtered.length === 0 ? (
              <div className="px-4 py-10 text-sm text-neutral-400">
                Sin resultados.
              </div>
            ) : (
              paginated.map((p) => {
                const wasap =
                  p.wasp && p.wasp.trim() !== ""
                    ? p.wasp
                    : p.phone && p.phone.trim() !== ""
                      ? p.phone
                      : "—";

                return (
                  <div
                    key={p._id}
                    className="grid grid-cols-7 gap-0 px-4 py-3 border-t border-white/10 text-sm items-center"
                  >
                    <div className="col-span-2">
                      <div className="text-neutral-200 font-semibold">
                        {p.fullName}
                      </div>
                    </div>

                    <div className="col-span-1">
                      <div className="text-neutral-200">{p.code || "—"}</div>
                    </div>

                    <div className="col-span-1">
                      <div className="text-neutral-200">
                        {p.type === "OWNER"
                          ? "Propietario"
                          : p.type === "TENANT"
                            ? "Inquilino"
                            : p.type || "—"}
                      </div>
                    </div>

                    <div className="col-span-1">
                      <div className="text-neutral-200">{wasap}</div>
                    </div>

                    <div className="col-span-1">
                      <div className="text-neutral-200">{p.email || "—"}</div>
                    </div>

                    <div className="col-span-1 flex justify-end">
                      <button
                        onClick={() => handleOpenEdit(p)}
                        className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs hover:bg-white/10 transition"
                      >
                        Ver
                      </button>
                    </div>
                  </div>
                );
              })
            )}

              {totalPages > 1 && (
                <div className="flex justify-center items-center gap-2 py-4">
                  <button
                    className="px-3 py-1 rounded bg-white/10 border border-white/10 text-xs text-white disabled:opacity-40"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                  >
                    Anterior
                  </button>
                  <span className="text-xs text-neutral-300">
                    Página {currentPage} de {totalPages}
                  </span>
                  <button
                    className="px-3 py-1 rounded bg-white/10 border border-white/10 text-xs text-white disabled:opacity-40"
                    onClick={() =>
                      setCurrentPage((p) => Math.min(totalPages, p + 1))
                    }
                    disabled={currentPage === totalPages}
                  >
                    Siguiente
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

      {/* Modal de edición/eliminación */}
      <Modal open={!!editClient} onClose={handleCloseEdit}>
        {editClient && (
          <>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void handleSaveEdit();
              }}
              className="flex flex-col gap-4 min-w-65"
            >
              <h2 className="text-xl font-bold mb-2">Editar Cliente</h2>

              <div>
                <label className="block text-sm mb-1">Tipo</label>
                <select
                  value={editClient.type}
                  onChange={(e) =>
                    setEditClient({ ...editClient, type: e.target.value })
                  }
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
                    onChange={(e) => setNombre(e.target.value)}
                    className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-white/20"
                    required
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-sm mb-1">Apellido</label>
                  <input
                    type="text"
                    value={apellido}
                    onChange={(e) => setApellido(e.target.value)}
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
                  onChange={(e) => setDni(e.target.value)}
                  className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-white/20"
                  required
                />
              </div>

              <div>
                <label className="block text-sm mb-1">WhatsApp</label>
                <input
                  type="text"
                  value={wasp}
                  onChange={(e) => setWasp(e.target.value)}
                  className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-white/20"
                  required
                />
              </div>

              <div>
                <label className="block text-sm mb-1">Email</label>
                <input
                  type="email"
                  value={editClient.email || ""}
                  onChange={(e) =>
                    setEditClient({ ...editClient, email: e.target.value })
                  }
                  className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-white/20"
                  required
                />
              </div>

              {editError && (
                <div className="text-red-400 text-sm text-center">
                  {editError}
                </div>
              )}

              <div className="flex gap-2 mt-2">
                <button
                  type="submit"
                  className="btn-benetton-green flex-1 rounded-xl px-4 py-2 text-white shadow"
                  disabled={editLoading}
                >
                  {editLoading ? "Guardando..." : "Guardar"}
                </button>
                <button
                  type="button"
                  className="btn-benetton-red flex-1 rounded-xl px-4 py-2 text-white shadow"
                  disabled={deleteLoading}
                  onClick={() => setDeleteConfirm(true)}
                >
                  Eliminar
                </button>
              </div>

              {deleteConfirm && (
                <div className="mt-2 p-2 bg-red-900/40 rounded text-center">
                  <div className="mb-2">
                    ¿Seguro que deseas eliminar este cliente?
                  </div>
                  <button
                    type="button"
                    className="btn-benetton-red rounded px-3 py-1 text-white mr-2 shadow"
                    onClick={() => void handleDelete()}
                    disabled={deleteLoading}
                  >
                    {deleteLoading ? "Eliminando..." : "Sí, eliminar"}
                  </button>
                  <button
                    type="button"
                    className="btn-benetton-blue rounded px-3 py-1 text-white shadow"
                    onClick={() => setDeleteConfirm(false)}
                    disabled={deleteLoading}
                  >
                    Cancelar
                  </button>
                </div>
              )}
            </form>
          </>
        )}
      </Modal>
      </div>
    </main>
  );
}
