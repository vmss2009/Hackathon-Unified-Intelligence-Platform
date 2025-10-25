"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  OnboardingChecklist,
  OnboardingChecklistItem,
  OnboardingChecklistStatus,
  OnboardingDocument,
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

  useEffect(() => {
    if (checklist) {
      setNotesDraft(checklist.notes ?? "");
    }
  }, [checklist?.notes]);

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

  if (!submission || !checklist) {
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
