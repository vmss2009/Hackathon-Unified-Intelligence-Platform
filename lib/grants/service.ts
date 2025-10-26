import type { Prisma } from "@prisma/client";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db/prisma";
import type {
  FlattenedGrantDisbursement,
  GrantCatalog,
  GrantCatalogPayload,
  GrantCatalogRecord,
  GrantCompliance,
  GrantCompliancePayload,
  GrantComplianceReport,
  GrantComplianceStatus,
  GrantFinancialSummary,
  GrantDisbursement,
  GrantDisbursementApproval,
  GrantDisbursementApprovalPayload,
  GrantDisbursementPayload,
  GrantDisbursementRequestInput,
  GrantDisbursementStatus,
  GrantDisbursementStatusUpdateInput,
  GrantExpenditure,
  GrantExpenditurePayload,
  CurrencyFinancialTotals,
  GrantRecord,
  GrantRecordPayload,
  GrantReportBundle,
  GrantReportRequest,
  GrantReportWindow,
  GrantUtilizationCertificate,
  IncubatorFinancialOverview,
} from "./types";

const DEFAULT_CATALOG: GrantCatalog = {
  version: 1,
  updatedAt: undefined,
  grants: [],
};

const DISBURSEMENT_STATUS_VALUES: GrantDisbursementStatus[] = [
  "draft",
  "pending",
  "approved",
  "rejected",
  "released",
];

const isValidStatus = (value: unknown): value is GrantDisbursementStatus => {
  return typeof value === "string" && DISBURSEMENT_STATUS_VALUES.includes(value as GrantDisbursementStatus);
};

const toStatus = (value: unknown, fallback: GrantDisbursementStatus): GrantDisbursementStatus => {
  return isValidStatus(value) ? (value as GrantDisbursementStatus) : fallback;
};

const parseNumber = (value: unknown, fallback = 0): number => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
};

const ensureIsoString = (value: unknown): string | undefined => {
  if (typeof value !== "string" || value.trim().length === 0) {
    return undefined;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }

  return date.toISOString();
};

const normaliseApproval = (payload: GrantDisbursementApprovalPayload): GrantDisbursementApproval => ({
  id: payload.id,
  status: toStatus(payload.status, "pending"),
  note: payload.note ?? undefined,
  actorId: payload.actorId ?? undefined,
  actorName: payload.actorName ?? undefined,
  actorEmail: payload.actorEmail ?? undefined,
  decidedAt: ensureIsoString(payload.decidedAt) ?? new Date().toISOString(),
});

const normaliseDisbursement = (payload: GrantDisbursementPayload): GrantDisbursement => {
  const requestedAt = ensureIsoString(payload.requestedAt);
  const targetReleaseDate = ensureIsoString(payload.targetReleaseDate);
  const releasedAt = ensureIsoString(payload.releasedAt);
  const date = ensureIsoString(payload.date) ?? releasedAt ?? targetReleaseDate ?? requestedAt ?? new Date().toISOString();
  const status = toStatus(payload.status, releasedAt ? "released" : "pending");
  const approvals = Array.isArray(payload.approvals)
    ? payload.approvals.map(normaliseApproval)
    : [];

  return {
    id: payload.id,
    amount: parseNumber(payload.amount, 0),
    date,
    tranche: payload.tranche ?? undefined,
    reference: payload.reference ?? undefined,
    milestoneId: payload.milestoneId ?? undefined,
    requestedBy: payload.requestedBy ?? undefined,
    requestedAt: requestedAt ?? undefined,
    targetReleaseDate: targetReleaseDate ?? undefined,
    status,
    approvals,
    releasedAt: releasedAt ?? undefined,
    notes: payload.notes ?? undefined,
    metadata: (payload.metadata ?? undefined) as Record<string, unknown> | undefined,
  };
};

