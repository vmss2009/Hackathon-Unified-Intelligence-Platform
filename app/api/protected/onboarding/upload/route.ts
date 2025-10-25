import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { auth } from "@/lib/auth/user";
import s3 from "@/lib/storage/storage";
import { enrichAttachment } from "@/lib/onboarding/service";

const getBucketName = () => {
  const bucket = process.env.S3_ONBOARDING_BUCKET;
  if (!bucket) {
    throw new Error("S3_ONBOARDING_BUCKET is not configured");
  }
  return bucket;
};

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!file || !(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "File missing" }, { status: 400 });
  }

  const bucket = getBucketName();
  const fileId = randomUUID();
  const extension = file.name.includes(".") ? `.${file.name.split(".").pop()}` : "";
  const key = `uploads/${session.user.id}/${fileId}${extension}`;
  const arrayBuffer = await file.arrayBuffer();

  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: Buffer.from(arrayBuffer),
      ContentType: file.type || "application/octet-stream",
      Metadata: {
        originalName: file.name,
      },
    }),
  );

  const attachment = enrichAttachment({
    key,
    name: file.name,
    size: file.size,
    contentType: file.type || "application/octet-stream",
  });

  return NextResponse.json({ ok: true, attachment });
}
