import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  const requestId = crypto.randomUUID();
  try {
    await db.query("SELECT 1");
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(JSON.stringify({ operation: "health.db", requestId, error: error instanceof Error ? error.message : "unknown" }));
    return NextResponse.json({ ok: false, error: "Service unavailable." }, { status: 503 });
  }
}