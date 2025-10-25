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

  const typeLabel = selectedResource ? RESOURCE_LABELS[selectedResource.type] ?? "Resource" : "Resource";

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedResourceId) {
      setSubmitError("Choose a resource before booking");
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    setSuccessMessage(null);

    const participants = formState.participants
      ? formState.participants.split(",").map((item) => item.trim()).filter((item) => item.length > 0)
      : undefined;

    fetch("/api/protected/facilities/bookings", {
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
    })
      .then(async (res) => {
        if (!res.ok) {
          const payload = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(payload?.error ?? "Unable to create booking");
        }
        return res.json();
      })
      .then(() => {
        setFormState({ ...initialFormState });
        setSuccessMessage("Booking confirmed");
        setRefreshToken((value) => value + 1);
      })
      .catch((error: unknown) => {
        setSubmitError(error instanceof Error ? error.message : "Unable to create booking");
      })
      .finally(() => {
        setSubmitting(false);
      });
  };

  const cancelBooking = (bookingId: string) => {
    fetch(`/api/protected/facilities/bookings/${bookingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "Cancelled via dashboard" }),
    }).finally(() => {
      setRefreshToken((value) => value + 1);
    });
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
                            className="self-start rounded-lg border border-gray-300 px-3 py-1 text-xs font-medium text-gray-600 transition hover:border-red-300 hover:text-red-600"
                          >
                            Cancel booking
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
