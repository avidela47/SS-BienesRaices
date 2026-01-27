import { Schema, model, models, Types } from "mongoose";

export type PropertyStatus = "AVAILABLE" | "RENTED" | "MAINTENANCE";

const PropertySchema = new Schema(
  {
    tenantId: { type: String, required: true, index: true },

    // Código humano (PID-001)
    code: { type: String, required: true, trim: true },

    addressLine: { type: String, required: true, trim: true },

    // ✅ Campos que necesitás en ALTA/EDIT
    unit: { type: String, trim: true },
    city: { type: String, trim: true },
    province: { type: String, trim: true },

    status: {
      type: String,
      enum: ["AVAILABLE", "RENTED", "MAINTENANCE"],
      default: "AVAILABLE",
      index: true,
    },

    ownerId: { type: Schema.Types.ObjectId, ref: "Person", required: true, index: true },

    tipo: { type: String, trim: true },
    foto: { type: String, trim: true },
    mapa: { type: String, trim: true },

    inquilinoId: { type: Schema.Types.ObjectId, ref: "Person" },
  },
  { timestamps: true }
);

PropertySchema.index({ tenantId: 1, code: 1 }, { unique: true });

export type PropertyDoc = {
  _id: Types.ObjectId;
  tenantId: string;
  code: string;
  addressLine: string;
  unit?: string;
  city?: string;
  province?: string;
  status: PropertyStatus;
  ownerId: Types.ObjectId;
  tipo?: string;
  foto?: string;
  mapa?: string;
  inquilinoId?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export default models.Property || model("Property", PropertySchema);
