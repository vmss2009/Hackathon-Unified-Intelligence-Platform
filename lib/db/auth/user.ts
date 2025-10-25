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
    name: string | null;
};

export const getUserProfile = async (id: string): Promise<UserProfile | null> => {
    const user = await prisma.user.findUnique({
        where: { id },
        select: {
            email: true,
            name: true,
        },
    });

    if (!user) {
        return null;
    }

    return {
        email: user.email,
        name: user.name,
    };
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
        select: {
            email: true,
            name: true,
        },
    });

    return {
        email: updated.email,
        name: updated.name,
    };
};