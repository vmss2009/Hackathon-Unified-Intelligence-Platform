import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth/user";
import {
  getGrantDisbursementSnapshot,
  requestGrantDisbursement,
  updateGrantDisbursementStatus,
} from "@/lib/grants/service";
import type {
  GrantDisbursement,
  GrantDisbursementStatus,
  GrantFinancialSummary,
  GrantRecord,
} from "@/lib/grants/types";
import { getOnboardingMilestones } from "@/lib/onboarding/service";
import type { OnboardingMilestonePlanSnapshot } from "@/lib/onboarding/types";

export const dynamic = "force-dynamic";

const VALID_STATUSES: GrantDisbursementStatus[] = [
  "draft",
  "pending",
  "approved",
  "rejected",
  "released",
];

const ensureAuthenticated = async () => {
  const session = await auth();
  const user = session?.user;

  if (!user?.id) {
    throw new Error("unauthorized");
  }

  return {
    id: user.id,
    name: user.name ?? undefined,
    email: user.email ?? undefined,
  };
};

const buildGrantSummary = (grant: GrantRecord, summary: GrantFinancialSummary) => {
  const utilisation = summary.totalReleased > 0
    ? Number(((summary.totalUtilised / summary.totalReleased) * 100).toFixed(1))
    : 0;

  return {
    id: grant.id,
    name: grant.name ?? "Untitled grant",
    fundingAgency: grant.fundingAgency,
    sanctionNumber: grant.sanctionNumber,
    startDate: grant.startDate,
    endDate: grant.endDate,
    currency: grant.currency,
    totalSanctionedAmount: summary.totalSanctioned,
    totalReleased: summary.totalReleased,
    pendingAmount: summary.totalPendingAmount,
    totalUtilised: summary.totalUtilised,
    remainingSanctionBalance: summary.remainingSanctionBalance,
    utilisation,
  };
};

const mapDisbursement = (grantId: string, disbursement: GrantDisbursement) => ({
  id: disbursement.id,
  grantId,
  amount: disbursement.amount,
  date: disbursement.date,
  tranche: disbursement.tranche,
  reference: disbursement.reference,
  milestoneId: disbursement.milestoneId,
  requestedBy: disbursement.requestedBy,
  requestedAt: disbursement.requestedAt,
  targetReleaseDate: disbursement.targetReleaseDate,
  status: disbursement.status,
  approvals: disbursement.approvals.map((approval) => ({
    id: approval.id,
    status: approval.status,
    note: approval.note,
    actorId: approval.actorId,
    actorName: approval.actorName,
    actorEmail: approval.actorEmail,
    decidedAt: approval.decidedAt,
  })),
  releasedAt: disbursement.releasedAt,
  notes: disbursement.notes,
});

const sortDisbursements = (items: GrantDisbursement[]) => {
  const toTimestamp = (input?: string) => {
    if (!input) return 0;
    const time = new Date(input).getTime();
    return Number.isNaN(time) ? 0 : time;
  };

  return [...items].sort((a, b) => {
    const left = toTimestamp(a.requestedAt ?? a.date);
    const right = toTimestamp(b.requestedAt ?? b.date);
    return right - left;
  });
};

const safeMilestones = async (startupId: string): Promise<OnboardingMilestonePlanSnapshot | null> => {
  try {
    return await getOnboardingMilestones(startupId);
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(`Unable to load milestones for ${startupId}`, error);
    }
    return null;
  }
};

const buildDisbursementPayload = async (startupId: string, grantId?: string) => {
  const snapshot = await getGrantDisbursementSnapshot(startupId, grantId);
  const milestones = await safeMilestones(startupId);

  return {
    ok: true,
    grants: snapshot.grants.map((entry) => ({
      id: entry.id,
      name: entry.name ?? "Untitled grant",
    })),
    grant: buildGrantSummary(snapshot.grant, snapshot.summary),
    disbursements: sortDisbursements(snapshot.grant.disbursements).map((entry) =>
      mapDisbursement(snapshot.grant.id, entry),
    ),
    milestones,
  };
};

const toNumber = (value: unknown): number => {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string" && value.trim().length) {
    return Number(value);
  }
  return Number.NaN;
};

const asStatus = (value: unknown): GrantDisbursementStatus | null => {
  if (typeof value !== "string") {
    return null;
  }
  return VALID_STATUSES.includes(value as GrantDisbursementStatus)
    ? (value as GrantDisbursementStatus)
    : null;
};

