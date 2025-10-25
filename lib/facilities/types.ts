export type FacilityResourceType = "meeting_room" | "lab" | "equipment" | "other";

export type FacilityResourcePayload = {
  id?: string;
  type: FacilityResourceType;
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
  metadata?: Record<string, unknown> | null;
};

export type FacilityResource = {
  id: string;
  type: FacilityResourceType;
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
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type FacilityBookingStatus = "pending" | "confirmed" | "cancelled" | "completed";

export type FacilityBookingPayload = {
  id?: string;
  resourceId: string;
  title: string;
  description?: string;
  startTime: string;
  endTime: string;
  participants?: string[];
  metadata?: Record<string, unknown> | null;
};

export type FacilityBooking = {
  id: string;
  resourceId: string;
  title: string;
  description?: string;
  startTime: string;
  endTime: string;
  status: FacilityBookingStatus;
  createdBy: string;
  createdByName?: string;
  createdByEmail?: string;
  participants?: string[];
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type FacilityAvailabilityWindow = {
  startTime: string;
  endTime: string;
};

export type FacilityBookingRequest = {
  resourceId: string;
  title: string;
  description?: string;
  startTime: string;
  endTime: string;
  participants?: string[];
  metadata?: Record<string, unknown>;
  actor: {
    id: string;
    name?: string;
    email?: string;
  };
};

export type FacilityBookingCancellationRequest = {
  bookingId: string;
  reason?: string;
  actor: {
    id: string;
    name?: string;
    email?: string;
  };
};

export type FacilityBookingListFilters = {
  resourceId?: string;
  status?: FacilityBookingStatus | FacilityBookingStatus[];
  start?: string;
  end?: string;
  limit?: number;
};

