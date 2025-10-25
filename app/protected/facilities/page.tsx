"use client";

import { useEffect, useMemo, useState } from "react";

type FacilityResource = {
  id: string;
  type: string;
  name: string;
  location?: string;
  capacity?: number;
  description?: string;
  tags?: string[];
  availability?: Array<{
    day: string;
    startTime: string;
    endTime: string;
  }>;
};

type FacilityBooking = {
  id: string;
  resourceId: string;
  title: string;
  description?: string;
  startTime: string;
  endTime: string;
  status: string;
};

type FacilityUtilisationSummary = {
  resourceId: string;
  resourceName: string;
  resourceType: string;
  totalBookings: number;
  totalBookedHours: number;
  totalAvailableHours: number;
  averageBookingHours: number;
  idleHours: number;
  utilisationRate: number;
  peakUsageHour?: {
    hour: string;
    bookings: number;
  };
};

type FacilityAnalyticsOverview = {
  range: {
    start: string;
    end: string;
  };
  summaries: FacilityUtilisationSummary[];
  peakHours: Array<{ hour: string; bookings: number }>;
  busiestResources: FacilityUtilisationSummary[];
  idleResources: FacilityUtilisationSummary[];
};

const RESOURCE_LABELS: Record<string, string> = {
  meeting_room: "Meeting Room",
  lab: "R&D Lab",
  equipment: "Specialised Equipment",
  other: "Other",
};

const formatDateTime = (iso: string): string => {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
};

