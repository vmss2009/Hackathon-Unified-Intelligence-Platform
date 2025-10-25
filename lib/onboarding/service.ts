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
  OnboardingMilestone,
  OnboardingMilestonePlan,
  OnboardingMilestonePlanSnapshot,
  OnboardingMilestoneSignals,
  OnboardingMilestoneUpdateInput,
  OnboardingMilestoneLog,
} from "./types";

const CONFIG_KEY = "config.json";
const SUBMISSION_PREFIX = "submissions/";
const CHECKLIST_PREFIX = "checklists/";
const DOCUMENTS_PREFIX = "documents/";
const MILESTONES_PREFIX = "milestones/";

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

const MILLISECONDS_IN_DAY = 24 * 60 * 60 * 1000;

const ensureMilestoneStatus = (
  status: string | undefined,
): OnboardingMilestone["status"] => {
  switch (status) {
    case "on_track":
    case "at_risk":
    case "off_track":
    case "completed":
      return status;
    default:
      return "planned";
  }
};

const clampProgress = (value: unknown): number => {
  const numeric = ensureNumber(value);
  if (numeric === undefined) {
    return 0;
  }
  const bounded = Math.max(0, Math.min(100, numeric));
  return Number(Number.parseFloat(bounded.toFixed(1)));
};

const normalizeMilestoneLog = (
  log: Partial<OnboardingMilestoneLog>,
  fallbackMilestoneId?: string,
): OnboardingMilestoneLog | null => {
  const milestoneId = log.milestoneId ?? fallbackMilestoneId;
  if (!milestoneId) {
    return null;
  }

  const timestamp = log.timestamp ?? new Date().toISOString();
  const progress =
    log.progress !== undefined ? clampProgress(log.progress) : undefined;
  const currentValue =
    log.currentValue !== undefined ? ensureNumber(log.currentValue) : undefined;

  return {
    id: log.id ?? randomUUID(),
    milestoneId,
    timestamp,
    author: log.author?.trim() || undefined,
    note: log.note?.trim() || undefined,
    progress,
    status: log.status ? ensureMilestoneStatus(log.status) : undefined,
    currentValue,
  };
};

const normalizeMilestone = (
  startupId: string,
  milestone: Partial<OnboardingMilestone>,
): OnboardingMilestone => {
  const now = new Date().toISOString();
  const progress = clampProgress(milestone.progress ?? 0);
  const status = ensureMilestoneStatus(milestone.status);
  const completed = status === "completed" || progress >= 100;

  const baselineValue =
    milestone.baselineValue !== undefined
      ? ensureNumber(milestone.baselineValue)
      : undefined;
  const currentValue =
    milestone.currentValue !== undefined
      ? ensureNumber(milestone.currentValue)
      : undefined;
  const targetValue =
    milestone.targetValue !== undefined
      ? ensureNumber(milestone.targetValue)
      : undefined;

  const reminderLeadDays =
    milestone.reminderLeadDays !== undefined
      ? Math.max(0, Math.round(milestone.reminderLeadDays))
      : 2;
  const reminderCadenceDays =
    milestone.reminderCadenceDays !== undefined
      ? Math.max(1, Math.round(milestone.reminderCadenceDays))
      : 7;
  const escalationAfterDays =
    milestone.escalationAfterDays !== undefined
      ? Math.max(1, Math.round(milestone.escalationAfterDays))
      : 3;

  const createdAt = milestone.createdAt ?? now;
  const updatedAt = milestone.updatedAt ?? now;

  let completedAt = milestone.completedAt;
  if (completed && !completedAt) {
    completedAt = now;
  }
  if (!completed && completedAt) {
    completedAt = undefined;
  }

  return {
    id: milestone.id ?? randomUUID(),
    startupId,
    title: milestone.title?.trim() || "Milestone",
    description: milestone.description?.trim() || undefined,
    owner: milestone.owner?.trim() || undefined,
    category: milestone.category?.trim() || undefined,
    kpiKey: milestone.kpiKey?.trim() || undefined,
    unit: milestone.unit?.trim() || undefined,
    baselineValue,
    currentValue,
    targetValue,
    dueDate: milestone.dueDate ?? undefined,
    reminderLeadDays,
    reminderCadenceDays,
    escalationAfterDays,
    escalateTo: milestone.escalateTo?.trim() || undefined,
    lastReminderAt: milestone.lastReminderAt ?? undefined,
    lastEscalationAt: milestone.lastEscalationAt ?? undefined,
    status: completed ? "completed" : status,
    progress: completed ? 100 : progress,
    createdAt,
    updatedAt,
    completedAt,
    notes: milestone.notes?.trim() || undefined,
  };
};

