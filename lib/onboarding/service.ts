import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import {
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import s3 from "@/lib/storage/storage";
import {
  OnboardingAttachment,
  OnboardingField,
  OnboardingFieldResponse,
  OnboardingForm,
  OnboardingScoringConfig,
  OnboardingScoringRule,
  OnboardingChecklist,
  OnboardingChecklistItem,
  OnboardingChecklistStatus,
  OnboardingDocument,
  OnboardingSection,
  OnboardingSubmission,
  OnboardingSubmissionScore,
  OnboardingSubmissionFilters,
  OnboardingSubmissionResolvedField,
  OnboardingSubmissionSummary,
} from "./types";

const CONFIG_KEY = "config.json";
const SUBMISSION_PREFIX = "submissions/";
const CHECKLIST_PREFIX = "checklists/";
const DOCUMENTS_PREFIX = "documents/";

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
      Key: `${SUBMISSION_PREFIX}${submission.userId}/${id}.json`,
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

const listSubmissionKeys = async (bucket: string): Promise<string[]> => {
  const keys: string[] = [];
  let continuationToken: string | undefined;

  do {
    const response = await s3.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: SUBMISSION_PREFIX,
        ContinuationToken: continuationToken,
      }),
    );

    (response.Contents ?? []).forEach((object) => {
      if (object.Key && object.Key.endsWith(".json")) {
        keys.push(object.Key);
      }
    });

    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
  } while (continuationToken);

  return keys;
};

const buildFieldRegistry = (form: OnboardingForm) => {
  const registry = new Map<string, { field: OnboardingField; section: OnboardingSection }>();
  form.sections.forEach((section) => {
    section.fields.forEach((field) => {
      registry.set(field.id, { field, section });
    });
  });
  return registry;
};

const guessStageFieldId = (registry: Map<string, { field: OnboardingField; section: OnboardingSection }>) => {
  for (const [fieldId, meta] of registry.entries()) {
    const { field } = meta;
    if (field.type !== "select") {
      continue;
    }
    if (fieldId.includes("stage")) {
      return fieldId;
    }
    if (/stage/i.test(field.label)) {
      return fieldId;
    }
  }
  return undefined;
};

const guessNameFieldId = (registry: Map<string, { field: OnboardingField; section: OnboardingSection }>) => {
  for (const [fieldId, meta] of registry.entries()) {
    const { field } = meta;
    if (field.type !== "text" && field.type !== "textarea") {
      continue;
    }
    if (fieldId.includes("name")) {
      return fieldId;
    }
    if (/company/i.test(field.label) && /name/i.test(field.label)) {
      return fieldId;
    }
  }
  return undefined;
};

const resolveResponse = (
  response: OnboardingFieldResponse,
  registry: Map<string, { field: OnboardingField; section: OnboardingSection }>,
): OnboardingSubmissionResolvedField => {
  const meta = registry.get(response.fieldId);
  const base: OnboardingSubmissionResolvedField = {
    fieldId: response.fieldId,
    label: meta?.field.label ?? response.fieldId,
    type: meta?.field.type ?? "text",
    value: response.value,
    attachments: response.attachments?.map(enrichAttachment),
  };
  return base;
};

const responseToStrings = (value: string | string[] | null): string[] => {
  if (value === null || value === undefined) {
    return [];
  }
  if (Array.isArray(value)) {
    return value.filter((item) => typeof item === "string" && item.trim().length > 0);
  }
  if (typeof value === "string") {
    return value.trim().length ? [value] : [];
  }
  return [];
};

const matchesQuery = (submission: OnboardingSubmissionSummary, query: string): boolean => {
  const lowered = query.toLowerCase();
  const haystack: string[] = [];

  if (submission.companyName) {
    haystack.push(submission.companyName);
  }
  submission.responses.forEach((response) => {
    responseToStrings(response.value).forEach((value) => haystack.push(value));
    response.attachments?.forEach((attachment) => {
      if (attachment.name) {
        haystack.push(attachment.name);
      }
    });
  });

  return haystack.some((value) => value.toLowerCase().includes(lowered));
};