const formatPercent = (value: number): string => {
  if (!Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(1)}%`;
};

const formatHours = (value: number): string => {
  if (!Number.isFinite(value)) return "—";
  return `${value.toFixed(1)}h`;
};

const useFacilityData = () => {
  const [resources, setResources] = useState<FacilityResource[]>([]);
  const [loadingResources, setLoadingResources] = useState(true);
  const [resourceError, setResourceError] = useState<string | null>(null);

  const refresh = () => {
    setLoadingResources(true);
    fetch("/api/protected/facilities/resources")
      .then(async (res) => {
        if (!res.ok) {
          throw new Error("Unable to load resources");
        }
        return (await res.json()) as { ok: boolean; resources?: FacilityResource[]; error?: string };
      })
      .then((payload) => {
        if (!payload.ok || !payload.resources) {
          setResourceError(payload.error ?? "Unable to load resources");
          return;
        }
        setResources(payload.resources);
        setResourceError(null);
      })
      .catch(() => {
        setResourceError("Unable to load resources");
      })
      .finally(() => {
        setLoadingResources(false);
      });
  };

  useEffect(() => {
    refresh();
  }, []);

  return { resources, loadingResources, resourceError, refresh };
};

const useResourceBookings = (resourceId: string | undefined, refreshToken: number) => {
  const [bookings, setBookings] = useState<FacilityBooking[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!resourceId) {
      setBookings([]);
      return;
    }

    let cancelled = false;
    const load = () => {
      setLoading(true);
      fetch(`/api/protected/facilities/resources/${resourceId}/bookings?start=${encodeURIComponent(new Date().toISOString())}`)
        .then(async (res) => {
          if (!res.ok) {
            throw new Error("Unable to load bookings");
          }
          return (await res.json()) as { ok: boolean; bookings?: FacilityBooking[]; error?: string };
        })
        .then((payload) => {
          if (cancelled) {
            return;
          }
          if (!payload.ok || !payload.bookings) {
            setError(payload.error ?? "Unable to load bookings");
            return;
          }
          setBookings(payload.bookings);
          setError(null);
        })
        .catch(() => {
          if (!cancelled) {
            setError("Unable to load bookings");
          }
        })
        .finally(() => {
          if (!cancelled) {
            setLoading(false);
          }
        });
    };

    load();
    const interval = window.setInterval(load, 30_000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [resourceId, refreshToken]);

  return { bookings, loading, error };
};

const usePendingApprovals = (refreshToken: number) => {
  const [pending, setPending] = useState<FacilityBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch("/api/protected/facilities/bookings?status=pending&limit=50")
      .then(async (res) => {
        if (!res.ok) {
          throw new Error("Unable to load pending approvals");
        }
        return (await res.json()) as { ok: boolean; bookings?: FacilityBooking[]; error?: string };
      })
      .then((payload) => {
        if (cancelled) {
          return;
        }
        if (!payload.ok || !payload.bookings) {
          setError(payload.error ?? "Unable to load pending approvals");
          setPending([]);
          return;
        }
        setPending(payload.bookings);
      })
      .catch((fetchError) => {
        if (!cancelled) {
          setError(fetchError instanceof Error ? fetchError.message : "Unable to load pending approvals");
          setPending([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [refreshToken]);

  return { pending, loading, error };
};

const useFacilityAnalytics = (refreshToken: number) => {
  const [analytics, setAnalytics] = useState<FacilityAnalyticsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch("/api/protected/facilities/analytics")
      .then(async (res) => {
        if (!res.ok) {
          throw new Error("Unable to load utilisation analytics");
        }
        return (await res.json()) as { ok: boolean; analytics?: FacilityAnalyticsOverview; error?: string };
      })
      .then((payload) => {
        if (cancelled) {
          return;
        }
        if (!payload.ok || !payload.analytics) {
          setError(payload.error ?? "Unable to load utilisation analytics");
          setAnalytics(null);
          return;
        }
        setAnalytics(payload.analytics);
      })
      .catch((fetchError) => {
        if (!cancelled) {
          setError(fetchError instanceof Error ? fetchError.message : "Unable to load utilisation analytics");
          setAnalytics(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [refreshToken]);

  return { analytics, loading, error };
};

type BookingFormState = {
  title: string;
  description: string;
  startTime: string;
  endTime: string;
  participants: string;
};

const initialFormState: BookingFormState = {
  title: "",
  description: "",
  startTime: "",
  endTime: "",
  participants: "",
};

export default function FacilitiesPage() {
  const { resources, loadingResources, resourceError, refresh } = useFacilityData();
  const [selectedResourceId, setSelectedResourceId] = useState<string | undefined>(undefined);
  const [formState, setFormState] = useState<BookingFormState>({ ...initialFormState });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const [analyticsTrigger, setAnalyticsTrigger] = useState(0);
  const { pending, loading: loadingPending, error: pendingError } = usePendingApprovals(refreshToken);
  const { analytics, loading: loadingAnalytics, error: analyticsError } = useFacilityAnalytics(analyticsTrigger);
  const [approvalMessage, setApprovalMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [reviewingKey, setReviewingKey] = useState<string | null>(null);
  const [cancellingBookingId, setCancellingBookingId] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedResourceId && resources.length > 0) {
      setSelectedResourceId(resources[0].id);
    }
  }, [resources, selectedResourceId]);

  const { bookings, loading: loadingBookings, error: bookingsError } = useResourceBookings(selectedResourceId, refreshToken);

  const selectedResource = useMemo(
    () => resources.find((resource) => resource.id === selectedResourceId),
    [resources, selectedResourceId],
  );

  const resourceLookup = useMemo(() => {
    const map = new Map<string, FacilityResource>();
    resources.forEach((resource) => map.set(resource.id, resource));
    return map;
  }, [resources]);

  const analyticsTotals = useMemo(() => {
    if (!analytics) {
      return null;
    }

    const totalResources = analytics.summaries.length;
    const totalBookings = analytics.summaries.reduce((acc, summary) => acc + summary.totalBookings, 0);
    const totalBookedHours = analytics.summaries.reduce((acc, summary) => acc + summary.totalBookedHours, 0);
    const totalAvailableHours = analytics.summaries.reduce((acc, summary) => acc + summary.totalAvailableHours, 0);
    const averageUtilisation = totalAvailableHours > 0 ? totalBookedHours / totalAvailableHours : 0;
    const peakHour = analytics.peakHours.reduce<{ hour: string; bookings: number } | null>((best, entry) => {
      if (!best || entry.bookings > best.bookings) {
        return entry;
      }
      return best;
    }, null);

    return { totalResources, totalBookings, averageUtilisation, peakHour };
  }, [analytics]);

  const bumpDataRefresh = () => {
    setRefreshToken((value) => value + 1);
    setAnalyticsTrigger((value) => value + 1);
  };

  const typeLabel = selectedResource ? RESOURCE_LABELS[selectedResource.type] ?? "Resource" : "Resource";

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedResourceId) {
      setSubmitError("Choose a resource before booking");
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    setSuccessMessage(null);
    setApprovalMessage(null);

    const participants = formState.participants
      ? formState.participants.split(",").map((item) => item.trim()).filter((item) => item.length > 0)
      : undefined;

    try {
      const response = await fetch("/api/protected/facilities/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resourceId: selectedResourceId,
          title: formState.title,
          description: formState.description || undefined,
          startTime: formState.startTime,
          endTime: formState.endTime,
          participants,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Unable to create booking");
      }

      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean;
        booking?: FacilityBooking;
        error?: string;
      } | null;

      if (!payload?.ok || !payload.booking) {
        throw new Error(payload?.error ?? "Unable to create booking");
      }

      setFormState({ ...initialFormState });
      const pendingStatus = payload.booking.status === "pending";
      setSuccessMessage(pendingStatus ? "Booking submitted for approval" : "Booking confirmed");
      bumpDataRefresh();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Unable to create booking");
    } finally {
      setSubmitting(false);
    }
  };

  const cancelBooking = async (bookingId: string) => {
    setCancellingBookingId(bookingId);
    setApprovalMessage(null);
    try {
      const response = await fetch(`/api/protected/facilities/bookings/${bookingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Cancelled via dashboard" }),
      });

      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean;
        booking?: FacilityBooking;
        error?: string;
      } | null;

      if (!response.ok || !payload?.ok || !payload.booking) {
        throw new Error(payload?.error ?? "Unable to cancel booking");
      }

      setApprovalMessage({ type: "success", text: "Booking cancelled" });
      bumpDataRefresh();
    } catch (error) {
      setApprovalMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Unable to cancel booking",
      });
    } finally {
      setCancellingBookingId(null);
    }
  };

  const reviewPendingBooking = async (bookingId: string, decision: "approve" | "reject") => {
    const actionKey = `${bookingId}:${decision}`;
    setReviewingKey(actionKey);
    setApprovalMessage(null);

    try {
      const response = await fetch(`/api/protected/facilities/bookings/${bookingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: decision }),
      });

      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean;
        booking?: FacilityBooking;
        error?: string;
      } | null;

      if (!response.ok || !payload?.ok || !payload.booking) {
        throw new Error(payload?.error ?? "Unable to update booking approval");
      }

      setApprovalMessage({
        type: "success",
        text: decision === "approve" ? "Booking approved" : "Booking rejected",
      });
      bumpDataRefresh();
    } catch (error) {
      setApprovalMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Unable to update booking approval",
      });
    } finally {
      setReviewingKey(null);
    }
  };

  return (
    <section className="flex flex-col gap-6 p-6 lg:p-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-gray-900">Facilities & Resources</h1>
        <p className="text-sm text-gray-500">
          Reserve meeting rooms, R&D labs, and specialised equipment in real time.
        </p>
        <div className="flex items-center gap-3 text-xs text-gray-400">
          <button
            type="button"
            onClick={refresh}
            className="rounded-full border border-gray-200 px-3 py-1 font-medium text-gray-600 transition hover:border-blue-500 hover:text-blue-600"
          >
            Refresh resources
          </button>
        </div>
      </header>

      {resourceError && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{resourceError}</div>
      )}

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <aside className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Resources</h2>
          <div className="mt-3 flex flex-col gap-2">
            {loadingResources && (
              <p className="text-sm text-gray-400">Loading resources...</p>
            )}
            {!loadingResources && resources.length === 0 && (
              <p className="text-sm text-gray-400">No facilities registered yet.</p>
            )}
            {resources.map((resource) => {
              const isSelected = resource.id === selectedResourceId;
              return (
                <button
                  key={resource.id}
                  type="button"
                  onClick={() => setSelectedResourceId(resource.id)}
                  className={`rounded-xl border px-3 py-2 text-left transition ${
                    isSelected
                      ? "border-blue-500 bg-blue-50 text-blue-700"
                      : "border-transparent bg-gray-50 text-gray-700 hover:border-gray-200 hover:bg-gray-100"
                  }`}
                >
                  <span className="block text-sm font-semibold">
                    {resource.name}
                  </span>
                  <span className="block text-xs text-gray-500">
                    {RESOURCE_LABELS[resource.type] ?? "Resource"}
                    {resource.location ? ` • ${resource.location}` : ""}
                  </span>
                  {typeof resource.capacity === "number" && (
                    <span className="block text-xs text-gray-400">Capacity {resource.capacity}</span>
                  )}
                </button>
              );
            })}
          </div>
        </aside>

        <main className="flex flex-col gap-6">
          {approvalMessage && (
            <div
              className={`rounded-2xl border p-4 text-sm ${
                approvalMessage.type === "success"
                  ? "border-green-200 bg-green-50 text-green-700"
                  : "border-red-200 bg-red-50 text-red-700"
              }`}
            >
              {approvalMessage.text}
            </div>
          )}

          <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <header className="mb-4 flex flex-col gap-1">
              <h2 className="text-lg font-semibold text-gray-900">Pending approvals</h2>
              <p className="text-sm text-gray-500">Review booking requests that require an approval decision.</p>
            </header>

            {pendingError && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{pendingError}</div>
            )}

            {loadingPending && (
              <p className="text-sm text-gray-400">Loading pending approvals...</p>
            )}

            {!loadingPending && pending.length === 0 && !pendingError && (
              <p className="text-sm text-gray-400">No pending approvals right now. You&apos;re all caught up.</p>
            )}

            {!loadingPending && pending.length > 0 && (
              <ul className="flex flex-col gap-3">
                {pending.map((booking) => {
                  const resource = resourceLookup.get(booking.resourceId);
                  const approveKey = `${booking.id}:approve`;
                  const rejectKey = `${booking.id}:reject`;
                  const isApproving = reviewingKey === approveKey;
                  const isRejecting = reviewingKey === rejectKey;
                  return (
                    <li key={booking.id} className="flex flex-col gap-3 rounded-xl border border-gray-200 p-4">
                      <div className="flex flex-col gap-1">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold text-gray-900">{booking.title}</p>
                            <p className="text-xs text-gray-500">{formatDateTime(booking.startTime)} → {formatDateTime(booking.endTime)}</p>
                          </div>
                          <span className="rounded-full bg-yellow-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-yellow-700">
                            Pending
                          </span>
                        </div>
                        <p className="text-xs text-gray-500">
                          {resource ? `${resource.name} • ${RESOURCE_LABELS[resource.type] ?? "Resource"}` : "Unknown resource"}
                        </p>
                        {booking.description && <p className="text-sm text-gray-500">{booking.description}</p>}
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => reviewPendingBooking(booking.id, "approve")}
                          disabled={isApproving || isRejecting}
                          className="inline-flex items-center justify-center rounded-lg bg-green-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-green-500 disabled:cursor-not-allowed disabled:bg-green-200"
                        >
                          {isApproving ? "Approving..." : "Approve"}
                        </button>
                        <button
                          type="button"
                          onClick={() => reviewPendingBooking(booking.id, "reject")}
                          disabled={isApproving || isRejecting}
                          className="inline-flex items-center justify-center rounded-lg border border-red-300 px-3 py-2 text-xs font-semibold text-red-600 transition hover:border-red-400 hover:bg-red-50 disabled:cursor-not-allowed disabled:border-red-200 disabled:text-red-300"
                        >
                          {isRejecting ? "Rejecting..." : "Reject"}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <header className="mb-4 flex flex-col gap-1">
              <h2 className="text-lg font-semibold text-gray-900">Utilisation analytics</h2>
              <p className="text-sm text-gray-500">Track how facilities are being used across the hub.</p>
            </header>

            {analyticsError && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{analyticsError}</div>
            )}

            {loadingAnalytics && (
              <p className="text-sm text-gray-400">Loading utilisation insights...</p>
            )}

            {!loadingAnalytics && analytics && (
              <div className="flex flex-col gap-4">
                <p className="text-xs text-gray-500">
                  Range: {formatDateTime(analytics.range.start)} → {formatDateTime(analytics.range.end)}
                </p>

                {analyticsTotals && (
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                      <p className="text-xs uppercase tracking-wide text-gray-500">Tracked resources</p>
                      <p className="mt-2 text-2xl font-semibold text-gray-900">{analyticsTotals.totalResources}</p>
                    </div>
                    <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                      <p className="text-xs uppercase tracking-wide text-gray-500">Total bookings</p>
                      <p className="mt-2 text-2xl font-semibold text-gray-900">{analyticsTotals.totalBookings}</p>
                    </div>
                    <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                      <p className="text-xs uppercase tracking-wide text-gray-500">Average utilisation</p>
                      <p className="mt-2 text-2xl font-semibold text-gray-900">{formatPercent(analyticsTotals.averageUtilisation)}</p>
                    </div>
                    <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                      <p className="text-xs uppercase tracking-wide text-gray-500">Peak hour</p>
                      <p className="mt-2 text-sm font-semibold text-gray-900">
                        {analyticsTotals.peakHour
                          ? `${analyticsTotals.peakHour.hour} (${analyticsTotals.peakHour.bookings} bookings)`
                          : "—"}
                      </p>
                    </div>
                  </div>
                )}

                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="flex flex-col gap-3 rounded-xl border border-gray-100 p-4">
                    <h3 className="text-sm font-semibold text-gray-900">Busiest resources</h3>
                    {analytics.busiestResources.length === 0 && (
                      <p className="text-sm text-gray-400">No utilisation data yet.</p>
                    )}
                    {analytics.busiestResources.length > 0 && (
                      <ul className="flex flex-col gap-2">
                        {analytics.busiestResources.slice(0, 3).map((summary) => (
                          <li key={summary.resourceId} className="flex items-center justify-between rounded-lg bg-white px-3 py-2 text-sm text-gray-700 shadow-sm">
                            <div className="flex flex-col">
                              <span className="font-semibold text-gray-900">{summary.resourceName}</span>
                              <span className="text-xs text-gray-500">
                                {RESOURCE_LABELS[summary.resourceType] ?? summary.resourceType} • {formatHours(summary.totalBookedHours)} booked
                              </span>
                            </div>
                            <span className="text-xs font-semibold text-green-600">{formatPercent(summary.utilisationRate)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="flex flex-col gap-3 rounded-xl border border-gray-100 p-4">
                    <h3 className="text-sm font-semibold text-gray-900">Under-utilised</h3>
                    {analytics.idleResources.length === 0 && (
                      <p className="text-sm text-gray-400">All resources are in use.</p>
                    )}
                    {analytics.idleResources.length > 0 && (
                      <ul className="flex flex-col gap-2">
                        {analytics.idleResources.slice(0, 3).map((summary) => (
                          <li key={summary.resourceId} className="flex items-center justify-between rounded-lg bg-white px-3 py-2 text-sm text-gray-700 shadow-sm">
                            <div className="flex flex-col">
                              <span className="font-semibold text-gray-900">{summary.resourceName}</span>
                              <span className="text-xs text-gray-500">
                                {RESOURCE_LABELS[summary.resourceType] ?? summary.resourceType} • {formatHours(summary.idleHours)} idle
                              </span>
                            </div>
                            <span className="text-xs font-semibold text-gray-500">{formatPercent(summary.utilisationRate)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </div>
            )}

            {!loadingAnalytics && !analytics && !analyticsError && (
              <p className="text-sm text-gray-400">No utilisation data captured yet.</p>
            )}
          </section>

          {selectedResource ? (
            <div className="flex flex-col gap-6">
              <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                <header className="mb-4 flex flex-col gap-1">
                  <h2 className="text-xl font-semibold text-gray-900">Book {typeLabel.toLowerCase()}</h2>
                  <p className="text-sm text-gray-500">Create a reservation for {selectedResource.name}.</p>
                </header>

                <form className="grid gap-4" onSubmit={handleSubmit}>
                  <div className="grid gap-2">
                    <label className="text-sm font-medium text-gray-700" htmlFor="title">
                      Purpose / title
                    </label>
                    <input
                      id="title"
                      name="title"
                      value={formState.title}
                      onChange={(event) => setFormState((current) => ({ ...current, title: event.target.value }))}
                      className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                      placeholder="Team sync with investors"
                      required
                    />
                  </div>

                  <div className="grid gap-2">
                    <label className="text-sm font-medium text-gray-700" htmlFor="description">
                      Description
                    </label>
                    <textarea
                      id="description"
                      name="description"
                      value={formState.description}
                      onChange={(event) => setFormState((current) => ({ ...current, description: event.target.value }))}
                      className="min-h-[80px] rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                      placeholder="Add agenda or equipment needs"
                    />
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="grid gap-2">
                      <label className="text-sm font-medium text-gray-700" htmlFor="startTime">
                        Start time
                      </label>
                      <input
                        id="startTime"
                        type="datetime-local"
                        value={formState.startTime}
                        onChange={(event) => setFormState((current) => ({ ...current, startTime: event.target.value }))}
                        className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                        required
                      />
                    </div>
                    <div className="grid gap-2">
                      <label className="text-sm font-medium text-gray-700" htmlFor="endTime">
                        End time
                      </label>
                      <input
                        id="endTime"
                        type="datetime-local"
                        value={formState.endTime}
                        onChange={(event) => setFormState((current) => ({ ...current, endTime: event.target.value }))}
                        className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                        required
                      />
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <label className="text-sm font-medium text-gray-700" htmlFor="participants">
                      Participants (comma separated emails)
                    </label>
                    <input
                      id="participants"
                      name="participants"
                      value={formState.participants}
                      onChange={(event) => setFormState((current) => ({ ...current, participants: event.target.value }))}
                      className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                      placeholder="founders@startup.com, mentors@example.com"
                    />
                  </div>

                  {submitError && (
                    <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{submitError}</div>
                  )}

                  {successMessage && (
                    <div className="rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-700">{successMessage}</div>
                  )}

                  <button
                    type="submit"
                    disabled={submitting}
                    className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-blue-200"
                  >
                    {submitting ? "Booking..." : "Confirm booking"}
                  </button>
                </form>
              </section>

              <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                <header className="mb-4 flex flex-col gap-1">
                  <h3 className="text-lg font-semibold text-gray-900">Upcoming reservations</h3>
                  <p className="text-sm text-gray-500">Automatically refreshes every 30 seconds.</p>
                </header>

                {bookingsError && (
                  <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{bookingsError}</div>
                )}

                {loadingBookings && (
                  <p className="text-sm text-gray-400">Loading bookings...</p>
                )}

                {!loadingBookings && bookings.length === 0 && (
                  <p className="text-sm text-gray-400">No upcoming bookings for this resource.</p>
                )}

                {!loadingBookings && bookings.length > 0 && (
                  <ul className="flex flex-col gap-3">
                    {bookings.map((booking) => (
                      <li key={booking.id} className="flex flex-col gap-2 rounded-xl border border-gray-200 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold text-gray-900">{booking.title}</p>
                            <p className="text-xs text-gray-500">{formatDateTime(booking.startTime)} → {formatDateTime(booking.endTime)}</p>
                          </div>
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${
                              booking.status === "cancelled"
                                ? "bg-red-50 text-red-600"
                                : booking.status === "completed"
                                ? "bg-green-50 text-green-600"
                                : booking.status === "pending"
                                ? "bg-yellow-50 text-yellow-700"
                                : "bg-blue-50 text-blue-600"
                            }`}
                          >
                            {booking.status}
                          </span>
                        </div>
                        {booking.description && (
                          <p className="text-sm text-gray-500">{booking.description}</p>
                        )}
                        {booking.status !== "cancelled" && booking.status !== "completed" && (
                          <button
                            type="button"
                            onClick={() => cancelBooking(booking.id)}
                            disabled={cancellingBookingId === booking.id}
                            className="self-start rounded-lg border border-gray-300 px-3 py-1 text-xs font-medium text-gray-600 transition hover:border-red-300 hover:text-red-600 disabled:cursor-not-allowed disabled:border-gray-200 disabled:text-gray-400"
                          >
                            {cancellingBookingId === booking.id ? "Cancelling..." : "Cancel booking"}
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-gray-300 p-6 text-sm text-gray-500">
              Select a resource to view availability and create bookings.
            </div>
          )}
        </main>
      </div>
    </section>
  );
}
