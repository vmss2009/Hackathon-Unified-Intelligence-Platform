"use client";

import { SessionProvider } from "next-auth/react";
import AuthGuard from "@/components/AuthGuard";

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SessionProvider>
      <AuthGuard>
        <div className="flex">
          <main className="flex-1 w-full">{children}</main>
        </div>
      </AuthGuard>
    </SessionProvider>
  );
}
