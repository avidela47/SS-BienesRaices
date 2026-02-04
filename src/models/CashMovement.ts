import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

export type CashMovementType = "INCOME" | "EXPENSE" | "COMMISSION" | "RETENTION" | "ADJUSTMENT";
export type CashMovementStatus =
  | "PENDING"
  | "COLLECTED"
  | "RETAINED"
  | "READY_TO_TRANSFER"
  | "TRANSFERRED"
  | "VOID";
export type CashMovementPartyType = "AGENCY" | "OWNER" | "TENANT" | "GUARANTOR" | "OTHER";

const CashMovementSchema = new Schema(
  {
    tenantId: { type: String, required: true, index: true },

    type: {
      type: String,
      required: true,
      enum: ["INCOME", "EXPENSE", "COMMISSION", "RETENTION", "ADJUSTMENT"],
      index: true,
    },

    subtype: { type: String, default: "" },

    status: {
      type: String,
      required: true,
      enum: ["PENDING", "COLLECTED", "RETAINED", "READY_TO_TRANSFER", "TRANSFERRED", "VOID"],
      default: "PENDING",
      index: true,
    },

    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, default: "ARS" },

    date: { type: Date, required: true, index: true },

    contractId: { type: Schema.Types.ObjectId, ref: "Contract", required: true, index: true },
    propertyId: { type: Schema.Types.ObjectId, ref: "Property", required: true, index: true },
    ownerId: { type: Schema.Types.ObjectId, ref: "Person", required: true, index: true },
    tenantPersonId: { type: Schema.Types.ObjectId, ref: "Person", required: true, index: true },

    partyType: {
      type: String,
      enum: ["AGENCY", "OWNER", "TENANT", "GUARANTOR", "OTHER"],
      required: true,
      default: "AGENCY",
      index: true,
    },
    partyId: { type: Schema.Types.ObjectId, ref: "Person", required: false, index: true },

    installmentId: { type: Schema.Types.ObjectId, ref: "Installment", required: false, index: true },
    paymentId: { type: Schema.Types.ObjectId, ref: "Payment", required: false, index: true },

    notes: { type: String, default: "" },

    createdBy: { type: String, default: "system" },

    // Soft delete / void
    voidedAt: { type: Date, default: null },
    voidedBy: { type: String, default: "" },
    voidReason: { type: String, default: "" },

    transferredAt: { type: Date, default: null },
    transferredBy: { type: String, default: "" },
    transferRef: { type: String, default: "" },
  },
  { timestamps: true }
);

CashMovementSchema.index({ tenantId: 1, date: -1 });
CashMovementSchema.index({ tenantId: 1, contractId: 1, date: -1 });
CashMovementSchema.index({ tenantId: 1, propertyId: 1, date: -1 });

export type CashMovementDoc = InferSchemaType<typeof CashMovementSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const CashMovement: Model<CashMovementDoc> =
  (mongoose.models.CashMovement as Model<CashMovementDoc>) ||
  mongoose.model<CashMovementDoc>("CashMovement", CashMovementSchema);
