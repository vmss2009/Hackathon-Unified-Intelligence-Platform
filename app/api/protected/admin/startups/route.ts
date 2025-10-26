import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/user";
import { canManageUsers, loadUserProfile } from "@/lib/auth/access";
import { listUserProfiles } from "@/lib/db/auth/user";
import { getOnboardingConfig, listOnboardingSubmissions } from "@/lib/onboarding/service";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let profile;
  try {
    profile = await loadUserProfile(session.user.id);
  } catch (error) {
    console.error("GET /protected/admin/startups failed to load profile", error);
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  if (!canManageUsers(profile)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  try {
    const [form, users] = await Promise.all([
      getOnboardingConfig(),
      listUserProfiles(),
    ]);

    const submissions = await listOnboardingSubmissions(form);
    const optionMap = new Map<string, { id: string; label: string; stage?: string | null; status?: string | null; submittedAt?: string | null }>();

    submissions.entries.forEach((entry) => {
      optionMap.set(entry.id, {
        id: entry.id,
        label: entry.companyName ?? entry.id,
        stage: entry.companyStage?.label ?? entry.companyStage?.value ?? null,
        status: entry.status,
        submittedAt: entry.submittedAt,
      });
    });

    users.forEach((userProfile) => {
      userProfile.startupIds.forEach((startupId) => {
        if (!optionMap.has(startupId)) {
          optionMap.set(startupId, {
            id: startupId,
            label: startupId,
          });
        }
      });
    });

    const startups = Array.from(optionMap.values()).sort((a, b) =>
      a.label.localeCompare(b.label, undefined, { sensitivity: "base" }),
    );

    return NextResponse.json({ ok: true, startups });
  } catch (error) {
    console.error("GET /protected/admin/startups failed", error);
    return NextResponse.json({ ok: false, error: "Unable to load startups" }, { status: 500 });
  }
}
