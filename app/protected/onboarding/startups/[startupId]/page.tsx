"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  OnboardingChecklist,
  OnboardingChecklistItem,
  OnboardingChecklistStatus,
  OnboardingDocument,
  OnboardingMilestonePlanSnapshot,
  OnboardingMilestoneStatus,
  OnboardingMilestoneUpdateInput,
  OnboardingSubmissionSummary,
} from "@/lib/onboarding/types";

type PageProps = {
  params: {
    startupId: string;
  };
  searchParams: {
    userId?: string;
  };
};

type WorkspacePayload = {
  ok: boolean;
  submission: OnboardingSubmissionSummary;
  checklist: OnboardingChecklist;
  documents: OnboardingDocument[];
  milestones: OnboardingMilestonePlanSnapshot;
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

export default function StartupWorkspacePage({ params, searchParams }: PageProps) {
  const { startupId } = params;
  const userId = searchParams.userId;

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

  const parseNumberInput = (value: string): number | undefined => {
    const trimmed = value.trim();
    if (!trimmed.length) {
      return undefined;
    }
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : undefined;
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

  if (!submission || !checklist || !milestones) {
    return null;
  }

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