const normaliseExpenditure = (payload: GrantExpenditurePayload): GrantExpenditure => ({
  id: payload.id,
  category: payload.category ?? "Uncategorised",
  description: payload.description ?? undefined,
  amount: parseNumber(payload.amount, 0),
  date: ensureIsoString(payload.date) ?? new Date().toISOString(),
  vendor: payload.vendor ?? undefined,
  invoiceNumber: payload.invoiceNumber ?? undefined,
  supportingDocs: Array.isArray(payload.supportingDocs)
    ? payload.supportingDocs.filter((item: unknown): item is string => typeof item === "string" && item.length > 0)
    : undefined,
  complianceTags: Array.isArray(payload.complianceTags)
    ? payload.complianceTags.filter((item: unknown): item is string => typeof item === "string" && item.length > 0)
    : undefined,
  capitalExpense: payload.capitalExpense ?? false,
  metadata: (payload.metadata ?? undefined) as Record<string, unknown> | undefined,
});

const resolveComplianceStatus = (payload: GrantCompliancePayload): GrantComplianceStatus => {
  if (payload.status && ["pending", "in_progress", "completed", "overdue"].includes(payload.status)) {
    return payload.status;
  }

  const dueDate = ensureIsoString(payload.dueDate);
  const completedAt = ensureIsoString(payload.completedAt);

  if (completedAt) {
    return "completed";
  }

  if (dueDate) {
    const now = Date.now();
    const dueMs = new Date(dueDate).getTime();
    if (dueMs < now) {
      return "overdue";
    }
  }

  return "pending";
};

const normaliseCompliance = (payload: GrantCompliancePayload): GrantCompliance => ({
  id: payload.id,
  title: payload.title ?? "Compliance requirement",
  description: payload.description ?? undefined,
  dueDate: ensureIsoString(payload.dueDate),
  completedAt: ensureIsoString(payload.completedAt),
  status: resolveComplianceStatus(payload),
  owner: payload.owner ?? undefined,
  evidenceUrls: Array.isArray(payload.evidenceUrls)
    ? payload.evidenceUrls.filter((item: unknown): item is string => typeof item === "string" && item.length > 0)
    : undefined,
  metadata: (payload.metadata ?? undefined) as Record<string, unknown> | undefined,
});

const normaliseGrantRecord = (payload: GrantRecordPayload): GrantRecord => ({
  id: payload.id,
  name: payload.name ?? "Grant",
  fundingAgency: payload.fundingAgency ?? undefined,
  program: payload.program ?? undefined,
  sanctionNumber: payload.sanctionNumber ?? undefined,
  sanctionDate: ensureIsoString(payload.sanctionDate),
  totalSanctionedAmount: parseNumber(payload.totalSanctionedAmount, 0),
  currency: payload.currency ?? "INR",
  managingDepartment: payload.managingDepartment ?? undefined,
  purpose: payload.purpose ?? undefined,
  startDate: ensureIsoString(payload.startDate),
  endDate: ensureIsoString(payload.endDate),
  disbursements: Array.isArray(payload.disbursements)
    ? payload.disbursements.map(normaliseDisbursement)
    : [],
  expenditures: Array.isArray(payload.expenditures)
    ? payload.expenditures.map(normaliseExpenditure)
    : [],
  compliance: Array.isArray(payload.compliance)
    ? payload.compliance.map(normaliseCompliance)
    : [],
  metadata: (payload.metadata ?? undefined) as Record<string, unknown> | undefined,
});

const normaliseCatalog = (payload: GrantCatalogPayload | null | undefined): GrantCatalog => {
  if (!payload || typeof payload !== "object") {
    return { ...DEFAULT_CATALOG };
  }

  return {
    version: parseNumber((payload as GrantCatalogPayload).version ?? 1, 1),
    updatedAt: ensureIsoString(payload.updatedAt),
    grants: Array.isArray(payload.grants)
      ? payload.grants.map(normaliseGrantRecord)
      : [],
  };
};

const approvalToPayload = (approval: GrantDisbursementApproval): GrantDisbursementApprovalPayload => ({
  id: approval.id,
  status: approval.status,
  note: approval.note,
  actorId: approval.actorId,
  actorName: approval.actorName,
  actorEmail: approval.actorEmail,
  decidedAt: approval.decidedAt,
});

