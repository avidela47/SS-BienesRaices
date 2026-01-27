import { Schema, model, models, Types } from "mongoose";

export type DocumentEntityType = "OWNER" | "TENANT" | "GUARANTOR" | "AGENCY";

const DocumentSchema = new Schema(
  {
    tenantId: { type: String, required: true, index: true },

    entityType: {
      type: String,
      enum: ["OWNER", "TENANT", "GUARANTOR", "AGENCY"],
      required: true,
      index: true,
    },

    // Para AGENCY (Inmobiliaria) puede ser null
    personId: { type: Schema.Types.ObjectId, required: false, index: true },

    originalName: { type: String, required: true, trim: true },
    storedName: { type: String, required: true, trim: true },
    mimeType: { type: String, required: true, trim: true },
    size: { type: Number, required: true },

    // URL pública (guardamos en /public/uploads)
    url: { type: String, required: true, trim: true },

    notes: { type: String, trim: true, default: "" },
  },
  { timestamps: true }
);

DocumentSchema.index({ tenantId: 1, entityType: 1, personId: 1, createdAt: -1 });

export type DocumentDoc = {
  _id: Types.ObjectId;
  tenantId: string;
  entityType: DocumentEntityType;
  personId?: Types.ObjectId;
  originalName: string;
  storedName: string;
  mimeType: string;
  size: number;
  url: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
};

export default models.Document || model("Document", DocumentSchema);
