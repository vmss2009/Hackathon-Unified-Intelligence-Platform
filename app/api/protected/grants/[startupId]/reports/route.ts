import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth/user";
import { generateGrantReports, getGrantCatalog } from "@/lib/grants/service";
import type { GrantReportRequest, GrantReportWindow } from "@/lib/grants/types";

export const dynamic = "force-dynamic";

const asWindow = (value: unknown): GrantReportWindow | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const start = (value as Record<string, unknown>).start;
  const end = (value as Record<string, unknown>).end;
  if (typeof start !== "string" || typeof end !== "string") {
    return null;
  }

  return { start, end };
};

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

  const period = asWindow(payload.period);
  if (!period) {
    return NextResponse.json({ ok: false, error: "A valid reporting period is required" }, { status: 400 });
  }

  const issuedBy = typeof payload.issuedBy === "string" && payload.issuedBy.trim().length > 0
    ? payload.issuedBy.trim()
    : session.user.name ?? session.user.email ?? session.user.id;
  const issuedAt = typeof payload.issuedAt === "string" && payload.issuedAt.trim().length > 0 ? payload.issuedAt : undefined;
  const certificateNumber = typeof payload.certificateNumber === "string" && payload.certificateNumber.trim().length > 0
    ? payload.certificateNumber.trim()
    : undefined;
  const preparedBy = typeof payload.preparedBy === "string" && payload.preparedBy.trim().length > 0 ? payload.preparedBy.trim() : undefined;
  const verifiedBy = typeof payload.verifiedBy === "string" && payload.verifiedBy.trim().length > 0 ? payload.verifiedBy.trim() : undefined;

  const requestDescriptor: GrantReportRequest = {
    grantId,
    period,
    issuedBy,
    issuedAt,
    certificateNumber,
    preparedBy,
    verifiedBy,
  };

  try {
    const catalogRecord = await getGrantCatalog(startupId);
    const reports = generateGrantReports(catalogRecord.catalog, requestDescriptor);

    return NextResponse.json({ ok: true, reports });
  } catch (error) {
    console.error(`POST /protected/grants/${startupId}/reports failed`, error);
    const message = error instanceof Error ? error.message : "Unable to generate grant reports";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
