"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import {
  OnboardingChecklist,
  OnboardingChecklistItem,
  OnboardingChecklistStatus,
  OnboardingDocument,
  OnboardingAlumniSnapshot,
  OnboardingAlumniUpdateInput,
  OnboardingAlumniTouchpointInput,
  OnboardingAlumniMetricInput,
  OnboardingGraduationStatus,
  OnboardingGrantCatalogSnapshot,
  OnboardingGrantEligibilityInput,
  OnboardingGrantOpportunityInput,
  OnboardingGrantStatus,
  OnboardingMilestonePlanSnapshot,
  OnboardingMilestoneStatus,
  OnboardingMilestoneUpdateInput,
  OnboardingSubmissionSummary,
} from "@/lib/onboarding/types";
import type { GrantRecord } from "@/lib/grants/types";

type WorkspacePayload = {
  ok: boolean;
  submission: OnboardingSubmissionSummary;
  checklist: OnboardingChecklist;
  documents: OnboardingDocument[];
  milestones: OnboardingMilestonePlanSnapshot;
  alumni: OnboardingAlumniSnapshot;
  grants: OnboardingGrantCatalogSnapshot;
  error?: string;
};

type ChecklistUpdateResponse = {
  ok: boolean;
  checklist: OnboardingChecklist;
  error?: string;
};

type DocumentUploadResponse = {
  ok: boolean;
  document?: OnboardingDocument;
  error?: string;
};

type GrantCatalogResponse = {
  ok: boolean;
  grants: OnboardingGrantCatalogSnapshot;
  error?: string;
};

type GrantRecordCatalogResponse = {
  ok: boolean;
  grants: GrantRecord[];
  updatedAt?: string;
  error?: string;
};

const STATUS_OPTIONS: { value: OnboardingChecklistStatus; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "in_progress", label: "In progress" },
  { value: "complete", label: "Complete" },
];

const MILESTONE_STATUS_OPTIONS: { value: OnboardingMilestoneStatus; label: string }[] = [
  { value: "planned", label: "Planned" },
  { value: "on_track", label: "On track" },
  { value: "at_risk", label: "At risk" },
  { value: "off_track", label: "Off track" },
  { value: "completed", label: "Completed" },
];

const MILESTONE_BADGE_STYLES: Record<OnboardingMilestoneStatus, string> = {
  planned: "border-slate-700 bg-slate-900/70 text-slate-200",
  on_track: "border-emerald-500/60 bg-emerald-500/10 text-emerald-200",
  at_risk: "border-amber-500/60 bg-amber-500/10 text-amber-200",
  off_track: "border-red-500/60 bg-red-500/10 text-red-200",
  completed: "border-blue-500/60 bg-blue-500/10 text-blue-200",
};

const GRADUATION_STATUS_OPTIONS: { value: OnboardingGraduationStatus; label: string }[] = [
  { value: "in_program", label: "In program" },
  { value: "graduated", label: "Graduated" },
  { value: "alumni", label: "Active alumni" },
  { value: "deferred", label: "Deferred" },
  { value: "withdrawn", label: "Withdrawn" },
];

const TOUCHPOINT_CHANNEL_OPTIONS = [
  { value: "call", label: "Call" },
  { value: "meeting", label: "Meeting" },
  { value: "email", label: "Email" },
  { value: "event", label: "Event" },
  { value: "demo", label: "Demo" },
  { value: "survey", label: "Survey" },
  { value: "other", label: "Other" },
];

const TOUCHPOINT_SENTIMENT_OPTIONS = [
  { value: "positive", label: "Positive" },
  { value: "neutral", label: "Neutral" },
  { value: "negative", label: "Negative" },
];

const TOUCHPOINT_SENTIMENT_BADGE: Record<"positive" | "neutral" | "negative", string> = {
  positive: "text-emerald-300",
  neutral: "text-slate-300",
  negative: "text-red-300",
};

const GRANT_STATUS_OPTIONS: { value: OnboardingGrantStatus; label: string }[] = [
  { value: "researching", label: "Researching" },
  { value: "preparing", label: "Preparing" },
  { value: "submitted", label: "Submitted" },
  { value: "awarded", label: "Awarded" },
  { value: "closed", label: "Closed" },
];

const GRANT_STATUS_BADGE: Record<OnboardingGrantStatus, string> = {
  researching: "border-sky-500/50 bg-sky-500/10 text-sky-200",
  preparing: "border-amber-500/50 bg-amber-500/10 text-amber-200",
  submitted: "border-blue-500/60 bg-blue-500/10 text-blue-200",
  awarded: "border-emerald-500/60 bg-emerald-500/10 text-emerald-200",
  closed: "border-slate-700 bg-slate-900/70 text-slate-300",
};

const getGrantStatusLabel = (status: OnboardingGrantStatus) => {
  const option = GRANT_STATUS_OPTIONS.find((entry) => entry.value === status);
  return option?.label ?? status;
};

const formatDate = (value?: string) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

const formatDateTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatNumber = (value?: number, options?: Intl.NumberFormatOptions) => {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return "—";
  }
  return Number(value).toLocaleString(undefined, options);
};

const formatCurrency = (value?: number, currency?: string) => {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return "—";
  }
  if (currency && currency.length >= 3) {
    try {
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: currency.toUpperCase(),
        maximumFractionDigits: 0,
      }).format(value);
    } catch (error) {
      // Fallback to plain number if currency code is invalid.
    }
  }
  return formatNumber(value);
};

const toDateInputValue = (value?: string): string => {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toISOString().slice(0, 10);
};

const normaliseDateInput = (value: string): string | undefined => {
  if (!value || !value.trim().length) {
    return undefined;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }
  return date.toISOString();
};

const createNewChecklistItem = (title: string, description?: string, dueDate?: string): OnboardingChecklistItem => {
  return {
    id: crypto.randomUUID(),
    title,
    description: description?.trim() || undefined,
    status: "pending",
    dueDate: dueDate?.length ? dueDate : undefined,
    updatedAt: new Date().toISOString(),
  };
};

