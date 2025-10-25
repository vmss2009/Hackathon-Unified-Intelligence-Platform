"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  OnboardingSubmissionSummary,
  OnboardingSubmissionSummaryStatus,
} from "@/lib/onboarding/types";

type StageOption = {
  value: string;
  label: string;
};

type StatusOption = OnboardingSubmissionSummaryStatus;

type SubmissionListResponse = {
  ok: boolean;
  submissions: OnboardingSubmissionSummary[];
  meta: {
    total: number;
    stageFieldId?: string;
    stageOptions?: StageOption[];
    scoreRange: {
      min: number;
      max: number;
    };
    statusOptions: StatusOption[];
  };
  error?: string;
};

const statusLabels: Record<StatusOption, string> = {
  advance: "Advance",
  review: "Review",
  reject: "Reject",
};

const statusStyles: Record<StatusOption, string> = {
  advance:
    "border-emerald-400/60 bg-emerald-500/10 text-emerald-200",
  review:
    "border-blue-400/60 bg-blue-500/10 text-blue-200",
  reject:
    "border-red-400/60 bg-red-500/10 text-red-200",
};

const INITIAL_FILTERS = {
  query: "",
  stage: "",
  status: "",
  minScore: "",
  maxScore: "",
};

type FiltersState = typeof INITIAL_FILTERS;