const disbursementToPayload = (disbursement: GrantDisbursement): GrantDisbursementPayload => ({
  id: disbursement.id,
  amount: disbursement.amount,
  date: disbursement.date,
  tranche: disbursement.tranche,
  reference: disbursement.reference,
  milestoneId: disbursement.milestoneId,
  requestedBy: disbursement.requestedBy,
  requestedAt: disbursement.requestedAt,
  targetReleaseDate: disbursement.targetReleaseDate,
  status: disbursement.status,
  approvals: disbursement.approvals.map(approvalToPayload),
  releasedAt: disbursement.releasedAt,
  notes: disbursement.notes,
  metadata: disbursement.metadata ?? undefined,
});

const expenditureToPayload = (expenditure: GrantExpenditure): GrantExpenditurePayload => ({
  id: expenditure.id,
  category: expenditure.category,
  description: expenditure.description,
  amount: expenditure.amount,
  date: expenditure.date,
  vendor: expenditure.vendor,
  invoiceNumber: expenditure.invoiceNumber,
  supportingDocs: expenditure.supportingDocs,
  complianceTags: expenditure.complianceTags,
  capitalExpense: expenditure.capitalExpense,
  metadata: expenditure.metadata ?? undefined,
});

const complianceToPayload = (compliance: GrantCompliance): GrantCompliancePayload => ({
  id: compliance.id,
  title: compliance.title,
  description: compliance.description,
  dueDate: compliance.dueDate,
  completedAt: compliance.completedAt,
  status: compliance.status,
  owner: compliance.owner,
  evidenceUrls: compliance.evidenceUrls,
  metadata: compliance.metadata ?? undefined,
});

const grantToPayload = (grant: GrantRecord): GrantRecordPayload => ({
  id: grant.id,
  name: grant.name,
  fundingAgency: grant.fundingAgency,
  program: grant.program,
  sanctionNumber: grant.sanctionNumber,
  sanctionDate: grant.sanctionDate,
  totalSanctionedAmount: grant.totalSanctionedAmount,
  currency: grant.currency,
  managingDepartment: grant.managingDepartment,
  purpose: grant.purpose,
  startDate: grant.startDate,
  endDate: grant.endDate,
  disbursements: grant.disbursements.map(disbursementToPayload),
  expenditures: grant.expenditures.map(expenditureToPayload),
  compliance: grant.compliance.map(complianceToPayload),
  metadata: grant.metadata ?? undefined,
});

const catalogToPayload = (catalog: GrantCatalog): GrantCatalogPayload => ({
  version: catalog.version,
  updatedAt: catalog.updatedAt,
  grants: catalog.grants.map(grantToPayload),
});

const saveGrantCatalogRecord = async (startupId: string, catalog: GrantCatalog) => {
  const payload = catalogToPayload(catalog);
  const payloadValue = payload as unknown as Prisma.InputJsonValue;
  await prisma.onboardingGrantCatalogRecord.upsert({
    where: { startupId },
    create: {
      startupId,
      payload: payloadValue,
    },
    update: {
      payload: payloadValue,
    },
  });
};

export const getGrantCatalog = async (startupId: string): Promise<GrantCatalogRecord> => {
  const record = await prisma.onboardingGrantCatalogRecord.findUnique({
    where: { startupId },
  });

  if (!record) {
    return {
      startupId,
      catalog: { ...DEFAULT_CATALOG },
      raw: null,
    };
  }

  return {
    startupId,
    catalog: normaliseCatalog((record.payload as GrantCatalogPayload | null | undefined) ?? undefined),
    raw: record,
  };
};

export const listGrantDisbursements = async (
  startupId: string,
): Promise<{ catalog: GrantCatalog; disbursements: FlattenedGrantDisbursement[] }> => {
  const record = await getGrantCatalog(startupId);
  const flattened: FlattenedGrantDisbursement[] = record.catalog.grants.flatMap((grant) =>
    grant.disbursements.map((disbursement) => ({
      startupId,
      grantId: grant.id,
      grantName: grant.name,
      disbursement,
    })),
  );

  return {
    catalog: record.catalog,
    disbursements: flattened,
  };
};

export type GrantDisbursementSnapshot = {
  startupId: string;
  grants: GrantRecord[];
  grant: GrantRecord;
  summary: GrantFinancialSummary;
};

