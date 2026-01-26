"use client";

import { useEffect, useMemo, useState } from "react";
import React from "react";
import Link from "next/link";

// Modal simple reutilizable
function Modal({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) {
    if (!open) return null;
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
            <div className="bg-neutral-900 border border-neutral-700 rounded-2xl p-8 min-w-85 max-w-full relative">
                <button onClick={onClose} className="absolute top-3 right-3 text-neutral-400 hover:text-white text-xl">×</button>
                {children}
            </div>
        </div>
    );
}

type PersonType = "OWNER" | "TENANT" | string;

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

type TypeFilter = "ALL" | PersonType;

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
    const [loading, setLoading] = useState(false);
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
                const msg = "error" in data && data.error ? data.error : "message" in data && data.message ? data.message : "Error";
                setErr(msg);
                return;
            }

            setPeople(data.people ?? []);
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
            const hay = [p.code, p._id, p.fullName, p.email, p.phone, p.type].filter(Boolean).join(" ").toLowerCase();
            return hay.includes(text);
        });
    }, [people, q, type]);

    // Calcular paginación
    const totalPages = Math.ceil(filtered.length / pageSize);
    const paginated = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

    // Handlers para editar/eliminar
    function handleOpenEdit(client: PersonDTO) {
        setEditClient(client);
        // Inicializar campos separados correctamente
        setNombre(
            client.nombre !== undefined && client.nombre !== null ? client.nombre : (client.fullName?.split(" ")[0] ?? "")
        );
        setApellido(
            client.apellido !== undefined && client.apellido !== null ? client.apellido : (client.fullName?.split(" ")[1] ?? "")
        );
        // Usar dni, sino dniCuit, sino vacío
        setDni(
            client.dni && client.dni.trim() !== ""
                ? client.dni
                : (client.dniCuit && client.dniCuit.trim() !== "" ? client.dniCuit : "")
        );
        // Usar wasp, sino phone, sino vacío
        setWasp(
            client.wasp && client.wasp.trim() !== ""
                ? client.wasp
                : (client.phone && client.phone.trim() !== "" ? client.phone : "")
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
                fullName: nombre + " " + apellido,
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
            const res = await fetch(`/api/people/${editClient._id}`, { method: "DELETE" });
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
        <div className="mx-auto max-w-6xl w-full px-6 py-8">
            <div className="flex items-start justify-between gap-6">
                <div className="flex items-center gap-2">
                    <Link href="/" title="Ir a inicio"
                        className="flex items-center justify-center w-9 h-9 rounded-full border border-white/20 bg-white/10 hover:bg-white/20 transition text-xl text-neutral-100 shadow-sm">
                        <span>&#8592;</span>
                    </Link>
                    <h1 className="text-3xl font-semibold">Clientes</h1>
                </div>
                <div className="flex items-center gap-3">
                    <Link
                        href="/contracts"
                        className="rounded-xl border px-4 py-2 text-sm text-white transition shadow hover:brightness-125 hover:border-white"
                        style={{ background: 'var(--benetton-black)', borderColor: 'rgba(255,255,255,0.18)', boxShadow: '0 0 12px 2px #14141A55' }}
                    >
                        Ir a Contratos
                    </Link>
                    <button
                        onClick={() => void load()}
                        className="rounded-xl border px-4 py-2 text-sm text-white transition disabled:opacity-50 shadow hover:brightness-125 hover:border-white"
                        style={{ background: 'var(--benetton-black)', borderColor: 'rgba(255,255,255,0.18)', boxShadow: '0 0 12px 2px #14141A55', cursor: 'pointer' }}
                        disabled={loading}
                    >
                        {loading ? "Actualizando..." : "Actualizar"}
                    </button>
                    <Link
                        href="/people/new"
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
                        +Alta Cliente
                    </Link>
                </div>
            </div>
            {err ? (
                <div className="mt-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                    {err}
                </div>
            ) : null}
            {/* Filtros */}
            <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
                <div className="px-4 py-3 border-b border-white/10 text-sm font-semibold">Filtros</div>
                <div className="p-4 grid grid-cols-3 gap-4">
                    <div className="col-span-2">
                        <div className="text-xs text-neutral-400 mb-1">BÚSQUEDA (nombre, código, email, etc.)</div>
                        <input
                            value={q}
                            onChange={(e) => setQ(e.target.value)}
                            placeholder="Ej: PID-001, Juan Pérez, demo@correo.com..."
                            className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-sm outline-none focus:border-white/20"
                        />
                    </div>
                    <div>
                        <div className="text-xs text-neutral-400 mb-1">TIPO</div>
                        <select
                            value={type}
                            onChange={(e) => setType(e.target.value as TypeFilter)}
                            className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-sm outline-none focus:border-white/20"
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
                <div className="px-4 py-3 border-b border-white/10 text-sm font-semibold">
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
                            <div className="px-4 py-10 text-sm text-neutral-400">Sin resultados.</div>
                        ) : (
                            paginated.map((p) => {
                                // Mostrar wasp, sino phone, sino "—"
                                const wasap = p.wasp && p.wasp.trim() !== "" ? p.wasp : (p.phone && p.phone.trim() !== "" ? p.phone : "—");
                                return (
                                    <div
                                        key={p._id}
                                        className="grid grid-cols-7 gap-0 px-4 py-3 border-t border-white/10 text-sm items-center"
                                    >
                                        <div className="col-span-2">
                                            <div className="text-neutral-200 font-semibold">{p.fullName}</div>
                                        </div>
                                        <div className="col-span-1">
                                            <div className="text-neutral-200">{p.code || "—"}</div>
                                        </div>
                                        <div className="col-span-1">
                                            <div className="text-neutral-200">
                                                {p.type === "OWNER" ? "Propietario" : p.type === "TENANT" ? "Inquilino" : p.type || "—"}
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
                        {/* Controles de paginación */}
                        {totalPages > 1 && (
                            <div className="flex justify-center items-center gap-2 py-4">
                                <button
                                    className="px-3 py-1 rounded bg-white/10 border border-white/10 text-xs text-white disabled:opacity-40"
                                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                                    disabled={currentPage === 1}
                                >
                                    Anterior
                                </button>
                                <span className="text-xs text-neutral-300">Página {currentPage} de {totalPages}</span>
                                <button
                                    className="px-3 py-1 rounded bg-white/10 border border-white/10 text-xs text-white disabled:opacity-40"
                                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
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
                            onSubmit={e => { e.preventDefault(); handleSaveEdit(); }}
                            className="flex flex-col gap-4 min-w-65"
                        >
                            <h2 className="text-xl font-bold mb-2">Editar Cliente</h2>
                        <div>
                            <label className="block text-sm mb-1">Tipo</label>
                            <select
                                value={editClient.type}
                                onChange={e => setEditClient({ ...editClient, type: e.target.value })}
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
                                value={editClient.email || ""}
                                onChange={e => setEditClient({ ...editClient, email: e.target.value })}
                                className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-white/20"
                                required
                            />
                        </div>
                            {/* Eliminado campo duplicado Teléfono/WhatsApp */}
                            {editError && <div className="text-red-400 text-sm text-center">{editError}</div>}
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
                                    <div className="mb-2">¿Seguro que deseas eliminar este cliente?</div>
                                    <button
                                        type="button"
                                        className="btn-benetton-red rounded px-3 py-1 text-white mr-2 shadow"
                                        onClick={handleDelete}
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
    );
}