const buildSubmissionSummary = (
  record: OnboardingSubmission,
  resolvedResponses: OnboardingSubmissionResolvedField[],
  stageFieldMeta: OnboardingField | undefined,
  stageFieldId: string | undefined,
  nameFieldId: string | undefined,
): OnboardingSubmissionSummary => {
  const stageResponse = stageFieldId
    ? resolvedResponses.find((response) => response.fieldId === stageFieldId)
    : undefined;
  const nameResponse = nameFieldId
    ? resolvedResponses.find((response) => response.fieldId === nameFieldId)
    : undefined;

  const stageValues = responseToStrings(stageResponse?.value ?? null);
  const stageValue = stageValues[0];
  const stageLabel = stageValue
    ? stageFieldMeta?.options?.find((option) => option.value === stageValue)?.label ?? stageValue
    : undefined;
  const companyName = responseToStrings(nameResponse?.value ?? null)[0];
  const status = record.score?.status ?? "review";

  return {
    id: record.id,
    formId: record.formId,
    userId: record.userId,
    submittedAt: record.submittedAt,
    score: record.score,
    status,
    companyName,
    companyStage:
      stageValue !== undefined
        ? {
            value: stageValue,
            label: stageLabel,
          }
        : undefined,
    responses: resolvedResponses,
  };
};

export const listOnboardingSubmissions = async (
  form: OnboardingForm,
  filters: OnboardingSubmissionFilters = {},
) => {
  const bucket = getBucketName();
  const keys = await listSubmissionKeys(bucket);
  const registry = buildFieldRegistry(form);
  const stageFieldId = guessStageFieldId(registry);
  const nameFieldId = guessNameFieldId(registry);
  const stageFieldMeta = stageFieldId ? registry.get(stageFieldId)?.field : undefined;

  const submissions: OnboardingSubmissionSummary[] = [];

  for (const key of keys) {
    try {
      const object = await s3.send(
        new GetObjectCommand({
          Bucket: bucket,
          Key: key,
        }),
      );
      const raw = await streamToString(object.Body);
      if (!raw) {
        continue;
      }
      const record = JSON.parse(raw) as OnboardingSubmission;

      const resolvedResponses = (record.responses ?? []).map((response) =>
        resolveResponse(response, registry),
      );

      submissions.push(
        buildSubmissionSummary(
          record,
          resolvedResponses,
          stageFieldMeta,
          stageFieldId,
          nameFieldId,
        ),
      );
    } catch (error) {
      console.error(`Failed to load submission ${key}`, error);
    }
  }

  const stageOptions = stageFieldMeta?.options ?? [];

  const minScoreFilter = filters.minScore;
  const maxScoreFilter = filters.maxScore;
  const queryFilter = filters.query?.trim().toLowerCase();
  const statusFilter = filters.status;
  const stageFilter = filters.stage?.trim();

  const filtered = submissions.filter((submission) => {
    const awarded = submission.score?.awarded ?? 0;

    if (statusFilter && submission.status !== statusFilter) {
      return false;
    }

    if (stageFilter && submission.companyStage?.value !== stageFilter) {
      return false;
    }

    if (minScoreFilter !== undefined && awarded < minScoreFilter) {
      return false;
    }

    if (maxScoreFilter !== undefined && awarded > maxScoreFilter) {
      return false;
    }

    if (queryFilter && !matchesQuery(submission, queryFilter)) {
      return false;
    }

    return true;
  });

  filtered.sort((a, b) => {
    const aDate = new Date(a.submittedAt).getTime();
    const bDate = new Date(b.submittedAt).getTime();
    return bDate - aDate;
  });

  const scoreValues = filtered.map((submission) => submission.score?.awarded ?? 0);
  const scoreMin = scoreValues.length ? Math.min(...scoreValues) : 0;
  const scoreMax = scoreValues.length ? Math.max(...scoreValues) : 0;

  return {
    entries: filtered,
    total: filtered.length,
    stageFieldId,
    stageOptions,
    scoreRange: {
      min: scoreMin,
      max: scoreMax,
    },
  };
};