export const getGrantDisbursementSnapshot = async (
  startupId: string,
  grantId?: string,
): Promise<GrantDisbursementSnapshot> => {
  const catalogRecord = await getGrantCatalog(startupId);
  const grants = catalogRecord.catalog.grants;

  if (!grants.length) {
    throw new Error(`No grants configured for startup ${startupId}`);
  }

  const targetGrant = grantId ? findGrantOrThrow(catalogRecord.catalog, grantId) : grants[0];
  const summary = summariseGrantFinancials(startupId, targetGrant);

  return {
    startupId,
    grants,
    grant: targetGrant,
    summary,
  };
};

export const requestGrantDisbursement = async (
  startupId: string,
  input: GrantDisbursementRequestInput,
): Promise<FlattenedGrantDisbursement> => {
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new Error("Disbursement amount must be greater than zero");
  }

  await ensureMilestoneExists(startupId, input.milestoneId);

  const catalogRecord = await getGrantCatalog(startupId);
  const grant = findGrantOrThrow(catalogRecord.catalog, input.grantId);

  const now = new Date().toISOString();
  const targetReleaseDate = ensureIsoString(input.targetReleaseDate);

  const initialApproval: GrantDisbursementApproval = {
    id: randomUUID(),
    status: "pending",
    note: input.notes ?? "Disbursement requested",
    actorId: input.requestedBy.id,
    actorName: input.requestedBy.name,
    actorEmail: input.requestedBy.email,
    decidedAt: now,
  };

  const disbursement: GrantDisbursement = {
    id: randomUUID(),
    amount: parseNumber(input.amount, 0),
    date: targetReleaseDate ?? now,
    tranche: input.tranche ?? undefined,
    reference: input.reference ?? undefined,
    milestoneId: input.milestoneId ?? undefined,
    requestedBy: input.requestedBy.id,
    requestedAt: now,
    targetReleaseDate: targetReleaseDate ?? undefined,
    status: "pending",
    approvals: [initialApproval],
    releasedAt: undefined,
    notes: input.notes ?? undefined,
    metadata: {
      requestedByName: input.requestedBy.name,
      requestedByEmail: input.requestedBy.email,
    },
  };

  grant.disbursements.push(disbursement);
  catalogRecord.catalog.updatedAt = now;

  await saveGrantCatalogRecord(startupId, catalogRecord.catalog);

  return {
    startupId,
    grantId: grant.id,
    grantName: grant.name,
    disbursement,
  };
};

const ensureStatusTransition = (current: GrantDisbursementStatus, next: GrantDisbursementStatus) => {
  if (current === "released" && next !== "released") {
    throw new Error("Released disbursements cannot transition to a different status");
  }
};

export const updateGrantDisbursementStatus = async (
  startupId: string,
  input: GrantDisbursementStatusUpdateInput,
): Promise<FlattenedGrantDisbursement> => {
  if (!isValidStatus(input.status)) {
    throw new Error("Invalid disbursement status");
  }

  const catalogRecord = await getGrantCatalog(startupId);
  const grant = findGrantOrThrow(catalogRecord.catalog, input.grantId);
  const disbursement = grant.disbursements.find((item) => item.id === input.disbursementId);

  if (!disbursement) {
    throw new Error(`Disbursement ${input.disbursementId} not found on grant ${input.grantId}`);
  }

  ensureStatusTransition(disbursement.status, input.status);

  const now = new Date().toISOString();
  const decidedAt = ensureIsoString(input.releaseDate) ?? now;

  disbursement.status = input.status;
  disbursement.approvals = [
    ...disbursement.approvals,
    {
      id: randomUUID(),
      status: input.status,
      note: input.note ?? undefined,
      actorId: input.actor.id,
      actorName: input.actor.name,
      actorEmail: input.actor.email,
      decidedAt,
    },
  ];

  if (input.status === "released") {
    const releaseTimestamp = ensureIsoString(input.releaseDate) ?? decidedAt;
    disbursement.releasedAt = releaseTimestamp;
    disbursement.date = releaseTimestamp ?? disbursement.date;
    if (input.releaseReference) {
      disbursement.reference = input.releaseReference;
    }
  } else if (input.status === "rejected") {
    disbursement.releasedAt = undefined;
  }

  catalogRecord.catalog.updatedAt = now;
  await saveGrantCatalogRecord(startupId, catalogRecord.catalog);

  return {
    startupId,
    grantId: grant.id,
    grantName: grant.name,
    disbursement,
  };
};