export default function StartupWorkspacePage() {
  const routeParams = useParams();
  const rawStartupId = routeParams?.startupId as string | string[] | undefined;
  const startupId = Array.isArray(rawStartupId) ? rawStartupId[0] : rawStartupId;

  const queryParams = useSearchParams();
  const userId = queryParams?.get("userId") ?? undefined;

  if (!startupId) {
    return (
      <main className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="text-sm text-red-200">Missing startup reference. Please navigate via the submissions dashboard.</p>
        <Link
          href="/protected/onboarding/submissions"
          className="rounded-full border border-blue-500/70 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-blue-200 transition hover:bg-blue-500/10"
        >
          Back to submissions
        </Link>
      </main>
    );
  }

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submission, setSubmission] = useState<OnboardingSubmissionSummary | null>(null);
  const [checklist, setChecklist] = useState<OnboardingChecklist | null>(null);
  const [documents, setDocuments] = useState<OnboardingDocument[]>([]);
  const [savingChecklist, setSavingChecklist] = useState(false);
  const [uploadingDocument, setUploadingDocument] = useState(false);
  const [newItemTitle, setNewItemTitle] = useState("");
  const [newItemDueDate, setNewItemDueDate] = useState("");
  const [newItemDescription, setNewItemDescription] = useState("");
  const [notesDraft, setNotesDraft] = useState("");
  const [milestones, setMilestones] = useState<OnboardingMilestonePlanSnapshot | null>(null);
  const [milestoneProgressDraft, setMilestoneProgressDraft] = useState<Record<string, number>>({});
  const [milestoneStatusDraft, setMilestoneStatusDraft] = useState<Record<string, OnboardingMilestoneStatus>>({});
  const [milestoneCurrentValueDraft, setMilestoneCurrentValueDraft] = useState<Record<string, string>>({});
  const [milestoneNoteDraft, setMilestoneNoteDraft] = useState<Record<string, string>>({});
  const [savingMilestones, setSavingMilestones] = useState(false);
  const [creatingMilestone, setCreatingMilestone] = useState(false);
  const [deletingMilestoneId, setDeletingMilestoneId] = useState<string | null>(null);
  const [newMilestoneTitle, setNewMilestoneTitle] = useState("");
  const [newMilestoneOwner, setNewMilestoneOwner] = useState("");
  const [newMilestoneCategory, setNewMilestoneCategory] = useState("");
  const [newMilestoneDueDate, setNewMilestoneDueDate] = useState("");
  const [newMilestoneTarget, setNewMilestoneTarget] = useState("");
  const [newMilestoneUnit, setNewMilestoneUnit] = useState("");
  const [newMilestoneReminderLead, setNewMilestoneReminderLead] = useState("2");
  const [newMilestoneReminderCadence, setNewMilestoneReminderCadence] = useState("7");
  const [newMilestoneEscalationAfter, setNewMilestoneEscalationAfter] = useState("3");
  const [newMilestoneEscalateTo, setNewMilestoneEscalateTo] = useState("");
  const [grants, setGrants] = useState<OnboardingGrantCatalogSnapshot | null>(null);
  const [grantForm, setGrantForm] = useState({
    title: "",
    provider: "",
    amount: "",
    currency: "",
    deadline: "",
    link: "",
    status: "researching" as OnboardingGrantStatus,
    owner: "",
    notes: "",
    description: "",
  });
  const [grantEligibilityDraft, setGrantEligibilityDraft] = useState("");
  const [creatingGrant, setCreatingGrant] = useState(false);
  const [refreshingGrants, setRefreshingGrants] = useState(false);
  const [grantDrafts, setGrantDrafts] = useState<
    Record<
      string,
      {
        title: string;
        provider: string;
        amount: string;
        currency: string;
        deadline: string;
        status: OnboardingGrantStatus;
        owner: string;
        link: string;
        notes: string;
        description: string;
      }
    >
  >({});
  const [grantEligibilityNotesDraft, setGrantEligibilityNotesDraft] = useState<Record<string, Record<string, string>>>({});
  const [updatingGrantId, setUpdatingGrantId] = useState<string | null>(null);
  const [updatingEligibilityKey, setUpdatingEligibilityKey] = useState<string | null>(null);
  const [deletingGrantId, setDeletingGrantId] = useState<string | null>(null);
  const [grantCatalogRecords, setGrantCatalogRecords] = useState<GrantRecord[]>([]);
  const [grantCatalogUpdatedAt, setGrantCatalogUpdatedAt] = useState<string | null>(null);
  const [loadingGrantCatalog, setLoadingGrantCatalog] = useState(false);
  const [savingGrantCatalogRecord, setSavingGrantCatalogRecord] = useState(false);
  const [deletingGrantCatalogRecordId, setDeletingGrantCatalogRecordId] = useState<string | null>(null);
  const [grantRecordForm, setGrantRecordForm] = useState({
    id: null as string | null,
    name: "",
    fundingAgency: "",
    program: "",
    sanctionNumber: "",
    sanctionDate: "",
    totalSanctionedAmount: "",
    currency: "INR",
    managingDepartment: "",
    purpose: "",
    startDate: "",
    endDate: "",
  });
  const [alumni, setAlumni] = useState<OnboardingAlumniSnapshot | null>(null);
  const [alumniForm, setAlumniForm] = useState({
    status: "in_program" as OnboardingGraduationStatus,
    cohort: "",
    programStartAt: "",
    graduationDate: "",
    alumniSince: "",
    supportOwner: "",
    primaryMentor: "",
    currency: "",
    fundingRaised: "",
    revenueRunRate: "",
    jobsCreated: "",
    impactScore: "",
    tags: "",
    notes: "",
    nextCheckInAt: "",
  });
  const [savingAlumni, setSavingAlumni] = useState(false);
  const [loggingTouchpoint, setLoggingTouchpoint] = useState(false);
  const [newTouchpoint, setNewTouchpoint] = useState({
    recordedAt: "",
    channel: "call",
    highlight: "",
    notes: "",
    sentiment: "positive" as "positive" | "neutral" | "negative",
    nextActionAt: "",
    nextActionOwner: "",
    fundingRaised: "",
    revenueRunRate: "",
    jobsCreated: "",
  });

  useEffect(() => {
    if (checklist) {
      setNotesDraft(checklist.notes ?? "");
    }
  }, [checklist?.notes]);

  useEffect(() => {
    if (!milestones) {
      return;
    }
    const progressMap: Record<string, number> = {};
    const statusMap: Record<string, OnboardingMilestoneStatus> = {};
    const valueMap: Record<string, string> = {};
    const noteMap: Record<string, string> = {};

    milestones.milestones.forEach((milestone) => {
      progressMap[milestone.id] = milestone.progress;
      statusMap[milestone.id] = milestone.status;
      valueMap[milestone.id] =
        milestone.currentValue !== undefined && milestone.currentValue !== null
          ? String(milestone.currentValue)
          : "";
      noteMap[milestone.id] = "";
    });

    setMilestoneProgressDraft(progressMap);
    setMilestoneStatusDraft(statusMap);
    setMilestoneCurrentValueDraft(valueMap);
    setMilestoneNoteDraft(noteMap);
  }, [milestones]);

  useEffect(() => {
    if (!alumni) {
      return;
    }
    setAlumniForm({
      status: alumni.status,
      cohort: alumni.cohort ?? "",
      programStartAt: alumni.programStartAt ? alumni.programStartAt.substring(0, 10) : "",
      graduationDate: alumni.graduationDate ? alumni.graduationDate.substring(0, 10) : "",
      alumniSince: alumni.alumniSince ? alumni.alumniSince.substring(0, 10) : "",
      supportOwner: alumni.supportOwner ?? "",
      primaryMentor: alumni.primaryMentor ?? "",
      currency: alumni.currency ?? "",
      fundingRaised:
        alumni.fundingRaised !== undefined && alumni.fundingRaised !== null
          ? String(alumni.fundingRaised)
          : "",
      revenueRunRate:
        alumni.revenueRunRate !== undefined && alumni.revenueRunRate !== null
          ? String(alumni.revenueRunRate)
          : "",
      jobsCreated:
        alumni.jobsCreated !== undefined && alumni.jobsCreated !== null
          ? String(alumni.jobsCreated)
          : "",
      impactScore:
        alumni.impactScore !== undefined && alumni.impactScore !== null
          ? String(alumni.impactScore)
          : "",
      tags: (alumni.tags ?? []).join(", "),
      notes: alumni.notes ?? "",
      nextCheckInAt: alumni.nextCheckInAt ? alumni.nextCheckInAt.substring(0, 10) : "",
    });
  }, [alumni]);

  useEffect(() => {
    if (!grants) {
      return;
    }

    const drafts: Record<
      string,
      {
        title: string;
        provider: string;
        amount: string;
        currency: string;
        deadline: string;
        status: OnboardingGrantStatus;
        owner: string;
        link: string;
        notes: string;
        description: string;
      }
    > = {};
    const eligibilityDrafts: Record<string, Record<string, string>> = {};

    grants.opportunities.forEach((opportunity) => {
      drafts[opportunity.id] = {
        title: opportunity.title ?? "",
        provider: opportunity.provider ?? "",
        amount:
          opportunity.amount !== undefined && opportunity.amount !== null
            ? String(opportunity.amount)
            : "",
        currency: opportunity.currency ?? "",
        deadline: opportunity.deadline ? opportunity.deadline.substring(0, 10) : "",
        status: opportunity.status,
        owner: opportunity.owner ?? "",
        link: opportunity.link ?? "",
        notes: opportunity.notes ?? "",
        description: opportunity.description ?? "",
      };

      const noteMap: Record<string, string> = {};
      opportunity.eligibility.forEach((criterion) => {
        noteMap[criterion.id] = criterion.notes ?? "";
      });
      eligibilityDrafts[opportunity.id] = noteMap;
    });

    setGrantDrafts(drafts);
    setGrantEligibilityNotesDraft(eligibilityDrafts);
  }, [grants]);

  useEffect(() => {
    if (!userId) {
      setError("Missing applicant reference – unable to load workspace.");
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    fetch(`/api/protected/onboarding/startups/${startupId}/workspace?userId=${encodeURIComponent(userId)}`,
      {
        method: "GET",
        signal: controller.signal,
      },
    )
      .then(async (res) => {
        if (!res.ok) {
          throw new Error("Failed to load startup workspace");
        }
        return (await res.json()) as WorkspacePayload;
      })
      .then((payload) => {
        if (!payload.ok) {
          throw new Error(payload.error ?? "Unable to load workspace");
        }
        setSubmission(payload.submission);
        setChecklist(payload.checklist);
        setDocuments(payload.documents);
    setMilestones(payload.milestones);
    setGrants(payload.grants);
    setAlumni(payload.alumni);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Unable to load workspace");
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [startupId, userId]);

  const scoreSummary = useMemo(() => {
    if (!submission?.score) {
      return { awarded: 0, total: 0, percentage: 0 };
    }
    const awarded = submission.score.awarded;
    const total = submission.score.total ?? submission.score.breakdown.reduce((sum, item) => sum + item.points, 0);
    const percentage = submission.score.percentage ?? (total > 0 ? Number(((awarded / total) * 100).toFixed(1)) : 0);
    return { awarded, total, percentage };
  }, [submission]);

  const milestoneSummary = useMemo(() => {
    if (!milestones) {
      return { total: 0, dueSoon: 0, overdue: 0, needsReminder: 0, needsEscalation: 0 };
    }
    const stats = {
      total: milestones.milestones.length,
      dueSoon: 0,
      overdue: 0,
      needsReminder: 0,
      needsEscalation: 0,
    };

    milestones.milestones.forEach((milestone) => {
      const { signals } = milestone;
      if (signals.needsReminder) {
        stats.needsReminder += 1;
      }
      if (signals.needsEscalation) {
        stats.needsEscalation += 1;
      }
      if (signals.overdueByDays !== undefined && signals.overdueByDays >= 1) {
        stats.overdue += 1;
      } else if (
        signals.dueInDays !== undefined &&
        signals.dueInDays >= 0 &&
        signals.dueInDays <= 3
      ) {
        stats.dueSoon += 1;
      }
    });

    return stats;
  }, [milestones]);

  const milestoneNameMap = useMemo(() => {
    if (!milestones) {
      return new Map<string, string>();
    }
    return new Map<string, string>(
      milestones.milestones.map((milestone) => [milestone.id, milestone.title]),
    );
  }, [milestones]);

  const grantSummary = useMemo(() => {
    if (!grants) {
      return { total: 0, dueSoon: 0, overdue: 0, submitted: 0, awarded: 0 };
    }
    return {
      total: grants.signals.total,
      dueSoon: grants.signals.dueSoon,
      overdue: grants.signals.overdue,
      submitted: grants.signals.submitted,
      awarded: grants.signals.awarded,
    };
  }, [grants]);

  const alumniSummary = useMemo(() => {
    if (!alumni) {
      return {
        status: "in_program" as OnboardingGraduationStatus,
        monthsSinceGraduation: undefined as number | undefined,
        totalFundingRaised: undefined as number | undefined,
        jobsCreated: undefined as number | undefined,
        revenueRunRate: undefined as number | undefined,
        needsCheckIn: false,
        checkInLabel: "",
      };
    }

    let checkInLabel = "";
    if (alumni.signals.checkInOverdueByDays !== undefined) {
      checkInLabel = `Overdue by ${alumni.signals.checkInOverdueByDays} day${alumni.signals.checkInOverdueByDays === 1 ? "" : "s"}`;
    } else if (alumni.signals.checkInDueInDays !== undefined) {
      checkInLabel = `Due in ${alumni.signals.checkInDueInDays} day${alumni.signals.checkInDueInDays === 1 ? "" : "s"}`;
    } else if (alumni.signals.lastTouchpointAt) {
      checkInLabel = `Last touch ${formatDate(alumni.signals.lastTouchpointAt)}`;
    } else {
      checkInLabel = "No touchpoints yet";
    }

    return {
      status: alumni.status,
      monthsSinceGraduation: alumni.signals.monthsSinceGraduation,
      totalFundingRaised: alumni.signals.totalFundingRaised ?? alumni.fundingRaised,
      jobsCreated: alumni.signals.jobsCreated ?? alumni.jobsCreated,
      revenueRunRate: alumni.signals.revenueRunRate ?? alumni.revenueRunRate,
      needsCheckIn: alumni.signals.needsCheckIn,
      checkInLabel,
    };
  }, [alumni]);

  const parseNumberInput = (value: string): number | undefined => {
    const trimmed = value.trim();
    if (!trimmed.length) {
      return undefined;
    }
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : undefined;
  };

  const parseNumberOrNull = (value: string): number | null => {
    const parsed = parseNumberInput(value);
    return parsed ?? null;
  };

  const handleChecklistChange = async (items: OnboardingChecklistItem[], notes?: string) => {
    if (!checklist) return;
    setSavingChecklist(true);
    setChecklist((prev) => (prev ? { ...prev, items, notes } : prev));

    try {
      const res = await fetch(`/api/protected/onboarding/startups/${startupId}/checklist`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          checklist: {
            ...checklist,
            items,
            notes,
          },
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to save checklist");
      }

      const payload = (await res.json()) as ChecklistUpdateResponse;
      if (!payload.ok) {
        throw new Error(payload.error ?? "Unable to save checklist");
      }
      setChecklist(payload.checklist);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save checklist");
    } finally {
      setSavingChecklist(false);
    }
  };

  const updateItemStatus = (itemId: string, status: OnboardingChecklistStatus) => {
    if (!checklist) return;
    const nextItems = checklist.items.map((item) =>
      item.id === itemId
        ? {
            ...item,
            status,
            updatedAt: new Date().toISOString(),
            completedAt: status === "complete" ? new Date().toISOString() : item.completedAt,
          }
        : item,
    );
    handleChecklistChange(nextItems, checklist.notes);
  };

  const updateItemDueDate = (itemId: string, dueDate?: string) => {
    if (!checklist) return;
    const nextItems = checklist.items.map((item) =>
      item.id === itemId
        ? {
            ...item,
            dueDate: dueDate && dueDate.length ? dueDate : undefined,
            updatedAt: new Date().toISOString(),
          }
        : item,
    );
    handleChecklistChange(nextItems, checklist.notes);
  };

  const removeItem = (itemId: string) => {
    if (!checklist) return;
    const nextItems = checklist.items.filter((item) => item.id !== itemId);
    handleChecklistChange(nextItems, checklist.notes);
  };

  const addChecklistItem = () => {
    if (!checklist || !newItemTitle.trim()) {
      return;
    }
    const newItem = createNewChecklistItem(newItemTitle.trim(), newItemDescription.trim(), newItemDueDate);
    handleChecklistChange([...checklist.items, newItem], checklist.notes);
    setNewItemTitle("");
    setNewItemDescription("");
    setNewItemDueDate("");
  };

  const refreshMilestonesPlan = () => {
    fetch(`/api/protected/onboarding/startups/${startupId}/milestones`)
      .then(async (res) => {
        if (!res.ok) {
          throw new Error("Failed to refresh milestones");
        }
        const payload = (await res.json()) as {
          ok: boolean;
          milestones: OnboardingMilestonePlanSnapshot;
          error?: string;
        };
        if (!payload.ok) {
          throw new Error(payload.error ?? "Unable to refresh milestones");
        }
        setMilestones(payload.milestones);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Unable to refresh milestones");
      });
  };

  const handleMilestoneUpdate = async (updates: OnboardingMilestoneUpdateInput[]) => {
    if (!updates.length) {
      return;
    }
    setSavingMilestones(true);
    try {
      const res = await fetch(`/api/protected/onboarding/startups/${startupId}/milestones`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ updates }),
      });

      if (!res.ok) {
        throw new Error("Failed to update milestones");
      }

      const payload = (await res.json()) as {
        ok: boolean;
        milestones: OnboardingMilestonePlanSnapshot;
        error?: string;
      };

      if (!payload.ok) {
        throw new Error(payload.error ?? "Unable to update milestones");
      }

      setMilestones(payload.milestones);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update milestones");
    } finally {
      setSavingMilestones(false);
    }
  };

  const handleSaveMilestone = (milestoneId: string) => {
    const milestoneRecord = milestones?.milestones.find((item) => item.id === milestoneId);
    const progressValue =
      milestoneProgressDraft[milestoneId] ?? milestoneRecord?.progress ?? 0;
    const statusValue =
      milestoneStatusDraft[milestoneId] ?? milestoneRecord?.status;

    const updates: OnboardingMilestoneUpdateInput = {
      id: milestoneId,
      progress: progressValue,
    };

    if (statusValue) {
      updates.status = statusValue;
    }

    const currentValue = parseNumberInput(
      milestoneCurrentValueDraft[milestoneId] ??
        (milestoneRecord?.currentValue !== undefined ? String(milestoneRecord.currentValue) : ""),
    );
    if (currentValue !== undefined) {
      updates.currentValue = currentValue;
    }

    const note = milestoneNoteDraft[milestoneId]?.trim();
    if (note) {
      updates.note = note;
    }

    handleMilestoneUpdate([updates]);
    if (note) {
      setMilestoneNoteDraft((prev) => ({ ...prev, [milestoneId]: "" }));
    }
  };

  const handleSendMilestoneReminder = (milestoneId: string) => {
    const note = milestoneNoteDraft[milestoneId]?.trim();
    handleMilestoneUpdate([
      {
        id: milestoneId,
        markReminderSent: true,
        note,
      },
    ]);
    if (note) {
      setMilestoneNoteDraft((prev) => ({ ...prev, [milestoneId]: "" }));
    }
  };

  const handleEscalateMilestone = (milestoneId: string) => {
    const note = milestoneNoteDraft[milestoneId]?.trim();
    handleMilestoneUpdate([
      {
        id: milestoneId,
        markEscalated: true,
        note,
      },
    ]);
    if (note) {
      setMilestoneNoteDraft((prev) => ({ ...prev, [milestoneId]: "" }));
    }
  };

  const handleCreateMilestone = async () => {
    if (!newMilestoneTitle.trim()) {
      return;
    }

    setCreatingMilestone(true);
    try {
      const body = {
        milestone: {
          title: newMilestoneTitle.trim(),
          owner: newMilestoneOwner.trim() || undefined,
          category: newMilestoneCategory.trim() || undefined,
          dueDate: newMilestoneDueDate || undefined,
          unit: newMilestoneUnit.trim() || undefined,
          targetValue: parseNumberInput(newMilestoneTarget),
          reminderLeadDays: parseNumberInput(newMilestoneReminderLead) ?? 2,
          reminderCadenceDays: parseNumberInput(newMilestoneReminderCadence) ?? 7,
          escalationAfterDays: parseNumberInput(newMilestoneEscalationAfter) ?? 3,
          escalateTo: newMilestoneEscalateTo.trim() || undefined,
        },
      };

      const res = await fetch(`/api/protected/onboarding/startups/${startupId}/milestones`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        throw new Error("Failed to create milestone");
      }

      const payload = (await res.json()) as {
        ok: boolean;
        milestones: OnboardingMilestonePlanSnapshot;
        error?: string;
      };

      if (!payload.ok) {
        throw new Error(payload.error ?? "Unable to create milestone");
      }

      setMilestones(payload.milestones);
      setNewMilestoneTitle("");
      setNewMilestoneOwner("");
      setNewMilestoneCategory("");
      setNewMilestoneDueDate("");
      setNewMilestoneTarget("");
      setNewMilestoneUnit("");
      setNewMilestoneReminderLead("2");
      setNewMilestoneReminderCadence("7");
      setNewMilestoneEscalationAfter("3");
      setNewMilestoneEscalateTo("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create milestone");
    } finally {
      setCreatingMilestone(false);
    }
  };

  const parseGrantEligibilityInput = (value: string): OnboardingGrantEligibilityInput[] => {
    return value
      .split(/[\n,;]+/)
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0)
      .map((label) => ({ label }));
  };

  const refreshGrants = () => {
    setRefreshingGrants(true);
    fetch(`/api/protected/onboarding/startups/${startupId}/grants`)
      .then(async (res) => {
        if (!res.ok) {
          throw new Error("Failed to refresh grants");
        }
        const payload = (await res.json()) as GrantCatalogResponse;
        if (!payload.ok) {
          throw new Error(payload.error ?? "Unable to refresh grants");
        }
        setGrants(payload.grants);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Unable to refresh grants");
      })
      .finally(() => {
        setRefreshingGrants(false);
      });
  };

  const resetGrantForm = () => {
    setGrantForm({
      title: "",
      provider: "",
      amount: "",
      currency: "",
      deadline: "",
      link: "",
      status: "researching" as OnboardingGrantStatus,
      owner: "",
      notes: "",
      description: "",
    });
    setGrantEligibilityDraft("");
  };

  const handleCreateGrantOpportunity = async () => {
    if (!grantForm.title.trim()) {
      return;
    }

    setCreatingGrant(true);

    const amountValue = parseNumberInput(grantForm.amount);
    const currencyValue = grantForm.currency.trim().toUpperCase();

    const opportunity: OnboardingGrantOpportunityInput = {
      title: grantForm.title.trim(),
      provider: grantForm.provider.trim() || undefined,
      amount: amountValue ?? undefined,
      currency: currencyValue.length ? currencyValue : undefined,
      deadline: grantForm.deadline || undefined,
      status: grantForm.status,
      link: grantForm.link.trim() || undefined,
      owner: grantForm.owner.trim() || undefined,
      notes: grantForm.notes.trim() || undefined,
      description: grantForm.description.trim() || undefined,
      eligibility: parseGrantEligibilityInput(grantEligibilityDraft),
    };

    try {
      const res = await fetch(`/api/protected/onboarding/startups/${startupId}/grants`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ opportunity }),
      });

      if (!res.ok) {
        throw new Error("Failed to create grant opportunity");
      }

      const payload = (await res.json()) as GrantCatalogResponse;
      if (!payload.ok) {
        throw new Error(payload.error ?? "Unable to create grant opportunity");
      }

      setGrants(payload.grants);
      resetGrantForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create grant opportunity");
    } finally {
      setCreatingGrant(false);
    }
  };

  const handleUpdateGrantOpportunity = async (
    opportunityId: string,
    updates: OnboardingGrantOpportunityInput,
    options?: { skipSpinner?: boolean },
  ): Promise<void> => {
    if (!options?.skipSpinner) {
      setUpdatingGrantId(opportunityId);
    }
    try {
      const res = await fetch(`/api/protected/onboarding/startups/${startupId}/grants`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ opportunity: { id: opportunityId, ...updates } }),
      });

      if (!res.ok) {
        throw new Error("Failed to update grant opportunity");
      }

      const payload = (await res.json()) as GrantCatalogResponse;
      if (!payload.ok) {
        throw new Error(payload.error ?? "Unable to update grant opportunity");
      }

      setGrants(payload.grants);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update grant opportunity");
    } finally {
      if (!options?.skipSpinner) {
        setUpdatingGrantId(null);
      }
    }
  };

  const handleGrantDraftChange = (
    opportunityId: string,
    field:
      | "title"
      | "provider"
      | "amount"
      | "currency"
      | "deadline"
      | "status"
      | "owner"
      | "link"
      | "notes"
      | "description",
    value: string | OnboardingGrantStatus,
  ) => {
    setGrantDrafts((prev) => {
      const current = prev[opportunityId] ?? {
        title: "",
        provider: "",
        amount: "",
        currency: "",
        deadline: "",
        status: "researching" as OnboardingGrantStatus,
        owner: "",
        link: "",
        notes: "",
        description: "",
      };
      return {
        ...prev,
        [opportunityId]: {
          ...current,
          [field]: field === "status" ? (value as OnboardingGrantStatus) : (value as string),
        },
      };
    });
  };

  const handleGrantEligibilityNoteChange = (
    opportunityId: string,
    eligibilityId: string,
    value: string,
  ) => {
    setGrantEligibilityNotesDraft((prev) => ({
      ...prev,
      [opportunityId]: {
        ...(prev[opportunityId] ?? {}),
        [eligibilityId]: value,
      },
    }));
  };

  const handleResetGrantDraft = (opportunityId: string) => {
    if (!grants) {
      return;
    }

    const opportunity = grants.opportunities.find((item) => item.id === opportunityId);
    if (!opportunity) {
      return;
    }

    setGrantDrafts((prev) => ({
      ...prev,
      [opportunityId]: {
        title: opportunity.title ?? "",
        provider: opportunity.provider ?? "",
        amount:
          opportunity.amount !== undefined && opportunity.amount !== null
            ? String(opportunity.amount)
            : "",
        currency: opportunity.currency ?? "",
        deadline: opportunity.deadline ? opportunity.deadline.substring(0, 10) : "",
        status: opportunity.status,
        owner: opportunity.owner ?? "",
        link: opportunity.link ?? "",
        notes: opportunity.notes ?? "",
        description: opportunity.description ?? "",
      },
    }));

    const eligibilityNotes: Record<string, string> = {};
    opportunity.eligibility.forEach((criterion) => {
      eligibilityNotes[criterion.id] = criterion.notes ?? "";
    });

    setGrantEligibilityNotesDraft((prev) => ({
      ...prev,
      [opportunityId]: eligibilityNotes,
    }));
  };

  const handleSaveGrantDetails = async (opportunityId: string) => {
    if (!grants) {
      return;
    }
    const draft = grantDrafts[opportunityId];
    const opportunity = grants.opportunities.find((item) => item.id === opportunityId);
    if (!draft || !opportunity) {
      return;
    }

    const amountValue = parseNumberOrNull(draft.amount);
    const currencyValue = draft.currency.trim().toUpperCase();
    const eligibilityNotes = grantEligibilityNotesDraft[opportunityId] ?? {};

    const eligibility: OnboardingGrantEligibilityInput[] = opportunity.eligibility.map((item) => {
      const note = (eligibilityNotes[item.id] ?? item.notes ?? "").trim();
      return {
        id: item.id,
        label: item.label,
        met: item.met,
        notes: note.length ? note : undefined,
      };
    });

    await handleUpdateGrantOpportunity(opportunityId, {
      title: draft.title.trim() || "Untitled opportunity",
      provider: draft.provider.trim() || undefined,
      amount: amountValue,
      currency: currencyValue.length ? currencyValue : undefined,
      deadline: draft.deadline || undefined,
      status: draft.status,
      owner: draft.owner.trim() || undefined,
      link: draft.link.trim() || undefined,
      notes: draft.notes.trim() || undefined,
      description: draft.description.trim() || undefined,
      eligibility,
    });
  };

  const handleToggleGrantEligibility = async (
    opportunityId: string,
    eligibilityId: string,
    met: boolean,
  ) => {
    if (!grants) {
      return;
    }

    const opportunity = grants.opportunities.find((item) => item.id === opportunityId);
    if (!opportunity) {
      return;
    }

    setUpdatingEligibilityKey(`${opportunityId}:${eligibilityId}`);
    const notesDraft = grantEligibilityNotesDraft[opportunityId] ?? {};

    try {
      await handleUpdateGrantOpportunity(
        opportunityId,
        {
          eligibility: opportunity.eligibility.map((item) => {
            const note = (notesDraft[item.id] ?? item.notes ?? "").trim();
            return {
              id: item.id,
              label: item.label,
              met: item.id === eligibilityId ? met : item.met,
              notes: note.length ? note : undefined,
            };
          }),
        },
        { skipSpinner: true },
      );
    } finally {
      setUpdatingEligibilityKey(null);
    }
  };

  const handleDeleteGrantOpportunity = async (opportunityId: string) => {
    setDeletingGrantId(opportunityId);
    try {
      const res = await fetch(`/api/protected/onboarding/startups/${startupId}/grants`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ opportunityId }),
      });

      if (!res.ok) {
        throw new Error("Failed to delete grant opportunity");
      }

      const payload = (await res.json()) as GrantCatalogResponse;
      if (!payload.ok) {
        throw new Error(payload.error ?? "Unable to delete grant opportunity");
      }

      setGrants(payload.grants);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete grant opportunity");
    } finally {
      setDeletingGrantId(null);
    }
  };

  const resetGrantRecordForm = () => {
    setGrantRecordForm({
      id: null,
      name: "",
      fundingAgency: "",
      program: "",
      sanctionNumber: "",
      sanctionDate: "",
      totalSanctionedAmount: "",
      currency: "INR",
      managingDepartment: "",
      purpose: "",
      startDate: "",
      endDate: "",
    });
  };

  const handleEditGrantRecord = (record: GrantRecord) => {
    setGrantRecordForm({
      id: record.id,
      name: record.name ?? "",
      fundingAgency: record.fundingAgency ?? "",
      program: record.program ?? "",
      sanctionNumber: record.sanctionNumber ?? "",
      sanctionDate: toDateInputValue(record.sanctionDate),
      totalSanctionedAmount: Number.isFinite(record.totalSanctionedAmount)
        ? String(record.totalSanctionedAmount)
        : "",
      currency: record.currency ?? "INR",
      managingDepartment: record.managingDepartment ?? "",
      purpose: record.purpose ?? "",
      startDate: toDateInputValue(record.startDate),
      endDate: toDateInputValue(record.endDate),
    });
  };

  const refreshGrantCatalog = useCallback(
    async (options: { signal?: AbortSignal; suppressErrorReset?: boolean } = {}) => {
      if (!startupId) {
        return;
      }

      const { signal, suppressErrorReset } = options;
      if (!signal?.aborted) {
        setLoadingGrantCatalog(true);
        if (!suppressErrorReset) {
          setError(null);
        }
      }

      try {
        const res = await fetch(`/api/protected/grants/${startupId}/catalog`, {
          signal,
        });

        const payload = (await res.json()) as GrantRecordCatalogResponse;
        if (!res.ok || !payload.ok) {
          throw new Error(payload.error ?? "Unable to load grant catalog");
        }

        setGrantCatalogRecords(payload.grants);
        setGrantCatalogUpdatedAt(payload.updatedAt ?? null);
      } catch (err) {
        if (signal?.aborted) {
          return;
        }
        setError(err instanceof Error ? err.message : "Unable to load grant catalog");
      } finally {
        if (!signal?.aborted) {
          setLoadingGrantCatalog(false);
        }
      }
    },
    [startupId],
  );

  const handleSubmitGrantRecord = async () => {
    if (!startupId) {
      return;
    }

    const name = grantRecordForm.name.trim();
    if (!name.length) {
      setError("Grant name is required");
      return;
    }

    const amountValue = Number(grantRecordForm.totalSanctionedAmount.replace(/,/g, ""));
    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      setError("Enter a sanctioned amount greater than zero");
      return;
    }

    const payload = {
      ...(grantRecordForm.id ? { id: grantRecordForm.id } : {}),
      name,
      fundingAgency: grantRecordForm.fundingAgency.trim() || undefined,
      program: grantRecordForm.program.trim() || undefined,
      sanctionNumber: grantRecordForm.sanctionNumber.trim() || undefined,
      sanctionDate: normaliseDateInput(grantRecordForm.sanctionDate),
      totalSanctionedAmount: amountValue,
      currency: grantRecordForm.currency.trim().length
        ? grantRecordForm.currency.trim().toUpperCase()
        : "INR",
      managingDepartment: grantRecordForm.managingDepartment.trim() || undefined,
      purpose: grantRecordForm.purpose.trim() || undefined,
      startDate: normaliseDateInput(grantRecordForm.startDate),
      endDate: normaliseDateInput(grantRecordForm.endDate),
    };

    setSavingGrantCatalogRecord(true);
    setError(null);

    try {
      const res = await fetch(`/api/protected/grants/${startupId}/catalog`, {
        method: grantRecordForm.id ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ grant: payload }),
      });

      const response = (await res.json()) as GrantRecordCatalogResponse;
      if (!res.ok || !response.ok) {
        throw new Error(response.error ?? "Unable to save grant record");
      }

      setGrantCatalogRecords(response.grants);
      setGrantCatalogUpdatedAt(response.updatedAt ?? null);
      resetGrantRecordForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save grant record");
    } finally {
      setSavingGrantCatalogRecord(false);
    }
  };

  const handleDeleteGrantRecord = async (grantId: string) => {
    if (!startupId) {
      return;
    }

    const confirmed = window.confirm(
      "Remove this awarded grant? This will also hide it from the financial dashboard.",
    );
    if (!confirmed) {
      return;
    }

    setDeletingGrantCatalogRecordId(grantId);
    setError(null);

    try {
      const res = await fetch(`/api/protected/grants/${startupId}/catalog`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ grantId }),
      });

      const payload = (await res.json()) as GrantRecordCatalogResponse;
      if (!res.ok || !payload.ok) {
        throw new Error(payload.error ?? "Unable to delete grant record");
      }

      setGrantCatalogRecords(payload.grants);
      setGrantCatalogUpdatedAt(payload.updatedAt ?? null);
      if (grantRecordForm.id === grantId) {
        resetGrantRecordForm();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete grant record");
    } finally {
      setDeletingGrantCatalogRecordId(null);
    }
  };

  useEffect(() => {
    if (!startupId) {
      return;
    }

    const controller = new AbortController();
    refreshGrantCatalog({ signal: controller.signal, suppressErrorReset: true });
    return () => controller.abort();
  }, [refreshGrantCatalog, startupId]);

  const refreshAlumniRecord = () => {
    fetch(`/api/protected/onboarding/startups/${startupId}/alumni`)
      .then(async (res) => {
        if (!res.ok) {
          throw new Error("Failed to refresh alumni profile");
        }
        const payload = (await res.json()) as {
          ok: boolean;
          alumni: OnboardingAlumniSnapshot;
          error?: string;
        };
        if (!payload.ok) {
          throw new Error(payload.error ?? "Unable to refresh alumni profile");
        }
        setAlumni(payload.alumni);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Unable to refresh alumni profile");
      });
  };

  const handleSaveAlumni = async () => {
    setSavingAlumni(true);
    const tags = alumniForm.tags
      .split(",")
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);

    const update: OnboardingAlumniUpdateInput = {
      status: alumniForm.status,
      cohort: alumniForm.cohort,
      programStartAt: alumniForm.programStartAt,
      graduationDate: alumniForm.graduationDate,
      alumniSince: alumniForm.alumniSince,
      supportOwner: alumniForm.supportOwner,
      primaryMentor: alumniForm.primaryMentor,
      currency: alumniForm.currency,
      notes: alumniForm.notes,
      nextCheckInAt: alumniForm.nextCheckInAt,
      tags,
      fundingRaised: parseNumberOrNull(alumniForm.fundingRaised),
      revenueRunRate: parseNumberOrNull(alumniForm.revenueRunRate),
      jobsCreated: parseNumberOrNull(alumniForm.jobsCreated),
      impactScore: parseNumberOrNull(alumniForm.impactScore),
    };

    try {
      const res = await fetch(`/api/protected/onboarding/startups/${startupId}/alumni`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ update }),
      });

      if (!res.ok) {
        throw new Error("Failed to save alumni profile");
      }

      const payload = (await res.json()) as {
        ok: boolean;
        alumni: OnboardingAlumniSnapshot;
        error?: string;
      };

      if (!payload.ok) {
        throw new Error(payload.error ?? "Unable to save alumni profile");
      }

      setAlumni(payload.alumni);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save alumni profile");
    } finally {
      setSavingAlumni(false);
    }
  };

  const resetTouchpointDraft = () => {
    setNewTouchpoint((prev) => ({
      ...prev,
      recordedAt: "",
      highlight: "",
      notes: "",
      nextActionAt: "",
      nextActionOwner: "",
      fundingRaised: "",
      revenueRunRate: "",
      jobsCreated: "",
    }));
  };

  const handleLogTouchpoint = async () => {
    setLoggingTouchpoint(true);

    const touchpoint: OnboardingAlumniTouchpointInput = {
      recordedAt: newTouchpoint.recordedAt || undefined,
      channel: newTouchpoint.channel as OnboardingAlumniTouchpointInput["channel"],
      highlight: newTouchpoint.highlight || undefined,
      notes: newTouchpoint.notes || undefined,
      sentiment: newTouchpoint.sentiment,
      nextActionAt: newTouchpoint.nextActionAt || undefined,
      nextActionOwner: newTouchpoint.nextActionOwner || undefined,
    };

    const metrics: OnboardingAlumniMetricInput[] = [];
    const fundingMetric = parseNumberInput(newTouchpoint.fundingRaised);
    if (fundingMetric !== undefined) {
      metrics.push({
        key: "funding_raised",
        label: "Funding raised",
        value: fundingMetric,
        unit: alumniForm.currency || undefined,
      });
    }

    const revenueMetric = parseNumberInput(newTouchpoint.revenueRunRate);
    if (revenueMetric !== undefined) {
      metrics.push({
        key: "revenue_run_rate",
        label: "Revenue run rate",
        value: revenueMetric,
        unit: alumniForm.currency || undefined,
      });
    }

    const jobsMetric = parseNumberInput(newTouchpoint.jobsCreated);
    if (jobsMetric !== undefined) {
      metrics.push({
        key: "jobs_created",
        label: "Jobs created",
        value: jobsMetric,
      });
    }

    try {
      const res = await fetch(`/api/protected/onboarding/startups/${startupId}/alumni`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ touchpoint, metrics: metrics.length ? metrics : undefined }),
      });

      if (!res.ok) {
        throw new Error("Failed to log touchpoint");
      }

      const payload = (await res.json()) as {
        ok: boolean;
        alumni: OnboardingAlumniSnapshot;
        error?: string;
      };

      if (!payload.ok) {
        throw new Error(payload.error ?? "Unable to log touchpoint");
      }

      setAlumni(payload.alumni);
      resetTouchpointDraft();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to log touchpoint");
    } finally {
      setLoggingTouchpoint(false);
    }
  };

  const handleDeleteMilestone = async (milestoneId: string, milestoneTitle: string) => {
    if (!startupId) return;
    const confirmed = window.confirm(
      `Delete milestone "${milestoneTitle}"? This action cannot be undone.`,
    );
    if (!confirmed) {
      return;
    }

    setDeletingMilestoneId(milestoneId);
    try {
      const res = await fetch(`/api/protected/onboarding/startups/${startupId}/milestones`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ milestoneId }),
      });

      const payload = (await res.json()) as {
        ok: boolean;
        milestones?: OnboardingMilestonePlanSnapshot;
        error?: string;
      };

      if (!res.ok || !payload.ok || !payload.milestones) {
        throw new Error(payload?.error ?? "Unable to delete milestone");
      }

      setMilestones(payload.milestones);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete milestone");
    } finally {
      setDeletingMilestoneId(null);
    }
  };

  const refreshDocuments = () => {
    fetch(`/api/protected/onboarding/startups/${startupId}/documents`)
      .then(async (res) => {
        if (!res.ok) {
          throw new Error("Failed to refresh documents");
        }
        const payload = (await res.json()) as { ok: boolean; documents: OnboardingDocument[]; error?: string };
        if (!payload.ok) {
          throw new Error(payload.error ?? "Unable to refresh documents");
        }
        setDocuments(payload.documents);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Unable to refresh documents");
      });
  };

  const handleDocumentUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploadingDocument(true);

    try {
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append("file", file);
        if (submission?.companyName) {
          formData.append("uploadedBy", submission.companyName);
        }

        const res = await fetch(`/api/protected/onboarding/startups/${startupId}/documents`, {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          throw new Error(`Failed to upload ${file.name}`);
        }

        const payload = (await res.json()) as DocumentUploadResponse;
        if (!payload.ok || !payload.document) {
          throw new Error(payload.error ?? `Unable to upload ${file.name}`);
        }

        setDocuments((prev) => [payload.document!, ...prev]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to upload documents");
    } finally {
      setUploadingDocument(false);
    }
  };

  if (!userId) {
    return (
      <main className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="text-sm text-red-200">Missing applicant reference. Please navigate via the submissions dashboard.</p>
        <Link
          href="/protected/onboarding/submissions"
          className="rounded-full border border-blue-500/70 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-blue-200 transition hover:bg-blue-500/10"
        >
          Back to submissions
        </Link>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center p-8 text-sm text-blue-200/80">
        Loading startup workspace…
      </main>
    );
  }

  if (error) {
    return (
      <main className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="text-sm text-red-200">{error}</p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-full border border-blue-500/70 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-blue-200 transition hover:bg-blue-500/10"
          >
            Retry
          </button>
          <Link
            href="/protected/onboarding/submissions"
            className="rounded-full border border-slate-700 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-200 transition hover:bg-slate-900/70"
          >
            Back to submissions
          </Link>
        </div>
      </main>
    );
  }

  if (!submission || !checklist || !milestones || !grants || !alumni) {
    return null;
  }

  const currencyCode = alumni.currency ?? (alumniForm.currency.trim().length ? alumniForm.currency.trim() : undefined);

  return (
    <main className="space-y-8 p-8">
      <header className="flex flex-col gap-4 rounded-2xl border border-slate-800/80 bg-slate-950/60 p-6 shadow-xl shadow-blue-900/20">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-blue-400/80">
              Startup workspace
            </p>
            <h1 className="text-3xl font-bold text-slate-100">
              {submission.companyName ?? "Unnamed submission"}
            </h1>
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
              {submission.companyStage && (
                <span className="rounded-full border border-slate-800 px-3 py-1">
                  {submission.companyStage.label ?? submission.companyStage.value}
                </span>
              )}
              <span className="rounded-full border border-slate-800 px-3 py-1">
                Submitted {formatDateTime(submission.submittedAt)}
              </span>
              <span className="rounded-full border border-slate-800 px-3 py-1">
                Applicant {submission.userId}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/protected/onboarding/submissions"
              className="rounded-full border border-slate-700 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-300 transition hover:bg-slate-900/70"
            >
              Back to submissions
            </Link>
            <Link
              href="/protected/onboarding"
              className="rounded-full border border-blue-500/70 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-blue-200 transition hover:bg-blue-500/10"
            >
              Configure form
            </Link>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 shadow-inner shadow-blue-900/10">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Score</p>
            <p className="mt-2 text-2xl font-semibold text-slate-100">
              {scoreSummary.awarded}
              {scoreSummary.total ? ` / ${scoreSummary.total}` : ""}
            </p>
            <p className="text-sm text-slate-400">{scoreSummary.percentage}% overall</p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 shadow-inner shadow-blue-900/10">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Status</p>
            <p className="mt-2 text-2xl font-semibold text-slate-100">
              {submission.score?.status ? submission.score.status.toUpperCase() : "REVIEW"}
            </p>
            {submission.score?.status === "advance" && (
              <p className="text-sm text-emerald-300">Ready to advance</p>
            )}
            {submission.score?.status === "reject" && (
              <p className="text-sm text-red-300">Below rejection threshold</p>
            )}
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 shadow-inner shadow-blue-900/10">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Checklist progress</p>
            <p className="mt-2 text-2xl font-semibold text-slate-100">
              {checklist.items.filter((item) => item.status === "complete").length} / {checklist.items.length}
            </p>
            <p className="text-sm text-slate-400">Tasks completed</p>
          </div>
        </div>
      </header>

      <section className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 rounded-2xl border border-slate-800/70 bg-slate-950/60 p-6 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-100">Digital onboarding checklist</h2>
            <span className="text-xs text-slate-500">
              Last updated {formatDate(checklist.updatedAt)}
            </span>
          </div>

          <div className="space-y-3">
            {checklist.items.map((item) => (
              <div
                key={item.id}
                className="space-y-3 rounded-xl border border-slate-800/80 bg-slate-950/50 p-4"
              >
                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-slate-100">{item.title}</p>
                    {item.description && (
                      <p className="text-xs text-slate-400">{item.description}</p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
                    <label className="flex items-center gap-2">
                      <span>Due</span>
                      <input
                        type="date"
                        value={item.dueDate?.substring(0, 10) ?? ""}
                        onChange={(event) => updateItemDueDate(item.id, event.target.value)}
                        className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-100 focus:border-blue-500 focus:outline-none"
                      />
                    </label>
                    <label className="flex items-center gap-2">
                      <span>Status</span>
                      <select
                        value={item.status}
                        onChange={(event) =>
                          updateItemStatus(item.id, event.target.value as OnboardingChecklistStatus)
                        }
                        className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-100 focus:border-blue-500 focus:outline-none"
                      >
                        {STATUS_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      onClick={() => removeItem(item.id)}
                      className="text-xs text-red-300 hover:text-red-200"
                    >
                      Remove
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
                  <span>Updated {formatDateTime(item.updatedAt)}</span>
                  {item.completedAt && item.status === "complete" && (
                    <span className="text-emerald-300">Completed {formatDateTime(item.completedAt)}</span>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-3 rounded-xl border border-dashed border-slate-800/60 bg-slate-950/40 p-4">
            <h3 className="text-sm font-semibold text-slate-100">Add new task</h3>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Task title
                <input
                  value={newItemTitle}
                  onChange={(event) => setNewItemTitle(event.target.value)}
                  placeholder="e.g. Sign participation agreement"
                  className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
                />
              </label>
              <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Due date (optional)
                <input
                  type="date"
                  value={newItemDueDate}
                  onChange={(event) => setNewItemDueDate(event.target.value)}
                  className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none"
                />
              </label>
            </div>
            <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Description (optional)
              <textarea
                value={newItemDescription}
                onChange={(event) => setNewItemDescription(event.target.value)}
                rows={3}
                className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
              />
            </label>
            <button
              type="button"
              onClick={addChecklistItem}
              disabled={!newItemTitle.trim() || savingChecklist}
              className="rounded-full border border-emerald-500/70 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-emerald-200 transition hover:bg-emerald-500/10 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {savingChecklist ? "Saving…" : "Add task"}
            </button>
          </div>

          <div className="space-y-2">
            <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Internal notes
              <textarea
                value={notesDraft}
                onChange={(event) => setNotesDraft(event.target.value)}
                rows={4}
                placeholder="Capture call notes, blockers, or follow-ups."
                className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
              />
            </label>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => handleChecklistChange(checklist.items, notesDraft)}
                disabled={savingChecklist}
                className="rounded-full border border-blue-500/70 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-blue-200 transition hover:bg-blue-500/10 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {savingChecklist ? "Saving…" : "Save notes"}
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-4 rounded-2xl border border-slate-800/70 bg-slate-950/60 p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-100">Document repository</h2>
            <button
              type="button"
              onClick={refreshDocuments}
              className="text-xs font-semibold uppercase tracking-wide text-blue-200 transition hover:text-blue-100"
            >
              Refresh
            </button>
          </div>

          <label className="flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-blue-500/60 bg-slate-950/40 px-6 py-6 text-center text-sm text-blue-200 transition hover:border-blue-400 hover:bg-blue-500/10">
            <span className="font-medium">Upload supporting documents</span>
            <span className="text-xs text-blue-200/70">PDF, DOCX, XLSX, ZIP (max 25 MB each)</span>
            <input
              type="file"
              multiple
              onChange={(event) => {
                handleDocumentUpload(event.target.files);
                event.target.value = "";
              }}
              className="hidden"
            />
          </label>
          {uploadingDocument && (
            <p className="text-xs text-blue-200/80">Uploading documents…</p>
          )}

          <div className="space-y-3">
            {documents.length === 0 ? (
              <p className="text-sm text-slate-400">No documents uploaded yet.</p>
            ) : (
              <ul className="space-y-3">
                {documents.map((document) => {
                  const sizeKb = Math.max(1, Math.round(document.size / 1024));
                  return (
                    <li
                      key={document.key}
                      className="flex flex-col gap-2 rounded-xl border border-slate-800/80 bg-slate-950/40 p-4 text-sm text-slate-200"
                    >
                      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                        <div>
                          {document.url ? (
                            <a
                              href={document.url}
                              target="_blank"
                              rel="noreferrer"
                              className="font-semibold text-blue-200 underline decoration-dotted underline-offset-4 hover:text-blue-100"
                            >
                              {document.name}
                            </a>
                          ) : (
                            <span className="font-semibold text-slate-100">{document.name}</span>
                          )}
                          <p className="text-xs text-slate-500">
                            {sizeKb} KB · Uploaded {formatDateTime(document.uploadedAt)}
                            {document.uploadedBy && ` · by ${document.uploadedBy}`}
                          </p>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </section>

      <section className="space-y-6 rounded-2xl border border-slate-800/70 bg-slate-950/60 p-6">
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-slate-100">Milestones & KPI tracking</h2>
            <p className="text-sm text-slate-400">
              Monitor milestone delivery, capture KPI progress, and trigger automated reminders with
              escalation when commitments slip.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={refreshMilestonesPlan}
              className="rounded-full border border-slate-700 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-300 transition hover:bg-slate-900/70"
            >
              Refresh
            </button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total milestones</p>
            <p className="mt-2 text-2xl font-semibold text-slate-100">{milestoneSummary.total}</p>
          </div>
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-300">Due soon (≤3d)</p>
            <p className="mt-2 text-2xl font-semibold text-amber-100">{milestoneSummary.dueSoon}</p>
          </div>
          <div className="rounded-xl border border-red-500/40 bg-red-500/5 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-red-300">Overdue</p>
            <p className="mt-2 text-2xl font-semibold text-red-100">{milestoneSummary.overdue}</p>
          </div>
          <div className="rounded-xl border border-blue-500/40 bg-blue-500/5 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-200">Needs reminder</p>
            <p className="mt-2 text-2xl font-semibold text-blue-100">{milestoneSummary.needsReminder}</p>
          </div>
          <div className="rounded-xl border border-purple-500/40 bg-purple-500/5 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-purple-200">Needs escalation</p>
            <p className="mt-2 text-2xl font-semibold text-purple-100">{milestoneSummary.needsEscalation}</p>
          </div>
        </div>

        <div className="space-y-4">
          {milestones.milestones.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-800/60 bg-slate-950/40 p-6 text-sm text-slate-300">
              No milestones defined yet. Use the form below to schedule key deliverables and KPI checkpoints for this startup.
            </div>
          ) : (
            milestones.milestones.map((milestone) => {
              const statusDraft = (milestoneStatusDraft[milestone.id] ?? milestone.status) as OnboardingMilestoneStatus;
              const progressDraft = Math.max(
                0,
                Math.min(100, milestoneProgressDraft[milestone.id] ?? milestone.progress),
              );
              const currentValueDraft = milestoneCurrentValueDraft[milestone.id] ?? "";
              const noteDraft = milestoneNoteDraft[milestone.id] ?? "";
              const { signals } = milestone;
              const effectiveStatus = statusDraft;
              const statusBadgeClass =
                MILESTONE_BADGE_STYLES[effectiveStatus] ?? MILESTONE_BADGE_STYLES.planned;
              const dueLabel = milestone.dueDate ? formatDate(milestone.dueDate) : "No due date";
              const nextReminderLabel = signals.nextReminderAt ? formatDateTime(signals.nextReminderAt) : "—";
              const needsReminder = signals.needsReminder && effectiveStatus !== "completed";
              const needsEscalation = signals.needsEscalation && effectiveStatus !== "completed";

              return (
                <article
                  key={milestone.id}
                  className="space-y-4 rounded-2xl border border-slate-800/80 bg-slate-950/60 p-5 shadow-inner shadow-blue-900/10"
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-3">
                        <h3 className="text-xl font-semibold text-slate-100">{milestone.title}</h3>
                        <span
                          className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-wide ${statusBadgeClass}`}
                        >
                          {MILESTONE_STATUS_OPTIONS.find((option) => option.value === statusDraft)?.label ?? statusDraft}
                        </span>
                      </div>
                      {milestone.description && (
                        <p className="text-sm text-slate-300">{milestone.description}</p>
                      )}
                      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
                        {milestone.owner && (
                          <span className="rounded-full border border-slate-800 px-3 py-1">
                            Owner {milestone.owner}
                          </span>
                        )}
                        <span className="rounded-full border border-slate-800 px-3 py-1">{dueLabel}</span>
                        {milestone.targetValue !== undefined && (
                          <span className="rounded-full border border-slate-800 px-3 py-1">
                            Target {milestone.targetValue}
                            {milestone.unit ? ` ${milestone.unit}` : ""}
                          </span>
                        )}
                        {milestone.escalateTo && (
                          <span className="rounded-full border border-slate-800 px-3 py-1 text-purple-200">
                            Escalates to {milestone.escalateTo}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
                      <label className="flex items-center gap-2">
                        <span>Status</span>
                        <select
                          value={statusDraft}
                          onChange={(event) =>
                            setMilestoneStatusDraft((prev) => ({
                              ...prev,
                              [milestone.id]: event.target.value as OnboardingMilestoneStatus,
                            }))
                          }
                          className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-100 focus:border-blue-500 focus:outline-none"
                        >
                          {MILESTONE_STATUS_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        type="button"
                        onClick={() => handleSaveMilestone(milestone.id)}
                        disabled={savingMilestones}
                        className="rounded-full border border-blue-500/70 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-blue-200 transition hover:bg-blue-500/10 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {savingMilestones ? "Saving…" : "Save update"}
                      </button>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-3">
                    <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Progress (%)
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={progressDraft}
                        onChange={(event) =>
                          setMilestoneProgressDraft((prev) => ({
                            ...prev,
                            [milestone.id]: (() => {
                              const parsed = Number(event.target.value);
                              if (Number.isNaN(parsed)) {
                                return 0;
                              }
                              return Math.max(0, Math.min(100, parsed));
                            })(),
                          }))
                        }
                        className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none"
                      />
                      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-purple-500 via-blue-500 to-emerald-500"
                          style={{ width: `${progressDraft}%` }}
                        />
                      </div>
                    </label>

                    <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Current value{milestone.unit ? ` (${milestone.unit})` : ""}
                      <input
                        value={currentValueDraft}
                        onChange={(event) =>
                          setMilestoneCurrentValueDraft((prev) => ({
                            ...prev,
                            [milestone.id]: event.target.value,
                          }))
                        }
                        placeholder="e.g. 15000"
                        className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
                      />
                    </label>

                    <div className="space-y-2 rounded-lg border border-slate-800/80 bg-slate-950/40 p-3 text-xs text-slate-300">
                      <p className="font-semibold text-slate-200">Automation signals</p>
                      <p>
                        Reminder:
                        {needsReminder ? (
                          <span className="ml-2 text-blue-200">Send now (next window {nextReminderLabel})</span>
                        ) : (
                          <span className="ml-2 text-slate-400">Next {nextReminderLabel}</span>
                        )}
                      </p>
                      <p>
                        Escalation:
                        {needsEscalation ? (
                          <span className="ml-2 text-purple-200">Ready to escalate</span>
                        ) : (
                          <span className="ml-2 text-slate-400">{milestone.escalateTo ? "Not yet" : "No target"}</span>
                        )}
                      </p>
                      {signals.summary && <p className="text-slate-400">{signals.summary}</p>}
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <label className="flex w-full flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400 md:max-w-xl">
                      Internal note
                      <textarea
                        value={noteDraft}
                        onChange={(event) =>
                          setMilestoneNoteDraft((prev) => ({
                            ...prev,
                            [milestone.id]: event.target.value,
                          }))
                        }
                        rows={3}
                        placeholder="Log blocker, context, or reminder copy"
                        className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
                      />
                    </label>
                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={() => handleSendMilestoneReminder(milestone.id)}
                        disabled={savingMilestones || !needsReminder}
                        className="rounded-full border border-blue-400/70 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-blue-100 transition hover:bg-blue-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Send reminder
                      </button>
                      {milestone.escalateTo && (
                        <button
                          type="button"
                          onClick={() => handleEscalateMilestone(milestone.id)}
                          disabled={savingMilestones || !needsEscalation}
                          className="rounded-full border border-purple-400/70 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-purple-100 transition hover:bg-purple-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Escalate
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleDeleteMilestone(milestone.id, milestone.title)}
                        disabled={deletingMilestoneId === milestone.id}
                        className="rounded-full border border-red-500/70 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-red-200 transition hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {deletingMilestoneId === milestone.id ? "Deleting…" : "Delete"}
                      </button>
                    </div>
                  </div>
                </article>
              );
            })
          )}
        </div>

        <div className="space-y-3 rounded-xl border border-dashed border-slate-800/60 bg-slate-950/40 p-5">
          <h3 className="text-sm font-semibold text-slate-100">Add milestone</h3>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Title
              <input
                value={newMilestoneTitle}
                onChange={(event) => setNewMilestoneTitle(event.target.value)}
                placeholder="e.g. Close pilot customer cohort"
                className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Owner (optional)
              <input
                value={newMilestoneOwner}
                onChange={(event) => setNewMilestoneOwner(event.target.value)}
                placeholder="e.g. CEO, Program Ops"
                className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Category (optional)
              <input
                value={newMilestoneCategory}
                onChange={(event) => setNewMilestoneCategory(event.target.value)}
                placeholder="e.g. KPI, Product, Fundraising"
                className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Due date (optional)
              <input
                type="date"
                value={newMilestoneDueDate}
                onChange={(event) => setNewMilestoneDueDate(event.target.value)}
                className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none"
              />
            </label>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Target value (optional)
              <input
                value={newMilestoneTarget}
                onChange={(event) => setNewMilestoneTarget(event.target.value)}
                placeholder="e.g. 20000"
                className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Unit (optional)
              <input
                value={newMilestoneUnit}
                onChange={(event) => setNewMilestoneUnit(event.target.value)}
                placeholder="e.g. USD, MAU"
                className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Reminder lead (days)
              <input
                type="number"
                min={0}
                value={newMilestoneReminderLead}
                onChange={(event) => setNewMilestoneReminderLead(event.target.value)}
                className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Reminder cadence (days)
              <input
                type="number"
                min={1}
                value={newMilestoneReminderCadence}
                onChange={(event) => setNewMilestoneReminderCadence(event.target.value)}
                className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Escalate after (days overdue)
              <input
                type="number"
                min={1}
                value={newMilestoneEscalationAfter}
                onChange={(event) => setNewMilestoneEscalationAfter(event.target.value)}
                className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400 md:col-span-2">
              Escalate to (email/Slack)
              <input
                value={newMilestoneEscalateTo}
                onChange={(event) => setNewMilestoneEscalateTo(event.target.value)}
                placeholder="ops@incubator.local or #ops-escalations"
                className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
              />
            </label>
          </div>

          <button
            type="button"
            onClick={handleCreateMilestone}
            disabled={creatingMilestone || !newMilestoneTitle.trim()}
            className="rounded-full border border-emerald-500/70 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-emerald-200 transition hover:bg-emerald-500/10 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {creatingMilestone ? "Creating…" : "Add milestone"}
          </button>
        </div>

        {milestones.logs.length > 0 && (
          <div className="space-y-3 rounded-xl border border-slate-800/80 bg-slate-950/40 p-5">
            <h3 className="text-sm font-semibold text-slate-100">Recent activity</h3>
            <ul className="space-y-2 text-xs text-slate-300">
              {milestones.logs.slice(0, 6).map((log) => (
                <li key={log.id} className="flex flex-wrap items-center gap-2">
                  <span className="text-slate-500">{formatDateTime(log.timestamp)}</span>
                  <span className="text-slate-600">•</span>
                  <span className="font-semibold text-slate-200">
                    {milestoneNameMap.get(log.milestoneId) ?? "Milestone"}
                  </span>
                  {log.progress !== undefined && (
                    <span className="text-slate-400">progress → {log.progress}%</span>
                  )}
                  {log.status && (
                    <span className="text-slate-400">
                      status →
                      {" "}
                      {MILESTONE_STATUS_OPTIONS.find((option) => option.value === log.status)?.label ?? log.status}
                    </span>
                  )}
                  {log.currentValue !== undefined && (
                    <span className="text-slate-400">value → {log.currentValue}</span>
                  )}
                  {log.note && <span className="text-slate-300">“{log.note}”</span>}
                  {log.author && <span className="text-slate-500">({log.author})</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="space-y-6 rounded-2xl border border-slate-800/70 bg-slate-950/60 p-6">
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-slate-100">Grants &amp; funding opportunities</h2>
            <p className="text-sm text-slate-400">
              Monitor aligned grants, track eligibility, and stay ahead of deadlines for non-dilutive funding.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={refreshGrants}
              disabled={refreshingGrants}
              className="rounded-full border border-slate-700 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-300 transition hover:bg-slate-900/70 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {refreshingGrants ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total opportunities</p>
            <p className="mt-2 text-2xl font-semibold text-slate-100">{grantSummary.total}</p>
            <p className="text-sm text-slate-400">Logged for this startup</p>
          </div>
          <div className="rounded-xl border border-blue-500/40 bg-blue-500/5 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-200">Due in 14 days</p>
            <p className="mt-2 text-2xl font-semibold text-blue-100">{grantSummary.dueSoon}</p>
            <p className="text-sm text-blue-200/80">Upcoming deadlines</p>
          </div>
          <div className="rounded-xl border border-red-500/40 bg-red-500/5 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-red-200">Overdue</p>
            <p className="mt-2 text-2xl font-semibold text-red-100">{grantSummary.overdue}</p>
            <p className="text-sm text-red-200/80">Past deadline without submission</p>
          </div>
          <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/5 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-200">Awards secured</p>
            <p className="mt-2 text-2xl font-semibold text-emerald-100">{grantSummary.awarded}</p>
            <p className="text-sm text-emerald-200/80">Converted to funding</p>
          </div>
        </div>

        <p className="text-xs text-slate-500">
          Submitted &amp; awaiting decision: {grantSummary.submitted} application
          {grantSummary.submitted === 1 ? "" : "s"}.
        </p>

        <div className="space-y-4 rounded-xl border border-slate-800/80 bg-slate-950/40 p-5">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Record new opportunity</h3>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Title
              <input
                value={grantForm.title}
                onChange={(event) => setGrantForm((prev) => ({ ...prev, title: event.target.value }))}
                placeholder="e.g. Climate Innovation Challenge"
                className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Provider (optional)
              <input
                value={grantForm.provider}
                onChange={(event) => setGrantForm((prev) => ({ ...prev, provider: event.target.value }))}
                placeholder="e.g. Department of Energy"
                className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
              />
            </label>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Amount (optional)
              <input
                value={grantForm.amount}
                onChange={(event) => setGrantForm((prev) => ({ ...prev, amount: event.target.value }))}
                placeholder="50000"
                className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Currency (ISO)
              <input
                value={grantForm.currency}
                onChange={(event) => setGrantForm((prev) => ({ ...prev, currency: event.target.value }))}
                placeholder="USD"
                className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm uppercase text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Deadline (optional)
              <input
                type="date"
                value={grantForm.deadline}
                onChange={(event) => setGrantForm((prev) => ({ ...prev, deadline: event.target.value }))}
                className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none"
              />
            </label>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Status
              <select
                value={grantForm.status}
                onChange={(event) =>
                  setGrantForm((prev) => ({
                    ...prev,
                    status: event.target.value as OnboardingGrantStatus,
                  }))
                }
                className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none"
              >
                {GRANT_STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              External link (optional)
              <input
                value={grantForm.link}
                onChange={(event) => setGrantForm((prev) => ({ ...prev, link: event.target.value }))}
                placeholder="https://grant-brief.example.com"
                className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
              />
            </label>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Owner (optional)
              <input
                value={grantForm.owner}
                onChange={(event) => setGrantForm((prev) => ({ ...prev, owner: event.target.value }))}
                placeholder="Ops lead or founder"
                className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Notes (optional)
              <input
                value={grantForm.notes}
                onChange={(event) => setGrantForm((prev) => ({ ...prev, notes: event.target.value }))}
                placeholder="Key focus or submission strategy"
                className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
              />
            </label>
          </div>
          <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Description (optional)
            <textarea
              value={grantForm.description}
              onChange={(event) => setGrantForm((prev) => ({ ...prev, description: event.target.value }))}
              rows={4}
              placeholder="Short overview or reviewer context"
              className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Eligibility (one per line)
            <textarea
              value={grantEligibilityDraft}
              onChange={(event) => setGrantEligibilityDraft(event.target.value)}
              rows={4}
              placeholder={"e.g. HQ in Andhra Pradesh\nRevenue < $5M\nUniversity-affiliated team"}
              className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
            />
          </label>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={resetGrantForm}
              className="rounded-full border border-slate-700 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-300 transition hover:bg-slate-900/70"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={handleCreateGrantOpportunity}
              disabled={creatingGrant || !grantForm.title.trim()}
              className="rounded-full border border-emerald-500/70 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-emerald-200 transition hover:bg-emerald-500/10 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {creatingGrant ? "Recording…" : "Add opportunity"}
            </button>
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Active opportunities</h3>
          {grants.opportunities.length === 0 ? (
            <p className="text-sm text-slate-400">No grant opportunities logged yet. Use the form above to add your first record.</p>
          ) : (
            <ul className="space-y-4">
              {grants.opportunities.map((grant) => {
                const deadlineLabel = grant.deadline ? formatDate(grant.deadline) : "No deadline set";
                const daysUntil = grant.signals.daysUntilDeadline ?? undefined;
                const deadlineHint = (() => {
                  if (!grant.deadline) {
                    return "No deadline set";
                  }
                  if (grant.signals.isOverdue) {
                    const overdueDays = daysUntil !== undefined ? Math.abs(daysUntil) : 0;
                    return overdueDays > 0
                      ? `Overdue by ${overdueDays} day${overdueDays === 1 ? "" : "s"}`
                      : "Overdue";
                  }
                  if (daysUntil !== undefined) {
                    return `Due in ${daysUntil} day${daysUntil === 1 ? "" : "s"}`;
                  }
                  return "Deadline approaching";
                })();
                const amountLabel = formatCurrency(grant.amount, grant.currency ?? currencyCode);
                const statusLabel = getGrantStatusLabel(grant.status);
                const draft = grantDrafts[grant.id] ?? {
                  title: grant.title ?? "",
                  provider: grant.provider ?? "",
                  amount:
                    grant.amount !== undefined && grant.amount !== null
                      ? String(grant.amount)
                      : "",
                  currency: grant.currency ?? "",
                  deadline: grant.deadline ? grant.deadline.substring(0, 10) : "",
                  status: grant.status,
                  owner: grant.owner ?? "",
                  link: grant.link ?? "",
                  notes: grant.notes ?? "",
                  description: grant.description ?? "",
                };
                const eligibilityNotesDraftMap = grantEligibilityNotesDraft[grant.id] ?? {};
                const isUpdating = updatingGrantId === grant.id;
                const isDeleting = deletingGrantId === grant.id;
                return (
                  <li key={grant.id} className="space-y-4 rounded-xl border border-slate-800 bg-slate-950/50 p-5">
                    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                          <span
                            className={`rounded-full px-3 py-1 text-[11px] uppercase tracking-wide ${GRANT_STATUS_BADGE[grant.status]}`}
                          >
                            {statusLabel}
                          </span>
                          {draft.provider && (
                            <span className="rounded-full border border-slate-800 px-3 py-1 text-[11px] uppercase tracking-wide text-slate-300">
                              {draft.provider}
                            </span>
                          )}
                          {draft.owner && (
                            <span className="rounded-full border border-slate-800 px-3 py-1 text-[11px] uppercase tracking-wide text-slate-300">
                              Owner {draft.owner}
                            </span>
                          )}
                          <span
                            className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-wide ${
                              grant.signals.eligibilityComplete
                                ? "border-emerald-500/50 text-emerald-200"
                                : "border-slate-700 text-slate-300"
                            }`}
                          >
                            {grant.signals.eligibilityComplete
                              ? "Eligibility ready"
                              : `${grant.signals.unmetEligibilityCount} requirement${grant.signals.unmetEligibilityCount === 1 ? "" : "s"} open`}
                          </span>
                        </div>
                        <p className="text-lg font-semibold text-slate-100">
                          {draft.title.length ? draft.title : "Untitled opportunity"}
                        </p>
                        {draft.notes.trim().length > 0 && (
                          <p className="text-sm text-slate-300">{draft.notes}</p>
                        )}
                        {draft.description.trim().length > 0 && (
                          <p className="text-sm text-slate-400">{draft.description}</p>
                        )}
                        <p className="text-xs text-slate-500">
                          Updated {formatDateTime(grant.lastActivityAt ?? grant.updatedAt)}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-end justify-end gap-6">
                        <div className="flex flex-col items-end">
                          <span className="text-xs uppercase tracking-wide text-slate-500">Potential award</span>
                          <span className="text-2xl font-semibold text-slate-100">{amountLabel}</span>
                        </div>
                        <div className="flex flex-col items-end">
                          <span className="text-xs uppercase tracking-wide text-slate-500">Deadline</span>
                          <span
                            className={`text-2xl font-semibold ${
                              grant.signals.isOverdue ? "text-red-200" : "text-slate-100"
                            }`}
                          >
                            {deadlineLabel}
                          </span>
                          <span className="text-xs text-slate-400">{deadlineHint}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                        Status
                        <select
                          value={draft.status}
                          onChange={(event) => {
                            const nextStatus = event.target.value as OnboardingGrantStatus;
                            handleGrantDraftChange(grant.id, "status", nextStatus);
                            void handleUpdateGrantOpportunity(grant.id, { status: nextStatus });
                          }}
                          disabled={isUpdating || isDeleting}
                          className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none"
                        >
                          {GRANT_STATUS_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      {draft.link.trim().length > 0 && (
                        <a
                          href={draft.link}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-full border border-blue-500/70 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-blue-200 transition hover:bg-blue-500/10"
                        >
                          View brief
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() => handleDeleteGrantOpportunity(grant.id)}
                        disabled={isDeleting}
                        className="rounded-full border border-red-500/60 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-red-200 transition hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isDeleting ? "Removing…" : "Remove"}
                      </button>
                    </div>

                    <div className="space-y-3 rounded-lg border border-slate-800/70 bg-slate-950/40 p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Opportunity details</p>
                      <div className="grid gap-3 md:grid-cols-2">
                        <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                          Title
                          <input
                            value={draft.title}
                            onChange={(event) => handleGrantDraftChange(grant.id, "title", event.target.value)}
                            placeholder="Grant title"
                            className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
                          />
                        </label>
                        <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                          Provider (optional)
                          <input
                            value={draft.provider}
                            onChange={(event) => handleGrantDraftChange(grant.id, "provider", event.target.value)}
                            placeholder="Issuing agency"
                            className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
                          />
                        </label>
                      </div>
                      <div className="grid gap-3 md:grid-cols-3">
                        <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                          Amount (optional)
                          <input
                            value={draft.amount}
                            onChange={(event) => handleGrantDraftChange(grant.id, "amount", event.target.value)}
                            placeholder="50000"
                            className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
                          />
                        </label>
                        <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                          Currency (ISO)
                          <input
                            value={draft.currency}
                            onChange={(event) => handleGrantDraftChange(grant.id, "currency", event.target.value)}
                            placeholder="USD"
                            className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm uppercase text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
                          />
                        </label>
                        <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                          Deadline (optional)
                          <input
                            type="date"
                            value={draft.deadline}
                            onChange={(event) => handleGrantDraftChange(grant.id, "deadline", event.target.value)}
                            className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none"
                          />
                        </label>
                      </div>
                      <div className="grid gap-3 md:grid-cols-2">
                        <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                          Owner (optional)
                          <input
                            value={draft.owner}
                            onChange={(event) => handleGrantDraftChange(grant.id, "owner", event.target.value)}
                            placeholder="Ops lead or founder"
                            className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
                          />
                        </label>
                        <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                          External link (optional)
                          <input
                            value={draft.link}
                            onChange={(event) => handleGrantDraftChange(grant.id, "link", event.target.value)}
                            placeholder="https://grant-brief.example.com"
                            className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
                          />
                        </label>
                      </div>
                      <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                        Notes (optional)
                        <textarea
                          value={draft.notes}
                          onChange={(event) => handleGrantDraftChange(grant.id, "notes", event.target.value)}
                          rows={3}
                          placeholder="Key focus or submission strategy"
                          className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
                        />
                      </label>
                      <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                        Description (optional)
                        <textarea
                          value={draft.description}
                          onChange={(event) => handleGrantDraftChange(grant.id, "description", event.target.value)}
                          rows={4}
                          placeholder="Short overview or reviewer context"
                          className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
                        />
                      </label>
                      <div className="flex justify-end gap-3">
                        <button
                          type="button"
                          onClick={() => handleResetGrantDraft(grant.id)}
                          disabled={isUpdating || isDeleting}
                          className="rounded-full border border-slate-700 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-300 transition hover:bg-slate-900/70 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Reset
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSaveGrantDetails(grant.id)}
                          disabled={isUpdating || isDeleting}
                          className="rounded-full border border-blue-500/70 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-blue-200 transition hover:bg-blue-500/10 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isUpdating ? "Saving…" : "Save updates"}
                        </button>
                      </div>
                    </div>

                    <div className="space-y-2 rounded-lg border border-slate-800/70 bg-slate-950/40 p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Eligibility checklist</p>
                      {grant.eligibility.length === 0 ? (
                        <p className="text-sm text-slate-400">No eligibility criteria logged yet.</p>
                      ) : (
                        <ul className="space-y-3">
                          {grant.eligibility.map((criterion) => {
                            const eligibilityKey = `${grant.id}:${criterion.id}`;
                            const noteDraft = eligibilityNotesDraftMap[criterion.id] ?? "";
                            const isSavingCriterion = updatingEligibilityKey === eligibilityKey;
                            return (
                              <li key={criterion.id} className="space-y-2 rounded-lg border border-slate-800/60 bg-slate-950/50 p-3">
                                <div className="flex items-start gap-3">
                                  <input
                                    type="checkbox"
                                    checked={criterion.met}
                                    onChange={(event) =>
                                      handleToggleGrantEligibility(grant.id, criterion.id, event.target.checked)
                                    }
                                    disabled={isUpdating || isDeleting || isSavingCriterion}
                                    className="mt-1 h-4 w-4 rounded border border-slate-600 bg-slate-900 text-emerald-400 focus:ring-blue-500"
                                  />
                                  <div className="flex-1">
                                    <p className="text-sm text-slate-100">{criterion.label}</p>
                                    <p className="text-xs text-slate-500">
                                      {criterion.met ? "Requirement met" : "Open requirement"}
                                    </p>
                                  </div>
                                </div>
                                <textarea
                                  value={noteDraft}
                                  onChange={(event) =>
                                    handleGrantEligibilityNoteChange(grant.id, criterion.id, event.target.value)
                                  }
                                  rows={3}
                                  placeholder="Capture support notes or documents needed"
                                  className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
                                  disabled={isDeleting}
                                />
                                {isSavingCriterion && (
                                  <p className="text-[11px] uppercase tracking-wide text-blue-300">Updating…</p>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      )}
                      {grant.eligibility.length > 0 && (
                        <p className="text-[11px] text-slate-500">
                          Update notes above and use “Save updates” to persist eligibility commentary.
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      <section className="space-y-6 rounded-2xl border border-slate-800/70 bg-slate-950/60 p-6">
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-slate-100">Graduation &amp; alumni impact</h2>
            <p className="text-sm text-slate-400">
              Track post-program outcomes, raise timely check-ins, and capture alumni momentum for long-term impact.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={refreshAlumniRecord}
              className="rounded-full border border-slate-700 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-300 transition hover:bg-slate-900/70"
            >
              Refresh
            </button>
            <button
              type="button"
              onClick={handleSaveAlumni}
              disabled={savingAlumni}
              className="rounded-full border border-emerald-500/70 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-emerald-200 transition hover:bg-emerald-500/10 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {savingAlumni ? "Saving…" : "Save profile"}
            </button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Status</p>
            <p className="mt-2 text-2xl font-semibold text-slate-100">
              {GRADUATION_STATUS_OPTIONS.find((option) => option.value === alumniSummary.status)?.label ?? alumniSummary.status}
            </p>
            <p className="text-sm text-slate-400">
              {alumniSummary.monthsSinceGraduation !== undefined
                ? `${alumniSummary.monthsSinceGraduation} month${alumniSummary.monthsSinceGraduation === 1 ? "" : "s"} since graduation`
                : "Awaiting graduation"}
            </p>
          </div>
          <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/5 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-200">Funding raised</p>
            <p className="mt-2 text-2xl font-semibold text-emerald-100">
              {formatCurrency(alumniSummary.totalFundingRaised, currencyCode)}
            </p>
            <p className="text-sm text-emerald-200/80">Lifetime total</p>
          </div>
          <div className="rounded-xl border border-blue-500/40 bg-blue-500/5 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-200">Revenue run rate</p>
            <p className="mt-2 text-2xl font-semibold text-blue-100">
              {formatCurrency(alumniSummary.revenueRunRate, currencyCode)}
            </p>
            <p className="text-sm text-blue-200/80">Most recent</p>
          </div>
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-200">Jobs created</p>
            <p className="mt-2 text-2xl font-semibold text-amber-100">
              {formatNumber(alumniSummary.jobsCreated)}
            </p>
            <p className="text-sm text-amber-200/80">Since graduation</p>
          </div>
          <div
            className={`rounded-xl border p-4 ${
              alumniSummary.needsCheckIn
                ? "border-purple-500/60 bg-purple-500/10 shadow-inner shadow-purple-900/10"
                : "border-slate-800 bg-slate-950/70"
            }`}
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Next check-in</p>
            <p
              className={`mt-2 text-2xl font-semibold ${
                alumniSummary.needsCheckIn ? "text-purple-100" : "text-slate-100"
              }`}
            >
              {alumniSummary.checkInLabel}
            </p>
            <p className="text-sm text-slate-400">
              {alumni.signals.touchpointCount} touchpoint
              {alumni.signals.touchpointCount === 1 ? "" : "s"} logged
            </p>
          </div>
        </div>

        <div className="space-y-4 rounded-xl border border-slate-800/80 bg-slate-950/40 p-5">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Program journey</h3>
          <div className="grid gap-3 md:grid-cols-3">
            <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Status
              <select
                value={alumniForm.status}
                onChange={(event) =>
                  setAlumniForm((prev) => ({
                    ...prev,
                    status: event.target.value as OnboardingGraduationStatus,
                  }))
                }
                className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none"
              >
                {GRADUATION_STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Cohort
              <input
                value={alumniForm.cohort}
                onChange={(event) => setAlumniForm((prev) => ({ ...prev, cohort: event.target.value }))}
                placeholder="Summer 2025"
                className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Tags (comma separated)
              <input
                value={alumniForm.tags}
                onChange={(event) => setAlumniForm((prev) => ({ ...prev, tags: event.target.value }))}
                placeholder="Climate, DeepTech"
                className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
              />
            </label>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Program start
              <input
                type="date"
                value={alumniForm.programStartAt}
                onChange={(event) => setAlumniForm((prev) => ({ ...prev, programStartAt: event.target.value }))}
                className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Graduation date
              <input
                type="date"
                value={alumniForm.graduationDate}
                onChange={(event) => setAlumniForm((prev) => ({ ...prev, graduationDate: event.target.value }))}
                className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Alumni since
              <input
                type="date"
                value={alumniForm.alumniSince}
                onChange={(event) => setAlumniForm((prev) => ({ ...prev, alumniSince: event.target.value }))}
                className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none"
              />
            </label>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Support owner
              <input
                value={alumniForm.supportOwner}
                onChange={(event) => setAlumniForm((prev) => ({ ...prev, supportOwner: event.target.value }))}
                placeholder="Program ops lead"
                className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Primary mentor
              <input
                value={alumniForm.primaryMentor}
                onChange={(event) => setAlumniForm((prev) => ({ ...prev, primaryMentor: event.target.value }))}
                placeholder="Lead mentor name"
                className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Next check-in
              <input
                type="date"
                value={alumniForm.nextCheckInAt}
                onChange={(event) => setAlumniForm((prev) => ({ ...prev, nextCheckInAt: event.target.value }))}
                className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none"
              />
            </label>
          </div>
          <div className="grid gap-3 md:grid-cols-4">
            <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Currency (ISO)
              <input
                value={alumniForm.currency}
                onChange={(event) => setAlumniForm((prev) => ({ ...prev, currency: event.target.value }))}
                placeholder="USD"
                className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm uppercase text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Funding raised
              <input
                type="number"
                value={alumniForm.fundingRaised}
                onChange={(event) => setAlumniForm((prev) => ({ ...prev, fundingRaised: event.target.value }))}
                placeholder="500000"
                className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Revenue run rate
              <input
                type="number"
                value={alumniForm.revenueRunRate}
                onChange={(event) => setAlumniForm((prev) => ({ ...prev, revenueRunRate: event.target.value }))}
                placeholder="75000"
                className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Jobs created
              <input
                type="number"
                value={alumniForm.jobsCreated}
                onChange={(event) => setAlumniForm((prev) => ({ ...prev, jobsCreated: event.target.value }))}
                placeholder="12"
                className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
              />
            </label>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Impact score (0-100)
              <input
                type="number"
                min={0}
                max={100}
                step={0.1}
                value={alumniForm.impactScore}
                onChange={(event) => setAlumniForm((prev) => ({ ...prev, impactScore: event.target.value }))}
                placeholder="85"
                className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
              />
            </label>
            <div className="space-y-2 text-xs uppercase tracking-wide text-slate-400">
              <span className="font-semibold">Active tags</span>
              {alumni.tags && alumni.tags.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {alumni.tags.map((tag) => (
                    <span key={tag} className="rounded-full border border-slate-700 px-3 py-1 text-[11px] text-slate-200">
                      {tag}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-slate-500 normal-case">No tags yet.</p>
              )}
            </div>
          </div>
          <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Notes
            <textarea
              value={alumniForm.notes}
              onChange={(event) => setAlumniForm((prev) => ({ ...prev, notes: event.target.value }))}
              rows={4}
              placeholder="Summarize post-program support, key wins, or long-term commitments."
              className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
            />
          </label>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleSaveAlumni}
              disabled={savingAlumni}
              className="rounded-full border border-emerald-500/70 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-emerald-200 transition hover:bg-emerald-500/10 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {savingAlumni ? "Saving…" : "Save profile"}
            </button>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-4 rounded-xl border border-slate-800/80 bg-slate-950/40 p-5">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Log new touchpoint</h3>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Recorded at
                <input
                  type="datetime-local"
                  value={newTouchpoint.recordedAt}
                  onChange={(event) => setNewTouchpoint((prev) => ({ ...prev, recordedAt: event.target.value }))}
                  className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none"
                />
              </label>
              <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Channel
                <select
                  value={newTouchpoint.channel}
                  onChange={(event) => setNewTouchpoint((prev) => ({ ...prev, channel: event.target.value }))}
                  className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none"
                >
                  {TOUCHPOINT_CHANNEL_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Sentiment
              <select
                value={newTouchpoint.sentiment}
                onChange={(event) =>
                  setNewTouchpoint((prev) => ({
                    ...prev,
                    sentiment: event.target.value as "positive" | "neutral" | "negative",
                  }))
                }
                className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none"
              >
                {TOUCHPOINT_SENTIMENT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Highlight
              <input
                value={newTouchpoint.highlight}
                onChange={(event) => setNewTouchpoint((prev) => ({ ...prev, highlight: event.target.value }))}
                placeholder="Investor update, customer launch, etc."
                className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Notes
              <textarea
                value={newTouchpoint.notes}
                onChange={(event) => setNewTouchpoint((prev) => ({ ...prev, notes: event.target.value }))}
                rows={4}
                placeholder="Key discussion points, commitments, or risks."
                className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
              />
            </label>
            <div className="grid gap-3 md:grid-cols-3">
              <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Funding (+)
                <input
                  type="number"
                  value={newTouchpoint.fundingRaised}
                  onChange={(event) => setNewTouchpoint((prev) => ({ ...prev, fundingRaised: event.target.value }))}
                  placeholder="250000"
                  className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
                />
              </label>
              <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Revenue (+)
                <input
                  type="number"
                  value={newTouchpoint.revenueRunRate}
                  onChange={(event) => setNewTouchpoint((prev) => ({ ...prev, revenueRunRate: event.target.value }))}
                  placeholder="12000"
                  className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
                />
              </label>
              <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Jobs (+)
                <input
                  type="number"
                  value={newTouchpoint.jobsCreated}
                  onChange={(event) => setNewTouchpoint((prev) => ({ ...prev, jobsCreated: event.target.value }))}
                  placeholder="3"
                  className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
                />
              </label>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Follow-up on
                <input
                  type="datetime-local"
                  value={newTouchpoint.nextActionAt}
                  onChange={(event) => setNewTouchpoint((prev) => ({ ...prev, nextActionAt: event.target.value }))}
                  className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none"
                />
              </label>
              <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Follow-up owner
                <input
                  value={newTouchpoint.nextActionOwner}
                  onChange={(event) => setNewTouchpoint((prev) => ({ ...prev, nextActionOwner: event.target.value }))}
                  placeholder="ops@incubator.local"
                  className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
                />
              </label>
            </div>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={resetTouchpointDraft}
                className="rounded-full border border-slate-700 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-300 transition hover:bg-slate-900/70"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={handleLogTouchpoint}
                disabled={loggingTouchpoint}
                className="rounded-full border border-blue-500/70 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-blue-200 transition hover:bg-blue-500/10 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loggingTouchpoint ? "Logging…" : "Log touchpoint"}
              </button>
            </div>
          </div>
          <div className="space-y-4 rounded-xl border border-slate-800/80 bg-slate-950/40 p-5">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Recent touchpoints</h3>
            {alumni.touchpoints.length === 0 ? (
              <p className="text-sm text-slate-400">No alumni touchpoints logged yet.</p>
            ) : (
              <ul className="space-y-3">
                {alumni.touchpoints.slice(0, 8).map((touchpoint) => {
                  const channelLabel = TOUCHPOINT_CHANNEL_OPTIONS.find((option) => option.value === (touchpoint.channel ?? "other"))?.label ?? touchpoint.channel ?? "Other";
                  const sentimentClass = touchpoint.sentiment ? TOUCHPOINT_SENTIMENT_BADGE[touchpoint.sentiment] : "text-slate-400";
                  return (
                    <li key={touchpoint.id} className="space-y-2 rounded-lg border border-slate-800 bg-slate-950/50 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-slate-100">
                          {touchpoint.highlight ?? "Touchpoint"}
                        </p>
                        <span className="text-xs text-slate-500">{formatDateTime(touchpoint.recordedAt)}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-wide text-slate-400">
                        {touchpoint.channel && (
                          <span className="rounded-full border border-slate-800 px-3 py-1">{channelLabel}</span>
                        )}
                        {touchpoint.sentiment && (
                          <span className={`rounded-full border border-slate-800 px-3 py-1 ${sentimentClass}`}>
                            {touchpoint.sentiment.toUpperCase()}
                          </span>
                        )}
                        {touchpoint.recordedBy && (
                          <span className="rounded-full border border-slate-800 px-3 py-1">
                            By {touchpoint.recordedBy}
                          </span>
                        )}
                      </div>
                      {touchpoint.notes && (
                        <p className="whitespace-pre-line text-sm text-slate-300">{touchpoint.notes}</p>
                      )}
                      {touchpoint.nextActionAt && (
                        <p className="text-xs text-purple-200">
                          Follow-up {formatDateTime(touchpoint.nextActionAt)}
                          {touchpoint.nextActionOwner ? ` · ${touchpoint.nextActionOwner}` : ""}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </section>

      <section className="space-y-4 rounded-2xl border border-slate-800/70 bg-slate-950/60 p-6">
        <h2 className="text-lg font-semibold text-slate-100">Full application responses</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {submission.responses.map((response) => (
            <div key={response.fieldId} className="space-y-2 rounded-xl border border-slate-800/80 bg-slate-950/40 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  {response.label}
                </p>
                {response.attachments && response.attachments.length > 0 && (
                  <span className="text-[11px] uppercase tracking-wide text-blue-300">
                    {response.attachments.length} attachment{response.attachments.length > 1 ? "s" : ""}
                  </span>
                )}
              </div>
              <p className="whitespace-pre-line text-sm text-slate-100">
                {Array.isArray(response.value)
                  ? response.value.join("\n")
                  : response.value ?? "—"}
              </p>
              {response.attachments && response.attachments.length > 0 && (
                <ul className="space-y-2 text-xs text-blue-200">
                  {response.attachments.map((attachment) => (
                    <li key={attachment.key}>
                      <a
                        href={attachment.url ?? "#"}
                        target="_blank"
                        rel="noreferrer"
                        className="underline decoration-dotted underline-offset-4 hover:text-blue-100"
                      >
                        {attachment.name}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
