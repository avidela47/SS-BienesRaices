import { Schema, model, models, Types } from "mongoose";

export type ContractStatus = "DRAFT" | "ACTIVE" | "EXPIRING" | "ENDED" | "TERMINATED";

type BillingAdjustment = {
  n: number;          // 1,2,3... (orden)
  percentage: number; // ej: 5, 7, 12.5
};

const BillingAdjustmentSchema = new Schema<BillingAdjustment>(
  {
    n: { type: Number, required: true, min: 1 },
    percentage: { type: Number, required: true },
  },
  { _id: false }
);

const ContractSchema = new Schema(
  {
    tenantId: { type: String, required: true, index: true },

    code: { type: String, required: true, trim: true },

    propertyId: { type: Schema.Types.ObjectId, ref: "Property", required: true, index: true },
    ownerId: { type: Schema.Types.ObjectId, ref: "Person", required: true, index: true },
    tenantPersonId: { type: Schema.Types.ObjectId, ref: "Person", required: true, index: true },

    startDate: { type: Date, required: true, index: true },
    endDate: { type: Date, required: true, index: true },

    // ✅ Regla oficial: manda duracionMeses
    duracionMeses: { type: Number, required: true, min: 1 },

    // ✅ Regla oficial: monto base
    montoBase: { type: Number, required: true, min: 0 },

    status: {
      type: String,
      enum: ["DRAFT", "ACTIVE", "EXPIRING", "ENDED", "TERMINATED"],
      default: "DRAFT",
      index: true,
    },

    billing: {
      dueDay: { type: Number, required: true, min: 1, max: 28 },
      currency: { type: String, default: "ARS" },

      // ✅ frecuencia pactada (1 mensual / 3 trimestral / 6 semestral...)
      actualizacionCadaMeses: { type: Number, default: 0, min: 0 },

      // ✅ porcentajes manuales por evento de actualización (en orden)
      ajustes: { type: [BillingAdjustmentSchema], default: [] },

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

    // extras que ya tenías
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

  duracionMeses: number;
  montoBase: number;

  status: ContractStatus;

  billing: {
    dueDay: number;
    currency: string;
    actualizacionCadaMeses: number;
    ajustes: BillingAdjustment[];
    lateFeePolicy: { type: "NONE" | "FIXED" | "PERCENT"; value: number };
    notes: string;
  };

  documents: Array<{ type: string; url: string }>;
  createdAt: Date;
  updatedAt: Date;
};

export default models.Contract || model("Contract", ContractSchema);
