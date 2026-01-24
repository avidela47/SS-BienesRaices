import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

export type PaymentMethod = "CASH" | "TRANSFER" | "CARD" | "OTHER";
export type PaymentStatus = "OK" | "VOID";

const PaymentSchema = new Schema(
  {
    tenantId: { type: String, required: true, index: true },

    contractId: { type: Schema.Types.ObjectId, ref: "Contract", required: true, index: true },
    installmentId: { type: Schema.Types.ObjectId, ref: "Installment", required: true, index: true },

    date: { type: Date, required: true, index: true },
    amount: { type: Number, required: true, min: 0 },

    method: { type: String, required: true, enum: ["CASH", "TRANSFER", "CARD", "OTHER"] },
    reference: { type: String, default: "" },
    notes: { type: String, default: "" },

    createdBy: { type: String, default: "system" },

    // Soft delete / void
    status: { type: String, required: true, enum: ["OK", "VOID"], default: "OK", index: true },
    voidedAt: { type: Date, default: null },
    voidedBy: { type: String, default: "" },
    voidReason: { type: String, default: "" },
  },
  { timestamps: true }
);

export type PaymentDoc = InferSchemaType<typeof PaymentSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const Payment: Model<PaymentDoc> =
  (mongoose.models.Payment as Model<PaymentDoc>) || mongoose.model<PaymentDoc>("Payment", PaymentSchema);