const assertPeriod = (period: GrantReportWindow) => {
  const start = ensureIsoString(period.start);
  const end = ensureIsoString(period.end);

  if (!start || !end) {
    throw new Error("A valid reporting period is required");
  }

  if (new Date(start).getTime() > new Date(end).getTime()) {
    throw new Error("Reporting period end must be after start");
  }

  return { start, end } as const;
};

const findGrantOrThrow = (catalog: GrantCatalog, grantId: string): GrantRecord => {
  const grant = catalog.grants.find((item) => item.id === grantId);
  if (!grant) {
    throw new Error(`Grant with id ${grantId} not found`);
  }
  return grant;
};

const ensureMilestoneExists = async (startupId: string, milestoneId?: string) => {
  if (!milestoneId) {
    return;
  }

  const plan = await prisma.onboardingMilestonePlanRecord.findUnique({ where: { startupId } });
  const payload = plan?.payload as { milestones?: Array<{ id: string }> } | null | undefined;
  const hasMilestone = payload?.milestones?.some((item) => item.id === milestoneId) ?? false;

  if (!hasMilestone) {
    throw new Error(`Milestone ${milestoneId} not found for startup ${startupId}`);
  }
};

const withinInclusive = (isoDate: string | undefined, start: string, end: string): boolean => {
  if (!isoDate) return false;
  const time = new Date(isoDate).getTime();
  return time >= new Date(start).getTime() && time <= new Date(end).getTime();
};

const before = (isoDate: string | undefined, reference: string): boolean => {
  if (!isoDate) return false;
  return new Date(isoDate).getTime() < new Date(reference).getTime();
};

const sumAmounts = <T>(items: T[], selector: (item: T) => number): number => {
  return items.reduce((total, item) => total + selector(item), 0);
};

const buildExpenseBreakdown = (expenditures: GrantExpenditure[]): Array<{ category: string; amount: number; percentage: number }> => {
  const totals = new Map<string, number>();
  expenditures.forEach((expense) => {
    const current = totals.get(expense.category) ?? 0;
    totals.set(expense.category, current + expense.amount);
  });

  const grandTotal = Array.from(totals.values()).reduce((acc, value) => acc + value, 0) || 1;

  return Array.from(totals.entries()).map(([category, amount]) => ({
    category,
    amount,
    percentage: Number(((amount / grandTotal) * 100).toFixed(2)),
  }));
};

const summariseCompliance = (items: GrantCompliance[]) => {
  return items.reduce(
    (acc, item) => {
      const status = item.status;
      if (status === "completed") {
        acc.completed += 1;
      } else if (status === "overdue") {
        acc.overdue += 1;
      } else if (status === "in_progress") {
        acc.inProgress += 1;
      } else {
        acc.pending += 1;
      }
      return acc;
    },
    { completed: 0, overdue: 0, pending: 0, inProgress: 0 },
  );
};

const effectiveDisbursementDate = (disbursement: GrantDisbursement): string | undefined => {
  return disbursement.releasedAt ?? disbursement.date;
};

const releasedDisbursements = (grant: GrantRecord): GrantDisbursement[] => {
  return grant.disbursements.filter((item) => item.status === "released");
};

