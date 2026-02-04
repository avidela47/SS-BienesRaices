"use client";

import { useEffect, useMemo, useState } from "react";
import BackButton from "@/app/components/BackButton";
import { useToast } from "@/components/ToastProvider";

type PersonType = "OWNER" | "TENANT" | "GUARANTOR";
type EntityType = PersonType | "PROPERTY" | "CONTRACT" | "PAYMENT" | "INSTALLMENT" | "AGENCY";

type PersonDTO = {
  _id: string;
  code?: string;
  type: string;
  fullName: string;
  tenantPersonId?: string | null;
};

type PropertyDTO = {
  _id: string;
  code?: string;
  addressLine: string;
  unit?: string;
};

type ContractDTO = {
  _id: string;
  code?: string;
};

type PaymentDTO = {
  _id: string;
  date: string;
  amount: number;
};

type InstallmentDTO = {
  _id: string;
  period: string;
  amount: number;
};

type PeopleListResponse =
  | { ok: true; people: PersonDTO[] }
  | { ok: false; error?: string; message?: string };

type DocumentDTO = {
  _id: string;
  entityType: EntityType;
  entityId?: string;
  personId?: string;
  docType?: string;
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

const DOC_TYPES_BY_ENTITY: Record<EntityType, string[]> = {
  OWNER: ["DNI", "Contrato inmobiliaria", "Contrato alquiler", "Escritura", "Otro"],
  TENANT: ["DNI", "Contrato alquiler", "Otro"],
  GUARANTOR: ["DNI", "Recibo sueldo", "Escritura", "Certificado", "Otro"],
  PROPERTY: ["Escritura", "Plano", "Otro"],
  CONTRACT: ["Contrato alquiler", "Anexo", "Otro"],
  PAYMENT: ["Recibo pago", "Otro"],
  INSTALLMENT: ["Recibo pago", "Otro"],
  AGENCY: ["Otro"],
};

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
  if (t === "PROPERTY") return "Propiedades";
  if (t === "CONTRACT") return "Contratos";
  if (t === "PAYMENT") return "Pagos";
  if (t === "INSTALLMENT") return "Cuotas";
  return "Inmobiliaria";
}

