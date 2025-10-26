import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/user";
import { loadUserProfile, canReviewOnboarding, canViewOwnOnboarding, getAccessibleStartupIds } from "@/lib/auth/access";
import { getOnboardingConfig, listOnboardingSubmissions } from "@/lib/onboarding/service";
import { OnboardingSubmissionFilters } from "@/lib/onboarding/types";

export const dynamic = "force-dynamic";

const parseNumber = (value: string | null): number | undefined => {
  if (value === null) {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed.length) {
    return undefined;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
};

export async function GET(request: Request) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let profile;
  try {
    profile = await loadUserProfile(session.user.id);
  } catch (error) {
    console.error("GET /protected/onboarding/submissions profile load failed", error);
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  if (!canViewOwnOnboarding(profile)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const params = url.searchParams;
  const filters: OnboardingSubmissionFilters = {};

  const statusParam = params.get("status");
  if (statusParam === "advance" || statusParam === "review" || statusParam === "reject") {
    filters.status = statusParam;
  }

  const stageParam = params.get("stage");
  if (stageParam) {
    filters.stage = stageParam;
  }

  const minScore = parseNumber(params.get("minScore"));
  const maxScore = parseNumber(params.get("maxScore"));
  if (minScore !== undefined) {
    filters.minScore = minScore;
  }
  if (maxScore !== undefined) {
    filters.maxScore = maxScore;
  }

  const queryParam = params.get("query");
  if (queryParam) {
    filters.query = queryParam;
  }

  try {
    const form = await getOnboardingConfig();
    const result = await listOnboardingSubmissions(form, filters);

    let entries = result.entries;

    if (!canReviewOnboarding(profile)) {
      const ownedSubmissionIds = await getAccessibleStartupIds(profile);
      const accessibleIds = new Set<string>([...profile.startupIds, ...ownedSubmissionIds]);

      entries = entries.filter((submission) => {
        if (submission.userId === profile.id) {
          return true;
        }
        return accessibleIds.has(submission.id);
      });
    }

    return NextResponse.json({
      ok: true,
      submissions: entries,
      meta: {
        total: entries.length,
        stageFieldId: result.stageFieldId,
        stageOptions: result.stageOptions,
        scoreRange: result.scoreRange,
        statusOptions: ["advance", "review", "reject"],
      },
    });
  } catch (error) {
    console.error("GET /protected/onboarding/submissions failed", error);
    return NextResponse.json(
      { ok: false, error: "Unable to load onboarding submissions" },
      { status: 500 },
    );
  }
}