const summariseGrantFinancials = (startupId: string, grant: GrantRecord): GrantFinancialSummary => {
  let totalReleased = 0;
  let totalPending = 0;
  let totalRejected = 0;
  let pendingCount = 0;
  let releasedCount = 0;
  let upcomingTargetRelease: string | undefined;
  let lastDisbursementAt: string | undefined;

  grant.disbursements.forEach((disbursement) => {
    const amount = disbursement.amount ?? 0;

    if (disbursement.status === "released") {
      totalReleased += amount;
      releasedCount += 1;
      const releasedAt = effectiveDisbursementDate(disbursement);
      if (releasedAt && (!lastDisbursementAt || new Date(releasedAt).getTime() > new Date(lastDisbursementAt).getTime())) {
        lastDisbursementAt = releasedAt;
      }
      return;
    }

    if (disbursement.status === "pending" || disbursement.status === "approved") {
      totalPending += amount;
      pendingCount += 1;
      const targetDate = disbursement.targetReleaseDate ?? disbursement.date;
      if (targetDate && (!upcomingTargetRelease || new Date(targetDate).getTime() < new Date(upcomingTargetRelease).getTime())) {
        upcomingTargetRelease = targetDate;
      }
      return;
    }

    if (disbursement.status === "rejected") {
      totalRejected += amount;
    }
  });

  const totalUtilised = sumAmounts(grant.expenditures, (item) => item.amount);
  const availableToUtilise = totalReleased - totalUtilised;
  const remainingSanctionBalance = Math.max(grant.totalSanctionedAmount - (totalReleased + totalPending), 0);

  return {
    startupId,
    grantId: grant.id,
    grantName: grant.name,
    currency: grant.currency,
    totalSanctioned: grant.totalSanctionedAmount,
    totalReleased,
    totalPendingAmount: totalPending,
    totalRejectedAmount: totalRejected,
    totalUtilised,
    availableToUtilise,
    remainingSanctionBalance,
    pendingDisbursementCount: pendingCount,
    releasedDisbursementCount: releasedCount,
    upcomingTargetRelease,
    lastDisbursementAt,
  };
};

export const generateGrantUtilizationCertificate = (
  catalog: GrantCatalog,
  request: GrantReportRequest,
): GrantUtilizationCertificate => {
  const { start, end } = assertPeriod(request.period);
  const grant = findGrantOrThrow(catalog, request.grantId);
  const released = releasedDisbursements(grant);

  const totalDisbursedToDate = sumAmounts(
    released.filter((item) => {
      const date = effectiveDisbursementDate(item);
      return !date || new Date(date).getTime() <= new Date(end).getTime();
    }),
    (item) => item.amount,
  );
  const disbursedBeforePeriod = sumAmounts(
    released.filter((item) => before(effectiveDisbursementDate(item), start)),
    (item) => item.amount,
  );
  const disbursedDuringPeriod = sumAmounts(
    released.filter((item) => withinInclusive(effectiveDisbursementDate(item), start, end)),
    (item) => item.amount,
  );

  const expendituresBeforePeriod = sumAmounts(
    grant.expenditures.filter((item) => before(item.date, start)),
    (item) => item.amount,
  );
  const expendituresDuringPeriod = grant.expenditures.filter((item) => withinInclusive(item.date, start, end));
  const utilizationDuringPeriod = sumAmounts(expendituresDuringPeriod, (item) => item.amount);
  const cumulativeUtilization = sumAmounts(
    grant.expenditures.filter((item) => !item.date || new Date(item.date).getTime() <= new Date(end).getTime()),
    (item) => item.amount,
  );

  const openingBalance = disbursedBeforePeriod - expendituresBeforePeriod;
  const closingBalance = totalDisbursedToDate - cumulativeUtilization;

  const certificateNumber = request.certificateNumber
    ?? `GUC-${grant.id}-${new Date(end).toISOString().slice(0, 10).replace(/-/g, "")}`;
  const issuedAt = request.issuedAt ?? new Date().toISOString();

  const complianceSummary = summariseCompliance(grant.compliance);
  const remarks = complianceSummary.overdue > 0
    ? `${complianceSummary.overdue} compliance item(s) overdue`
    : complianceSummary.pending + complianceSummary.inProgress > 0
    ? `${complianceSummary.pending + complianceSummary.inProgress} compliance item(s) pending`
    : "All compliance requirements are met";

  return {
    certificateNumber,
    issuedAt,
    issuedBy: request.issuedBy,
    grant: {
      id: grant.id,
      name: grant.name,
      fundingAgency: grant.fundingAgency,
      sanctionNumber: grant.sanctionNumber,
      sanctionDate: grant.sanctionDate,
      currency: grant.currency,
      managingDepartment: grant.managingDepartment,
    },
    period: { start, end },
    financials: {
      totalSanctioned: grant.totalSanctionedAmount,
      totalDisbursedToDate,
      disbursedDuringPeriod,
      openingBalance,
      utilizationDuringPeriod,
      cumulativeUtilization,
      closingBalance,
    },
    expenseBreakdown: buildExpenseBreakdown(expendituresDuringPeriod),
    complianceSummary: {
      completed: complianceSummary.completed,
      pending: complianceSummary.pending + complianceSummary.inProgress,
      overdue: complianceSummary.overdue,
      remarks,
    },
    signatories: {
      preparedBy: request.preparedBy,
      verifiedBy: request.verifiedBy,
      authorisedSignatory: request.issuedBy,
    },
  };
};

