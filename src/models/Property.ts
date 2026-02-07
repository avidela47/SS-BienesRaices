import mongoose, { Schema, Types, Model } from "mongoose";

export type PropertyStatus = "AVAILABLE" | "RENTED" | "MAINTENANCE";

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

  // NOTA: por ahora lo dejamos, pero a futuro lo va a definir el contrato
  inquilinoId?: Types.ObjectId | null;

  availableFrom?: Date | null;

  createdAt: Date;
  updatedAt: Date;
};

const PropertySchema = new Schema<PropertyDoc>(
  {
    tenantId: { type: String, required: true, index: true },

    code: { type: String, required: true, trim: true },
    addressLine: { type: String, required: true, trim: true },

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

    inquilinoId: { type: Schema.Types.ObjectId, ref: "Person", default: null },

    availableFrom: { type: Date, default: null, index: true },
  },
  { timestamps: true }
);

PropertySchema.index({ tenantId: 1, code: 1 }, { unique: true });

const PropertyModel =
  (mongoose.models.Property as Model<PropertyDoc>) || mongoose.model<PropertyDoc>("Property", PropertySchema);

export default PropertyModel;
