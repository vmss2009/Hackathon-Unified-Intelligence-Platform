import { prisma } from "@/lib/db/prisma";
import {
  getUserProfileOrThrow,
  hasPermission,
  type AppPermission,
  type UserProfile,
} from "@/lib/db/auth/user";

const PERM_ONBOARDING_MANAGE: AppPermission = "onboarding:manage";
const PERM_ONBOARDING_REVIEW: AppPermission = "onboarding:review";
const PERM_ONBOARDING_VIEW_SELF: AppPermission = "onboarding:view_self";
const PERM_FINANCIALS_VIEW_SELF: AppPermission = "grants:view_self";
const PERM_FACILITIES_MANAGE: AppPermission = "facilities:manage";
const PERM_FACILITIES_BOOK: AppPermission = "facilities:book";
const PERM_FORMS_CONFIGURE: AppPermission = "forms:configure";
const PERM_ADMIN_MANAGE: AppPermission = "admin:manage";

export const loadUserProfile = async (userId: string): Promise<UserProfile> => {
  return getUserProfileOrThrow(userId);
};

export const canReviewOnboarding = (profile: UserProfile): boolean => {
  return (
    hasPermission(profile, PERM_ONBOARDING_MANAGE) ||
    hasPermission(profile, PERM_ONBOARDING_REVIEW)
  );
};

export const canConfigureOnboarding = (profile: UserProfile): boolean => {
  return hasPermission(profile, PERM_ONBOARDING_MANAGE) || hasPermission(profile, PERM_FORMS_CONFIGURE);
};

export const canViewOwnOnboarding = (profile: UserProfile): boolean => {
  return hasPermission(profile, PERM_ONBOARDING_VIEW_SELF) || canReviewOnboarding(profile);
};

export const canManageFacilities = (profile: UserProfile): boolean => {
  return hasPermission(profile, PERM_FACILITIES_MANAGE);
};

export const canBookFacilities = (profile: UserProfile): boolean => {
  return canManageFacilities(profile) || hasPermission(profile, PERM_FACILITIES_BOOK);
};

export const canViewFinancialsPortfolio = (profile: UserProfile): boolean => {
  return hasPermission(profile, PERM_ONBOARDING_MANAGE) || hasPermission(profile, PERM_ONBOARDING_REVIEW) || hasPermission(profile, "grants:review") || hasPermission(profile, "grants:approve");
};

export const canViewFinancialsSelf = (profile: UserProfile): boolean => {
  return hasPermission(profile, PERM_FINANCIALS_VIEW_SELF) || canViewFinancialsPortfolio(profile);
};

export const getAccessibleStartupIds = async (
  profile: UserProfile,
): Promise<string[]> => {
  if (canReviewOnboarding(profile)) {
    return [];
  }

  const owned = new Set(profile.startupIds);

  if (!owned.size) {
    const submissions = await prisma.onboardingSubmissionRecord.findMany({
      where: { userId: profile.id },
      select: { id: true },
    });
    submissions.forEach((submission) => owned.add(submission.id));
  }

  return Array.from(owned);
};

export const canAccessStartup = async (profile: UserProfile, startupId: string): Promise<boolean> => {
  if (!startupId) {
    return false;
  }

  if (canReviewOnboarding(profile)) {
    return true;
  }

  if (profile.startupIds.includes(startupId)) {
    return true;
  }

  const submission = await prisma.onboardingSubmissionRecord.findUnique({
    where: { id: startupId },
    select: { userId: true },
  });

  return submission?.userId === profile.id;
};

export const canManageUsers = (profile: UserProfile): boolean => {
  if (profile.role === "admin") {
    return true;
  }

  return (
    hasPermission(profile, PERM_ADMIN_MANAGE) ||
    hasPermission(profile, PERM_ONBOARDING_MANAGE)
  );
};
