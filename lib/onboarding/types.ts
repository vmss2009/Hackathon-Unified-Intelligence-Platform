export type OnboardingFieldType = "text" | "textarea" | "date" | "select" | "file";

export type OnboardingFieldOption = {
  id: string;
  label: string;
  value: string;
};

export type OnboardingField = {
  id: string;
  label: string;
  type: OnboardingFieldType;
  required: boolean;
  description?: string;
  placeholder?: string;
  multiple?: boolean;
  options?: OnboardingFieldOption[];
};

export type OnboardingSection = {
  id: string;
  title: string;
  description?: string;
  fields: OnboardingField[];
};

export type OnboardingForm = {
  id: string;
  version: number;
  title: string;
  summary: string;
  sections: OnboardingSection[];
  updatedAt: string;
  scoring?: OnboardingScoringConfig;
};

export type OnboardingAttachment = {
  key: string;
  name: string;
  size: number;
  contentType: string;
  url?: string;
};

export type OnboardingFieldResponse = {
  fieldId: string;
  value: string | string[] | null;
  attachments?: OnboardingAttachment[];
};

export type OnboardingSubmission = {
  id: string;
  userId: string;
  formId: string;
  submittedAt: string;
  responses: OnboardingFieldResponse[];
  score?: OnboardingSubmissionScore;
};

export type OnboardingScoreOperator = "equals" | "contains" | "gte" | "lte";

export type OnboardingScoringRule = {
  id: string;
  fieldId: string;
  operator: OnboardingScoreOperator;
  target: string;
  points: number;
  label: string;
  description?: string;
};

export type OnboardingScoringConfig = {
  rules: OnboardingScoringRule[];
  autoRejectBelow?: number;
  autoAdvanceAt?: number;
  totalPoints?: number;
};

export type OnboardingSubmissionScore = {
  total: number;
  awarded: number;
  percentage: number;
  status: "advance" | "review" | "reject";
  thresholdAdvance?: number;
  thresholdReject?: number;
  breakdown: {
    ruleId: string;
    label: string;
    points: number;
    matched: boolean;
    reason?: string;
  }[];
};

export type OnboardingSubmissionResolvedField = {
  fieldId: string;
  label: string;
  type: OnboardingFieldType;
  value: string | string[] | null;
  attachments?: OnboardingAttachment[];
};

export type OnboardingSubmissionSummaryStatus = OnboardingSubmissionScore["status"] | "review";

export type OnboardingSubmissionSummary = {
  id: string;
  formId: string;
  userId: string;
  submittedAt: string;
  score?: OnboardingSubmissionScore;
  status: OnboardingSubmissionSummaryStatus;
  companyName?: string;
  companyStage?: {
    value: string;
    label?: string;
  };
  responses: OnboardingSubmissionResolvedField[];
};

export type OnboardingSubmissionFilters = {
  status?: OnboardingSubmissionScore["status"];
  stage?: string;
  minScore?: number;
  maxScore?: number;
  query?: string;
};

export type OnboardingChecklistStatus = "pending" | "in_progress" | "complete";

export type OnboardingChecklistItem = {
  id: string;
  title: string;
  description?: string;
  status: OnboardingChecklistStatus;
  dueDate?: string;
  updatedAt: string;
  completedAt?: string;
};

export type OnboardingChecklist = {
  startupId: string;
  createdAt: string;
  updatedAt: string;
  notes?: string;
  items: OnboardingChecklistItem[];
};

export type OnboardingDocument = {
  key: string;
  name: string;
  url?: string;
  size: number;
  contentType?: string;
  uploadedAt: string;
  uploadedBy?: string;
};

export type OnboardingMilestoneStatus =
  | "planned"
  | "on_track"
  | "at_risk"
  | "off_track"
  | "completed";

export type OnboardingMilestone = {
  id: string;
  startupId: string;
  title: string;
  description?: string;
  owner?: string;
  category?: string;
  kpiKey?: string;
  unit?: string;
  baselineValue?: number;
  currentValue?: number;
  targetValue?: number;
  dueDate?: string;
  reminderLeadDays?: number;
  reminderCadenceDays?: number;
  escalationAfterDays?: number;
  escalateTo?: string;
  lastReminderAt?: string;
  lastEscalationAt?: string;
  status: OnboardingMilestoneStatus;
  progress: number;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  notes?: string;
};

export type OnboardingMilestoneLog = {
  id: string;
  milestoneId: string;
  timestamp: string;
  author?: string;
  note?: string;
  progress?: number;
  status?: OnboardingMilestoneStatus;
  currentValue?: number;
};

export type OnboardingMilestoneSignals = {
  needsReminder: boolean;
  needsEscalation: boolean;
  dueInDays?: number;
  overdueByDays?: number;
  nextReminderAt?: string;
  escalationTarget?: string;
  isOverdue: boolean;
  summary?: string;
};

export type OnboardingMilestonePlan = {
  startupId: string;
  updatedAt: string;
  milestones: OnboardingMilestone[];
  logs: OnboardingMilestoneLog[];
};

export type OnboardingMilestonePlanSnapshot = {
  startupId: string;
  updatedAt: string;
  milestones: Array<OnboardingMilestone & { signals: OnboardingMilestoneSignals }>;
  logs: OnboardingMilestoneLog[];
};

export type OnboardingMilestoneUpdateInput = {
  id: string;
  status?: OnboardingMilestoneStatus;
  progress?: number;
  currentValue?: number;
  targetValue?: number;
  dueDate?: string;
  owner?: string;
  reminderLeadDays?: number;
  reminderCadenceDays?: number;
  escalationAfterDays?: number;
  escalateTo?: string;
  note?: string;
  markReminderSent?: boolean;
  markEscalated?: boolean;
};

