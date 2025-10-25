import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth/user";
import { getIncubatorFinancialOverview } from "@/lib/grants/service";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const overview = await getIncubatorFinancialOverview();
    return NextResponse.json({ ok: true, overview });
  } catch (error) {
    console.error("GET /protected/grants/financials failed", error);
    const message = error instanceof Error ? error.message : "Unable to load incubator financials";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
