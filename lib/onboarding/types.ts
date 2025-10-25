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
