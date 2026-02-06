"use client";

import { useEffect, useMemo, useState } from "react";
import BackButton from "@/app/components/BackButton";
import type { CashMovementDTO } from "@/lib/types";

type Summary = {
  total: number;
  byStatus: Record<string, number>;
  byType: Record<string, number>;
};

type ContractLite = {
  _id: unknown;
  code?: string;
  status?: string;
  propertyId?: unknown;
  ownerId?: unknown;
  tenantPersonId?: unknown;
};

type ContractsListResponse =
  | { ok: true; contracts: ContractLite[] }
  | { ok: false; error?: string; message?: string };

type ContractPick = {
  _id: string;
  label: string;
};

const DEFAULT_SUMMARY: Summary = { total: 0, byStatus: {}, byType: {} };

function formatCurrency(value: number, currency = "ARS") {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" });
}

const TYPE_LABELS: Record<string, string> = {
  INCOME: "Ingreso",
  EXPENSE: "Egreso",
  COMMISSION: "Comisión",
  RETENTION: "Retención",
  ADJUSTMENT: "Ajuste",
};

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Pendiente",
  COLLECTED: "Cobrado",
  RETAINED: "Retenido",
  READY_TO_TRANSFER: "Listo para transferir",
  TRANSFERRED: "Transferido",
  VOID: "Anulado",
};

