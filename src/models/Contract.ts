import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

export type ContractStatus = "DRAFT" | "ACTIVE" | "EXPIRING" | "ENDED" | "TERMINATED";

const AjusteSchema = new Schema(
  {
    n: { type: Number, required: true },
    percentage: { type: Number, required: true },
  },
  { _id: false }
);

const LateFeePolicySchema = new Schema(
  {
    type: { type: String, enum: ["NONE", "FIXED", "PERCENT"], default: "NONE" },
    value: { type: Number, default: 0 },
  },
  { _id: false }
);

const BillingSchema = new Schema(
  {
    dueDay: { type: Number },
    baseRent: { type: Number },
    currency: { type: String },
    lateFeePolicy: { type: LateFeePolicySchema, default: undefined },
    notes: { type: String, default: "" },
    actualizacionCadaMeses: { type: Number, default: 0 },
    porcentajeActualizacion: { type: Number, default: 0 },
    ajustes: { type: [AjusteSchema], default: [] },
    commissionMonthlyPct: { type: Number, default: 0 },
    commissionTotalPct: { type: Number, default: 0 },
  },
  { _id: false }
);

const ScheduleItemSchema = new Schema(
  {
    period: { type: String, required: true }, // "2026-01"
    dueDate: { type: String, required: true }, // "2026-01-08"
    amount: { type: Number, required: true },
    status: { type: String, enum: ["PENDING", "PAID"], default: "PENDING" },
  },
  { _id: false }
);

const ContractSchema = new Schema(
  {
    tenantId: { type: String, default: "default", index: true },

    code: { type: String, required: true, index: true },
    status: {
      type: String,
      enum: ["DRAFT", "ACTIVE", "EXPIRING", "ENDED", "TERMINATED"],
      default: "DRAFT",
    },

    propertyId: { type: Schema.Types.ObjectId, ref: "Property", required: true },
    ownerId: { type: Schema.Types.ObjectId, ref: "Person", required: true },
    tenantPersonId: { type: Schema.Types.ObjectId, ref: "Person", required: true },

    // ✅ SIEMPRE string YYYY-MM-DD
    startDate: { type: String, required: true }, // "2026-01-01"
    endDate: { type: String, required: true }, // "2026-12-31"

    duracionMeses: { type: Number, default: 0 },
    montoBase: { type: Number, default: 0 },
    dueDay: { type: Number, default: 10 },
    currency: { type: String, default: "ARS" },

    actualizacionCadaMeses: { type: Number, default: 0 },
    ajustes: { type: [AjusteSchema], default: [] },
    lateFeePolicy: { type: LateFeePolicySchema, default: undefined },

    billing: { type: BillingSchema, default: undefined },

    schedule: { type: [ScheduleItemSchema], default: [] },
  },
  { timestamps: true }
);

export type ContractDoc = InferSchemaType<typeof ContractSchema> & { _id: mongoose.Types.ObjectId };

const ContractModel: Model<ContractDoc> =
  (mongoose.models.Contract as Model<ContractDoc>) || mongoose.model<ContractDoc>("Contract", ContractSchema);

export default ContractModel;
