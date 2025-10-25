import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth/user";
import { getOnboardingChecklist, saveOnboardingChecklist } from "@/lib/onboarding/service";
import { OnboardingChecklist } from "@/lib/onboarding/types";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, context: any) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const startupId = context?.params?.startupId;
    if (!startupId) {
      return NextResponse.json({ ok: false, error: "Startup id is required" }, { status: 400 });
    }

    const checklist = await getOnboardingChecklist(startupId);
    return NextResponse.json({ ok: true, checklist });
  } catch (error) {
    console.error("GET /protected/onboarding/startups/[id]/checklist failed", error);
    return NextResponse.json(
      { ok: false, error: "Unable to load onboarding checklist" },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest, context: any) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const startupId = context?.params?.startupId;
  if (!startupId) {
    return NextResponse.json({ ok: false, error: "Startup id is required" }, { status: 400 });
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

  const checklist = (payload as { checklist?: OnboardingChecklist; items?: OnboardingChecklist["items"] }).checklist;
  const items = (payload as { items?: OnboardingChecklist["items"] }).items;

  if (!checklist && !items) {
    return NextResponse.json({ ok: false, error: "Checklist payload missing" }, { status: 400 });
  }

  try {
    const updated = await saveOnboardingChecklist(startupId, {
      startupId,
      createdAt: checklist?.createdAt ?? new Date().toISOString(),
      updatedAt: checklist?.updatedAt ?? new Date().toISOString(),
      notes: checklist?.notes,
      items: checklist?.items ?? items ?? [],
    });

    return NextResponse.json({ ok: true, checklist: updated });
  } catch (error) {
    console.error("PUT /protected/onboarding/startups/[id]/checklist failed", error);
    return NextResponse.json(
      { ok: false, error: "Unable to save onboarding checklist" },
      { status: 500 },
    );
  }
}