type RawMilestonePlan = Partial<Omit<OnboardingMilestonePlan, "milestones" | "logs">> & {
  milestones?: Array<Partial<OnboardingMilestone>>;
  logs?: Array<Partial<OnboardingMilestoneLog>>;
};

const normalizeMilestonePlan = (
  startupId: string,
  plan?: RawMilestonePlan,
): OnboardingMilestonePlan => {
  const milestones = (plan?.milestones ?? [])
    .map((milestone) => normalizeMilestone(startupId, milestone))
    .reduce<OnboardingMilestone[]>((acc, milestone) => {
      if (acc.find((entry) => entry.id === milestone.id)) {
        return acc;
      }
      acc.push(milestone);
      return acc;
    }, [])
    .sort((a, b) => {
      const aDue = a.dueDate ? new Date(a.dueDate).getTime() : Number.POSITIVE_INFINITY;
      const bDue = b.dueDate ? new Date(b.dueDate).getTime() : Number.POSITIVE_INFINITY;
      return aDue - bDue;
    });

  const rawLogs = plan?.logs ?? [];
  const logs = rawLogs
    .map((log) => normalizeMilestoneLog(log, log.milestoneId || milestones[0]?.id))
    .filter((entry): entry is OnboardingMilestoneLog => Boolean(entry))
    .filter((entry) => milestones.some((milestone) => milestone.id === entry.milestoneId))
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return {
    startupId,
    updatedAt: plan?.updatedAt ?? new Date().toISOString(),
    milestones,
    logs,
  };
};

const milestoneTemplate = (startupId: string): OnboardingMilestonePlan => {
  const now = new Date();
  const iso = (days: number) => new Date(now.getTime() + days * MILLISECONDS_IN_DAY).toISOString();
  const items: Partial<OnboardingMilestone>[] = [
    {
      title: "Finalize incubation agreement",
      description:
        "Ensure legal review is complete and the participation agreement is signed by all founders.",
      owner: "Program Ops",
      category: "Compliance",
      dueDate: iso(5),
      status: "planned",
      reminderLeadDays: 2,
      reminderCadenceDays: 5,
      escalationAfterDays: 2,
      escalateTo: "ops@incubator.local",
    },
    {
      title: "Baseline core KPIs",
      description:
        "Collect current revenue, retention, and usage metrics to track acceleration impact.",
      owner: "Founders",
      category: "KPI",
      dueDate: iso(10),
      status: "planned",
      reminderLeadDays: 3,
      reminderCadenceDays: 7,
      escalationAfterDays: 4,
      escalateTo: "program-manager@incubator.local",
    },
    {
      title: "Schedule first mentor sync",
      description:
        "Introduce assigned mentors and align on the first 30-day execution roadmap.",
      owner: "Mentor Lead",
      category: "Engagement",
      dueDate: iso(14),
      status: "planned",
      reminderLeadDays: 3,
      reminderCadenceDays: 7,
      escalationAfterDays: 3,
      escalateTo: "mentor-lead@incubator.local",
    },
  ];

  return normalizeMilestonePlan(startupId, {
    startupId,
    updatedAt: now.toISOString(),
    milestones: items,
    logs: [],
  });
};

