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

	const { firstName, lastName } = payload as {
		firstName?: unknown;
		lastName?: unknown;
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

	const nextFirstName = normalize(firstName);
	const nextLastName = normalize(lastName);

	if (nextFirstName === undefined && nextLastName === undefined) {
		return NextResponse.json(
			{ ok: false, error: "Nothing to update" },
			{ status: 400 },
		);
	}

	const updated = await updateUserProfile(session!.user!.id!, {
		firstName: nextFirstName,
		lastName: nextLastName,
	});

	return NextResponse.json({ ok: true, profile: updated });
}
