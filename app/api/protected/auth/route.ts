import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth/auth";
import {
	getUserProfileOrThrow,
	updateUserProfile,
} from "@/lib/db/auth/user";

export async function GET() {
	const session = await auth();

	if (!session?.user?.id) {
		return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
	}

	try {
		const profile = await getUserProfileOrThrow(session.user.id);
		if (!profile.isActive) {
			return NextResponse.json(
				{ ok: false, error: "Account is disabled" },
				{ status: 403 },
			);
		}
		return NextResponse.json({ ok: true, profile });
	} catch (error) {
		console.error("GET /api/protected/auth failed", error);
		return NextResponse.json({ ok: false, error: "Profile not found" }, { status: 404 });
	}
}

export async function PATCH(request: NextRequest) {
	const session = await auth();

	let payload: unknown;

	try {
		payload = await request.json();
	} catch (error) {
		return NextResponse.json({ ok: false, error: "Invalid JSON payload" }, { status: 400 });
	}

	if (typeof payload !== "object" || payload === null) {
		return NextResponse.json({ ok: false, error: "Invalid request body" }, { status: 400 });
	}

	const { name } = payload as {
		name?: unknown;
	};

	const normalize = (value: unknown) => {
		if (typeof value === "string") {
			const trimmed = value.trim();
			return trimmed.length ? trimmed : null;
		}

		if (value === null) {
			return null;
		}

		return undefined;
	};

	const nextName = normalize(name);

	if (nextName === undefined) {
		return NextResponse.json(
			{ ok: false, error: "Nothing to update" },
			{ status: 400 },
		);
	}

	const updated = await updateUserProfile(session!.user!.id!, {
		name: nextName,
	});

	return NextResponse.json({ ok: true, profile: updated });
}