const computeMilestoneSignals = (
  milestone: OnboardingMilestone,
): OnboardingMilestoneSignals => {
  const now = Date.now();
  let dueInDays: number | undefined;
  let overdueByDays: number | undefined;
  let isOverdue = false;

  if (milestone.dueDate) {
    const dueTime = new Date(milestone.dueDate).getTime();
    if (!Number.isNaN(dueTime)) {
      const diffDays = (dueTime - now) / MILLISECONDS_IN_DAY;
      if (diffDays >= 0) {
        dueInDays = Math.floor(diffDays);
      } else {
        overdueByDays = Math.abs(Math.floor(diffDays));
        isOverdue = overdueByDays > 0;
      }
    }
  }

  const cadenceDays = milestone.reminderCadenceDays ?? 7;
  const leadDays = milestone.reminderLeadDays ?? 2;
  const escalationAfter = milestone.escalationAfterDays ?? 3;

  const lastReminderAt = milestone.lastReminderAt
    ? new Date(milestone.lastReminderAt).getTime()
    : undefined;
  const lastEscalationAt = milestone.lastEscalationAt
    ? new Date(milestone.lastEscalationAt).getTime()
    : undefined;

  let needsReminder = false;
  if (milestone.status !== "completed") {
    if (overdueByDays !== undefined) {
      if (!lastReminderAt || now - lastReminderAt >= cadenceDays * MILLISECONDS_IN_DAY) {
        needsReminder = true;
      }
    } else if (dueInDays !== undefined && dueInDays <= leadDays) {
      if (!lastReminderAt || now - lastReminderAt >= leadDays * MILLISECONDS_IN_DAY) {
        needsReminder = true;
      }
    } else if (!milestone.dueDate && !lastReminderAt) {
      needsReminder = true;
    }
  }

  const nextReminderAt = milestone.status === "completed"
    ? undefined
    : lastReminderAt
    ? new Date(lastReminderAt + cadenceDays * MILLISECONDS_IN_DAY).toISOString()
    : milestone.dueDate
    ? new Date(new Date(milestone.dueDate).getTime() - leadDays * MILLISECONDS_IN_DAY).toISOString()
    : undefined;

  let needsEscalation = false;
  if (
    milestone.status !== "completed" &&
    overdueByDays !== undefined &&
    overdueByDays >= escalationAfter &&
    milestone.escalateTo
  ) {
    if (!lastEscalationAt || now - lastEscalationAt >= escalationAfter * MILLISECONDS_IN_DAY) {
      needsEscalation = true;
    }
  }

  const summaryParts: string[] = [];
  if (dueInDays !== undefined) {
    summaryParts.push(`Due in ${dueInDays} day${dueInDays === 1 ? "" : "s"}`);
  }
  if (overdueByDays !== undefined) {
    summaryParts.push(`Overdue by ${overdueByDays} day${overdueByDays === 1 ? "" : "s"}`);
  }
  summaryParts.push(`${milestone.progress}% complete`);

  return {
    needsReminder,
    needsEscalation,
    dueInDays,
    overdueByDays,
    nextReminderAt,
    escalationTarget: milestone.escalateTo,
    isOverdue,
    summary: summaryParts.filter(Boolean).join(" · ") || undefined,
  };
};

const buildMilestoneSnapshot = (
  plan: OnboardingMilestonePlan,
): OnboardingMilestonePlanSnapshot => ({
  startupId: plan.startupId,
  updatedAt: plan.updatedAt,
  milestones: plan.milestones.map((milestone) => ({
    ...milestone,
    signals: computeMilestoneSignals(milestone),
  })),
  logs: plan.logs,
});

const getMilestonePlanInternal = async (
  startupId: string,
): Promise<OnboardingMilestonePlan> => {
  const bucket = getBucketName();
  const key = `${MILESTONES_PREFIX}${startupId}.json`;

  try {
    const response = await s3.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      }),
    );
    const raw = await streamToString(response.Body);
    if (!raw) {
      return milestoneTemplate(startupId);
    }

    const parsed = JSON.parse(raw) as OnboardingMilestonePlan;
    return normalizeMilestonePlan(startupId, parsed);
  } catch (error: any) {
    if (error?.$metadata?.httpStatusCode === 404 || error?.name === "NoSuchKey") {
      return milestoneTemplate(startupId);
    }
    console.error("Failed to load onboarding milestones", error);
    throw new Error("Unable to load milestone plan");
  }
};

const saveMilestonePlan = async (
  startupId: string,
  plan: OnboardingMilestonePlan,
): Promise<OnboardingMilestonePlan> => {
  const bucket = getBucketName();
  const normalized = normalizeMilestonePlan(startupId, plan);

  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: `${MILESTONES_PREFIX}${startupId}.json`,
      Body: toBuffer(normalized),
      ContentType: "application/json",
    }),
  );

  return normalized;
};

export const getOnboardingMilestones = async (
  startupId: string,
): Promise<OnboardingMilestonePlanSnapshot> => {
  const plan = await getMilestonePlanInternal(startupId);
  return buildMilestoneSnapshot(plan);
};

export const createOnboardingMilestone = async (
  startupId: string,
  milestone: Partial<OnboardingMilestone>,
  author?: string,
): Promise<OnboardingMilestonePlanSnapshot> => {
  const plan = await getMilestonePlanInternal(startupId);
  const now = new Date().toISOString();
  const normalized = normalizeMilestone(startupId, {
    ...milestone,
    createdAt: now,
    updatedAt: now,
  });

  plan.milestones.push(normalized);
  plan.updatedAt = now;

  const creationLog = normalizeMilestoneLog(
    {
      milestoneId: normalized.id,
      timestamp: now,
      author,
      note: "Milestone created",
      status: normalized.status,
      progress: normalized.progress,
    },
    normalized.id,
  );

  if (creationLog) {
    plan.logs.unshift(creationLog);
  }

  const stored = await saveMilestonePlan(startupId, plan);
  return buildMilestoneSnapshot(stored);
};

