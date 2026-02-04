import { Schema, model, models, Types } from "mongoose";

export type DocumentEntityType =
  | "OWNER"
  | "TENANT"
  | "GUARANTOR"
  | "PROPERTY"
  | "CONTRACT"
  | "PAYMENT"
  | "INSTALLMENT"
  | "AGENCY";

const DocumentSchema = new Schema(
  {
    tenantId: { type: String, required: true, index: true },

    entityType: {
      type: String,
      enum: ["OWNER", "TENANT", "GUARANTOR", "PROPERTY", "CONTRACT", "PAYMENT", "INSTALLMENT", "AGENCY"],
      required: true,
      index: true,
    },

    // Para AGENCY puede ser null
    entityId: { type: Schema.Types.ObjectId, required: false, index: true },

    // compat (antes se usaba personId)
    personId: { type: Schema.Types.ObjectId, required: false, index: true },

    originalName: { type: String, required: true, trim: true },
    storedName: { type: String, required: true, trim: true },
    mimeType: { type: String, required: true, trim: true },
    size: { type: Number, required: true },

    // URL pública (guardamos en /public/uploads)
    url: { type: String, required: true, trim: true },

  docType: { type: String, trim: true, default: "OTRO" },

    notes: { type: String, trim: true, default: "" },
  },
  { timestamps: true }
);

DocumentSchema.index({ tenantId: 1, entityType: 1, entityId: 1, createdAt: -1 });

export type DocumentDoc = {
  _id: Types.ObjectId;
  tenantId: string;
  entityType: DocumentEntityType;
  entityId?: Types.ObjectId;
  personId?: Types.ObjectId;
  originalName: string;
  storedName: string;
  mimeType: string;
  size: number;
  url: string;
  docType?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
};

export default models.Document || model("Document", DocumentSchema);
