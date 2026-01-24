import { Schema, model, models } from "mongoose";

const CounterSchema = new Schema(
  {
    tenantId: { type: String, required: true, index: true },
    key: { type: String, required: true },
    seq: { type: Number, required: true, default: 0 },
  },
  { timestamps: true }
);

CounterSchema.index({ tenantId: 1, key: 1 }, { unique: true });

export default models.Counter || model("Counter", CounterSchema);
