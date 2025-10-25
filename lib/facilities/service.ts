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

  const record = await bookingDelegate().create({
    data: {
      resourceId: input.resourceId,
      title: input.title.trim(),
      description: input.description?.trim() ?? null,
      startTime: new Date(startIso),
      endTime: new Date(endIso),
      status: "confirmed",
      createdBy: input.actor.id,
      createdByName: input.actor.name ?? null,
      createdByEmail: input.actor.email ?? null,
      participants: participants ?? null,
      metadata: input.metadata ?? null,
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
