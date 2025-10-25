import { prisma } from "@/lib/db/prisma";
import type {
  GrantCatalog,
  GrantCatalogPayload,
  GrantCatalogRecord,
  GrantCompliance,
  GrantCompliancePayload,
  GrantComplianceReport,
  GrantComplianceStatus,
  GrantDisbursement,
  GrantDisbursementPayload,
  GrantExpenditure,
  GrantExpenditurePayload,
  GrantRecord,
  GrantRecordPayload,
  GrantReportBundle,
  GrantReportRequest,
  GrantReportWindow,
  GrantUtilizationCertificate,
} from "./types";

const DEFAULT_CATALOG: GrantCatalog = {
  version: 1,
  updatedAt: undefined,
  grants: [],
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

const normaliseDisbursement = (payload: GrantDisbursementPayload): GrantDisbursement => ({
  id: payload.id,
  amount: parseNumber(payload.amount, 0),
  date: ensureIsoString(payload.date) ?? new Date().toISOString(),
  tranche: payload.tranche ?? undefined,
  reference: payload.reference ?? undefined,
  notes: payload.notes ?? undefined,
});

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

export const generateGrantUtilizationCertificate = (
  catalog: GrantCatalog,
  request: GrantReportRequest,
): GrantUtilizationCertificate => {
  const { start, end } = assertPeriod(request.period);
  const grant = findGrantOrThrow(catalog, request.grantId);

  const totalDisbursedToDate = sumAmounts(
    grant.disbursements.filter((item) => !item.date || new Date(item.date).getTime() <= new Date(end).getTime()),
    (item) => item.amount,
  );
  const disbursedBeforePeriod = sumAmounts(
    grant.disbursements.filter((item) => before(item.date, start)),
    (item) => item.amount,
  );
  const disbursedDuringPeriod = sumAmounts(
    grant.disbursements.filter((item) => withinInclusive(item.date, start, end)),
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
