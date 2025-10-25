"use client";

import { useEffect, useState } from "react";
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

	if (!profile) {
		return null;
	}

	return (
		<section className="flex flex-col gap-6 p-8">
			<header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
				<div>
					<h1 className="text-3xl font-semibold">User Profile</h1>
					<p className="text-sm text-gray-500">
						Basic account details available to signed-in users.
					</p>
				</div>
				<button
					onClick={() => signOut({ callbackUrl: "/sign-in" })}
					className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-100"
				>
					Log out
				</button>
			</header>

			<dl className="grid gap-4 sm:grid-cols-2">
				<div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
					<dt className="text-xs uppercase tracking-wide text-gray-500">
						Email
					</dt>
					<dd className="mt-1 text-base font-medium text-gray-900">
						{profile.email}
					</dd>
				</div>

				<div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
					<dt className="text-xs uppercase tracking-wide text-gray-500">
						First Name
					</dt>
					<dd className="mt-1 text-base font-medium text-gray-900">
						{profile.firstName ?? "Not provided"}
					</dd>
				</div>

				<div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
					<dt className="text-xs uppercase tracking-wide text-gray-500">
						Last Name
					</dt>
					<dd className="mt-1 text-base font-medium text-gray-900">
						{profile.lastName ?? "Not provided"}
					</dd>
				</div>
			</dl>
		</section>
	);
}
