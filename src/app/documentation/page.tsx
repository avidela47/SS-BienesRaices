/* eslint-disable @next/next/no-img-element */
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import BackButton from "@/app/components/BackButton";
import { useToast } from "@/components/ToastProvider";

/* =========================
   Tipos
========================= */

type DocumentDTO = {
  _id: string;
  title: string;
  type: string;
  entity: string;
  entityId?: string | null;
  description?: string;
  images: string[];
  status?: string;
  createdAt?: string;
};

type ListResponse =
  | { ok: true; documents: DocumentDTO[] }
  | { ok: false; message?: string; error?: string };

type OneResponse =
  | { ok: true; document: DocumentDTO }
  | { ok: false; message?: string; error?: string };

type DeleteResponse =
  | { ok: true }
  | { ok: false; message?: string; error?: string };

type PersonMini = { _id: string; code?: string; fullName: string };
type PropertyMini = { _id: string; code?: string; addressLine?: string; title?: string };
type ContractMini = { _id: string; code?: string; title?: string };

type PeopleListResponse =
  | { ok: true; people: PersonMini[] }
  | { ok: false; message?: string; error?: string };

type PropertiesListResponse =
  | { ok: true; properties: PropertyMini[] }
  | { ok: false; message?: string; error?: string };

type ContractsListResponse =
  | { ok: true; contracts: ContractMini[] }
  | { ok: false; message?: string; error?: string };

type ErrLike = { message?: unknown; error?: unknown };

function getErr(r: unknown, fb: string) {
  const obj = (r ?? {}) as ErrLike;
  if (typeof obj.message === "string" && obj.message.trim()) return obj.message;
  if (typeof obj.error === "string" && obj.error.trim()) return obj.error;
  return fb;
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
      <div className="w-full max-w-2xl rounded-2xl border border-white/10 bg-neutral-950 p-5 relative text-white max-h-[85vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute right-3 top-3 rounded-lg border border-white/10 px-2 py-1 text-sm opacity-80 hover:opacity-100 cursor-pointer"
          aria-label="Cerrar"
          title="Cerrar"
          type="button"
        >
          ✕
        </button>
        <h2 className="text-lg font-semibold">{title}</h2>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

async function readFilesAsDataURL(files: FileList): Promise<string[]> {
  const list = Array.from(files);
  const out = await Promise.all(
    list.map(
      (file) =>
        new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
          reader.onerror = reject;
          reader.readAsDataURL(file);
        })
    )
  );
  return out.filter(Boolean);
}

/* =========================
   Entidad (ES) -> value (API)
========================= */

type EntityValue = "TENANT" | "OWNER" | "GUARANTOR" | "PROPERTY" | "CONTRACT" | "AGENCY" | "OTHER";

const ENTITY_ES: Array<{ label: string; value: EntityValue; help: string }> = [
  { label: "Inquilino", value: "TENANT", help: "Documentación del inquilino" },
  { label: "Propietario", value: "OWNER", help: "Documentación del propietario" },
  { label: "Garante", value: "GUARANTOR", help: "Documentación del garante" },
  { label: "Propiedad", value: "PROPERTY", help: "Documentación de la propiedad" },
  { label: "Contrato", value: "CONTRACT", help: "Documentación del contrato" },
  { label: "Inmobiliaria", value: "AGENCY", help: "Documentación de la inmobiliaria" },
  { label: "Otro", value: "OTHER", help: "Sin entidad específica" },
];

function entityLabel(v: string) {
  return ENTITY_ES.find((x) => x.value === v)?.label ?? "Otro";
}

/* =========================
   Página
========================= */

