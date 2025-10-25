import { prisma } from "@/lib/db/prisma";
import { randomUUID } from "crypto";
import type {
  FacilityResourcePayload,
  FacilityResource,
  FacilityResourceType,
  FacilityBooking,
  FacilityBookingRequest,
  FacilityBookingStatus,
  FacilityBookingPayload,
  FacilityBookingCancellationRequest,
  FacilityBookingListFilters,
  FacilityBookingReviewRequest,
  FacilityUtilisationFilters,
  FacilityAnalyticsOverview,
  FacilityUtilisationSummary,
} from "./types";

const RESOURCE_TYPES: FacilityResourceType[] = ["meeting_room", "lab", "equipment", "other"];

const resourceDelegate = () => {
  const delegate = (prisma as unknown as { facilityResourceRecord?: any }).facilityResourceRecord;
  if (!delegate) {
    throw new Error("FacilityResourceRecord delegate not configured in Prisma client");
  }
  return delegate;
};

const bookingDelegate = () => {
  const delegate = (prisma as unknown as { facilityBookingRecord?: any }).facilityBookingRecord;
  if (!delegate) {
    throw new Error("FacilityBookingRecord delegate not configured in Prisma client");
  }
  return delegate;
};

const isValidResourceType = (value: unknown): value is FacilityResourceType => {
  return typeof value === "string" && RESOURCE_TYPES.includes(value as FacilityResourceType);
};

const ensureIsoString = (value: unknown): string | undefined => {
  if (typeof value !== "string" || value.trim().length === 0) {
    return undefined;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }

  return date.toISOString();
};

const parseParticipants = (value: unknown): string[] | undefined => {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const participants = value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  return participants.length > 0 ? participants : undefined;
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
};

const ensureArray = (value: unknown): unknown[] => {
  return Array.isArray(value) ? value : [];
};

const hoursBetween = (startIso: string, endIso: string): number => {
  const startMs = new Date(startIso).getTime();
  const endMs = new Date(endIso).getTime();
  if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs <= startMs) {
    return 0;
  }
  return (endMs - startMs) / 3_600_000;
};

const normaliseEmail = (value?: string): string | undefined => {
  if (!value || typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed.toLowerCase() : undefined;
};

type ApprovalWorkflowConfig = {
  requiresApproval: boolean;
  approverEmails: string[];
  autoApproveDurationHours?: number;
  autoApproveEmails: string[];
};

const readApprovalWorkflow = (metadata: unknown): ApprovalWorkflowConfig | null => {
  if (!isRecord(metadata)) {
    return null;
  }

  const directFlag = Boolean(metadata.requiresApproval ?? metadata.highValue);
  const workflow = isRecord(metadata.approvalWorkflow)
    ? (metadata.approvalWorkflow as Record<string, unknown>)
    : undefined;
  const requiresApproval = Boolean(workflow?.requiresApproval ?? workflow?.highValue ?? directFlag);

  if (!requiresApproval) {
    return null;
  }

  const approverEmails = ensureArray(workflow?.approverEmails)
    .filter((email): email is string => typeof email === "string" && email.trim().length > 0)
    .map((email) => email.trim().toLowerCase());

  const autoApproveDurationHours =
    typeof workflow?.autoApproveDurationHours === "number" && Number.isFinite(workflow.autoApproveDurationHours)
      ? workflow.autoApproveDurationHours
      : undefined;

  const autoApproveEmails = ensureArray(workflow?.autoApproveEmails)
    .filter((email): email is string => typeof email === "string" && email.trim().length > 0)
    .map((email) => email.trim().toLowerCase());

  return {
    requiresApproval: true,
    approverEmails,
    autoApproveDurationHours,
    autoApproveEmails,
  };
};

const DAY_NAMES = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

type DayName = (typeof DAY_NAMES)[number];

const DEFAULT_DAILY_AVAILABLE_HOURS = 10;

const asDayName = (value: string | undefined): DayName | undefined => {
  if (!value) {
    return undefined;
  }
  const normalised = value.trim().toLowerCase();
  return DAY_NAMES.find((entry) => entry === normalised);
};

const parseTimeToMinutes = (value: string | undefined): number | undefined => {
  if (!value) {
    return undefined;
  }
  const [hoursPart, minutesPart] = value.split(":");
  const hours = Number.parseInt(hoursPart ?? "", 10);
  const minutes = Number.parseInt(minutesPart ?? "0", 10);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return undefined;
  }
  return hours * 60 + minutes;
};

