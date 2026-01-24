// src/lib/types.ts

export type TenantId = string;

export type PersonType = "OWNER" | "TENANT";

export type PropertyStatus = "AVAILABLE" | "OCCUPIED" | "INACTIVE";

export type ContractStatus = "ACTIVE" | "INACTIVE" | "CANCELLED" | "FINISHED";

export type InstallmentStatus = "PENDING" | "PAID" | "OVERDUE";

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

export interface ApiOk<T> {
  ok: true;
  result: T;
}

export interface ApiError {
  ok: false;
  error: string;
  details?: unknown;
}
