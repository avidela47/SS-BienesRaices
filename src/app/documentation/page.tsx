"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useToast } from "@/components/ToastProvider";

type PersonType = "OWNER" | "TENANT" | "GUARANTOR";
type EntityType = PersonType | "AGENCY";

type PersonDTO = {
  _id: string;
  code?: string;
  type: string;
  fullName: string;
};

type PeopleListResponse =
  | { ok: true; people: PersonDTO[] }
  | { ok: false; error?: string; message?: string };

type DocumentDTO = {
  _id: string;
  entityType: EntityType;
  personId?: string;
  originalName: string;
  storedName: string;
  mimeType: string;
  size: number;
  url: string;
  notes?: string;
  createdAt: string;
};

type DocsListResponse =
  | { ok: true; documents: DocumentDTO[] }
  | { ok: false; error?: string; message?: string };

type UploadResponse =
  | { ok: true; document: DocumentDTO }
  | { ok: false; error?: string; message?: string };

type DeleteResponse =
  | { ok: true }
  | { ok: false; error?: string; message?: string };

function getErrorMessage(r: { ok: boolean; error?: string; message?: string } | undefined, fallback: string) {
  if (!r) return fallback;
  if (r.ok) return "";
  if (typeof r.message === "string" && r.message.trim()) return r.message;
  if (typeof r.error === "string" && r.error.trim()) return r.error;
  return fallback;
}

