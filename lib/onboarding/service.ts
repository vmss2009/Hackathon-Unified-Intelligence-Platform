import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import s3 from "@/lib/storage/storage";
import {
  OnboardingAttachment,
  OnboardingField,
  OnboardingFieldResponse,
  OnboardingForm,
  OnboardingScoringConfig,
  OnboardingScoringRule,
  OnboardingSubmission,
  OnboardingSubmissionScore,
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
  const form: OnboardingForm = {
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
    scoring: {
      rules: [
        {
          id: "stage-mvp",
          fieldId: "company-stage",
          operator: "equals",
          target: "mvp",
          points: 15,
          label: "Product live at MVP or beyond",
          description: "Founders who have shipped an MVP receive additional weighting.",
        },
        {
          id: "stage-seed",
          fieldId: "company-stage",
          operator: "equals",
          target: "seed",
          points: 20,
          label: "Seed stage traction",
          description: "Seed-ready companies are prioritised for acceleration.",
        },
        {
          id: "stage-growth",
          fieldId: "company-stage",
          operator: "equals",
          target: "growth",
          points: 25,
          label: "Growth stage momentum",
          description: "Growth-stage ventures score highest on readiness.",
        },
        {
          id: "team-size",
          fieldId: "team-size",
          operator: "gte",
          target: "3",
          points: 10,
          label: "Core team in place",
          description: "Teams of three or more receive full marks for execution capacity.",
        },
        {
          id: "traction-keywords",
          fieldId: "traction-summary",
          operator: "contains",
          target: "revenue",
          points: 8,
          label: "Early revenue signals",
          description: "Mentioning revenue, customers, or monetisation boosts the score.",
        },
      ],
      autoRejectBelow: 20,
      autoAdvanceAt: 45,
    },
  };
  return normalizeConfig(form);
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
    return normalizeConfig({
      ...parsed,
      updatedAt: parsed.updatedAt ?? new Date().toISOString(),
    });
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
  const normalized = normalizeConfig(nextForm);

  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: CONFIG_KEY,
      Body: toBuffer(normalized),
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

const ensureNumber = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
};

const normaliseOperator = (
  operator: string,
): OnboardingScoringRule["operator"] => {
  switch (operator) {
    case "contains":
    case "gte":
    case "lte":
      return operator;
    default:
      return "equals";
  }
};

const normaliseRule = (rule: OnboardingScoringRule): OnboardingScoringRule => {
  const points = ensureNumber(rule.points) ?? 0;
  return {
    ...rule,
    id: rule.id || randomUUID(),
    fieldId: rule.fieldId?.trim() ?? "",
    label: rule.label?.trim() || "Scoring rule",
    description: rule.description?.trim() || undefined,
    operator: normaliseOperator(rule.operator),
    target: rule.target?.toString().trim() ?? "",
    points: points >= 0 ? points : 0,
  };
};

const normaliseScoring = (
  scoring?: OnboardingScoringConfig,
): OnboardingScoringConfig => {
  const rules = (scoring?.rules ?? [])
    .map(normaliseRule)
    .filter((rule) => rule.fieldId && rule.target.length > 0 && rule.points > 0);
  const total = rules.reduce((sum, rule) => sum + rule.points, 0);

  const autoRejectBelow = ensureNumber(scoring?.autoRejectBelow);
  const autoAdvanceAt = ensureNumber(scoring?.autoAdvanceAt);

  return {
    rules,
    autoRejectBelow:
      autoRejectBelow !== undefined && autoRejectBelow >= 0 ? autoRejectBelow : undefined,
    autoAdvanceAt:
      autoAdvanceAt !== undefined && autoAdvanceAt >= 0 ? autoAdvanceAt : undefined,
    totalPoints: total,
  };
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
  id: form.id?.trim() || "founders-intake",
  version: Number.isFinite(form.version) ? form.version : 1,
  title: form.title?.trim() || "Founders Intake",
  summary: form.summary?.trim() || "",
  updatedAt: form.updatedAt ?? new Date().toISOString(),
  sections: form.sections.map((section) => ({
    ...section,
    title: section.title.trim(),
    description: section.description?.trim() || undefined,
    fields: section.fields.map(normalizeField),
  })),
  scoring: normaliseScoring(form.scoring),
});

const toValueArray = (value: string | string[] | null): string[] => {
  if (value === null || value === undefined) {
    return [];
  }
  if (Array.isArray(value)) {
    return value
      .map((entry) => (entry ?? "").toString().trim())
      .filter((entry) => entry.length > 0);
  }
  const asString = value.toString().trim();
  return asString.length ? [asString] : [];
};