export type OnboardingGraduationStatus =
  | "in_program"
  | "graduated"
  | "deferred"
  | "withdrawn"
  | "alumni";

export type OnboardingAlumniTouchpointChannel =
  | "email"
  | "call"
  | "meeting"
  | "event"
  | "demo"
  | "survey"
  | "other";

export type OnboardingAlumniTouchpointSentiment = "positive" | "neutral" | "negative";

export type OnboardingAlumniMetric = {
  id: string;
  key: string;
  label: string;
  value: number;
  unit?: string;
  recordedAt: string;
  note?: string;
};

export type OnboardingAlumniTouchpoint = {
  id: string;
  recordedAt: string;
  recordedBy?: string;
  channel?: OnboardingAlumniTouchpointChannel;
  highlight?: string;
  sentiment?: OnboardingAlumniTouchpointSentiment;
  notes?: string;
  nextActionAt?: string;
  nextActionOwner?: string;
};

export type OnboardingAlumniRecord = {
  startupId: string;
  status: OnboardingGraduationStatus;
  cohort?: string;
  programStartAt?: string;
  graduationDate?: string;
  alumniSince?: string;
  primaryMentor?: string;
  supportOwner?: string;
  tags?: string[];
  notes?: string;
  impactScore?: number;
  fundingRaised?: number;
  revenueRunRate?: number;
  jobsCreated?: number;
  currency?: string;
  lastContactAt?: string;
  nextCheckInAt?: string;
  createdAt: string;
  updatedAt: string;
  metrics: OnboardingAlumniMetric[];
  touchpoints: OnboardingAlumniTouchpoint[];
};

export type OnboardingAlumniSignals = {
  hasGraduated: boolean;
  monthsSinceGraduation?: number;
  needsCheckIn: boolean;
  checkInDueInDays?: number;
  checkInOverdueByDays?: number;
  lastTouchpointAt?: string;
  touchpointCount: number;
  totalFundingRaised?: number;
  jobsCreated?: number;
  revenueRunRate?: number;
};

export type OnboardingAlumniSnapshot = OnboardingAlumniRecord & {
  signals: OnboardingAlumniSignals;
};

export type OnboardingAlumniMetricInput = {
  id?: string;
  key: string;
  label: string;
  value: number;
  unit?: string;
  recordedAt?: string;
  note?: string;
};

export type OnboardingAlumniTouchpointInput = {
  recordedAt?: string;
  recordedBy?: string;
  channel?: OnboardingAlumniTouchpointChannel;
  highlight?: string;
  sentiment?: OnboardingAlumniTouchpointSentiment;
  notes?: string;
  nextActionAt?: string;
  nextActionOwner?: string;
};

export type OnboardingAlumniUpdateInput = {
  status?: OnboardingGraduationStatus;
  cohort?: string;
  programStartAt?: string;
  graduationDate?: string;
  alumniSince?: string;
  primaryMentor?: string;
  supportOwner?: string;
  tags?: string[];
  notes?: string;
  impactScore?: number | null;
  fundingRaised?: number | null;
  revenueRunRate?: number | null;
  jobsCreated?: number | null;
  currency?: string;
  nextCheckInAt?: string;
  metrics?: OnboardingAlumniMetricInput[];
};

export type OnboardingGrantStatus =
  | "researching"
  | "preparing"
  | "submitted"
  | "awarded"
  | "closed";

export type OnboardingGrantEligibility = {
  id: string;
  label: string;
  met: boolean;
  notes?: string;
};

export type OnboardingGrantEligibilityInput = {
  id?: string;
  label: string;
  met?: boolean;
  notes?: string;
};

export type OnboardingGrantOpportunity = {
  id: string;
  title: string;
  provider?: string;
  description?: string;
  amount?: number;
  currency?: string;
  deadline?: string;
  status: OnboardingGrantStatus;
  link?: string;
  owner?: string;
  notes?: string;
  eligibility: OnboardingGrantEligibility[];
  createdAt: string;
  updatedAt: string;
  lastActivityAt?: string;
};

export type OnboardingGrantOpportunitySignals = {
  hasDeadline: boolean;
  daysUntilDeadline?: number;
  isOverdue: boolean;
  isSubmitted: boolean;
  eligibilityComplete: boolean;
  unmetEligibilityCount: number;
};

export type OnboardingGrantOpportunitySnapshot = OnboardingGrantOpportunity & {
  signals: OnboardingGrantOpportunitySignals;
};

export type OnboardingGrantCatalog = {
  startupId: string;
  createdAt: string;
  updatedAt: string;
  opportunities: OnboardingGrantOpportunity[];
};

export type OnboardingGrantCatalogSignals = {
  total: number;
  dueSoon: number;
  overdue: number;
  awarded: number;
  submitted: number;
};

export type OnboardingGrantCatalogSnapshot = {
  startupId: string;
  createdAt: string;
  updatedAt: string;
  opportunities: OnboardingGrantOpportunitySnapshot[];
  signals: OnboardingGrantCatalogSignals;
};

export type OnboardingGrantOpportunityInput = {
  id?: string;
  title?: string;
  provider?: string;
  description?: string;
  amount?: number | null;
  currency?: string;
  deadline?: string;
  status?: OnboardingGrantStatus;
  link?: string;
  owner?: string;
  notes?: string;
  eligibility?: OnboardingGrantEligibilityInput[];
};
