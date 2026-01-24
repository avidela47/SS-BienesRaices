import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongoose";

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "unknown";
}

export async function GET() {
  try {
    await dbConnect();
    return NextResponse.json({ ok: true, message: "API OK + Mongo connected" });
  } catch (err: unknown) {
    return NextResponse.json(
      { ok: false, message: "Mongo connection failed", error: getErrorMessage(err) },
      { status: 500 }
    );
  }
}