const sanitizeFileName = (name: string) =>
  name
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .substring(0, 120) || "document";

const ensureChecklistStatus = (status: string | undefined): OnboardingChecklistStatus => {
  switch (status) {
    case "in_progress":
    case "complete":
      return status;
    default:
      return "pending";
  }
};

const normalizeChecklistItem = (item: Partial<OnboardingChecklistItem>): OnboardingChecklistItem => {
  const now = new Date().toISOString();
  return {
    id: item.id ?? randomUUID(),
    title: item.title?.trim() || "Onboarding task",
    description: item.description?.trim() || undefined,
    status: ensureChecklistStatus(item.status as OnboardingChecklistStatus),
    dueDate: item.dueDate ?? undefined,
    updatedAt: item.updatedAt ?? now,
    completedAt: item.completedAt ?? undefined,
  };
};

const normalizeChecklist = (startupId: string, checklist?: Partial<OnboardingChecklist>): OnboardingChecklist => {
  const createdAt = checklist?.createdAt ?? new Date().toISOString();
  const items = (checklist?.items ?? []).map(normalizeChecklistItem);
  return {
    startupId,
    createdAt,
    updatedAt: checklist?.updatedAt ?? createdAt,
    notes: checklist?.notes?.trim() || undefined,
    items,
  };
};

const checklistTemplate = (startupId: string): OnboardingChecklist => {
  const now = new Date();
  const iso = (days: number) => new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
  return normalizeChecklist(startupId, {
    startupId,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    items: [
      {
        id: randomUUID(),
        title: "Schedule onboarding kickoff call",
        description: "Align with founders on expectations, milestones, and support structure.",
        status: "pending",
        dueDate: iso(3),
        updatedAt: now.toISOString(),
      },
      {
        id: randomUUID(),
        title: "Upload incorporation documents",
        description: "Certificate of incorporation and board resolution for incubator participation.",
        status: "pending",
        dueDate: iso(5),
        updatedAt: now.toISOString(),
      },
      {
        id: randomUUID(),
        title: "Submit founders KYC",
        description: "Government ID and address proof for all founders and key signatories.",
        status: "pending",
        dueDate: iso(7),
        updatedAt: now.toISOString(),
      },
      {
        id: randomUUID(),
        title: "Share banking details",
        description: "Provide cancelled cheque and bank account information for disbursements.",
        status: "pending",
        dueDate: iso(10),
        updatedAt: now.toISOString(),
      },
      {
        id: randomUUID(),
        title: "Upload latest pitch deck",
        description: "Ensure mentors and investors access the most recent narrative.",
        status: "pending",
        dueDate: iso(14),
        updatedAt: now.toISOString(),
      },
    ],
  });
};

export const getOnboardingSubmissionDetail = async (
  form: OnboardingForm,
  submissionId: string,
  userId: string,
): Promise<OnboardingSubmissionSummary | null> => {
  const bucket = getBucketName();
  const key = `${SUBMISSION_PREFIX}${userId}/${submissionId}.json`;
  try {
    const object = await s3.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      }),
    );
    const raw = await streamToString(object.Body);
    if (!raw) {
      return null;
    }

    const record = JSON.parse(raw) as OnboardingSubmission;
    const registry = buildFieldRegistry(form);
    const stageFieldId = guessStageFieldId(registry);
    const nameFieldId = guessNameFieldId(registry);
    const stageFieldMeta = stageFieldId ? registry.get(stageFieldId)?.field : undefined;
    const resolvedResponses = (record.responses ?? []).map((response) =>
      resolveResponse(response, registry),
    );

    return buildSubmissionSummary(
      record,
      resolvedResponses,
      stageFieldMeta,
      stageFieldId,
      nameFieldId,
    );
  } catch (error: any) {
    if (error?.$metadata?.httpStatusCode === 404 || error?.name === "NoSuchKey") {
      return null;
    }
    console.error("Failed to load onboarding submission", error);
    throw new Error("Unable to load onboarding submission");
  }
};