export default function DocumentationPage() {
  const { show } = useToast();

  const [entityType, setEntityType] = useState<EntityType>("OWNER");
  const [peopleLoading, setPeopleLoading] = useState(false);
  const [people, setPeople] = useState<PersonDTO[]>([]);
  const [entityId, setEntityId] = useState("");
  const [docType, setDocType] = useState("");

  const [properties, setProperties] = useState<PropertyDTO[]>([]);
  const [contracts, setContracts] = useState<ContractDTO[]>([]);
  const [payments, setPayments] = useState<PaymentDTO[]>([]);
  const [installments, setInstallments] = useState<InstallmentDTO[]>([]);

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

  const entityOptions = useMemo(() => {
    if (entityType === "OWNER" || entityType === "TENANT" || entityType === "GUARANTOR") {
      return peopleForSelect.map((p) => ({
        value: p._id,
        label: p.code ? `${p.fullName} (${p.code})` : p.fullName,
      }));
    }

    if (entityType === "PROPERTY") {
      return properties.map((p) => ({
        value: p._id,
        label: `${p.code || ""} ${p.addressLine}${p.unit ? ` (${p.unit})` : ""}`.trim(),
      }));
    }

    if (entityType === "CONTRACT") {
      return contracts.map((c) => ({
        value: c._id,
        label: c.code ?? c._id,
      }));
    }

    if (entityType === "PAYMENT") {
      return payments.map((p) => ({
        value: p._id,
        label: `${new Date(p.date).toLocaleDateString("es-AR")} — ${p.amount.toLocaleString("es-AR", {
          style: "currency",
          currency: "ARS",
        })}`,
      }));
    }

    if (entityType === "INSTALLMENT") {
      return installments.map((i) => ({
        value: i._id,
        label: `${i.period} — ${i.amount.toLocaleString("es-AR", { style: "currency", currency: "ARS" })}`,
      }));
    }

    return [];
  }, [entityType, peopleForSelect, properties, contracts, payments, installments]);

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

  async function loadEntities() {
    try {
      const [propsRes, contractsRes, paymentsRes, installmentsRes] = await Promise.all([
        fetch("/api/properties", { cache: "no-store" }),
        fetch("/api/contracts", { cache: "no-store" }),
        fetch("/api/payments", { cache: "no-store" }),
        fetch("/api/installments", { cache: "no-store" }),
      ]);

      const propsData = await propsRes.json();
      const contractsData = await contractsRes.json();
      const paymentsData = await paymentsRes.json();
      const installmentsData = await installmentsRes.json();

      setProperties(Array.isArray(propsData?.properties) ? propsData.properties : []);
      setContracts(Array.isArray(contractsData?.contracts) ? contractsData.contracts : []);
      setPayments(Array.isArray(paymentsData?.payments) ? paymentsData.payments : []);
      setInstallments(Array.isArray(installmentsData?.installments) ? installmentsData.installments : []);
    } catch {
      setProperties([]);
      setContracts([]);
      setPayments([]);
      setInstallments([]);
    }
  }

  async function loadDocs(nextEntityType: EntityType, nextEntityId: string) {
    try {
      setDocsLoading(true);
      setDocs([]);

      const params = new URLSearchParams();
      params.set("entityType", nextEntityType);

      if (nextEntityType !== "AGENCY") {
        if (!nextEntityId) {
          setDocs([]);
          return;
        }
        params.set("entityId", nextEntityId);
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
    void loadEntities();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Al cambiar tipo, reseteamos selección de persona
    setEntityId("");
    setFile(null);
    setNotes("");
    setDocType("");
    setDocs([]);
    if (entityType === "AGENCY") {
      void loadDocs("AGENCY", "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityType]);

  useEffect(() => {
    if (entityType === "AGENCY") return;
    void loadDocs(entityType, entityId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityId]);

  async function upload() {
    if (!file) return show("Seleccioná un archivo");
    if (!isAgency && !entityId) return show("Seleccioná un vínculo");

    try {
      setUploading(true);

      const form = new FormData();
      form.append("entityType", entityType);
  if (!isAgency) form.append("entityId", entityId);
  if (docType) form.append("docType", docType);
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
        await loadDocs(entityType, entityId);
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
      if (entityType === "AGENCY") {
        await loadDocs("AGENCY", "");
      } else {
        await loadDocs(entityType, entityId);
      }
    } catch {
      show("Error de red eliminando documento");
    } finally {
      setDeletingId("");
    }
  }

  function printDoc(url: string) {
    const win = window.open(url, "_blank", "noopener,noreferrer");
    if (!win) return;
    const onLoad = () => {
      try {
        win.focus();
        win.print();
      } catch {
        // noop
      }
    };

    if (win.document.readyState === "complete") {
      onLoad();
    } else {
      win.addEventListener("load", onLoad, { once: true });
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
            <BackButton />
          </div>
        </div>

        {/* Selector de carpeta */}
        <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
          <div className="border-b border-white/10 px-5 py-4">
            <div className="text-sm font-semibold">Subida</div>
          </div>

          <div className="px-5 py-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-white/50">Carpeta</label>
                <select
                  value={entityType}
                  onChange={(e) => setEntityType(e.target.value as EntityType)}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-white/10"
                >
                <option value="OWNER">Propietarios</option>
                <option value="TENANT">Inquilinos</option>
                <option value="GUARANTOR">Garantes</option>
                <option value="PROPERTY">Propiedades</option>
                <option value="CONTRACT">Contratos</option>
                <option value="PAYMENT">Pagos</option>
                <option value="INSTALLMENT">Cuotas</option>
                <option value="AGENCY">Inmobiliaria</option>
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="text-xs text-white/50">{isAgency ? "Destino" : "Vínculo"}</label>

                {isAgency ? (
                  <div className="mt-1 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm opacity-80">
                    Inmobiliaria (carpeta general)
                  </div>
                ) : (
                  <select
                    value={entityId}
                    onChange={(e) => setEntityId(e.target.value)}
                    disabled={peopleLoading && (entityType === "OWNER" || entityType === "TENANT" || entityType === "GUARANTOR")}
                    className="mt-1 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-white/10"
                  >
                  <option value="">
                    {peopleLoading && (entityType === "OWNER" || entityType === "TENANT" || entityType === "GUARANTOR")
                      ? "Cargando..."
                      : `Seleccionar ${typeLabel(entityType).toLowerCase().slice(0, -1)}`}
                  </option>
                  {entityOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                  </select>
                )}
              </div>
            </div>

            {/* Subida */}
            <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="md:col-span-2">
                <label className="text-xs text-white/50">Archivo</label>
                <input
                  type="file"
                  onChange={(e) => setFile(e.target.files && e.target.files[0] ? e.target.files[0] : null)}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm"
                />
                <div className="mt-1 text-xs text-white/50">
                  {file ? `Seleccionado: ${file.name} (${bytesToHuman(file.size)})` : "Seleccioná un archivo para subir"}
                </div>
              </div>

              <div>
                <label className="text-xs text-white/50">Tipo de documento</label>
                <select
                  value={docType}
                  onChange={(e) => setDocType(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-white/10"
                >
                  <option value="">Seleccionar tipo...</option>
                  {DOC_TYPES_BY_ENTITY[entityType].map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-white/50">Notas (opcional)</label>
                <input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-white/10"
                  placeholder="Ej: DNI frente, contrato firmado..."
                />
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between gap-2">
              <div className="text-xs text-white/50">
                Carpeta activa: <span className="text-white/80">{typeLabel(entityType)}</span>
                {!isAgency && (
                  <>
                    {" "}
                    • Vínculo: <span className="text-white/80">{entityId ? "Seleccionado" : "—"}</span>
                  </>
                )}
              </div>

              <button
                type="button"
                onClick={() => void upload()}
                disabled={uploading || !file || (!isAgency && !entityId)}
                className="rounded-xl px-4 py-2 text-sm font-semibold transition cursor-pointer disabled:opacity-50 hover:brightness-110"
                style={{ background: "var(--benetton-green)", color: "#05110A" }}
              >
                {uploading ? "Subiendo…" : "Subir"}
              </button>
            </div>
          </div>
        </div>

        {/* Listado */}
        <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
          <div className="px-5 py-4 border-b border-white/10 text-sm font-semibold">
            Documentos {docsLoading ? "(cargando…)" : `(${docs.length})`}
          </div>

          <div className="p-4">
            {!isAgency && !entityId ? (
              <div className="text-sm opacity-70">Seleccioná un vínculo para ver sus documentos.</div>
            ) : docsLoading ? (
              <div className="text-sm opacity-70">Cargando…</div>
            ) : docs.length === 0 ? (
              <div className="text-sm opacity-70">Todavía no hay documentos en esta carpeta.</div>
            ) : (
              <div className="rounded-xl border border-white/10 overflow-hidden">
                <div className="grid grid-cols-12 gap-0 px-4 py-3 text-xs uppercase tracking-wide text-neutral-300 bg-white/5">
                  <div className="col-span-5">Archivo</div>
                  <div className="col-span-2">Tipo doc</div>
                  <div className="col-span-2">Mime</div>
                  <div className="col-span-2">Tamaño</div>
                  <div className="col-span-1 text-right">Acc.</div>
                </div>

                <div>
                  {docs.map((d) => (
                    <div
                      key={d._id}
                      className="grid grid-cols-12 px-4 py-3 text-sm border-t border-white/10 items-start"
                    >
                      <div className="col-span-5">
                        <a
                          href={d.url}
                          target="_blank"
                          rel="noreferrer"
                          className="font-semibold hover:underline"
                        >
                          {d.originalName}
                        </a>
                        <div className="text-xs opacity-60 mt-0.5">{new Date(d.createdAt).toLocaleString()}</div>
                        {d.notes ? <div className="text-xs opacity-60 mt-0.5">{d.notes}</div> : null}
                      </div>

                      <div className="col-span-2 opacity-80 truncate" title={d.docType || ""}>
                        {d.docType || "—"}
                      </div>

                      <div className="col-span-2 opacity-80 truncate" title={d.mimeType}>
                        {d.mimeType || "—"}
                      </div>

                      <div className="col-span-2 opacity-80">{bytesToHuman(d.size)}</div>

                      <div className="col-span-1 flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => printDoc(d.url)}
                          className="rounded-xl border border-white/10 bg-white/5 px-2 py-1 text-xs hover:bg-white/10 transition"
                        >
                          Imprimir
                        </button>
                        <button
                          type="button"
                          onClick={() => void removeDoc(d._id)}
                          disabled={deletingId === d._id}
                          className="rounded-xl border border-white/10 bg-white/5 px-2 py-1 text-xs hover:bg-white/10 transition disabled:opacity-50"
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

      </div>
    </main>
  );
}
