import { Schema, model, models, Types } from "mongoose";

export type MonthlyRentStatus = "PENDING" | "PAID" | "OVERDUE" | "CANCELED";

export type MonthlyRentDoc = {
  _id: Types.ObjectId;
  tenantId: string;

  contractId: Types.ObjectId;
  propertyId?: Types.ObjectId;

  period: string; // "YYYY-MM"
  dueDate: Date;

  amount: number;

  status: MonthlyRentStatus;
  paidAt?: Date | null;

  notes?: string;

  createdAt: Date;
  updatedAt: Date;
};

const MonthlyRentSchema = new Schema(
  {
    tenantId: { type: String, required: true, index: true },

    contractId: { type: Schema.Types.ObjectId, ref: "Contract", required: true, index: true },
    // ✅ clave para tu populate (y muy útil para filtros)
    propertyId: { type: Schema.Types.ObjectId, ref: "Property", required: false, index: true },

    // "2026-01"
    period: { type: String, required: true, index: true, trim: true },

    dueDate: { type: Date, required: true, index: true },

    amount: { type: Number, required: true, min: 0 },

    status: {
      type: String,
      enum: ["PENDING", "PAID", "OVERDUE", "CANCELED"],
      default: "PENDING",
      index: true,
    },

    paidAt: { type: Date, default: null },

    notes: { type: String, default: "" },
  },
  { timestamps: true }
);

// Evita duplicados del mismo período para un contrato
MonthlyRentSchema.index({ tenantId: 1, contractId: 1, period: 1 }, { unique: true });

export default models.MonthlyRent || model("MonthlyRent", MonthlyRentSchema);
