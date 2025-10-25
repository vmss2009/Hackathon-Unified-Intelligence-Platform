import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/user";
import {
  appendOnboardingAlumniTouchpoint,
  getOnboardingAlumniRecord,
  updateOnboardingAlumniRecord,
} from "@/lib/onboarding/service";
import {
  OnboardingAlumniMetricInput,
  OnboardingAlumniTouchpointInput,
  OnboardingAlumniUpdateInput,
} from "@/lib/onboarding/types";

export const dynamic = "force-dynamic";

const ensureAuthenticated = async () => {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("unauthorized");
  }
  return session;
};

export async function GET(
  _request: NextRequest,
  { params }: { params: { startupId: string } },
) {
  try {
    await ensureAuthenticated();
    const { startupId } = params;
    const alumni = await getOnboardingAlumniRecord(startupId);

    return NextResponse.json({
      ok: true,
      alumni,
    });
  } catch (error) {
    if ((error as Error).message === "unauthorized") {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
    console.error("GET /protected/onboarding/startups/[id]/alumni failed", error);
    return NextResponse.json(
      { ok: false, error: "Unable to load alumni profile" },
      { status: 500 },
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { startupId: string } },
) {
  try {
    await ensureAuthenticated();
    const { startupId } = params;
    const body = await request.json();
    const update = (body?.update ?? {}) as OnboardingAlumniUpdateInput;

    const alumni = await updateOnboardingAlumniRecord(startupId, update);

    return NextResponse.json({
      ok: true,
      alumni,
    });
  } catch (error) {
    if ((error as Error).message === "unauthorized") {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
    console.error("PUT /protected/onboarding/startups/[id]/alumni failed", error);
    return NextResponse.json(
      { ok: false, error: "Unable to save alumni profile" },
      { status: 500 },
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { startupId: string } },
) {
  try {
    const session = await ensureAuthenticated();
    const { startupId } = params;
    const body = await request.json();

    const touchpointPayload = body?.touchpoint;
    if (!touchpointPayload || typeof touchpointPayload !== "object") {
      return NextResponse.json({ ok: false, error: "Touchpoint payload is required" }, { status: 400 });
    }

    const rawTouchpoint = touchpointPayload as OnboardingAlumniTouchpointInput;

    const touchpoint: OnboardingAlumniTouchpointInput = {
      ...rawTouchpoint,
      recordedBy:
        rawTouchpoint.recordedBy ??
        session.user?.name ??
        session.user?.email ??
        session.user?.id,
    };

    const metrics = Array.isArray(body?.metrics)
      ? (body.metrics as OnboardingAlumniMetricInput[])
      : undefined;

    const alumni = await appendOnboardingAlumniTouchpoint(startupId, touchpoint, metrics);

    return NextResponse.json({
      ok: true,
      alumni,
    });
  } catch (error) {
    if ((error as Error).message === "unauthorized") {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
    console.error("POST /protected/onboarding/startups/[id]/alumni failed", error);
    return NextResponse.json(
      { ok: false, error: "Unable to log touchpoint" },
      { status: 500 },
    );
  }
}
