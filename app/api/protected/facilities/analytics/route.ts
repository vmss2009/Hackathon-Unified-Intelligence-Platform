import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth/user";
import { getFacilityUtilisationAnalytics } from "@/lib/facilities/service";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const start = searchParams.get("start") ?? undefined;
  const end = searchParams.get("end") ?? undefined;

  try {
    const analytics = await getFacilityUtilisationAnalytics({ start, end });
    return NextResponse.json({ ok: true, analytics });
  } catch (error) {
    console.error("GET /protected/facilities/analytics failed", error);
    const message = error instanceof Error ? error.message : "Unable to load facility utilisation";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
