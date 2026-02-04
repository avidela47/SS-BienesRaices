import mongoose, { Schema, Types } from "mongoose";

export type ContractStatus = "DRAFT" | "ACTIVE" | "EXPIRING" | "ENDED" | "TERMINATED";

export type LateFeePolicy = {
  type: "NONE" | "FIXED" | "PERCENT";
  value: number;
};

export type BillingAdjustment = {
  n: number;
  percentage: number;
};

export type BillingBlock = {
  dueDay: number;
  currency: string;
  actualizacionCadaMeses: number;
  ajustes: BillingAdjustment[];
  lateFeePolicy: LateFeePolicy;
  commissionMonthlyPct?: number; // Comisión mensual (% sobre alquiler)
  commissionTotalPct?: number;   // Comisión total por contrato (% sobre monto total)
  notes: string;
};

export type ContractDoc = {
  tenantId: string;
  code: string;

  propertyId: Types.ObjectId;
  ownerId: Types.ObjectId;
  tenantPersonId: Types.ObjectId;

  startDate: Date;
  endDate: Date;

  duracionMeses: number;
  montoBase: number;

  status: ContractStatus;

  billing: BillingBlock;

  documents: unknown[];

  createdAt: Date;
  updatedAt: Date;
};

const BillingAdjustmentSchema = new Schema<BillingAdjustment>(
  {
    n: { type: Number, required: true },
    percentage: { type: Number, required: true },
  },
  { _id: false }
);

const LateFeePolicySchema = new Schema<LateFeePolicy>(
  {
    type: { type: String, enum: ["NONE", "FIXED", "PERCENT"], required: true, default: "NONE" },
    value: { type: Number, required: true, default: 0 },
  },
  { _id: false }
);

const BillingSchema = new Schema<BillingBlock>(
  {
    dueDay: { type: Number, required: true, min: 1, max: 28 },
    currency: { type: String, required: true, default: "ARS" },
    actualizacionCadaMeses: { type: Number, required: true, default: 0 },
    ajustes: { type: [BillingAdjustmentSchema], required: true, default: [] },
    lateFeePolicy: { type: LateFeePolicySchema, required: true, default: { type: "NONE", value: 0 } },
    commissionMonthlyPct: { type: Number, required: true, default: 0, min: 0 }, // Comisión mensual (% sobre alquiler)
    commissionTotalPct: { type: Number, required: true, default: 0, min: 0 },   // Comisión total por contrato (% sobre monto total)
    notes: { type: String, default: "" },
  },
  { _id: false }
);

const ContractSchema = new Schema<ContractDoc>(
  {
    tenantId: { type: String, required: true, index: true },

    code: { type: String, required: true, index: true },

    propertyId: { type: Schema.Types.ObjectId, ref: "Property", required: true },
    ownerId: { type: Schema.Types.ObjectId, ref: "Person", required: true },
    tenantPersonId: { type: Schema.Types.ObjectId, ref: "Person", required: true },

    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },

    duracionMeses: { type: Number, required: true, min: 1 },
    montoBase: { type: Number, required: true, min: 0 },

    status: {
      type: String,
      enum: ["DRAFT", "ACTIVE", "EXPIRING", "ENDED", "TERMINATED"],
      required: true,
      default: "ACTIVE",
      index: true,
    },

    billing: { type: BillingSchema, required: true },

    // OJO: NO usamos `id` custom (eso fue lo que te generó index unique en null)
    documents: { type: [Schema.Types.Mixed], required: true, default: [] },
  },
  { timestamps: true }
);

// Unicidad por tenant + code (esto SI tiene sentido)
ContractSchema.index({ tenantId: 1, code: 1 }, { unique: true });

const Contract = mongoose.models.Contract || mongoose.model<ContractDoc>("Contract", ContractSchema);
export default Contract;
