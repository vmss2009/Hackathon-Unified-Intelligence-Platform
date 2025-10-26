import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth/user";
import { cancelFacilityBooking, reviewFacilityBooking } from "@/lib/facilities/service";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ bookingId?: string | string[] }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { bookingId: bookingIdValue } = await params;
  const bookingId = Array.isArray(bookingIdValue) ? bookingIdValue[0] : bookingIdValue;
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
  const action = typeof body.action === "string" ? body.action : undefined;

  if (action === "approve" || action === "reject") {
    try {
      const booking = await reviewFacilityBooking({
        bookingId,
        decision: action,
        note: typeof body.note === "string" ? body.note : undefined,
        actor: {
          id: session.user.id,
          name: session.user.name ?? undefined,
          email: session.user.email ?? undefined,
        },
      });

      return NextResponse.json({ ok: true, booking });
    } catch (error) {
      console.error(`PATCH /protected/facilities/bookings/${bookingId} review failed`, error);
      const message = error instanceof Error ? error.message : "Unable to review booking";
      return NextResponse.json({ ok: false, error: message }, { status: 400 });
    }
  }

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
