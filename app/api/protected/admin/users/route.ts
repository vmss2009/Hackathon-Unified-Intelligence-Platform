import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/user";
import { canManageUsers, loadUserProfile } from "@/lib/auth/access";
import {
  listUserProfiles,
  upsertUserProfile,
  type AppPermission,
  type UpsertUserInput,
} from "@/lib/db/auth/user";

export const dynamic = "force-dynamic";

const ADMIN_PERMISSIONS: AppPermission[] = [
  "admin:manage",
  "onboarding:manage",
  "forms:configure",
  "grants:approve",
  "grants:review",
  "facilities:manage",
];

const INCUBATEE_PERMISSIONS: AppPermission[] = [
  "onboarding:view_self",
  "grants:view_self",
  "facilities:book",
];

const normalizeEmail = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim().toLowerCase();
  return trimmed.length ? trimmed : null;
};

const normalizeName = (value: unknown): string | null => {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

const normalizeRole = (value: unknown): string | null => {
  const normalized = normalizeName(value);
  return normalized ? normalized.toLowerCase() : null;
};

const normalizeStringArray = (value: unknown): string[] => {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return Array.from(
      new Set(
        value
          .filter((entry): entry is string => typeof entry === "string")
          .map((entry) => entry.trim())
          .filter((entry) => entry.length > 0),
      ),
    );
  }

  if (typeof value === "string") {
    return value
      .split(/[,\n]/)
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  }

  return [];
};

export async function GET() {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let profile;
  try {
    profile = await loadUserProfile(session.user.id);
  } catch (error) {
    console.error("GET /protected/admin/users failed to load profile", error);
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  if (!canManageUsers(profile)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  try {
    const users = await listUserProfiles();
    return NextResponse.json({ ok: true, users });
  } catch (error) {
    console.error("GET /protected/admin/users failed", error);
    return NextResponse.json(
      { ok: false, error: "Unable to load users" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let profile;
  try {
    profile = await loadUserProfile(session.user.id);
  } catch (error) {
    console.error("POST /protected/admin/users failed to load profile", error);
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  if (!canManageUsers(profile)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body" }, { status: 400 });
  }

  const email = normalizeEmail((payload as Record<string, unknown>)?.email);
  const name = normalizeName((payload as Record<string, unknown>)?.name);
  const role = normalizeRole((payload as Record<string, unknown>)?.role);
  const phone = normalizeName((payload as Record<string, unknown>)?.phone);
  const startupIds = normalizeStringArray((payload as Record<string, unknown>)?.startupIds);
  const isActiveValue = (payload as Record<string, unknown>)?.isActive;
  const isActive = typeof isActiveValue === "boolean" ? isActiveValue : undefined;

  if (!email) {
    return NextResponse.json({ ok: false, error: "Email is required" }, { status: 400 });
  }

  if (!role || (role !== "admin" && role !== "incubatee")) {
    return NextResponse.json({ ok: false, error: "Role must be 'admin' or 'incubatee'" }, { status: 400 });
  }

  if (isActive === false && email === profile.email) {
    return NextResponse.json({ ok: false, error: "You cannot deactivate your own account" }, { status: 400 });
  }

  const input: UpsertUserInput = {
    email,
    name,
    phone,
    role,
    permissions: role === "admin" ? ADMIN_PERMISSIONS : INCUBATEE_PERMISSIONS,
    startupIds: role === "incubatee" ? startupIds : [],
    isActive,
  };

  try {
    const created = await upsertUserProfile(input);
    return NextResponse.json({ ok: true, user: created });
  } catch (error) {
    console.error("POST /protected/admin/users failed", error);
    return NextResponse.json(
      { ok: false, error: "Unable to create or update user" },
      { status: 500 },
    );
  }
}
