import mongoose, { Schema, Model } from "mongoose";

export type IndexKey =
  | "ICL"
  | "IPC"
  | "CASA_PROPIA"
  | "CAC"
  | "CER"
  | "IS"
  | "IPIM"
  | "UVA";

export interface IIndexValue {
  indexKey: IndexKey;
  date: string;
  value: number;
  source: "BCRA" | "DATOS_GOB_AR" | "MANUAL";
  createdAt?: Date;
  updatedAt?: Date;
}

const IndexValueSchema = new Schema<IIndexValue>(
  {
    indexKey: { type: String, required: true, index: true },
    date: { type: String, required: true, index: true },
    value: { type: Number, required: true },
    source: { type: String, required: true },
  },
  { timestamps: true }
);

IndexValueSchema.index({ indexKey: 1, date: 1 }, { unique: true });

export const IndexValue: Model<IIndexValue> =
  mongoose.models.IndexValue || mongoose.model<IIndexValue>("IndexValue", IndexValueSchema);
