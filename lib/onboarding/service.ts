import type { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import { HeadObjectCommand, ListObjectsV2Command, PutObjectCommand } from "@aws-sdk/client-s3";
import type { Prisma } from "@prisma/client";
import prisma from "@/lib/db/prisma";
import s3 from "@/lib/storage/storage";
import {
  OnboardingAttachment,
  OnboardingField,
  OnboardingFieldOption,
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
  OnboardingSubmissionManualScoreInput,
  OnboardingSubmissionFilters,
  OnboardingSubmissionResolvedField,
  OnboardingSubmissionSummary,
  OnboardingMilestone,
  OnboardingMilestonePlan,
  OnboardingMilestonePlanSnapshot,
  OnboardingMilestoneSignals,
  OnboardingMilestoneUpdateInput,
  OnboardingMilestoneLog,
  OnboardingAlumniMetric,
  OnboardingAlumniRecord,
  OnboardingAlumniSnapshot,
  OnboardingAlumniSignals,
  OnboardingAlumniUpdateInput,
  OnboardingAlumniMetricInput,
  OnboardingAlumniTouchpoint,
  OnboardingAlumniTouchpointInput,
  OnboardingGraduationStatus,
  OnboardingGrantCatalog,
  OnboardingGrantCatalogSnapshot,
  OnboardingGrantCatalogSignals,
  OnboardingGrantEligibility,
  OnboardingGrantEligibilityInput,
  OnboardingGrantOpportunity,
  OnboardingGrantOpportunityInput,
  OnboardingGrantOpportunitySignals,
  OnboardingGrantOpportunitySnapshot,
} from "./types";

const DOCUMENTS_PREFIX = "documents/";
const CONFIG_RECORD_ID = "startup-onboarding-config";

const getBucketName = () => {
  const bucket = process.env.S3_ONBOARDING_BUCKET;
  if (!bucket) {
    throw new Error("S3_ONBOARDING_BUCKET is not configured");
  }
  return bucket;
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
  const record = await prisma.onboardingConfig.findUnique({
    where: { id: CONFIG_RECORD_ID },
  });

  if (!record) {
    const defaultForm = normalizeConfig(buildDefaultForm());
    await prisma.onboardingConfig.create({
      data: {
        id: CONFIG_RECORD_ID,
        payload: defaultForm as unknown as Prisma.JsonObject,
        createdAt: new Date(defaultForm.updatedAt),
      },
    });
    return defaultForm;
  }

  const payload = (record.payload as OnboardingForm | null) ?? buildDefaultForm();
  return normalizeConfig({
    ...payload,
    updatedAt: payload.updatedAt ?? record.updatedAt.toISOString(),
  });
};

export const saveOnboardingConfig = async (form: OnboardingForm): Promise<void> => {
  const normalized = normalizeConfig({
    ...form,
    updatedAt: new Date().toISOString(),
  });

  await prisma.onboardingConfig.upsert({
    where: { id: CONFIG_RECORD_ID },
    update: {
      payload: normalized as unknown as Prisma.JsonObject,
    },
    create: {
      id: CONFIG_RECORD_ID,
      payload: normalized as unknown as Prisma.JsonObject,
      createdAt: new Date(normalized.updatedAt),
    },
  });
};

export const saveOnboardingSubmission = async (
  submission: Omit<OnboardingSubmission, "id" | "submittedAt">,
): Promise<OnboardingSubmission> => {
  const id = randomUUID();
  const submittedAt = new Date().toISOString();
  const autoScore = submission.score
    ? {
        ...submission.score,
        source: submission.score.source ?? "auto",
        updatedAt: submittedAt,
        updatedBy: submission.userId,
      }
    : undefined;

  const record: OnboardingSubmission = {
    id,
    submittedAt,
    ...submission,
    score: autoScore,
    scoreAuto: autoScore,
    scoreManual: undefined,
  };

  await prisma.onboardingSubmissionRecord.create({
    data: {
      id,
      userId: submission.userId,
      formId: submission.formId,
      submittedAt: new Date(submittedAt),
      payload: record as unknown as Prisma.JsonObject,
      createdAt: new Date(submittedAt),
    },
  });

  return record;
};

const submissionRecordToSubmission = (row: {
  id: string;
  userId: string;
  formId: string;
  submittedAt: Date;
  payload: Prisma.JsonValue | null;
}): OnboardingSubmission => {
  const payload = (row.payload as OnboardingSubmission | null) ?? ({} as OnboardingSubmission);
  const normalizeScore = (
    score: OnboardingSubmissionScore | undefined,
    fallback: "auto" | "manual",
  ): OnboardingSubmissionScore | undefined => {
    if (!score) {
      return undefined;
    }
    if (score.source) {
      return { ...score };
    }
    return { ...score, source: fallback };
  };

  const storedScore = payload.score as OnboardingSubmissionScore | undefined;
  const storedAuto = normalizeScore(
    (payload.scoreAuto as OnboardingSubmissionScore | undefined) ?? undefined,
    "auto",
  );
  const storedManual = normalizeScore(
    (payload.scoreManual as OnboardingSubmissionScore | undefined) ?? undefined,
    "manual",
  );

  let scoreAuto = storedAuto;
  let scoreManual = storedManual;
  let finalScore = storedScore ? normalizeScore(storedScore, storedManual ? "manual" : "auto") : undefined;

  if (!scoreAuto && finalScore && finalScore.source !== "manual") {
    scoreAuto = { ...finalScore };
  }
  if (!scoreManual && finalScore && finalScore.source === "manual") {
    scoreManual = { ...finalScore };
  }
  if (!finalScore) {
    finalScore = scoreManual ?? scoreAuto;
  }

  return {
    id: payload.id ?? row.id,
    userId: payload.userId ?? row.userId,
    formId: payload.formId ?? row.formId,
    submittedAt: payload.submittedAt ?? row.submittedAt.toISOString(),
    responses: (payload.responses ?? []) as OnboardingFieldResponse[],
    score: finalScore,
    scoreAuto,
    scoreManual,
  };
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
      ? field.options?.map((option: OnboardingFieldOption) => ({
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
    source: "auto",
    updatedAt: new Date().toISOString(),
  };
};

const buildFieldRegistry = (form: OnboardingForm) => {
  const registry = new Map<string, { field: OnboardingField; section: OnboardingSection }>();
  form.sections.forEach((section) => {
    section.fields.forEach((field: OnboardingField) => {
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
    ? stageFieldMeta?.options?.find((option: OnboardingFieldOption) => option.value === stageValue)?.label ?? stageValue
    : undefined;
  const companyName = responseToStrings(nameResponse?.value ?? null)[0];
  const autoScore =
    record.scoreAuto ?? (record.score && record.score.source !== "manual" ? record.score : undefined);
  const manualScore =
    record.scoreManual ?? (record.score && record.score.source === "manual" ? record.score : undefined);
  const finalScore = manualScore ?? record.score ?? autoScore;
  const status = finalScore?.status ?? "review";

  return {
    id: record.id,
    formId: record.formId,
    userId: record.userId,
    submittedAt: record.submittedAt,
    score: finalScore,
    scoreAuto: autoScore,
    scoreManual: manualScore,
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

const createSubmissionSummaryContext = (form: OnboardingForm) => {
  const registry = buildFieldRegistry(form);
  const stageFieldId = guessStageFieldId(registry);
  const nameFieldId = guessNameFieldId(registry);
  const stageFieldMeta = stageFieldId ? registry.get(stageFieldId)?.field : undefined;

  const summarize = (record: OnboardingSubmission) => {
    const resolvedResponses = (record.responses ?? []).map((response) =>
      resolveResponse(response, registry),
    );
    return buildSubmissionSummary(record, resolvedResponses, stageFieldMeta, stageFieldId, nameFieldId);
  };

  return {
    summarize,
    stageOptions: stageFieldMeta?.options ?? [],
    stageFieldId,
  };
};

export const summarizeOnboardingSubmission = (
  form: OnboardingForm,
  submission: OnboardingSubmission,
): OnboardingSubmissionSummary => {
  const context = createSubmissionSummaryContext(form);
  return context.summarize(submission);
};

export const listOnboardingSubmissions = async (
  form: OnboardingForm,
  filters: OnboardingSubmissionFilters = {},
) => {
  const rows = await prisma.onboardingSubmissionRecord.findMany({
    orderBy: { submittedAt: "desc" },
  });
  const summaryContext = createSubmissionSummaryContext(form);
  const submissions: OnboardingSubmissionSummary[] = rows.map((row) =>
    summaryContext.summarize(submissionRecordToSubmission(row)),
  );

  const stageOptions = summaryContext.stageOptions;
  const stageFieldId = summaryContext.stageFieldId;

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
  const row = await prisma.onboardingSubmissionRecord.findUnique({
    where: { id: submissionId },
  });

  if (!row || row.userId !== userId) {
    return null;
  }

  const summaryContext = createSubmissionSummaryContext(form);
  const record = submissionRecordToSubmission(row);
  return summaryContext.summarize(record);
};

export const setManualSubmissionScore = async (
  submissionId: string,
  reviewerId: string,
  input: OnboardingSubmissionManualScoreInput,
): Promise<OnboardingSubmission> => {
  const row = await prisma.onboardingSubmissionRecord.findUnique({
    where: { id: submissionId },
  });

  if (!row) {
    throw new Error("Submission not found");
  }

  const existing = submissionRecordToSubmission(row);
  const autoScore =
    existing.scoreAuto ?? (existing.score && existing.score.source !== "manual" ? existing.score : undefined);
  const baseline = existing.scoreManual ?? autoScore ?? existing.score;

  const cleanTotalRaw =
    input.total !== undefined ? ensureNumber(input.total) : baseline?.total ?? 0;
  const cleanTotal = cleanTotalRaw !== undefined && cleanTotalRaw >= 0 ? cleanTotalRaw : 0;
  const cleanAwardedRaw = ensureNumber(input.awarded);
  const cleanAwarded = cleanAwardedRaw !== undefined && cleanAwardedRaw >= 0 ? cleanAwardedRaw : 0;
  const percentageOverride =
    input.percentage !== undefined ? ensureNumber(input.percentage) : undefined;
  const percentage =
    percentageOverride !== undefined && percentageOverride >= 0
      ? Number(percentageOverride.toFixed(2))
      : cleanTotal > 0
        ? Number(((cleanAwarded / cleanTotal) * 100).toFixed(2))
        : 0;

  const breakdown = input.breakdown ?? baseline?.breakdown ?? [];
  const nowIso = new Date().toISOString();

  const manualScore: OnboardingSubmissionScore = {
    total: cleanTotal,
    awarded: cleanAwarded,
    percentage,
    status: input.status,
    thresholdAdvance: baseline?.thresholdAdvance,
    thresholdReject: baseline?.thresholdReject,
    breakdown,
    source: "manual",
    updatedAt: nowIso,
    updatedBy: reviewerId,
    note: input.note?.trim() || undefined,
  };

  const next: OnboardingSubmission = {
    ...existing,
    score: manualScore,
    scoreManual: manualScore,
    scoreAuto: autoScore,
  };

  const payload = { ...next } as Record<string, unknown>;
  if (!payload.scoreAuto) {
    delete payload.scoreAuto;
  }
  if (!payload.scoreManual) {
    delete payload.scoreManual;
  }
  if (!payload.score) {
    delete payload.score;
  }

  await prisma.onboardingSubmissionRecord.update({
    where: { id: submissionId },
    data: {
      payload: payload as unknown as Prisma.JsonObject,
      updatedAt: new Date(nowIso),
    },
  });

  return next;
};

export const clearManualSubmissionScore = async (
  submissionId: string,
): Promise<OnboardingSubmission> => {
  const row = await prisma.onboardingSubmissionRecord.findUnique({
    where: { id: submissionId },
  });

  if (!row) {
    throw new Error("Submission not found");
  }

  const existing = submissionRecordToSubmission(row);
  const autoScore =
    existing.scoreAuto ?? (existing.score && existing.score.source !== "manual" ? existing.score : undefined);

  const next: OnboardingSubmission = {
    ...existing,
    score: autoScore,
    scoreManual: undefined,
    scoreAuto: autoScore,
  };

  const payload = { ...next } as Record<string, unknown>;
  if (!payload.scoreManual) {
    delete payload.scoreManual;
  }
  if (!payload.scoreAuto) {
    delete payload.scoreAuto;
  }
  if (!payload.score) {
    delete payload.score;
  }

  await prisma.onboardingSubmissionRecord.update({
    where: { id: submissionId },
    data: {
      payload: payload as unknown as Prisma.JsonObject,
      updatedAt: new Date(),
    },
  });

  return next;
};

export const getOnboardingChecklist = async (
  startupId: string,
): Promise<OnboardingChecklist> => {
  const record = await prisma.onboardingChecklistRecord.findUnique({
    where: { startupId },
  });

  if (!record) {
    const template = checklistTemplate(startupId);
    await prisma.onboardingChecklistRecord.create({
      data: {
        startupId,
        payload: template as unknown as Prisma.JsonObject,
        createdAt: new Date(template.createdAt),
        updatedAt: new Date(template.updatedAt),
      },
    });
    return template;
  }

  return normalizeChecklist(startupId, record.payload as OnboardingChecklist);
};

export const saveOnboardingChecklist = async (
  startupId: string,
  checklist: OnboardingChecklist,
): Promise<OnboardingChecklist> => {
  const normalized = normalizeChecklist(startupId, {
    ...checklist,
    startupId,
    updatedAt: new Date().toISOString(),
  });

  await prisma.onboardingChecklistRecord.upsert({
    where: { startupId },
    update: {
      payload: normalized as unknown as Prisma.JsonObject,
    },
    create: {
      startupId,
      payload: normalized as unknown as Prisma.JsonObject,
      createdAt: new Date(normalized.createdAt),
      updatedAt: new Date(normalized.updatedAt),
    },
  });

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
  const record = await prisma.onboardingMilestonePlanRecord.findUnique({
    where: { startupId },
  });

  if (!record) {
    const template = milestoneTemplate(startupId);
    await prisma.onboardingMilestonePlanRecord.create({
      data: {
        startupId,
        payload: template as unknown as Prisma.JsonObject,
      },
    });
    return template;
  }

  return normalizeMilestonePlan(startupId, record.payload as OnboardingMilestonePlan);
};

const saveMilestonePlan = async (
  startupId: string,
  plan: OnboardingMilestonePlan,
): Promise<OnboardingMilestonePlan> => {
  const normalized = normalizeMilestonePlan(startupId, plan);

  await prisma.onboardingMilestonePlanRecord.upsert({
    where: { startupId },
    update: {
      payload: normalized as unknown as Prisma.JsonObject,
    },
    create: {
      startupId,
      payload: normalized as unknown as Prisma.JsonObject,
    },
  });

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

const CHECKIN_SOON_WINDOW_DAYS = 7;
const DEFAULT_CHECKIN_GAP_DAYS = 60;

const clampImpactScore = (value: unknown): number | undefined => {
  const numeric = ensureNumber(value);
  if (numeric === undefined) {
    return undefined;
  }
  const bounded = Math.max(0, Math.min(100, numeric));
  return Number(Number.parseFloat(bounded.toFixed(1)));
};

const sanitizeTag = (tag: string | undefined): string | undefined => {
  if (!tag) {
    return undefined;
  }
  const cleaned = tag.trim();
  if (!cleaned.length) {
    return undefined;
  }
  return cleaned.substring(0, 60);
};

const normalizeIsoDate = (value?: string): string | undefined => {
  if (!value) {
    return undefined;
  }
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) {
    return undefined;
  }
  return new Date(time).toISOString();
};

const ensureGraduationStatus = (
  status: string | undefined,
): OnboardingGraduationStatus => {
  switch (status) {
    case "graduated":
    case "deferred":
    case "withdrawn":
    case "alumni":
    case "in_program":
      return status;
    default:
      return "in_program";
  }
};

const ensureAlumniChannel = (
  channel: string | undefined,
): OnboardingAlumniTouchpoint["channel"] => {
  switch (channel) {
    case "email":
    case "call":
    case "meeting":
    case "event":
    case "demo":
    case "survey":
    case "other":
      return channel;
    default:
      return undefined;
  }
};

const ensureAlumniSentiment = (
  sentiment: string | undefined,
): OnboardingAlumniTouchpoint["sentiment"] => {
  switch (sentiment) {
    case "positive":
    case "neutral":
    case "negative":
      return sentiment;
    default:
      return undefined;
  }
};

const normalizeAlumniMetric = (
  metric: OnboardingAlumniMetric | OnboardingAlumniMetricInput,
): OnboardingAlumniMetric => {
  const nowIso = new Date().toISOString();
  const key = metric.key?.trim() || metric.label?.trim() || "metric";
  const label = metric.label?.trim() || key;
  const numericValue = ensureNumber(metric.value) ?? 0;

  return {
    id: (metric as OnboardingAlumniMetric).id ?? metric.id ?? randomUUID(),
    key,
    label,
    value: numericValue,
    unit: metric.unit?.trim() || undefined,
    recordedAt: normalizeIsoDate((metric as OnboardingAlumniMetric).recordedAt ?? metric.recordedAt) ?? nowIso,
    note: metric.note?.trim() || undefined,
  };
};

const normalizeAlumniTouchpoint = (
  touchpoint: OnboardingAlumniTouchpoint | OnboardingAlumniTouchpointInput,
): OnboardingAlumniTouchpoint => {
  const nowIso = new Date().toISOString();
  const recordedAt = normalizeIsoDate((touchpoint as OnboardingAlumniTouchpoint).recordedAt ?? touchpoint.recordedAt) ?? nowIso;

  return {
    id: (touchpoint as OnboardingAlumniTouchpoint).id ?? randomUUID(),
    recordedAt,
    recordedBy: touchpoint.recordedBy?.trim() || undefined,
    channel: ensureAlumniChannel((touchpoint as OnboardingAlumniTouchpoint).channel ?? touchpoint.channel),
    highlight: touchpoint.highlight?.trim() || undefined,
    sentiment: ensureAlumniSentiment((touchpoint as OnboardingAlumniTouchpoint).sentiment ?? touchpoint.sentiment),
    notes: touchpoint.notes?.trim() || undefined,
    nextActionAt: normalizeIsoDate((touchpoint as OnboardingAlumniTouchpoint).nextActionAt ?? touchpoint.nextActionAt),
    nextActionOwner: touchpoint.nextActionOwner?.trim() || undefined,
  };
};

const normalizeAlumniRecord = (
  startupId: string,
  raw?: Partial<OnboardingAlumniRecord>,
): OnboardingAlumniRecord => {
  const nowIso = new Date().toISOString();
  const createdAt = normalizeIsoDate(raw?.createdAt) ?? nowIso;
  const updatedAt = normalizeIsoDate(raw?.updatedAt) ?? createdAt;

  const touchpoints = ((raw?.touchpoints ?? []) as Array<
    OnboardingAlumniTouchpoint | OnboardingAlumniTouchpointInput
  >)
    .map((entry) => normalizeAlumniTouchpoint(entry))
    .reduce<OnboardingAlumniTouchpoint[]>((acc, entry) => {
      if (!acc.some((existing) => existing.id === entry.id)) {
        acc.push(entry);
      }
      return acc;
    }, [])
    .sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime());

  const metrics = ((raw?.metrics ?? []) as Array<OnboardingAlumniMetric | OnboardingAlumniMetricInput>)
    .map((entry) => normalizeAlumniMetric(entry))
    .reduce<OnboardingAlumniMetric[]>((acc, entry) => {
      if (!acc.some((existing) => existing.id === entry.id)) {
        acc.push(entry);
      }
      return acc;
    }, [])
    .sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime());

  const tags = Array.from(
    new Set(
      (raw?.tags ?? [])
        .map((tag) => sanitizeTag(tag))
        .filter((tag): tag is string => Boolean(tag)),
    ),
  );

  const lastContactAt =
    normalizeIsoDate(raw?.lastContactAt) ?? touchpoints[0]?.recordedAt;

  return {
    startupId,
    status: ensureGraduationStatus(raw?.status),
    cohort: raw?.cohort?.trim() || undefined,
    programStartAt: normalizeIsoDate(raw?.programStartAt),
    graduationDate: normalizeIsoDate(raw?.graduationDate),
    alumniSince:
      normalizeIsoDate(raw?.alumniSince) ?? normalizeIsoDate(raw?.graduationDate),
    primaryMentor: raw?.primaryMentor?.trim() || undefined,
    supportOwner: raw?.supportOwner?.trim() || undefined,
    tags,
    notes: raw?.notes?.trim() || undefined,
    impactScore: clampImpactScore(raw?.impactScore),
    fundingRaised:
      raw?.fundingRaised !== undefined ? ensureNumber(raw.fundingRaised) : undefined,
    revenueRunRate:
      raw?.revenueRunRate !== undefined ? ensureNumber(raw.revenueRunRate) : undefined,
    jobsCreated:
      raw?.jobsCreated !== undefined ? ensureNumber(raw.jobsCreated) : undefined,
    currency: raw?.currency?.trim() || undefined,
    lastContactAt,
    nextCheckInAt: normalizeIsoDate(raw?.nextCheckInAt),
    createdAt,
    updatedAt,
    metrics,
    touchpoints,
  };
};

const alumniTemplate = (startupId: string): OnboardingAlumniRecord => {
  const nowIso = new Date().toISOString();
  return normalizeAlumniRecord(startupId, {
    startupId,
    status: "in_program",
    createdAt: nowIso,
    updatedAt: nowIso,
    metrics: [],
    touchpoints: [],
  });
};

const findLatestMetricValue = (
  metrics: OnboardingAlumniMetric[],
  key: string,
): number | undefined => {
  const target = key.toLowerCase();
  for (const metric of metrics) {
    if (metric.key.toLowerCase() === target) {
      return metric.value;
    }
  }
  return undefined;
};

const computeAlumniSignals = (
  record: OnboardingAlumniRecord,
): OnboardingAlumniSignals => {
  const now = Date.now();
  const signals: OnboardingAlumniSignals = {
    hasGraduated: record.status === "graduated" || record.status === "alumni",
    touchpointCount: record.touchpoints.length,
    needsCheckIn: false,
  };

  const graduationRef = record.alumniSince ?? record.graduationDate;
  if (graduationRef) {
    const gradTime = new Date(graduationRef).getTime();
    if (!Number.isNaN(gradTime) && gradTime <= now) {
      const diffMonths = Math.floor((now - gradTime) / (30 * MILLISECONDS_IN_DAY));
      signals.monthsSinceGraduation = diffMonths >= 0 ? diffMonths : undefined;
    }
  }

  const lastTouchTime = record.lastContactAt
    ? new Date(record.lastContactAt).getTime()
    : undefined;
  if (lastTouchTime !== undefined && !Number.isNaN(lastTouchTime)) {
    signals.lastTouchpointAt = record.lastContactAt;
  }

  const nextCheckTime = record.nextCheckInAt
    ? new Date(record.nextCheckInAt).getTime()
    : undefined;

  if (nextCheckTime !== undefined && !Number.isNaN(nextCheckTime)) {
    const diffDays = Math.round((nextCheckTime - now) / MILLISECONDS_IN_DAY);
    if (diffDays < 0) {
      signals.needsCheckIn = true;
      signals.checkInOverdueByDays = Math.abs(diffDays);
    } else {
      signals.checkInDueInDays = diffDays;
      if (diffDays <= CHECKIN_SOON_WINDOW_DAYS) {
        signals.needsCheckIn = true;
      }
    }
  } else if (lastTouchTime !== undefined && !Number.isNaN(lastTouchTime)) {
    const diffDays = Math.floor((now - lastTouchTime) / MILLISECONDS_IN_DAY);
    if (diffDays >= DEFAULT_CHECKIN_GAP_DAYS) {
      signals.needsCheckIn = true;
      signals.checkInOverdueByDays = diffDays;
    }
  } else if (record.touchpoints.length === 0) {
    signals.needsCheckIn = true;
  }

  signals.totalFundingRaised =
    record.fundingRaised ??
    findLatestMetricValue(record.metrics, "funding_raised") ??
    findLatestMetricValue(record.metrics, "funding");

  signals.jobsCreated =
    record.jobsCreated ?? findLatestMetricValue(record.metrics, "jobs_created");

  signals.revenueRunRate =
    record.revenueRunRate ??
    findLatestMetricValue(record.metrics, "revenue_run_rate") ??
    findLatestMetricValue(record.metrics, "arr");

  return signals;
};

const buildAlumniSnapshot = (
  record: OnboardingAlumniRecord,
): OnboardingAlumniSnapshot => ({
  ...record,
  signals: computeAlumniSignals(record),
});

const getAlumniRecordInternal = async (
  startupId: string,
): Promise<OnboardingAlumniRecord> => {
  const record = await prisma.onboardingAlumniRecordStorage.findUnique({
    where: { startupId },
  });

  if (!record) {
    const template = alumniTemplate(startupId);
    await prisma.onboardingAlumniRecordStorage.create({
      data: {
        startupId,
        payload: template as unknown as Prisma.JsonObject,
      },
    });
    return template;
  }

  return normalizeAlumniRecord(startupId, record.payload as OnboardingAlumniRecord);
};

const saveAlumniRecord = async (
  startupId: string,
  record: OnboardingAlumniRecord,
): Promise<OnboardingAlumniRecord> => {
  const normalized = normalizeAlumniRecord(startupId, record);

  await prisma.onboardingAlumniRecordStorage.upsert({
    where: { startupId },
    update: {
      payload: normalized as unknown as Prisma.JsonObject,
    },
    create: {
      startupId,
      payload: normalized as unknown as Prisma.JsonObject,
    },
  });

  return normalized;
};

export const getOnboardingAlumniRecord = async (
  startupId: string,
): Promise<OnboardingAlumniSnapshot> => {
  const record = await getAlumniRecordInternal(startupId);
  return buildAlumniSnapshot(record);
};

export const updateOnboardingAlumniRecord = async (
  startupId: string,
  update: OnboardingAlumniUpdateInput,
): Promise<OnboardingAlumniSnapshot> => {
  const record = await getAlumniRecordInternal(startupId);
  const nowIso = new Date().toISOString();

  if (update.status) {
    record.status = ensureGraduationStatus(update.status);
  }
  if (update.cohort !== undefined) {
    record.cohort = update.cohort?.trim() || undefined;
  }
  if (update.programStartAt !== undefined) {
    record.programStartAt = normalizeIsoDate(update.programStartAt);
  }
  if (update.graduationDate !== undefined) {
    record.graduationDate = normalizeIsoDate(update.graduationDate);
  }
  if (update.alumniSince !== undefined) {
    record.alumniSince = normalizeIsoDate(update.alumniSince);
  }
  if (update.primaryMentor !== undefined) {
    record.primaryMentor = update.primaryMentor?.trim() || undefined;
  }
  if (update.supportOwner !== undefined) {
    record.supportOwner = update.supportOwner?.trim() || undefined;
  }
  if (update.tags !== undefined) {
    record.tags = Array.from(
      new Set(
        (update.tags ?? [])
          .map((tag) => sanitizeTag(tag))
          .filter((tag): tag is string => Boolean(tag)),
      ),
    );
  }
  if (update.notes !== undefined) {
    record.notes = update.notes?.trim() || undefined;
  }
  if (update.impactScore !== undefined) {
    record.impactScore = clampImpactScore(update.impactScore);
  }
  if (update.fundingRaised !== undefined) {
    record.fundingRaised = ensureNumber(update.fundingRaised);
  }
  if (update.revenueRunRate !== undefined) {
    record.revenueRunRate = ensureNumber(update.revenueRunRate);
  }
  if (update.jobsCreated !== undefined) {
    record.jobsCreated = ensureNumber(update.jobsCreated);
  }
  if (update.currency !== undefined) {
    record.currency = update.currency?.trim() || undefined;
  }
  if (update.nextCheckInAt !== undefined) {
    record.nextCheckInAt = normalizeIsoDate(update.nextCheckInAt);
  }
  if (update.metrics !== undefined) {
    const normalizedMetrics = (update.metrics ?? [])
      .map((metric) => normalizeAlumniMetric(metric))
      .sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime());
    record.metrics = normalizedMetrics;
  }

  record.updatedAt = nowIso;

  const stored = await saveAlumniRecord(startupId, record);
  return buildAlumniSnapshot(stored);
};

export const appendOnboardingAlumniTouchpoint = async (
  startupId: string,
  touchpoint: OnboardingAlumniTouchpointInput,
  metrics?: OnboardingAlumniMetricInput[],
): Promise<OnboardingAlumniSnapshot> => {
  const record = await getAlumniRecordInternal(startupId);
  const normalizedTouchpoint = normalizeAlumniTouchpoint(touchpoint);

  record.touchpoints.unshift(normalizedTouchpoint);
  record.touchpoints = record.touchpoints
    .reduce<OnboardingAlumniTouchpoint[]>((acc, entry) => {
      if (!acc.some((existing) => existing.id === entry.id)) {
        acc.push(entry);
      }
      return acc;
    }, [])
    .sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime());

  record.lastContactAt = record.touchpoints[0]?.recordedAt ?? record.lastContactAt;

  if (normalizedTouchpoint.nextActionAt) {
    const nextActionTime = new Date(normalizedTouchpoint.nextActionAt).getTime();
    const currentNext = record.nextCheckInAt
      ? new Date(record.nextCheckInAt).getTime()
      : undefined;
    if (!Number.isNaN(nextActionTime)) {
      if (currentNext === undefined || nextActionTime < currentNext) {
        record.nextCheckInAt = normalizedTouchpoint.nextActionAt;
      }
    }
  }

  if (metrics?.length) {
    const normalizedMetrics = metrics
      .map((metric) =>
        normalizeAlumniMetric({
          ...metric,
          recordedAt: metric.recordedAt ?? normalizedTouchpoint.recordedAt,
        }),
      )
      .sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime());

    record.metrics = [...normalizedMetrics, ...record.metrics].reduce<OnboardingAlumniMetric[]>(
      (acc, entry) => {
        if (!acc.some((existing) => existing.id === entry.id)) {
          acc.push(entry);
        }
        return acc;
      },
      [],
    );
    record.metrics.sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime());
  }

  record.updatedAt = new Date().toISOString();

  const stored = await saveAlumniRecord(startupId, record);
  return buildAlumniSnapshot(stored);
};

const GRANT_DEADLINE_SOON_DAYS = 14;

const ensureGrantStatus = (
  status: string | undefined,
): OnboardingGrantOpportunity["status"] => {
  switch (status) {
    case "researching":
    case "preparing":
    case "submitted":
    case "awarded":
    case "closed":
      return status;
    default:
      return "researching";
  }
};

const normalizeGrantEligibility = (
  entry: OnboardingGrantEligibility | OnboardingGrantEligibilityInput | undefined,
  fallback?: OnboardingGrantEligibility,
): OnboardingGrantEligibility | undefined => {
  if (!entry && !fallback) {
    return undefined;
  }

  const labelSource = entry?.label ?? fallback?.label;
  const label = labelSource?.trim();
  if (!label) {
    return undefined;
  }

  return {
    id: fallback?.id ?? (entry as OnboardingGrantEligibility)?.id ?? entry?.id ?? randomUUID(),
    label,
    met: entry?.met ?? (entry as OnboardingGrantEligibility)?.met ?? fallback?.met ?? false,
    notes: entry?.notes?.trim() || (entry as OnboardingGrantEligibility)?.notes?.trim() || fallback?.notes,
  };
};

const normalizeGrantEligibilityList = (
  entries: Array<OnboardingGrantEligibility | OnboardingGrantEligibilityInput>,
  existing: OnboardingGrantEligibility[] = [],
): OnboardingGrantEligibility[] => {
  if (!entries?.length) {
    return [];
  }

  const existingById = new Map(existing.map((item) => [item.id, item]));
  const existingByLabel = new Map(existing.map((item) => [item.label.toLowerCase(), item]));
  const seen = new Set<string>();
  const normalized: OnboardingGrantEligibility[] = [];

  entries.forEach((item) => {
    if (!item) {
      return;
    }
    const label = item.label?.trim();
    if (!label) {
      return;
    }
    const previous = (item as OnboardingGrantEligibility).id
      ? existingById.get((item as OnboardingGrantEligibility).id)
      : existingByLabel.get(label.toLowerCase());
    const entry = normalizeGrantEligibility(item, previous);
    if (!entry || seen.has(entry.id)) {
      return;
    }
    seen.add(entry.id);
    normalized.push(entry);
  });

  normalized.sort((a, b) => a.label.localeCompare(b.label));
  return normalized;
};

const sanitizeGrantOpportunity = (
  raw: OnboardingGrantOpportunity | OnboardingGrantOpportunityInput,
): OnboardingGrantOpportunity => {
  const nowIso = new Date().toISOString();
  const base = raw as OnboardingGrantOpportunity;

  const createdAt = normalizeIsoDate(base.createdAt) ?? nowIso;
  const updatedAt = normalizeIsoDate(base.updatedAt) ?? createdAt;

  let title = raw.title ?? base.title ?? "Untitled opportunity";
  title = title ? title.trim() : "Untitled opportunity";
  if (!title.length) {
    title = "Untitled opportunity";
  }

  const amountSource = base.amount ?? raw.amount;
  const amount =
    amountSource === null || amountSource === undefined
      ? undefined
      : ensureNumber(amountSource);

  const currencySource = raw.currency ?? base.currency;
  const currency =
    currencySource && currencySource.trim().length
      ? currencySource.trim().toUpperCase()
      : undefined;

  const eligibility = normalizeGrantEligibilityList(
    ((base.eligibility ?? raw.eligibility) ?? []) as Array<
      OnboardingGrantEligibility | OnboardingGrantEligibilityInput
    >,
    [],
  );

  return {
    id: base.id ?? raw.id ?? randomUUID(),
    title,
    provider: raw.provider?.trim() || base.provider?.trim() || undefined,
    description: raw.description?.trim() || base.description?.trim() || undefined,
    amount: amount ?? undefined,
    currency,
    deadline: normalizeIsoDate(raw.deadline ?? base.deadline),
    status: ensureGrantStatus(base.status ?? raw.status),
    link: raw.link?.trim() || base.link?.trim() || undefined,
    owner: raw.owner?.trim() || base.owner?.trim() || undefined,
    notes: raw.notes?.trim() || base.notes?.trim() || undefined,
    eligibility,
    createdAt,
    updatedAt,
    lastActivityAt: normalizeIsoDate(base.lastActivityAt) ?? updatedAt,
  };
};

const sortGrantOpportunities = (
  entries: OnboardingGrantOpportunity[],
) => {
  entries.sort((a, b) => {
    const deadlineA = a.deadline ? new Date(a.deadline).getTime() : Number.POSITIVE_INFINITY;
    const deadlineB = b.deadline ? new Date(b.deadline).getTime() : Number.POSITIVE_INFINITY;

    if (!Number.isNaN(deadlineA) && !Number.isNaN(deadlineB) && deadlineA !== deadlineB) {
      return deadlineA - deadlineB;
    }

    const updatedA = new Date(a.updatedAt).getTime();
    const updatedB = new Date(b.updatedAt).getTime();
    return updatedB - updatedA;
  });
};

const normalizeGrantCatalog = (
  startupId: string,
  raw?: Partial<OnboardingGrantCatalog>,
): OnboardingGrantCatalog => {
  const nowIso = new Date().toISOString();
  const createdAt = normalizeIsoDate(raw?.createdAt) ?? nowIso;
  const updatedAt = normalizeIsoDate(raw?.updatedAt) ?? createdAt;

  const seen = new Set<string>();
  const opportunities: OnboardingGrantOpportunity[] = [];

  ((raw?.opportunities ?? []) as Array<OnboardingGrantOpportunity | OnboardingGrantOpportunityInput>).forEach(
    (entry) => {
      if (!entry) {
        return;
      }
      const normalized = sanitizeGrantOpportunity(entry);
      if (seen.has(normalized.id)) {
        return;
      }
      seen.add(normalized.id);
      opportunities.push(normalized);
    },
  );

  sortGrantOpportunities(opportunities);

  return {
    startupId,
    createdAt,
    updatedAt,
    opportunities,
  };
};

const grantCatalogTemplate = (startupId: string): OnboardingGrantCatalog => {
  const nowIso = new Date().toISOString();
  return {
    startupId,
    createdAt: nowIso,
    updatedAt: nowIso,
    opportunities: [],
  };
};

const computeGrantOpportunitySignals = (
  opportunity: OnboardingGrantOpportunity,
): OnboardingGrantOpportunitySignals => {
  const now = Date.now();
  let daysUntilDeadline: number | undefined;
  let isOverdue = false;
  const hasDeadline = Boolean(opportunity.deadline);

  if (opportunity.deadline) {
    const deadlineTime = new Date(opportunity.deadline).getTime();
    if (!Number.isNaN(deadlineTime)) {
      const diffDays = Math.ceil((deadlineTime - now) / MILLISECONDS_IN_DAY);
      daysUntilDeadline = diffDays;
      if (
        diffDays < 0 &&
        opportunity.status !== "submitted" &&
        opportunity.status !== "awarded" &&
        opportunity.status !== "closed"
      ) {
        isOverdue = true;
      }
    }
  }

  const unmetEligibilityCount = opportunity.eligibility.filter((item) => !item.met).length;

  return {
    hasDeadline,
    daysUntilDeadline,
    isOverdue,
    isSubmitted: opportunity.status === "submitted" || opportunity.status === "awarded",
    eligibilityComplete: unmetEligibilityCount === 0,
    unmetEligibilityCount,
  };
};

const buildGrantOpportunitySnapshot = (
  opportunity: OnboardingGrantOpportunity,
): OnboardingGrantOpportunitySnapshot => ({
  ...opportunity,
  signals: computeGrantOpportunitySignals(opportunity),
});

const computeGrantCatalogSignals = (
  catalog: OnboardingGrantCatalog,
): OnboardingGrantCatalogSignals => {
  const now = Date.now();
  let dueSoon = 0;
  let overdue = 0;
  let awarded = 0;
  let submitted = 0;

  catalog.opportunities.forEach((opportunity) => {
    if (opportunity.status === "awarded") {
      awarded += 1;
    }
    if (opportunity.status === "submitted") {
      submitted += 1;
    }

    if (!opportunity.deadline) {
      return;
    }

    const deadlineTime = new Date(opportunity.deadline).getTime();
    if (Number.isNaN(deadlineTime)) {
      return;
    }

    const diffDays = Math.ceil((deadlineTime - now) / MILLISECONDS_IN_DAY);
    if (
      diffDays < 0 &&
      opportunity.status !== "awarded" &&
      opportunity.status !== "submitted" &&
      opportunity.status !== "closed"
    ) {
      overdue += 1;
    } else if (
      diffDays >= 0 &&
      diffDays <= GRANT_DEADLINE_SOON_DAYS &&
      opportunity.status !== "awarded" &&
      opportunity.status !== "closed"
    ) {
      dueSoon += 1;
    }
  });

  return {
    total: catalog.opportunities.length,
    dueSoon,
    overdue,
    awarded,
    submitted,
  };
};

const buildGrantCatalogSnapshot = (
  catalog: OnboardingGrantCatalog,
): OnboardingGrantCatalogSnapshot => ({
  startupId: catalog.startupId,
  createdAt: catalog.createdAt,
  updatedAt: catalog.updatedAt,
  opportunities: catalog.opportunities.map((opportunity) => buildGrantOpportunitySnapshot(opportunity)),
  signals: computeGrantCatalogSignals(catalog),
});

const getGrantCatalogInternal = async (
  startupId: string,
): Promise<OnboardingGrantCatalog> => {
  const record = await prisma.onboardingGrantCatalogRecord.findUnique({
    where: { startupId },
  });

  if (!record) {
    const template = grantCatalogTemplate(startupId);
    await prisma.onboardingGrantCatalogRecord.create({
      data: {
        startupId,
        payload: template as unknown as Prisma.JsonObject,
      },
    });
    return template;
  }

  return normalizeGrantCatalog(startupId, record.payload as OnboardingGrantCatalog);
};

const saveGrantCatalog = async (
  startupId: string,
  catalog: OnboardingGrantCatalog,
): Promise<OnboardingGrantCatalog> => {
  const normalized = normalizeGrantCatalog(startupId, catalog);

  await prisma.onboardingGrantCatalogRecord.upsert({
    where: { startupId },
    update: {
      payload: normalized as unknown as Prisma.JsonObject,
    },
    create: {
      startupId,
      payload: normalized as unknown as Prisma.JsonObject,
    },
  });

  return normalized;
};

const createGrantOpportunityRecord = (
  input: OnboardingGrantOpportunityInput,
): OnboardingGrantOpportunity => {
  if (!input.title || !input.title.trim()) {
    throw new Error("Grant title is required");
  }

  const nowIso = new Date().toISOString();
  const amount =
    input.amount === null || input.amount === undefined
      ? undefined
      : ensureNumber(input.amount);
  const currency =
    input.currency && input.currency.trim().length
      ? input.currency.trim().toUpperCase()
      : undefined;

  return {
    id: input.id ?? randomUUID(),
    title: input.title.trim(),
    provider: input.provider?.trim() || undefined,
    description: input.description?.trim() || undefined,
    amount: amount ?? undefined,
    currency,
    deadline: normalizeIsoDate(input.deadline),
    status: ensureGrantStatus(input.status),
    link: input.link?.trim() || undefined,
    owner: input.owner?.trim() || undefined,
    notes: input.notes?.trim() || undefined,
    eligibility: normalizeGrantEligibilityList(input.eligibility ?? [], []),
    createdAt: nowIso,
    updatedAt: nowIso,
    lastActivityAt: nowIso,
  };
};

const applyGrantOpportunityUpdate = (
  opportunity: OnboardingGrantOpportunity,
  update: OnboardingGrantOpportunityInput,
): boolean => {
  let changed = false;

  if (update.title !== undefined) {
    const nextTitle = update.title?.trim() || "Untitled opportunity";
    if (nextTitle !== opportunity.title) {
      opportunity.title = nextTitle;
      changed = true;
    }
  }

  if (update.provider !== undefined) {
    const nextProvider = update.provider?.trim() || undefined;
    if (nextProvider !== opportunity.provider) {
      opportunity.provider = nextProvider;
      changed = true;
    }
  }

  if (update.description !== undefined) {
    const nextDescription = update.description?.trim() || undefined;
    if (nextDescription !== opportunity.description) {
      opportunity.description = nextDescription;
      changed = true;
    }
  }

  if (update.link !== undefined) {
    const nextLink = update.link?.trim() || undefined;
    if (nextLink !== opportunity.link) {
      opportunity.link = nextLink;
      changed = true;
    }
  }

  if (update.owner !== undefined) {
    const nextOwner = update.owner?.trim() || undefined;
    if (nextOwner !== opportunity.owner) {
      opportunity.owner = nextOwner;
      changed = true;
    }
  }

  if (update.notes !== undefined) {
    const nextNotes = update.notes?.trim() || undefined;
    if (nextNotes !== opportunity.notes) {
      opportunity.notes = nextNotes;
      changed = true;
    }
  }

  if (update.amount !== undefined) {
    const nextAmount =
      update.amount === null || update.amount === undefined
        ? undefined
        : ensureNumber(update.amount);
    if (nextAmount !== opportunity.amount) {
      opportunity.amount = nextAmount ?? undefined;
      changed = true;
    }
  }

  if (update.currency !== undefined) {
    const nextCurrency =
      update.currency && update.currency.trim().length
        ? update.currency.trim().toUpperCase()
        : undefined;
    if (nextCurrency !== opportunity.currency) {
      opportunity.currency = nextCurrency;
      changed = true;
    }
  }

  if (update.deadline !== undefined) {
    const nextDeadline = normalizeIsoDate(update.deadline);
    if (nextDeadline !== opportunity.deadline) {
      opportunity.deadline = nextDeadline;
      changed = true;
    }
  }

  if (update.status !== undefined) {
    const nextStatus = ensureGrantStatus(update.status);
    if (nextStatus !== opportunity.status) {
      opportunity.status = nextStatus;
      changed = true;
    }
  }

  if (update.eligibility !== undefined) {
    opportunity.eligibility = normalizeGrantEligibilityList(
      update.eligibility ?? [],
      opportunity.eligibility,
    );
    changed = true;
  }

  if (changed) {
    const nowIso = new Date().toISOString();
    opportunity.updatedAt = nowIso;
    opportunity.lastActivityAt = nowIso;
  }

  return changed;
};

export const getOnboardingGrantCatalog = async (
  startupId: string,
): Promise<OnboardingGrantCatalogSnapshot> => {
  const catalog = await getGrantCatalogInternal(startupId);
  return buildGrantCatalogSnapshot(catalog);
};

export const createOnboardingGrantOpportunity = async (
  startupId: string,
  opportunity: OnboardingGrantOpportunityInput,
): Promise<OnboardingGrantCatalogSnapshot> => {
  const catalog = await getGrantCatalogInternal(startupId);
  const record = createGrantOpportunityRecord(opportunity);
  catalog.opportunities.push(record);
  sortGrantOpportunities(catalog.opportunities);
  catalog.updatedAt = record.updatedAt;

  const stored = await saveGrantCatalog(startupId, catalog);
  return buildGrantCatalogSnapshot(stored);
};

export const updateOnboardingGrantOpportunity = async (
  startupId: string,
  opportunityId: string,
  update: OnboardingGrantOpportunityInput,
): Promise<OnboardingGrantCatalogSnapshot> => {
  const catalog = await getGrantCatalogInternal(startupId);
  const target = catalog.opportunities.find((item) => item.id === opportunityId);

  if (!target) {
    throw new Error("Grant opportunity not found");
  }

  const changed = applyGrantOpportunityUpdate(target, update);
  sortGrantOpportunities(catalog.opportunities);
  if (changed) {
    catalog.updatedAt = target.updatedAt;
  }

  const stored = await saveGrantCatalog(startupId, catalog);
  return buildGrantCatalogSnapshot(stored);
};

export const deleteOnboardingGrantOpportunity = async (
  startupId: string,
  opportunityId: string,
): Promise<OnboardingGrantCatalogSnapshot> => {
  const catalog = await getGrantCatalogInternal(startupId);
  const before = catalog.opportunities.length;
  catalog.opportunities = catalog.opportunities.filter((item) => item.id !== opportunityId);

  if (catalog.opportunities.length === before) {
    throw new Error("Grant opportunity not found");
  }

  catalog.updatedAt = new Date().toISOString();

  const stored = await saveGrantCatalog(startupId, catalog);
  return buildGrantCatalogSnapshot(stored);
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
  const stored = await prisma.onboardingDocumentRecord.findMany({
    where: { startupId },
    orderBy: { uploadedAt: "desc" },
  });

  if (stored.length > 0) {
    return stored.map((record) =>
      buildDocumentFromMetadata(
        record.key,
        record.name,
        record.size,
        record.contentType ?? undefined,
        record.uploadedAt.toISOString(),
        record.uploadedBy ?? undefined,
      ),
    );
  }

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

  const sorted = documents.sort(
    (a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime(),
  );

  if (sorted.length > 0) {
    await Promise.all(
      sorted.map((document) =>
        prisma.onboardingDocumentRecord.upsert({
          where: {
            startupId_key: {
              startupId,
              key: document.key,
            },
          },
          update: {
            name: document.name,
            size: document.size,
            contentType: document.contentType ?? undefined,
            uploadedAt: new Date(document.uploadedAt),
            uploadedBy: document.uploadedBy ?? undefined,
          },
          create: {
            startupId,
            key: document.key,
            name: document.name,
            size: document.size,
            contentType: document.contentType ?? undefined,
            uploadedAt: new Date(document.uploadedAt),
            uploadedBy: document.uploadedBy ?? undefined,
          },
        }),
      ),
    );
  }

  return sorted;
};

export const uploadOnboardingDocument = async (
  startupId: string,
  file: { name: string; contentType: string; buffer: Buffer; uploadedBy?: string },
): Promise<OnboardingDocument> => {
  const bucket = getBucketName();
  const safeName = sanitizeFileName(file.name);
  const key = `${DOCUMENTS_PREFIX}${startupId}/${Date.now()}-${randomUUID()}-${safeName}`;
  const uploadedAtIso = new Date().toISOString();

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

  await prisma.onboardingDocumentRecord.upsert({
    where: {
      startupId_key: {
        startupId,
        key,
      },
    },
    update: {
      name: file.name,
      size: file.buffer.length,
      contentType: file.contentType || undefined,
      uploadedAt: new Date(uploadedAtIso),
      uploadedBy: file.uploadedBy ?? undefined,
    },
    create: {
      startupId,
      key,
      name: file.name,
      size: file.buffer.length,
      contentType: file.contentType || undefined,
      uploadedAt: new Date(uploadedAtIso),
      uploadedBy: file.uploadedBy ?? undefined,
    },
  });

  return buildDocumentFromMetadata(
    key,
    file.name,
    file.buffer.length,
    file.contentType,
    uploadedAtIso,
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
