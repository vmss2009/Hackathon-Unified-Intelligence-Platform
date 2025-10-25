import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/user";
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

    return NextResponse.json({
      ok: true,
      submissions: result.entries,
      meta: {
        total: result.total,
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
