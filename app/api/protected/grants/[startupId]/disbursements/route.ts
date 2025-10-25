import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth/user";
import { listGrantDisbursements, requestGrantDisbursement } from "@/lib/grants/service";

export const dynamic = "force-dynamic";

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

export async function GET(request: NextRequest, context: { params?: { startupId?: string } }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const startupId = context?.params?.startupId;
  if (!startupId) {
    return NextResponse.json({ ok: false, error: "Startup id is required" }, { status: 400 });
  }

  try {
    const result = await listGrantDisbursements(startupId);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error(`GET /protected/grants/${startupId}/disbursements failed`, error);
    const message = error instanceof Error ? error.message : "Unable to load disbursements";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest, context: { params?: { startupId?: string } }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const startupId = context?.params?.startupId;
  if (!startupId) {
    return NextResponse.json({ ok: false, error: "Startup id is required" }, { status: 400 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch (error) {
    return NextResponse.json({ ok: false, error: "Invalid JSON payload" }, { status: 400 });
  }

  const grantId = typeof payload.grantId === "string" && payload.grantId.trim().length > 0 ? payload.grantId.trim() : null;
  if (!grantId) {
    return NextResponse.json({ ok: false, error: "grantId is required" }, { status: 400 });
  }

  const amount = toNumber(payload.amount);
  if (amount === undefined) {
    return NextResponse.json({ ok: false, error: "amount is required" }, { status: 400 });
  }

  const milestoneId = typeof payload.milestoneId === "string" && payload.milestoneId.trim().length
    ? payload.milestoneId.trim()
    : undefined;
  const tranche = typeof payload.tranche === "string" && payload.tranche.trim().length ? payload.tranche.trim() : undefined;
  const reference = typeof payload.reference === "string" && payload.reference.trim().length ? payload.reference.trim() : undefined;
  const targetReleaseDate = typeof payload.targetReleaseDate === "string" && payload.targetReleaseDate.trim().length
    ? payload.targetReleaseDate.trim()
    : undefined;
  const notes = typeof payload.notes === "string" && payload.notes.trim().length ? payload.notes.trim() : undefined;

  try {
    const result = await requestGrantDisbursement(startupId, {
      grantId,
      amount,
      milestoneId,
      tranche,
      reference,
      targetReleaseDate,
      notes,
      requestedBy: {
        id: session.user.id,
        name: session.user.name ?? undefined,
        email: session.user.email ?? undefined,
      },
    });

    return NextResponse.json({ ok: true, disbursement: result.disbursement, grantId: result.grantId });
  } catch (error) {
    console.error(`POST /protected/grants/${startupId}/disbursements failed`, error);
    const message = error instanceof Error ? error.message : "Unable to create disbursement";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
