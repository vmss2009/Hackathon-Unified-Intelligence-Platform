"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import type { OnboardingMilestonePlanSnapshot } from "@/lib/onboarding/types";
import { OnboardingMilestoneStatus } from "@/lib/onboarding/types";

type Disbursement = {
  id: string;
  amount: number;
  date: string;
  tranche?: string;
  reference?: string;
  milestoneId?: string;
  requestedBy?: string;
  requestedAt?: string;
  targetReleaseDate?: string;
  status: "draft" | "pending" | "approved" | "rejected" | "released";
  approvals: Array<{
    id: string;
    status: "draft" | "pending" | "approved" | "rejected" | "released";
    note?: string;
    actorId?: string;
    actorName?: string;
    actorEmail?: string;
    decidedAt: string;
  }>;
  releasedAt?: string;
  notes?: string;
};

type GrantSummary = {
  id: string;
  name: string;
  fundingAgency?: string;
  sanctionNumber?: string;
  currency: string;
  totalSanctionedAmount: number;
  totalReleased: number;
  pendingAmount: number;
  utilisation: number;
  startDate?: string;
  endDate?: string;
};

type CatalogPayload = {
  ok: boolean;
  grant: GrantSummary | null;
  disbursements: Disbursement[];
  milestones: OnboardingMilestonePlanSnapshot | null;
  error?: string;
};

type RequestDisbursementPayload = {
  ok: boolean;
  disbursement?: Disbursement;
  disbursements?: Disbursement[];
  error?: string;
};

type UpdateStatusPayload = {
  ok: boolean;
  disbursement?: Disbursement;
  disbursements?: Disbursement[];
  error?: string;
};

type MilestoneSelectOption = {
  value: string;
  label: string;
  status: OnboardingMilestoneStatus;
};

const STATUS_LABELS: Record<Disbursement["status"], string> = {
  draft: "Draft",
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  released: "Released",
};

const STATUS_BADGE_CLASS: Record<Disbursement["status"], string> = {
  draft: "border-slate-700 bg-slate-900/70 text-slate-300",
  pending: "border-amber-500/60 bg-amber-500/10 text-amber-200",
  approved: "border-blue-500/60 bg-blue-500/10 text-blue-200",
  rejected: "border-red-500/60 bg-red-500/10 text-red-200",
  released: "border-emerald-500/60 bg-emerald-500/10 text-emerald-200",
};

const currencyFormat = (value: number, currency = "INR") => {
  if (!Number.isFinite(value)) return "—";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return value.toLocaleString();
  }
};

const dateFormat = (value?: string) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

