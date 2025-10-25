import { Buffer } from "node:buffer";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/user";
import {
  listOnboardingDocuments,
  uploadOnboardingDocument,
} from "@/lib/onboarding/service";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: {
    startupId: string;
  };
};

export async function GET(_request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const documents = await listOnboardingDocuments(context.params.startupId);
    return NextResponse.json({ ok: true, documents });
  } catch (error) {
    console.error("GET /protected/onboarding/startups/[id]/documents failed", error);
    return NextResponse.json(
      { ok: false, error: "Unable to list onboarding documents" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  const uploadedBy = formData.get("uploadedBy") as string | null;

  if (!file || !(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "File missing" }, { status: 400 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const document = await uploadOnboardingDocument(context.params.startupId, {
      name: file.name,
      contentType: file.type || "application/octet-stream",
      buffer,
      uploadedBy: uploadedBy ?? session.user.email ?? undefined,
    });

    return NextResponse.json({ ok: true, document });
  } catch (error) {
    console.error("POST /protected/onboarding/startups/[id]/documents failed", error);
    return NextResponse.json(
      { ok: false, error: "Unable to upload onboarding document" },
      { status: 500 },
    );
  }
}
