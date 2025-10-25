import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import s3 from "@/lib/storage/storage";
import {
  OnboardingAttachment,
  OnboardingField,
  OnboardingForm,
  OnboardingSection,
  OnboardingSubmission,
} from "./types";

const CONFIG_KEY = "config.json";

const getBucketName = () => {
  const bucket = process.env.S3_ONBOARDING_BUCKET;
  if (!bucket) {
    throw new Error("S3_ONBOARDING_BUCKET is not configured");
  }
  return bucket;
};

const toBuffer = (value: unknown) =>
  Buffer.from(JSON.stringify(value, null, 2), "utf-8");

const streamToString = async (stream: any): Promise<string> => {
  if (!stream) {
    return "";
  }

  if (typeof stream.transformToString === "function") {
    return stream.transformToString();
  }

  const chunks: Uint8Array[] = [];
  for await (const chunk of stream) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }

  return Buffer.concat(chunks).toString("utf-8");
};

const buildDefaultForm = (): OnboardingForm => {
  const now = new Date().toISOString();
  return {
    id: "founders-initial",
    version: 1,
    title: "Founders Intake",
    summary:
      "Tell us about your venture, the team behind it, and the traction you have achieved so far.",
    updatedAt: now,
    sections: [
      {
        id: "company-overview",
        title: "Company Overview",
        description:
          "Share the essentials so we can understand your vision and current state.",
        fields: [
          {
            id: "company-name",
            label: "Company Name",
            type: "text",
            required: true,
            placeholder: "Acme Innovations",
          },
          {
            id: "company-website",
            label: "Company Website",
            type: "text",
            required: false,
            placeholder: "https://",
          },
          {
            id: "company-stage",
            label: "Current Stage",
            type: "select",
            required: true,
            options: [
              { id: "idea", label: "Idea", value: "idea" },
              { id: "mvp", label: "MVP", value: "mvp" },
              { id: "seed", label: "Seed", value: "seed" },
              { id: "growth", label: "Growth", value: "growth" },
            ],
          },
        ],
      },
      {
        id: "founding-team",
        title: "Founding Team",
        description: "Introduce the people building this company.",
        fields: [
          {
            id: "team-story",
            label: "Founders' Story",
            type: "textarea",
            required: true,
            placeholder: "How did everything begin?",
          },
          {
            id: "team-size",
            label: "Team Size",
            type: "text",
            required: true,
            placeholder: "e.g. 5",
          },
          {
            id: "team-resumes",
            label: "Key Team CVs",
            type: "file",
            required: false,
            description: "Upload resumes or bios for key teammates.",
            multiple: true,
          },
        ],
      },
      {
        id: "traction",
        title: "Traction & Metrics",
        description: "Show us your progress so far.",
        fields: [
          {
            id: "traction-summary",
            label: "Highlights",
            type: "textarea",
            required: true,
            placeholder: "Share growth metrics, partnerships, or product wins.",
          },
          {
            id: "traction-deck",
            label: "Pitch Deck",
            type: "file",
            required: false,
            description: "Upload your most recent pitch deck (PDF preferred).",
          },
        ],
      },
    ],
  };
};

export const getOnboardingConfig = async (): Promise<OnboardingForm> => {
  const bucket = getBucketName();

  try {
    const response = await s3.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: CONFIG_KEY,
      }),
    );
    const raw = await streamToString(response.Body);
    if (!raw) {
      return buildDefaultForm();
    }

    const parsed = JSON.parse(raw) as OnboardingForm;
    return parsed;
  } catch (error: any) {
    if (error?.$metadata?.httpStatusCode === 404) {
      return buildDefaultForm();
    }
    if (error?.name === "NoSuchKey") {
      return buildDefaultForm();
    }
    console.error("Failed to read onboarding config", error);
    throw new Error("Unable to load onboarding configuration");
  }
};

export const saveOnboardingConfig = async (
  form: OnboardingForm,
): Promise<void> => {
  const bucket = getBucketName();
  const nextForm: OnboardingForm = {
    ...form,
    updatedAt: new Date().toISOString(),
  };

  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: CONFIG_KEY,
      Body: toBuffer(nextForm),
      ContentType: "application/json",
    }),
  );
};

export const saveOnboardingSubmission = async (
  submission: Omit<OnboardingSubmission, "id" | "submittedAt">,
): Promise<OnboardingSubmission> => {
  const bucket = getBucketName();
  const id = randomUUID();
  const submittedAt = new Date().toISOString();
  const record: OnboardingSubmission = {
    id,
    submittedAt,
    ...submission,
  };

  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: `submissions/${submission.userId}/${id}.json`,
      Body: toBuffer(record),
      ContentType: "application/json",
    }),
  );

  return record;
};

export const normalizeField = (field: OnboardingField): OnboardingField => ({
  ...field,
  description: field.description?.trim() || undefined,
  placeholder: field.placeholder?.trim() || undefined,
  options:
    field.type === "select"
      ? field.options?.map((option) => ({
          ...option,
          label: option.label.trim(),
          value: option.value.trim(),
        })) ?? []
      : undefined,
});

export const normalizeConfig = (form: OnboardingForm): OnboardingForm => ({
  ...form,
  title: form.title.trim(),
  summary: form.summary.trim(),
  sections: form.sections.map((section) => ({
    ...section,
    title: section.title.trim(),
    description: section.description?.trim() || undefined,
    fields: section.fields.map(normalizeField),
  })),
});

export const enrichAttachment = (attachment: OnboardingAttachment): OnboardingAttachment => {
  const publicBase = process.env.S3_PUBLIC_BASE_URL;
  if (!publicBase) {
    return attachment;
  }

  return {
    ...attachment,
    url: `${publicBase.replace(/\/$/, "")}/${attachment.key}`,
  };
};
