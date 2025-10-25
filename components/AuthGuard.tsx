"use client";

import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const [allowed, setAllowed] = useState<"unknown" | "yes" | "no">("unknown");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/validate", { cache: "no-store" });
        if (cancelled) return;
        if (res.ok) {
          setAllowed("yes");
        } else {
          setAllowed("no");
          await signOut({ callbackUrl: "/sign-in?error=not_allowed" });
        }
      } catch {
        // On network error, fail closed (sign out) to be safe
        if (!cancelled) {
          setAllowed("no");
          await signOut({ callbackUrl: "/sign-in?error=not_allowed" });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (allowed !== "yes") return null;
  return <>{children}</>;
}
