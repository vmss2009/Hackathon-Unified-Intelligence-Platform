import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth/user";
import { cancelFacilityBooking } from "@/lib/facilities/service";

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest, context: { params?: { bookingId?: string } }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const bookingId = context?.params?.bookingId;
  if (!bookingId) {
    return NextResponse.json({ ok: false, error: "Booking id is required" }, { status: 400 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch (error) {
    payload = null;
  }

  const body = (payload ?? {}) as Record<string, unknown>;
  const reason = typeof body.reason === "string" ? body.reason : undefined;

  try {
    const booking = await cancelFacilityBooking({
      bookingId,
      reason,
      actor: {
        id: session.user.id,
        name: session.user.name ?? undefined,
        email: session.user.email ?? undefined,
      },
    });

    return NextResponse.json({ ok: true, booking });
  } catch (error) {
    console.error(`PATCH /protected/facilities/bookings/${bookingId} failed`, error);
    const message = error instanceof Error ? error.message : "Unable to cancel booking";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
