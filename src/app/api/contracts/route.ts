import { NextResponse } from "next/server";
import { createContract, listContracts } from "@/lib/contracts/contractService";

export async function GET() {
  try {
    const contracts = await listContracts();
    return NextResponse.json({ ok: true, contracts });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const contract = await createContract({
      code: body?.code,

      propertyId: body?.propertyId,
      ownerId: body?.ownerId,
      tenantPersonId: body?.tenantPersonId,

      startDate: body?.startDate,
      endDate: body?.endDate,

      duracionMeses: body?.duracionMeses,
      montoBase: body?.montoBase,
      dueDay: body?.dueDay,
      currency: body?.currency,

      actualizacionCadaMeses: body?.actualizacionCadaMeses,
      ajustes: body?.ajustes,

      billing: body?.billing,
    });

    return NextResponse.json({ ok: true, contract }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}

