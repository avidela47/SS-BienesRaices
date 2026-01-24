import { Schema, model, models, Types } from "mongoose";

export type ContractStatus = "DRAFT" | "ACTIVE" | "EXPIRING" | "ENDED" | "TERMINATED";

const ContractSchema = new Schema(
  {
    tenantId: { type: String, required: true, index: true },

    // Código humano (CID-001)
    code: { type: String, required: true, trim: true },

    propertyId: { type: Schema.Types.ObjectId, ref: "Property", required: true, index: true },
    ownerId: { type: Schema.Types.ObjectId, ref: "Person", required: true, index: true },
    tenantPersonId: { type: Schema.Types.ObjectId, ref: "Person", required: true, index: true },

    startDate: { type: Date, required: true, index: true },
    endDate: { type: Date, required: true, index: true },

    status: {
      type: String,
      enum: ["DRAFT", "ACTIVE", "EXPIRING", "ENDED", "TERMINATED"],
      default: "DRAFT",
      index: true,
    },

    billing: {
      dueDay: { type: Number, required: true, min: 1, max: 28 },
      baseRent: { type: Number, required: true, min: 0 },
      currency: { type: String, default: "ARS" },
      actualizacionCada: { type: Number, default: 0 },
      porcentajeActualizacion: { type: Number, default: 0 },
      lateFeePolicy: {
        type: {
          type: String,
          enum: ["NONE", "FIXED", "PERCENT"],
          default: "NONE",
        },
        value: { type: Number, default: 0 },
      },
      notes: { type: String, default: "" },
    },
    duracion: { type: Number, default: 0 },
    montoCuota: { type: Number, default: 0 },
    comision: { type: Number, default: 0 },
    expensas: { type: String, default: "no" },
    otrosGastosImporte: { type: Number, default: 0 },
    otrosGastosDesc: { type: String, default: "" },

    documents: [
      {
        type: { type: String, default: "CONTRACT" },
        url: { type: String, required: true },
      },
    ],
  },
  { timestamps: true }
);

ContractSchema.index({ tenantId: 1, code: 1 }, { unique: true });

export type ContractDoc = {
  _id: Types.ObjectId;
  tenantId: string;
  code: string;
  propertyId: Types.ObjectId;
  ownerId: Types.ObjectId;
  tenantPersonId: Types.ObjectId;
  startDate: Date;
  endDate: Date;
  status: ContractStatus;
  billing: {
    dueDay: number;
    baseRent: number;
    currency: string;
    adjustmentPercent?: number;
    adjustmentFrequency?: number;
    lateFeePolicy: { type: "NONE" | "FIXED" | "PERCENT"; value: number };
    notes: string;
  };
  documents: Array<{ type: string; url: string }>;
  createdAt: Date;
  updatedAt: Date;
};

export default models.Contract || model("Contract", ContractSchema);
