import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";

export type AppPermission = string;

export type UserProfile = {
    id: string;
    email: string;
    name: string | null;
    phone?: string | null;
    avatarUrl?: string | null;
    timezone?: string | null;
    locale?: string | null;
    role?: string | null;
    isActive: boolean;
    createdAt: string;
    permissions: AppPermission[];
    startupIds: string[];
};

type RawUser = {
    id: string;
    email: string;
    name: string | null;
    phone: string | null;
    avatarUrl: string | null;
    timezone: string | null;
    locale: string | null;
    metadata: unknown;
    isActive: boolean;
    createdAt: Date;
};

const baseUserSelect = {
    id: true,
    email: true,
    name: true,
    phone: true,
    avatarUrl: true,
    timezone: true,
    locale: true,
    metadata: true,
    isActive: true,
    createdAt: true,
} as const;

const normalizeStringArray = (value: unknown): string[] => {
    if (Array.isArray(value)) {
        return Array.from(
            new Set(
                value
                    .filter((entry): entry is string => typeof entry === "string")
                    .map((entry) => entry.trim())
                    .filter((entry) => entry.length > 0),
            ),
        );
    }

    if (typeof value === "string") {
        const trimmed = value.trim();
        return trimmed.length ? [trimmed] : [];
    }

    return [];
};

const mapUserToProfile = (user: RawUser): UserProfile => {
    const metadata = (user.metadata as Record<string, unknown> | null) ?? {};
    const permissions = normalizeStringArray(metadata.permissions);
    const startupIds = normalizeStringArray(metadata.startupIds);
    const role = typeof metadata.role === "string" ? metadata.role.trim() : undefined;

    return {
        id: user.id,
        email: user.email,
        name: user.name,
        phone: user.phone,
        avatarUrl: user.avatarUrl,
        timezone: user.timezone,
        locale: user.locale,
        role: role ?? null,
        isActive: user.isActive,
        createdAt: user.createdAt.toISOString(),
        permissions,
        startupIds,
    };
};

export const getUserByEmail = async (email: string) => {
    return prisma.user.findFirst({
        where: { email },
    });
};

export const getUserById = async (id: string) => {
    return prisma.user.findUnique({
        where: { id },
    });
};

export const getUserProfile = async (id: string): Promise<UserProfile | null> => {
    const user = await prisma.user.findUnique({
        where: { id },
        select: baseUserSelect,
    });

    if (!user) {
        return null;
    }

    return mapUserToProfile(user as RawUser);
};

export const getUserProfileOrThrow = async (id: string): Promise<UserProfile> => {
    const profile = await getUserProfile(id);
    if (!profile) {
        throw new Error("User not found");
    }
    return profile;
};

export const hasPermission = (profile: UserProfile, permission: AppPermission): boolean => {
    return profile.permissions.includes(permission);
};

export const listUserProfiles = async (): Promise<UserProfile[]> => {
    const users = await prisma.user.findMany({
        select: baseUserSelect,
        orderBy: { createdAt: "desc" },
    });

    return users.map((user) => mapUserToProfile(user as RawUser));
};

export type UpsertUserInput = {
    email: string;
    name?: string | null;
    phone?: string | null;
    role?: string | null;
    permissions?: AppPermission[];
    startupIds?: string[];
    isActive?: boolean;
};

export const upsertUserProfile = async (input: UpsertUserInput): Promise<UserProfile> => {
    const metadata: Prisma.JsonObject = {
        ...(input.role ? { role: input.role } : {}),
        permissions: input.permissions ?? [],
        startupIds: input.startupIds ?? [],
    };

    const user = await prisma.user.upsert({
        where: { email: input.email },
        update: {
            name: input.name === undefined ? undefined : input.name,
            phone: input.phone === undefined ? undefined : input.phone,
            metadata,
            isActive: input.isActive === undefined ? undefined : input.isActive,
        },
        create: {
            email: input.email,
            name: input.name ?? null,
            phone: input.phone ?? null,
            metadata,
            isActive: input.isActive ?? true,
        },
        select: baseUserSelect,
    });

    return mapUserToProfile(user as RawUser);
};

type UpdateUserProfileInput = {
    name?: string | null;
};

export const updateUserProfile = async (
    id: string,
    data: UpdateUserProfileInput,
): Promise<UserProfile> => {
    const updated = await prisma.user.update({
        where: { id },
        data: {
            name: data.name === undefined ? undefined : data.name,
        },
        select: baseUserSelect,
    });

    return mapUserToProfile(updated as RawUser);
};

export const setUserActiveState = async (id: string, isActive: boolean): Promise<UserProfile> => {
    const updated = await prisma.user.update({
        where: { id },
        data: { isActive },
        select: baseUserSelect,
    });

    return mapUserToProfile(updated as RawUser);
};