export const getOnboardingChecklist = async (
  startupId: string,
): Promise<OnboardingChecklist> => {
  const bucket = getBucketName();
  const key = `${CHECKLIST_PREFIX}${startupId}.json`;

  try {
    const object = await s3.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      }),
    );
    const raw = await streamToString(object.Body);
    if (!raw) {
      return checklistTemplate(startupId);
    }
    const parsed = JSON.parse(raw) as OnboardingChecklist;
    return normalizeChecklist(startupId, parsed);
  } catch (error: any) {
    if (error?.$metadata?.httpStatusCode === 404 || error?.name === "NoSuchKey") {
      return checklistTemplate(startupId);
    }
    console.error("Failed to load onboarding checklist", error);
    throw new Error("Unable to load onboarding checklist");
  }
};

export const saveOnboardingChecklist = async (
  startupId: string,
  checklist: OnboardingChecklist,
): Promise<OnboardingChecklist> => {
  const bucket = getBucketName();
  const normalized = normalizeChecklist(startupId, {
    ...checklist,
    startupId,
    updatedAt: new Date().toISOString(),
  });

  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: `${CHECKLIST_PREFIX}${startupId}.json`,
      Body: toBuffer(normalized),
      ContentType: "application/json",
    }),
  );

  return normalized;
};

const buildDocumentFromMetadata = (
  key: string,
  name: string,
  size: number,
  contentType: string | undefined,
  uploadedAt: string,
  uploadedBy?: string,
) => {
  const attachment = enrichAttachment({
    key,
    name,
    size,
    contentType: contentType ?? "application/octet-stream",
  });

  const document: OnboardingDocument = {
    key,
    name,
    size,
    contentType,
    uploadedAt,
    uploadedBy,
    url: attachment.url,
  };
  return document;
};

export const listOnboardingDocuments = async (
  startupId: string,
): Promise<OnboardingDocument[]> => {
  const bucket = getBucketName();
  const prefix = `${DOCUMENTS_PREFIX}${startupId}/`;

  const response = await s3.send(
    new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix,
    }),
  );

  const entries = (response.Contents ?? []).filter((object) => object.Key && !object.Key.endsWith("/"));

  const documents = await Promise.all(
    entries.map(async (object) => {
      const key = object.Key as string;
      const head = await s3.send(
        new HeadObjectCommand({
          Bucket: bucket,
          Key: key,
        }),
      );
  const name = head.Metadata?.originalname ?? key.substring(key.lastIndexOf("/") + 1);
      const size = Number(object.Size ?? head.ContentLength ?? 0);
      const uploadedAt = (object.LastModified ?? head.LastModified ?? new Date()).toISOString();
      const contentType = head.ContentType ?? undefined;
  const uploadedBy = head.Metadata?.uploadedby;

  return buildDocumentFromMetadata(key, name, size, contentType, uploadedAt, uploadedBy);
    }),
  );

  return documents.sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
};

export const uploadOnboardingDocument = async (
  startupId: string,
  file: { name: string; contentType: string; buffer: Buffer; uploadedBy?: string },
): Promise<OnboardingDocument> => {
  const bucket = getBucketName();
  const safeName = sanitizeFileName(file.name);
  const key = `${DOCUMENTS_PREFIX}${startupId}/${Date.now()}-${randomUUID()}-${safeName}`;

  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: file.buffer,
      ContentType: file.contentType || "application/octet-stream",
      Metadata: {
        originalname: file.name,
        uploadedby: file.uploadedBy ?? "platform",
      },
      ACL: "public-read",
    }),
  );

  return buildDocumentFromMetadata(
    key,
    file.name,
    file.buffer.length,
    file.contentType,
    new Date().toISOString(),
    file.uploadedBy,
  );
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
