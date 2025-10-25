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