const isLikelyIneligible = (expenditure: GrantExpenditure): boolean => {
  if (!Array.isArray(expenditure.complianceTags)) {
    return false;
  }
  return expenditure.complianceTags.some((tag) => /ineligible|non[-_ ]?compliant|disallowed/i.test(tag));
};

const buildObservations = (
  utilisationRatio: number,
  pendingCompliance: number,
  overdueCompliance: number,
  documentationIssues: number,
): string[] => {
  const notes: string[] = [];

  if (utilisationRatio < 0.5) {
    notes.push("Utilisation below 50% of sanctioned amount; consider accelerating project spend or revising milestones.");
  } else if (utilisationRatio > 1) {
    notes.push("Utilisation exceeds sanctioned amount; review additional funding approvals or reallocate budgets.");
  }

  if (overdueCompliance > 0) {
    notes.push(`${overdueCompliance} compliance item(s) overdue require immediate attention.`);
  }

  if (pendingCompliance > 0) {
    notes.push(`${pendingCompliance} compliance item(s) remain pending within the reporting window.`);
  }

  if (documentationIssues > 0) {
    notes.push(`${documentationIssues} expenditure record(s) missing supporting documentation.`);
  }

  if (notes.length === 0) {
    notes.push("Grant utilisation and compliance are on track for the reported period.");
  }

  return notes;
};

const buildRecommendations = (
  overdueCompliance: number,
  pendingCompliance: number,
  documentationIssues: number,
): string[] => {
  const recommendations: string[] = [];

  if (overdueCompliance > 0) {
    recommendations.push("Escalate overdue compliance actions to the programme lead and schedule resolution checkpoints.");
  }

  if (pendingCompliance > 0) {
    recommendations.push("Assign responsible owners and target dates for all pending compliance requirements.");
  }

  if (documentationIssues > 0) {
    recommendations.push("Collect and upload invoices or utilisation proofs for records flagged without documentation.");
  }

  if (recommendations.length === 0) {
    recommendations.push("Maintain current monitoring cadence and documentation standards.");
  }

  return recommendations;
};