const formatDate = (value: string) => {
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

const formatScore = (submission: OnboardingSubmissionSummary) => {
  const score = submission.score ?? submission.scoreManual ?? submission.scoreAuto;
  const total =
    score?.total ?? score?.breakdown?.reduce((sum, item) => sum + item.points, 0) ?? 0;
  const awarded = score?.awarded ?? 0;
  const percentage = score?.percentage ?? (total > 0 ? Number(((awarded / total) * 100).toFixed(1)) : 0);
  return { total, awarded, percentage };
};

type ManualScoreEditorProps = {
  submission: OnboardingSubmissionSummary;
  onUpdated: (submission: OnboardingSubmissionSummary) => void;
};

function ManualScoreEditor({ submission, onUpdated }: ManualScoreEditorProps) {
  const autoScore = submission.scoreAuto;
  const manualScore = submission.scoreManual;
  const finalScore = submission.score ?? manualScore ?? autoScore;
  const baselineBreakdown = manualScore?.breakdown ?? finalScore?.breakdown ?? autoScore?.breakdown ?? [];

  const [statusDraft, setStatusDraft] = useState<StatusOption>(finalScore?.status ?? "review");
  const [awardedDraft, setAwardedDraft] = useState<string>(
    finalScore?.awarded !== undefined ? String(finalScore.awarded) : "",
  );
  const [totalDraft, setTotalDraft] = useState<string>(
    finalScore?.total !== undefined ? String(finalScore.total) : "",
  );
  const [noteDraft, setNoteDraft] = useState<string>(manualScore?.note ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const hydrateFromSummary = useCallback(
    (target: OnboardingSubmissionSummary) => {
      const effective = target.score ?? target.scoreManual ?? target.scoreAuto;
      setStatusDraft(effective?.status ?? "review");
      setAwardedDraft(
        effective?.awarded !== undefined
          ? String(effective.awarded)
          : target.scoreAuto?.awarded !== undefined
          ? String(target.scoreAuto.awarded)
          : "",
      );
      setTotalDraft(
        effective?.total !== undefined
          ? String(effective.total)
          : target.scoreAuto?.total !== undefined
          ? String(target.scoreAuto.total)
          : "",
      );
      setNoteDraft(target.scoreManual?.note ?? "");
    },
    [],
  );

  useEffect(() => {
    hydrateFromSummary(submission);
    setError(null);
    setSuccess(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submission.id, submission.score?.updatedAt, submission.scoreManual?.updatedAt, submission.scoreAuto?.updatedAt, submission.status]);

  const handleApply = async () => {
    const awardedValue = Number(awardedDraft);
    if (Number.isNaN(awardedValue)) {
      setError("Awarded points must be a number");
      setSuccess(null);
      return;
    }

    const totalValue = totalDraft.trim().length ? Number(totalDraft) : undefined;
    if (totalValue !== undefined && Number.isNaN(totalValue)) {
      setError("Total points must be numeric when provided");
      setSuccess(null);
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(`/api/protected/onboarding/submissions/${submission.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          status: statusDraft,
          awarded: awardedValue,
          total: totalValue,
          note: noteDraft.trim().length ? noteDraft.trim() : undefined,
          breakdown: baselineBreakdown.length ? baselineBreakdown : undefined,
        }),
      });

      const payload = (await response.json()) as {
        ok: boolean;
        submission?: OnboardingSubmissionSummary;
        error?: string;
      };

      if (!response.ok || !payload.ok || !payload.submission) {
        throw new Error(payload.error ?? "Unable to save manual score");
      }

      onUpdated(payload.submission);
      hydrateFromSummary(payload.submission);
      setSuccess("Manual override saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save manual score");
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(`/api/protected/onboarding/submissions/${submission.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ clearOverride: true }),
      });

      const payload = (await response.json()) as {
        ok: boolean;
        submission?: OnboardingSubmissionSummary;
        error?: string;
      };

      if (!response.ok || !payload.ok || !payload.submission) {
        throw new Error(payload.error ?? "Unable to clear manual override");
      }

      onUpdated(payload.submission);
      hydrateFromSummary(payload.submission);
      setSuccess("Manual override cleared");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to clear manual override");
    } finally {
      setSaving(false);
    }
  };

  const handleUseAuto = () => {
    if (!autoScore) {
      setError("No auto score available to restore");
      setSuccess(null);
      return;
    }
    setStatusDraft(autoScore.status);
    setAwardedDraft(String(autoScore.awarded ?? 0));
    setTotalDraft(autoScore.total !== undefined ? String(autoScore.total) : "");
    setNoteDraft("");
    setError(null);
    setSuccess("Auto score loaded into form");
  };

  return (
    <div className="space-y-4 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-amber-200">
          Manual decision controls
        </h4>
        {manualScore?.updatedAt && (
          <span className="text-[11px] text-amber-200/80">
            Last updated {new Date(manualScore.updatedAt).toLocaleString()}
            {manualScore.updatedBy ? ` by ${manualScore.updatedBy}` : ""}
          </span>
        )}
      </div>
      {error && <p className="text-xs text-red-300">{error}</p>}
      {success && <p className="text-xs text-emerald-300">{success}</p>}
      <div className="grid gap-3 md:grid-cols-3">
        <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-amber-200/80">
          Decision
          <select
            value={statusDraft}
            onChange={(event) => setStatusDraft(event.target.value as StatusOption)}
            className="rounded-md border border-amber-500/40 bg-slate-950 px-3 py-2 text-sm text-amber-100 focus:border-amber-300 focus:outline-none"
          >
            {(["advance", "review", "reject"] as StatusOption[]).map((option) => (
              <option key={option} value={option}>
                {statusLabels[option]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-amber-200/80">
          Awarded points
          <input
            type="number"
            min={0}
            value={awardedDraft}
            onChange={(event) => setAwardedDraft(event.target.value)}
            className="rounded-md border border-amber-500/40 bg-slate-950 px-3 py-2 text-sm text-amber-100 focus:border-amber-300 focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-amber-200/80">
          Total points
          <input
            type="number"
            min={0}
            value={totalDraft}
            placeholder={finalScore?.total !== undefined ? String(finalScore.total) : autoScore?.total !== undefined ? String(autoScore.total) : ""}
            onChange={(event) => setTotalDraft(event.target.value)}
            className="rounded-md border border-amber-500/40 bg-slate-950 px-3 py-2 text-sm text-amber-100 focus:border-amber-300 focus:outline-none"
          />
        </label>
      </div>
      <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-amber-200/80">
        Reviewer note
        <textarea
          value={noteDraft}
          onChange={(event) => setNoteDraft(event.target.value)}
          placeholder="Add context for this manual decision"
          className="h-20 rounded-md border border-amber-500/40 bg-slate-950 px-3 py-2 text-sm text-amber-100 focus:border-amber-300 focus:outline-none"
        />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleApply}
          disabled={saving}
          className="rounded-full border border-amber-400/70 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-amber-100 transition hover:bg-amber-500/10 disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save manual decision"}
        </button>
        <button
          type="button"
          onClick={handleUseAuto}
          className="rounded-full border border-slate-700 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-200 transition hover:bg-slate-900/60"
        >
          Use auto score
        </button>
        <button
          type="button"
          onClick={handleClear}
          disabled={saving || !manualScore}
          className="rounded-full border border-red-500/60 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-red-200 transition hover:bg-red-500/10 disabled:opacity-60"
        >
          Clear manual override
        </button>
      </div>
      <div className="text-[11px] text-amber-200/70">
        <p>
          Auto score: {autoScore ? `${autoScore.awarded ?? 0}${autoScore.total ? ` / ${autoScore.total}` : ""}` : "—"}
        </p>
        {manualScore && (
          <p className="mt-1">
            Manual score: {manualScore.awarded ?? 0}
            {manualScore.total ? ` / ${manualScore.total}` : ""}
            {manualScore.status ? ` (${statusLabels[manualScore.status as StatusOption]})` : ""}
          </p>
        )}
        {manualScore?.note && (
          <p className="mt-1 text-amber-200">Saved note: {manualScore.note}</p>
        )}
      </div>
    </div>
  );
}

export default function SubmissionReviewPage() {
  const [filters, setFilters] = useState<FiltersState>(INITIAL_FILTERS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submissions, setSubmissions] = useState<OnboardingSubmissionSummary[]>([]);
  const [stageOptions, setStageOptions] = useState<StageOption[]>([]);
  const [statusOptions, setStatusOptions] = useState<StatusOption[]>(["advance", "review", "reject"]);
  const [scoreBounds, setScoreBounds] = useState<{ min: number; max: number }>({ min: 0, max: 0 });
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams();

    if (filters.query.trim().length) {
      params.set("query", filters.query.trim());
    }
    if (filters.stage) {
      params.set("stage", filters.stage);
    }
    if (filters.status) {
      params.set("status", filters.status);
    }
    if (filters.minScore.trim().length) {
      params.set("minScore", filters.minScore.trim());
    }
    if (filters.maxScore.trim().length) {
      params.set("maxScore", filters.maxScore.trim());
    }

    setLoading(true);
    setError(null);

    fetch(`/api/protected/onboarding/submissions?${params.toString()}`, {
      method: "GET",
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) {
          throw new Error("Failed to load submissions");
        }
        return (await res.json()) as SubmissionListResponse;
      })
      .then((payload) => {
        if (!payload.ok) {
          throw new Error(payload.error ?? "Unable to load submissions");
        }
        setSubmissions(payload.submissions);
        setStageOptions(payload.meta.stageOptions ?? []);
        setStatusOptions(payload.meta.statusOptions ?? ["advance", "review", "reject"]);
        setScoreBounds({
          min: payload.meta.scoreRange.min,
          max: payload.meta.scoreRange.max,
        });
      })
      .catch((err) => {
        if (controller.signal.aborted) {
          return;
        }
        setError(err instanceof Error ? err.message : "Unable to load submissions");
        setSubmissions([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [filters]);

  const summary = useMemo(() => {
    const counts: Record<StatusOption, number> = {
      advance: 0,
      review: 0,
      reject: 0,
    };

    submissions.forEach((submission) => {
      const status = (submission.status ?? "review") as StatusOption;
      counts[status] = (counts[status] ?? 0) + 1;
    });

    return {
      total: submissions.length,
      ...counts,
    };
  }, [submissions]);

  const stageLookup = useMemo(() => {
    const map = new Map<string, string>();
    stageOptions.forEach((option) => map.set(option.value, option.label));
    return map;
  }, [stageOptions]);

  const toggleExpanded = (id: string) => {
    setExpandedId((current) => (current === id ? null : id));
  };

  const handleSubmissionUpdated = useCallback((updated: OnboardingSubmissionSummary) => {
    setSubmissions((prev) => prev.map((submission) => (submission.id === updated.id ? updated : submission)));
  }, []);

  const resetFilters = () => {
    setFilters(INITIAL_FILTERS);
  };

  return (
    <main className="space-y-8 p-8">
      <header className="flex flex-col gap-4 rounded-2xl border border-slate-800/80 bg-slate-950/60 p-6 shadow-xl shadow-blue-900/20">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-blue-400/80">
              Founder submissions
            </p>
            <h1 className="text-3xl font-bold text-slate-100">Application review</h1>
            <p className="text-sm text-slate-300/90">
              Evaluate incoming founder applications with automated scoring, filters, and rich context.
            </p>
            <p className="text-xs text-slate-500">
              Showing {summary.total} submission{summary.total === 1 ? "" : "s"} with current filters.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/protected/onboarding"
              className="rounded-full border border-slate-700 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-300 transition hover:bg-slate-900/70"
            >
              Builder workspace
            </Link>
            <Link
              href="/onboarding"
              className="rounded-full border border-blue-500/70 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-blue-200 transition hover:bg-blue-500/10"
            >
              Public form
            </Link>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {(["advance", "review", "reject"] as StatusOption[]).map((status) => (
            <div
              key={status}
              className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 shadow-inner shadow-blue-900/10"
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {statusLabels[status]}
              </p>
              <p className="mt-2 text-2xl font-semibold text-slate-100">
                {summary[status] ?? 0}
              </p>
            </div>
          ))}
        </div>
      </header>

      <section className="space-y-4 rounded-2xl border border-slate-800/70 bg-slate-950/60 p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-100">Filters</h2>
          <button
            type="button"
            onClick={resetFilters}
            className="text-xs font-semibold uppercase tracking-wide text-blue-200 transition hover:text-blue-100"
          >
            Reset
          </button>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Keyword search
            <input
              value={filters.query}
              onChange={(event) => setFilters((prev) => ({ ...prev, query: event.target.value }))}
              placeholder="Search company names, traction, attachments"
              className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
            />
          </label>

          <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Stage
            <select
              value={filters.stage}
              onChange={(event) => setFilters((prev) => ({ ...prev, stage: event.target.value }))}
              className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none"
            >
              <option value="">All stages</option>
              {stageOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Status
            <select
              value={filters.status}
              onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value }))}
              className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none"
            >
              <option value="">All statuses</option>
              {statusOptions.map((option) => (
                <option key={option} value={option}>
                  {statusLabels[option]}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Min score
            <input
              type="number"
              min={0}
              value={filters.minScore}
              onChange={(event) => setFilters((prev) => ({ ...prev, minScore: event.target.value }))}
              placeholder={scoreBounds.min ? `${scoreBounds.min}` : "0"}
              className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none"
            />
          </label>

          <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Max score
            <input
              type="number"
              min={0}
              value={filters.maxScore}
              onChange={(event) => setFilters((prev) => ({ ...prev, maxScore: event.target.value }))}
              placeholder={scoreBounds.max ? `${scoreBounds.max}` : ""}
              className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none"
            />
          </label>
        </div>
      </section>

      <section className="space-y-6">
        {loading ? (
          <div className="flex min-h-[30vh] items-center justify-center text-sm text-blue-200/70">
            Loading submissions…
          </div>
        ) : error ? (
          <div className="flex min-h-[30vh] flex-col items-center justify-center gap-3 rounded-2xl border border-red-500/40 bg-red-500/5 p-6 text-center">
            <p className="text-sm text-red-200">{error}</p>
            <button
              type="button"
              onClick={() => setFilters((prev) => ({ ...prev }))}
              className="rounded-full border border-red-400/60 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-red-200 transition hover:bg-red-500/10"
            >
              Retry
            </button>
          </div>
        ) : submissions.length === 0 ? (
          <div className="flex min-h-[30vh] flex-col items-center justify-center gap-3 rounded-2xl border border-slate-800/60 bg-slate-950/40 p-6 text-center">
            <p className="text-sm text-slate-300">No submissions match your filters yet.</p>
            <p className="text-xs text-slate-500">
              Adjust filters or send the public form to founders to start collecting data.
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            {submissions.map((submission) => {
              const effectiveScore = submission.score ?? submission.scoreManual ?? submission.scoreAuto;
              const resolvedStatus = (submission.status ?? effectiveScore?.status ?? "review") as StatusOption;
              const { total, awarded, percentage } = formatScore(submission);
              const progress = total > 0 ? Math.min(100, Math.round((awarded / total) * 100)) : 0;
              const manualOverrideActive = Boolean(submission.scoreManual);
              const companyStageLabel = submission.companyStage
                ? stageLookup.get(submission.companyStage.value) ?? submission.companyStage.label ?? submission.companyStage.value
                : "Unknown stage";

              return (
                <article
                  key={submission.id}
                  className="space-y-5 rounded-2xl border border-slate-800/80 bg-slate-950/60 p-6 shadow-lg shadow-blue-900/10"
                >
                  <header className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div className="space-y-2">
                      <h2 className="text-2xl font-semibold text-slate-100">
                        {submission.companyName ?? "Unnamed submission"}
                      </h2>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
                        <span className="rounded-full border border-slate-800 px-3 py-1">
                          {companyStageLabel}
                        </span>
                        <span className="rounded-full border border-slate-800 px-3 py-1">
                          Submitted {formatDate(submission.submittedAt)}
                        </span>
                        <span className="rounded-full border border-slate-800 px-3 py-1">
                          Applicant {submission.userId}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-3">
                      <span
                        className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide ${statusStyles[resolvedStatus]}`}
                      >
                        {statusLabels[resolvedStatus]}
                      </span>
                      {manualOverrideActive && (
                        <span className="text-[11px] uppercase tracking-wide text-amber-200">
                          Manual override active
                        </span>
                      )}
                      <div className="w-full min-w-[200px] space-y-2">
                        <div className="flex items-center justify-between text-xs text-slate-400">
                          <span>Score</span>
                          <span>
                            {awarded}
                            {total ? ` / ${total}` : ""} ({percentage}%)
                          </span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-blue-500 via-purple-500 to-emerald-500"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </header>

                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {submission.responses.slice(0, 3).map((response) => (
                      <div key={response.fieldId} className="space-y-1 rounded-xl border border-slate-800 bg-slate-950/70 p-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          {response.label}
                        </p>
                        <p className="text-sm text-slate-200">
                          {Array.isArray(response.value)
                            ? response.value.join(", ")
                            : response.value ?? "—"}
                        </p>
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => toggleExpanded(submission.id)}
                      className="rounded-full border border-blue-500/70 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-blue-200 transition hover:bg-blue-500/10"
                    >
                      {expandedId === submission.id ? "Hide details" : "View full responses"}
                    </button>
                    <Link
                      href={`/protected/onboarding/startups/${submission.id}?userId=${encodeURIComponent(submission.userId)}`}
                      className="rounded-full border border-emerald-500/70 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-emerald-200 transition hover:bg-emerald-500/10"
                    >
                      Open workspace
                    </Link>
                    {submission.score?.status === "advance" && (
                      <span className="text-xs text-emerald-200">
                        Meets auto-advance threshold
                      </span>
                    )}
                    {submission.score?.status === "reject" && (
                      <span className="text-xs text-red-300">
                        Falls below rejection threshold
                      </span>
                    )}
                  </div>

                  {expandedId === submission.id && (
                    <div className="space-y-4 rounded-xl border border-slate-800 bg-slate-950/70 p-5">
                      <h3 className="text-sm font-semibold text-slate-100">Full responses</h3>
                      <div className="grid gap-4 md:grid-cols-2">
                        {submission.responses.map((response) => (
                          <div key={response.fieldId} className="space-y-2 rounded-lg border border-slate-800/80 bg-slate-950/40 p-4">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                                {response.label}
                              </p>
                              {response.attachments && response.attachments.length > 0 && (
                                <span className="text-[11px] uppercase tracking-wide text-blue-300">
                                  {response.attachments.length} attachment{response.attachments.length > 1 ? "s" : ""}
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-slate-100 whitespace-pre-line">
                              {Array.isArray(response.value)
                                ? response.value.join("\n")
                                : response.value ?? "—"}
                            </p>
                            {response.attachments && response.attachments.length > 0 && (
                              <ul className="space-y-2">
                                {response.attachments.map((attachment) => {
                                  const readableSize = Math.max(1, Math.round((attachment.size ?? 0) / 1024));
                                  return (
                                    <li key={attachment.key} className="text-xs text-blue-200">
                                      {attachment.url ? (
                                        <a
                                          href={attachment.url}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="underline decoration-dotted underline-offset-4 hover:text-blue-100"
                                        >
                                          {attachment.name} ({readableSize} KB)
                                        </a>
                                      ) : (
                                        <span className="text-slate-400">
                                          {attachment.name} ({readableSize} KB)
                                        </span>
                                      )}
                                    </li>
                                  );
                                })}
                              </ul>
                            )}
                          </div>
                        ))}
                      </div>

                      {effectiveScore?.breakdown?.length ? (
                        <div className="space-y-3 rounded-lg border border-slate-800/80 bg-slate-950/40 p-4">
                          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                            Scoring breakdown ({effectiveScore.source ?? "auto"})
                          </h4>
                          <ul className="space-y-2">
                            {effectiveScore.breakdown.map((item) => (
                              <li
                                key={item.ruleId}
                                className="flex flex-col gap-1 rounded-md border border-slate-800 bg-slate-950/70 p-3 text-xs text-slate-300"
                              >
                                <div className="flex items-center justify-between">
                                  <span className="font-semibold text-slate-100">{item.label}</span>
                                  <span className={item.matched ? "text-emerald-300" : "text-slate-500"}>
                                    {item.matched ? `+${item.points}` : "+0"} pts
                                  </span>
                                </div>
                                {!item.matched && item.reason && (
                                  <span className="text-[11px] text-slate-500">{item.reason}</span>
                                )}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}

                      <ManualScoreEditor submission={submission} onUpdated={handleSubmissionUpdated} />
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
