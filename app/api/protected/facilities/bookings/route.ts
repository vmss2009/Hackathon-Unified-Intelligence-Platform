import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth/user";
import { createFacilityBooking, listFacilityBookings } from "@/lib/facilities/service";
import type { FacilityBookingStatus } from "@/lib/facilities/types";

export const dynamic = "force-dynamic";

const parseStatusFilter = (value: string | string[] | null): FacilityBookingStatus | FacilityBookingStatus[] | undefined => {
  const allowed: FacilityBookingStatus[] = ["pending", "confirmed", "cancelled", "completed"];

  if (Array.isArray(value)) {
    const filtered = value.filter((item): item is FacilityBookingStatus => allowed.includes(item as FacilityBookingStatus));
    return filtered.length > 0 ? filtered : undefined;
  }

  if (typeof value === "string" && allowed.includes(value as FacilityBookingStatus)) {
    return value as FacilityBookingStatus;
  }

  return undefined;
};

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const statusParam = searchParams.getAll("status");
  const parsedStatus = parseStatusFilter(statusParam.length > 1 ? statusParam : statusParam[0] ?? null);
  const resourceId = searchParams.get("resourceId") ?? undefined;
  const start = searchParams.get("start") ?? undefined;
  const end = searchParams.get("end") ?? undefined;
  const limitParam = searchParams.get("limit");
  const limit = limitParam ? Number(limitParam) : undefined;

  try {
    const bookings = await listFacilityBookings({ resourceId, status: parsedStatus, start, end, limit });
    return NextResponse.json({ ok: true, bookings });
  } catch (error) {
    console.error("GET /protected/facilities/bookings failed", error);
    const message = error instanceof Error ? error.message : "Unable to load bookings";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch (error) {
    return NextResponse.json({ ok: false, error: "Invalid JSON payload" }, { status: 400 });
  }

  const body = payload as Record<string, unknown>;

  try {
    const booking = await createFacilityBooking({
      resourceId: typeof body.resourceId === "string" ? body.resourceId : "",
      title: typeof body.title === "string" ? body.title : "",
      description: typeof body.description === "string" ? body.description : undefined,
      startTime: typeof body.startTime === "string" ? body.startTime : "",
      endTime: typeof body.endTime === "string" ? body.endTime : "",
      participants: Array.isArray(body.participants) ? (body.participants as string[]) : undefined,
      metadata: (body.metadata ?? undefined) as Record<string, unknown> | undefined,
      actor: {
        id: session.user.id,
        name: session.user.name ?? undefined,
        email: session.user.email ?? undefined,
      },
    });

    return NextResponse.json({ ok: true, booking });
  } catch (error) {
    console.error("POST /protected/facilities/bookings failed", error);
    const message = error instanceof Error ? error.message : "Unable to create booking";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
