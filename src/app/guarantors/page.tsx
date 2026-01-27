"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useToast } from "@/components/ToastProvider";

type TenantDTO = {
  _id: string;
  code?: string;
  type: "TENANT" | string;
  fullName: string;
};

type GuarantorDTO = {
  _id: string;
  code?: string;
  type: "GUARANTOR";
  fullName: string;
  dniCuit?: string;
  phone?: string;
  wasp?: string;
  email?: string;
  address?: string;
  notes?: string;
  tenantPersonId?: string | null;
  tenantId?: string | null; // compat
};

type PeopleListResponse<T> =
  | { ok: true; people: T[] }
  | { ok: false; error?: string; message?: string };

type CreateResponse =
  | { ok: true; personId: string; code: string; person?: GuarantorDTO }
  | { ok: false; error?: string; message?: string };

type UpdateResponse =
  | { ok: true; person: GuarantorDTO }
  | { ok: false; error?: string; message?: string };

type DeleteResponse =
  | { ok: true }
  | { ok: false; error?: string; message?: string };

function getErrorMessage(
  r: { ok: boolean; error?: string; message?: string } | undefined,
  fallback: string
) {
  if (!r) return fallback;
  if (r.ok) return "";
  if (typeof r.message === "string" && r.message.trim()) return r.message;
  if (typeof r.error === "string" && r.error.trim()) return r.error;
  return fallback;
}

function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-xl rounded-2xl border border-white/10 bg-neutral-950 p-5 relative">
        <button
          onClick={onClose}
          className="absolute right-3 top-3 rounded-lg border border-white/10 px-2 py-1 text-sm opacity-80 hover:opacity-100"
          aria-label="Cerrar"
          title="Cerrar"
        >
          ✕
        </button>
        <h2 className="text-lg font-semibold">{title}</h2>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

