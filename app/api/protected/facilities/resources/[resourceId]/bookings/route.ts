import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth/user";
import { listFacilityBookings } from "@/lib/facilities/service";
import type { FacilityBookingStatus } from "@/lib/facilities/types";

export const dynamic = "force-dynamic";

const parseStatus = (value: unknown): FacilityBookingStatus | undefined => {
  if (value === "pending" || value === "confirmed" || value === "cancelled" || value === "completed") {
    return value;
  }
  return undefined;
};

export async function GET(request: NextRequest, context: { params?: { resourceId?: string } }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const resourceId = context?.params?.resourceId;
  if (!resourceId) {
    return NextResponse.json({ ok: false, error: "Resource id required" }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const status = parseStatus(searchParams.get("status"));
  const start = searchParams.get("start") ?? undefined;
  const end = searchParams.get("end") ?? undefined;

  try {
    const bookings = await listFacilityBookings({ resourceId, status, start, end });
    return NextResponse.json({ ok: true, bookings });
  } catch (error) {
    console.error(`GET /protected/facilities/resources/${resourceId}/bookings failed`, error);
    const message = error instanceof Error ? error.message : "Unable to load bookings";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
