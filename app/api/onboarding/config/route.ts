import { NextResponse } from "next/server";
import { getOnboardingConfig } from "@/lib/onboarding/service";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const config = await getOnboardingConfig();
    return NextResponse.json({ ok: true, form: config });
  } catch (error) {
    console.error("GET /api/onboarding/config failed", error);
    return NextResponse.json(
      { ok: false, error: "Unable to load onboarding configuration" },
      { status: 500 },
    );
  }
}
