"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";

type UserProfile = {
	email: string;
	firstName: string | null;
	lastName: string | null;
};

export default function ProtectedPage() {
	const [profile, setProfile] = useState<UserProfile | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);

	const navItems = useMemo(
		() => [
			{
				title: "Onboarding Workspace",
				description:
					"Design, publish, and track your startup onboarding flows in real time.",
				href: "/protected/onboarding",
				label: "Manage onboarding",
			},
			{
				title: "Public Application",
				description:
					"Preview the applicant-facing experience exactly as founders will see it.",
				href: "/onboarding",
				label: "Open public form",
			},
			{
				title: "Unified Intelligence Platform",
				description:
					"Return to the main overview to explore product capabilities and updates.",
				href: "/",
				label: "Visit home",
			},
		],
		[],
	);

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
						Welcome back{profile?.firstName ? `, ${profile.firstName}` : ""}!
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

			<div className="grid gap-4 md:grid-cols-3">
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
		</section>
	);
}
