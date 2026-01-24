// Archivo: src/app/api/installments/generate/route.ts
import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongoose";
import Contract from "@/models/Contract";
import Installment from "@/models/Installment";

type LateFeePolicy = {
  type: "NONE" | "FIXED" | "PERCENT";
  value: number;
};

type Billing = {
  dueDay: number;
  baseRent: number;
  currency: "ARS" | "USD";
  lateFeePolicy: LateFeePolicy;
  notes?: string;
};

type InstallmentLean = {
  period: string;
};

type ContractLean = {
  _id: unknown;
  tenantId?: string;
  status: string;
  startDate: string | Date;
  endDate: string | Date;
  billing?: Partial<Billing>;
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function buildDueDateUTC(year: number, monthIndex0: number, dueDay: number) {
  const lastDay = new Date(Date.UTC(year, monthIndex0 + 1, 0)).getUTCDate();
  const day = Math.min(dueDay, lastDay);
  return new Date(Date.UTC(year, monthIndex0, day, 0, 0, 0, 0));
}

async function createInstallmentsForContract(params: {
  tenantId: string;
  contractId: string;
  startDate: Date;
  endDate: Date;
  billing: Billing;
}) {
  const { tenantId, contractId, startDate, endDate, billing } = params;

  const dueDay = billing.dueDay ?? 10;
  const baseRent = billing.baseRent ?? 0;

  const startY = startDate.getUTCFullYear();
  const startM = startDate.getUTCMonth();
  const endY = endDate.getUTCFullYear();
  const endM = endDate.getUTCMonth();

  const installmentsToCreate: Array<{
    tenantId: string;
    contractId: string;
    period: string;
    dueDate: Date;
    amount: number;
    lateFeeAccrued: number;
    status: "PENDING";
    paidAmount: number;
    paidAt: null;
    lastReminderAt: null;
  }> = [];

  let y = startY;
  let m = startM;

  while (y < endY || (y === endY && m <= endM)) {
    const period = `${y}-${pad2(m + 1)}`;
    const dueDate = buildDueDateUTC(y, m, dueDay);

    installmentsToCreate.push({
      tenantId,
      contractId,
      period,
      dueDate,
      amount: baseRent,
      lateFeeAccrued: 0,
      status: "PENDING",
      paidAmount: 0,
      paidAt: null,
      lastReminderAt: null,
    });

    m += 1;
    if (m > 11) {
      m = 0;
      y += 1;
    }
  }

  // Evitar duplicados por (tenantId, contractId, period)
  const existing = (await Installment.find(
    { tenantId, contractId },
    { period: 1, _id: 0 }
  ).lean()) as InstallmentLean[];

  const existingPeriods = new Set(existing.map((x) => x.period));
  const filtered = installmentsToCreate.filter((it) => !existingPeriods.has(it.period));

  if (filtered.length === 0) {
    return { created: 0, skipped: installmentsToCreate.length };
  }

  await Installment.insertMany(filtered);
  return { created: filtered.length, skipped: installmentsToCreate.length - filtered.length };
}

export async function POST() {
  try {
    await dbConnect();

    const contracts = (await Contract.find({ status: "ACTIVE" }).lean()) as ContractLean[];

    let totalCreated = 0;
    let totalSkipped = 0;

    for (const c of contracts) {
      const tenantId = c.tenantId || "default";
      const contractId = String(c._id);

      const startDate = new Date(c.startDate);
      const endDate = new Date(c.endDate);

      const billing: Billing = {
        dueDay: c.billing?.dueDay ?? 10,
        baseRent: c.billing?.baseRent ?? 0,
        currency: (c.billing?.currency as Billing["currency"]) ?? "ARS",
        lateFeePolicy: c.billing?.lateFeePolicy ?? { type: "NONE", value: 0 },
        notes: c.billing?.notes ?? "",
      };

      const res = await createInstallmentsForContract({
        tenantId,
        contractId,
        startDate,
        endDate,
        billing,
      });

      totalCreated += res.created;
      totalSkipped += res.skipped;
    }

    return NextResponse.json({
      ok: true,
      message: "Installments generated",
      created: totalCreated,
      skipped: totalSkipped,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json(
      { ok: false, message: "Failed to generate installments", error: message },
      { status: 500 }
    );
  }
}

