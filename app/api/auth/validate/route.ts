import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { getUserByEmail } from "@/lib/db/auth/user";

export async function GET() {
  try {
    const session = await auth();
    const email = session?.user?.email as string | undefined;

    if (!email) {
      return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
    }

    const user = await getUserByEmail(email);
    if (!user) {
      return NextResponse.json({ error: "not_allowed" }, { status: 401 });
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e) {
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
