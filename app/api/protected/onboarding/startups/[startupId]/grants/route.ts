import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth/user";
import {
  createOnboardingGrantOpportunity,
  deleteOnboardingGrantOpportunity,
  getOnboardingGrantCatalog,
  updateOnboardingGrantOpportunity,
} from "@/lib/onboarding/service";
import { OnboardingGrantOpportunityInput } from "@/lib/onboarding/types";

export const dynamic = "force-dynamic";

const ensureAuthenticated = async () => {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("unauthorized");
  }
  return session;
};

const resolveStartupId = async (
  params: Promise<{ startupId?: string | string[] }>
) => {
  const { startupId } = await params;
  return Array.isArray(startupId) ? startupId[0] : startupId;
};

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ startupId?: string | string[] }> }
) {
  try {
    await ensureAuthenticated();
    const startupId = await resolveStartupId(params);
    if (!startupId) {
      return NextResponse.json({ ok: false, error: "Startup id is required" }, { status: 400 });
    }
    const grants = await getOnboardingGrantCatalog(startupId);

    return NextResponse.json({ ok: true, grants });
  } catch (error) {
    if ((error as Error).message === "unauthorized") {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
    console.error("GET /protected/onboarding/startups/[id]/grants failed", error);
    return NextResponse.json(
      { ok: false, error: "Unable to load grant opportunities" },
      { status: 500 },
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ startupId?: string | string[] }> }
) {
  try {
    await ensureAuthenticated();
    const startupId = await resolveStartupId(params);
    if (!startupId) {
      return NextResponse.json({ ok: false, error: "Startup id is required" }, { status: 400 });
    }
    const body = await request.json();
    const opportunity = body?.opportunity as OnboardingGrantOpportunityInput | undefined;

    if (!opportunity?.title || !opportunity.title.trim()) {
      return NextResponse.json({ ok: false, error: "Grant title is required" }, { status: 400 });
    }

    const grants = await createOnboardingGrantOpportunity(startupId, opportunity);

    return NextResponse.json({ ok: true, grants });
  } catch (error) {
    if ((error as Error).message === "unauthorized") {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
    console.error("POST /protected/onboarding/startups/[id]/grants failed", error);
    return NextResponse.json(
      { ok: false, error: (error as Error).message ?? "Unable to create grant opportunity" },
      { status: 500 },
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ startupId?: string | string[] }> }
) {
  try {
    await ensureAuthenticated();
    const startupId = await resolveStartupId(params);
    if (!startupId) {
      return NextResponse.json({ ok: false, error: "Startup id is required" }, { status: 400 });
    }
    const body = await request.json();
    const opportunity = body?.opportunity as OnboardingGrantOpportunityInput | undefined;

    if (!opportunity?.id) {
      return NextResponse.json({ ok: false, error: "Grant identifier is required" }, { status: 400 });
    }

    const grants = await updateOnboardingGrantOpportunity(startupId, opportunity.id, opportunity);

    return NextResponse.json({ ok: true, grants });
  } catch (error) {
    if ((error as Error).message === "unauthorized") {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
    console.error("PUT /protected/onboarding/startups/[id]/grants failed", error);
    return NextResponse.json(
      { ok: false, error: (error as Error).message ?? "Unable to update grant opportunity" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ startupId?: string | string[] }> }
) {
  try {
    await ensureAuthenticated();
    const startupId = await resolveStartupId(params);
    if (!startupId) {
      return NextResponse.json({ ok: false, error: "Startup id is required" }, { status: 400 });
    }
    const body = await request.json();
    const id = body?.opportunityId as string | undefined;

    if (!id) {
      return NextResponse.json({ ok: false, error: "Grant identifier is required" }, { status: 400 });
    }

    const grants = await deleteOnboardingGrantOpportunity(startupId, id);

    return NextResponse.json({ ok: true, grants });
  } catch (error) {
    if ((error as Error).message === "unauthorized") {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
    console.error("DELETE /protected/onboarding/startups/[id]/grants failed", error);
    return NextResponse.json(
      { ok: false, error: (error as Error).message ?? "Unable to delete grant opportunity" },
      { status: 500 },
    );
  }
}
