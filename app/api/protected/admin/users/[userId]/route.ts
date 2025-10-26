import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth/user";
import { canManageUsers, loadUserProfile } from "@/lib/auth/access";
import { setUserActiveState } from "@/lib/db/auth/user";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ userId?: string | string[] }> }
) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let actingProfile;
  try {
    actingProfile = await loadUserProfile(session.user.id);
  } catch (error) {
    console.error("PATCH /protected/admin/users/[userId] failed to load profile", error);
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  if (!canManageUsers(actingProfile)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const resolvedParams = await params;
  const userIdValue = resolvedParams?.userId;
  const userId = Array.isArray(userIdValue) ? userIdValue[0] : userIdValue;
  if (!userId) {
    return NextResponse.json({ ok: false, error: "User ID is required" }, { status: 400 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body" }, { status: 400 });
  }

  const isActiveValue = (payload as Record<string, unknown>)?.isActive;
  if (typeof isActiveValue !== "boolean") {
    return NextResponse.json({ ok: false, error: "isActive must be provided as a boolean" }, { status: 400 });
  }

  if (userId === actingProfile.id && isActiveValue === false) {
    return NextResponse.json({ ok: false, error: "You cannot deactivate your own account" }, { status: 400 });
  }

  try {
    const updated = await setUserActiveState(userId, isActiveValue);
    return NextResponse.json({ ok: true, user: updated });
  } catch (error) {
    console.error("PATCH /protected/admin/users/[userId] failed", error);
    return NextResponse.json(
      { ok: false, error: "Unable to update user status" },
      { status: 500 },
    );
  }
}
