import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth/auth";
import {
	getUserProfile,
	updateUserProfile,
} from "@/lib/db/auth/user";

export async function GET() {
	const session = await auth();

	const profile = await getUserProfile(session!.user!.id!);

	if (!profile) {
		return NextResponse.json({ ok: false }, { status: 404 });
	}

	return NextResponse.json({ ok: true, profile });
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
