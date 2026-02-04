import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongoose";
import Installment from "@/models/Installment";
import Contract from "@/models/Contract";

const TENANT_ID = "default";

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "unknown";
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function computeLateFee(amount: number, dueDate: Date, policy?: { type?: string; value?: number }, status?: string): number {
  if (!policy || policy.type === "NONE") return 0;
  if (status === "PAID") return 0;

  const due = startOfDay(dueDate);
  const today = startOfDay(new Date());

  if (today <= due) return 0; // corre desde el día siguiente

  const msPerDay = 24 * 60 * 60 * 1000;
  const daysLate = Math.max(0, Math.floor((today.getTime() - due.getTime()) / msPerDay));
  if (!daysLate) return 0;

  if (policy.type === "FIXED") return Math.round((Number(policy.value) || 0) * daysLate);
  if (policy.type === "PERCENT") {
    const pct = Number(policy.value) || 0;
    return Math.round(amount * (pct / 100) * daysLate);
  }

  return 0;
}

export async function GET() {
  try {
    await dbConnect();

    const installments = await Installment.find({ tenantId: TENANT_ID })
      .sort({ dueDate: 1 })
      .lean();

    const contractIds = Array.from(new Set(installments.map((i) => String(i.contractId))));
    const contracts = await Contract.find({ tenantId: TENANT_ID, _id: { $in: contractIds } }, { billing: 1 }).lean();
    const policyByContract = new Map(
      contracts.map((c) => [String(c._id), c.billing?.lateFeePolicy ?? { type: "NONE", value: 0 }])
    );

    const withLateFee = installments.map((it) => {
      const policy = policyByContract.get(String(it.contractId));
      const lateFeeAccrued = computeLateFee(Number(it.amount) || 0, new Date(it.dueDate), policy, it.status);
      return { ...it, lateFeeAccrued };
    });

    return NextResponse.json({ ok: true, installments: withLateFee });
  } catch (err: unknown) {
    return NextResponse.json(
      { ok: false, message: "Failed to fetch installments", error: getErrorMessage(err) },
      { status: 500 }
    );
  }
}