function bytesToHuman(n: number) {
  if (!Number.isFinite(n) || n <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function typeLabel(t: EntityType) {
  if (t === "OWNER") return "Propietarios";
  if (t === "TENANT") return "Inquilinos";
  if (t === "GUARANTOR") return "Garantes";
  return "Inmobiliaria";
}

export default function DocumentationPage() {
  const { show } = useToast();

  const [entityType, setEntityType] = useState<EntityType>("OWNER");
  const [peopleLoading, setPeopleLoading] = useState(false);
  const [people, setPeople] = useState<PersonDTO[]>([]);
  const [personId, setPersonId] = useState("");

  const [docsLoading, setDocsLoading] = useState(false);
  const [docs, setDocs] = useState<DocumentDTO[]>([]);
  const [notes, setNotes] = useState("");

  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const [deletingId, setDeletingId] = useState<string>("");

  const isAgency = entityType === "AGENCY";

  const peopleForSelect = useMemo(() => {
    if (isAgency) return [];
    const want = entityType;
    return people.filter((p) => String(p.type).toUpperCase() === want);
  }, [people, entityType, isAgency]);

  async function loadPeople() {
    // Traemos todo /api/people y filtramos en front para no tocar backend ahora
    // (si ya tenés /api/people?type=..., después lo optimizamos)
    if (isAgency) {
      setPeople([]);
      return;
    }

    try {
      setPeopleLoading(true);
      const res = await fetch("/api/people", { cache: "no-store" });
      const data = (await res.json()) as PeopleListResponse;

      if (!res.ok || !data.ok) {
        setPeople([]);
        show(getErrorMessage(data, "No se pudieron cargar personas"));
        return;
      }

      setPeople(Array.isArray(data.people) ? data.people : []);
    } catch {
      setPeople([]);
      show("Error de red cargando personas");
    } finally {
      setPeopleLoading(false);
    }
  }

  async function loadDocs(nextEntityType: EntityType, nextPersonId: string) {
    try {
      setDocsLoading(true);
      setDocs([]);

      const params = new URLSearchParams();
      params.set("entityType", nextEntityType);

      if (nextEntityType !== "AGENCY") {
        if (!nextPersonId) {
          setDocs([]);
          return;
        }
        params.set("personId", nextPersonId);
      }

      const res = await fetch(`/api/documents?${params.toString()}`, { cache: "no-store" });
      const data = (await res.json()) as DocsListResponse;

      if (!res.ok || !data.ok) {
        setDocs([]);
        show(getErrorMessage(data, "No se pudieron cargar documentos"));
        return;
      }

      setDocs(Array.isArray(data.documents) ? data.documents : []);
    } catch {
      setDocs([]);
      show("Error de red cargando documentos");
    } finally {
      setDocsLoading(false);
    }
  }

  useEffect(() => {
    void loadPeople();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Al cambiar tipo, reseteamos selección de persona
    setPersonId("");
    setFile(null);
    setNotes("");
    setDocs([]);
    if (entityType === "AGENCY") {
      void loadDocs("AGENCY", "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityType]);

  useEffect(() => {
    if (entityType === "AGENCY") return;
    void loadDocs(entityType, personId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personId]);

  async function upload() {
    if (!file) return show("Seleccioná un archivo");
    if (!isAgency && !personId) return show("Seleccioná una persona");

    try {
      setUploading(true);

      const form = new FormData();
      form.append("entityType", entityType);
      if (!isAgency) form.append("personId", personId);
      if (notes.trim()) form.append("notes", notes.trim());
      form.append("file", file);

      const res = await fetch("/api/documents", { method: "POST", body: form });
      const data = (await res.json()) as UploadResponse;

      if (!res.ok || !data.ok) {
        show(getErrorMessage(data, "No se pudo subir el documento"));
        return;
      }

      show("Documento subido");
      setFile(null);
      setNotes("");

      // Recargar listado
      if (entityType === "AGENCY") {
        await loadDocs("AGENCY", "");
      } else {
        await loadDocs(entityType, personId);
      }
    } catch {
      show("Error de red subiendo documento");
    } finally {
      setUploading(false);
    }
  }

  async function removeDoc(docId: string) {
    try {
      setDeletingId(docId);

      const res = await fetch(`/api/documents/${docId}`, { method: "DELETE" });
      const data = (await res.json()) as DeleteResponse;

      if (!res.ok || !data.ok) {
        show(getErrorMessage(data, "No se pudo eliminar"));
        return;
      }

      show("Documento eliminado");
      setDocs((prev) => prev.filter((d) => d._id !== docId));
    } catch {
      show("Error de red eliminando documento");
    } finally {
      setDeletingId("");
    }
  }

  return (
    <main className="min-h-screen px-5 py-8 text-white" style={{ background: "var(--background)" }}>
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold">Documentación</h1>
            <p className="text-sm opacity-70">Escaneo / subida y organización de documentos</p>
          </div>

          <div className="flex items-center gap-2">
            {/* Volver (círculo flecha) */}
            <Link
              href="/"
              title="Volver"
              className="w-10 h-10 flex items-center justify-center rounded-full border border-white/15 bg-white/5 hover:bg-white/10 transition cursor-pointer"
            >
              ←
            </Link>

            {/* Subir (círculo + verde) */}
            <button
              type="button"
              title="Subir documento"
              onClick={() => void upload()}
              disabled={uploading}
              className="w-10 h-10 flex items-center justify-center rounded-full font-bold transition cursor-pointer disabled:opacity-50 hover:brightness-110"
              style={{ background: "var(--benetton-green)", color: "#05110A" }}
            >
              +
            </button>
          </div>
        </div>

        {/* Selector de carpeta */}
        <div className="mt-5 rounded-2xl border p-4" style={{ borderColor: "rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.02)" }}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-xs opacity-70">Carpeta</label>
              <select
                value={entityType}
                onChange={(e) => setEntityType(e.target.value as EntityType)}
                className="mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none"
                style={{ borderColor: "rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.25)" }}
              >
                <option value="OWNER">Propietarios</option>
                <option value="TENANT">Inquilinos</option>
                <option value="GUARANTOR">Garantes</option>
                <option value="AGENCY">Inmobiliaria</option>
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="text-xs opacity-70">{isAgency ? "Destino" : "Persona"}</label>

              {isAgency ? (
                <div
                  className="mt-1 w-full rounded-xl border px-3 py-2 text-sm opacity-80"
                  style={{ borderColor: "rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.25)" }}
                >
                  Inmobiliaria (carpeta general)
                </div>
              ) : (
                <select
                  value={personId}
                  onChange={(e) => setPersonId(e.target.value)}
                  disabled={peopleLoading}
                  className="mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none"
                  style={{ borderColor: "rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.25)" }}
                >
                  <option value="">
                    {peopleLoading ? "Cargando..." : `Seleccionar ${typeLabel(entityType).toLowerCase().slice(0, -1)}`}
                  </option>
                  {peopleForSelect.map((p) => (
                    <option key={p._id} value={p._id}>
                      {(p.code ? `${p.code} — ` : "") + p.fullName}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* Subida */}
          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2">
              <label className="text-xs opacity-70">Archivo</label>
              <input
                type="file"
                onChange={(e) => setFile(e.target.files && e.target.files[0] ? e.target.files[0] : null)}
                className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
                style={{ borderColor: "rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.25)" }}
              />
              <div className="mt-1 text-xs opacity-60">
                {file ? `Seleccionado: ${file.name} (${bytesToHuman(file.size)})` : "Seleccioná un archivo para subir"}
              </div>
            </div>

            <div>
              <label className="text-xs opacity-70">Notas (opcional)</label>
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none"
                style={{ borderColor: "rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.25)" }}
                placeholder="Ej: DNI frente, contrato firmado..."
              />
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between gap-2">
            <div className="text-xs opacity-60">
              Carpeta activa: <span className="opacity-90">{typeLabel(entityType)}</span>
              {!isAgency && (
                <>
                  {" "}
                  • Persona: <span className="opacity-90">{personId ? "Seleccionada" : "—"}</span>
                </>
              )}
            </div>

            <button
              type="button"
              onClick={() => void upload()}
              disabled={uploading || !file || (!isAgency && !personId)}
              className="rounded-xl px-4 py-2 text-sm font-semibold transition cursor-pointer disabled:opacity-50 hover:brightness-110"
              style={{ background: "var(--benetton-green)", color: "#05110A" }}
            >
              {uploading ? "Subiendo…" : "Subir"}
            </button>
          </div>
        </div>

        {/* Listado */}
        <div className="mt-5 rounded-2xl border overflow-hidden" style={{ borderColor: "rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.02)" }}>
          <div className="px-4 py-3 border-b text-sm font-semibold" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
            Documentos {docsLoading ? "(cargando…)" : `(${docs.length})`}
          </div>

          <div className="p-4">
            {!isAgency && !personId ? (
              <div className="text-sm opacity-70">Seleccioná una persona para ver sus documentos.</div>
            ) : docsLoading ? (
              <div className="text-sm opacity-70">Cargando…</div>
            ) : docs.length === 0 ? (
              <div className="text-sm opacity-70">Todavía no hay documentos en esta carpeta.</div>
            ) : (
              <div className="rounded-xl border overflow-hidden" style={{ borderColor: "rgba(255,255,255,0.10)" }}>
                <div className="grid grid-cols-12 gap-0 px-4 py-3 text-xs uppercase tracking-wide opacity-70" style={{ background: "rgba(255,255,255,0.03)" }}>
                  <div className="col-span-6">Archivo</div>
                  <div className="col-span-2">Tipo</div>
                  <div className="col-span-2">Tamaño</div>
                  <div className="col-span-1">Notas</div>
                  <div className="col-span-1 text-right">Acc.</div>
                </div>

                <div style={{ background: "rgba(0,0,0,0.15)" }}>
                  {docs.map((d) => (
                    <div
                      key={d._id}
                      className="grid grid-cols-12 px-4 py-3 text-sm border-t items-start"
                      style={{ borderColor: "rgba(255,255,255,0.06)" }}
                    >
                      <div className="col-span-6">
                        <a
                          href={d.url}
                          target="_blank"
                          rel="noreferrer"
                          className="font-semibold hover:underline"
                        >
                          {d.originalName}
                        </a>
                        <div className="text-xs opacity-60 mt-0.5">{new Date(d.createdAt).toLocaleString()}</div>
                      </div>

                      <div className="col-span-2 opacity-80 truncate" title={d.mimeType}>
                        {d.mimeType || "—"}
                      </div>

                      <div className="col-span-2 opacity-80">{bytesToHuman(d.size)}</div>

                      <div className="col-span-1 opacity-80 truncate" title={d.notes || ""}>
                        {d.notes ? d.notes : "—"}
                      </div>

                      <div className="col-span-1 text-right">
                        <button
                          type="button"
                          onClick={() => void removeDoc(d._id)}
                          disabled={deletingId === d._id}
                          className="rounded-lg border border-white/10 px-2 py-1 text-xs hover:opacity-90 transition cursor-pointer disabled:opacity-50"
                          style={{ background: "rgba(255,255,255,0.03)" }}
                        >
                          {deletingId === d._id ? "…" : "Eliminar"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Nota: carpeta uploads */}
        <div className="mt-3 text-xs opacity-50">
          Los archivos se guardan en <span className="opacity-80">/public/uploads</span> (luego si querés lo pasamos a S3/Drive).
        </div>
      </div>
    </main>
  );
}
