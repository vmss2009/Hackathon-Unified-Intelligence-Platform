import Link from "next/link";

export default function Home() {
	return (
		<main className="min-h-screen text-[var(--foreground)]">
			<header className="flex items-center justify-between px-8 py-6">
				<div className="flex flex-col">
					<span className="text-sm font-semibold uppercase tracking-[0.4em] text-blue-400/80">
						Unified Intelligence Platform
					</span>
					<span className="text-xs text-[var(--foreground-muted)]">
						Innovation hub for connected insights
					</span>
				</div>
				<Link
					href="/sign-in"
					className="rounded-full border border-blue-500/70 px-5 py-2 text-sm font-medium text-blue-100 transition hover:bg-blue-500/10"
				>
					Log in
				</Link>
			</header>

			<section className="mx-auto flex max-w-4xl flex-col gap-6 px-8 py-16">
				<h1 className="text-4xl font-bold text-slate-100">
					Where data, automation, and intelligence converge
				</h1>
				<p className="text-lg text-[var(--foreground-muted)]">
					The Unified Intelligence Platform empowers teams to connect disparate
					systems, orchestrate AI-driven workflows, and unlock real-time insights
					with confidence. Collaborate securely, automate decisions, and scale
					your solutions faster than ever before.
				</p>
				<ul className="grid gap-4 sm:grid-cols-2">
					<li className="rounded-xl border border-slate-800/70 bg-[var(--background-elevated)] p-6 shadow-lg shadow-blue-950/20 backdrop-blur">
						<h2 className="text-lg font-semibold text-blue-200">Unified Data Access</h2>
						<p className="mt-2 text-sm text-[var(--foreground-muted)]">
							Integrate trusted sources and govern data flows across your environment with ease.
						</p>
					</li>
					<li className="rounded-xl border border-slate-800/70 bg-[var(--background-elevated)] p-6 shadow-lg shadow-blue-950/20 backdrop-blur">
						<h2 className="text-lg font-semibold text-blue-200">Intelligent Automation</h2>
						<p className="mt-2 text-sm text-[var(--foreground-muted)]">
							Deploy automation infused with AI to power insights and drive consistent outcomes.
						</p>
					</li>
					<li className="rounded-xl border border-slate-800/70 bg-[var(--background-elevated)] p-6 shadow-lg shadow-blue-950/20 backdrop-blur">
						<h2 className="text-lg font-semibold text-blue-200">Collaborative Workspaces</h2>
						<p className="mt-2 text-sm text-[var(--foreground-muted)]">
							Bring cross-functional teams together with shared dashboards and a reusable library of assets.
						</p>
					</li>
					<li className="rounded-xl border border-slate-800/70 bg-[var(--background-elevated)] p-6 shadow-lg shadow-blue-950/20 backdrop-blur">
						<h2 className="text-lg font-semibold text-blue-200">Secure by Design</h2>
						<p className="mt-2 text-sm text-[var(--foreground-muted)]">
							Enterprise-grade access controls and auditing keep your intelligence assets protected.
						</p>
					</li>
				</ul>

				<div className="mt-10 flex flex-wrap items-center gap-4">
					<Link
						href="/sign-in"
						className="rounded-full border border-emerald-500/70 px-6 py-3 text-sm font-semibold uppercase tracking-wide text-emerald-100 transition hover:bg-emerald-500/10"
					>
						Start your application
					</Link>
					<span className="text-xs text-[var(--foreground-muted)]">
						No cost to apply • Secure document uploads • Tailored founder support
					</span>
				</div>
			</section>
		</main>
	);
}
