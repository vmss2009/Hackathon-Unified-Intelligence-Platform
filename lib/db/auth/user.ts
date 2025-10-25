import { prisma } from "../prisma";

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

export type UserProfile = {
    email: string;
    firstName: string | null;
    lastName: string | null;
};

export const getUserProfile = async (id: string): Promise<UserProfile | null> => {
    const user = await prisma.user.findUnique({
        where: { id },
        select: {
            email: true,
            first_name: true,
            last_name: true,
        },
    });

    if (!user) {
        return null;
    }

    return {
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
    };
};

type UpdateUserProfileInput = {
    firstName?: string | null;
    lastName?: string | null;
};

export const updateUserProfile = async (
    id: string,
    data: UpdateUserProfileInput,
): Promise<UserProfile> => {
    const updated = await prisma.user.update({
        where: { id },
        data: {
            first_name: data.firstName === undefined ? undefined : data.firstName,
            last_name: data.lastName === undefined ? undefined : data.lastName,
        },
        select: {
            email: true,
            first_name: true,
            last_name: true,
        },
    });

    return {
        email: updated.email,
        firstName: updated.first_name,
        lastName: updated.last_name,
    };
};