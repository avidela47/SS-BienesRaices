// src/lib/types.ts

export type TenantId = string;

export type PersonType = "OWNER" | "TENANT" | "GUARANTOR";

export type PropertyStatus = "AVAILABLE" | "OCCUPIED" | "INACTIVE";

export type ContractStatus = "ACTIVE" | "INACTIVE" | "CANCELLED" | "FINISHED";

export type InstallmentStatus = "PENDING" | "PAID" | "OVERDUE" | "PARTIAL" | "REFINANCED";

export type CurrencyCode = "ARS" | "USD";

export type PaymentMethod = "CASH" | "TRANSFER" | "CARD" | "OTHER";

export interface PersonDTO {
  _id: string;
  tenantId: TenantId;
  code?: string;
  type: PersonType;
  fullName: string;
  dniCuit?: string;
  email?: string;
  phone?: string;
  address?: string;
  tags?: string[];
  notes?: string;

  transferredAt?: string | null;
  transferredBy?: string;
  transferRef?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface PropertyDTO {
  _id: string;
  tenantId: TenantId;
  code?: string;
  addressLine: string;
  unit?: string;
  city?: string;
  province?: string;
  status: PropertyStatus;

  // OJO: según tu populate, puede venir string o objeto
  ownerId: string | PersonDTO;

  tipo?: string;
  foto?: string;
  mapa?: string;
  inquilinoId?: string | PersonDTO;

  createdAt?: string;
  updatedAt?: string;
}

export interface ContractBillingLateFeePolicyDTO {
  type: "NONE" | "FIXED" | "PERCENT";
  value: number;
}

export interface ContractBillingDTO {
  dueDay: number;
  baseRent: number;
  currency: CurrencyCode;
  lateFeePolicy?: ContractBillingLateFeePolicyDTO;
    commissionMonthlyPct?: number; // Comisión mensual (% sobre alquiler)
    commissionTotalPct?: number;   // Comisión total por contrato (% sobre monto total)
  notes?: string;
}

export interface ContractDTO {
  _id: string;
  tenantId: TenantId;
  code?: string;

  // según populate, puede venir string u objeto
  propertyId: string | PropertyDTO;
  ownerId: string | PersonDTO;
  tenantPersonId: string | PersonDTO;

  startDate: string;
  endDate: string;
  status: ContractStatus;

  billing: ContractBillingDTO;

  documents?: unknown[]; // si después tipás documentos, lo cambiamos

  createdAt?: string;
  updatedAt?: string;
}

export interface InstallmentDTO {
  _id: string;
  tenantId: TenantId;

  contractId: string;

  period: string; // "YYYY-MM"
  dueDate: string; // ISO

  amount: number;

  lateFeeAccrued: number;

  status: InstallmentStatus;

  paidAmount: number;
  paidAt: string | null;

  lastReminderAt: string | null;

  createdAt?: string;
  updatedAt?: string;
}

export type PaymentStatus = "OK" | "VOID";

export type CashMovementType = "INCOME" | "EXPENSE" | "COMMISSION" | "RETENTION" | "ADJUSTMENT";
export type CashMovementStatus =
  | "PENDING"
  | "COLLECTED"
  | "RETAINED"
  | "READY_TO_TRANSFER"
  | "TRANSFERRED"
  | "VOID";
export type CashMovementPartyType = "AGENCY" | "OWNER" | "TENANT" | "GUARANTOR" | "OTHER";

export interface PaymentDTO {
  _id: string;
  tenantId: TenantId;

  contractId: string;
  installmentId: string;

  date: string;
  amount: number;
  method: PaymentMethod;

  reference?: string;
  notes?: string;

  status?: PaymentStatus;
  voidedAt?: string;

  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface CashMovementDTO {
  _id: string;
  tenantId: TenantId;

  type: CashMovementType;
  subtype?: string;
  status: CashMovementStatus;

  amount: number;
  currency: CurrencyCode | string;
  date: string;

  contractId: string;
  propertyId: string;
  ownerId: string;
  tenantPersonId: string;

  contractLabel?: string;
  propertyLabel?: string;

  partyType?: CashMovementPartyType;
  partyId?: string;

  installmentId?: string;
  paymentId?: string;

  notes?: string;

  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ApiOk<T> {
  ok: true;
  result: T;
}

export interface ApiError {
  ok: false;
  error: string;
  details?: unknown;
}
