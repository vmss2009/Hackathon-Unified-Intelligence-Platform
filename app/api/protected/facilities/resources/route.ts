import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth/user";
import { canManageFacilities, loadUserProfile } from "@/lib/auth/access";
import { listFacilityResources, upsertFacilityResource } from "@/lib/facilities/service";
import type { FacilityResourceType } from "@/lib/facilities/types";

export const dynamic = "force-dynamic";

const parseResourceType = (value: unknown): FacilityResourceType => {
  if (value === "meeting_room" || value === "lab" || value === "equipment" || value === "other") {
    return value;
  }
  return "other";
};

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const resources = await listFacilityResources();
    return NextResponse.json({ ok: true, resources });
  } catch (error) {
    console.error("GET /protected/facilities/resources failed", error);
    const message = error instanceof Error ? error.message : "Unable to load facilities";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const profile = await loadUserProfile(session.user.id);
  if (!canManageFacilities(profile)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch (error) {
    return NextResponse.json({ ok: false, error: "Invalid JSON payload" }, { status: 400 });
  }

  const body = payload as Record<string, unknown>;

  try {
    const resource = await upsertFacilityResource({
      id: typeof body.id === "string" && body.id.trim().length ? body.id : undefined,
      type: parseResourceType(body.type),
      name: (body.name as string) ?? "",
      location: typeof body.location === "string" ? body.location : undefined,
      capacity: typeof body.capacity === "number" ? body.capacity : undefined,
      description: typeof body.description === "string" ? body.description : undefined,
      tags: Array.isArray(body.tags) ? (body.tags as string[]) : undefined,
      availability: Array.isArray(body.availability)
        ? (body.availability as Array<{ day: string; startTime: string; endTime: string }>)
        : undefined,
      metadata: (body.metadata ?? undefined) as Record<string, unknown> | null | undefined,
    });

    return NextResponse.json({ ok: true, resource });
  } catch (error) {
    console.error("POST /protected/facilities/resources failed", error);
    const message = error instanceof Error ? error.message : "Unable to save facility";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
