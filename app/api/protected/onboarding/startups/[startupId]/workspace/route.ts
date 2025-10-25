import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/user";
import {
  getOnboardingChecklist,
  getOnboardingConfig,
  getOnboardingSubmissionDetail,
  getOnboardingMilestones,
  getOnboardingAlumniRecord,
  listOnboardingDocuments,
  getOnboardingGrantCatalog,
} from "@/lib/onboarding/service";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: {
    startupId: string;
  };
};

export async function GET(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { startupId } = context.params;
  const url = new URL(request.url);
  const userId = url.searchParams.get("userId");

  if (!userId) {
    return NextResponse.json({ ok: false, error: "Missing user identifier" }, { status: 400 });
  }

  try {
    const form = await getOnboardingConfig();
    const submission = await getOnboardingSubmissionDetail(form, startupId, userId);

    if (!submission) {
      return NextResponse.json(
        { ok: false, error: "Startup onboarding record not found" },
        { status: 404 },
      );
    }

    const [checklist, documents, milestones, alumni, grants] = await Promise.all([
      getOnboardingChecklist(startupId),
      listOnboardingDocuments(startupId),
      getOnboardingMilestones(startupId),
      getOnboardingAlumniRecord(startupId),
      getOnboardingGrantCatalog(startupId),
    ]);

    return NextResponse.json({
      ok: true,
      submission,
      checklist,
      documents,
      milestones,
      alumni,
      grants,
    });
  } catch (error) {
    console.error("GET /protected/onboarding/startups/[id]/workspace failed", error);
    return NextResponse.json(
      { ok: false, error: "Unable to load startup workspace" },
      { status: 500 },
    );
  }
}
