"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/protected", label: "Profile" },
  { href: "/protected/onboarding", label: "Onboarding" },
];

export default function Drawer() {
  const pathname = usePathname();

  return (
    <aside className="hidden min-h-screen w-64 flex-col justify-between border-r border-slate-900/40 bg-slate-950/80 px-6 py-8 shadow-inner shadow-blue-950/20 lg:flex">
      <div className="space-y-8">
        <div>
          <span className="text-xs font-semibold uppercase tracking-[0.4em] text-blue-400/70">
            Unified intelligence
          </span>
          <p className="mt-2 text-lg font-semibold text-slate-100">Control Center</p>
        </div>
        <nav className="space-y-2">
          {links.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex items-center justify-between rounded-lg px-4 py-3 text-sm font-medium transition ${
                  active
                    ? "bg-blue-500/10 text-blue-200"
                    : "text-slate-300 hover:bg-slate-900/70"
                }`}
              >
                <span>{link.label}</span>
                {active && <span className="text-[10px] uppercase tracking-wide">Active</span>}
              </Link>
            );
          })}
        </nav>
      </div>
      <p className="text-xs text-slate-500">
        Need help? Reach out to the platform team for onboarding support.
      </p>
    </aside>
  );
}