const buildAvailabilityHoursMap = (resource: FacilityResource): Map<DayName, number> => {
  const map = new Map<DayName, number>();
  if (!Array.isArray(resource.availability)) {
    return map;
  }

  resource.availability.forEach((slot) => {
    const day = asDayName(slot.day);
    const startMinutes = parseTimeToMinutes(slot.startTime);
    const endMinutes = parseTimeToMinutes(slot.endTime);
    if (!day || startMinutes === undefined || endMinutes === undefined || endMinutes <= startMinutes) {
      return;
    }
    const hours = (endMinutes - startMinutes) / 60;
    map.set(day, (map.get(day) ?? 0) + hours);
  });

  return map;
};

const countDaysByName = (start: Date, end: Date): Record<DayName, number> => {
  const counts = DAY_NAMES.reduce((acc, day) => ({ ...acc, [day]: 0 }), {} as Record<DayName, number>);
  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);
  const limit = new Date(end);
  limit.setHours(0, 0, 0, 0);

  while (cursor <= limit) {
    const day = DAY_NAMES[cursor.getDay()] as DayName;
    counts[day] += 1;
    cursor.setDate(cursor.getDate() + 1);
  }

  return counts;
};

const clipInterval = (start: Date, end: Date, rangeStart: Date, rangeEnd: Date): { start: Date; end: Date } | null => {
  const clippedStart = Math.max(start.getTime(), rangeStart.getTime());
  const clippedEnd = Math.min(end.getTime(), rangeEnd.getTime());
  if (clippedEnd <= clippedStart) {
    return null;
  }
  return { start: new Date(clippedStart), end: new Date(clippedEnd) };
};

const incrementHourBuckets = (
  start: Date,
  end: Date,
  resourceBucket: Map<string, number>,
  globalBucket: Map<string, number>,
) => {
  const cursor = new Date(start);
  cursor.setMinutes(0, 0, 0);

  while (cursor < end) {
    const bucketStart = new Date(cursor);
    const bucketEnd = new Date(cursor.getTime() + 3_600_000);
    const overlapStart = Math.max(bucketStart.getTime(), start.getTime());
    const overlapEnd = Math.min(bucketEnd.getTime(), end.getTime());

    if (overlapEnd > overlapStart) {
      const hourKey = String(bucketStart.getHours()).padStart(2, "0");
      resourceBucket.set(hourKey, (resourceBucket.get(hourKey) ?? 0) + 1);
      globalBucket.set(hourKey, (globalBucket.get(hourKey) ?? 0) + 1);
    }

    cursor.setHours(cursor.getHours() + 1);
  }
};

