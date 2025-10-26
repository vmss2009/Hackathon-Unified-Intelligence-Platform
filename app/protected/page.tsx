"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";

type UserProfile = {
	id: string;
	email: string;
	name: string | null;
	role?: string | null;
	isActive?: boolean;
	permissions?: string[];
	startupIds?: string[];
};

export default function ProtectedPage() {
	const [profile, setProfile] = useState<UserProfile | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);

	const capabilities = useMemo(() => {
		const permissions = new Set(profile?.permissions ?? []);
		const canReviewOnboarding = permissions.has("onboarding:manage") || permissions.has("onboarding:review");
		const canConfigureOnboarding = permissions.has("onboarding:manage") || permissions.has("forms:configure");
		const canViewOwnOnboarding = permissions.has("onboarding:view_self") || canReviewOnboarding;
		const canViewPortfolioFinancials =
			permissions.has("grants:review") || permissions.has("grants:approve") || canReviewOnboarding;
		const canViewOwnFinancials = permissions.has("grants:view_self") || canViewPortfolioFinancials;
		const canManageFacilities = permissions.has("facilities:manage");
		const canBookFacilities = canManageFacilities || permissions.has("facilities:book");
		const canManageUsers = profile?.role === "admin" || permissions.has("admin:manage") || permissions.has("onboarding:manage");
		return {
			canReviewOnboarding,
			canConfigureOnboarding,
			canViewOwnOnboarding,
			canViewPortfolioFinancials,
			canViewOwnFinancials,
			canManageFacilities,
			canBookFacilities,
			canManageUsers,
		};
	}, [profile]);

	const navItems = useMemo(() => {
		if (!profile) {
			return [] as Array<{ title: string; description: string; href: string; label: string }>;
		}

		const items: Array<{ title: string; description: string; href: string; label: string }> = [];

		if (capabilities.canManageUsers) {
			items.push({
				title: "User Administration",
				description: "Review all accounts and provision access for admins or incubatees.",
				href: "/protected/admin/users",
				label: "Manage users",
			});
		}

		if (capabilities.canViewOwnOnboarding) {
			items.push(
				capabilities.canReviewOnboarding
					? {
						title: "Submission Review",
						description:
							"Inspect founder submissions with filters, scoring, and full response context.",
						href: "/protected/onboarding/submissions",
						label: "Review submissions",
					}
					: {
						title: "My Application",
						description: "Track the status and scoring feedback for your onboarding submission.",
						href: "/protected/onboarding/submissions",
						label: "View application",
					},
			);
		}

		if (capabilities.canConfigureOnboarding) {
			items.push({
				title: "Onboarding Workspace",
				description: "Design, publish, and track your startup onboarding flows in real time.",
				href: "/protected/onboarding",
				label: "Manage onboarding",
			});
		}

		if (capabilities.canViewOwnFinancials) {
			items.push(
				capabilities.canViewPortfolioFinancials
					? {
						title: "Grant Financial Dashboard",
						description: "Track incubator-wide grant sanctions, disbursements, and utilisation health metrics.",
						href: "/protected/grants/financials",
						label: "View financials",
					}
					: {
						title: "My Grant Finances",
						description: "Review sanctioned amounts, disbursements, and utilisation for your startup.",
						href: "/protected/grants/financials",
						label: "View grant status",
					},
			);
		}

		if (capabilities.canBookFacilities) {
			items.push({
				title: "Facilities & Resources",
				description: capabilities.canManageFacilities
					? "Reserve meeting rooms, R&D labs, and specialised equipment with live availability."
					: "Check availability and book incubator facilities for your team sessions.",
				href: "/protected/facilities",
				label: capabilities.canManageFacilities ? "Book facilities" : "Book a slot",
			});
		}

		return items;
	}, [profile, capabilities]);

	useEffect(() => {
		let active = true;
		setLoading(true);

		fetch("/api/protected/auth")
			.then(async (res) => {
				if (!res.ok) {
					throw new Error("Failed to load profile");
				}

				return (await res.json()) as { ok: boolean; profile: UserProfile };
			})
			.then((payload) => {
				if (!active || !payload) {
					return;
				}

				if (!payload.ok) {
					setError("Unable to load profile data.");
					return;
				}

				setProfile(payload.profile);
				setError(null);
			})
			.catch(() => {
				if (!active) {
					return;
				}

				setError("Unable to load profile data.");
			})
			.finally(() => {
				if (active) {
					setLoading(false);
				}
			});

		return () => {
			active = false;
		};
	}, []);

	if (loading) {
		return (
			<section className="flex h-full flex-col items-center justify-center gap-4 p-8">
				<p className="text-base text-gray-600">Loading your profile...</p>
			</section>
		);
	}

	if (error) {
		return (
			<section className="flex h-full flex-col items-center justify-center gap-4 p-8">
				<p className="text-base text-red-600">{error}</p>
				<button
					onClick={() => signOut({ callbackUrl: "/sign-in" })}
					className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-100"
				>
					Log out
				</button>
			</section>
		);
	}

	return (
		<section className="flex flex-col gap-6 p-8">
			<header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
				<div>
					<h1 className="text-3xl font-semibold text-gray-900">
						Welcome back{profile?.name ? `, ${profile.name}` : ""}!
					</h1>
					<p className="text-sm text-gray-500">
						Choose where you’d like to go next across the Unified Intelligence Platform.
					</p>
				</div>
				<button
					onClick={() => signOut({ callbackUrl: "/sign-in" })}
					className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-100"
				>
					Log out
				</button>
			</header>

			{navItems.length > 0 ? (
				<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
					{navItems.map((item) => (
						<Link
							key={item.href}
							href={item.href}
							className="group flex flex-col justify-between gap-3 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:border-blue-500/60 hover:shadow-lg"
						>
							<div className="space-y-2">
								<h2 className="text-lg font-semibold text-gray-900">
									{item.title}
								</h2>
								<p className="text-sm text-gray-500">{item.description}</p>
							</div>
							<span className="text-xs font-semibold uppercase tracking-wide text-blue-600 transition group-hover:text-blue-500">
								{item.label}
							</span>
						</Link>
					))}
				</div>
			) : (
				<div className="rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-500">
					No destinations available. Please contact the programme team if you believe this is an error.
				</div>
			)}
		</section>
	);
}
