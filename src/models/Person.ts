import { Schema, model, models, Types } from "mongoose";

export type PersonType = "OWNER" | "TENANT" | "GUARANTOR";

const PersonSchema = new Schema(
  {
    tenantId: { type: String, required: true, index: true },

    // Código humano (OID-001 / TID-001 / GID-001)
    code: { type: String, required: true, trim: true },

    type: { type: String, enum: ["OWNER", "TENANT", "GUARANTOR"], required: true, index: true },
    fullName: { type: String, required: true, trim: true },
    dniCuit: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true, index: true },
    phone: { type: String, trim: true }, // WhatsApp
    address: { type: String, trim: true },
    tags: { type: [String], default: [] },
    notes: { type: String, trim: true },
  },
  { timestamps: true }
);

// Unicidad por tenant
PersonSchema.index({ tenantId: 1, code: 1 }, { unique: true });

export type PersonDoc = {
  _id: Types.ObjectId;
  tenantId: string;
  code: string;
  type: PersonType;
  fullName: string;
  dniCuit?: string;
  email?: string;
  phone?: string;
  address?: string;
  tags?: string[];
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
};

export default models.Person || model("Person", PersonSchema);

