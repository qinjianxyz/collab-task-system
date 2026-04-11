import { NextResponse } from "next/server";

import { getSystemHealth } from "../../../src/server/ops/health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const health = await getSystemHealth();

  return NextResponse.json(health, {
    status: health.status === "ok" ? 200 : 503,
  });
}