export default function GuarantorsPage() {
  const { show } = useToast();

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<GuarantorDTO[]>([]);
  const [query, setQuery] = useState("");

  const [tenantsLoading, setTenantsLoading] = useState(true);
  const [tenants, setTenants] = useState<TenantDTO[]>([]);

  const [openNew, setOpenNew] = useState(false);
  const [saving, setSaving] = useState(false);

  const [openEdit, setOpenEdit] = useState(false);
  const [editTarget, setEditTarget] = useState<GuarantorDTO | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const [fullName, setFullName] = useState("");
  const [dniCuit, setDniCuit] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [tenantPersonId, setTenantPersonId] = useState("");

  function resetForm() {
    setFullName("");
    setDniCuit("");
    setWhatsapp("");
    setEmail("");
    setAddress("");
    setNotes("");
    setTenantPersonId("");
  }

  const tenantById = useMemo(() => {
    const m = new Map<string, TenantDTO>();
    tenants.forEach((t) => m.set(t._id, t));
    return m;
  }, [tenants]);

  async function loadTenants() {
    try {
      setTenantsLoading(true);
      const res = await fetch("/api/people?type=TENANT", { cache: "no-store" });
      const data = (await res.json()) as PeopleListResponse<TenantDTO>;
      if (!res.ok || !data.ok) {
        setTenants([]);
        return;
      }
      setTenants(Array.isArray(data.people) ? data.people : []);
    } catch {
      setTenants([]);
    } finally {
      setTenantsLoading(false);
    }
  }

  async function loadGuarantors() {
    try {
      setLoading(true);
      const res = await fetch("/api/people?type=GUARANTOR", { cache: "no-store" });
      const data = (await res.json()) as PeopleListResponse<GuarantorDTO>;

      if (!res.ok || !data.ok) {
        show(getErrorMessage(data, "No se pudieron cargar los garantes"));
        setRows([]);
        return;
      }

      setRows(Array.isArray(data.people) ? data.people : []);
    } catch {
      show("Error de red cargando garantes");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  async function loadAll() {
    await Promise.all([loadTenants(), loadGuarantors()]);
  }

  useEffect(() => {
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;

    return rows.filter((p) => {
      const a = (p.fullName || "").toLowerCase();
      const b = (p.code || "").toLowerCase();
      const c = (p.dniCuit || "").toLowerCase();
      const phoneVal = (p.phone || p.wasp || "").toLowerCase();
      const e = (p.address || "").toLowerCase();
      const relId = String(p.tenantPersonId || p.tenantId || "");
      const tenantName = relId ? (tenantById.get(relId)?.fullName || "").toLowerCase() : "";
      return a.includes(q) || b.includes(q) || c.includes(q) || phoneVal.includes(q) || e.includes(q) || tenantName.includes(q);
    });
  }, [rows, query, tenantById]);

  async function createGuarantor() {
    if (!fullName.trim()) return show("Nombre y apellido es obligatorio");
    if (!tenantPersonId) return show("Tenés que seleccionar un inquilino");

    try {
      setSaving(true);

      const payload = {
        type: "GUARANTOR" as const,
        fullName: fullName.trim(),
        dniCuit: dniCuit.trim(),
        phone: whatsapp.trim(),
        email: email.trim(),
        address: address.trim(),
        notes: notes.trim(),
        tenantPersonId,
        tenantId: tenantPersonId, // compat
      };

      const res = await fetch("/api/people", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = (await res.json()) as CreateResponse;

      if (!res.ok || !data.ok) {
        show(getErrorMessage(data, "No se pudo crear el garante"));
        return;
      }

      // ✅ FIX TS: nunca agregamos undefined
      if (data.person && data.person._id) {
        setRows((prev) => [data.person as GuarantorDTO, ...prev]);
      } else {
        await loadGuarantors();
      }

      show(`Garante creado (${data.code})`);
      setOpenNew(false);
      resetForm();
    } catch {
      show("Error de red creando garante");
    } finally {
      setSaving(false);
    }
  }

  function openEditModal(p: GuarantorDTO) {
    setEditTarget(p);
    setFullName(p.fullName || "");
    setDniCuit(p.dniCuit || "");
    setWhatsapp(p.phone || p.wasp || "");
    setEmail(p.email || "");
    setAddress(p.address || "");
    setNotes(p.notes || "");
    setTenantPersonId(String(p.tenantPersonId || p.tenantId || ""));
    setDeleteConfirm(false);
    setOpenEdit(true);
  }

  async function saveEdit() {
    if (!editTarget) return;
    if (!fullName.trim()) return show("Nombre y apellido es obligatorio");
    if (!tenantPersonId) return show("Tenés que seleccionar un inquilino");

    try {
      setEditSaving(true);

      const payload = {
        type: "GUARANTOR" as const,
        fullName: fullName.trim(),
        dniCuit: dniCuit.trim(),
        phone: whatsapp.trim(),
        email: email.trim(),
        address: address.trim(),
        notes: notes.trim(),
        tenantPersonId,
        tenantId: tenantPersonId, // compat
      };

      const res = await fetch(`/api/people/${editTarget._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = (await res.json()) as UpdateResponse;

      if (!res.ok || !data.ok) {
        show(getErrorMessage(data, "No se pudo guardar el garante"));
        return;
      }

      setRows((prev) => prev.map((x) => (x._id === editTarget._id ? data.person : x)));

      show("Garante actualizado");
      setOpenEdit(false);
      setEditTarget(null);
      resetForm();
    } catch {
      show("Error de red guardando cambios");
    } finally {
      setEditSaving(false);
    }
  }

  async function deleteGuarantor() {
    if (!editTarget) return;

    if (!deleteConfirm) {
      setDeleteConfirm(true);
      return;
    }

    try {
      setDeleteLoading(true);
      const res = await fetch(`/api/people/${editTarget._id}`, { method: "DELETE" });
      const data = (await res.json()) as DeleteResponse;

      if (!res.ok || !data.ok) {
        show(getErrorMessage(data, "No se pudo eliminar"));
        return;
      }

      setRows((prev) => prev.filter((x) => x._id !== editTarget._id));

      show("Garante eliminado");
      setOpenEdit(false);
      setEditTarget(null);
      setDeleteConfirm(false);
      resetForm();
    } catch {
      show("Error de red eliminando garante");
    } finally {
      setDeleteLoading(false);
    }
  }

  return (
    <main className="min-h-screen px-5 py-8 text-white" style={{ background: "var(--background)" }}>
      <div className="mx-auto max-w-6xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold">Garantes</h1>
            <p className="text-sm opacity-70">Listado y alta de garantes</p>
          </div>

          <div className="flex items-center gap-2">
            {/* Volver */}
            <Link
              href="/"
              title="Volver"
              className="flex items-center justify-center w-10 h-10 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 transition text-lg"
            >
              ←
            </Link>

            {/* Nuevo (solo ícono) */}
            <button
              onClick={() => setOpenNew(true)}
              title="Nuevo garante"
              aria-label="Nuevo garante"
              className="flex items-center justify-center w-10 h-10 cursor-pointer rounded-full border border-white/10 bg-white/5 hover:bg-white/10 transition text-lg font-semibold"
              style={{ color: "var(--benetton-green)" }}
            >
              +
            </button>
          </div>
        </div>

        <div
          className="mt-5 rounded-2xl border p-4"
          style={{ borderColor: "rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.02)" }}
        >
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nombre, código, DNI/CUIT, WhatsApp, dirección o inquilino…"
              className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
              style={{ borderColor: "rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.25)" }}
            />

            <button
              onClick={() => void loadAll()}
              className="rounded-xl border px-4 py-2 text-sm hover:opacity-90"
              style={{ borderColor: "rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.03)" }}
            >
              Recargar
            </button>
          </div>

          <div className="mt-4 overflow-hidden rounded-2xl border" style={{ borderColor: "rgba(255,255,255,0.10)" }}>
            <div
              className="grid grid-cols-12 gap-0 px-4 py-3 text-xs uppercase tracking-wide opacity-70"
              style={{ background: "rgba(255,255,255,0.03)" }}
            >
              <div className="col-span-2">Código</div>
              <div className="col-span-3">Nombre</div>
              <div className="col-span-2">DNI/CUIT</div>
              <div className="col-span-2">WhatsApp</div>
              <div className="col-span-1">Dirección</div>
              <div className="col-span-1">Inquilino</div>
              <div className="col-span-1 text-right">Acc.</div>
            </div>

            <div style={{ background: "rgba(0,0,0,0.15)" }}>
              {loading ? (
                <div className="px-4 py-6 text-sm opacity-70">Cargando…</div>
              ) : filtered.length === 0 ? (
                <div className="px-4 py-6 text-sm opacity-70">No hay garantes.</div>
              ) : (
                filtered.map((p) => {
                  const relId = String(p.tenantPersonId || p.tenantId || "");
                  const tenantName = relId ? tenantById.get(relId)?.fullName : undefined;
                  const phoneVal = p.phone || p.wasp;

                  return (
                    <div
                      key={p._id}
                      className="grid grid-cols-12 px-4 py-3 text-sm border-t items-start"
                      style={{ borderColor: "rgba(255,255,255,0.06)" }}
                    >
                      <div className="col-span-2 font-semibold">{p.code || "—"}</div>
                      <div className="col-span-3">{p.fullName}</div>
                      <div className="col-span-2 opacity-80">{p.dniCuit || "—"}</div>
                      <div className="col-span-2 opacity-80">{phoneVal || "—"}</div>

                      <div className="col-span-1 opacity-80 truncate" title={p.address || ""}>
                        {p.address || "—"}
                      </div>

                      <div className="col-span-1 opacity-80 truncate" title={tenantName || ""}>
                        {tenantName || "—"}
                      </div>

                      <div className="col-span-1 text-right">
                        <button
                          onClick={() => openEditModal(p)}
                          className="rounded-lg border border-white/10 px-2 py-1 text-xs hover:opacity-90"
                          style={{ background: "rgba(255,255,255,0.03)" }}
                        >
                          Editar
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Modal nuevo */}
        <Modal open={openNew} onClose={() => (!saving ? (setOpenNew(false), resetForm()) : null)} title="Nuevo garante">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="text-xs opacity-70">Inquilino *</label>
              <select
                value={tenantPersonId}
                onChange={(e) => setTenantPersonId(e.target.value)}
                disabled={tenantsLoading}
                className="mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none"
                style={{ borderColor: "rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.25)" }}
              >
                <option value="">{tenantsLoading ? "Cargando inquilinos..." : "Seleccionar inquilino"}</option>
                {tenants.map((t) => (
                  <option key={t._id} value={t._id}>
                    {(t.code ? `${t.code} — ` : "") + t.fullName}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="text-xs opacity-70">Nombre y apellido *</label>
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none"
                style={{ borderColor: "rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.25)" }}
              />
            </div>

            <div>
              <label className="text-xs opacity-70">DNI/CUIT</label>
              <input
                value={dniCuit}
                onChange={(e) => setDniCuit(e.target.value)}
                className="mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none"
                style={{ borderColor: "rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.25)" }}
              />
            </div>

            <div>
              <label className="text-xs opacity-70">WhatsApp</label>
              <input
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
                className="mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none"
                style={{ borderColor: "rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.25)" }}
              />
            </div>

            <div>
              <label className="text-xs opacity-70">Email</label>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none"
                style={{ borderColor: "rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.25)" }}
              />
            </div>

            <div>
              <label className="text-xs opacity-70">Dirección</label>
              <input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none"
                style={{ borderColor: "rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.25)" }}
              />
            </div>

            <div className="sm:col-span-2">
              <label className="text-xs opacity-70">Notas</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none"
                style={{ borderColor: "rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.25)" }}
              />
            </div>
          </div>

          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              disabled={saving}
              onClick={() => (saving ? null : (setOpenNew(false), resetForm()))}
              className="rounded-xl border px-4 py-2 text-sm hover:opacity-90 disabled:opacity-50"
              style={{ borderColor: "rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.03)" }}
            >
              Cancelar
            </button>

            <button
              disabled={saving}
              onClick={() => void createGuarantor()}
              className="rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50"
              style={{ background: "var(--benetton-green)", color: "#05110A" }}
            >
              {saving ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </Modal>

        {/* Modal editar */}
        <Modal
          open={openEdit}
          onClose={() =>
            editSaving || deleteLoading
              ? null
              : (setOpenEdit(false), setEditTarget(null), setDeleteConfirm(false), resetForm())
          }
          title={editTarget ? `Editar garante (${editTarget.code || "—"})` : "Editar garante"}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="text-xs opacity-70">Inquilino *</label>
              <select
                value={tenantPersonId}
                onChange={(e) => setTenantPersonId(e.target.value)}
                disabled={tenantsLoading}
                className="mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none"
                style={{ borderColor: "rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.25)" }}
              >
                <option value="">{tenantsLoading ? "Cargando inquilinos..." : "Seleccionar inquilino"}</option>
                {tenants.map((t) => (
                  <option key={t._id} value={t._id}>
                    {(t.code ? `${t.code} — ` : "") + t.fullName}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="text-xs opacity-70">Nombre y apellido *</label>
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none"
                style={{ borderColor: "rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.25)" }}
              />
            </div>

            <div>
              <label className="text-xs opacity-70">DNI/CUIT</label>
              <input
                value={dniCuit}
                onChange={(e) => setDniCuit(e.target.value)}
                className="mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none"
                style={{ borderColor: "rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.25)" }}
              />
            </div>

            <div>
              <label className="text-xs opacity-70">WhatsApp</label>
              <input
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
                className="mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none"
                style={{ borderColor: "rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.25)" }}
              />
            </div>

            <div>
              <label className="text-xs opacity-70">Email</label>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none"
                style={{ borderColor: "rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.25)" }}
              />
            </div>

            <div>
              <label className="text-xs opacity-70">Dirección</label>
              <input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none"
                style={{ borderColor: "rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.25)" }}
              />
            </div>

            <div className="sm:col-span-2">
              <label className="text-xs opacity-70">Notas</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none"
                style={{ borderColor: "rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.25)" }}
              />
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between gap-2">
            <button
              disabled={editSaving || deleteLoading}
              onClick={() => void deleteGuarantor()}
              className="rounded-xl border px-4 py-2 text-sm disabled:opacity-50"
              style={{
                borderColor: "rgba(255,255,255,0.12)",
                background: deleteConfirm ? "rgba(239,68,68,0.25)" : "rgba(255,255,255,0.03)",
              }}
            >
              {deleteLoading ? "Eliminando…" : deleteConfirm ? "Confirmar eliminar" : "Eliminar"}
            </button>

            <div className="flex items-center gap-2">
              <button
                disabled={editSaving || deleteLoading}
                onClick={() =>
                  editSaving || deleteLoading
                    ? null
                    : (setOpenEdit(false), setEditTarget(null), setDeleteConfirm(false), resetForm())
                }
                className="rounded-xl border px-4 py-2 text-sm hover:opacity-90 disabled:opacity-50"
                style={{ borderColor: "rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.03)" }}
              >
                Cancelar
              </button>

              <button
                disabled={editSaving || deleteLoading}
                onClick={() => void saveEdit()}
                className="rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50"
                style={{ background: "var(--benetton-green)", color: "#05110A" }}
              >
                {editSaving ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </div>
        </Modal>
      </div>
    </main>
  );
}
