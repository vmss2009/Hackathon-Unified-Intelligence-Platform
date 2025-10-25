import type { OnboardingGrantCatalogRecord } from "@prisma/client";

export type GrantCatalogPayload = {
  version?: number;
  grants?: GrantRecordPayload[];
  updatedAt?: string;
};

export type GrantRecordPayload = {
  id: string;
  name: string;
  fundingAgency?: string;
  program?: string;
  sanctionNumber?: string;
  sanctionDate?: string;
  totalSanctionedAmount?: number;
  currency?: string;
  managingDepartment?: string;
  purpose?: string;
  startDate?: string;
  endDate?: string;
  disbursements?: GrantDisbursementPayload[];
  expenditures?: GrantExpenditurePayload[];
  compliance?: GrantCompliancePayload[];
  metadata?: Record<string, unknown> | null;
};

export type GrantDisbursementPayload = {
  id: string;
  amount: number;
  date: string;
  tranche?: string;
  reference?: string;
  notes?: string;
};

export type GrantExpenditurePayload = {
  id: string;
  category: string;
  description?: string;
  amount: number;
  date: string;
  vendor?: string;
  invoiceNumber?: string;
  supportingDocs?: string[];
  complianceTags?: string[];
  capitalExpense?: boolean;
  metadata?: Record<string, unknown> | null;
};

export type GrantCompliancePayload = {
  id: string;
  title: string;
  description?: string;
  dueDate?: string;
  completedAt?: string;
  status?: GrantComplianceStatus;
  owner?: string;
  evidenceUrls?: string[];
  metadata?: Record<string, unknown> | null;
};

export type GrantComplianceStatus = "pending" | "in_progress" | "completed" | "overdue";

export type GrantCatalogRecord = {
  startupId: string;
  catalog: GrantCatalog;
  raw?: OnboardingGrantCatalogRecord | null;
};

export type GrantCatalog = {
  version: number;
  updatedAt?: string;
  grants: GrantRecord[];
};

export type GrantRecord = {
  id: string;
  name: string;
  fundingAgency?: string;
  program?: string;
  sanctionNumber?: string;
  sanctionDate?: string;
  totalSanctionedAmount: number;
  currency: string;
  managingDepartment?: string;
  purpose?: string;
  startDate?: string;
  endDate?: string;
  disbursements: GrantDisbursement[];
  expenditures: GrantExpenditure[];
  compliance: GrantCompliance[];
  metadata?: Record<string, unknown>;
};

export type GrantDisbursement = {
  id: string;
  amount: number;
  date: string;
  tranche?: string;
  reference?: string;
  notes?: string;
};

export type GrantExpenditure = {
  id: string;
  category: string;
  description?: string;
  amount: number;
  date: string;
  vendor?: string;
  invoiceNumber?: string;
  supportingDocs?: string[];
  complianceTags?: string[];
  capitalExpense?: boolean;
  metadata?: Record<string, unknown>;
};

export type GrantCompliance = {
  id: string;
  title: string;
  description?: string;
  dueDate?: string;
  completedAt?: string;
  status: GrantComplianceStatus;
  owner?: string;
  evidenceUrls?: string[];
  metadata?: Record<string, unknown>;
};

export type GrantReportWindow = {
  start: string;
  end: string;
};

export type GrantReportRequest = {
  grantId: string;
  period: GrantReportWindow;
  issuedBy?: string;
  issuedAt?: string;
  certificateNumber?: string;
  preparedBy?: string;
  verifiedBy?: string;
};

export type GrantUtilizationCertificate = {
  certificateNumber: string;
  issuedAt: string;
  issuedBy?: string;
  grant: {
    id: string;
    name: string;
    fundingAgency?: string;
    sanctionNumber?: string;
    sanctionDate?: string;
    currency: string;
    managingDepartment?: string;
  };
  period: GrantReportWindow;
  financials: {
    totalSanctioned: number;
    totalDisbursedToDate: number;
    disbursedDuringPeriod: number;
    openingBalance: number;
    utilizationDuringPeriod: number;
    cumulativeUtilization: number;
    closingBalance: number;
  };
  expenseBreakdown: Array<{
    category: string;
    amount: number;
    percentage: number;
  }>;
  complianceSummary: {
    completed: number;
    pending: number;
    overdue: number;
    remarks?: string;
  };
  signatories: {
    preparedBy?: string;
    verifiedBy?: string;
    authorisedSignatory?: string;
  };
};

export type GrantComplianceReport = {
  generatedAt: string;
  grant: {
    id: string;
    name: string;
    fundingAgency?: string;
    programme?: string;
    sanctionNumber?: string;
    currency: string;
  };
  period: GrantReportWindow;
  executiveSummary: {
    totalExpenditure: number;
    eligibleExpenditure: number;
    ineligibleExpenditure: number;
    utilisationRatio: number;
    observations: string[];
  };
  complianceStatus: {
    totalItems: number;
    completed: number;
    inProgress: number;
    pending: number;
    overdue: number;
  };
  outstandingActions: Array<{
    id: string;
    title: string;
    dueDate?: string;
    owner?: string;
    status: GrantComplianceStatus;
  }>;
  documentationFindings: Array<{
    expenditureId: string;
    description?: string;
    amount: number;
    missingDocuments: boolean;
    notes?: string;
  }>;
  recommendations: string[];
};

export type GrantReportBundle = {
  certificate: GrantUtilizationCertificate;
  complianceReport: GrantComplianceReport;
};