const normaliseString = (value: unknown): string | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
};

const resolveErrorStatus = (message: string): number => {
  if (message === "Milestone id is required" || message.startsWith("Milestone ")) {
    return 400;
  }
  if (
    message.includes("must be greater than zero") ||
    message.includes("Invalid disbursement status") ||
    message.includes("Released disbursements cannot")
  ) {
    return 400;
  }
  if (message.includes("not found") || message.includes("No grants configured")) {
    return 404;
  }
  return 500;
};

export async function GET(request: NextRequest, context: { params?: { startupId?: string } }) {
  try {
    await ensureAuthenticated();
    const startupId = context?.params?.startupId;
    if (!startupId) {
      return NextResponse.json({ ok: false, error: "Startup id is required" }, { status: 400 });
    }

    const grantId = request.nextUrl.searchParams.get("grantId") ?? undefined;
    const payload = await buildDisbursementPayload(startupId, grantId);
    return NextResponse.json(payload);
  } catch (error) {
    if ((error as Error).message === "unauthorized") {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    console.error("GET /protected/grants/[startupId]/disbursements failed", error);
    const message = error instanceof Error ? error.message : "Unable to load disbursements";
    return NextResponse.json({ ok: false, error: message }, { status: resolveErrorStatus(message) });
  }
}

export async function POST(request: NextRequest, context: { params?: { startupId?: string } }) {
  try {
    const actor = await ensureAuthenticated();
    const startupId = context?.params?.startupId;
    if (!startupId) {
      return NextResponse.json({ ok: false, error: "Startup id is required" }, { status: 400 });
    }

    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch (parseError) {
      return NextResponse.json({ ok: false, error: "Invalid JSON payload" }, { status: 400 });
    }

    const grantId = normaliseString(body.grantId);
    if (!grantId) {
      return NextResponse.json({ ok: false, error: "grantId is required" }, { status: 400 });
    }

    const amount = toNumber(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json(
        { ok: false, error: "amount must be a number greater than zero" },
        { status: 400 },
      );
    }

    await requestGrantDisbursement(startupId, {
      grantId,
      amount,
      milestoneId: normaliseString(body.milestoneId),
      targetReleaseDate: normaliseString(body.targetReleaseDate),
      tranche: normaliseString(body.tranche),
      reference: normaliseString(body.reference),
      notes: normaliseString(body.notes),
      requestedBy: actor,
    });

    const payload = await buildDisbursementPayload(startupId, grantId);
    return NextResponse.json(payload, { status: 201 });
  } catch (error) {
    if ((error as Error).message === "unauthorized") {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    console.error("POST /protected/grants/[startupId]/disbursements failed", error);
    const message = error instanceof Error ? error.message : "Unable to create disbursement";
    return NextResponse.json({ ok: false, error: message }, { status: resolveErrorStatus(message) });
  }
}

export async function PUT(request: NextRequest, context: { params?: { startupId?: string } }) {
  try {
    const actor = await ensureAuthenticated();
    const startupId = context?.params?.startupId;
    if (!startupId) {
      return NextResponse.json({ ok: false, error: "Startup id is required" }, { status: 400 });
    }

    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch (parseError) {
      return NextResponse.json({ ok: false, error: "Invalid JSON payload" }, { status: 400 });
    }

    const grantId = normaliseString(body.grantId);
    const disbursementId = normaliseString(body.disbursementId);
    if (!grantId || !disbursementId) {
      return NextResponse.json(
        { ok: false, error: "grantId and disbursementId are required" },
        { status: 400 },
      );
    }

    const status = asStatus(body.status);
    if (!status) {
      return NextResponse.json({ ok: false, error: "A valid status is required" }, { status: 400 });
    }

    const note = normaliseString(body.note);
    const releaseReference = normaliseString(body.releaseReference);
    const releaseDate = normaliseString(body.releaseDate);

    await updateGrantDisbursementStatus(startupId, {
      grantId,
      disbursementId,
      status,
      note,
      releaseReference,
      releaseDate,
      actor,
    });

    const payload = await buildDisbursementPayload(startupId, grantId);
    return NextResponse.json(payload);
  } catch (error) {
    if ((error as Error).message === "unauthorized") {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    console.error("PUT /protected/grants/[startupId]/disbursements failed", error);
    const message = error instanceof Error ? error.message : "Unable to update disbursement";
    return NextResponse.json({ ok: false, error: message }, { status: resolveErrorStatus(message) });
  }
}
