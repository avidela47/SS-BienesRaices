import { Schema, model, models, Types } from "mongoose";

export type InstallmentStatus = "PENDING" | "PAID" | "OVERDUE" | "PARTIAL" | "REFINANCED";

const InstallmentSchema = new Schema(
  {
    tenantId: { type: String, required: true, index: true },

    contractId: { type: Schema.Types.ObjectId, ref: "Contract", required: true, index: true },

    // Ej: "2026-01" (periodo del alquiler)
    period: { type: String, required: true, trim: true },

    dueDate: { type: Date, required: true, index: true },
    amount: { type: Number, required: true, min: 0 },

    lateFeeAccrued: { type: Number, default: 0 },

    status: {
      type: String,
      enum: ["PENDING", "PAID", "OVERDUE", "PARTIAL", "REFINANCED"],
      default: "PENDING",
      index: true,
    },

    paidAmount: { type: Number, default: 0 },
    paidAt: { type: Date, default: null },

    // Para evitar spam de avisos manuales + trazabilidad
    lastReminderAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Anti-duplicado: una cuota por periodo por contrato (por tenant)
InstallmentSchema.index({ tenantId: 1, contractId: 1, period: 1 }, { unique: true });

// Queries típicas
InstallmentSchema.index({ tenantId: 1, dueDate: 1, status: 1 });

export type InstallmentDoc = {
  _id: Types.ObjectId;
  tenantId: string;
  contractId: Types.ObjectId;
  period: string;
  dueDate: Date;
  amount: number;
  lateFeeAccrued: number;
  status: InstallmentStatus;
  paidAmount: number;
  paidAt: Date | null;
  lastReminderAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export default models.Installment || model("Installment", InstallmentSchema);
