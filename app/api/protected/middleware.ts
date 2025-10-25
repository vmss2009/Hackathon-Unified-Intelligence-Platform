import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/user";

export async function middleware() {
	const session = await auth();

	if (!session?.user?.id) {
		return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
	}

	const response = NextResponse.next();
	return response;
}
