import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/user";
import {
  getOnboardingConfig,
  normalizeConfig,
  saveOnboardingConfig,
} from "@/lib/onboarding/service";
import { OnboardingForm } from "@/lib/onboarding/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const config = await getOnboardingConfig();
    return NextResponse.json({ ok: true, form: config });
  } catch (error) {
    console.error("GET /onboarding/config failed", error);
    return NextResponse.json(
      { ok: false, error: "Unable to load onboarding configuration" },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let payload: unknown;

  try {
    payload = await request.json();
  } catch (error) {
    return NextResponse.json({ ok: false, error: "Invalid JSON payload" }, { status: 400 });
  }

  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });
  }

  const form = (payload as { form: OnboardingForm }).form;

  if (!form) {
    return NextResponse.json({ ok: false, error: "Form payload missing" }, { status: 400 });
  }

  try {
    const normalized = normalizeConfig(form);
    await saveOnboardingConfig(normalized);

    return NextResponse.json({ ok: true, form: normalized });
  } catch (error) {
    console.error("PUT /onboarding/config failed", error);
    return NextResponse.json(
      { ok: false, error: "Unable to save onboarding configuration" },
      { status: 500 },
    );
  }
}
