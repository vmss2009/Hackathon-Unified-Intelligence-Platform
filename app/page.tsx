import Link from "next/link";

export default function Home() {
	return (
		<main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
			<header className="flex items-center justify-between px-8 py-6">
				<div className="flex flex-col">
					<span className="text-sm font-semibold uppercase tracking-wide text-blue-600">
						Unified Intelligence Platform
					</span>
				</div>
				<Link
					href="/sign-in"
					className="rounded-full border border-blue-500 px-5 py-2 text-sm font-medium text-blue-600 transition hover:bg-blue-50 hover:text-blue-700"
				>
					Log in
				</Link>
			</header>

			<section className="mx-auto flex max-w-4xl flex-col gap-6 px-8 py-16">
				<h1 className="text-4xl font-bold text-blue-900">
					Where data, automation, and intelligence converge
				</h1>
				<p className="text-lg text-blue-900/80">
					The Unified Intelligence Platform empowers teams to connect disparate
					systems, orchestrate AI-driven workflows, and unlock real-time insights
					with confidence. Collaborate securely, automate decisions, and scale
					your solutions faster than ever before.
				</p>
				<ul className="grid gap-4 sm:grid-cols-2">
					<li className="rounded-lg bg-white p-6 shadow-sm">
						<h2 className="text-lg font-semibold text-blue-800">
							Unified Data Access
						</h2>
						<p className="mt-2 text-sm text-slate-700">
							Integrate trusted sources and govern data flows across your
							environment with ease.
						</p>
					</li>
					<li className="rounded-lg bg-white p-6 shadow-sm">
						<h2 className="text-lg font-semibold text-blue-800">
							Intelligent Automation
						</h2>
						<p className="mt-2 text-sm text-slate-700">
							Deploy automation infused with AI to power insights and drive
							consistent outcomes.
						</p>
					</li>
					<li className="rounded-lg bg-white p-6 shadow-sm">
						<h2 className="text-lg font-semibold text-blue-800">
							Collaborative Workspaces
						</h2>
						<p className="mt-2 text-sm text-slate-700">
							Bring cross-functional teams together with shared dashboards and
							a reusable library of assets.
						</p>
					</li>
					<li className="rounded-lg bg-white p-6 shadow-sm">
						<h2 className="text-lg font-semibold text-blue-800">
							Secure by Design
						</h2>
						<p className="mt-2 text-sm text-slate-700">
							Enterprise-grade access controls and auditing keep your
							intelligence assets protected.
						</p>
					</li>
				</ul>
			</section>
		</main>
	);
}
