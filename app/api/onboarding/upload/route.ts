import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import s3 from "@/lib/storage/storage";

const getBucketName = () => {
  const bucket = process.env.S3_ONBOARDING_BUCKET;
  if (!bucket) {
    throw new Error("S3_ONBOARDING_BUCKET is not configured");
  }
  return bucket;
};

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file");
  const applicantId = (formData.get("applicantId") as string | null)?.trim();

  if (!file || !(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "File missing" }, { status: 400 });
  }

  const bucket = getBucketName();
  const fileId = randomUUID();
  const extension = file.name.includes(".") ? `.${file.name.split(".").pop()}` : "";
  const key = `uploads/${applicantId || "public"}/${fileId}${extension}`;
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
      ACL: "public-read",
    }),
  );

  return NextResponse.json({
    ok: true,
    attachment: {
      key,
      name: file.name,
      size: file.size,
      contentType: file.type || "application/octet-stream",
    },
  });
}