export const generateGrantComplianceReport = (
  catalog: GrantCatalog,
  request: GrantReportRequest,
): GrantComplianceReport => {
  const { start, end } = assertPeriod(request.period);
  const grant = findGrantOrThrow(catalog, request.grantId);

  const expendituresInPeriod = grant.expenditures.filter((item) => withinInclusive(item.date, start, end));
  const totalExpenditure = sumAmounts(expendituresInPeriod, (item) => item.amount);
  const ineligibleExpenditure = sumAmounts(
    expendituresInPeriod.filter(isLikelyIneligible),
    (item) => item.amount,
  );
  const eligibleExpenditure = totalExpenditure - ineligibleExpenditure;
  const utilisationRatio = grant.totalSanctionedAmount > 0
    ? Number((totalExpenditure / grant.totalSanctionedAmount).toFixed(2))
    : 0;

  const complianceDuringPeriod = grant.compliance.filter((item) => {
    if (!item.dueDate) {
      return true;
    }
    return withinInclusive(item.dueDate, start, end) || withinInclusive(item.completedAt, start, end);
  });

  const complianceSummary = summariseCompliance(complianceDuringPeriod);
  const documentationFindings = expendituresInPeriod
    .filter((item) => !item.supportingDocs || item.supportingDocs.length === 0)
    .map((item) => ({
      expenditureId: item.id,
      description: item.description,
      amount: item.amount,
      missingDocuments: true,
      notes: "Supporting documentation not linked",
    }));

  const observations = buildObservations(
    utilisationRatio,
    complianceSummary.pending + complianceSummary.inProgress,
    complianceSummary.overdue,
    documentationFindings.length,
  );

  const outstandingActions = complianceDuringPeriod
    .filter((item) => item.status !== "completed")
    .map((item) => ({
      id: item.id,
      title: item.title,
      dueDate: item.dueDate,
      owner: item.owner,
      status: item.status,
    }));

  const recommendations = buildRecommendations(
    complianceSummary.overdue,
    complianceSummary.pending + complianceSummary.inProgress,
    documentationFindings.length,
  );

  return {
    generatedAt: new Date().toISOString(),
    grant: {
      id: grant.id,
      name: grant.name,
      fundingAgency: grant.fundingAgency,
      programme: grant.program,
      sanctionNumber: grant.sanctionNumber,
      currency: grant.currency,
    },
    period: { start, end },
    executiveSummary: {
      totalExpenditure,
      eligibleExpenditure,
      ineligibleExpenditure,
      utilisationRatio,
      observations,
    },
    complianceStatus: {
      totalItems: complianceDuringPeriod.length,
      completed: complianceSummary.completed,
      inProgress: complianceSummary.inProgress,
      pending: complianceSummary.pending,
      overdue: complianceSummary.overdue,
    },
    outstandingActions,
    documentationFindings,
    recommendations,
  };
};

export const generateGrantReports = (
  catalog: GrantCatalog,
  request: GrantReportRequest,
): GrantReportBundle => {
  return {
    certificate: generateGrantUtilizationCertificate(catalog, request),
    complianceReport: generateGrantComplianceReport(catalog, request),
  };
};

export const getIncubatorFinancialOverview = async (): Promise<IncubatorFinancialOverview> => {
  const records = await prisma.onboardingGrantCatalogRecord.findMany();
  const totalsByCurrency = new Map<string, CurrencyFinancialTotals>();
  const grantSummaries: GrantFinancialSummary[] = [];
  let latestUpdatedMs = 0;

  records.forEach((record) => {
    const catalog = normaliseCatalog((record.payload as GrantCatalogPayload | null | undefined) ?? undefined);
    const recordUpdatedMs = record.updatedAt?.getTime() ?? 0;
    if (recordUpdatedMs > latestUpdatedMs) {
      latestUpdatedMs = recordUpdatedMs;
    }

    if (catalog.updatedAt) {
      const catalogUpdatedMs = new Date(catalog.updatedAt).getTime();
      if (!Number.isNaN(catalogUpdatedMs) && catalogUpdatedMs > latestUpdatedMs) {
        latestUpdatedMs = catalogUpdatedMs;
      }
    }

    catalog.grants.forEach((grant) => {
      const summary = summariseGrantFinancials(record.startupId, grant);
      grantSummaries.push(summary);

      const existingTotals = totalsByCurrency.get(summary.currency);
      const totals: CurrencyFinancialTotals = existingTotals
        ?? {
          currency: summary.currency,
          totalSanctioned: 0,
          totalReleased: 0,
          totalPendingAmount: 0,
          totalRejectedAmount: 0,
          totalUtilised: 0,
          availableToUtilise: 0,
          remainingSanctionBalance: 0,
        };

      totals.totalSanctioned += summary.totalSanctioned;
      totals.totalReleased += summary.totalReleased;
      totals.totalPendingAmount += summary.totalPendingAmount;
      totals.totalRejectedAmount += summary.totalRejectedAmount;
      totals.totalUtilised += summary.totalUtilised;
      totals.availableToUtilise += summary.availableToUtilise;
      totals.remainingSanctionBalance += summary.remainingSanctionBalance;

      totalsByCurrency.set(summary.currency, totals);
    });
  });

  console.log(records, grantSummaries);

  return {
    totalsByCurrency: Array.from(totalsByCurrency.values()).sort((a, b) => a.currency.localeCompare(b.currency)),
    grants: grantSummaries,
    updatedAt: latestUpdatedMs > 0 ? new Date(latestUpdatedMs).toISOString() : undefined,
  };
};
