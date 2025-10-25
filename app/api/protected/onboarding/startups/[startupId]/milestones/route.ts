import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth/user";
import {
  applyMilestoneUpdates,
  createOnboardingMilestone,
  getOnboardingMilestones,
} from "@/lib/onboarding/service";
import { OnboardingMilestoneUpdateInput } from "@/lib/onboarding/types";

export const dynamic = "force-dynamic";

const ensureAuthenticated = async () => {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("unauthorized");
  }
  return session;
};

export async function GET(_request: NextRequest, context: any) {
  try {
    await ensureAuthenticated();
    const startupId = context?.params?.startupId;
    if (!startupId) {
      return NextResponse.json({ ok: false, error: "Startup id is required" }, { status: 400 });
    }
    const plan = await getOnboardingMilestones(startupId);

    return NextResponse.json({
      ok: true,
      milestones: plan,
    });
  } catch (error) {
    if ((error as Error).message === "unauthorized") {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
    console.error("GET /protected/onboarding/startups/[id]/milestones failed", error);
    return NextResponse.json(
      { ok: false, error: "Unable to load milestone plan" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest, context: any) {
  try {
    const session = await ensureAuthenticated();
    const startupId = context?.params?.startupId;
    if (!startupId) {
      return NextResponse.json({ ok: false, error: "Startup id is required" }, { status: 400 });
    }
    const body = await request.json();
    const milestone = body?.milestone;

    if (!milestone?.title) {
      return NextResponse.json(
        { ok: false, error: "Milestone title is required" },
        { status: 400 },
      );
    }

    const author = body?.author ?? session.user?.name ?? session.user?.email ?? session.user?.id;
    const plan = await createOnboardingMilestone(startupId, milestone, author);

    return NextResponse.json({
      ok: true,
      milestones: plan,
    });
  } catch (error) {
    if ((error as Error).message === "unauthorized") {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
    console.error("POST /protected/onboarding/startups/[id]/milestones failed", error);
    return NextResponse.json(
      { ok: false, error: "Unable to create milestone" },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest, context: any) {
  try {
    const session = await ensureAuthenticated();
    const startupId = context?.params?.startupId;
    if (!startupId) {
      return NextResponse.json({ ok: false, error: "Startup id is required" }, { status: 400 });
    }
    const body = await request.json();
    const updates = Array.isArray(body?.updates) ? (body.updates as OnboardingMilestoneUpdateInput[]) : [];

    if (!updates.length) {
      return NextResponse.json(
        { ok: false, error: "No updates provided" },
        { status: 400 },
      );
    }

    const author = body?.author ?? session.user?.name ?? session.user?.email ?? session.user?.id;
    const plan = await applyMilestoneUpdates(startupId, updates, author);

    return NextResponse.json({
      ok: true,
      milestones: plan,
    });
  } catch (error) {
    if ((error as Error).message === "unauthorized") {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
    console.error("PUT /protected/onboarding/startups/[id]/milestones failed", error);
    return NextResponse.json(
      { ok: false, error: "Unable to update milestone" },
      { status: 500 },
    );
  }
}