const PARTY_LABELS: Record<string, string> = {
  AGENCY: "Inmobiliaria",
  OWNER: "Propietario",
  TENANT: "Inquilino",
  GUARANTOR: "Garante",
  OTHER: "Otro",
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function safeStr(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function parseJsonRecord(text: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(text);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function normalizeMongoId(v: unknown): string {
  if (typeof v === "string") return v;
  if (isRecord(v)) {
    const oid = v["$oid"];
    if (typeof oid === "string") return oid;
    const oid2 = v["oid"];
    if (typeof oid2 === "string") return oid2;
    const id = v["_id"];
    if (typeof id === "string") return id;
    if (isRecord(id) && typeof id["$oid"] === "string") return id["$oid"] as string;
  }
  return "";
}

function isValidObjectId(id: string): boolean {
  return /^[a-fA-F0-9]{24}$/.test(id);
}

function buildContractLabel(c: ContractLite): string {
  const code = safeStr(c.code);

  const propObj = isRecord(c.propertyId) ? c.propertyId : null;
  const propCode = propObj ? safeStr(propObj["code"]) : "";
  const addressLine = propObj ? safeStr(propObj["addressLine"]) : "";
  const unit = propObj ? safeStr(propObj["unit"]) : "";

  const prop =
    propCode || addressLine
      ? `${propCode}${propCode && addressLine ? " - " : ""}${addressLine}${unit ? ` ${unit}` : ""}`
      : "";

  const tenantObj = isRecord(c.tenantPersonId) ? c.tenantPersonId : null;
  const tenant = tenantObj ? safeStr(tenantObj["fullName"]) : "";

  const parts = [code, prop, tenant].filter(Boolean);
  return parts.join(" — ") || code || "Contrato";
}

export default function CashPage() {
  const [movements, setMovements] = useState<CashMovementDTO[]>([]);
  const [summary, setSummary] = useState<Summary>(DEFAULT_SUMMARY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const [pickedContract, setPickedContract] = useState<ContractPick | null>(null);
  const [contractsCache, setContractsCache] = useState<ContractPick[]>([]);
  const [contractsLoading, setContractsLoading] = useState(false);
  const [contractsErr, setContractsErr] = useState("");

  const [manualType, setManualType] = useState("INCOME");
  const [manualStatus, setManualStatus] = useState("COLLECTED");
  const [manualAmount, setManualAmount] = useState("");
  const [manualSubtype, setManualSubtype] = useState("");
  const [manualPartyType, setManualPartyType] = useState("AGENCY");
  const [manualNotes, setManualNotes] = useState("");

  const [manualFiles, setManualFiles] = useState<File[]>([]);
  const [manualSubmitting, setManualSubmitting] = useState(false);
  const [manualMessage, setManualMessage] = useState("");

  const [transferingId, setTransferingId] = useState("");
  const [viewMode, setViewMode] = useState<"summary" | "detail">("summary");

  const filteredQuery = useMemo(() => {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    return params.toString();
  }, [from, to]);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/cash-movements${filteredQuery ? `?${filteredQuery}` : ""}`, { cache: "no-store" });
      const data = (await res.json()) as { ok?: boolean; movements?: CashMovementDTO[]; summary?: Summary; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error || "No se pudo cargar la caja");
      setMovements(data.movements || []);
      setSummary(data.summary || DEFAULT_SUMMARY);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredQuery]);

  const groupedRows = useMemo(() => {
    const groups = new Map<string, CashMovementDTO[]>();
    for (const movement of movements) {
      const key = movement.paymentId || movement._id;
      const current = groups.get(key) || [];
      current.push(movement);
      groups.set(key, current);
    }

    return Array.from(groups.entries()).map(([key, items]) => {
      const sorted = [...items].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      const income = items.filter((m) => m.type === "INCOME").reduce((acc, m) => acc + m.amount, 0);
      const commission = items.filter((m) => m.type === "COMMISSION").reduce((acc, m) => acc + m.amount, 0);
      const expense = items.filter((m) => m.type === "EXPENSE").reduce((acc, m) => acc + m.amount, 0);
      const ownerNetMovement = items.find((m) => m.type === "EXPENSE" && m.subtype === "OWNER_NET");

      return {
        key,
        date: sorted[0]?.date || "",
        contractLabel: sorted[0]?.contractLabel || sorted[0]?.contractId || "",
        propertyLabel: sorted[0]?.propertyLabel || sorted[0]?.propertyId || "",
        income,
        commission,
        expense,
        status: ownerNetMovement?.status || sorted[0]?.status || "",
        transferId: ownerNetMovement?._id as string | undefined,
      };
    });
  }, [movements]);

  async function loadContracts(force = false) {
    if (!force && contractsCache.length > 0) return;

    setContractsLoading(true);
    setContractsErr("");
    try {
      const res = await fetch("/api/contracts", { cache: "no-store" });
      const data = (await res.json()) as ContractsListResponse;

      if (!res.ok || !data.ok) {
        const msg = !data.ok ? data.error || data.message || "No se pudo cargar contratos" : "No se pudo cargar contratos";
        throw new Error(msg);
      }

      const picks: ContractPick[] = (data.contracts || [])
        .map((c) => {
          const id = normalizeMongoId(c._id);
          return { _id: id, label: buildContractLabel(c) };
        })
        .filter((c) => isValidObjectId(c._id));

      setContractsCache(picks);

      if (picks.length === 0) {
        setPickedContract(null);
        setContractsErr("No llegaron contratos con _id válido (ObjectId). Revisar /api/contracts.");
      }
    } catch (e) {
      setPickedContract(null);
      setContractsErr(e instanceof Error ? e.message : "Error cargando contratos");
    } finally {
      setContractsLoading(false);
    }
  }

  useEffect(() => {
    void loadContracts(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function uploadContractFile(contractId: string, file: File, movementId?: string) {
    if (!isValidObjectId(contractId)) throw new Error(`contractId inválido: "${contractId}"`);

    const form = new FormData();
    form.append("file", file);
    if (movementId) form.append("movementId", movementId);
    form.append("uploadedBy", "cash");

    const res = await fetch(`/api/contracts/${contractId}/files`, { method: "POST", body: form });

    const text = await res.text();
    const json = parseJsonRecord(text);

    const ok = json?.["ok"] === true;
    if (!res.ok || !ok) {
      const msg =
        (typeof json?.["error"] === "string" ? (json["error"] as string) : "") ||
        text ||
        "No se pudo adjuntar comprobante";
      throw new Error(msg);
    }
  }

  async function submitManualMovement() {
    setManualSubmitting(true);
    setManualMessage("");

    try {
      const amount = Number(manualAmount);
      const contractId = pickedContract?._id || "";

      if (!contractId) throw new Error("Elegí un contrato");
      if (!isValidObjectId(contractId)) throw new Error(`Contrato inválido (no es ObjectId): "${contractId}"`);
      if (!Number.isFinite(amount) || amount <= 0) throw new Error("Ingresá un monto válido");

      const res = await fetch("/api/cash-movements/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contractId,
          type: manualType,
          status: manualStatus,
          amount,
          subtype: manualSubtype.trim(),
          partyType: manualPartyType,
          notes: manualNotes.trim(),
        }),
      });

      const dataText = await res.text();
      const data = parseJsonRecord(dataText);

      const ok = data?.["ok"] === true;
      if (!res.ok || !ok) {
        const msg = (typeof data?.["error"] === "string" ? (data["error"] as string) : "") || dataText || "No se pudo crear el movimiento";
        throw new Error(msg);
      }

      const movementId =
        typeof data?.["movementId"] === "string"
          ? (data["movementId"] as string)
          : isRecord(data?.["movement"]) && typeof (data["movement"] as Record<string, unknown>)["_id"] === "string"
            ? ((data["movement"] as Record<string, unknown>)["_id"] as string)
            : undefined;

      if (manualFiles.length > 0) {
        for (const f of manualFiles) {
          await uploadContractFile(contractId, f, movementId);
        }
      }

      setManualMessage("Movimiento creado");
      setManualAmount("");
      setManualSubtype("");
      setManualNotes("");
      setManualFiles([]);

      await load();
    } catch (err) {
      setManualMessage(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setManualSubmitting(false);
    }
  }

  async function transferMovement(id: string) {
    setTransferingId(id);
    try {
      const res = await fetch(`/api/cash-movements/${id}/transfer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transferredBy: "system" }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error || "No se pudo transferir");
      await load();
    } catch (err) {
      setManualMessage(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setTransferingId("");
    }
  }

  return (
    <main className="min-h-screen px-5 py-10 text-white" style={{ background: "var(--background)" }}>
      <div className="mx-auto max-w-6xl">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Caja</h1>
            <p className="text-sm mt-1" style={{ color: "var(--benetton-muted)" }}>
              Resumen de caja conectado a movimientos reales.
            </p>
          </div>
          <BackButton />
        </div>

        <div className="mt-6 grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="rounded-2xl border p-4" style={{ borderColor: "var(--benetton-border)", background: "var(--benetton-card)" }}>
            <div className="text-xs uppercase tracking-wide text-white/60">Total caja</div>
            <div className="text-2xl font-semibold mt-2">{formatCurrency(summary.total)}</div>
          </div>

          {[
            { label: "Cobrado", key: "COLLECTED" },
            { label: "Pendiente", key: "PENDING" },
            { label: "Listo a transferir", key: "READY_TO_TRANSFER" },
          ].map((item) => (
            <div
              key={item.key}
              className="rounded-2xl border p-4"
              style={{ borderColor: "var(--benetton-border)", background: "var(--benetton-card)" }}
            >
              <div className="text-xs uppercase tracking-wide text-white/60">{item.label}</div>
              <div className="text-xl font-semibold mt-2">{formatCurrency(summary.byStatus[item.key] || 0)}</div>
            </div>
          ))}
        </div>

        <div className="mt-6 rounded-2xl border p-6" style={{ borderColor: "var(--benetton-border)", background: "var(--benetton-card)" }}>
          {/* MOVIMIENTO MANUAL */}
          <div className="mb-6 rounded-xl border border-white/10 p-4 bg-white/5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">Movimiento manual</h2>
                <p className="text-xs text-white/60 mt-1">Registrá gastos o ingresos no automáticos.</p>
              </div>

              <button
                type="button"
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs hover:bg-white/10 transition disabled:opacity-60"
                onClick={() => {
                  setPickedContract(null);
                  setManualFiles([]);
                  void loadContracts(true);
                }}
                disabled={contractsLoading}
                title="Recargar contratos"
              >
                {contractsLoading ? "Recargando..." : "Recargar"}
              </button>
            </div>

            <div className="mt-3">
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs text-white/60 mb-1">Contrato</div>
                {contractsErr ? <div className="text-xs text-red-300">{contractsErr}</div> : null}
              </div>

              <select
                value={pickedContract?._id || ""}
                onChange={(e) => {
                  const id = e.target.value;
                  const found = contractsCache.find((c) => c._id === id) || null;
                  setPickedContract(found);
                }}
                className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none"
              >
                <option value="" disabled>
                  {contractsLoading ? "Cargando contratos..." : "Seleccionar contrato..."}
                </option>
                {contractsCache.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.label}
                  </option>
                ))}
              </select>

              <div className="mt-2 text-[11px] text-white/50">{pickedContract ? `ID: ${pickedContract._id}` : "—"}</div>
            </div>

            <div className="mt-3 grid grid-cols-1 md:grid-cols-7 gap-3">
              <div className="md:col-span-1">
                <label className="text-xs text-white/60">Tipo</label>
                <select
                  value={manualType}
                  onChange={(e) => setManualType(e.target.value)}
                  className="mt-1 w-full rounded-xl bg-black/40 border border-white/10 px-2 py-2 text-xs text-white outline-none"
                >
                  {"INCOME,EXPENSE,COMMISSION,RETENTION,ADJUSTMENT".split(",").map((t) => (
                    <option key={t} value={t}>
                      {TYPE_LABELS[t] || t}
                    </option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-1">
                <label className="text-xs text-white/60">Estado</label>
                <select
                  value={manualStatus}
                  onChange={(e) => setManualStatus(e.target.value)}
                  className="mt-1 w-full rounded-xl bg-black/40 border border-white/10 px-2 py-2 text-xs text-white outline-none"
                >
                  {"PENDING,COLLECTED,RETAINED,READY_TO_TRANSFER,TRANSFERRED".split(",").map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABELS[s] || s}
                    </option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-1">
                <label className="text-xs text-white/60">Monto</label>
                <input
                  value={manualAmount}
                  onChange={(e) => setManualAmount(e.target.value)}
                  type="number"
                  min="0"
                  className="mt-1 w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-xs text-white outline-none"
                  placeholder="0"
                />
              </div>

              <div className="md:col-span-2">
                <label className="text-xs text-white/60">Subtipo</label>
                <input
                  value={manualSubtype}
                  onChange={(e) => setManualSubtype(e.target.value)}
                  className="mt-1 w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-xs text-white outline-none"
                  placeholder="LUZ / GAS / EXPENSA"
                />
              </div>

              <div className="md:col-span-1">
                <label className="text-xs text-white/60">Imputar a</label>
                <select
                  value={manualPartyType}
                  onChange={(e) => setManualPartyType(e.target.value)}
                  className="mt-1 w-full rounded-xl bg-black/40 border border-white/10 px-2 py-2 text-xs text-white outline-none"
                >
                  {"AGENCY,OWNER,TENANT,GUARANTOR,OTHER".split(",").map((p) => (
                    <option key={p} value={p}>
                      {PARTY_LABELS[p] || p}
                    </option>
                  ))}
                </select>
              </div>

              {/* ✅ Comprobantes con cursor SI O SI (label-botón) */}
              <div className="md:col-span-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs text-white/60 cursor-pointer select-none">Comprobantes (PDF/JPG/PNG)</label>
                  {manualFiles.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => setManualFiles([])}
                      className="text-[11px] text-white/60 hover:text-white cursor-pointer underline"
                    >
                      limpiar
                    </button>
                  ) : null}
                </div>

                <label className="mt-1 flex items-center justify-center rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs hover:bg-white/10 transition cursor-pointer">
                  Elegir archivos
                  <input
                    type="file"
                    multiple
                    accept="application/pdf,image/png,image/jpeg"
                    onChange={(e) => setManualFiles(Array.from(e.target.files || []))}
                    className="hidden"
                  />
                </label>

                <div className="mt-1 text-[11px] text-white/50">
                  {manualFiles.length > 0 ? `${manualFiles.length} archivo(s) seleccionado(s)` : "—"}
                </div>
              </div>

              {manualFiles.length > 0 ? (
                <div className="md:col-span-7 rounded-xl border border-white/10 bg-black/30 p-3">
                  <div className="text-xs text-white/60 mb-2">Archivos:</div>
                  <ul className="space-y-1">
                    {manualFiles.map((f) => (
                      <li key={`${f.name}-${f.size}-${f.lastModified}`} className="text-xs text-white/80 truncate">
                        • {f.name}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="md:col-span-7">
                <label className="text-xs text-white/60">Notas</label>
                <input
                  value={manualNotes}
                  onChange={(e) => setManualNotes(e.target.value)}
                  className="mt-1 w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-xs text-white outline-none"
                  placeholder="Detalle del gasto o ingreso"
                />
              </div>
            </div>

            <div className="mt-3 flex items-center gap-3">
              <button
                type="button"
                onClick={() => void submitManualMovement()}
                disabled={manualSubmitting}
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs hover:bg-white/10 transition disabled:opacity-60"
              >
                {manualSubmitting ? "Guardando..." : "Guardar movimiento"}
              </button>

              {manualMessage ? (
                <span className={manualMessage === "Movimiento creado" ? "text-emerald-300 text-xs" : "text-red-300 text-xs"}>
                  {manualMessage}
                </span>
              ) : null}
            </div>
          </div>

          {/* LISTADO MOVIMIENTOS */}
          <div className="flex flex-wrap items-end gap-3 justify-between">
            <div>
              <h2 className="text-lg font-semibold">Movimientos</h2>
              <p className="text-xs text-white/60">Filtrá por rango de fechas.</p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setViewMode("summary")}
                className={`rounded-xl border px-3 py-2 text-xs transition ${
                  viewMode === "summary" ? "border-emerald-400/40 bg-emerald-400/10" : "border-white/10 bg-white/5 hover:bg-white/10"
                }`}
              >
                Resumen
              </button>
              <button
                type="button"
                onClick={() => setViewMode("detail")}
                className={`rounded-xl border px-3 py-2 text-xs transition ${
                  viewMode === "detail" ? "border-emerald-400/40 bg-emerald-400/10" : "border-white/10 bg-white/5 hover:bg-white/10"
                }`}
              >
                Detalle
              </button>
            </div>

            <div className="flex flex-wrap gap-2 items-end">
              <div>
                <label className="text-xs text-white/60">Desde</label>
                <input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className="block mt-1 rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-xs text-white outline-none"
                />
              </div>
              <div>
                <label className="text-xs text-white/60">Hasta</label>
                <input
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className="block mt-1 rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-xs text-white outline-none"
                />
              </div>
              <button
                type="button"
                onClick={() => void load()}
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs hover:bg-white/10 transition"
                disabled={loading}
              >
                {loading ? "Actualizando..." : "Actualizar"}
              </button>
            </div>
          </div>

          {error ? (
            <div className="mt-4 text-red-400 text-sm">{error}</div>
          ) : loading ? (
            <div className="mt-4 text-sm text-white/60">Cargando movimientos…</div>
          ) : movements.length === 0 ? (
            <div className="mt-4 text-sm text-white/60">No hay movimientos en este período.</div>
          ) : viewMode === "summary" ? (
            <div className="mt-4 overflow-hidden rounded-xl border border-white/10">
              <div className="grid grid-cols-12 gap-0 px-4 py-3 text-xs uppercase tracking-wide text-neutral-300 bg-white/5">
                <div className="col-span-2">Fecha</div>
                <div className="col-span-2">Contrato</div>
                <div className="col-span-2">Propiedad</div>
                <div className="col-span-2">Ingreso</div>
                <div className="col-span-2">Comisión</div>
                <div className="col-span-1">Egreso/Neto</div>
                <div className="col-span-1 text-right">Acc.</div>
              </div>

              {groupedRows.map((row) => {
                const canTransfer = row.status === "READY_TO_TRANSFER" && typeof row.transferId === "string" && row.transferId.length > 0;
                const transferId = canTransfer ? row.transferId : null;

                return (
                  <div key={row.key} className="grid grid-cols-12 px-4 py-3 text-sm border-t border-white/10">
                    <div className="col-span-2 text-white/80">{row.date ? formatDate(row.date) : "—"}</div>
                    <div className="col-span-2 text-white/70 truncate" title={row.contractLabel}>
                      {row.contractLabel || "—"}
                    </div>
                    <div className="col-span-2 text-white/70 truncate" title={row.propertyLabel}>
                      {row.propertyLabel || "—"}
                    </div>
                    <div className="col-span-2 font-semibold">{row.income ? formatCurrency(row.income) : "—"}</div>
                    <div className="col-span-2 text-white/80">{row.commission ? formatCurrency(row.commission) : "—"}</div>
                    <div className="col-span-1 text-white/80">{row.expense ? formatCurrency(row.expense) : "—"}</div>
                    <div className="col-span-1 flex justify-end">
                      {transferId ? (
                        <button
                          type="button"
                          onClick={() => void transferMovement(transferId)}
                          disabled={transferingId === transferId}
                          className="rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-2 py-1 text-xs hover:bg-emerald-400/20 disabled:opacity-60"
                        >
                          {transferingId === transferId ? "..." : "Transferir"}
                        </button>
                      ) : (
                        <span className="text-xs text-white/40">—</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="mt-4 overflow-hidden rounded-xl border border-white/10">
              <div className="grid grid-cols-15 gap-0 px-4 py-3 text-xs uppercase tracking-wide text-neutral-300 bg-white/5">
                <div className="col-span-2">Fecha</div>
                <div className="col-span-2">Tipo</div>
                <div className="col-span-2">Estado</div>
                <div className="col-span-2">Monto</div>
                <div className="col-span-2">Imputado</div>
                <div className="col-span-2">Contrato</div>
                <div className="col-span-2">Propiedad</div>
                <div className="col-span-1 text-right">Acc.</div>
              </div>

              {movements.map((movement) => (
                <div key={movement._id} className="grid grid-cols-15 px-4 py-3 text-sm border-t border-white/10">
                  <div className="col-span-2 text-white/80">{formatDate(movement.date)}</div>
                  <div className="col-span-2 text-white/90 font-semibold">{TYPE_LABELS[movement.type] || movement.type}</div>
                  <div className="col-span-2 text-white/70">{STATUS_LABELS[movement.status] || movement.status}</div>
                  <div className="col-span-2 font-semibold">{formatCurrency(movement.amount, movement.currency || "ARS")}</div>
                  <div className="col-span-2 text-white/60">
                    {movement.partyType ? PARTY_LABELS[movement.partyType] || movement.partyType : "—"}
                  </div>
                  <div className="col-span-2 text-white/60 truncate" title={movement.contractLabel || movement.contractId}>
                    {movement.contractLabel || movement.contractId}
                  </div>
                  <div className="col-span-2 text-white/60 truncate" title={movement.propertyLabel || movement.propertyId}>
                    {movement.propertyLabel || movement.propertyId}
                  </div>
                  <div className="col-span-1 flex justify-end">
                    {movement.status === "READY_TO_TRANSFER" ? (
                      <button
                        type="button"
                        onClick={() => void transferMovement(movement._id)}
                        disabled={transferingId === movement._id}
                        className="rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-2 py-1 text-xs hover:bg-emerald-400/20 disabled:opacity-60"
                      >
                        {transferingId === movement._id ? "..." : "Transferir"}
                      </button>
                    ) : (
                      <span className="text-xs text-white/40">—</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

