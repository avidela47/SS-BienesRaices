"use client";
import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";

interface ContractData {
  code: string;
  propertyId: { code: string; addressLine: string; unit?: string } | string;
  ownerId: { fullName: string; code?: string } | string;
  tenantPersonId: { fullName: string; code?: string } | string;
  startDate: string;
  endDate: string;
  valorCuota?: number;
  duracion?: number;
  diaVencimiento?: number;
  status: string;
  billing?: { baseRent?: number; dueDay?: number };
}

interface Installment {
  _id: string;
  periodo: string;
  vencimiento: string;
  monto: number;
  estado: string;
  pagado: boolean;
  pago: string;
}

export default function InstallmentsPage() {
  const params = useParams();
  const contractId = params?.id as string | undefined;
  const router = useRouter();
  const [installments, setInstallments] = useState<Installment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [contract, setContract] = useState<ContractData | null>(null);
  const [loadingContract, setLoadingContract] = useState(true);

  // Cargar datos del contrato
  useEffect(() => {
    async function fetchContract() {
      setLoadingContract(true);
      try {
        const res = await fetch(`/api/contracts/${contractId}`);
        const data = await res.json();
        if (data.ok && data.contract) {
          setContract(data.contract);
        } else {
          setContract(null);
        }
      } catch {
        setContract(null);
      } finally {
        setLoadingContract(false);
      }
    }
    if (contractId) fetchContract();
  }, [contractId]);

  useEffect(() => {
    async function fetchInstallments() {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(`/api/installments?contractId=${contractId}`);
        const data = await res.json();
        if (!data.ok) throw new Error(data.message || "Error al cargar cuotas");
        setInstallments(data.installments || []);
      } catch (e: unknown) {
        if (e instanceof Error) {
          setError(e.message || "Error al cargar cuotas");
        } else {
          setError("Error al cargar cuotas");
        }
      } finally {
        setLoading(false);
      }
    }
    if (contractId) fetchInstallments();
  }, [contractId]);

  return (
    <div className="mx-auto max-w-3xl w-full px-6 py-8">
      <button
        className="mb-6 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm hover:bg-white/10 transition"
        onClick={() => router.back()}
      >
        Volver
      </button>
      <h1 className="text-2xl font-bold mb-4">Cuotas del Contrato</h1>

      {/* Tarjeta de Datos del Contrato */}
      <div className="mb-8">
        {loadingContract ? (
          <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-neutral-400">Cargando datos del contrato...</div>
        ) : contract ? (
          <div className="rounded-xl border border-white/10 bg-white/5 p-4 grid grid-cols-2 gap-4">
            <div className="col-span-2 text-lg font-semibold text-green-300 mb-2">Datos</div>
            <div>
              <div className="text-xs text-neutral-400">Propiedad</div>
              <div className="font-medium text-neutral-100">
                {typeof contract.propertyId === 'object'
                  ? `${contract.propertyId.code} - ${contract.propertyId.addressLine}${contract.propertyId.unit ? ` (${contract.propertyId.unit})` : ''}`
                  : contract.propertyId}
              </div>
            </div>
            <div>
              <div className="text-xs text-neutral-400">Estado</div>
              <div className="font-medium text-neutral-100">{contract.status}</div>
            </div>
            <div>
              <div className="text-xs text-neutral-400">Propietario</div>
              <div className="font-medium text-neutral-100">
                {typeof contract.ownerId === 'object'
                  ? `${contract.ownerId.fullName}${contract.ownerId.code ? ` (${contract.ownerId.code})` : ''}`
                  : contract.ownerId}
              </div>
            </div>
            <div>
              <div className="text-xs text-neutral-400">Inquilino</div>
              <div className="font-medium text-neutral-100">
                {typeof contract.tenantPersonId === 'object'
                  ? `${contract.tenantPersonId.fullName}${contract.tenantPersonId.code ? ` (${contract.tenantPersonId.code})` : ''}`
                  : contract.tenantPersonId}
              </div>
            </div>
            <div>
              <div className="text-xs text-neutral-400">Fecha inicio</div>
              <div className="font-medium text-neutral-100">{contract.startDate?.slice(0, 10) || '-'}</div>
            </div>
            <div>
              <div className="text-xs text-neutral-400">Fecha fin</div>
              <div className="font-medium text-neutral-100">{contract.endDate?.slice(0, 10) || '-'}</div>
            </div>
            <div>
              <div className="text-xs text-neutral-400">Valor cuota</div>
              <div className="font-medium text-neutral-100">
                ${contract.valorCuota ?? contract.billing?.baseRent ?? '-'}
              </div>
            </div>
            <div>
              <div className="text-xs text-neutral-400">Duración</div>
              <div className="font-medium text-neutral-100">{contract.duracion ?? '-'} meses</div>
            </div>
            <div>
              <div className="text-xs text-neutral-400">Día de vencimiento</div>
              <div className="font-medium text-neutral-100">{contract.diaVencimiento ?? contract.billing?.dueDay ?? '-'}</div>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-300">No se encontraron datos del contrato.</div>
        )}
      </div>

      {loading ? (
        <div className="text-neutral-400">Cargando cuotas...</div>
      ) : error ? (
        <div className="text-red-400">{error}</div>
      ) : (
        <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
          <div className="grid grid-cols-6 gap-0 bg-white/5 text-xs text-neutral-300 px-4 py-3">
            <div>Período</div>
            <div>Vencimiento</div>
            <div>Monto</div>
            <div>Estado</div>
            <div>Pagado</div>
            <div>Pago</div>
          </div>
          {installments.length === 0 ? (
            <div className="px-4 py-10 text-sm text-neutral-400">Sin cuotas.</div>
          ) : (
            installments.map((cuota) => (
              <div
                key={cuota._id}
                className="grid grid-cols-6 gap-0 px-4 py-3 border-t border-white/10 text-sm items-center"
              >
                <div>{cuota.periodo}</div>
                <div>{cuota.vencimiento?.slice(0, 10)}</div>
                <div>${cuota.monto.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</div>
                <div>{cuota.estado}</div>
                <div>{cuota.pagado ? "Sí" : "No"}</div>
                <div>{cuota.pago || "-"}</div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
