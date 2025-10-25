import { NextResponse } from "next/server";
import {
  enrichAttachment,
  evaluateSubmissionScore,
  getOnboardingConfig,
  saveOnboardingSubmission,
} from "@/lib/onboarding/service";
import { OnboardingFieldResponse } from "@/lib/onboarding/types";

export const dynamic = "force-dynamic";

type SubmissionPayload = {
  formId: string;
  responses: OnboardingFieldResponse[];
  applicantId?: string;
};

export async function POST(request: Request) {
  let payload: SubmissionPayload;

  try {
    payload = (await request.json()) as SubmissionPayload;
  } catch (error) {
    return NextResponse.json({ ok: false, error: "Invalid JSON payload" }, { status: 400 });
  }

  if (!payload.formId) {
    return NextResponse.json({ ok: false, error: "Form ID missing" }, { status: 400 });
  }

  if (!Array.isArray(payload.responses)) {
    return NextResponse.json({ ok: false, error: "Responses missing" }, { status: 400 });
  }

  const userId = payload.applicantId?.trim() || "public";

  try {
    const enrichedResponses = payload.responses.map((response) => ({
      ...response,
      attachments: response.attachments?.map(enrichAttachment),
    }));

    const form = await getOnboardingConfig();
    const score = form.id === payload.formId ? evaluateSubmissionScore(form, enrichedResponses) : undefined;

    const record = await saveOnboardingSubmission({
      userId,
      formId: payload.formId,
      responses: enrichedResponses,
      score,
    });

    return NextResponse.json({ ok: true, submission: record });
  } catch (error) {
    console.error("POST /api/onboarding/submit failed", error);
    return NextResponse.json(
      { ok: false, error: "Unable to save onboarding submission" },
      { status: 500 },
    );
  }
}