const parseNumeric = (value: string): number | undefined => {
  const cleaned = value.replace(/[^0-9.+-]/g, "");
  if (!cleaned.length) {
    return undefined;
  }
  const parsed = Number.parseFloat(cleaned);
  if (Number.isFinite(parsed)) {
    return parsed;
  }
  return undefined;
};

const evaluateRuleMatch = (
  rule: OnboardingScoringRule,
  response?: OnboardingFieldResponse,
): { matched: boolean; reason?: string } => {
  if (!response) {
    return { matched: false, reason: "No response provided" };
  }

  const values = toValueArray(response.value);
  if (values.length === 0) {
    return { matched: false, reason: "No value provided" };
  }

  const target = rule.target.toLowerCase();

  switch (rule.operator) {
    case "contains": {
      const matched = values.some((value) => value.toLowerCase().includes(target));
      return matched
        ? { matched: true }
        : { matched: false, reason: `Expected mention of “${rule.target}”` };
    }
    case "gte": {
      const targetValue = ensureNumber(rule.target);
      if (targetValue === undefined) {
        return { matched: false, reason: "Rule threshold invalid" };
      }
      const numbers = values
        .map(parseNumeric)
        .filter((item): item is number => item !== undefined);
      if (!numbers.length) {
        return { matched: false, reason: "Response is not numeric" };
      }
      return numbers.some((value) => value >= targetValue)
        ? { matched: true }
        : { matched: false, reason: `Below ${targetValue}` };
    }
    case "lte": {
      const targetValue = ensureNumber(rule.target);
      if (targetValue === undefined) {
        return { matched: false, reason: "Rule threshold invalid" };
      }
      const numbers = values
        .map(parseNumeric)
        .filter((item): item is number => item !== undefined);
      if (!numbers.length) {
        return { matched: false, reason: "Response is not numeric" };
      }
      return numbers.some((value) => value <= targetValue)
        ? { matched: true }
        : { matched: false, reason: `Above ${targetValue}` };
    }
    case "equals":
    default: {
      const matched = values.some((value) => value.toLowerCase() === target);
      return matched
        ? { matched: true }
        : { matched: false, reason: `Expected “${rule.target}”` };
    }
  }
};

export const evaluateSubmissionScore = (
  form: OnboardingForm,
  responses: OnboardingFieldResponse[],
): OnboardingSubmissionScore | undefined => {
  const scoring = normaliseScoring(form.scoring);
  const breakdown = scoring.rules.map((rule) => {
    const response = responses.find((entry) => entry.fieldId === rule.fieldId);
    const result = evaluateRuleMatch(rule, response);
    return {
      ruleId: rule.id,
      label: rule.label,
      points: rule.points,
      matched: result.matched,
      reason: result.reason,
    };
  });

  const total = scoring.totalPoints ?? breakdown.reduce((sum, entry) => sum + entry.points, 0);

  if (!breakdown.length && scoring.autoAdvanceAt === undefined && scoring.autoRejectBelow === undefined) {
    return undefined;
  }

  const awarded = breakdown.reduce(
    (sum, entry) => (entry.matched ? sum + entry.points : sum),
    0,
  );

  const percentage = total > 0 ? Number(((awarded / total) * 100).toFixed(2)) : 0;

  let status: OnboardingSubmissionScore["status"] = "review";
  if (scoring.autoRejectBelow !== undefined && awarded < scoring.autoRejectBelow) {
    status = "reject";
  } else if (scoring.autoAdvanceAt !== undefined && awarded >= scoring.autoAdvanceAt) {
    status = "advance";
  }

  return {
    total,
    awarded,
    percentage,
    status,
    thresholdAdvance: scoring.autoAdvanceAt,
    thresholdReject: scoring.autoRejectBelow,
    breakdown,
  };
};

export const enrichAttachment = (attachment: OnboardingAttachment): OnboardingAttachment => {
  const endpoint =
    process.env.S3_PUBLIC_ENDPOINT ??
    process.env.S3_PUBLIC_BASE_URL ??
    process.env.S3_ENDPOINT;

  if (!endpoint) {
    return attachment;
  }

  const base = endpoint.replace(/\/$/, "");
  const bucket = getBucketName();
  const baseWithBucket = base.endsWith(`/${bucket}`) ? base : `${base}/${bucket}`;

  return {
    ...attachment,
    url: `${baseWithBucket}/${attachment.key}`,
  };
};