const toResource = (record: { id: string; type: string; name: string; location: string | null; capacity: number | null; description: string | null; tags: unknown; availability: unknown; metadata: unknown; createdAt: Date; updatedAt: Date; }): FacilityResource => {
  const availability = Array.isArray(record.availability)
    ? record.availability.filter((slot): slot is { day: string; startTime: string; endTime: string } =>
        slot && typeof slot.day === "string" && typeof slot.startTime === "string" && typeof slot.endTime === "string",
      )
    : undefined;

  const tags = Array.isArray(record.tags)
    ? record.tags.filter((tag): tag is string => typeof tag === "string" && tag.trim().length > 0)
    : undefined;

  return {
    id: record.id,
    type: isValidResourceType(record.type) ? record.type : "other",
    name: record.name,
    location: record.location ?? undefined,
    capacity: record.capacity ?? undefined,
    description: record.description ?? undefined,
    tags,
    availability,
    metadata: (record.metadata ?? undefined) as Record<string, unknown> | undefined,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
};

const toBooking = (record: {
  id: string;
  resourceId: string;
  title: string;
  description: string | null;
  startTime: Date;
  endTime: Date;
  status: string;
  createdBy: string;
  createdByName: string | null;
  createdByEmail: string | null;
  participants: unknown;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}): FacilityBooking => {
  const participants = parseParticipants(record.participants);
  const status = ((): FacilityBookingStatus => {
    if (record.status === "pending" || record.status === "confirmed" || record.status === "completed" || record.status === "cancelled") {
      return record.status;
    }
    return "confirmed";
  })();

  return {
    id: record.id,
    resourceId: record.resourceId,
    title: record.title,
    description: record.description ?? undefined,
    startTime: record.startTime.toISOString(),
    endTime: record.endTime.toISOString(),
    status,
    createdBy: record.createdBy,
    createdByName: record.createdByName ?? undefined,
    createdByEmail: record.createdByEmail ?? undefined,
    participants,
    metadata: (record.metadata ?? undefined) as Record<string, unknown> | undefined,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
};

export const listFacilityResources = async (): Promise<FacilityResource[]> => {
  const records = await resourceDelegate().findMany({
    orderBy: [{ type: "asc" }, { name: "asc" }],
  });

  return records.map(toResource);
};

export const upsertFacilityResource = async (payload: FacilityResourcePayload): Promise<FacilityResource> => {
  if (!isValidResourceType(payload.type)) {
    throw new Error("Invalid facility type provided");
  }

  if (!payload.name || payload.name.trim().length === 0) {
    throw new Error("Facility name is required");
  }

  const tags = Array.isArray(payload.tags)
    ? payload.tags.filter((tag): tag is string => typeof tag === "string" && tag.trim().length > 0)
    : undefined;

  const availability = Array.isArray(payload.availability)
    ? payload.availability.filter(
        (slot): slot is { day: string; startTime: string; endTime: string } =>
          !!slot && typeof slot.day === "string" && typeof slot.startTime === "string" && typeof slot.endTime === "string",
      )
    : undefined;

  const data = {
    type: payload.type,
    name: payload.name.trim(),
    location: payload.location?.trim() ?? null,
    capacity: typeof payload.capacity === "number" ? payload.capacity : null,
    description: payload.description?.trim() ?? null,
    tags: tags ?? null,
    availability: availability ?? null,
    metadata: payload.metadata ?? null,
  };

  const record = payload.id
    ? await resourceDelegate().update({ where: { id: payload.id }, data })
    : await resourceDelegate().create({ data: { ...data, id: randomUUID() } });

  return toResource(record);
};

const validateBookingWindow = (start: string | undefined, end: string | undefined) => {
  const startIso = ensureIsoString(start);
  const endIso = ensureIsoString(end);

  if (!startIso || !endIso) {
    throw new Error("A valid start and end time is required");
  }

  const startMs = new Date(startIso).getTime();
  const endMs = new Date(endIso).getTime();

  if (endMs <= startMs) {
    throw new Error("Booking end time must be after start time");
  }

  return { startIso, endIso };
};

export const createFacilityBooking = async (input: FacilityBookingRequest): Promise<FacilityBooking> => {
  const { startIso, endIso } = validateBookingWindow(input.startTime, input.endTime);

  const resource = await resourceDelegate().findUnique({ where: { id: input.resourceId } });
  if (!resource) {
    throw new Error("Facility resource not found");
  }

  const overlapping = await bookingDelegate().findFirst({
    where: {
      resourceId: input.resourceId,
      status: { in: ["pending", "confirmed"] },
      startTime: { lt: new Date(endIso) },
      endTime: { gt: new Date(startIso) },
    },
  });

  if (overlapping) {
    throw new Error("This time slot is already booked for the selected resource");
  }

  const participants = parseParticipants(input.participants);
  const workflow = readApprovalWorkflow(resource.metadata);
  const nowIso = new Date().toISOString();
  const actorEmail = normaliseEmail(input.actor.email);
  let status: FacilityBookingStatus = "confirmed";
  const bookingDurationHours = hoursBetween(startIso, endIso);

  if (workflow?.requiresApproval) {
    status = "pending";
    const autoApprovedByEmail = Boolean(actorEmail && workflow.autoApproveEmails.includes(actorEmail));
    const autoApprovedByDuration =
      typeof workflow.autoApproveDurationHours === "number"
      && bookingDurationHours <= workflow.autoApproveDurationHours + Number.EPSILON;

    if (autoApprovedByEmail || autoApprovedByDuration) {
      status = "confirmed";
    }

    const baseMetadata: Record<string, unknown> = isRecord(input.metadata)
      ? { ...input.metadata }
      : input.metadata === undefined
      ? {}
      : { payload: input.metadata };
    const approvalHistory: Array<Record<string, unknown>> = [];

    if (status === "confirmed") {
      approvalHistory.push({
        decision: "auto-approved",
        decidedAt: nowIso,
        actorId: input.actor.id,
        actorName: input.actor.name,
        actorEmail: input.actor.email,
        reason: autoApprovedByEmail
          ? "Requester is in auto-approval list"
          : "Booking duration within auto-approval threshold",
      });
    }

    baseMetadata.approval = {
      status: status === "pending" ? "pending" : "approved",
      requestedAt: nowIso,
      requestedBy: {
        actorId: input.actor.id,
        actorName: input.actor.name,
        actorEmail: input.actor.email,
      },
      approvers: workflow.approverEmails,
      autoApproved: status !== "pending",
      history: approvalHistory,
    };

    const record = await bookingDelegate().create({
      data: {
        resourceId: input.resourceId,
        title: input.title.trim(),
        description: input.description?.trim() ?? null,
        startTime: new Date(startIso),
        endTime: new Date(endIso),
        status,
        createdBy: input.actor.id,
        createdByName: input.actor.name ?? null,
        createdByEmail: input.actor.email ?? null,
        participants: participants ?? null,
        metadata: Object.keys(baseMetadata).length > 0 ? baseMetadata : null,
      },
    });

    return toBooking(record);
  }

  const record = await bookingDelegate().create({
    data: {
      resourceId: input.resourceId,
      title: input.title.trim(),
      description: input.description?.trim() ?? null,
      startTime: new Date(startIso),
      endTime: new Date(endIso),
      status,
      createdBy: input.actor.id,
      createdByName: input.actor.name ?? null,
      createdByEmail: input.actor.email ?? null,
      participants: participants ?? null,
      metadata: isRecord(input.metadata) ? input.metadata : null,
    },
  });

  return toBooking(record);
};

export const listFacilityBookings = async (filters: FacilityBookingListFilters = {}): Promise<FacilityBooking[]> => {
  const { resourceId, status, start, end, limit } = filters;

  const startIso = ensureIsoString(start);
  const endIso = ensureIsoString(end);

  const where: Record<string, unknown> = {};
  if (resourceId) {
    where.resourceId = resourceId;
  }
  if (status) {
    if (Array.isArray(status)) {
      where.status = { in: status };
    } else {
      where.status = status;
    }
  }
  if (startIso) {
    where.endTime = { gt: new Date(startIso) };
  }
  if (endIso) {
    where.startTime = { lt: new Date(endIso) };
  }

  const records = await bookingDelegate().findMany({
    where,
    orderBy: [{ startTime: "asc" }],
    take: typeof limit === "number" && Number.isFinite(limit) ? limit : undefined,
  });

  return records.map(toBooking);
};

export const cancelFacilityBooking = async (input: FacilityBookingCancellationRequest): Promise<FacilityBooking> => {
  const existing = await bookingDelegate().findUnique({ where: { id: input.bookingId } });
  if (!existing) {
    throw new Error("Booking not found");
  }

  if (existing.status === "cancelled") {
    return toBooking(existing);
  }

  const metadata = {
    ...(existing.metadata as Record<string, unknown> | null | undefined ?? {}),
    cancellation: {
      reason: input.reason,
      actorId: input.actor.id,
      actorName: input.actor.name,
      actorEmail: input.actor.email,
      cancelledAt: new Date().toISOString(),
    },
  };

  const updated = await bookingDelegate().update({
    where: { id: input.bookingId },
    data: {
      status: "cancelled",
      metadata,
    },
  });

  return toBooking(updated);
};

export const reviewFacilityBooking = async (input: FacilityBookingReviewRequest): Promise<FacilityBooking> => {
  const existing = await bookingDelegate().findUnique({ where: { id: input.bookingId } });
  if (!existing) {
    throw new Error("Booking not found");
  }

  if (existing.status !== "pending") {
    throw new Error("Only pending bookings can be reviewed");
  }

  const resource = await resourceDelegate().findUnique({ where: { id: existing.resourceId } });
  if (!resource) {
    throw new Error("Facility resource not found");
  }

  const workflow = readApprovalWorkflow(resource.metadata);
  if (workflow?.approverEmails.length) {
    const actorEmail = normaliseEmail(input.actor.email);
    if (!actorEmail || !workflow.approverEmails.includes(actorEmail)) {
      throw new Error("You are not authorised to review this booking");
    }
  }

  const metadata: Record<string, unknown> = isRecord(existing.metadata)
    ? { ...(existing.metadata as Record<string, unknown>) }
    : existing.metadata === undefined || existing.metadata === null
    ? {}
    : { payload: existing.metadata };

  const approvalMeta = isRecord(metadata.approval)
    ? { ...(metadata.approval as Record<string, unknown>) }
    : {};

  const history = Array.isArray(approvalMeta.history)
    ? [...(approvalMeta.history as Array<Record<string, unknown>>)]
    : [];

  const decidedAt = new Date().toISOString();
  const decisionEntry = {
    decision: input.decision,
    decidedAt,
    actorId: input.actor.id,
    actorName: input.actor.name,
    actorEmail: input.actor.email,
    note: input.note,
  };

  history.push(decisionEntry);

  approvalMeta.status = input.decision === "approve" ? "approved" : "rejected";
  approvalMeta.decidedAt = decidedAt;
  approvalMeta.decidedBy = {
    actorId: input.actor.id,
    actorName: input.actor.name,
    actorEmail: input.actor.email,
  };
  if (input.note) {
    approvalMeta.note = input.note;
  }
  approvalMeta.history = history;

  metadata.approval = approvalMeta;

  if (input.decision === "reject") {
    metadata.cancellation = {
      reason: input.note ?? "Rejected by approver",
      actorId: input.actor.id,
      actorName: input.actor.name,
      actorEmail: input.actor.email,
      cancelledAt: decidedAt,
    };
  }

  const nextStatus: FacilityBookingStatus = input.decision === "approve" ? "confirmed" : "cancelled";

  const updated = await bookingDelegate().update({
    where: { id: input.bookingId },
    data: {
      status: nextStatus,
      metadata,
    },
  });

  return toBooking(updated);
};

export const getFacilityUtilisationAnalytics = async (
  filters: FacilityUtilisationFilters = {},
): Promise<FacilityAnalyticsOverview> => {
  const nowIso = new Date().toISOString();
  const endIso = ensureIsoString(filters.end) ?? nowIso;
  const end = new Date(endIso);

  const defaultStart = new Date(end.getTime() - 29 * 24 * 60 * 60 * 1000);
  const startIso = ensureIsoString(filters.start) ?? defaultStart.toISOString();
  const start = new Date(startIso);

  if (start >= end) {
    start.setTime(end.getTime() - 24 * 60 * 60 * 1000);
  }

  const resources = await listFacilityResources();
  if (resources.length === 0) {
    return {
      range: { start: start.toISOString(), end: end.toISOString() },
      summaries: [],
      peakHours: [],
      busiestResources: [],
      idleResources: [],
    };
  }

  const rangeStart = new Date(start);
  const rangeEnd = new Date(end);
  const rangeDayCounts = countDaysByName(rangeStart, rangeEnd);
  const totalRangeDays = Math.max(
    1,
    Math.round((rangeEnd.getTime() - rangeStart.getTime()) / 86_400_000) + 1,
  );

  const resourceLookup = new Map<string, FacilityResource>();
  const availabilityLookup = new Map<string, Map<DayName, number>>();
  const summariesMap = new Map<string, FacilityUtilisationSummary>();
  const hourBucketsByResource = new Map<string, Map<string, number>>();
  const globalHourBuckets = new Map<string, number>();

  resources.forEach((resource) => {
    resourceLookup.set(resource.id, resource);
    availabilityLookup.set(resource.id, buildAvailabilityHoursMap(resource));
    summariesMap.set(resource.id, {
      resourceId: resource.id,
      resourceName: resource.name,
      resourceType: resource.type,
      totalBookings: 0,
      totalBookedHours: 0,
      totalAvailableHours: 0,
      averageBookingHours: 0,
      idleHours: 0,
      utilisationRate: 0,
    });
  });

  const bookingRecords = await bookingDelegate().findMany({
    where: {
      status: { in: ["confirmed", "completed"] },
      startTime: { lt: rangeEnd },
      endTime: { gt: rangeStart },
    },
  });

  const bookings: FacilityBooking[] = bookingRecords.map((record: Parameters<typeof toBooking>[0]) => toBooking(record));

  bookings.forEach((booking) => {
    const resource = resourceLookup.get(booking.resourceId);
    if (!resource) {
      return;
    }

    const clipped = clipInterval(new Date(booking.startTime), new Date(booking.endTime), rangeStart, rangeEnd);
    if (!clipped) {
      return;
    }

    const durationHours = hoursBetween(clipped.start.toISOString(), clipped.end.toISOString());
    if (durationHours <= 0) {
      return;
    }

    const summary = summariesMap.get(resource.id);
    if (!summary) {
      return;
    }

    summary.totalBookings += 1;
    summary.totalBookedHours += durationHours;

    let resourceBucket = hourBucketsByResource.get(resource.id);
    if (!resourceBucket) {
      resourceBucket = new Map<string, number>();
      hourBucketsByResource.set(resource.id, resourceBucket);
    }

    incrementHourBuckets(clipped.start, clipped.end, resourceBucket, globalHourBuckets);
  });

  const summaries: FacilityUtilisationSummary[] = [];

  summariesMap.forEach((summary, resourceId) => {
    const availabilityMap = availabilityLookup.get(resourceId) ?? new Map<DayName, number>();

    let totalAvailableHours = 0;
    availabilityMap.forEach((hours, day) => {
      totalAvailableHours += hours * (rangeDayCounts[day] ?? 0);
    });

    if (totalAvailableHours === 0) {
      totalAvailableHours = DEFAULT_DAILY_AVAILABLE_HOURS * totalRangeDays;
    }

    summary.totalAvailableHours = totalAvailableHours;
    summary.idleHours = Math.max(totalAvailableHours - summary.totalBookedHours, 0);
    summary.utilisationRate = totalAvailableHours > 0 ? summary.totalBookedHours / totalAvailableHours : 0;
    summary.averageBookingHours = summary.totalBookings > 0 ? summary.totalBookedHours / summary.totalBookings : 0;

    const resourceBuckets = hourBucketsByResource.get(resourceId);
    if (resourceBuckets && resourceBuckets.size > 0) {
      let peak: { hour: string; bookings: number } | null = null;
      resourceBuckets.forEach((count, hour) => {
        if (!peak || count > peak.bookings) {
          peak = { hour, bookings: count };
        }
      });
      if (peak) {
        const { hour, bookings } = peak;
        summary.peakUsageHour = { hour: `${hour}:00`, bookings };
      }
    }

    summaries.push(summary);
  });

  summaries.sort((a, b) => a.resourceName.localeCompare(b.resourceName));

  const busiestResources = [...summaries]
    .filter((item) => item.utilisationRate > 0)
    .sort((a, b) => b.utilisationRate - a.utilisationRate)
    .slice(0, 3);

  const idleResources = summaries
    .filter((item) => item.utilisationRate < 0.2)
    .sort((a, b) => a.utilisationRate - b.utilisationRate)
    .slice(0, 5);

  const peakHours = Array.from(globalHourBuckets.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([hour, bookings]) => ({ hour: `${hour}:00`, bookings }));

  return {
    range: { start: rangeStart.toISOString(), end: rangeEnd.toISOString() },
    summaries,
    peakHours,
    busiestResources,
    idleResources,
  };
};