export default function DocumentationPage() {
  const { show } = useToast();

  // tabla
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<DocumentDTO[]>([]);
  const [query, setQuery] = useState("");

  // modales
  const [openNew, setOpenNew] = useState(false);
  const [saving, setSaving] = useState(false);

  const [openEdit, setOpenEdit] = useState(false);
  const [editTarget, setEditTarget] = useState<DocumentDTO | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // form
  const [title, setTitle] = useState("");
  const [docType, setDocType] = useState("OTRO");
  const [entity, setEntity] = useState<EntityValue>("OTHER");
  const [entityId, setEntityId] = useState<string>("");
  const [description, setDescription] = useState("");
  const [images, setImages] = useState<string[]>([]);

  // relacionados
  const [relLoading, setRelLoading] = useState(false);
  const [relOptions, setRelOptions] = useState<Array<{ id: string; label: string }>>([]);

  // IMPORTANTE: cuando abrís Editar, NO quiero que el effect “entity” te borre entityId
  const skipNextEntityResetRef = useRef(false);

  function resetForm() {
    setTitle("");
    setDocType("OTRO");
    setEntity("OTHER");
    setEntityId("");
    setDescription("");
    setImages([]);
    setRelOptions([]);
    setRelLoading(false);
  }

  // endpoint real que ya tenías funcionando
  const API_BASE = "/api/documents";

  async function loadAll() {
    try {
      setLoading(true);
      const res = await fetch(API_BASE, { cache: "no-store" });
      const data = (await res.json()) as ListResponse;

      if (!res.ok || !data.ok) {
        show(getErr(data, "Error de red cargando documentos"));
        setRows([]);
        return;
      }

      setRows(Array.isArray(data.documents) ? data.documents : []);
    } catch {
      show("Error de red cargando documentos");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((d) =>
      `${d.title} ${d.type} ${d.entity} ${d.entityId ?? ""} ${d.description ?? ""}`.toLowerCase().includes(q)
    );
  }, [rows, query]);

  async function loadRelatedOptions(nextEntity: EntityValue) {
    try {
      setRelLoading(true);
      setRelOptions([]);

      if (nextEntity === "AGENCY") {
        setRelOptions([{ id: "AGENCY", label: "Inmobiliaria" }]);
        return;
      }

      if (nextEntity === "OTHER") {
        setRelOptions([]);
        return;
      }

      if (nextEntity === "TENANT" || nextEntity === "OWNER" || nextEntity === "GUARANTOR") {
        const res = await fetch(`/api/people?type=${nextEntity}`, { cache: "no-store" });
        const data = (await res.json()) as PeopleListResponse;

        if (!res.ok || !data.ok) {
          show(getErr(data, "No se pudieron cargar los relacionados"));
          setRelOptions([]);
          return;
        }

        setRelOptions(
          (data.people || []).map((p) => ({
            id: p._id,
            label: `${p.code ? `${p.code} — ` : ""}${p.fullName}`,
          }))
        );
        return;
      }

      if (nextEntity === "PROPERTY") {
        const res = await fetch(`/api/properties`, { cache: "no-store" });
        const data = (await res.json()) as PropertiesListResponse;

        if (!res.ok || !data.ok) {
          show(getErr(data, "No se pudieron cargar propiedades"));
          setRelOptions([]);
          return;
        }

        setRelOptions(
          (data.properties || []).map((p) => {
            const labelBase = p.addressLine || p.title || "";
            const label = `${p.code ? `${p.code} — ` : ""}${labelBase || p._id}`;
            return { id: p._id, label };
          })
        );
        return;
      }

      if (nextEntity === "CONTRACT") {
        const res = await fetch(`/api/contracts`, { cache: "no-store" });
        const data = (await res.json()) as ContractsListResponse;

        if (!res.ok || !data.ok) {
          show(getErr(data, "No se pudieron cargar contratos"));
          setRelOptions([]);
          return;
        }

        setRelOptions(
          (data.contracts || []).map((c) => ({
            id: c._id,
            label: `${c.code ? `${c.code} — ` : ""}${c.title || c._id}`,
          }))
        );
        return;
      }
    } catch {
      setRelOptions([]);
      show("Error de red cargando relacionados");
    } finally {
      setRelLoading(false);
    }
  }

  // cuando cambia entidad, recargo opciones. PERO no borro entityId si venís de abrir Editar
  useEffect(() => {
    void loadRelatedOptions(entity);

    if (skipNextEntityResetRef.current) {
      skipNextEntityResetRef.current = false;
      return;
    }

    setEntityId("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entity]);

  function openEditModal(d: DocumentDTO) {
    // IMPORTANTÍSIMO: seteo esto antes de cambiar entity
    skipNextEntityResetRef.current = true;

    setEditTarget(d);
    setTitle(d.title || "");
    setDocType(d.type || "OTRO");
    setEntity((d.entity as EntityValue) || "OTHER");
    setEntityId(d.entity === "AGENCY" ? "AGENCY" : String(d.entityId || ""));
    setDescription(d.description || "");
    setImages(Array.isArray(d.images) ? d.images : []);
    setDeleteConfirm(false);
    setOpenEdit(true);
  }

  async function createDoc() {
    if (!title.trim()) return show("Título es obligatorio");
    if (entity !== "OTHER" && entity !== "AGENCY" && !entityId.trim()) return show("Seleccioná el relacionado");

    try {
      setSaving(true);

      const payload = {
        title: title.trim(),
        type: docType,
        entity,
        entityId: entity === "AGENCY" ? "AGENCY" : entityId.trim() ? entityId.trim() : null,
        description: description.trim(),
        images,
      };

      const res = await fetch(API_BASE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = (await res.json()) as OneResponse;

      if (!res.ok || !data.ok) {
        show(getErr(data, "No se pudo crear"));
        return;
      }

      setRows((p) => [data.document, ...p]);
      show("Documento creado");
      setOpenNew(false);
      resetForm();
    } catch {
      show("Error de red creando documento");
    } finally {
      setSaving(false);
    }
  }

  async function saveEdit() {
    if (!editTarget) return;
    if (!title.trim()) return show("Título es obligatorio");
    if (entity !== "OTHER" && entity !== "AGENCY" && !entityId.trim()) return show("Seleccioná el relacionado");

    try {
      setEditSaving(true);

      const payload = {
        title: title.trim(),
        type: docType,
        entity,
        entityId: entity === "AGENCY" ? "AGENCY" : entityId.trim() ? entityId.trim() : null,
        description: description.trim(),
        images,
      };

      const res = await fetch(`${API_BASE}/${editTarget._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = (await res.json()) as OneResponse;

      if (!res.ok || !data.ok) {
        show(getErr(data, "No se pudo guardar"));
        return;
      }

      setRows((prev) => prev.map((x) => (x._id === editTarget._id ? data.document : x)));
      show("Documento actualizado");
      setOpenEdit(false);
      setEditTarget(null);
      resetForm();
    } catch {
      show("Error de red guardando cambios");
    } finally {
      setEditSaving(false);
    }
  }

  async function delDoc() {
    if (!editTarget) return;

    if (!deleteConfirm) {
      setDeleteConfirm(true);
      return;
    }

    try {
      setDeleteLoading(true);
      const res = await fetch(`${API_BASE}/${editTarget._id}`, { method: "DELETE" });
      const data = (await res.json()) as DeleteResponse;

      if (!res.ok || !data.ok) {
        show(getErr(data, "No se pudo eliminar"));
        return;
      }

      setRows((prev) => prev.filter((x) => x._id !== editTarget._id));
      show("Documento eliminado");
      setOpenEdit(false);
      setEditTarget(null);
      setDeleteConfirm(false);
      resetForm();
    } catch {
      show("Error de red eliminando documento");
    } finally {
      setDeleteLoading(false);
    }
  }

  // ✅ NOTA CLAVE: no es componente <FormBody />, es función render.
  // Así NO se remonta todo el form y NO perdés el cursor.
  const renderRelatedSelect = () => {
    const help = ENTITY_ES.find((x) => x.value === entity)?.help ?? "";

    return (
      <div className="sm:col-span-2">
        <label className="text-xs opacity-70">
          Relacionado con {help ? <span className="opacity-60">— {help}</span> : null}
        </label>

        {entity === "OTHER" ? (
          <div
            className="mt-1 rounded-xl border px-3 py-2 text-sm opacity-70"
            style={{ borderColor: "rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.25)" }}
          >
            No aplica
          </div>
        ) : (
          <select
            value={entityId}
            onChange={(e) => setEntityId(e.target.value)}
            disabled={relLoading || entity === "AGENCY"}
            className="mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none focus:outline-none focus:ring-0 cursor-pointer"
            style={{ borderColor: "rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.25)" }}
          >
            <option value="">
              {relLoading ? "Cargando..." : entity === "AGENCY" ? "Inmobiliaria" : "Seleccionar..."}
            </option>

            {entity === "AGENCY" ? (
              <option value="AGENCY">Inmobiliaria</option>
            ) : (
              relOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))
            )}
          </select>
        )}
      </div>
    );
  };

  const renderFormBody = () => {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2">
          <label className="text-xs opacity-70">Título *</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none focus:outline-none focus:ring-0"
            style={{ borderColor: "rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.25)" }}
          />
        </div>

        <div>
          <label className="text-xs opacity-70">Tipo</label>
          <select
            value={docType}
            onChange={(e) => setDocType(e.target.value)}
            className="mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none focus:outline-none focus:ring-0 cursor-pointer"
            style={{ borderColor: "rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.25)" }}
          >
            {["DNI", "CONTRATO", "RECIBO", "GARANTIA", "SERVICIO", "OTRO"].map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs opacity-70">Entidad</label>
          <select
            value={entity}
            onChange={(e) => setEntity(e.target.value as EntityValue)}
            className="mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none focus:outline-none focus:ring-0 cursor-pointer"
            style={{ borderColor: "rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.25)" }}
          >
            {ENTITY_ES.map((x) => (
              <option key={x.value} value={x.value}>
                {x.label}
              </option>
            ))}
          </select>
        </div>

        {renderRelatedSelect()}

        <div className="sm:col-span-2">
          <label className="text-xs opacity-70">Descripción</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none focus:outline-none focus:ring-0"
            style={{ borderColor: "rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.25)" }}
          />
        </div>

        <div className="sm:col-span-2">
          <label className="text-xs opacity-70">Imágenes (subir desde PC)</label>
          <input
            type="file"
            accept="image/*"
            multiple
            className="mt-1 w-full cursor-pointer"
            onChange={async (e) => {
              // ✅ FIX: guardar referencia antes del await (evita null)
              const input = e.currentTarget;
              const files = input.files;
              if (!files || files.length === 0) return;

              const dataUrls = await readFilesAsDataURL(files);
              setImages((p) => [...p, ...dataUrls]);

              input.value = "";
            }}
          />

          {images.length > 0 && (
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-3">
              {images.map((src, idx) => (
                <div key={idx} className="rounded-xl border border-white/10 bg-black/30 p-2">
                  <img src={src} alt={`img-${idx}`} className="w-full h-28 object-cover rounded-lg" />
                  <button
                    type="button"
                    onClick={() => setImages((p) => p.filter((_, i) => i !== idx))}
                    className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 py-1 text-xs hover:bg-white/10 cursor-pointer"
                  >
                    Quitar
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <main className="min-h-screen px-5 py-8 text-white" style={{ background: "var(--background)" }}>
      <div className="mx-auto max-w-6xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold">Documentación</h1>
            <p className="text-sm opacity-70">Listado y carga de documentos</p>
          </div>

          <div className="flex items-center gap-2">
            <BackButton />
            <button
              onClick={() => {
                resetForm();
                setOpenNew(true);
              }}
              title="Nuevo documento"
              aria-label="Nuevo documento"
              className="flex items-center justify-center w-10 h-10 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 transition text-lg font-semibold cursor-pointer"
              style={{ color: "var(--benetton-green)" }}
            >
              +
            </button>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-white/10 bg-white/5">
          <div className="border-b border-white/10 px-5 py-4 flex items-center justify-between">
            <div className="text-sm font-semibold">Filtros</div>
            <button
              onClick={() => void loadAll()}
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm hover:bg-white/10 disabled:opacity-50 cursor-pointer"
              disabled={loading}
              title="Actualizar"
            >
              Actualizar
            </button>
          </div>

          <div className="px-5 py-4">
            <div className="mb-2 text-xs text-white/50">BUSCAR</div>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar…"
              className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none focus:outline-none focus:ring-0"
            />
          </div>

          <div className="px-4 pb-4">
            <div className="overflow-hidden rounded-2xl border border-white/10">
              <div className="grid grid-cols-12 gap-0 px-4 py-3 text-xs uppercase tracking-wide text-neutral-300 bg-white/5">
                <div className="col-span-2">Tipo</div>
                <div className="col-span-6">Título</div>
                <div className="col-span-2">Entidad</div>
                <div className="col-span-1">Imgs</div>
                <div className="col-span-1 text-right">Acc.</div>
              </div>

              {loading ? (
                <div className="px-4 py-6 text-sm opacity-70">Cargando…</div>
              ) : filtered.length === 0 ? (
                <div className="px-4 py-6 text-sm opacity-70">No hay documentos.</div>
              ) : (
                filtered.map((d) => {
                  const ent = entityLabel(d.entity);
                  return (
                    <div
                      key={d._id}
                      className="grid grid-cols-12 px-4 py-3 text-sm border-t border-white/10 items-start"
                    >
                      <div className="col-span-2 font-semibold">{d.type || "OTRO"}</div>
                      <div className="col-span-6">
                        <div className="font-semibold">{d.title}</div>
                        {d.description ? <div className="text-xs opacity-70 line-clamp-1">{d.description}</div> : null}
                      </div>
                      <div className="col-span-2 opacity-80">{ent}</div>
                      <div className="col-span-1 opacity-80">{Array.isArray(d.images) ? d.images.length : 0}</div>
                      <div className="col-span-1 text-right">
                        <button
                          onClick={() => openEditModal(d)}
                          className="rounded-xl border border-sky-400/30 bg-sky-400/10 px-3 py-1.5 text-xs hover:bg-sky-400/15 transition cursor-pointer"
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

        {/* MODAL NUEVO */}
        <Modal open={openNew} onClose={() => (!saving ? (setOpenNew(false), resetForm()) : null)} title="Nuevo documento">
          {renderFormBody()}

          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              disabled={saving}
              onClick={() => (saving ? null : (setOpenNew(false), resetForm()))}
              className="rounded-xl border px-4 py-2 text-sm hover:opacity-90 disabled:opacity-50 cursor-pointer"
              style={{ borderColor: "rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.03)" }}
            >
              Cancelar
            </button>

            <button
              disabled={saving}
              onClick={() => void createDoc()}
              className="rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50 cursor-pointer"
              style={{ background: "var(--benetton-green)", color: "#05110A" }}
            >
              {saving ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </Modal>

        {/* MODAL EDITAR */}
        <Modal
          open={openEdit}
          onClose={() =>
            editSaving || deleteLoading ? null : (setOpenEdit(false), setEditTarget(null), setDeleteConfirm(false), resetForm())
          }
          title="Editar documento"
        >
          {renderFormBody()}

          <div className="mt-4 flex items-center justify-between gap-2">
            <button
              disabled={editSaving || deleteLoading}
              onClick={() => void delDoc()}
              className="rounded-xl border px-4 py-2 text-sm cursor-pointer hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
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
                  editSaving || deleteLoading ? null : (setOpenEdit(false), setEditTarget(null), setDeleteConfirm(false), resetForm())
                }
                className="rounded-xl border px-4 py-2 text-sm hover:opacity-90 disabled:opacity-50 cursor-pointer"
                style={{ borderColor: "rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.03)" }}
              >
                Cancelar
              </button>

              <button
                disabled={editSaving || deleteLoading}
                onClick={() => void saveEdit()}
                className="rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50 cursor-pointer"
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


