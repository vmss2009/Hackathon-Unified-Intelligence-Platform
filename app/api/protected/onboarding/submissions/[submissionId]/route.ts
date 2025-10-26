import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth/user";
import {
  clearManualSubmissionScore,
  getOnboardingConfig,
  setManualSubmissionScore,
  summarizeOnboardingSubmission,
} from "@/lib/onboarding/service";
import { loadUserProfile, canReviewOnboarding } from "@/lib/auth/access";
import type { OnboardingSubmissionScore } from "@/lib/onboarding/types";

export const dynamic = "force-dynamic";

const isValidStatus = (value: unknown): value is OnboardingSubmissionScore["status"] => {
  return value === "advance" || value === "review" || value === "reject";
};

const toNumber = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ submissionId?: string | string[] }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let profile;
  try {
    profile = await loadUserProfile(session.user.id);
  } catch (error) {
    console.error("PATCH /protected/onboarding/submissions profile load failed", error);
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  if (!canReviewOnboarding(profile)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const { submissionId: submissionIdValue } = await params;
  const submissionId = Array.isArray(submissionIdValue) ? submissionIdValue[0] : submissionIdValue;
  if (!submissionId) {
    return NextResponse.json({ ok: false, error: "Submission id is required" }, { status: 400 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch (error) {
    return NextResponse.json({ ok: false, error: "Invalid JSON payload" }, { status: 400 });
  }

  const clearOverride = payload.clearOverride === true;

  try {
    const form = await getOnboardingConfig();

    if (clearOverride) {
      const updated = await clearManualSubmissionScore(submissionId);
      const summary = summarizeOnboardingSubmission(form, updated);
      return NextResponse.json({ ok: true, submission: summary });
    }

    const rawStatus = payload.status;
    if (!isValidStatus(rawStatus)) {
      return NextResponse.json({ ok: false, error: "Invalid status" }, { status: 400 });
    }

    const awarded = toNumber(payload.awarded);
    if (awarded === undefined) {
      return NextResponse.json({ ok: false, error: "Awarded score is required" }, { status: 400 });
    }

    const total = toNumber(payload.total);
    const percentage = toNumber(payload.percentage);
    const breakdown = Array.isArray(payload.breakdown) ? (payload.breakdown as OnboardingSubmissionScore["breakdown"]) : undefined;
    const note = typeof payload.note === "string" ? payload.note : undefined;

    const updated = await setManualSubmissionScore(submissionId, session.user.id, {
      status: rawStatus,
      awarded,
      total,
      percentage,
      breakdown,
      note,
    });

    const summary = summarizeOnboardingSubmission(form, updated);
    return NextResponse.json({ ok: true, submission: summary });
  } catch (error) {
    console.error(`PATCH /protected/onboarding/submissions/${submissionId} failed`, error);
    return NextResponse.json(
      { ok: false, error: "Unable to update submission score" },
      { status: 500 },
    );
  }
}
