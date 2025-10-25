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
};