export const applyMilestoneUpdates = async (
  startupId: string,
  updates: OnboardingMilestoneUpdateInput[],
  author?: string,
): Promise<OnboardingMilestonePlanSnapshot> => {
  if (!updates.length) {
    return getOnboardingMilestones(startupId);
  }

  const plan = await getMilestonePlanInternal(startupId);
  const now = new Date();
  const nowIso = now.toISOString();
  let mutated = false;

  updates.forEach((update) => {
    const milestone = plan.milestones.find((entry) => entry.id === update.id);
    if (!milestone) {
      return;
    }

    let changed = false;
    const log: Partial<OnboardingMilestoneLog> = {
      milestoneId: milestone.id,
      timestamp: nowIso,
      author,
    };

    if (update.progress !== undefined) {
      const progress = clampProgress(update.progress);
      if (progress !== milestone.progress) {
        milestone.progress = progress;
        log.progress = progress;
        changed = true;
      }
    }

    if (update.currentValue !== undefined) {
      const currentValue = ensureNumber(update.currentValue);
      if (currentValue !== undefined && currentValue !== milestone.currentValue) {
        milestone.currentValue = currentValue;
        log.currentValue = currentValue;
        changed = true;
      }
    }

    if (update.targetValue !== undefined) {
      const targetValue = ensureNumber(update.targetValue);
      if (targetValue !== undefined && targetValue !== milestone.targetValue) {
        milestone.targetValue = targetValue;
        changed = true;
      }
    }

    if (update.dueDate !== undefined) {
      const dueDate = update.dueDate || undefined;
      if (dueDate !== milestone.dueDate) {
        milestone.dueDate = dueDate;
        changed = true;
      }
    }

    if (update.owner !== undefined) {
      const owner = update.owner?.trim() || undefined;
      if (owner !== milestone.owner) {
        milestone.owner = owner;
        changed = true;
      }
    }

    if (update.reminderLeadDays !== undefined) {
      const value = Math.max(0, Math.round(update.reminderLeadDays));
      if (value !== milestone.reminderLeadDays) {
        milestone.reminderLeadDays = value;
        changed = true;
      }
    }

    if (update.reminderCadenceDays !== undefined) {
      const value = Math.max(1, Math.round(update.reminderCadenceDays));
      if (value !== milestone.reminderCadenceDays) {
        milestone.reminderCadenceDays = value;
        changed = true;
      }
    }

    if (update.escalationAfterDays !== undefined) {
      const value = Math.max(1, Math.round(update.escalationAfterDays));
      if (value !== milestone.escalationAfterDays) {
        milestone.escalationAfterDays = value;
        changed = true;
      }
    }

    if (update.escalateTo !== undefined) {
      const target = update.escalateTo?.trim() || undefined;
      if (target !== milestone.escalateTo) {
        milestone.escalateTo = target;
        changed = true;
      }
    }

    if (update.status !== undefined) {
      const status = ensureMilestoneStatus(update.status);
      if (status !== milestone.status) {
        milestone.status = status;
        log.status = status;
        changed = true;
      }
    }

    if (update.note?.trim()) {
      log.note = update.note.trim();
      milestone.notes = log.note;
    }

    if (update.markReminderSent) {
      milestone.lastReminderAt = nowIso;
      changed = true;
    }

    if (update.markEscalated) {
      milestone.lastEscalationAt = nowIso;
      changed = true;
    }

    const completed = milestone.status === "completed" || milestone.progress >= 100;
    if (completed) {
      milestone.status = "completed";
      milestone.progress = 100;
      milestone.completedAt = milestone.completedAt ?? nowIso;
    } else if (milestone.completedAt) {
      milestone.completedAt = undefined;
    }

    if (changed || log.note) {
      milestone.updatedAt = nowIso;
      plan.logs.unshift(normalizeMilestoneLog(log, milestone.id)!);
      mutated = true;
    }
  });

  if (!mutated) {
    return buildMilestoneSnapshot(plan);
  }

  plan.updatedAt = nowIso;
  plan.logs = plan.logs
    .filter((log, index, array) => index === array.findIndex((entry) => entry.id === log.id))
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const stored = await saveMilestonePlan(startupId, plan);
  return buildMilestoneSnapshot(stored);
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
