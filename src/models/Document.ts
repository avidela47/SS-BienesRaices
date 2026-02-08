import { Schema, model, models, type Model, type Types } from "mongoose";

export interface DocumentDoc {
  _id: Types.ObjectId;
  tenantId: string;

  title: string;
  type: "DNI" | "CONTRATO" | "RECIBO" | "GARANTIA" | "SERVICIO" | "OTRO";
  entity: "TENANT" | "OWNER" | "GUARANTOR" | "PROPERTY" | "CONTRACT" | "OTHER";
  entityId?: string | null;

  description?: string;

  // guardamos imágenes como base64 dataURL
  images: string[];

  status: "ACTIVE" | "ARCHIVED";

  createdAt: Date;
  updatedAt: Date;
}

const DocumentSchema = new Schema<DocumentDoc>(
  {
    tenantId: { type: String, required: true, index: true },

    title: { type: String, required: true, trim: true },
    type: { type: String, required: true, default: "OTRO" },
    entity: { type: String, required: true, default: "OTHER" },
    entityId: { type: String, default: null },

    description: { type: String, default: "" },

    images: { type: [String], default: [] },

    status: { type: String, required: true, default: "ACTIVE" },
  },
  { timestamps: true }
);

const DocumentModel =
  (models.Document as Model<DocumentDoc>) || model<DocumentDoc>("Document", DocumentSchema);

export default DocumentModel;
