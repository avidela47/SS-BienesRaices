import mongoose, { Schema, type Model } from "mongoose";

export type ContractFileDoc = mongoose.Document & {
  tenantId: string;
  contractId: mongoose.Types.ObjectId;
  movementId?: mongoose.Types.ObjectId;

  originalName: string;
  storedName: string;
  mimeType: string;
  size: number;
  publicPath: string;

  uploadedBy: string;

  createdAt: Date;
  updatedAt: Date;
};

const ContractFileSchema = new Schema<ContractFileDoc>(
  {
    tenantId: { type: String, required: true, index: true },

    contractId: { type: Schema.Types.ObjectId, required: true, index: true, ref: "Contract" },
    movementId: { type: Schema.Types.ObjectId, required: false, index: true, ref: "CashMovement" },

    originalName: { type: String, required: true },
    storedName: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    publicPath: { type: String, required: true },

    uploadedBy: { type: String, required: true, default: "manual" },
  },
  { timestamps: true }
);

// Evita recompilar el modelo en Next (hot reload)
export const ContractFile: Model<ContractFileDoc> =
  (mongoose.models.ContractFile as Model<ContractFileDoc>) ||
  mongoose.model<ContractFileDoc>("ContractFile", ContractFileSchema);

export default ContractFile;