export default function StartupGrantsPage() {
  const params = useParams();
  const startupIdParam = params?.startupId;
  const startupId = Array.isArray(startupIdParam) ? startupIdParam[0] : startupIdParam;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [grant, setGrant] = useState<GrantSummary | null>(null);
  const [disbursements, setDisbursements] = useState<Disbursement[]>([]);
  const [milestones, setMilestones] = useState<OnboardingMilestonePlanSnapshot | null>(null);
  const [requestForm, setRequestForm] = useState({
    grantId: "",
    amount: "",
    milestoneId: "",
    targetReleaseDate: "",
    tranche: "",
    reference: "",
    notes: "",
  });
  const [submittingRequest, setSubmittingRequest] = useState(false);
  const [updatingDisbursementId, setUpdatingDisbursementId] = useState<string | null>(null);
  const [statusDrafts, setStatusDrafts] = useState<Record<string, Disbursement["status"]>>({});
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!startupId) {
      setError("Missing startup id");
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    fetch(`/api/protected/grants/${startupId}/disbursements`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) {
          throw new Error("Unable to load grant disbursements");
        }
        return (await res.json()) as CatalogPayload;
      })
      .then((payload) => {
        if (!payload.ok) {
          throw new Error(payload.error ?? "Unable to load grant data");
        }
        if (!payload.grant) {
          throw new Error("Grant catalog not configured for this startup");
        }
        setGrant(payload.grant);
        setDisbursements(payload.disbursements ?? []);
        setMilestones(payload.milestones ?? null);
        setRequestForm((prev) => ({
          ...prev,
          grantId: payload.grant?.id ?? prev.grantId ?? "",
        }));
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Unable to fetch grant data");
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [startupId]);

  const milestoneOptions: MilestoneSelectOption[] = useMemo(() => {
    if (!milestones) return [];
    return milestones.milestones.map((entry) => ({
      value: entry.id,
      label: entry.title,
      status: entry.status,
    }));
  }, [milestones]);

  const handleRequestInputChange = (field: keyof typeof requestForm, value: string) => {
    setRequestForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const parseAmount = (value: string): number | null => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      return null;
    }
    return numeric;
  };

  const handleSubmitRequest = async () => {
    if (!grant || !startupId) return;

    const amount = parseAmount(requestForm.amount);
    if (amount === null) {
      setError("Enter a valid amount greater than zero");
      return;
    }

    setSubmittingRequest(true);
    setError(null);

    try {
      const res = await fetch(`/api/protected/grants/${startupId}/disbursements`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          grantId: requestForm.grantId || grant.id,
          amount,
          milestoneId: requestForm.milestoneId || undefined,
          targetReleaseDate: requestForm.targetReleaseDate || undefined,
          tranche: requestForm.tranche || undefined,
          reference: requestForm.reference || undefined,
          notes: requestForm.notes || undefined,
        }),
      });

      const payload = (await res.json()) as RequestDisbursementPayload;
      if (!res.ok || !payload.ok) {
        throw new Error(payload.error ?? "Unable to request disbursement");
      }

      setDisbursements((prev) => {
        if (payload.disbursements) return payload.disbursements;
        if (payload.disbursement) return [payload.disbursement, ...prev];
        return prev;
      });
      setRequestForm({
        grantId: grant.id,
        amount: "",
        milestoneId: "",
        targetReleaseDate: "",
        tranche: "",
        reference: "",
        notes: "",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to request disbursement");
    } finally {
      setSubmittingRequest(false);
    }
  };

  const handleStatusDraftChange = (disbursementId: string, status: Disbursement["status"]) => {
    setStatusDrafts((prev) => ({
      ...prev,
      [disbursementId]: status,
    }));
  };

  const handleNoteDraftChange = (disbursementId: string, note: string) => {
    setNoteDrafts((prev) => ({
      ...prev,
      [disbursementId]: note,
    }));
  };

  const handleUpdateStatus = async (disbursementId: string) => {
    if (!startupId) return;
    const status = statusDrafts[disbursementId];
    if (!status) {
      setError("Select a status to update");
      return;
    }

    setUpdatingDisbursementId(disbursementId);
    setError(null);

    try {
      const res = await fetch(`/api/protected/grants/${startupId}/disbursements`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          disbursementId,
          status,
          note: noteDrafts[disbursementId] || undefined,
        }),
      });

      const payload = (await res.json()) as UpdateStatusPayload;
      if (!res.ok || !payload.ok) {
        throw new Error(payload.error ?? "Unable to update disbursement");
      }

      if (payload.disbursements) {
        setDisbursements(payload.disbursements);
      } else if (payload.disbursement) {
        setDisbursements((prev) =>
          prev.map((entry) => (entry.id === disbursementId ? payload.disbursement! : entry)),
        );
      }

      setStatusDrafts((prev) => ({
        ...prev,
        [disbursementId]: status,
      }));
      setNoteDrafts((prev) => ({
        ...prev,
        [disbursementId]: "",
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update disbursement");
    } finally {
      setUpdatingDisbursementId(null);
    }
  };

  if (!startupId) {
    return (
      <main className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="text-sm text-red-200">Missing startup reference. Navigate via submissions.</p>
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
        Loading grant disbursements…
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

  if (!grant) {
    return (
      <main className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="text-sm text-red-200">Grant catalog not configured for this startup.</p>
        <Link
          href="/protected/onboarding/startups"
          className="rounded-full border border-blue-500/70 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-blue-200 transition hover:bg-blue-500/10"
        >
          Back to onboarding
        </Link>
      </main>
    );
  }

  const currency = grant.currency ?? "INR";
  const statusOptions: Array<{ value: Disbursement["status"]; label: string }> = [
    { value: "draft", label: "Draft" },
    { value: "pending", label: "Pending" },
    { value: "approved", label: "Approved" },
    { value: "rejected", label: "Rejected" },
    { value: "released", label: "Released" },
  ];

  return (
    <main className="space-y-8 p-8">
      <header className="flex flex-col gap-4 rounded-2xl border border-slate-800/80 bg-slate-950/60 p-6 shadow-xl shadow-blue-900/20">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-blue-400/80">
              Grant disbursements
            </p>
            <h1 className="text-3xl font-bold text-slate-100">{grant.name}</h1>
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
              {grant.fundingAgency && (
                <span className="rounded-full border border-slate-800 px-3 py-1">
                  {grant.fundingAgency}
                </span>
              )}
              {grant.sanctionNumber && (
                <span className="rounded-full border border-slate-800 px-3 py-1">
                  Sanction {grant.sanctionNumber}
                </span>
              )}
              {grant.startDate && (
                <span className="rounded-full border border-slate-800 px-3 py-1">
                  {dateFormat(grant.startDate)} – {dateFormat(grant.endDate)}
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/protected/grants/financials"
              className="rounded-full border border-slate-700 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-300 transition hover:bg-slate-900/70"
            >
              Incubator overview
            </Link>
            <Link
              href={`/protected/onboarding/startups/${startupId}`}
              className="rounded-full border border-blue-500/70 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-blue-200 transition hover:bg-blue-500/10"
            >
              Workspace
            </Link>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Sanctioned</p>
            <p className="mt-2 text-2xl font-semibold text-slate-100">
              {currencyFormat(grant.totalSanctionedAmount, currency)}
            </p>
          </div>
          <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/5 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-300">Released</p>
            <p className="mt-2 text-2xl font-semibold text-emerald-100">
              {currencyFormat(grant.totalReleased, currency)}
            </p>
          </div>
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-300">Pending</p>
            <p className="mt-2 text-2xl font-semibold text-amber-100">
              {currencyFormat(grant.pendingAmount, currency)}
            </p>
          </div>
          <div className="rounded-xl border border-blue-500/40 bg-blue-500/5 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-200">Utilisation</p>
            <p className="mt-2 text-2xl font-semibold text-blue-100">{grant.utilisation.toFixed(1)}%</p>
          </div>
        </div>
      </header>

      <section className="space-y-5 rounded-2xl border border-slate-800/70 bg-slate-950/60 p-6">
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-100">Request disbursement</h2>
            <p className="text-sm text-slate-400">
              Submit a new tranche release request tied to a milestone. All requests start as pending and can be
              approved, rejected, or marked released once funds are transferred.
            </p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Amount
            <input
              value={requestForm.amount}
              onChange={(event) => handleRequestInputChange("amount", event.target.value)}
              placeholder="e.g. 500000"
              className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Target release date
            <input
              type="date"
              value={requestForm.targetReleaseDate}
              onChange={(event) => handleRequestInputChange("targetReleaseDate", event.target.value)}
              className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Milestone (optional)
            <select
              value={requestForm.milestoneId}
              onChange={(event) => handleRequestInputChange("milestoneId", event.target.value)}
              className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none"
            >
              <option value="">Unassigned</option>
              {milestoneOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Tranche label
            <input
              value={requestForm.tranche}
              onChange={(event) => handleRequestInputChange("tranche", event.target.value)}
              placeholder="e.g. Tranche 2"
              className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Reference number
            <input
              value={requestForm.reference}
              onChange={(event) => handleRequestInputChange("reference", event.target.value)}
              placeholder="Internal ref"
              className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Notes
            <input
              value={requestForm.notes}
              onChange={(event) => handleRequestInputChange("notes", event.target.value)}
              placeholder="Context for finance team"
              className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
            />
          </label>
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleSubmitRequest}
            disabled={submittingRequest}
            className="rounded-full border border-emerald-500/70 px-5 py-2 text-xs font-semibold uppercase tracking-wide text-emerald-200 transition hover:bg-emerald-500/10 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submittingRequest ? "Submitting…" : "Submit request"}
          </button>
        </div>
      </section>

      <section className="space-y-5 rounded-2xl border border-slate-800/70 bg-slate-950/60 p-6">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-100">Disbursement history</h2>
            <p className="text-sm text-slate-400">
              Track approval status and fund releases. Update status as approvals progress or funds are transferred.
            </p>
          </div>
          <div className="text-xs text-slate-500">
            {disbursements.length} record{disbursements.length === 1 ? "" : "s"}
          </div>
        </div>

        {disbursements.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-800/60 bg-slate-950/40 p-6 text-sm text-slate-300">
            No disbursements recorded yet.
          </div>
        ) : (
          <div className="space-y-4">
            {disbursements.map((entry) => {
              const badgeClass = STATUS_BADGE_CLASS[entry.status] ?? STATUS_BADGE_CLASS.draft;
              const currentStatus = statusDrafts[entry.id] ?? entry.status;
              const noteDraft = noteDrafts[entry.id] ?? "";

              return (
                <article
                  key={entry.id}
                  className="space-y-4 rounded-2xl border border-slate-800/80 bg-slate-950/60 p-5 shadow-inner shadow-blue-900/10"
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-3">
                        <h3 className="text-xl font-semibold text-slate-100">
                          {entry.tranche ?? `Disbursement ${entry.id.slice(0, 8)}`}
                        </h3>
                        <span
                          className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-wide ${badgeClass}`}
                        >
                          {STATUS_LABELS[entry.status]}
                        </span>
                        <span className="rounded-full border border-slate-800 px-3 py-1 text-sm text-slate-200">
                          {currencyFormat(entry.amount, currency)}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
                        <span className="rounded-full border border-slate-800 px-3 py-1">
                          Requested {dateFormat(entry.requestedAt ?? entry.date)}
                        </span>
                        {entry.targetReleaseDate && (
                          <span className="rounded-full border border-slate-800 px-3 py-1">
                            Target {dateFormat(entry.targetReleaseDate)}
                          </span>
                        )}
                        {entry.releasedAt && (
                          <span className="rounded-full border border-emerald-500/60 px-3 py-1 text-emerald-200">
                            Released {dateFormat(entry.releasedAt)}
                          </span>
                        )}
                        {entry.reference && (
                          <span className="rounded-full border border-slate-800 px-3 py-1">
                            Ref {entry.reference}
                          </span>
                        )}
                        {entry.milestoneId && (
                          <span className="rounded-full border border-slate-800 px-3 py-1">
                            Milestone {entry.milestoneId}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
                      <label className="flex items-center gap-2">
                        <span>Status</span>
                        <select
                          value={currentStatus}
                          onChange={(event) => handleStatusDraftChange(entry.id, event.target.value as Disbursement["status"])}
                          className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-100 focus:border-blue-500 focus:outline-none"
                        >
                          {statusOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        type="button"
                        onClick={() => handleUpdateStatus(entry.id)}
                        disabled={updatingDisbursementId === entry.id}
                        className="rounded-full border border-blue-500/70 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-blue-200 transition hover:bg-blue-500/10 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {updatingDisbursementId === entry.id ? "Updating…" : "Update"}
                      </button>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Update note
                      <textarea
                        value={noteDraft}
                        onChange={(event) => handleNoteDraftChange(entry.id, event.target.value)}
                        rows={3}
                        placeholder="Add approval context, release reference, or rejection reason"
                        className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
                      />
                    </label>
                    <div className="space-y-2 rounded-xl border border-slate-800/80 bg-slate-950/40 p-4 text-xs text-slate-300">
                      <p className="font-semibold text-slate-200">Approval trail</p>
                      {entry.approvals.length === 0 ? (
                        <p>No approvals captured.</p>
                      ) : (
                        <ul className="space-y-2">
                          {entry.approvals.map((approval) => (
                            <li key={approval.id} className="rounded-lg border border-slate-800/70 bg-slate-950/40 p-3">
                              <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-wide text-slate-500">
                                <span>{approval.status.toUpperCase()}</span>
                                <span>·</span>
                                <span>{dateFormat(approval.decidedAt)}</span>
                                {approval.actorName && (
                                  <span>· {approval.actorName}</span>
                                )}
                              </div>
                              {approval.note && (
                                <p className="mt-2 text-xs text-slate-300">{approval.note}</p>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
